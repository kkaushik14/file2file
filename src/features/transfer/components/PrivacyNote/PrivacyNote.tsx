import styles from './PrivacyNote.module.css';

export function PrivacyNote() {
  return (
    <aside className={styles.note} aria-label="Before you share">
      <p className={styles.eyebrow}>A SHORT HANDOFF</p>
      <h2>
        A private file.
        <br />A simple handoff.
      </h2>
      <ol>
        <li>
          <strong>Choose a file.</strong>
          <span>Up to 50 MiB. It stays in your browser until someone connects.</span>
        </li>
        <li>
          <strong>Send the link and PIN.</strong>
          <span>Use separate channels. Keep this tab open.</span>
        </li>
        <li>
          <strong>They verify and save.</strong>
          <span>The link expires after 15 minutes or when either side disconnects.</span>
        </li>
      </ol>
      <p className={styles.disclosure}>
        The PIN adds a barrier, but someone with the full link can guess it offline. Use this
        preview for testing, not sensitive production transfers.
      </p>
    </aside>
  );
}
