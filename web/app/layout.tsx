import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Example Harbor Fellowship',
  description: 'Avery Sampleton reviews a draft profile for Rowan Sampleton.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
