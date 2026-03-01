# Implementation Guide — Ephemeral, PIN-Protected, Zero-Storage P2P File Sharing

> Complete step-by-step developer implementation guide: from project bootstrap to full functional demo, deployments notes, infra, and a thorough testing guide.

---

## Table of Contents

1. Prerequisites
2. Project scaffolding (commands + structure)
3. Dependency list (what & when to install) with install commands
4. Configuration & environment variables
5. Development workflows (run, debug, build)
6. Transport & infra (STUN/TURN, coturn, relay) setup
7. Core module implementations (what files to write, short responsibilities)
8. Security & cryptography parameters (recommended values)
9. Wipe & cleanup verification
10. Testing guide (unit, integration, E2E, adversarial) + coverage commands
11. CI/CD & release checklist
12. Production & operational notes
13. Appendices: package.json example, tsconfig, docker-compose for coturn, common troubleshooting

---

## 1. Prerequisites

* **Node.js**: v18 or later (LTS recommended)
* **npm**: v9 or later, or **pnpm** / **yarn** if you prefer (commands below use `npm` as default)
* **Git**: version control
* **Docker** (optional): for local TURN server (coturn) and other infra
* Modern browser(s) for testing: Chrome, Firefox, Safari (mobile check via device or simulator)

Quick checks:

```bash
node -v
npm -v
git --version
```

---

## 2. Project scaffolding

We recommend a TypeScript + Vite + React minimal starter for the UI, and a small Node.js (TypeScript) server for signaling/relay stubs.

### Create project folders

```bash
# top-level workspace
mkdir ephemeral-share && cd ephemeral-share
mkdir web && mkdir server && mkdir infra
```

### Bootstrap frontend (Vite + React + TypeScript)

```bash
cd web
npm create vite@latest . --template react-ts
# or using pnpm: pnpm create vite@latest . --template react-ts
```

### Bootstrap server (Express + ws/Socket.IO) – TypeScript

```bash
cd ../server
npm init -y
npm install express ws cors
npm install -D typescript ts-node-dev @types/node @types/express @types/ws
npx tsc --init
```

---

## 3. Dependency list — when to install & commands

Below are grouped by phase: core dependencies (immediate), optional/perf (install later), dev/test tools (install now or during CI setup).

### 3.1 Frontend — core runtime dependencies

Run inside `web/` folder.

```bash
npm install simple-peer idb argon2-browser
npm install --save @types/simple-peer
```

* `simple-peer` → easier WebRTC wrapper (optional; you can use native RTCPeerConnection)
* `idb` → tiny, promise-friendly IndexedDB wrapper.
* `argon2-browser` → Argon2 WASM KDF (desktop). Use as optional fallback; you will also implement PBKDF2 fallback via WebCrypto.

### 3.2 Frontend — core polyfills / helpers

```bash
npm install clipboard-copy
```

### 3.3 Frontend — development & type tooling

```bash
npm install -D typescript eslint prettier eslint-config-prettier eslint-plugin-react vitest @testing-library/react @testing-library/jest-dom
```

### 3.4 Server — runtime dependencies

Run inside `server/` folder.

```bash
npm install express socket.io cors
npm install --save-dev typescript ts-node-dev @types/express @types/node @types/socket.io
```

* `socket.io` helps for signaling; `ws` is an alternative lightweight option.

### 3.5 Optional infra tools

* **coturn** — install via Docker (see infra section). Used to provide TURN for WebRTC.
* **MinIO / Localstack / S3** — optional encrypted relay storage when you need a server fallback to hold ciphertext temporarily.

### 3.6 Security / scanning / dependency checks

```bash
npm install -D snyk npm-audit-ci
```

### 3.7 Testing tools (unit/e2e)

```bash
npm install -D vitest playwright nyc
# or for jest: npm i -D jest ts-jest @types/jest
```

---

## 4. Configuration & environment variables

Keep secrets out of code. Use `.env` files and platform env configuration for production.

### Example `.env` (server)

```
PORT=3000
SIGNAL_SECRET=some-super-secret-for-signaling (short-live in prod)
TURN_USER=turnuser
TURN_PASS=turnpass
```

### Example `.env` (frontend)

```
VITE_SIGNALING_URL=http://localhost:3000
VITE_RELAY_URL=http://localhost:3000/relay
```

**Note:** URL fragments containing `url_secret` and `encFileKey` must never be sent to the server. Ensure any link-sharing UI copies the full URL but you do not send fragments in XHRs.

---

## 5. Development workflows (run, debug, build)

### 5.1 Frontend (dev server)

From `web/`:

```bash
npm install
npm run dev    # Vite dev server (hot reload)
```

`package.json` scripts example:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

### 5.2 Server (signaling stub)

From `server/`:

```bash
npm install
npm run dev    # uses ts-node-dev to run server with hot reload
```

