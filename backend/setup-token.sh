#!/bin/bash
# setup-token.sh - Token 設定助手

set -e

echo "=========================================="
echo "Google Cloud Storage Token 設定"
echo "=========================================="
echo

# 建立必要目錄


# 檢查 credentials
CRED_FILE="client_secret.json"

if [ ! -f "$CRED_FILE" ]; then
    echo "❌ 找不到 $CRED_FILE"
    echo
    echo "請執行以下步驟："
    echo "=========================================="
    echo "1. 前往 Google Cloud Console:"
    echo "   https://console.cloud.google.com"
    echo
    echo "2. 選擇您的專案"
    echo
    echo "3. 前往 APIs & Services > Credentials"
    echo "   https://console.cloud.google.com/apis/credentials"
    echo
    echo "4. 點擊 'Create Credentials' > 'OAuth 2.0 Client ID'"
    echo
    echo "5. Application type 選擇 'Desktop app'"
    echo "   名稱可以填: CloudStream Manager"
    echo
    echo "6. 點擊 'Create'"
    echo
    echo "7. 下載 JSON 檔案"
    echo "   (檔名通常是 client_secret_xxxxx.json)"
    echo
    echo "8. 將檔案移動並重新命名："
    echo "   mv ~/Downloads/client_secret_*.json $CRED_FILE"
    echo
    echo "=========================================="
    echo
    exit 1
fi

echo "✓ 找到 credentials.json"

# 顯示檔案資訊
echo "檔案位置: $CRED_FILE"
echo "檔案大小: $(du -h $CRED_FILE | cut -f1)"
echo

# 檢查 JSON 格式
if ! python3 -c "import json; json.load(open('$CRED_FILE'))" 2>/dev/null; then
    echo "❌ credentials.json 格式錯誤"
    echo "請確認檔案是有效的 JSON 格式"
    exit 1
fi

echo "✓ JSON 格式正確"

# 檢查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 找不到 Python 3"
    echo "請先安裝 Python 3: https://www.python.org/downloads/"
    exit 1
fi

echo "✓ 找到 Python 3: $(python3 --version)"

# 檢查並安裝依賴
echo
echo "檢查 Python 套件..."

REQUIRED_PACKAGES=(
    "google-auth"
    "google-auth-oauthlib"
    "google-auth-httplib2"
    "google-cloud-storage"
)

MISSING_PACKAGES=()

for package in "${REQUIRED_PACKAGES[@]}"; do
    package_import="${package//-/_}"
    if python3 -c "import ${package_import}" 2>/dev/null; then
        echo "✓ $package 已安裝"
    else
        echo "⚠️  $package 未安裝"
        MISSING_PACKAGES+=("$package")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo
    echo "安裝缺少的套件..."
    pip3 install "${MISSING_PACKAGES[@]}"
    echo "✓ 套件安裝完成"
fi

# 執行授權
echo
echo "=========================================="
echo "開始 OAuth 授權流程"
echo "=========================================="
echo
echo "瀏覽器將會開啟授權頁面"
echo "請完成以下步驟："
echo "1. 選擇您的 Google 帳號"
echo "2. 點擊 '允許' 授予以下權限："
echo "   - 查看和管理 Google Cloud Storage"
echo "3. 等待授權完成"
echo "4. 看到 'The authentication flow has completed' 後"
echo "   可以關閉瀏覽器視窗"
echo
read -p "按 Enter 繼續..."

cd backend

# 建立授權腳本
cat > ./authorize_gcs.py << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
import pickle
import json
import sys
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from datetime import datetime

SCOPES = ['https://www.googleapis.com/auth/cloud-platform']

