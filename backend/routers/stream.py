from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from services.gcs_service import GCSService
from services.gcs_cache import get_connection_pool, get_pool_status
from services.video_cache import get_video_cache
from config import get_settings
import logging
import time
from typing import Optional
import re

router = APIRouter(prefix="/api", tags=["Video Streaming"])
logger = logging.getLogger(__name__)
settings = get_settings()
gcs_pool = get_connection_pool()
gcs_service = GCSService()
video_cache = get_video_cache(cache_dir="/tmp/video_cache", max_size_mb=1000)

# ==================== Range 請求解析 ====================
def parse_range_header(range_header: str, file_size: int) -> tuple:
    """
    解析 HTTP Range 請求頭
    
    Returns:
        (start, end, content_length)
        
    Note:
        - HTTP Range: "bytes=0-1023" 表示請求 bytes 0 到 1023（包含）
        - GCS download_as_bytes(start, end): 實測發現 end 也是 inclusive（包含）
    """
    range_match = re.match(r'bytes=(\d+)-(\d*)', range_header)
    
    if not range_match:
        return 0, file_size - 1, file_size
    
    start = int(range_match.group(1))
    
    if range_match.group(2):
        end = int(range_match.group(2))  # HTTP Range 的 end 是 inclusive
    else:
        # 如果沒有指定 end，限制單次請求最多 20MB
        end = min(start + 20 * 1024 * 1024 - 1, file_size - 1)
    
    # 確保範圍有效
    start = max(0, min(start, file_size - 1))
    end = max(start, min(end, file_size - 1))
    
    # Content-Length 是實際要傳輸的 bytes 數量
    content_length = end - start + 1
    
    logger.info(f"   📊 Range: bytes={start}-{end}/{file_size} (請求 {content_length:,} bytes)")
    
    return start, end, content_length

