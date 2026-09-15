const { describe, it, beforeEach } = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const path = require("path")
const { Wallet } = require("@cashu/cashu-ts")
const {
  isNutzapEnabled,
  getTrustedMints,
  getNutzapRelays,
  getP2PKKeys,
  buildNutzapInfoEvent,
  processNutzapEvent,
  formatCashuPaymentRequest
} = require("../src/nostr/nutzaps")

describe("NIP-61 Nutzaps Engine", () => {
  const testPrivKey = "11".repeat(32)

  it("should determine if Nutzap is enabled based on env variables", () => {
    assert.strictEqual(isNutzapEnabled({}), false)
    assert.strictEqual(isNutzapEnabled({ LIGESS_NUTZAP_ENABLED: "false" }), false)
    assert.strictEqual(isNutzapEnabled({ LIGESS_NUTZAP_ENABLED: "true" }), true)
    assert.strictEqual(isNutzapEnabled({ LIGESS_NUTZAP_MINTS: "https://mint.example.com" }), true)
  })

  it("should get default and custom trusted mints", () => {
    const defaultMints = getTrustedMints({})
    assert.ok(defaultMints.length >= 2)
    assert.ok(defaultMints[0].startsWith("https://"))

    const customMints = getTrustedMints({
      LIGESS_NUTZAP_MINTS: "https://mint1.com, https://mint2.org/"
    })
    assert.deepStrictEqual(customMints, ["https://mint1.com", "https://mint2.org"])
  })

  it("should get default and custom nutzap relays", () => {
    const defaultRelays = getNutzapRelays({})
    assert.ok(defaultRelays.length >= 2)
    assert.ok(defaultRelays[0].startsWith("wss://"))

    const customRelays = getNutzapRelays({
      LIGESS_NUTZAP_RELAYS: "wss://relay1.com, wss://relay2.org"
    })
    assert.deepStrictEqual(customRelays, ["wss://relay1.com", "wss://relay2.org"])
  })

  it("should derive valid 02-prefixed P2PK public key and signing private key", () => {
    const keys = getP2PKKeys(testPrivKey)
    assert.ok(keys)
    assert.strictEqual(keys.p2pkPubHex.length, 66)
    assert.strictEqual(keys.p2pkPubHex.slice(0, 2), "02")
    assert.strictEqual(keys.p2pkPubHex.slice(2), keys.nostrPubHex)
    assert.ok(keys.p2pkPrivBytes instanceof Uint8Array)
    assert.strictEqual(keys.p2pkPrivBytes.length, 32)
  })

  it("should construct valid NIP-61 kind 10019 announcement event", () => {
    const env = {
      LIGESS_NUTZAP_PRIVATE_KEY: testPrivKey,
      LIGESS_NUTZAP_MINTS: "https://mint.test/btc",
      LIGESS_NUTZAP_RELAYS: "wss://relay.test"
    }
    const event = buildNutzapInfoEvent(env)

    assert.strictEqual(event.kind, 10019)
    assert.strictEqual(event.content, "")
    assert.ok(typeof event.created_at === "number")

    const pubkeyTag = event.tags.find(t => t[0] === "pubkey")
    assert.ok(pubkeyTag)
    assert.strictEqual(pubkeyTag[1].slice(0, 2), "02")

    const mintTags = event.tags.filter(t => t[0] === "mint")
    assert.strictEqual(mintTags.length, 1)
    assert.deepStrictEqual(mintTags[0], ["mint", "https://mint.test/btc", "sat"])

    const relayTags = event.tags.filter(t => t[0] === "relay")
    assert.strictEqual(relayTags.length, 1)
    assert.deepStrictEqual(relayTags[0], ["relay", "wss://relay.test"])
  })

  it("should reject invalid nutzap events", async () => {
    const res1 = await processNutzapEvent({ kind: 1 })
    assert.strictEqual(res1.success, false)
    assert.ok(res1.reason.includes("Invalid event kind"))

    const res2 = await processNutzapEvent({
      kind: 9321,
      id: "event_no_mint",
      tags: []
    }, { env: { LIGESS_NUTZAP_PRIVATE_KEY: testPrivKey } })
    assert.strictEqual(res2.success, false)
    assert.ok(res2.reason.includes("Missing mint tag"))

    const res3 = await processNutzapEvent({
      kind: 9321,
      id: "event_no_proofs",
      tags: [["u", "https://mint.test"]]
    }, { env: { LIGESS_NUTZAP_PRIVATE_KEY: testPrivKey } })
    assert.strictEqual(res3.success, false)
    assert.ok(res3.reason.includes("No proofs found"))
  })

  it("should process nutzap event, sign P2PK proofs, and auto-melt to Lightning", async () => {
    const keys = getP2PKKeys(testPrivKey)
    const proof = {
      id: "00",
      amount: 42,
      secret: JSON.stringify(["P2PK", { nonce: "n1", data: keys.p2pkPubHex }]),
      C: "02" + "44".repeat(32)
    }

    const testEvent = {
      id: "test_nutzap_" + Date.now(),
      kind: 9321,
      pubkey: "sender_pubkey_hex",
      tags: [
        ["u", "https://mint.test"],
        ["proof", JSON.stringify(proof)]
      ]
    }

    // Mock Lightning Backend
    let invoiceCreatedWith = null
    const mockBackend = {
      createInvoice: async ({ amountMsats, memo }) => {
        invoiceCreatedWith = { amountMsats, memo }
        return { bolt11: "lnbc420n1testinvoice" }
      }
    }

    // Mock Wallet melt methods
    const originalCreateMeltQuote = Wallet.prototype.createMeltQuote
    const originalMeltProofs = Wallet.prototype.meltProofs
    let meltedQuote = null
    let meltedProofs = null

    try {
      Wallet.prototype.createMeltQuote = async function (bolt11) {
        return { quote: "quote_123", amount: 42, fee_reserve: 0 }
      }
      Wallet.prototype.meltProofs = async function (meltQuote, proofs) {
        meltedQuote = meltQuote
        meltedProofs = proofs
        return { isPaid: true }
      }

      const result = await processNutzapEvent(testEvent, {
        autoMelt: true,
        getBackend: () => mockBackend,
        env: { LIGESS_NUTZAP_PRIVATE_KEY: testPrivKey }
      })

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.melted, true)
      assert.strictEqual(result.amountSat, 42)
      assert.strictEqual(invoiceCreatedWith.amountMsats, 42000)
      assert.ok(meltedProofs[0].witness)

      // Test duplicate claim prevention
      const dupeResult = await processNutzapEvent(testEvent, {
        autoMelt: true,
        getBackend: () => mockBackend,
        env: { LIGESS_NUTZAP_PRIVATE_KEY: testPrivKey }
      })
      assert.strictEqual(dupeResult.success, false)
      assert.ok(dupeResult.reason.includes("already claimed"))
    } finally {
      Wallet.prototype.createMeltQuote = originalCreateMeltQuote
      Wallet.prototype.meltProofs = originalMeltProofs
    }
  })

  it("should format valid Cashu Payment Request (NUT-18 / NUT-26 Bech32m)", () => {
    const creq = formatCashuPaymentRequest({
      amount: 100,
      mints: ["https://mint.minibits.cash/Bitcoin"],
      unit: "sat",
      description: "Coffee tip"
    })

    assert.ok(creq)
    assert.ok(creq.startsWith("CREQB") || creq.startsWith("creq"))
  })

  it("should reject spent proofs on mint via NUT-07 checkProofsStates", async () => {
    const originalCheckProofsStates = Wallet.prototype.checkProofsStates
    try {
      Wallet.prototype.checkProofsStates = async function () {
        return [{ Y: "02" + "00".repeat(32), state: "SPENT", witness: null }]
      }

      const spentEvent = {
        id: "spent_nutzap_" + Date.now(),
        kind: 9321,
        pubkey: "sender_spent",
        tags: [
          ["u", "https://mint.minibits.cash/Bitcoin"],
          ["proof", JSON.stringify({ amount: 10, secret: "secret_spent", C: "c_spent", id: "00" })]
        ]
      }

      const result = await processNutzapEvent(spentEvent, {
        autoMelt: true,
        getBackend: () => ({ createInvoice: async () => ({ bolt11: "lnbc..." }) }),
        env: { LIGESS_NUTZAP_PRIVATE_KEY: testPrivKey }
      })

      assert.strictEqual(result.success, false)
      assert.ok(result.reason.includes("already spent") || result.reason.includes("NUT-07"))
    } finally {
      Wallet.prototype.checkProofsStates = originalCheckProofsStates
    }
  })
})
