import { InformationPage } from '../InformationPage/InformationPage';

export function ContactView() {
  return (
    <InformationPage
      title="Contact File2File"
      intro="Support, privacy questions, abuse reports, and private security reports go directly to Kumar Kaushik."
    >
      <section>
        <h2>Get in touch</h2>
        <p>
          <a href="mailto:kumarkaushik871@gmail.com">kumarkaushik871@gmail.com</a>
        </p>
        <p>
          Email links open your email app; nothing is submitted by this page. You can also copy the
          address into your preferred mail service. Response times are not guaranteed.
        </p>
        <ul>
          <li>
            <a href="mailto:kumarkaushik871@gmail.com?subject=File2File%20support">
              Transfer help or a bug report
            </a>{' '}
            — include your browser and device, the error text, and steps to reproduce.
          </li>
          <li>
            <a href="mailto:kumarkaushik871@gmail.com?subject=File2File%20privacy%20request">
              Privacy request
            </a>{' '}
            — describe the information or request you need help with.
          </li>
          <li>
            <a href="mailto:kumarkaushik871@gmail.com?subject=File2File%20security%20report">
              Private security report
            </a>{' '}
            — include a minimal reproduction using your own test data. Read the{' '}
            <a href="/security/">reporting guidance</a>.
          </li>
          <li>
            <a href="mailto:kumarkaushik871@gmail.com?subject=File2File%20abuse%20report">
              Abuse report
            </a>{' '}
            — describe the issue without forwarding unlawful content or another person’s private
            files.
          </li>
        </ul>
      </section>
      <section>
        <h2>Keep your report safe</h2>
        <p>
          Do not send PINs, full transfer links, credentials, private files, or screenshots
          containing them. Remove these details from logs and screenshots first. The service cannot
          recover a file or recall a download already saved by someone else.
        </p>
        <p>
          Read <a href="/help/">Help</a> for common connection problems and the{' '}
          <a href="/privacy/">Privacy Policy</a> for how correspondence is handled.
        </p>
      </section>
    </InformationPage>
  );
}
