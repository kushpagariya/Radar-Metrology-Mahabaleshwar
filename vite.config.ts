import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_PROXY lets a second local backend (e.g. on another port) serve /api during development.
const apiTarget = process.env.API_PROXY || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': apiTarget } },
  build: { chunkSizeWarningLimit: 1100 },
});
