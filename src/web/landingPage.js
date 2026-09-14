const { getProfileMetadata } = require("../nostr/metadata")

function escapeHtml(str) {
  if (!str) return ""
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderLandingPage({ username, domain, identifier, lnurlBech32, bolt12Offer = null }) {
  const meta = getProfileMetadata()
  const displayName = escapeHtml(meta.display_name || meta.name || username)
  const about = escapeHtml(meta.about || "Send Bitcoin instantly via Lightning Address or Nostr Zaps.")
  const picture = meta.picture ? escapeHtml(meta.picture) : null
  const safeIdentifier = escapeHtml(identifier)
  const safeBolt12 = bolt12Offer ? escapeHtml(bolt12Offer) : null

  // BIP-21 Unified Payment URI: combines LNURL-pay and reusable BOLT12 offer without on-chain address reuse
  const unifiedPaymentUri = bolt12Offer
    ? "bitcoin:?lightning=" + encodeURIComponent(lnurlBech32) + "&lno=" + encodeURIComponent(bolt12Offer)
    : "lightning:" + encodeURIComponent(lnurlBech32)

  const qrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(unifiedPaymentUri) + "&margin=10"

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayName} | Lightning & Nostr Portal</title>
  <meta name="description" content="Pay ${displayName} instantly over the Lightning Network or Nostr Zaps.">
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 50% 0%, #1a162b 0%, #0d0e15 100%);
      --card-bg: rgba(22, 24, 38, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-primary: #f59e0b;
      --accent-secondary: #8b5cf6;
      --accent-cyan: #06b6d4;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --card-radius: 24px;
      --transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: var(--bg-gradient);
      color: var(--text-main);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      overflow-x: hidden;
    }

    .container {
      width: 100%;
      max-width: 480px;
      margin: auto;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--card-border);
      border-radius: var(--card-radius);
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(139, 92, 246, 0.1);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: "";
      position: absolute;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      width: 240px;
      height: 240px;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }

    .profile-header {
      text-align: center;
      margin-bottom: 20px;
      position: relative;
    }

    .avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      margin: 0 auto 16px;
      object-fit: cover;
      border: 3px solid rgba(245, 158, 11, 0.3);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 700;
      color: #fff;
    }

    .display-name {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }

    .badge-handle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.25);
      color: #fbbf24;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      cursor: pointer;
      transition: var(--transition);
      user-select: none;
    }

    .badge-handle:hover {
      background: rgba(245, 158, 11, 0.2);
      transform: translateY(-1px);
    }

    .about {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
      max-width: 380px;
      margin: 0 auto;
    }

    /* Unified QR Code Container */
    .qr-wrapper {
      text-align: center;
      margin: 20px auto 16px;
    }

    .qr-container {
      background: #ffffff;
      border-radius: 16px;
      padding: 16px;
      margin: 0 auto 10px;
      width: 220px;
      height: 220px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      transition: var(--transition);
    }

    .qr-container:hover {
      transform: scale(1.02);
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5), 0 0 24px rgba(245, 158, 11, 0.2);
    }

    .qr-container img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }

    .qr-caption {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .qr-caption span {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 4px 10px;
      border-radius: 999px;
    }

    .offer-details {
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }

    .offer-details summary {
      cursor: pointer;
      user-select: none;
      margin-bottom: 6px;
      color: var(--text-muted);
      transition: color 0.2s;
    }

    .offer-details summary:hover {
      color: var(--text-main);
    }

    .offer-details code {
      display: block;
      word-break: break-all;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      font-size: 11px;
      font-family: monospace;
      user-select: all;
      border: 1px solid rgba(255, 255, 255, 0.06);
      text-align: left;
    }

    /* Payment Actions */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 20px;
    }

    .btn {
      width: 100%;
      padding: 14px 20px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border: none;
      cursor: pointer;
      transition: var(--transition);
      text-decoration: none;
    }

    .btn-webln {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #000;
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3);
    }

    .btn-webln:hover {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-1px);
    }

    /* Preset amounts */
    .amount-presets {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 14px;
    }

    .preset-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--text-muted);
      border-radius: 10px;
      padding: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
    }

    .preset-btn:hover, .preset-btn.active {
      color: #fbbf24;
      background: rgba(245, 158, 11, 0.1);
      border-color: rgba(245, 158, 11, 0.3);
    }

    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #fff;
      padding: 10px 20px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1000;
      pointer-events: none;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
    }

    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #6b7280;
    }

    .footer a {
      color: #9ca3af;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="profile-header">
        ${picture ? `<img src="${picture}" alt="${displayName}" class="avatar">` : `<div class="avatar">${displayName.charAt(0).toUpperCase()}</div>`}
        <h1 class="display-name">${displayName}</h1>
        <div class="badge-handle" id="copyBadge" title="Click to copy Lightning Address">
          <span>⚡</span>
          <span>${safeIdentifier}</span>
        </div>
        <p class="about">${about}</p>
      </div>

      <div class="qr-wrapper">
        <div class="qr-container">
          <a href="${unifiedPaymentUri}" title="Scan or click to open in your Bitcoin / Lightning wallet">
            <img id="qrImage" src="${qrImageUrl}" alt="Unified Bitcoin & Lightning QR">
          </a>
        </div>
        <div class="qr-caption">
          <span>${safeBolt12 ? "⚡ Unified Lightning & BOLT12 QR" : "⚡ Lightning Network QR"}</span>
        </div>
        ${safeBolt12 ? `
        <details class="offer-details">
          <summary>View BOLT12 Offer</summary>
          <code>${safeBolt12}</code>
        </details>` : ""}
      </div>

      <div class="amount-presets">
        <button class="preset-btn active" onclick="selectAmount(21)">21 sats</button>
        <button class="preset-btn" onclick="selectAmount(100)">100</button>
        <button class="preset-btn" onclick="selectAmount(1000)">1,000</button>
        <button class="preset-btn" onclick="selectAmount(5000)">5,000</button>
      </div>

      <div class="actions">
        <button class="btn btn-webln" id="weblnBtn" onclick="payWithWebLN()">
          <span>⚡</span>
          <span>Send <span id="btnAmountText">21</span> sats via WebLN</span>
        </button>
        <button class="btn btn-secondary" onclick="copyAddress()">
          <span>📋</span>
          <span>Copy Lightning Address</span>
        </button>
      </div>
    </div>

    <div class="footer">
      Powered by <a href="https://github.com/mutatrum/ligess" target="_blank" rel="noreferrer">Ligess Sovereign Server</a>
    </div>
  </div>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <script>
    let currentSats = 21;
    const identifier = "${safeIdentifier}";

    function showToast(msg) {
      const toast = document.getElementById("toast");
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function copyAddress() {
      navigator.clipboard.writeText(identifier).then(() => {
        showToast("⚡ Address copied to clipboard!");
      });
    }

    document.getElementById("copyBadge").addEventListener("click", copyAddress);

    function selectAmount(sats) {
      currentSats = sats;
      document.querySelectorAll(".preset-btn").forEach(b => {
        b.classList.toggle("active", b.textContent.includes(sats.toLocaleString()));
      });
      document.getElementById("btnAmountText").textContent = sats.toLocaleString();
    }

    async function payWithWebLN() {
      const btn = document.getElementById("weblnBtn");
      const originalText = btn.innerHTML;
      try {
        if (!window.webln) {
          showToast("No WebLN wallet found (install Alby or Zeus extension)");
          return;
        }
        btn.disabled = true;
        btn.innerHTML = "<span>⏳</span><span>Requesting invoice...</span>";

        await window.webln.enable();

        const msats = currentSats * 1000;
        const res = await fetch("/.well-known/lnurlp/" + encodeURIComponent(identifier.split("@")[0]) + "?amount=" + msats);
        const data = await res.json();

        if (data.status === "ERROR") {
          throw new Error(data.reason || "Failed to get invoice");
        }

        btn.innerHTML = "<span>⚡</span><span>Confirm in wallet...</span>";
        const paymentRes = await window.webln.sendPayment(data.pr);

        showToast("🎉 Payment successful! Preimage: " + paymentRes.preimage.slice(0, 8) + "...");
      } catch (err) {
        showToast("Payment cancelled or failed: " + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  </script>
</body>
</html>`
}

module.exports = { renderLandingPage }
