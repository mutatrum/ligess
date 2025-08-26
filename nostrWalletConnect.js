const fastify = require('fastify')({ logger: true })
const { signId, calculateId, verifyEvent, getPublicKey, decryptDm, encryptDm } = require('nostr')
const { bech32 } = require('bech32')
const buffer = require('buffer')
const { getLnClient } = require('./lnClient')
const crypto = require('crypto')
const bolt11 = require('bolt11')
const fs = require('fs')

const unaWrapper = getLnClient()

const _nostrWalletConnectEncryptPrivKey = process.env.LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY
const _nostrWalletConnectEncryptPubKey = _nostrWalletConnectEncryptPrivKey ? getPublicKey(_nostrWalletConnectEncryptPrivKey) : null
const _nostrWalletConnectAuthPubKey = process.env.LIGESS_NOSTR_WALLET_CONNECT_PUBLIC_KEY
const _nostrWalletConnectRelayHost = new URL(process.env.LIGESS_NOSTR_WALLET_CONNECT_RELAY).hostname
const _nostrWalletConnectBudgetZap = process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_ZAP
const _nostrWalletConnectBudgetHour = process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_HOUR
const _nostrWalletConnectBudgetDay = process.env.LIGESS_NOSTR_WALLET_CONNECT_BUDGET_DAY

const ZAPS_FILE = 'zaps.json'

const TIME_WINDOW_HOUR = 60 * 60 * 1000
const TIME_WINDOW_DAY = TIME_WINDOW_HOUR * 24

let zaps = []
if (fs.existsSync(ZAPS_FILE)) {
  zaps = JSON.parse(fs.readFileSync(ZAPS_FILE))
  zaps = filterZaps(TIME_WINDOW_DAY)
}

const isWalletConnectEnabled = () => _nostrWalletConnectEncryptPrivKey !== undefined

const getNostrRelayInformation = (file) => {
  if (file) {
    if (!fs.existsSync(file)) {
      throw new Error(`Relay information file ${file} not found`)
    }
    let content = JSON.parse(fs.readFileSync(file))
    fastify.log.info({msg: 'Nostr Wallet Connect Relay Information (NIP-11) enabled', content: content})
    return content
  }
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
  fastify.log.info({msg: 'Nostr Wallet Connect (NIP-47) enabled', npub: encode('npub', _nostrWalletConnectEncryptPubKey)})

  if (_nostrWalletConnectAuthPubKey) {
    fastify.log.info({msg: 'Nostr Wallet Connect Authentication (NIP-42) enabled', npub: encode('npub', _nostrWalletConnectAuthPubKey)})
  }
  
  fastify.log.info({msg: `Nostr Wallet Connect budget: max zap ${_nostrWalletConnectBudgetZap}, hourly: ${_nostrWalletConnectBudgetDay}, daily: ${_nostrWalletConnectBudgetHour}`})

  return handleRelayConnection
}

