const QRCode = require("qrcode-terminal/vendor/QRCode")
const QRMode = require("qrcode-terminal/vendor/QRCode/QRMode")
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel")

const ALPHANUM_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
const ALPHANUM_MAP = {}
for (let i = 0; i < ALPHANUM_CHARS.length; i++) {
  ALPHANUM_MAP[ALPHANUM_CHARS[i]] = i
}

function isAlphaNum(str) {
  for (let i = 0; i < str.length; i++) {
    if (ALPHANUM_MAP[str[i]] === undefined) return false
  }
  return true
}

/**
 * QR Alphanumeric Mode Encoder (ISO/IEC 18004).
 * Packs 2 characters into 11 bits (5.5 bits/char) instead of 8 bits/char in Byte mode.
 * Reduces bit count for Bech32 (LNURL, BOLT12, BIP-173) by ~31.25%, drastically
 * decreasing the QR grid size and module density for effortless camera scanning.
 */
class QRAlphaNum {
  constructor(data) {
    this.mode = QRMode.MODE_ALPHA_NUM
    this.data = data
  }

  getLength() {
    return this.data.length
  }

  write(buffer) {
    let i = 0
    while (i + 1 < this.data.length) {
      const c1 = ALPHANUM_MAP[this.data[i]]
      const c2 = ALPHANUM_MAP[this.data[i + 1]]
      buffer.put(c1 * 45 + c2, 11)
      i += 2
    }
    if (i < this.data.length) {
      buffer.put(ALPHANUM_MAP[this.data[i]], 6)
    }
  }
}

/**
 * Generates a clean, 100% self-contained inline SVG QR code without external network calls.
 * Automatically leverages high-density Alphanumeric mode for BOLT12 and LNURL payloads.
 * Uses crispEdges shape rendering to snap modules to physical pixels and prevent scale-down artifacts.
 */
function generateQrSvg(text, { margin = 2 } = {}) {
  // Use automatic type (-1) and Low error correction (L) for optimal module density
  const qr = new QRCode(-1, QRErrorCorrectLevel.L)

  const upper = text.toUpperCase()
  if (isAlphaNum(upper)) {
    // Upper-case Bech32 / Lightning URIs encode in Alphanumeric mode for compact grid
    qr.dataList.push(new QRAlphaNum(upper))
  } else {
    qr.addData(text)
  }

  qr.make()

  const count = qr.getModuleCount()
  const size = count + margin * 2

  let path = ""
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        path += "M" + (c + margin) + " " + (r + margin) + "h1v1h-1z "
      }
    }
  }

  return (
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " +
    size +
    " " +
    size +
    "\" shape-rendering=\"crispEdges\" style=\"display:block;width:100%;height:100%;\">" +
    "<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>" +
    "<path d=\"" +
    path.trim() +
    "\" fill=\"#000000\"/>" +
    "</svg>"
  )
}

module.exports = { generateQrSvg, isAlphaNum, QRAlphaNum }
