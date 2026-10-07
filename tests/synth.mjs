// No-browser regression tests with DOM and AudioContext doubles; not a sound-quality test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const elements = new Map, groups = {}, windowEvents = new Map, documentEvents = new Map;
const timers = new Map;
let timerId = 0, nextFrame, permissionRequests = 0;
function events(map, name, fn) {
  if (!map.has(name))
    map.set(name, []);
  map.get(name).push(fn);
}
function makeElement(id = "") {
  const classes = new Set;
  const context = { clearRect() {
    this.points = [];
  }, points: [], beginPath() {}, closePath() {}, stroke() {}, fill() {}, setTransform() {}, setLineDash() {}, fillText() {}, arc(...values) {
    assert(values.every(Number.isFinite));
  }, moveTo(x, y) {
    assert(Number.isFinite(x) && Number.isFinite(y));
    this.points.push(x, y);
  }, lineTo(x, y) {
    this.moveTo(x, y);
  } };
  return {
    id,
    dataset: {},
    style: { setProperty() {} },
    classList: { toggle(name, on) {
      if (on ?? !classes.has(name))
        classes.add(name);
      else
        classes.delete(name);
    }, contains(name) {
      return classes.has(name);
    } },
    value: "0",
    min: "0",
    max: "100",
    children: [],
    events: {},
    clientWidth: 300,
    clientHeight: 94,
    hidden: false,
    getAttribute(key) {
      return String(this[key]);
    },
    setAttribute(key, value) {
      this[key] = value;
    },
    addEventListener(name, fn) {
      this.events[name] = fn;
    },
    querySelector() {
      return this.label ??= {};
    },
    getContext() {
      return context;
    },
    matches(selector) {
      return this.type === "range" ? false : selector.includes("textarea") && this.tag === "textarea";
    },
    after(node) {
      this.afterNode = node;
    },
    append(node) {
      elements.set(node.id, node);
      this.children.push(node);
    },
    insertBefore(node) {
      elements.set(node.id, node);
      this.children.push(node);
    },
    setPointerCapture() {}
  };
}
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
for (const tag of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
  const attributes = Object.fromEntries([...tag[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  if (!attributes.id && !Object.keys(attributes).some((k) => k.startsWith("data-")))
    continue;
  const element = makeElement(attributes.id || "");
  element.tag = tag[1];
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith("data-")) {
      const key = name.slice(5);
      element.dataset[key] = value;
      (groups[key] ??= []).push(element);
    } else
      element[name] = value;
  }
  if (element.id) {
    assert(!elements.has(element.id), "Duplicate ID " + element.id);
    elements.set(element.id, element);
  }
}

class AudioParam {
  constructor() {
    this.value = 0;
    this.events = [];
  }
  record(kind, value, time) {
    assert(Number.isFinite(value) && Number.isFinite(time));
    this.value = value;
    this.events.push({ kind, value, time });
  }
  setValueAtTime(value, time) {
    this.record("set", value, time);
  }
  setTargetAtTime(value, time) {
    this.record("target", value, time);
  }
  linearRampToValueAtTime(value, time) {
    this.record("linear", value, time);
  }
  exponentialRampToValueAtTime(value, time) {
    assert(value > 0);
    this.record("exponential", value, time);
  }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}
const audioNodes = [];

class AudioNode {
  constructor() {
    audioNodes.push(this);
    for (const key of ["offset", "playbackRate", "pan", "delayTime", "detune", "gain", "frequency", "Q", "threshold", "knee", "ratio", "attack", "release"])
      this[key] = new AudioParam;
    this.connections = [];
  }
  get frequencyBinCount() {
    return (this.fftSize || 4096) / 2;
  }
  connect(node) {
    assert(node, "Missing audio connection");
    this.connections.push(node);
    return node;
  }
  disconnect() {}
  start(time = 0) {
    this.startTime = time;
  }
  stop(time = 0) {
    this.stopTime = time;
  }
  setPeriodicWave(wave) {
    this.wave = wave;
  }
  getFrequencyResponse(f, m, p) {
    m.fill(1);
    p.fill(0);
  }
  getFloatTimeDomainData(data) {
    data.fill(0);
  }
  getByteFrequencyData(data) {
    data.fill(0);
  }
}

class AudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.sampleRate = 48000;
    this.destination = new AudioNode;
  }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (i) => data[i] };
  }
  createPeriodicWave(real, imag) {
    assert([...real, ...imag].every(Number.isFinite));
    return { real, imag };
  }
  addEventListener() {}
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}
for (const name of ["Gain", "Oscillator", "Analyser", "BiquadFilter", "DynamicsCompressor", "BufferSource", "WaveShaper", "Delay", "StereoPanner", "Convolver", "ConstantSource", "ChannelSplitter", "ChannelMerger"])
  AudioContext.prototype["create" + name] = () => new AudioNode;
