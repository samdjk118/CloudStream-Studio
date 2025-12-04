# backend/main.py

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import mimetypes
import logging

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

# 創建 FastAPI 應用
app = FastAPI(
    title="CloudStream Video API",
    description="影片串流與管理 API",
    version="1.0.0"
)

# CORS 設定
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]
)

# 全域變數
storage = None
thumbnail_gen = None


def init_storage():
    """初始化 Storage Manager"""
    global storage, thumbnail_gen
    
    from utils.storage import get_storage_manager
    from utils.thumbnail import get_thumbnail_generator
    
    BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
    
    if not BUCKET_NAME:
        logger.error("未設定 GCS_BUCKET_NAME")
        return None
    
    logger.info("="*60)
    logger.info("啟動 CloudStream API 服務")
    logger.info(f"Bucket: {BUCKET_NAME}")
    logger.info("="*60)
    
    try:
        storage = get_storage_manager(BUCKET_NAME)
        thumbnail_gen = get_thumbnail_generator(storage)
        
        logger.info("✓ API 服務準備就緒")
        logger.info("="*60)
        return storage
    except Exception as e:
        logger.error(f"啟動失敗: {e}", exc_info=True)
        logger.info("="*60)
        return None


@app.on_event("startup")
async def startup_event():
    """應用啟動事件"""
    global storage
    logger.info("應用啟動中...")
    storage = init_storage()


@app.on_event("shutdown")
async def shutdown_event():
    """應用關閉事件"""
    logger.info("應用關閉中...")


