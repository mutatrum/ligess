#!/usr/bin/env node
require('dotenv').config()

const { getPublicKey } = require('nostr-tools')
const qrcode = require('qrcode-terminal')
const { parsePrivateKey } = require('../src/nostr/crypto')

const args = process.argv.slice(2)
let customRelay = null
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--relay' || args[i] === '-r') && args[i + 1]) {
    customRelay = args[++i]
  }
}

const _relay = customRelay || process.env.LIGESS_NOSTR_WALLET_CONNECT_RELAY || (process.env.LIGESS_NOSTR_WALLET_CONNECT_RELAYS || '').split(',')[0]?.trim()
const rawKey = process.env.LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY
const _nostrWalletConnectEncryptPrivKey = parsePrivateKey(rawKey)
const _nostrWalletConnectEncryptPubKey = _nostrWalletConnectEncryptPrivKey ? getPublicKey(_nostrWalletConnectEncryptPrivKey) : null
const secretHex = _nostrWalletConnectEncryptPrivKey ? Buffer.from(_nostrWalletConnectEncryptPrivKey).toString('hex') : ''

if (!_nostrWalletConnectEncryptPubKey || !_relay) {
  console.error('Error: Please configure LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY and LIGESS_NOSTR_WALLET_CONNECT_RELAY (or LIGESS_NOSTR_WALLET_CONNECT_RELAYS) in .env')
  process.exit(1)
}

const nostrConnectURL = `nostr+walletconnect://${_nostrWalletConnectEncryptPubKey}?relay=${encodeURIComponent(_relay)}&secret=${secretHex}`

console.log(nostrConnectURL)
qrcode.generate(nostrConnectURL, { small: true })
