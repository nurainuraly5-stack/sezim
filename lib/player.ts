// Звук дня: музыка (Web Audio, старт только по клику) + озвучка с приглушением музыки.
import type { DayEntry } from '@/core/types';
import { voiceScript } from './pipeline';

export class DayPlayer {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private music?: HTMLAudioElement;
  private voiceEl?: HTMLAudioElement;
  private urls: string[] = [];
  voiceMode: 'saved' | 'browser' | 'none' = 'none';

  constructor(private day: DayEntry) {
    this.voiceMode = day.voice ? 'saved' : typeof window !== 'undefined' && 'speechSynthesis' in window ? 'browser' : 'none';
  }

  /** Вызывать только из обработчика клика. */
  async start() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
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
  }

  private duck(on: boolean) {
    if (!this.ctx || !this.gain) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(on ? 0.28 : 0.9, t + 0.8);
  }

  playVoice(onEnd?: () => void) {
    const { mood } = this.day;
    if (this.day.voice) {
      const url = URL.createObjectURL(this.day.voice);
      this.urls.push(url);
      this.voiceEl?.pause();
      this.voiceEl = new Audio(url);
      this.duck(true);
      this.voiceEl.onended = () => { this.duck(false); onEnd?.(); };
      this.voiceEl.play().catch(() => { this.duck(false); onEnd?.(); });
      return;
    }
    if (this.voiceMode !== 'browser') return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(voiceScript(mood.title, mood.quote));
    u.lang = 'ru-RU';
    const ru = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ru'));
    if (ru) u.voice = ru;
    u.rate = mood.voiceStyle.pace === 'slow' ? 0.82 : mood.voiceStyle.pace === 'fast' ? 1.02 : 0.92;
    u.pitch = 0.9 + mood.voiceStyle.warmth * 0.2;
    this.duck(true);
    u.onend = () => { this.duck(false); onEnd?.(); };
    u.onerror = () => { this.duck(false); onEnd?.(); };
    synth.speak(u);
  }

  stop() {
    this.music?.pause();
    this.voiceEl?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.ctx?.close().catch(() => undefined);
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}
