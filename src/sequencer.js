// Owns note priority and one shared look-ahead clock for all patterns.
import { measure, record } from "../profiler/capture.js";
import { SETTINGS, ADV_SETTINGS, NOTES } from "./config.js";
import { params, audio, voices, held, gateGain, outputMuted, initAudio, playVoice, releaseVoice, retargetMono, notifyNotes } from "./audio.js";
const performanceNotes = new Map;
const gatePattern = [1, 0, 1, 1, 0, 1, 0, 1];
let clockTimer = null, clockNext = 0, clockOrigin = 0, clockStep = 0, clockSerial = 0, clockTempo = 120, clockGateLevel = 1;
function noteOn(...args) { return measure("sequencer.noteOn", noteOnImpl, args); }
function noteOnImpl(index, source, velocity = 1, midi = NOTES[index]?.midi) {
  if (outputMuted || performanceNotes.has(source) || !Number.isFinite(midi))
    return;
  performanceNotes.set(source, { midi, velocity });
  if (params.arpMode) {
    initAudio();
    syncClock();
    notifyNotes();
    return;
  }
  if (params.voiceMode) {
    const current = held.get("mono");
    if (current && params.voiceMode === 2) {
      retargetMono(current, midi);
      notifyNotes();
      return;
    }
    if (current)
      releaseVoice("mono");
    playVoice(-1, "mono", velocity, midi);
  } else
    playVoice(index, source, velocity, midi);
}
function noteOff(...args) { return measure("sequencer.noteOff", noteOffImpl, args); }
function noteOffImpl(source) {
  if (!performanceNotes.has(source)) {
    releaseVoice(source);
    return;
  }
  const latest = [...performanceNotes.keys()].at(-1);
  performanceNotes.delete(source);
  if (params.arpMode) {
    syncClock();
    notifyNotes();
    return;
  }
  if (params.voiceMode) {
    if (source !== latest) {
      notifyNotes();
      return;
    }
    const next = [...performanceNotes.values()].at(-1), current = held.get("mono");
    if (next && current && params.voiceMode === 2)
      retargetMono(current, next.midi);
    else {
      releaseVoice("mono");
      if (next)
        playVoice(-1, "mono", next.velocity, next.midi);
    }
  } else
    releaseVoice(source);
  notifyNotes();
}
function silenceClock() {
  if (!audio)
    return;
  const t = audio.currentTime;
  for (const v of voices)
    if (v.source?.startsWith("clock:")) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(0, t);
      v.osc.stop(t);
      v.layer.stop(t);
      if (v.fm)
        v.fm.osc.stop(t);
      for (const extra of v.extras.values())
        extra.osc.stop(t);
    }
  if (gateGain) {
    gateGain.gain.cancelScheduledValues(t);
    gateGain.gain.setValueAtTime(1, t);
    clockGateLevel = 1;
  }
}
function stopClock() {
  if (clockTimer !== null) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  silenceClock();
}
function syncClock(...args) { return measure("sequencer.syncClock", syncClockImpl, args); }
function syncClockImpl() {
  const wanted = !outputMuted && (params.stepOn || params.gateOn || params.arpMode && performanceNotes.size);
  if (!wanted) {
    stopClock();
    return;
  }
  if (clockTimer !== null && clockTempo === params.tempo)
    return;
  stopClock();
  initAudio();
  clockTempo = params.tempo;
  clockOrigin = clockNext = audio.currentTime + ADV_SETTINGS.clockStart;
  clockStep = 0;
  clockTick();
  clockTimer = setInterval(clockTick, ADV_SETTINGS.clockTickMs);
}
function clockTick(...args) { return measure("sequencer.clockTick", clockTickImpl, args); }
function clockTickImpl() {
  if (!audio || document.hidden)
    return;
  const now = audio.currentTime, stepTime = 60 / params.tempo / 2;
  if (clockNext < now) {
    record("sequencer.missedDeadline", (now - clockNext) * 1000);
    clockNext = now + ADV_SETTINGS.clockStart;
  }
  while (clockNext < now + ADV_SETTINGS.lookAhead) {
    const time = clockNext, step = clockStep++;
    const schedule = (midi, velocity) => {
      const source = "clock:" + clockSerial++;
      playVoice(-1, source, velocity, midi, time);
      releaseVoice(source, time + stepTime * ADV_SETTINGS.noteGate);
    };
    if (params.arpMode && performanceNotes.size) {
      const notes = [...performanceNotes.values()].sort((a, b) => a.midi - b.midi);
      if (params.arpMode === 2)
        notes.reverse();
      const note = notes[step % notes.length];
      schedule(note.midi, note.velocity);
    }
    if (params.stepOn)
      schedule(48 + params["step" + step % 4], 0.8);
    if (gateGain) {
      const level = params.gateOn ? gatePattern[step % gatePattern.length] : 1;
      gateGain.gain.setValueAtTime(clockGateLevel, time);
      gateGain.gain.linearRampToValueAtTime(level, time + ADV_SETTINGS.gateRamp);
      clockGateLevel = level;
    }
    clockNext += stepTime;
  }
}
function releaseAll() {
  performanceNotes.clear();
  for (const source of [...held.keys()])
    releaseVoice(source);
  params.stepOn = 0;
  params.gateOn = 0;
  stopClock();
  notifyNotes();
}

export { performanceNotes, gatePattern, clockTimer, clockOrigin, noteOn, noteOff, releaseAll, syncClock };
