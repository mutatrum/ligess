const http = require('http')
const https = require('https')
const crypto = require('crypto')
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

  async listTransactions({ from, until, limit = 50, offset = 0, unpaid = false, type } = {}) {
    const transactions = []
    const fetchIncoming = !type || type === 'incoming'
    const fetchOutgoing = !type || type === 'outgoing'

    if (fetchIncoming) {
      try {
        const invRes = await this._request('GET', `/v1/invoices?reversed=true&num_max_invoices=${limit}&index_offset=${offset}`)
        const rawInvoices = invRes.invoices || []
        for (const raw of rawInvoices) {
          const isSettled = raw.settled === true || raw.state === 'SETTLED'
          if (!unpaid && !isSettled) continue

          const createdAt = Number(raw.creation_date || 0)
          if (from && createdAt < from) continue
          if (until && createdAt > until) continue

          const paymentHash = raw.r_hash ? (
            raw.r_hash.length === 64 ? raw.r_hash : Buffer.from(raw.r_hash, 'base64').toString('hex')
          ) : ''
          const preImage = raw.r_preimage ? (
            raw.r_preimage.length === 64 ? raw.r_preimage : Buffer.from(raw.r_preimage, 'base64').toString('hex')
          ) : null
          const descHash = raw.description_hash ? (
            raw.description_hash.length === 64 ? raw.description_hash : Buffer.from(raw.description_hash, 'base64').toString('hex')
          ) : null

          transactions.push({
            type: 'incoming',
            invoice: raw.payment_request || '',
            description: raw.memo || '',
            description_hash: descHash,
            preimage: preImage,
            payment_hash: paymentHash,
            amount: Number(raw.value_msat || (Number(raw.value || 0) * 1000)),
            fees_paid: 0,
            created_at: createdAt,
            expires_at: createdAt + Number(raw.expiry || 3600),
            settled_at: isSettled && raw.settle_date && raw.settle_date !== '0' ? Number(raw.settle_date) : null
          })
        }
      } catch (_) {}
    }

    if (fetchOutgoing) {
      try {
        const payRes = await this._request('GET', `/v1/payments?reversed=true&max_payments=${limit}&index_offset=${offset}`)
        const rawPayments = payRes.payments || []
        for (const p of rawPayments) {
          const createdAt = Math.floor(Number(p.creation_time_ns ? Number(p.creation_time_ns) / 1e9 : (p.creation_date || 0)))
          if (from && createdAt < from) continue
          if (until && createdAt > until) continue

          const isSettled = p.status === 'SUCCEEDED'
          if (!unpaid && !isSettled) continue

          transactions.push({
            type: 'outgoing',
            invoice: p.payment_request || '',
            description: '',
            description_hash: null,
            preimage: p.payment_preimage || null,
            payment_hash: p.payment_hash || '',
            amount: Number(p.value_msat || (Number(p.value_sat || 0) * 1000)),
            fees_paid: Number(p.fee_msat || 0),
            created_at: createdAt,
            expires_at: null,
            settled_at: isSettled ? createdAt : null
          })
        }
      } catch (_) {}
    }

    transactions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    return transactions.slice(0, limit)
  }

  async payKeysend({ pubkey, amountMsats, preimage, tlvRecords = [] } = {}) {
    if (!pubkey || !amountMsats) {
      const err = new Error('Missing pubkey or amount for keysend')
      err.code = 'BAD_REQUEST'
      throw err
    }

    const preImageHex = preimage || crypto.randomBytes(32).toString('hex')
    const paymentHashHex = crypto.createHash('sha256').update(Buffer.from(preImageHex, 'hex')).digest('hex')

    const destCustomRecords = {
      '5482373484': Buffer.from(preImageHex, 'hex').toString('base64')
    }

    if (Array.isArray(tlvRecords)) {
      for (const rec of tlvRecords) {
        if (rec && rec.type !== undefined && rec.value !== undefined) {
          destCustomRecords[String(rec.type)] = typeof rec.value === 'string'
            ? Buffer.from(rec.value, 'hex').toString('base64')
            : Buffer.from(rec.value).toString('base64')
        }
      }
    }

    const body = {
      dest: Buffer.from(pubkey, 'hex').toString('base64'),
      amt_msat: String(amountMsats),
      payment_hash: Buffer.from(paymentHashHex, 'hex').toString('base64'),
      dest_custom_records: destCustomRecords,
      timeout_seconds: 60,
      fee_limit_msat: String(Math.max(10000, Math.floor(amountMsats * 0.05)))
    }

    const res = await this._request('POST', '/v1/channels/transactions', body)
    if (res.payment_error) {
      const err = new Error(`Keysend failed: ${res.payment_error}`)
      err.code = 'PAYMENT_FAILED'
      throw err
    }

    return {
      paymentPreimage: preImageHex,
      paymentHash: paymentHashHex,
      feesAmountMsats: Number(res.payment_route?.total_fees_msat || 0)
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
          if (!this.isWatching) return
          console.warn('LND invoice subscription stream ended. Reconnecting in 3s...')
          this.reconnectTimer = setTimeout(connectStream, 3000)
          if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
            this.reconnectTimer.unref()
          }
        })
      })

      req.on('error', (err) => {
        if (!this.isWatching) return
        console.warn('LND invoice subscription stream error:', err.message)
        this.reconnectTimer = setTimeout(connectStream, 5000)
        if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
          this.reconnectTimer.unref()
        }
      })

      this.streamReq = req
      req.end()
    }

    connectStream()
  }

  stopWatchingInvoices() {
    this.isWatching = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.streamReq) {
      this.streamReq.destroy()
      this.streamReq = null
    }
  }

  inspectCredentials() {
    return inspectMacaroon(this.hexMacaroon)
  }

  static inspectMacaroon(macaroonHex) {
    return inspectMacaroon(macaroonHex)
  }
}

