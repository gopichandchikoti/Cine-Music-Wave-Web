import './auth/environment.js'
import { createApp } from './app.js'
import { loadServerConfig } from './config/index.js'

const SHUTDOWN_GRACE_MS = 10_000

const config = loadServerConfig()
const { app, close } = await createApp(config)

const server = app.listen(config.port, config.host, () => {
  process.stdout.write(`Cine Music Wave API listening on http://localhost:${config.port}\n`)
})

/** Stop accepting connections, let in-flight requests finish, then release the databases. */
const shutdown = (): void => {
  const force = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS)
  force.unref()
  server.close(() => {
    close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
