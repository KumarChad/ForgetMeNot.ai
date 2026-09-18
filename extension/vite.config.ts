import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

function copyManifest() {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      copyFileSync(
        resolve(__dirname, 'public/manifest.json'),
        resolve(distDir, 'manifest.json')
      );
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/background.ts'),
        'voice-overlay': resolve(__dirname, 'src/content/voice-overlay.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'voice-overlay') return 'voice-overlay.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
