import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error plain ESM server module
import { createNemotronHandler } from './server/nemotron-proxy.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      {
        name: 'nemotron-proxy',
        configureServer(server) {
          const handler = createNemotronHandler(env)
          server.middlewares.use('/api/chat', (req, res) => { void handler(req, res) })
        },
      },
    ],
    test: { include: ['src/**/*.test.ts'], testTimeout: 30_000 },
  }
})
