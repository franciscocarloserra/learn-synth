// Owns the audio graph and voices. No DOM access; notifications use hooks.
import { measure } from "../profiler/capture.js";
import { SETTINGS, PRESETS, EXTRAS, ADV_SETTINGS, NOTES, cutoffFromSlider, TONE_FREQUENCIES } from "./config.js";
import { report } from "./telemetry.js";
let params = { ...EXTRAS, ...PRESETS.pad };
let audio, filter, master, analyser, compressor, samples, spectrumData, filterPreview, lfo, lfoGain, spectrumBins;
let noiseSource, driveNode, driveLevel, tremolo, tremOsc, tremGain, delayNode, echoWet, feedbackNode, panner, mixBus, lastDrive = -1;
let filterEnvSource, filterTrigger = -1 / 0, lastMidi = null, chorusDelay, chorusWet, chorusOsc, chorusDepth, reverbNode, reverbWet;
let advancedFX, stereoInput, gateGain, mainWave = null, waveKey = "", lastBits = -1, lastFold = -1, harmonicBasis = null;
let lessonCompressor, compDry, compWet;
const toneFilters = {};
let autoPanOsc, autoPanDepth;
let volume = 0.25;
let outputMuted = false;
const held = new Map, voices = new Set;
const hooks = { notesChanged() {}, stateChanged() {}, ready() {}, error() {} };
function setAudioHooks(next) {
  Object.assign(hooks, next);
}
function notifyNotes() {
  hooks.notesChanged();
}
function setParams(next) {
  params = next;
}
function setVolume(value) {
  volume = value;
  if (master)
    master.gain.setTargetAtTime(outputMuted ? 0 : volume, audio.currentTime, SETTINGS.smoothing);
}
function initAudio(...args) { return measure("audio.initAudio", initAudioImpl, args); }
function initAudioImpl() {
  if (audio?.state === "running")
    return;
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: SETTINGS.requestedLatency });
    filter = audio.createBiquadFilter();
    filter.type = params.filterMuted ? "allpass" : params.filterType;
    filter.frequency.value = params.cutoff;
    filter.Q.value = params.res;
    master = audio.createGain();
    master.gain.value = outputMuted ? 0 : volume;
    compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    analyser = audio.createAnalyser();
    analyser.fftSize = SETTINGS.fftSize;
    samples = new Float32Array(SETTINGS.fftSize);
    spectrumData = new Uint8Array(analyser.frequencyBinCount);
    spectrumBins = Array.from({ length: SETTINGS.spectrumPoints + 1 }, (_, i) => [Math.max(1, Math.floor(cutoffFromSlider(i / SETTINGS.spectrumPoints * 1000) * SETTINGS.fftSize / audio.sampleRate)), Math.min(spectrumData.length - 1, Math.ceil(cutoffFromSlider((i + 1) / SETTINGS.spectrumPoints * 1000) * SETTINGS.fftSize / audio.sampleRate))]);
    report("audio-latency", JSON.stringify({ requested: SETTINGS.requestedLatency, base: audio.baseLatency, output: audio.outputLatency }));
    analyser.minDecibels = SETTINGS.spectrumMinDb;
    analyser.maxDecibels = SETTINGS.spectrumMaxDb;
    analyser.smoothingTimeConstant = 0.65;
    filterPreview = audio.createBiquadFilter();
    lfo = audio.createOscillator();
    lfoGain = audio.createGain();
    lfo.frequency.value = params.lfoRate;
    lfoGain.gain.value = params.lfoDepth;
    lfo.connect(lfoGain);
    lfo.start();
    initEffects();
    audio.addEventListener("statechange", hooks.stateChanged);
    hooks.ready();
  }
  if (audio.state !== "running")
    audio.resume().catch((e) => {
      report("audio", e);
      hooks.error("Audio blocked");
    });
  hooks.stateChanged();
}
function frequency(midi) {
  return 440 * Math.pow(2, (midi + params.octave * 12 + params.transpose - 69) / 12);
}
function updateVoice(...args) { return measure("audio.updateVoice", updateVoiceImpl, args); }
function updateVoiceImpl(v) {
  const t = audio.currentTime, mix = params.layerMix / 100;
  if (!!v.envelopeMuted !== !!params.envelopeMuted && v.releaseStart === undefined) {
    v.envelopeMuted = !!params.envelopeMuted;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(v.envelopeMuted ? v.peak : envelopeLevel(v, t), t, SETTINGS.smoothing);
    if (!v.envelopeMuted && t < v.start + v.attack + v.decay) {
      if (t < v.start + v.attack) v.gain.gain.linearRampToValueAtTime(v.peak, v.start + v.attack);
      v.gain.gain.linearRampToValueAtTime(v.peak * v.sustain, v.start + v.attack + v.decay);
    }
  }
  v.osc.type = params.wave;
  v.layer.type = params.layerWave;
  const target = frequency(v.midi);
  if (target !== v.pitchTarget) {
    v.pitchStart = voicePitch(v, t);
    v.pitchTarget = target;
    v.pitchTime = t;
    v.pitchEnd = t + SETTINGS.smoothing;
  }
  tuneOsc(v.osc, v, 1, t);
  tuneOsc(v.layer, v, 1, t);
  v.layer.detune.setTargetAtTime(params.detune, t, SETTINGS.smoothing);
  v.noiseGain.gain.setTargetAtTime(params.noise / 100 * SETTINGS.noiseGain, t, SETTINGS.smoothing);
  v.baseMix.gain.setTargetAtTime((params.mainMuted ? 0 : 1) / (1 + mix) / (1 + 2 * params.unison / 100), t, SETTINGS.smoothing);
  v.layerMix.gain.setTargetAtTime(mix / (1 + mix), t, SETTINGS.smoothing);
  updateExtraOscillators(v);
  updateAdvancedVoice(v);
}
function playVoice(...args) { return measure("audio.playVoice", playVoiceImpl, args); }
function playVoiceImpl(index, source, velocity = 1, midi = NOTES[index]?.midi, when = null) {
  if (held.has(source) || !Number.isFinite(midi))
    return;
  initAudio();
  if (voices.size >= SETTINGS.maxVoices)
    return;
  const t = when ?? audio.currentTime, osc = audio.createOscillator(), layer = audio.createOscillator(), gain = audio.createGain(), baseMix = audio.createGain(), layerMix = audio.createGain(), noiseGain = audio.createGain();
  noiseGain.gain.value = params.noise / 100 * SETTINGS.noiseGain;
  const mix = params.layerMix / 100, peak = SETTINGS.voiceGain * (1 - params.velocitySense / 100 + velocity * params.velocitySense / 100);
  osc.type = params.wave;
  layer.type = params.layerWave;
  osc.frequency.value = layer.frequency.value = frequency(midi);
  layer.detune.value = params.detune;
  baseMix.gain.value = (params.mainMuted ? 0 : 1) / (1 + mix);
  layerMix.gain.value = mix / (1 + mix);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + (params.envelopeMuted ? SETTINGS.smoothing : params.attack));
  const ampDecay = params.ampDecay, sustain = params.sustain / 100;
  if (!params.envelopeMuted) gain.gain.linearRampToValueAtTime(peak * sustain, t + params.attack + ampDecay);
  const target = frequency(midi), from = params.glide && lastMidi !== null ? frequency(lastMidi) : target;
  const voice = { envelopeMuted: !!params.envelopeMuted, osc, layer, gain, baseMix, layerMix, noiseGain, midi, peak, source, start: t, attack: params.attack, decay: ampDecay, sustain, extras: new Map, pitchStart: from, pitchTarget: target, pitchTime: t, pitchEnd: t + params.glide };
  lastMidi = midi;
  tuneOsc(osc, voice, 1, t);
  tuneOsc(layer, voice, 1, t);
  baseMix.gain.value = (params.mainMuted ? 0 : 1) / (1 + mix) / (1 + 2 * params.unison / 100);
  updateExtraOscillators(voice);
  updateAdvancedVoice(voice);
  filterTrigger = t;
  updateFilterEnvelope();
  updateAdvancedEffects();
  osc.connect(baseMix).connect(gain);
  layer.connect(layerMix).connect(gain);
  gain.connect(filter);
  noiseSource.connect(noiseGain);
  noiseGain.connect(gain);
  lfoGain.connect(osc.detune);
  lfoGain.connect(layer.detune);
  voices.add(voice);
  held.set(source, voice);
  osc.onended = () => {
    if (voice.fm) {
      voice.fm.osc.disconnect();
      voice.fm.gain.disconnect();
    }
    for (const extra of voice.extras.values()) {
      lfoGain.disconnect(extra.osc.detune);
      extra.osc.disconnect();
      extra.gain.disconnect();
    }
    lfoGain.disconnect(osc.detune);
    lfoGain.disconnect(layer.detune);
    noiseSource.disconnect(noiseGain);
    for (const node of [osc, layer, gain, baseMix, layerMix, noiseGain])
      node.disconnect();
    voices.delete(voice);
    notifyNotes();
  };
  osc.start(t);
  layer.start(t);
  notifyNotes();
}
function releaseVoice(...args) { return measure("audio.releaseVoice", releaseVoiceImpl, args); }
function releaseVoiceImpl(source, when = null) {
  const v = held.get(source);
  if (!v)
    return;
  held.delete(source);
  const t = when ?? audio.currentTime, p = v.gain.gain;
  v.releaseLevel = envelopeLevel(v, t);
  v.releaseStart = t;
  v.releaseDuration = params.release;
  if (p.cancelAndHoldAtTime)
    p.cancelAndHoldAtTime(t);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(v.releaseLevel, t);
  }
  p.linearRampToValueAtTime(0, t + params.release);
  v.osc.stop(t + params.release + 0.02);
  v.layer.stop(t + params.release + 0.02);
  for (const extra of v.extras.values())
    extra.osc.stop(t + params.release + 0.02);
  if (v.fm)
    v.fm.osc.stop(t + params.release + 0.02);
  notifyNotes();
}
function initEffects() {
  const buffer = audio.createBuffer(1, Math.round(audio.sampleRate * SETTINGS.noiseSeconds), audio.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0;i < data.length; i++)
    data[i] = Math.random() * 2 - 1;
  noiseSource = audio.createBufferSource();
  noiseSource.buffer = buffer;
  noiseSource.loop = true;
  noiseSource.start();
  driveNode = audio.createWaveShaper();
  driveLevel = audio.createGain();
  tremolo = audio.createGain();
  tremOsc = audio.createOscillator();
  tremGain = audio.createGain();
  tremolo.gain.value = 1 - params.tremDepth / 200;
  tremGain.gain.value = params.tremDepth / 200;
  tremOsc.frequency.value = params.tremRate;
  tremOsc.connect(tremGain).connect(tremolo.gain);
  tremOsc.start();
  delayNode = audio.createDelay(SETTINGS.maxDelay);
  echoWet = audio.createGain();
  echoWet.gain.value = params.echoMix / 100;
  delayNode.delayTime.value = params.echoTime;
  feedbackNode = audio.createGain();
  feedbackNode.gain.value = SETTINGS.echoFeedback;
  mixBus = audio.createGain();
  panner = audio.createStereoPanner();
  autoPanOsc = audio.createOscillator();
  autoPanDepth = audio.createGain();
  autoPanOsc.frequency.value = params.autoPanRate;
  autoPanDepth.gain.value = 0;
  autoPanOsc.connect(autoPanDepth).connect(panner.pan);
  autoPanOsc.start();
  advancedFX = makeAdvancedEffects();
  filter.connect(advancedFX.input);
  advancedFX.output.connect(driveNode).connect(driveLevel).connect(tremolo).connect(mixBus);
  tremolo.connect(delayNode);
  delayNode.connect(feedbackNode).connect(delayNode);
  delayNode.connect(echoWet).connect(mixBus);
  mixBus.connect(stereoInput);
  chorusDelay = audio.createDelay(0.1);
  chorusWet = audio.createGain();
  chorusOsc = audio.createOscillator();
  chorusDepth = audio.createGain();
  chorusDelay.delayTime.value = SETTINGS.chorusDelay;
  chorusDepth.gain.value = SETTINGS.chorusDepth;
  chorusWet.gain.value = params.chorus / 100;
  chorusOsc.frequency.value = params.chorusRate;
  chorusOsc.connect(chorusDepth).connect(chorusDelay.delayTime);
  chorusOsc.start();
  mixBus.connect(chorusDelay).connect(chorusWet).connect(stereoInput);
  reverbNode = audio.createConvolver();
  reverbWet = audio.createGain();
  reverbWet.gain.value = params.reverb / 100;
  mixBus.connect(reverbNode).connect(reverbWet).connect(stereoInput);
  filterEnvSource = audio.createConstantSource();
  filterEnvSource.offset.value = 0;
  filterEnvSource.connect(filter.detune);
  filterEnvSource.start();
  lessonCompressor = audio.createDynamicsCompressor();
  lessonCompressor.knee.value = 0;
  lessonCompressor.attack.value = 0.01;
  lessonCompressor.release.value = 0.15;
  compDry = audio.createGain();
  compWet = audio.createGain();
  compWet.gain.value = 0;
  // Tone shelves precede the safety limiter; boosting cannot bypass it.
  for (const [key, type] of [["bass", "lowshelf"], ["treble", "highshelf"]]) {
    const shelf = audio.createBiquadFilter();
    shelf.type = type;
    shelf.frequency.value = TONE_FREQUENCIES[key];
    shelf.gain.value = params[key];
    toneFilters[key] = shelf;
  }
  panner.connect(compDry).connect(toneFilters.bass);
  panner.connect(lessonCompressor).connect(compWet).connect(toneFilters.bass);
  toneFilters.bass.connect(toneFilters.treble).connect(compressor);
  compressor.connect(gateGain).connect(master).connect(analyser).connect(audio.destination);
  updateEffects();
}
function updateEffects(...args) { return measure("audio.updateEffects", updateEffectsImpl, args); }
function updateEffectsImpl() {
  if (!audio)
    return;
  const t = audio.currentTime, set = (param, value) => param.setTargetAtTime(value, t, SETTINGS.smoothing);
  if (lastDrive !== params.drive) {
    lastDrive = params.drive;
    if (!params.drive) {
      driveNode.curve = null;
      set(driveLevel.gain, 1);
    } else {
      const strength = 1 + params.drive / 100 * SETTINGS.driveStrength, curve = new Float32Array(SETTINGS.drivePoints);
      for (let i = 0;i < curve.length; i++)
        curve[i] = Math.tanh((i / (curve.length - 1) * 2 - 1) * strength);
      driveNode.curve = curve;
      set(driveLevel.gain, 1 / Math.sqrt(strength));
    }
  }
  const depth = params.tremDepth / 100;
  set(tremolo.gain, 1 - depth / 2);
  set(tremGain.gain, depth / 2);
  set(tremOsc.frequency, params.tremRate);
  set(delayNode.delayTime, params.echoTime);
  set(echoWet.gain, params.echoMix / 100);
  set(panner.pan, params.pan / 100);
  set(autoPanOsc.frequency, params.autoPanRate);
  set(autoPanDepth.gain, params.autoPan / 100 * (1 - Math.abs(params.pan / 100)));
  set(chorusWet.gain, params.chorus / 100);
  set(chorusOsc.frequency, params.chorusRate);
  set(reverbWet.gain, params.reverb / 100);
  if (params.reverb && !reverbNode.buffer)
    buildReverb();
  updateFilterEnvelope();
  updateAdvancedEffects();
}
function voicePitch(v, t) {
  if (t >= v.pitchEnd || v.pitchEnd <= v.pitchTime)
    return v.pitchTarget;
  const progress = Math.max(0, (t - v.pitchTime) / (v.pitchEnd - v.pitchTime));
  return v.pitchStart * Math.pow(v.pitchTarget / v.pitchStart, progress);
}
function tuneOsc(osc, v, ratio, t) {
  const p = osc.frequency;
  p.cancelScheduledValues(t);
  p.setValueAtTime(voicePitch(v, t) * ratio, t);
  if (v.pitchEnd > t)
    p.exponentialRampToValueAtTime(v.pitchTarget * ratio, v.pitchEnd);
}
function updateExtraOscillators(...args) { return measure("audio.updateExtraOscillators", updateExtraOscillatorsImpl, args); }
function updateExtraOscillatorsImpl(v) {
  const t = Math.max(audio.currentTime, v.start), uni = params.unison / 100;
  for (const [key, type, ratio, detune, level] of [["sub", "sine", 0.5, 0, params.sub / 100 * SETTINGS.subGain], ["lower", params.wave, 1, -params.spread, uni / (1 + 2 * uni)], ["upper", params.wave, 1, params.spread, uni / (1 + 2 * uni)]]) {
    let extra = v.extras.get(key);
    if (!extra && level > 0 && v.releaseStart === undefined) {
      const osc = audio.createOscillator(), gain = audio.createGain();
      gain.gain.value = 0;
      osc.type = type;
      osc.connect(gain).connect(v.gain);
      lfoGain.connect(osc.detune);
      extra = { osc, gain };
      v.extras.set(key, extra);
      osc.start(t);
    }
    if (extra) {
      extra.osc.type = type;
      tuneOsc(extra.osc, v, ratio, t);
      extra.osc.detune.setTargetAtTime(detune, t, SETTINGS.smoothing);
      extra.gain.gain.setTargetAtTime(level, t, SETTINGS.smoothing);
    }
  }
}
function updateFilterEnvelope() {
  if (!filterEnvSource)
    return;
  const t = audio.currentTime, elapsed = t - filterTrigger, p = filterEnvSource.offset, peak = params.filterEnv * 100;
  p.cancelScheduledValues(t);
  if (elapsed < 0 && params.filterEnv) {
    p.setValueAtTime(0, t);
    p.setValueAtTime(0, filterTrigger);
    p.linearRampToValueAtTime(peak, filterTrigger + SETTINGS.filterEnvAttack);
    p.linearRampToValueAtTime(0, filterTrigger + params.filterDecay);
    return;
  }
  if (elapsed >= params.filterDecay || !params.filterEnv) {
    p.setValueAtTime(0, t);
    return;
  }
  const attack = SETTINGS.filterEnvAttack;
  if (elapsed < attack) {
    p.setValueAtTime(peak * elapsed / attack, t);
    p.linearRampToValueAtTime(peak, filterTrigger + attack);
  } else
    p.setValueAtTime(peak * (1 - (elapsed - attack) / (params.filterDecay - attack)), t);
  p.linearRampToValueAtTime(0, filterTrigger + params.filterDecay);
}
function buildReverb(...args) { return measure("audio.buildReverb", buildReverbImpl, args); }
function buildReverbImpl() {
  const buffer = audio.createBuffer(2, Math.round(audio.sampleRate * SETTINGS.reverbSeconds), audio.sampleRate);
  for (let channel = 0;channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0;i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, SETTINGS.reverbPower);
  }
  reverbNode.buffer = buffer;
}
function envelopeLevel(v, t) {
  if (v.releaseStart !== undefined)
    return v.releaseLevel * Math.max(0, 1 - (t - v.releaseStart) / v.releaseDuration);
  if (v.envelopeMuted) return v.peak;
  const elapsed = Math.max(0, t - v.start);
  if (elapsed < v.attack)
    return v.peak * elapsed / v.attack;
  return v.peak * (1 - (1 - v.sustain) * Math.min(1, (elapsed - v.attack) / v.decay));
}
function mainPeriodicWave(...args) { return measure("audio.mainPeriodicWave", mainPeriodicWaveImpl, args); }
function mainPeriodicWaveImpl() {
  if (!audio)
    return null;
  const key = [params.wave, params.pwmOn, params.pulseWidth, params.tableOn, params.tablePosition, params.syncOn, params.syncRatio].join(":");
  if (key === waveKey)
    return mainWave;
  waveKey = key;
  if (!params.pwmOn && !params.tableOn && !params.syncOn)
    return mainWave = null;
  const count = ADV_SETTINGS.harmonics, real = new Float32Array(count + 1), imag = new Float32Array(count + 1);
  if (params.syncOn) {
    if (!harmonicBasis) {
      harmonicBasis = [];
      for (let n = 1;n <= count; n++) {
        const cos = new Float32Array(ADV_SETTINGS.waveSamples), sin = new Float32Array(cos.length);
        for (let i = 0;i < cos.length; i++) {
          const angle = 2 * Math.PI * n * i / cos.length;
          cos[i] = Math.cos(angle);
          sin[i] = Math.sin(angle);
        }
        harmonicBasis.push({ cos, sin });
      }
    }
    const wave = Float32Array.from({ length: ADV_SETTINGS.waveSamples }, (_, i) => Math.sin(i / ADV_SETTINGS.waveSamples * Math.PI * 2 * params.syncRatio));
    for (let n = 1;n <= count; n++) {
      const basis = harmonicBasis[n - 1];
      for (let i = 0;i < wave.length; i++) {
        real[n] += wave[i] * basis.cos[i] * 2 / wave.length;
        imag[n] += wave[i] * basis.sin[i] * 2 / wave.length;
      }
    }
  } else if (params.tableOn) {
    const position = params.tablePosition / 50;
    for (let n = 1;n <= count; n++) {
      const sine = n === 1 ? 1 : 0, triangle = n % 2 ? 8 / Math.PI ** 2 * Math.pow(-1, (n - 1) / 2) / n ** 2 : 0, saw = 2 * Math.pow(-1, n + 1) / (Math.PI * n);
      imag[n] = position <= 1 ? sine * (1 - position) + triangle * position : triangle * (2 - position) + saw * (position - 1);
    }
  } else {
    const duty = params.pulseWidth / 100;
    for (let n = 1;n <= count; n++) {
      real[n] = 2 * Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
      imag[n] = 2 * (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
    }
  }
  return mainWave = audio.createPeriodicWave(real, imag, { disableNormalization: true });
}
function applyMainWave(osc) {
  const wave = mainPeriodicWave();
  if (wave)
    osc.setPeriodicWave(wave);
  else
    osc.type = params.wave;
}
function updateAdvancedVoice(...args) { return measure("audio.updateAdvancedVoice", updateAdvancedVoiceImpl, args); }
function updateAdvancedVoiceImpl(v) {
  const t = audio.currentTime;
  applyMainWave(v.osc);
  for (const [key, extra] of v.extras)
    if (key !== "sub")
      applyMainWave(extra.osc);
  if (params.fmIndex > 0 && !v.fm && v.releaseStart === undefined) {
    const osc = audio.createOscillator(), gain = audio.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(v.osc.frequency);
    osc.start(t);
    v.fm = { osc, gain };
  }
  if (v.fm) {
    tuneOsc(v.fm.osc, v, params.fmRatio, t);
    v.fm.gain.gain.setTargetAtTime(v.pitchTarget * params.fmIndex, t, SETTINGS.smoothing);
  }
}
function makeAdvancedEffects() {
  const nodeGain = (value = 1) => {
    const n = audio.createGain();
    n.gain.value = value;
    return n;
  };
  const input = nodeGain(), ringGain = nodeGain(), ringOsc = audio.createOscillator(), ringDepth = nodeGain(0);
  ringOsc.frequency.value = params.ringFreq;
  ringOsc.connect(ringDepth).connect(ringGain.gain);
  ringOsc.start();
  input.connect(ringGain);
  const phaseOut = nodeGain(), phaseDry = nodeGain(), phaseWet = nodeGain(0), phaseOsc = audio.createOscillator(), phaseDepth = nodeGain(ADV_SETTINGS.phaserDepth);
  let stage = ringGain;
  for (const ratio of ADV_SETTINGS.phaserStages) {
    const filter = audio.createBiquadFilter();
    filter.type = "allpass";
    filter.frequency.value = ADV_SETTINGS.phaserCenter * ratio;
    filter.Q.value = 0.7;
    phaseDepth.connect(filter.detune);
    stage.connect(filter);
    stage = filter;
  }
  stage.connect(phaseWet).connect(phaseOut);
  ringGain.connect(phaseDry).connect(phaseOut);
  phaseOsc.connect(phaseDepth);
  phaseOsc.start();
  const flangeOut = nodeGain(), flangeDry = nodeGain(), flangeWet = nodeGain(0), flangeDelay = audio.createDelay(0.03), flangeFeedback = nodeGain(ADV_SETTINGS.flangerFeedback), flangeOsc = audio.createOscillator(), flangeDepth = nodeGain(ADV_SETTINGS.flangerDepth);
  flangeDelay.delayTime.value = ADV_SETTINGS.flangerDelay;
  phaseOut.connect(flangeDry).connect(flangeOut);
  phaseOut.connect(flangeDelay).connect(flangeWet).connect(flangeOut);
  flangeDelay.connect(flangeFeedback).connect(flangeDelay);
  flangeOsc.connect(flangeDepth).connect(flangeDelay.delayTime);
  flangeOsc.start();
  const crusher = audio.createWaveShaper(), folder = audio.createWaveShaper();
  flangeOut.connect(crusher).connect(folder);
  const randomBuffer = audio.createBuffer(1, ADV_SETTINGS.randomSteps * ADV_SETTINGS.randomFrames, audio.sampleRate), random = randomBuffer.getChannelData(0);
  for (let step = 0;step < ADV_SETTINGS.randomSteps; step++)
    random.fill(Math.random() * 2 - 1, step * ADV_SETTINGS.randomFrames, (step + 1) * ADV_SETTINGS.randomFrames);
  const randomSource = audio.createBufferSource(), randomGain = nodeGain(0), tracking = audio.createConstantSource();
  randomSource.buffer = randomBuffer;
  randomSource.loop = true;
  randomSource.connect(randomGain).connect(filter.detune);
  randomSource.start();
  tracking.offset.value = 0;
  tracking.connect(filter.detune);
  tracking.start();
  stereoInput = nodeGain();
  // Upmix mono to L/R before splitting; a splitter otherwise leaves R silent.
  stereoInput.channelCount = 2;
  stereoInput.channelCountMode = "explicit";
  stereoInput.channelInterpretation = "speakers";
  const splitter = audio.createChannelSplitter(2), merger = audio.createChannelMerger(2), widthGains = [nodeGain(), nodeGain(0), nodeGain(0), nodeGain()];
  stereoInput.connect(splitter);
  splitter.connect(widthGains[0], 0);
  splitter.connect(widthGains[1], 1);
  splitter.connect(widthGains[2], 0);
  splitter.connect(widthGains[3], 1);
  widthGains[0].connect(merger, 0, 0);
  widthGains[1].connect(merger, 0, 0);
  widthGains[2].connect(merger, 0, 1);
  widthGains[3].connect(merger, 0, 1);
  merger.connect(panner);
  gateGain = nodeGain();
  return { input, output: folder, ringGain, ringOsc, ringDepth, phaseDry, phaseWet, phaseOsc, flangeDry, flangeWet, flangeOsc, crusher, folder, randomSource, randomGain, tracking, widthGains };
}
function updateAdvancedEffects(...args) { return measure("audio.updateAdvancedEffects", updateAdvancedEffectsImpl, args); }
function updateAdvancedEffectsImpl() {
  if (lessonCompressor) {
    const t = audio.currentTime;
    lessonCompressor.threshold.setTargetAtTime(params.compThreshold, t, SETTINGS.smoothing);
    lessonCompressor.ratio.setTargetAtTime(params.compRatio, t, SETTINGS.smoothing);
    compDry.gain.setTargetAtTime(params.compRatio === 1 ? 1 : 0, t, SETTINGS.smoothing);
    compWet.gain.setTargetAtTime(params.compRatio === 1 ? 0 : 1, t, SETTINGS.smoothing);
  }
  if (!advancedFX)
    return;
  const t = audio.currentTime, set = (p, v) => p.setTargetAtTime(v, t, SETTINGS.smoothing), fx = advancedFX;
  set(fx.ringGain.gain, 1 - params.ring / 100);
  set(fx.ringDepth.gain, params.ring / 100);
  set(fx.ringOsc.frequency, params.ringFreq);
  set(fx.phaseDry.gain, 1 - params.phaser / 200);
  set(fx.phaseWet.gain, params.phaser / 200);
  set(fx.phaseOsc.frequency, params.phaserRate);
  set(fx.flangeDry.gain, 1 - params.flanger / 200);
  set(fx.flangeWet.gain, params.flanger / 200);
  set(fx.flangeOsc.frequency, params.flangerRate);
  set(fx.randomGain.gain, params.sampleHold * 100);
  set(fx.randomSource.playbackRate, params.sampleRate * ADV_SETTINGS.randomFrames / audio.sampleRate);
  set(fx.tracking.offset, ((lastMidi ?? 60) + params.octave * 12 + params.transpose - 60) * params.keyTrack);
  if (lastBits !== params.bits) {
    lastBits = params.bits;
    if (params.bits === 16)
      fx.crusher.curve = null;
    else {
      const levels = 2 ** (params.bits - 1), curve = new Float32Array(ADV_SETTINGS.curveSamples);
      for (let i = 0;i < curve.length; i++)
        curve[i] = Math.round((2 * i / (curve.length - 1) - 1) * levels) / levels;
      fx.crusher.curve = curve;
    }
  }
  if (lastFold !== params.fold) {
    lastFold = params.fold;
    if (!params.fold)
      fx.folder.curve = null;
    else {
      const curve = new Float32Array(SETTINGS.drivePoints);
      for (let i = 0;i < curve.length; i++)
        curve[i] = 2 / Math.PI * Math.asin(Math.sin((2 * i / (curve.length - 1) - 1) * (1 + params.fold / 100 * 7) * Math.PI / 2));
      fx.folder.curve = curve;
    }
  }
  const width = params.width / 100, scale = width > 1 ? 2 / (1 + width) : 1;
  for (let i = 0;i < 4; i++)
    set(fx.widthGains[i].gain, (i === 0 || i === 3 ? (1 + width) / 2 : (1 - width) / 2) * scale);
}
function retargetMono(v, midi) {
  const t = audio.currentTime;
  v.pitchStart = voicePitch(v, t);
  v.midi = midi;
  v.pitchTarget = frequency(midi);
  v.pitchTime = t;
  v.pitchEnd = t + Math.max(SETTINGS.smoothing, params.glide);
  lastMidi = midi;
  updateVoice(v);
  updateAdvancedEffects();
}
function updateAudioParameters(...args) { return measure("audio.updateAudioParameters", updateAudioParametersImpl, args); }
function updateAudioParametersImpl() {
  if (audio) {
    const t = audio.currentTime;
    for (const key of ["bass", "treble"])
      toneFilters[key].gain.setTargetAtTime(params[key], t, SETTINGS.smoothing);
    filter.type = params.filterMuted ? "allpass" : params.filterType;
    filter.frequency.setTargetAtTime(params.cutoff, t, SETTINGS.smoothing);
    filter.Q.setTargetAtTime(params.res, t, SETTINGS.smoothing);
    lfo.frequency.setTargetAtTime(params.lfoRate, t, SETTINGS.smoothing);
    lfoGain.gain.setTargetAtTime(params.lfoDepth, t, SETTINGS.smoothing);
    for (const voice of voices)
      updateVoice(voice);
    updateEffects();
  }
}

export { params, audio, analyser, samples, spectrumData, spectrumBins, filterPreview, voices, held, gateGain, toneFilters, setAudioHooks, notifyNotes, setParams, setVolume, updateAudioParameters, initAudio, frequency, playVoice, releaseVoice, voicePitch, envelopeLevel, retargetMono };

// Final-output mute also silences effect tails. Do not initialize audio for panic.
export function setOutputMuted(muted) {
  outputMuted = muted;
  if (!audio) return;
  const t = audio.currentTime;
  master.gain.cancelScheduledValues(t);
  if (muted) {
    master.gain.setValueAtTime(0, t);
    held.clear();
    for (const voice of voices) {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(0, t);
      voice.osc.stop(t);
      voice.layer.stop(t);
      for (const extra of voice.extras.values()) extra.osc.stop(t);
      if (voice.fm) voice.fm.osc.stop(t);
    }
    notifyNotes();
  } else master.gain.setTargetAtTime(volume, t, SETTINGS.smoothing);
}
export { outputMuted };
