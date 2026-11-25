import type { ReactNode } from 'react';
import { readStoreBoot } from '../server/account-boot';
import { signInOpen } from '../server/sign-in-gate';
import { SignInGate } from './sign-in-flow';
import { VisitShell } from './visit-shell';
import './globals.css';

export const metadata = {
  title: 'Example Harbor Fellowship',
  description: 'Avery Sampleton reviews a draft profile for Rowan Sampleton.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const boot = await readStoreBoot();
  return (
    <html lang="en">
      <body>
        {signInOpen() ? <SignInGate boot={boot}>{children}</SignInGate> : <VisitShell boot={boot}>{children}</VisitShell>}
      </body>
    </html>
  );
}