function parseProtobufFields(buffer) {
  let offset = 0
  const fields = []
  while (offset < buffer.length) {
    const key = buffer[offset++]
    const fieldNum = key >> 3
    const wireType = key & 7
    if (wireType === 0) {
      let val = 0, shift = 0
      while (true) {
        if (offset >= buffer.length) break
        const b = buffer[offset++]
        val |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      fields.push({ fieldNum, wireType, val })
    } else if (wireType === 2) {
      let len = 0, shift = 0
      while (true) {
        if (offset >= buffer.length) break
        const b = buffer[offset++]
        len |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      if (offset + len > buffer.length) break
      const data = buffer.slice(offset, offset + len)
      offset += len
      fields.push({ fieldNum, wireType, data })
    } else {
      break
    }
  }
  return fields
}

function inspectMacaroon(macaroonHex) {
  if (!macaroonHex || typeof macaroonHex !== 'string') return null
  try {
    const crypto = require('crypto')
    const buf = Buffer.from(macaroonHex.trim(), 'hex')
    if (buf.length < 10) return null

    const fingerprint = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
    const version = buf[0]
    let identifier = null

    if (version === 2) {
      let offset = 1
      while (offset < buf.length) {
        const type = buf[offset++]
        if (type === 0) break
        let len = 0, shift = 0
        while (true) {
          if (offset >= buf.length) break
          const b = buf[offset++]
          len |= (b & 0x7f) << shift
          if ((b & 0x80) === 0) break
          shift += 7
        }
        if (offset + len > buf.length) break
        const data = buf.slice(offset, offset + len)
        offset += len
        if (type === 2) identifier = data
      }
    }

    const permissions = []
    if (identifier && identifier.length > 1) {
      const protoBuf = identifier.slice(1)
      const idFields = parseProtobufFields(protoBuf)
      const ops = idFields.filter(f => f.fieldNum === 3)
      for (const op of ops) {
        const opFields = parseProtobufFields(op.data)
        const entity = opFields.find(f => f.fieldNum === 1)?.data?.toString('utf8')
        const actions = opFields.filter(f => f.fieldNum === 2).map(f => f.data.toString('utf8'))
        if (entity) {
          for (const act of actions) {
            permissions.push(`${entity}:${act}`)
          }
        }
      }
    }

    const hasOffchainWrite = permissions.includes('offchain:write')
    const hasInvoices = permissions.some(p => p.startsWith('invoices:'))
    const isAdmin = permissions.some(p => p.startsWith('macaroon:') || p.startsWith('signer:'))

    let mode = 'Unknown'
    if (isAdmin) {
      mode = 'Admin (Full Access)'
    } else if (hasOffchainWrite) {
      mode = 'Full Mode (Inbound & Outbound NWC Spending)'
    } else if (hasInvoices) {
      mode = 'Receive-Only Mode (Zero Outbound Spend Capability)'
    }

    return {
      fingerprint,
      permissions,
      hasOffchainWrite,
      isAdmin,
      mode,
      byteLength: buf.length
    }
  } catch (_) {
    return null
  }
}

LndBackend.inspectMacaroon = inspectMacaroon
module.exports = LndBackend
module.exports.inspectMacaroon = inspectMacaroon
