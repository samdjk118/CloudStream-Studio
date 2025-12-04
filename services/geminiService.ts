import { GoogleGenAI } from "@google/genai";

// We need to re-instantiate the client every call to ensure we pick up the latest API key
// from the window.aistudio environment if it was just selected.
const getClient = () => {
  // The API key is injected automatically into process.env.API_KEY by the environment
  // when using the AI Studio key selector.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const checkApiKey = async (): Promise<boolean> => {
  if (window.aistudio && window.aistudio.hasSelectedApiKey) {
    return await window.aistudio.hasSelectedApiKey();
  }
  return !!process.env.API_KEY;
};

export const promptForApiKey = async (): Promise<void> => {
  if (window.aistudio && window.aistudio.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    console.warn("AI Studio key selector not available in this environment.");
  }
};

export const generateVideo = async (prompt: string): Promise<string | null> => {
  const ai = getClient();
  
  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p', 
        aspectRatio: '16:9'
      }
    });

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    if (!videoUri) {
      throw new Error("No video URI returned from generation.");
    }

    // Append API key to the download link as per documentation
    const downloadUrl = `${videoUri}&key=${process.env.API_KEY}`;
    
    // Fetch the actual blob to create a local object URL to avoid expiration/auth issues in <video> tag
    const response = await fetch(downloadUrl);
    const blob = await response.blob();
    return URL.createObjectURL(blob);

  } catch (error) {
    console.error("Video generation failed:", error);
    // If resource not found, it might be an auth issue, reset key flow
    if (error instanceof Error && error.message.includes("Requested entity was not found")) {
      // Logic to trigger re-auth could go here, handled by UI component usually
      throw new Error("AUTH_ERROR");
    }
    throw error;
  }
};