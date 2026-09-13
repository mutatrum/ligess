const http = require('http')
const https = require('https')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional if Tor is not used
}

class LndBackend extends Backend {
  constructor({ url, hexMacaroon, socksProxyUrl = null }) {
    super()
    this.baseUrl = url.replace(/\/+$/, '')
    this.hexMacaroon = hexMacaroon
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
      'Grpc-Metadata-macaroon': this.hexMacaroon,
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
            return reject(new Error(`LND API error (${res.statusCode}): ${responseData}`))
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
      value_msat: String(amountMsats),
      expiry: expiry ? String(expiry) : undefined,
      memo: memo || undefined,
      description_hash: descriptionHash ? Buffer.from(descriptionHash, 'hex').toString('base64') : undefined
    }

    const res = await this._request('POST', '/v1/invoices', data)
    const paymentHash = Buffer.from(res.r_hash, 'base64').toString('hex')

    return {
      bolt11: res.payment_request,
      paymentHash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const res = await this._request('GET', `/v1/invoice/${paymentHash}`)
    return this._normalizeInvoice(res)
  }

  async payInvoice({ bolt11, amountMsats }) {
    const data = {
      payment_request: bolt11,
      amt_msat: amountMsats ? String(amountMsats) : undefined
    }

    const res = await this._request('POST', '/v1/channels/transactions', data)
    if (res.payment_error) {
      throw new Error(`Payment failed: ${res.payment_error}`)
    }

    return {
      paymentPreimage: res.payment_preimage ? Buffer.from(res.payment_preimage, 'base64').toString('hex') : '',
      feesAmountMsats: Number(res.payment_route?.total_fees_msat || 0)
    }
  }

  async getBalance() {
    const res = await this._request('GET', '/v1/balance/channels')
    return {
      balanceMsats: Number(res.local_balance?.msat || 0)
    }
  }

  async getInfo() {
    const res = await this._request('GET', '/v1/getinfo')
    return {
      alias: res.alias || '',
      pubkey: res.identity_pubkey || '',
      version: res.version || ''
    }
  }

  _normalizeInvoice(raw) {
    const isSettled = raw.settled === true || raw.state === 'SETTLED'
    const isCancelled = raw.state === 'CANCELED'
    let status = 'Pending'
    if (isSettled) status = 'Settled'
    else if (isCancelled) status = 'Cancelled'

    const paymentHash = raw.r_hash ? (
      raw.r_hash.length === 64 ? raw.r_hash : Buffer.from(raw.r_hash, 'base64').toString('hex')
    ) : ''

    const preImage = raw.r_preimage ? (
      raw.r_preimage.length === 64 ? raw.r_preimage : Buffer.from(raw.r_preimage, 'base64').toString('hex')
    ) : null

    return {
      bolt11: raw.payment_request,
      paymentHash,
      settled: isSettled,
      settleDate: raw.settle_date && raw.settle_date !== '0' ? new Date(Number(raw.settle_date) * 1000) : null,
      amount: Number(raw.value || 0),
      amountMsat: Number(raw.value_msat || 0),
      preImage,
      status
    }
  }

  /**
   * Real-time invoice streaming via LND's native SSE endpoint (/v1/invoices/subscribe).
   * Automatically reconnects if the connection drops.
   */
  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    const connectStream = () => {
      const fullUrl = new URL(`${this.baseUrl}/v1/invoices/subscribe`)
      const isHttps = fullUrl.protocol === 'https:'
      const client = isHttps ? https : http

      const options = {
        method: 'GET',
        hostname: fullUrl.hostname,
        port: fullUrl.port || (isHttps ? 443 : 80),
        path: `${fullUrl.pathname}${fullUrl.search}`,
        headers: {
          'Grpc-Metadata-macaroon': this.hexMacaroon,
          'Accept': 'application/json'
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
            if (!trimmed) continue
            try {
              const data = JSON.parse(trimmed)
              const invoiceRaw = data.result || data
              const normalized = this._normalizeInvoice(invoiceRaw)
              this.emit('invoice-updated', normalized)
            } catch (err) {
              // Partial line or heartbeat, ignore
            }
          }
        })

        res.on('end', () => {
          console.warn('LND invoice subscription stream ended. Reconnecting in 3s...')
          this.reconnectTimer = setTimeout(connectStream, 3000)
        })
      })

      req.on('error', (err) => {
        console.warn('LND invoice subscription stream error:', err.message)
        this.reconnectTimer = setTimeout(connectStream, 5000)
      })

      req.end()
    }

    connectStream()
  }
}

module.exports = LndBackend
