/* The icon set has three copies of the truth, and they can drift apart silently.
 *
 *   design/icons-sprite.svg   the drawings — the canonical side
 *   src/icons-sprite.js       generated from it, and what the game actually ships
 *   design/emoji-map.mjs      which emoji becomes which drawing
 *
 * All three failure modes are invisible at build time. A stale generated sprite
 * builds and runs, and simply ships yesterday's drawings. A map entry pointing at
 * an id that does not exist renders NOTHING — the icon silently disappears from
 * the interface, which is exactly what happened with `chest` against a symbol
 * actually named `i-mail-armour`.
 *
 *   node game-core/icons.test.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "design/icons-sprite.svg"), "utf8");
const gen = fs.readFileSync(path.join(root, "src/icons-sprite.js"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };
const sec = (t) => console.log("\n" + t);

const drawn = [...svg.matchAll(/<symbol id="i-([^"]+)"/g)].map((m) => m[1]);

sec("The shipped sprite is the drawn sprite");
{
  ok(drawn.length > 0, `the source sprite draws ${drawn.length} icons`);
  // The generated file embeds the SVG as a JSON string, so an exact compare of the
  // decoded value is the drift check. Regenerate with: node design/build-sprite.mjs
  const m = gen.match(/export const ICON_SPRITE = ("(?:[^"\\]|\\.)*");/);
  ok(!!m, "the generated module exports ICON_SPRITE");
  if (m) {
    ok(JSON.parse(m[1]) === svg,
       "…and it is byte-identical to design/icons-sprite.svg (else: node design/build-sprite.mjs)");
  }
  const idm = gen.match(/export const ICON_IDS = (\[[^\]]*\]);/);
  ok(!!idm && JSON.stringify(JSON.parse(idm[1])) === JSON.stringify(drawn),
     "…and ICON_IDS lists exactly the symbols that are drawn");
}

sec("Every mapped emoji points at a drawing that exists");
{
  // A map entry naming a symbol that is not there renders nothing at all — the icon
  // vanishes from the UI and no build, test or console warning says so.
  const map = fs.readFileSync(path.join(root, "design/emoji-map.mjs"), "utf8");
  const targets = [...map.matchAll(/:\s*"([a-z-]+)",/g)].map((m) => m[1]);
  ok(targets.length > 50, `the map routes ${targets.length} emoji`);
  const missing = [...new Set(targets)].filter((t) => !drawn.includes(t));
  ok(missing.length === 0, missing.length
    ? `…but ${missing.length} point at nothing: ${missing.join(", ")}`
    : "…and every one of them names a symbol that is drawn");

  // The reverse is not an error — an icon may exist before anything maps to it —
  // but an icon nothing routes to and nothing renders is dead weight worth seeing.
  const used = new Set(targets);
  const orphans = drawn.filter((d) => !used.has(d) && !app.includes(`name="${d}"`));
  ok(true, orphans.length
    ? `${orphans.length} drawn but unrouted (fine, just unused): ${orphans.join(", ")}`
    : "every drawing is routed to by something");
}

sec("The swap is wired into the app");
{
  ok(app.includes('import { IconSprite, Icon, EmojiIcon, withIcons } from "./icons.jsx";'),
     "App.jsx imports the icon module");
  // Exactly one mount. <use href="#id"> resolves against the document, so a second
  // sprite would duplicate every symbol id and references bind to whichever parsed
  // first — which is a bug that renders correctly right up until it does not.
  ok((app.match(/<IconSprite \/>/g) || []).length === 1, "…and mounts the sprite exactly once");
  // The three string renderers. These carry the 152 occurrences that live inside
  // addLog and showNotif strings, which no amount of JSX rewriting would reach.
  ok(app.includes("{withIcons(e.text, 13)}"), "the combat log runs its lines through the swap");
  ok(app.includes("{withIcons(notification, 15)}"), "…so does the notification toast");
  ok(app.includes("{withIcons(l, 12)}"), "…and the group encounter log");
  ok(app.includes("{withIcons(label, 12)}"), "…and every Bar label (HP, resource, XP, enemy health)");
  const emojiIcons = (app.match(/<EmojiIcon emoji=/g) || []).length;
  ok(emojiIcons > 60, `${emojiIcons} data-table icons render through EmojiIcon`);
  const inline = (app.match(/<Icon name="/g) || []).length;
  ok(inline > 100, `${inline} JSX-text emoji are now inline Icon elements`);
}

sec("Nothing can silently vanish");
{
  // The fallback is load-bearing: an unmapped emoji must render AS ITSELF, so that
  // growing coverage is safe and an incomplete table can never blank the interface.
  const mod = fs.readFileSync(path.join(root, "src/icons.jsx"), "utf8");
  ok(mod.includes("<>{emoji}</>"), "EmojiIcon falls back to the emoji when it has no drawing");
  ok(/out\.push\(p\)/.test(mod), "withIcons passes unmapped glyphs through untouched");
  ok(mod.includes("if (!HAS.has(name)) return null"), "Icon refuses to emit a broken <use> reference");
}

console.log("\n" + (fail
  ? `❌ ${fail} icon check(s) failed`
  : "✅ one sprite, drawn and shipped in step, every mapping lands on a real drawing"));
process.exit(fail ? 1 : 0);
