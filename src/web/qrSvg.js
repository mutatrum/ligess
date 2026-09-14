const QRCode = require("qrcode-terminal/vendor/QRCode")
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel")

/**
 * Generates a clean, 100% self-contained inline SVG QR code without external network calls.
 * Uses crispEdges shape rendering to snap modules to physical pixels and prevent scale-down artifacts.
 */
function generateQrSvg(text, { margin = 4 } = {}) {
  // Use automatic type (-1) and Low error correction (L) for optimal density
  const qr = new QRCode(-1, QRErrorCorrectLevel.L)
  qr.addData(text)
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

module.exports = { generateQrSvg }
