import type { Metadata } from 'next';
import { SecurityView } from '@/features/information/components/SecurityView/SecurityView';

export const metadata: Metadata = {
  title: 'Security & reporting — File2File',
  description:
    'How the preview protects a transfer, its limits, and where to report a vulnerability privately.',
};

export default function Page() {
  return <SecurityView />;
}
