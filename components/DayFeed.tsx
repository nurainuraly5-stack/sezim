'use client';
// Лента архива (ленточный тест): последние 5–7 дней подряд, от раннего к позднему, как страницы
// дневника одного автора. Постоянное — место даты, сферы, названия и цитаты; переменное — сфера,
// палитра, техника и темп конкретного дня.
import { useMemo, useState } from 'react';
import type { DayEntry } from '@/core/types';
import { orbParams, orbSource } from '@/core/orb';
import { orbFrame, orbSize } from '@/design/tokens';
import { TECHNIQUES } from '@/core/style-engine';
import { S, DAYPART_RU, formatDate, formatWeekday, modeApprox, modeRu, moodSummary } from '@/core/strings';
import Orb from './Orb';

export const FEED_LIMIT = 7;

export default function DayFeed({ days, selected, thumbs, mobile, onPick }: {
  days: DayEntry[]; selected?: string; thumbs: Record<string, string>; mobile: boolean; onPick: (d: DayEntry) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // days приходят от нового к старому; в ленте — последние FEED_LIMIT в порядке дат
  const feed = useMemo(() => days.slice(0, FEED_LIMIT).reverse(), [days]);
  const params = useMemo(() => new Map(feed.map((d) => [d.id, orbParams(orbSource(d))])), [feed]);
  const body = mobile ? orbSize.feed.mobile : orbSize.feed.desktop;
  const frame = Math.round(body / (orbFrame.radius * 2));
  const col = body + (mobile ? 8 : 16);
  const pad = mobile ? 8 : 12;

  return (
    <div>
      {days.length > FEED_LIMIT && <p className="t-caption mb-4">{S.feedLimit(FEED_LIMIT, days.length)}</p>}
      <ol className="relative flex flex-col gap-3">
        {/* нить дневника: соединяет дни подряд */}
        <span aria-hidden className="absolute bottom-8 top-8 w-px" style={{ left: pad + col / 2, background: 'var(--line)' }} />
        {feed.map((d) => {
          const on = selected === d.id;
          const live = on || hover === d.id;
          const meta = [
            moodSummary(d.mood),
            // без анализа файла темп — оценка, подписываем «≈»
            d.mood.tempo ? `${d.song.analysis ? '' : '≈'}${Math.round(d.mood.tempo)} BPM` : '',
            d.song.analysis && modeApprox(d.song.analysis) && d.mood.mode === d.song.analysis.mode ? `≈ ${modeRu(d.mood.mode)}` : modeRu(d.mood.mode),
            TECHNIQUES[d.tokens.technique].name,
          ].filter(Boolean).join(' · ');
          return (
            <li key={d.id} className="relative">
              <button
                onClick={() => onPick(d)}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(d.id); }}
                onPointerLeave={() => setHover(null)}
                aria-pressed={on}
                aria-label={`${d.mood.title}, ${formatDate(d.date)}`}
                className="grid w-full items-start gap-x-3 rounded-[var(--r-lg)] text-left transition-colors md:gap-x-4"
                style={{
                  padding: pad,
                  gridTemplateColumns: `${col}px minmax(0,1fr)`,
                  background: on ? 'var(--surface)' : 'transparent',
                  boxShadow: on ? 'inset 0 0 0 1px var(--line)' : 'none',
                }}
              >
                <span className="relative block" style={{ height: body + 8 }}>
                  <Orb
                    params={params.get(d.id)!} size={frame} live={live} hover={live} thumbUrl={thumbs[d.id]}
                    className="pointer-events-none absolute left-1/2"
                    style={{ top: 4 + body / 2 - frame * orbFrame.cy, marginLeft: -frame / 2 }}
                  />
                </span>
                <span className="block min-w-0">
                  <span className="t-date block">
                    {formatDate(d.date).replace(/\s*г\.?$/, '')} · {formatWeekday(d.date)}
                    {DAYPART_RU[d.mood.daypart] ? ` · ${DAYPART_RU[d.mood.daypart]}` : ''}
                  </span>
                  <span className="t-h3 mt-1 block">{d.mood.title}</span>
                  {d.mood.quote && <span className="t-body mt-2 block measure">«{d.mood.quote}»</span>}
                  <span className="mt-3 flex items-center gap-1.5" aria-hidden>
                    {d.tokens.palette.slice(0, 6).map((c, i) => (
                      <span key={i} className="h-2 w-6 rounded-full" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }} />
                    ))}
                  </span>
                  <span className="t-caption mt-2 block">{meta}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
