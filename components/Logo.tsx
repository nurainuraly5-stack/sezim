import Link from 'next/link';

/** Единственное лого в шапке: маленькая сфера + словесный знак. */
export default function Logo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="Sezim — архив">
      <span
        className="h-3.5 w-3.5 rounded-full transition-shadow duration-700 group-hover:shadow-[0_0_18px_4px_rgba(233,197,143,0.55)]"
        style={{ background: 'radial-gradient(circle at 35% 30%, #fff4dc 0%, #e9c58f 45%, #6d7fa3 100%)', boxShadow: '0 0 10px 1px rgba(233,197,143,0.35)' }}
      />
      <span className="font-display text-[1.15rem] tracking-[0.06em] text-ink">Sezim</span>
    </Link>
  );
}
