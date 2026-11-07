import type { ReactNode } from 'react';
import styles from './InformationPage.module.css';

export function InformationPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.page}>
      <p className={styles.eyebrow}>FILE2FILE / INFORMATION</p>
      <h1>{title}</h1>
      <p className={styles.intro}>{intro}</p>
      <p className={styles.date}>Updated 8 November 2026</p>
      <div className={styles.content}>{children}</div>
    </article>
  );
}
