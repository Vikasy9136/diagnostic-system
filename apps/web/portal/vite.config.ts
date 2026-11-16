import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const portalPort = Number(process.env.PORTAL_PORT || 3003);
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000';
const useHttps = process.env.VITE_HTTPS !== 'false';

export default defineConfig({
  plugins: useHttps ? [react(), basicSsl()] : [react()],
  envDir: '../../..',
  server: {
    port: portalPort,
    host: true,
    https: useHttps,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

