import { defineConfig } from 'vite'

// Standard Vite config. The Even App / simulator loads the dev URL
// (default http://localhost:5173) or the built dist/ output.
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
})
