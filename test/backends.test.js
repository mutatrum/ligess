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
})
