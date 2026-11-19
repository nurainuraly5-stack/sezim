// Панель «Почему так выглядит»: explain[] + палитра + ключевые числа.
import type { AudioFeatures, MoodProfile, StyleTokens } from '@/core/types';
import { TECHNIQUES } from '@/core/style-engine';
import { S } from '@/core/strings';

const Bar = ({ label, v }: { label: string; v: number }) => (
  <div className="flex items-center gap-3 text-[0.72rem] text-mute">
    <span className="w-24 shrink-0">{label}</span>
    <span className="relative h-px flex-1 bg-line">
      <span className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-ink" style={{ left: `calc(${Math.round(v * 100)}% - 3px)` }} />
    </span>
    <span className="w-9 text-right tabular-nums">{Math.round(v * 100)}</span>
  </div>
);

export default function WhyPanel({ explain, tokens, mood, engine, audio, compact }: {
  explain: string[]; tokens: StyleTokens; mood: MoodProfile; engine?: 'llm' | 'fallback'; audio?: AudioFeatures; compact?: boolean;
}) {
  const src = audio?.source === 'audio' ? S.audioReal : audio?.source === 'meta' ? S.audioMeta : audio?.source === 'manual' ? S.audioManual : null;
  return (
    <div className="space-y-5">
      <div>
        <p className="label">{S.whyTitle}</p>
        <p className="mt-2 font-display text-2xl text-ink">{TECHNIQUES[tokens.technique].name}</p>
      </div>
      <div className="flex gap-1.5" aria-label="Палитра дня">
        {tokens.palette.map((c, i) => (
          <span key={i} title={c} className="h-7 flex-1 rounded-[6px]" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }} />
        ))}
      </div>
      <div className="flex items-center gap-3 text-[0.72rem] text-mute">
        <span className="h-4 w-4 rounded-full" style={{ background: tokens.orb.rim }} /> оболочка
        <span className="ml-2 h-4 w-4 rounded-full" style={{ background: tokens.orb.core }} /> ядро
      </div>
      <ul className="space-y-2.5">
        {explain.map((e, i) => (
          <li key={i} className="border-l border-line pl-3 text-[0.84rem] leading-relaxed text-ink/85">{e}</li>
        ))}
      </ul>
      {!compact && (
        <div className="space-y-2.5 pt-1">
          <Bar label="светлость" v={mood.valence} />
          <Bar label="возбуждение" v={mood.arousal} />
          <Bar label="тепло" v={mood.warmth} />
          <Bar label="плотность" v={mood.density} />
          <Bar label="противоречие" v={mood.contrast} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-[0.68rem] text-faint">
        <span className="chip">{mood.tempo} BPM</span>
        {src && <span className="chip">{src}</span>}
        {engine && <span className="chip">{engine === 'llm' ? S.llm : S.simplified}</span>}
      </div>
    </div>
  );
}
