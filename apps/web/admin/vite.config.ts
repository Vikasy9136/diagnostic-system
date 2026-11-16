import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const useHttps = process.env.VITE_HTTPS !== 'false';

export default defineConfig({
  plugins: useHttps ? [react(), basicSsl()] : [react()],
  envDir: '../../..',
  server: {
    port: 3002,
    host: true,
    https: useHttps,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

