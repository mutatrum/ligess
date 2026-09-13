const fs = require('fs')
const path = require('path')

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getMetadata() {
  const metaFile = process.env.LIGESS_NOSTR_METADATA_FILE
  if (metaFile && fs.existsSync(metaFile)) {
    try {
      return JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    } catch (e) {
      // fallback
    }
  }
  return {}
}

function renderLandingPage({ username, domain, identifier, lnurlBech32, bolt12Offer = null }) {
  const meta = getMetadata()
  const displayName = escapeHtml(meta.display_name || meta.name || username)
  const about = escapeHtml(meta.about || `Send Bitcoin instantly via Lightning Address or Nostr Zaps.`)
  const picture = meta.picture ? escapeHtml(meta.picture) : null
  const safeIdentifier = escapeHtml(identifier)
  const safeLnurl = escapeHtml(lnurlBech32)
  const safeBolt12 = bolt12Offer ? escapeHtml(bolt12Offer) : null

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
      content: '';
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
      margin-bottom: 24px;
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
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .badge-handle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      user-select: none;
    }

    .badge-handle:hover {
      background: rgba(245, 158, 11, 0.22);
      transform: translateY(-1px);
    }

    .badge-handle:active {
      transform: scale(0.97);
    }

    .about {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
      margin-top: 14px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      padding: 4px;
      margin: 20px 0;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: var(--transition);
    }

    .tab-btn.active {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    /* QR Code Container */
    .qr-container {
      background: #ffffff;
      border-radius: 16px;
      padding: 16px;
      margin: 16px auto;
      width: 220px;
      height: 220px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }

    .qr-container img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }

    /* Payment Actions */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
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

      <div class="tabs">
        <button class="tab-btn active" id="tabLnurl" onclick="switchTab('lnurl')">⚡ Lightning Address</button>
        ${safeBolt12 ? `<button class="tab-btn" id="tabBolt12" onclick="switchTab('bolt12')">📜 BOLT12 Offer</button>` : ''}
      </div>

      <div id="viewLnurl">
        <div class="qr-container">
          <img id="qrImage" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(safeIdentifier)}&margin=10" alt="Lightning QR">
        </div>
      </div>

      ${safeBolt12 ? `
      <div id="viewBolt12" style="display: none;">
        <div class="qr-container">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(safeBolt12)}&margin=10" alt="BOLT12 QR">
        </div>
        <p style="font-size: 11px; color: var(--text-muted); text-align: center; word-break: break-all; padding: 0 10px;">
          ${safeBolt12}
        </p>
      </div>` : ''}

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
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function copyAddress() {
      navigator.clipboard.writeText(identifier).then(() => {
        showToast('⚡ Address copied to clipboard!');
      });
    }

    document.getElementById('copyBadge').addEventListener('click', copyAddress);

    function selectAmount(sats) {
      currentSats = sats;
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.toggle('active', b.textContent.includes(sats.toLocaleString()));
      });
      document.getElementById('btnAmountText').textContent = sats.toLocaleString();
    }

    function switchTab(type) {
      const isLnurl = type === 'lnurl';
      document.getElementById('tabLnurl').classList.toggle('active', isLnurl);
      const tabB12 = document.getElementById('tabBolt12');
      if (tabB12) tabB12.classList.toggle('active', !isLnurl);

      document.getElementById('viewLnurl').style.display = isLnurl ? 'block' : 'none';
      const viewB12 = document.getElementById('viewBolt12');
      if (viewB12) viewB12.style.display = !isLnurl ? 'block' : 'none';
    }

    async function payWithWebLN() {
      const btn = document.getElementById('weblnBtn');
      const originalText = btn.innerHTML;
      try {
        if (!window.webln) {
          showToast('No WebLN wallet found (install Alby or Zeus extension)');
          return;
        }
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Requesting invoice...</span>';

        await window.webln.enable();

        const msats = currentSats * 1000;
        const res = await fetch(\`/.well-known/lnurlp/${encodeURIComponent(username)}?amount=\${msats}\`);
        const data = await res.json();

        if (data.status === 'ERROR') {
          throw new Error(data.reason || 'Failed to get invoice');
        }

        btn.innerHTML = '<span>⚡</span><span>Confirm in wallet...</span>';
        const paymentRes = await window.webln.sendPayment(data.pr);

        showToast('🎉 Payment successful! Preimage: ' + paymentRes.preimage.slice(0, 8) + '...');
      } catch (err) {
        showToast('Payment cancelled or failed: ' + err.message);
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
