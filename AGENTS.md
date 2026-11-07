# Agent instructions — File2File

## Owner's standing rule

Always follow the owner's established code structure, code practices, and development rules. The reference is `/Users/kumarkaushik/Desktop/Portfolio`, the owner's Next.js project, explicitly selected on 2026-11-08. Read its root AGENTS.md and relevant Resource contracts when resolving an unspecified convention. Do not copy portfolio-specific product content, credentials, or deployment configuration.

## Read first

Read Resource/README.md, PRD_README.md, guide_README.md, ARCHITECTURE.md, and PLAN.md under Resource before implementation. Keep design, code, and actual verification status consistent.

## Repository conventions

- Root AGENTS.md is the only root project document. Human-facing documentation belongs in Resource/.
- Use Next.js App Router with static export. Route files compose named feature views and metadata. No Next API routes or Server Actions.
- Meaningful UI units are named components in src/features/<feature>/components/<Name>/. Shared primitives belong in src/components/ui; layout belongs in src/components/layout.
- Feature browser logic belongs in that feature's domain/ or hooks/. Pure cross-runtime protocol contracts belong in src/contracts. Signaling-only Node code belongs in services/signaling. The free hosted runtime belongs in workers/file-sharing, following the Portfolio Worker boundary. Neither may be imported by the frontend.
- CSS Modules own component styles; src/styles/tokens.css owns semantic tokens; globals own reset/base behavior. Use native accessible elements, visible focus, 44px controls, reduced motion, and 320px reflow. SVG icons, no emoji icons.
- Use Node.js 26.x (pinned in .nvmrc), npm, one lockfile, exact dependency versions, strict TypeScript, ESLint, and Prettier. Add only dependencies actually used. No speculative abstractions, empty trees, global miscellaneous utils, or database scaffolding.
- Preserve assets and user changes. Never read/copy reference-project secrets. Never publish without the owner's deployment request.
- Run format, lint, types, documentation checks, build, and meaningful behavior/security tests. Record checks actually run and remaining limitations in Resource/PLAN.md and Resource/TESTS.md.

## Scope

Maintain the single-file milestone: browser encryption, PIN link unlock, ephemeral signaling, WebRTC, validated download and cancellation. The owner authorized a public test preview on 2026-11-08 with a strict zero budget. Use Cloudflare Workers Free for signaling and Cloudflare Pages Free for the static frontend at the owner-authorized share.kkos.in subdomain. Keep Hostinger nameservers and the existing root/www Vercel records; never activate a paid plan, paid-overage TURN subscription, or purchase a domain without new authorization. Preserve the separate local Node/coturn workflow. No persistent file relay, folders, accounts, analytics, or production-readiness claims. The hosted preview uses public STUN and owner-approved ExpressTURN Free on UDP/TCP 3478. Keep reusable relay credentials in Worker secrets, disclose their quota/port limits, and never activate Premium or paid overages. Unused links expire in 15 minutes; the owner approved up to 60 minutes after receiver admission, with a 30-second stall timeout.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
