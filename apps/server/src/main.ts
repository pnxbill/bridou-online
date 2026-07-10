import { createApp } from './app'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

const { httpServer } = createApp()

httpServer.listen(PORT, HOST, () => {
  console.log(`Game server listening on http://${HOST}:${PORT}`)
})
