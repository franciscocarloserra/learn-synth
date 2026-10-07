// Audition edits against the chosen preset without discarding the full patch.
import { EXTRAS, PRESETS, MODULE_PARAMETERS, MODULE_BYPASS } from "./config.js";
const TRANSPORT = ["arpMode", "tempo", "stepOn", "step0", "step1", "step2", "step3", "gateOn", "gatePattern"];
const DEFAULT_GATE = [1, 0, 1, 1, 0, 1, 0, 1];
const REQUIRED = {
  autoPanRate: ["autoPan"],
  detune: ["layerMix"],
  layerWave: ["layerMix"],
  lfoRate: ["lfoDepth"],
  tremRate: ["tremDepth"],
  echoTime: ["echoMix"],
  spread: ["unison"],
  filterDecay: ["filterEnv"],
  chorusRate: ["chorus"],
  phaserRate: ["phaser"],
  flangerRate: ["flanger"],
  ringFreq: ["ring"],
  fmRatio: ["fmIndex"],
  pulseWidth: ["pwmOn"],
  tablePosition: ["tableOn"],
  syncRatio: ["syncOn"],
  sampleRate: ["sampleHold"],
  compThreshold: ["compRatio"],
  ampDecay: ["sustain"],
  step0: ["stepOn"],
  step1: ["stepOn"],
  step2: ["stepOn"],
  step3: ["stepOn"],
  gatePattern: ["gateOn"]
};
const muted = new Set();
let userTranspose = null;
let preset = "pad", isolated = null, draft = base();
function base() {
  return { ...EXTRAS, ...PRESETS[preset], gatePattern: [...DEFAULT_GATE] };
}
function isolatedKeys() {
  const keys = MODULE_PARAMETERS[isolated] || [isolated];
  return [...new Set(keys.flatMap(key => [key, ...(REQUIRED[key] || [])]))];
}
function effectivePatch() {
  const result = isolated ? base() : { ...draft };
  for (const key of TRANSPORT)
    result[key] = draft[key];
  if (isolated)
    for (const key of isolatedKeys())
      result[key] = draft[key];
  for (const module of muted)
    Object.assign(result, MODULE_BYPASS[module]);
  return { ...result, gatePattern: [...result.gatePattern] };
}
function loadPatch(name) {
  muted.clear();
  preset = name;
  isolated = null;
  draft = base();
  if (userTranspose !== null) draft.transpose = userTranspose;
  return effectivePatch();
}
function editPatch(key, value, current) {
  if (key === "transpose") userTranspose = value;
  if (current) {
    for (const field of TRANSPORT)
      if (current[field] !== undefined)
        draft[field] = Array.isArray(current[field]) ? [...current[field]] : current[field];
  }
  if (isolated && !TRANSPORT.includes(key) && !isolatedKeys().includes(key))
    isolated = null;
  draft[key] = Array.isArray(value) ? [...value] : value;
  return effectivePatch();
}
function isolatePatch(key, current) {
  if (current) {
    for (const field of TRANSPORT)
      if (current[field] !== undefined)
        draft[field] = Array.isArray(current[field]) ? [...current[field]] : current[field];
  }
  isolated = isolated === key ? null : key;
  return effectivePatch();
}
function patchState() {
  return { preset, isolated, muted: [...muted] };
}

export { loadPatch, editPatch, isolatePatch, patchState };

export function mutePatch(module, current) {
  if (!MODULE_BYPASS[module]) return effectivePatch();
  for (const key of TRANSPORT)
    if (current?.[key] !== undefined)
      draft[key] = Array.isArray(current[key]) ? [...current[key]] : current[key];
  if (muted.has(module)) muted.delete(module);
  else muted.add(module);
  return effectivePatch();
}
