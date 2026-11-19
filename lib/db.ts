// IndexedDB через Dexie. День хранится единым объектом (папка собирается при экспорте).
import Dexie, { type EntityTable } from 'dexie';
import type { DayEntry } from '@/core/types';

class SezimDB extends Dexie {
  days!: EntityTable<DayEntry, 'id'>;
  cache!: EntityTable<{ key: string; value: unknown; at: number }, 'key'>;
  constructor() {
    super('sezim');
    this.version(1).stores({ days: 'id, date, createdAt', cache: 'key' });
  }
}

export const db = new SezimDB();

export const listDays = () => db.days.orderBy('date').reverse().toArray();
export const getDay = (id: string) => db.days.get(id);
export const putDay = (d: DayEntry) => db.days.put(d);
export const deleteDay = (id: string) => db.days.delete(id);

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await db.cache.get(key))?.value as T | undefined;
}
export async function cacheSet(key: string, value: unknown) {
  await db.cache.put({ key, value, at: Date.now() });
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
