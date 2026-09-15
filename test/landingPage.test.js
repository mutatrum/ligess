const { describe, it } = require('node:test')
const assert = require('node:assert')
const { renderLandingPage } = require('../src/web/landingPage')
const { generateQrSvg, isAlphaNum } = require('../src/web/qrSvg')

describe('Landing Page Renderer', () => {
  it('should render HTML with escaped values and WebLN button', () => {
    const html = renderLandingPage({
      username: 'alice',
      domain: 'hodl.camp',
      identifier: 'alice@hodl.camp',
      lnurlBech32: 'lnurl1dp68gurn8ghj7mrw9e3k7mf0w5kkg6t0d5h85',
      bolt12Offer: 'lno1testoffer'
    })

    assert.ok(html.includes('alice@hodl.camp'), 'Should contain identifier')
    assert.ok(html.includes('WebLN'), 'Should contain WebLN button')
    assert.ok(html.includes('lno1testoffer'), 'Should contain BOLT12 offer')
    assert.ok(html.includes('<!DOCTYPE html>'), 'Should be valid HTML5')
  })

  it('should render protocol tabs when BOLT12 offer is present', () => {
    const html = renderLandingPage({
      username: 'alice',
      domain: 'hodl.camp',
      identifier: 'alice@hodl.camp',
      lnurlBech32: 'lnurl1test',
      bolt12Offer: 'lno1offer123'
    })

    assert.ok(html.includes('id="tabLightning"'), 'Should contain Lightning tab')
    assert.ok(html.includes('id="tabBolt12"'), 'Should contain BOLT12 tab')
    assert.ok(html.includes('id="viewLightning"'), 'Should contain Lightning view')
    assert.ok(html.includes('id="viewBolt12"'), 'Should contain BOLT12 view')
    assert.ok(html.includes('lno1offer123'), 'Should include BOLT12 offer string')
  })

  it('should omit BOLT12 tab when offer is not configured', () => {
    const html = renderLandingPage({
      username: 'bob',
      domain: 'example.com',
      identifier: 'bob@example.com',
      lnurlBech32: 'lnurl1bobtest',
      bolt12Offer: null
    })

    assert.ok(!html.includes('id="tabBolt12"'), 'Should not show BOLT12 tab')
    assert.ok(!html.includes('id="viewBolt12"'), 'Should not show BOLT12 view')
    assert.ok(html.includes('lightning:lnurl1bobtest'), 'Should contain lightning URI')
  })

  it('should render Cashu tab and QR view when cashuRequest is supplied', () => {
    const sampleCreq = 'creqb1testpaymentrequest123456789'
    const html = renderLandingPage({
      username: 'carol',
      domain: 'example.com',
      identifier: 'carol@example.com',
      lnurlBech32: 'lnurl1test',
      cashuRequest: sampleCreq
    })

    assert.ok(html.includes('id="tabCashu"'), 'Should render Cashu tab')
    assert.ok(html.includes('id="viewCashu"'), 'Should render Cashu view')
    assert.ok(html.includes(sampleCreq), 'Should include Cashu request string')
    assert.ok(html.includes('cashu:' + sampleCreq), 'Should link to cashu: URI')
    assert.ok(html.includes('id="btnCopyCashu"'), 'Should include Copy Cashu Request button')
  })

  it('should generate self-contained inline SVG with crispEdges and no external image requests', () => {
    const html = renderLandingPage({
      username: 'alice',
      domain: 'hodl.camp',
      identifier: 'alice@hodl.camp',
      lnurlBech32: 'lnurl1test',
      bolt12Offer: 'lno1test'
    })

    assert.ok(html.includes('<svg'), 'Should contain inline SVG')
    assert.ok(html.includes('shape-rendering="crispEdges"'), 'Should have crispEdges shape rendering')
    assert.ok(!html.includes('api.qrserver.com'), 'Must not make external calls to api.qrserver.com')
  })

  it('should escape potential XSS characters in username or display name', () => {
    const malicious = '<script>alert("xss")</script>'
    const html = renderLandingPage({
      username: malicious,
      domain: 'example.com',
      identifier: `${malicious}@example.com`,
      lnurlBech32: 'lnurl1test'
    })

    assert.ok(!html.includes('<script>alert("xss")</script>'), 'Raw script tags must not be rendered')
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'XSS payload must be escaped')
  })


  it("should detect alphanumeric strings for QR optimization", () => {
    assert.strictEqual(isAlphaNum("LIGHTNING:LNO1QGSQ"), true)
    assert.strictEqual(isAlphaNum("LNURL1DP68GURN8"), true)
    assert.strictEqual(isAlphaNum("user@domain.com"), false) // @ is not in QR alphanumeric table
  })

  it("should leverage Alphanumeric mode to generate a denser and smaller grid for BOLT12", () => {
    const sampleOffer = "lno1qgsqvgnwgcg5uvgfutpq8pkp2dsh4gay450fv616qd2n5x2mm5ch7vs7v584mn50vdzk7urjv4h8g6tr8qzsqwuev4682un9yp68sgrfwd682un9yp68sgrfwd682un9yp68sgrfwd682un9yp68sgrfwd682un9yp68sgrfwd682un9yp68sgrfwd682un9yp68sgrfwd682un9yp682"
    const svg = generateQrSvg("lightning:" + sampleOffer)
    const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
    assert.ok(match, "Should have valid viewBox")
    const size = parseInt(match[1], 10)
    // In Alphanumeric mode with margin 2, size is (49 modules + 4 margin) = 53 instead of 61+
    assert.ok(size <= 55, "Grid size should be streamlined")
  })

  it('should not contain any external fonts or stylesheet links', () => {
    const html = renderLandingPage({
      username: 'alice',
      domain: 'hodl.camp',
      identifier: 'alice@hodl.camp',
      lnurlBech32: 'lnurl1dp68gurn8ghj7mrw9e3k7mf0w5kkg6t0d5h85'
    })

    assert.ok(!html.includes('fonts.googleapis.com'), 'Should not load Google Fonts')
    assert.ok(!html.includes('fonts.gstatic.com'), 'Should not connect to Google Fonts static domain')
    assert.ok(!html.includes('<link rel="stylesheet"'), 'Should not link to external stylesheets')
  })

  it('should use supplied picture as favicon and apple-touch-icon when present', () => {
    const avatarUrl = 'https://example.com/custom-avatar.png'
    const html = renderLandingPage({
      username: 'alice',
      domain: 'hodl.camp',
      identifier: 'alice@hodl.camp',
      lnurlBech32: 'lnurl1dp68gurn8ghj7mrw9e3k7mf0w5kkg6t0d5h85',
      picture: avatarUrl
    })

    assert.ok(html.includes(`<link rel="icon" href="${avatarUrl}">`), 'Should contain supplied image as favicon')
    assert.ok(html.includes(`<link rel="apple-touch-icon" href="${avatarUrl}">`), 'Should contain supplied image as apple-touch-icon')
    assert.ok(!html.includes('data:image/svg+xml,'), 'Should not contain SVG data URI when picture is supplied')
  })

  it('should fallback to self-contained SVG favicon when no picture is supplied', () => {
    const html = renderLandingPage({
      username: 'alice',
      domain: 'hodl.camp',
      identifier: 'alice@hodl.camp',
      lnurlBech32: 'lnurl1dp68gurn8ghj7mrw9e3k7mf0w5kkg6t0d5h85'
    })

    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,'), 'Should contain SVG data URI favicon')
    assert.ok(html.includes('<link rel="alternate icon" href="/favicon.ico">'), 'Should contain alternate /favicon.ico link')
  })
})
