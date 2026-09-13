const http = require('http')
const https = require('https')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy dependency
}

class ClnBackend extends Backend {
  constructor({ url, hexMacaroon = null, rune = null, socksProxyUrl = null }) {
    super()
    this.baseUrl = url.replace(/\/+$/, '')
    this.hexMacaroon = hexMacaroon
    this.rune = rune
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

    const headers = {}
    if (this.hexMacaroon) {
      headers['macaroon'] = this.hexMacaroon
    } else if (this.rune) {
      headers['rune'] = this.rune
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
            return reject(new Error(`CLN REST API error (${res.statusCode}): ${responseData}`))
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
    const label = `ligess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const data = {
      amount_msat: Number(amountMsats),
      label,
      description: memo || 'Satoshis',
      expiry: expiry || 3600
    }
    if (descriptionHash) {
      data.deschashonly = true
      data.description = descriptionHash
    }

    const res = await this._request('POST', '/v1/invoice', data)

    return {
      bolt11: res.bolt11,
      paymentHash: res.payment_hash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const res = await this._request('GET', `/v1/invoice/listInvoices?payment_hash=${paymentHash}`)
    const invoice = Array.isArray(res.invoices) && res.invoices.length > 0 ? res.invoices[0] : null
    if (!invoice) throw new Error('Invoice not found')

    const isSettled = invoice.status === 'paid'
    return {
      bolt11: invoice.bolt11,
      paymentHash: invoice.payment_hash,
      settled: isSettled,
      settleDate: isSettled && invoice.paid_at ? new Date(invoice.paid_at * 1000) : null,
      amount: invoice.amount_msat ? invoice.amount_msat / 1000 : 0,
      amountMsat: invoice.amount_msat || 0,
      preImage: invoice.payment_preimage || null,
      status: isSettled ? 'Settled' : invoice.status === 'expired' ? 'Cancelled' : 'Pending'
    }
  }

  async payInvoice({ bolt11 }) {
    const res = await this._request('POST', '/v1/pay', { bolt11 })
    return {
      paymentPreimage: res.payment_preimage || '',
      feesAmountMsats: Number(res.amount_sent_msat || 0) - Number(res.amount_msat || 0)
    }
  }

  async getBalance() {
    try {
      const res = await this._request('GET', '/v1/channel/listFunds')
      const channels = res.channels || []
      const balanceMsat = channels.reduce((acc, c) => acc + (c.our_amount_msat || 0), 0)
      return { balanceMsats: balanceMsat }
    } catch (err) {
      return { balanceMsats: 0 }
    }
  }

  async getInfo() {
    const res = await this._request('GET', '/v1/getinfo')
    return {
      alias: res.alias || 'CLN Node',
      pubkey: res.id || '',
      version: res.version || ''
    }
  }

  startWatchingInvoices() {
    if (this.isWatching) return
    this.isWatching = true

    this.watchInterval = setInterval(async () => {
      try {
        const res = await this._request('GET', '/v1/invoice/listInvoices?status=paid')
        const invoices = res.invoices || []

        for (const inv of invoices) {
          if (!this.seenSettled.has(inv.payment_hash)) {
            this.seenSettled.add(inv.payment_hash)
            this.emit('invoice-updated', {
              bolt11: inv.bolt11,
              paymentHash: inv.payment_hash,
              settled: true,
              settleDate: new Date(inv.paid_at * 1000),
              amount: inv.amount_msat ? inv.amount_msat / 1000 : 0,
              amountMsat: inv.amount_msat || 0,
              preImage: inv.payment_preimage || null,
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

module.exports = ClnBackend
