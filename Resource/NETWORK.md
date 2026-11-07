# STUN/TURN configuration and verification

The project originally selected coturn in its implementation guide. Repository inspection found no deployed TURN hostname, provider account, credentials file, or public signaling endpoint. The implementation therefore uses coturn's temporary-credential mechanism and preserves the existing local default. The free Cloudflare preview supplies HTTPS/WSS and public STUN; no public TURN service is configured. See [cloud setup](CLOUD.md) for the zero-budget decision and test limitations.

## Application configuration

The static frontend still has no API routes. Set `NEXT_PUBLIC_SIGNAL_URL=wss://signal.YOUR_DOMAIN` at build time, then rebuild. The endpoint must be a WSS origin with no credentials, path, query or fragment. An explicit value also overrides the loopback default for local debugging. Serve the frontend over HTTPS. Its CSP `connect-src` must permit that exact WSS origin; the local preview reads the same variable at startup to add it to its CSP.

On the separate signaling process, configure:

```dotenv
SIGNAL_HOST=127.0.0.1
SIGNAL_PORT=8787
SIGNAL_ORIGINS=https://share.YOUR_DOMAIN
TRANSFER_NETWORK=turn
STUN_URLS=stun:turn.YOUR_DOMAIN:3478
TURN_URLS=turn:turn.YOUR_DOMAIN:3478?transport=udp,turn:turn.YOUR_DOMAIN:3478?transport=tcp,turns:turn.YOUR_DOMAIN:5349?transport=tcp
TURN_SECRET_FILE=/private/service/path/turn-secret
ICE_TRANSPORT_POLICY=all
```

Replace the hostnames with actual DNS names. STUN is optional in TURN mode; TURN URLs and a secret file are mandatory. The secret is the same exact random string used by coturn's `static-auth-secret`. Generate at least 32 random bytes, encode as base64 or hex, and store it in an owner-readable file outside the repository. Do not put it in `NEXT_PUBLIC_*`, source code, command-line arguments, browser storage, logs or chat. Example generation on the intended host (adjust the private destination and ownership first):

```sh
umask 077
openssl rand -base64 32 > /private/service/path/turn-secret
```

`all` lets ICE choose a direct route or an encrypted relay. `relay` forces TURN and is required for relay verification; it is also available to operators that want relay-only routing. Configuration errors stop startup. `TRANSFER_NETWORK=local` starts the existing loopback STUN helper and rejects nonempty TURN settings, preventing an accidental silent fallback. TURN mode does not start the loopback helper.

Signaling sends each peer validated ICE configuration only when a receiver is admitted: `joined` for the receiver, `paired` for the sender. Session creation, wrong admission, a second receiver, and arbitrary credential requests do not issue credentials. The receiver still unlocks the PIN locally before joining. Each peer gets a distinct random username suffix, an expiry timestamp and a coturn HMAC-SHA1/base64 password. HMAC-SHA1 here is coturn REST authentication compatibility, not the file encryption algorithm. AES-GCM file encryption is unchanged.

Credential expiry is the original session expiry rounded up to seconds plus 60 seconds of clock-skew allowance: at most roughly 16 minutes from creation. Credentials are generated at pairing, never refreshed, and kept only by the peer connection. Synchronize signaling and TURN clocks. Cancelling removes the app session but cannot instantly revoke a copied TURN credential or an existing allocation; coturn allocation lifetimes, quotas, bandwidth limits and network policies remain necessary. Anonymous users can create their own sender/receiver pair: admission is not account authentication or a billing-abuse solution. Apply edge rate limits and monitor relay usage before public access. The service ignores forwarded IP headers; behind a proxy its existing creation budget is shared by that proxy address unless a reviewed edge policy is added.

## Host setup

Use maintained coturn infrastructure. Local verification uses coturn 4.18.0; select and patch the host's supported package deliberately. The [configuration template](../services/turn/coturn.conf.example) is host-specific and intentionally contains placeholders. Copy it to a private host configuration and replace every placeholder before starting a service.

