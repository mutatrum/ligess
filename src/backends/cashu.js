const https = require('https')
const http = require('http')
const Backend = require('./base')
const bolt11Decoder = require('bolt11')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy
}

class CashuBackend extends Backend {
  constructor({ mintUrl, socksProxyUrl = null }) {
    super()
    this.mintUrl = (mintUrl || 'https://mint.minibits.cash/Bitcoin').replace(/\/+$/, '')
    this.socksProxyUrl = socksProxyUrl
    this.isWatching = false
    this.watchInterval = null
    this.quoteMap = new Map() // paymentHash -> { quoteId, bolt11, amountSat }
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
    const fullUrl = new URL(`${this.mintUrl}${path}`)
    const isHttps = fullUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const headers = {}
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
            return reject(new Error(`Cashu Mint error (${res.statusCode}): ${responseData}`))
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
    const amountSat = Math.max(1, Math.ceil(amountMsats / 1000))
    const body = {
      amount: amountSat,
      unit: 'sat',
      description: memo || 'Satoshis'
    }

    const res = await this._request('POST', '/v1/mint/quote/bolt11', body)
    const bolt11 = res.request
    let paymentHash = ''

    try {
      const decoded = bolt11Decoder.decode(bolt11)
      paymentHash = decoded.tagsObject.payment_hash
    } catch (_) {
      paymentHash = res.quote
    }

    this.quoteMap.set(paymentHash, {
      quoteId: res.quote,
      bolt11,
      amountSat
    })

    return {
      bolt11,
      paymentHash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const record = this.quoteMap.get(paymentHash)
    const quoteId = record ? record.quoteId : paymentHash

    const res = await this._request('GET', `/v1/mint/quote/bolt11/${quoteId}`)
    const isPaid = res.state === 'PAID'

    return {
      bolt11: res.request || (record ? record.bolt11 : ''),
      paymentHash,
      settled: isPaid,
      settleDate: isPaid ? new Date() : null,
      amount: record ? record.amountSat : 0,
      amountMsat: (record ? record.amountSat : 0) * 1000,
      preImage: null,
      status: isPaid ? 'Settled' : 'Pending'
    }
  }

  async payInvoice({ bolt11, amountMsats }) {
    const body = {
      request: bolt11,
      unit: 'sat'
    }

    const res = await this._request('POST', '/v1/melt/quote/bolt11', body)

    return {
      paymentPreimage: '',
      feesAmountMsats: Number(res.fee_reserve || 0) * 1000
    }
  }

  async getBalance() {
    return {
      balanceMsats: 0
    }
  }

  async getInfo() {
    try {
      const res = await this._request('GET', '/v1/info')
      return {
        alias: res.name || 'Cashu Mint Gateway',
        pubkey: res.pubkey || '',
        version: res.version || 'NUT-04/05'
      }
    } catch (err) {
      return {
        alias: 'Cashu Mint Gateway',
        pubkey: '',
        version: 'NUT-04/05'
      }
    }
  }

  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    this.watchInterval = setInterval(async () => {
      for (const [hash, record] of this.quoteMap.entries()) {
        try {
          const res = await this._request('GET', `/v1/mint/quote/bolt11/${record.quoteId}`)
          if (res.state === 'PAID') {
            this.quoteMap.delete(hash)
            this.emit('invoice-updated', {
              bolt11: record.bolt11,
              paymentHash: hash,
              settled: true,
              settleDate: new Date(),
              amount: record.amountSat,
              amountMsat: record.amountSat * 1000,
              preImage: null,
              status: 'Settled'
            })
          }
        } catch (err) {
          // Retry
        }
      }
    }, 4000)
  }
}

module.exports = CashuBackend
