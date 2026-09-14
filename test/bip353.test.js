const { describe, it } = require('node:test')
const assert = require('node:assert')
const dns = require('dns').promises
const { formatDnsTxtRecord, getBip353Uri, verifyBip353Dns } = require('../bin/bip353')

describe('BIP-353 Helpers & DNS Verification', () => {
  it('should format valid BIP-353 DNS TXT records', () => {
    const username = 'alice'
    const domain = 'hodl.camp'
    const offer = 'lno1qgsqvphw8mqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'

    const record = formatDnsTxtRecord(username, domain, offer)
    assert.strictEqual(record.subdomain, 'alice.user._bitcoin-payment.hodl.camp.')
    assert.strictEqual(record.type, 'TXT')
    assert.strictEqual(record.value, `bitcoin:?lno=${offer}`)
    assert.strictEqual(record.fullRecord, `alice.user._bitcoin-payment.hodl.camp. IN TXT "bitcoin:?lno=${offer}"`)
  })

  it('should generate bitcoin URI with lno parameter', () => {
    const offer = 'lno1testoffer'
    const uri = getBip353Uri(offer)
    assert.strictEqual(uri, 'bitcoin:?lno=lno1testoffer')
  })

  it('should verify matching DNS TXT record including multi-part chunks', async () => {
    const originalResolveTxt = dns.resolveTxt
    const expectedOffer = 'lno1testoffer123456789'

    // Mock multi-part 255-byte DNS TXT chunks
    dns.resolveTxt = async (subdomain) => {
      assert.strictEqual(subdomain, 'alice.user._bitcoin-payment.hodl.camp')
      return [
        ['bitcoin:?lno=lno1testoffer', '123456789']
      ]
    }

    try {
      const res = await verifyBip353Dns('alice', 'hodl.camp', expectedOffer)
      assert.strictEqual(res.status, 'FOUND')
      assert.strictEqual(res.matches, true)
      assert.strictEqual(res.offer, expectedOffer)
    } finally {
      dns.resolveTxt = originalResolveTxt
    }
  })

  it('should detect mismatched DNS TXT record', async () => {
    const originalResolveTxt = dns.resolveTxt

    dns.resolveTxt = async () => {
      return [['bitcoin:?lno=lno1differentOffer']]
    }

    try {
      const res = await verifyBip353Dns('alice', 'hodl.camp', 'lno1expectedOffer')
      assert.strictEqual(res.status, 'FOUND')
      assert.strictEqual(res.matches, false)
      assert.strictEqual(res.offer, 'lno1differentOffer')
    } finally {
      dns.resolveTxt = originalResolveTxt
    }
  })

  it('should handle missing DNS record gracefully', async () => {
    const originalResolveTxt = dns.resolveTxt

    dns.resolveTxt = async () => {
      const err = new Error('queryTxt ENOTFOUND')
      err.code = 'ENOTFOUND'
      throw err
    }

    try {
      const res = await verifyBip353Dns('alice', 'hodl.camp', 'lno1offer')
      assert.strictEqual(res.status, 'NOT_FOUND')
      assert.strictEqual(res.matches, false)
      assert.strictEqual(res.error, 'ENOTFOUND')
    } finally {
      dns.resolveTxt = originalResolveTxt
    }
  })
})
