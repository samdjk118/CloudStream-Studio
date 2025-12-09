from google.cloud import storage
from google.cloud.exceptions import NotFound, GoogleCloudError
from typing import List, Optional, BinaryIO, Union
import logging
import os
from pathlib import Path
from .gcs_auth import get_storage_client

logger = logging.getLogger(__name__)


class GCSManager:
    """Google Cloud Storage 管理器"""
    
    def __init__(self, bucket_name: str, project_id: str = None):
        """
        初始化 GCS 管理器
        
        Args:
            bucket_name: Bucket 名稱
            project_id: 項目 ID (可選)
        """
        self.bucket_name = bucket_name
        self.project_id = project_id or os.getenv('GCP_PROJECT_ID')
        self.client = get_storage_client(self.project_id)
        self.bucket = self.client.bucket(bucket_name)
        
        logger.info(f"📦 GCS Manager 初始化: {bucket_name}")
    
    def list_files(self, prefix: str = None, max_results: int = None) -> List[dict]:
        """
        列出文件
        
        Args:
            prefix: 文件前綴過濾
            max_results: 最大結果數
        
        Returns:
            List[dict]: 文件信息列表
        """
        try:
            blobs = self.bucket.list_blobs(prefix=prefix, max_results=max_results)
            
            files = []
            for blob in blobs:
                files.append({
                    "name": blob.name,
                    "size": blob.size,
                    "content_type": blob.content_type,
                    "created": blob.time_created.isoformat() if blob.time_created else None,
                    "updated": blob.updated.isoformat() if blob.updated else None,
                    "url": f"gs://{self.bucket_name}/{blob.name}",
                    "public_url": blob.public_url if hasattr(blob, 'public_url') else None
                })
            
            logger.info(f"📋 列出 {len(files)} 個文件")
            return files
            
        except Exception as e:
            logger.error(f"❌ 列出文件失敗: {e}")
            raise
    
    def upload_file(
        self,
        source: Union[BinaryIO, bytes, str],
        destination_name: str,
        content_type: str = None,
        make_public: bool = False
    ) -> dict:
        """
        上傳文件
        
        Args:
            source: 文件來源 (文件對象、字節或文件路徑)
            destination_name: 目標文件名
            content_type: 內容類型
            make_public: 是否設為公開
        
        Returns:
            dict: 上傳結果
        """
        try:
            blob = self.bucket.blob(destination_name)
            
            # 根據來源類型上傳
            if isinstance(source, bytes):
                blob.upload_from_string(source, content_type=content_type)
            elif isinstance(source, str):
                # 假設是文件路徑
                blob.upload_from_filename(source, content_type=content_type)
            else:
                # 假設是文件對象
                blob.upload_from_file(source, content_type=content_type)
            
            # 設為公開（如果需要）
            if make_public:
                blob.make_public()
            
            logger.info(f"✅ 上傳成功: {destination_name}")
            
            return {
                "success": True,
                "filename": destination_name,
                "size": blob.size,
                "content_type": blob.content_type,
                "url": f"gs://{self.bucket_name}/{destination_name}",
                "public_url": blob.public_url if make_public else None
            }
            
        except Exception as e:
            logger.error(f"❌ 上傳失敗: {e}")
            raise
    
    def download_file(self, filename: str, destination: str = None) -> Optional[bytes]:
        """
        下載文件
        
        Args:
            filename: 文件名
            destination: 本地保存路徑 (可選)
        
        Returns:
            bytes: 文件內容 (如果沒有指定 destination)
            None: 如果指定了 destination
        """
        try:
            blob = self.bucket.blob(filename)
            
            if not blob.exists():
                raise NotFound(f"文件不存在: {filename}")
            
            if destination:
                # 保存到本地文件
                blob.download_to_filename(destination)
                logger.info(f"✅ 下載成功: {filename} -> {destination}")
                return None
            else:
                # 返回字節內容
                content = blob.download_as_bytes()
                logger.info(f"✅ 下載成功: {filename} ({len(content)} bytes)")
                return content
                
        except NotFound:
            logger.error(f"❌ 文件不存在: {filename}")
            raise
        except Exception as e:
            logger.error(f"❌ 下載失敗: {e}")
            raise
    
    def download_bytes(self, filename: str, start: int = None, end: int = None) -> bytes:
        """
        下載文件的字節範圍
        
        Args:
            filename: 文件名
            start: 起始字節位置 (可選)
            end: 結束字節位置 (可選)
        
        Returns:
            bytes: 文件內容
        """
        try:
            blob = self.bucket.blob(filename)
            
            if not blob.exists():
                raise NotFound(f"文件不存在: {filename}")
            
            if start is not None and end is not None:
                # 下載指定範圍
                logger.info(f"📥 下載範圍: {filename} [{start}-{end}]")
                return blob.download_as_bytes(start=start, end=end)
            else:
                # 下載整個文件
                logger.info(f"📥 下載完整文件: {filename}")
                return blob.download_as_bytes()
                
        except NotFound:
            logger.error(f"❌ 文件不存在: {filename}")
            raise
        except Exception as e:
            logger.error(f"❌ 下載失敗: {e}")
            raise
    
    def upload_bytes(self, filename: str, data: bytes, content_type: str = None):
        """
        上傳字節數據
        
        Args:
            filename: 目標文件名
            data: 字節數據
            content_type: 內容類型
        """
        try:
            blob = self.bucket.blob(filename)
            blob.upload_from_string(data, content_type=content_type)
            logger.info(f"✅ 上傳成功: {filename} ({len(data)} bytes)")
        except Exception as e:
            logger.error(f"❌ 上傳失敗: {e}")
            raise
    
    def get_blob(self, filename: str):
        """
        獲取 Blob 對象
        
        Args:
            filename: 文件名
        
        Returns:
            Blob: Google Cloud Storage Blob 對象
        """
        return self.bucket.blob(filename)
    
    def delete_file(self, filename: str) -> bool:
        """
        刪除文件
        
        Args:
            filename: 文件名
        
        Returns:
            bool: 是否成功
        """
        try:
            blob = self.bucket.blob(filename)
            
            if not blob.exists():
                raise NotFound(f"文件不存在: {filename}")
            
            blob.delete()
            logger.info(f"🗑️  刪除成功: {filename}")
            return True
            
        except NotFound:
            logger.error(f"❌ 文件不存在: {filename}")
            raise
        except Exception as e:
            logger.error(f"❌ 刪除失敗: {e}")
            raise
    
    def file_exists(self, filename: str) -> bool:
        """
        檢查文件是否存在
        
        Args:
            filename: 文件名
        
        Returns:
            bool: 是否存在
        """
        try:
            blob = self.bucket.blob(filename)
            return blob.exists()
        except Exception as e:
            logger.error(f"❌ 檢查文件失敗: {e}")
            return False
    
    def get_file_info(self, filename: str) -> dict:
        """
        獲取文件信息
        
        Args:
            filename: 文件名
        
        Returns:
            dict: 文件信息
        """
        try:
            blob = self.bucket.blob(filename)
            
            if not blob.exists():
                raise NotFound(f"文件不存在: {filename}")
            
            blob.reload()
            
            return {
                "name": blob.name,
                "size": blob.size,
                "content_type": blob.content_type,
                "created": blob.time_created.isoformat() if blob.time_created else None,
                "updated": blob.updated.isoformat() if blob.updated else None,
                "md5_hash": blob.md5_hash,
                "url": f"gs://{self.bucket_name}/{blob.name}",
                "public_url": blob.public_url if hasattr(blob, 'public_url') else None
            }
            
        except NotFound:
            logger.error(f"❌ 文件不存在: {filename}")
            raise
        except Exception as e:
            logger.error(f"❌ 獲取文件信息失敗: {e}")
            raise
    
    def copy_file(self, source_name: str, destination_name: str) -> dict:
        """
        複製文件
        
        Args:
            source_name: 源文件名
            destination_name: 目標文件名
        
        Returns:
            dict: 複製結果
        """
        try:
            source_blob = self.bucket.blob(source_name)
            
            if not source_blob.exists():
                raise NotFound(f"源文件不存在: {source_name}")
            
            # 複製到同一個 bucket
            destination_blob = self.bucket.copy_blob(
                source_blob,
                self.bucket,
                destination_name
            )
            
            logger.info(f"✅ 複製成功: {source_name} -> {destination_name}")
            
            return {
                "success": True,
                "source": source_name,
                "destination": destination_name,
                "size": destination_blob.size
            }
            
        except NotFound:
            logger.error(f"❌ 源文件不存在: {source_name}")
            raise
        except Exception as e:
            logger.error(f"❌ 複製失敗: {e}")
            raise
    
    def move_file(self, source_name: str, destination_name: str) -> dict:
        """
        移動文件（複製後刪除源文件）
        
        Args:
            source_name: 源文件名
            destination_name: 目標文件名
        
        Returns:
            dict: 移動結果
        """
        try:
            # 先複製
            result = self.copy_file(source_name, destination_name)
            
            # 再刪除源文件
            self.delete_file(source_name)
            
            logger.info(f"✅ 移動成功: {source_name} -> {destination_name}")
            return result
            
        except Exception as e:
            logger.error(f"❌ 移動失敗: {e}")
            raise
    
    def get_signed_url(
        self,
        filename: str,
        expiration: int = 3600,
        method: str = 'GET'
    ) -> str:
        """
        生成簽名 URL
        
        Args:
            filename: 文件名
            expiration: 過期時間（秒）
            method: HTTP 方法
        
        Returns:
            str: 簽名 URL
        """
        try:
            blob = self.bucket.blob(filename)
            
            from datetime import timedelta
            url = blob.generate_signed_url(
                expiration=timedelta(seconds=expiration),
                method=method
            )
            
            logger.info(f"✅ 生成簽名 URL: {filename}")
            return url
            
        except Exception as e:
            logger.error(f"❌ 生成簽名 URL 失敗: {e}")
            raise


# 便捷函數
def create_gcs_manager(bucket_name: str = None, project_id: str = None) -> GCSManager:
    """
    創建 GCS 管理器
    
    Args:
        bucket_name: Bucket 名稱（從環境變量讀取如果未提供）
        project_id: 項目 ID（從環境變量讀取如果未提供）
    
    Returns:
        GCSManager: GCS 管理器實例
    """
    bucket = bucket_name or os.getenv('GCS_BUCKET_NAME')
    if not bucket:
        raise ValueError("必須提供 bucket_name 或設置 GCS_BUCKET_NAME 環境變量")
    
    return GCSManager(bucket, project_id)
