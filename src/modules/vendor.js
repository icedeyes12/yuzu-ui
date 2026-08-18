// Replaces the vendored UMD assets in static/vendor: marked and Highlight.js
// (with the runtime language set) are npm imports bundled by Vite. The window
// globals keep the ported modules working unchanged until they are migrated to
// direct imports.
//
// Mermaid and KaTeX are intentionally NOT imported here — they are heavy
// (~3 MB of mermaid diagram chunks plus KaTeX fonts) and are now loaded
// on demand via `src/modules/lazy-vendor.js` the first time a diagram or
// math block appears in a message.
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import "highlight.js/styles/tomorrow-night-blue.css";
import { marked } from "marked";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);

window.marked = marked;
window.hljs = hljs;
