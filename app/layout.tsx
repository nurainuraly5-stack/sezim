import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { color, cssVariables } from '@/design/tokens';

// Один шрифт на всё приложение: Manrope (variable, кириллица), fallback — системный
const sans = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sezim — Days you can feel again',
  description: 'Sezim собирает день из текста, фото и песни в сферу воспоминания — Memory Orb.',
  applicationName: 'Sezim',
};

export const viewport: Viewport = { themeColor: color.light.bg, width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={sans.variable} style={cssVariables() as React.CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
