import type { TransferProgress } from '../../domain/session';
import styles from './TransferStatus.module.css';

export function TransferStatus({ progress }: { progress: TransferProgress }) {
  const percentage = progress.total ? Math.round((progress.bytes / progress.total) * 100) : 0;
  return (
    <section className={styles.status} aria-label="Transfer progress">
      <p role="status">{progress.label}</p>
      <progress
        aria-label="File transfer"
        max={Math.max(progress.total, 1)}
        value={progress.bytes}
      />
      <div>
        <span>
          {(progress.bytes / 1024 / 1024).toFixed(2)} / {(progress.total / 1024 / 1024).toFixed(2)}{' '}
          MiB
        </span>
        <span>{percentage}%</span>
      </div>
    </section>
  );
}
