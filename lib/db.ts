// IndexedDB через Dexie. День хранится единым объектом (папка собирается при экспорте).
// Двоичные данные (фото, файл песни, голос, миниатюра) хранятся как ArrayBuffer + тип, а не Blob:
// Safari в приватном режиме (и часть сборок WebKit) не умеет класть Blob в IndexedDB —
// «UnknownError: Error preparing Blob/File data to be stored in object store», и день не сохраняется.
// Наружу — по-прежнему Blob; старые записи с Blob читаются как есть.
import Dexie, { type EntityTable } from 'dexie';
import type { DayEntry } from '@/core/types';

type StoredBin = { bin: ArrayBuffer; type: string };
type Bin = Blob | StoredBin;
type StoredDay = Omit<DayEntry, 'photos' | 'voice' | 'thumb' | 'song'> & {
  photos: Bin[]; voice?: Bin; thumb?: Bin;
  song: Omit<DayEntry['song'], 'file'> & { file?: Bin };
};

class SezimDB extends Dexie {
  days!: EntityTable<StoredDay, 'id'>;
  cache!: EntityTable<{ key: string; value: unknown; at: number }, 'key'>;
  constructor() {
    super('sezim');
    this.version(1).stores({ days: 'id, date, createdAt', cache: 'key' });
  }
}

export const db = new SezimDB();

async function pack(b: Blob): Promise<StoredBin>;
async function pack(b?: Blob): Promise<StoredBin | undefined>;
async function pack(b?: Blob) {
  return b ? { bin: await b.arrayBuffer(), type: b.type } : undefined;
}
function unpack(x: Bin): Blob;
function unpack(x?: Bin): Blob | undefined;
function unpack(x?: Bin) {
  if (!x || x instanceof Blob) return x;
  return new Blob([x.bin], { type: x.type });
}

async function toStored(d: DayEntry): Promise<StoredDay> {
  return {
    ...d,
    photos: await Promise.all(d.photos.map((p) => pack(p))),
    voice: await pack(d.voice), thumb: await pack(d.thumb),
    song: { ...d.song, file: await pack(d.song.file) },
  };
}
function fromStored(r: StoredDay): DayEntry {
  return {
    ...r,
    photos: r.photos.map((p) => unpack(p)),
    voice: unpack(r.voice), thumb: unpack(r.thumb),
    song: { ...r.song, file: unpack(r.song.file) },
  };
}

export const listDays = async () => (await db.days.orderBy('date').reverse().toArray()).map(fromStored);
export const getDay = async (id: string) => { const r = await db.days.get(id); return r ? fromStored(r) : undefined; };
export const putDay = async (d: DayEntry) => db.days.put(await toStored(d));
export const deleteDay = (id: string) => db.days.delete(id);
/** Перерисованная миниатюра сферы (архив обновляет устаревшие). */
export const putThumb = async (id: string, thumb: Blob, thumbV: number) => db.days.update(id, { thumb: await pack(thumb), thumbV });

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await db.cache.get(key))?.value as T | undefined;
}
export async function cacheSet(key: string, value: unknown) {
  await db.cache.put({ key, value, at: Date.now() });
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
