# Run and deploy your AI Studio app

A professional video platform to manage, clip, and synthesize videos from your Google Cloud Storage bucket.
## Run on Docker
1. Clone the Project
```bash
git clone https://github.com/samdjk118/CloudStream-Studio.git
```
2. Build the Image
```bash
docker build -t cloudstream-studio:latest .
```
3. Run on Docker
```bash
docker run -d \
  --name cloudstream-studio \
  -p 80:80 \
  -e GCP_PROJECT_ID=<your-project> \
  -e GCS_BUCKET_NAME=<your-bucket> \
  -v <your-serviceaccount-key>:/app/credentials/service-account-key.json:ro \
  cloudstream-studio:latest
```
## Run Locally

**Prerequisites:**  frontend

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

**Prerequisites:** backend

1. [GCP Setting](./backend/doc/GCP_ServiceAccount_setup.md)
2. Setting Virtual ENV
```bash
# 進入後端目錄
cd backend

# 創建虛擬環境
python3.11 -m venv venv

# 啟動虛擬環境
# macOS/Linux
source venv/bin/activate

# Windows
# venv\Scripts\activate

# 驗證 Python 版本
python --version  # 應該顯示 Python 3.11.x
```
3. Install the Packages
```bash
# upgrade pip
pip install --upgrade pip

# Install packages from list
pip install -r requirements.txt

# check the installed
pip list
```
4. Setup the env
copy the example to real env
```
cp .env.example .env
```
edit the variable 
```bash
# GCP 配置
GCP_PROJECT_ID=dh-veo3-ai
GCS_BUCKET_NAME=dh-dreamer-v

# 服務帳號金鑰
GOOGLE_APPLICATION_CREDENTIALS=./credentials/credentials.json

# API 配置
PORT=8000
HOST=0.0.0.0

# 日誌級別
LOG_LEVEL=INFO
```
5. Running setting checkpoint script
```
python3 check_auth.py
```
6. Running service start script
```bash
sh run.sh
```
7. Running API Testing script
```
test_api.sh
```

## Google Cloud Storage CORS 配置

為了讓前端（例如 `localhost:5173` 或 Cloud Run URL）能夠直接從 Google Cloud Storage 播放影片，您需要為您的 GCS Bucket 配置 CORS (Cross-Origin Resource Sharing)。

### 1. 建立 CORS 配置文件
建立一個 `cors.json` 檔案：
```json
[
    {
      "origin": [
        "https://<your-cloud-run-url>",
        "http://localhost:5173",
        "http://localhost:3000"
      ],
      "method": ["GET", "HEAD", "OPTIONS"],
      "responseHeader": ["*"],
      "maxAgeSeconds": 3600
    }
]
```

### 2. 使用 gsutil 套用配置
在終端機執行以下指令套用到您的 Bucket：
```bash
gsutil cors set cors.json gs://<YOUR_BUCKET_NAME>
```

### 3. 驗證配置
您可以使用以下指令查看目前的 CORS 設定：
```bash
gsutil cors get gs://<YOUR_BUCKET_NAME>
```