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
  await page.addInitScript(() => {
    window.relayEvidence = [];
    const NativePeer = window.RTCPeerConnection;
    // Observe real native stats without changing configuration, ICE, crypto or data.
    window.RTCPeerConnection = class extends NativePeer {
      constructor(configuration?: RTCConfiguration) {
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
                configuredTransports: (configuration?.iceServers || []).flatMap((server) =>
                  [server.urls]
                    .flat()
                    .map((url) => /\?transport=(udp|tcp)$/.exec(url)?.[1] || 'unknown'),
                ),
              });
            });
          });
        });
      }
    };
  });
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