const handleRelayConnection = (connection, request) => {

  const logger = request.log

  const challenge = crypto.randomBytes(20).toString('hex')
  let isAuthenticated = false

  let zapRequest = null

  let subscriptionId = null

  connection.socket.on('message', async (data) => {

    try {
      const message = JSON.parse(data);

      logger.info({msg: 'Message received', message: message})

      switch(message[0])
      {
        case 'REQ':
          subscriptionId = message[1]
          const payload = message[2]
          if (payload.kinds && payload.kinds.includes(13194)) {
            let response = {
              created_at: Math.round(Date.now() / 1000),
              pubkey: _nostrWalletConnectEncryptPubKey,
              kind: 13194,
              content: 'pay_invoice'
            }
            response.id = await calculateId(response)
            response.sig = await signId(_nostrWalletConnectEncryptPrivKey, response.id)
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
          if (!isAuthenticated) logger.info(`Connection is authenticated: ${encode('npub', authPubkey)}`)
          isAuthenticated = true
          await checkProgress()
          break
      }
    }
    catch (error) {
      logger.warn({msg: error.message})
      connection.socket.close()
    }
  })

  async function checkProgress() {
    if (!isAuthenticated) return
    if (!zapRequest) return

    let zapResponse = await processZapRequest(zapRequest, logger)

    send('EVENT', subscriptionId, zapResponse)

    zapRequest = null
  }
  
  connection.socket.on('close', async (code, reason) => {
    if (code !== 1000) {
      logger.info({msg: 'Connection closed', code: code, reason: reason})
    }
  })

  connection.socket.on('error', async (message) => {
    logger.info({msg: message})
  })

  send('AUTH',challenge)

  setTimeout(() => {
    if (!isAuthenticated) {
      logger.info({msg: 'Closing idle connection'})
      connection.socket.close()
    }
  }, 10000)

  function send(...message) {
    logger.info({msg: 'Message sent', message: message})
    connection.socket.send(JSON.stringify(message))
  }
}

async function verifyZapRequest(zapRequest) {
  if (zapRequest.kind !== 23194)
    throw new Error('Event is not a zap request')

  if (Math.abs(zapRequest.created_at - Math.floor(Date.now() / 1000)) > 10)
    throw new Error('Timestamp out of bounds')

  if (zapRequest.pubkey !== _nostrWalletConnectEncryptPubKey)
    throw new Error('Event has unknown pubkey')

  if (!zapRequest.tags || zapRequest.tags.length === 0)
    throw new Error('No tags on zap request')

  const ptags = getTags(zapRequest.tags, 'p')
  if (ptags.length === 0)
    throw new Error('No p tag on zap request')
  if (ptags.length >= 2)
    throw new Error('Multiple p tags on zap request')

  const etags = getTags(zapRequest.tags, 'e')
  if (etags.length >= 2)
    throw new Error('Multiple e tags on zap request')

  if (await calculateId(zapRequest) !== zapRequest.id)
    throw new Error('Invalid id on zap request')
  if (!await verifyEvent(zapRequest))
    throw new Error('Invalid signature in zap request')
}

async function verifyAuthResponse(authResponse, challenge) {
  if (authResponse.kind !== 22242)
    throw new Error('Auth event is not an auth response')

  if (Math.abs(authResponse.created_at - Math.floor(Date.now() / 1000)) > 10)
    throw new Error('Timestamp out of bounds')

  const challengeTags = getTags(authResponse.tags, 'challenge')
  if (challengeTags.length !== 1)
    throw new Error('Challange tags invalid length')
  if (challengeTags[0][1] !== challenge)
    throw new Error('Challenge does not match')

  const relayTags = getTags(authResponse.tags, 'relay')
  if (relayTags.length !== 1)
    throw new Error('Relay tags invalid length')
  let relay = new URL(relayTags[0][1])

  if (relay.protocol !== 'ws:' && relay.protocol !== 'wss:')
    throw new Error('Invalid relay protocol')

  if (process.env.HOST !== '0.0.0.0' && relay.host !== _nostrWalletConnectRelayHost)
    throw new Error('Relay host mismatch')

  if (await calculateId(authResponse) !== authResponse.id)
    throw new Error('Invalid id on auth response')
  if (!await verifyEvent(authResponse))
    throw new Error('Invalid signature in auth response')

  // AUTH response could be on either pubkey
  if (authResponse.pubkey !== _nostrWalletConnectAuthPubKey && authResponse.pubkey !== _nostrWalletConnectEncryptPubKey)
    throw new Error(`Authentication of unknown pubkey: ${encode('npub', authResponse.pubkey)}`)

  return authResponse.pubkey
}

async function processZapRequest(zapRequest, logger) {
  let response = {
    kind: 23195,
    pubkey: _nostrWalletConnectEncryptPubKey,
    created_at: Math.round(Date.now() / 1000),
    content: {
      result_type: 'pay_invoice',
    },
    tags: [['e', zapRequest.id]]
  }

  try {
    const invoice = decryptInvoice(zapRequest, logger)
  
    verifyZapAmount(invoice.satoshis, logger)
  
    let invoicePaid = await unaWrapper.payInvoice({bolt11: invoice.paymentRequest})

    logger.info({msg: 'Invoice paid', result: invoicePaid})

    zaps.push({ timestamp: Date.now(), amount: invoice.satoshis })
    fs.writeFileSync(ZAPS_FILE, JSON.stringify(zaps))

    response.content.result = {
      preimage: invoicePaid.paymentPreimage
    }
  }
  catch (error) {
    logger.warn({msg: 'Error processing zap request', error: error.message})

    response.kind = 23196
    response.content.error = {
      code: error.name ?? 'OTHER',
      message: error.message 
    }

  }

  response.content = encryptDm(_nostrWalletConnectEncryptPrivKey, _nostrWalletConnectEncryptPubKey, JSON.stringify(response.content))
  response.id = await calculateId(response)
  response.sig = await signId(_nostrWalletConnectEncryptPrivKey, response.id)

  return response
}

function decryptInvoice(zapRequest, logger) {
  const decrypted = decryptDm(_nostrWalletConnectEncryptPrivKey, zapRequest)
  const payRequest = JSON.parse(decrypted)

  logger.info({ msg: 'Pay request', content: payRequest })

  if (payRequest.method !== 'pay_invoice')
    throw new Error('NOT_IMPLEMENTED', 'Unknown method on zap request')

  const invoice = bolt11.decode(payRequest.params.invoice)

  logger.info({msg: 'Invoice', invoice: invoice})
    
  return invoice
}

function verifyZapAmount(satoshis, logger) {
  if (satoshis > _nostrWalletConnectBudgetZap)
    throw new Error('Zap amount too large')

  zaps = filterZaps(TIME_WINDOW_DAY)

  const zapAmountLastDay = sumAmount(zaps)
  if (zapAmountLastDay + satoshis > _nostrWalletConnectBudgetDay)
    throw new Error('Zap amount over day budget')

  const zapAmountLastHour = sumAmount(filterZaps(TIME_WINDOW_HOUR))
  if (zapAmountLastHour + satoshis > _nostrWalletConnectBudgetHour)
    throw new Error('Zap amount over hour budget')

  logger.info({ msg: 'Total', hour: zapAmountLastHour, day: zapAmountLastDay })
}

function encode(prefix, hex) {
  let words = bech32.toWords(buffer.Buffer.from(hex, 'hex'));
  return bech32.encode(prefix, words);
}

function getTags(tags, tag) {
  return tags.filter(t => t && t.length && t.length >= 2 && t[0] === tag)
}

function filterZaps(timeWindow) {
  let now = Date.now()
  return zaps.filter(zap => zap.timestamp > now - timeWindow)
}

function sumAmount(entries) {
  return entries.reduce((acc, zap) => acc + zap.amount, 0);
}

module.exports = { isWalletConnectEnabled, getWalletConnectHandler, getWalletConnectWsHandler }