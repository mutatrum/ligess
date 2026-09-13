const test = require('node:test')
const assert = require('node:assert/strict')
const { generateSecretKey, getPublicKey, finalizeEvent, nip19 } = require('nostr-tools')
const { parsePrivateKey, verifyZapRequest, handleInvoiceUpdate } = require('../nostr')
const db = require('../db')

test('Nostr Stack & Zap Validation', async (t) => {
  const sk = generateSecretKey()
  const pk = getPublicKey(sk)
  const nsec = nip19.nsecEncode(sk)

  await t.test('should parse both hex and nsec keys correctly', () => {
    const fromHex = parsePrivateKey(Buffer.from(sk).toString('hex'))
    assert.deepEqual(fromHex, sk)

    const fromNsec = parsePrivateKey(nsec)
    assert.deepEqual(fromNsec, sk)
  })

  await t.test('should validate a correct kind 9734 zap request', async () => {
    const zapReq = finalizeEvent({
      kind: 9734,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', pk],
        ['relays', 'wss://relay.damus.io', 'wss://nos.lol'],
        ['amount', '21000']
      ],
      content: 'Great post!'
    }, sk)

    const verified = await verifyZapRequest(zapReq, 21000)
    assert.equal(verified.id, zapReq.id)
  })

  await t.test('should validate NIP-33 "a" tag coordinate on zap request', async () => {
    const validCoord = '30023:4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff:my-article'
    const zapReq = finalizeEvent({
      kind: 9734,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', pk],
        ['relays', 'wss://relay.damus.io'],
        ['amount', '5000'],
        ['a', validCoord]
      ],
      content: 'Zap for long-form post'
    }, sk)

    const verified = await verifyZapRequest(zapReq, 5000)
    assert.equal(verified.id, zapReq.id)
  })

  await t.test('should reject zap request with invalid signature', async () => {
    const zapReq = finalizeEvent({
      kind: 9734,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', pk],
        ['relays', 'wss://relay.damus.io']
      ],
      content: 'Tampered'
    }, sk)

    // Simulate deserialization from wire where verifiedSymbol is not present
    const wireZapReq = JSON.parse(JSON.stringify(zapReq))
    wireZapReq.content = 'Hacked'
    await assert.rejects(async () => {
      await verifyZapRequest(wireZapReq)
    }, /Invalid signature/)
  })

  await t.test('should reject zap request with missing p tag', async () => {
    const zapReq = finalizeEvent({
      kind: 9734,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['relays', 'wss://relay.damus.io']
      ],
      content: 'No p tag'
    }, sk)

    await assert.rejects(async () => {
      await verifyZapRequest(zapReq)
    }, /No p tag/)
  })

  await t.test('should clean up pending zap when invoice is cancelled', async () => {
    const testHash = 'test_cancel_hash_' + Date.now()
    db.storePendingZap(testHash, { id: 'dummy' }, 'comment')
    assert.ok(db.getPendingZap(testHash))

    await handleInvoiceUpdate({
      paymentHash: testHash,
      status: 'Cancelled',
      settled: false
    })

    assert.equal(db.getPendingZap(testHash), null)
  })
})
