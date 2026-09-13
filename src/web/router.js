const { bech32 } = require('bech32')
const crypto = require('crypto')
const { getLnClient } = require('../backends/factory')
const { getNostrZapperPubKey, verifyZapRequest, storePendingZapRequest, handleInvoiceUpdate } = require('../nostr/zaps')
const { isWalletConnectEnabled, getWalletConnectHandler, getWalletConnectWsHandler, startOutboundRelayClient } = require('../nostr/nwcServer')
const { parsePublicKey } = require('../nostr/crypto')
const { renderLandingPage } = require('./landingPage')

function registerRoutes(fastify) {
  const _username = process.env.LIGESS_USERNAME
  const _domain = process.env.LIGESS_DOMAIN
  const _identifier = `${_username}@${_domain}`
  const _lnurlpUrl = `https://${_domain}/.well-known/lnurlp/${_username}`
  const _metadata = [['text/identifier', _identifier], ['text/plain', `Satoshis to ${_identifier}`]]
  const _nostrZapperPubKey = getNostrZapperPubKey()
  const _nostrProfilePubKey = process.env.LIGESS_NOSTR_PUBKEY ? parsePublicKey(process.env.LIGESS_NOSTR_PUBKEY) : _nostrZapperPubKey

  // CORS hook to allow browser-based Nostr apps to query LNURL and NIP-05
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (request.method === 'OPTIONS') {
      reply.status(204).send()
    }
  })

  // Sliding-window rate limiter for invoice generation
  const rateLimitMap = new Map()
  const RATE_LIMIT_WINDOW_MS = 60 * 1000
  const MAX_REQUESTS_PER_WINDOW = 30

  function checkRateLimit(ip) {
    const now = Date.now()
    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS }
    if (now > record.resetTime) {
      record.count = 1
      record.resetTime = now + RATE_LIMIT_WINDOW_MS
    } else {
      record.count++
    }
    rateLimitMap.set(ip, record)
    return record.count <= MAX_REQUESTS_PER_WINDOW
  }

  // Home / Web Portal
  fastify.get('/', async (request, reply) => {
    const words = bech32.toWords(Buffer.from(_lnurlpUrl, 'utf8'))
    const lnurlpBech32 = bech32.encode('lnurl', words, 1023)

    const acceptsHtml = request.headers.accept && request.headers.accept.includes('text/html')
    if (acceptsHtml || request.query.format === 'html') {
      reply.type('text/html')
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('X-Frame-Options', 'SAMEORIGIN')
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src * data:; connect-src 'self';")
      return renderLandingPage({
        username: _username,
        domain: _domain,
        identifier: _identifier,
        lnurlBech32: lnurlpBech32,
        bolt12Offer: process.env.LIGESS_BOLT12_OFFER || null
      })
    }

    return {
      lnurlp: lnurlpBech32,
      decodedUrl: _lnurlpUrl,
      info: {
        title: 'Ligess: Lightning address personal server',
        source: 'https://github.com/mutatrum/ligess',
      },
    }
  })

  // NIP-05 DNS verification endpoint: /.well-known/nostr.json?name=<username>
  fastify.get('/.well-known/nostr.json', async (request, reply) => {
    if (!_nostrProfilePubKey) {
      return reply.code(404).send({ names: {} })
    }
    const name = request.query.name
    if (!name || name === _username) {
      return {
        names: {
          [_username]: _nostrProfilePubKey
        }
      }
    }
    return { names: {} }
  })

  // Nostr Wallet Connect Routes
  if (isWalletConnectEnabled()) {
    fastify.register(async function () {
      fastify.route({
        method: 'GET',
        url: '/relay/',
        handler: getWalletConnectHandler(),
        wsHandler: getWalletConnectWsHandler()
      })
    })

    const outboundRelays = (process.env.LIGESS_NOSTR_WALLET_CONNECT_RELAYS || process.env.LIGESS_NOSTR_WALLET_CONNECT_OUTBOUND_RELAYS || '')
      .split(',')
      .map(r => r.trim())
      .filter(r => r.startsWith('ws://') || r.startsWith('wss://'))

    if (outboundRelays.length > 0) {
      startOutboundRelayClient(outboundRelays, fastify.log)
    }
  }

  // LNURL-pay endpoint
  fastify.get('/.well-known/lnurlp/:username', async (request, reply) => {
    try {
      if (_username !== request.params.username) {
        const result = { status: 'ERROR', reason: 'Username not found' }
        reply.log.warn(result)
        reply.code(404).send(result)
        return
      }

      if (!request.query.amount) {
        const result = {
          status: 'OK',
          callback: _lnurlpUrl,
          tag: 'payRequest',
          maxSendable: 100000000,
          minSendable: 1000,
          metadata: JSON.stringify(_metadata),
          commentAllowed: 280,
        }
        if (_nostrZapperPubKey) {
          result.allowsNostr = true
          result.nostrPubkey = _nostrZapperPubKey
        }
        return result
      } else {
        if (!checkRateLimit(request.ip)) {
          const result = { status: 'ERROR', reason: 'Rate limit exceeded. Please try again in a minute.' }
          request.log.warn(result)
          reply.code(429).send(result)
          return
        }

        const msat = request.query.amount

        if (isNaN(msat)) {
          const result = { status: 'ERROR', reason: 'Invalid amount specified' }
          request.log.warn(result)
          reply.code(400).send(result)
          return
        }

        const numberOfMsats = Number(msat)

        if (numberOfMsats < 1000 || numberOfMsats > 100000000) {
          const result = { status: 'ERROR', reason: 'Amount out of bounds' }
          request.log.warn(result)
          reply.code(400).send(result)
          return
        }

        const comment = request.query.comment
        if (comment && comment.length > 280) {
          const result = { status: 'ERROR', reason: 'Comment too long' }
          request.log.warn(result)
          reply.code(400).send(result)
          return
        }

        let memo = _identifier
        if (comment) memo = `${_identifier}: ${comment}`

        let descriptionHash = null
        let zapRequest = null

        if (request.query.nostr) {
          zapRequest = await verifyZapRequest(request.query.nostr, msat)
          const hash = crypto.createHash('sha256').update(request.query.nostr).digest('hex')
          descriptionHash = hash
        } else {
          const hash = crypto.createHash('sha256').update(JSON.stringify(_metadata)).digest('hex')
          descriptionHash = hash
        }

        const lnClient = getLnClient()
        const invoice = await lnClient.createInvoice({
          amountMsats: numberOfMsats,
          descriptionHash,
          memo
        })

        if (_nostrZapperPubKey && zapRequest) {
          storePendingZapRequest(invoice.paymentHash, zapRequest, comment)
        }

        reply.log.info({ msg: 'Invoice created', hash: invoice.paymentHash, amount: numberOfMsats, comment })

        return {
          pr: invoice.bolt11,
          routes: [],
          disposable: false,
        }
      }
    } catch (error) {
      const result = { status: 'ERROR', reason: `An error occurred while getting invoice: ${error.message}` }
      request.log.warn(result)
      reply.code(400).send(result)
    }
  })

  // Listen for invoice updates to publish zap receipts
  if (_nostrZapperPubKey) {
    try {
      const lnClient = getLnClient()
      lnClient.watchInvoices().on('invoice-updated', (invoice) => handleInvoiceUpdate(invoice, fastify.log))
    } catch (e) {
      // Backend may be initialized lazily
    }
  }
}

module.exports = { registerRoutes }
