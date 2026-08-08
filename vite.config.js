import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Production source maps are deliberately disabled; upload private maps to
    // an error tracker in a future provider-specific deployment instead.
    sourcemap: false,
  },
})
