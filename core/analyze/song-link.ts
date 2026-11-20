// Песня по ссылке: embed-плеер + ОЦЕНКА по метаданным (не анализ аудио — так и подписываем).
import type { AudioFeatures, SongMeta } from '../types';

export type LinkInfo =
  | { provider: 'youtube'; id: string; embed: string }
  | { provider: 'spotify'; id: string; type: string; embed: string }
  | { provider: 'soundcloud'; embed: string }
  | { provider: 'other'; embed?: undefined };

export function parseSongLink(url: string): LinkInfo | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop() || '';
    if (/^[\w-]{11}$/.test(id)) return { provider: 'youtube', id, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
  }
  if (host === 'open.spotify.com') {
    const [, type, id] = u.pathname.split('/');
    if (type && id) return { provider: 'spotify', id, type, embed: `https://open.spotify.com/embed/${type}/${id}` };
  }
  if (host === 'soundcloud.com') {
    return { provider: 'soundcloud', embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&visual=false` };
  }
  return { provider: 'other' };
}

const RULES: { re: RegExp; bpm: number; energy: number; mode?: 'major' | 'minor'; genre: string }[] = [
  { re: /lo-?fi|chill|ambient|sleep|колыбельн|медитац/i, bpm: 78, energy: 0.25, genre: 'ambient/lo-fi' },
  { re: /piano|фортепиан|nocturne|ноктюрн|sonata|соната|classical|классик|чайковск|шопен|debussy/i, bpm: 72, energy: 0.22, genre: 'classical' },
  { re: /acoustic|акустик|ballad|баллад|unplugged/i, bpm: 84, energy: 0.32, genre: 'acoustic' },
  { re: /jazz|джаз|bossa|босса|swing/i, bpm: 112, energy: 0.45, genre: 'jazz' },
  { re: /techno|house|edm|dance|танц|club|remix|ремикс|trance|drum.?n.?bass|dnb/i, bpm: 126, energy: 0.82, genre: 'electronic' },
  { re: /rock|рок|punk|панк|metal|метал|grunge/i, bpm: 138, energy: 0.8, genre: 'rock' },
  { re: /rap|рэп|hip.?hop|хип.?хоп|trap|трэп/i, bpm: 92, energy: 0.68, genre: 'hip-hop' },
  { re: /pop|поп/i, bpm: 116, energy: 0.6, genre: 'pop' },
];

/** Честная оценка темпа/лада по названию/жанру. confidence низкая, source: 'meta'. */
export function estimateFromMeta(meta: SongMeta | undefined): AudioFeatures {
  const hay = [meta?.title, meta?.artist, meta?.genre].filter(Boolean).join(' ');
  const rule = RULES.find((r) => r.re.test(hay));
  let mode: AudioFeatures['mode'] = 'unknown';
  if (/minor|минор|sad|груст|melanchol|тоск|rain|дожд/i.test(hay)) mode = 'minor';
  else if (/major|мажор|happy|sun|солн|summer|лето|joy/i.test(hay)) mode = 'major';
  return {
    source: 'meta', bpm: rule?.bpm ?? 104, energy: rule?.energy ?? 0.5,
    brightness: rule ? Math.min(1, rule.energy + 0.1) : 0.5, mode, confidence: rule ? 0.3 : 0.12,
  };
}

/** Ручные пресеты темпа для песни по ссылке (звук по ссылке не анализируется). */
export const TEMPO_PRESETS = [{ label: 'медленно', bpm: 76 }, { label: 'средне', bpm: 104 }, { label: 'быстро', bpm: 134 }] as const;
export type ManualSong = { bpm?: number; mode?: 'major' | 'minor' | 'unknown' };

/** Признаки песни по ссылке: оценка по метаданным; если человек задал темп/лад — source: 'manual'. */
export function linkAudio(meta: SongMeta | undefined, manual: ManualSong): AudioFeatures {
  const est = estimateFromMeta(meta);
  if (!manual.bpm && !manual.mode) return est;
  return { ...est, source: 'manual', bpm: manual.bpm ?? est.bpm, mode: manual.mode ?? est.mode, confidence: 0.5 };
}

export function metaGenreGuess(meta: SongMeta | undefined): string | undefined {
  const hay = [meta?.title, meta?.artist, meta?.genre].filter(Boolean).join(' ');
  return RULES.find((r) => r.re.test(hay))?.genre;
}
