const { describe, it } = require('node:test')
const assert = require('node:assert')
const { renderLandingPage } = require('../landingPage')

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
})
