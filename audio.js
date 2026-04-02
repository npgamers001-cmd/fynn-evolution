(() => {
  "use strict";

  const SB = window.Shardbound;

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.timer = null;
      this.step = 0;
      this.theme = SB.data.themes.lava;
      this.muted = false;
    }

    ensureContext() {
      if (this.ctx) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.92;
      this.musicGain.gain.value = 0.22;
      this.sfxGain.gain.value = 0.48;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
    }

    resume() {
      this.ensureContext();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    setTheme(themeKey) {
      this.theme = SB.data.themes[themeKey] || SB.data.themes.lava;
    }

    setMuted(value) {
      this.muted = value;
      if (!this.master || !this.ctx) return;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.92, this.ctx.currentTime, 0.025);
    }

    toggleMuted() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    midiToFreq(midi) {
      return 440 * Math.pow(2, (midi - 69) / 12);
    }

    beep({
      freq = 440,
      duration = 0.12,
      type = "triangle",
      volume = 0.08,
      attack = 0.004,
      release = 0.05,
      slideTo = null,
      destination = "sfx",
      when = 0
    } = {}) {
      if (!this.ctx || !this.master) return;
      const out = destination === "music" ? this.musicGain : this.sfxGain;
      const start = this.ctx.currentTime + when;
      const stop = start + duration;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), stop);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, stop + release);
      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(stop + release + 0.01);
    }

    noiseBurst({ duration = 0.12, volume = 0.05, cutoff = 1200, destination = "music", when = 0 } = {}) {
      if (!this.ctx) return;
      const frameCount = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, frameCount, this.ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i += 1) channel[i] = Math.random() * 2 - 1;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = cutoff;
      const gain = this.ctx.createGain();
      const start = this.ctx.currentTime + when;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination === "music" ? this.musicGain : this.sfxGain);
      source.start(start);
      source.stop(start + duration);
    }

    kick(when = 0, volume = 0.12) {
      if (!this.ctx) return;
      const start = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(130, start);
      osc.frequency.exponentialRampToValueAtTime(42, start + 0.18);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(start);
      osc.stop(start + 0.2);
    }

    startMusic() {
      if (!this.ctx || this.timer) return;
      this.step = 0;
      this.timer = setInterval(() => this.tickMusic(), 150);
    }

    sfx(name) {
      if (!this.ctx) return;
      switch (name) {
        case "jump":
          this.beep({ freq: 420, slideTo: 700, duration: 0.11, type: "square", volume: 0.1 });
          this.beep({ freq: 760, duration: 0.07, type: "triangle", volume: 0.05, when: 0.04 });
          break;
        case "orb":
          this.beep({ freq: 820, duration: 0.07, type: "triangle", volume: 0.09 });
          this.beep({ freq: 1160, duration: 0.1, type: "triangle", volume: 0.06, when: 0.03 });
          break;
        case "checkpoint":
          this.beep({ freq: 540, duration: 0.08, type: "triangle", volume: 0.08 });
          this.beep({ freq: 820, duration: 0.1, type: "triangle", volume: 0.08, when: 0.08 });
          break;
        case "respawn":
          this.beep({ freq: 330, slideTo: 510, duration: 0.14, type: "sawtooth", volume: 0.12 });
          break;
        case "finish":
          [69, 73, 76, 81].forEach((midi, index) => {
            this.beep({ freq: this.midiToFreq(midi), duration: 0.22, type: "triangle", volume: 0.08, when: index * 0.1 });
          });
          break;
        case "boost":
          this.beep({ freq: 290, slideTo: 980, duration: 0.15, type: "triangle", volume: 0.12 });
          break;
        case "wind":
          this.noiseBurst({ duration: 0.16, volume: 0.07, cutoff: 900, destination: "sfx" });
          break;
        case "button":
          this.beep({ freq: 620, duration: 0.05, type: "square", volume: 0.05 });
          break;
        case "pause":
          this.beep({ freq: 520, duration: 0.08, type: "square", volume: 0.05 });
          break;
      }
    }

    tickMusic() {
      if (!this.ctx || !this.theme) return;
      const step = this.step % 16;
      const bar = Math.floor(this.step / 16) % this.theme.musicRoots.length;
      const root = this.theme.musicRoots[bar];
      const bright = this.theme === SB.data.themes.alien || this.theme === SB.data.themes.chrono;
      const wave = bright ? "triangle" : this.theme === SB.data.themes.storm ? "square" : "sine";
      const leadIntervals = bright ? [0, 4, 7, 12] : [0, 3, 7, 10];
      const leadMidi = root + 12 + leadIntervals[step % leadIntervals.length];
      const bassMidi = root - 12 + (step % 8 === 0 ? 0 : 7);

      this.beep({ freq: this.midiToFreq(leadMidi), duration: 0.11, type: wave, volume: 0.042, destination: "music" });
      if (step === 0 || step === 8) {
        this.beep({ freq: this.midiToFreq(bassMidi), duration: 0.25, type: "triangle", volume: 0.07, destination: "music" });
      }
      if (step % 4 === 0) this.kick(0, 0.09);
      if (step === 4 || step === 12) this.noiseBurst({ cutoff: 1600, volume: 0.04, destination: "music" });
      if (this.theme === SB.data.themes.storm && step % 8 === 6) {
        this.beep({ freq: this.midiToFreq(root + 19), duration: 0.08, type: "triangle", volume: 0.04, destination: "music" });
      }
      this.step += 1;
    }
  }

  SB.audio = new AudioManager();
  SB.audio.setMuted(SB.saveData.settings.muted);
})();
