docker run -d \
  --name cloudstream-studio \
  -p 80:80 \
  -e GCP_PROJECT_ID=<your-project> \
  -e GCS_BUCKET_NAME=<your-bucket> \
  -v $(pwd)/backend/credentials/credentials.json:/app/credentials/credentials.json:ro \
  cloudstream:latest
