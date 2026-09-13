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

module.exports = {
  BACKENDS,
  TIME_WINDOWS,
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
