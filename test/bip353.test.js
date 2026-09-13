const { describe, it } = require('node:test')
const assert = require('node:assert')
const { formatDnsTxtRecord, getBip353Uri } = require('../bip353')

describe('BIP-353 Helpers', () => {
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
})
