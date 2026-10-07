// Draws parameter models. Only the two top views read measured output.
import { shelfResponse } from "./tone.js";
import { measure, record } from "../profiler/capture.js";
import { SETTINGS, ADV_SETTINGS, cutoffToSlider } from "./config.js";
import { params, audio, voices, held, frequency, envelopeLevel } from "./audio.js";
import { performanceNotes, gatePattern, clockTimer, clockOrigin } from "./sequencer.js";
const miniPlots = new Map;
let filterResponse = null;
function setFilterResponse(values) {
  filterResponse = values;
}
function waveAt(type, phase) {
  const f = (phase / (2 * Math.PI) % 1 + 1) % 1;
  return type === "sine" ? Math.sin(phase) : type === "square" ? f < 0.5 ? 1 : -1 : type === "triangle" ? 2 / Math.PI * Math.asin(Math.sin(phase)) : 2 * (f - Math.floor(f + 0.5));
}
function linePath(fn, width = 320) {
  let path = "";
  for (let i = 0;i <= SETTINGS.diagramPoints; i++) {
    const x = i / SETTINGS.diagramPoints;
    path += (i ? "L" : "M") + (x * width).toFixed(1) + " " + fn(x).toFixed(1);
  }
  return path;
}
function miniLine(plot, values, color = "#96d3bf", center = 0.5, scale = 0.4) {
  const { ctx, width: w, height: h } = plot;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0;i < SETTINGS.miniPoints; i++) {
    const x = i / (SETTINGS.miniPoints - 1) * w, y = h * (center - Math.max(-1, Math.min(1, values(i))) * scale);
    if (i)
      ctx.lineTo(x, y);
    else
      ctx.moveTo(x, y);
  }
  ctx.stroke();
}
function drawCards(...args) { return measure("visualizers.drawCards", drawCardsImpl, args); }
function drawCardsImpl(frame) {
  const t = audio?.currentTime || 0, active = voices.size > 0, phase = active ? t : 0;
  for (const [key, plot] of miniPlots) {
    if (!plot.visible)
      continue;
    const { ctx, width: w, height: h } = plot;
    if (!w || !h)
      continue;
    const started = performance.now();
    try {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#293433";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    const path = (fn, color = "#96d3bf", center = 0.5, scale = 0.36) => miniLine(plot, (i) => fn(i / (SETTINGS.miniPoints - 1)), color, center, scale);
    const label = (text, x = 10, y = h - 8) => {
      ctx.fillStyle = "#9a9f9e";
      ctx.font = "10px ui-monospace,monospace";
      ctx.fillText(text, x, y);
    };
    const dot = (x, y) => {
      ctx.fillStyle = "#ecc17a";
      ctx.beginPath();
      ctx.arc(x * w, y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    };
    if (key === "compressor") {
      path((x) => x, "#47574f", 0.88, 0.76);
      path((x) => {
        const input = -60 + x * 60;
        const output = input <= params.compThreshold ? input : params.compThreshold + (input - params.compThreshold) / params.compRatio;
        return (output + 60) / 60;
      }, undefined, 0.88, 0.76);
      label("Input → output");
      continue;
    }
    if (key === "pwm") {
      const duty = params.pulseWidth / 100;
      path((x) => params.pwmOn ? x * 3 % 1 < duty ? 1 : -1 : waveAt(params.wave, x * Math.PI * 6));
      continue;
    }
    if (key === "velocity") {
      path((x) => 1 - params.velocitySense / 100 + x * params.velocitySense / 100, undefined, 0.85, 0.7);
      label("Soft → hard");
      continue;
    }
    if (key === "tracking") {
      path((x) => (x - 0.5) * params.keyTrack / 100 * 1.5);
      label("Low note → high note");
      continue;
    }
    if (key === "voicemode") {
      const count = params.voiceMode ? 1 : 3;
      for (let n = 0;n < count; n++)
        path((x) => Math.sin(x * Math.PI * (4 + n * 2)) * 0.6, ["#ecc17a", "#96d3bf", "#729e93"][n], 0.25 + n * 0.23, 0.13);
      label(["Chords", "One note", "Connected notes"][params.voiceMode]);
      continue;
    }
    if (key === "arp" || key === "stepseq" || key === "gateseq") {
      const count = key === "gateseq" ? 8 : 4, current = Math.max(0, Math.floor(((audio?.currentTime || 0) - clockOrigin) / (60 / params.tempo / 2))) % count;
      for (let n = 0;n < count; n++) {
        const x = (n + 0.5) / count, level = key === "gateseq" ? gatePattern[n] : key === "stepseq" ? (params["step" + n] + 12) / 24 : params.arpMode === 2 ? 1 - n / 4 : (n + 1) / 4;
        ctx.strokeStyle = n === current && clockTimer !== null ? "#ecc17a" : "#96d3bf";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x * w, h * 0.85);
        ctx.lineTo(x * w, h * (0.85 - level * 0.65));
        ctx.stroke();
      }
      label(params.tempo + " BPM");
      continue;
    }
    if (key === "phaser") {
      path((x) => 0.55 - params.phaser / 100 * 0.5 * Math.pow(Math.sin(x * Math.PI * 4 + phase * params.phaserRate), 8), undefined, 0.88, 0.8);
      continue;
    }
    if (key === "flanger") {
      path((x) => Math.sin(x * Math.PI * 8), "#47574f");
      path((x) => Math.sin(x * Math.PI * 8 + Math.sin(phase * params.flangerRate * 2 * Math.PI) * 0.7 + 0.5) * params.flanger / 100);
      continue;
    }
    if (key === "ring") {
      path((x) => Math.sin(x * Math.PI * 6) * (1 - params.ring / 100 + params.ring / 100 * Math.sin(x * Math.PI * 2 * params.ringFreq / 100)));
      continue;
    }
    if (key === "fm") {
      path((x) => Math.sin(x * Math.PI * 6 + params.fmIndex * Math.sin(x * Math.PI * 6 * params.fmRatio)));
      continue;
    }
    if (key === "wavetable") {
      const pos = params.tablePosition / 50;
      path((x) => !params.tableOn ? waveAt(params.wave, x * Math.PI * 6) : pos <= 1 ? Math.sin(x * Math.PI * 6) * (1 - pos) + waveAt("triangle", x * Math.PI * 6) * pos : waveAt("triangle", x * Math.PI * 6) * (2 - pos) + waveAt("sawtooth", x * Math.PI * 6) * (pos - 1));
      continue;
    }
    if (key === "sync") {
      path((x) => params.syncOn ? Math.sin(x * 3 % 1 * Math.PI * 2 * params.syncRatio) : waveAt(params.wave, x * Math.PI * 6));
      continue;
    }
    if (key === "samplehold") {
      path((x) => {
        const step = Math.floor((x * 4 + phase) * params.sampleRate);
        return Math.sin(step * 127.1) * params.sampleHold / 24;
      });
      label(params.sampleRate.toFixed(1) + " changes/s");
      continue;
    }
    if (key === "crusher") {
      const levels = 2 ** (params.bits - 1);
      path((x) => params.bits === 16 ? Math.sin(x * Math.PI * 4) : Math.round(Math.sin(x * Math.PI * 4) * levels) / levels);
      continue;
    }
    if (key === "folder") {
      path((x) => 2 / Math.PI * Math.asin(Math.sin((x * 2 - 1) * (1 + params.fold / 100 * 7) * Math.PI / 2)));
      continue;
    }
    if (key === "width") {
      const spread = params.width / 200;
      dot(0.5 - spread * 0.4, 0.5);
      dot(0.5 + spread * 0.4, 0.5);
      label(params.width === 0 ? "Mono" : params.width === 100 ? "Original stereo" : "Stereo width");
      continue;
    }
    if (key === "sub") {
      path((x) => Math.sin(x * Math.PI * 8), "#48534f", 0.25, 0.16);
      path((x) => Math.sin(x * Math.PI * 4) * params.sub / 100, undefined, 0.7, 0.23);
      continue;
    }
    if (key === "unison") {
      const amount = params.unison / 100;
      path((x) => waveAt(params.wave, x * Math.PI * 6 - phase * 0.2), "#53665f");
      for (const direction of [-1, 1])
        path((x) => waveAt(params.wave, x * Math.PI * 6 * Math.pow(2, direction * params.spread * SETTINGS.detuneIllustration / 1200) - phase * 0.2) * amount, direction < 0 ? "#ecc17a" : "#96d3bf");
      continue;
    }
    if (key === "filterenv") {
      const end = 0.12 + params.filterDecay / 2 * 0.85, curve = (x) => x < 0.025 ? x / 0.025 : x < end ? 1 - (x - 0.025) / (end - 0.025) : 0;
      path((x) => curve(x) * params.filterEnv / 36, undefined, 0.85, 0.7);
      label("Cutoff ↑ → rest");
      continue;
    }
    if (key === "glide") {
      const end = 0.04 + params.glide / 0.8 * 0.91;
      path((x) => x < end ? -0.75 + 1.5 * x / end : 0.75);
      label(params.glide ? Math.round(params.glide * 1000) + " ms" : "Instant");
      continue;
    }
    if (key === "chorus") {
      const depth = params.chorus / 60;
      path((x) => Math.sin(x * Math.PI * 6 - phase * 0.2), "#53665f");
      path((x) => Math.sin(x * Math.PI * 6 - phase * 0.2 + Math.sin((x + phase) * params.chorusRate * Math.PI * 2) * 0.5) * depth);
      continue;
    }
    if (key === "reverb") {
      const level = params.reverb / 60;
      path((x) => Math.pow(1 - x, SETTINGS.reverbPower) * level);
      path((x) => -Math.pow(1 - x, SETTINGS.reverbPower) * level, "#729e93");
      for (let n = 0;n < 24; n++) {
        const x = n / 24, height = Math.pow(1 - x, SETTINGS.reverbPower) * level;
        ctx.strokeStyle = "#96d3bf55";
        ctx.beginPath();
        ctx.moveTo(x * w, h * (0.5 - height * 0.36));
        ctx.lineTo(x * w, h * (0.5 + height * 0.36));
        ctx.stroke();
      }
      label("Reflections → silence");
      continue;
    }
    if (key === "oscillator") {
      path((x) => waveAt(params.wave, (x * 3 - phase * 0.3) * 2 * Math.PI));
      continue;
    }
    if (key === "cutoff") {
      path((x) => filterResponse?.[Math.round(x * (SETTINGS.miniPoints - 1))] || 0, undefined, 0.87, 0.75);
      const x = cutoffToSlider(params.cutoff) / 1000;
      ctx.strokeStyle = "#ecc17a";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x * w, 9);
      ctx.lineTo(x * w, h - 12);
      ctx.stroke();
      ctx.setLineDash([]);
      label(params.filterType === "lowpass" ? "Low-pass" : params.filterType === "highpass" ? "High-pass" : "Band-pass");
      continue;
    }
    if (key === "envelope") {
      const a = 0.035 + params.attack / 1.5 * 0.2, d = a + 0.04 + params.ampDecay / 2 * 0.18, r = 0.7 + params.release / 2 * 0.28, sustain = params.sustain / 100;
      const env = (x) => x < a ? x / a : x < d ? 1 - (1 - sustain) * (x - a) / (d - a) : x < 0.68 ? sustain : x < r ? sustain * (1 - (x - 0.68) / (r - 0.68)) : 0;
      path(env, undefined, 0.88, 0.72);
      const voice = [...voices].at(-1);
      if (voice) {
        const x = voice.releaseStart !== undefined ? 0.68 + Math.min(1, (t - voice.releaseStart) / voice.releaseDuration) * (r - 0.68) : t - voice.start < voice.attack ? Math.max(0, (t - voice.start) / voice.attack * a) : t - voice.start < voice.attack + voice.decay ? a + (t - voice.start - voice.attack) / voice.decay * (d - a) : 0.65;
        dot(x, 0.88 - env(x) * 0.72);
      }
      label("Attack", 6);
      label("Release", w * 0.62);
      continue;
    }
    if (key === "harmonics") {
      ctx.strokeStyle = "#96d3bf";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let n = 1;n <= SETTINGS.harmonics; n++) {
        const level = params.wave === "sine" ? n === 1 ? 1 : 0 : params.wave === "sawtooth" ? 1 / n : n % 2 ? params.wave === "triangle" ? 1 / n ** 2 : 1 / n : 0;
        const x = (n - 0.5) / SETTINGS.harmonics * w;
        ctx.moveTo(x, h - 17);
        ctx.lineTo(x, h - 17 - level * (h - 27));
      }
      ctx.stroke();
      label("1×   2×   3× …");
      continue;
    }
    if (key === "bass" || key === "treble") {
      // Reuse buffers and recompute only when the shelf gain changes.
      if (!plot.toneResponse) {
        plot.toneFrequencies = Float32Array.from({ length: SETTINGS.miniPoints }, (_, i) => 20 * 1000 ** (i / (SETTINGS.miniPoints - 1)));
        plot.toneResponse = new Float32Array(SETTINGS.miniPoints).fill(1);
      }
      const sampleRate = audio?.sampleRate || 48000;
      if (plot.toneGain !== params[key] || plot.toneSampleRate !== sampleRate) {
        shelfResponse(key, params[key], plot.toneFrequencies, plot.toneResponse, sampleRate);
        plot.toneSampleRate = sampleRate;
        plot.toneGain = params[key];
      }
      miniLine(plot, i => 20 * Math.log10(Math.max(0.00001, plot.toneResponse[i])) / 12);
      label(params[key] + " dB · 20 Hz → 20 kHz");
      continue;
    }
    if (key === "pitch") {
      const voice = [...held.values()].at(-1), hz = frequency(voice?.midi ?? 48);
      label(hz.toFixed(1) + " Hz", 10, 16);
      path((x) => Math.sin(x * Math.PI * 6 * Math.pow(2, params.transpose / 12) - phase), undefined, 0.6, 0.23);
      continue;
    }
    if (key === "layers") {
      const mix = params.layerMix / 100, base = (x) => waveAt(params.wave, (x * 3 - phase * 0.15) * 2 * Math.PI), layer = (x) => waveAt(params.layerWave, (x * 3 * Math.pow(2, params.detune * SETTINGS.detuneIllustration / 1200) - phase * 0.15) * 2 * Math.PI);
      path(base, "#ecc17a", 0.18, 0.12);
      path((x) => layer(x) * mix, "#729e93", 0.48, 0.12);
      path((x) => (base(x) + layer(x) * mix) / (1 + mix), "#96d3bf", 0.81, 0.15);
      continue;
    }
    if (key === "lfo") {
      const wave = (x) => Math.sin((x + phase) * Math.PI * 2 * params.lfoRate) * params.lfoDepth / 60;
      path(wave);
      dot(0, 0.5 - wave(0) * 0.36);
      continue;
    }
    if (key === "noise") {
      path((x) => {
        const seed = Math.sin((Math.floor(x * SETTINGS.miniPoints) + Math.floor(phase * 15)) * 127.1) * 43758.5453;
        return ((seed - Math.floor(seed)) * 2 - 1) * params.noise / 100;
      });
      continue;
    }
    if (key === "drive") {
      path((x) => x * 2 - 1, "#384947");
      const strength = 1 + params.drive / 100 * SETTINGS.driveStrength;
      path((x) => params.drive ? Math.tanh((x * 2 - 1) * strength) : x * 2 - 1);
      label("Input → output");
      continue;
    }
    if (key === "tremolo") {
      const depth = params.tremDepth / 100, wave = (x) => 1 - depth / 2 + Math.sin((x + phase) * Math.PI * 2 * params.tremRate) * depth / 2;
      path(wave, undefined, 0.85, 0.65);
      dot(0, 0.85 - wave(0) * 0.65);
      continue;
    }
    if (key === "echo") {
      ctx.lineWidth = 3;
      for (let n = 0;n < 6; n++) {
        const x = (0.06 + n * params.echoTime / SETTINGS.echoDiagramSeconds) * w, level = n === 0 ? 1 : params.echoMix / 100 * Math.pow(SETTINGS.echoFeedback, n - 1);
        ctx.strokeStyle = n === 0 ? "#596662" : "#96d3bf";
        ctx.beginPath();
        ctx.moveTo(x, h - 16);
        ctx.lineTo(x, h - 16 - level * (h - 28));
        ctx.stroke();
      }
      label("Original → repeats");
      continue;
    }
    if (key === "autopan") {
      const center = params.pan / 100;
      const depth = params.autoPan / 100 * (1 - Math.abs(center));
      path(x => center + depth * Math.sin(x * Math.PI * 2), undefined, 0.5, 0.3);
      dot(0.5 + 0.4 * (center + depth * Math.sin(phase * params.autoPanRate * Math.PI * 2)), 0.5);
      label("L · " + params.autoPanRate.toFixed(2) + " Hz · R");
      continue;
    }
    if (key === "pan") {
      const position = (params.pan / 100 + 1) / 2;
      ctx.strokeStyle = "#96d3bf";
      ctx.beginPath();
      ctx.moveTo(12, h / 2);
      ctx.lineTo(w - 12, h / 2);
      ctx.stroke();
      dot((12 + (w - 24) * position) / w, 0.5);
      label("L", 10, h - 10);
      label("R", w - 17, h - 10);
      continue;
    }
    } finally { record("card." + key, performance.now() - started); }
  }
}
function grid(plot) {
  const { ctx, width: w, height: h } = plot;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#253131";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1;i < 8; i++) {
    ctx.moveTo(w * i / 8, 0);
    ctx.lineTo(w * i / 8, h);
  }
  for (let i = 1;i < 4; i++) {
    ctx.moveTo(0, h * i / 4);
    ctx.lineTo(w, h * i / 4);
  }
  ctx.stroke();
}

export { miniPlots, setFilterResponse, waveAt, linePath, drawCards, grid };
