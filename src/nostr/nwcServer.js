try {
  globalThis.WebSocket = require('ws')
} catch (_) {}

const { finalizeEvent, verifyEvent, getPublicKey, nip19, SimplePool } = require('nostr-tools')
const { getLnClient } = require('../backends/factory')
const { lndkClient } = require('../clients/lndk')
const { parsePrivateKey, parsePublicKey, decryptNwcPayload, encryptNwcPayload, getTags } = require('./crypto')
const crypto = require('crypto')
const bolt11 = require('bolt11')
const fs = require('fs')
const db = require('../storage/db')
const { TIME_WINDOWS } = require('../config/constants')

const _nostrWalletConnectEncryptPrivKey = parsePrivateKey(process.env.LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY)
const _nostrWalletConnectEncryptPubKey = _nostrWalletConnectEncryptPrivKey ? getPublicKey(_nostrWalletConnectEncryptPrivKey) : null
const _nostrWalletConnectAuthPubKey = parsePublicKey(process.env.LIGESS_NOSTR_WALLET_CONNECT_PUBLIC_KEY)
const _nostrWalletConnectRelay = process.env.LIGESS_NOSTR_WALLET_CONNECT_RELAY
const _nostrWalletConnectRelayHost = _nostrWalletConnectRelay ? (() => {
  try { return new URL(_nostrWalletConnectRelay).hostname } catch (_) { return null }
})() : null

const _nostrWalletConnectBudgetZap = process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_ZAP ? Number(process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_ZAP) : 0
const _nostrWalletConnectBudgetHour = process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_HOUR ? Number(process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_HOUR) : 0
const _nostrWalletConnectBudgetDay = process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_DAY ? Number(process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_DAY) : 0

const isWalletConnectEnabled = () => _nostrWalletConnectEncryptPrivKey !== null && _nostrWalletConnectEncryptPrivKey !== undefined

function getSupportedMethods() {
  const methods = ['pay_invoice', 'get_balance', 'get_info', 'make_invoice', 'lookup_invoice', 'get_budget']
  if (lndkClient.isEnabled()) methods.push('pay_offer')
  return methods
}

const getNostrRelayInformation = (file) => {
  if (file && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  return null
}

const _nostrRelayInformation = getNostrRelayInformation(process.env.LIGESS_NOSTR_RELAY_INFORMATION)

const getWalletConnectHandler = () => (request, reply) => {
  if (_nostrRelayInformation) {
    reply.send(_nostrRelayInformation)
  } else {
    reply.code(404).send()
  }
}

const getWalletConnectWsHandler = () => {
  return handleRelayConnection
}

// Inbound WebSocket Handler for embedded /relay/ endpoint
const handleRelayConnection = (connection, request) => {
  const logger = request.log
  const challenge = crypto.randomBytes(20).toString('hex')
  let isAuthenticated = !_nostrWalletConnectAuthPubKey
  let zapRequest = null
  let subscriptionId = null

  connection.socket.on('message', async (data) => {
    try {
      const message = JSON.parse(data)
      logger.info({ msg: 'Message received', message })

      switch (message[0]) {
        case 'REQ':
          subscriptionId = message[1]
          const payload = message[2]
          if (payload.kinds && payload.kinds.includes(13194)) {
            const response = finalizeEvent({
              kind: 13194,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['encryption', 'nip44 nip04']],
              content: getSupportedMethods().join(' ')
            }, _nostrWalletConnectEncryptPrivKey)
            send('EVENT', subscriptionId, response)
          }
          send('EOSE', subscriptionId)
          break

        case 'EVENT':
          await verifyZapRequest(message[1])
          zapRequest = message[1]
          await checkProgress()
          break

        case 'AUTH':
          const authPubkey = await verifyAuthResponse(message[1], challenge)
          if (!isAuthenticated) logger.info(`Connection is authenticated: ${nip19.npubEncode(authPubkey)}`)
          isAuthenticated = true
          await checkProgress()
          break
      }
    } catch (error) {
      logger.warn({ msg: error.message })
      connection.socket.close()
    }
  })

  async function checkProgress() {
    if (!isAuthenticated) return
    if (!zapRequest) return

    const zapResponse = await processZapRequest(zapRequest, logger)
    send('EVENT', subscriptionId, zapResponse)
    zapRequest = null
  }

  connection.socket.on('close', (code, reason) => {
    if (code !== 1000) {
      logger.info({ msg: 'Connection closed', code, reason })
    }
  })

  connection.socket.on('error', (message) => {
    logger.info({ msg: message })
  })

  if (_nostrWalletConnectAuthPubKey) {
    send('AUTH', challenge)
    setTimeout(() => {
      if (!isAuthenticated) {
        logger.info({ msg: 'Closing unauthenticated idle connection' })
        connection.socket.close()
      }
    }, 10000)
  }

  function send(...message) {
    logger.info({ msg: 'Message sent', message })
    connection.socket.send(JSON.stringify(message))
  }
}

