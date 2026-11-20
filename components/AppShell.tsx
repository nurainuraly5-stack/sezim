'use client';
// Каркас: слева узкий сайдбар (лого + навигация), на телефоне — верхняя полоса.
// Две страницы навигации: «Архив» и «Новый день». Ничего, что не работает.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import { S } from '@/core/strings';
import { setLlmOff, useLlmOff } from '@/lib/flags';

const NAV = [
  { href: '/', label: S.archive, icon: 'M4 7.5h16M4 12h16M4 16.5h10' },
  { href: '/new', label: S.newDay, icon: 'M12 5v14M5 12h14' },
] as const;

function NavLink({ href, label, icon, compact }: { href: string; label: string; icon: string; compact?: boolean }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`t-ui flex items-center gap-3 rounded-[var(--r-md)] transition-colors ${compact ? 'min-h-[44px] gap-2 px-2.5' : 'min-h-[44px] px-3.5'}`}
      style={{ background: active ? 'var(--surface-strong)' : 'transparent', boxShadow: active ? 'var(--shadow-card)' : 'none', color: 'var(--ink)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}

/** Значок флага «LLM выключен» (lib/flags.ts) — виден на всех экранах, пока флаг включён. */
function LlmOffBadge() {
  const off = useLlmOff();
  if (!off) return null;
  return (
    <div role="status" title={S.llmOffHint} className="chip fixed bottom-4 left-4 z-50 gap-2 pr-1.5" style={{ background: 'var(--surface-strong)', boxShadow: 'var(--shadow-card)' }}>
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--ink-soft, currentColor)' }} />
      <span>{S.llmOff}</span>
      <button type="button" className="btn btn-quiet min-h-[32px] px-2.5" onClick={() => setLlmOff(false)}>{S.llmOn}</button>
    </div>
  );
}

export default function AppShell({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`min-h-[100dvh] lg:grid lg:grid-cols-[var(--sidebar-w)_1fr] ${className}`} style={style}>
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-10 px-5 py-7 lg:flex">
        <div className="px-1.5"><Logo /></div>
        <nav aria-label="Разделы" className="flex flex-col gap-1.5">
          {NAV.map((n) => <NavLink key={n.href} {...n} />)}
        </nav>
        <p className="t-micro mt-auto px-1.5">{S.sloganEn}</p>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line px-4 py-3 backdrop-blur-md lg:hidden" style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
        <Logo />
        <nav aria-label="Разделы" className="flex gap-1">
          {NAV.map((n) => <NavLink key={n.href} {...n} compact />)}
        </nav>
      </header>
      <div className="min-w-0">{children}</div>
      <LlmOffBadge />
    </div>
  );
}
