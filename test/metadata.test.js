const { describe, it } = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const path = require("path")
const os = require("os")
const { getProfileMetadata, getMetadataNote } = require("../src/nostr/metadata")
const { getRelayInformation } = require("../src/nostr/nwcServer")
const { checkLegacyFiles, inspectLndMacaroon, inspectClnRune } = require("../src/config/startup")

describe("Dynamic Profile Metadata & Relay Information", () => {
  it("should generate default profile metadata from username and domain", () => {
    const env = {
      LIGESS_USERNAME: "satoshi",
      LIGESS_DOMAIN: "nakamoto.org"
    }
    const meta = getProfileMetadata(env)

    assert.strictEqual(meta.name, "satoshi")
    assert.strictEqual(meta.display_name, "satoshi")
    assert.strictEqual(meta.nip05, "satoshi@nakamoto.org")
    assert.strictEqual(meta.lud16, "satoshi@nakamoto.org")
    assert.strictEqual(meta.website, "https://nakamoto.org/")
    assert.ok(meta.about.includes("Bitcoin"))
  })

  it("should support profile metadata overrides from environment variables", () => {
    const env = {
      LIGESS_USERNAME: "bob",
      LIGESS_DOMAIN: "lightning.net",
      LIGESS_NOSTR_DISPLAY_NAME: "Bob Builder",
      LIGESS_NOSTR_ABOUT: "Building Lightning and Nostr tools",
      LIGESS_NOSTR_PICTURE: "https://lightning.net/bob.png",
      LIGESS_NOSTR_BANNER: "https://lightning.net/banner.png",
      LIGESS_NOSTR_WEBSITE: "https://bob.me"
    }
    const meta = getProfileMetadata(env)

    assert.strictEqual(meta.display_name, "Bob Builder")
    assert.strictEqual(meta.about, "Building Lightning and Nostr tools")
    assert.strictEqual(meta.picture, "https://lightning.net/bob.png")
    assert.strictEqual(meta.banner, "https://lightning.net/banner.png")
    assert.strictEqual(meta.website, "https://bob.me")
  })

  it("should build kind 0 metadata note correctly", () => {
    const env = { LIGESS_USERNAME: "alice", LIGESS_DOMAIN: "alice.me" }
    const note = getMetadataNote(env)

    assert.strictEqual(note.kind, 0)
    assert.strictEqual(typeof note.content, "string")
    const parsed = JSON.parse(note.content)
    assert.strictEqual(parsed.name, "alice")
  })

  it("should dynamically calculate supported NIPs based on active features", () => {
    // Base minimal
    const baseInfo = getRelayInformation({
      LIGESS_USERNAME: "test",
      LIGESS_DOMAIN: "test.com"
    })
    assert.deepStrictEqual(baseInfo.supported_nips, [1, 4, 5, 11, 44])

    // With NWC and Nutzap enabled
    const fullInfo = getRelayInformation({
      LIGESS_USERNAME: "test",
      LIGESS_DOMAIN: "test.com",
      LIGESS_NOSTR_WALLET_CONNECT_PUBLIC_KEY: "01".repeat(32),
      LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY: "02".repeat(32),
      LIGESS_NOSTR_ZAPPER_PRIVATE_KEY: "03".repeat(32),
      LIGESS_NUTZAP_ENABLED: "true"
    })
    // 42 (auth), 47 (NWC), 57 (Zaps), 61 (Nutzaps)
    assert.deepStrictEqual(fullInfo.supported_nips, [1, 4, 5, 11, 42, 44, 47, 57, 61])
  })

  it("should allow relay information customization via .env", () => {
    const info = getRelayInformation({
      LIGESS_USERNAME: "relaymaster",
      LIGESS_DOMAIN: "nostr.rocks",
      LIGESS_RELAY_NAME: "My Custom Relay",
      LIGESS_RELAY_DESCRIPTION: "Lightning fast Nostr relay",
      LIGESS_RELAY_CONTACT: "ops@nostr.rocks",
      LIGESS_RELAY_ICON: "https://nostr.rocks/icon.png"
    })

    assert.strictEqual(info.name, "My Custom Relay")
    assert.strictEqual(info.description, "Lightning fast Nostr relay")
    assert.strictEqual(info.contact, "ops@nostr.rocks")
    assert.strictEqual(info.icon, "https://nostr.rocks/icon.png")
    assert.strictEqual(info.software, "https://git.mutatrum.com/mutatrum/ligess")
  })

  it("should fall back to legacy JSON files when configured and print deprecation warnings", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligess-test-"))
    const legacyMetaPath = path.join(tmpDir, "legacy-metadata.json")
    const legacyRelayPath = path.join(tmpDir, "legacy-relay.json")

    fs.writeFileSync(legacyMetaPath, JSON.stringify({ about: "From legacy file", custom_field: "val" }))
    fs.writeFileSync(legacyRelayPath, JSON.stringify({ name: "Legacy Relay Name" }))

    const meta = getProfileMetadata({
      LIGESS_USERNAME: "legacy_user",
      LIGESS_NOSTR_METADATA_FILE: legacyMetaPath
    })
    assert.strictEqual(meta.about, "From legacy file")
    assert.strictEqual(meta.custom_field, "val")

    const relayInfo = getRelayInformation({
      LIGESS_USERNAME: "legacy_user",
      LIGESS_NOSTR_RELAY_INFORMATION: legacyRelayPath
    })
    assert.strictEqual(relayInfo.name, "Legacy Relay Name")
    assert.ok(relayInfo.supported_nips.includes(1))

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should warn on startup if legacy file environment variables or disk files are detected", () => {
    // 1. When env vars are provided
    const warnings1 = checkLegacyFiles({
      LIGESS_NOSTR_METADATA_FILE: "/tmp/some-meta.json",
      LIGESS_NOSTR_RELAY_INFORMATION: "/tmp/some-relay.json"
    }, "/tmp")
    assert.strictEqual(warnings1.length, 2)
    assert.ok(warnings1[0].includes("LIGESS_NOSTR_METADATA_FILE"))
    assert.ok(warnings1[1].includes("LIGESS_NOSTR_RELAY_INFORMATION"))

    // 2. When legacy files exist in directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ligess-check-"))
    fs.writeFileSync(path.join(tmpDir, "metadata.json"), "{}")
    fs.writeFileSync(path.join(tmpDir, "relayInformation.json"), "{}")

    const warnings2 = checkLegacyFiles({}, tmpDir)
    assert.strictEqual(warnings2.length, 2)
    assert.ok(warnings2[0].includes("metadata.json"))
    assert.ok(warnings2[1].includes("relayInformation.json"))

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should inspect and decode LND macaroon permissions and operational mode", () => {
    // Hex of real invoice macaroon with [address:read, address:write, invoices:read, invoices:write, onchain:read]
    const invoiceHex = "0201036c6e640258030a10d9d6c72ba559972cd380a82056a89b8e1201301a160a0761646472657373120472656164120577726974651a170a08696e766f69636573120472656164120577726974651a0f0a076f6e636861696e12047265616400000620976dc8456c289dc20ee8de3e3f972b23e64bb639bc65d79734dbfca295fd32f5"
    const parsed = inspectLndMacaroon(invoiceHex)

    assert.ok(parsed)
    assert.strictEqual(parsed.fingerprint.length, 8)
    assert.strictEqual(parsed.hasOffchainWrite, false)
    assert.strictEqual(parsed.isAdmin, false)
    assert.ok(parsed.mode.includes("Receive-Only"))
    assert.ok(parsed.permissions.includes("invoices:read"))
    assert.ok(parsed.permissions.includes("invoices:write"))
  })

  it("should inspect and decode CLN rune restrictions", () => {
    // Base64 of 'method=invoice&method=waitanyinvoice'
    const restrictedRune = "bWV0aG9kPWludm9pY2UmbWV0aG9kPXdhaXRhbnlpbnZvaWNl"
    const res = inspectClnRune(restrictedRune)

    assert.ok(res)
    assert.strictEqual(res.isMaster, false)
    assert.ok(res.restrictions.includes("method=invoice"))
    assert.ok(res.restrictions.includes("method=waitanyinvoice"))

    const masterRune = Buffer.from("random_binary_without_ampersands").toString("base64")
    const masterRes = inspectClnRune(masterRune)
    assert.strictEqual(masterRes.isMaster, true)
  })

  it("should return null for invalid macaroon or rune strings", () => {
    assert.strictEqual(inspectLndMacaroon(""), null)
    assert.strictEqual(inspectLndMacaroon("invalid_hex"), null)
    assert.strictEqual(inspectClnRune(""), null)
  })
})
