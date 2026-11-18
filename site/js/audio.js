// Procedural retro-futuristic sound effects (Web Audio API, no audio files).
import { Store } from './storage.js';

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

class Synth {
  constructor() {
    this.ctx = null;
    this.muted = Store.muted;
    this._noise = null;
  }

  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    Store.setMuted(m);
    if (this.ctx) this.ctx[m ? 'suspend' : 'resume']();
  }

  tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.25, slide = 0, delay = 0, attack = 0.005 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.3, freq = 1200, endFreq = 120, delay = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this._noise) {
      const len = ctx.sampleRate * 1.5;
      this._noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this._noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click() { this.tone({ freq: 900, type: 'square', dur: 0.04, vol: 0.08 }); this.tone({ freq: 1500, type: 'sine', dur: 0.05, vol: 0.06, delay: 0.02 }); }
  hover() { this.tone({ freq: 1800, type: 'sine', dur: 0.03, vol: 0.03 }); }
  laser() { this.tone({ freq: 1500, type: 'sawtooth', dur: 0.16, vol: 0.1, slide: -1200 }); }
  zap() { this.tone({ freq: 2200, type: 'square', dur: 0.05, vol: 0.05, slide: -1200 }); }
  explosion() { this.noise({ dur: 0.5, vol: 0.45, freq: 2200, endFreq: 60 }); this.tone({ freq: 110, type: 'sine', dur: 0.35, vol: 0.3, slide: -70 }); }
  hit() { this.tone({ freq: 520, type: 'square', dur: 0.05, vol: 0.08 }); }
  bounce() { this.tone({ freq: 330, type: 'triangle', dur: 0.08, vol: 0.15 }); }
  pickup() { [660, 880, 1320].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.12, delay: i * 0.06 })); }
  error() { this.tone({ freq: 160, type: 'square', dur: 0.18, vol: 0.12, slide: -40 }); }
  whoosh() { this.noise({ dur: 0.9, vol: 0.18, freq: 400, endFreq: 3000 }); }
  chime() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.14, delay: i * 0.09 })); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.22, vol: 0.08, delay: i * 0.12 })); }
  note(i, dur = 0.35) { this.tone({ freq: PENTATONIC[i % PENTATONIC.length], type: 'triangle', dur, vol: 0.22 }); }
  thrust() { this.noise({ dur: 0.12, vol: 0.08, freq: 600, endFreq: 200 }); }
}

export const audio = new Synth();
