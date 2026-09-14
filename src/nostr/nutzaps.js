const fs = require('fs')
const path = require('path')
const { Mint, Wallet, getPubKeyFromPrivKey } = require('@cashu/cashu-ts')
const { SimplePool, finalizeEvent, getPublicKey } = require('nostr-tools')
const { parsePrivateKey, parsePublicKey } = require('./crypto')
const { getLnClient } = require('../backends/factory')

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

const ROOT_DIR = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const NUTZAPS_FILE = path.join(DATA_DIR, 'nutzaps.json')

function loadClaimedNutzaps() {
  try {
    if (fs.existsSync(NUTZAPS_FILE)) {
      return JSON.parse(fs.readFileSync(NUTZAPS_FILE, 'utf8'))
    }
  } catch (_) {}
  return {}
}

function saveClaimedNutzap(id, record) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    const current = loadClaimedNutzaps()
    current[id] = { ...record, timestamp: Date.now() }
    const tmp = `${NUTZAPS_FILE}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8')
    fs.renameSync(tmp, NUTZAPS_FILE)
  } catch (err) {
    console.error('Failed to save claimed nutzap:', err.message)
  }
}

function isNutzapEnabled(env = process.env) {
  if (env.LIGESS_NUTZAP_ENABLED === 'false') return false
  return env.LIGESS_NUTZAP_ENABLED === 'true' || Boolean(env.LIGESS_NUTZAP_MINTS)
}

function getTrustedMints(env = process.env) {
  if (env.LIGESS_NUTZAP_MINTS) {
    return env.LIGESS_NUTZAP_MINTS.split(',').map(m => m.trim().replace(/\/+$/, '')).filter(Boolean)
  }
  return [
    'https://mint.minibits.cash/Bitcoin',
    'https://mint.coinos.io'
  ]
}

function getNutzapRelays(env = process.env) {
  if (env.LIGESS_NUTZAP_RELAYS) {
    return env.LIGESS_NUTZAP_RELAYS.split(',').map(r => r.trim()).filter(Boolean)
  }
  if (env.LIGESS_NOSTR_WALLET_CONNECT_RELAYS) {
    return env.LIGESS_NOSTR_WALLET_CONNECT_RELAYS.split(',').map(r => r.trim()).filter(Boolean)
  }
  return [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net'
  ]
}

/**
 * Derives the P2PK public key and corresponding signing private key.
 * In NIP-61, public keys are compressed with '02' prefix (even Y).
 */
function getP2PKKeys(nostrPrivKey) {
  const privBytes = parsePrivateKey(nostrPrivKey)
  if (!privBytes) return null

  const nostrPubHex = getPublicKey(privBytes)
  const p2pkPubHex = '02' + nostrPubHex

  const compressedPub = Buffer.from(getPubKeyFromPrivKey(privBytes)).toString('hex')
  let p2pkPrivBytes = privBytes

  // If the un-negated scalar produces an odd Y coordinate (03), negate it so it matches the 02 prefix
  if (compressedPub.startsWith('03')) {
    const privHex = Buffer.from(privBytes).toString('hex')
    const d = BigInt('0x' + privHex)
    const negatedD = (SECP256K1_N - d).toString(16).padStart(64, '0')
    p2pkPrivBytes = Uint8Array.from(Buffer.from(negatedD, 'hex'))
  }

  return {
    nostrPubHex,
    p2pkPubHex,
    p2pkPrivBytes
  }
}

/**
 * Constructs the NIP-61 kind 10019 Nutzap Info Announcement Event
 */
function buildNutzapInfoEvent(env = process.env) {
  const privKey = env.LIGESS_NUTZAP_PRIVATE_KEY || env.LIGESS_NOSTR_ZAPPER_PRIVATE_KEY
  const keys = getP2PKKeys(privKey)
  if (!keys) return null

  const mints = getTrustedMints(env)
  const relays = getNutzapRelays(env)

  const tags = [
    ...relays.map(r => ['relay', r]),
    ...mints.map(m => ['mint', m, 'sat']),
    ['pubkey', keys.p2pkPubHex]
  ]

  return {
    kind: 10019,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
    tags
  }
}

/**
 * Processes an incoming kind 9321 Nutzap event
 */
async function processNutzapEvent(event, { autoMelt = true, getBackend = getLnClient, env = process.env } = {}) {
  if (!event || event.kind !== 9321) return { success: false, reason: 'Invalid event kind' }

  const claimed = loadClaimedNutzaps()
  if (claimed[event.id]) {
    return { success: false, reason: 'Nutzap already claimed' }
  }

  const privKey = env.LIGESS_NUTZAP_PRIVATE_KEY || env.LIGESS_NOSTR_ZAPPER_PRIVATE_KEY
  const keys = getP2PKKeys(privKey)
  if (!keys) {
    return { success: false, reason: 'No private key configured for Nutzap redemption' }
  }

  // Extract mint URL and proofs from event tags
  const mintTag = event.tags.find(t => t[0] === 'u')
  if (!mintTag || !mintTag[1]) {
    return { success: false, reason: 'Missing mint tag (u) in nutzap event' }
  }
  const mintUrl = mintTag[1].replace(/\/+$/, '')

  const proofTags = event.tags.filter(t => t[0] === 'proof')
  if (proofTags.length === 0) {
    return { success: false, reason: 'No proofs found in nutzap event' }
  }

  const proofs = []
  let totalSat = 0
  for (const p of proofTags) {
    try {
      const parsed = typeof p[1] === 'string' ? JSON.parse(p[1]) : p[1]
      proofs.push(parsed)
      totalSat += (parsed.amount || 0)
    } catch (_) {
      // Ignore malformed individual proofs
    }
  }

  if (proofs.length === 0 || totalSat <= 0) {
    return { success: false, reason: 'Zero or invalid proof amount' }
  }

  // Connect to the mint using @cashu/cashu-ts
  const mint = new Mint(mintUrl)
  const wallet = new Wallet(mint)

  // Sign P2PK proofs with recipient's private key (NUT-11)
  let signedProofs
  try {
    signedProofs = wallet.signP2PKProofs(proofs, [keys.p2pkPrivBytes])
  } catch (err) {
    return { success: false, reason: `Failed to sign P2PK witness: ${err.message}` }
  }

  // Auto-melt to native Lightning if configured
  if (autoMelt && getBackend) {
    try {
      const backend = getBackend()
      const invoiceMemo = `Nutzap from Nostr (${event.id.slice(0, 8)})`
      const invoice = await backend.createInvoice({
        amountMsats: totalSat * 1000,
        memo: invoiceMemo
      })

      const meltQuote = await wallet.createMeltQuote(invoice.bolt11)
      await wallet.meltProofs(meltQuote, signedProofs)

      saveClaimedNutzap(event.id, {
        amountSat: totalSat,
        mint: mintUrl,
        melted: true,
        invoice: invoice.bolt11
      })

      console.log(`\x1b[32m⚡ [NUTZAP]\x1b[0m Received & melted ${totalSat} sats into Lightning node from ${event.pubkey.slice(0, 8)}!`)

      return {
        success: true,
        melted: true,
        amountSat: totalSat,
        eventId: event.id
      }
    } catch (err) {
      console.error('Nutzap auto-melt failed:', err.message)
      return { success: false, reason: `Auto-melt failed: ${err.message}` }
    }
  }

  // If not auto-melting, store unspent proofs
  saveClaimedNutzap(event.id, {
    amountSat: totalSat,
    mint: mintUrl,
    melted: false,
    proofs: signedProofs
  })

  return {
    success: true,
    melted: false,
    amountSat: totalSat,
    eventId: event.id
  }
}

/**
 * Starts the background Nutzap service (publishes kind 10019, listens to kind 9321)
 */
function startNutzapService(env = process.env, getBackend = getLnClient) {
  if (!isNutzapEnabled(env)) return null

  const privKey = env.LIGESS_NUTZAP_PRIVATE_KEY || env.LIGESS_NOSTR_ZAPPER_PRIVATE_KEY
  const keys = getP2PKKeys(privKey)
  if (!keys) {
    console.warn('Nutzap service enabled but no private key configured.')
    return null
  }

  const relays = getNutzapRelays(env)
  const autoMelt = env.LIGESS_NUTZAP_AUTO_MELT !== 'false'
  const pool = new SimplePool()

  // 1. Publish kind 10019 Nutzap Info Announcement
  try {
    const raw10019 = buildNutzapInfoEvent(env)
    const privBytes = parsePrivateKey(privKey)
    const signed10019 = finalizeEvent(raw10019, privBytes)
    Promise.any(pool.publish(relays, signed10019)).catch(() => {})
    console.log(`\x1b[35m🥜 [NUTZAP]\x1b[0m Published NIP-61 kind 10019 announcement for ${keys.nostrPubHex.slice(0, 8)}`)
  } catch (err) {
    console.error('Failed to publish kind 10019 nutzap announcement:', err.message)
  }

  // 2. Subscribe to incoming kind 9321 Nutzap events
  const filter = {
    kinds: [9321],
    '#p': [keys.nostrPubHex]
  }

  console.log(`\x1b[35m🥜 [NUTZAP]\x1b[0m Listening for incoming Nutzaps on ${relays.length} relays...`)
  const sub = pool.subscribeMany(relays, [filter], {
    onevent: async (event) => {
      try {
        await processNutzapEvent(event, { autoMelt, getBackend, env })
      } catch (err) {
        console.error('Error handling nutzap event:', err.message)
      }
    }
  })

  return {
    close: () => {
      try {
        sub.close()
        pool.close(relays)
      } catch (_) {}
    }
  }
}

module.exports = {
  isNutzapEnabled,
  getTrustedMints,
  getNutzapRelays,
  getP2PKKeys,
  buildNutzapInfoEvent,
  processNutzapEvent,
  startNutzapService
}
