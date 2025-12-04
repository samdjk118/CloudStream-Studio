
export interface VideoAsset {
  id: string;           // 唯一識別碼
  name: string;         // 顯示名稱
  url: string;          // 串流 URL
  duration: number;     // 持續時間（秒）
  thumbnail?: string;   // 縮圖 URL（可選）
  source: 'bucket';     // 來源
  fullPath?: string;    // GCS 完整路徑（用於刪除）
  size?: number;        // 檔案大小
  contentType?: string; // MIME 類型
}

export interface Clip {
  id: string;
  sourceVideoId: string;
  startTime: number;
  endTime: number;
  name: string;
}

export interface TimelineState {
  clips: Clip[];
  currentTime: number;
  isPlaying: boolean;
}

export enum GeneratorStatus {
  IDLE = 'IDLE',
  CHECKING_KEY = 'CHECKING_KEY',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}
