// Sound defaults, UI scales, presets and tunable engine constants.
const SETTINGS = {
  "requestedLatency": 0.005,
  "idleTailMs": 600,
  "minCutoff": 60,
  "maxCutoff": 16000,
  "voiceGain": 0.16,
  "smoothing": 0.025,
  "fftSize": 4096,
  "scopeMs": 20,
  "scopeGain": 6,
  "fps": 30,
  "maxVoices": 24,
  "telemetryInterval": 2000,
  "longTaskMs": 100,
  "slowFrameMs": 150,
  "spectrumMinDb": -90,
  "spectrumMaxDb": -10,
  "spectrumPoints": 256,
  "spectrumGain": 1.3,
  "harmonics": 12,
  "diagramPoints": 160,
  "layerCycles": 3,
  "detuneIllustration": 8,
  "miniFft": 2048,
  "miniPoints": 128,
  "noiseSeconds": 2,
  "noiseGain": 0.35,
  "drivePoints": 2049,
  "driveStrength": 20,
  "echoFeedback": 0.35,
  "historySeconds": 4,
  "subGain": 0.5,
  "filterEnvAttack": 0.005,
  "chorusDelay": 0.018,
  "chorusDepth": 0.004,
  "reverbSeconds": 2.2,
  "reverbPower": 2.5,
  "maxDelay": 2,
  "echoDiagramSeconds": 8,
  "sliderSteps": 1000
};
const PRESETS = {
  "glass": {
    "wave": "sine",
    "octave": 1,
    "cutoff": 6500,
    "res": 0.7,
    "attack": 0.005,
    "release": 0.6,
    "fmIndex": 1.5,
    "fmRatio": 3,
    "echoMix": 18,
    "echoTime": 0.28,
    "reverb": 18,
    "ampDecay": 1.1,
    "sustain": 0
  },
  "basic": {
    "wave": "sine",
    "octave": 0,
    "cutoff": 4000,
    "res": 0.7,
    "attack": 0.015,
    "release": 0.3
  },
  "pad": {
    "wave": "sawtooth",
    "octave": 0,
    "cutoff": 850,
    "res": 1.2,
    "attack": 0.6,
    "release": 1.2
  },
  "bass": {
    "wave": "sawtooth",
    "octave": -1,
    "cutoff": 420,
    "res": 4,
    "attack": 0.01,
    "release": 0.2
  },
  "pluck": {
    "wave": "square",
    "octave": 1,
    "cutoff": 1800,
    "res": 2,
    "attack": 0.005,
    "release": 0.15,
    "ampDecay": 0.35,
    "sustain": 0
  },
  "drift": {
    "wave": "sawtooth",
    "octave": 0,
    "cutoff": 1400,
    "res": 0.8,
    "attack": 0.35,
    "release": 1.6,
    "layerWave": "sawtooth",
    "layerMix": 80,
    "detune": 9,
    "lfoDepth": 5,
    "lfoRate": 0.3
  },
  "keys": {
    "wave": "triangle",
    "octave": 0,
    "cutoff": 2800,
    "res": 0.7,
    "attack": 0.005,
    "release": 0.35,
    "layerWave": "sine",
    "layerMix": 25,
    "detune": 0,
    "drive": 8,
    "reverb": 12,
    "ampDecay": 1.1,
    "sustain": 0
  },
  "brass": {
    "wave": "sawtooth",
    "octave": 0,
    "cutoff": 750,
    "res": 1.1,
    "attack": 0.06,
    "release": 0.22,
    "unison": 25,
    "spread": 5,
    "filterEnv": 22,
    "filterDecay": 0.45
  },
  "strings": {
    "wave": "sawtooth",
    "octave": 0,
    "cutoff": 2100,
    "res": 0.7,
    "attack": 0.45,
    "release": 1.2,
    "unison": 55,
    "spread": 9,
    "chorus": 22,
    "chorusRate": 0.5,
    "reverb": 18
  },
  "organ": {
    "wave": "sine",
    "octave": 0,
    "cutoff": 6000,
    "res": 0.7,
    "attack": 0.005,
    "release": 0.06,
    "layerWave": "triangle",
    "layerMix": 35,
    "detune": 0,
    "sub": 35,
    "drive": 5,
    "reverb": 10
  },
  "space": {
    "wave": "triangle",
    "octave": 1,
    "cutoff": 3000,
    "res": 1,
    "attack": 0.005,
    "release": 0.3,
    "layerWave": "sine",
    "layerMix": 30,
    "detune": 3,
    "echoMix": 30,
    "echoTime": 0.375,
    "reverb": 25,
    "ampDecay": 0.5,
    "sustain": 0
  },
  "acid": {
    "wave": "sawtooth",
    "octave": -1,
    "cutoff": 180,
    "res": 7,
    "attack": 0.005,
    "release": 0.12,
    "filterEnv": 30,
    "filterDecay": 0.2,
    "drive": 18,
    "glide": 0.08
  },
  "lead": {
    "wave": "triangle",
    "octave": 1,
    "cutoff": 3200,
    "res": 1.4,
    "attack": 0.01,
    "release": 0.25,
    "layerWave": "square",
    "layerMix": 20,
    "detune": 4,
    "lfoDepth": 9,
    "lfoRate": 4.5
  }
};
const ADV_DEFAULTS = {
  autoPan: 0,
  autoPanRate: 0.5,
  bass: 0,
  treble: 0,
  "compThreshold": -18,
  "compRatio": 1,
  "ampDecay": 0.25,
  "sustain": 100,
  "pwmOn": 0,
  "pulseWidth": 50,
  "velocitySense": 100,
  "keyTrack": 0,
  "voiceMode": 0,
  "arpMode": 0,
  "tempo": 120,
  "phaser": 0,
  "phaserRate": 0.4,
  "flanger": 0,
  "flangerRate": 0.3,
  "ring": 0,
  "ringFreq": 80,
  "fmIndex": 0,
  "fmRatio": 2,
  "tableOn": 0,
  "tablePosition": 0,
  "syncOn": 0,
  "syncRatio": 1,
  "sampleHold": 0,
  "sampleRate": 2,
  "stepOn": 0,
  "step0": 0,
  "step1": 4,
  "step2": 7,
  "step3": 12,
  "gateOn": 0,
  "bits": 16,
  "fold": 0,
  "width": 100
};
const ADV_SETTINGS = {
  "harmonics": 64,
  "waveSamples": 256,
  "curveSamples": 32769,
  "phaserStages": [
    0.5,
    1,
    2,
    4
  ],
  "phaserCenter": 600,
  "phaserDepth": 900,
  "flangerDelay": 0.004,
  "flangerDepth": 0.003,
  "flangerFeedback": 0.25,
  "randomSteps": 64,
  "randomFrames": 128,
  "clockTickMs": 25,
  "lookAhead": 0.08,
  "clockStart": 0.025,
  "gateRamp": 0.004,
  "noteGate": 0.7
};
const EXTRAS = {
  ...ADV_DEFAULTS,
  "filterType": "lowpass",
  "layerWave": "sine",
  "layerMix": 0,
  "detune": 7,
  "lfoDepth": 0,
  "lfoRate": 3,
  "transpose": 0,
  "noise": 0,
  "drive": 0,
  "tremDepth": 0,
  "tremRate": 3,
  "echoMix": 0,
  "echoTime": 0.3,
  "pan": 0,
  "sub": 0,
  "unison": 0,
  "spread": 7,
  "filterEnv": 0,
  "filterDecay": 0.3,
  "glide": 0,
  "chorus": 0,
  "chorusRate": 0.7,
  "reverb": 0
};
const LOG_CONTROLS = {
  autoPanRate: [0.05, 12, false],
  "ampDecay": [
    0.01,
    2
  ],
  "phaserRate": [
    0.1,
    5
  ],
  "flangerRate": [
    0.1,
    5
  ],
  "ringFreq": [
    10,
    2000
  ],
  "sampleRate": [
    0.1,
    12
  ],
  "attack": [
    0.005,
    1.5
  ],
  "release": [
    0.03,
    2
  ],
  "lfoRate": [
    0.2,
    10
  ],
  "tremRate": [
    0.2,
    10
  ],
  "chorusRate": [
    0.2,
    3
  ],
  "echoTime": [
    0.03,
    1.5
  ],
  "filterDecay": [
    0.05,
    2
  ],
  "glide": [
    0.005,
    0.8,
    true
  ]
};
const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B"
];
const NOTES = [
  {
    "name": "C",
    "midi": 60,
    "key": "A",
    "code": "KeyA"
  },
  {
    "name": "D",
    "midi": 62,
    "key": "S",
    "code": "KeyS"
  },
  {
    "name": "E",
    "midi": 64,
    "key": "D",
    "code": "KeyD"
  },
  {
    "name": "F",
    "midi": 65,
    "key": "F",
    "code": "KeyF"
  },
  {
    "name": "G",
    "midi": 67,
    "key": "G",
    "code": "KeyG"
  },
  {
    "name": "A",
    "midi": 69,
    "key": "H",
    "code": "KeyH"
  },
  {
    "name": "B",
    "midi": 71,
    "key": "J",
    "code": "KeyJ"
  },
  {
    "name": "C",
    "midi": 72,
    "key": "K",
    "code": "KeyK"
  },
  {
    "name": "D",
    "midi": 74,
    "key": "L",
    "code": "KeyL"
  }
];
function sliderValue(key, value) {
  const spec = LOG_CONTROLS[key];
  if (!spec)
    return value;
  const [min, max, zero] = spec;
  if (zero && value === 0)
    return 0;
  const offset = zero ? 1 : 0;
  return offset + (SETTINGS.sliderSteps - offset) * Math.log(Math.max(min, value) / min) / Math.log(max / min);
}

