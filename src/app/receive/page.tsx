import type { Metadata } from 'next';
import { ReceiverView } from '@/features/transfer/components/ReceiverView/ReceiverView';

export const metadata: Metadata = { title: 'Receive a file — File2File' };

export default function ReceivePage() {
  return <ReceiverView />;
}
