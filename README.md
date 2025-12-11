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