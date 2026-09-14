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
    case "lnd":
      checkKeys(["LIGESS_LND_REST", "LIGESS_LND_MACAROON"], env)
      if (!env.LIGESS_LND_REST.startsWith("https:") && !env.LIGESS_LND_REST.startsWith("http:")) {
        console.warn("Warning: LIGESS_LND_REST should start with http: or https:")
      }
      break

    case "eclair":
      checkKeys(["LIGESS_ECLAIR_REST", "LIGESS_ECLAIR_PASSWORD"], env)
      break

    case "lnbits":
      checkKeys(["LIGESS_LNBITS_DOMAIN", "LIGESS_LNBITS_API_KEY"], env)
      break

    case "cln":
      checkKeys(["LIGESS_CLN_REST"], env)
      if (!env.LIGESS_CLN_MACAROON && !env.LIGESS_CLN_RUNE) {
        console.error("Either LIGESS_CLN_MACAROON or LIGESS_CLN_RUNE must be defined for CLN backend")
        process.exit(1)
      }
      break

    case "phoenixd":
      checkKeys(["LIGESS_PHOENIXD_PASSWORD"], env)
      break

    case "nwc":
      checkKeys(["LIGESS_NWC_URI"], env)
      if (!env.LIGESS_NWC_URI.startsWith("nostr+walletconnect:")) {
        console.error("LIGESS_NWC_URI must start with nostr+walletconnect:")
        process.exit(1)
      }
      break

    case "ldk":
      checkKeys(["LIGESS_LDK_URL"], env)
      break

    case "blink":
      checkKeys(["LIGESS_BLINK_API_KEY"], env)
      break

    case "cashu":
      checkKeys(["LIGESS_CASHU_MINT_URL"], env)
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

module.exports = { startup, checkLegacyFiles, checkBip353OnStartup }
