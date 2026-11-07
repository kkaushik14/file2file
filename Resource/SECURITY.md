# Security review — 8 November 2026

Scope: browser UI and lifecycle, link encryption and record validation, Node and Worker signaling, public Pages/Worker headers, dependencies, deployment configuration, and public information. This is a source/configuration review with targeted regression tests, not an independent penetration test or security certification. No probing of other users or load testing of the live service was performed.

## Findings and changes

| Finding                                                                                | Severity / status            | Change                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One address could consume the global unauthenticated WebSocket allowance               | Medium, fixed in application | Shared per-address limits: 8 concurrent sockets and 60 accepted upgrades per minute, bounded to 1,000 address records. Node trusts transport addresses; Cloudflare trusts CF-Connecting-IP. Global caps and admission deadlines remain.  |
| Browser state could retain PIN/link/download UI after pagehide and history restoration | Medium, fixed                | Pagehide closes the transfer, clears state, releases link material and revokes download URLs. Effect disposal remains compatible with StrictMode. No physical-erasure claim.                                                             |
| Browser asynchronous signaling work had no queue budget                                | Medium, fixed                | Cap pending signaling at 128 messages and 256 KiB. Cloud input queues now count UTF-8 bytes, not code units.                                                                                                                             |
| Development dependency minimatch advisory                                              | Moderate, fixed              | Scoped override to minimatch 11.0.1 for typescript-estree; exact lockfile. Avoided downgrading Next tooling. Remove override when the upstream dependency accepts a patched release. Full lint/type/build checks exercise compatibility. |
| Missing policies, support paths, and shared navigation                                 | Fixed                        | Terms of Use & Conditions, Privacy, Help, Contact, Security, dated content, accessible navigation, and security.txt. Owner confirmed the public contact address.                                                                         |
| Integrity language could be confused with a safe-file guarantee                        | Fixed                        | Receive/help/security views explicitly distinguish integrity checks from malware scanning and sender identity.                                                                                                                           |
| Embedding protection                                                                   | Defense in depth             | Retained CSP frame-ancestors none and added X-Frame-Options DENY. Pages generates separate complete per-route script-hash policies, with a 404 fallback, and fails closed if header/rule limits are exceeded.                            |

## Protections reviewed

- Random independent root/URL secrets; authenticated PIN-wrapped envelope; fixed KDF and validated link limits; directional keys and unique record sequence nonces.
- Manifest, record order, size, completion and receiver acknowledgement checks; opaque download with sanitized filename; no remote content rendering or HTML injection.
- Exact allowed origins, receiver admission-token hashes, roles, single-receiver claim, expiry, cancellation and disconnect cleanup.
- Server-only TURN configuration stays outside browser imports. Hosted mode remains STUN-only; no credentials or paid relay were added.
- No app analytics, database writes, browser persistence, or file payload logging. Provider network/security processing is separately disclosed.
- HTTPS/WSS, restrictive CSP with generated hashes, no-referrer, nosniff, disabled camera/microphone/geolocation and no-store HTML.

## Residual risks and owner operations

Short PINs remain guessable offline by a full-link holder; the local attempt cap is not authentication. Trust in the delivered JavaScript, browser, extensions and endpoints remains necessary. A recipient can keep a file. There is no malware scanner or anonymous transport.

Per-IP limits reduce single-source resource exhaustion but do not stop distributed denial of service, spoofed Origin headers from non-browser clients, or exhaustion of the Free account's platform quota. Shared-network users also share limits. Do not enable paid overages. Production release still needs independent review, edge-abuse operations and load/device evidence.

Hosted WebKit/public-STUN connectivity and physical devices on separate networks remain unverified or failing as recorded in TESTS. No new TURN provider was provisioned. Privacy and terms reflect this implementation; jurisdiction-specific legal review and provider-retention/account-policy review remain owner release tasks, not completed legal compliance certification.

Monitor the public support mailbox; review provider logs/settings without enabling file/secret logging. Renew security.txt before **8 May 2027**. Recheck dependencies routinely. Cloudflare account-wide API deployment permissions may affect other projects in the same account; restrict any automation token to necessary permissions and this account, keep it only in GitHub Actions secrets, and revoke it if automation is retired. Never commit tokens.

## Sources

- [minimatch advisory GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)
- [Cloudflare cookie documentation](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)
- [RFC 9116 security.txt](https://www.rfc-editor.org/rfc/rfc9116.html)
- [Cloudflare Direct Upload CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

Verification results are maintained in [TESTS](TESTS.md); deployment state is recorded in [CLOUD](CLOUD.md).
