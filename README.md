# Learn Synth Fundamentals

[Play online](https://franciscocarloserra.github.io/learn-synth/) · [GitHub](https://github.com/franciscocarloserra/learn-synth)

A browser synth for learning by listening. Play with A–L, touch or MIDI;
use the diagrams to see what each control does.

Serve this folder with any static HTTP server, for example:

```sh
python3 -m http.server 7842 --bind 127.0.0.1
```

Open http://127.0.0.1:7842/
No backend, build step or dependencies. MIDI needs localhost or HTTPS and permission.

Run tests with `node tests/synth.mjs` and `node tests/profiler.mjs`.
These use audio/DOM doubles; check sound and layout in the browser.

Open `profiler/` to inspect performance. Start a capture, reproduce the lag,
export the JSON and load it into the viewer. Captures stay local; profiling
is off during normal use. JS timings do not measure hardware audio latency.
