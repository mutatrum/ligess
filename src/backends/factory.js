const LndBackend = require('./lnd')
const ClnBackend = require('./cln')
const LnbitsBackend = require('./lnbits')
const EclairBackend = require('./eclair')
const PhoenixdBackend = require('./phoenixd')
const NwcBackend = require('./nwc')
const LdkBackend = require('./ldk')
const BlinkBackend = require('./blink')
const CashuBackend = require('./cashu')

const createBackend = (type = process.env.LIGESS_LN_BACKEND, env = process.env) => {
  const normalized = (type || '').toLowerCase().trim()
  const proxy = env.LIGESS_TOR_PROXY_URL || null

  switch (normalized) {
    case 'lnd':
      return new LndBackend({
        url: env.LIGESS_LND_REST,
        hexMacaroon: env.LIGESS_LND_MACAROON,
        socksProxyUrl: proxy
      })

    case 'cln':
      return new ClnBackend({
        url: env.LIGESS_CLN_REST,
        hexMacaroon: env.LIGESS_CLN_MACAROON,
        rune: env.LIGESS_CLN_RUNE,
        socksProxyUrl: proxy
      })

    case 'lnbits':
      return new LnbitsBackend({
        url: env.LIGESS_LNBITS_DOMAIN,
        apiKey: env.LIGESS_LNBITS_API_KEY,
        socksProxyUrl: proxy
      })

    case 'eclair':
      return new EclairBackend({
        url: env.LIGESS_ECLAIR_REST,
        login: env.LIGESS_ECLAIR_LOGIN,
        password: env.LIGESS_ECLAIR_PASSWORD,
        socksProxyUrl: proxy
      })

    case 'phoenixd':
      return new PhoenixdBackend({
        url: env.LIGESS_PHOENIXD_URL || 'http://127.0.0.1:9740',
        password: env.LIGESS_PHOENIXD_PASSWORD,
        socksProxyUrl: proxy
      })

    case 'nwc':
      return new NwcBackend({
        uri: env.LIGESS_NWC_URI
      })

    case 'ldk':
      return new LdkBackend({
        url: env.LIGESS_LDK_URL || 'http://127.0.0.1:3000',
        apiKey: env.LIGESS_LDK_API_KEY || env.LIGESS_LDK_TOKEN,
        socksProxyUrl: proxy
      })

    case 'blink':
      return new BlinkBackend({
        url: env.LIGESS_BLINK_URL || 'https://api.blink.sv/graphql',
        apiKey: env.LIGESS_BLINK_API_KEY,
        walletId: env.LIGESS_BLINK_WALLET_ID,
        socksProxyUrl: proxy
      })

    case 'cashu':
      return new CashuBackend({
        mintUrl: env.LIGESS_CASHU_MINT_URL,
        socksProxyUrl: proxy
      })

    default:
      throw new Error(`Unsupported backend: ${type}`)
  }
}

let _singletonClient = null
const getLnClient = () => {
  if (!_singletonClient) {
    _singletonClient = createBackend()
  }
  return _singletonClient
}

module.exports = {
  createBackend,
  getLnClient
}
