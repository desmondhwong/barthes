import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: { default: 'Barthes', template: '%s — Barthes' },
  description: 'Read interconnected pages and explore their authored links.',
  authors: [{ name: 'desmond' }],
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><link rel="stylesheet" href="/reader.css" /></head><body>{children}</body></html>;
}
