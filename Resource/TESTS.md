# Verification contract and evidence

Updated: 2026-11-08. Local and limited live-preview checks, not a production-security certification.

| Command            | Observed result                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`    | Passed: formatting, ESLint, strict frontend/service types and documentation links                                                                      |
| `npm test`         | 22 passed: crypto/protocol, real sockets, temporary TURN credentials, admission and WSS/ICE validation                                                 |
| `npm run build`    | Passed: static home, receive, five information pages and not-found output                                                                              |
| `npm run test:e2e` | 22 passed under Node 26.13.0 in 1.8 minutes: 11 Chromium and 11 WebKit, including both cross-engine directions and privacy lifecycle; no skipped cases |

## TURN verification

The project selected coturn in its original guide; no live provider configuration was found. The disposable harness uses installed coturn 4.18.0 on loopback only, with fresh temporary shared secrets and forced relay policy. `npm run test:e2e:turn -- udp` passed all 8 transfer cases in 36.6 seconds. `npm run test:e2e:turn -- tcp` passed all 8 in 22.6 seconds. Both runs cover empty, 1 MiB + 17-byte and 50 MiB files in Chromium and WebKit and both cross-engine directions. Download hashes/sizes/filenames and sender acknowledgement match.

Native stats confirm the selected local and remote candidates are relay candidates. Chromium also confirms relayProtocol UDP/TCP. The first test run completed transfers but failed its overly broad expectation that WebKit also exposes relayProtocol; WebKit omits it. The corrected assertion still requires real selected relay pairs, relay-only policy and exactly one configured transport, with the protocol-field check retained for Chromium. No candidate rewriting, encryption mocks or privacy-disabling flags are used.

Unit/service tests verify distinct peer usernames, coturn HMAC credentials, session expiry plus 60-second skew allowance, invalid/missing settings, and no credential issuance on session creation, wrong admission, second receiver or arbitrary requests. `npm run test:e2e:turn -- udp --invalid-credentials` passed both browser cases: the real relay rejected incorrectly signed credentials, the app reached a terminal error, and no Save action or sender success appeared.

TURN TLS URLs and the host template are implemented, but trusted TLS, public DNS/firewall/NAT mapping, provider operation and two independent networks are not verified. See [network setup](NETWORK.md) for exact settings and acceptance steps. Local tests do not establish cross-network production availability.

## Verified behavior

Unit/service checks cover correct and wrong PIN; wrapped expiry tampering; unsupported KDF; malformed/expired links; record ciphertext tampering; cross-session/direction replay; wrong/duplicate sequence; missing chunks/completion; invalid last-chunk length; empty files; manifest/size/filename limits; receiver disposal; admission, second receiver, foreign Origin, expiry, cancellation and unauthenticated signaling. Real UDP tests verify the STUN source port/address, transaction echo, loopback binding, valid fingerprint, and rejection of malformed lengths/cookies/attributes/fingerprints, oversized packets and TURN Allocate requests.

Chromium and WebKit E2E use the production static export and actual local signaling, WebCrypto, WebRTC and browser downloads. Independent browser contexts in each engine transfer 0 bytes, 1,048,593 bytes, and 52,428,800 bytes; downloaded sizes and SHA-256 hashes match. Further cases verify correct-PIN retry after failure, five failed attempts clearing the view without claiming the session, rejection of 50 MiB + 1 byte, cancelled links, invalid links, light/dark 320px reflow and keyboard access. Successful transfers produced no page errors. Additional separate-browser tests transfer 1,048,593 bytes in both Chromium → WebKit and WebKit → Chromium directions, with matching downloaded sizes, SHA-256 hashes, filenames and sender acknowledgements.

Large fixtures are generated under ignored test-results/ and passed as file paths because Playwright limits inline buffers. Do not use real confidential files in tests. Tracing is off; failure screenshots may include synthetic test links. Both local test servers shut down after the suite.

## WebKit diagnosis and fix

Before this change, WebKit exchanged SDP and mDNS (`.local`) host candidates. Native `addIceCandidate` calls resolved, but stats showed no remote candidates/candidate pairs, ICE stayed `new`, and SCTP stayed `connecting`. The failing path was candidate discovery rather than PIN derivation or encrypted record handling. A loopback STUN probe produced server-reflexive candidates, ICE connected, and the real encrypted transfer completed. The app now uses the same discovery path via the signaling process's loopback-only UDP 8788 helper. No file bytes, credentials or transfer secrets go to STUN.

The initial Chromium run needed explicit local-network permission. Test contexts grant that permission only to Chromium; normal users may need to accept their browser's prompt. WebKit needs no added permissions in these passing tests. Neither engine uses camera/microphone grants, fake media, candidate rewriting or flags that disable privacy restrictions. End-of-candidates signaling and already-open channel handling remain intact. Safari uses Option/Alt+Tab for links under its default keyboard-navigation preference.

This is evidence for the local discovery fix, not proof of the underlying operating-system mDNS failure or universal Safari support. The bundled Playwright WebKit engine is not the shipping Safari app. Physical Safari/iOS/Android, different networks with maintained STUN/TURN, screen readers/forced colors/zoom, resource and KDF latency profiling at the cap, load/abuse testing and independent security review remain release gates. The loopback Binding helper is for same-machine use only. The 50 MiB functional test is not a peak-memory benchmark. Tests cannot prove forensic erasure or make client attempt counters an attacker limit.

The previous visual check showed the local dark-mode sender in the in-app browser with readable fields and explanatory copy. The TURN change updates explanatory copy to describe optional encrypted relaying; it is not a new physical-mobile or screen-reader audit.

## Cloudflare preview verification

The cloud build and Worker type check pass. Four real Worker integration tests pass both in the local Cloudflare runtime and against the deployed HTTPS/WSS endpoint. They verify static route/security headers, public HTTP-to-HTTPS redirect and insecure WebSocket rejection on the live endpoint, truthful no-relay health status, rejected foreign origins, admission-only ICE, rejected wrong/second receivers, signal ownership, cancellation/stale links, disconnect cleanup, and binary/oversized/unauthenticated message rejection. `npm test` now passes 18 tests, including same-origin endpoint validation and fail-closed public-STUN configuration.

`CLOUD_TEST_URL=https://file2file-preview.kumarkaushik871.workers.dev npm run test:e2e:cloud -- --project chromium` ran all nine Chromium-project cases: eight passed, one failed. The passing cases include actual 0-byte, 1 MiB + 17-byte and 50 MiB encrypted transfers with matching downloaded SHA-256, size, filename and sender acknowledgement, plus PIN retry/attempt cleanup, size rejection, cancellation and responsive keyboard checks. The failed case is Chromium sending to WebKit; it timed out without a Save action. These browser contexts ran on one computer/network, not separate physical networks.