function sliderParam(key, value) {
  const spec = LOG_CONTROLS[key];
  if (!spec)
    return +value;
  const [min, max, zero] = spec;
  if (zero && +value === 0)
    return 0;
  const offset = zero ? 1 : 0;
  return min * Math.pow(max / min, (+value - offset) / (SETTINGS.sliderSteps - offset));
}

function noteName(midi) {
  return NOTE_NAMES[(midi % 12 + 12) % 12] + (Math.floor(midi / 12) - 1);
}

const cutoffFromSlider = value => SETTINGS.minCutoff * Math.pow(SETTINGS.maxCutoff / SETTINGS.minCutoff, value / SETTINGS.sliderSteps);
const cutoffToSlider = value => SETTINGS.sliderSteps * Math.log(value / SETTINGS.minCutoff) / Math.log(SETTINGS.maxCutoff / SETTINGS.minCutoff);

export { SETTINGS, PRESETS, ADV_DEFAULTS, ADV_SETTINGS, EXTRAS, LOG_CONTROLS, NOTE_NAMES, NOTES, sliderValue, sliderParam, noteName, cutoffFromSlider, cutoffToSlider };

// Parameters auditioned together by each module header. Transport is never isolated.
export const MODULE_PARAMETERS = {
  autopan: ["autoPan", "autoPanRate"],
  oscillator: ["wave", "octave"],
  pitch: ["transpose"],
  cutoff: ["filterType", "cutoff", "res"],
  envelope: ["attack", "ampDecay", "sustain", "release"],
  voicemode: ["voiceMode"],
  sub: ["sub"],
  velocity: ["velocitySense"],
  glide: ["glide"],
  layers: ["layerWave", "layerMix", "detune"],
  unison: ["unison", "spread"],
  filterenv: ["filterEnv", "filterDecay"],
  lfo: ["lfoDepth", "lfoRate"],
  tracking: ["keyTrack"],
  noise: ["noise"],
  harmonics: ["wave"],
  drive: ["drive"],
  pan: ["pan"],
  width: ["width"],
  chorus: ["chorus", "chorusRate"],
  reverb: ["reverb"],
  echo: ["echoMix", "echoTime"],
  tremolo: ["tremDepth", "tremRate"],
  pwm: ["pwmOn", "pulseWidth"],
  wavetable: ["tableOn", "tablePosition"],
  samplehold: ["sampleHold", "sampleRate"],
  sync: ["syncOn", "syncRatio"],
  phaser: ["phaser", "phaserRate"],
  flanger: ["flanger", "flangerRate"],
  fm: ["fmIndex", "fmRatio"],
  ring: ["ring", "ringFreq"],
  crusher: ["bits"],
  folder: ["fold"],
  compressor: ["compThreshold", "compRatio"],
  bass: ["bass"],
  treble: ["treble"],
};
export const TONE_FREQUENCIES = { bass: 200, treble: 3000 };

