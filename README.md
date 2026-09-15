# LIGESS (**Lig**~~htning addr~~**ess**)

## Your personal sovereign Lightning address & Nostr server
> Like an email address, but for your Bitcoin!
A massively simpler way for anyone to send you Bitcoin instantly on the Lightning Network, send and receive zaps on Nostr, connect your wallet via Nostr Wallet Connect (NIP-47), and accept payments via BOLT12 and BIP-353.

*https://lightningaddress.com/*

---

## What's New in Ligess Modernized

- 🥜 **NIP-61 Nutzaps (Cashu P2PK with Auto-Melt)**:
  - Supports receiving Cashu ecash Nutzaps directly on Nostr via P2PK locking (NUT-10 / NUT-11).
  - Publishes kind 10019 Nutzap Info Announcement and subscribes to kind 9321 Nutzap events.
  - **Auto-Melt into Lightning**: Automatically creates an invoice on your active Lightning backend (LND, CLN, Phoenixd, etc.) and melts ecash proofs at the mint, settling funds directly into your node satoshis.
  - Powered by `@cashu/cashu-ts` v4 with zero native C++ binaries.
- ⚙️ **Dynamic Relay & Profile Configuration (Sunsetting JSON files)**:
  - Dynamically calculates `supported_nips` ([1, 4, 5, 11, 42, 44, 47, 57, 61]), software repo, and version.
  - Profile metadata (Kind 0 & landing page) and relay information are derived dynamically from `.env` (`LIGESS_NOSTR_*` and `LIGESS_RELAY_*`), eliminating static JSON files (`relayInformation.json` and `metadata.json`) with deprecation warnings for legacy files.
- ⚡ **9 Native Lightning & Ecash Backends (Sunsetting `una-wrapper`)**:
  - Direct REST, GraphQL, and Nostr drivers for **LND**, **Core Lightning (CLN)**, **LNbits**, **Eclair**, **Phoenixd**, **Upstream NWC** (Alby Hub, Umbrel, Zeus), **LDK Node / Server**, **Blink (Galoy)**, and **Cashu Mint**.
  - **Real-Time Invoice Streaming**: Native SSE push notifications for LND (`/v1/invoices/subscribe`) and Phoenixd (`/payments/incoming`), eliminating polling delays for instant zap receipts.
- 🛡️ **Zero-Dependency Protobuf & Credential Security Inspection**:
  - Automatically inspects and validates credentials across all 9 backends at boot without leaking sensitive keys.
  - Decodes LND macaroon permissions via a lightweight, zero-dependency wire decoder (`src/backends/protobuf.js`).
  - Verifies Core Lightning (CLN) rune restrictions and reports whether full spending or receive-only mode is active.
  - Logs SHA-256 fingerprints for credential auditing and warns if unrestricted administrative privileges are detected on public-facing servers.
- 🏗️ **Clean Modular `src/` Architecture**:
  - Codebase structured into specialized domain modules: `src/config/`, `src/backends/`, `src/clients/`, `src/nostr/`, `src/storage/`, `src/web/`, and `bin/`.
  
- 🛡️ **Zero-Loss Persistence Engine**:
  - Atomic, durable file-backed persistence (`data/pending_zaps.json` and `data/zaps.json`) with atomic temporary file swapping.
  - In-flight zaps survive node and server restarts without dropping kind 9735 zap receipts.
- 🌐 **Comprehensive LNURL Suite (10 Supported LUDs)**:
  - Implements **LUD-01**, **LUD-06**, **LUD-09**, **LUD-11**, **LUD-12**, **LUD-16**, **LUD-17**, **LUD-18**, **LUD-20**, and **LUD-21**.
  - **Payer Identity (LUD-18)**: Advertises optional `payerData` (name, identifier, email, pubkey) and captures payer details directly into invoice memos.
  - **Payment Verification (LUD-21)**: Provides `/verify/:paymentHash` endpoints for third-party invoice settlement checks without exposing node credentials.
  - **Long Descriptions (LUD-20)**: Rich payment bios via `text/long-desc` on wallet pay screens.
  - **Protocol Schemes (LUD-17)**: Direct wallet deep-linking with raw `lnurlp://` URIs.
  - **Success Actions & Comments (LUD-09 / LUD-12)**: Post-payment notes/URLs (`LIGESS_SUCCESS_MESSAGE`, `LIGESS_SUCCESS_URL`) and up to 280-character comments.
  - **Storable Links (LUD-11)**: Returns `disposable: false` so wallets can bookmark and reuse your address.
