const http = require('http')
const https = require('https')
const Backend = require('./base')
const bolt11Decoder = require('../clients/bolt11')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy dependency
}

class LdkBackend extends Backend {
  constructor({ url = 'http://127.0.0.1:3000', apiKey = null, socksProxyUrl = null }) {
    super()
    this.baseUrl = url.replace(/\/+$/, '')
    this.apiKey = apiKey
    this.socksProxyUrl = socksProxyUrl
    this.isWatching = false
    this.watchInterval = null
    this.invoicesToWatch = new Map()
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

    const headers = {}
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
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
            return reject(new Error(`LDK API error (${res.statusCode}): ${responseData}`))
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
      amount_msat: Number(amountMsats),
      description: memo || 'Satoshis',
      expiry_secs: expiry || 3600
    }

    // Try ldk-node route first, then fallback to v1 invoice
    let res
    try {
      res = await this._request('POST', '/receive_via_bolt11_payment', data)
    } catch (e) {
      res = await this._request('POST', '/v1/invoice', data)
    }

    const bolt11 = res.invoice || res.bolt11 || res.serialized || res
    let paymentHash = res.payment_hash || res.paymentHash

    if (!paymentHash && typeof bolt11 === 'string') {
      try {
        const decoded = bolt11Decoder.decode(bolt11)
        paymentHash = decoded.tagsObject.payment_hash
      } catch (_) {}
    }

    if (this.isWatching && paymentHash) {
      this.invoicesToWatch.set(paymentHash, bolt11)
    }

    return {
      bolt11: typeof bolt11 === 'string' ? bolt11 : (bolt11.invoice || ''),
      paymentHash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    let res
    try {
      res = await this._request('GET', `/payment/${paymentHash}`)
    } catch (e) {
      res = await this._request('GET', `/v1/payment/${paymentHash}`)
    }

    const isSettled = res.status === 'Succeeded' || res.status === 'succeeded' || res.status === 'paid'
    return {
      bolt11: res.invoice || res.bolt11 || '',
      paymentHash: res.payment_hash || paymentHash,
      settled: isSettled,
      settleDate: isSettled ? new Date() : null,
      amount: res.amount_msat ? res.amount_msat / 1000 : 0,
      amountMsat: Number(res.amount_msat || 0),
      preImage: res.payment_preimage || res.preimage || null,
      status: isSettled ? 'Settled' : res.status === 'Failed' ? 'Cancelled' : 'Pending'
    }
  }

  async payInvoice({ bolt11, amountMsats }) {
    const data = { invoice: bolt11 }
    if (amountMsats) data.amount_msat = amountMsats

    let res
    try {
      res = await this._request('POST', '/send_payment', data)
    } catch (e) {
      res = await this._request('POST', '/v1/payment/bolt11/send', data)
    }

    return {
      paymentPreimage: res.payment_preimage || res.preimage || '',
      feesAmountMsats: Number(res.fee_msat || 0)
    }
  }

  async getBalance() {
    try {
      let res
      try {
        res = await this._request('GET', '/balances')
      } catch (e) {
        res = await this._request('GET', '/v1/node/balances')
      }

      const sats = res.total_lightning_balance_sats || res.spendable_onchain_balance_sats || 0
      return {
        balanceMsats: Number(sats) * 1000
      }
    } catch (err) {
      return { balanceMsats: 0 }
    }
  }

  async getInfo() {
    try {
      let res
      try {
        res = await this._request('GET', '/node_info')
      } catch (e) {
        res = await this._request('GET', '/v1/node/info')
      }

      return {
        alias: 'LDK Node',
        pubkey: res.node_id || res.public_key || '',
        version: 'ldk'
      }
    } catch (err) {
      return { alias: 'LDK Node', pubkey: '', version: 'ldk' }
    }
  }

  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    this.watchInterval = setInterval(async () => {
      for (const [hash, bolt11] of this.invoicesToWatch.entries()) {
        try {
          const inv = await this.getInvoice(hash)
          if (inv.settled) {
            this.invoicesToWatch.delete(hash)
            this.emit('invoice-updated', inv)
          }
        } catch (e) {
          // Retry
        }
      }
    }, 4000)
  }
}

module.exports = LdkBackend
