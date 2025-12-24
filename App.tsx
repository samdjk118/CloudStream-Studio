import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { VideoLibrary } from './components/VideoLibrary';
import { Player } from './components/Player';
import { Timeline } from './components/Timeline';
import { VideoAsset, Clip } from './types';
import { Video as VideoIcon, Download } from 'lucide-react';
import { fetchFiles, uploadFile, deleteFile, getStreamUrl, GCSFile } from './services/api';

const App: React.FC = () => {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [currentVideo, setCurrentVideo] = useState<VideoAsset | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isLoadingBucket, setIsLoadingBucket] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [previewClipTime, setPreviewClipTime] = useState<{ start: number; end: number } | null>(null);
  
  // ✅ 使用 ref 追蹤最新的 videos
  const videosRef = useRef<VideoAsset[]>([]);
  
  // ✅ 同步 ref
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const convertToVideoAsset = useCallback((file: GCSFile, index: number): VideoAsset => {
    const displayName = file.name.split('/').pop() || file.name;
    const streamUrl = getStreamUrl(file.name);
    
    return {
      id: `${file.name}-${index}`,
      name: displayName,
      url: streamUrl,
      duration: 0,
      source: 'bucket' as const,
      fullPath: file.name,
      size: file.size,
      contentType: file.content_type,
      thumbnail: undefined
    };
  }, []);

  const loadFiles = useCallback(async () => {
    setIsLoadingBucket(true);
    try {
      const files = await fetchFiles();
      
      const videoFiles = files.filter(file => 
        file.content_type && file.content_type.startsWith('video/')
      );
      
      const assets: VideoAsset[] = videoFiles.map((file, index) => 
        convertToVideoAsset(file, index)
      );
      
      setVideos(assets);
      return assets; // ✅ 返回新的 assets
    } catch (err) {
      console.error("Failed to load files", err);
      setVideos([]);
      return [];
    } finally {
      setIsLoadingBucket(false);
    }
  }, [convertToVideoAsset]);

  // ✅ 初始載入
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      await uploadFile(file);
      await loadFiles();
      alert('Upload successful!');
    } catch (err) {
      alert("Upload failed. Check console for details.");
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  }, [loadFiles]);

  const handleDelete = useCallback(async (video: VideoAsset) => {
    try {
      const pathToDelete = (video as any).fullPath || video.name;
      await deleteFile(pathToDelete);
      
      if (currentVideo?.id === video.id) {
        setCurrentVideo(null);
      }
      
      setClips(prev => prev.filter(c => c.sourceVideoId !== video.id));
      
      await loadFiles();
      alert('Delete successful!');
    } catch (err) {
      alert("Delete failed.");
      console.error(err);
    }
  }, [currentVideo, loadFiles]);

  const handleDownloadVideo = useCallback(async () => {
    if (!currentVideo) {
      alert('Please select a video first!');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = currentVideo.url;
      link.download = currentVideo.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Downloading:', currentVideo.name);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download failed. Please try again.');
    }
  }, [currentVideo]);

  const handleAddClip = useCallback((clip: Clip) => {
    setClips(prev => [...prev, clip]);
  }, []);

  const handleRemoveClip = useCallback((clipId: string) => {
    setClips(prev => prev.filter(c => c.id !== clipId));
  }, []);

  const handleSynthesize = useCallback(() => {
    console.log('Synthesize triggered from App (deprecated)');
  }, []);

  const handlePreviewClip = useCallback((clip: Clip) => {
    const asset = videosRef.current.find(v => v.id === clip.sourceVideoId);
    
    if (!asset) {
      console.warn('找不到源視頻:', clip.sourceVideoId);
      return;
    }

    console.log('🎬 預覽片段:', {
      video: asset.name,
      start: clip.startTime,
      end: clip.endTime
    });

    setCurrentVideo(asset);
    setPreviewClipTime({
      start: clip.startTime,
      end: clip.endTime
    });
  }, []);

  // ✅ 修復 handleSynthesizeComplete - 避免閉包問題
  const handleSynthesizeComplete = useCallback(async (outputPath: string) => {
    console.log('🎬 合成完成，準備選取新影片:', outputPath);
    
    try {
      // ✅ 重新載入並獲取新的 videos
      const newVideos = await loadFiles();
      
      // ✅ 使用返回的新 videos 而不是 state
      const findVideo = (videoList: VideoAsset[]) => 
        videoList.find(v => v.fullPath === outputPath);
      
      let synthesizedVideo = findVideo(newVideos);
      
      if (synthesizedVideo) {
        console.log('✅ 找到合成影片，自動選取:', synthesizedVideo.name);
        setCurrentVideo(synthesizedVideo);
        setPreviewClipTime(null);
      } else {
        console.warn('⚠️ 未找到合成影片，嘗試重新載入');
        
        // ✅ 延遲後再次嘗試
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryVideos = await loadFiles();
        synthesizedVideo = findVideo(retryVideos);
        
        if (synthesizedVideo) {
          console.log('✅ 第二次嘗試成功，選取影片:', synthesizedVideo.name);
          setCurrentVideo(synthesizedVideo);
          setPreviewClipTime(null);
        } else {
          console.error('❌ 無法找到合成影片:', outputPath);
          alert('合成完成，但無法自動選取影片。請手動從列表中選擇。');
        }
      }
      
    } catch (error) {
      console.error('❌ 選取合成影片失敗:', error);
      alert('選取合成影片失敗，請手動從列表中選擇。');
    }
  }, [loadFiles]);

  // ✅ 修復 useEffect - 完整的依賴項
  useEffect(() => {
    if (previewClipTime) {
      const timer = setTimeout(() => {
        setPreviewClipTime(null);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [currentVideo, previewClipTime]); // ✅ 添加 previewClipTime

  // ✅ 優化 assetMap
  const assetMap = useMemo(() => {
    const map: Record<string, VideoAsset> = {};
    videos.forEach(v => {
      map[v.id] = v;
    });
    return map;
  }, [videos]);

  // ✅ 優化 handleSelectVideo
  const handleSelectVideo = useCallback((video: VideoAsset) => {
    setCurrentVideo(video);
    setPreviewClipTime(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] text-white overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-[#333] bg-[#1a1a1a] flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex items-center justify-center shadow-lg">
             <VideoIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            CloudStream <span className="text-blue-400 font-light">Manager</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500 bg-[#222] px-3 py-1 rounded-full border border-[#333]">
            Backend: Connected (localhost:8000)
          </div>
          <div className="text-xs text-gray-400 bg-[#222] px-3 py-1 rounded-full border border-[#333]">
            {videos.length} video{videos.length !== 1 ? 's' : ''}
          </div>
          <div className="text-xs text-gray-400 bg-[#222] px-3 py-1 rounded-full border border-[#333]">
            {clips.length} clip{clips.length !== 1 ? 's' : ''}
          </div>
          
          <button 
            className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm transition ${
              currentVideo 
                ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                : 'bg-[#333] text-gray-500 cursor-not-allowed'
            }`}
            onClick={handleDownloadVideo}
            disabled={!currentVideo}
            title={currentVideo ? `Download ${currentVideo.name}` : 'No video selected'}
          >
            <Download className="w-4 h-4" />
            Download Video
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <VideoLibrary 
          videos={videos} 
          onSelectVideo={handleSelectVideo}
          onUpload={handleUpload}
          onDelete={handleDelete}
          isLoading={isLoadingBucket}
          isUploading={isUploading}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col">
            <Player 
              video={currentVideo} 
              onAddClip={handleAddClip}
              previewTime={previewClipTime}
            />
          </div>
          
          <Timeline 
            clips={clips} 
            assets={assetMap}
            onRemoveClip={handleRemoveClip}
            onSynthesize={handleSynthesize}
            isSynthesizing={isSynthesizing}
            onSynthesizeComplete={handleSynthesizeComplete}
            onPreviewClip={handlePreviewClip}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
