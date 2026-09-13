const { buildApp } = require('./src/app')

const app = buildApp()

module.exports = {
  start: () => app.listen({ port: Number(process.env.PORT) || 8080, host: process.env.HOST || '127.0.0.1' }),
  fastify: app
}
