
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Helper to sanitize keys (remove quotes and spaces)
const sanitize = (val: string | undefined) => {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
};

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  const isBuild = command === 'build';
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    // Use relative paths only for production build (Electron), absolute for dev server
    base: isBuild ? './' : '/', 
    define: {
      // Define specific keys instead of overwriting the whole object
      // This preserves process.env.NODE_ENV which React needs
      'process.env.API_KEY': JSON.stringify(sanitize(env.API_KEY)),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(sanitize(env.DEEPSEEK_API_KEY)),
      'process.env.OPENAI_API_KEY': JSON.stringify(sanitize(env.OPENAI_API_KEY)),
      'process.env.OPENAI_MODEL': JSON.stringify(sanitize(env.OPENAI_MODEL)),
      'process.env.QWEN_API_KEY': JSON.stringify(sanitize(env.QWEN_API_KEY)),
      'process.env.QWEN_MODEL': JSON.stringify(sanitize(env.QWEN_MODEL)),
      'process.env.MOONSHOT_API_KEY': JSON.stringify(sanitize(env.MOONSHOT_API_KEY)),
      'process.env.MOONSHOT_MODEL': JSON.stringify(sanitize(env.MOONSHOT_MODEL)),
      'process.env.GEMINI_MODEL': JSON.stringify(sanitize(env.GEMINI_MODEL)),
      'process.env.SUPABASE_URL': JSON.stringify(sanitize(env.SUPABASE_URL)),
      'process.env.SUPABASE_KEY': JSON.stringify(sanitize(env.SUPABASE_KEY))
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'esnext'
    }
  };
});