1. Choose a TURN host with a stable public address and DNS-only A/AAAA records. A conventional HTTP CDN/proxy cannot carry arbitrary STUN/TURN traffic. Publish AAAA only if IPv6 listeners, certificates, routing and relay firewall rules actually work.
2. Set `listening-ip` and `relay-ip` to an address assigned to the server. Behind NAT, use `external-ip=PUBLIC_IP/PRIVATE_IP` and preserve relay port numbers in the NAT mapping. For a server with a directly assigned public address, use that address for listening/relay and remove the unnecessary mapping.
3. Install a valid certificate and private key for the TURN hostname and point `cert`/`pkey` at them. Arrange renewals and service reload/restart. Keep TLS enabled. The template disables DTLS and TCP relay allocations; TURN clients over UDP, TCP and TLS still use UDP relay allocations for WebRTC.
4. Allow inbound UDP/TCP 3478, TCP 5349, and UDP 49160–49260. Allow the corresponding outbound relay traffic and return traffic. Match the relay range in coturn, NAT and host/cloud firewalls. TLS on 443 can improve restrictive-network reachability when given a dedicated address/listener; update the URL and firewall accordingly and test it. Port 5349 alone is not universally reachable.
5. Keep authentication enabled, CLI disabled, private/loopback/multicast relay targets blocked, and finite user/global allocation and bandwidth quotas. Do not copy the test harness's `allow-loopback-peers` into a hosted configuration. Review deny ranges against the host's internal networks and metadata endpoints, including IPv6.
6. Put signaling behind a WebSocket-capable HTTPS reverse proxy at its WSS hostname. Preserve the browser's Origin header; permit only the exact frontend origins. Forward upgrades to loopback TCP 8787, use an idle timeout longer than the 15-second heartbeat, and keep the backend port private. No transfer payload or credential logging. The static host must retain the security headers described in the implementation guide.
7. Run the configured services under their normal restricted service accounts, supervise restarts, set metadata-log retention and alert on bandwidth/allocation spikes. Choose actual quotas against the server's capacity and expected concurrent transfers.

## Local relay regression

Install a `turnserver` executable (coturn) on PATH, or set `TURNSERVER_BIN` to its absolute path. The helper does not install/start a system service. Build the frontend first:

```sh
npm run build
npm run test:e2e
npm run test:e2e:turn -- udp
npm run test:e2e:turn -- tcp
npm run test:e2e:turn -- udp --invalid-credentials
```

The TURN harness generates fresh secrets in a private temporary directory, starts coturn bound only to 127.0.0.1:34790 with relay ports 50000–50100, runs the existing encrypted-transfer cases with `iceTransportPolicy=relay`, and cleans up the process/files. It selects only one TURN transport URL per run, so another transport cannot hide a failure. Native browser stats must identify the selected local and remote candidates as relay candidates. Chromium also reports the expected relay protocol; WebKit omits that field, so its check verifies the selected relay pair and the sole configured transport URL. Tests also verify downloaded size/hash and sender completion. The invalid-credentials run gives signaling a different signing secret from coturn and requires a terminal error without a Save action. The harness's loopback peer allowance and disabled TLS are solely for this isolated test. Do not run suites concurrently on the fixed ports. Do not use confidential files.

## Cross-network acceptance

Local relay tests do not prove public DNS, TLS, NAT mapping, firewall rules or mobile compatibility. Once real hosting is configured:

1. Use one device on home/office Wi-Fi and another on cellular with Wi-Fi disabled. Both open the same HTTPS frontend and WSS signaling service. Keep tabs foregrounded and awake.
2. Force `ICE_TRANSPORT_POLICY=relay` on signaling. With one TURN URL enabled at a time, test UDP, TCP, then TLS/TCP using a valid trusted certificate. Verify selected candidate-pair types and relay protocol using native WebRTC stats; do not log SDP, credentials, link fragments, or IP addresses into shared reports.
3. Transfer synthetic empty, 1 MiB + 17-byte and 50 MiB files; compare size and SHA-256 on download. Repeat both send/receive directions on physical Safari/iOS and Chromium/Android. Check cancellation and expiry.
4. Confirm invalid/expired credentials cannot allocate a relay; a relay outage in forced-relay mode must fail without a Save action. Then restore all intended endpoints and policy `all`, test direct and relay selection, and record host, engine/device, network, selected transport, duration and result without secrets.

Until that evidence exists, describe cross-network support as configured in code and locally verified, not publicly operational.

Sources: [coturn server documentation](https://github.com/coturn/coturn/blob/master/README.turnserver) defines REST credentials and relay options; [coturn reference configuration](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf) explains TLS, public/private mappings, ports and quotas; [WebRTC specification](https://www.w3.org/TR/webrtc/) defines ICE policies and peer configuration.