- 🔮 **Nostr Stack Upgrade (`nostr-tools v2`)**:
  - Full support for **hex** and **bech32** keys (`nsec1...`, `npub1...`).
  - **NIP-05 DNS Verification**: Built-in `GET /.well-known/nostr.json?name=<username>`.
  - **NIP-33 Support**: Validates and forwards addressable event `a` tags (for long-form posts, badges, live streams).
  - **CORS & Rate Limiting**: Built-in global CORS for web clients (Coracle, Snort, Nostter) and sliding-window rate limiting on invoice generation.
- 📱 **Nostr Wallet Connect (NIP-47) Modernized**:
  - **Dual NIP-44 v2 & NIP-04 Encryption**: Seamless auto-detection and encryption with ChaCha20-Poly1305 or legacy AES-CBC.
  - **Outbound Relay Client**: Connects as a client to public relays (`wss://relay.damus.io`, `wss://nos.lol`), completely eliminating the need for open inbound ports or complex reverse-proxy setup.
  - **Expanded Methods**: `get_info`, `get_balance`, `get_budget`, `pay_invoice`, `pay_offer`, `make_invoice`, and `lookup_invoice`.
- 📜 **BOLT12 & BIP-353 via LNDK**:
  - Outbound BOLT12 payment via NWC (`pay_offer`) routed through [LNDK](https://github.com/lndk-org/lndk).
  - Built-in BIP-353 DNS TXT record generator (`npm run bip353` or `node bin/bip353.js`) for human-readable Bitcoin addresses (`username@domain.com`).
- 🎨 **Modern Web Landing Page & WebLN**:
  - Interactive glassmorphic dark-mode web portal at `https://YOURDOMAIN.COM/`.
  - **WebLN One-Click Pay**: Instant payments with browser extensions (Alby, Zeus).
  - Multi-protocol tabs with real-time switching between **Lightning Address & BIP-353**, **BOLT12 Offers**, and **Cashu Ecash (`CREQB...`)**.
  - Interactive sat preset buttons (21, 100, 1000, 5000), copy actions, and streamlined Alphanumeric QR codes.

---

## Prerequisites
- Node.js >= 18 (Tested on v20 and v24)
- Lightning Node or Gateway (LND, CLN, LNbits, Eclair, Phoenixd, Upstream NWC, LDK, Blink, or Cashu)
- Domain name with HTTPS

---

## Supported Lightning & Ecash Backends

| Backend | Driver Type | Real-Time Events | Required Config |
| :--- | :--- | :--- | :--- |
| **LND** | Native REST | ✅ SSE Push (`/v1/invoices/subscribe`) | `LIGESS_LND_REST`, `LIGESS_LND_MACAROON` |
| **CLN** | Native REST | ✅ Polling stream | `LIGESS_CLN_REST`, `LIGESS_CLN_MACAROON` or `LIGESS_CLN_RUNE` |
| **LNbits** | Native REST | ✅ Polling stream | `LIGESS_LNBITS_DOMAIN`, `LIGESS_LNBITS_API_KEY` |
| **Eclair** | Native REST | ✅ Polling stream | `LIGESS_ECLAIR_REST`, `LIGESS_ECLAIR_PASSWORD` |
| **Phoenixd** | Native REST | ✅ SSE Push (`/payments/incoming`) | `LIGESS_PHOENIXD_PASSWORD`, `LIGESS_PHOENIXD_URL` |
| **NWC** | Nostr Client | ✅ Relay subscription (`kind: 23195`) | `LIGESS_NWC_URI` (Alby Hub, Umbrel, Zeus) |
| **LDK** | Native REST | ✅ Polling stream | `LIGESS_LDK_URL`, `LIGESS_LDK_API_KEY` |
| **Blink** | GraphQL API | ✅ Polling stream | `LIGESS_BLINK_API_KEY`, `LIGESS_BLINK_URL` |
| **Cashu** | NUT-04 / NUT-05 | ✅ Quote status stream | `LIGESS_CASHU_MINT_URL` |
 
### Backend Capabilities Matrix

The matrix below shows which features and protocols are supported across each backend driver in Ligess:

| Backend | Inbound Invoices | Real-Time Settlement | Outbound Pay | Keysend (`pay_keysend`) | Tx History (`list_transactions`) | Nostr Zaps (NIP-57) | Nutzap Auto-Melt (NIP-61) | BOLT12 Offers |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **LND** | ✅ | ✅ (SSE Push) | ✅ | ✅ (TLV 5482373484) | ✅ | ✅ | ✅ | ✅ (via LNDK) |
| **CLN** | ✅ | ✅ (Polling) | ✅ | ✅ (`/v1/keysend`) | ✅ | ✅ | ✅ | ✅ (Native) |
| **Upstream NWC** | ✅ | ✅ (Relay) | ✅ | ✅ (Proxied) | ✅ (Proxied) | ✅ | ✅ | ⚠️ (Depends on upstream) |
| **Phoenixd** | ✅ | ✅ (SSE Push) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (Native) |
| **LNbits** | ✅ | ✅ (Polling) | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Eclair** | ✅ | ✅ (Polling) | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **LDK Node** | ✅ | ✅ (Polling) | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Blink** | ✅ | ✅ (Polling) | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Cashu** | ✅ (Mint Quote) | ✅ (Quote Check) | ✅ (Melt Quote) | ❌ | ❌ | ✅ | ✅ | ❌ |

> **Notes on Matrix Capabilities:**
> - **Inbound & Zaps**: All 9 backends support generating invoices for Lightning Address (`name@domain.com`), LNURL-pay (LUD-01..21), Nostr Zaps (NIP-57), and Nutzap auto-melting (NIP-61).
> - **Keysend (bLIP-0003)**: Fully supported for LND, CLN, and upstream NWC backends with custom TLV record support.
> - **Transaction History (`list_transactions`)**: Fully supported for LND, CLN, and upstream NWC backends for client wallets inquiring history via NIP-47.
> - **BOLT12**: Supported natively in CLN and Phoenixd, and supported in LND via the [LNDK](https://github.com/lndk-org/lndk) sidecar integration.

---

## Supported Standards & Specifications

Ligess is built to be a fully standards-compliant personal sovereign payment server across the Bitcoin, Lightning, Nostr, and Ecash ecosystems.

### Nostr Implementation Possibilities (NIPs)

| NIP | Title | Status | Implementation in Ligess |
| :--- | :--- | :---: | :--- |
| **[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)** | Basic Protocol Flow | ✅ | Event serialization, Schnorr signatures, `finalizeEvent` signing |
| **[NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md)** | Encrypted Direct Messages | ✅ | Legacy AES-CBC fallback for Nostr Wallet Connect |
| **[NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md)** | DNS Identifiers & Relay Discovery | ✅ | `GET /.well-known/nostr.json?name=<username>` with dynamic pubkey & `relays` map |
| **[NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)** | Browser Signer (`window.nostr`) | ✅ | Web landing page 1-click zap note signing via browser extension |
| **[NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)** | Relay Information Document | ✅ | Dynamic metadata, version, and `supported_nips` advertisement on `/relay/` |
| **[NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)** | bech32-encoded entities | ✅ | Parse and display `npub1...`, `nsec1...` keys throughout server |
| **[NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md)** | Parameterized Replaceable Events | ✅ | `a` tag coordinate validation and forwarding in zap requests |
| **[NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md)** | Relay Authentication | ✅ | Optional client authentication for private NWC relay access |
| **[NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md)** | Versioned Encrypted Payloads | ✅ | Modern ChaCha20-Poly1305 v2 encryption for NWC |
| **[NIP-47](https://github.com/nostr-protocol/nips/blob/master/47.md)** | Nostr Wallet Connect (NWC) | ✅ | Server & outbound client relay, `list_transactions`, `multi_pay_invoice`, `pay_keysend`, `pay_offer`, budget tracking |
| **[NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md)** | Lightning Zaps & Private Zaps | ✅ | Kind 9734 zap requests, description hash validation, Kind 9735 receipts, anonymous zaps (`anon` tag) |
| **[NIP-61](https://github.com/nostr-protocol/nips/blob/master/61.md)** | Nutzaps (Cashu over Nostr) | ✅ | Kind 10019 info announcement, Kind 9321 receiver, P2PK witness & Auto-Melt |

### Lightning Network Specifications (LUDs, BOLTs & bLIPs)

| Specification | Title | Status | Implementation in Ligess |
| :--- | :--- | :---: | :--- |
| **[LUD-01](https://github.com/lnurl/luds/blob/luds/01.md)** | Base LNURL Encoding | ✅ | `lnurl1...` bech32 generation, parsing, and QR codes |
| **[LUD-06](https://github.com/lnurl/luds/blob/luds/06.md)** | `payRequest` Base Protocol | ✅ | `GET /.well-known/lnurlp/:user` callback flow and parameter negotiation |
| **[LUD-09](https://github.com/lnurl/luds/blob/luds/09.md)** | LNURL-pay `successAction` | ✅ | Configurable post-payment thank-you notes and external URLs (`LIGESS_SUCCESS_MESSAGE`, `LIGESS_SUCCESS_URL`) |
| **[LUD-11](https://github.com/lnurl/luds/blob/luds/11.md)** | Storable `payRequest`s | ✅ | Explicit `"disposable": false` returned in invoice callbacks for wallet bookmarking |
| **[LUD-12](https://github.com/lnurl/luds/blob/luds/12.md)** | Comments in LNURL-pay | ✅ | Up to 280-character comments preserved and attached to node invoice memos |
| **[LUD-16](https://github.com/lnurl/luds/blob/luds/16.md)** | Lightning Address | ✅ | `username@domain.com` internet identifier resolution and mapping |
| **[LUD-17](https://github.com/lnurl/luds/blob/luds/17.md)** | Protocol Schemes & Raw URLs | ✅ | Raw `lnurlp://` scheme exposed on `GET /` and web portal deep-linking |
| **[LUD-18](https://github.com/lnurl/luds/blob/luds/18.md)** | Payer Identity (`payerData`) | ✅ | Advertises optional payerData (name, identifier, email, pubkey) and attaches to invoice memos |
| **[LUD-20](https://github.com/lnurl/luds/blob/luds/20.md)** | Long Payment Description | ✅ | `text/long-desc` entry in metadata and invoice description hashes (`LIGESS_LONG_DESCRIPTION`) |
| **[LUD-21](https://github.com/lnurl/luds/blob/luds/21.md)** | Payment Verification Endpoint | ✅ | `verify` callback URL and `GET /verify/:paymentHash` invoice settlement query |
| **[BOLT #04](https://github.com/lightning/bolts/blob/master/04-onion-routing.md)** | Failure Code Mapping | ✅ | Transparent routing error code mappings in NWC and payment callbacks |
| **[BOLT #11](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)** | Invoice Protocol | ✅ | Zero-dependency Bech32 invoice parsing and validation |
| **[BOLT #12](https://github.com/lightning/bolts/blob/master/12-offer-encoding.md)** | Offers Protocol | ✅ | Native `lno1...` offers, Alphanumeric QR codes, NWC `pay_offer`, and LNDK |
| **[bLIP-0003](https://github.com/lightning/blips/blob/master/blip-0003.md)** | Keysend Spontaneous Payments | ✅ | Direct keysend execution and TLV record support in NWC (`pay_keysend`) |

### Bitcoin, Cashu & Web Standards (BIPs & NUTs)

| Standard | Title | Status | Implementation in Ligess |
| :--- | :--- | :---: | :--- |
| **[BIP-353](https://github.com/bitcoin/bips/blob/master/bip-0353.mediawiki)** | DNS Payment Instructions | ✅ | Multi-chunk RFC 1035 TXT verification on boot (`npm run bip353`) |
| **[BIP-352](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)** | Silent Payments | ✅ | Reusable private on-chain Bitcoin address (`sp1...`) in BIP-353 DNS and web portal |
| **[BIP-173](https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki) / [BIP-350](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki)** | Bech32 & Bech32m | ✅ | Case-insensitive encoding for LNURL, BOLT12, Cashu, and Nostr keys |
| **[NUT-04](https://github.com/cashubtc/nuts/blob/main/04.md) / [NUT-05](https://github.com/cashubtc/nuts/blob/main/05.md)** | Minting & Melting | ✅ | Lightning-to-ecash and ecash-to-Lightning gateway support |
| **[NUT-07](https://github.com/cashubtc/nuts/blob/main/07.md)** | Token State Check | ✅ | Real-time proof state checking (`/v1/checkstate`) before melting Nutzap ecash |
| **[NUT-10](https://github.com/cashubtc/nuts/blob/main/10.md) / [NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md)** | Cashu P2PK Conditions | ✅ | SECP256k1 parity handling (`SECP256K1_N - d`), P2PK witness signature for ecash |
| **[NUT-18](https://github.com/cashubtc/nuts/blob/main/18.md) / [NUT-26](https://github.com/cashubtc/nuts/blob/main/26.md)** | Cashu Payment Requests | ✅ | Standardized Bech32m `CREQB...` payment request generator for ecash donations |
| **[WebLN](https://webln.guide/)** | Web Lightning Integration | ✅ | In-browser one-click payments on web landing page |

---

## Quick Start

### 1. Standalone Setup
```bash
git clone https://git.mutatrum.com/mutatrum/ligess
cd ligess
npm install
cp .env.example .env
# Edit .env with your backend credentials and domain
npm start
```

For development with automatic reload:
```bash
npm run dev
```

To run the automated test suite:
```bash
npm test
```

### 2. Docker Compose
```bash
git clone https://git.mutatrum.com/mutatrum/ligess
cd ligess
# Edit docker-compose.yml or mount your .env file
docker-compose up -d
```

---

## Backend Configuration

### LND Configuration
```env
LIGESS_LN_BACKEND=LND
LIGESS_LND_REST=https://127.0.0.1:8080
LIGESS_LND_MACAROON=02010... # Hex-encoded macaroon
```

#### Baking LND Macaroons with Least Privilege

> [!TIP]
> Never use `admin.macaroon` in production. Always bake a customized macaroon with the minimum permissions required for your operational profile.

Ligess supports two distinct security and operational situations:

##### Situation 1: Receive-Only Mode (Lightning Address, Zaps & Nutzap Melt)
Use this if you **only** want Ligess to receive payments (`username@domain.com`), process LNURL-pay, receive Nostr Zaps (NIP-57), and auto-melt incoming Cashu ecash into satoshis (NIP-61).
* **Permissions Needed**: `invoices:read` and `invoices:write`
* **Zero Spend Risk**: Because `offchain:write` is omitted, Ligess has **no cryptographic capability to spend, keysend, or route satoshis away from your node**. Even in the event of an arbitrary server or `.env` compromise, your node balance cannot be drained.
* **Bake command**:
  ```bash
  # 1. Bake restricted receive-only macaroon
  lncli bakemacaroon --save_to=ligess-receive.macaroon invoices:read invoices:write

  # 2. Output hex string to paste into LIGESS_LND_MACAROON in .env
  xxd -ps -u -c 1000 ligess-receive.macaroon
  ```

##### Situation 2: Full Mode with Nostr Wallet Connect (Outbound Spending & Remote Wallet)
Use this if you want Ligess to also act as your personal **NIP-47 remote wallet server**, allowing mobile Nostr clients (such as Amethyst, Damus, Primal, or the Alby browser extension) to send zaps, execute keysends, and pay invoices directly from your node.
* **Permissions Needed**: `invoices:read`, `invoices:write`, `offchain:write` (to execute outbound payments), and `info:read` (to query node alias/balance).
* **Bake command**:
  ```bash
  # 1. Bake NWC-enabled macaroon
  lncli bakemacaroon --save_to=ligess-nwc.macaroon invoices:read invoices:write offchain:write info:read

  # 2. Output hex string to paste into LIGESS_LND_MACAROON in .env
  xxd -ps -u -c 1000 ligess-nwc.macaroon
  ```
* **Essential Safeguards for Situation 2**:
  * Set `LIGESS_NOSTR_WALLET_CONNECT_PUBLIC_KEY` in `.env` to restrict execution exclusively to your personal Nostr client pubkey.
  * Define rolling budget caps (`LIGESS_NOSTR_WALLET_CONNECT_BUDGET_ZAP`, `LIGESS_NOSTR_WALLET_CONNECT_BUDGET_HOUR`, and `LIGESS_NOSTR_WALLET_CONNECT_BUDGET_DAY`) to prevent runaway spending.

### Core Lightning (CLN) Configuration
```env
LIGESS_LN_BACKEND=CLN
LIGESS_CLN_REST=https://127.0.0.1:3001
LIGESS_CLN_RUNE=your_rune_string
# or
LIGESS_CLN_MACAROON=hex_macaroon_string
```

#### Restricting Core Lightning Runes with Least Privilege

Like LND macaroons, CLN runes can be restricted to minimize risk based on your operational profile:

* **Receive-Only Mode** (Lightning Address, Zaps & Nutzap Melt):
  ```bash
  # Generate rune restricted strictly to creating and monitoring invoices
  lightning-cli commando-rune '["method=invoice", "method=waitanyinvoice"]'
  ```
* **Full Mode** (Nostr Wallet Connect Outbound Spending):
  ```bash
  # Allow invoice creation, payments, keysends, and node info inquiries
  lightning-cli commando-rune '["method=invoice", "method=waitanyinvoice", "method=pay", "method=keysend", "method=listinvoices", "method=getinfo"]'
  ```

### LNbits Configuration
```env
LIGESS_LN_BACKEND=LNbits
LIGESS_LNBITS_DOMAIN=https://legend.lnbits.com
LIGESS_LNBITS_API_KEY=your_invoice_key
```

### Eclair Configuration
```env
LIGESS_LN_BACKEND=Eclair
LIGESS_ECLAIR_REST=http://127.0.0.1:8080
LIGESS_ECLAIR_LOGIN=eclair-user
LIGESS_ECLAIR_PASSWORD=your_password
```

### Phoenixd Configuration (ACINQ)
```env
LIGESS_LN_BACKEND=Phoenixd
LIGESS_PHOENIXD_URL=http://127.0.0.1:9740
LIGESS_PHOENIXD_PASSWORD=your_phoenixd_http_password
```
Phoenixd provides zero-channel-management Lightning with real-time SSE payment notifications.

### Upstream Nostr Wallet Connect (NWC)
```env
LIGESS_LN_BACKEND=NWC
LIGESS_NWC_URI=nostr+walletconnect://<wallet_pubkey>?relay=wss://relay.getalby.com/v1&secret=<secret>
```
Connects Ligess as an NWC client to any upstream wallet (Alby Hub, Umbrel, Zeus, Mutiny). Requires **zero open inbound ports** and works seamlessly behind strict firewalls and CGNAT.

### LDK Node / LDK Server REST
```env
LIGESS_LN_BACKEND=LDK
LIGESS_LDK_URL=http://127.0.0.1:3000
LIGESS_LDK_API_KEY=your_ldk_api_token
```

### Blink / Galoy (GraphQL)
```env
LIGESS_LN_BACKEND=Blink
LIGESS_BLINK_API_KEY=your_blink_api_key
LIGESS_BLINK_URL=https://api.blink.sv/graphql # Optional (default)
LIGESS_BLINK_WALLET_ID=your_btc_wallet_id     # Optional: auto-detected if omitted
```

### Cashu Mint (NUT-04 / NUT-05)
```env
LIGESS_LN_BACKEND=Cashu
LIGESS_CASHU_MINT_URL=https://mint.minibits.cash/Bitcoin
```
Accept Lightning payments as Cashu ecash quotes without running any Lightning node infrastructure.

### Tor SOCKS5 Proxy
To route node requests through Tor (works for all backends):
```env
LIGESS_TOR_PROXY_URL=socks5h://127.0.0.1:9050
```

---

## Nostr & Zaps (NIP-57)

Set `LIGESS_NOSTR_ZAPPER_PRIVATE_KEY` in `.env` to a 64-char hex key or a `nsec1...` string:
```env
LIGESS_NOSTR_ZAPPER_PRIVATE_KEY=nsec1...
```

### NIP-05 DNS Verification
Ligess automatically serves `GET /.well-known/nostr.json?name=<username>`.
Specify your profile's hex pubkey or `npub1...` in:
```env
LIGESS_NOSTR_PUBKEY=npub1...
```
Now clients verifying `username@yourdomain.com` will validate your profile.

### Nostr Profile Metadata (Kind 0) & Web Landing Page
Profile information is dynamically derived from your configured `LIGESS_USERNAME` and `LIGESS_DOMAIN`. You can customize any field directly in `.env`:
```env
LIGESS_NOSTR_DISPLAY_NAME="Alice"
LIGESS_NOSTR_ABOUT="Send Bitcoin instantly via Lightning Address or Nostr Zaps."
LIGESS_NOSTR_PICTURE="https://yourdomain.com/avatar.png"
LIGESS_NOSTR_BANNER="https://yourdomain.com/banner.png"
LIGESS_NOSTR_WEBSITE="https://yourdomain.com"
```
*(Note: Legacy `metadata.json` and `LIGESS_NOSTR_METADATA_FILE` are deprecated; a warning will be logged on startup if detected.)*

### LNURL-pay Customization (LUD-09, LUD-18, LUD-20)
You can configure post-payment actions, payer identity requests, and detailed payment bios in `.env`:
```env
# LUD-09: Post-payment successAction (message or URL)
LIGESS_SUCCESS_MESSAGE="Thank you for supporting sovereign open-source!"
# LIGESS_SUCCESS_URL="https://yourdomain.com/thanks"
# LIGESS_SUCCESS_URL_DESCRIPTION="View details on website"

# LUD-20: Long description displayed on wallet pay screens (defaults to LIGESS_NOSTR_ABOUT)
LIGESS_LONG_DESCRIPTION="Support my sovereign Bitcoin, Lightning, and Nostr software development."

# LUD-18: Payer identity (name, identifier, email, pubkey) request (default: true, all fields optional)
LIGESS_PAYER_DATA_ENABLED=true
```

---

## NIP-61 Nutzaps (Cashu Ecash Zaps)

Ligess supports [NIP-61 (Nutzaps)](https://github.com/nostr-protocol/nips/blob/master/61.md), allowing you to receive Cashu ecash zaps on Nostr locked to your public key via P2PK (NUT-10/NUT-11).

### Enabling Nutzaps
Enable Nutzaps in your `.env`:
```env
LIGESS_NUTZAP_ENABLED=true
# Optional: defaults to LIGESS_NOSTR_ZAPPER_PRIVATE_KEY
# LIGESS_NUTZAP_PRIVATE_KEY=nsec1...

# Trusted Cashu mints (comma-separated):
LIGESS_NUTZAP_MINTS=https://mint.minibits.cash/Bitcoin,https://mint.coinos.io

# Relays to announce kind 10019 and monitor for kind 9321 Nutzaps:
LIGESS_NUTZAP_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net

# Auto-Melt into Lightning (Default: true):
LIGESS_NUTZAP_AUTO_MELT=true
```

### How Auto-Melt Works
When someone sends a kind 9321 Nutzap to your Nostr pubkey:
1. Ligess unlocks the Cashu proofs using your derived P2PK private key witness (NUT-11).
2. Ligess calls your active Lightning backend (LND, CLN, Phoenixd, etc.) to generate an invoice for the exact amount.
3. Ligess requests a melt quote from the Cashu mint and executes `wallet.meltProofs(quote, proofs)`.
4. The funds immediately settle into your sovereign Lightning node balance!

---

## Nostr Wallet Connect (NIP-47)

NWC enables 1-tap zapping from apps like Damus, Amethyst, Coracle, and Nostter.

Set a dedicated private key for NWC:
```env
LIGESS_NOSTR_WALLET_CONNECT_PRIVATE_KEY=nsec1...
```

### Outbound Relays (Recommended - No Open Ports Needed)
Specify comma-separated public relays:
```env
LIGESS_NOSTR_WALLET_CONNECT_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net
```
Ligess will connect as a client, advertise its kind 13194 capabilities, listen for incoming kind 23194 requests, and publish kind 23195 responses.

### Inbound WebSocket Endpoint
If you prefer direct connections to your own server:
```env
LIGESS_NOSTR_WALLET_CONNECT_RELAY=wss://yourdomain.com/relay/
```

### Pairing QR Code
To print a scannable NWC pairing QR code in the terminal:
```bash
npm run show-qr
# or: node bin/show-qr.js
```

### Budget Controls
All spendings are tracked atomically in `data/zaps.json`:
```env
LIGESS_NOSTR_WALLET_CONNECT_BUDGET_ZAP=5000     # Max single payment (sats)
LIGESS_NOSTR_WALLET_CONNECT_BUDGET_HOUR=25000   # Max per hour (sats)
LIGESS_NOSTR_WALLET_CONNECT_BUDGET_DAY=100000   # Max per day (sats)
```

---

## BOLT12 & Bitcoin Payment Instructions (BIP-353 / BIP-352)

Ligess provides end-to-end support for BOLT12 offers and Bitcoin payment instructions via DNS TXT records.

### Static Reusable BOLT12 Offer & Silent Payments
Configure your static reusable offer string and/or BIP-352 Silent Payment address in `.env`:
```env
# Displayed in the BOLT12 QR tab on the web portal and embedded into BIP-353 records
LIGESS_BOLT12_OFFER=lno1...

# Reusable on-chain silent payment address (appended to BIP-353 TXT record as &sp=sp1...)
LIGESS_SILENT_PAYMENT_ADDRESS=sp1qq...
```

### Inbound BOLT12 & Silent Payments via BIP-353
Inbound payments use human-readable DNS TXT records defined in [BIP-353](https://github.com/bitcoin/bips/blob/master/bip-0353.mediawiki):
```dns
user.user._bitcoin-payment.domain.com. IN TXT "bitcoin:?lno=lno1...&sp=sp1qq..."
```
You can verify and generate the DNS record for your domain with:
```bash
npm run bip353
# or with explicit CLI arguments:
node bin/bip353.js --user alice --domain mydomain.com --offer lno1... --sp sp1qq...
```

### Outbound BOLT12 via LNDK (`pay_offer`)
For LND nodes, Ligess can route outbound BOLT12 offer payments (`pay_offer`) through the [LNDK](https://github.com/lndk-org/lndk) sidecar:
```env
LIGESS_LNDK_ENABLED=true
LIGESS_LNDK_GRPC_HOST=127.0.0.1:7000
LIGESS_LNDK_TLS_CERT=/path/to/lndk/tls.cert
LIGESS_LNDK_MACAROON_HEX=02010... # Optional: defaults to LIGESS_LND_MACAROON
```
Once enabled, NWC advertises `pay_offer` and routes BOLT12 offer payments through LNDK.

---

## Web Landing Page & WebLN

Visit `https://YOURDOMAIN.COM/` in any browser to see the interactive portal:
- Display name, avatar, and bio generated dynamically or customized via `.env` (`LIGESS_NOSTR_*`).
- Click-to-copy Lightning Address (`user@domain.com`).
- WebLN button to pay presets (21, 100, 1000, 5000 sats) with one click via Alby or Zeus.
- Toggle between Lightning Address QR and BOLT12 Offer QR.
- Legacy clients requesting JSON receive standard LNURL parameters.

---

## Codebase Architecture

Ligess is structured into clean, modular layers within `src/` and executable utilities in `bin/`:

```
ligess/
├── src/
│   ├── app.js               # Fastify application assembly & startup
│   ├── config/
│   │   ├── constants.js     # Global constants, backend enum, time windows
│   │   └── startup.js       # Environment check & credential validation
│   ├── backends/            # Lightning & Ecash drivers
│   │   ├── base.js          # Abstract base backend class (EventEmitter)
│   │   ├── factory.js       # Backend factory (createBackend, getLnClient)
│   │   ├── lnd.js           # LND REST + SSE invoice stream
│   │   ├── cln.js           # Core Lightning REST (rune & macaroon)
│   │   ├── lnbits.js        # LNbits API driver
│   │   ├── eclair.js        # Eclair REST driver
│   │   ├── phoenixd.js      # ACINQ Phoenixd + SSE payment stream
│   │   ├── nwc.js           # Upstream NWC client (Alby Hub, Zeus, etc.)
│   │   ├── ldk.js           # LDK Node / Server REST driver
│   │   ├── blink.js         # Blink (Galoy) GraphQL driver
│   │   ├── cashu.js         # Cashu Mint (NUT-04/NUT-05) driver
│   │   └── protobuf.js      # Lightweight zero-dependency wire decoder for LND macaroons
│   ├── clients/
│   │   └── lndk.js          # LNDK gRPC client for BOLT12 offers
│   ├── nostr/
│   │   ├── crypto.js        # NIP-44 & NIP-04 crypto, bech32 key helpers
│   │   ├── zaps.js          # NIP-57 zap verification & receipt generation
│   │   └── nwcServer.js     # NIP-47 wallet connect server & outbound relay client
│   ├── storage/
│   │   └── db.js            # Crash-safe atomic JSON persistence
│   └── web/
│       ├── landingPage.js   # Glassmorphic WebLN landing page generator
│       └── router.js        # Fastify router, CORS, rate-limiting, NIP-05
├── bin/
│   ├── bip353.js            # Standalone CLI for BIP-353 DNS TXT records
│   └── show-qr.js           # Standalone CLI for NWC pairing QR code
├── data/                    # Persistent storage (pending_zaps.json, zaps.json)
└── test/                    # Node test runner automated test suite
```

---

## Testing

Run the full suite of automated unit tests:
```bash
npm test
```
Tests cover:
- All 9 backend drivers (LND, LNbits, CLN, Eclair, Phoenixd, NWC, LDK, Blink, Cashu) and backend factory resolution
- Persistence engine and budget window sums
- NIP-57 zap requests and NIP-33 addressable tags
- NIP-47 dual NIP-44 and NIP-04 encryption and error codes
- NIP-05 DNS verification, CORS headers, and WebLN landing page
- BIP-353 DNS TXT record formatting

---

## License & Credits
MIT License.
Original project created by [dolu89](https://github.com/dolu89/ligess).
Nostr extensions and modernization by [mutatrum](https://git.mutatrum.com/).
Tips and zaps welcome at `mutatrum@hodl.camp`.