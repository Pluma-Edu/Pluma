import type { Metadata } from 'next';
import { Atkinson_Hyperlegible, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/*
 * Self-hosted at build time rather than fetched from Google at runtime: a
 * render-blocking font request is the single most common reason a worksheet
 * page is slow on school wifi, and the print renderer must never race a font
 * load — headless Chromium that paints before the font arrives silently
 * changes every line break on the page.
 */
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-atkinson',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Pluma — free worksheets, assignments and practice',
    template: '%s | Pluma',
  },
  description:
    'Free printable worksheets and a classroom that tells you what your students '
    + 'actually know. No ads, no paywall, no student accounts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${plexMono.variable}`}>
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
