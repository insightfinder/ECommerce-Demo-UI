import { defineConfig } from 'vite';

// `npm run dev` proxies /api to the mock API (or a real apiserver) so the app
// runs on the same origin as in production.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8000';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
