const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const db = require('../src/storage/db')

describe('Persistence Engine (db.js)', () => {
  it('should store, retrieve, and remove pending zap requests', () => {
    const paymentHash = 'test_hash_1234567890abcdef'
    const zapRequest = { kind: 9734, content: 'Zap test' }
    const comment = 'Great post!'

    db.storePendingZap(paymentHash, zapRequest, comment)

    const retrieved = db.getPendingZap(paymentHash)
    assert.ok(retrieved, 'Pending zap should be retrieved')
    assert.deepStrictEqual(retrieved.zapRequest, zapRequest)
    assert.strictEqual(retrieved.comment, comment)

    db.removePendingZap(paymentHash)
    const afterRemove = db.getPendingZap(paymentHash)
    assert.strictEqual(afterRemove, null, 'Pending zap should be removed')
  })

  it('should record NWC spends and calculate time-windowed sums', () => {
    const initialDaySum = db.getNwcSpendSum(24 * 60 * 60 * 1000)

    db.recordNwcSpend(250, 'test payment 1')
    db.recordNwcSpend(500, 'test payment 2')

    const newDaySum = db.getNwcSpendSum(24 * 60 * 60 * 1000)
    assert.strictEqual(newDaySum, initialDaySum + 750, 'Daily sum should increase by recorded spends')

    const hourSum = db.getNwcSpendSum(60 * 60 * 1000)
    assert.ok(hourSum >= 750, 'Hourly sum should include recent spends')
  })
})