const midiPort = { id: "test-port", name: "Test keyboard", state: "connected", type: "input" };
const midiAccess = { inputs: new Map([["port", midiPort]]) };
globalThis.window = { AudioContext, devicePixelRatio: 1, addEventListener: (name, fn) => events(windowEvents, name, fn) };
globalThis.document = { hidden: false, getElementById: (id) => elements.get(id) || null, querySelectorAll: (selector) => groups[selector.match(/data-([\w-]+)/)[1]] || [], createElement: () => makeElement(), addEventListener: (name, fn) => events(documentEvents, name, fn) };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { async requestMIDIAccess() {
  permissionRequests++;
  return midiAccess;
} } });
globalThis.ResizeObserver = class {
  constructor(fn) {
    this.fn = fn;
  }
  observe() {
    this.fn();
  }
};
globalThis.IntersectionObserver = class {
  constructor(fn) {
    this.fn = fn;
  }
  observe(target) {
    this.fn([{ target, isIntersecting: true }]);
  }
};
globalThis.setInterval = (fn, ms) => {
  const id = ++timerId;
  timers.set(id, { fn, ms });
  return id;
};
globalThis.clearInterval = (id) => timers.delete(id);
globalThis.requestAnimationFrame = (fn) => {
  nextFrame = fn;
};
globalThis.fetch = async () => ({ ok: true });
await import("../src/app.js");
const engine = await import("../src/audio.js"), sequence = await import("../src/sequencer.js"), config = await import("../src/config.js"), visuals = await import("../src/visualizers.js");
const click = (element) => element.events.click();
function reset(overrides = {}) {
  sequence.releaseAll();
  for (const voice of [...engine.voices])
    voice.osc.onended();
  engine.setParams({ ...config.EXTRAS, ...config.PRESETS.basic, ...overrides });
  engine.updateAudioParameters();
}
assert.equal(groups.card.length, 39);
assert.equal(groups.preset.length, 13);
assert.equal(permissionRequests, 0);
for (const [key, [min, max, zero]] of Object.entries(config.LOG_CONTROLS)) {
  for (const value of [min, Math.sqrt(min * max), max])
    assert(Math.abs(config.sliderParam(key, config.sliderValue(key, value)) - value) < 0.0000001);
  if (zero)
    assert.equal(config.sliderParam(key, 0), 0);
}
for (const preset of groups.preset) {
  click(preset);
  sequence.noteOn(0, "preset");
  sequence.noteOff("preset");
  for (const voice of [...engine.voices])
    voice.osc.onended();
}
reset();
sequence.noteOn(0, "duplicate");
sequence.noteOn(0, "duplicate");
assert.equal(engine.held.size, 1);
reset();
reset({ attack: 0.01, ampDecay: 0.2, sustain: 25 });
sequence.noteOn(0, "adsr");
const envelope = engine.held.get("adsr");
assert(Math.abs(engine.envelopeLevel(envelope, envelope.start + 1) - envelope.peak * 0.25) < 0.000000001);
reset();
for (const patch of [{ pwmOn: 1, pulseWidth: 20 }, { tableOn: 1, tablePosition: 75 }, { syncOn: 1, syncRatio: 2.4 }]) {
  reset(patch);
  sequence.noteOn(0, "wave");
  assert(engine.held.get("wave").osc.wave);
  reset();
}
reset({ fmIndex: 2, sub: 60, unison: 40 });
sequence.noteOn(0, "extras");
const extraVoice = engine.held.get("extras");
assert(extraVoice.fm);
assert.equal(extraVoice.extras.size, 3);
sequence.noteOff("extras");
assert(Number.isFinite(extraVoice.fm.osc.stopTime));
for (const extra of extraVoice.extras.values())
  assert(Number.isFinite(extra.osc.stopTime));
