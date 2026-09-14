const test = require('node:test')
const assert = require('node:assert')
const { formatLogArg, createConsoleLogger, logHttpResponse } = require('../src/config/logger')
const { buildApp } = require('../src/app')

test('Logger & Console Formatting', async (t) => {
  await t.test('formatLogArg formats plain strings', () => {
    assert.equal(formatLogArg('hello world'), 'hello world')
    assert.equal(formatLogArg(''), '')
    assert.equal(formatLogArg(undefined), '')
  })

  await t.test('formatLogArg formats errors', () => {
    const err = new Error('database connection failed')
    const formatted = formatLogArg(err)
    assert.ok(formatted.includes('database connection failed'))
  })

  await t.test('formatLogArg formats objects with msg and details', () => {
    const arg = { msg: 'Invoice created', hash: 'abc123', amount: 5000, comment: undefined, empty: '' }
    const formatted = formatLogArg(arg)
    assert.equal(formatted, 'Invoice created (hash=abc123 amount=5000)')
  })

  await t.test('formatLogArg formats objects with only msg', () => {
    const arg = { msg: 'Server started' }
    const formatted = formatLogArg(arg)
    assert.equal(formatted, 'Server started')
  })

  await t.test('formatLogArg formats error objects with reason', () => {
    const arg = { status: 'ERROR', reason: 'Invalid amount specified' }
    const formatted = formatLogArg(arg)
    assert.equal(formatted, 'reason: Invalid amount specified')
  })

  await t.test('createConsoleLogger creates a Fastify-compatible logger interface', () => {
    const logger = createConsoleLogger()
    assert.equal(typeof logger.info, 'function')
    assert.equal(typeof logger.warn, 'function')
    assert.equal(typeof logger.error, 'function')
    assert.equal(typeof logger.fatal, 'function')
    assert.equal(typeof logger.trace, 'function')
    assert.equal(typeof logger.debug, 'function')
    assert.equal(typeof logger.child, 'function')
    assert.equal(logger.child(), logger)
    assert.equal(logger.level, 'info')
  })

  await t.test('logHttpResponse formats HTTP line with rounded response time', () => {
    let output = ''
    const origLog = console.log
    console.log = (str) => { output = str }

    try {
      const mockReq = { method: 'GET', url: '/test' }
      const mockReply = { statusCode: 200, getResponseTime: () => 1.23456 }
      logHttpResponse(mockReq, mockReply)
      assert.ok(output.includes('[HTTP]'))
      assert.ok(output.includes('GET /test'))
      assert.ok(output.includes('200'))
      assert.ok(output.includes('(1.2ms)'))
    } finally {
      console.log = origLog
    }
  })

  await t.test('buildApp with logger: false produces no stdout logs on requests', async () => {
    let output = ''
    const origLog = console.log
    console.log = (str) => { output += str }

    try {
      const fastify = buildApp({ logger: false })
      await fastify.inject({ method: 'GET', url: '/' })
      await fastify.close()
      assert.equal(output, '')
    } finally {
      console.log = origLog
    }
  })

  await t.test('buildApp with custom logger logs clean HTTP request on response', async () => {
    const logs = []
    const origLog = console.log
    console.log = (str) => { logs.push(str) }

    try {
      const fastify = buildApp()
      await fastify.inject({ method: 'GET', url: '/' })
      await fastify.close()
      assert.ok(logs.some(l => l.includes('[HTTP]') && l.includes('GET /') && l.includes('200')))
    } finally {
      console.log = origLog
    }
  })
})
