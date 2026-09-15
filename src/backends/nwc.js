require('../nostr/websocket')

const Backend = require('./base')
const { finalizeEvent, getPublicKey, nip04, nip44, SimplePool } = require('nostr-tools')

class NwcBackend extends Backend {
  constructor({ uri }) {
    super()
    this.uri = uri
    this._parseUri(uri)
    this.pool = new SimplePool()
    this.isWatching = false
    this.invoicesToWatch = new Map() // paymentHash -> bolt11
    this.watchInterval = null
  }

  _parseUri(uri) {
    if (!uri || !uri.startsWith('nostr+walletconnect:')) {
      throw new Error('Invalid NWC URI: Must start with nostr+walletconnect:')
    }

    const clean = uri.replace('nostr+walletconnect://', 'nostr+walletconnect://host/')
    const parsed = new URL(clean)
    const walletPubkey = parsed.host && parsed.host !== 'host' ? parsed.host : parsed.pathname.replace(/^\/+/, '')
    const relay = parsed.searchParams.get('relay')
    const secret = parsed.searchParams.get('secret')

    if (!walletPubkey || walletPubkey.length !== 64) {
      throw new Error('Invalid or missing wallet pubkey in NWC URI')
    }
    if (!relay) {
      throw new Error('Missing relay in NWC URI')
    }
    if (!secret || secret.length !== 64) {
      throw new Error('Invalid or missing secret key in NWC URI')
    }

    this.walletPubkey = walletPubkey
    this.relayUrl = relay
    this.clientSecret = new Uint8Array(Buffer.from(secret, 'hex'))
    this.clientPubkey = getPublicKey(this.clientSecret)
  }

  async _sendNwcCommand(method, params = {}) {
    const payload = JSON.stringify({ method, params })

    // Encrypt with NIP-44 v2
    const convKey = nip44.getConversationKey(this.clientSecret, this.walletPubkey)
    const ciphertext = nip44.encrypt(payload, convKey)

    const reqEvent = finalizeEvent({
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', this.walletPubkey]],
      content: ciphertext
    }, this.clientSecret)

    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          sub.close()
          reject(new Error(`NWC command timeout (${method})`))
        }
      }, 15000)

      const filter = {
        kinds: [23195],
        '#p': [this.clientPubkey],
        '#e': [reqEvent.id]
      }

      const sub = this.pool.subscribe([this.relayUrl], filter, {
        onevent: async (event) => {
          if (resolved) return
          try {
            let decrypted
            if (event.content.includes('?iv=')) {
              decrypted = await nip04.decrypt(this.clientSecret, this.walletPubkey, event.content)
            } else {
              decrypted = nip44.decrypt(event.content, convKey)
            }

            const data = JSON.parse(decrypted)
            resolved = true
            clearTimeout(timeout)
            sub.close()

            if (data.error) {
              return reject(new Error(data.error.message || data.error.code || 'NWC error'))
            }
            resolve(data.result || {})
          } catch (err) {
            // Ignore decryption failure from other events
          }
        }
      })

      // Publish request to the relay
      Promise.allSettled(this.pool.publish([this.relayUrl], reqEvent)).catch(reject)
    })
  }

  async createInvoice({ amountMsats, descriptionHash, memo, expiry }) {
    const params = {
      amount: Number(amountMsats),
      description: memo || 'Satoshis',
      description_hash: descriptionHash || undefined,
      expiry: expiry || 3600
    }

    const res = await this._sendNwcCommand('make_invoice', params)

    if (this.isWatching && res.payment_hash) {
      this.invoicesToWatch.set(res.payment_hash, res.invoice)
    }

    return {
      bolt11: res.invoice,
      paymentHash: res.payment_hash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const res = await this._sendNwcCommand('lookup_invoice', { payment_hash: paymentHash })
    const isSettled = Boolean(res.settled_at || res.preimage)
    return {
      bolt11: res.invoice || '',
      paymentHash: res.payment_hash || paymentHash,
      settled: isSettled,
      settleDate: res.settled_at ? new Date(res.settled_at * 1000) : null,
      amount: res.amount ? res.amount / 1000 : 0,
      amountMsat: res.amount || 0,
      preImage: res.preimage || null,
      status: isSettled ? 'Settled' : 'Pending'
    }
  }

  async payInvoice({ bolt11, amountMsats }) {
    const params = { invoice: bolt11 }
    if (amountMsats) params.amount = amountMsats

    const res = await this._sendNwcCommand('pay_invoice', params)

    return {
      paymentPreimage: res.preimage || '',
      feesAmountMsats: Number(res.fees_paid || 0)
    }
  }

  async getBalance() {
    const res = await this._sendNwcCommand('get_balance', {})
    return {
      balanceMsats: Number(res.balance || 0)
    }
  }

  async getInfo() {
    const res = await this._sendNwcCommand('get_info', {}).catch(() => ({}))
    return {
      alias: res.alias || 'Upstream NWC Wallet',
      pubkey: res.pubkey || this.walletPubkey,
      version: 'NIP-47 Client'
    }
  }

  async payKeysend({ pubkey, amountMsats, preimage, tlvRecords = [] }) {
    const params = {
      pubkey,
      amount: amountMsats
    }
    if (preimage) params.preimage = preimage
    if (tlvRecords && tlvRecords.length > 0) params.tlv_records = tlvRecords

    const res = await this._sendNwcCommand('pay_keysend', params)
    return {
      paymentPreimage: res.preimage || '',
      paymentHash: res.payment_hash || '',
      feesAmountMsats: Number(res.fees_paid || 0)
    }
  }

  async listTransactions(params = {}) {
    const res = await this._sendNwcCommand('list_transactions', params)
    return res.transactions || []
  }

  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    this.watchInterval = setInterval(async () => {
      for (const [hash, bolt11] of this.invoicesToWatch.entries()) {
        try {
          const status = await this.getInvoice(hash)
          if (status.settled) {
            this.invoicesToWatch.delete(hash)
            this.emit('invoice-updated', status)
          }
        } catch (e) {
          // Retry
        }
      }
    }, 4000)
  }

  inspectCredentials() {
    return {
      type: 'Upstream NWC',
      walletPubkey: this.walletPubkey,
      relayUrl: this.relayUrl
    }
  }
}

module.exports = NwcBackend
