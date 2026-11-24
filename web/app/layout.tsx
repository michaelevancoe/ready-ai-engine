import type { ReactNode } from 'react';
import { VisitShell } from './visit-shell';
import './globals.css';

export const metadata = {
  title: 'Example Harbor Fellowship',
  description: 'Avery Sampleton reviews a draft profile for Rowan Sampleton.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VisitShell>{children}</VisitShell>
      </body>
    </html>
  );
}
