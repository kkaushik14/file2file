import Link from 'next/link';
import { InformationPage } from '../InformationPage/InformationPage';

export function HelpView() {
  return (
    <InformationPage
      title="Help with a transfer"
      intro="A short guide to sending, receiving, and solving common connection problems."
    >
      <section>
        <h2>Send a file</h2>
        <ol>
          <li>
            Open <Link href="/">Send a file</Link>, choose one file up to 50 MiB, and enter a 6- or
            8-digit PIN. Prefer an unpredictable 8-digit PIN.
          </li>
          <li>
            Create a transfer link. Share it only with your intended receiver, and send the PIN
            through a separate trusted channel.
          </li>
          <li>
            Keep the tab open and your device awake until the app confirms the receiver has verified
            the file. That confirmation does not mean it has been saved to disk.
          </li>
        </ol>
      </section>
      <section>
        <h2>Receive and save</h2>
        <ol>
          <li>
            Open the full link from someone you trust and enter their PIN. Do not remove the part
            after the # symbol before opening it.
          </li>
          <li>
            Keep the sender and receiver tabs open. After verification, select Save file and check
            your browser’s downloads.
          </li>
          <li>
            Clear the file from the page when finished. Leaving or reloading the page ends the
            transfer and clears its download link. Previously saved copies remain.
          </li>
        </ol>
        <p>
          “Verified” means the transferred bytes passed integrity checks. It does not mean the file
          is safe to open. Scan unfamiliar files and confirm unexpected transfers with the sender.
        </p>
      </section>
      <section>
        <h2>Troubleshooting</h2>
        <details>
          <summary>The link is missing, expired, or unavailable</summary>
          <p>
            Links last 15 minutes from creation and allow one receiver. Ask for a new link if either
            tab was closed, a transfer was cancelled, or another receiver claimed it. A reload after
            opening a link cannot recover the secret removed from the address bar.
          </p>
        </details>
        <details>
          <summary>The PIN does not work</summary>
          <p>
            Confirm all 6 or 8 digits with the sender. Five failed attempts clear this view, with
            short delays between attempts. This limit does not prevent someone with a copied link
            from guessing offline.
          </p>
        </details>
        <details>
          <summary>The connection stalls or never starts</summary>
          <p>
            Keep both devices awake and use current browsers over HTTPS. If your browser requests
            local-network permission for an intended local transfer, allow it only if you trust the
            site. Try a different network or browser if policy allows.
          </p>
          <p>
            This free hosted preview uses STUN without a TURN relay. Restrictive NATs, firewalls,
            corporate networks, and the currently unresolved hosted Safari/WebKit path can prevent a
            connection. There is no guaranteed cross-network fallback yet. Do not disable your
            firewall or other security protections to make a transfer work.
          </p>
        </details>
        <details>
          <summary>Where is my file, or can I resume?</summary>
          <p>
            Look in your browser’s downloads after selecting Save file. The service has no stored
            copy, recovery, or resume feature. Request a new transfer if it fails. The limit is 50
            MiB (52,428,800 bytes), and browser memory use can exceed the file size.
          </p>
        </details>
      </section>
      <section>
        <h2>Still need help?</h2>
        <p>
          <a href="/contact/">Contact support</a> with your browser version, device, approximate
          time, and the error text. Never include a PIN, full transfer link, or private file. For
          protection details, read <a href="/security/">Security</a>.
        </p>
      </section>
    </InformationPage>
  );
}