# ==================== 影片串流 ====================
@router.get("/stream/{filename:path}")
async def stream_video(filename: str, request: Request):
    """
    串流影片（支援 Range 請求）
    
    支援：
    - HTTP Range requests (部分內容請求)
    - 快進/快退
    - 暫停/繼續播放
    """
    try:
        request_start = time.time()
        logger.info(f"📺 串流請求: {filename}")
        
        # ✅ 使用快取的 metadata
        metadata = gcs_pool.get_blob_metadata(settings.GCS_BUCKET_NAME, filename)

        if not metadata:
            raise HTTPException(status_code=404, detail="Video not found")
        
        file_size = metadata['size']
        content_type = metadata.get('content_type', 'video/mp4')

        # 檢查檔案是否存在
        if not gcs_service.file_exists(filename):
            logger.error(f"❌ 檔案不存在: {filename}")
            raise HTTPException(status_code=404, detail="Video not found")
        
        # 獲取檔案元數據
        metadata = gcs_service.get_file_metadata(filename)
        file_size = metadata["size"]
        content_type = metadata.get("content_type") or "video/mp4"
        
        logger.info(f"   檔案大小: {file_size:,} bytes ({file_size / 1024 / 1024:.2f} MB)")
        
        # 檢查是否為 Range 請求
        range_header = request.headers.get("range")
        
        if range_header:
            # 處理 Range 請求（部分內容）
            start, end, content_length = parse_range_header(range_header, file_size)
            # ✅ 先檢查快取
            cache_start = time.time()
            cached_data = video_cache.get(filename, start, end)
            cache_time = time.time() - cache_start
            
            if cached_data:
                logger.info(f"   🎯 Cache HIT ({cache_time * 1000:.1f}ms)")
                
                total_time = time.time() - request_start
                
                headers = {
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(len(cached_data)),
                    "Content-Type": content_type,
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
                    "X-Cache": "HIT",
                    "X-Response-Time": f"{total_time * 1000:.1f}ms"
                }
                
                return Response(
                    content=cached_data,
                    status_code=206,
                    headers=headers
                )
            
            # ✅ 快取未命中，從 GCS 下載
            logger.info(f"   ❌ Cache MISS, downloading from GCS...")
            
            # ✅ 使用連接池獲取 bucket
            bucket = gcs_pool.get_bucket(settings.GCS_BUCKET_NAME)
            blob = bucket.blob(filename)
            
            try:
                download_start = time.time()
                logger.info(f"   🔽 GCS 下載: start={start}, end={end}")
                
                chunk = blob.download_as_bytes(start=start, end=end)
                download_time = time.time() - download_start
                
                actual_length = len(chunk)
                speed = actual_length / download_time / 1024 / 1024 if download_time > 0 else 0
                
                logger.info(f"   ✓ 下載完成: {actual_length:,} bytes in {download_time:.2f}s ({speed:.2f} MB/s)")
                
                # ✅ 儲存到快取
                video_cache.set(filename, start, end, chunk)
                
                # ✅ 驗證長度（允許 ±1 的誤差，因為 GCS API 行為可能不一致）
                if abs(actual_length - content_length) > 1:
                    logger.error(f"   ❌ 長度不符: 預期 {content_length}, 實際 {actual_length}")
                    raise HTTPException(
                        status_code=500, 
                        detail=f"Content length mismatch: expected {content_length}, got {actual_length}"
                    )
                
                # ✅ 如果有輕微差異，調整 Content-Length
                if actual_length != content_length:
                    logger.warning(f"   ⚠️ 調整 Content-Length: {content_length} -> {actual_length}")
                    content_length = actual_length
                    # 同時調整 end
                    end = start + actual_length - 1
                
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"❌ 讀取範圍失敗: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Failed to read file range")
            
            # 返回 206 Partial Content
            total_time = time.time() - request_start

            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Type": content_type,
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length"
            }
            logger.info(f"   ⏱️ 總時間: {total_time:.2f}s")
            return Response(
                content=chunk,
                status_code=206,
                headers=headers
            )
        
        else:
            # 完整檔案請求
            logger.info(f"   完整檔案請求")
            
            bucket = gcs_service.bucket
            blob = bucket.blob(filename)
            
            # 對於小檔案（< 50MB），直接返回
            if file_size < 50 * 1024 * 1024:
                logger.info(f"   小檔案，直接返回")
                
                try:
                    content = blob.download_as_bytes()
                    
                    actual_length = len(content)
                    logger.info(f"   ✓ 讀取完成: {actual_length:,} bytes")
                    
                    if actual_length != file_size:
                        logger.warning(f"   ⚠️ 長度不符: 預期 {file_size}, 實際 {actual_length}")
                        # 使用實際長度
                        file_size = actual_length
                    
                    headers = {
                        "Content-Length": str(actual_length),
                        "Content-Type": content_type,
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=3600",
                        "Access-Control-Allow-Origin": "*"
                    }
                    
                    return Response(
                        content=content,
                        status_code=200,
                        headers=headers
                    )
                    
                except Exception as e:
                    logger.error(f"❌ 讀取檔案失敗: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail="Failed to read file")
            
            # 對於大檔案，使用串流
            logger.info(f"   大檔案，使用串流")
            
            def iterfile():
                chunk_size = 2 * 1024 * 1024  # 2MB chunks
                position = 0
                
                while position < file_size:
                    # 計算這次要讀取的範圍
                    chunk_start = position
                    chunk_end = min(position + chunk_size - 1, file_size - 1)  # inclusive
                    
                    try:
                        logger.debug(f"   📦 串流區塊: {chunk_start}-{chunk_end} ({chunk_end - chunk_start + 1} bytes)")
                        
                        chunk = blob.download_as_bytes(start=chunk_start, end=chunk_end)
                        
                        if len(chunk) == 0:
                            logger.warning(f"   ⚠️ 空區塊，停止串流")
                            break
                        
                        yield chunk
                        position = chunk_end + 1  # 移到下一個位置
                        
                    except Exception as e:
                        logger.error(f"❌ 串流區塊失敗: {e}")
                        break
            
            headers = {
                "Content-Length": str(file_size),
                "Content-Type": content_type,
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
            
            return StreamingResponse(
                iterfile(),
                status_code=200,
                headers=headers,
                media_type=content_type
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 串流錯誤: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== HEAD 請求支援 ====================
@router.head("/stream/{filename:path}")
async def head_video(filename: str):
    """HEAD 請求：獲取影片 metadata"""
    try:
        metadata = gcs_pool.get_blob_metadata(settings.GCS_BUCKET_NAME, filename)
        
        if not metadata:
            raise HTTPException(status_code=404, detail="Video not found")
        
        headers = {
            "Content-Type": metadata.get("content_type", "video/mp4"),
            "Content-Length": str(metadata["size"]),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*"
        }
        
        return Response(
            status_code=200,
            headers=headers
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ HEAD request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 獲取影片縮圖 ====================
@router.get("/thumbnail/{filename:path}")
async def get_thumbnail(filename: str):
    """
    獲取影片縮圖
    """
    try:
        thumbnail_path = f"thumbnails/{filename}.jpg"
        
        if not gcs_service.file_exists(thumbnail_path):
            raise HTTPException(status_code=404, detail="Thumbnail not found")
        
        bucket = gcs_service.bucket
        blob = bucket.blob(thumbnail_path)
        content = blob.download_as_bytes()
        
        return Response(
            content=content,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 縮圖錯誤: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cache/video/stats")
async def get_video_cache_stats():
    """獲取影片快取統計"""
    try:
        return video_cache.get_stats()
    except Exception as e:
        logger.error(f"❌ Failed to get video cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/video/detailed")
async def get_video_cache_detailed():
    """獲取詳細快取統計"""
    try:
        return video_cache.get_detailed_stats()
    except Exception as e:
        logger.error(f"❌ Failed to get detailed stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/video/clear")
async def clear_video_cache():
    """清除影片快取"""
    try:
        video_cache.clear()
        return {
            "message": "Video cache cleared successfully",
            "stats": video_cache.get_stats()
        }
    except Exception as e:
        logger.error(f"❌ Failed to clear video cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ✅ 更新完整健康檢查
@router.get("/health/full")
async def full_health_check():
    """完整健康檢查"""
    try:
        gcs_healthy = gcs_pool.health_check()
        gcs_status = get_pool_status()
        video_cache_stats = video_cache.get_stats()
        
        return {
            "status": "healthy" if gcs_healthy else "unhealthy",
            "gcs": {
                "healthy": gcs_healthy,
                "pool_status": gcs_status
            },
            "cache": {
                "metadata": gcs_pool.get_cache_info(),
                "video": video_cache_stats
            },
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }