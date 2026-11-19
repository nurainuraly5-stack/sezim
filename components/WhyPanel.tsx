// «Почему так выглядит»: 3–5 строк explain[] + палитра дня + честные пометки об источниках.
import type { AudioFeatures, StyleTokens } from '@/core/types';
import { TECHNIQUES } from '@/core/style-engine';
import { S } from '@/core/strings';

export default function WhyPanel({ explain, tokens, engine, audio }: {
  explain: string[]; tokens: StyleTokens; engine?: 'llm' | 'fallback'; audio?: AudioFeatures;
}) {
  const src = audio?.source === 'audio' ? S.audioReal : audio?.source === 'meta' ? S.audioMeta : audio?.source === 'manual' ? S.audioManual : null;
  const t = TECHNIQUES[tokens.technique];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="t-title">{t.name}</p>
        <p className="t-caption mt-0.5">{t.ref}</p>
      </div>
      <div className="flex gap-1.5" aria-label="Палитра дня">
        {tokens.palette.map((c, i) => (
          <span key={i} title={c} className="h-6 flex-1 rounded-[var(--r-sm)]" style={{ background: c, boxShadow: 'inset 0 0 0 1px var(--line)' }} />
        ))}
      </div>
      <ul className="flex flex-col gap-2.5">
        {explain.slice(0, 5).map((e, i) => (
          <li key={i} className="t-caption border-l-2 pl-3" style={{ color: 'var(--ink)', borderColor: 'var(--line)' }}>{e}</li>
        ))}
      </ul>
      {(src || engine) && (
        <div className="flex flex-wrap gap-2">
          {src && <span className="chip">{src}</span>}
          {engine && <span className="chip">{engine === 'llm' ? S.llm : S.simplified}</span>}
        </div>
      )}
    </div>
  );
}
