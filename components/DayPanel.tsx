'use client';
// Панель открытого дня в архиве: дата и день недели, фото, название, текст, моменты дня, песня.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DayEntry } from '@/core/types';
import { S, formatDate, formatWeekday } from '@/core/strings';
import { folderName } from '@/lib/zip';
import SongPlayer from './SongPlayer';

export default function DayPanel({ day }: { day: DayEntry }) {
  const [photo, setPhoto] = useState('');
  useEffect(() => {
    const b = day.photos[0];
    if (!b) { setPhoto(''); return; }
    const u = URL.createObjectURL(b);
    setPhoto(u);
    return () => URL.revokeObjectURL(u);
  }, [day]);

  return (
    <article className="card flex flex-col gap-5 p-5" aria-label={day.mood.title}>
      <header className="flex items-baseline justify-between gap-3">
        <p className="t-h3">{formatDate(day.date).replace(/\s*г\.?$/, '')}</p>
        <p className="t-date">{formatWeekday(day.date)}</p>
      </header>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="aspect-[4/3] w-full rounded-[var(--r-md)] object-cover" />
      )}
      <div>
        <h2 className="t-h2">{day.mood.title}</h2>
        <p className="t-body soft mt-3 line-clamp-5">{day.text}</p>
      </div>
      {day.mood.motifs.length > 0 && (
        <section>
          <h3 className="t-caption">{S.momentsOfDay}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {day.mood.motifs.map((m) => <li key={m} className="chip">{m}</li>)}
          </ul>
        </section>
      )}
      <SongPlayer key={day.id} day={day} />
      <div className="flex flex-col gap-2">
        <Link href={`/day/${day.id}`} className="btn btn-primary w-full">{S.openDay}</Link>
        <p className="t-micro text-center">{S.folder}: {folderName(day)}</p>
      </div>
    </article>
  );
}
