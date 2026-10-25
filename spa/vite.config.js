import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// In production the app is served by Corteza's own webapp server (see
// HTTP_WEBAPP_LIST), which rewrites <base href> to the app's path and
// generates config.js with the API and auth URLs. The build therefore uses
// relative asset paths and makes no assumption about where it is mounted.
//
// In development the Vite server stands in for Corteza: it serves an
// equivalent config.js and proxies /api and /auth, so the browser stays
// same-origin exactly as it does in production.
function cortezaDevConfig() {
  return {
    name: 'corteza-dev-config',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/config.js', (req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end("window.CortezaAPI = '/api';\nwindow.CortezaAuth = '/auth';\n")
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.CORTEZA_URL || 'http://localhost:18080'

  return {
    base: './',
    plugins: [vue(), cortezaDevConfig()],
    // main.js awaits the session restore at top level.
    build: { target: 'es2022' },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
        // Everything under /auth except the app's own /auth/callback route.
        '^/auth/(?!callback)': { target, changeOrigin: true },
      },
    },
  }
})