reset();
reset({ voiceMode: 2 });
sequence.noteOn(0, "first");
const mono = engine.held.get("mono");
sequence.noteOn(4, "second");
assert.equal(engine.held.get("mono"), mono);
assert.equal(mono.midi, config.NOTES[4].midi);
sequence.noteOff("second");
assert.equal(mono.midi, config.NOTES[0].midi);
sequence.noteOff("first");
assert.equal(engine.held.size, 0);
reset();
reset({ arpMode: 1, stepOn: 1, gateOn: 1, filterEnv: 12, fmIndex: 1 });
sequence.noteOn(0, "arp");
sequence.noteOn(4, "arp2");
assert(engine.voices.size > 0);
for (const voice of engine.voices) {
  assert(voice.start >= engine.audio.currentTime);
  assert(voice.releaseStart > voice.start);
}
engine.audio.currentTime += 0.25;
for (const job of [...timers.values()])
  if (job.ms === config.ADV_SETTINGS.clockTickMs)
    job.fn();
assert(sequence.clockTimer !== null);
reset();
assert.equal(sequence.clockTimer, null);
reset({ phaser: 60, flanger: 50, ring: 70, bits: 5, fold: 40, sampleHold: 12, width: 160, reverb: 20, chorus: 20 });
engine.updateAudioParameters();
assert(audioNodes.some((node) => node.curve?.length === config.ADV_SETTINGS.curveSamples));
for (const card of groups.help) {
  click(card);
  assert.equal(elements.get("controls-" + card.dataset.help).hidden, true);
  click(card);
  assert.equal(elements.get("controls-" + card.dataset.help).hidden, false);
}
nextFrame(1000);
assert.equal(visuals.miniPlots.size, 39);
reset();
const range = elements.get("cutoff"), event = { target: range, code: "KeyL", preventDefault() {} };
for (const fn of windowEvents.get("keydown"))
  fn(event);
assert(sequence.performanceNotes.has("KeyL"));
for (const fn of windowEvents.get("keyup"))
  fn({ code: "KeyL" });
assert(!sequence.performanceNotes.has("KeyL"));
for (let i = 0;i < 30; i++)
  click(elements.get("transpose-down"));
assert.equal(engine.params.transpose, -30);
reset();
await click(elements.get("midi"));
assert.equal(permissionRequests, 1);
assert(elements.get("midi").classList.contains("connected"));
assert.equal(elements.get("sticky-rack").afterNode, elements.get("keyboard"));
midiPort.onmidimessage({ data: [144, 61, 100] });
assert(sequence.performanceNotes.has("midi:test-port:0:61"));
midiPort.onmidimessage({ data: [176, 64, 127] });
midiPort.onmidimessage({ data: [128, 61, 0] });
assert(sequence.performanceNotes.has("midi:test-port:0:61"));
midiPort.onmidimessage({ data: [176, 64, 0] });
assert(!sequence.performanceNotes.has("midi:test-port:0:61"));
await click(elements.get("midi"));
assert(!elements.get("midi").classList.contains("connected"));
assert.equal(midiPort.onmidimessage, null);
reset();
click(groups.preset.find((button) => button.dataset.preset === "pad"));
for (const [key, value] of [["drive", 45], ["reverb", 20]]) {
  const input = elements.get(key);
  input.value = String(value);
  input.events.input({ target: input });
}
click(groups.choice.find((button) => button.dataset.choice === "arpMode" && button.dataset.value === "1"));
sequence.noteOn(0, "isolate-chord");
click(groups.choice.find((button) => button.dataset.choice === "stepOn" && button.dataset.value === "1"));
const timerBefore = sequence.clockTimer;
const isolateDrive = groups.isolate.find((button) => button.dataset.isolate === "drive");
click(isolateDrive);
assert.equal(engine.params.drive, 45);
assert.equal(engine.params.reverb, 0);
assert.equal(engine.params.cutoff, config.PRESETS.pad.cutoff);
assert.equal(engine.params.arpMode, 1);
assert.equal(engine.params.stepOn, 1);
assert.equal(sequence.clockTimer, timerBefore);
assert(sequence.performanceNotes.has("isolate-chord"));
click(isolateDrive);
assert.equal(engine.params.reverb, 20);
assert.equal(sequence.clockTimer, timerBefore);
click(groups.preset.find((button) => button.dataset.preset === "pad"));
assert.equal(sequence.clockTimer, null);
console.log("PASS: modules, 39 cards, 13 presets, ADSR, custom waves, FM, mono/legato, sequencers, effects, cleanup, log scales, keyboard focus, transpose, MIDI and sticky rack");

