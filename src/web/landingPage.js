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

  // Dedicated Silent Payment URI if configured (BIP-352 on-chain stealth address)
  const silentPaymentUri = safeSilentPayment ? ("bitcoin:" + safeSilentPayment) : null
  const silentPaymentSvg = safeSilentPayment ? generateQrSvg(silentPaymentUri) : null

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
  <link rel="lightning" href="${safeLnurlpUrl}">
  ${picture ? `  <link rel="icon" href="${picture}">
  <link rel="apple-touch-icon" href="${picture}">` : `  <link rel="icon" type="image/svg+xml" href="${DEFAULT_FAVICON_DATA_URI}">
  <link rel="alternate icon" href="/favicon.ico">`}
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 50% 0%, #1a162b 0%, #0d0e15 100%);
      --card-bg: rgba(22, 24, 38, 0.75);
      --card-border: rgba(255, 255, 255, 0.09);
      --accent-primary: #f59e0b;
      --accent-secondary: #8b5cf6;
      --accent-cyan: #06b6d4;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --card-radius: 28px;
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
      padding: 32px 16px;
      overflow-x: hidden;
    }

    .container {
      width: 100%;
      max-width: 560px;
      margin: auto;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--card-border);
      border-radius: var(--card-radius);
      padding: 40px 28px;
      box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.7), 0 0 50px rgba(139, 92, 246, 0.12);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: "";
      position: absolute;
      top: -140px;
      left: 50%;
      transform: translateX(-50%);
      width: 280px;
      height: 280px;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 70%);
      pointer-events: none;
    }

    .profile-header {
      text-align: center;
      margin-bottom: 20px;
      position: relative;
    }

    .avatar {
      width: 104px;
      height: 104px;
      border-radius: 50%;
      margin: 0 auto 18px;
      object-fit: cover;
      border: 3px solid rgba(245, 158, 11, 0.35);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
      background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      font-weight: 700;
      color: #fff;
    }

    .display-name {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 10px;
    }

    .badge-handle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 8px 18px;
      border-radius: 999px;
      font-size: 15.5px;
      font-weight: 600;
      margin-bottom: 14px;
      cursor: pointer;
      transition: var(--transition);
      user-select: none;
    }

    .badge-handle:hover {
      background: rgba(245, 158, 11, 0.22);
      transform: translateY(-1px);
    }

    .about {
      color: var(--text-muted);
      font-size: 15.5px;
      line-height: 1.6;
      max-width: 440px;
      margin: 0 auto;
    }

    /* Protocol Tabs */
    .tabs {
      display: flex;
      flex-wrap: nowrap;
      justify-content: center;
      gap: 6px;
      margin: 20px auto 16px;
      background: rgba(255, 255, 255, 0.04);
      padding: 4px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      width: fit-content;
      max-width: 100%;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px 13px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .tab-btn:hover {
      color: var(--text-main);
    }

    .tab-btn.active {
      background: rgba(245, 158, 11, 0.18);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.35);
    }

    /* Self-Contained QR Container */
    .qr-view {
      text-align: center;
      margin: 16px auto 20px;
    }

    .qr-container {
      background: #ffffff;
      border-radius: 20px;
      padding: 18px;
      margin: 0 auto 16px;
      width: 320px;
      height: 320px;
      max-width: 100%;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
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
      font-size: 14px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .qr-caption span {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 5px 14px;
      border-radius: 999px;
    }

    .offer-details {
      margin-top: 14px;
      font-size: 13px;
      color: var(--text-muted);
      text-align: center;
    }

    .offer-details summary {
      cursor: pointer;
      user-select: none;
      margin-bottom: 8px;
      color: var(--text-muted);
      transition: color 0.2s;
    }

    .offer-details summary:hover {
      color: var(--text-main);
    }

    .offer-details code {
      display: block;
      word-break: break-all;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 10px;
      font-size: 11.5px;
      font-family: monospace;
      user-select: all;
      border: 1px solid rgba(255, 255, 255, 0.06);
      text-align: left;
    }

    /* Preset amounts */
    .amount-presets {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 20px;
    }

    .preset-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--text-muted);
      border-radius: 12px;
      padding: 11px 8px;
      font-size: 14.5px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
    }

    .preset-btn:hover, .preset-btn.active {
      color: #fbbf24;
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.35);
    }

    /* Payment Actions */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 22px;
    }

    .btn {
      width: 100%;
      padding: 16px 24px;
      border-radius: 16px;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: -0.01em;
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
      box-shadow: 0 4px 18px rgba(245, 158, 11, 0.35);
    }

    .btn-webln:hover {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      transform: translateY(-2px);
      box-shadow: 0 8px 26px rgba(245, 158, 11, 0.45);
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

    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #fff;
      padding: 12px 24px;
      border-radius: 999px;
      font-size: 15px;
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
      margin-top: 28px;
      font-size: 13.5px;
      color: #6b7280;
    }

    .footer a {
      color: #9ca3af;
      text-decoration: none;
    }

    /* Mobile Responsive Optimizations */
    @media (max-width: 480px) {
      body {
        padding: 16px 12px;
      }

      .card {
        padding: 28px 18px;
        border-radius: 22px;
      }

      .avatar {
        width: 92px;
        height: 92px;
        font-size: 34px;
      }

      .display-name {
        font-size: 24px;
      }

      .badge-handle {
        font-size: 14px;
        padding: 6px 14px;
      }

      .about {
        font-size: 14px;
      }

      .tabs {
        gap: 6px;
        padding: 4px;
      }

      .tab-btn {
        padding: 8px 12px;
        font-size: 13px;
      }

      .qr-container {
        width: min(280px, 80vw);
        height: min(280px, 80vw);
        padding: 14px;
        border-radius: 18px;
      }

      .amount-presets {
        gap: 6px;
      }

      .preset-btn {
        padding: 10px 4px;
        font-size: 13px;
      }

      .btn {
        padding: 14px 18px;
        font-size: 15px;
      }
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

      ${(safeBolt12 || safeSilentPayment || safeCashu) ? `
      <div class="tabs">
        <button class="tab-btn active" id="tabLightning" onclick="switchProtocol('lightning')">Lightning Address</button>
        ${safeBolt12 ? `<button class="tab-btn" id="tabBolt12" onclick="switchProtocol('bolt12')">BOLT12 Offer</button>` : ""}
        ${safeSilentPayment ? `<button class="tab-btn" id="tabSilent" onclick="switchProtocol('silent')">Silent Payment</button>` : ""}
        ${safeCashu ? `<button class="tab-btn" id="tabCashu" onclick="switchProtocol('cashu')">Cashu Ecash</button>` : ""}
      </div>` : ""}

      <div id="viewLightning" class="qr-view">
        <div class="qr-container">
          <a href="${lightningAddressUri}" title="Scan or click to open in Lightning wallet">
            ${lightningAddressSvg}
          </a>
        </div>
        <div class="qr-caption">
          <span>Scan with any Lightning or BIP-353 wallet</span>
        </div>
      </div>

      ${safeBolt12 ? `
      <div id="viewBolt12" class="qr-view" style="display: none;">
        <div class="qr-container">
          <a href="${bolt12Uri}" title="Scan or click to open in BOLT12 wallet">
            ${bolt12Svg}
          </a>
        </div>
        <div class="qr-caption">
          <span>Scan with Phoenix or Core Lightning</span>
        </div>
        <details class="offer-details">
          <summary>View BOLT12 Offer String</summary>
          <code>${safeBolt12}</code>
        </details>
      </div>` : ""}

      ${safeSilentPayment ? `
      <div id="viewSilent" class="qr-view" style="display: none;">
        <div class="qr-container">
          <a href="${silentPaymentUri}" title="Scan or click to open in Silent Payment wallet">
            ${silentPaymentSvg}
          </a>
        </div>
        <div class="qr-caption">
          <span>Scan with Cake Wallet, Silentium or BIP-352 wallet</span>
        </div>
        <details class="offer-details">
          <summary>View Silent Payment Address</summary>
          <code style="word-break:break-all;font-size:10px;">${safeSilentPayment}</code>
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
          <span>Scan with Minibits, eNuts or Cashu wallet</span>
        </div>
        <details class="offer-details">
          <summary>View Cashu Payment Request</summary>
          <code style="word-break:break-all;font-size:10px;">${safeCashu}</code>
        </details>
      </div>` : ""}

      <div class="amount-presets" id="amountPresets" style="display: none;">
        <button class="preset-btn active" onclick="selectAmount(21)">21 sats</button>
        <button class="preset-btn" onclick="selectAmount(100)">100</button>
        <button class="preset-btn" onclick="selectAmount(1000)">1,000</button>
        <button class="preset-btn" onclick="selectAmount(5000)">5,000</button>
      </div>

      <div class="actions">
        <button class="btn btn-webln" id="weblnBtn" style="display: none;" onclick="payWithWebLN()">
          <span>Send <span id="btnAmountText">21</span> sats via WebLN</span>
        </button>
        <button class="btn btn-secondary" id="btnCopyAddress" onclick="copyAddress()">
          <span>Copy Lightning Address</span>
        </button>
        ${safeBolt12 ? `
        <button class="btn btn-secondary" id="btnCopyBolt12" style="display: none;" onclick="copyBolt12()">
          <span>Copy BOLT12 Offer</span>
        </button>` : ""}
        ${safeSilentPayment ? `
        <button class="btn btn-secondary" id="btnCopySilent" style="display: none;" onclick="copySilentPayment()">
          <span>Copy Silent Payment Address</span>
        </button>` : ""}
        ${safeCashu ? `
        <button class="btn btn-secondary" id="btnCopyCashu" style="display: none;" onclick="copyCashu()">
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
    let hasWebLN = false;
    let currentProtocol = "lightning";
    const identifier = "${safeIdentifier}";
    const bolt12Offer = "${safeBolt12 || ""}";
    const silentPayment = "${safeSilentPayment || ""}";
    const cashuRequest = "${safeCashu || ""}";

    function showToast(msg) {
      const toast = document.getElementById("toast");
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function copyAddress() {
      navigator.clipboard.writeText(identifier).then(() => {
        showToast("Address copied to clipboard!");
      });
    }

    function copyBolt12() {
      if (!bolt12Offer) return;
      navigator.clipboard.writeText(bolt12Offer).then(() => {
        showToast("BOLT12 offer copied to clipboard!");
      });
    }

    function copySilentPayment() {
      if (!silentPayment) return;
      navigator.clipboard.writeText(silentPayment).then(() => {
        showToast("Silent Payment address copied to clipboard!");
      });
    }

    function copyCashu() {
      if (!cashuRequest) return;
      navigator.clipboard.writeText(cashuRequest).then(() => {
        showToast("Cashu request copied to clipboard!");
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

    function updateWebLNVisibility() {
      const isLightningTab = currentProtocol === "lightning";
      const btnWebln = document.getElementById("weblnBtn");
      const presets = document.getElementById("amountPresets");
      if (btnWebln) btnWebln.style.display = (hasWebLN && isLightningTab) ? "flex" : "none";
      if (presets) presets.style.display = (hasWebLN && isLightningTab) ? "grid" : "none";
    }

    function detectWebLN() {
      if (typeof window !== "undefined" && window.webln) {
        hasWebLN = true;
        updateWebLNVisibility();
      }
    }

    detectWebLN();
    window.addEventListener("webln:ready", () => {
      hasWebLN = true;
      updateWebLNVisibility();
    });
    window.addEventListener("load", detectWebLN);
    setTimeout(detectWebLN, 300);
    setTimeout(detectWebLN, 1000);

    function switchProtocol(type) {
      currentProtocol = type;
      const isLightning = type === "lightning";
      const isBolt12 = type === "bolt12";
      const isSilent = type === "silent";
      const isCashu = type === "cashu";

      const tabL = document.getElementById("tabLightning");
      if (tabL) tabL.classList.toggle("active", isLightning);
      const tabB12 = document.getElementById("tabBolt12");
      if (tabB12) tabB12.classList.toggle("active", isBolt12);
      const tabSP = document.getElementById("tabSilent");
      if (tabSP) tabSP.classList.toggle("active", isSilent);
      const tabC = document.getElementById("tabCashu");
      if (tabC) tabC.classList.toggle("active", isCashu);

      const viewL = document.getElementById("viewLightning");
      if (viewL) viewL.style.display = isLightning ? "block" : "none";
      const viewB12 = document.getElementById("viewBolt12");
      if (viewB12) viewB12.style.display = isBolt12 ? "block" : "none";
      const viewSP = document.getElementById("viewSilent");
      if (viewSP) viewSP.style.display = isSilent ? "block" : "none";
      const viewC = document.getElementById("viewCashu");
      if (viewC) viewC.style.display = isCashu ? "block" : "none";

      updateWebLNVisibility();

      const btnCopyAddr = document.getElementById("btnCopyAddress");
      if (btnCopyAddr) btnCopyAddr.style.display = isLightning ? "flex" : "none";
      const btnCopyB12 = document.getElementById("btnCopyBolt12");
      if (btnCopyB12) btnCopyB12.style.display = isBolt12 ? "flex" : "none";
      const btnCopySP = document.getElementById("btnCopySilent");
      if (btnCopySP) btnCopySP.style.display = isSilent ? "flex" : "none";
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