async function verifyZapRequest(zapRequest) {
  if (zapRequest.kind !== 23194) {
    throw new Error('Event is not a zap request')
  }

  if (Math.abs(zapRequest.created_at - Math.floor(Date.now() / 1000)) > 120) {
    throw new Error('Timestamp out of bounds')
  }

  const ptags = getTags(zapRequest.tags, 'p')
  if (ptags.length === 0 || ptags[0][1] !== _nostrWalletConnectEncryptPubKey) {
    throw new Error('Event is not addressed to this wallet')
  }

  if (!verifyEvent(zapRequest)) {
    throw new Error('Invalid signature on zap request')
  }
}

async function verifyAuthResponse(authResponse, challenge) {
  if (authResponse.kind !== 22242) {
    throw new Error('Auth event is not an auth response')
  }

  if (Math.abs(authResponse.created_at - Math.floor(Date.now() / 1000)) > 60) {
    throw new Error('Timestamp out of bounds')
  }

  const challengeTags = getTags(authResponse.tags, 'challenge')
  if (challengeTags.length !== 1 || challengeTags[0][1] !== challenge) {
    throw new Error('Challenge does not match')
  }

  const relayTags = getTags(authResponse.tags, 'relay')
  if (relayTags.length !== 1) {
    throw new Error('Relay tags invalid length')
  }

  const relay = new URL(relayTags[0][1])
  if (relay.protocol !== 'ws:' && relay.protocol !== 'wss:') {
    throw new Error('Invalid relay protocol')
  }

  if (process.env.HOST !== '0.0.0.0' && _nostrWalletConnectRelayHost && relay.hostname !== _nostrWalletConnectRelayHost) {
    throw new Error('Relay host mismatch')
  }

  if (!verifyEvent(authResponse)) {
    throw new Error('Invalid signature on auth response')
  }

  if (authResponse.pubkey !== _nostrWalletConnectAuthPubKey && authResponse.pubkey !== _nostrWalletConnectEncryptPubKey) {
    throw new Error(`Authentication of unknown pubkey: ${nip19.npubEncode(authResponse.pubkey)}`)
  }

  return authResponse.pubkey
}

function mapErrorCode(err) {
  if (err.code && ['RATE_LIMITED', 'NOT_IMPLEMENTED', 'INSUFFICIENT_BALANCE', 'PAYMENT_FAILED', 'EXPIRED', 'RESTRICTED', 'BAD_REQUEST', 'INTERNAL', 'OTHER'].includes(err.code)) {
    return err.code
  }
  const msg = err.message || ''
  if (msg.includes('budget') || msg.includes('too large')) return 'RESTRICTED'
  if (msg.includes('NOT_IMPLEMENTED') || msg.includes('not supported') || msg.includes('not enabled')) return 'NOT_IMPLEMENTED'
  if (msg.includes('balance')) return 'INSUFFICIENT_BALANCE'
  if (msg.includes('route') || msg.includes('payment failed')) return 'PAYMENT_FAILED'
  if (msg.includes('Missing') || msg.includes('Invalid')) return 'BAD_REQUEST'
  return 'OTHER'
}

