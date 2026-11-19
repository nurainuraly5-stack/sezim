import type { Metadata, Viewport } from 'next';
import { Caveat, Cormorant_Garamond, Manrope } from 'next/font/google';
import './globals.css';
import { cssVariables } from '@/design/tokens';

const display = Cormorant_Garamond({ subsets: ['latin', 'cyrillic'], weight: ['300', '400', '500', '600', '700'], variable: '--font-display', display: 'swap' });
const sans = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' });
const hand = Caveat({ subsets: ['latin', 'cyrillic'], variable: '--font-hand', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sezim — Days you can feel again',
  description: 'Sezim собирает день из текста, фото и песни в светящуюся сферу воспоминания — Memory Orb.',
  applicationName: 'Sezim',
};

export const viewport: Viewport = { themeColor: '#07070b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" style={cssVariables() as React.CSSProperties}>
      <body className={`${display.variable} ${sans.variable} ${hand.variable} antialiased`}>
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}
