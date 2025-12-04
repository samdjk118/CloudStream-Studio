# backend/utils/thumbnail.py

import os
import tempfile
import subprocess
from io import BytesIO
import hashlib
import logging

logger = logging.getLogger(__name__)


class ThumbnailGenerator:
    def __init__(self, storage_manager):
        self.storage = storage_manager
        self.thumbnail_prefix = ".thumbnails/"
        
    def _get_thumbnail_path(self, video_path: str, width: int, height: int, time_offset: float = 1.0) -> str:
        """產生縮圖的 GCS 路徑"""
        # 使用影片路徑 + 參數產生唯一的快取鍵
        cache_key = f"{video_path}_{width}x{height}_t{time_offset}"
        hash_key = hashlib.md5(cache_key.encode()).hexdigest()
        
        # 縮圖路徑: .thumbnails/{hash}.jpg
        return f"{self.thumbnail_prefix}{hash_key}.jpg"
    
    def get_or_create_thumbnail(
        self,
        video_path: str,
        width: int = 320,
        height: int = 180,
        time_offset: float = 1.0,
        force_regenerate: bool = False
    ) -> tuple[bytes, bool]:
        """
        取得或建立縮圖
        
        Returns:
            (thumbnail_data, is_new): 縮圖資料和是否為新產生
        """
        thumbnail_path = self._get_thumbnail_path(video_path, width, height, time_offset)
        
        # 檢查快取
        if not force_regenerate and self.storage.file_exists(thumbnail_path):
            logger.info(f"✓ 使用快取縮圖: {thumbnail_path}")
            thumbnail_data = self.storage.download_bytes(thumbnail_path)
            return thumbnail_data, False
        
        # 產生新縮圖
        logger.info(f"⚙ 產生新縮圖: {video_path}")
        thumbnail_data = self._generate_thumbnail(video_path, width, height, time_offset)
        
        # 儲存到 GCS
        logger.info(f"💾 儲存縮圖到: {thumbnail_path}")
        self.storage.upload_bytes(thumbnail_path, thumbnail_data, "image/jpeg")
        
        return thumbnail_data, True
    
    def _generate_thumbnail(
        self,
        video_path: str,
        width: int,
        height: int,
        time_offset: float
    ) -> bytes:
        """使用 ffmpeg 產生縮圖"""
        
        # 建立臨時檔案
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as video_temp:
            video_temp_path = video_temp.name
            
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as thumb_temp:
            thumb_temp_path = thumb_temp.name
        
        try:
            # 1. 下載影片到臨時檔案
            logger.info(f"📥 下載影片: {video_path}")
            
            # 取得檔案大小
            blob = self.storage.get_blob(video_path)
            if blob.size is None:
                blob.reload()
            
            file_size = blob.size
            logger.info(f"   檔案大小: {file_size / 1024 / 1024:.2f} MB")
            
            # 完整下載影片
            video_data = self.storage.download_bytes(video_path, 0, file_size)
            
            # 寫入臨時檔案
            with open(video_temp_path, 'wb') as f:
                f.write(video_data)
            
            actual_size = os.path.getsize(video_temp_path)
            logger.info(f"   已寫入: {actual_size} bytes")
            
            # 驗證檔案
            if actual_size != file_size:
                raise Exception(f"檔案大小不符: 預期 {file_size}, 實際 {actual_size}")
            
            # 2. 使用 ffmpeg 擷取縮圖
            logger.info(f"🎬 使用 ffmpeg 擷取縮圖 (時間: {time_offset}s, 尺寸: {width}x{height})")
            
            cmd = [
                'ffmpeg',
                '-ss', str(time_offset),           # 跳到指定時間
                '-i', video_temp_path,              # 輸入檔案
                '-vframes', '1',                    # 只取一幀
                '-vf', f'scale={width}:{height}',   # 縮放
                '-q:v', '2',                        # 品質 (2-5 較好)
                '-y',                               # 覆蓋輸出
                thumb_temp_path
            ]
            
            logger.info(f"   執行命令: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                logger.error(f"❌ ffmpeg 錯誤:")
                logger.error(f"   stdout: {result.stdout}")
                logger.error(f"   stderr: {result.stderr}")
                raise Exception(f"ffmpeg failed: {result.stderr}")
            
            # 3. 讀取縮圖
            if not os.path.exists(thumb_temp_path):
                raise Exception("縮圖檔案未產生")
            
            thumb_size = os.path.getsize(thumb_temp_path)
            logger.info(f"✓ 縮圖產生成功: {thumb_size} bytes")
            
            with open(thumb_temp_path, 'rb') as f:
                thumbnail_data = f.read()
            
            return thumbnail_data
            
        except subprocess.TimeoutExpired:
            logger.error("❌ ffmpeg 執行逾時")
            raise Exception("ffmpeg 執行逾時")
        except Exception as e:
            logger.error(f"❌ 產生縮圖失敗: {e}", exc_info=True)
            raise
        finally:
            # 清理臨時檔案
            for temp_path in [video_temp_path, thumb_temp_path]:
                try:
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
                        logger.debug(f"🗑️  清理臨時檔案: {temp_path}")
                except Exception as e:
                    logger.warning(f"⚠️  清理失敗: {e}")
    
    def delete_thumbnail(self, video_path: str, width: int, height: int, time_offset: float = 1.0):
        """刪除特定縮圖"""
        thumbnail_path = self._get_thumbnail_path(video_path, width, height, time_offset)
        
        if self.storage.file_exists(thumbnail_path):
            self.storage.delete_file(thumbnail_path)
            logger.info(f"✓ 已刪除縮圖: {thumbnail_path}")
        else:
            logger.warning(f"⚠️  縮圖不存在: {thumbnail_path}")
    
    def delete_all_thumbnails_for_video(self, video_path: str):
        """刪除影片的所有縮圖"""
        # 列出所有縮圖
        try:
            blobs = self.storage.bucket.list_blobs(prefix=self.thumbnail_prefix)
            deleted_count = 0
            
            # 由於使用 hash 命名，我們需要檢查每個縮圖
            # 這裡提供一個簡化版本
            logger.warning(f"⚠️  使用 hash 命名，無法直接找到所有相關縮圖")
            logger.info(f"   建議: 在資料庫中維護縮圖索引")
            
            # 如果要完整實作，需要:
            # 1. 在產生縮圖時記錄 video_path -> thumbnail_path 的映射
            # 2. 在刪除時查詢這個映射
            
        except Exception as e:
            logger.error(f"❌ 刪除縮圖失敗: {e}")
            raise


def get_thumbnail_generator(storage_manager):
    """取得 ThumbnailGenerator 實例"""
    return ThumbnailGenerator(storage_manager)
