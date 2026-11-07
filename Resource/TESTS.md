# Verification contract and evidence

Updated: 2026-11-08. Local and limited live-preview checks, not a production-security certification.

## Current protocol-v2 verification

Node.js 26.13.0 / npm 11.20.0. The final scheduling change uses an event-driven 3.75 MiB receive window. Unit/service tests: **26 passed**; dependency audit: **zero known vulnerabilities**. The complete local browser suite passed **34/34** in 2.2 minutes with a 512 MiB benchmark per engine. The 512 MiB verified/downloaded-and-hashed times were 25.992/26.889 seconds in Chromium and 18.000/18.846 seconds in WebKit. These local results are not internet-speed guarantees. Formatting, lint, frontend/service/Worker types, documentation links and the static build also passed. A clean rebuild removed stale duplicate generated Next type files; no source typing exception was introduced. Hosting and live deployment results follow below.

The browser suite now covers authenticated future/repeated credit rejection, deliberately slow receiving/decryption, cancellation while sending, and the separate active deadline. Successful cases retain native WebCrypto/WebRTC and verify real downloaded SHA-256. Old v1 links are rejected; create fresh links after updating both tabs.

Before the final event-driven scheduling change, actual streamed fixtures passed:

| Size  | Chromium verified / downloaded and hashed | WebKit verified / downloaded and hashed | Conditions                                                                                                  |
| ----- | ----------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2 GiB | 82.454 s / 105.641 s                      | 83.280 s / 104.055 s                    | Private receiver contexts, engines sequential; aggregate sampled browser RSS peaked at 628 MiB              |
| 4 GiB | 162.319 s / 192.315 s                     | 203.952 s / 228.162 s                   | Normal receiver profiles, engines concurrent; aggregate sampled RSS 1912 MiB                                |
| 8 GiB | 330.246 s / 408.720 s                     | 504.232 s / 551.650 s                   | Normal receiver profiles; other tests overlapped, so functional evidence, not a clean comparative benchmark |

All rows downloaded the complete file and matched SHA-256. RSS sampling excludes swapped/browser backing data and does not establish mobile support or constant memory. A prior Chromium 4 GiB private-profile download was canceled after verification; normal profiles passed. Browser quota/storage limits are a practical constraint, not an established universal private-mode maximum. The 8 GiB cap is the largest tested value, not a claim that every device can handle it.

Run a bounded regression with `LARGE_TEST_BYTES=536870912 npm run test:e2e`. Run the full-cap benchmark with `npm run test:e2e -- --grep 'large-file benchmark'` (requires sufficient local temporary disk; regular receiver profiles are selected above 2 GiB). Keep these runs sequential, without other browser benchmarks. CI uses 512 MiB to avoid exhausting hosted-runner disk; a CI pass alone does not prove 8 GiB support.

Hosted STUN diagnosis found WebKit did not gather usable server-reflexive candidates from public hostnames, while freshly resolved IPv4 endpoints worked. The bounded DNS fallback passed six actual hosted-runtime transfers (1 MiB+17, both cross-engine directions, slow receivers) before the final scheduling change. Final hosted/relay evidence follows below. No camera/microphone grants, rewritten candidates or privacy-disabling flags are used.

## Final large-file and release checks

The final event-driven implementation passed a real **8 GiB Chromium transfer** with a normal receiver profile: verified receipt in **202.100 seconds**, full download and matching SHA-256 in **252.067 seconds**. WebKit also passed at **253.954 seconds** to verified receipt and **301.588 seconds** through the complete matching download hash. Both engines ran sequentially on the local direct path; the full run passed **2/2** in 9.9 minutes. Sampled aggregate browser RSS peaked at **1137 MiB**, excluding swapped/backing data. Normal desktop receiver profiles were used; these are not physical Safari/mobile measurements. This run is not a controlled comparison to the earlier concurrent benchmarks and does not establish a universal internet rate.

Final cloud build and Worker types passed; **7/7 Worker integration tests** passed. The hosted browser selection passed all six transfer cases (1 MiB+17, cross-engine and deliberately slow receiver in each engine). Chromium information-page checks passed; WebKit exposed an intermittent background RSC-prefetch access-control error during rapid page changes (reproduced twice in three diagnostic runs). Disabling speculative prefetch on the three Next Link entry points removed that error: **3/3 repeated WebKit information-page runs passed**, with the no-page-errors assertion retained. No transfer protocol changes followed the final 8 GiB benchmark.

The final Pages build, its security-header integration test, format/lint/frontend/service/Worker type checks, documentation links and diff-whitespace check all passed before publication. Public relay checks require the deployed Worker secrets and are recorded after deployment.

## Published protocol-v2 update

Commit 99cc86c was pushed to main and deployed by [GitHub Actions run 42424098488](https://github.com/kkaushik14/file2file/actions/runs/42424098488). The first CI attempt passed 33/34 browser cases but timed out on Linux WebKit → Chromium. An unchanged rerun passed the complete verification and both deployments; the cause of that single timeout is not established and the failure is retained here. No cases were skipped, and no app timeout was relaxed. Node.js 26.13.0 remains pinned.

The deployed custom frontend, all information pages, security.txt and relay-enabled Worker health passed the live endpoint check. Actual UDP-only public ExpressTURN tests passed **4/4** in 1.6 minutes: Chromium, WebKit and both cross-engine directions, each with a 1 MiB+17-byte download and matching SHA-256. Native selected candidates were relays; Chromium confirmed UDP and both engines used only UDP TURN URLs. Test-case durations including setup were 17.9–29.1 seconds, far slower than the local direct path. Do not promise fast multi-GiB relaying from this evidence.

The initial UDP run passed both WebKit-led cases; Chromium-led cases reached 80% and 66% before the old 30-second assertion deadline. The hosted forced-relay harness now allows 120 seconds for active completion and 180 seconds per case. The app's independent 30-second inactivity limit remains unchanged. The complete rerun passed; the higher test deadline does not bypass file integrity or native relay-route checks.

TCP-only public relay verification also passed **4/4** in 1.7 minutes, with the same downloaded-hash and native relay-pair checks. Case durations including setup were 14.5–30.0 seconds. UDP and TCP use port 3478; no free TLS/443 capability is claimed. All tests ran from one computer/network against the actual public relay, not two independent physical networks. No multi-GiB test consumed provider quota. The actual relay secrets were entered by the owner directly in Cloudflare and never copied into the repository or logs.

Post-deploy signaling verification passed five public functional/security cases and the separate local synthetic-credential case. The socket-saturation case was intentionally skipped on the live service and had passed locally. Published information-page/navigation/contact/mobile-reflow checks passed **2/2** in Chromium and WebKit (7.2 seconds), including no page errors. The follow-up evidence/test-harness-only commit uses [skip ci] because it does not alter deployed application assets or Worker code; later ordinary main pushes still verify and deploy automatically.

## Earlier milestone evidence

The sections below record earlier builds in order, including their failures and limitations. Their 50 MiB cap and unresolved hosted WebKit status are historical; use the current protocol-v2 results above and final results below for this update.

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
