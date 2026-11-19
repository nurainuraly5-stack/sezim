import Link from 'next/link';
import { useId } from 'react';
import { color } from '@/design/tokens';

/** Контур звезды с волной внутри; обводка — градиент персик → лаванда → голубой (не перекрашивается). */
export const LOGO_STAR = 'M12 1.6 Q14.4 9.6 22.4 12 Q14.4 14.4 12 22.4 Q9.6 14.4 1.6 12 Q9.6 9.6 12 1.6 Z';
export const LOGO_WAVE = 'M7.4 12.5 C8.9 10.9 10.3 10.9 12 12.2 C13.7 13.5 15.1 13.5 16.6 11.9';

export function LogoMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color.brand[0]} />
          <stop offset="0.52" stopColor={color.brand[1]} />
          <stop offset="1" stopColor={color.brand[2]} />
        </linearGradient>
      </defs>
      <path d={LOGO_STAR} stroke={`url(#${id})`} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={LOGO_WAVE} stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-[10px]" aria-label="Sezim — архив">
      <LogoMark />
      <span className="t-h3" style={{ letterSpacing: '-0.01em' }}>Sezim</span>
    </Link>
  );
}
