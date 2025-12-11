import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:8000';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
    	proxy: {
      	  '/api': {
            target: apiBaseUrl,
            changeOrigin: true,
          }
       }
      },
      plugins: [react()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        sourcemap: mode === 'dev',
        minify: mode === 'prod' ? 'esbuild' : false,
      },
      
      envPrefix: 'VITE_',
    };
});
