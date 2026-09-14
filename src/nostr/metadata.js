const fs = require('fs')
const path = require('path')

let _warnedDeprecation = false

function getProfileMetadata(env = process.env) {
  const username = env.LIGESS_USERNAME || 'ligess'
  const domain = env.LIGESS_DOMAIN || 'localhost'

  const defaults = {
    name: username,
    display_name: env.LIGESS_NOSTR_DISPLAY_NAME || username,
    about: env.LIGESS_NOSTR_ABOUT || 'Send Bitcoin instantly via Lightning Address or Nostr Zaps.',
    website: env.LIGESS_NOSTR_WEBSITE || `https://${domain}/`,
    nip05: `${username}@${domain}`,
    lud16: `${username}@${domain}`
  }

  if (env.LIGESS_NOSTR_PICTURE) {
    defaults.picture = env.LIGESS_NOSTR_PICTURE
  }
  if (env.LIGESS_NOSTR_BANNER) {
    defaults.banner = env.LIGESS_NOSTR_BANNER
  }

  // Legacy file fallback with deprecation warning
  const metaFile = env.LIGESS_NOSTR_METADATA_FILE
  if (metaFile && fs.existsSync(metaFile)) {
    if (!_warnedDeprecation) {
      console.warn(
        `\x1b[33m[DEPRECATION WARNING]\x1b[0m LIGESS_NOSTR_METADATA_FILE is deprecated. ` +
        `Define your profile directly in .env (LIGESS_NOSTR_DISPLAY_NAME, LIGESS_NOSTR_ABOUT, LIGESS_NOSTR_PICTURE) instead.`
      )
      _warnedDeprecation = true
    }
    try {
      const fileData = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
      return { ...defaults, ...fileData }
    } catch (err) {
      console.error(`Failed to parse legacy metadata file ${metaFile}:`, err.message)
    }
  }

  return defaults
}

function getMetadataNote(env = process.env) {
  const meta = getProfileMetadata(env)
  return {
    kind: 0,
    content: JSON.stringify(meta),
    created_at: Math.round(Date.now() / 1000),
    tags: []
  }
}

module.exports = {
  getProfileMetadata,
  getMetadataNote
}
