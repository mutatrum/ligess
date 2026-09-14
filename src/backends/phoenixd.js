const http = require('http')
const https = require('https')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy dependency
}

class PhoenixdBackend extends Backend {
  constructor({ url = 'http://127.0.0.1:9740', password, socksProxyUrl = null }) {
    super()
    this.baseUrl = url.replace(/\/+$/, '')
    this.authHeader = 'Basic ' + Buffer.from(`:${password || ''}`).toString('base64')
    this.socksProxyUrl = socksProxyUrl
    this.isWatching = false
    this.reconnectTimer = null
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
      'Authorization': this.authHeader
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
            return reject(new Error(`Phoenixd API error (${res.statusCode}): ${responseData}`))
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
    const amountSat = Math.max(1, Math.ceil(amountMsats / 1000))
    const body = {
      amountSat,
      description: memo || 'Satoshis',
      externalId: descriptionHash || undefined
    }

    const res = await this._request('POST', '/createinvoice', body)

    return {
      bolt11: res.serialized,
      paymentHash: res.paymentHash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const res = await this._request('GET', `/getincomingpayment?paymentHash=${paymentHash}`)
    const isPaid = res.isPaid === true
    return {
      bolt11: res.invoice || '',
      paymentHash: res.paymentHash,
      settled: isPaid,
      settleDate: res.completedAt ? new Date(res.completedAt) : null,
      amount: Number(res.receivedSat || res.amountSat || 0),
      amountMsat: Number((res.receivedSat || res.amountSat || 0) * 1000),
      preImage: res.preimage || null,
      status: isPaid ? 'Settled' : 'Pending'
    }
  }

  async payInvoice({ bolt11, amountMsats }) {
    const body = {
      invoice: bolt11
    }
    if (amountMsats) {
      body.amountSat = Math.ceil(amountMsats / 1000)
    }

    const res = await this._request('POST', '/payinvoice', body)

    return {
      paymentPreimage: res.paymentPreimage || '',
      feesAmountMsats: Number((res.routingFeeSat || 0) * 1000)
    }
  }

  async getBalance() {
    const res = await this._request('GET', '/getbalance')
    return {
      balanceMsats: Number((res.balanceSat || 0) * 1000)
    }
  }

  async getInfo() {
    const res = await this._request('GET', '/getinfo')
    return {
      alias: 'Phoenixd Node',
      pubkey: res.nodeId || '',
      version: 'phoenixd'
    }
  }

  /**
   * Real-time payment notifications via Phoenixd's Server-Sent Events (/payments/incoming)
   */
  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    const connectSSE = () => {
      const fullUrl = new URL(`${this.baseUrl}/payments/incoming`)
      const isHttps = fullUrl.protocol === 'https:'
      const client = isHttps ? https : http

      const options = {
        method: 'GET',
        hostname: fullUrl.hostname,
        port: fullUrl.port || (isHttps ? 443 : 80),
        path: `${fullUrl.pathname}${fullUrl.search}`,
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'text/event-stream'
        },
        agent: this._getAgent(isHttps)
      }

      const req = client.request(options, (res) => {
        let buffer = ''
        res.setEncoding('utf8')

        res.on('data', (chunk) => {
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:')) {
              try {
                const data = JSON.parse(trimmed.slice(5).trim())
                if (data && data.paymentHash) {
                  this.emit('invoice-updated', {
                    bolt11: data.invoice || '',
                    paymentHash: data.paymentHash,
                    settled: true,
                    settleDate: data.completedAt ? new Date(data.completedAt) : new Date(),
                    amount: data.receivedSat || 0,
                    amountMsat: (data.receivedSat || 0) * 1000,
                    preImage: data.preimage || null,
                    status: 'Settled'
                  })
                }
              } catch (e) {
                // Ignore parse errors on heartbeat
              }
            }
          }
        })

        res.on('end', () => {
          if (!this.isWatching) return
          console.warn('Phoenixd SSE stream ended. Reconnecting in 3s...')
          this.reconnectTimer = setTimeout(connectSSE, 3000)
          if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
            this.reconnectTimer.unref()
          }
        })
      })

      req.on('error', (err) => {
        if (!this.isWatching) return
        console.warn('Phoenixd SSE stream error:', err.message)
        this.reconnectTimer = setTimeout(connectSSE, 5000)
        if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
          this.reconnectTimer.unref()
        }
      })

      req.end()
    }

    connectSSE()
  }

  stopWatchingInvoices() {
    this.isWatching = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

module.exports = PhoenixdBackend
