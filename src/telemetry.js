// Bounded local diagnostics. No network requests or backend.
import { SETTINGS } from "./config.js";
import { diagnostic as report } from "../profiler/capture.js";
for (const kind of ["warn", "error"]) {
  const original = console[kind].bind(console);
  console[kind] = (...args) => {
    report(kind, args.join(" "));
    original(...args);
  };
}
window.addEventListener("error", (e) => report("error", `${e.message} ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => report("rejection", e.reason));
if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes("longtask"))
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (e.duration > SETTINGS.longTaskMs)
        report("longtask", Math.round(e.duration) + " ms");
  }).observe({ type: "longtask", buffered: true });
export { report };
