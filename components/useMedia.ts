'use client';
import { useEffect, useState } from 'react';

/** Совпадает ли медиазапрос; на сервере и до гидрации — fallback. */
export function useMedia(query: string, fallback = false) {
  const [m, setM] = useState(fallback);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Ширина элемента (ResizeObserver): [ref-колбэк, ширина]. */
export function useWidth(fallback = 0): [(el: HTMLElement | null) => void, number] {
  const [w, setW] = useState(fallback);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}
