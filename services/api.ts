// src/services/api.ts

// API_BASE
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

console.log('🔧 API Base URL:', API_BASE);

// ==================== 類型定義 ====================

export interface GCSFile {
  name: string;
  size: number;
  content_type: string;
  created: string | null;
  updated: string | null;
  url: string;
  public_url: string | null;
}

export interface FilesResponse {
  success: boolean;
  files: GCSFile[];
  count: number;
  total_files?: number;
}

// 縮圖選項
export interface ThumbnailOptions {
  width?: number;
  height?: number;
  time_offset?: number;  // 改為 time_offset 匹配後端
  force_regenerate?: boolean;
}

// ==================== 文件管理 API ====================

/**
 * 獲取文件列表
 */
export const fetchFiles = async (): Promise<GCSFile[]> => {
  try {
    const res = await fetch(`${API_BASE}/api/files`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data: FilesResponse = await res.json();
    console.log('📋 API Response:', data);
    
    // 後端返回 { success, files, count }
    return data.files || [];
  } catch (error) {
    console.error("❌ API Error fetching files:", error);
    return [];
  }
};

/**
 * 上傳文件
 */
export const uploadFile = async (file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${text}`);
  }
};

/**
 * 刪除文件
 */
export const deleteFile = async (filename: string): Promise<void> => {
  const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${API_BASE}/api/files/${encodedPath}`, {
    method: 'DELETE',
  });
  
  if (!res.ok) {
    throw new Error('Delete failed');
  }
};

// ==================== 影片流 API ====================

/**
 * 獲取影片流 URL
 */
export const getStreamUrl = (filename: string): string => {
  const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
  return `${API_BASE}/api/stream/${encodedPath}`;
};

// ==================== 縮圖 API ====================

/**
 * 獲取影片縮圖 URL（正確的後端端點）
 */
export const getThumbnailUrl = (
  filename: string,
  options: ThumbnailOptions = {}
): string => {
  const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
  const params = new URLSearchParams();
  
  if (options.width) params.append('width', options.width.toString());
  if (options.height) params.append('height', options.height.toString());
  if (options.time_offset !== undefined) params.append('time_offset', options.time_offset.toString());
  if (options.force_regenerate) params.append('force_regenerate', 'true');
  
  const queryString = params.toString();
  // 修正：使用正確的後端端點
  return `${API_BASE}/api/thumbnails/video/${encodedPath}${queryString ? '?' + queryString : ''}`;
};

/**
 * 獲取縮圖（返回 Blob URL）
 */
export const fetchThumbnail = async (
  filename: string,
  options: ThumbnailOptions = {}
): Promise<string> => {
  try {
    const url = getThumbnailUrl(filename, options);
    console.log('📸 請求縮圖:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch thumbnail: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // 記錄來源
    const cached = response.headers.get('X-Thumbnail-Cached');
    console.log(`✓ 縮圖載入 (${filename}): ${cached === 'true' ? '快取' : '新生成'}`);
    
    return blobUrl;
  } catch (error) {
    console.error('❌ 取得縮圖失敗:', error);
    throw error;
  }
};

/**
 * 刪除縮圖快取
 */
export const deleteThumbnail = async (
  filename: string,
  width?: number,
  height?: number,
  time_offset?: number
): Promise<void> => {
  const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
  const params = new URLSearchParams();
  
  if (width) params.append('width', width.toString());
  if (height) params.append('height', height.toString());
  if (time_offset !== undefined) params.append('time_offset', time_offset.toString());
  
  const queryString = params.toString();
  const url = `${API_BASE}/api/thumbnails/video/${encodedPath}${queryString ? '?' + queryString : ''}`;
  
  const response = await fetch(url, { method: 'DELETE' });
  
  if (!response.ok) {
    throw new Error('Failed to delete thumbnail');
  }
};

// ==================== 健康檢查 ====================

export interface HealthResponse {
  status: string;
  authentication: {
    authenticated: boolean;
    project: string | null;
  };
  bucket: {
    name: string;
    accessible: boolean;
  };
}

export const healthCheck = async (): Promise<HealthResponse> => {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return response.json();
};

// ==================== 任務狀態類型 ====================

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;  // 0.0 - 1.0
  message: string;
  output_url?: string;
  output_path?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    // 剪輯任務
    clip_duration?: number;
    expected_duration?: number;
    duration_error_ms?: number;
    duration_error_percent?: number;
    precision_level?: string;
    thumbnail_url?: string;
    
    // 合併任務
    total_clips?: number;
    merged_duration?: number;
    clip_durations?: number[];
    
    // 通用
    file_size?: number;
    video_info?: {
      width: number;
      height: number;
      codec: string;
      fps: number;
    };
  };
}

// ==================== 影片剪輯 ====================

export interface ClipRequest {
  source_video: string;
  start_time: number;  // 3位小數
  end_time: number;    // 3位小數
  output_name: string;
}

export interface MergeRequest {
  clips: Array<{
    source_video: string;
    start_time: number;
    end_time: number;
  }>;
  output_name: string;
}

export interface TaskResponse {
  task_id: string;
  message: string;
  status_url: string;
}

/**
 * 剪輯影片
 */
export const clipVideo = async (request: ClipRequest): Promise<TaskResponse> => {
  // ✅ 確保精度
  const formattedRequest = {
    ...request,
    start_time: parseFloat(request.start_time.toFixed(3)),
    end_time: parseFloat(request.end_time.toFixed(3)),
  };

  console.log('📤 剪輯請求:', formattedRequest);

  const response = await fetch(`${API_BASE}/api/videos/clip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formattedRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clip failed: ${errorText}`);
  }

  return response.json();
};

/**
 * 合併影片
 */
export const mergeVideos = async (request: MergeRequest): Promise<TaskResponse> => {
  // ✅ 確保所有片段的時間精度
  const formattedRequest = {
    ...request,
    clips: request.clips.map(clip => ({
      ...clip,
      start_time: parseFloat(clip.start_time.toFixed(3)),
      end_time: parseFloat(clip.end_time.toFixed(3)),
    })),
  };

  console.log('📤 合併請求:', formattedRequest);

  const response = await fetch(`${API_BASE}/api/videos/merge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formattedRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Merge failed: ${errorText}`);
  }

  return response.json();
};

/**
 * 獲取任務狀態
 */
export const getTaskStatus = async (taskId: string): Promise<TaskStatus> => {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get task status: ${response.statusText}`);
  }

  return response.json();
};

/**
 * 輪詢任務狀態直到完成
 */
export const pollTaskStatus = async (
  taskId: string,
  onProgress?: (status: TaskStatus) => void,
  interval: number = 2000,
  timeout: number = 300000  // 5 分鐘
): Promise<TaskStatus> => {
  const startTime = Date.now();
  
  while (true) {
    const status = await getTaskStatus(taskId);
    
    // 回調進度
    if (onProgress) {
      onProgress(status);
    }
    
    // 完成或失敗
    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }
    
    // 超時檢查
    if (Date.now() - startTime > timeout) {
      throw new Error('Task timeout');
    }
    
    // 等待後繼續
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};