import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    relayEvidence: {
      policy?: string;
      localType?: string;
      remoteType?: string;
      protocol?: string;
      configuredTransports: string[];
    }[];
  }
}

export async function observeRelay(page: Page) {
  if (!process.env.TURN_TEST_TRANSPORT) return;
  await page.addInitScript(
    ({ force, transport }) => {
      window.relayEvidence = [];
      const NativePeer = window.RTCPeerConnection;
      // Optional hosted verification forces one real relay transport; all packets,
      // candidates, authentication and encryption still use the native implementation.
      window.RTCPeerConnection = class extends NativePeer {
        constructor(configuration?: RTCConfiguration) {
          if (force && configuration) {
            configuration = {
              ...configuration,
              iceTransportPolicy: 'relay',
              iceServers: configuration.iceServers
                ?.map((server) => ({
                  ...server,
                  urls: [server.urls]
                    .flat()
                    .filter(
                      (url) => url.startsWith('turn:') && url.endsWith(`?transport=${transport}`),
                    ),
                }))
                .filter((server) => server.urls.length > 0),
            };
          }
          super(configuration);
          this.addEventListener('connectionstatechange', () => {
            if (this.connectionState !== 'connected') return;
            void this.getStats().then((report) => {
              report.forEach((entry) => {
                if (entry.type !== 'transport' || !entry.selectedCandidatePairId) return;
                const pair = report.get(entry.selectedCandidatePairId);
                const local = report.get(pair.localCandidateId);
                const remote = report.get(pair.remoteCandidateId);
                window.relayEvidence.push({
                  policy: configuration?.iceTransportPolicy,
                  localType: local?.candidateType,
                  remoteType: remote?.candidateType,
                  protocol: local?.relayProtocol,
                  configuredTransports: [
                    ...new Set(
                      (configuration?.iceServers || []).flatMap((server) =>
                        [server.urls]
                          .flat()
                          .filter((url) => url.startsWith('turn'))
                          .map((url) => /\?transport=(udp|tcp)$/.exec(url)?.[1] || 'unknown'),
                      ),
                    ),
                  ],
                });
              });
            });
          });
        }
      };
    },
    {
      force: process.env.CLOUD_TEST_FORCE_RELAY === '1',
      transport: process.env.TURN_TEST_TRANSPORT,
    },
  );
}

export async function expectRelay(page: Page) {
  const transport = process.env.TURN_TEST_TRANSPORT;
  if (!transport) return;
  await expect
    .poll(() => page.evaluate(() => window.relayEvidence))
    .toContainEqual(
      expect.objectContaining({
        policy: 'relay',
        localType: 'relay',
        remoteType: 'relay',
        configuredTransports: [transport],
      }),
    );
  // WebKit omits relayProtocol. Its selected relay pair plus the single
  // configured transport proves routing; Chromium additionally reports it.
  if (page.context().browser()?.browserType().name() === 'chromium') {
    expect(await page.evaluate(() => window.relayEvidence)).toContainEqual(
      expect.objectContaining({ protocol: transport }),
    );
  }
}
