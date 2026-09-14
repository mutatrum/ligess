const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')

// Configure test environment
process.env.NODE_ENV = 'test'
process.env.LIGESS_USERNAME = 'alice'
process.env.LIGESS_DOMAIN = 'pay.alice.me'
process.env.LIGESS_LN_BACKEND = 'lnd'
process.env.LIGESS_LND_REST = 'https://127.0.0.1:8080'
process.env.LIGESS_LND_MACAROON = '00'

const { buildApp } = require('../src/app')
const { buildMetadata } = require('../src/web/router')
const { setLnClient } = require('../src/backends/factory')
const { DEFAULT_PAYER_DATA_CONFIG } = require('../src/config/constants')

test('LUD Specifications (17, 18, 20, 21)', async (t) => {
  const fastify = buildApp({ logger: false })

  // Mock Lightning backend client
  const mockInvoices = new Map()
  let lastCreatedMemo = null
  let lastDescriptionHash = null

  const mockClient = {
    createInvoice: async ({ amountMsats, descriptionHash, memo }) => {
      lastCreatedMemo = memo
      lastDescriptionHash = descriptionHash
      const paymentHash = crypto.randomBytes(32).toString('hex')
      const bolt11 = `lnbc${amountMsats}n1mockbolt11invoice`
      const inv = {
        bolt11,
        paymentHash,
        amountMsats,
        settled: false,
        preImage: null
      }
      mockInvoices.set(paymentHash, inv)
      return inv
    },
    getInvoice: async (paymentHash) => {
      return mockInvoices.get(paymentHash) || null
    }
  }

  setLnClient(mockClient)

  // ---------------------------------------------------------------------------
  // LUD-17: Protocol Schemes and Raw URLs
  // ---------------------------------------------------------------------------
  await t.test('LUD-17: GET / should return lnurlpUrl with lnurlp:// scheme in JSON', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.lnurlpUrl, 'lnurlp://pay.alice.me/.well-known/lnurlp/alice')
    assert.equal(body.decodedUrl, 'https://pay.alice.me/.well-known/lnurlp/alice')
  })

  await t.test('LUD-17: Landing page should render lnurlp:// protocol link', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html' }
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.payload.includes('lnurlp://pay.alice.me/.well-known/lnurlp/alice'))
    assert.ok(res.payload.includes('LUD-17 scheme:'))
  })

  // ---------------------------------------------------------------------------
  // LUD-20: Long Payment Description in Metadata
  // ---------------------------------------------------------------------------
  await t.test('LUD-20: buildMetadata should include text/long-desc when configured', () => {
    const customEnv = {
      ...process.env,
      LIGESS_LONG_DESCRIPTION: 'Detailed bio: Support my open source Lightning development and writing.'
    }
    const metadata = buildMetadata('alice@pay.alice.me', customEnv)
    const longDescEntry = metadata.find(([k]) => k === 'text/long-desc')
    assert.ok(longDescEntry, 'Should contain text/long-desc entry')
    assert.equal(longDescEntry[1], 'Detailed bio: Support my open source Lightning development and writing.')
  })

  await t.test('LUD-20: payRequest response should advertise text/long-desc and hash it into descriptionHash', async () => {
    process.env.LIGESS_LONG_DESCRIPTION = 'Alice Lightning tip jar - thank you for supporting free software!'
    try {
      const res = await fastify.inject({
        method: 'GET',
        url: '/.well-known/lnurlp/alice'
      })
      assert.equal(res.statusCode, 200)
      const body = res.json()
      const metadata = JSON.parse(body.metadata)
      const longDescEntry = metadata.find(([k]) => k === 'text/long-desc')
      assert.ok(longDescEntry)
      assert.equal(longDescEntry[1], 'Alice Lightning tip jar - thank you for supporting free software!')

      // Request invoice to verify descriptionHash matches sha256(metadata)
      const invRes = await fastify.inject({
        method: 'GET',
        url: '/.well-known/lnurlp/alice?amount=10000'
      })
      assert.equal(invRes.statusCode, 200)
      const expectedHash = crypto.createHash('sha256').update(body.metadata).digest('hex')
      assert.equal(lastDescriptionHash, expectedHash)
    } finally {
      delete process.env.LIGESS_LONG_DESCRIPTION
    }
  })

  // ---------------------------------------------------------------------------
  // LUD-18: Payer Identity in payRequest Protocol
  // ---------------------------------------------------------------------------
  await t.test('LUD-18: payRequest initial callback should advertise optional payerData', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/alice'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.deepEqual(body.payerData, DEFAULT_PAYER_DATA_CONFIG)
    assert.equal(body.payerData.name.mandatory, false)
    assert.equal(body.payerData.identifier.mandatory, false)
    assert.equal(body.payerData.email.mandatory, false)
    assert.equal(body.payerData.pubkey.mandatory, false)
  })

  await t.test('LUD-18: payRequest initial callback can be disabled via LIGESS_PAYER_DATA_ENABLED=false', async () => {
    process.env.LIGESS_PAYER_DATA_ENABLED = 'false'
    try {
      const res = await fastify.inject({
        method: 'GET',
        url: '/.well-known/lnurlp/alice'
      })
      assert.equal(res.statusCode, 200)
      const body = res.json()
      assert.equal(body.payerData, undefined)
    } finally {
      delete process.env.LIGESS_PAYER_DATA_ENABLED
    }
  })

  await t.test('LUD-18: invoice creation should attach payerData to invoice memo', async () => {
    const payerData = {
      name: 'Bob the Builder',
      identifier: 'bob@builder.org'
    }
    const res = await fastify.inject({
      method: 'GET',
      url: `/.well-known/lnurlp/alice?amount=25000&comment=Keep+it+up&payerdata=${encodeURIComponent(JSON.stringify(payerData))}`
    })
    assert.equal(res.statusCode, 200)
    assert.ok(lastCreatedMemo.includes('Bob the Builder'))
    assert.ok(lastCreatedMemo.includes('<bob@builder.org>'))
    assert.ok(lastCreatedMemo.includes('Keep it up'))
  })

  await t.test('LUD-18: invoice creation should reject invalid payerdata JSON with 400', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/alice?amount=5000&payerdata=not_valid_json{'
    })
    assert.equal(res.statusCode, 400)
    const body = res.json()
    assert.equal(body.status, 'ERROR')
    assert.ok(body.reason.includes('Invalid payerdata JSON'))
  })

  // ---------------------------------------------------------------------------
  // LUD-21: Payment Verification Endpoint (/verify/:paymentHash)
  // ---------------------------------------------------------------------------
  await t.test('LUD-21: invoice callback should return verify URL in response payload', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/alice?amount=5000'
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.ok(body.verify, 'Should include verify field')
    assert.ok(body.verify.startsWith('https://pay.alice.me/verify/'))
  })

  await t.test('LUD-21: /verify/:paymentHash should report settled: false for unpaid invoice', async () => {
    const invRes = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/alice?amount=1000'
    })
    const { verify } = invRes.json()
    const paymentHash = verify.split('/').pop()

    const verifyRes = await fastify.inject({
      method: 'GET',
      url: `/verify/${paymentHash}`
    })
    assert.equal(verifyRes.statusCode, 200)
    const body = verifyRes.json()
    assert.equal(body.status, 'OK')
    assert.equal(body.settled, false)
    assert.equal(body.preimage, null)
    assert.ok(body.pr.startsWith('lnbc'))
  })

  await t.test('LUD-21: /verify/:paymentHash should report settled: true and preimage when settled', async () => {
    const invRes = await fastify.inject({
      method: 'GET',
      url: '/.well-known/lnurlp/alice?amount=1000'
    })
    const { verify } = invRes.json()
    const paymentHash = verify.split('/').pop()

    // Simulate invoice settlement
    const mockPreimage = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff'
    const inv = mockInvoices.get(paymentHash)
    inv.settled = true
    inv.preImage = mockPreimage

    const verifyRes = await fastify.inject({
      method: 'GET',
      url: `/verify/${paymentHash}`
    })
    assert.equal(verifyRes.statusCode, 200)
    const body = verifyRes.json()
    assert.equal(body.status, 'OK')
    assert.equal(body.settled, true)
    assert.equal(body.preimage, mockPreimage)
    assert.ok(body.pr.startsWith('lnbc'))

    // Test alias endpoint: /.well-known/lnurlp/verify/:paymentHash
    const aliasRes = await fastify.inject({
      method: 'GET',
      url: `/.well-known/lnurlp/verify/${paymentHash}`
    })
    assert.equal(aliasRes.statusCode, 200)
    assert.deepEqual(aliasRes.json(), body)
  })

  await t.test('LUD-21: /verify/:paymentHash with invalid hash format returns 400', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/verify/short-hash'
    })
    assert.equal(res.statusCode, 400)
    assert.equal(res.json().status, 'ERROR')
  })

  await t.test('LUD-21: /verify/:paymentHash for unknown invoice returns 404', async () => {
    const nonExistentHash = '0000000000000000000000000000000000000000000000000000000000000000'
    const res = await fastify.inject({
      method: 'GET',
      url: `/verify/${nonExistentHash}`
    })
    assert.equal(res.statusCode, 404)
    assert.equal(res.json().status, 'ERROR')
    assert.equal(res.json().reason, 'Invoice not found')
  })

  await fastify.close()
})
