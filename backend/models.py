from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal
from datetime import datetime


class ClipInfo(BaseModel):
    """片段信息（用於合併）"""
    source_video: str = Field(..., description="源影片路徑")
    start_time: float = Field(..., ge=0, description="開始時間（秒，支持3位小數）")
    end_time: float = Field(..., gt=0, description="結束時間（秒，支持3位小數）")
    
    @field_validator('start_time', 'end_time')
    @classmethod
    def validate_time_precision(cls, v):
        """保留 3 位小數精度"""
        if isinstance(v, (int, float)):
            return round(float(v), 3)
        return float(v)
    
    @model_validator(mode='after')
    def validate_time_range(self):
        """驗證時間範圍"""
        if self.end_time <= self.start_time:
            raise ValueError(
                f'end_time ({self.end_time}) must be greater than start_time ({self.start_time})'
            )
        
        # 確保最小時長為 1 毫秒
        min_duration = 0.001
        if (self.end_time - self.start_time) < min_duration:
            raise ValueError(
                f'Clip duration must be at least {min_duration}s (1ms)'
            )
        
        return self


class MergeRequest(BaseModel):
    """合併請求"""
    clips: List[ClipInfo] = Field(..., min_length=1, description="要合併的片段列表")
    output_name: str = Field(..., description="輸出檔名")
    
    class Config:
        json_schema_extra = {
            "example": {
                "clips": [
                    {
                        "source_video": "videos/video1.mp4",
                        "start_time": 0.500,    # 500毫秒
                        "end_time": 10.250      # 10秒250毫秒
                    },
                    {
                        "source_video": "videos/video2.mp4",
                        "start_time": 5.123,
                        "end_time": 15.789
                    }
                ],
                "output_name": "merged_video.mp4"
            }
        }


# ==================== HLS 相關模型 ====================
class HLSConversionRequest(BaseModel):
    video_path: str = Field(..., description="要轉換的影片路徑")
    variants: Optional[List[str]] = Field(
        default=["720p", "480p", "360p"],
        description="要生成的畫質變體"
    )


# ==================== 任務狀態模型 ====================
class TaskStatus(BaseModel):
    task_id: str
    status: Literal["pending", "processing", "completed", "failed", "cancelled"]
    progress: float = Field(ge=0, le=1, description="進度 0-1")
    message: Optional[str] = None
    output_url: Optional[str] = None
    output_path: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    metadata: Optional[dict] = Field(default=None, description="額外的元數據")  # ✅ 添加 metadata
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "processing",
                "progress": 0.65,
                "message": "Processing video...",
                "created_at": "2024-01-01T12:00:00",
                "updated_at": "2024-01-01T12:05:30",
                "metadata": {
                    "start_time": 1.234,
                    "end_time": 5.678,
                    "expected_duration": 4.444
                }
            }
        }


class TaskResponse(BaseModel):
    task_id: str
    message: str
    status_url: str

# ==================== 影片管理相關模型 ====================

class VideoMetadata(BaseModel):
    """影片元數據"""
    id: str = Field(..., description="影片 ID")
    original_name: str = Field(..., description="原始檔名")
    display_name: str = Field(..., description="顯示名稱（可修改）")
    gcs_path: str = Field(..., description="GCS 路徑")
    size: int = Field(..., description="檔案大小（bytes）")
    duration: Optional[float] = Field(None, description="影片時長（秒）")
    width: Optional[int] = Field(None, description="影片寬度")
    height: Optional[int] = Field(None, description="影片高度")
    codec: Optional[str] = Field(None, description="編碼格式")
    fps: Optional[float] = Field(None, description="幀率")
    upload_time: datetime = Field(..., description="上傳時間")
    thumbnail_url: Optional[str] = Field(None, description="縮圖 URL")
    stream_url: str = Field(..., description="串流 URL")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "original_name": "sample_video.mp4",
                "display_name": "我的精彩影片",
                "gcs_path": "videos/uuid/video.mp4/timestamp/sample_video.mp4",
                "size": 21413888,
                "duration": 8.0,
                "width": 1920,
                "height": 1080,
                "codec": "h264",
                "fps": 24.0,
                "upload_time": "2024-01-01T12:00:00",
                "thumbnail_url": "https://storage.googleapis.com/.../thumbnail.jpg",
                "stream_url": "/api/stream/videos/..."
            }
        }


class RenameVideoRequest(BaseModel):
    """重新命名請求"""
    gcs_path: str = Field(..., description="GCS 路徑")
    new_name: str = Field(..., min_length=1, max_length=255, description="新檔名")
    
    @field_validator('new_name')
    @classmethod
    def validate_name(cls, v):
        """驗證檔名"""
        v = v.strip()
        if not v:
            raise ValueError("檔名不能為空")
        
        # 移除不安全字元
        invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
        for char in invalid_chars:
            if char in v:
                raise ValueError(f"檔名不能包含字元: {char}")
        
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "gcs_path": "videos/uuid/video.mp4/timestamp/sample.mp4",
                "new_name": "我的新影片名稱"
            }
        }


class SearchVideosRequest(BaseModel):
    """搜尋請求"""
    query: str = Field(..., min_length=1, description="搜尋關鍵字")
    limit: Optional[int] = Field(100, ge=1, le=1000, description="最大結果數")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "精彩",
                "limit": 50
            }
        }


class SearchVideosResponse(BaseModel):
    """搜尋結果"""
    videos: List[VideoMetadata]
    total: int = Field(..., description="結果總數")
    query: str = Field(..., description="搜尋關鍵字")


class ClipWithNameRequest(BaseModel):
    """剪輯請求（帶自訂檔名）"""
    source_video: str = Field(..., description="源影片 GCS 路徑")
    start_time: float = Field(..., ge=0, description="開始時間（秒）")
    end_time: float = Field(..., gt=0, description="結束時間（秒）")
    output_name: str = Field(..., min_length=1, max_length=255, description="輸出檔名")
    
    @field_validator('start_time', 'end_time')
    @classmethod
    def validate_time_precision(cls, v):
        """保留 3 位小數精度"""
        return round(float(v), 3)
    
    @field_validator('output_name')
    @classmethod
    def validate_output_name(cls, v):
        """驗證輸出檔名"""
        v = v.strip()
        if not v:
            raise ValueError("輸出檔名不能為空")
        
        # 自動添加 .mp4 副檔名（如果沒有）
        if not v.lower().endswith('.mp4'):
            v = f"{v}.mp4"
        
        return v
    
    @model_validator(mode='after')
    def validate_time_range(self):
        """驗證時間範圍"""
        if self.end_time <= self.start_time:
            raise ValueError("結束時間必須大於開始時間")
        
        if (self.end_time - self.start_time) < 0.001:
            raise ValueError("剪輯時長至少為 1 毫秒")
        
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "source_video": "videos/uuid/video.mp4/timestamp/sample.mp4",
                "start_time": 1.500,
                "end_time": 10.250,
                "output_name": "精彩片段"
            }
        }