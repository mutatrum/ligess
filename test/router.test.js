const test = require('node:test')
const assert = require('node:assert/strict')

// Configure environment before importing router
process.env.LIGESS_USERNAME = 'satoshi'
process.env.LIGESS_DOMAIN = 'ligess.example.com'
process.env.LIGESS_LN_BACKEND = 'lnd'
process.env.LIGESS_LND_REST = 'https://127.0.0.1:8080'
process.env.LIGESS_LND_MACAROON = '00'
process.env.LIGESS_NOSTR_PUBKEY = '4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff'

const { buildApp } = require('../src/app')
const fastify = buildApp({ logger: false })

test('Router & HTTP Endpoints', async (t) => {
  await t.test('should return CORS headers on OPTIONS preflight', async () => {
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/.well-known/lnurlp/satoshi'
    })
    assert.equal(res.statusCode, 204)
    assert.equal(res.headers['access-control-allow-origin'], '*')
    assert.ok(res.headers['access-control-allow-methods'].includes('GET'))
  })

  await t.test('should return JSON for GET / by default', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.ok(body.lnurlp.startsWith('lnurl1'))
    assert.equal(body.decodedUrl, 'https://ligess.example.com/.well-known/lnurlp/satoshi')
  })

  await t.test('should render HTML landing page when Accept: text/html is requested', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        accept: 'text/html'
      }
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.headers['content-type'].includes('text/html'))
    assert.ok(res.payload.includes('satoshi@ligess.example.com'))
    assert.ok(res.payload.includes('via WebLN'))
  })

  await t.test('should handle NIP-05 DNS verification for matching name', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/nostr.json?name=satoshi'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.names.satoshi, '4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff')
  })

  await t.test('should return empty names object for unknown NIP-05 username', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/nostr.json?name=unknownuser'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.deepEqual(body.names, {})
  })

  await t.test('should return LNURL-pay params for valid user', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/satoshi'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.status, 'OK')
    assert.equal(body.tag, 'payRequest')
    assert.equal(body.minSendable, 1000)
  })

  await t.test('should return 404 for unknown user on LNURL-pay endpoint', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/nonexistent'
    })
    assert.equal(res.statusCode, 404)
  })
})
