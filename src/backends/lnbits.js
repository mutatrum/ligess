const http = require('http')
const https = require('https')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy dependency
}

class LnbitsBackend extends Backend {
  constructor({ url, apiKey, socksProxyUrl = null }) {
    super()
    this.baseUrl = url.replace(/\/+$/, '')
    this.apiKey = apiKey
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
      'X-Api-Key': this.apiKey,
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
            return reject(new Error(`LNbits API error (${res.statusCode}): ${responseData}`))
          }
          try {
            const parsed = responseData ? JSON.parse(responseData) : {}
            resolve(parsed)
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

  async createInvoice({ amountMsats, descriptionHash, memo, expiry }) {
    const data = {
      out: false,
      amount: Math.max(1, Math.ceil(amountMsats / 1000)),
      memo: memo || 'Satoshis',
      description_hash: descriptionHash || undefined,
      expiry: expiry || undefined
    }

    const res = await this._request('POST', '/api/v1/payments', data)

    return {
      bolt11: res.payment_request,
      paymentHash: res.payment_hash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const res = await this._request('GET', `/api/v1/payments/${paymentHash}`)
    const isPaid = res.paid === true
    return {
      bolt11: res.details?.bolt11 || '',
      paymentHash: res.details?.payment_hash || paymentHash,
      settled: isPaid,
      settleDate: isPaid ? new Date() : null,
      amount: Number(res.details?.amount || 0) / 1000,
      amountMsat: Number(res.details?.amount || 0),
      preImage: res.details?.preimage || null,
      status: isPaid ? 'Settled' : 'Pending'
    }
  }

  async payInvoice({ bolt11 }) {
    const data = {
      out: true,
      bolt11
    }

    const res = await this._request('POST', '/api/v1/payments', data)
    let preimage = res.preimage || ''

    // If preimage not returned immediately, poll payments endpoint once
    if (!preimage && res.payment_hash) {
      await new Promise(r => setTimeout(r, 1000))
      const status = await this.getInvoice(res.payment_hash)
      preimage = status.preImage || ''
    }

    return {
      paymentPreimage: preimage,
      feesAmountMsats: Number(res.fee_msat || 0)
    }
  }

  async getBalance() {
    const res = await this._request('GET', '/api/v1/wallet')
    return {
      balanceMsats: Number(res.balance || 0)
    }
  }

  async getInfo() {
    const res = await this._request('GET', '/api/v1/wallet')
    return {
      alias: res.name || 'LNbits Wallet',
      pubkey: '',
      version: 'LNbits v1'
    }
  }

  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    // Check payments every 4 seconds for settled incoming payments
    this.watchInterval = setInterval(async () => {
      try {
        const payments = await this._request('GET', '/api/v1/payments?limit=20')
        if (!Array.isArray(payments)) return

        for (const p of payments) {
          if (!p.pending && p.amount > 0 && !this.seenSettled.has(p.payment_hash)) {
            this.seenSettled.add(p.payment_hash)
            this.emit('invoice-updated', {
              bolt11: p.bolt11,
              paymentHash: p.payment_hash,
              settled: true,
              settleDate: new Date(p.time * 1000),
              amount: p.amount / 1000,
              amountMsat: p.amount,
              preImage: p.preimage || null,
              status: 'Settled'
            })
          }
        }
      } catch (err) {
        // Silently retry next cycle
      }
    }, 4000)
  }
}

module.exports = LnbitsBackend
