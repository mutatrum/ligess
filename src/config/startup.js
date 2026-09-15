require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { verifyBip353Dns } = require("../../bin/bip353")

const checkLegacyFiles = (env = process.env, cwd = process.cwd()) => {
  const warnings = []

  const metaEnv = env.LIGESS_NOSTR_METADATA_FILE
  const metaFile = path.join(cwd, "metadata.json")
  if (metaEnv) {
    warnings.push(
      "LIGESS_NOSTR_METADATA_FILE (" + metaEnv + ") is deprecated. Define your profile metadata directly in .env (LIGESS_NOSTR_DISPLAY_NAME, LIGESS_NOSTR_ABOUT, LIGESS_NOSTR_PICTURE, etc.)."
    )
  } else if (fs.existsSync(metaFile)) {
    warnings.push(
      "Legacy file \"" + metaFile + "\" detected. Profile metadata is now configured via .env (LIGESS_NOSTR_DISPLAY_NAME, LIGESS_NOSTR_ABOUT, LIGESS_NOSTR_PICTURE, etc.)."
    )
  }

  const relayEnv = env.LIGESS_NOSTR_RELAY_INFORMATION
  const relayFile = path.join(cwd, "relayInformation.json")
  if (relayEnv) {
    warnings.push(
      "LIGESS_NOSTR_RELAY_INFORMATION (" + relayEnv + ") is deprecated. Relay information is now dynamically generated. Relay metadata can be configured via .env (LIGESS_RELAY_NAME, LIGESS_RELAY_DESCRIPTION, LIGESS_RELAY_CONTACT, LIGESS_RELAY_ICON)."
    )
  } else if (fs.existsSync(relayFile)) {
    warnings.push(
      "Legacy file \"" + relayFile + "\" detected. Relay information is now dynamically generated. Relay metadata can be configured via .env (LIGESS_RELAY_NAME, LIGESS_RELAY_DESCRIPTION, LIGESS_RELAY_CONTACT, LIGESS_RELAY_ICON)."
    )
  }

  for (const w of warnings) {
    console.warn("\x1b[33m[DEPRECATION WARNING]\x1b[0m " + w)
  }

  return warnings
}

const checkBip353OnStartup = (env = process.env) => {
  if (!env.LIGESS_BOLT12_OFFER) return null
  const user = env.LIGESS_USERNAME
  const domain = env.LIGESS_DOMAIN
  if (!user || !domain) return null

  // Non-blocking asynchronous DNS check so server boot is instantaneous
  return verifyBip353Dns(user, domain, env.LIGESS_BOLT12_OFFER)
    .then((res) => {
      if (res.status === "FOUND") {
        if (res.matches) {
          console.log(`\x1b[32m✔ [BIP-353]\x1b[0m DNS TXT record verified for ${user}@${domain}`)
        } else {
          console.warn(`\x1b[33m⚠ [BIP-353]\x1b[0m DNS TXT record found for ${user}@${domain}, but offer does not match LIGESS_BOLT12_OFFER!`)
        }
      } else {
        console.warn(`\x1b[33m⚠ [BIP-353]\x1b[0m No live DNS TXT record found for ${user}.user._bitcoin-payment.${domain} (${res.error}). Run "npm run bip353" for setup.`)
      }
      return res
    })
    .catch(() => {})
}

