function formatLogArg(arg) {
  if (arg === undefined) return ''
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack || arg.message
  if (typeof arg === 'object' && arg !== null) {
    if (arg.msg) {
      const { msg, ...rest } = arg
      const details = Object.entries(rest)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ')
      return details ? `${msg} (${details})` : msg
    }
    if (arg.reason) return `reason: ${arg.reason}`
    return JSON.stringify(arg)
  }
  return String(arg)
}

function logWith(fn, prefix, arg, args) {
  if (arg === undefined) {
    fn(prefix)
    return
  }
  const formatted = [formatLogArg(arg), ...args.map(formatLogArg)].filter(Boolean).join(' ')
  fn(`${prefix} ${formatted}`)
}

function createConsoleLogger() {
  const logger = {
    info: (arg, ...args) => logWith(console.log, '\x1b[36m[INFO]\x1b[0m', arg, args),
    warn: (arg, ...args) => logWith(console.warn, '\x1b[33m[WARN]\x1b[0m', arg, args),
    error: (arg, ...args) => logWith(console.error, '\x1b[31m[ERROR]\x1b[0m', arg, args),
    fatal: (arg, ...args) => logWith(console.error, '\x1b[31m[FATAL]\x1b[0m', arg, args),
    trace: () => {},
    debug: () => {},
    child: () => logger,
    level: 'info'
  }
  return logger
}

function logHttpResponse(request, reply) {
  const ms = reply.getResponseTime().toFixed(1)
  const status = reply.statusCode
  const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m'
  console.log(`\x1b[34m[HTTP]\x1b[0m ${request.method} ${request.url} ${statusColor}${status}\x1b[0m (${ms}ms)`)
}

module.exports = {
  formatLogArg,
  createConsoleLogger,
  logHttpResponse
}
