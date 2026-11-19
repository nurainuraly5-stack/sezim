// «Атмосфера дня»: шесть осей MoodProfile — горизонтальные шкалы с подписью и значением.
// Данные — из MoodProfile дня, ничего не дорисовано. Одна серия → один цвет (акцент), без легенды.
import type { MoodProfile } from '@/core/types';
import { tempoNorm } from '@/core/mood';
import { S } from '@/core/strings';

type Axis = { key: string; label: string; v: number; value: string; hint: string };

export function atmosphereAxes(m: MoodProfile): Axis[] {
  const pct = (v: number) => `${Math.round(v * 100)}`;
  return [
    { key: 'valence', label: 'Светлость', v: m.valence, value: pct(m.valence), hint: 'насколько день светлый или тяжёлый' },
    { key: 'arousal', label: 'Энергия', v: m.arousal, value: pct(m.arousal), hint: 'спокойный или насыщенный' },
    { key: 'warmth', label: 'Тепло', v: m.warmth, value: pct(m.warmth), hint: 'холодные или тёплые детали, фото и лад' },
    { key: 'density', label: 'Плотность', v: m.density, value: pct(m.density), hint: 'сколько событий и кадров' },
    { key: 'contrast', label: 'Противоречие', v: m.contrast, value: pct(m.contrast), hint: 'например: холодно, но тепло' },
    { key: 'tempo', label: 'Темп', v: tempoNorm(m.tempo), value: `${Math.round(m.tempo)} BPM`, hint: 'темп песни или текста' },
  ];
}

export default function AtmosphereChart({ mood }: { mood: MoodProfile }) {
  const axes = atmosphereAxes(mood);
  return (
    <figure>
      <dl className="flex flex-col gap-3.5">
        {axes.map((a) => (
          <div key={a.key} title={`${a.label}: ${a.value} — ${a.hint}`}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="t-caption" style={{ color: 'var(--ink)' }}>{a.label}</dt>
              <dd className="t-caption tabular-nums">{a.value}</dd>
            </div>
            <div className="mt-1.5 h-2 rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 9%, transparent)' }} aria-hidden>
              <div className="h-2 rounded-full" style={{ width: `${Math.max(3, Math.round(a.v * 100))}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        ))}
      </dl>
      <figcaption className="t-micro mt-4">{S.notDiagnosis}</figcaption>
    </figure>
  );
}
