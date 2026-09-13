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
   * Start watching for settled invoices and emit 'invoice-updated'
   */
  startWatchingInvoices() {
    throw new Error('startWatchingInvoices not implemented')
  }

  watchInvoices() {
    this.startWatchingInvoices()
    return this
  }
}

module.exports = Backend
