#!/usr/bin/env node
require('dotenv').config()

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

if (require.main === module) {
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
}

module.exports = {
  formatDnsTxtRecord,
  getBip353Uri
}
