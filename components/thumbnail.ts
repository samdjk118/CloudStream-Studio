// src/components/thumbnail.ts

import { fetchThumbnail, ThumbnailOptions } from '../services/api';

/**
 * 從後端 API 取得縮圖（帶快取）
 */
const thumbnailCache = new Map<string, string>();
const blobUrlCache = new Set<string>();

export const getThumbnailWithCache = async (
  videoUrl: string,
  seekTime: number = 1.0,
  options: Omit<ThumbnailOptions, 'time_offset'> = {}
): Promise<string> => {
  // 從 videoUrl 提取檔案路徑
  const urlObj = new URL(videoUrl);
  const pathParts = urlObj.pathname.split('/api/stream/');
  
  if (pathParts.length < 2) {
    console.error('❌ 無效的影片 URL:', videoUrl);
    return '';
  }
  
  const filePath = decodeURIComponent(pathParts[1]);
  
  // 建立快取鍵
  const cacheKey = `${filePath}_${seekTime}_${options.width || 320}x${options.height || 180}`;
  
  // 檢查快取
  if (thumbnailCache.has(cacheKey)) {
    console.log(`✓ 使用快取縮圖: ${filePath}`);
    return thumbnailCache.get(cacheKey)!;
  }
  
  try {
    console.log(`📸 請求縮圖: ${filePath}`);
    
    // 從後端 API 取得縮圖
    const blobUrl = await fetchThumbnail(filePath, {
      ...options,
      time_offset: seekTime,  // 改為 time_offset
      width: options.width || 320,
      height: options.height || 180
    });
    
    // 儲存到快取
    thumbnailCache.set(cacheKey, blobUrl);
    blobUrlCache.add(blobUrl);
    
    return blobUrl;
  } catch (error) {
    console.error('❌ 取得縮圖失敗:', error);
    return '';
  }
};

/**
 * 清除縮圖快取
 */
export const clearThumbnailCache = () => {
  blobUrlCache.forEach(url => {
    URL.revokeObjectURL(url);
  });
  
  thumbnailCache.clear();
  blobUrlCache.clear();
  
  console.log('🗑️  已清除縮圖快取');
};

/**
 * 清除特定影片的縮圖快取
 */
export const clearThumbnailForVideo = (videoUrl: string) => {
  const urlObj = new URL(videoUrl);
  const pathParts = urlObj.pathname.split('/api/stream/');
  
  if (pathParts.length < 2) return;
  
  const filePath = decodeURIComponent(pathParts[1]);
  
  const keysToDelete: string[] = [];
  
  thumbnailCache.forEach((value, key) => {
    if (key.startsWith(filePath)) {
      keysToDelete.push(key);
      URL.revokeObjectURL(value);
      blobUrlCache.delete(value);
    }
  });
  
  keysToDelete.forEach(key => thumbnailCache.delete(key));
  
  console.log(`🗑️  已清除 ${keysToDelete.length} 個縮圖快取 (${filePath})`);
};

/**
 * 預載入縮圖（批次）
 */
export const preloadThumbnails = async (
  videoUrls: string[],
  seekTime: number = 1.0,
  options: Omit<ThumbnailOptions, 'time_offset'> = {}
): Promise<void> => {
  console.log(`🔄 預載入 ${videoUrls.length} 個縮圖...`);
  
  const promises = videoUrls.map(url => 
    getThumbnailWithCache(url, seekTime, options).catch(err => {
      console.error(`❌ 預載入失敗 (${url}):`, err);
      return '';
    })
  );
  
  await Promise.all(promises);
  console.log('✅ 縮圖預載入完成');
};
