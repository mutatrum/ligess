const fs = require('fs')
const path = require('path')

const ROOT_DIR = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const PENDING_ZAPS_FILE = path.join(DATA_DIR, 'pending_zaps.json')
const NWC_SPENDS_FILE = path.join(DATA_DIR, 'zaps.json')

// Migrate legacy zaps.json if present in root directory
const LEGACY_ZAPS_FILE = path.join(ROOT_DIR, 'zaps.json')
if (fs.existsSync(LEGACY_ZAPS_FILE) && !fs.existsSync(NWC_SPENDS_FILE)) {
  try {
    fs.copyFileSync(LEGACY_ZAPS_FILE, NWC_SPENDS_FILE)
  } catch (err) {
    console.error('Failed to migrate legacy zaps.json:', err.message)
  }
}

/**
 * Atomically writes data to a file by writing to a temporary file first and renaming it.
 * This prevents corrupting the file if the process terminates mid-write.
 */
function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function readJsonSafe(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.error(`Error reading ${filePath}, falling back to default:`, err.message)
  }
  return defaultValue
}

// ----------------------------------------------------------------------------
// Pending Zap Requests Persistence
// ----------------------------------------------------------------------------

let pendingZaps = readJsonSafe(PENDING_ZAPS_FILE, {})

function storePendingZap(paymentHash, zapRequest, comment) {
  if (!paymentHash) return
  pendingZaps[paymentHash] = {
    zapRequest,
    comment,
    createdAt: Date.now()
  }
  try {
    atomicWriteJson(PENDING_ZAPS_FILE, pendingZaps)
  } catch (err) {
    console.error('Failed to persist pending zap:', err.message)
  }
}

function getPendingZap(paymentHash) {
  if (!paymentHash) return null
  return pendingZaps[paymentHash] || null
}

function removePendingZap(paymentHash) {
  if (!paymentHash || !pendingZaps[paymentHash]) return
  delete pendingZaps[paymentHash]
  try {
    atomicWriteJson(PENDING_ZAPS_FILE, pendingZaps)
  } catch (err) {
    console.error('Failed to update pending zaps file:', err.message)
  }
}

// ----------------------------------------------------------------------------
// NWC Spend / Budget Persistence
// ----------------------------------------------------------------------------

let nwcSpends = readJsonSafe(NWC_SPENDS_FILE, [])

function recordNwcSpend(amountSats, description = '') {
  const record = {
    timestamp: Date.now(),
    amount: Number(amountSats) || 0,
    description
  }
  nwcSpends.push(record)

  // Prune entries older than 48 hours to keep the state compact
  const cutoff = Date.now() - (48 * 60 * 60 * 1000)
  nwcSpends = nwcSpends.filter(item => item.timestamp > cutoff)

  try {
    atomicWriteJson(NWC_SPENDS_FILE, nwcSpends)
  } catch (err) {
    console.error('Failed to record NWC spend:', err.message)
  }
}

function getNwcSpendSum(timeWindowMs) {
  const now = Date.now()
  const cutoff = now - timeWindowMs
  return nwcSpends
    .filter(item => item.timestamp > cutoff)
    .reduce((acc, item) => acc + (item.amount || 0), 0)
}

function getAllNwcSpends(timeWindowMs = 24 * 60 * 60 * 1000) {
  const now = Date.now()
  const cutoff = now - timeWindowMs
  return nwcSpends.filter(item => item.timestamp > cutoff)
}

module.exports = {
  storePendingZap,
  getPendingZap,
  removePendingZap,
  recordNwcSpend,
  getNwcSpendSum,
  getAllNwcSpends
}
