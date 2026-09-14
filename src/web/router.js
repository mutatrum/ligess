/**
 * LUD-09: LNURL-pay successAction (message or url)
 */
function getSuccessAction(env = process.env) {
  if (env.LIGESS_SUCCESS_URL) {
    const url = env.LIGESS_SUCCESS_URL.trim();
    const description = (env.LIGESS_SUCCESS_URL_DESCRIPTION || "Thank you! Visit website:").slice(0, 144);
    return {
      tag: "url",
      description,
      url
    };
  }

  if (env.LIGESS_SUCCESS_MESSAGE) {
    const message = env.LIGESS_SUCCESS_MESSAGE.trim().slice(0, 144);
    if (message.length > 0) {
      return {
        tag: "message",
        message
      };
    }
  }

  return null;
}

const { bech32 } = require('bech32')
const crypto = require('crypto')
const { getLnClient } = require('../backends/factory')
const { getNostrZapperPubKey, verifyZapRequest, storePendingZapRequest, handleInvoiceUpdate } = require('../nostr/zaps')
const { isWalletConnectEnabled, getWalletConnectHandler, getWalletConnectWsHandler, getRelayInformation, startOutboundRelayClient } = require('../nostr/nwcServer')
const { parsePublicKey } = require('../nostr/crypto')
const { getProfileMetadata } = require('../nostr/metadata')
const { renderLandingPage, DEFAULT_FAVICON_SVG } = require('./landingPage')
const { REPO_URL } = require('../config/constants')

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

  // Home / Web Portal / Root Relay Endpoint
  fastify.route({
    method: 'GET',
    url: '/',
    handler: async (request, reply) => {
      if (request.headers.accept && request.headers.accept.includes('application/nostr+json') && isWalletConnectEnabled()) {
        reply.header('content-type', 'application/nostr+json')
        return getRelayInformation()
      }

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
          bolt12Offer: process.env.LIGESS_BOLT12_OFFER || null,
          repoUrl: REPO_URL
        })
      }

      return {
        lnurlp: lnurlpBech32,
        decodedUrl: _lnurlpUrl,
        info: {
          title: 'Ligess: Lightning address personal server',
          source: REPO_URL,
        },
      }
    },
    ...(isWalletConnectEnabled() ? { wsHandler: getWalletConnectWsHandler() } : {})
  })

  // Favicon endpoints
  fastify.get('/favicon.ico', async (request, reply) => {
    const meta = getProfileMetadata()
    const picture = meta.picture || process.env.LIGESS_RELAY_ICON
    if (picture && !picture.startsWith('data:')) {
      return reply.redirect(302, picture)
    }
    reply.type('image/svg+xml')
    reply.header('Cache-Control', 'public, max-age=86400')
    return DEFAULT_FAVICON_SVG
  })

  fastify.get('/favicon.svg', async (request, reply) => {
    reply.type('image/svg+xml')
    reply.header('Cache-Control', 'public, max-age=86400')
    return DEFAULT_FAVICON_SVG
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
      fastify.route({
        method: 'GET',
        url: '/relay',
        handler: getWalletConnectHandler(),
        wsHandler: getWalletConnectWsHandler()
      })
    })

    const outboundRelays = (process.env.LIGESS_NOSTR_WALLET_CONNECT_RELAYS || process.env.LIGESS_NOSTR_WALLET_CONNECT_OUTBOUND_RELAYS || '')
      .split(',')
      .map(r => r.trim())
      .filter(r => r.startsWith('ws://') || r.startsWith('wss://'))

    if (outboundRelays.length > 0 && process.env.NODE_ENV !== 'test') {
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

        const responsePayload = {
          pr: invoice.bolt11,
          routes: [],
          disposable: false,
        }

        const successAction = getSuccessAction()
        if (successAction) {
          responsePayload.successAction = successAction
        }

        return responsePayload
      }
    } catch (error) {
      const result = { status: 'ERROR', reason: `An error occurred while getting invoice: ${error.message}` }
      request.log.warn(result)
      reply.code(400).send(result)
    }
  })

  // Listen for invoice updates to publish zap receipts
  if (_nostrZapperPubKey && process.env.NODE_ENV !== 'test') {
    try {
      const lnClient = getLnClient()
      lnClient.watchInvoices().on('invoice-updated', (invoice) => handleInvoiceUpdate(invoice, fastify.log))
      fastify.addHook('onClose', async () => {
        if (typeof lnClient.stopWatchingInvoices === 'function') {
          lnClient.stopWatchingInvoices()
        }
      })
    } catch (e) {
      // Backend may be initialized lazily
    }
  }
}

module.exports = { registerRoutes, getSuccessAction }