// Neutral settings for reversible module bypass. Source mute only silences the main oscillator.
export const MODULE_BYPASS = {
  autopan: { autoPan: 0 },
  oscillator: { mainMuted: true }, pitch: { transpose: 0 },
  cutoff: { filterMuted: true }, envelope: { envelopeMuted: true },
  voicemode: { voiceMode: 0 }, sub: { sub: 0 }, velocity: { velocitySense: 0 },
  glide: { glide: 0 }, layers: { layerMix: 0 }, unison: { unison: 0 },
  filterenv: { filterEnv: 0 }, lfo: { lfoDepth: 0 }, tracking: { keyTrack: 0 },
  noise: { noise: 0 }, harmonics: { wave: "sine", pwmOn: 0, tableOn: 0, syncOn: 0 },
  drive: { drive: 0 }, pan: { pan: 0 }, width: { width: 100 },
  chorus: { chorus: 0 }, reverb: { reverb: 0 }, echo: { echoMix: 0 },
  tremolo: { tremDepth: 0 }, pwm: { pwmOn: 0 }, wavetable: { tableOn: 0 },
  samplehold: { sampleHold: 0 }, sync: { syncOn: 0 }, phaser: { phaser: 0 },
  flanger: { flanger: 0 }, fm: { fmIndex: 0 }, ring: { ring: 0 },
  crusher: { bits: 16 }, folder: { fold: 0 }, compressor: { compRatio: 1 },
  bass: { bass: 0 }, treble: { treble: 0 }
};
