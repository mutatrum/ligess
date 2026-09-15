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

  async payKeysend({ pubkey, amountMsats, tlvRecords = [] }) {
    if (!pubkey || !amountMsats) {
      const err = new Error('Missing pubkey or amount for keysend')
      err.code = 'BAD_REQUEST'
      throw err
    }

    const data = {
      destination: pubkey,
      amount_msat: amountMsats
    }

    if (Array.isArray(tlvRecords) && tlvRecords.length > 0) {
      data.extratlvs = {}
      for (const rec of tlvRecords) {
        if (rec && rec.type !== undefined && rec.value !== undefined) {
          data.extratlvs[String(rec.type)] = typeof rec.value === 'string' ? rec.value : Buffer.from(rec.value).toString('hex')
        }
      }
    }

    const res = await this._request('POST', '/v1/keysend', data)
    return {
      paymentPreimage: res.payment_preimage || '',
      paymentHash: res.payment_hash || '',
      feesAmountMsats: Math.max(0, Number(res.amount_sent_msat || 0) - Number(res.amount_msat || 0))
    }
  }

  async listTransactions({ from, until, limit = 50, offset = 0, unpaid = false, type } = {}) {
    const transactions = []
    const fetchIncoming = !type || type === 'incoming'
    const fetchOutgoing = !type || type === 'outgoing'

    if (fetchIncoming) {
      try {
        const res = await this._request('GET', '/v1/invoice/listInvoices')
        const rawInvoices = Array.isArray(res.invoices) ? res.invoices : []
        for (const inv of rawInvoices) {
          const isSettled = inv.status === 'paid'
          if (!unpaid && !isSettled) continue
          const createdAt = Number(inv.expires_at ? inv.expires_at - 3600 : 0)
          if (from && createdAt < from) continue
          if (until && createdAt > until) continue

          transactions.push({
            type: 'incoming',
            invoice: inv.bolt11 || '',
            description: inv.description || '',
            description_hash: null,
            preimage: inv.payment_preimage || null,
            payment_hash: inv.payment_hash,
            amount: Number(inv.amount_msat || 0),
            fees_paid: 0,
            created_at: createdAt,
            expires_at: Number(inv.expires_at || 0),
            settled_at: isSettled && inv.paid_at ? Number(inv.paid_at) : null
          })
        }
      } catch (_) {}
    }

    if (fetchOutgoing) {
      try {
        const res = await this._request('GET', '/v1/pay/listPays')
        const rawPays = Array.isArray(res.pays) ? res.pays : []
        for (const p of rawPays) {
          const isSettled = p.status === 'complete'
          if (!unpaid && !isSettled) continue
          const createdAt = Number(p.created_at || 0)
          if (from && createdAt < from) continue
          if (until && createdAt > until) continue

          transactions.push({
            type: 'outgoing',
            invoice: p.bolt11 || '',
            description: p.description || '',
            description_hash: null,
            preimage: p.preimage || null,
            payment_hash: p.payment_hash,
            amount: Number(p.amount_msat || 0),
            fees_paid: Math.max(0, Number(p.amount_sent_msat || 0) - Number(p.amount_msat || 0)),
            created_at: createdAt,
            expires_at: null,
            settled_at: isSettled && p.created_at ? Number(p.created_at) : null
          })
        }
      } catch (_) {}
    }

    transactions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    return transactions.slice(offset, offset + limit)
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

  inspectCredentials() {
    if (this.rune) {
      return inspectRune(this.rune)
    }
    if (this.hexMacaroon) {
      const { inspectMacaroon } = require('./lnd')
      return inspectMacaroon(this.hexMacaroon)
    }
    return null
  }

  static inspectRune(rune) {
    return inspectRune(rune)
  }
}

function inspectRune(rune) {
  if (!rune || typeof rune !== 'string') return null
  try {
    const buf = Buffer.from(rune.trim(), 'base64')
    const str = buf.toString('latin1')
    const restrictions = str.match(/[a-zA-Z0-9_]+[=<>!~][^&|]*/g) || []
    const isMaster = restrictions.length === 0
    return { restrictions, isMaster }
  } catch (_) {
    return null
  }
}

ClnBackend.inspectRune = inspectRune
module.exports = ClnBackend
module.exports.inspectRune = inspectRune