A targeted local Worker run of the 1 MiB + 17-byte case passed in Chromium and failed in WebKit. Live WebKit-to-WebKit diagnostics gathered only host candidates, no candidate pairs, and ICE remained new after ten seconds; no download appeared. A native UDP probe of stun.cloudflare.com:3478 succeeded. The hosted WebKit discovery path remains unresolved; no tests were skipped or altered to hide it, and the full cloud suite is not green. The local Node/loopback-STUN and coturn suites are separate evidence.

Cloudflare TURN signup was inspected but not activated: its automatically renewing usage subscription includes overage charges, contrary to zero budget. The public Metered OpenRelay static-auth TCP/443 probe timed out. No public TURN/TLS or independent-network transfer is verified. See [cloud operations](CLOUD.md) for reproducible commands and limits.

The final local regression rerun passed all 18 Chromium/WebKit cases in 50.1 seconds, including both cross-engine directions. This confirms the local discovery fix remains intact; it does not resolve the hosted WebKit failure.

## Custom-subdomain setup

The Pages build and all format/lint/frontend/service/Worker type checks pass. All 19 unit/service tests pass, including rejection of insecure, parent-domain, lookalike and arbitrary Pages origins. Five Worker integration tests pass locally and live, including creation/cancellation from the exact custom-domain and Pages origins.

