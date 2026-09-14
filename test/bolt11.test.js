const { describe, it } = require('node:test')
const assert = require('node:assert')
const { decode } = require('../src/clients/bolt11')

describe('Zero-Dependency BOLT11 Decoder', () => {
  it('should parse amounts across different multipliers', () => {
    // 20u = 20 micro-BTC = 2,000 satoshis = 2,000,000 msats
    const invU = decode('lnbc20u1test')
    assert.strictEqual(invU.satoshis, 2000)
    assert.strictEqual(invU.millisatoshis, 2000000)

    // 100n = 100 nano-BTC = 10 satoshis = 10,000 msats
    const invN = decode('lnbc100n1test')
    assert.strictEqual(invN.satoshis, 10)
    assert.strictEqual(invN.millisatoshis, 10000)

    // 1m = 1 milli-BTC = 100,000 satoshis = 100,000,000 msats
    const invM = decode('lnbc1m1test')
    assert.strictEqual(invM.satoshis, 100000)
    assert.strictEqual(invM.millisatoshis, 100000000)
  })

  it('should reject invalid invoice inputs', () => {
    assert.throws(() => decode(''), /Invalid invoice/)
    assert.throws(() => decode(null), /Invalid invoice/)
    assert.throws(() => decode('invalid_prefix'), /Invalid BOLT11 invoice prefix/)
  })

  it('should provide default timeExpireDate and tagsObject structure', () => {
    const inv = decode('lnbc50u1dummy')
    assert.strictEqual(inv.satoshis, 5000)
    assert.ok(typeof inv.timeExpireDate === 'number')
    assert.ok(typeof inv.timestamp === 'number')
    assert.ok(typeof inv.tagsObject === 'object')
  })
})
