// Wires DOM controls and MIDI to the engine; owns the single render loop.
import { measure, record, frame } from "../profiler/capture.js";
import { SETTINGS, PRESETS, EXTRAS, LOG_CONTROLS, NOTES, sliderValue, sliderParam, noteName, cutoffFromSlider, cutoffToSlider } from "./config.js";
import { params, audio, analyser, samples, spectrumData, spectrumBins, filterPreview, voices, held, setAudioHooks, setParams, setVolume, setOutputMuted, outputMuted, updateAudioParameters, initAudio, releaseVoice } from "./audio.js";
import { performanceNotes, gatePattern, noteOn, noteOff, releaseAll, syncClock } from "./sequencer.js";
import { miniPlots, setFilterResponse, waveAt, linePath, drawCards, grid } from "./visualizers.js";
import { report } from "./telemetry.js";
import { loadPatch, editPatch as editStoredPatch, isolatePatch, mutePatch, patchState, savePatch, openPatch } from "./patch.js";
const $ = (id) => document.getElementById(id);
let selectedPreset = "pad", lastDraw = 0, preview = null, heldDirty = true, redraw = true, lastSoundFrame = 0;
const EFFECT_KEYS = ["transpose", "noise", "drive", "tremDepth", "tremRate", "echoMix", "echoTime", "pan", "sub", "unison", "spread", "filterEnv", "filterDecay", "glide", "chorus", "chorusRate", "reverb"];
function editPatch(key, value) {
  return editStoredPatch(key, value, params);
}
function applyEditedPatch(next) {
  const modeChanged = params.voiceMode !== next.voiceMode;
  const notes = modeChanged ? [...performanceNotes.entries()] : [];
  if (modeChanged) {
    for (const source of [...held.keys()])
      releaseVoice(source);
    performanceNotes.clear();
  }
  setParams(next);
  if (next.gatePattern)
    gatePattern.splice(0, gatePattern.length, ...next.gatePattern);
  if (modeChanged)
    for (const [source, note] of notes)
      noteOn(-1, source, note.velocity, note.midi);
}
function refreshIsolation(...args) { return measure("app.refreshIsolation", refreshIsolationImpl, args); }
function refreshIsolationImpl() {
  const state = patchState();
  document.querySelectorAll("[data-mute]").forEach(button => {
    const muted = state.muted.includes(button.dataset.mute);
    button.setAttribute("aria-pressed", muted);
    button.title = muted ? "Restore this module" : "Bypass this module without losing its settings";
  });
  document.querySelectorAll("[data-isolate]").forEach((button) => {
    button.setAttribute("aria-pressed", state.isolated === button.dataset.isolate);
    button.title = state.isolated === button.dataset.isolate ? "Restore all edits" : "Keep " + state.preset + " and audition only this edit";
  });
}
function bindIsolation() {
  document.querySelectorAll("[data-mute]").forEach(button => button.addEventListener("click", () => {
    applyEditedPatch(mutePatch(button.dataset.mute, params));
    refresh();
  }));
  document.querySelectorAll("[data-isolate]").forEach((button) => button.addEventListener("click", () => {
    const next = isolatePatch(button.dataset.isolate, params);
    applyEditedPatch(next);
    refresh();
  }));
}
function fill(input) {
  input.style.setProperty("--fill", `${100 * (input.value - input.min) / (input.max - input.min)}%`);
}
function refresh(...args) { return measure("app.refresh", refreshImpl, args); }
function refreshImpl() {
  updateAudioParameters();
  refreshIsolation();
  redraw = true;
  document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.preset === selectedPreset));
  document.querySelectorAll("[data-wave]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.wave === params.wave));
  document.querySelectorAll("[data-octave]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.octave === params.octave));
  $("octave-label").textContent = params.octave > 0 ? "+" + params.octave : params.octave;
  for (const key of ["cutoff", "res", "attack", "release"]) {
    $(key).value = key === "cutoff" ? cutoffToSlider(params[key]) : sliderValue(key, params[key]);
    fill($(key));
  }
  $("cutoff-label").textContent = params.cutoff >= 1000 ? (params.cutoff / 1000).toFixed(2) + " kHz" : Math.round(params.cutoff) + " Hz";
  $("res-label").textContent = params.res.toFixed(1);
  for (const key of ["attack", "release"])
    $(key + "-label").textContent = params[key] < 1 ? Math.round(params[key] * 1000) + " ms" : params[key].toFixed(2) + " s";
  refreshLessons();
  refreshEffects();
  refreshAdvanced();
  syncClock();
  NOTES.forEach((note, i) => {
    $("note-" + i).querySelector("span").textContent = noteName(note.midi + params.octave * 12 + params.transpose);
  });
  updateHeld();
}
function audioState() {
  const on = audio?.state === "running";
  $("power").classList.toggle("on", on);
  $("audio-state").textContent = on ? "Audio ready" : "Enable audio";
}
function updateHeld() {
  heldDirty = true;
  redraw = true;
}
function renderHeld(...args) { return measure("app.renderHeld", renderHeldImpl, args); }
function renderHeldImpl() {
  heldDirty = false;
  const notes = new Set([...performanceNotes.values()].map((v) => v.midi));
  NOTES.forEach((n, i) => $("note-" + i).classList.toggle("playing", notes.has(n.midi)));
  const names = [...notes].slice(0, 4).map((n) => noteName(n + params.octave * 12 + params.transpose));
  $("note-display").textContent = names.join(" · ") + (notes.size > 4 ? " …" : "") || "—";
  $("scope-state").textContent = notes.size ? "Playing" : voices.size ? "Release" : "Play a note";
  document.querySelectorAll("[data-listen]").forEach((b) => {
    const on = preview === b.dataset.listen && performanceNotes.has("preview");
    b.setAttribute("aria-pressed", on);
    b.querySelector(".listen-label").textContent = on ? "■ Stop" : "▶ Listen";
  });
}
function refreshLessons(...args) { return measure("app.refreshLessons", refreshLessonsImpl, args); }
function refreshLessonsImpl() {
  for (const [kind, value] of [["filter", params.filterType], ["layer", params.layerWave]])
    document.querySelectorAll("[data-" + kind + "]").forEach((b) => b.setAttribute("aria-pressed", b.dataset[kind] === value));
  for (const key of ["layerMix", "detune", "lfoDepth", "lfoRate"]) {
    $(key).value = sliderValue(key, params[key]);
    fill($(key));
  }
  $("layerMix-label").textContent = params.layerMix ? params.layerMix + " %" : "Off";
  $("detune-label").textContent = params.detune + " cents";
  $("lfoDepth-label").textContent = params.lfoDepth ? params.lfoDepth + " cents" : "Off";
  $("lfoRate-label").textContent = params.lfoRate.toFixed(1) + " Hz";
  $("filter-explanation").textContent = { lowpass: "Low-pass keeps lows and softens highs. Lower the cutoff to make the sound darker.", highpass: "High-pass keeps highs and reduces lows. Raise the cutoff to make the sound thinner.", bandpass: "Band-pass keeps a narrow range around the cutoff. Move it to hear different parts of the same note." }[params.filterType];
  let bars = "";
  for (let n = 1;n <= SETTINGS.harmonics; n++) {
    const amplitude = params.wave === "sine" ? n === 1 ? 1 : 0 : params.wave === "sawtooth" ? 1 / n : n % 2 ? params.wave === "triangle" ? 1 / (n * n) : 1 / n : 0;
    const x = 16 + (n - 1) * 25;
    bars += `M${x} 88V${88 - amplitude * 70}`;
  }
  $("harmonics-bars").setAttribute("d", bars);
  const frequencies = new Float32Array(SETTINGS.diagramPoints + 1), magnitudes = new Float32Array(frequencies.length), phases = new Float32Array(frequencies.length);
  if (filterPreview) {
    filterPreview.type = params.filterType;
    filterPreview.frequency.value = params.cutoff;
    filterPreview.Q.value = params.res;
    for (let i = 0;i < frequencies.length; i++)
      frequencies[i] = cutoffFromSlider(i / SETTINGS.diagramPoints * 1000);
    filterPreview.getFrequencyResponse(frequencies, magnitudes, phases);
  }
  const response = (x) => {
    if (filterPreview)
      return Math.max(0, Math.min(1, 0.7 + 20 * Math.log10(Math.max(0.00001, magnitudes[Math.round(x * SETTINGS.diagramPoints)])) / 65));
    const ratio = cutoffFromSlider(x * 1000) / params.cutoff;
    const magnitude = params.filterType === "lowpass" ? 1 / Math.sqrt(1 + ratio ** 4) : params.filterType === "highpass" ? 1 / Math.sqrt(1 + ratio ** -4) : 1 / Math.sqrt(1 + ((ratio - 1 / ratio) * params.res) ** 2);
    return Math.max(0, Math.min(1, 0.7 + 20 * Math.log10(Math.max(0.00001, magnitude)) / 65));
  };
  setFilterResponse(Float32Array.from({ length: SETTINGS.miniPoints }, (_, i) => response(i / (SETTINGS.miniPoints - 1))));
  $("filter-curve").setAttribute("d", linePath((x) => 63 - response(x) * 60, 280));
  const mix = params.layerMix / 100, base = (x) => waveAt(params.wave, x * Math.PI * 2 * SETTINGS.layerCycles), layer = (x) => waveAt(params.layerWave, x * Math.PI * 2 * SETTINGS.layerCycles * Math.pow(2, params.detune * SETTINGS.detuneIllustration / 1200));
  $("layer-base").setAttribute("d", linePath((x) => 17 - base(x) * 10));
  $("layer-second").setAttribute("d", linePath((x) => 44 - layer(x) * 10 * mix));
  $("layer-sum").setAttribute("d", linePath((x) => 78 - (base(x) + layer(x) * mix) / (1 + mix) * 14));
  $("lfo-curve").setAttribute("d", linePath((x) => 47 - Math.sin(x * Math.PI * 2 * params.lfoRate) * params.lfoDepth / 60 * 30));
}
function releaseMidi(prefix = "midi:") {
  for (const source of new Set([...held.keys(), ...performanceNotes.keys()]))
    if (source.startsWith(prefix))
      noteOff(source);
  for (const source of [...sustained])
    if (source.startsWith(prefix))
      sustained.delete(source);
  for (const channel of [...pedals])
    if (channel.startsWith(prefix))
      pedals.delete(channel);
}
function midiMessage(...args) { return measure("app.midiMessage", midiMessageImpl, args); }
function midiMessageImpl(port, event) {
  if (Number.isFinite(event.timeStamp)) record("input.midiDispatch", Math.max(0, performance.now() - event.timeStamp));
  if (!midiEnabled || document.hidden)
    return;
  const [status, note, value] = event.data, kind = status & 240, channel = "midi:" + port.id + ":" + (status & 15) + ":", source = channel + note;
  if (kind === 144 && value > 0) {
    sustained.delete(source);
    noteOff(source);
    noteOn(-1, source, value / 127, note);
  } else if (kind === 128 || kind === 144 && value === 0) {
    if (pedals.has(channel))
      sustained.add(source);
    else
      noteOff(source);
  } else if (kind === 176 && note === 64) {
    if (value >= 64)
      pedals.add(channel);
    else {
      pedals.delete(channel);
      for (const id of [...sustained])
        if (id.startsWith(channel)) {
          sustained.delete(id);
          noteOff(id);
        }
    }
  } else if (kind === 176 && (note === 123 || note === 120))
    releaseMidi(channel);
}
function positionKeyboard() {
  const keyboard = $("keyboard"), rack = $("sticky-rack");
  if (midiEnabled)
    rack.after(keyboard);
  else
    rack.append(keyboard);
}
function midiHint(message) {
  $("midi").title = message;
  $("midi").setAttribute("aria-label", message);
}
function bindMidi() {
  positionKeyboard();
  if (!midiAccess)
    return;
  let count = 0;
  const names = [];
  for (const port of midiAccess.inputs.values()) {
    if (port.state === "connected" && midiEnabled) {
      count++;
      names.push(port.name || "Keyboard");
      port.onmidimessage = (event) => midiMessage(port, event);
    } else {
      port.onmidimessage = null;
      releaseMidi("midi:" + port.id + ":");
    }
  }
  $("midi").setAttribute("aria-pressed", midiEnabled);
  $("midi").classList.toggle("connected", midiEnabled && count > 0);
  midiHint(midiEnabled ? count ? "MIDI connected: " + names.join(", ") : "MIDI enabled. Connect a keyboard." : "Enable MIDI keyboard");
}
function refreshEffects(...args) { return measure("app.refreshEffects", refreshEffectsImpl, args); }
function refreshEffectsImpl() {
  $("transpose-up").disabled = params.transpose >= 12;
  $("transpose-down").disabled = false;
  $("transpose").min = Math.min(-12, params.transpose);
  for (const key of EFFECT_KEYS) {
    $(key).value = sliderValue(key, params[key]);
    fill($(key));
    let label = params[key] + " %";
    if (key === "transpose")
      label = (params[key] > 0 ? "+" : "") + params[key] + " st";
    else if (["tremRate", "chorusRate"].includes(key))
      label = params[key].toFixed(1) + " Hz";
    else if (["echoTime", "filterDecay", "glide"].includes(key))
      label = Math.round(params[key] * 1000) + " ms";
    else if (key === "spread")
      label = params[key] + " cents";
    else if (key === "filterEnv")
      label = params[key] ? "+" + params[key] + " st" : "Off";
    else if (key === "pan")
      label = params[key] === 0 ? "Center" : Math.abs(params[key]) + "% " + (params[key] < 0 ? "L" : "R");
    else if (!params[key])
      label = "Off";
    $(key + "-label").textContent = label;
  }
}
function setupCards() {
  document.querySelectorAll("[data-card]").forEach((card) => {
    const key = card.dataset.card, canvas = $("live-" + key), plot = { canvas, ctx: canvas.getContext("2d"), width: 0, height: 0, visible: false, history: new Float32Array(SETTINGS.miniPoints), historyIndex: 0, lastHistory: 0 };
    miniPlots.set(key, plot);
    new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      plot.width = canvas.clientWidth;
      plot.height = canvas.clientHeight;
      canvas.width = plot.width * ratio;
      canvas.height = plot.height * ratio;
      plot.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw = true;
    }).observe(canvas);
    visibility.observe(card);
  });
  document.querySelectorAll("[data-help]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.help, show = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", show);
    button.textContent = show ? "×" : "?";
    button.setAttribute("aria-label", show ? "Show controls" : "Show explanation");
    $("controls-" + key).hidden = show;
    $("help-" + key).hidden = !show;
  }));
}
function refreshAdvanced(...args) { return measure("app.refreshAdvanced", refreshAdvancedImpl, args); }
function refreshAdvancedImpl() {
  document.querySelectorAll("[data-advanced]").forEach((input) => {
    const key = input.dataset.advanced;
    input.value = sliderValue(key, params[key]);
    fill(input);
    let label = params[key] + " %";
    if (["ampDecay"].includes(key))
      label = Math.round(params[key] * 1000) + " ms";
    else if (["ringFreq", "sampleRate", "phaserRate", "flangerRate", "autoPanRate"].includes(key))
      label = params[key].toFixed(params[key] < 10 ? 1 : 0) + " Hz";
    else if (key === "tempo")
      label = params[key] + " BPM";
    else if (["syncRatio", "fmRatio"].includes(key))
      label = params[key].toFixed(1) + "×";
    else if (["compThreshold", "bass", "treble"].includes(key))
      label = params[key] + " dB";
    else if (key === "compRatio")
      label = params[key].toFixed(1) + ":1";
    else if (key === "fmIndex")
      label = params[key].toFixed(2);
    else if (key === "sampleHold" || key.startsWith("step"))
      label = params[key] + " st";
    else if (key === "bits")
      label = params[key] === 16 ? "Clean" : params[key] + " bit";
    $("adv-" + key + "-label").textContent = label;
  });
  document.querySelectorAll("[data-choice]").forEach((button) => button.setAttribute("aria-pressed", params[button.dataset.choice] === +button.dataset.value));
  document.querySelectorAll("[data-gate]").forEach((button) => button.setAttribute("aria-pressed", !!gatePattern[+button.dataset.gate]));
}
function bindAdvancedControls() {
  document.querySelectorAll("[data-advanced]").forEach((input) => input.addEventListener("input", () => {
    const key = input.dataset.advanced;
    applyEditedPatch(editPatch(key, sliderParam(key, input.value)));
    selectedPreset = null;
    refresh();
    if (key === "tempo")
      syncClock();
  }));
  document.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.choice, notes = [...performanceNotes.entries()];
    if (key === "voiceMode" || key === "arpMode") {
      for (const source of [...held.keys()])
        releaseVoice(source);
      performanceNotes.clear();
    }
    applyEditedPatch(editPatch(key, +button.dataset.value));
    selectedPreset = null;
    if (params.arpMode || params.stepOn || params.gateOn)
      initAudio();
    refresh();
    if (key === "voiceMode" || key === "arpMode")
      for (const [source, note] of notes)
        noteOn(-1, source, note.velocity, note.midi);
    syncClock();
  }));
  document.querySelectorAll("[data-gate]").forEach((button) => button.addEventListener("click", () => {
    const step = +button.dataset.gate;
    const pattern = [...gatePattern];
    pattern[step] = 1 - pattern[step];
    applyEditedPatch(editPatch("gatePattern", pattern));
    gatePattern.splice(0, gatePattern.length, ...params.gatePattern);
    selectedPreset = null;
    refreshAdvanced();
    redraw = true;
  }));
}
function draw(...args) { return measure("app.draw", drawImpl, args); }
function drawImpl(now) {
  frame(now);
  requestAnimationFrame(draw);
  if (document.hidden)
    return;
  if (heldDirty)
    renderHeld();
  if (now - lastDraw < 1000 / SETTINGS.fps)
    return;
  if (voices.size)
    lastSoundFrame = now;
  if (!redraw && !voices.size && now - lastSoundFrame > Math.max(SETTINGS.idleTailMs, params.reverb ? SETTINGS.reverbSeconds * 1000 : 0, params.echoMix ? params.echoTime * 1000 * (Math.log(0.001) / Math.log(SETTINGS.echoFeedback) + 1) : 0)) {
    lastDraw = 0;
    return;
  }
  redraw = false;
  if (lastDraw && now - lastDraw > SETTINGS.slowFrameMs)
    report("slow-frame", Math.round(now - lastDraw) + " ms");
  lastDraw = now;
  if (plots.scope.visible) {
    const started = performance.now();
    const plot = plots.scope, { ctx, width: w, height: h } = plot;
    grid(plot);
    let start = 0, count = 1;
    if (analyser) {
      analyser.getFloatTimeDomainData(samples);
      count = Math.min(Math.round(audio.sampleRate * SETTINGS.scopeMs / 1000), samples.length / 2);
      for (let i = 1;i < samples.length - count; i++)
        if (samples[i - 1] <= 0 && samples[i] > 0.001) {
          start = i;
          break;
        }
    }
    ctx.strokeStyle = "#96d3bf";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (let x = 0;x <= w; x++) {
      const value = samples ? samples[start + Math.min(count - 1, Math.floor(x / Math.max(w, 1) * count))] : 0;
      const y = h / 2 - value * h * 0.42 * SETTINGS.scopeGain;
      if (x === 0)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    record("output.wave", performance.now() - started);
  }
  if (plots.spectrum.visible) {
    const started = performance.now();
    const plot = plots.spectrum, { ctx, width: w, height: h } = plot;
    grid(plot);
    if (analyser)
      analyser.getByteFrequencyData(spectrumData);
    ctx.strokeStyle = "#96d3bf";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    const bottom = h - 34, top = 40;
    for (let i = 0;i <= SETTINGS.spectrumPoints; i++) {
      let peak = 0;
      if (analyser) {
        const [from, to] = spectrumBins[i];
        for (let j = from;j <= to; j++)
          peak = Math.max(peak, spectrumData[j]);
      }
      const x = i / SETTINGS.spectrumPoints * w, y = bottom - Math.min(1, peak / 255 * SETTINGS.spectrumGain) * (bottom - top);
      if (i === 0)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(w, bottom);
    ctx.lineTo(0, bottom);
    ctx.closePath();
    ctx.fillStyle = "#96d3bf0d";
    ctx.fill();
    record("output.spectrum", performance.now() - started);
  }
  drawCards(now);
}
setAudioHooks({ notesChanged: updateHeld, stateChanged: audioState, ready: refreshLessons, error: (message) => $("audio-state").textContent = message });
$("power").addEventListener("click", () => initAudio());
NOTES.forEach((note, index) => {
  const b = document.createElement("button");
  b.className = "key";
  b.id = "note-" + index;
  b.setAttribute("aria-label", `Note ${note.name}, key ${note.key}`);
  b.innerHTML = `<kbd>${note.key}</kbd><span></span>`;
  $("keyboard").insertBefore(b, $("transpose-buttons"));
  b.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0)
      return;
    e.preventDefault();
    if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
    noteOn(index, "pointer-" + e.pointerId);
  });
  // Touch handlers keep AudioContext activation inside a native touch gesture.
  // Ignore touch pointerdown above to avoid double-triggering the same note.
  b.addEventListener("touchstart", (event) => {
    event.preventDefault();
    for (const touch of event.changedTouches)
      noteOn(index, "touch-" + touch.identifier);
  }, { passive: false });
  for (const type of ["touchend", "touchcancel"])
    b.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === "touchend" && audio && audio.state !== "running") initAudio();
      for (const touch of event.changedTouches)
        noteOff("touch-" + touch.identifier);
    }, { passive: false });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(event, (e) => noteOff("pointer-" + e.pointerId));
  b.addEventListener("keydown", (e) => {
    if (["Space", "Enter"].includes(e.code)) {
      e.preventDefault();
      noteOn(index, "button-" + index);
    }
  });
  b.addEventListener("keyup", (e) => {
    if (["Space", "Enter"].includes(e.code)) {
      e.preventDefault();
      noteOff("button-" + index);
    }
  });
  b.addEventListener("blur", () => noteOff("button-" + index));
});
window.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.target.isContentEditable || e.target.matches("textarea,select,input:not([type=range]):not([type=button]):not([type=checkbox]):not([type=radio])"))
    return;
  const index = NOTES.findIndex((n) => n.code === e.code);
  if (index >= 0) {
    e.preventDefault();
    noteOn(index, e.code);
  }
});
window.addEventListener("keyup", (e) => noteOff(e.code));
window.addEventListener("blur", () => {
  releaseAll();
  refreshAdvanced();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAll();
    refreshAdvanced();
  }
  lastDraw = 0;
});
document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
  releaseAll();
  setParams(loadPatch(b.dataset.preset));
  gatePattern.splice(0, gatePattern.length, ...params.gatePattern);
  selectedPreset = b.dataset.preset;
  refresh();
}));
$("save-patch").addEventListener("click", () => {
  const name = prompt("Patch name", "my-patch")?.trim();
  if (!name)
    return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(savePatch(), null, 2)], { type: "application/json" }));
  link.download = name.replace(/[\\/:*?"<>|]/g, "-") + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
});
$("open-patch").addEventListener("click", () => $("patch-file").click());
$("patch-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file)
    return;
  try {
    releaseAll();
    setParams(openPatch(JSON.parse(await file.text())));
    gatePattern.splice(0, gatePattern.length, ...params.gatePattern);
    selectedPreset = null;
    refresh();
  } catch (error) {
    alert("Could not open patch: " + error.message);
  }
});
document.querySelectorAll("[data-wave]").forEach((b) => b.addEventListener("click", () => {
  applyEditedPatch(editPatch("wave", b.dataset.wave));
  selectedPreset = null;
  refresh();
}));
document.querySelectorAll("[data-octave]").forEach((b) => b.addEventListener("click", () => {
  applyEditedPatch(editPatch("octave", +b.dataset.octave));
  selectedPreset = null;
  refresh();
}));
for (const key of ["cutoff", "res", "attack", "release"])
  $(key).addEventListener("input", (e) => {
    applyEditedPatch(editPatch(key, key === "cutoff" ? cutoffFromSlider(+e.target.value) : sliderParam(key, e.target.value)));
    selectedPreset = null;
    refresh();
  });
