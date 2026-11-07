# File2File — project documentation

Updated: 2026-11-08. P0 and the local single-file app are implemented. The [Pages frontend](https://file2file-share.pages.dev) uses the existing Worker WSS service with public STUN. The owner's [share.kkos.in subdomain](https://share.kkos.in) is live over HTTPS through Hostinger DNS, with browser transfer-link creation verified. Chromium transfers pass on the live preview; WebKit/public-STUN transfers remain unresolved. No public TURN service is enabled under the owner's zero-budget requirement. Local coturn UDP/TCP tests passed previously; physical devices and separate networks remain unverified.

The owner selected the Portfolio Next.js project as the code-structure and development-practice reference. Root [AGENTS](../AGENTS.md) records that standing rule. The original root PRD and guide now live here, following its Resource/ convention.

| Document                                | Responsibility                                            |
| --------------------------------------- | --------------------------------------------------------- |
| [PRD](PRD_README.md)                    | Product scope, guarantees, acceptance criteria            |
| [Implementation guide](guide_README.md) | Versioned protocol, security, setup, operations           |
| [Architecture](ARCHITECTURE.md)         | Folder ownership and component boundaries                 |
| [Plan](PLAN.md)                         | Actual progress and remaining milestones                  |
| [Cloud preview](CLOUD.md)               | Free hosting, live endpoints, limits and deployment       |
| [Network setup](NETWORK.md)             | STUN/TURN settings, coturn host template and verification |
| [Tests](TESTS.md)                       | Verification commands and evidence                        |

Start locally with `npm ci` then `npm run dev`. Open http://127.0.0.1:3001 in your browser, choose a file and PIN, then open its link in another tab and enter the PIN. Allow local-network access if the browser requests it. Keep both tabs open. The frontend uses port 3001, avoiding the Portfolio preview. Signaling uses TCP port 8787 and starts same-machine STUN discovery on loopback UDP 8788. See the guide before testing across devices.

See the [security review](SECURITY.md) for the November audit, public policies, verified fixes and remaining release gates.
