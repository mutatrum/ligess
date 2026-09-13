const fs = require('fs')
const path = require('path')

class LndkClient {
  constructor() {
    this.enabled = process.env.LIGESS_LNDK_ENABLED === 'true'
    this.grpcHost = process.env.LIGESS_LNDK_GRPC_HOST || '127.0.0.1:7000'
    this.tlsCertPath = process.env.LIGESS_LNDK_TLS_CERT || null
    this.macaroonHex = process.env.LIGESS_LNDK_MACAROON_HEX || process.env.LIGESS_LND_MACAROON || null
  }

  isEnabled() {
    return this.enabled
  }

  /**
   * Create a BOLT12 offer with blinded paths
   * @param {Object} params
   * @param {number} [params.amountMsats]
   * @param {string} [params.description]
   * @returns {Promise<{ offer: string }>}
   */
  async createOffer({ amountMsats = 0, description = 'Ligess Offer' }) {
    if (!this.enabled) {
      throw new Error('LNDK is not enabled in configuration (LIGESS_LNDK_ENABLED=true)')
    }

    const { execFile } = require('child_process')
    return new Promise((resolve, reject) => {
      const args = ['create-offer']
      if (amountMsats > 0) {
        args.push('--amount', String(amountMsats))
      }
      if (description) {
        args.push('--description', description)
      }

      execFile('lndk-cli', args, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`LNDK CreateOffer failed: ${stderr || err.message}`))
        }
        const trimmed = stdout.trim()
        const match = trimmed.match(/lno1[a-z0-9]+/i)
        if (match) {
          return resolve({ offer: match[0] })
        }
        resolve({ offer: trimmed })
      })
    })
  }

  /**
   * Pay a BOLT12 offer using LNDK
   * @param {Object} params
   * @param {string} params.offer
   * @param {number} [params.amountMsats]
   * @param {string} [params.payerNote]
   * @returns {Promise<{ paymentPreimage: string }>}
   */
  async payOffer({ offer, amountMsats, payerNote }) {
    if (!this.enabled) {
      throw new Error('LNDK is not enabled in configuration (LIGESS_LNDK_ENABLED=true)')
    }

    const { execFile } = require('child_process')
    return new Promise((resolve, reject) => {
      const args = ['pay-offer', '--offer-string', offer]
      if (amountMsats) {
        args.push('--amount', String(amountMsats))
      }
      if (payerNote) {
        args.push('--payer-note', payerNote)
      }

      execFile('lndk-cli', args, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`LNDK PayOffer failed: ${stderr || err.message}`))
        }
        const trimmed = stdout.trim()
        const preimageMatch = trimmed.match(/([a-f0-9]{64})/i)
        resolve({
          paymentPreimage: preimageMatch ? preimageMatch[1] : trimmed
        })
      })
    })
  }

  /**
   * Decode an lno1 offer string
   * @param {string} offerString
   */
  async decodeOffer(offerString) {
    const { execFile } = require('child_process')
    return new Promise((resolve, reject) => {
      execFile('lndk-cli', ['decode-offer', '--offer-string', offerString], (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`LNDK DecodeOffer failed: ${stderr || err.message}`))
        }
        try {
          resolve(JSON.parse(stdout))
        } catch (e) {
          resolve({ raw: stdout.trim() })
        }
      })
    })
  }
}

const lndkClient = new LndkClient()

module.exports = { lndkClient }