$("global-mute").addEventListener("click", () => {
  const muted = !outputMuted;
  setOutputMuted(muted);
  releaseAll();
  pedals.clear();
  sustained.clear();
  preview = null;
  $("global-mute").setAttribute("aria-pressed", muted);
  $("global-mute").textContent = muted ? "Unmute" : "Mute";
  $("global-mute").title = muted ? "Restore output volume" : "Mute output and stop all notes";
  $("global-mute").setAttribute("aria-label", $("global-mute").title);
  refreshAdvanced();
  updateHeld();
});
$("volume").addEventListener("input", (e) => {
  fill(e.target);
  setVolume(+e.target.value / 100);
});
for (const key of ["layerMix", "detune", "lfoDepth", "lfoRate"])
  $(key).addEventListener("input", (e) => {
    applyEditedPatch(editPatch(key, sliderParam(key, e.target.value)));
    selectedPreset = null;
    refresh();
  });
for (const [kind, param] of [["filter", "filterType"], ["layer", "layerWave"]])
  document.querySelectorAll("[data-" + kind + "]").forEach((b) => b.addEventListener("click", () => {
    applyEditedPatch(editPatch(param, b.dataset[kind]));
    selectedPreset = null;
    refresh();
  }));
document.querySelectorAll("[data-listen]").forEach((b) => b.addEventListener("click", () => {
  const stop = preview === b.dataset.listen && performanceNotes.has("preview");
  noteOff("preview");
  preview = stop ? null : b.dataset.listen;
  if (preview)
    noteOn(0, "preview", preview === "velocity" ? 0.35 : 1);
  updateHeld();
}));
let midiAccess = null, midiEnabled = false;
const pedals = new Set, sustained = new Set;
$("midi").addEventListener("click", async () => {
  if (midiEnabled) {
    midiEnabled = false;
    releaseMidi();
    bindMidi();
    return;
  }
  if (!navigator.requestMIDIAccess) {
    midiHint("MIDI is unavailable in this browser. Try Chromium.");
    return;
  }
  $("midi").disabled = true;
  midiHint("Connecting MIDI…");
  try {
    initAudio();
    midiAccess = midiAccess || await navigator.requestMIDIAccess({ sysex: false });
    midiEnabled = true;
    midiAccess.onstatechange = (event) => {
      if (event.port.type === "input" && event.port.state === "disconnected") {
        event.port.onmidimessage = null;
        releaseMidi("midi:" + event.port.id + ":");
      }
      bindMidi();
    };
    bindMidi();
  } catch (error) {
    midiHint(error.name === "NotAllowedError" ? "MIDI permission denied. Click to try again." : "Could not enable MIDI.");
    report("midi", error.message);
  } finally {
    $("midi").disabled = false;
  }
});
window.addEventListener("blur", () => {
  pedals.clear();
  sustained.clear();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pedals.clear();
    sustained.clear();
  }
});
for (const [id, step] of [["transpose-up", 1], ["transpose-down", -1]])
  $(id).addEventListener("click", () => {
    applyEditedPatch(editPatch("transpose", Math.min(12, params.transpose + step)));
    selectedPreset = null;
    refresh();
  });
