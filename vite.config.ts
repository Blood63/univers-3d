import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/univers-3d/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/postprocessing') || id.includes('@react-three/postprocessing')) return 'post'
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})
