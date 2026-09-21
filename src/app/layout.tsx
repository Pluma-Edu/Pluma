import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pluma',
  description: 'Worksheets, assignments and practice over one item bank.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
