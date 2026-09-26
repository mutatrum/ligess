const http = require('http')
const https = require('https')
const crypto = require('crypto')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy dependency
}

class ArkadeBackend extends Backend {
  /**
   * @param {Object} options
   * @param {string} [options.url] Base URL of the arkd/Arkade operator (e.g. 'http://127.0.0.1:7070')
   * @param {string} [options.apiKey] Authentication token or API key for arkd
   * @param {string} [options.socksProxyUrl] Optional SOCKS5 proxy for Tor
   */
  constructor({ url = 'http://127.0.0.1:7070', apiKey, socksProxyUrl = null }) {
    super()
    this.baseUrl = (url || 'http://127.0.0.1:7070').replace(/\/+$/, '')
    this.apiKey = apiKey || ''
    this.socksProxyUrl = socksProxyUrl
    this.isWatching = false
    this.watchInterval = null
    this.seenSettled = new Set()
  }

  _getAgent(isHttps) {
    if (this.socksProxyUrl && SocksProxyAgent) {
      return new SocksProxyAgent(this.socksProxyUrl)
    }
    if (isHttps) {
      return new https.Agent({ rejectUnauthorized: false })
    }
    return new http.Agent()
  }

  async _request(method, path, body = null) {
    const fullUrl = new URL(`${this.baseUrl}${path}`)
    const isHttps = fullUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const headers = {
      'Accept': 'application/json'
    }

    if (this.apiKey) {
      const auth = this.apiKey.startsWith('Bearer ') ? this.apiKey : `Bearer ${this.apiKey}`
      headers['Authorization'] = auth
      headers['X-Api-Key'] = this.apiKey
    }

    if (body) {
      headers['Content-Type'] = 'application/json'
    }

    const options = {
      method,
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: `${fullUrl.pathname}${fullUrl.search}`,
      headers,
      agent: this._getAgent(isHttps)
    }

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let responseData = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { responseData += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Arkade API error (${res.statusCode}): ${responseData}`))
          }
          try {
            resolve(responseData ? JSON.parse(responseData) : {})
          } catch (err) {
            resolve(responseData)
          }
        })
      })

      req.on('error', reject)
      if (body) {
        req.write(JSON.stringify(body))
      }
      req.end()
    })
  }

  /**
   * Create a BOLT11 invoice for receiving funds into Arkade VTXOs via the gateway / swap manager
   * @param {Object} params
   * @param {number} params.amountMsats
   * @param {string} [params.descriptionHash]
   * @param {string} [params.memo]
   * @param {number} [params.expiry] In seconds
   * @returns {Promise<{ bolt11: string, paymentHash: string, amountMsats: number }>}
   */
  async createInvoice({ amountMsats, descriptionHash, memo, expiry = 3600 }) {
    const amountSat = Math.max(1, Math.ceil(amountMsats / 1000))
    const body = {
      amount_sat: amountSat,
      amount_msat: Number(amountMsats),
      description: memo || 'Ligess Satoshis',
      description_hash: descriptionHash || undefined,
      expiry
    }

    const res = await this._request('POST', '/v1/lightning/invoice', body)

    return {
      bolt11: res.bolt11 || res.invoice || res.payment_request,
      paymentHash: res.payment_hash || res.paymentHash || res.id,
      amountMsats: Number(amountMsats)
    }
  }

  /**
   * Fetch invoice status
   * @param {string} paymentHash
   * @returns {Promise<{ bolt11: string, paymentHash: string, settled: boolean, settleDate: Date|null, preImage: string|null, status: string }>}
   */
  async getInvoice(paymentHash) {
    const res = await this._request('GET', `/v1/lightning/invoice/${paymentHash}`)
    const isSettled = Boolean(res.settled || res.status === 'settled' || res.status === 'claimed' || res.state === 'SETTLED')

    const amountSat = Number(res.amount_sat || (res.amount_msat ? res.amount_msat / 1000 : 0))
    const amountMsat = Number(res.amount_msat || (res.amount_sat ? res.amount_sat * 1000 : 0))

    return {
      bolt11: res.bolt11 || res.invoice || res.payment_request || '',
      paymentHash,
      settled: isSettled,
      settleDate: isSettled ? (res.settled_at ? new Date(res.settled_at * 1000) : new Date()) : null,
      amount: amountSat,
      amountMsat,
      preImage: res.preimage || res.payment_preimage || null,
      status: isSettled ? 'Settled' : 'Pending'
    }
  }

  /**
   * Pay an outbound BOLT11 invoice using Arkade VTXO balance
   * @param {Object} params
   * @param {string} params.bolt11
   * @param {number} [params.amountMsats]
   * @returns {Promise<{ paymentPreimage: string, feesAmountMsats: number }>}
   */
  async payInvoice({ bolt11, amountMsats }) {
    const body = {
      invoice: bolt11,
      amount_sat: amountMsats ? Math.ceil(amountMsats / 1000) : undefined,
      amount_msat: amountMsats ? Number(amountMsats) : undefined
    }

    const res = await this._request('POST', '/v1/lightning/pay', body)

    return {
      paymentPreimage: res.preimage || res.payment_preimage || '',
      feesAmountMsats: Number(res.fee_msat || (res.fee_sat ? res.fee_sat * 1000 : 0))
    }
  }

  /**
   * Return total available off-chain Arkade balance in msats
   * @returns {Promise<{ balanceMsats: number }>}
   */
  async getBalance() {
    const res = await this._request('GET', '/v1/wallet/balance')
    const totalSat = Number(res.vtxo_balance_sat || res.spendable_sat || res.balance || res.total_sat || 0)
    return {
      balanceMsats: totalSat * 1000
    }
  }

  /**
   * General node / operator info
   * @returns {Promise<{ alias: string, pubkey: string, version: string }>}
   */
  async getInfo() {
    const res = await this._request('GET', '/v1/info')
    return {
      alias: res.alias || res.operator_name || 'Arkade Operator',
      pubkey: res.pubkey || res.base_pubkey || res.operator_pubkey || '',
      version: res.version || 'arkd v1'
    }
  }

  /**
   * List transactions (invoices and payments)
   * @param {Object} [params]
   * @returns {Promise<Array<Object>>}
   */
  async listTransactions({ from, until, limit = 50, offset = 0, unpaid = false, type } = {}) {
    const res = await this._request('GET', `/v1/lightning/payments?limit=${limit}&offset=${offset}`)
    const list = Array.isArray(res) ? res : (res.payments || res.items || [])

    const transactions = []
    for (const item of list) {
      const isIncoming = item.type === 'incoming' || item.direction === 'in' || Boolean(item.bolt11 && !item.fee_sat)
      const txType = isIncoming ? 'incoming' : 'outgoing'

      if (type && type !== txType) continue

      const isSettled = item.status === 'settled' || item.status === 'claimed' || item.settled === true
      if (!unpaid && !isSettled) continue

      const createdAt = item.created_at ? Number(item.created_at) : Math.floor(Date.now() / 1000)
      if (from && createdAt < from) continue
      if (until && createdAt > until) continue

      const amountMsats = Number(item.amount_msat || (item.amount_sat ? item.amount_sat * 1000 : 0))
      const feesMsats = Number(item.fee_msat || (item.fee_sat ? item.fee_sat * 1000 : 0))

      transactions.push({
        type: txType,
        invoice: item.bolt11 || item.invoice || '',
        description: item.description || item.memo || '',
        description_hash: item.description_hash || null,
        preimage: item.preimage || item.payment_preimage || null,
        payment_hash: item.payment_hash || item.paymentHash || item.id || '',
        amount: amountMsats,
        fees_paid: feesMsats,
        created_at: createdAt,
        expires_at: item.expires_at || null,
        settled_at: item.settled_at || null,
        status: isSettled ? 'settled' : (item.status || 'pending')
      })
    }

    return transactions
  }

  /**
   * Watch for settled incoming invoices to trigger Nostr zaps (NIP-57)
   */
  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    this.watchInterval = setInterval(async () => {
      try {
        const res = await this._request('GET', '/v1/lightning/payments?limit=20')
        const list = Array.isArray(res) ? res : (res.payments || res.items || [])

        for (const p of list) {
          const hash = p.payment_hash || p.paymentHash || p.id
          const isSettled = p.status === 'settled' || p.status === 'claimed' || p.settled === true

          if (isSettled && hash && !this.seenSettled.has(hash)) {
            this.seenSettled.add(hash)
            const amountSat = Number(p.amount_sat || (p.amount_msat ? p.amount_msat / 1000 : 0))
            const amountMsat = Number(p.amount_msat || (p.amount_sat ? p.amount_sat * 1000 : 0))

            this.emit('invoice-updated', {
              bolt11: p.bolt11 || p.invoice || '',
              paymentHash: hash,
              settled: true,
              settleDate: new Date(p.settled_at ? p.settled_at * 1000 : Date.now()),
              amount: amountSat,
              amountMsat,
              preImage: p.preimage || p.payment_preimage || null,
              status: 'Settled'
            })
          }
        }
      } catch (err) {
        // Silently retry next interval
      }
    }, 3000)
  }

  inspectCredentials() {
    if (!this.apiKey) {
      return {
        type: 'Arkade API Key / Token',
        warning: 'No LIGESS_ARKADE_API_KEY configured (connecting in unauthenticated mode)',
        domain: this.baseUrl
      }
    }
    const fp = crypto.createHash('sha256').update(this.apiKey).digest('hex').slice(0, 8)
    return {
      type: 'Arkade API Key / Token',
      fingerprint: fp,
      domain: this.baseUrl
    }
  }
}

module.exports = ArkadeBackend