`package.json` script example:

```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "start": "node dist/index.js",
  "build": "tsc"
}
```

### 5.3 Running full local demo

1. Start the signaling server (`server/`).
2. Start frontend dev server (`web/`).
3. Open two browser tabs to the frontend app: in Tab A create a transfer; in Tab B paste the transfer URL (fragment must remain in Tab B; if pasting into address bar make sure the fragment is present). If using manual SDP flow, exchange offers/answers via the console or use the server's signaling.

---

## 6. Transport & infra setup

### 6.1 STUN/TURN — coturn (Docker)

A local `docker-compose` snippet:

```yaml
version: '3'
services:
  coturn:
    image: instrumentisto/coturn
    ports:
      - "3478:3478"
      - "3478:3478/udp"
      - "5349:5349"
    environment:
      - REALM=localhost
      - LISTEN_IP=0.0.0.0
      - EXTERNAL_IP=127.0.0.1
    command: ["-n", "--lt-cred-mech", "--no-loopback-peers"]
```

* Use short-lived TURN credentials in production (generate ephemeral tokens per session).

### 6.2 Relay (optional)

If P2P fails, sender can upload ciphertext to a relay endpoint (server) that will store ciphertext only and delete them on TTL expiry. Use S3 with lifecycle rules or store in ephemeral disk with cron cleanup.

Relay security rules:

* Accept only ciphertext in POST /relay/:transferID/chunk
* Store with `transferID` index and TTL
* Purge on `DELETE /relay/:transferID` or automatic expiry

---

## 7. Core module implementations — files & responsibilities

Below is the minimal file map and descriptions you should implement (match earlier PRD).

```
/src
  /ui
    ShareForm.tsx       # file selection, ZIP folder if needed, PIN input, start sender flow
    ReceiveForm.tsx     # parse URL fragment, open DataChannel, store ciphertext
    PinPrompt.tsx       # masked input, attempt counters
    Skeleton.tsx        # skeleton loader and failure redirect logic
  /lib
    /crypto
      index.ts          # public functions: generateFileKey, encryptChunk, derivePinKey, wrapFileKey, unwrapFileKey
      webcrypto.ts      # helper wrappers for subtlecrypto
      argon2-adapter.ts # argon2-browser adapter + fallback to PBKDF2
    /transport
      webrtc.ts         # PeerTransport / simple-peer wrapper: connect, sendChunk, receiveChunk
      relay.ts          # functions for posting chunks to relay (optional)
    /storage
      idb.ts            # open DB, storeCipherChunk, getAllChunks, deleteDB
    /wipe
      wipe.ts           # wipeAll(transferID) implementation
  service-worker
    sw.js               # skeleton caching & cleanup hooks
```

### Important implementation notes

* **Chunking**: use `ReadableStream`/`Blob.slice()` to slice file into fixed-size chunks. Keep `chunkSize` configurable.
* **AES-GCM use**: ensure unique random IV per chunk. Use `crypto.getRandomValues(new Uint8Array(12))`.
* **AAD**: use `transferID + ':' + chunkIndex` (Uint8Array) as additional authenticated data.
* **EncFileKey**: wrap `fileKey` with `pinKey` using AES-GCM; export `encFileKey` as base64 and store in fragment.

---

## 8. Security & cryptography parameters (recommended)

Tune based on device class.

* `fileKey` length: **256 bits (32 bytes)**
* `AES-GCM` tag: **128 bits**
* Per-chunk IV: **12 bytes** (96 bits)
* Chunk sizes: **desktop 512 KiB**, **mobile 256 KiB**

**KDF profiles**

* **desktop (argon2id via WASM)**

  * memory: 64 MiB
  * iterations: 2
  * parallelism: 1
  * expected time: ~100-300 ms on modern desktop
* **mobile (PBKDF2)**

  * sha256
  * iterations: 150k
  * expected time: ~200-500 ms on mid-range phones

**PIN length**: support **4, 6, 8 digits** (encourage 6+ for sensitive files)

**Attempt limiting**

* Client: max 5 attempts, with exponential backoff (0.5s, 1s, 2s, 4s)
* Server (signaling): lock session for 1 minute after N failed attempts if applicable

---

## 9. Wipe & cleanup verification

`wipeAll(transferID)` must perform these steps atomically if possible:

1. Close DataChannel / WebSocket
2. `await caches.delete(cacheName)`
3. `await indexedDB.deleteDatabase('ephemeral-transfer-'+transferID)`
4. `localStorage.removeItem('transfer-'+transferID)` + `sessionStorage.removeItem(...)`
5. Clear in-memory buffers
6. `history.replaceState(null, '', '/')` and `location.href = '/'` (skeleton UX)

**Testing wipe**: create automated test that triggers wrong PIN and asserts `indexedDB.databases()` returns no DB with that name (Chrome-specific API may be needed), caches don't contain the cacheName, and all in-memory references are null.

