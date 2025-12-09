from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from utils.storage import GCSManager, create_gcs_manager
from utils.gcs_auth import check_authentication, verify_bucket_access
from utils.thumbnail import ThumbnailGenerator, get_thumbnail_generator
import os
import logging
from dotenv import load_dotenv
from typing import Optional
from urllib.parse import unquote

# 載入環境變量
load_dotenv()

# 設置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 創建 FastAPI 應用
app = FastAPI(
    title="CloudStream Studio API",
    description="基於 GCP Storage 的影片文件管理和縮圖服務",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生產環境請改為具體的前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 配置
BUCKET_NAME = os.getenv('GCS_BUCKET_NAME')
PROJECT_ID = os.getenv('GCP_PROJECT_ID')

# 初始化 GCS Manager
gcs_manager: Optional[GCSManager] = None
thumbnail_generator: Optional[ThumbnailGenerator] = None

try:
    gcs_manager = create_gcs_manager(BUCKET_NAME, PROJECT_ID)
    logger.info("✅ GCS Manager 初始化成功")
    
    # 初始化影片縮圖生成器
    thumbnail_generator = get_thumbnail_generator(gcs_manager)
    logger.info("✅ Video Thumbnail Generator 初始化成功")
    
except Exception as e:
    logger.error(f"❌ 初始化失敗: {e}")
    logger.error("💡 請確認:")
    logger.error("   1. 已運行: gcloud auth application-default login")
    logger.error("   2. .env 文件配置正確")
    logger.error("   3. GCS Bucket 存在且有訪問權限")


@app.on_event("startup")
async def startup_event():
    """應用啟動時的檢查"""
    logger.info("🚀 CloudStream Studio API 啟動中...")
    logger.info(f"📦 Bucket: {BUCKET_NAME}")
    logger.info(f"🏗️  Project: {PROJECT_ID or '(auto-detect)'}")
    
    # 檢查認證
    auth_info = check_authentication()
    if auth_info["authenticated"]:
        logger.info(f"✅ 認證成功: {auth_info['auth_type']}")
        logger.info(f"   項目: {auth_info['project']}")
    else:
        logger.error(f"❌ 認證失敗: {auth_info['error']}")
        logger.error("💡 請運行: gcloud auth application-default login")
        return
    
    # 檢查 Bucket 訪問
    if BUCKET_NAME:
        bucket_info = verify_bucket_access(BUCKET_NAME, PROJECT_ID)
        if bucket_info["accessible"]:
            logger.info(f"✅ Bucket '{BUCKET_NAME}' 可訪問")
        else:
            logger.error(f"❌ Bucket '{BUCKET_NAME}' 訪問失敗: {bucket_info['error']}")


@app.get("/")
async def root():
    """根路徑 - 服務信息"""
    auth_info = check_authentication()
    
    return {
        "service": "CloudStream Studio API",
        "version": "1.0.0",
        "status": "ok",
        "authenticated": auth_info["authenticated"],
        "bucket": BUCKET_NAME,
        "project": auth_info.get("project"),
        "features": {
            "file_management": gcs_manager is not None,
            "thumbnail_generation": thumbnail_generator is not None
        }
    }


@app.get("/api/health")
async def health_check():
    """健康檢查"""
    if not gcs_manager:
        raise HTTPException(
            status_code=503,
            detail="GCS Manager not initialized. Please check authentication."
        )
    
    auth_info = check_authentication()
    bucket_info = verify_bucket_access(BUCKET_NAME, PROJECT_ID)
    
    return {
        "status": "healthy",
        "authentication": auth_info,
        "bucket": {
            "name": BUCKET_NAME,
            "accessible": bucket_info["accessible"],
            "exists": bucket_info.get("exists"),
            "error": bucket_info.get("error")
        },
        "services": {
            "gcs_manager": gcs_manager is not None,
            "thumbnail_generator": thumbnail_generator is not None
        }
    }


# ==================== 文件管理 API ====================

@app.get("/api/files")
async def list_files(
    prefix: Optional[str] = Query(None, description="文件前綴過濾"),
    max_results: Optional[int] = Query(None, description="最大結果數"),
    exclude_thumbnails: bool = Query(True, description="排除縮圖文件夾")
):
    """列出所有文件"""
    if not gcs_manager:
        raise HTTPException(status_code=503, detail="GCS Manager not available")
    
    try:
        files = gcs_manager.list_files(prefix=prefix, max_results=max_results)
        
        # 排除縮圖文件夾
        if exclude_thumbnails:
            files = [f for f in files if not f['name'].startswith('.thumbnails/')]
        
        # 只返回影片文件
        video_extensions = {'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.flv'}
        video_files = [
            f for f in files 
            if any(f['name'].lower().endswith(ext) for ext in video_extensions) or
               (f.get('content_type') and f['content_type'].startswith('video/'))
        ]
        
        logger.info(f"📋 列出 {len(video_files)} 個影片文件（總共 {len(files)} 個文件）")
        
        return {
            "success": True,
            "files": video_files,
            "count": len(video_files),
            "total_files": len(files)
        }
    except Exception as e:
        logger.error(f"❌ 列出文件失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/files/{filename:path}")
async def delete_file(filename: str):
    """刪除文件"""
    if not gcs_manager:
        raise HTTPException(status_code=503, detail="GCS Manager not available")
    
    try:
        gcs_manager.delete_file(filename)
        logger.info(f"🗑️  文件刪除成功: {filename}")
        return {
            "success": True,
            "message": f"已刪除 {filename}"
        }
    except Exception as e:
        logger.error(f"❌ 刪除失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files/{filename:path}/info")
async def get_file_info(filename: str):
    """獲取文件詳細信息"""
    if not gcs_manager:
        raise HTTPException(status_code=503, detail="GCS Manager not available")
    
    try:
        info = gcs_manager.get_file_info(filename)
        return info
    except Exception as e:
        logger.error(f"❌ 獲取文件信息失敗: {e}")
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/files/{filename:path}/copy")
async def copy_file(
    filename: str,
    destination: str = Query(..., description="目標文件名")
):
    """複製文件"""
    if not gcs_manager:
        raise HTTPException(status_code=503, detail="GCS Manager not available")
    
    try:
        result = gcs_manager.copy_file(filename, destination)
        logger.info(f"✅ 文件複製成功: {filename} -> {destination}")
        return result
    except Exception as e:
        logger.error(f"❌ 複製失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Query("", description="上傳到的資料夾")
):
    """上傳檔案"""
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not initialized")
    
    try:
        # 組合完整路徑
        file_path = f"{folder}/{file.filename}".strip("/") if folder else file.filename
        
        # 檢查檔案類型
        content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
        
        if not content_type or not content_type.startswith(("video/", "image/")):
            raise HTTPException(status_code=400, detail="Only video and image files are allowed")
        
        logger.info(f"上傳檔案: {file_path} ({content_type})")
        
        # 上傳
        storage.upload_file(file_path, file.file, content_type)
        
        return {
            "status": "success",
            "filename": file.filename,
            "path": file_path,
            "content_type": content_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上傳失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    
# ==================== 縮圖 API ====================

@app.api_route(
    "/api/thumbnails/video/{video_path:path}",
    methods=["GET", "HEAD"]  # 同時支持 GET 和 HEAD
)
async def get_video_thumbnail(
    video_path: str,
    width: int = Query(320, description="縮圖寬度"),
    height: int = Query(180, description="縮圖高度"),
    time_offset: float = Query(1.0, description="擷取時間點（秒）"),
    force_regenerate: bool = Query(False, description="強制重新生成")
):
    """獲取影片縮圖"""
    if not thumbnail_generator:
        raise HTTPException(status_code=503, detail="Thumbnail generator not available")
    
    try:
        from fastapi.responses import Response
        
        thumbnail_data, is_new = thumbnail_generator.get_or_create_thumbnail(
            video_path=video_path,
            width=width,
            height=height,
            time_offset=time_offset,
            force_regenerate=force_regenerate
        )
        
        logger.info(f"✅ 影片縮圖: {video_path} ({'新生成' if is_new else '使用快取'})")
        
        return Response(
            content=thumbnail_data,
            media_type="image/jpeg",
            headers={
                "X-Thumbnail-Cached": "false" if is_new else "true"
            }
        )
        
    except Exception as e:
        logger.error(f"❌ 獲取影片縮圖失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/thumbnails/video/{video_path:path}")
async def delete_video_thumbnail(
    video_path: str,
    width: int = Query(320, description="縮圖寬度"),
    height: int = Query(180, description="縮圖高度"),
    time_offset: float = Query(1.0, description="擷取時間點（秒）")
):
    """刪除影片縮圖"""
    if not thumbnail_generator:
        raise HTTPException(status_code=503, detail="Thumbnail generator not available")
    
    try:
        thumbnail_generator.delete_thumbnail(
            video_path=video_path,
            width=width,
            height=height,
            time_offset=time_offset
        )
        
        logger.info(f"🗑️  影片縮圖刪除成功: {video_path}")
        return {
            "success": True,
            "message": f"已刪除影片縮圖: {video_path}"
        }
        
    except Exception as e:
        logger.error(f"❌ 刪除影片縮圖失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/thumbnails/video/{video_path:path}/all")
async def delete_all_video_thumbnails(video_path: str):
    """刪除影片的所有縮圖"""
    if not thumbnail_generator:
        raise HTTPException(status_code=503, detail="Thumbnail generator not available")
    
    try:
        thumbnail_generator.delete_all_thumbnails_for_video(video_path)
        
        logger.info(f"🗑️  影片所有縮圖刪除成功: {video_path}")
        return {
            "success": True,
            "message": f"已刪除影片的所有縮圖: {video_path}"
        }
        
    except Exception as e:
        logger.error(f"❌ 刪除影片所有縮圖失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))
      
# ==================== 串流api ==================== 
@app.api_route("/api/stream/{file_path:path}", methods=["GET", "HEAD"])
async def stream_video(file_path: str, request: Request):
    """串流影片(支援 Range 請求)"""
    
    # URL 解碼並清理路徑
    file_path = unquote(file_path).strip()
    
    # 移除可能的重複斜線
    while '//' in file_path:
        file_path = file_path.replace('//', '/')
    
    range_header = request.headers.get("range")
    
    logger.info(f"🎬 串流請求: {file_path}")
    if range_header:
        logger.info(f"   Range: {range_header}")
    
    if not gcs_manager:
        logger.error("❌ GCS Manager 未初始化")
        raise HTTPException(status_code=503, detail="Storage not initialized")
    
    try:
        # 檢查檔案是否存在
        if not gcs_manager.file_exists(file_path):
            logger.warning(f"⚠️  檔案不存在: {file_path}")
            
            # 列出可能的文件幫助調試
            try:
                all_files = gcs_manager.list_files(max_results=10)
                logger.info(f"📋 Bucket 中的文件:")
                for f in all_files[:5]:
                    logger.info(f"   - {f['name']}")
            except:
                pass
            
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        # 取得檔案信息
        file_info = gcs_manager.get_file_info(file_path)
        file_size = file_info['size']
        content_type = file_info.get('content_type', 'video/mp4')
        
        logger.info(f"📦 檔案大小: {file_size / 1024 / 1024:.2f} MB")
        logger.info(f"📝 Content-Type: {content_type}")
        
        # HEAD 請求只返回 headers
        if request.method == "HEAD":
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Type": content_type,
                "Cache-Control": "public, max-age=3600"
            }
            return Response(content=b"", headers=headers)
        
        # 處理 Range 請求
        if range_header:
            # 解析 Range header
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else file_size - 1
            end = min(end, file_size - 1)
            
            # 限制單次請求大小 (10MB)
            MAX_CHUNK_SIZE = 10 * 1024 * 1024
            if (end - start + 1) > MAX_CHUNK_SIZE:
                end = start + MAX_CHUNK_SIZE - 1
            
            chunk_size = end - start + 1
            logger.info(f"📤 Range: bytes {start}-{end}/{file_size} ({chunk_size / 1024:.1f} KB)")
            
            # 下載指定範圍
            chunk = gcs_manager.download_bytes(file_path, start, end + 1)
            
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(chunk)),
                "Content-Type": content_type,
                "Cache-Control": "public, max-age=3600"
            }
            
            return Response(content=chunk, status_code=206, headers=headers)
        else:
            # 完整檔案請求
            logger.info(f"📥 請求完整檔案: {file_size / 1024 / 1024:.2f} MB")
            
            # 對於大文件，使用串流
            if file_size > 50 * 1024 * 1024:  # 50MB
                logger.info("📡 使用串流模式")
                
                def iterfile():
                    """分塊讀取文件"""
                    chunk_size = 1024 * 1024  # 1MB chunks
                    offset = 0
                    while offset < file_size:
                        end = min(offset + chunk_size, file_size)
                        chunk = gcs_manager.download_bytes(file_path, offset, end)
                        yield chunk
                        offset = end
                
                return StreamingResponse(
                    iterfile(),
                    media_type=content_type,
                    headers={
                        "Accept-Ranges": "bytes",
                        "Content-Length": str(file_size),
                        "Cache-Control": "public, max-age=3600"
                    }
                )
            else:
                # 小文件直接下載
                data = gcs_manager.download_file(file_path)
                
                headers = {
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(len(data)),
                    "Content-Type": content_type,
                    "Cache-Control": "public, max-age=3600"
                }
                
                return Response(content=data, headers=headers)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 串流錯誤: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
