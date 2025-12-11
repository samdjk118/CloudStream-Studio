# backend/utils/gcs_auth.py
from google.cloud import storage
from google.oauth2 import service_account
from google.auth.exceptions import DefaultCredentialsError
import logging
import os
import json
from pathlib import Path

logger = logging.getLogger(__name__)


def get_storage_client(project_id: str = None) -> storage.Client:
    """
    獲取 Storage Client (僅使用服務帳號金鑰)
    
    優先順序:
    1. GOOGLE_APPLICATION_CREDENTIALS 環境變數
    2. ./credentials/service-account-key.json
    3. 拋出錯誤
    
    Args:
        project_id: GCP 項目 ID (可選，會從金鑰中讀取)
    
    Returns:
        storage.Client: Storage 客戶端
    
    Raises:
        ValueError: 找不到服務帳號金鑰
    """
    try:
        credentials = None
        detected_project = None
        key_path = None
        
        # 1. 檢查環境變數
        env_key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        
        if env_key_path and os.path.exists(env_key_path):
            key_path = env_key_path
            logger.info(f"🔑 使用環境變數指定的金鑰: {key_path}")
        else:
            # 2. 檢查默認位置
            default_paths = [
                './credentials/credentials.json',
            ]
            
            for path in default_paths:
                if os.path.exists(path):
                    key_path = path
                    logger.info(f"🔑 使用默認位置的金鑰: {key_path}")
                    break
        
        if not key_path:
            raise ValueError(
                "找不到服務帳號金鑰文件。請確認:\n"
                "1. 設置環境變數: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json\n"
                "2. 或將金鑰放在: ./credentials/credentials.json"
            )
        
        # 驗證金鑰格式
        try:
            with open(key_path, 'r') as f:
                key_data = json.load(f)
                detected_project = key_data.get('project_id')
                
                logger.info(f"   類型: {key_data.get('type')}")
                logger.info(f"   服務帳號: {key_data.get('client_email')}")
                logger.info(f"   項目 ID: {detected_project}")
                
                # 驗證必要欄位
                required_fields = ['type', 'project_id', 'private_key', 'client_email']
                missing_fields = [f for f in required_fields if f not in key_data]
                
                if missing_fields:
                    raise ValueError(f"金鑰文件缺少必要欄位: {', '.join(missing_fields)}")
                
                if key_data['type'] != 'service_account':
                    raise ValueError(f"金鑰類型錯誤: {key_data['type']} (應為 service_account)")
                
        except json.JSONDecodeError as e:
            raise ValueError(f"金鑰文件格式錯誤: {e}")
        except Exception as e:
            raise ValueError(f"讀取金鑰文件失敗: {e}")
        
        # 創建認證
        credentials = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # 使用提供的項目 ID 或從金鑰中讀取
        project = project_id or detected_project or os.getenv('GCP_PROJECT_ID')
        
        if not project:
            raise ValueError("無法確定項目 ID，請在 .env 中設置 GCP_PROJECT_ID")
        
        # 創建客戶端
        client = storage.Client(
            credentials=credentials,
            project=project
        )
        
        logger.info(f"✅ Storage Client 初始化成功")
        logger.info(f"   認證方式: 服務帳號金鑰")
        logger.info(f"   項目: {project}")
        
        return client
        
    except ValueError as e:
        logger.error(f"❌ 認證失敗: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ 創建 Storage Client 失敗: {e}")
        raise


def check_authentication() -> dict:
    """
    檢查認證狀態
    
    Returns:
        dict: 認證信息
    """
    try:
        # 查找金鑰文件
        key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        
        if not key_path or not os.path.exists(key_path):
            # 檢查默認位置
            default_paths = [
                './credentials/service-account-key.json',
                '../credentials/service-account-key.json',
                'credentials/service-account-key.json',
            ]
            
            for path in default_paths:
                if os.path.exists(path):
                    key_path = path
                    break
        
        if not key_path or not os.path.exists(key_path):
            return {
                "authenticated": False,
                "auth_type": "Service Account",
                "project": None,
                "service_account": None,
                "credential_path": None,
                "error": "找不到服務帳號金鑰文件"
            }
        
        # 讀取金鑰信息
        with open(key_path, 'r') as f:
            key_data = json.load(f)
        
        # 驗證金鑰格式
        if key_data.get('type') != 'service_account':
            return {
                "authenticated": False,
                "auth_type": "Service Account",
                "project": None,
                "service_account": None,
                "credential_path": key_path,
                "error": f"金鑰類型錯誤: {key_data.get('type')}"
            }
        
        return {
            "authenticated": True,
            "auth_type": "Service Account",
            "project": key_data.get('project_id'),
            "service_account": key_data.get('client_email'),
            "credential_path": key_path,
            "error": None
        }
        
    except json.JSONDecodeError as e:
        return {
            "authenticated": False,
            "auth_type": "Service Account",
            "project": None,
            "service_account": None,
            "credential_path": key_path if 'key_path' in locals() else None,
            "error": f"金鑰格式錯誤: {e}"
        }
    except Exception as e:
        return {
            "authenticated": False,
            "auth_type": "Service Account",
            "project": None,
            "service_account": None,
            "credential_path": None,
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
            
    except ValueError as e:
        return {
            "accessible": False,
            "exists": False,
            "error": str(e)
        }
    except Exception as e:
        return {
            "accessible": False,
            "exists": False,
            "error": str(e)
        }


def validate_service_account_key(key_path: str) -> dict:
    """
    驗證服務帳號金鑰
    
    Args:
        key_path: 金鑰文件路徑
    
    Returns:
        dict: 驗證結果
    """
    try:
        if not os.path.exists(key_path):
            return {
                "valid": False,
                "error": "金鑰文件不存在"
            }
        
        with open(key_path, 'r') as f:
            key_data = json.load(f)
        
        # 檢查必要欄位
        required_fields = ['type', 'project_id', 'private_key', 'client_email']
        missing_fields = [f for f in required_fields if f not in key_data]
        
        if missing_fields:
            return {
                "valid": False,
                "error": f"缺少必要欄位: {', '.join(missing_fields)}"
            }
        
        if key_data['type'] != 'service_account':
            return {
                "valid": False,
                "error": f"金鑰類型錯誤: {key_data['type']}"
            }
        
        return {
            "valid": True,
            "project_id": key_data['project_id'],
            "service_account": key_data['client_email'],
            "error": None
        }
        
    except json.JSONDecodeError as e:
        return {
            "valid": False,
            "error": f"JSON 格式錯誤: {e}"
        }
    except Exception as e:
        return {
            "valid": False,
            "error": str(e)
        }
