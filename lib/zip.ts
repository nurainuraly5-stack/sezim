// «Экспорт папки .zip»: реальная структура папки дня.
import JSZip from 'jszip';
import type { DayEntry } from '@/core/types';

const extOf = (b: Blob, name?: string) => {
  const fromName = name?.split('.').pop();
  if (fromName && fromName.length <= 4) return fromName.toLowerCase();
  const t = b.type;
  if (t.includes('mpeg')) return 'mp3';
  if (t.includes('wav')) return 'wav';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('png')) return 'png';
  if (t.includes('svg')) return 'svg';
  return 'jpg';
};

export function folderName(d: DayEntry) {
  const safe = d.mood.title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 48);
  return `${d.date}_${safe}`;
}

export async function exportDayZip(d: DayEntry): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(folderName(d))!;
  root.file('entry.json', JSON.stringify({
    id: d.id, date: d.date, title: d.mood.title, text: d.text, createdAt: d.createdAt,
    analysis: d.analysisEngine === 'llm' ? 'llm' : 'fallback (упрощённый анализ)',
    made_with: 'Sezim — Days you can feel again.',
  }, null, 2));
  const photos = root.folder('photos')!;
  d.photos.forEach((p, i) => photos.file(`${String(i + 1).padStart(2, '0')}.${extOf(p)}`, p));
  const { file, ...songRest } = d.song;
  root.file('song.json', JSON.stringify({ ...songRest, file: file ? `song.${extOf(file, d.song.fileName)}` : undefined }, null, 2));
  if (file) root.file(`song.${extOf(file, d.song.fileName)}`, file);
  root.file('memory.json', JSON.stringify({ mood: d.mood, tokens: d.tokens, explain: d.explain, photoFeatures: d.photoFeatures }, null, 2));
  if (d.voice) root.file(`voice.${extOf(d.voice)}`, d.voice);
  if (d.thumb) root.file('thumb.jpg', d.thumb);
  return zip.generateAsync({ type: 'blob' });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
