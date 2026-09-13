const Fastify = require('fastify')
const websocketPlugin = require('@fastify/websocket')
const { registerRoutes } = require('./web/router')

function buildApp(options = {}) {
  const fastify = Fastify({
    logger: true,
    ...options
  })

  fastify.register(websocketPlugin)
  registerRoutes(fastify)

  return fastify
}

const start = async (options = {}) => {
  const app = buildApp(options)
  const port = Number(process.env.PORT) || 8080
  const host = process.env.HOST || '127.0.0.1'

  try {
    await app.listen({ port, host })
    return app
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

module.exports = {
  buildApp,
  start
}