async function executeMethod(method, params, logger = console) {
  const getClient = () => getLnClient()

  switch (method) {
    case 'get_info': {
      const info = await getClient().getInfo().catch(() => ({ alias: 'Ligess', pubkey: '', version: '1.0' }))
      return {
        alias: info.alias || 'Ligess',
        color: '#f59e0b',
        pubkey: info.pubkey || '',
        network: 'mainnet',
        methods: getSupportedMethods(),
        notifications: []
      }
    }

    case 'get_balance': {
      const bal = await getClient().getBalance()
      return {
        balance: Math.floor(bal.balanceMsats)
      }
    }

    case 'get_budget': {
      const usedDay = db.getNwcSpendSum(TIME_WINDOWS.DAY)
      const usedHour = db.getNwcSpendSum(TIME_WINDOWS.HOUR)
      return {
        total_budget: _nostrWalletConnectBudgetDay || null,
        used_budget: usedDay,
        max_zap: _nostrWalletConnectBudgetZap || null,
        used_hour: usedHour,
        budget_hour: _nostrWalletConnectBudgetHour || null
      }
    }

    case 'make_invoice': {
      const amount = Number(params?.amount)
      if (!amount || isNaN(amount) || amount <= 0) {
        const err = new Error('Missing or invalid amount parameter (must be positive msats)')
        err.code = 'BAD_REQUEST'
        throw err
      }
      const created = await getClient().createInvoice({
        amountMsats: amount,
        memo: params.description,
        descriptionHash: params.description_hash,
        expiry: params.expiry ? Number(params.expiry) : 3600
      })
      return {
        invoice: created.bolt11,
        payment_hash: created.paymentHash
      }
    }

    case 'lookup_invoice': {
      let paymentHash = params?.payment_hash
      if (!paymentHash && params?.invoice) {
        try {
          const decoded = bolt11.decode(params.invoice)
          paymentHash = decoded.tagsObject.payment_hash
        } catch (_) {}
      }
      if (!paymentHash) {
        const err = new Error('Missing payment_hash or invoice parameter')
        err.code = 'BAD_REQUEST'
        throw err
      }
      const inv = await getClient().getInvoice(paymentHash)
      return {
        type: 'incoming',
        invoice: inv.bolt11 || '',
        description: inv.memo || '',
        description_hash: inv.descriptionHash || null,
        preimage: inv.preImage || null,
        payment_hash: inv.paymentHash,
        amount: inv.amountMsats || (inv.amount ? inv.amount * 1000 : 0),
        settled_at: inv.settled && inv.settleDate ? Math.floor(new Date(inv.settleDate).getTime() / 1000) : null
      }
    }

    case 'pay_invoice': {
      if (!params || !params.invoice) {
        const err = new Error('Missing invoice parameter')
        err.code = 'BAD_REQUEST'
        throw err
      }
      const decoded = bolt11.decode(params.invoice)
      const satoshis = decoded.satoshis || (params.amount ? Math.ceil(Number(params.amount) / 1000) : 0)
      verifyZapAmount(satoshis, logger)

      const paid = await getClient().payInvoice({
        bolt11: decoded.paymentRequest,
        amountMsats: params.amount
      })
      db.recordNwcSpend(satoshis, decoded.tagsObject.payment_hash || '')
      return {
        preimage: paid.paymentPreimage
      }
    }

    case 'pay_offer': {
      if (!lndkClient.isEnabled()) {
        const err = new Error('BOLT12 pay_offer is not enabled on this server')
        err.code = 'NOT_IMPLEMENTED'
        throw err
      }
      const offer = params?.offer
      if (!offer) {
        const err = new Error('Missing offer parameter')
        err.code = 'BAD_REQUEST'
        throw err
      }
      const amountMsats = Number(params.amount) || 0
      const amountSats = Math.ceil(amountMsats / 1000)
      if (amountSats > 0) {
        verifyZapAmount(amountSats, logger)
      }

      const paid = await lndkClient.payOffer({
        offer,
        amountMsats,
        payerNote: params.payer_note
      })

      if (amountSats > 0) {
        db.recordNwcSpend(amountSats, offer)
      }
      return {
        preimage: paid.paymentPreimage
      }
    }

    default: {
      const err = new Error(`Method ${method} is not supported`)
      err.code = 'NOT_IMPLEMENTED'
      throw err
    }
  }
}

