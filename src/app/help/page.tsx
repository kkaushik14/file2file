import type { Metadata } from 'next';
import { HelpView } from '@/features/information/components/HelpView/HelpView';

export const metadata: Metadata = {
  title: 'Help with a transfer — File2File',
  description: 'A short guide to sending, receiving, and solving common connection problems.',
};

export default function Page() {
  return <HelpView />;
}
