# backend/utils/storage.py

from google.cloud import storage
from typing import BinaryIO, List, Dict, Optional
import os
import logging
from utils.gcs_auth import get_gcs_auth

logger = logging.getLogger(__name__)


class StorageManager:
    def __init__(self, bucket_name: str):
        """初始化 Storage Manager"""
        
        # 使用 GCSAuth 進行認證
        logger.info("初始化 GCS 認證...")
        
        gcs_auth = get_gcs_auth(
            client_secret_file='credentials/credentials.json',
            token_file='tokens/token.pickle',
            project_id=os.getenv('GCP_PROJECT_ID'),
            auto_refresh_interval_minutes=30
        )
        
        # 執行認證
        gcs_auth.authenticate()
        
        # 啟動自動刷新
        gcs_auth.start_auto_refresh()
        
        # 取得 Storage Client
        self.client = gcs_auth.get_storage_client()
        self.bucket_name = bucket_name
        self.bucket = self.client.bucket(bucket_name)
        
        # 驗證 bucket 是否存在
        try:
            if not self.bucket.exists():
                raise ValueError(f"Bucket '{bucket_name}' 不存在或無權限存取")
        except Exception as e:
            raise ValueError(f"無法存取 Bucket '{bucket_name}': {e}")
        
        logger.info(f"✓ 已連接到 GCS Bucket: {bucket_name}")
    
    def file_exists(self, file_path: str) -> bool:
        """檢查檔案是否存在"""
        try:
            blob = self.bucket.blob(file_path)
            return blob.exists()
        except Exception as e:
            logger.error(f"檢查檔案錯誤: {e}")
            return False
    
    def get_blob(self, file_path: str):
        """取得 blob 物件並確保有完整資訊"""
        try:
            blob = self.bucket.blob(file_path)
            
            if not blob.exists():
                raise FileNotFoundError(f"檔案不存在: {file_path}")
            
            # 確保載入完整的 blob 資訊
            if blob.size is None or blob.content_type is None:
                logger.info(f"重新載入 blob 資訊...")
                blob.reload()
            
            # 驗證必要資訊
            if blob.size is None:
                logger.warning(f"警告：無法取得檔案大小")
                # 嘗試再次載入
                try:
                    blob.reload()
                except Exception as e:
                    logger.warning(f"重新載入失敗: {e}")
            
            return blob
            
        except FileNotFoundError:
            raise
        except Exception as e:
            logger.error(f"取得 blob 錯誤: {e}", exc_info=True)
            raise

    def list_files(self, prefix: str = "") -> List[Dict]:
        """列出所有檔案"""
        try:
            blobs = self.bucket.list_blobs(prefix=prefix)
            files = []
            
            for blob in blobs:
                if blob.name.endswith('/'):
                    continue
                
                if not blob.size:
                    blob.reload()
                
                file_info = {
                    'name': blob.name,
                    'size': blob.size or 0,
                    'content_type': blob.content_type or 'application/octet-stream',
                    'created': blob.time_created.isoformat() if blob.time_created else None,
                    'updated': blob.updated.isoformat() if blob.updated else None
                }
                files.append(file_info)
            
            logger.info(f"列出 {len(files)} 個檔案")
            return files
        except Exception as e:
            logger.error(f"列出檔案錯誤: {e}")
            raise
    
    def upload_file(self, file_path: str, file_obj, content_type: str = None):
        """
        上傳檔案
        
        Args:
            file_path: 目標路徑
            file_obj: 檔案物件
            content_type: MIME 類型
        """
        try:
            blob = self.bucket.blob(file_path)
            
            if content_type:
                blob.content_type = content_type
            
            blob.upload_from_file(file_obj)
            logger.info(f"✓ 已上傳: {file_path}")
        except Exception as e:
            logger.error(f"上傳檔案錯誤: {e}", exc_info=True)
            raise
    
    def upload_bytes(self, file_path: str, data: bytes, content_type: str = None):
        """
        上傳 bytes 資料（用於縮圖等）
        
        Args:
            file_path: 目標路徑
            data: bytes 資料
            content_type: MIME 類型
        """
        try:
            logger.info(f"上傳 bytes 資料: {file_path} ({len(data)} bytes)")
            
            blob = self.bucket.blob(file_path)
            
            # 設定 content type
            if content_type:
                blob.content_type = content_type
            
            # 上傳資料
            blob.upload_from_string(data, content_type=content_type)
            
            logger.info(f"✓ 已上傳: {file_path} ({len(data)} bytes)")
            
        except Exception as e:
            logger.error(f"上傳 bytes 錯誤: {e}", exc_info=True)
            raise

    def download_bytes(self, file_path: str, start: int = 0, end: Optional[int] = None) -> bytes:
        """下載檔案的部分內容（支援 Range 請求）
        
        Args:
            file_path: 檔案路徑
            start: 開始位置（inclusive）
            end: 結束位置（exclusive，即不包含 end）
        
        Returns:
            bytes: 下載的資料
        """
        try:
            logger.info(f"下載請求: {file_path} [{start}, {end})")
            
            blob = self.bucket.blob(file_path)
            
            # 檢查檔案是否存在
            if not blob.exists():
                logger.error(f"檔案不存在: {file_path}")
                raise FileNotFoundError(f"檔案不存在: {file_path}")
            
            logger.info(f"✓ 檔案存在")
            
            # 確保有檔案大小資訊
            if blob.size is None:
                logger.info(f"載入 blob 資訊...")
                blob.reload()
            
            file_size = blob.size
            
            # 再次檢查
            if file_size is None:
                logger.error(f"無法取得檔案大小")
                raise ValueError("Cannot determine file size")
            
            logger.info(f"檔案大小: {file_size / 1024 / 1024:.2f} MB")
            
            # 處理 end 參數
            if end is None:
                end = file_size
            
            # 確保 end 不超過檔案大小
            end = min(end, file_size)
            
            # 驗證範圍
            if start < 0:
                logger.error(f"start 不能為負數: {start}")
                raise ValueError(f"Invalid start position: {start}")
            
            if start >= file_size:
                logger.error(f"start 超出檔案大小: {start} >= {file_size}")
                raise ValueError(f"Start position out of range: {start} >= {file_size}")
            
            if start >= end:
                logger.error(f"無效的範圍: [{start}, {end})")
                raise ValueError(f"Invalid range: start={start}, end={end}")
            
            # 計算要下載的大小
            chunk_size = end - start
            logger.info(f"下載 {chunk_size / 1024:.2f} KB...")
            
            # 下載資料
            # 注意：download_as_bytes 的 end 參數是 exclusive
            data = blob.download_as_bytes(start=start, end=end)
            
            actual_size = len(data)
            logger.info(f"✓ 下載完成: {actual_size} bytes")
            
            # 驗證下載的大小
            if actual_size != chunk_size:
                logger.warning(f"下載大小不符 (預期: {chunk_size}, 實際: {actual_size})")
            
            return data
            
        except FileNotFoundError:
            raise
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"下載錯誤: {e}", exc_info=True)
            raise
    
    def delete_file(self, file_path: str):
        """刪除檔案"""
        try:
            blob = self.bucket.blob(file_path)
            
            if not blob.exists():
                raise FileNotFoundError(f"檔案不存在: {file_path}")
            
            blob.delete()
            logger.info(f"✓ 刪除成功: {file_path}")
            
        except Exception as e:
            logger.error(f"刪除錯誤: {e}")
            raise


_storage_manager = None


def get_storage_manager(bucket_name: str) -> StorageManager:
    """取得 Storage Manager 實例（單例）"""
    global _storage_manager
    
    if _storage_manager is None:
        _storage_manager = StorageManager(bucket_name)
    
    return _storage_manager