async function processZapRequest(zapRequest, logger = console) {
  let encryption = 'nip44'
  const responseContent = {}

  try {
    const decryptedData = await decryptNwcPayload(_nostrWalletConnectEncryptPrivKey, zapRequest.pubkey, zapRequest.content)
    encryption = decryptedData.encryption
    const payRequest = decryptedData.payload

    if (logger.info) logger.info({ msg: 'NWC command received', method: payRequest.method, encryption })

    responseContent.result_type = payRequest.method
    const result = await executeMethod(payRequest.method, payRequest.params, logger)
    responseContent.result = result
  } catch (error) {
    if (logger.warn) logger.warn({ msg: 'Error processing NWC request', error: error.message })
    responseContent.error = {
      code: mapErrorCode(error),
      message: error.message
    }
  }

  const encrypted = await encryptNwcPayload(_nostrWalletConnectEncryptPrivKey, zapRequest.pubkey, responseContent, encryption)

  return finalizeEvent({
    kind: 23195,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', zapRequest.pubkey], ['e', zapRequest.id]],
    content: encrypted
  }, _nostrWalletConnectEncryptPrivKey)
}

function verifyZapAmount(satoshis, logger) {
  if (_nostrWalletConnectBudgetZap > 0 && satoshis > _nostrWalletConnectBudgetZap) {
    throw new Error('Zap amount too large')
  }

  const zapAmountLastDay = db.getNwcSpendSum(TIME_WINDOWS.DAY)
  if (_nostrWalletConnectBudgetDay > 0 && zapAmountLastDay + satoshis > _nostrWalletConnectBudgetDay) {
    throw new Error('Zap amount over day budget')
  }

  const zapAmountLastHour = db.getNwcSpendSum(TIME_WINDOWS.HOUR)
  if (_nostrWalletConnectBudgetHour > 0 && zapAmountLastHour + satoshis > _nostrWalletConnectBudgetHour) {
    throw new Error('Zap amount over hour budget')
  }

  if (logger && logger.info) {
    logger.info({ msg: 'NWC budget checked', amount: satoshis, hour: zapAmountLastHour, day: zapAmountLastDay })
  }
}

// Outbound Relay Client Manager
let outboundPool = null
const processedEvents = new Set()

function startOutboundRelayClient(relays = [], logger = console) {
  if (!isWalletConnectEnabled() || relays.length === 0) return null

  if (outboundPool) {
    outboundPool.close(relays)
  }

  outboundPool = new SimplePool()

  if (logger.info) logger.info(`[NWC Outbound] Connecting to relays: ${relays.join(', ')}`)

  // 1. Publish Kind 13194 Info Event
  const infoEvent = finalizeEvent({
    kind: 13194,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['encryption', 'nip44 nip04']],
    content: getSupportedMethods().join(' ')
  }, _nostrWalletConnectEncryptPrivKey)

  Promise.allSettled(outboundPool.publish(relays, infoEvent)).catch(() => {})

  // 2. Subscribe to Kind 23194 requests
  const filter = {
    kinds: [23194],
    '#p': [_nostrWalletConnectEncryptPubKey],
    since: Math.floor(Date.now() / 1000) - 30
  }

  const sub = outboundPool.subscribe(relays, filter, {
    async onevent(event) {
      if (processedEvents.has(event.id)) return
      processedEvents.add(event.id)
      if (processedEvents.size > 2000) {
        const oldest = processedEvents.values().next().value
        processedEvents.delete(oldest)
      }

      try {
        await verifyZapRequest(event)
        if (_nostrWalletConnectAuthPubKey && event.pubkey !== _nostrWalletConnectAuthPubKey) {
          if (logger.warn) logger.warn(`[NWC Outbound] Rejected request from unauthorized pubkey: ${nip19.npubEncode(event.pubkey)}`)
          return
        }

        if (logger.info) logger.info(`[NWC Outbound] Processing request from ${nip19.npubEncode(event.pubkey)}`)
        const responseEvent = await processZapRequest(event, logger)

        Promise.allSettled(outboundPool.publish(relays, responseEvent)).catch(() => {})
      } catch (err) {
        if (logger.warn) logger.warn(`[NWC Outbound] Failed to process event ${event.id}: ${err.message}`)
      }
    }
  })

  return { pool: outboundPool, subscription: sub }
}

module.exports = {
  isWalletConnectEnabled,
  getWalletConnectHandler,
  getWalletConnectWsHandler,
  startOutboundRelayClient,
  processZapRequest,
  executeMethod,
  getSupportedMethods,
  parsePrivateKey,
  parsePublicKey
}
