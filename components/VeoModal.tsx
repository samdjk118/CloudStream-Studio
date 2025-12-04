import React, { useState } from 'react';
import { checkApiKey, promptForApiKey, generateVideo } from '../services/geminiService';
import { GeneratorStatus } from '../types';
import { X, Sparkles, AlertCircle, Video } from 'lucide-react';

interface VeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoGenerated: (url: string, prompt: string) => void;
}

export const VeoModal: React.FC<VeoModalProps> = ({ isOpen, onClose, onVideoGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GeneratorStatus>(GeneratorStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setStatus(GeneratorStatus.CHECKING_KEY);
    setErrorMsg(null);

    try {
      // 1. Check/Get Key
      let hasKey = await checkApiKey();
      if (!hasKey) {
        await promptForApiKey();
        // Assume success or user cancelled. 
        // Real implementation might need to listen to focus or poll, 
        // but SDK says assume success after call.
        hasKey = true; 
      }

      // 2. Generate
      setStatus(GeneratorStatus.GENERATING);
      const videoUrl = await generateVideo(prompt);

      if (videoUrl) {
        setStatus(GeneratorStatus.COMPLETE);
        onVideoGenerated(videoUrl, prompt);
        setPrompt('');
        setTimeout(() => {
          setStatus(GeneratorStatus.IDLE);
          onClose();
        }, 1000); // Close after brief success show
      } else {
        throw new Error("Failed to generate video url");
      }

    } catch (err: any) {
      console.error(err);
      setStatus(GeneratorStatus.ERROR);
      if (err.message === "AUTH_ERROR" || err.message.includes("Requested entity was not found")) {
        setErrorMsg("API Key issue. Please try again to select a valid paid project key.");
      } else {
        setErrorMsg("Generation failed. Veo is currently in preview, please try again later.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1e1e1e] w-full max-w-lg rounded-xl border border-[#333] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-[#333] flex justify-between items-center bg-[#252525]">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            AI Video Generator (Veo)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {status === GeneratorStatus.GENERATING ? (
            <div className="text-center py-8">
              <div className="inline-block relative">
                 <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                 <Video className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-4 text-white font-medium">Dreaming up your video...</p>
              <p className="text-sm text-gray-400 mt-2">This may take 1-2 minutes. Please wait.</p>
            </div>
          ) : status === GeneratorStatus.COMPLETE ? (
            <div className="text-center py-8 text-green-500">
               <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8" />
               </div>
               <p className="text-lg font-bold">Video Generated!</p>
               <p className="text-sm text-gray-400">Adding to library...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Describe the video you want to create using Google's Veo model. 
                <br/>
                <span className="text-xs text-purple-400">Note: Requires a paid Google Cloud Project API Key.</span>
              </p>
              
              <textarea 
                className="w-full h-32 bg-[#111] border border-[#333] rounded-lg p-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none"
                placeholder="A futuristic city with flying cars at sunset, cinematic lighting, 4k..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />

              {errorMsg && (
                <div className="bg-red-900/20 border border-red-900/50 p-3 rounded flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{errorMsg}</p>
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-300 underline"
                >
                  Billing Info
                </a>
                <button 
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-[#333] disabled:text-gray-500 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};