def authorize():
    print("\n正在啟動 OAuth 流程...")
    print("="*60)
    
    # 檢查 credentials 檔案
    cred_file = Path('client_secret.json')
    if not cred_file.exists():
        print(f"❌ 找不到: {cred_file}")
        return False
    
    print(f"✓ 使用 credentials: {cred_file}")
    
    try:
        # 讀取並顯示 client 資訊
        with open(cred_file, 'r') as f:
            cred_data = json.load(f)
            
        # 支援兩種格式
        if 'installed' in cred_data:
            client_config = cred_data['installed']
        elif 'web' in cred_data:
            client_config = cred_data['web']
        else:
            print("❌ credentials.json 格式不正確")
            print("應該包含 'installed' 或 'web' 欄位")
            return False
        
        print(f"✓ Client ID: {client_config.get('client_id', 'N/A')[:20]}...")
        print()
        
        # 建立 OAuth flow
        flow = InstalledAppFlow.from_client_secrets_file(
            str(cred_file),
            SCOPES,
            redirect_uri='http://localhost:8080/'
        )
        
        print("正在啟動本地伺服器（port 8080）...")
        print()
        print("如果瀏覽器沒有自動開啟，請複製以下 URL 並手動訪問：")
        print()
        
        # 執行授權流程
        creds = flow.run_local_server(
            port=8080,
            access_type='offline',  # 重要：取得 refresh_token
            prompt='consent',       # 強制顯示同意畫面
            success_message='授權成功！您現在可以關閉此視窗。',
            open_browser=True
        )
        
        print("\n" + "="*60)
        print("✓ 授權成功！")
        print("="*60)
        
        # 建立 tokens 目錄
        Path('tokens').mkdir(exist_ok=True)
        
        # 儲存 token (pickle 格式)
        token_pickle = Path('tokens/token.pickle')
        with open(token_pickle, 'wb') as token:
            pickle.dump(creds, token)
        
        print(f"\n✓ Token 已儲存（pickle 格式）")
        print(f"  位置: {token_pickle}")
        
        # 同時儲存 JSON 格式（方便檢查）
        token_json = Path('tokens/token.json')
        token_info = {
            'token': creds.token,
            'refresh_token': creds.refresh_token,
            'token_uri': creds.token_uri,
            'client_id': creds.client_id,
            'client_secret': creds.client_secret,
            'scopes': list(creds.scopes) if creds.scopes else [],
            'expiry': creds.expiry.isoformat() if creds.expiry else None
        }
        
        with open(token_json, 'w') as f:
            json.dump(token_info, f, indent=2)
        
        print(f"✓ Token 資訊已儲存（JSON 格式）")
        print(f"  位置: {token_json}")
        
        # 顯示 token 資訊
        print("\nToken 詳細資訊：")
        print("-"*60)
        
        if creds.refresh_token:
            print("✓ 有 refresh_token: 是")
            print("  此 token 可以長期使用（會自動刷新）")
        else:
            print("⚠️  有 refresh_token: 否")
            print("  警告：沒有 refresh_token，可能需要重新授權")
        
        if creds.expiry:
            print(f"✓ 到期時間: {creds.expiry}")
            time_left = creds.expiry - datetime.utcnow()
            hours = int(time_left.total_seconds() / 3600)
            print(f"  剩餘時間: 約 {hours} 小時")
        else:
            print("⚠️  無法確定到期時間")
        
        print("-"*60)
        print("\n" + "="*60)
        
        return True
        
    except FileNotFoundError as e:
        print(f"\n❌ 檔案錯誤: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"\n❌ JSON 解析錯誤: {e}")
        print("請檢查 credentials.json 是否為有效的 JSON 格式")
        return False
    except Exception as e:
        print(f"\n❌ 授權失敗: {e}")
        print(f"錯誤類型: {type(e).__name__}")
        
        # 提供詳細的錯誤資訊
        import traceback
        print("\n詳細錯誤：")
        traceback.print_exc()
        
        return False

if __name__ == '__main__':
    success = authorize()
    sys.exit(0 if success else 1)
PYTHON_SCRIPT

# 執行授權腳本
python3 /tmp/authorize_gcs.py
AUTH_RESULT=$?

# 清理臨時檔案
rm -f /tmp/authorize_gcs.py

cd ..

echo

if [ $AUTH_RESULT -eq 0 ]; then
    echo "=========================================="
    echo "✓ Token 設定完成！"
    echo "=========================================="
    echo
    echo "Token 檔案已建立："
    echo "  📁 backend/tokens/token.pickle"
    echo "  📁 backend/tokens/token.json"
    echo
    echo "檔案大小："
    ls -lh backend/tokens/
    echo
    echo "下一步："
    echo "=========================================="
    echo "1. 確認 .env 檔案已設定 GCS_BUCKET_NAME"
    echo
    if [ ! -f .env ]; then
        echo "   建立 .env 檔案："
        echo "   cp .env.example .env"
        echo "   nano .env  # 編輯填入 bucket 名稱"
        echo
    fi
    echo "2. 建置並啟動 Docker："
    echo "   make build"
    echo "   make up"
    echo
    echo "3. 訪問應用："
    echo "   http://localhost"
    echo "=========================================="
    echo
else
    echo "=========================================="
    echo "✗ Token 設定失敗"
    echo "=========================================="
    echo
    echo "常見問題排查："
    echo "=========================================="
    echo
    echo "1. credentials.json 格式錯誤"
    echo "   解決：重新從 Google Cloud Console 下載"
    echo
    echo "2. Port 8080 被佔用"
    echo "   解決：關閉佔用 8080 的程式"
    echo "   檢查：lsof -i :8080"
    echo
    echo "3. 網路連線問題"
    echo "   解決：檢查網路連線和防火牆設定"
    echo
    echo "4. 瀏覽器未開啟"
    echo "   解決：手動複製 URL 到瀏覽器"
    echo
    echo "5. OAuth 應用程式設定問題"
    echo "   解決：確認 OAuth Client 類型為 'Desktop app'"
    echo
    echo "=========================================="
    echo
    exit 1
fi
