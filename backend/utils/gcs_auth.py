# backend/utils/auth.py

from google.cloud import storage
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle
import json
import os
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

class GCSAuth:
    SCOPES = ['https://www.googleapis.com/auth/cloud-platform']
    
    def __init__(self, 
                 client_secret_file='credentials/credentials.json', 
                 token_file='tokens/token.pickle',
                 project_id=None,
                 auto_refresh_interval_minutes=30):
        """
        初始化 GCS 認證
        
        Args:
            client_secret_file: OAuth credentials 檔案路徑
            token_file: Token 儲存路徑
            project_id: GCP 專案 ID（可選）
            auto_refresh_interval_minutes: 自動刷新檢查間隔（分鐘）
        """
        self.client_secret_file = client_secret_file
        self.token_file = token_file
        self.project_id = project_id
        self.auto_refresh_interval = auto_refresh_interval_minutes * 60
        self.creds = None
        self._lock = threading.Lock()
        self._refresh_thread = None
        self._stop_refresh = False
        
        # 確保目錄存在
        Path(token_file).parent.mkdir(parents=True, exist_ok=True)
        
        # 檢查 client_secret 檔案
        if not os.path.exists(self.client_secret_file):
            print(f"❌ 錯誤: 找不到 {self.client_secret_file}")
            print(f"請將 OAuth credentials 放到: {self.client_secret_file}")
            sys.exit(1)
        
        print(f"✓ 找到 OAuth credentials: {self.client_secret_file}")
    
    def authenticate(self):
        """執行 OAuth 2.0 認證流程"""
        with self._lock:
            # 嘗試載入現有 token
            if os.path.exists(self.token_file):
                try:
                    print(f"載入現有 token: {self.token_file}")
                    with open(self.token_file, 'rb') as token:
                        self.creds = pickle.load(token)
                    print("✓ Token 載入成功")
                    
                    if self.creds.expiry:
                        time_left = self.creds.expiry - datetime.utcnow()
                        print(f"  到期時間: {self.creds.expiry}")
                        print(f"  剩餘時間: {time_left}")
                except Exception as e:
                    print(f"⚠️  載入 token 失敗: {e}")
                    self.creds = None
            
            # 檢查 token 是否有效
            if not self.creds or not self.creds.valid:
                # 嘗試刷新
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    print("Token 已過期，嘗試刷新...")
                    try:
                        self.creds.refresh(Request())
                        print("✓ Token 刷新成功")
                        self._save_token()
                    except Exception as e:
                        print(f"⚠️  Token 刷新失敗: {e}")
                        self.creds = None
                
                # 如果還是沒有有效 token，執行完整授權流程
                if not self.creds:
                    print("\n" + "="*60)
                    print("需要進行 OAuth 授權")
                    print("="*60)
                    print("瀏覽器將會開啟授權頁面...")
                    print()
                    
                    try:
                        flow = InstalledAppFlow.from_client_secrets_file(
                            self.client_secret_file, 
                            self.SCOPES,
                            redirect_uri='http://localhost:8080/'
                        )
                        
                        self.creds = flow.run_local_server(
                            port=8080,
                            access_type='offline',  # 重要：取得 refresh_token
                            prompt='consent'        # 強制顯示同意畫面
                        )
                        
                        print("\n✓ OAuth 授權成功")
                        
                        if not self.creds.refresh_token:
                            print("⚠️  警告：未取得 refresh_token")
                            print("   Token 過期後可能需要重新授權")
                        else:
                            print("✓ 已取得 refresh_token（可長期使用）")
                        
                        self._save_token()
                        
                    except Exception as e:
                        print(f"\n❌ OAuth 授權失敗: {e}")
                        raise
            
            return self.creds
    
    def _save_token(self):
        """儲存 token 到檔案"""
        try:
            # 儲存 pickle 格式
            with open(self.token_file, 'wb') as token:
                pickle.dump(self.creds, token)
            print(f"✓ Token 已儲存: {self.token_file}")
            
            # 同時儲存 JSON 格式（方便檢查）
            json_file = self.token_file.replace('.pickle', '.json')
            token_info = {
                'token': self.creds.token,
                'refresh_token': self.creds.refresh_token,
                'token_uri': self.creds.token_uri,
                'client_id': self.creds.client_id,
                'client_secret': self.creds.client_secret,
                'scopes': list(self.creds.scopes) if self.creds.scopes else [],
                'expiry': self.creds.expiry.isoformat() if self.creds.expiry else None,
                'saved_at': datetime.utcnow().isoformat()
            }
            
            with open(json_file, 'w') as f:
                json.dump(token_info, f, indent=2)
            print(f"✓ Token 資訊已儲存: {json_file}")
            
        except Exception as e:
            print(f"⚠️  儲存 token 失敗: {e}")
    
    def get_storage_client(self):
        """取得已授權的 Storage 客戶端"""
        if not self.creds:
            self.authenticate()
        
        if self.project_id:
            return storage.Client(credentials=self.creds, project=self.project_id)
        return storage.Client(credentials=self.creds)
    
    def start_auto_refresh(self):
        """啟動自動刷新背景執行緒"""
        if self._refresh_thread and self._refresh_thread.is_alive():
            print("⚠️  自動刷新已在執行中")
            return
        
        def refresh_loop():
            interval_minutes = self.auto_refresh_interval // 60
            print(f"✓ Token 自動刷新已啟動（每 {interval_minutes} 分鐘檢查一次）")
            
            while not self._stop_refresh:
                time.sleep(self.auto_refresh_interval)
                
                if self._stop_refresh:
                    break
                
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                print(f"\n[{timestamp}] 執行定期 token 檢查...")
                
                try:
                    with self._lock:
                        if not self.creds:
                            print("  ⚠️  無 token，跳過檢查")
                            continue
                        
                        # 檢查是否快要過期（提前 10 分鐘刷新）
                        if self.creds.expiry:
                            time_until_expiry = self.creds.expiry - datetime.utcnow()
                            print(f"  Token 剩餘時間: {time_until_expiry}")
                            
                            if time_until_expiry < timedelta(minutes=10):
                                print("  ⚠️  Token 即將過期，正在刷新...")
                                
                                if self.creds.refresh_token:
                                    try:
                                        self.creds.refresh(Request())
                                        self._save_token()
                                        print("  ✓ Token 刷新成功")
                                        
                                        if self.creds.expiry:
                                            new_time_left = self.creds.expiry - datetime.utcnow()
                                            print(f"  新的剩餘時間: {new_time_left}")
                                    except Exception as e:
                                        print(f"  ✗ Token 刷新失敗: {e}")
                                else:
                                    print("  ✗ 無 refresh_token，無法自動刷新")
                            else:
                                print("  ✓ Token 仍然有效")
                        else:
                            print("  ⚠️  無法確定 token 到期時間")
                            
                except Exception as e:
                    print(f"  ✗ 檢查失敗: {e}")
        
        self._stop_refresh = False
        self._refresh_thread = threading.Thread(target=refresh_loop, daemon=True)
        self._refresh_thread.start()
    
    def stop_auto_refresh(self):
        """停止自動刷新"""
        self._stop_refresh = True
        if self._refresh_thread:
            self._refresh_thread.join(timeout=5)
        print("✓ Token 自動刷新已停止")
    
    def force_refresh(self):
        """強制刷新 token"""
        print("強制刷新 token...")
        
        with self._lock:
            if not self.creds:
                print("❌ 無 token 可刷新")
                return False
            
            if not self.creds.refresh_token:
                print("❌ 無 refresh_token，無法刷新")
                return False
            
            try:
                self.creds.refresh(Request())
                self._save_token()
                print("✓ Token 刷新成功")
                return True
            except Exception as e:
                print(f"✗ Token 刷新失敗: {e}")
                return False
    
    def get_token_info(self):
        """取得 token 資訊"""
        if not self.creds:
            return None
        
        info = {
            'valid': self.creds.valid,
            'expired': self.creds.expired,
            'has_refresh_token': bool(self.creds.refresh_token),
            'expiry': self.creds.expiry.isoformat() if self.creds.expiry else None,
        }
        
        if self.creds.expiry:
            time_left = self.creds.expiry - datetime.utcnow()
            info['time_until_expiry'] = str(time_left)
            info['expiry_timestamp'] = self.creds.expiry.timestamp()
        
        return info


# 全域實例
_gcs_auth = None

def get_gcs_auth(
    client_secret_file='credentials/credentials.json',
    token_file='tokens/token.pickle',
    project_id=None,
    auto_refresh_interval_minutes=30
):
    """取得 GCSAuth 實例（單例模式）"""
    global _gcs_auth
    
    if _gcs_auth is None:
        _gcs_auth = GCSAuth(
            client_secret_file=client_secret_file,
            token_file=token_file,
            project_id=project_id,
            auto_refresh_interval_minutes=auto_refresh_interval_minutes
        )
    
    return _gcs_auth
