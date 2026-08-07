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
const shell = fs.readFileSync(path.join(root, 'design/shell.css'), 'utf8');
const panels = fs.readFileSync(path.join(root, 'design/panels.css'), 'utf8');
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
  ok(m && JSON.parse(m[1]) === [tokens, shell, panels, combat].join("\n"),
     "…and it matches tokens + shell + panels + combat (else: node design/build-css.mjs)");
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

sec("Nothing paints its own colour any more");
{
  // Three buckets the first colour sweep could not reach, each invisible in a
  // different way:
  //   ternaries   `background: cond ? "#a" : "#b"` — the sweep matched a literal
  //               value, not an expression, so 296 conditional colours survived
  //   gradients   101 of them, every one tuned for a dark ground
  //   glows       shadows with no offset. Parchment does not emit light.
  const styleBlocks = [];
  let i = 0;
  while (true) {
    const j = app.indexOf("style={{", i);
    if (j < 0) break;
    let k = j + 8, depth = 2;
    while (depth > 0 && k < app.length) {
      if (app[k] === "{") depth++; else if (app[k] === "}") depth--;
      k++;
    }
    styleBlocks.push(app.slice(j, k)); i = k;
  }
  ok(styleBlocks.length > 1000, `${styleBlocks.length} inline style blocks scanned`);

  const withHex = styleBlocks.filter((b) => /#[0-9a-fA-F]{3,8}\b/.test(b));
  ok(withHex.length === 0, withHex.length
    ? `${withHex.length} still paint a literal colour, e.g. ${withHex[0].slice(0, 90)}`
    : "no inline style paints a literal colour — every one resolves through a token");

  // The hatching on vitals and meters IS a gradient and is deliberately spared:
  // it is a texture, not a surface.
  const grads = (app.match(/(?<!repeating-)linear-gradient\(/g) || []).length;
  ok(grads === 0, grads ? `${grads} non-repeating gradients remain` : "no surface is a gradient; the Chronicle has none");
  ok((app.match(/repeating-linear-gradient\(/g) || []).length >= 1, "…while the hatching survives, because it is a texture");

  const glows = (app.match(/boxShadow: [`"]0 0 [1-9]/g) || []).length;
  ok(glows === 0, glows ? `${glows} glows remain` : "nothing glows; things sit on the page or above it");
  ok(!/@keyframes tutflash \{[^`]*#[0-9a-f]{6}/i.test(app),
     "…including the signpost pulse, which is a drawn ring now rather than a gold halo");

  // The ground behind React, before a single token exists. Left at #08080f this
  // painted a black frame around the parchment on every screen in both themes,
  // and no amount of sweeping App.jsx would have found it.
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ok(html.includes("background: #DCD5C4"), "index.html paints the day ground before React runs");
  ok(/@media \(prefers-color-scheme: dark\)[^}]*background: #17130E/s.test(html), "…and the night one");
  // Strip comments first: the note explaining this fix names the old colour, and
  // failing on prose in a comment teaches people to stop reading the test.
  const htmlCode = html.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  ok(!htmlCode.includes("#08080f"), "…and no longer frames the page in black");
}

sec("Rarity is readable on parchment");
{
  // The classic rarity palette is tuned for a black ground. On vellum, common
  // (#ffffff) is invisible at 1.46:1, uncommon (#1eff00) sits at 1.07:1 and
  // legendary (#ff8000) at 1.72:1 — four of the seven fail outright and the rest
  // only pass at large-text sizes. Nothing about that shows up until a player
  // opens a full bank, so it is measured here rather than eyeballed.
  const lum = (h) => { const c = [1,3,5].map((i) => parseInt(h.slice(i,i+2),16)/255)
    .map((v) => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
  const ratio = (a,b) => { const x = lum(a), y = lum(b);
    return (Math.max(x,y)+0.05) / (Math.min(x,y)+0.05); };
  const pick = (block, name) => (block.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")) || [])[1];

  const dayBlock = tokens.slice(tokens.indexOf(":root, .theme-day"), tokens.indexOf("@media (prefers-color-scheme"));
  const nightBlock = tokens.slice(tokens.indexOf(':root[data-theme="night"], .theme-night'));
  const RARS = ["rar-uncommon", "rar-rare", "rar-epic", "rar-legendary", "rar-artifact"];

  for (const [label, block, ground, raised] of [
    ["day", dayBlock, "#DCD5C4", "#E6E0D2"],
    ["night", nightBlock, "#17130E", "#211A13"],
  ]) {
    const bad = [];
    for (const r of RARS) {
      const hex = pick(block, r);
      if (!hex) { bad.push(r + " missing"); continue; }
      const a = ratio(hex, ground), b = ratio(hex, raised);
      if (a < 4.5 || b < 4.5) bad.push(`${r} ${hex} ${a.toFixed(2)}/${b.toFixed(2)}`);
    }
    ok(bad.length === 0, bad.length
      ? `${label}: ${bad.join(", ")}`
      : `every rarity clears AA on the page and a raised surface in ${label}`);
  }
  // Poor and common deliberately have NO hue of their own — a common item is
  // written in the ordinary hand and a poor one is faded. A token for either
  // would mean someone had reintroduced white-on-parchment.
  ok(!/--rar-common:/.test(tokens) && !/--rar-poor:/.test(tokens),
     "poor and common take the ordinary ink rather than a colour");
  ok(/\.rar-common\s+\{ color: var\(--ink\); \}/.test(panels), "…common is the ordinary hand");
  ok(/\.rar-poor\s+\{ color: var\(--ink-faint\); \}/.test(panels), "…and poor is faded");
  // The core keeps its own colours: the server has no opinion about what colour
  // an epic is, and changing shared data for a client theme would be wrong.
  ok(app.includes("const rarClass = (r) =>"), "the screen asks for a rarity CLASS, not a hex");
}

sec("Bank and Armory speak the shared vocabulary");
{
  // These two were converted first because between them they use nearly every
  // pattern the other screens need. What matters is that they use the SHARED
  // classes rather than growing their own, or the next screen starts from zero.
  for (const [cls, what] of [
    ["leaves", "a tab strip is leaves of a book"],
    ["item-tap", "an item is a ledger entry"],
    ["item-delta", "…with the upgrade written in the margin voice"],
    ["mini", "small actions share one shape"],
    ["slot", "worn gear sits in ruled frames"],
    ["statline", "the stat summary is one ruled line"],
    ["meter", "capacity is a meter, not a sentence"],
    ["gateway", "a row that opens another screen"],
    ["aside-note", "marginal notes"],
    ["empty", "an empty shelf says so in the page's own voice"],
  ]) {
    ok(panels.includes("." + cls), `panels.css defines ${what}`);
  }
  ok(app.includes('className="leaves"') && app.includes('className={`leaf'), "the Bank uses the leaves");
  ok(app.includes('className="item"') && app.includes('className="item-tap"'), "…and the item rows");
  ok(app.includes('className={`meter'), "…and the capacity meter");
  ok(app.includes('className="statline"'), "the Armory uses the stat line");
  ok(app.includes('className={`slot') && app.includes('className="slot-col"'), "…and the slot frames");
  ok(app.includes('className="figure"'), "…and says plainly that the portrait is not built yet");
  // MiniBtn used to take any colour it liked. Three meanings beat a palette.
  ok(/const MiniBtn = \(\{ onClick, children, tone, disabled \}\)/.test(app),
     "MiniBtn takes a meaning, not a colour");
}

sec("Market and Auction House reuse the vocabulary");
{
  // The point of converting Bank and Armory first was that the next screens
  // should be assembly, not design. These two are the test of that claim: if
  // they had to invent anything, the vocabulary was not general enough.
  ok(/const MARKET_STALLS = \[/.test(app), "the market's stalls are DATA, like the town's spots");
  ok((app.match(/dest: "/g) || []).length >= 5, "…so a destination can be checked rather than grepped for");
  ok(app.includes("MARKET_STALLS.map((st) =>"), "…and the screen is five gateways over that table");
  ok(!/\{tab === "market"[\s\S]{0,2000}?linear-gradient/.test(app), "the market invents no new surface");

  // The auction house needed three genuinely new patterns — a field, a filter
  // toggle, a text link — and nothing else.
  for (const [cls, what] of [
    ["field", "a field is a ruled line you write on, not a filled box"],
    ["toggle", "a filter switches with a rule under it"],
    ["link", "a plain textual action"],
    ["price", "a price is always the margin hand, always tabular"],
    ["sift", "the filter block is ruled off from what it filters"],
  ]) ok(panels.includes("." + cls), `panels.css defines ${what}`);
  ok(app.includes('className="field"') && app.includes('className="field is-num"'),
     "the auction house uses fields, with numbers in the mono hand");
  ok(app.includes('className={`toggle'), "…and toggles for its filters");
  ok(app.includes('className="link"'), "…and a link to start the search again");
  ok(app.includes('className="sift"'), "…inside a ruled sift block");
  ok(app.includes('className="leaves"') && app.includes('ahView === id ? " is-open"'),
     "…and the same leaves the Bank uses");
  // The AH reuses the item row wholesale rather than growing a listing row of
  // its own — that is the reuse this whole exercise was for.
  ok(/stackListingRow[\s\S]{0,400}className="item"/.test(app), "a listing IS an item row");
}

sec("Class Hall and the Guild, on the shared vocabulary");
{
  // Four patterns came out of these two, and the first is the one that pays: a
  // screen header was hand-written on roughly twenty-five screens, each slightly
  // different from the last.
  for (const [cls, what] of [
    ["head", "a screen opens with a way back, what you are looking at, and one fact"],
    ["choice", "one of a set you pick from, ruled down its edge when chosen"],
    ["tag", "a named thing in a list of named things"],
    ["state", "whether a thing is open to you right now"],
  ]) ok(panels.includes("." + cls), `panels.css defines ${what}`);
  ok(app.includes('className="head-back"') && app.includes('className="head-title"'),
     "both screens open with the same head");
  ok(app.includes('className={`choice'), "the calling picker is a set of choices");
  ok(app.includes('className={`tag'), "…and the skills it grants are tags");
  ok(app.includes('className={`state '), "the Guild's lockouts are states");

  // A tone, not a hex. The lockout pill used to carry its own colour per branch,
  // which is four colours describing three situations.
  ok(/tone: "is-(open|soon|shut)"/.test(app), "…carrying a tone rather than a colour");
  ok(!/\{ t: `[^`]*`, c: "#/.test(app), "…and no branch picks its own hex any more");

  // The frame around the combat page has retired. It existed to make a parchment
  // page inset into a DARK shell read as deliberate; the shell is parchment now,
  // so it was a border around nothing.
  ok(/\.cpage \{[^}]*border-bottom: 1px solid var\(--rule\)/s.test(combat),
     "the combat page closes with a rule rather than a frame");
  ok(!/\.cpage \{[^}]*border: 1px solid var\(--rule\)/s.test(combat), "…and is no longer boxed");
}

sec("The shell is bound in the same hand");
{
  // Converting the shell is what decides whether the game reads as one object or
  // as a Chronicle page glued into a different app. The ground has to move too.
  ok(app.includes('className={`shell chronicle-ground ${themeClass(chronicleTheme)}`}'),
     "the whole app sits on the themed, textured ground");
  ok(app.includes('className="shell-hdr"'), "the header is the head of the page");
  ok(app.includes('className="shell-purse"'), "…the purse is written in the margin voice");
  ok(app.includes('className="shell-foot"'), "…and the foot is bound to it");
  ok(app.includes('className="lesson"') && app.includes('className="lesson-rail"'),
     "the lesson is a marginal note rather than a glowing alert");
  ok(app.includes('className="notice"'), "the toast is a slip of paper");
  ok(/const Bar = [\s\S]{0,900}repeating-linear-gradient/.test(app),
     "vitals are hatched, not filled");

  // THE SWEEP. The shell cannot convert alone: parchment behind the dark inline
  // panels every unconverted screen still uses would look broken. The app's
  // neutrals were three families of near-identical dark purple doing three jobs,
  // so they map onto ground/raised/sunk mechanically. What must NOT survive is a
  // hard-coded near-black background — that is the one that reads as a hole.
  const darkBg = [...app.matchAll(/background:\s*"(#[0-9a-fA-F]{6})"/g)]
    .map((m) => m[1].toLowerCase())
    .filter((h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16) < 96);
  ok(darkBg.length === 0, darkBg.length
    ? `${darkBg.length} hard-coded near-black panels remain: ${[...new Set(darkBg)].slice(0, 6).join(", ")}`
    : "no hard-coded near-black panel backgrounds survive the sweep");
  const tokenBg = (app.match(/background: "var\(--/g) || []).length;
  ok(tokenBg > 120, `${tokenBg} backgrounds now resolve through tokens`);
  const tokenFg = (app.match(/color: "var\(--/g) || []).length;
  ok(tokenFg > 400, `${tokenFg} colours now resolve through tokens`);
}

console.log("\n" + (fail
  ? `❌ ${fail} chronicle check(s) failed`
  : "✅ prose in the body, quantities in the margin — from the log the game already writes"));
process.exit(fail ? 1 : 0);
