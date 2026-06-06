import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 与 frontend-only 的 serve-static.mjs（API_PROXY）一致：开发时把 /api 转到后端 */
const API_PROXY_TARGET = process.env.API_PROXY || 'http://127.0.0.1:3000';

// https://astro.build/config
export default defineConfig({
  site: 'https://public.wodniack.dev',

  scopedStyleStrategy: 'class',

  server: {
    host: true,
  },

  vite: {
    server: {
      proxy: {
        '/api': {
          target: API_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@/': `${path.resolve(__dirname, 'src')}/`
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use 'sass:math'; @use 'sass:map'; @use "@/styles/import" as *;`
        }
      }
    },
    build: {
      assetsInlineLimit: 0
    }
  },

  devToolbar: {
    enabled: false
  }
});
