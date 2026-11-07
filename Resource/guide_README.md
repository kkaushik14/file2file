# Implementation guide — File2File protocol v2

Updated: 2026-11-08. Canonical P0 decisions, local development contract, and free hosted preview. See [PRD](PRD_README.md), [architecture](ARCHITECTURE.md), and [actual progress](PLAN.md).

## Development conventions and commands

Use Node 26.13.0 within major 26, npm 11.20.0, exact versions, and one lockfile. The owner's Portfolio provides the structure: static Next App Router, thin routes, feature components, CSS Modules, semantic tokens, strict TypeScript, ESLint, Prettier, and Resource documents. No Next API routes or Server Actions. A narrow Node WebSocket signaling service is a deliberate local-runtime choice; a free Cloudflare Worker provides signaling, while Cloudflare Pages serves the custom-subdomain static frontend. See [cloud setup](CLOUD.md).

```sh
npm ci
npm run dev
# frontend http://127.0.0.1:3001; signaling ws://127.0.0.1:8787; STUN 127.0.0.1:8788/udp
npm run check
npm test
npm run build
npm run test:e2e
npm run preview
```

Dev starts both processes and shuts them down together. The signaling process also owns the loopback STUN socket and closes it on shutdown. Preview serves only the exported out/ assets on port 4174; start `npm run dev:signal` separately for manual preview transfers. Browser tests start their own servers. Copy .env.example to .env only to override settings. Never read the Portfolio .env or copy its secrets.

## Protocol and key hierarchy

Protocol version is 2. Version 1 links are intentionally rejected; create a new link after updating both tabs. All random values use WebCrypto's CSPRNG. Reject unknown versions and malformed/oversized input before key derivation. Six/eight numeric digits only; cap fragment at 4096 characters. Maximum file is 8,589,934,592 bytes; plaintext chunk is 49,152 bytes when negotiated SCTP maxMessageSize permits, otherwise 12,288 bytes. Integers are nonnegative safe integers with explicit bounds.

1. The sender opens signaling and requests a session. The server returns a random 128-bit id, 256-bit receiver admission token, and an absolute join deadline (15 minutes). After one receiver is admitted, the server replaces the session timer with a 60-minute active deadline and issues matching ICE lifetimes. Joined/paired messages carry the active expiresAt; both browsers replace their cleanup timers, and the sender removes the now-claimed link from view. The encrypted URL envelope retains its original 15-minute join deadline and cannot be extended or reused by this change. The creating WebSocket owns cancellation; it cannot reattach. Admission tokens authorize signaling, not decryption.
2. Browser generates a fresh 32-byte file root key and 32-byte URL secret. PBKDF2-HMAC-SHA256 uses 600,000 iterations, a fresh 16-byte salt, and input `base64url(secret) + ':' + PIN`. Derive an AES-256-GCM wrapping key. This portable profile is fixed for both desktop and mobile. Do not fallback to a different KDF on the receiving device.
3. AES-GCM wraps JSON `{key, admission}` with a fresh 12-byte IV and 128-bit tag. AAD is UTF-8 JSON array `["file2file",2,"wrap",id,expiresAt]`. The receiver admission token is inside the encrypted envelope; knowing the transfer id or URL without its PIN does not admit a receiver through the standard flow.
4. Link format is `/receive/#<base64url(UTF8(JSON envelope))>`. Envelope fields are `{v,id,expiresAt,kdf,salt,iv,secret,wrapped}`; kdf is exactly `PBKDF2-SHA256-600000`. A static /receive/ route avoids runtime dynamic-route hosting. The public id also remains in the fragment to reduce URL logs. Decode into memory and immediately remove the fragment with replaceState. No analytics, browser storage, or service worker.
5. HKDF-SHA256 derives separate AES-256-GCM `sender` and `receiver` keys from the file root, salt UTF-8 transfer id, and info `file2file:v2:<direction>`. Never reuse a file root for another session. Non-extractable working keys are retained only in memory.
6. Each binary encrypted record is a big-endian uint32 sequence followed by AES-GCM ciphertext/tag. IV is 12 bytes: eight zero bytes plus that uint32. AAD is UTF-8 JSON `["file2file",2,id,direction,sequence]`. Sequence numbers never repeat under a directional key; there is no retry/resume with the same key. Maximum record is chunk size + 20 bytes.

The fixed PBKDF2 work factor is a compatibility/security baseline, not proof that short PINs resist offline guessing. Benchmark low-end devices before release. A future KDF or changed wire parameters requires a new protocol version and test vectors; never silently downgrade.

## Authenticated records and transport

Use an ordered, reliable DataChannel. On open the receiver sends encrypted `{type:"ready"}` as receiver sequence 0, proving possession of the root key. Only then may the sender transmit. Sender sequence 0 is encrypted manifest `{type:"manifest",name,size,chunkSize,chunks}`. Subsequent records 1..N are raw plaintext file chunks encrypted independently. Sequence N+1 is encrypted `{type:"complete",size,chunks}`. Receiver sequences 1 onward are encrypted `{type:"progress",received}` after each 96 KiB of payload is verified; the next sequence is `{type:"ack",size}` only after authenticated completion. The sender allows at most 3.75 MiB of unacknowledged payload and validates exact monotonically advancing credits against bytes sent. Its control queue remains independent of the sending task, so waiting for credit cannot deadlock acknowledgement processing. Future, duplicate, out-of-order or malformed credit fails closed. A 30-second stall, cancellation or expiry ends the wait. The 8 MiB malicious-input queue limit remains independent. Acknowledgement means verified in browser, not saved to disk.

