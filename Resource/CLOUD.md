# Free hosted test preview

Updated: 2026-11-08. The owner requires a zero budget. This is an experimental preview. Public relay routing is verified below; production readiness and the physical-device/independent-network matrix remain open.

## Endpoints and cost boundary

- Custom frontend: [share.kkos.in](https://share.kkos.in) (HTTPS and browser transfer-link creation verified).
- Pages frontend: [File2File Pages](https://file2file-share.pages.dev).
- Original Worker preview: [File2File Worker](https://file2file-preview.kumarkaushik871.workers.dev).
- Signaling: `wss://file2file-preview.kumarkaushik871.workers.dev/`.
- Health: [network status](https://file2file-preview.kumarkaushik871.workers.dev/health), reporting configured mode: `network: turn` and `relay: true` when both relay secrets are installed.
- Public discovery: `stun:stun.cloudflare.com:3478`. This discovers addresses; it does not relay files.
- TURN: owner-approved **ExpressTURN Free**, using UDP/TCP port 3478 and Worker-only secrets. Restrictive networks blocking 3478 can still fail; TLS/443 is not included.

The existing Cloudflare account's Workers Free plan was verified in its dashboard. A new `file2file-preview` Worker was deployed; the Portfolio Worker was not modified. The included workers.dev hostname supplies HTTPS/WSS without purchasing a domain. No paid plan, TURN subscription, or payment change was made.

Cloudflare's TURN checkout requires an automatically renewing usage-based subscription: an included allowance followed by billable overages. It was not activated under the owner's zero-budget instruction. A probe of Metered OpenRelay's officially published static-auth endpoint timed out; it is not configured or claimed working. A free allowance is not sufficient if it can incur charges. The selected ExpressTURN account remains Free; no paid checkout was used. The precise quota cutoff has not been exhausted experimentally.

ExpressTURN was selected instead of Metered's 500 MB tier. The owner created the account, the dashboard confirmed Free mode and 1000 GB/month, and the owner approved Worker secret installation. No card or paid plan was added. See [network setup](NETWORK.md) for static-credential reuse risk, rotation, port limits and real relay verification commands. The account's provider quota is shared across users and must not be mistaken for guaranteed capacity.

Workers Free currently includes 100,000 requests/day; Durable Objects Free includes 100,000 requests/day and 13,000 GB-s/day. Free-limit exhaustion causes failures rather than paid overages while the account remains Free. These quotas are shared with other account projects. All asset requests currently pass through the Worker to apply headers. This preview uses one hub, at most 20 simultaneous sessions and 44 sockets; standard WebSockets keep its 128 MB instance active while connected. Continuous single-instance activity is approximately 10,800 GB-s/day, before other account usage. Do not upgrade the account or enable billable services to bypass limits.

## Build, verify and deploy

Use the existing Node/npm versions and pinned Wrangler dependency. Authenticate Wrangler to the intended account through its normal login flow if needed; never copy another project's secrets. Build the cloud variant before its tests/type check:

```sh
npm ci
npm run build:cloud
npm run check
npm run typecheck:cloud
npm test
npm run test:cloud
npm run test:e2e:cloud
npm run deploy:cloud
```

The full cloud E2E suite intentionally retains WebKit and cross-engine cases; a STUN-only failure remains a failure, not a skipped test. Inspect the current evidence in [TESTS](TESTS.md) before interpreting readiness.

`build:cloud` sets `NEXT_PUBLIC_SIGNAL_URL=same-origin` and `NEXT_PUBLIC_NETWORK_MODE=hosted` for the build process only. It collects the exported inline script hashes into ignored generated/csp.json for the Worker CSP. `deploy:cloud` rebuilds first so frontend and CSP always match. Public HTTP requests redirect to HTTPS; insecure WebSocket upgrades are rejected. The exact WSS origin is inserted from the request host; no wildcard connection permission or unsafe-inline script policy is used. Do not deploy with a stale generated file or a local-mode export.

`dev:cloud` serves the cloud build through the local Cloudflare runtime at http://127.0.0.1:8789. `test:cloud` starts/stops its own isolated runtime. To check the deployed service with synthetic files:

```sh
CLOUD_TEST_URL=https://file2file-preview.kumarkaushik871.workers.dev CLOUD_TEST_NETWORK=turn npm run test:cloud
CLOUD_TEST_URL=https://file2file-preview.kumarkaushik871.workers.dev npm run test:e2e:cloud
```

To return to the local Node/loopback-STUN regression workflow, use `npm run build` before `npm run test:e2e`. The Node coturn configuration and [relay harness](NETWORK.md) remain available; the hosted Worker currently does not consume Node TURN settings or private secret files.

## Runtime and operations

Static export remains in src/app with the existing feature/domain/component structure. Worker implementation is isolated in workers/file-sharing. A single SQLite-backed Durable Object is used because Free supports that backend; there are no SQL, KV, R2, or socket-attachment writes. Session identifiers, token hashes, socket ownership, admission deadlines and expiry are memory-only. Deployments/restarts lose active sessions. Neither file payloads nor browser encryption keys travel through signaling.

The Worker enforces exact same-origin browser upgrades, admission before ICE/signaling, one receiver, role checks, a 15-minute join deadline followed by at most 60 minutes for an admitted transfer, a 10-second initial admission deadline, 200 messages/socket/minute, 20 creations/IP/minute, bounded queue/output and generic failure responses. Cloudflare's edge supplies CF-Connecting-IP; it is used only for the bounded in-memory creation budget. IP budget entries are pruned on subsequent creation requests or instance teardown. No application payload logging or Worker observability is enabled. Provider-level operational metadata remains subject to Cloudflare's policies; this is not a claim of zero infrastructure logs.

Production rollout, independent security review, edge abuse/load tests, physical-device tests and sustained resource measurements remain open. The caps limit this preview but do not guarantee availability against deliberate denial of service.

To inspect deployments, run `npx wrangler deployments list --config workers/file-sharing/wrangler.jsonc`. To take the preview offline when no longer needed, delete only `file2file-preview` through the dashboard or `npx wrangler delete --config workers/file-sharing/wrangler.jsonc`. Deletion interrupts sessions and requires the owner's intent; do not modify the Portfolio deployment.

## Two-network test

Open the app on a computer connected to Wi-Fi and a phone using cellular with Wi-Fi disabled. Use a small synthetic file, share the generated private link, communicate its PIN separately, and keep both tabs open and foregrounded. Verify the downloaded bytes and sender completion. A network blocking the free relay port can still time out; no error state is evidence that a file was delivered. Physical Safari/iOS/Android and separate-network transfers remain unverified until this test is actually completed. See [network acceptance](NETWORK.md) for the eventual forced-relay UDP/TCP/TLS tests.

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects Free limits](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Cloudflare STUN FAQ](https://developers.cloudflare.com/realtime/turn/faq/), [Realtime pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/), and [Metered OpenRelay](https://www.metered.ca/tools/openrelay/).

## Existing domain and free subdomain

The owner requested using their existing domain through their browser. kkos.in is managed at Hostinger with byte.dns-parking.com and pixel.dns-parking.com nameservers. The existing root A record (216.198.79.1) and www CNAME (e676b0eb2170a07b.vercel-dns-017.com) serve the Portfolio on Vercel and were preserved.

Created the Cloudflare Pages project file2file-share through the dashboard, uploaded only the generated static assets, and attached share.kkos.in using the external-DNS workflow. Added only this Hostinger record through the browser:

| Type  | Name  | Target                    | TTL         |
| ----- | ----- | ------------------------- | ----------- |
| CNAME | share | file2file-share.pages.dev | 300 seconds |

No nameserver migration, domain purchase, paid plan, or TURN subscription was enabled. Cloudflare Pages supports a subdomain using external DNS; a Workers custom domain would require the parent zone on Cloudflare. [Cloudflare custom-domain documentation](https://developers.cloudflare.com/pages/configuration/custom-domains/).

The frontend connects to the existing Worker WSS URL. workers/file-sharing/hosting.json records the exact share, Pages, and Worker public origins. Both signaling entry points enforce exact origin matching; parent-domain, lookalike, insecure, and arbitrary Pages origins are rejected. Neither CORS wildcards nor wildcard WebSocket origins are used by signaling. Cloudflare Pages may expose public static assets with its default CORS header; these contain no secrets.

Build the custom-domain frontend with `npm run build:pages`. Upload only pages-out/ (or a ZIP of its contents) through Pages → file2file-share → Create deployment → Production. This output contains the explicit Worker WSS URL and generated _headers with CSP script hashes, restrictive connect-src, no-referrer, no-store and HSTS. Do not upload the repository, environment files, tests, or source credentials. No frontend secrets are configured. The Pages build does not overwrite the Worker's generated CSP hashes. Rebuild with build:cloud before deploying the Worker asset variant.

The browser upload created the initial Pages deployment. GitHub Actions now rebuilds and deploys both targets after validated main pushes. DNS attachment remains associated with the Pages project across deployments. The custom subdomain supplies HTTPS for the app; discovery and relay configuration remain separate Worker responsibilities.

Final verification on 2026-11-08: share.kkos.in returned HTTPS 200 with a trusted certificate and the intended security headers. The actual browser loaded the custom host, created a synthetic encrypted link beginning https://share.kkos.in/receive/#, reached Waiting for the receiver through WSS, and cancelled cleanly. Initial certificate activation took several minutes; the final check succeeded without bypassing certificate validation. Both public DNS resolvers tested return the correct CNAME. Root/www Vercel values remain unchanged. This is domain and signaling verification, not a new two-network or hosted WebKit transfer test.

## GitHub-driven deployment

The owner authorized automatic deployment from [kkaushik14/file2file](https://github.com/kkaushik14/file2file) on 8 November 2026. The existing Direct Upload Pages project cannot switch to native Git integration, so `.github/workflows/deploy.yml` uses GitHub Actions and the pinned local Wrangler dependency. No domain migration or paid plan is required.

Pushes to main and manual workflow runs validate formatting, lint, TypeScript, documentation, dependency advisories, unit/service tests, Chromium/WebKit E2E, Worker integration and both exports. Pull requests run verification without deployment credentials. Only a successful main run deploys, first the Worker build and then the separate Pages build. Workflow runs are serialized per branch, and secrets are exposed only to the deployment command steps. Actions are pinned by immutable commit hash and use read-only repository access.

The owner-approved `File2File GitHub deployment` Cloudflare token is stored only as the repository Actions secret `CLOUDFLARE_API_TOKEN`. It has Workers Scripts Edit and Cloudflare Pages Edit in the selected account and expires on **8 November 2027**. Those Cloudflare permissions are account-wide, including other projects; the owner explicitly approved this scope. No DNS, billing, or account-management permissions were granted. Renew before expiry and revoke when no longer needed. Never place the token in source, build artifacts, NEXT_PUBLIC variables, or workflow logs.

Use **Node.js 26.x**, currently pinned to **26.13.0** in .nvmrc, with npm 11.20.0. Both workflow jobs read .nvmrc. The frontend is static and the Worker uses Cloudflare's runtime; Node runs build tools and the separate local signaling server. The local validation runtime was downloaded from nodejs.org and SHA-256 checked without changing the system-wide Node used by other projects.

A deploy interrupts existing in-memory sessions. If one target fails after the other succeeds, check the Actions log, fix the failure and rerun; do not report success until both targets and the public endpoint check pass. The workflow is not an atomic cross-service release. Hosted discovery now includes fresh IPv4 fallback for WebKit; the CI WebRTC suite still uses local STUN, so provider-route checks remain separate from CI.

The first automatic deployment succeeded for fc474c9 in [run 42416571115](https://github.com/kkaushik14/file2file/actions/runs/42416571115), including both targets and the public endpoint checks. The post-deploy Chromium 1 MiB + 17-byte transfer and information-page checks also pass. See [verification evidence](TESTS.md).

## Protocol-v2 deployment and relay verification

Commit 99cc86c was deployed by [run 42424098488](https://github.com/kkaushik14/file2file/actions/runs/42424098488) after successful verification on its second attempt. The first attempt had one Linux WebKit-to-Chromium timeout, retained in TESTS. Both Cloudflare deployments and the public endpoint check passed. ExpressTURN Free credentials are installed as Worker secrets; health reports turn/true. Real forced-relay UDP and TCP suites each passed four cases on share.kkos.in, covering both engines and both directions with matching downloaded SHA-256. These tests prove public relay use from this machine, not the separate-device/network matrix. Free relay timings were much slower than direct local benchmarks; quota is not a speed guarantee. Both tabs must refresh and use new v2 links after deployment.
