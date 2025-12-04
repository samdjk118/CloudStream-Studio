// components/thumbnail.ts

import { fetchThumbnail, ThumbnailOptions } from '../services/api';

/**
 * 從後端 API 取得縮圖（帶快取）
 */
const thumbnailCache = new Map<string, string>();
const blobUrlCache = new Set<string>(); // 追蹤建立的 Blob URLs

export const getThumbnailWithCache = async (
  videoUrl: string,
  seekTime: number = 1.0,
  options: Omit<ThumbnailOptions, 'time'> = {}
): Promise<string> => {
  // 從 videoUrl 提取檔案路徑
  // 例如: http://localhost:8000/api/stream/path/to/video.mp4
  const urlObj = new URL(videoUrl);
  const pathParts = urlObj.pathname.split('/api/stream/');
  
  if (pathParts.length < 2) {
    console.error('無效的影片 URL:', videoUrl);
    return '';
  }
  
  const filePath = decodeURIComponent(pathParts[1]);
  
  // 建立快取鍵
  const cacheKey = `${filePath}_${seekTime}_${options.width || 320}x${options.height || 180}`;
  
  // 檢查快取
  if (thumbnailCache.has(cacheKey)) {
    console.log(`使用快取縮圖: ${filePath}`);
    return thumbnailCache.get(cacheKey)!;
  }
  
  try {
    console.log(`請求縮圖: ${filePath}`);
    
    // 從後端 API 取得縮圖
    const blobUrl = await fetchThumbnail(filePath, {
      ...options,
      time: seekTime,
      width: options.width || 320,
      height: options.height || 180
    });
    
    // 儲存到快取
    thumbnailCache.set(cacheKey, blobUrl);
    blobUrlCache.add(blobUrl);
    
    return blobUrl;
  } catch (error) {
    console.error('取得縮圖失敗:', error);
    // 返回空字串，讓 UI 顯示預設圖示
    return '';
  }
};

/**
 * 清除縮圖快取
 */
export const clearThumbnailCache = () => {
  // 釋放所有 Blob URLs
  blobUrlCache.forEach(url => {
    URL.revokeObjectURL(url);
  });
  
  thumbnailCache.clear();
  blobUrlCache.clear();
  
  console.log('已清除縮圖快取');
};

/**
 * 清除特定影片的縮圖快取
 */
export const clearThumbnailForVideo = (videoUrl: string) => {
  const urlObj = new URL(videoUrl);
  const pathParts = urlObj.pathname.split('/api/stream/');
  
  if (pathParts.length < 2) return;
  
  const filePath = decodeURIComponent(pathParts[1]);
  
  // 找出並刪除相關的快取
  const keysToDelete: string[] = [];
  
  thumbnailCache.forEach((value, key) => {
    if (key.startsWith(filePath)) {
      keysToDelete.push(key);
      // 釋放 Blob URL
      URL.revokeObjectURL(value);
      blobUrlCache.delete(value);
    }
  });
  
  keysToDelete.forEach(key => thumbnailCache.delete(key));
  
  console.log(`已清除 ${keysToDelete.length} 個縮圖快取 (${filePath})`);
};

/**
 * 預載入縮圖（批次）
 */
export const preloadThumbnails = async (
  videoUrls: string[],
  seekTime: number = 1.0,
  options: Omit<ThumbnailOptions, 'time'> = {}
): Promise<void> => {
  console.log(`預載入 ${videoUrls.length} 個縮圖...`);
  
  const promises = videoUrls.map(url => 
    getThumbnailWithCache(url, seekTime, options).catch(err => {
      console.error(`預載入失敗 (${url}):`, err);
      return '';
    })
  );
  
  await Promise.all(promises);
  console.log('縮圖預載入完成');
};

// 舊的本地生成方法（保留作為備用）
export const generateThumbnailLocally = (
  videoUrl: string,
  seekTime: number = 1.0
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      reject(new Error('無法取得 Canvas context'));
      return;
    }

    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      canvas.width = 320;
      canvas.height = 180;
      video.currentTime = Math.min(seekTime, video.duration);
    };

    video.onseeked = () => {
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        video.remove();
        canvas.remove();
        
        resolve(thumbnailUrl);
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = (error) => {
      video.remove();
      canvas.remove();
      reject(error);
    };

    video.src = videoUrl;
  });
};
