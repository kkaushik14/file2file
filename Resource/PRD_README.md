# Product requirements — File2File

Updated: 2026-11-08. P0 decisions accepted; free hosted testing is authorized under a strict zero budget. These replace the original zero-storage/instant-download/secure-wipe claims.

## Purpose and first milestone

Share one file between two browsers over a direct connection or encrypted TURN relay with application-layer encryption and a separately communicated PIN. No account or server-side file storage. The sender keeps the tab open until the receiver verifies the complete file. The frontend follows the owner's static Next.js Portfolio conventions; a separate, narrow signaling service coordinates WebRTC.

Protocol v2 supports one file of 0–8 GiB, one receiver, a 15-minute join deadline and a separate 60-minute maximum active transfer from admission, and a 6- or 8-digit PIN. A new session is needed after cancellation, expiry, connection failure, or a receiver disconnect. Folders, ZIP, resume, multiple receivers, persistent relay, and production release are later milestones. A public test preview on Cloudflare Free and a free share.kkos.in subdomain attached through Hostinger DNS are in scope; paid plans, usage-overage subscriptions, and domain purchases are not authorized.

## Security and trust decisions

- Generate a fresh 256-bit file root key and a separate 256-bit URL secret per transfer. Encrypt metadata, file chunks, and completion records in the browser. No file content, name, PIN, URL secret, or file key enters signaling.
- The PIN is an additional barrier, not strong authentication against someone holding the complete link. That person can test PIN guesses offline against its wrapped key. A local five-attempt limit is a UX policy only and can be bypassed. Send the PIN through a separate channel; do not describe this as MFA or guaranteed brute-force protection.
- Signaling is untrusted for confidentiality and may deny service. The application origin and delivered JavaScript, browser, operating system, and extensions remain trusted. A compromised host can replace JavaScript and steal secrets. P2P exposes peer network addresses; signaling observes connection metadata. STUN sees discovery addresses/ports. TURN forwards encrypted packets and observes network metadata but receives no file keys or plaintext and does not store transfer files.
- Session expiry stops access through the cooperative application/server; it cannot revoke a file or link material already copied. A receiver can keep the downloaded file. One receiver means one claimed session, not DRM.
- Browser cleanup means stop work, close transports, release references, revoke object URLs, and remove link secrets from the visible URL. JavaScript garbage collection and physical storage erasure are not verifiable. Never claim forensic secure wipe.

## Requirements and acceptance

| ID    | Requirement              | Acceptance                                                                                                                                                                                                                                 |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-01 | Select one file          | Reject folders and files above 8 GiB before creating a session; allow empty files                                                                                                                                                          |
| FR-02 | Share link and PIN       | Accept exactly 6 or 8 numeric digits; copy a full link; show expiry and keep-tab-open guidance                                                                                                                                             |
| FR-03 | Unlock before receiving  | Parse and validate the link locally; derive its declared key profile; wrong PIN receives no file bytes and does not claim a receiver slot                                                                                                  |
| FR-04 | Retry policy             | Allow five failed unlocks in the current view; delays of 0.5, 1, 2, and 4 seconds; final failure releases link material and requires a fresh page/link. State explicitly this is not an attacker limit                                     |
| FR-05 | Encrypted transport      | Signaling routes bounded offer/answer/ICE messages and supplies validated temporary coturn or explicit static provider credentials after admission; data uses an ordered reliable WebRTC channel                                           |
| FR-06 | Integrity and completion | Authenticate manifest, sequential chunks, expected size/count, and terminal completion; no download before all checks pass; tampering, reordering, duplicates, or truncation fail closed                                                   |
| FR-07 | Bounded resources        | At most one file per view; bounded transport buffers; 8 GiB receiver payload ceiling plus browser/Blob overhead; reject oversized inbound records before decryption                                                                        |
| FR-08 | Clear lifecycle          | Show waiting, connecting, transferring, verified, unavailable, expired, and cancelled states; cancel releases both peers' sessions                                                                                                         |
| FR-09 | Download                 | Offer an explicit Save file action only after verification; sanitize filenames; treat content as an opaque download, never render it                                                                                                       |
| FR-10 | Ephemeral sessions       | Server deletes session on expiry, disconnect, cancellation, or verified completion. Restart loses all sessions. No persistence or analytics                                                                                                |
| FR-11 | Accessible UI            | Keyboard-operable labeled fields, visible focus, live status/error feedback, 44px actions, 320px reflow, system light/dark colors, reduced-motion behavior                                                                                 |
| FR-12 | Honest network support   | Local mode uses loopback STUN; the hosted preview supports public STUN plus ExpressTURN Free on UDP/TCP 3478. Static credentials and free quota/port limitations are disclosed; physical-device/two-network reliability needs verification |

