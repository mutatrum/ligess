const Backend = require('./base')
const { Mint, Wallet, MintQuoteState } = require('@cashu/cashu-ts')
const bolt11Decoder = require('bolt11')

class CashuBackend extends Backend {
  constructor({ mintUrl, socksProxyUrl = null }) {
    super()
    this.mintUrl = (mintUrl || 'https://mint.minibits.cash/Bitcoin').replace(/\/+$/, '')
    this.socksProxyUrl = socksProxyUrl
    this.mint = new Mint(this.mintUrl)
    this.wallet = new Wallet(this.mint)
    this.isWatching = false
    this.watchInterval = null
    this.quoteMap = new Map() // paymentHash -> { quoteId, bolt11, amountSat }
  }

  async createInvoice({ amountMsats, memo }) {
    const amountSat = Math.max(1, Math.ceil(amountMsats / 1000))
    const quote = await this.wallet.createMintQuote(amountSat, { description: memo || 'Satoshis' })
    const bolt11 = quote.request
    let paymentHash = ''

    try {
      const decoded = bolt11Decoder.decode(bolt11)
      paymentHash = decoded.tagsObject.payment_hash
    } catch (_) {
      paymentHash = quote.quote
    }

    this.quoteMap.set(paymentHash, {
      quoteId: quote.quote,
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

    const quote = await this.wallet.checkMintQuote(quoteId)
    const isPaid = quote.state === MintQuoteState.PAID || quote.state === MintQuoteState.ISSUED

    return {
      bolt11: quote.request || (record ? record.bolt11 : ''),
      paymentHash,
      settled: isPaid,
      settleDate: isPaid ? new Date() : null,
      amount: record ? record.amountSat : 0,
      amountMsat: (record ? record.amountSat : 0) * 1000,
      preImage: null,
      status: isPaid ? 'Settled' : 'Pending'
    }
  }

  async payInvoice({ bolt11 }) {
    const meltQuote = await this.wallet.createMeltQuote(bolt11)
    return {
      paymentPreimage: '',
      feesAmountMsats: Number(meltQuote.fee_reserve || 0) * 1000
    }
  }

  async getBalance() {
    return {
      balanceMsats: 0
    }
  }

  async getInfo() {
    try {
      const info = await this.wallet.getMintInfo()
      return {
        alias: info.name || 'Cashu Mint Gateway',
        pubkey: info.pubkey || '',
        version: info.version || 'NUT-04/05'
      }
    } catch (_) {
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
          const quote = await this.wallet.checkMintQuote(record.quoteId)
          if (quote.state === MintQuoteState.PAID || quote.state === MintQuoteState.ISSUED) {
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
        } catch (_) {
          // Retry
        }
      }
    }, 4000)
  }
}

module.exports = CashuBackend
