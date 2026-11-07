# Architecture and ownership

The owner's Portfolio conventions govern structure; its product content, branding, Worker/R2 hosting, and secrets are not copied.

```text
AGENTS.md
Resource/                         specifications, status and checks
src/app/                          static sender and /receive routes, metadata
src/components/layout/AppShell/   shared page frame
src/components/ui/ActionButton/   shared native button
src/features/transfer/
  components/                     named sender/receiver/status/privacy views
  domain/                         browser crypto, link, signaling, peer lifecycle
src/contracts/                    pure validated protocol constants and types
src/styles/                       semantic tokens and base CSS
services/signaling/src/           WebSocket sessions, temporary TURN credentials, local STUN
services/signaling/tests/         real WebSocket/UDP integration tests
services/turn/                    host-specific coturn template
workers/file-sharing/             free Cloudflare static assets and in-memory WSS hub
scripts/                          local dev, preview, relay harness and documentation checks
tests/unit/                       cryptography and protocol behavior
tests/e2e/                        two-browser transfer and interaction tests
```

App routes compose named views only. Browser effects are owned by transfer components/controllers, not route files. CSS Modules live beside components. No global utility bucket or speculative folder tree. Pure contracts cross the client/service boundary; server modules never enter browser imports. Static export is out/. No runtime filesystem writes, Next API routes, database, or file relay.

The first UI uses a restrained paper/plum workspace with system dark mode and CSS token overrides. System fonts avoid network/font setup in this functional milestone. Labels, live feedback, native progress, keyboard controls, and 320px reflow are required. No decorative animation or externally fetched media.

The signaling process owns the loopback-only UDP 8788 Binding helper in local mode. In TURN mode, its ice.ts reads validated settings and issues per-peer coturn credentials only on admission, through joined/paired messages. The shared src/contracts/ice.ts validates the browser-safe wire configuration. Browser session.ts constructs its peer connection after this admission message, using the supplied servers/policy, and releases it on cleanup. Static routes and component ownership remain unchanged. The shared secret is read from a private file by the service, never imported by frontend code. See [network setup](NETWORK.md) for host configuration and verification.

The hosted test preview uses a separate Cloudflare Worker and a single SQLite-backed Durable Object (the backend required on the Free plan). It does not write SQL, KV, socket attachments, or file data. Standard WebSockets keep ephemeral session maps alive; restarts/deployments end sessions. A single hub bounds aggregate active duration, with 20 sessions, 44 sockets, per-IP creation budgets, 32 KiB messages, 128 KiB queued input per socket, and 256 KiB total output per socket. Cloudflare supplies the trusted CF-Connecting-IP header. This is a small test deployment, not a distributed high-volume architecture.

The same Worker serves the static Next export and root WebSocket upgrades. It validates exact same-origin Origin headers and applies CSP with build-generated inline-script hashes and the exact request WSS host. Browser signaling opts into same-origin only in build:cloud. The local build and Node/coturn service remain separate. Public STUN has its own validated mode; it cannot claim relay policy or include TURN credentials.

The custom subdomain frontend uses a separate static Cloudflare Pages export (pages-out/) because Hostinger remains the authoritative DNS provider. Only share.kkos.in is attached; the root and www Vercel site remain separate. Browser signaling uses the existing Worker WSS endpoint. workers/file-sharing/hosting.json records the exact public origins; the Worker and Durable Object share the same origin check and accept no wildcard Pages or parent-domain origins. build:pages produces per-route CSP script hashes and an explicit WSS connect-src in _headers. A fallback policy covers unknown-page responses; each known HTML route detaches and replaces it to stay within Pages header limits. The Worker-only build remains available separately.

Public information lives in src/features/information/components: named TermsView, PrivacyView, HelpView, ContactView and SecurityView compose a shared InformationPage. Thin routes own metadata. Shared SiteNavigation owns current-page semantics; CSS Modules reuse existing tokens. Pure ConnectionBudget is shared by Node/Worker without importing service code into the browser. Public machine-readable reporting contact lives in public/.well-known/security.txt.
