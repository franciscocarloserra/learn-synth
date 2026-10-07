# Learn Synth

Build-free, frontend-only Web Audio learning instrument. Keep the UI English.
Use any static HTTP server; no application server, telemetry endpoint or install step.
Run `node tests/synth.mjs` and `node tests/profiler.mjs`.

## Layout

- `index.html`: instrument cards and controls.
- `src/`: application JS and CSS. `audio.js` owns sound; `sequencer.js` schedules
  notes; `app.js` wires the DOM; `visualizers.js` draws parameter models.
  `config.js` holds tunables, presets and module mappings; `patch.js` manages
  isolate/mute; `tone.js` models shelves; `telemetry.js` keeps bounded local diagnostics.
- `profiler/`: optional browser capture and standalone JSON viewer. No uploads.
- `tests/`: Node regression tests with DOM/audio doubles, not sound/performance tests.
- `todelete/`: ignored backups. Move obsolete files here; never delete them.

## Preserve

- Parameter diagrams respond while silent; only top wave/spectrum measure output.
- Module Isolate compares against the preset; module Mute is reversible. Neither
  resets arp/sequencer state or clock phase. Global Mute is panic and stops transport.
- Preserve manually edited Transpose when switching presets (including a return to 0).
- Warm pad defaults; virtual/QWERTY keyboard starts at C4. MIDI permission is opt-in.
  Note shortcuts work with sliders focused. Preserve the sticky rack behavior.
- Audio uses native nodes, not per-sample JS. Don't infer performance from mock tests.
- Profiling is opt-in with `?profile`; Export profile downloads bounded JSON data.
  Nested timings overlap and exclude hardware MIDI/audio latency.
- Existing limitations: shared filter modulation, three-shape wavetable, bit-depth-only
  crusher. Sync overrides wavetable, which overrides PWM. Blur stops sequencers.

Canonical directory: `/home/usuario/projects/experiments/learn-synth` (no symlink).

Public repository: https://github.com/franciscocarloserra/learn-synth
GitHub Pages serves `main` from the repository root (no build).
