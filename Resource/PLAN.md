# Implementation progress

Updated: 2026-11-08. Free Cloudflare test preview deployed with HTTPS/WSS and public STUN; no public TURN subscription. The security/navigation milestone and GitHub deployment automation are being verified.

| Phase                   | Status          | Evidence / next gate                                                                                                                                                                                                   |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 design               | Complete        | Rewritten PRD and guide resolve PIN limitations, portable KDF, authenticated records, bounded memory, expiry, cleanup, signaling authorization and trust boundaries                                                    |
| P1 local foundation     | Complete        | Static Next App Router, named feature components, CSS Modules/tokens, strict TS, pinned npm dependencies, local scripts and checks; Portfolio rule recorded in root AGENTS                                             |
| P2 single-file slice    | Working locally | Sender/link/PIN, memory-only signaling, encrypted WebRTC, validated download, progress, cancellation and cleanup; 0-byte, 1 MiB+17-byte and 50 MiB transfers verified in Chromium and WebKit                           |
| P3 reliability          | Open            | Configurable STUN/TURN and temporary credentials implemented; UDP/TCP relay paths verified locally. HTTPS/WSS preview deployed; public TURN, WebKit STUN-only operation, separate networks and physical devices remain |
| P4 larger product scope | Deferred        | Folders, streaming disk output, stored relay and resume                                                                                                                                                                |
| P5 public release       | Preview only    | Zero-budget test deployment authorized; production security, configured relay, device evidence, CI and operations remain                                                                                               |

## Completed verification

- Format, lint, frontend/service types, documentation links and static production build passed.
- Eighteen crypto/protocol and actual WebSocket/UDP integration tests passed, including temporary coturn credentials, admission-only issuance, fail-closed ICE settings and public WSS endpoint validation.
- All 18 Chromium/WebKit E2E tests passed with actual WebRTC and no crypto/network mocks. Downloaded sizes and SHA-256 hashes match at all three tested sizes including the 50 MiB cap in both engines. Chromium → WebKit and WebKit → Chromium also pass at 1 MiB + 17 bytes.
- Wrong-PIN retry and five-attempt view cleanup, oversized rejection, cancelled session rejection, invalid links, light/dark 320px reflow, keyboard focus and no page errors on successful transfers are covered.
- The actual in-app browser rendered the local dark-mode sender view; visually inspected its layout. This is not a physical-mobile or screen-reader audit.

## STUN/TURN implementation

- Reused coturn from the original project guide; repository files and history contain only examples, not a deployed provider or credentials.
- Kept the feature/domain, pure contracts and separate signaling-service boundaries. Peer connections now start after admission using validated server-issued ICE settings.
- Added per-peer, session-bounded coturn credentials from a server-only secret file, direct/relay policy, TURN UDP/TCP/TLS URL support, explicit public WSS configuration and matching preview CSP support.
- Added a host-specific coturn configuration template and deployment/verification guide. Local coturn 4.18.0 is installed for disposable loopback tests; no system service is enabled.
- Actual relay tests pass over UDP and TCP in both engines, including 50 MiB and both cross-engine directions. Selected candidate pairs are verified as relay pairs; WebKit omits relayProtocol, so its sole configured transport is also checked. Both engines also pass the real invalid-credential rejection test without creating a download.

## Next work

1. Verify physical Safari/iOS/Android. Local WebKit tests are now green without camera/microphone grants, privacy-disabling flags, or skipped cases; physical devices remain unverified.
2. Keep [Cloudflare preview](CLOUD.md) on Workers Free. Find a verified zero-charge TURN provider or existing user-controlled relay; do not enable paid overages. Complete WebKit/public-network and trusted TURN TLS tests, then verify two independent networks.
3. Verify GitHub deployment automation and profile mobile KDF/memory usage. Production release remains blocked on the PRD gates; the public URL is a limited test preview.

See [TESTS](TESTS.md) for commands and verification limits. Specifications moved from the repository root into Resource according to the owner's convention; no Portfolio files or secrets were changed/copied.

## Free hosting milestone

- Deployed new file2file-preview Worker to https://file2file-preview.kumarkaushik871.workers.dev on the verified Workers Free account. Existing Portfolio deployment and payment settings were untouched.
- Added same-origin HTTPS/WSS, generated CSP hashes, private in-memory Durable Object signaling, bounded sessions/messages, and an explicit STUN-only UI notice. Preserved thin routes and feature/domain ownership.
- Cloudflare TURN subscription was not activated because it permits billable overages. The officially documented public OpenRelay static-auth endpoint timed out. No working free TURN service is claimed.
- Four Worker integration tests pass locally and live. The local Chromium/WebKit regression rerun passed all 18 cases in 50.1 seconds. Existing 18 unit/service tests pass. Live Chromium project: eight tests passed, one Chromium-to-WebKit transfer failed. Passing cases include real 0-byte, 1 MiB+17-byte and 50 MiB downloads with matching SHA-256 and acknowledgement.
- A separate WebKit-to-WebKit cloud-runtime transfer timed out; live diagnostics showed host candidates only, no candidate pairs, and ICE remaining new. Public Cloudflare STUN responds to a native UDP probe, so this is not diagnosed as a universal STUN outage. The existing local/relay evidence does not prove this hosted path.

- The next no-card TURN candidate is Metered, whose current pricing lists 500 MB/month at $0. Account signup/login and dashboard quota verification are still required; no account or credentials were created. Its legacy OpenRelay page advertises a different allowance, so verify the selected plan rather than assuming 20 GB.

## Existing-domain attachment

- Created file2file-share on Cloudflare Pages through the browser and uploaded the static export. Registered share.kkos.in as an external-DNS custom domain and saved its single CNAME record in Hostinger with TTL 300. Existing root/www Vercel records and Hostinger nameservers were preserved.
- Added a Pages build with exact WSS CSP and shared exact-origin validation for both Worker and Durable Object. All 19 unit/service tests and five Worker integration tests pass; the five Worker tests also pass live, including both new frontend origins and lookalike rejection.
- Pages HTTPS responds successfully and HTTP redirects to HTTPS. Public DNS resolves the new CNAME. Custom-host HTTPS returned 200 with a trusted certificate, and browser transfer-link creation/cancellation on share.kkos.in passed.

## Security and public-information milestone

Implemented the source-review fixes, public information routes, contact mailbox, shared navigation, security.txt, connection admission budgets, browser signaling queue cap and pagehide privacy cleanup. The dependency audit now reports zero known vulnerabilities after a scoped development dependency update. All 22 unit/service tests, 22 browser tests, six Worker tests and the Pages header integration test pass under Node 26.13.0. GitHub deployment credentials are configured; the initial workflow run is the remaining publishing check. See [security review](SECURITY.md).
