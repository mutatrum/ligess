const fs = require('fs')
const { SimplePool, finalizeEvent, verifyEvent, getPublicKey, nip19 } = require('nostr-tools')
const db = require('../storage/db')
const { parsePrivateKey, getTags } = require('./crypto')

const _nostrZapperPrivKey = parsePrivateKey(process.env.LIGESS_NOSTR_ZAPPER_PRIVATE_KEY)
const _nostrZapperPubKey = _nostrZapperPrivKey ? getPublicKey(_nostrZapperPrivKey) : null

const pool = new SimplePool()
const sentMetadata = []

const getMetadataNote = (file) => {
  if (file && _nostrZapperPrivKey) {
    if (!fs.existsSync(file)) {
      throw new Error(`Metadata file ${file} not found`)
    }
    const metadata = fs.readFileSync(file, 'utf8')
    try {
      const content = JSON.parse(metadata)
      return finalizeEvent({
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(content)
      }, _nostrZapperPrivKey)
    } catch (error) {
      throw new Error(`Invalid JSON in metadata file ${file}`)
    }
  }
  return null
}

const _nostrMetadataNote = getMetadataNote(process.env.LIGESS_NOSTR_METADATA_FILE)

const getNostrZapperPubKey = () => _nostrZapperPubKey

const verifyZapRequest = async (zapRequest, queryAmount) => {
  if (!zapRequest) return

  if (typeof zapRequest === 'string') {
    try {
      zapRequest = JSON.parse(zapRequest)
    } catch (error) {
      throw new Error(`Invalid JSON on zap request`)
    }
  }

  if (zapRequest.kind !== 9734) {
    throw new Error(`Invalid zap request kind ${zapRequest.kind}`)
  }

  if (!verifyEvent(zapRequest)) {
    throw new Error(`Invalid signature or id on zap request`)
  }

  if (!zapRequest.tags || zapRequest.tags.length === 0) {
    throw new Error(`No tags on zap request`)
  }

  const ptags = getTags(zapRequest.tags, 'p')
  if (ptags.length === 0) {
    throw new Error(`No p tag on zap request`)
  }
  if (ptags.length >= 2) {
    throw new Error(`Multiple p tags on zap request`)
  }

  const etags = getTags(zapRequest.tags, 'e')
  if (etags.length >= 2) {
    throw new Error(`Multiple e tags on zap request`)
  }

  const atags = getTags(zapRequest.tags, 'a')
  if (atags.length >= 2) {
    throw new Error(`Multiple a tags on zap request`)
  }
  if (atags.length === 1) {
    const parts = atags[0][1].split(':')
    if (parts.length < 3 || isNaN(parseInt(parts[0], 10)) || parts[1].length !== 64) {
      throw new Error(`Invalid a tag event coordinate on zap request`)
    }
  }

  // If there is an (uppercase) P tag, validate P tag.
  // There MUST be 0 or 1 P tags. If there is one, it MUST be equal to the zap request's pubkey.
  const Ptags = getTags(zapRequest.tags, 'P')
  if (Ptags.length === 1 && Ptags[0][1] !== zapRequest.pubkey) {
    throw new Error(`P tag is not equal to the pubkey on the zap request event`)
  }

  const relaytags = getTags(zapRequest.tags, 'relays')
  if (relaytags.length === 0) {
    throw new Error(`No relay tag on zap request`)
  }
  if (relaytags.length >= 2) {
    throw new Error(`Multiple relay tags on zap request`)
  }

  const amounttags = getTags(zapRequest.tags, 'amount')
  if (amounttags.length === 1 && queryAmount && amounttags[0][1] !== String(queryAmount)) {
    throw new Error(`Amount tag in the zap request does not equal amount on query`)
  }
  if (amounttags.length >= 2) {
    throw new Error(`Multiple amount tags on zap request`)
  }

  return zapRequest
}

const storePendingZapRequest = (paymentHash, zapRequest, comment) => {
  db.storePendingZap(paymentHash, zapRequest, comment)
}

const handleInvoiceUpdate = async (invoice, logger = console) => {
  if (invoice.status === 'Cancelled') {
    db.removePendingZap(invoice.paymentHash)
    return
  }
  if (!invoice.settled) return

  const pending = db.getPendingZap(invoice.paymentHash)
  if (!pending) return

  const { zapRequest, comment } = pending

  let content = ''
  if (comment) {
    content = comment
  } else if (zapRequest.content) {
    content = zapRequest.content
  }

  const tags = []
  const ptags = getTags(zapRequest.tags, 'p')
  tags.push(ptags[0])

  const Ptags = getTags(zapRequest.tags, 'P')
  if (Ptags.length === 1) tags.push(Ptags[0])

  const etags = getTags(zapRequest.tags, 'e')
  if (etags.length === 1) tags.push(etags[0])

  const atags = getTags(zapRequest.tags, 'a')
  if (atags.length === 1) tags.push(atags[0])

  tags.push(['bolt11', invoice.bolt11])
  tags.push(['description', typeof zapRequest === 'string' ? zapRequest : JSON.stringify(zapRequest)])
  tags.push(['preimage', invoice.preImage])

  const settleTimestamp = invoice.settleDate
    ? Math.floor(new Date(invoice.settleDate).getTime() / 1000)
    : Math.floor(Date.now() / 1000)

  const zapNote = finalizeEvent({
    kind: 9735,
    created_at: settleTimestamp,
    tags,
    content
  }, _nostrZapperPrivKey)

  if (logger.info) {
    logger.info({
      msg: 'Invoice settled',
      note: zapNote.id,
      amount: invoice.amount,
      npub: nip19.npubEncode(zapRequest.pubkey),
      comment: content
    })
  }

  const relaytags = getTags(zapRequest.tags, 'relays')
  const relays = relaytags[0].slice(1)

  if (relays.length > 0) {
    if (_nostrMetadataNote) {
      const unsentRelays = relays.filter(r => !sentMetadata.includes(r))
      if (unsentRelays.length > 0) {
        Promise.allSettled(pool.publish(unsentRelays, _nostrMetadataNote)).then(() => {
          unsentRelays.forEach(r => sentMetadata.push(r))
        }).catch(() => {})
      }
    }

    Promise.allSettled(pool.publish(relays, zapNote)).then((results) => {
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && logger.info) {
          logger.info({ msg: 'Zap event published', relay: relays[i], id: zapNote.id })
        } else if (logger.warn) {
          logger.warn({ msg: 'Zap event publish failed', relay: relays[i], error: res.reason?.message || res.reason })
        }
      })
    }).catch((err) => {
      if (logger.warn) logger.warn({ msg: 'Zap event broadcast error', error: err.message })
    })
  }

  db.removePendingZap(invoice.paymentHash)
}

module.exports = {
  getNostrZapperPubKey,
  verifyZapRequest,
  storePendingZapRequest,
  handleInvoiceUpdate,
  parsePrivateKey,
  getTags
}
