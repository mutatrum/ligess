const http = require('http')
const https = require('https')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy dependency
}

class EclairBackend extends Backend {
  constructor({ url, login, password, socksProxyUrl = null }) {
    super()
    this.baseUrl = url.replace(/\/+$/, '')
    this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
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
      'Authorization': this.authHeader,
    }

    let payload = null
    if (body) {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) params.append(k, String(v))
      }
      payload = params.toString()
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
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
            return reject(new Error(`Eclair API error (${res.statusCode}): ${responseData}`))
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

      if (payload) {
        req.write(payload)
      }
      req.end()
    })
  }

  async createInvoice({ amountMsats, descriptionHash, memo, expiry }) {
    const data = {
      amountMsat: amountMsats,
      descriptionHash: descriptionHash || undefined,
      description: memo || undefined,
      expireIn: expiry || undefined
    }

    const res = await this._request('POST', '/createinvoice', data)

    return {
      bolt11: res.serialized,
      paymentHash: res.paymentHash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const res = await this._request('POST', '/getinvoice', { paymentHash })
    const isPaid = res.status === 'received'
    return {
      bolt11: res.serialized,
      paymentHash: res.paymentHash,
      settled: isPaid,
      settleDate: isPaid ? new Date() : null,
      amount: Number(res.amount || 0) / 1000,
      amountMsat: Number(res.amount || 0),
      preImage: null,
      status: isPaid ? 'Settled' : 'Pending'
    }
  }

  async payInvoice({ bolt11 }) {
    const res = await this._request('POST', '/payinvoice', { invoice: bolt11 })
    return {
      paymentPreimage: res.paymentPreimage || '',
      feesAmountMsats: Number(res.recipientAmount || 0)
    }
  }

  async getBalance() {
    const res = await this._request('POST', '/usablebalances')
    const total = Array.isArray(res) ? res.reduce((acc, c) => acc + (c.canSendMsat || 0), 0) : 0
    return {
      balanceMsats: total
    }
  }

  async getInfo() {
    const res = await this._request('POST', '/getinfo')
    return {
      alias: res.alias || 'Eclair Node',
      pubkey: res.nodeId || '',
      version: res.version || ''
    }
  }

  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    this.watchInterval = setInterval(async () => {
      try {
        const received = await this._request('POST', '/listreceivedpayments')
        if (!Array.isArray(received)) return

        for (const p of received) {
          if (!this.seenSettled.has(p.paymentHash)) {
            this.seenSettled.add(p.paymentHash)
            this.emit('invoice-updated', {
              bolt11: p.invoice?.serialized || '',
              paymentHash: p.paymentHash,
              settled: true,
              settleDate: new Date(p.timestamp),
              amount: p.amount / 1000,
              amountMsat: p.amount,
              preImage: p.paymentPreimage || null,
              status: 'Settled'
            })
          }
        }
      } catch (err) {
        // Retry
      }
    }, 4000)
  }
}

module.exports = EclairBackend
