const REPO_URL = "https://git.mutatrum.com/mutatrum/ligess"

const BACKENDS = {
  LND: 'LND',
  LNbits: 'LNbits',
  Eclair: 'Eclair',
  CLN: 'CLN',
  Phoenixd: 'Phoenixd',
  NWC: 'NWC',
  LDK: 'LDK',
  Blink: 'Blink',
  Cashu: 'Cashu'
}

const TIME_WINDOWS = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000
}

const DEFAULT_PAYER_DATA_CONFIG = {
  name: { mandatory: false },
  identifier: { mandatory: false },
  email: { mandatory: false },
  pubkey: { mandatory: false }
}

module.exports = {
  REPO_URL,
  BACKENDS,
  TIME_WINDOWS,
  DEFAULT_PAYER_DATA_CONFIG,
  // Individual constant exports for backward compatibility
  LND: BACKENDS.LND,
  LNbits: BACKENDS.LNbits,
  Eclair: BACKENDS.Eclair,
  CLN: BACKENDS.CLN,
  Phoenixd: BACKENDS.Phoenixd,
  NWC: BACKENDS.NWC,
  LDK: BACKENDS.LDK,
  Blink: BACKENDS.Blink,
  Cashu: BACKENDS.Cashu
}

