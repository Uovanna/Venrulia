/* The combat screen, rendered as a chronicle.
 *
 * The load-bearing claim of this redesign is that NO COMBAT MESSAGE HAD TO BE
 * REWRITTEN to get prose in the body and quantities in the margin. That only
 * holds if parseEntry reads the shapes the game actually logs — so this pins it
 * against real strings taken from the running game, not invented ones.
 *
 * Both bugs it caught the first time are pinned as named cases below, because
 * both were invisible in a screenshot until you knew to look:
 *   - the number pattern ate the colon, so every DEED was silently discarded
 *   - "Concussive Blow: target stunned" was filed as a neutral aside rather than
 *     the player's own doing, because the kind test demanded a digit
 *
 *   node game-core/chronicle.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'chronicle.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-chron-'));
execSync(`tsc "${SRC}" --jsx react --target es2020 --module commonjs --outDir "${dir}" --allowJs --checkJs false --noResolve`, { stdio: 'inherit' });
let js = fs.readFileSync(path.join(dir, 'chronicle.js'), 'utf8');
js = js.replace('require("react")', '({useEffect:function(){},useRef:function(){return{}},createElement:function(){return{}}})');
js = js.replace('require("./chronicle-css.js")', '({CHRONICLE_CSS:""})');
js = js.replace('require("./icons.jsx")', '({withIcons:function(t){return t}})');
const run = path.join(dir, 'run.cjs'); fs.writeFileSync(run, js);
const { parseEntry, chronicleKind } = require(run);

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const tokens = fs.readFileSync(path.join(root, 'design/tokens.css'), 'utf8');
const combat = fs.readFileSync(path.join(root, 'design/combat.css'), 'utf8');
const genCss = fs.readFileSync(path.join(root, 'src/chronicle-css.js'), 'utf8');

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };
const sec = (t) => console.log("\n" + t);

sec("Real log lines land in the right column");
{
  const p = parseEntry("Concussive Blow: 450 ⚡");
  // THE FIRST BUG. The number pattern strips ":" along with surrounding spaces,
  // so reading the deed after stripping the number found no colon and returned
  // null — every deed on the screen vanished, and the log rendered as bare
  // numbers in a margin next to nothing.
  ok(p.deed === "Concussive Blow", `a skill's name is the deed (got ${JSON.stringify(p.deed)})`);
  ok(p.n === "450", "…its damage goes to the margin");
  ok(p.crit === true, "…and a crit is marked");
  ok(p.kind === "mine", "…and it is filed as your own hand");

  const a = parseEntry("Auto-attack: 143");
  ok(a.deed === "Auto-attack" && a.n === "143" && a.kind === "mine", "auto-attacks read the same way");

  // THE SECOND BUG. Your own deed does not always end in a number.
  const st = parseEntry("Concussive Blow: target stunned 2.0s");
  ok(st.kind === "mine", "a stun is still YOUR deed, not a neutral aside");
  ok(st.deed === "Concussive Blow" && st.rest === "target stunned", "…with the effect kept as prose");
  ok(st.n === "2.0s", "…and its duration in the margin");
}

sec("Whose deed it was");
{
  ok(chronicleKind("Panther hits for 61") === "foe", "an enemy swing is the enemy's");
  ok(chronicleKind("Raptor's Twin Shot afflicts you — 20/s") === "foe", "…so is its skill");
  ok(parseEntry("Panther hits for 61").n === "61", "…and the damage still reaches the margin");
  ok(chronicleKind("Lifesteal heals for 61") === "boon", "restoration is a boon");
  ok(chronicleKind("Panther defeated! +136 XP, +12g") === "spoil", "a kill is spoils");
  ok(chronicleKind("Your adventure begins...") === "aside", "narration is an aside");
  ok(chronicleKind("Hunting in Tanglevine Jungle...") === "aside", "…so is travel");
  // Ordering matters: "heals for" contains a number and a gain, and would be read
  // as spoils if the boon test came second.
  ok(chronicleKind("Renewal heals for 88") === "boon", "a heal is not misread as spoils");
}

sec("Nothing is dropped on the floor");
{
  // Every entry must render SOMETHING. An entry that parses to empty prose and no
  // number is a line the player watched disappear.
  const lines = [
    "Concussive Blow: 450 ⚡", "Auto-attack: 143", "Panther hits for 61",
    "Panther defeated! +136 XP, +12g", "Your adventure begins...", "Reached level 43!",
    "Bank full — sold 3 for 120g", "+1 Troll Hide", "Salvaged Boots → 4 Dust",
    "Raptor's Venomous Companion afflicts you — 22/s", "Spinning Slash: 88",
  ];
  const empty = lines.filter((l) => { const p = parseEntry(l); return !p.deed && !p.rest && !p.n; });
  ok(empty.length === 0, empty.length ? `these render as nothing: ${JSON.stringify(empty)}` : "every real log line renders something");
  const bare = lines.filter((l) => { const p = parseEntry(l); return !p.deed && !p.rest && p.n; });
  ok(bare.length === 0, bare.length ? `these render as a lone number: ${JSON.stringify(bare)}` : "…and none renders as a naked number");
  ok(parseEntry("").rest === "" && parseEntry(null).kind === "aside", "an empty entry does not throw");
}

sec("The shipped stylesheet is the designed stylesheet");
{
  const m = genCss.match(/export const CHRONICLE_CSS = ("(?:[^"\\]|\\.)*");/);
  ok(!!m, "src/chronicle-css.js exports CHRONICLE_CSS");
  ok(m && JSON.parse(m[1]) === tokens + "\n" + combat,
     "…and it matches design/tokens.css + design/combat.css (else: node design/build-css.mjs)");
}

sec("Both themes resolve in all three states");
{
  // The un-stamped "system" default is the one that gets forgotten: most viewers
  // never touch a toggle, so a night palette defined only behind [data-theme]
  // would leave them reading dark ink on a dark ground.
  ok(/@media \(prefers-color-scheme: dark\)/.test(tokens), "night is defined for the system default");
  ok(/:root\[data-theme="night"\], \.theme-night/.test(tokens), "…and for an explicit choice");
  ok(/:root, \.theme-day/.test(tokens), "…and day can be forced on a container");
  // The base rules must name BOTH roots. Written for .screen alone, the in-game
  // page inherited the app's white text onto parchment and every enemy line went
  // invisible — which looked like a parser bug and was not one.
  ok(/\.screen, \.cpage \{/.test(combat), "the base type and colour rules cover the in-game page too");
  ok(/\.screen :where\(p[^)]*\), \.cpage :where\(p/.test(combat), "…including the paragraph margin reset");
}

sec("It is actually the combat screen");
{
  ok(app.includes('import { ChronicleStyles, Chronicle, loadTheme, saveTheme, themeClass } from "./chronicle.jsx";'),
     "App.jsx imports the chronicle");
  ok((app.match(/<ChronicleStyles \/>/g) || []).length === 1, "…and mounts the stylesheet exactly once");
  ok(app.includes('className={`cpage chronicle-ground ${themeClass(chronicleTheme)}`}'),
     "the combat tab renders as a themed, textured page");
  ok(app.includes("<Chronicle log={combatLog}"), "…with the chronicle in place of the old log box");
  ok(!app.includes("<CombatLog log={combatLog} />"), "…and the old log component is no longer used there");
  ok(app.includes('className="foe"') && app.includes('className="foe-wounds"'), "the adversary uses the ruled frame");
  ok(app.includes('className="seals"') && app.includes('className="seal-slot'), "abilities are seals");
  ok(app.includes("saveTheme(next)"), "the day/night choice is remembered");
}

console.log("\n" + (fail
  ? `❌ ${fail} chronicle check(s) failed`
  : "✅ prose in the body, quantities in the margin — from the log the game already writes"));
process.exit(fail ? 1 : 0);
