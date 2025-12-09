#!/usr/bin/env python3
"""
CloudStream Studio - Backend Setup Script
簡化版設置腳本：檢查工具、GCP 認證、設置項目
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
from typing import Tuple, Optional
from dotenv import load_dotenv

# 顏色代碼
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color

def print_header():
    """打印標題"""
    print(f"{Colors.BLUE}")
    print("""
   ____ _                 _ ____  _                            
  / ___| | ___  _   _  __| / ___|| |_ _   _ ___  ___  ___     
 | |   | |/ _ \| | | |/ _` \___ \| __| | | / __|/ _ \/ _ \    
 | |___| | (_) | |_| | (_| |___) | |_| |_| \__ \  __/ (_) |   
  \____|_|\___/ \__,_|\__,_|____/ \__|\__,_|___/\___|\___/    
                                                                
  CloudStream Studio - Backend Setup
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

def run_command(command: str, capture_output: bool = True) -> Tuple[bool, str]:
    """
    執行命令
    
    Args:
        command: 要執行的命令
        capture_output: 是否捕獲輸出
    
    Returns:
        (成功, 輸出)
    """
    try:
        if capture_output:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0, result.stdout.strip()
        else:
            result = subprocess.run(command, shell=True)
            return result.returncode == 0, ""
    except subprocess.TimeoutExpired:
        return False, "Command timeout"
    except Exception as e:
        return False, str(e)

def check_command_exists(command: str) -> bool:
    """檢查命令是否存在"""
    return shutil.which(command) is not None

def step1_check_tools() -> bool:
    """步驟 1: 檢查必要工具"""
    print_section("步驟 1: 檢查必要工具")
    
    all_ok = True
    
    # 檢查 Python
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    print_success(f"Python 已安裝: Python {python_version}")
    
    # 檢查 pip
    if check_command_exists("pip3") or check_command_exists("pip"):
        print_success("pip 已安裝")
    else:
        print_error("pip 未安裝")
        all_ok = False
    
    # 檢查 gcloud
    if check_command_exists("gcloud"):
        success, version = run_command("gcloud version --format='value(version)'")
        if success:
            print_success(f"gcloud CLI 已安裝: {version}")
        else:
            print_success("gcloud CLI 已安裝")
    else:
        print_error("gcloud CLI 未安裝")
        print_info("安裝方法:")
        print("   macOS:   brew install google-cloud-sdk")
        print("   Linux:   curl https://sdk.cloud.google.com | bash")
        print("   Windows: https://cloud.google.com/sdk/docs/install")
        all_ok = False
    
    return all_ok

def step2_check_authentication() -> Tuple[bool, Optional[str]]:
    """步驟 2: 檢查 GCP 認證"""
    print_section("步驟 2: Google Cloud Platform 認證")
    
    # 檢查是否已登入
    success, account = run_command(
        "gcloud auth list --filter=status:ACTIVE --format='value(account)'"
    )
    
    if success and account:
        print_success(f"當前帳號: {account}")
        return True, account
    else:
        print_warning("未檢測到活動的 GCP 帳號")
        print_info("需要登入 GCP")
        
        response = input("\n是否現在登入? (Y/n): ").strip().lower()
        if response in ['', 'y', 'yes']:
            print_info("正在打開瀏覽器進行登入...")
            success, _ = run_command("gcloud auth login", capture_output=False)
            
            if success:
                success, account = run_command(
                    "gcloud auth list --filter=status:ACTIVE --format='value(account)'"
                )
                if success and account:
                    print_success(f"登入成功: {account}")
                    return True, account
        
        print_error("未登入 GCP")
        return False, None

def step3_check_project() -> Tuple[bool, Optional[str]]:
    """步驟 3: 檢查並設置 GCP 項目"""
    print_section("步驟 3: 設置 GCP 項目")
    
    # 檢查當前項目
    success, project_id = run_command("gcloud config get-value project")
    
    if success and project_id and project_id != "(unset)":
        print_success(f"當前項目: {project_id}")
        return True, project_id
    else:
        print_warning("未設置默認項目")
        
        # 列出可用項目
        print_info("獲取可用項目列表...")
        success, projects = run_command(
            "gcloud projects list --format='value(projectId)'"
        )
        
        if success and projects:
            project_list = projects.split('\n')
            print_info(f"找到 {len(project_list)} 個項目:")
            for i, proj in enumerate(project_list[:10], 1):
                print(f"   {i}. {proj}")
            
            if len(project_list) > 10:
                print(f"   ... 還有 {len(project_list) - 10} 個項目")
        
        # 輸入項目 ID
        project_id = input("\n請輸入項目 ID: ").strip()
        
        if not project_id:
            print_error("項目 ID 不能為空")
            return False, None
        
        # 設置項目
        success, _ = run_command(f"gcloud config set project {project_id}")
        
        if success:
            print_success(f"項目設置成功: {project_id}")
            return True, project_id
        else:
            print_error("項目設置失敗")
            return False, None

def step4_setup_adc(project_id: str) -> bool:
    """步驟 4: 設置 Application Default Credentials"""
    print_section("步驟 4: 設置 Application Default Credentials")
    
    # 檢查 ADC 文件是否存在
    adc_path = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
    
    if sys.platform == "win32":
        adc_path = Path(os.getenv("APPDATA")) / "gcloud" / "application_default_credentials.json"
    
    if adc_path.exists():
        print_success(f"ADC 已存在: {adc_path}")
        
        response = input("\n是否重新設置 ADC? (y/N): ").strip().lower()
        if response not in ['y', 'yes']:
            print_info("跳過 ADC 設置")
            return True
    
    print_info("正在設置 Application Default Credentials...")
    print_info("這將打開瀏覽器進行授權")
    
    input("\n按 Enter 繼續...")
    
    success, _ = run_command("gcloud auth application-default login", capture_output=False)
    
    if success and adc_path.exists():
        print_success("ADC 設置成功")
        return True
    else:
        print_error("ADC 設置失敗")
        return False

def test_gcp_connection(project_id: str, bucket_name: str):
    """測試 GCP 連接"""
    print_section("測試 GCP 連接")
    
    try:
        from google.cloud import storage
        from google.auth import default
        
        # 測試認證
        print_info("測試認證...")
        try:
            credentials, detected_project = default()
            print_success(f"認證成功")
            print(f"   認證類型: {type(credentials).__name__}")
            print(f"   項目: {detected_project or project_id}")
        except Exception as e:
            print_error(f"認證失敗: {e}")
            return False
        
        # 測試 Storage 訪問
        print_info(f"測試 Bucket 訪問: {bucket_name}")
        try:
            client = storage.Client(project=project_id)
            bucket = client.bucket(bucket_name)
            
            if bucket.exists():
                print_success(f"Bucket '{bucket_name}' 可訪問")
                
                # 列出文件
                blobs = list(bucket.list_blobs(max_results=5))
                print(f"   文件數量: {len(blobs)}")
                
                if blobs:
                    print("   前 5 個文件:")
                    for blob in blobs:
                        size_kb = blob.size / 1024 if blob.size else 0
                        print(f"      - {blob.name} ({size_kb:.2f} KB)")
                else:
                    print("   (Bucket 為空)")
                
                return True
            else:
                print_warning(f"Bucket '{bucket_name}' 不存在")
                print_info("請確認:")
                print(f"   1. Bucket 名稱是否正確")
                print(f"   2. Bucket 是否在項目 '{project_id}' 中")
                print(f"   3. 您是否有訪問權限")
                return False
                
        except Exception as e:
            print_error(f"Bucket 訪問失敗: {e}")
            return False
            
    except ImportError:
        print_error("google-cloud-storage 未安裝")
        print_info("請運行: pip install -r requirements.txt")
        return False

def load_env_config() -> Tuple[Optional[str], Optional[str]]:
    """從 .env 文件載入配置"""
    env_path = Path(".env")
    
    if not env_path.exists():
        return None, None
    
    load_dotenv()
    
    project_id = os.getenv("GCP_PROJECT_ID")
    bucket_name = os.getenv("GCS_BUCKET_NAME")
    
    return project_id, bucket_name

def save_env_config(project_id: str, bucket_name: str):
    """保存配置到 .env 文件"""
    env_content = f"""# GCP 配置
GCP_PROJECT_ID={project_id}
GCS_BUCKET_NAME={bucket_name}

# API 配置
PORT=8000
HOST=0.0.0.0

# 日誌級別
LOG_LEVEL=INFO

# 生成時間: {subprocess.check_output(['date'], text=True).strip()}
"""
    
    with open(".env", "w") as f:
        f.write(env_content)
    
    print_success(".env 文件已更新")

def main():
    """主函數"""
    print_header()
    
    # 載入現有配置
    env_project_id, env_bucket_name = load_env_config()
    
    if env_project_id and env_bucket_name:
        print_info("檢測到現有配置:")
        print(f"   項目 ID: {env_project_id}")
        print(f"   Bucket: {env_bucket_name}")
        print()
    
    # 步驟 1: 檢查工具
    if not step1_check_tools():
        print_error("\n必要工具檢查失敗，請安裝缺失的工具後重試")
        sys.exit(1)
    
    # 步驟 2: 檢查認證
    auth_ok, account = step2_check_authentication()
    if not auth_ok:
        print_error("\nGCP 認證失敗")
        sys.exit(1)
    
    # 步驟 3: 檢查項目
    project_ok, project_id = step3_check_project()
    if not project_ok:
        print_error("\nGCP 項目設置失敗")
        sys.exit(1)
    
    # 步驟 4: 設置 ADC
    if not step4_setup_adc(project_id):
        print_error("\nADC 設置失敗")
        sys.exit(1)
    
    # 使用 .env 中的配置或當前項目
    final_project_id = env_project_id or project_id
    final_bucket_name = env_bucket_name or "cloudstream-studio"
    
    # 如果配置有變化，更新 .env
    if final_project_id != env_project_id or final_bucket_name != env_bucket_name:
        if env_bucket_name is None:
            # 第一次設置，詢問 bucket 名稱
            print()
            bucket_input = input(f"請輸入 Bucket 名稱 (按 Enter 使用 '{final_bucket_name}'): ").strip()
            if bucket_input:
                final_bucket_name = bucket_input
        
        save_env_config(final_project_id, final_bucket_name)
    
    # 測試連接
    test_gcp_connection(final_project_id, final_bucket_name)
    
    # 完成
    print_section("設置完成")
    print_success("所有設置步驟已完成！")
    print()
    print_info("配置摘要:")
    print(f"   • GCP 帳號: {account}")
    print(f"   • 項目 ID: {final_project_id}")
    print(f"   • Bucket: {final_bucket_name}")
    print(f"   • 配置文件: .env")
    print()
    print_info("下一步:")
    print("   1. 安裝依賴: pip install -r requirements.txt")
    print("   2. 啟動後端: uvicorn main:app --reload")
    print("   3. API 文檔: http://localhost:8000/docs")
    print()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}⚠️  設置已取消{Colors.NC}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}❌ 發生錯誤: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
