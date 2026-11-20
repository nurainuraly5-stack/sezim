// Флаг «LLM выключен» — для демонстрации работы без LLM (видео, проверка без сети/ключа).
// Включается ссылкой ?llm=off, выключается ?llm=on или кнопкой на значке; помнится в браузере (localStorage).
// Пока включён: клиент не берёт LLM-ответы из кэша и просит сервер не вызывать модель — текст разбирает
// упрощённый анализ, день получает пометку «упрощённый анализ». Метаданные ссылки (oEmbed) работают.
'use client';
import { useSyncExternalStore } from 'react';

const KEY = 'sezim:llm-off';
const listeners = new Set<() => void>();

// ?llm=off|on применяется один раз за загрузку страницы и убирается из адреса — иначе кнопка «Включить»
// не срабатывала: каждое чтение снова видело ?llm=off в адресе и включало флаг обратно
let urlApplied = false;
function applyUrl() {
  if (urlApplied) return;
  urlApplied = true;
  const url = new URL(window.location.href);
  const q = url.searchParams.get('llm');
  if (q !== 'off' && q !== 'on') return;
  if (q === 'off') localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY);
  url.searchParams.delete('llm');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

function read(): boolean {
  try {
    applyUrl();
    return localStorage.getItem(KEY) === '1';
  } catch { return false; }
}

export function isLlmOff(): boolean {
  return typeof window !== 'undefined' && read();
}

export function setLlmOff(off: boolean) {
  try { if (off) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch {}
  listeners.forEach((l) => l());
}

export function useLlmOff(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    isLlmOff,
    () => false,
  );
}
