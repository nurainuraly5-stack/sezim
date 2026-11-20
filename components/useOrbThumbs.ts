'use client';
// Миниатюры сфер для архива: сохранённые PNG текущей версии рендера; устаревшие или отсутствующие
// перерисовываются по одной и сохраняются обратно в день (и попадают в thumb.png папки).
import { useEffect, useState } from 'react';
import type { DayEntry } from '@/core/types';
import { orbParams, orbSource } from '@/core/orb';
import { orbSize } from '@/design/tokens';
import { putThumb } from '@/lib/db';
import { ORB_RENDER_VERSION, renderOrbBlob } from './orb-engine';

export function useOrbThumbs(days: DayEntry[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let off = false;
    const made: string[] = [];
    const m: Record<string, string> = {};
    const add = (id: string, b: Blob) => { const u = URL.createObjectURL(b); made.push(u); m[id] = u; };
    for (const d of days) if (d.thumb && d.thumbV === ORB_RENDER_VERSION) add(d.id, d.thumb);
    setUrls({ ...m });
    (async () => {
      for (const d of days) {
        if (off) return;
        if (m[d.id]) continue;
        try {
          const blob = await renderOrbBlob(orbParams(orbSource(d)), orbSize.thumb);
          add(d.id, blob);
          // не сохранилась — не страшно: миниатюра всё равно показана, в следующий раз перерисуется
          await putThumb(d.id, blob, ORB_RENDER_VERSION).catch((e) => console.warn('thumb save', e));
          if (!off) setUrls({ ...m });
        } catch (e) {
          console.warn('thumb', e); // без WebGL — компонент Orb покажет плоскую сферу
        }
      }
    })();
    return () => { off = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [days]);
  return urls;
}
