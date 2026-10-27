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
        admin: resolve(process.cwd(), 'admin.html'),
        privacy: resolve(process.cwd(), 'privacy.html'),
        disclosure: resolve(process.cwd(), 'disclosure.html'),
        research: resolve(process.cwd(), 'product-intelligence.html'),
        seoContent: resolve(process.cwd(), 'seo-content.html'),
        contentStudio: resolve(process.cwd(), 'content-studio.html'),
        campaignOperations: resolve(process.cwd(), 'campaign-operations.html'),
        costGovernance: resolve(process.cwd(), 'cost-governance.html')
      }
    }
  }
});