Cloudflare Pages serves the static export with the generated script-hash CSP, exact WSS connect-src, no-store, no-referrer, HSTS and other security headers. HTTP on pages.dev redirects to HTTPS. The actual in-app browser rendered the Pages sender, created a synthetic encrypted transfer link through the Worker, reached Waiting for the receiver, and cancelled the test cleanly. No new cross-network or hosted WebKit transfer success is claimed.

Hostinger saved CNAME share → file2file-share.pages.dev with TTL 300 through the browser. Cloudflare and Google public DNS resolvers return that CNAME. The existing root A and www CNAME still return their original Vercel values. Custom-host HTTP redirects to HTTPS. After certificate provisioning completed, https://share.kkos.in returned 200 with a trusted certificate and the intended headers. The actual browser loaded this exact host, created a synthetic encrypted transfer link on the same hostname through WSS, reached Waiting for the receiver, and cancelled cleanly. No browser security warning was bypassed. Full cross-network transfer and hosted WebKit limitations remain unchanged.

## Security/navigation milestone verification

All current checks were run with the official checksum-verified Node.js **26.13.0**, npm **11.20.0**, and @types/node **26.6.6**. A stale generated Next type file initially failed type checking; the clean production rebuild removed it and the complete check subsequently passed. No source type-check exception was added.

- `npm run check`: passed formatting, ESLint, frontend/service types and documentation links.
- `npm test`: **22 passed**, including the bounded per-address connection budget, rate-window recovery, idempotent release, and actual WebSocket rejection/recovery.
- `npm run build` and `npm run test:e2e`: **22 passed** in 1.8 minutes. Both engines transfer 0 bytes, 1 MiB + 17 bytes and 50 MiB, with matching SHA-256; cross-engine transfers pass. New coverage verifies all five pages, current navigation, contact targets, 320px light/dark reflow, pagehide restoration clearing PIN/link/file input, revoked-session admission, and completed-download UI cleanup. Initial test-only failures from an ambiguous Next alert selector and same-document fragment navigation were corrected and the entire suite rerun.
- `npm run build:cloud`, `npm run typecheck:cloud`, `npm run test:cloud`: **6 passed**, including headers on every information route and the per-address socket cap.
- `npm run build:pages`, `npm run test:pages`: **1 integration test passed** across all public HTML routes, unknown-page fallback and security.txt in the actual local Pages runtime. Each route permits its own inline hashes, excludes unsafe-inline, and replaces the fallback CSP rather than combining conflicting policies. The build rejects header lines over 2,000 characters or more than 100 rules.
- Dependency installation audit: **zero known vulnerabilities**, after the scoped minimatch 11.0.1 override.
- Browser visual review: local desktop sender and Help page inspected; no layout obstruction observed. The automated mobile checks are not a physical-device or screen-reader audit.

The GitHub deployment workflow runs these checks before production deployment. Its first actual run and live endpoint evidence are recorded below; local checks alone do not prove automatic deployment is configured. No new hosted WebKit, public TURN, physical-device or two-network success is claimed.

## Deployed verification

[Push-triggered workflow 42416571115](https://github.com/kkaushik14/file2file/actions/runs/42416571115) completed successfully for fc474c9: verify took 2m15s and deploy took 45s, total 3m5s. Node.js 26.13.0 was selected from .nvmrc. Both Worker and Pages deployment steps and the live endpoint smoke check passed.

Post-deploy `CLOUD_TEST_URL=https://file2file-preview.kumarkaushik871.workers.dev npm run test:cloud` passed **5** cases; the saturation case is deliberately skipped on public hosting and passed locally. `CLOUD_TEST_URL=https://share.kkos.in npm run test:e2e:cloud -- --project chromium --grep '1048593 bytes|information pages'` passed **2** cases in 9.4 seconds. This verifies real encryption/WebRTC/download integrity on the custom host and the five public information routes, navigation and mail links. It is one computer/network, not a two-network test.

The browser also displayed the successful workflow and live sender/contact pages. The final documentation-only evidence commit uses GitHub's [skip ci] marker to avoid a redundant deployment of identical application code; later ordinary main pushes still run the workflow.