for (const key of EFFECT_KEYS)
  $(key).addEventListener("input", (e) => {
    applyEditedPatch(editPatch(key, sliderParam(key, e.target.value)));
    selectedPreset = null;
    refresh();
  });
const plots = {};
for (const id of ["scope", "spectrum"]) {
  const canvas = $(id), ctx = canvas.getContext("2d"), plot = { canvas, ctx, width: 0, height: 0, visible: true };
  plots[id] = plot;
  new ResizeObserver(() => {
    redraw = true;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    plot.width = canvas.clientWidth;
    plot.height = canvas.clientHeight;
    canvas.width = plot.width * ratio;
    canvas.height = plot.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }).observe(canvas);
}
const visibility = new IntersectionObserver((entries) => {
  redraw = true;
  for (const e of entries) {
    if (e.target.id === "wave-panel")
      plots.scope.visible = e.isIntersecting;
    else if (e.target.id === "spectrum-panel")
      plots.spectrum.visible = e.isIntersecting;
    else {
      const key = e.target.dataset.card;
      miniPlots.get(key).visible = e.isIntersecting;
      if (!e.isIntersecting && preview === key) {
        noteOff("preview");
        preview = null;
        updateHeld();
      }
    }
  }
}, { threshold: 0 });
for (const id of ["wave-panel", "spectrum-panel"])
  visibility.observe($(id));
setupCards();
bindAdvancedControls();
bindIsolation();
for (const key of Object.keys(LOG_CONTROLS)) {
  const input = $(key) || $("adv-" + key);
  input.min = 0;
  input.max = SETTINGS.sliderSteps;
  input.step = 1;
}
fill($("volume"));
refresh();
requestAnimationFrame(draw);
