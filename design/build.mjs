/* Assemble the standalone preview from the single-source parts.
 *
 * The published page has to be self-contained (a strict CSP blocks every external
 * request), but the system itself must NOT be authored as one giant file or the
 * tokens end up copy-pasted and drifting. So the parts stay separate on disk and
 * this inlines them at build time.
 *
 *   node design/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const tokens = read("tokens.css");
const combat = read("combat.css");
const sprite = read("icons-sprite.svg");
const screen = read("preview/screen.part.html");

let out = read("preview/chronicle.src.html");

const put = (marker, body) => {
  if (!out.includes(marker)) throw new Error("marker missing from source: " + marker);
  out = out.replace(marker, body);
};

put("/* __TOKENS__ */", tokens);
put("/* __COMBAT__ */", combat);
put("<!-- __SPRITE__ -->", sprite);

// The two specimens are the same markup under different palettes — that is the
// point of the demonstration, so they must come from ONE source. Rendering them
// from separate copies would let the themes silently diverge, which is precisely
// the bug this page exists to prove does not happen.
put("<!-- __SCREEN_DAY__ -->", screen);
put("<!-- __SCREEN_NIGHT__ -->", screen);

// <use href="#id"> resolves against the document, so a second copy of the sprite
// would duplicate every symbol id. There is exactly one sprite and both screens
// reference it — which also means both specimens are provably the same drawings.
const ids = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
const used = [...out.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]);
const missing = [...new Set(used)].filter((u) => !ids.includes(u));
if (missing.length) throw new Error("icons referenced but not drawn: " + missing.join(", "));

mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist/chronicle.html"), out);
console.log(`built design/dist/chronicle.html — ${ids.length} icons, ${Math.round(out.length / 1024)} KB`);