## Flow and state model

Sender: idle → preparing → waiting → connecting → sending → awaiting receiver verification → complete.

Receiver: awaiting PIN → unlocking → connecting → receiving → verifying completion → ready to save.

Wrong PIN returns to awaiting PIN with backoff; fifth wrong attempt locks that view. Terminal protocol/network errors, cancel, and expiry stop the session and clear retained transfer data. Navigation and page disposal cancel. A verified receiver download remains available until Clear, navigation, or the active-transfer deadline (or the join deadline before admission), whichever happens first; a saved OS download remains outside the app's control.

The current milestone intentionally defers pre-PIN ciphertext caching: unlock is sequential and occurs before admission/transfer. This removes the earlier contradictory parallel state machine and makes memory and failure semantics simpler.

## Performance and compatibility

Fast large-file delivery is an explicit priority. Start streaming after admission without uploading a complete copy to a server. Prefer direct ICE paths, use negotiated record sizes and batched reads, and keep the sender moving within authenticated receiver credit instead of fixed polling pauses. The 60-minute deadline is a failure boundary, not a target duration. Record both time to verified receipt and time to downloaded-hash completion, with file size, browser, route and test conditions. Do not advertise local benchmark speeds as internet guarantees.

The minimum payload time is file bits divided by the slowest usable upload/download/relay rate, before setup and protocol overhead. For example, 8 GiB at 100 Mbit/s takes at least about 11.5 minutes; at 1 Gbit/s it takes at least about 69 seconds. A free relay cannot guarantee either rate. Further size increases require verified streaming output and device/storage limits; adding channels or raising caps alone is not sufficient.

No promise of instant completion. Display real verified-byte progress and actionable status. Encryption runs chunk by chunk with bounded send buffering; the receiver retains at most the capped file in browser-managed Blob backing storage, which may use memory or temporary disk. Mutable plaintext batches and unacknowledged payload are bounded independently. Do not claim support for arbitrarily large files. Target browsers with WebCrypto, WebRTC, Blob downloads, and secure contexts (HTTPS or localhost). Browser-engine tests do not substitute for physical iOS/Android checks.

## Later milestones and release gates

1. Keep HTTPS/WSS on Cloudflare Free and the owner-approved ExpressTURN account in Free mode. Verify physical devices on separate networks and maintain relay credentials/quota. Static provider credentials are reusable outside app sessions; local temporary coturn credentials remain supported. See [network setup](NETWORK.md).
2. Revisit stronger human-secret authentication if required, using a reviewed protocol rather than custom cryptography. Do not silently change the declared KDF.
3. Add large-file streaming, worker offload, storage quota policy, and streaming ZIP only after memory/device measurements.
4. Optional encrypted store-and-forward relay requires separate upload/read/delete capabilities, immediate authorization expiry, deletion retries, orphan cleanup, and retention verification. Lifecycle expiration is a cleanup fallback, not an exact-deadline guarantee.
5. Before public release: independent security review, HTTPS/WSS and CSP, configured TURN, abuse controls at the edge, load testing, privacy notice, browser/device evidence, and operational ownership. Local prototype checks are not production readiness.

## Public information and security review

The preview includes Terms of Use & Conditions, Privacy, Help, Contact and Security pages, reachable through shared navigation from every route. Support, privacy and private security reports use the owner-confirmed kumarkaushik871@gmail.com address; no form backend or delivery claim is added. Policy copy must match actual data handling and distinguish transfer integrity from malware safety. Pagehide must clear sensitive transfer UI and release resources before history restoration. See [security review](SECURITY.md) for findings and residual risks.