Validate manifest before allocation: name length <=255, exact chunk size, integer size <=8 GiB, chunks exactly ceil(size/chunkSize). Empty file has zero chunks and still requires completion. Enforce exact next sequence and expected length of every chunk including the last. Manifest and authenticated completion bind total count/size, so a truncated suffix cannot become a successful download. The ordered authenticated sequence determines the file; matching whole-file hashes are checked in E2E tests, not transmitted as an unauthenticated substitute.

Check negotiated `pc.sctp.maxMessageSize` before sending each record. V2's small records avoid typical limits; if a peer's limit is smaller, fail clearly rather than sending an invalid record. A later protocol may add transport fragmentation. High-water send buffering is 256 KiB, low-water is 64 KiB. Wait on native bufferedamountlow or authenticated receive credit, without fixed polling pauses; bound each wait to 30 seconds, and check cancellation after every await. Bound queued incoming bytes to 8 MiB and fail closed when exceeded.

No file, filename, ciphertext record, PIN, envelope, or root key travels through signaling. Signaling coordinates admission, issues temporary TURN credentials when configured, and routes validated SDP and ICE. Payload cap 32 KiB, candidate length cap 4096, SDP cap 24 KiB, per-socket message budget, global socket/session caps, initial admission deadline, heartbeat, exact Origin allowlist, and session timers bound the local service. Server holds admission token hashes and expiry in memory. Socket closure removes the entire session. Reject second receivers and unauthenticated signaling/cancel messages. Error responses use generic unavailability for missing/expired/invalid admissions. No payload or URL logging.

## Lifecycle and cleanup

Sender and receiver retain local expiry timers independent of server availability. Connection establishment has a 30-second deadline; transfers have a 30-second inactivity deadline. Either peer closing/cancelling causes terminal cleanup. No reconnection/reuse; create a new link. On verified ack the sender closes signaling; receiver retains only the verified Blob/object URL until Clear/navigation/expiry. It must tolerate that expected close after completion without deleting the ready download early.

Wrong PIN: no network request or data caching, show generic unlock error, zero transient byte buffers where practical, and retain the envelope for up to five local attempts with 0.5/1/2/4-second delays. Fifth failure clears the envelope and PIN. This is a view-level policy, not protection against offline guessing. Other terminal failure: close sockets/channels/peer, cancel timers, release file/key/array references, clear link/PIN, revoke object URLs, and show the failure. No automatic hidden redirect.

The app uses no IndexedDB, local/session storage, Cache Storage, or service worker. Future persistent ciphertext caching must implement an event-backed Promise around deleteDatabase, handle onblocked/onerror/onsuccess, coordinate all connections, and sweep expired stores on startup. Awaiting IDBOpenDBRequest directly is incorrect. There is no atomic transaction spanning these storage systems, and app deletion is not a forensic wipe guarantee.

## Network and configuration

Default bind is loopback and exact development origins only. In the default `TRANSFER_NETWORK=local` mode, signaling supplies `stun:127.0.0.1:8788` to both peers on admission. The signaling process starts an IPv4 UDP Binding responder on that fixed loopback address; it never binds to the public signaling host. It provides same-machine candidate discovery, not TURN, file relay, or internet NAT traversal. There is no third-party ICE service in the default configuration. For cross-network mode, set `TRANSFER_NETWORK=turn`: signaling supplies configured STUN/TURN URLs and separate temporary credentials for each admitted peer. See [network configuration](NETWORK.md) for the exact environment, coturn template, tests and host requirements.

This fixes the observed WebKit path: SDP and mDNS (`.local`) host candidates were accepted, but no remote candidates/candidate pair appeared and ICE remained `new`. A real loopback STUN response produced server-reflexive candidates and allowed the encrypted channel to open. This evidence identifies the failed discovery path; it does not establish why the host's mDNS resolution failed or prove every Safari/device configuration works. Preserve the existing end-of-candidates signaling and already-open receiver-channel guard.

The helper supports only unauthenticated IPv4 Binding requests, echoes the transaction ID, and returns XOR-MAPPED-ADDRESS from the actual UDP source. It bounds packet size/rate, validates lengths and supplied fingerprints, and ignores unsupported required attributes/methods. It stores no sessions or transfer data and logs no requests. It is deliberately not a general-purpose STUN server; use maintained infrastructure for hosted STUN/TURN.

Run `npm run dev` or, for the static preview, `npm run preview` plus `npm run dev:signal`. Both TCP 8787 and UDP 8788 must be free. A bind failure stops the service rather than silently starting without discovery. Allow local-network access when prompted; Chromium tests grant that permission in disposable contexts. Tests do not request camera/microphone permission or disable candidate privacy. Run the complete Chromium/WebKit suite with `npm run test:e2e`; see [TESTS](TESTS.md) for observed coverage and device limits.

