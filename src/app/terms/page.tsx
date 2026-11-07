import type { Metadata } from 'next';
import { TermsView } from '@/features/information/components/TermsView/TermsView';

export const metadata: Metadata = {
  title: 'Terms of Use & Conditions — File2File',
  description:
    'The rules for using this free, experimental file-transfer service. These terms apply to the File2File preview.',
};

export default function Page() {
  return <TermsView />;
}
