#!/usr/bin/env python3
"""
CloudStream Studio - Backend Setup Checker
僅驗證 .env 配置，不進行互動式設置
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, Optional, Tuple
from dotenv import load_dotenv

# 顏色代碼
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    MAGENTA = '\033[0;35m'
    NC = '\033[0m'

def print_header():
    """打印標題"""
    print(f"{Colors.BLUE}")
    print("""
   ____ _                 _ ____  _                            
  / ___| | ___  _   _  __| / ___|| |_ _   _ ___  ___  ___     
 | |   | |/ _ \| | | |/ _` \___ \| __| | | / __|/ _ \/ _ \    
 | |___| | (_) | |_| | (_| |___) | |_| |_| \__ \  __/ (_) |   
  \____|_|\___/ \__,_|\__,_|____/ \__|\__,_|___/\___|\___/    
                                                                
  CloudStream Studio - Configuration Checker
  🔐 服務帳號認證驗證
    """)
    print(f"{Colors.NC}")

def print_section(title: str):
    """打印章節標題"""
    print(f"\n{Colors.BLUE}{'=' * 60}{Colors.NC}")
    print(f"{Colors.BLUE}{title}{Colors.NC}")
    print(f"{Colors.BLUE}{'=' * 60}{Colors.NC}\n")

def print_success(message: str):
    """打印成功消息"""
    print(f"{Colors.GREEN}✅ {message}{Colors.NC}")

def print_error(message: str):
    """打印錯誤消息"""
    print(f"{Colors.RED}❌ {message}{Colors.NC}")

def print_warning(message: str):
    """打印警告消息"""
    print(f"{Colors.YELLOW}⚠️  {message}{Colors.NC}")

def print_info(message: str):
    """打印信息消息"""
    print(f"{Colors.CYAN}ℹ️  {message}{Colors.NC}")

def get_script_directory() -> Path:
    """獲取腳本所在目錄"""
    return Path(__file__).parent.resolve()

def check_env_file() -> Tuple[bool, Optional[Path]]:
    """檢查 .env 文件是否存在"""
    print_section("步驟 1: 檢查 .env 文件")
    
    # 獲取腳本所在目錄
    script_dir = get_script_directory()
    env_path = script_dir / ".env"
    
    print_info(f"當前目錄: {script_dir}")
    print_info(f"查找 .env: {env_path}")
    
    if not env_path.exists():
        print_error(".env 文件不存在")
        print()
        print_info(f"請在 {script_dir} 目錄下創建 .env 文件")
        print()
        print_info("內容範例:")
        print(f"{Colors.CYAN}")
        print("# GCP 配置")
        print("GCP_PROJECT_ID=your-project-id")
        print("GCS_BUCKET_NAME=your-bucket-name")
        print()
        print("# 服務帳號金鑰")
        print("GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account-key.json")
        print()
        print("# API 配置")
        print("PORT=8000")
        print("HOST=0.0.0.0")
        print(f"{Colors.NC}")
        return False, None
    
    print_success(f".env 文件存在: {env_path}")
    return True, env_path

def load_env_config(env_path: Path) -> Dict[str, Optional[str]]:
    """載入 .env 配置"""
    # 載入指定路徑的 .env 文件
    load_dotenv(dotenv_path=env_path)
    
    return {
        'project_id': os.getenv("GCP_PROJECT_ID"),
        'bucket_name': os.getenv("GCS_BUCKET_NAME"),
        'credentials': os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        'port': os.getenv("PORT", "8000"),
        'host': os.getenv("HOST", "0.0.0.0"),
    }

def validate_env_config(config: Dict[str, Optional[str]]) -> Tuple[bool, list]:
    """驗證 .env 配置"""
    print_section("步驟 2: 驗證環境變數")
    
    errors = []
    
    # 檢查必要變數
    required_vars = {
        'project_id': 'GCP_PROJECT_ID',
        'bucket_name': 'GCS_BUCKET_NAME',
        'credentials': 'GOOGLE_APPLICATION_CREDENTIALS'
    }
    
    for key, env_name in required_vars.items():
        value = config.get(key)
        if not value:
            print_error(f"{env_name} 未設置")
            errors.append(f"缺少環境變數: {env_name}")
        else:
            print_success(f"{env_name} = {value}")
    
    # 檢查可選變數
    optional_vars = {
        'port': 'PORT',
        'host': 'HOST'
    }
    
    for key, env_name in optional_vars.items():
        value = config.get(key)
        if value:
            print_info(f"{env_name} = {value}")
    
    return len(errors) == 0, errors

def resolve_credential_path(credential_path: str, script_dir: Path) -> Path:
    """解析認證文件路徑（支持相對路徑和絕對路徑）"""
    cred_path = Path(credential_path)
    
    # 如果是絕對路徑，直接使用
    if cred_path.is_absolute():
        return cred_path
    
    # 如果是相對路徑，相對於腳本目錄
    return (script_dir / cred_path).resolve()

def validate_service_account_key(credential_path: str, script_dir: Path) -> Tuple[bool, Optional[Dict], list]:
    """驗證服務帳號金鑰"""
    print_section("步驟 3: 驗證服務帳號金鑰")
    
    errors = []
    
    # 解析路徑
    key_path = resolve_credential_path(credential_path, script_dir)
    
    print_info(f"金鑰路徑: {key_path}")
    
    # 檢查文件是否存在
    if not key_path.exists():
        print_error(f"金鑰文件不存在")
        errors.append(f"金鑰文件不存在: {key_path}")
        
        print()
        print_info("請確認:")
        print(f"   1. 金鑰文件路徑是否正確: {credential_path}")
        print(f"   2. 解析後的完整路徑: {key_path}")
        print("   3. 金鑰文件是否已下載")
        print()
        print_info("如需創建服務帳號金鑰，請參考:")
        print("   https://cloud.google.com/iam/docs/keys-create-delete")
        
        return False, None, errors
    
    print_success(f"金鑰文件存在")
    
    # 檢查文件權限
    file_stat = key_path.stat()
    file_mode = oct(file_stat.st_mode)[-3:]
    
    if file_mode != '600':
        print_warning(f"文件權限: {file_mode} (建議: 600)")
        print_info(f"建議執行: chmod 600 {key_path}")
    else:
        print_success(f"文件權限: {file_mode}")
    
    # 驗證 JSON 格式
    try:
        with open(key_path, 'r') as f:
            key_data = json.load(f)
        
        print_success("JSON 格式有效")
        
    except json.JSONDecodeError as e:
        print_error(f"JSON 格式錯誤: {e}")
        errors.append(f"金鑰文件格式錯誤: {e}")
        return False, None, errors
    except Exception as e:
        print_error(f"讀取金鑰失敗: {e}")
        errors.append(f"讀取金鑰失敗: {e}")
        return False, None, errors
    
    # 驗證必要欄位
    required_fields = {
        'type': '類型',
        'project_id': '項目 ID',
        'private_key_id': '私鑰 ID',
        'private_key': '私鑰',
        'client_email': '服務帳號郵箱',
        'client_id': '客戶端 ID',
        'auth_uri': '認證 URI',
        'token_uri': 'Token URI',
    }
    
    missing_fields = []
    for field, name in required_fields.items():
        if field not in key_data:
            missing_fields.append(name)
    
    if missing_fields:
        print_error(f"金鑰缺少必要欄位: {', '.join(missing_fields)}")
        errors.append(f"金鑰缺少欄位: {', '.join(missing_fields)}")
        return False, None, errors
    
    print_success("所有必要欄位存在")
    
    # 驗證金鑰類型
    if key_data['type'] != 'service_account':
        print_error(f"金鑰類型錯誤: {key_data['type']} (應為 service_account)")
        errors.append(f"金鑰類型錯誤: {key_data['type']}")
        return False, None, errors
    
    print_success(f"金鑰類型: {key_data['type']}")
    
    # 顯示金鑰信息
    print()
    print_info("金鑰信息:")
    print(f"   服務帳號: {key_data['client_email']}")
    print(f"   項目 ID: {key_data['project_id']}")
    print(f"   私鑰 ID: {key_data['private_key_id'][:20]}...")
    
    return True, key_data, errors

def test_gcp_authentication(credential_path: str, project_id: str, script_dir: Path) -> Tuple[bool, list]:
    """測試 GCP 認證"""
    print_section("步驟 4: 測試 GCP 認證")
    
    errors = []
    
    try:
        from google.cloud import storage
        from google.oauth2 import service_account
        
        # 解析路徑
        key_path = resolve_credential_path(credential_path, script_dir)
        
        print_info("載入服務帳號金鑰...")
        
        credentials = service_account.Credentials.from_service_account_file(
            str(key_path),
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        print_success("認證憑證載入成功")
        
        # 創建 Storage 客戶端
        print_info("創建 Storage 客戶端...")
        
        client = storage.Client(
            credentials=credentials,
            project=project_id
        )
        
        print_success("Storage 客戶端創建成功")
        print(f"   項目 ID: {project_id}")
        
        return True, errors
        
    except ImportError as e:
        print_error("缺少必要的 Python 套件")
        errors.append("缺少 google-cloud-storage")
        
        print()
        print_info("請安裝依賴:")
        print("   pip install google-cloud-storage")
        
        return False, errors
        
    except Exception as e:
        print_error(f"認證失敗: {e}")
        errors.append(f"GCP 認證失敗: {e}")
        
        print()
        print_info("可能的原因:")
        print("   1. 金鑰文件無效或已過期")
        print("   2. 服務帳號已被刪除")
        print("   3. 項目 ID 不正確")
        
        return False, errors

def test_bucket_access(credential_path: str, project_id: str, bucket_name: str, script_dir: Path) -> Tuple[bool, list]:
    """測試 Bucket 訪問"""
    print_section("步驟 5: 測試 Bucket 訪問")
    
    errors = []
    
    try:
        from google.cloud import storage
        from google.oauth2 import service_account
        
        # 解析路徑
        key_path = resolve_credential_path(credential_path, script_dir)
        
        credentials = service_account.Credentials.from_service_account_file(
            str(key_path),
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        client = storage.Client(
            credentials=credentials,
            project=project_id
        )
        
        print_info(f"測試 Bucket: {bucket_name}")
        
        bucket = client.bucket(bucket_name)
        
        # 檢查 Bucket 是否存在
        if not bucket.exists():
            print_error(f"Bucket '{bucket_name}' 不存在")
            errors.append(f"Bucket 不存在: {bucket_name}")
            
            print()
            print_info("請確認:")
            print(f"   1. Bucket 名稱是否正確: {bucket_name}")
            print(f"   2. Bucket 是否在項目 '{project_id}' 中")
            print("   3. 您是否有訪問權限")
            
            return False, errors
        
        print_success(f"Bucket '{bucket_name}' 存在")
        
        # 測試列出文件權限
        try:
            print_info("測試讀取權限...")
            blobs = list(bucket.list_blobs(max_results=5))
            
            print_success(f"讀取權限正常")
            print(f"   文件數量: {len(blobs)}")
            
            if blobs:
                print("   前 5 個文件:")
                for blob in blobs:
                    size_kb = blob.size / 1024 if blob.size else 0
                    print(f"      - {blob.name} ({size_kb:.2f} KB)")
            else:
                print("   (Bucket 為空)")
                
        except Exception as e:
            print_error(f"讀取權限測試失敗: {e}")
            errors.append(f"無讀取權限: {e}")
            
            print()
            print_info("請確認服務帳號是否有以下權限:")
            print("   • roles/storage.objectViewer")
            print("   • roles/storage.objectAdmin")
            
            return False, errors
        
        # 測試寫入權限（可選）
        try:
            print_info("測試寫入權限...")
            
            test_blob = bucket.blob('.test-write-permission')
            test_blob.upload_from_string('test', content_type='text/plain')
            test_blob.delete()
            
            print_success("寫入權限正常")
            
        except Exception as e:
            print_warning(f"寫入權限測試失敗: {e}")
            print_info("服務帳號可能只有讀取權限")
        
        return True, errors
        
    except ImportError:
        print_error("缺少 google-cloud-storage")
        errors.append("缺少必要套件")
        return False, errors
        
    except Exception as e:
        print_error(f"Bucket 訪問測試失敗: {e}")
        errors.append(f"Bucket 訪問失敗: {e}")
        return False, errors

def check_python_dependencies() -> Tuple[bool, list]:
    """檢查 Python 依賴"""
    print_section("步驟 6: 檢查 Python 依賴")
    
    errors = []
    
    required_packages = {
        'google.cloud.storage': 'google-cloud-storage',
        'google.oauth2': 'google-auth',
        'fastapi': 'fastapi',
        'uvicorn': 'uvicorn',
        'dotenv': 'python-dotenv',
    }
    
    missing_packages = []
    
    for module, package in required_packages.items():
        try:
            __import__(module)
            print_success(f"{package} 已安裝")
        except ImportError:
            print_error(f"{package} 未安裝")
            missing_packages.append(package)
    
    if missing_packages:
        errors.append(f"缺少套件: {', '.join(missing_packages)}")
        
        print()
        print_info("請安裝缺少的套件:")
        print(f"   pip install {' '.join(missing_packages)}")
        print()
        print_info("或安裝所有依賴:")
        print("   pip install -r requirements.txt")
        
        return False, errors
    
    return True, errors

def print_summary(all_errors: list):
    """打印總結"""
    print_section("驗證總結")
    
    if not all_errors:
        print_success("所有檢查通過！✨")
        print()
        print_info("您可以啟動後端服務:")
        print(f"{Colors.CYAN}")
        print("   cd backend")
        print("   python -m uvicorn main:app --reload")
        print(f"{Colors.NC}")
        print()
        print_info("API 文檔:")
        print("   http://localhost:8000/docs")
        print()
    else:
        print_error(f"發現 {len(all_errors)} 個問題:")
        print()
        for i, error in enumerate(all_errors, 1):
            print(f"   {i}. {error}")
        print()
        print_info("請修復上述問題後重新運行此腳本")
        print()

def main():
    """主函數"""
    print_header()
    
    all_errors = []
    
    # 獲取腳本目錄
    script_dir = get_script_directory()
    
    # 步驟 1: 檢查 .env 文件
    success, env_path = check_env_file()
    if not success:
        sys.exit(1)
    
    # 載入配置
    config = load_env_config(env_path)
    
    # 步驟 2: 驗證環境變數
    success, errors = validate_env_config(config)
    all_errors.extend(errors)
    
    if not success:
        print_summary(all_errors)
        sys.exit(1)
    
    # 步驟 3: 驗證服務帳號金鑰
    success, key_data, errors = validate_service_account_key(
        config['credentials'],
        script_dir
    )
    all_errors.extend(errors)
    
    if not success:
        print_summary(all_errors)
        sys.exit(1)
    
    # 驗證項目 ID 是否匹配
    if key_data['project_id'] != config['project_id']:
        print()
        print_warning("項目 ID 不匹配:")
        print(f"   .env 中的項目: {config['project_id']}")
        print(f"   金鑰中的項目: {key_data['project_id']}")
        print()
        print_info("建議更新 .env 中的 GCP_PROJECT_ID")
        all_errors.append("項目 ID 不匹配")
    
    # 步驟 4: 測試 GCP 認證
    success, errors = test_gcp_authentication(
        config['credentials'],
        config['project_id'],
        script_dir
    )
    all_errors.extend(errors)
    
    if not success:
        print_summary(all_errors)
        sys.exit(1)
    
    # 步驟 5: 測試 Bucket 訪問
    success, errors = test_bucket_access(
        config['credentials'],
        config['project_id'],
        config['bucket_name'],
        script_dir
    )
    all_errors.extend(errors)
    
    # 步驟 6: 檢查 Python 依賴
    success, errors = check_python_dependencies()
    all_errors.extend(errors)
    
    # 打印總結
    print_summary(all_errors)
    
    # 退出碼
    sys.exit(0 if not all_errors else 1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}⚠️  檢查已取消{Colors.NC}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}❌ 發生錯誤: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
