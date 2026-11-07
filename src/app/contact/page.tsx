import type { Metadata } from 'next';
import { ContactView } from '@/features/information/components/ContactView/ContactView';

export const metadata: Metadata = {
  title: 'Contact File2File — File2File',
  description:
    'Support, privacy questions, abuse reports, and private security reports go directly to Kumar Kaushik.',
};

export default function Page() {
  return <ContactView />;
}
