from google.cloud import storage
from google.auth import default
from google.auth.exceptions import DefaultCredentialsError
import logging
import os

logger = logging.getLogger(__name__)


def get_storage_client(project_id: str = None) -> storage.Client:
    """
    獲取 Storage Client
    
    使用 Application Default Credentials (ADC):
    - 本地開發: gcloud auth application-default login
    - Cloud Run/GCE: 自動使用環境的 Service Account
    - 環境變量: GOOGLE_APPLICATION_CREDENTIALS
    
    Args:
        project_id: GCP 項目 ID (可選，會自動檢測)
    
    Returns:
        storage.Client: Storage 客戶端
    
    Raises:
        DefaultCredentialsError: 無法找到有效的認證
    """
    try:
        # 獲取默認認證
        credentials, detected_project = default(
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # 使用提供的項目 ID 或檢測到的項目
        project = project_id or detected_project or os.getenv('GCP_PROJECT_ID')
        
        # 創建客戶端
        client = storage.Client(
            credentials=credentials,
            project=project
        )
        
        logger.info(f"✅ Storage Client 初始化成功")
        logger.info(f"   認證類型: {type(credentials).__name__}")
        logger.info(f"   項目: {project}")
        
        return client
        
    except DefaultCredentialsError as e:
        logger.error(f"❌ 認證失敗: {e}")
        logger.error("💡 請運行以下命令之一:")
        logger.error("   1. gcloud auth application-default login")
        logger.error("   2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json")
        raise
    except Exception as e:
        logger.error(f"❌ 創建 Storage Client 失敗: {e}")
        raise


def check_authentication() -> dict:
    """
    檢查認證狀態
    
    Returns:
        dict: 認證信息
            - authenticated: bool
            - project: str
            - auth_type: str
            - error: str (如果失敗)
    """
    try:
        credentials, project = default()
        
        return {
            "authenticated": True,
            "project": project,
            "auth_type": type(credentials).__name__,
            "error": None
        }
    except Exception as e:
        return {
            "authenticated": False,
            "project": None,
            "auth_type": None,
            "error": str(e)
        }


def verify_bucket_access(bucket_name: str, project_id: str = None) -> dict:
    """
    驗證 Bucket 訪問權限
    
    Args:
        bucket_name: Bucket 名稱
        project_id: 項目 ID (可選)
    
    Returns:
        dict: 驗證結果
            - accessible: bool
            - exists: bool
            - error: str (如果失敗)
    """
    try:
        client = get_storage_client(project_id)
        bucket = client.bucket(bucket_name)
        
        # 檢查 bucket 是否存在
        exists = bucket.exists()
        
        if not exists:
            return {
                "accessible": False,
                "exists": False,
                "error": f"Bucket '{bucket_name}' 不存在"
            }
        
        # 嘗試列出文件（測試讀取權限）
        try:
            list(bucket.list_blobs(max_results=1))
            return {
                "accessible": True,
                "exists": True,
                "error": None
            }
        except Exception as e:
            return {
                "accessible": False,
                "exists": True,
                "error": f"無訪問權限: {str(e)}"
            }
            
    except Exception as e:
        return {
            "accessible": False,
            "exists": False,
            "error": str(e)
        }


# 向後兼容 - 如果有舊代碼使用這些函數
def get_credentials():
    """
    [已棄用] 獲取認證
    請直接使用 get_storage_client()
    """
    logger.warning("⚠️  get_credentials() 已棄用，請使用 get_storage_client()")
    credentials, _ = default()
    return credentials


def initialize_storage_client(project_id: str = None):
    """
    [已棄用] 初始化 Storage Client
    請直接使用 get_storage_client()
    """
    logger.warning("⚠️  initialize_storage_client() 已棄用，請使用 get_storage_client()")
    return get_storage_client(project_id)