const { nip19, nip04, nip44 } = require('nostr-tools')

function parsePrivateKey(key) {
  if (!key) return null
  if (typeof key !== 'string') return key instanceof Uint8Array ? key : new Uint8Array(key)
  const trimmed = key.trim()
  if (trimmed.startsWith('nsec1')) {
    return nip19.decode(trimmed).data
  }
  return new Uint8Array(Buffer.from(trimmed, 'hex'))
}

function parsePublicKey(key) {
  if (!key) return null
  if (typeof key !== 'string') return key
  const trimmed = key.trim()
  if (trimmed.startsWith('npub1')) {
    return nip19.decode(trimmed).data
  }
  return trimmed
}

async function decryptNwcPayload(privKey, senderPubKey, ciphertext) {
  if (ciphertext.includes('?iv=')) {
    const decrypted = await nip04.decrypt(privKey, senderPubKey, ciphertext)
    return { payload: JSON.parse(decrypted), encryption: 'nip04' }
  }

  try {
    const convKey = nip44.getConversationKey(privKey, senderPubKey)
    const decrypted = nip44.decrypt(ciphertext, convKey)
    return { payload: JSON.parse(decrypted), encryption: 'nip44' }
  } catch (err) {
    const decrypted = await nip04.decrypt(privKey, senderPubKey, ciphertext)
    return { payload: JSON.parse(decrypted), encryption: 'nip04' }
  }
}

async function encryptNwcPayload(privKey, recipientPubKey, data, encryption = 'nip44') {
  const json = JSON.stringify(data)
  if (encryption === 'nip44') {
    const convKey = nip44.getConversationKey(privKey, recipientPubKey)
    return nip44.encrypt(json, convKey)
  }
  return await nip04.encrypt(privKey, recipientPubKey, json)
}

function getTags(tags, tag) {
  return (tags || []).filter(t => t && t.length && t.length >= 2 && t[0] === tag)
}

module.exports = {
  parsePrivateKey,
  parsePublicKey,
  decryptNwcPayload,
  encryptNwcPayload,
  getTags
}
