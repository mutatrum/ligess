const test = require('node:test')
const assert = require('node:assert/strict')
const { generateSecretKey, getPublicKey, finalizeEvent, nip04, nip44, nip19 } = require('nostr-tools')

// Ensure env has wallet connect key for testing
const walletSk = generateSecretKey()
const walletPk = getPublicKey(walletSk)
process.env.LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY = Buffer.from(walletSk).toString('hex')
process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_ZAP = '1000'
process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_HOUR = '5000'
process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_DAY = '20000'

const {
  isWalletConnectEnabled,
  getSupportedMethods,
  executeMethod,
  processZapRequest,
  parsePrivateKey,
  parsePublicKey
} = require('../src/nostr/nwcServer')

test('Nostr Wallet Connect (NIP-47)', async (t) => {
  const clientSk = generateSecretKey()
  const clientPk = getPublicKey(clientSk)

  await t.test('should report wallet connect enabled and advertise methods', () => {
    assert.equal(isWalletConnectEnabled(), true)
    const methods = getSupportedMethods()
    assert.ok(methods.includes('pay_invoice'))
    assert.ok(methods.includes('get_balance'))
    assert.ok(methods.includes('get_info'))
    assert.ok(methods.includes('make_invoice'))
    assert.ok(methods.includes('lookup_invoice'))
    assert.ok(methods.includes('get_budget'))
  })

  await t.test('should parse npub and nsec keys correctly', () => {
    const npub = nip19.npubEncode(clientPk)
    assert.equal(parsePublicKey(npub), clientPk)

    const nsec = nip19.nsecEncode(clientSk)
    assert.deepEqual(parsePrivateKey(nsec), clientSk)
  })

  await t.test('should execute get_budget and report limits', async () => {
    const budget = await executeMethod('get_budget', {})
    assert.equal(budget.max_zap, 1000)
    assert.equal(budget.total_budget, 20000)
    assert.equal(typeof budget.used_budget, 'number')
  })

  await t.test('should reject make_invoice with invalid amount', async () => {
    await assert.rejects(async () => {
      await executeMethod('make_invoice', { amount: -50 })
    }, (err) => err.code === 'BAD_REQUEST')
  })

  await t.test('should reject unsupported method with NOT_IMPLEMENTED', async () => {
    await assert.rejects(async () => {
      await executeMethod('unsupported_action', {})
    }, (err) => err.code === 'NOT_IMPLEMENTED')
  })

  await t.test('should process NIP-44 encrypted request and respond with NIP-44', async () => {
    const convKey = nip44.getConversationKey(clientSk, walletPk)
    const encryptedReq = nip44.encrypt(JSON.stringify({ method: 'get_budget', params: {} }), convKey)

    const reqEvent = finalizeEvent({
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', walletPk]],
      content: encryptedReq
    }, clientSk)

    const logger = { info: () => {}, warn: () => {} }
    const respEvent = await processZapRequest(reqEvent, logger)

    assert.equal(respEvent.kind, 23195)
    assert.equal(respEvent.tags.find(t => t[0] === 'e')[1], reqEvent.id)
    assert.equal(respEvent.tags.find(t => t[0] === 'p')[1], clientPk)

    // Verify response is decryptable with NIP-44
    const decryptedResp = JSON.parse(nip44.decrypt(respEvent.content, convKey))
    assert.equal(decryptedResp.result_type, 'get_budget')
    assert.equal(decryptedResp.result.max_zap, 1000)
  })

  await t.test('should process NIP-04 encrypted request and respond with NIP-04', async () => {
    const encryptedReq = await nip04.encrypt(clientSk, walletPk, JSON.stringify({ method: 'get_budget', params: {} }))

    const reqEvent = finalizeEvent({
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', walletPk]],
      content: encryptedReq
    }, clientSk)

    const logger = { info: () => {}, warn: () => {} }
    const respEvent = await processZapRequest(reqEvent, logger)

    assert.equal(respEvent.kind, 23195)
    assert.ok(respEvent.content.includes('?iv=')) // NIP-04 ciphertext signature

    const decryptedResp = JSON.parse(await nip04.decrypt(clientSk, walletPk, respEvent.content))
    assert.equal(decryptedResp.result_type, 'get_budget')
    assert.equal(decryptedResp.result.max_zap, 1000)
  })
})
