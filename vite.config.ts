import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        // Main process
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            minify: false,
            sourcemap: 'inline',
          },
        },
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            minify: false,
            sourcemap: 'inline',
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src')
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  clearScreen: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: process.env.ELECTRON=="true" ? './' : "/"
})