A remote frontend must explicitly set NEXT_PUBLIC_SIGNAL_URL (build:cloud selects same-origin for the Worker); an explicitly configured WSS endpoint also overrides the loopback default for local debugging. Temporary credential issuance is implemented. The Worker provides same-origin HTTPS/WSS with an exact Origin check. A reachable hosted relay is still required for reliable cross-network operation. Never embed durable TURN secrets into NEXT_PUBLIC variables. The initial transport does not include stored relay or resume.

The project-selected coturn setup now has a [host configuration template](../services/turn/coturn.conf.example). It requires real public/private address mapping, shared-secret authentication, trusted TLS certificates and relay port/firewall allocation. No configured host or credentials were found in the project or its Git history. The local harness proves real UDP/TCP relay behavior; public TLS and two-network operation remain deployment acceptance gates.

If adding stored relay later, enforce authorization expiry on every request, independently of physical deletion. Add bounded uploads, distinct read/write/delete capabilities, periodic deletion retries, orphan sweeps, versioned-object cleanup, and no backups of transfer payloads. Provider lifecycle rules alone are asynchronous and do not implement a strict deletion deadline.

## Release acceptance and sources

Use [TESTS](TESTS.md). Automated local success does not certify browser erasure, safe public hosting, NAT traversal, physical mobile support, or independent cryptographic review. Measure KDF latency, memory peak and transfer behavior at the cap before increasing it. Public provisioning/deployment still requires an actual selected host and the owner's deployment request.

- [Next static export](https://nextjs.org/docs/app/guides/static-exports): supports the static frontend/separate-service boundary.
- [WebCrypto specification](https://www.w3.org/TR/webcrypto/): AES-GCM, PBKDF2, HKDF API definitions.
- [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): PBKDF2 SHA-256 baseline; not a guarantee for short PINs.
- [STUN RFC 8489](https://www.rfc-editor.org/rfc/rfc8489.html#section-14.2): Binding responses and XOR-MAPPED-ADDRESS encoding.
- [WebRTC specification](https://www.w3.org/TR/webrtc/): negotiated message size, buffering and channel lifecycle.
- [IndexedDB specification](https://www.w3.org/TR/IndexedDB/): asynchronous deletion and blocked connections.
- [S3 expiration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html): asynchronous deletion and object-version behavior.

## Public pages and abuse limits

Thin App Router files compose named information feature views, with shared InformationPage styling and SiteNavigation. Terms and conditions have one canonical /terms/ page. Public security reporting uses /.well-known/security.txt. Keep its expiry current.

ConnectionBudget is a pure cross-runtime contract limiting each transport-derived IP to 8 active connections and 60 upgrades per minute, with at most 1,000 records. Node releases on underlying transport close; Worker releases on close/error. Browser signaling queues are bounded to 128 messages/256 KiB; Worker queues use UTF-8 byte counts. Pagehide clears React state and references separately from effect cleanup, preserving development StrictMode initialization.

See [security review](SECURITY.md) for the scoped minimatch override, residual risks, policy scope and operational follow-up.

## Hosted discovery and free relay

The hosted Worker resolves only the fixed public Cloudflare STUN and ExpressTURN hostnames through Cloudflare DNS-over-HTTPS. A bounded 8 KiB response, two-second timeout, at most two public IPv4 records, DNS TTL capped at five minutes, and a 30-second failure retry bound discovery. Retain original hostnames for normal/IPv6 resolution; add fresh IPv4 URLs for WebKit implementations that fail hostname discovery. No user-controlled DNS target, candidate rewriting, camera permission or disabled browser privacy protection is involved. Re-check socket/session validity after asynchronous discovery before pairing.

ExpressTURN Free uses long-lived provider username/password credentials, explicitly tagged credentialMode=static in the ICE contract. This is distinct from the local coturn HMAC/expiry contract; untagged credentials still require coturn validation. TURN_USERNAME and TURN_PASSWORD are Worker secrets only. Missing both retains STUN; incomplete or malformed relay settings fail closed. Credentials are issued only after receiver admission, never on create or health responses. The active-transfer expiresAt limits app use, not the provider credential's validity. An admitted peer can extract and reuse static credentials; provider rotation/revocation and quota controls are required. Default all policy conserves relay quota; relay policy is for controlled route verification. No provider account password is used by the app.

Receiver plaintext arrays are converted into immutable Blob batches at approximately 1 MiB, then zeroed and released. The final Blob is offered only after authenticated completion; cancellation releases every partial batch/reference. The browser owns up to the file ceiling in backing data and can use memory or temporary disk. This is not constant-memory streaming to a user-selected file or guaranteed erasure. Sender reads 768 KiB batches and uses negotiated 48 KiB or fallback 12 KiB encrypted wire records; both progress views update at most roughly ten times per second. Larger caps require actual downloaded-hash tests in both engines, memory/device measurements and a session-duration review, not just a changed constant.