// Module isolation retains every local control and restores other edits on exit.
const patch = await import('../src/patch.js');
patch.loadPatch('pad');
patch.editPatch('layerMix', 35);
patch.editPatch('detune', 19);
patch.editPatch('layerWave', 'square');
patch.editPatch('drive', 60);
let isolated = patch.isolatePatch('layers');
assert.equal(isolated.layerMix, 35);
assert.equal(isolated.detune, 19);
assert.equal(isolated.layerWave, 'square');
assert.equal(isolated.drive, config.PRESETS.pad.drive ?? config.EXTRAS.drive);
isolated = patch.editPatch('detune', 24);
assert.equal(patch.patchState().isolated, 'layers');
assert.equal(isolated.layerMix, 35);
assert.equal(patch.isolatePatch('layers').drive, 60);
assert.equal(groups.isolate.length, 36);
assert(html.indexOf('id="transport-controls"') > html.indexOf('id="keyboard"'));
assert(html.indexOf('id="lesson-gateseq"') < html.indexOf('id="lesson-oscillator"'));

// Shelf diagrams are valid before audio starts; endpoints match gain and unity.
const { shelfResponse } = await import('../src/tone.js');
const frequencies = new Float32Array([0, 23999]);
const response = new Float32Array(2);
for (const key of ['bass', 'treble']) {
  for (const gain of [-12, 0, 12]) {
    shelfResponse(key, gain, frequencies, response, 48000);
    const boosted = key === 'bass' ? 0 : 1;
    assert(Math.abs(response[boosted] - 10 ** (gain / 20)) < 0.001);
    assert(Math.abs(response[1 - boosted] - 1) < 0.001);
  }
  engine.setParams({ ...engine.params, [key]: 6 });
  engine.updateAudioParameters();
  assert.equal(engine.toneFilters[key].gain.value, 6);
  assert.equal(engine.toneFilters[key].frequency.value, config.TONE_FREQUENCIES[key]);
}
console.log('PASS: module isolation, compact transport placement, shelf audio and silent diagrams');

// Mute and isolation preserve edits and transport settings independently.
patch.loadPatch('pad');
patch.editPatch('autoPan', 70);
patch.editPatch('autoPanRate', 2);
patch.editPatch('arpMode', 1);
let mutedPatch = patch.mutePatch('autopan');
assert.equal(mutedPatch.autoPan, 0);
assert.equal(mutedPatch.arpMode, 1);
assert.equal(patch.isolatePatch('autopan').autoPan, 0);
assert.equal(patch.mutePatch('autopan').autoPan, 70);
assert.equal(patch.patchState().isolated, 'autopan');
assert.equal(patch.isolatePatch('autopan').autoPanRate, 2);
patch.mutePatch('layers');
assert.equal(patch.loadPatch('pad').layerMix, config.PRESETS.pad.layerMix ?? config.EXTRAS.layerMix);
assert.deepEqual(patch.patchState().muted, []);
assert.equal(groups.mute.length, 36);
console.log('PASS: Auto Pan, reversible mute, mute/isolate interaction and preset reset');

const panicButton = elements.get('global-mute');
sequence.noteOn(0, 'panic-held');
engine.setParams({ ...engine.params, stepOn: 1, gateOn: 1 });
sequence.syncClock();
click(panicButton);
assert.equal(engine.outputMuted, true);
assert.equal(engine.held.size, 0);
assert.equal(sequence.performanceNotes.size, 0);
assert.equal(sequence.clockTimer, null);
assert.equal(engine.params.stepOn, 0);
sequence.noteOn(0, 'muted-note');
assert.equal(sequence.performanceNotes.size, 0);
engine.setVolume(0.4);
assert.equal(engine.outputMuted, true);
click(panicButton);
assert.equal(engine.outputMuted, false);
assert.equal(sequence.clockTimer, null);
assert.equal(panicButton.textContent, 'Mute');
console.log('PASS: global panic stops transport, blocks notes and preserves mute across volume edits');

assert.equal(config.NOTES[0].midi, 60);
assert.equal(config.NOTES[8].midi, 74);
