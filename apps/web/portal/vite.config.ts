import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const portalPort = Number(process.env.PORTAL_PORT || 3003);
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  envDir: '../../..',
  server: {
    port: portalPort,
    host: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});