@app.get("/")
async def root():
    """根路徑"""
    BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
    return {
        "service": "CloudStream Video API",
        "version": "1.0.0",
        "status": "running" if storage else "error",
        "bucket": BUCKET_NAME,
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/api/health")
async def health_check():
    """健康檢查"""
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not initialized")
    
    try:
        # 檢查 bucket 連線
        exists = storage.bucket.exists()
        if not exists:
            raise HTTPException(status_code=503, detail="Bucket not accessible")
        
        BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
        return {
            "status": "healthy",
            "bucket": BUCKET_NAME,
            "thumbnail_generator": thumbnail_gen is not None,
            "storage_connected": True
        }
    except Exception as e:
        logger.error(f"健康檢查失敗: {e}")
        raise HTTPException(status_code=503, detail=f"Storage unhealthy: {str(e)}")


@app.get("/api/thumbnail/{file_path:path}")
async def get_thumbnail(
    file_path: str,
    width: int = Query(320, ge=50, le=1920, description="縮圖寬度"),
    height: int = Query(180, ge=50, le=1080, description="縮圖高度"),
    time: float = Query(1.0, ge=0, description="擷取時間點(秒)"),
    regenerate: bool = Query(False, description="強制重新產生")
):
    """
    取得影片縮圖(智能快取)
    
    - 第一次請求: 產生縮圖並儲存到 GCS
    - 後續請求: 直接從 GCS 讀取快取
    - regenerate=true: 強制重新產生
    """
    from urllib.parse import unquote
    
    if not storage or not thumbnail_gen:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    # URL 解碼並清理路徑
    file_path = unquote(file_path).strip()
    
    logger.info(f"縮圖請求: {file_path} ({width}x{height}, {time}s, regenerate={regenerate})")
    
    try:
        # 檢查影片是否存在
        if not storage.file_exists(file_path):
            logger.warning(f"影片不存在: {file_path}")
            raise HTTPException(status_code=404, detail=f"Video not found: {file_path}")
        
        # 取得或建立縮圖
        thumbnail_data, is_new = thumbnail_gen.get_or_create_thumbnail(
            file_path,
            width=width,
            height=height,
            time_offset=time,
            force_regenerate=regenerate
        )
        
        # 返回縮圖
        headers = {
            "Content-Type": "image/jpeg",
            "Content-Length": str(len(thumbnail_data)),
            "Cache-Control": "public, max-age=86400",  # 快取 24 小時
            "X-Thumbnail-Source": "generated" if is_new else "cached",
            "X-Thumbnail-Size": f"{width}x{height}"
        }
        
        logger.info(f"縮圖返回: {len(thumbnail_data)} bytes ({'新產生' if is_new else '快取'})")
        
        return Response(content=thumbnail_data, headers=headers)
        
    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"檔案未找到: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"縮圖錯誤: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Thumbnail error: {str(e)}")


@app.delete("/api/thumbnail/{file_path:path}")
async def delete_thumbnail(
    file_path: str,
    width: int = Query(None, description="縮圖寬度(不指定則刪除所有)"),
    height: int = Query(None, description="縮圖高度")
):
    """
    刪除縮圖快取
    
    - 指定 width/height: 刪除特定尺寸的縮圖
    - 不指定: 刪除該影片的所有縮圖
    """
    from urllib.parse import unquote
    
    if not storage or not thumbnail_gen:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    file_path = unquote(file_path).strip()
    
    try:
        if width and height:
            # 刪除特定尺寸
            thumbnail_gen.delete_thumbnail(file_path, width, height)
            message = f"Deleted thumbnail {width}x{height} for {file_path}"
        else:
            # 刪除所有縮圖
            thumbnail_gen.delete_all_thumbnails_for_video(file_path)
            message = f"Deleted all thumbnails for {file_path}"
        
        logger.info(message)
        return {"status": "success", "message": message}
        
    except Exception as e:
        logger.error(f"刪除縮圖失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.api_route("/api/stream/{file_path:path}", methods=["GET", "HEAD"])
async def stream_video(file_path: str, request: Request):
    """串流影片(支援 Range 請求)"""
    from urllib.parse import unquote
    
    # URL 解碼
    file_path = unquote(file_path).strip()
    range_header = request.headers.get("range")
    
    logger.info(f"串流請求: {file_path} (Range: {range_header})")
    
    if not storage:
        logger.error("Storage 未初始化")
        raise HTTPException(status_code=503, detail="Storage not initialized")
    
    try:
        # 檢查檔案是否存在
        if not storage.file_exists(file_path):
            logger.warning(f"檔案不存在: {file_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        # 取得 blob
        blob = storage.get_blob(file_path)
        
        # 確保有檔案大小
        if blob.size is None:
            logger.warning("Blob size 為 None,重新載入...")
            blob.reload()
        
        file_size = blob.size
        
        if file_size is None:
            raise HTTPException(status_code=500, detail="Cannot determine file size")
        
        logger.info(f"檔案大小: {file_size / 1024 / 1024:.2f} MB")
        
        # 處理 Range 請求
        if range_header:
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else file_size - 1
            end = min(end, file_size - 1)
            
            # 限制單次請求大小 (例如 10MB)
            MAX_CHUNK_SIZE = 10 * 1024 * 1024
            if (end - start + 1) > MAX_CHUNK_SIZE:
                end = start + MAX_CHUNK_SIZE - 1
            
            logger.info(f"Range: bytes {start}-{end}/{file_size}")
            
            chunk = storage.download_bytes(file_path, start, end + 1)
            
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(chunk)),
                "Content-Type": blob.content_type or "video/mp4",
                "Cache-Control": "public, max-age=3600"
            }
            
            return Response(content=chunk, status_code=206, headers=headers)
        else:
            # 完整檔案 - 對大檔案應該使用串流
            logger.warning(f"請求完整檔案: {file_size / 1024 / 1024:.2f} MB")
            
            # 如果檔案太大,建議使用 Range 請求
            if file_size > 50 * 1024 * 1024:  # 50MB
                logger.warning("檔案過大,建議使用 Range 請求")
            
            data = storage.download_bytes(file_path, 0, file_size)
            
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(data)),
                "Content-Type": blob.content_type or "video/mp4",
                "Cache-Control": "public, max-age=3600"
            }
            
            return Response(content=data, headers=headers)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"串流錯誤: {e}", exc_info=True)
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

@app.get("/api/files")
async def list_files():
    """列出所有檔案"""
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage not initialized")
    
    try:
        files = storage.list_files()
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"列出檔案失敗: {str(e)}")

@app.delete("/api/files/{file_path:path}")
async def delete_file(file_path: str):
    """刪除檔案"""
    from urllib.parse import unquote
    
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not initialized")
    
    file_path = unquote(file_path).strip()
    
    try:
        logger.info(f"刪除檔案: {file_path}")
        storage.delete_file(file_path)
        
        # 同時刪除相關縮圖
        if thumbnail_gen:
            try:
                thumbnail_gen.delete_all_thumbnails_for_video(file_path)
                logger.info(f"已刪除相關縮圖: {file_path}")
            except Exception as e:
                logger.warning(f"刪除縮圖失敗: {e}")
        
        return {"status": "success", "message": f"Deleted: {file_path}"}
        
    except FileNotFoundError as e:
        logger.warning(f"檔案不存在: {file_path}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"刪除失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
