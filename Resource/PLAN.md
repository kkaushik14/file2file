# Implementation progress

Updated: 2026-11-08. The security/navigation and automatic-deployment milestones are live. The current follow-up implements 8 GiB transfers, protocol v2 receive credits, public WebKit discovery fallback, and ExpressTURN Free. Final local verification passed 34 browser cases, 26 unit/service cases and separate full 8 GiB download-hash benchmarks in both engines. Hosted checks, deployment and live provider verification follow below.

| Phase                   | Status               | Evidence / next gate                                                                                                                      |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P0 design               | Complete for preview | Explicit PIN/trust limits, bounded flow control, browser-managed Blob backing, 15-minute join and 60-minute active deadlines              |
| P1 foundation           | Complete             | Portfolio conventions, named features, static Next export, separate Worker/Node services, Node 26.13.0                                    |
| P2 single-file slice    | Working              | Encryption, download integrity, cancellation; 8 GiB passed in Chromium/WebKit normal receiver profiles                                    |
| P3 reliability          | In verification      | Public DNS fallback and free relay configured; final regression/live relay checks below; physical devices and independent networks remain |
| P4 larger product scope | Deferred             | Disk streaming, resume, folders and multiple receivers need separate design and evidence                                                  |
| P5 public release       | Preview only         | Independent security review, operations, physical-device/network and sustained resource tests remain                                      |

## Current follow-up

- Version 2 authenticates receiver credits, bounds unacknowledged data to 3.75 MiB, and removes fixed polling delays. Reads use 768 KiB batches and negotiated 48 KiB records with a 12 KiB fallback. Browser progress is throttled; plaintext is batched into Blobs and mutable arrays released.
- The cap increased from 50 MiB to 8 GiB after real transfer/download hashes passed in both engines. Full-file browser backing storage is still required. Private profiles and phones can have lower practical limits; 4 GiB private-profile Chromium download failed while normal profiles passed.
- The owner approved a 60-minute active deadline starting at receiver admission. Unused links remain 15 minutes and stalled connections stop after 30 seconds. This does not slow fast transfers.
- Hosted discovery retains provider hostnames and adds fresh validated public IPv4 addresses from bounded DNS-over-HTTPS. It fixes the observed WebKit hostname-discovery failure without changing browser privacy settings.
- The owner created ExpressTURN Free (1000 GB/month, UDP/TCP 3478), approved relay-secret use, and entered the actual relay values directly in Cloudflare. No card, Premium plan or billable subscription was enabled. Live relay checks must succeed before claiming the provider works.
- CI uses 512 MiB for the large-file regression to bound runner disk use. Full 8 GiB benchmarks run separately on direct/local paths, never consuming free relay quota.

## Remaining acceptance

1. Complete final local/cloud checks and live forced-relay UDP/TCP tests after push-triggered deployment.
2. Test physical Safari/iOS/Android and Wi-Fi-to-cellular transfers in both directions. Free TURN has no TLS/443 fallback for networks blocking 3478.
3. Profile mobile memory/KDF behavior; review static relay-credential abuse and shared quota operations before production release.

## Earlier milestone history

The following sections retain the evidence at their original milestones. Their 50 MiB cap, STUN-only hosting and unresolved hosted WebKit statements describe earlier builds, superseded by the current follow-up and latest [test evidence](TESTS.md).

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

## Earlier next-work list

1. Verify physical Safari/iOS/Android. Local WebKit tests are now green without camera/microphone grants, privacy-disabling flags, or skipped cases; physical devices remain unverified.
2. Keep [Cloudflare preview](CLOUD.md) on Workers Free. Find a verified zero-charge TURN provider or existing user-controlled relay; do not enable paid overages. Complete WebKit/public-network and trusted TURN TLS tests, then verify two independent networks.
3. Profile mobile KDF/memory usage; GitHub deployment automation is verified. Production release remains blocked on the PRD gates; the public URL is a limited test preview.

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

Implemented the source-review fixes, public information routes, contact mailbox, shared navigation, security.txt, connection admission budgets, browser signaling queue cap and pagehide privacy cleanup. The dependency audit now reports zero known vulnerabilities after a scoped development dependency update. All 22 unit/service tests, 22 browser tests, six Worker tests and the Pages header integration test pass under Node 26.13.0. GitHub deployment credentials are configured and the first push-triggered workflow succeeded. See [security review](SECURITY.md).

## Published security/navigation milestone

Commit fc474c9 was pushed to main in the owner-confirmed repository. [GitHub Actions run 42416571115](https://github.com/kkaushik14/file2file/actions/runs/42416571115) passed verification and deployed both Cloudflare targets in 3 minutes 5 seconds under Node.js 26.13.0. The public endpoint check passed. Future successful main pushes follow this workflow; no paid service was activated.

The live Worker passed five functional/security integration cases; the connection-cap saturation test is intentionally local-only. On https://share.kkos.in, both targeted Chromium E2E cases passed: all information pages/navigation/contact targets at 320px in both themes, and an actual 1,048,593-byte transfer with matching SHA-256. The browser visually verified the published sender/contact page and owner-confirmed email. Hosted WebKit, physical devices and separate networks remain open.
