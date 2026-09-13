const https = require('https')
const http = require('http')
const Backend = require('./base')

let SocksProxyAgent = null
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
} catch (e) {
  // Optional proxy
}

class BlinkBackend extends Backend {
  constructor({ url = 'https://api.blink.sv/graphql', apiKey, walletId = null, socksProxyUrl = null }) {
    super()
    this.url = url
    this.apiKey = apiKey
    this.walletId = walletId
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

  async _graphql(query, variables = {}) {
    const fullUrl = new URL(this.url)
    const isHttps = fullUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const headers = {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`
    }

    const body = JSON.stringify({ query, variables })

    const options = {
      method: 'POST',
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: `${fullUrl.pathname}${fullUrl.search}`,
      headers,
      agent: this._getAgent(isHttps)
    }

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Blink GraphQL error (${res.statusCode}): ${data}`))
          }
          try {
            const json = JSON.parse(data)
            if (json.errors && json.errors.length > 0) {
              return reject(new Error(`Blink GraphQL error: ${json.errors[0].message}`))
            }
            resolve(json.data || {})
          } catch (err) {
            reject(new Error(`Invalid JSON response from Blink: ${err.message}`))
          }
        })
      })

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  async _getWalletId() {
    if (this.walletId) return this.walletId

    const query = `
      query Me {
        me {
          defaultAccount {
            wallets {
              id
              walletCurrency
            }
          }
        }
      }
    `
    const data = await this._graphql(query)
    const wallets = data?.me?.defaultAccount?.wallets || []
    const btcWallet = wallets.find(w => w.walletCurrency === 'BTC') || wallets[0]
    if (!btcWallet) {
      throw new Error('Unable to resolve BTC wallet ID on Blink account')
    }
    this.walletId = btcWallet.id
    return this.walletId
  }

  async createInvoice({ amountMsats, descriptionHash, memo, expiry }) {
    const walletId = await this._getWalletId()
    const amountSat = Math.max(1, Math.ceil(amountMsats / 1000))

    const mutation = `
      mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
        lnInvoiceCreate(input: $input) {
          errors {
            message
          }
          invoice {
            paymentRequest
            paymentHash
            paymentSecret
            satoshis
          }
        }
      }
    `

    const data = await this._graphql(mutation, {
      input: {
        walletId,
        amount: amountSat,
        memo: memo || 'Satoshis',
        expiresIn: expiry || 3600
      }
    })

    const payload = data?.lnInvoiceCreate
    if (payload?.errors && payload.errors.length > 0) {
      throw new Error(`Blink invoice error: ${payload.errors[0].message}`)
    }

    const inv = payload?.invoice
    if (!inv) throw new Error('Failed to obtain invoice from Blink')

    if (this.isWatching && inv.paymentHash) {
      this.invoicesToWatch.set(inv.paymentHash, inv.paymentRequest)
    }

    return {
      bolt11: inv.paymentRequest,
      paymentHash: inv.paymentHash,
      amountMsats: Number(amountMsats)
    }
  }

  async getInvoice(paymentHash) {
    const query = `
      query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
        lnInvoicePaymentStatus(input: $input) {
          errors {
            message
          }
          status
        }
      }
    `

    const data = await this._graphql(query, {
      input: {
        paymentHash
      }
    })

    const statusObj = data?.lnInvoicePaymentStatus
    const isPaid = statusObj?.status === 'PAID'

    return {
      bolt11: this.invoicesToWatch.get(paymentHash) || '',
      paymentHash,
      settled: isPaid,
      settleDate: isPaid ? new Date() : null,
      amount: 0,
      amountMsat: 0,
      preImage: null,
      status: isPaid ? 'Settled' : statusObj?.status === 'EXPIRED' ? 'Cancelled' : 'Pending'
    }
  }

  async payInvoice({ bolt11, amountMsats }) {
    const walletId = await this._getWalletId()

    const mutation = `
      mutation LnInvoicePaymentSend($input: LnInvoicePaymentSendInput!) {
        lnInvoicePaymentSend(input: $input) {
          errors {
            message
          }
          status
        }
      }
    `

    const data = await this._graphql(mutation, {
      input: {
        walletId,
        paymentRequest: bolt11
      }
    })

    const res = data?.lnInvoicePaymentSend
    if (res?.errors && res.errors.length > 0) {
      throw new Error(`Blink pay error: ${res.errors[0].message}`)
    }

    return {
      paymentPreimage: '',
      feesAmountMsats: 0
    }
  }

  async getBalance() {
    try {
      const query = `
        query Me {
          me {
            defaultAccount {
              wallets {
                id
                walletCurrency
                balance
              }
            }
          }
        }
      `
      const data = await this._graphql(query)
      const wallets = data?.me?.defaultAccount?.wallets || []
      const btc = wallets.find(w => w.walletCurrency === 'BTC')
      const sats = btc ? btc.balance : 0
      return {
        balanceMsats: sats * 1000
      }
    } catch (err) {
      return { balanceMsats: 0 }
    }
  }

  async getInfo() {
    return {
      alias: 'Blink / Galoy Wallet',
      pubkey: '',
      version: 'Galoy GraphQL'
    }
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
          // Retry next tick
        }
      }
    }, 4000)
  }
}

module.exports = BlinkBackend
