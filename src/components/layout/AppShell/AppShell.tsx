import Link from 'next/link';
import { SiteNavigation } from '../SiteNavigation/SiteNavigation';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          file<span>2</span>file<span className={styles.dot}>.</span>
        </Link>
        <span className={styles.badge}>TEST PREVIEW</span>
        <SiteNavigation />
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <span>From your browser. To theirs.</span>
        <SiteNavigation footer />
      </footer>
    </div>
  );
}
