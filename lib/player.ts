// Звук дня: музыка и озвучка через один AudioContext (разблокирован кликом — работает и в iOS/Safari),
// при озвучке музыка приглушается. Fallback озвучки — speechSynthesis браузера.
import type { DayEntry } from '@/core/types';
import { voiceScript } from './pipeline';

export type VoiceMode = 'saved' | 'browser' | 'none';

/** Голоса браузера грузятся асинхронно (Chrome): ждём voiceschanged, но не дольше timeout. */
export function loadBrowserVoices(timeout = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { synth.removeEventListener('voiceschanged', done); clearTimeout(t); resolve(synth.getVoices()); };
    const t = setTimeout(done, timeout);
    synth.addEventListener('voiceschanged', done);
  });
}

/** Лучший русский голос: локальный и «естественный» предпочтительнее. */
export function pickRuVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const ru = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ru'));
  const score = (v: SpeechSynthesisVoice) => (/natural|neural|online|google|milena|yandex/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return ru.sort((a, b) => score(b) - score(a))[0];
}

export class DayPlayer {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private music?: HTMLAudioElement;
  private voiceSrc?: AudioBufferSourceNode;
  private voiceBuf?: AudioBuffer;
  private ruVoice?: SpeechSynthesisVoice;
  /** Chrome теряет события фразы, если на неё нет ссылки (сборка мусора) — держим. */
  private utter?: SpeechSynthesisUtterance;
  private urls: string[] = [];
  private stopped = false;
  voiceMode: VoiceMode = 'none';
  /** Вызывается при начале/конце озвучки — для кнопки «Озвучка». */
  onVoiceState?: (speaking: boolean) => void;

  constructor(private day: DayEntry) {}

  /** Вызывать только из обработчика клика. */
  async start() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    // iOS: speechSynthesis тоже нужно «разбудить» внутри жеста — пустой фразой.
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {}
    }
    await this.ctx.resume();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);
    if (this.day.song.kind === 'file' && this.day.song.file) {
      const url = URL.createObjectURL(this.day.song.file);
      this.urls.push(url);
      this.music = new Audio(url);
      this.music.loop = true;
      this.ctx.createMediaElementSource(this.music).connect(this.gain);
      await this.music.play().catch(() => undefined);
      this.gain.gain.linearRampToValueAtTime(0.9, this.ctx.currentTime + 2.5);
    }
    await this.prepareVoice();
  }

  /** Сохранённый голос (mp3) → декодируем в буфер; иначе — русский голос браузера, если он есть. */
  async prepareVoice(voice: Blob | undefined = this.day.voice) {
    if (voice && this.ctx) {
      try {
        this.voiceBuf = await this.ctx.decodeAudioData(await voice.arrayBuffer());
        this.voiceMode = 'saved';
        return;
      } catch { /* битый файл → голос браузера */ }
    }
    const voices = await loadBrowserVoices();
    this.ruVoice = pickRuVoice(voices);
    // Без русского голоса браузер прочитает текст с чужим акцентом или промолчит — честнее не предлагать.
    this.voiceMode = this.ruVoice ? 'browser' : 'none';
  }

  private duck(on: boolean) {
    if (!this.ctx || !this.gain || !this.music) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(on ? 0.25 : 0.9, t + 0.8);
  }

  private ended = () => { this.duck(false); this.onVoiceState?.(false); };

  playVoice() {
    if (this.stopped) return;
    this.stopVoice();
    const { mood } = this.day;
    if (this.voiceMode === 'saved' && this.voiceBuf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.voiceBuf;
      src.connect(this.ctx.destination);
      src.onended = () => { if (this.voiceSrc === src) { this.voiceSrc = undefined; this.ended(); } };
      this.voiceSrc = src;
      this.duck(true);
      this.onVoiceState?.(true);
      src.start();
      return;
    }
    if (this.voiceMode !== 'browser') return;
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(voiceScript(mood.title, mood.quote));
    u.lang = this.ruVoice?.lang || 'ru-RU';
    if (this.ruVoice) u.voice = this.ruVoice;
    u.rate = mood.voiceStyle.pace === 'slow' ? 0.82 : mood.voiceStyle.pace === 'fast' ? 1.02 : 0.92;
    u.pitch = 0.9 + mood.voiceStyle.warmth * 0.2;
    const done = () => { if (this.utter === u) { this.utter = undefined; this.ended(); } };
    u.onend = done;
    u.onerror = done;
    this.utter = u;
    this.duck(true);
    this.onVoiceState?.(true);
    synth.speak(u);
  }

  stopVoice() {
    if (this.voiceSrc) {
      const s = this.voiceSrc;
      this.voiceSrc = undefined;
      try { s.stop(); } catch {}
      this.ended();
    }
    if (this.utter) {
      this.utter = undefined;
      window.speechSynthesis.cancel();
      this.ended();
    }
  }

  stop() {
    this.stopped = true;
    this.stopVoice();
    this.music?.pause();
    this.ctx?.close().catch(() => undefined);
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}
