import { MAX_FILE_LABEL } from '@/contracts/transfer';
import { InformationPage } from '../InformationPage/InformationPage';

export function TermsView() {
  return (
    <InformationPage
      title="Terms of Use & Conditions"
      intro="The rules for using this free, experimental file-transfer service. These terms apply to the File2File preview."
    >
      <section>
        <h2>Using File2File</h2>
        <p>
          File2File is operated by Kumar Kaushik. By using the service, you agree to these terms. If
          you do not agree, do not use it. You must be legally able to agree to these terms, or have
          permission and supervision from a parent or guardian where required.
        </p>
        <p>
          This preview sends one file of up to {MAX_FILE_LABEL} to one receiver. Unused links expire
          15 minutes after creation. Once admitted, a transfer has up to 60 minutes to finish. Keep
          both tabs open; leaving a transfer page, cancellation, a network failure, or a service
          restart can end the session.
        </p>
      </section>
      <section>
        <h2>Your files and responsibilities</h2>
        <p>
          You retain your rights in your files. Only share content you own or are authorized to
          share, with an intended recipient who agrees to receive it. Verify the recipient through a
          trusted channel, send the PIN separately, and keep your own backup.
        </p>
        <p>
          Do not use File2File for unlawful content, infringement, harassment, fraud, malicious
          software, unauthorized access, or disruption. Do not bypass service limits, attack other
          users, or automate abusive traffic. Connections may be limited or terminated to protect
          the service.
        </p>
      </section>
      <section>
        <h2>Understand the limits</h2>
        <p>
          Encryption protects file contents in transit. It does not establish the sender’s identity
          or scan files for malware. A person with a complete link can guess its short PIN offline.
          Recipients can copy and keep files; expiry and cancellation cannot recall a saved file.
        </p>
        <p>
          The free relay has limited ports, capacity and availability, so some networks or devices
          may still be unable to transfer. File2File cannot recover lost files, PINs, or interrupted
          transfers. Read <a href="/security/">Security</a> and <a href="/help/">Help</a> before
          relying on the service.
        </p>
      </section>
      <section>
        <h2>Availability and responsibility</h2>
        <p>
          The preview is provided as available, without a promise of uninterrupted operation,
          suitability for a particular purpose, or error-free transfers. To the extent allowed by
          applicable law, the operator excludes implied warranties and liability for losses arising
          from unavailable, failed, or misdirected transfers. Nothing in these terms excludes rights
          or liability that cannot legally be excluded.
        </p>
        <p>
          The service may change, be suspended, or be discontinued. Changes to these terms will
          appear here with an updated date and apply to subsequent use. There are no paid plans or
          service-level commitments for this preview.
        </p>
      </section>
      <section>
        <h2>Privacy and contact</h2>
        <p>
          The <a href="/privacy/">Privacy Policy</a> explains data handling. For questions, abuse
          reports, or concerns about these terms, email{' '}
          <a href="mailto:kumarkaushik871@gmail.com">kumarkaushik871@gmail.com</a>. Do not include
          private files, PINs, or full transfer links.
        </p>
      </section>
    </InformationPage>
  );
}
