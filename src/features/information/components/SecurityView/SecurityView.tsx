import { InformationPage } from '../InformationPage/InformationPage';

export function SecurityView() {
  return (
    <InformationPage
      title="Security & reporting"
      intro="How the preview protects a transfer, its limits, and where to report a vulnerability privately."
    >
      <section>
        <h2>What the app protects</h2>
        <p>
          The browser encrypts file contents and filenames with AES-256-GCM before sending them over
          an encrypted WebRTC data channel. Ordered, authenticated records and size checks must pass
          before a download is offered. Signaling uses HTTPS/WSS and temporary in-memory sessions,
          with no server-side file storage.
        </p>
        <p>
          Links contain a random secret and PIN-wrapped key material. Share the PIN separately and
          verify the receiver through a trusted channel. Keep the full link private.
        </p>
      </section>
      <section>
        <h2>What protection does not mean</h2>
        <ul>
          <li>
            A short PIN can be guessed offline by someone who has the complete link. The
            five-attempt screen limit is not an attacker lockout.
          </li>
          <li>
            Encryption and integrity checks do not scan for malware or independently establish a
            sender’s identity. Only open files you trust.
          </li>
          <li>
            The website’s delivered code, browser, extensions, and device must be trusted. A
            compromised application host could replace that code.
          </li>
          <li>
            Peers and connection providers can see network metadata. This is not an anonymity
            service.
          </li>
          <li>
            Expiry and cancellation cannot erase copied links or saved files. Browser cleanup is not
            forensic secure erasure.
          </li>
        </ul>
        <p>
          This is a test preview, not a security certification or independently audited
          cryptographic product. Free relay availability, restrictive networks and device memory can
          limit transfers. Physical Safari/iOS/Android and independent-network testing remain
          separate verification steps.
        </p>
      </section>
      <section>
        <h2>Report a vulnerability privately</h2>
        <p>
          Email{' '}
          <a href="mailto:kumarkaushik871@gmail.com?subject=File2File%20security%20report">
            kumarkaushik871@gmail.com
          </a>{' '}
          with the affected page or feature, impact, browser version, and minimal reproduction using
          your own disposable data. Remove secrets and avoid sending live transfer links or someone
          else’s data.
        </p>
        <p>
          Test only with devices, accounts, and files you control. Do not disrupt the public
          service, access other users’ transfers, or perform bulk probing. Contact the operator
          before testing that could affect availability. No reward or response deadline is promised.
        </p>
        <p>
          A machine-readable contact is available at{' '}
          <a href="/.well-known/security.txt">security.txt</a>. General questions belong on{' '}
          <a href="/contact/">Contact</a>; data handling is described in{' '}
          <a href="/privacy/">Privacy</a>.
        </p>
      </section>
    </InformationPage>
  );
}
