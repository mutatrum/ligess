try {
  globalThis.WebSocket = require('ws')
} catch (_) {}

const { startup } = require('./src/config/startup')
const { start } = require('./src/app')

startup()
start()