---

## 10. Testing guide & coverage

Comprehensive testing plan: unit tests, integration tests, E2E, security/adversarial tests, cross-browser tests.

### 10.1 Unit tests (fast)

Tools: **Vitest** (or Jest + ts-jest)

Files to unit test:

* Crypto: `encryptChunk`/`decryptChunk` roundtrip, `wrapFileKey`/`unwrapFileKey` correct vs incorrect PIN
* IDB helpers: storing retrieval/deletion
* Wipe: ensure function invokes `indexedDB.deleteDatabase()` and `caches.delete()` (mocking environment)

**Run unit tests**:

```bash
# in web/
npm run test:unit
# package.json
"test:unit": "vitest"
```

### 10.2 Integration tests (local P2P)

* Simulate two browser contexts (Playwright can launch two pages) and run a full transfer: sender encrypts & streams; receiver stores chunks; receiver enters correct PIN; verify integrity (hashes) and downloaded file equals original.

Example Playwright flow:

1. Launch app in two pages pointing to dev server
2. On page A create transfer, copy URL fragment
3. On page B open the link via `page.goto(url)`
4. Confirm transfer completes and file hash matches

**Run e2e**:

```bash
npm run test:e2e
# package.json
"test:e2e": "playwright test"
```

### 10.3 Adversarial / security tests

* Attempt decrypt with wrong PIN repeatedly; assert client-side limits kick in and no plaintext appears
* Simulate relay interception: verify relay logs contain only ciphertext, not keys
* Tamper with chunk ciphertext: AES-GCM tag verification should fail and transfer should error cleanly

### 10.4 Cross-browser tests

* Chrome Desktop, Firefox Desktop, Safari Desktop, Safari iOS, Chrome/Firefox Android
* Check WebRTC DataChannel semantics (binary types, buffer sizes) and Argon2 performance

### 10.5 Coverage

Use `vitest --coverage` or `nyc` with jest.

```bash
npm run test:coverage
# package.json
"test:coverage": "vitest --coverage"
```

### 10.6 Example unit test (crypto)

```ts
import { generateFileKey, encryptChunk, decryptChunk } from '../lib/crypto'

it('encrypt/decrypt roundtrip', async () => {
  const fileKey = await generateFileKey()
  const data = new TextEncoder().encode('hello world')
  const { iv, cipher } = await encryptChunk(fileKey, data.buffer, new Uint8Array([1,2,3]))
  const plain = await decryptChunk(fileKey, cipher, iv, new Uint8Array([1,2,3]))
  expect(new TextDecoder().decode(plain)).toBe('hello world')
})
```

---

## 11. CI/CD & release checklist

1. Run linters & formatters (ESLint + Prettier)
2. Run tests (unit + e2e smoke)
3. Run dependency vulnerability scan (Snyk / npm audit)
4. Build front-end (`npm run build`) and server (`npm run build`) artifacts
5. Security review: ensure fragments not logged, env vars not leaked
6. Deploy server (if relay/turn used) behind HTTPS with HSTS and CSP
7. Tag release and create release notes documenting KDF params & any backward-incompatible changes

CI example (`.github/workflows/ci.yml`) should include steps to setup Node, install, run lint, run tests, run coverage, and build.

---

## 12. Production & operational notes

* Enforce HTTPS + strong CSP headers on all endpoints
* Rotate TURN credentials per-session (JWT-based short-lived creds)
* Use autoscaling or managed TURN options for production
* Relay storage must be encrypted, store ciphertext only, and have strict lifecycle policies (e.g., 24 hours max)
* Log only minimal metadata (timestamps, success/failure) — do NOT log transferID fragments or keys

---

## 13. Appendix: package.json (examples)

### `web/package.json` (key parts)

```json
{
  "name": "ephemeral-web",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test:unit": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "argon2-browser": "^1.7.1",
    "idb": "^7.0.0",
    "simple-peer": "^9.11.1",
    "clipboard-copy": "^3.2.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### `server/package.json` (key parts)

```json
{
  "name": "ephemeral-signal",
  "private": true,
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.6.1"
  }
}
```

---

## 14. Docker-compose for coturn (simple)

(Repeat earlier sample; include STUN/TURN ports.)

---

## 15. Common troubleshooting

* WebRTC fails to connect: check STUN/TURN logs and browser console; ensure secure origins (localhost/HTTPS).
* IndexedDB not accessible in private browsing: fallback to memory buffer and warn user.
* Argon2 WASM fails to load: ensure the WASM asset path is served; fallback to PBKDF2.

---

## 16. Final notes & next steps

* Implement minimal demo first (no server relay, P2P only).
* Instrument metrics (non-sensitive) early — success rate, time to first byte, memory usage.
* Perform security review & threat modeling before public release.

---