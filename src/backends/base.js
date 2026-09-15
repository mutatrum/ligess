const EventEmitter = require('events')

class Backend extends EventEmitter {
  constructor() {
    super()
  }

  /**
   * Create an invoice
   * @param {Object} params
   * @param {number} params.amountMsats
   * @param {string} [params.descriptionHash] Hex string
   * @param {string} [params.memo]
   * @param {number} [params.expiry] In seconds
   * @returns {Promise<{ bolt11: string, paymentHash: string, amountMsats: number }>}
   */
  async createInvoice(params) {
    throw new Error('createInvoice not implemented')
  }

  /**
   * Get invoice status by payment hash
   * @param {string} paymentHash Hex string
   * @returns {Promise<{ bolt11: string, paymentHash: string, settled: boolean, settleDate: Date|null, preImage: string|null, status: string }>}
   */
  async getInvoice(paymentHash) {
    throw new Error('getInvoice not implemented')
  }

  /**
   * Pay a BOLT11 invoice
   * @param {Object} params
   * @param {string} params.bolt11
   * @param {number} [params.amountMsats]
   * @returns {Promise<{ paymentPreimage: string, feesAmountMsats: number }>}
   */
  async payInvoice(params) {
    throw new Error('payInvoice not implemented')
  }

  /**
   * Query wallet / node balance
   * @returns {Promise<{ balanceMsats: number }>}
   */
  async getBalance() {
    throw new Error('getBalance not implemented')
  }

  /**
   * Query node info
   * @returns {Promise<{ alias: string, pubkey: string, version: string }>}
   */
  async getInfo() {
    throw new Error('getInfo not implemented')
  }

  /**
   * List transactions (invoices and/or payments)
   * @param {Object} [params]
   * @param {number} [params.from] Timestamp in seconds
   * @param {number} [params.until] Timestamp in seconds
   * @param {number} [params.limit] Max items
   * @param {number} [params.offset] Offset
   * @param {boolean} [params.unpaid] Whether to include unpaid invoices
   * @param {string} [params.type] 'incoming' or 'outgoing'
   * @returns {Promise<Array<Object>>}
   */
  async listTransactions(params = {}) {
    return []
  }

  /**
   * Spontaneous keysend payment (bLIP-0003)
   * @param {Object} params
   * @param {string} params.pubkey Target node pubkey hex
   * @param {number} params.amountMsats Amount in msats
   * @param {string} [params.preimage] Optional 32-byte hex preimage
   * @param {Array<{type: number, value: string}>} [params.tlvRecords] Optional TLV records
   * @returns {Promise<{ paymentPreimage: string, feesAmountMsats: number }>}
   */
  async payKeysend(params) {
    const err = new Error('payKeysend not implemented on this backend')
    err.code = 'NOT_IMPLEMENTED'
    throw err
  }

  /**
   * Start watching for settled invoices and emit 'invoice-updated'
   */
  startWatchingInvoices() {
    throw new Error('startWatchingInvoices not implemented')
  }

  watchInvoices() {
    this.startWatchingInvoices()
    return this
  }

  stopWatchingInvoices() {
    this.isWatching = false
    if (this.watchInterval) {
      clearInterval(this.watchInterval)
      this.watchInterval = null
    }
  }
}

module.exports = Backend
