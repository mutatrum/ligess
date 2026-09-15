const { REPO_URL } = require("../config/constants")
const { getProfileMetadata } = require("../nostr/metadata")
const { isNutzapEnabled, formatCashuPaymentRequest } = require("../nostr/nutzaps")
const { generateQrSvg } = require("./qrSvg")

const DEFAULT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="b" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fde047"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e1b2e"/><stop offset="100%" stop-color="#0f1016"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#g)" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="1.2"/><path d="M18 3 L8.5 16.5 L14.5 16.5 L12.5 29 L23.5 14 L17.5 14 Z" fill="url(#b)"/></svg>`
const DEFAULT_FAVICON_DATA_URI = "data:image/svg+xml," + encodeURIComponent(DEFAULT_FAVICON_SVG)

function escapeHtml(str) {
  if (!str) return ""
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderLandingPage({ username, domain, identifier, lnurlBech32, bolt12Offer = null, repoUrl = REPO_URL, picture: customPicture = null, lnurlpUrl = null, silentPayment: customSilentPayment = null, cashuRequest: customCashuRequest = null }) {
  const meta = getProfileMetadata()
  const displayName = escapeHtml(meta.display_name || meta.name || username)
  const about = escapeHtml(meta.about || "Send Bitcoin instantly via Lightning Address or Nostr Zaps.")
  const picture = customPicture ? escapeHtml(customPicture) : (meta.picture ? escapeHtml(meta.picture) : (process.env.LIGESS_RELAY_ICON ? escapeHtml(process.env.LIGESS_RELAY_ICON) : null))
  const safeIdentifier = escapeHtml(identifier)
  const safeBolt12 = bolt12Offer ? escapeHtml(bolt12Offer) : null
  const silentPaymentAddr = customSilentPayment || process.env.LIGESS_SILENT_PAYMENT_ADDRESS || null
  const safeSilentPayment = silentPaymentAddr ? escapeHtml(silentPaymentAddr) : null
  const safeRecipientPubkey = escapeHtml(process.env.LIGESS_NOSTR_PUBKEY || meta.pubkey || "")
  const safeLnurlpUrl = escapeHtml(lnurlpUrl || ("lnurlp://" + domain + "/.well-known/lnurlp/" + username))

  let safeCashu = customCashuRequest ? escapeHtml(customCashuRequest) : null
  if (!safeCashu && isNutzapEnabled()) {
    try {
      safeCashu = formatCashuPaymentRequest({ description: `Tip to ${displayName}` })
    } catch (_) {}
  }
  const cashuUri = safeCashu ? ("cashu:" + safeCashu) : null
  const cashuSvg = safeCashu ? generateQrSvg(safeCashu) : null

  // Universal Lightning Address & BIP-353 URI (ultra-compact 25x25 grid, scans in <0.02s)
  const lightningAddressUri = "lightning:" + safeIdentifier
  const lightningAddressSvg = generateQrSvg(lightningAddressUri)

  // Legacy LNURL Bech32 URI for older wallets (optimized with Alphanumeric mode)
  const legacyLnurlUri = "lightning:" + encodeURIComponent(lnurlBech32)
  const legacyLnurlSvg = generateQrSvg(legacyLnurlUri)

  // Dedicated BOLT12 URI if offer is configured (optimized with Alphanumeric mode)
  const bolt12Uri = safeBolt12 ? ("lightning:" + encodeURIComponent(bolt12Offer)) : null
  const bolt12Svg = safeBolt12 ? generateQrSvg(bolt12Uri) : null

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayName} | Lightning & Nostr Portal</title>
  <meta name="description" content="Pay ${displayName} instantly over the Lightning Network or Nostr Zaps.">
  ${picture ? `  <link rel="icon" href="${picture}">
  <link rel="apple-touch-icon" href="${picture}">` : `  <link rel="icon" type="image/svg+xml" href="${DEFAULT_FAVICON_DATA_URI}">
  <link rel="alternate icon" href="/favicon.ico">`}
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
      margin-bottom: 16px;
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

    /* Protocol Tabs */
    .tabs {
      display: flex;
      gap: 8px;
      margin: 16px auto 12px;
      background: rgba(255, 255, 255, 0.04);
      padding: 4px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      width: fit-content;
      max-width: 100%;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tab-btn:hover {
      color: var(--text-main);
    }

    .tab-btn.active {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    /* Fixed Pixel Ratio Self-Contained QR Container */
    .qr-view {
      text-align: center;
      margin: 12px auto 16px;
    }

    .qr-container {
      background: #ffffff;
      border-radius: 16px;
      padding: 14px;
      margin: 0 auto 12px;
      width: 260px;
      height: 260px;
      max-width: 100%;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      transition: var(--transition);
      overflow: hidden;
    }


    .qr-container a {
      display: block;
      width: 100%;
      height: 100%;
    }

    .qr-container svg {
      display: block;
      width: 100%;
      height: 100%;
      shape-rendering: crispEdges;
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

      ${(safeBolt12 || safeCashu) ? `
      <div class="tabs">
        <button class="tab-btn active" id="tabLightning" onclick="switchProtocol('lightning')">⚡ Lightning Address</button>
        ${safeBolt12 ? `<button class="tab-btn" id="tabBolt12" onclick="switchProtocol('bolt12')">📜 BOLT12 Offer</button>` : ""}
        ${safeCashu ? `<button class="tab-btn" id="tabCashu" onclick="switchProtocol('cashu')">🥜 Cashu Ecash</button>` : ""}
      </div>` : ""}

      <div id="viewLightning" class="qr-view">
        <div class="qr-container">
          <a href="${lightningAddressUri}" title="Scan or click to open in Lightning wallet">
            ${lightningAddressSvg}
          </a>
        </div>
        <div class="qr-caption">
          <span>⚡ Scan with any Lightning or BIP-353 wallet</span>
        </div>
        <details class="offer-details">
          <summary>Need LNURL, BIP-352 or Bech32 links?</summary>
          <div style="margin-top:12px;text-align:center;">
            <div style="width:180px;height:180px;margin:0 auto;">${legacyLnurlSvg}</div>
            <code style="display:block;margin-top:8px;word-break:break-all;font-size:11px;">${legacyLnurlUri}</code>
            <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">
              <span>LUD-17 scheme: </span><a href="${safeLnurlpUrl}" style="color:#fbbf24;word-break:break-all;">${safeLnurlpUrl}</a>
            </div>
            ${safeSilentPayment ? `
            <div style="margin-top:10px;padding:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;text-align:left;">
              <span style="color:#a78bfa;font-weight:600;font-size:11px;">🔒 BIP-352 Silent Payment Address:</span>
              <code style="display:block;margin-top:4px;word-break:break-all;font-size:10px;color:var(--text-muted);">${safeSilentPayment}</code>
            </div>` : ""}
          </div>
        </details>
      </div>

      ${safeBolt12 ? `
      <div id="viewBolt12" class="qr-view" style="display: none;">
        <div class="qr-container">
          <a href="${bolt12Uri}" title="Scan or click to open in BOLT12 wallet">
            ${bolt12Svg}
          </a>
        </div>
        <div class="qr-caption">
          <span>📜 Scan with Phoenix or Core Lightning</span>
        </div>
        <details class="offer-details">
          <summary>View BOLT12 Offer String</summary>
          <code>${safeBolt12}</code>
        </details>
      </div>` : ""}

      ${safeCashu ? `
      <div id="viewCashu" class="qr-view" style="display: none;">
        <div class="qr-container">
          <a href="${cashuUri}" title="Scan or click to open in Cashu wallet">
            ${cashuSvg}
          </a>
        </div>
        <div class="qr-caption">
          <span>🥜 Scan with Minibits, eNuts or Cashu wallet</span>
        </div>
        <details class="offer-details">
          <summary>View Cashu Payment Request</summary>
          <code style="word-break:break-all;font-size:10px;">${safeCashu}</code>
        </details>
      </div>` : ""}

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
        <button class="btn btn-secondary" id="btnCopyAddress" onclick="copyAddress()">
          <span>📋</span>
          <span>Copy Lightning Address</span>
        </button>
        ${safeCashu ? `
        <button class="btn btn-secondary" id="btnCopyCashu" style="display: none;" onclick="copyCashu()">
          <span>🥜</span>
          <span>Copy Cashu Request</span>
        </button>` : ""}
      </div>
    </div>

    <div class="footer">
      Powered by <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noreferrer">Ligess Sovereign Server</a>
    </div>
  </div>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <script>
    let currentSats = 21;
    const identifier = "${safeIdentifier}";
    const cashuRequest = "${safeCashu || ""}";

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

    function copyCashu() {
      if (!cashuRequest) return;
      navigator.clipboard.writeText(cashuRequest).then(() => {
        showToast("🥜 Cashu request copied to clipboard!");
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

    function switchProtocol(type) {
      const isLightning = type === "lightning";
      const isBolt12 = type === "bolt12";
      const isCashu = type === "cashu";

      const tabL = document.getElementById("tabLightning");
      if (tabL) tabL.classList.toggle("active", isLightning);
      const tabB12 = document.getElementById("tabBolt12");
      if (tabB12) tabB12.classList.toggle("active", isBolt12);
      const tabC = document.getElementById("tabCashu");
      if (tabC) tabC.classList.toggle("active", isCashu);

      const viewL = document.getElementById("viewLightning");
      if (viewL) viewL.style.display = isLightning ? "block" : "none";
      const viewB12 = document.getElementById("viewBolt12");
      if (viewB12) viewB12.style.display = isBolt12 ? "block" : "none";
      const viewC = document.getElementById("viewCashu");
      if (viewC) viewC.style.display = isCashu ? "block" : "none";

      const btnWebln = document.getElementById("weblnBtn");
      if (btnWebln) btnWebln.style.display = isCashu ? "none" : "flex";
      const presets = document.querySelector(".amount-presets");
      if (presets) presets.style.display = isCashu ? "none" : "grid";
      const btnCopyAddr = document.getElementById("btnCopyAddress");
      if (btnCopyAddr) btnCopyAddr.style.display = isCashu ? "none" : "flex";
      const btnCopyC = document.getElementById("btnCopyCashu");
      if (btnCopyC) btnCopyC.style.display = isCashu ? "flex" : "none";
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
        let zapQuery = "";
        if (window.nostr && "${safeRecipientPubkey}") {
          try {
            btn.innerHTML = "<span>⏳</span><span>Signing Nostr zap...</span>";
            const zapEvent = {
              kind: 9734,
              created_at: Math.floor(Date.now() / 1000),
              tags: [
                ["relays", "wss://relay.damus.io", "wss://nos.lol"],
                ["amount", String(msats)],
                ["p", "${safeRecipientPubkey}"]
              ],
              content: "Zapped via Ligess Web Portal"
            };
            const signedZap = await window.nostr.signEvent(zapEvent);
            zapQuery = "&nostr=" + encodeURIComponent(JSON.stringify(signedZap));
          } catch (_) {}
        }

        const res = await fetch("/.well-known/lnurlp/" + encodeURIComponent(identifier.split("@")[0]) + "?amount=" + msats + zapQuery);
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

module.exports = { renderLandingPage, DEFAULT_FAVICON_SVG, DEFAULT_FAVICON_DATA_URI }
