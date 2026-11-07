import type { Metadata } from 'next';
import { PrivacyView } from '@/features/information/components/PrivacyView/PrivacyView';

export const metadata: Metadata = {
  title: 'Privacy Policy — File2File',
  description:
    'What stays in your browser, what the connection services process, and how to contact the operator.',
};

export default function Page() {
  return <PrivacyView />;
}
