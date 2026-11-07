import { InformationPage } from '../InformationPage/InformationPage';

export function PrivacyView() {
  return (
    <InformationPage
      title="Privacy Policy"
      intro="What stays in your browser, what the connection services process, and how to contact the operator."
    >
      <section>
        <h2>Files, keys, and PINs</h2>
        <p>
          File2File encrypts file contents and filenames in the sending browser and transfers them
          to the receiving browser through WebRTC. The application does not upload or store transfer
          files on its servers. File keys, PINs, and the secret part of a transfer link are not sent
          to the signaling service.
        </p>
        <p>
          The receiving page removes the link fragment from the visible address. Copies in messages,
          clipboard managers, browser synchronization, extensions, or other software are outside the
          app’s control. A saved download remains on the recipient’s device.
        </p>
      </section>
      <section>
        <h2>Connection information</h2>
        <p>
          The signaling service processes IP addresses, random session identifiers, admission-token
          hashes, expiry times, and WebRTC connection information to match two browsers and limit
          abuse. Session records are held in memory and removed on disconnect, cancellation, expiry,
          or service restart. Unused links last at most 15 minutes; after admission, an active
          transfer can last up to 60 minutes.
        </p>
        <p>
          Connection and abuse counters are temporary, bounded, and held in memory. Expired counters
          are removed on subsequent requests; they may remain in an idle process until another
          request or restart. The app does not log message payloads or transfer URLs.
        </p>
        <p>
          Peers may learn each other’s network addresses. The public STUN service sees addresses and
          ports used for connection discovery. When a TURN relay is used, it processes encrypted
          packets and can observe network addresses, timing and traffic volume, but is not given the
          application file key or PIN.
        </p>
      </section>
      <section>
        <h2>Hosting and third-party processing</h2>
        <p>
          Cloudflare hosts the frontend and signaling service and provides public STUN and
          server-side DNS resolution for the fixed connection-service hostnames. It processes
          network/request information, such as IP addresses, requested paths, timestamps, and
          browser information, to deliver and protect its services. Its infrastructure may process
          data internationally and retain operational or security records separately from the app’s
          in-memory sessions.
        </p>
        <p>
          Provider retention and processing follow{' '}
          <a href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer">
            Cloudflare’s Privacy Policy
          </a>
          . The app’s session deadlines do not determine how long providers retain their logs.
        </p>
      </section>
      <section>
        <h2>Optional TURN relay</h2>
        <p>
          ExpressTURN provides the configured free relay. Its own operational records and retention
          are outside the app’s session cleanup. Review{' '}
          <a href="https://www.expressturn.com/privacy" rel="noreferrer">
            ExpressTURN’s Privacy Policy
          </a>
          . Direct connections are preferred when available. No file content is uploaded to a stored
          file-sharing service, and the relay is not an anonymity service.
        </p>
      </section>
      <section>
        <h2>Cookies and browser storage</h2>
        <p>
          The application sets no cookies and uses no analytics, advertising trackers, local
          storage, IndexedDB, or service worker. Cloudflare may use essential security cookies when
          its protection features require them; see its{' '}
          <a
            href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/"
            rel="noreferrer"
          >
            cookie documentation
          </a>
          . There is no optional tracking consent to enable in this preview.
        </p>
        <p>
          Clearing or leaving a transfer releases app references and download URLs. This is not a
          guarantee of physical memory erasure or removal of copies made elsewhere. Received files
          use browser-managed Blob storage; the browser may back this with temporary disk or swap.
          The app does not control its physical deletion or operating-system copies.
        </p>
      </section>
      <section>
        <h2>Support and privacy requests</h2>
        <p>
          File2File is operated by Kumar Kaushik. If you email{' '}
          <a href="mailto:kumarkaushik871@gmail.com?subject=File2File%20privacy%20request">
            kumarkaushik871@gmail.com
          </a>
          , your email address and message are processed through the operator’s email provider to
          handle your request. Avoid sending files, PINs, full links, or unnecessary personal
          information.
        </p>
        <p>
          Correspondence may be retained while needed to resolve a request, handle abuse, or meet
          legal obligations. You can ask about access, correction, or deletion of information held
          by the operator, or exercise other rights available under applicable law. Only information
          reasonably needed to verify and handle a request should be supplied. The operator cannot
          retrieve transfer files or delete copies held by another person or their devices.
        </p>
        <p>
          This notice may change as the service changes. The date above identifies the current
          version; questions can be sent to the same address.
        </p>
      </section>
    </InformationPage>
  );
}
