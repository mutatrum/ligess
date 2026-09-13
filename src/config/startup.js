require('dotenv').config()

const startup = (env = process.env) => {
  const requiredKeys = ['LIGESS_USERNAME', 'LIGESS_DOMAIN', 'LIGESS_LN_BACKEND']
  checkKeys(requiredKeys, env)

  const backend = (env.LIGESS_LN_BACKEND || '').toLowerCase().trim()

  switch (backend) {
    case 'lnd':
      checkKeys(['LIGESS_LND_REST', 'LIGESS_LND_MACAROON'], env)
      if (!env.LIGESS_LND_REST.startsWith('https:') && !env.LIGESS_LND_REST.startsWith('http:')) {
        console.warn('Warning: LIGESS_LND_REST should start with http: or https:')
      }
      break

    case 'eclair':
      checkKeys(['LIGESS_ECLAIR_REST', 'LIGESS_ECLAIR_PASSWORD'], env)
      break

    case 'lnbits':
      checkKeys(['LIGESS_LNBITS_DOMAIN', 'LIGESS_LNBITS_API_KEY'], env)
      break

    case 'cln':
      checkKeys(['LIGESS_CLN_REST'], env)
      if (!env.LIGESS_CLN_MACAROON && !env.LIGESS_CLN_RUNE) {
        console.error('Either LIGESS_CLN_MACAROON or LIGESS_CLN_RUNE must be defined for CLN backend')
        process.exit(1)
      }
      break

    case 'phoenixd':
      checkKeys(['LIGESS_PHOENIXD_PASSWORD'], env)
      break

    case 'nwc':
      checkKeys(['LIGESS_NWC_URI'], env)
      if (!env.LIGESS_NWC_URI.startsWith('nostr+walletconnect:')) {
        console.error('LIGESS_NWC_URI must start with nostr+walletconnect:')
        process.exit(1)
      }
      break

    case 'ldk':
      checkKeys(['LIGESS_LDK_URL'], env)
      break

    case 'blink':
      checkKeys(['LIGESS_BLINK_API_KEY'], env)
      break

    case 'cashu':
      checkKeys(['LIGESS_CASHU_MINT_URL'], env)
      break

    default:
      console.error(`Unsupported backend: ${env.LIGESS_LN_BACKEND}`)
      process.exit(1)
  }
}

const checkKeys = (keys, env = process.env) => {
  for (const key of keys) {
    if (!env[key]) {
      console.error(`Env variable ${key} is not defined`)
      process.exit(1)
    }
  }
}

module.exports = { startup }
