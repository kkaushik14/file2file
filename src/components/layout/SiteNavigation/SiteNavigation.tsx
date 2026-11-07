'use client';

import { usePathname } from 'next/navigation';
import styles from './SiteNavigation.module.css';

export function SiteNavigation({ footer = false }: { footer?: boolean }) {
  const path = usePathname();
  const links = footer
    ? [
        ['/terms/', 'Terms & Conditions'],
        ['/privacy/', 'Privacy'],
        ['/security/', 'Security'],
        ['/help/', 'Help'],
        ['/contact/', 'Contact'],
      ]
    : [
        ['/', 'Send a file'],
        ['/help/', 'Help'],
        ['/security/', 'Security'],
        ['/contact/', 'Contact'],
      ];
  return (
    <nav aria-label={footer ? 'Information' : 'Main'} className={styles.nav}>
      {links.map(([href, label]) => (
        <a
          key={href}
          href={href}
          aria-current={path.replace(/\/$/, '') === href.replace(/\/$/, '') ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
