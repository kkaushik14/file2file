import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell/AppShell';
import '@/styles/tokens.css';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'File2File — direct file sharing',
  description:
    'Share a file directly between two browsers. Encrypted single-file transfers. Free test preview.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
