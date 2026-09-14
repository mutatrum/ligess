require('./nostr/websocket')
const Fastify = require('fastify')
const websocketPlugin = require('@fastify/websocket')
const { registerRoutes } = require('./web/router')
const { startNutzapService, isNutzapEnabled } = require('./nostr/nutzaps')

function buildApp(options = {}) {
  const fastify = Fastify({
    logger: true,
    ...options
  })

  fastify.register(websocketPlugin)
  registerRoutes(fastify)

  return fastify
}

let _nutzapService = null

const start = async (options = {}) => {
  const app = buildApp(options)
  const port = Number(process.env.PORT) || 8080
  const host = process.env.HOST || '127.0.0.1'

  try {
    app.addHook('onClose', async () => {
      if (_nutzapService && typeof _nutzapService.close === 'function') {
        _nutzapService.close()
        _nutzapService = null
      }
    })

    await app.listen({ port, host })

    if (isNutzapEnabled()) {
      _nutzapService = startNutzapService()
    }

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
