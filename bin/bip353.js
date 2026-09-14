#!/usr/bin/env node
require('dotenv').config()
const dns = require('dns').promises

function formatDnsTxtRecord(username, domain, offer) {
  const cleanDomain = domain.endsWith('.') ? domain.slice(0, -1) : domain
  const subdomain = `${username}.user._bitcoin-payment.${cleanDomain}.`
  const txtValue = `bitcoin:?lno=${offer}`
  return {
    subdomain,
    type: 'TXT',
    value: txtValue,
    fullRecord: `${subdomain} IN TXT "${txtValue}"`
  }
}

function getBip353Uri(offer) {
  return `bitcoin:?lno=${offer}`
}

/**
 * Resolves and verifies the BIP-353 DNS TXT record for <username>.user._bitcoin-payment.<domain>
 * Handles RFC 1035 255-byte chunk concatenation and validates the bitcoin:?lno= URI.
 */
async function verifyBip353Dns(username, domain, expectedOffer = null) {
  const cleanDomain = domain.endsWith('.') ? domain.slice(0, -1) : domain
  const subdomain = `${username}.user._bitcoin-payment.${cleanDomain}`

  try {
    const rawRecords = await dns.resolveTxt(subdomain)
    for (const chunks of rawRecords) {
      // Concatenate multi-part 255-byte DNS strings
      const fullText = chunks.join('')
      if (fullText.startsWith('bitcoin:')) {
        const match = fullText.match(/lno=([^&]+)/)
        const foundOffer = match ? match[1] : null
        const matches = expectedOffer ? (foundOffer === expectedOffer) : true

        return {
          status: 'FOUND',
          subdomain,
          fullText,
          offer: foundOffer,
          matches,
          error: null
        }
      }
    }

    return {
      status: 'INVALID_RECORD',
      subdomain,
      fullText: rawRecords.map(r => r.join('')).join(', '),
      offer: null,
      matches: false,
      error: 'No bitcoin: URI found in TXT records'
    }
  } catch (err) {
    return {
      status: 'NOT_FOUND',
      subdomain,
      fullText: null,
      offer: null,
      matches: false,
      error: err.code || err.message
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  let user = process.env.LIGESS_USERNAME
  let domain = process.env.LIGESS_DOMAIN
  let offer = process.env.LIGESS_BOLT12_OFFER

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user' && args[i + 1]) user = args[++i]
    if (args[i] === '--domain' && args[i + 1]) domain = args[++i]
    if (args[i] === '--offer' && args[i + 1]) offer = args[++i]
  }

  if (!user || !domain || !offer) {
    console.log('Usage: node bin/bip353.js --user <username> --domain <domain> --offer <lno...>')
    console.log('Or configure LIGESS_USERNAME, LIGESS_DOMAIN, and LIGESS_BOLT12_OFFER in .env')
    process.exit(1)
  }

  const record = formatDnsTxtRecord(user, domain, offer)
  console.log('\n--- BIP-353 DNS TXT Record ---')
  console.log(`Subdomain:   ${record.subdomain}`)
  console.log(`Record Type: ${record.type}`)
  console.log(`TXT Value:   ${record.value}`)
  console.log(`BIND Format: ${record.fullRecord}`)
  console.log('------------------------------\n')

  console.log('Testing live DNS TXT propagation...')
  const check = await verifyBip353Dns(user, domain, offer)
  if (check.status === 'FOUND') {
    if (check.matches) {
      console.log(`\x1b[32m✔ [BIP-353]\x1b[0m Verified: Record is live on DNS and matches configured offer!\n`)
    } else {
      console.log(`\x1b[33m⚠ [BIP-353]\x1b[0m Mismatch: DNS record found (${check.offer}), but does not match expected offer!\n`)
    }
  } else {
    console.log(`\x1b[33m⚠ [BIP-353]\x1b[0m Not live yet: ${check.error}. Add the BIND record to your DNS provider to activate.\n`)
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}

module.exports = {
  formatDnsTxtRecord,
  getBip353Uri,
  verifyBip353Dns
}
