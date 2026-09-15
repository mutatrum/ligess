const { describe, it } = require('node:test')
const assert = require('node:assert')
const LndBackend = require('../src/backends/lnd')
const LnbitsBackend = require('../src/backends/lnbits')
const EclairBackend = require('../src/backends/eclair')
const ClnBackend = require('../src/backends/cln')
const PhoenixdBackend = require('../src/backends/phoenixd')
const NwcBackend = require('../src/backends/nwc')
const LdkBackend = require('../src/backends/ldk')
const BlinkBackend = require('../src/backends/blink')
const CashuBackend = require('../src/backends/cashu')
const { createBackend } = require('../src/backends/factory')

describe('Backend Drivers & Factory', () => {
  it('should instantiate LND driver and normalize invoices', () => {
    const lnd = new LndBackend({
      url: 'https://127.0.0.1:8080',
      hexMacaroon: '020102'
    })
    assert.strictEqual(lnd.baseUrl, 'https://127.0.0.1:8080')

    const normalized = lnd._normalizeInvoice({
      payment_request: 'lnbc100u1test',
      r_hash: Buffer.from('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 'hex').toString('base64'),
      settled: true,
      settle_date: '1690000000',
      value: '100',
      value_msat: '100000'
    })

    assert.strictEqual(normalized.bolt11, 'lnbc100u1test')
    assert.strictEqual(normalized.settled, true)
    assert.strictEqual(normalized.status, 'Settled')
    assert.strictEqual(normalized.amountMsat, 100000)
  })

  it('should instantiate LNbits driver', () => {
    const lnbits = new LnbitsBackend({
      url: 'https://legend.lnbits.com',
      apiKey: 'test_api_key'
    })
    assert.strictEqual(lnbits.baseUrl, 'https://legend.lnbits.com')
    assert.strictEqual(lnbits.apiKey, 'test_api_key')
  })

  it('should instantiate Eclair driver', () => {
    const eclair = new EclairBackend({
      url: 'http://127.0.0.1:8082',
      login: 'user',
      password: 'pwd'
    })
    assert.strictEqual(eclair.baseUrl, 'http://127.0.0.1:8082')
  })

  it('should instantiate CLN driver', () => {
    const cln = new ClnBackend({
      url: 'https://127.0.0.1:3010',
      rune: 'test_rune'
    })
    assert.strictEqual(cln.baseUrl, 'https://127.0.0.1:3010')
    assert.strictEqual(cln.rune, 'test_rune')
  })

  it('should instantiate Phoenixd driver with basic auth', () => {
    const phoenixd = new PhoenixdBackend({
      url: 'http://127.0.0.1:9740',
      password: 'secret_phoenixd_pwd'
    })
    assert.strictEqual(phoenixd.baseUrl, 'http://127.0.0.1:9740')
    const expectedAuth = 'Basic ' + Buffer.from(':secret_phoenixd_pwd').toString('base64')
    assert.strictEqual(phoenixd.authHeader, expectedAuth)
  })

  it('should instantiate Upstream NWC client driver and parse URI', () => {
    const testPrivKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const testWalletPubkey = '4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff'
    const uri = `nostr+walletconnect://${testWalletPubkey}?relay=wss://relay.damus.io&secret=${testPrivKey}`

    const nwc = new NwcBackend({ uri })
    assert.strictEqual(nwc.walletPubkey, testWalletPubkey)
    assert.strictEqual(nwc.relayUrl, 'wss://relay.damus.io')
    assert.ok(nwc.clientPubkey)
  })

  it('should reject invalid NWC URI', () => {
    assert.throws(() => {
      new NwcBackend({ uri: 'https://invalid-uri' })
    }, /Invalid NWC URI/)
  })

  it('should instantiate LDK Node driver', () => {
    const ldk = new LdkBackend({
      url: 'http://127.0.0.1:3000',
      apiKey: 'ldk_token_123'
    })
    assert.strictEqual(ldk.baseUrl, 'http://127.0.0.1:3000')
    assert.strictEqual(ldk.apiKey, 'ldk_token_123')
  })

  it('should instantiate Blink / Galoy GraphQL driver', () => {
    const blink = new BlinkBackend({
      url: 'https://api.blink.sv/graphql',
      apiKey: 'blink_key_abc',
      walletId: 'btc_wallet_456'
    })
    assert.strictEqual(blink.url, 'https://api.blink.sv/graphql')
    assert.strictEqual(blink.apiKey, 'blink_key_abc')
    assert.strictEqual(blink.walletId, 'btc_wallet_456')
  })

  it('should instantiate Cashu Mint driver', () => {
    const cashu = new CashuBackend({
      mintUrl: 'https://mint.minibits.cash/Bitcoin'
    })
    assert.strictEqual(cashu.mintUrl, 'https://mint.minibits.cash/Bitcoin')
  })

  it('should resolve all 9 backends via factory createBackend case-insensitively', () => {
    const env = {
      LIGESS_LND_REST: 'https://127.0.0.1:8080',
      LIGESS_LND_MACAROON: '00',
      LIGESS_CLN_REST: 'https://127.0.0.1:3010',
      LIGESS_CLN_RUNE: 'rune',
      LIGESS_LNBITS_DOMAIN: 'https://lnbits.com',
      LIGESS_LNBITS_API_KEY: 'key',
      LIGESS_ECLAIR_REST: 'http://127.0.0.1:8082',
      LIGESS_ECLAIR_LOGIN: 'u',
      LIGESS_ECLAIR_PASSWORD: 'p',
      LIGESS_PHOENIXD_URL: 'http://127.0.0.1:9740',
      LIGESS_PHOENIXD_PASSWORD: 'pwd',
      LIGESS_NWC_URI: 'nostr+walletconnect://4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff?relay=wss://relay.damus.io&secret=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      LIGESS_LDK_URL: 'http://127.0.0.1:3000',
      LIGESS_BLINK_API_KEY: 'key',
      LIGESS_CASHU_MINT_URL: 'https://mint.minibits.cash/Bitcoin'
    }

    const lnd = createBackend('LND', env)
    assert.ok(lnd instanceof LndBackend)

    const cln = createBackend('cln', env)
    assert.ok(cln instanceof ClnBackend)

    const lnbits = createBackend('LNbits', env)
    assert.ok(lnbits instanceof LnbitsBackend)

    const eclair = createBackend('Eclair', env)
    assert.ok(eclair instanceof EclairBackend)

    const phoenixd = createBackend('phoenixd', env)
    assert.ok(phoenixd instanceof PhoenixdBackend)

    const nwc = createBackend('NWC', env)
    assert.ok(nwc instanceof NwcBackend)

    const ldk = createBackend('ldk', env)
    assert.ok(ldk instanceof LdkBackend)

    const blink = createBackend('Blink', env)
    assert.ok(blink instanceof BlinkBackend)

    const cashu = createBackend('cashu', env)
    assert.ok(cashu instanceof CashuBackend)
  })

  it('CLN driver should validate payKeysend params and format request', async () => {
    const cln = new ClnBackend({ url: 'https://127.0.0.1:3010', rune: 'test_rune' })
    await assert.rejects(async () => {
      await cln.payKeysend({ pubkey: '02test' })
    }, (err) => err.code === 'BAD_REQUEST')

    let requestedMethod = ''
    let requestedPath = ''
    let requestedData = null
    cln._request = async (method, path, data) => {
      requestedMethod = method
      requestedPath = path
      requestedData = data
      return {
        payment_preimage: 'preimage_hex_123',
        payment_hash: 'hash_hex_123',
        amount_sent_msat: 1050,
        amount_msat: 1000
      }
    }

    const res = await cln.payKeysend({
      pubkey: '02abc',
      amountMsats: 1000,
      tlvRecords: [{ type: 5482373484, value: 'feedbeef' }]
    })

    assert.strictEqual(requestedMethod, 'POST')
    assert.strictEqual(requestedPath, '/v1/keysend')
    assert.strictEqual(requestedData.destination, '02abc')
    assert.strictEqual(requestedData.amount_msat, 1000)
    assert.strictEqual(requestedData.extratlvs['5482373484'], 'feedbeef')
    assert.strictEqual(res.paymentPreimage, 'preimage_hex_123')
    assert.strictEqual(res.feesAmountMsats, 50)
  })

  it('CLN driver should normalize listTransactions from invoices and pays', async () => {
    const cln = new ClnBackend({ url: 'https://127.0.0.1:3010', rune: 'test_rune' })
    cln._request = async (method, path) => {
      if (path === '/v1/invoice/listInvoices') {
        return {
          invoices: [
            {
              status: 'paid',
              bolt11: 'lnbc1...',
              payment_hash: 'hash1',
              payment_preimage: 'pre1',
              amount_msat: 2000,
              paid_at: 1690000050,
              expires_at: 1690003600
            }
          ]
        }
      }
      if (path === '/v1/pay/listPays') {
        return {
          pays: [
            {
              status: 'complete',
              bolt11: 'lnbc2...',
              payment_hash: 'hash2',
              preimage: 'pre2',
              amount_msat: 5000,
              amount_sent_msat: 5020,
              created_at: 1690000100
            }
          ]
        }
      }
      return {}
    }

    const txs = await cln.listTransactions({ limit: 10 })
    assert.strictEqual(txs.length, 2)
    assert.strictEqual(txs[0].type, 'outgoing')
    assert.strictEqual(txs[0].amount, 5000)
    assert.strictEqual(txs[0].fees_paid, 20)
    assert.strictEqual(txs[1].type, 'incoming')
    assert.strictEqual(txs[1].amount, 2000)
  })

  it('NWC driver should send pay_keysend and list_transactions commands', async () => {
    const nwc = new NwcBackend({
      uri: 'nostr+walletconnect://4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff?relay=wss://relay.damus.io&secret=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    })

    let sentMethod = ''
    let sentParams = null
    nwc._sendNwcCommand = async (method, params) => {
      sentMethod = method
      sentParams = params
      if (method === 'pay_keysend') {
        return { preimage: 'nwc_preimage', payment_hash: 'nwc_hash', fees_paid: 12 }
      }
      if (method === 'list_transactions') {
        return { transactions: [{ type: 'incoming', amount: 500 }] }
      }
      return {}
    }

    const payRes = await nwc.payKeysend({ pubkey: '02pub', amountMsats: 3000, preimage: 'custom_pre' })
    assert.strictEqual(sentMethod, 'pay_keysend')
    assert.strictEqual(sentParams.pubkey, '02pub')
    assert.strictEqual(sentParams.amount, 3000)
    assert.strictEqual(sentParams.preimage, 'custom_pre')
    assert.strictEqual(payRes.paymentPreimage, 'nwc_preimage')
    assert.strictEqual(payRes.feesAmountMsats, 12)

    const listRes = await nwc.listTransactions({ limit: 5 })
    assert.strictEqual(sentMethod, 'list_transactions')
    assert.strictEqual(sentParams.limit, 5)
    assert.strictEqual(listRes.length, 1)
    assert.strictEqual(listRes[0].amount, 500)
  })
})