const startup = (env = process.env) => {
  checkLegacyFiles(env)
  checkBip353OnStartup(env)

  const requiredKeys = ["LIGESS_USERNAME", "LIGESS_DOMAIN", "LIGESS_LN_BACKEND"]
  checkKeys(requiredKeys, env)

  const backend = (env.LIGESS_LN_BACKEND || "").toLowerCase().trim()

  switch (backend) {
    case "lnd": {
      checkKeys(["LIGESS_LND_REST", "LIGESS_LND_MACAROON"], env)
      if (!env.LIGESS_LND_REST.startsWith("https:") && !env.LIGESS_LND_REST.startsWith("http:")) {
        console.warn("Warning: LIGESS_LND_REST should start with http: or https:")
      }
      const lndInfo = inspectLndMacaroon(env.LIGESS_LND_MACAROON)
      if (lndInfo) {
        if (lndInfo.isAdmin) {
          console.warn(`\x1b[33m⚠ [LND Macaroon]\x1b[0m Admin permissions detected [fp: ${lndInfo.fingerprint}, ${lndInfo.permissions.length} perms]. Consider baking a restricted macaroon per README.`)
        } else if (lndInfo.hasOffchainWrite) {
          console.log(`\x1b[36m⚡ [LND Macaroon]\x1b[0m Full / NWC Spending Mode [fp: ${lndInfo.fingerprint}, permissions: ${lndInfo.permissions.join(', ')}]`)
        } else if (lndInfo.permissions.length > 0) {
          console.log(`\x1b[32m🔒 [LND Macaroon]\x1b[0m Receive-Only Mode [fp: ${lndInfo.fingerprint}, permissions: ${lndInfo.permissions.join(', ')}]`)
        } else {
          console.log(`\x1b[36m⚡ [LND Macaroon]\x1b[0m Macaroon loaded [fp: ${lndInfo.fingerprint}, length: ${lndInfo.byteLength} bytes]`)
        }
      }
      break
    }

    case "eclair":
      checkKeys(["LIGESS_ECLAIR_REST", "LIGESS_ECLAIR_PASSWORD"], env)
      console.log(`\x1b[36m⚡ [Eclair]\x1b[0m Connected to ${env.LIGESS_ECLAIR_REST} (Basic auth: ${env.LIGESS_ECLAIR_LOGIN || 'default'})`)
      break

    case "lnbits": {
      checkKeys(["LIGESS_LNBITS_DOMAIN", "LIGESS_LNBITS_API_KEY"], env)
      const crypto = require('crypto')
      const fp = crypto.createHash('sha256').update(env.LIGESS_LNBITS_API_KEY || '').digest('hex').slice(0, 8)
      console.log(`\x1b[36m⚡ [LNbits]\x1b[0m Connected to ${env.LIGESS_LNBITS_DOMAIN} (API key fp: ${fp})`)
      break
    }

    case "cln": {
      checkKeys(["LIGESS_CLN_REST"], env)
      if (!env.LIGESS_CLN_MACAROON && !env.LIGESS_CLN_RUNE) {
        console.error("Either LIGESS_CLN_MACAROON or LIGESS_CLN_RUNE must be defined for CLN backend")
        process.exit(1)
      }
      if (env.LIGESS_CLN_RUNE) {
        const runeInfo = inspectClnRune(env.LIGESS_CLN_RUNE)
        if (runeInfo) {
          if (runeInfo.isMaster) {
            console.warn(`\x1b[33m⚠ [CLN Rune]\x1b[0m Master rune without restrictions detected. Consider restricting rune per README.`)
          } else {
            console.log(`\x1b[32m🔒 [CLN Rune]\x1b[0m Restricted rune active [${runeInfo.restrictions.join(', ')}]`)
          }
        }
      } else if (env.LIGESS_CLN_MACAROON) {
        const clnMacInfo = inspectLndMacaroon(env.LIGESS_CLN_MACAROON)
        if (clnMacInfo) {
          console.log(`\x1b[36m⚡ [CLN Macaroon]\x1b[0m Macaroon loaded [fp: ${clnMacInfo.fingerprint}]`)
        }
      }
      break
    }

    case "phoenixd":
      checkKeys(["LIGESS_PHOENIXD_PASSWORD"], env)
      console.log(`\x1b[36m⚡ [Phoenixd]\x1b[0m Connected to ${env.LIGESS_PHOENIXD_URL || 'http://127.0.0.1:9740'} (HTTP password auth)`)
      break

    case "nwc": {
      checkKeys(["LIGESS_NWC_URI"], env)
      if (!env.LIGESS_NWC_URI.startsWith("nostr+walletconnect:")) {
        console.error("LIGESS_NWC_URI must start with nostr+walletconnect:")
        process.exit(1)
      }
      try {
        const url = new URL(env.LIGESS_NWC_URI.replace('nostr+walletconnect:', 'http:'))
        const walletPubkey = url.hostname || url.pathname.replace(/^\/\//, '')
        const relay = url.searchParams.get('relay') || 'default'
        console.log(`\x1b[36m⚡ [Upstream NWC]\x1b[0m Connected to wallet ${walletPubkey.slice(0, 8)}... via ${relay}`)
      } catch (_) {
        console.log(`\x1b[36m⚡ [Upstream NWC]\x1b[0m URI configured`)
      }
      break
    }

    case "ldk":
      checkKeys(["LIGESS_LDK_URL"], env)
      console.log(`\x1b[36m⚡ [LDK Node]\x1b[0m Connected to ${env.LIGESS_LDK_URL} (API key auth)`)
      break

    case "blink":
      checkKeys(["LIGESS_BLINK_API_KEY"], env)
      console.log(`\x1b[36m⚡ [Blink]\x1b[0m Connected to ${env.LIGESS_BLINK_URL || 'https://api.blink.sv/graphql'} (GraphQL API key auth)`)
      break

    case "cashu":
      checkKeys(["LIGESS_CASHU_MINT_URL"], env)
      console.log(`\x1b[32m🥜 [Cashu Mint]\x1b[0m Gateway to ${env.LIGESS_CASHU_MINT_URL} (Open ecash quotes, zero node credentials)`)
      break

    default:
      console.error("Unsupported backend: " + env.LIGESS_LN_BACKEND)
      process.exit(1)
  }
}

const checkKeys = (keys, env = process.env) => {
  for (const key of keys) {
    if (!env[key]) {
      console.error("Env variable " + key + " is not defined")
      process.exit(1)
    }
  }
}

function parseProtobufFields(buffer) {
  let offset = 0
  const fields = []
  while (offset < buffer.length) {
    const key = buffer[offset++]
    const fieldNum = key >> 3
    const wireType = key & 7
    if (wireType === 0) {
      let val = 0, shift = 0
      while (true) {
        if (offset >= buffer.length) break
        const b = buffer[offset++]
        val |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      fields.push({ fieldNum, wireType, val })
    } else if (wireType === 2) {
      let len = 0, shift = 0
      while (true) {
        if (offset >= buffer.length) break
        const b = buffer[offset++]
        len |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      if (offset + len > buffer.length) break
      const data = buffer.slice(offset, offset + len)
      offset += len
      fields.push({ fieldNum, wireType, data })
    } else {
      break
    }
  }
  return fields
}

function inspectLndMacaroon(macaroonHex) {
  if (!macaroonHex || typeof macaroonHex !== 'string') return null
  try {
    const crypto = require('crypto')
    const buf = Buffer.from(macaroonHex.trim(), 'hex')
    if (buf.length < 10) return null

    const fingerprint = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
    const version = buf[0]
    let identifier = null

    if (version === 2) {
      let offset = 1
      while (offset < buf.length) {
        const type = buf[offset++]
        if (type === 0) break
        let len = 0, shift = 0
        while (true) {
          if (offset >= buf.length) break
          const b = buf[offset++]
          len |= (b & 0x7f) << shift
          if ((b & 0x80) === 0) break
          shift += 7
        }
        if (offset + len > buf.length) break
        const data = buf.slice(offset, offset + len)
        offset += len
        if (type === 2) identifier = data
      }
    }

    const permissions = []
    if (identifier && identifier.length > 1) {
      const protoBuf = identifier.slice(1)
      const idFields = parseProtobufFields(protoBuf)
      const ops = idFields.filter(f => f.fieldNum === 3)
      for (const op of ops) {
        const opFields = parseProtobufFields(op.data)
        const entity = opFields.find(f => f.fieldNum === 1)?.data?.toString('utf8')
        const actions = opFields.filter(f => f.fieldNum === 2).map(f => f.data.toString('utf8'))
        if (entity) {
          for (const act of actions) {
            permissions.push(`${entity}:${act}`)
          }
        }
      }
    }

    const hasOffchainWrite = permissions.includes('offchain:write')
    const hasInvoices = permissions.some(p => p.startsWith('invoices:'))
    const isAdmin = permissions.some(p => p.startsWith('macaroon:') || p.startsWith('signer:'))

    let mode = 'Unknown'
    if (isAdmin) {
      mode = 'Admin (Full Access)'
    } else if (hasOffchainWrite) {
      mode = 'Full Mode (Inbound & Outbound NWC Spending)'
    } else if (hasInvoices) {
      mode = 'Receive-Only Mode (Zero Outbound Spend Capability)'
    }

    return {
      fingerprint,
      permissions,
      hasOffchainWrite,
      isAdmin,
      mode,
      byteLength: buf.length
    }
  } catch (_) {
    return null
  }
}

function inspectClnRune(rune) {
  if (!rune || typeof rune !== 'string') return null
  try {
    const buf = Buffer.from(rune.trim(), 'base64')
    const str = buf.toString('latin1')
    const restrictions = str.match(/[a-zA-Z0-9_]+[=<>!~][^&|]*/g) || []
    const isMaster = restrictions.length === 0
    return { restrictions, isMaster }
  } catch (_) {
    return null
  }
}

module.exports = {
  startup,
  checkLegacyFiles,
  checkBip353OnStartup,
  inspectLndMacaroon,
  inspectClnRune
}
