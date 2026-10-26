import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/AFFILIATE-CONTENT-MANAGEMENT-OS/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        app: resolve(process.cwd(), 'app.html'),
        admin: resolve(process.cwd(), 'admin.html')
      }
    }
  }
});
