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
const sheets = fs.readFileSync(path.join(root, 'design/sheets.css'), 'utf8');
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
  ok(m && JSON.parse(m[1]) === [tokens, shell, panels, sheets, combat].join("\n"),
     "…and it matches tokens + shell + panels + sheets + combat (else: node design/build-css.mjs)");
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
  // A floor of "more than a thousand" was a sanity check on the SCANNER, written
  // when there were 1,700 of these. The conversion has since driven the file
  // under it, so the check had started failing on success. What it actually
  // needs to prove is that the brace-walk found every block, which is a ratio
  // and does not rot as the number falls.
  const occurrences = (app.match(/style=\{\{/g) || []).length;
  ok(styleBlocks.length === occurrences,
     `the brace-walk found all ${occurrences} inline style blocks (got ${styleBlocks.length})`);

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
  // The six class hexes live in the CORE DATA, not in a stylesheet, which is
  // exactly why nothing ever measured them: they are identity, so no colour
  // sweep touched them, and on parchment they run 1.08:1 (rogue) to 2.71:1
  // (warlock). They are now tokens, and they are measured the same way as the
  // rarities — the whole point of pulling them out of the data was so that this
  // check could exist at all.
  const RARS = ["rar-uncommon", "rar-rare", "rar-epic", "rar-legendary", "rar-artifact",
                "cls-warrior", "cls-mage", "cls-rogue", "cls-paladin", "cls-hunter", "cls-warlock"];

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
      : `all ${RARS.length} rarity and class hues clear AA on the page and a raised surface in ${label}`);
  }
  // Poor and common deliberately have NO hue of their own — a common item is
  // written in the ordinary hand and a poor one is faded. A token for either
  // would mean someone had reintroduced white-on-parchment.
  ok(!/--rar-common:/.test(tokens) && !/--rar-poor:/.test(tokens),
     "poor and common take the ordinary ink rather than a colour");
  ok(/\.rar-common\s+\{ --rar: var\(--ink\); \}/.test(panels), "…common is the ordinary hand");
  ok(/\.rar-poor\s+\{ --rar: var\(--ink-faint\); \}/.test(panels), "…and poor is faded");
  // The hue is published as a variable and then painted, so a container tagged
  // with a rarity can use it on one edge without turning all its text that hue.
  ok(/\.rar-poor, \.rar-common,[\s\S]{0,120}\{ color: var\(--rar\); \}/.test(panels),
     "…and every rarity paints itself from that variable");
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

sec("The Adventure Gate and the Hero's Statue");
{
  // Three more patterns, and each replaced a whole family of hand-written ones.
  for (const [cls, what] of [
    ["go", "the one action a panel exists for"],
    ["dest", "a place you can go"],
    ["ledger", "a label and a number, ruled off from the next"],
  ]) ok(panels.includes("." + cls + " "), `panels.css defines ${what}`);

  // THE GATE. Both strips were rows of filled pills whose colour changed with the
  // difficulty selected — three treatments describing one selection.
  ok(app.includes('className={`leaf${difficulty === id ? " is-open" : ""}`}'),
     "the register you are reading in is a leaf of the book");
  ok(app.includes('className={`toggle${worldTab === id ? " is-on" : ""}`}'),
     "…and what you are looking at is a filter under it");
  ok(!/borderRadius: 9, color: difficulty === id/.test(app), "…not a row of pills that restyle themselves");

  // Every destination on the Gate is the same shape now, and none of them is
  // tinted with its own colour. A tinted card per zone is the single loudest
  // "app" gesture the game had left.
  ok(app.split('className={`dest').length - 1 >= 6,
     "zones, dungeons, raids, hard zones, hard dungeons and Abyss ranks are all destinations");
  ok(!app.includes("background: current ? `${z.color}22`"), "a zone is no longer a card tinted with its own colour");
  ok(!app.includes("background: `${rd.color}14`"), "…nor is a raid");

  // One departure treatment. There were five, differing in border width, radius,
  // colour, weight and padding, all saying "go here".
  ok(app.split('className="go"').length - 1 >= 6, "every departure is written the same way");
  ok(app.split("go is-quiet").length - 1 >= 4, "…and the second action on a panel is quieter than the first");

  // The park toggles carried `x === y ? A : A` after the colour sweep collapsed
  // their two branches, so being parked looked exactly like not being parked.
  ok(!/(offlineZoneId === z\.id|offlineAbyss === p|offlineHardId === hz\.id) \? "var\(--verdigris\)" : "var\(--verdigris\)"/.test(app),
     "parking here reads differently from not parking here");
  ok(app.includes('${char.offlineZoneId === z.id ? " is-on" : ""}'), "…because the state is a class, not a colour");

  // THE STATUE. Twenty label/value pairs in three bordered boxes.
  ok(app.split('className="ledger-row"').length - 1 >= 3, "the character sheet is a ledger");
  ok(app.includes('className="ledger-val"') && app.includes('className="ledger-note"'),
     "…numbers in the margin hand, what they do underneath");
  ok(/\.ledger-val \{[^}]*font-family: var\(--mono\)/s.test(panels), "…and that hand is mono, always");
  ok(app.includes('className={`leaf${heroTab === id ? " is-open" : ""}`}'), "Stats and Skills are leaves");
  ok(app.includes('className={`choice${selected ? " is-on" : ""}'), "a slotted ability is ruled down its edge");
  ok(!app.includes('const srcColor = cls?.color || "#888"'), "…rather than bordered in the class colour");

  // A full-width block with padding overflows its column by exactly its padding
  // unless it is told to include it. Every pattern below survived only because
  // Chromium's UA sheet makes <button> border-box for free — .choice is a <div>
  // (it has to be: it contains another button), and it hung 30px off the page.
  for (const [sheet, cls] of [[panels, "choice"], [panels, "gateway"], [panels, "slot-wide"], [combat, "leave"]]) {
    const rule = new RegExp("\\." + cls + " \\{[^}]*\\}", "s").exec(sheet);
    ok(rule && /width: 100%/.test(rule[0]) && /box-sizing: border-box/.test(rule[0]),
       `.${cls} counts its own padding inside its width`);
  }
}

sec("The town is a chart drawn on the page");
{
  // THE MAP HAD ITS OWN PALETTE — 48 hexes across 73 places, none of them from
  // the design system. That was survivable while it was only unfashionable; it
  // stopped being survivable the moment the game grew a night theme, because a
  // full-colour illustrated map does not get darker when the page does. Every
  // one of them now resolves to a token, so the town is lit by whatever is
  // lighting the rest of the chronicle.
  const map = app.slice(app.indexOf("const INK ="), app.indexOf("function GameScreen"));
  const hexes = map.match(/#[0-9a-fA-F]{6}/g) || [];
  ok(hexes.length === 0, hexes.length ? `the map still paints itself: ${[...new Set(hexes)].join(" ")}`
                                      : "the town map takes every colour from the theme");
  ok(map.includes('const INK = "var(--ink)"'), "…it is drawn in the same ink as everything else");
  ok(/stopColor="var\(--(raised|ground)\)"/.test(map), "…on ground that follows the theme");
  // A roof is timber. Only the two faction banners and the market's awning keep
  // a colour of their own — a purple roof on the auction house was the last
  // thing on the screen shouting.
  ok(!map.includes('<House roof="var(--rar-'), "no building is roofed in a rarity colour");

  // The tutorial used to point with a filled amber glow. The Chronicle has no
  // glows: it points by drawing a ring, in the rubric, the same mark it uses
  // for your own hand.
  ok(/hot && <ellipse[^>]*fill="none"[^>]*stroke="var\(--rubric\)"[^>]*strokeDasharray/.test(map),
     "the tutorial points with a drawn ring rather than a glow");

  // The three things that interrupt rather than wait to be found were 52px
  // glowing tiles with 20-point emoji — the loudest object on the screen the
  // player looks at most.
  ok(panels.includes(".hail {"), "panels.css defines something hailing you from the edge of the page");
  ok(app.split('className={`hail').length - 1 + app.split('className="hail').length - 1 >= 3,
     "the daily, the pass and the offer are all hails");
  // A glow is a blur radius with no offset. The three tiles each had one, and
  // the Chronicle's whole answer to "how do you say IMPORTANT" is a drawn rule.
  const rail = app.slice(app.indexOf("Top-left cluster"), app.indexOf("The level-10 offer, under the sign-in") + 900);
  const glows = rail.match(/boxShadow: [^,\n]*0 0 \d+px/g) || [];
  ok(glows.length === 0, glows.length ? `still glowing: ${glows.join(" | ")}` : "…and none of them glows");
  ok(app.includes('<span className="hail-tally">'), "what is waiting is written in the corner of the plate");
}

sec("What is laid on top of the page");
{
  // Twenty-one overlays, written twenty-one times: four scrims, five border
  // colours, radii 10–16, padding 14–22, three unrelated z-index families.
  ok(!app.includes('position: "fixed", inset: 0'), "no screen paints its own overlay any more");
  ok(app.split('className="veil').length - 1 >= 20, "…they are all the same veil");
  ok(app.split('className="sheet').length - 1 + app.split('className={`sheet').length - 1 >= 20,
     "…carrying the same sheet");

  // THE SCRIM MUST BE TRANSLUCENT. Five of the twenty-one had been swept from an
  // rgba to a SOLID token, which on a fixed inset:0 element paints the whole
  // viewport — the page you were reading vanished and the sheet floated on a
  // flat field. A modal with an opaque backdrop is not a modal.
  ok(/--veil:\s+rgba\([^)]*0?\.\d+\)/.test(tokens), "the veil is a translucent wash");
  ok((tokens.match(/--veil:/g) || []).length === 3, "…defined in all three theme states");
  ok(/\.veil \{[^}]*background: var\(--veil\)/s.test(sheets), "…and every overlay uses it");
  ok(!/inset: 0[^}]*background: "var\(--(sunk|ground|raised)\)"/.test(app),
     "…so no overlay blacks the page out with a solid token");

  // ONE LADDER. Both z-index bugs were the same mistake — a number picked in
  // isolation — and both were invisible until you hit them in play.
  ok(/\.veil \{[^}]*z-index: 900/s.test(sheets), "there is one layer for sheets, above everything the page draws");
  ok(/\.veil\.is-over \{ z-index: 1000; \}/.test(sheets), "…and exactly one rung above it");
  ok(!/className="veil[^"]*" style=\{\{ zIndex/.test(app), "…and no overlay invents a number of its own");
  // The talent sheet sat at 260, UNDER the town's own floating rail at 320. The
  // rail is .hails now and carries its layer in the stylesheet, so the guard
  // reads it from there.
  const hailZ = /\.hails \{[^}]*z-index: (\d+)/s.exec(panels);
  ok(hailZ && Number(hailZ[1]) < 900, `the town rail (${hailZ && hailZ[1]}) is below the sheet layer`);
  // The socket confirmation sat at 240 while the picker that raises it sat at
  // 260 and stays open — choosing a Power-dormanting gem appeared to do nothing.
  ok(app.includes('<div onClick={() => setSocketConfirm(null)} className="veil is-over">'),
     "the socket confirmation opens ABOVE the picker that raises it");
  ok(app.includes('<div onClick={onClose} className="veil is-over">'),
     "…and an item's own sheet opens above whatever it was tapped from");

  // A sheet is a slip of paper: one hairline rule, and a single heavier rule
  // across the top saying what kind of thing it is. Nothing else takes a colour.
  for (const t of ["is-warn", "is-gain", "is-prize"])
    ok(new RegExp("\\.sheet\\." + t + "\\s+\\{ border-top-color").test(sheets), `a sheet can be ${t} on one edge`);
  ok(/\.sheet\.is-rarity \{ border-top-color: var\(--rar/.test(sheets),
     "…and an item's sheet takes the item's rarity there");
  ok(app.includes('className={`sheet is-rarity is-narrow ${rarClass(item.rarity)}`}'),
     "…reading it from the rarity class rather than a data hex");
  ok(!app.includes('border: `2px solid ${r.color}`'), "…so the item sheet is no longer boxed in its rarity");

  // The 38px emoji at the head of a sheet was the loudest thing the interface
  // could do. Drawn, at reading scale, in the soft hand.
  ok(app.split('className="sheet-mark"').length - 1 >= 9, "sheet marks are drawn at reading scale");
  ok(!/style=\{\{ textAlign: "center", fontSize: 3\d, marginBottom: \d \}\}>/.test(app),
     "…and nothing opens with a 30-plus-point emoji");
  ok(app.split('className="sheet-title"').length - 1 >= 15, "every sheet titles itself the same way");
  ok(app.includes('className="sheet-acts"'), "…and its ways out sit side by side, equal");

  // An item's actions carried a `color` from each call site — four hexes all
  // saying "you can do this". They are the same kind of thing, so only the one
  // that cannot be undone is marked.
  ok(!/\{ label: "(Equip|Compare|Sell|Lock)", color:/.test(app),
     "an item's actions no longer each pick their own colour");
  ok(app.includes('{ label: "Sell", tone: "warn"'), "…only Sell is marked, because only Sell is final");
  ok(app.includes('className={`go${a.tone === "warn" ? "" : " is-quiet"}`}'),
     "…and the tooltip reads a tone rather than a hex");
}

sec("Portraits are drawn, and the sheets are furnished");
{
  // THE PORTRAIT SWAP. GameIcon rendered its emoji raw for the whole redesign —
  // every item row in the Bank, the Armory and the Auction House showed the
  // operating system's colour emoji next to a page of ink. It needed no work
  // per call site: the mapping already existed, GameIcon simply was not asking.
  ok(/function GameIcon[\s\S]{0,900}return <EmojiIcon emoji=\{icon\} size=\{size\}/.test(app),
     "an item's portrait goes through the drawn set");
  ok(!/function GameIcon[\s\S]{0,900}<span style=\{\{ fontSize: Math\.round\(size \* 0\.92\)/.test(app),
     "…rather than straight to the emoji");

  // AND THE COVERAGE MEASUREMENT ITSELF WAS WRONG. Counting `icon:` fields in
  // App.jsx alone reported 99%; most of the data tables live in the core, and
  // counting both files reported 81%. The Armory's own slot grid — seven raw
  // emoji in a row — was the most visible thing that miscount hid, so the guard
  // reads BOTH files or it is measuring nothing.
  const map = fs.readFileSync(path.join(root, "design/emoji-map.mjs"), "utf8");
  const mapped = new Set([...map.matchAll(/"([^"]{1,5})":\s*"[a-z-]+"/g)].map((m) => m[1].replace(/️/g, "")));
  const core = fs.readFileSync(path.join(root, "game-core/combat.mjs"), "utf8");
  const fields = [app, core].flatMap((f) => [...f.matchAll(/icon: "([^"]{1,5})"/g)].map((m) => m[1]))
    .filter((e) => /\p{Extended_Pictographic}/u.test(e));
  const bare = [...new Set(fields.filter((e) => !mapped.has(e.replace(/️/g, ""))))];
  ok(fields.length > 500, `${fields.length} icon fields across App.jsx AND game-core/combat.mjs`);
  ok(bare.length === 0, bare.length ? `…${bare.length} still render as emoji: ${bare.join(" ")}`
                                    : "…and every one of them lands on a drawing");

  // The fallback has to honour `size` or the leftovers shrink while the drawn
  // ones grow, which reads as a layout bug rather than as missing art.
  ok(/\.rar-poor, \.rar-common,/.test(panels), "rarity publishes its hue as a variable");

  // THE SHEET INTERIORS. The frames converted first; these are the bodies.
  ok(sheets.includes(".cal-day"), "the sign-in calendar is ruled boxes");
  ok(!/const bg = got \? "#/.test(app), "…not eight hardcoded near-blacks in a ternary chain");
  ok(sheets.includes(".pass-cell"), "the pass track is ruled cells on a rail");
  ok(!/boxShadow: canClaim \? \(paid \? "0 0 10px/.test(app), "…with no glow on a claimable reward");
  ok(!/canClaim \? \(paid \? "var\(--raised\)" : "var\(--raised\)"\)/.test(app),
     "…and a claimable reward no longer looks identical to an unclaimable one");

  // The last three shared style objects. Between them they carried a near-black
  // input border and near-white input text on parchment — hexes the colour
  // sweep could not see, because they lived in a plain object.
  for (const o of ["btnPrimary", "btnGhost", "inpStyle"])
    ok(!new RegExp("const " + o + " = \\{").test(app), `${o} is retired`);
  ok(app.includes("const btnGoogle = {"),
     "…and btnGoogle stays, because Google's sign-in branding specifies those exact colours");

  // A HUNDRED DEAD COLOURS. Every addLog call carried a second argument naming
  // the colour to write that line in, in fourteen different hexes — and the
  // Chronicle has never read it, because an entry's kind is derived from the
  // sentence. They were stored on the entry and ignored. Removing the argument
  // took a third of the file's remaining raw hexes with it.
  const chron = fs.readFileSync(path.join(root, "src/chronicle.jsx"), "utf8");
  ok(!/e\.color|entry\.color/.test(chron), "the chronicle reads an entry's text, never a colour");
  ok(/const addLog = useCallback\(\(text\) =>/.test(app), "…so addLog no longer takes one");
  const tinted = (app.match(/addLog\([^;]*?, "#[0-9a-fA-F]{6}"\)/g) || []);
  ok(tinted.length === 0, tinted.length ? `${tinted.length} calls still pass a dead colour` : "…and no call still passes one");
}

sec("Six workshops, one bench");
{
  // The Tempering Forge, the Crafting Hall and its four rooms are the same
  // screen — pick your materials, read what they will make, make it — written
  // six times. Each tinted its own choices with the material's data colour, so
  // the Forge was brown, the Brewery purple and the Enchanter blue: a lot of
  // paint for one verb.
  ok(panels.includes(".pick {"), "panels.css defines a material you can pick");
  ok(panels.includes(".bench {"), "…and the bench it all adds up to");
  ok(app.split('className={`pick').length - 1 >= 5, "every workshop picks the same way");
  ok(app.split('className={`bench').length - 1 >= 4, "…and reports on the same bench");
  // The tell for the old version: a data colour with an alpha suffix glued on.
  ok(!/\.color \+ "33"/.test(app), "no picker tints itself with its material's own colour");
  ok(!/`1px solid \$\{pcol\}44`/.test(app), "…and no workshop frames itself in its profession's");

  // Each of the four rooms opened with a hand-written back/title/purse row.
  ok(app.split('<button onClick={() => setTab("prof")} className="head-back">').length - 1 >= 4,
     "all four rooms open with the same head");
  ok(!/justifyContent: "space-between", marginBottom: 12 \}\}>\s*\n\s*<button onClick=\{\(\) => setTab\("prof"\)/.test(app),
     "…and none of them hand-writes one any more");

  // WHICH ROOM A PROFESSION OPENS IS DATA NOW. It was five if/else branches
  // inside the row plus five colour-tinted hints beside the name. Moving it to
  // a table broke lessons.test.cjs in exactly the way the Market refactor did —
  // it greps for setTab("x") — which is the second time that has happened, so
  // the table has to be readable from module scope or nothing can check it.
  ok(/^const PROF_ROOM = \{/m.test(app), "PROF_ROOM is at module scope, where a test can read it");
  ok(!/if \(prof\.id === "mining" \|\| prof\.id === "herbalism"\) startGathering/.test(app),
     "…rather than five branches inside the row");

  // The temper odds panel is where the money is: it is the only screen in the
  // game that can destroy an item, so what it says has to be legible.
  ok(!/const pctRow = /.test(app), "the odds are ledger rows, not a bespoke row helper");
  ok(!/const rowBtn = /.test(app), "…and the mode switch is leaves, not a bespoke button helper");
  ok(app.includes('className={`go is-quiet${protectOn ? " is-on" : ""}`}'),
     "the ward reads as on or off through a class");
}

sec("Four counters where money changes hands");
{
  // The Vendor, the Supply Master, the Gambit Shop and the Premium Shop all sell
  // things, and all four had written their own buy row: a card bordered in the
  // item's own data colour, with a hand-styled price button on the end. A thing
  // you can buy is an item in a ledger with a small action beside it — which the
  // Bank has had since the second commit of this redesign.
  const itemRows = (app.split('className="item"').length - 1) + (app.split('className={`item').length - 1);
  ok(itemRows >= 18, `a thing you can buy is an ordinary item row (${itemRows} of them now)`);
  ok(!/borderLeft: `3px solid \$\{(?:s|def)\.color\}`/.test(app),
     "no shop row is ruled in its item's own colour");
  ok(!/border: `1px solid \$\{rarityById\(x\.rarity\)\.color\}44`/.test(app),
     "…and no gambit is boxed in its rarity");

  // BOTH BULK CONTROLS USED A NATIVE <input type=number>, which brings the
  // operating system's spinner arrows and its own focus ring — neither of which
  // this page can reach or theme.
  ok(panels.includes(".bulk {"), "panels.css defines the bulk-quantity control");
  ok(app.split('className="bulk"').length - 1 >= 2, "…and both shops use the same one");
  ok(/\.bulk-n[^}]*appearance: textfield/s.test(panels), "…with the platform's spinners turned off");
  // [^>]* would stop at the ">" inside an arrow function — the same trap that
  // made an earlier full-width-button sweep miss every handler with one.
  ok(!/<input type="number"[\s\S]{0,300}?style=\{\{/.test(app),
     "no number field styles itself inline any more");

}

sec("The last of the ledger screens");
{
  // THE SAME ROW, EIGHT MORE TIMES. The Bank's four stores, the Auction House's
  // sell and listings views and the Guild's trial rows all drew a card bordered
  // in the item's own data colour with a 3px rule down its left edge — the shape
  // the shops shed last commit. Nothing new was needed; these are the leftovers.
  ok(!/borderLeft: `3px solid \$\{(?:d|g|r|meta|col|v)\.col(?:or)?\}`/.test(app),
     "no store row is ruled in its item's own colour");
  ok(!/border: `1px solid \$\{(?:d|g|r|meta|col|v)\.col(?:or)?\}44`/.test(app),
     "…and none is boxed in it either");
  // The Bank's crafting store was a name and a count with no icon at all; the
  // ledger row is what a name-and-a-count is.
  ok(/Object\.entries\(char\.materials\)[\s\S]{0,400}className="ledger-row"/.test(app),
     "the crafting store is a ledger of quantities");

  // Section headings. Four of them carried their own colour and their own
  // margins — .eyebrow has existed since the Bank was converted.
  ok(!/fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0\.5/.test(app),
     "no section heading styles itself any more");

  // A GEM WAS DRAWN AS A HERB. 🍀 is the icon for BOTH the Mossroot herb and the
  // Flawless Emerald, so mapping it either way is wrong for the other — the
  // Bank's gem store showed a sprig of leaves in a gem list. Fixed in the data,
  // where the conflict actually is, rather than by bending the map.
  const core = fs.readFileSync(path.join(root, "game-core/combat.mjs"), "utf8");
  ok(/id: "g_flaw_emer",\s+name: "Flawless Emerald", icon: "💚"/.test(core),
     "the Flawless Emerald is drawn as a gem, not as a clover");
  const clovers = (core.match(/icon: "🍀"/g) || []).length + (app.match(/icon: "🍀"/g) || []).length;
  ok(clovers === 1, `🍀 now belongs to one thing (${clovers}), so mapping it to a herb is unambiguous`);
}

sec("The Bestiary knows what a creature looks like");
{
  const sprite = fs.readFileSync(path.join(root, "design/icons-sprite.svg"), "utf8");
  const svgHas = (id) => sprite.includes(`<symbol id="i-${id}"`);
  // THE DROP IS NOT THE CREATURE. Every entry drew itself with the icon of the
  // thing it drops — a bone for a Goblin, a spool of thread for a Bandit, a coat
  // for a Highway Thug — because that was the only per-enemy art the game had.
  // A book of monsters that shows you their loot is not a book of monsters.
  ok(!/\{drop\?\.icon \|\| "👹"\}/.test(app), "no creature is drawn as the thing it drops");
  ok(/^const ENEMY_MARKS = \{/m.test(app), "there is a table of what each creature looks like");
  ok(app.includes('<Icon name={enemyMark(e.name)}'), "…and the list reads it");
  ok(app.includes('<Icon name={enemyMark(sel.name)}'), "…so does the entry");

  // Ten silhouettes, matched longest-key-first the way ENEMY_DROPS already is —
  // "Fire Drake" has to beat "Fire", "Giant Spider" has to beat "Giant".
  ok(/ENEMY_MARK_KEYS = Object\.keys\(ENEMY_MARKS\)\.sort\(\(a, b\) => b\.length - a\.length\)/.test(app),
     "…longest key first, so a Fire Drake is a drake and not a flame");
  for (const g of ["wolf", "spider", "bat", "toad", "cat", "ogre", "wraith", "golem", "whirl", "lizard"])
    ok(svgHas(g), `the sprite draws a ${g}`);

  // EVERY enemy in the game must resolve, or the ones that fall through are the
  // ones a player never sees drawn — which is the bug this section fixes.
  const marks = (() => {
    const i = app.indexOf("const ENEMY_MARKS = {"), j = app.indexOf("\n};", i);
    const t = {};
    for (const m of app.slice(i, j).matchAll(/"?([A-Za-z ]+)"?:\s*"([a-z]+)"/g)) t[m[1].trim()] = m[2];
    return t;
  })();
  const keys = Object.keys(marks).sort((a, b) => b.length - a.length);
  const di = app.indexOf("const ENEMY_DROPS = {"), dj = app.indexOf("\n};", di);
  const enemies = [...app.slice(di, dj).matchAll(/^\s{2}"([^"]+)":/gm)].map((m) => m[1]);
  ok(enemies.length > 25, `${enemies.length} named enemies in the drop table`);
  const fellThrough = enemies.filter((n) => !keys.some((k) => n.includes(k)));
  ok(fellThrough.length === 0, fellThrough.length
    ? `${fellThrough.length} fall through to the generic beast: ${fellThrough.join(", ")}`
    : "…and every one of them resolves to a silhouette of its own");
}

sec("Standing orders, and the last seven heads");
{
  // A GAMBIT IS A STANDING ORDER: if this, then that, at a numbered priority.
  // Written twice — once per skill, once for consumables — as a rounded box with
  // the two clause labels in different hand-picked colours. IF takes the rubric,
  // because the condition is the part the player decides; THEN takes the margin.
  ok(panels.includes(".rule {"), "panels.css defines a standing order");
  ok(app.split('className="rule"').length - 1 >= 2, "…and both gambit modes use it");
  ok(app.includes('className="rule-clause is-if"'), "the condition is written in the rubric");
  ok(!/color: "var\(--rar-epic\)", fontSize: 11, fontWeight: 700 \}\}>Priority/.test(app),
     "…and the priority is not a colour of its own");

  // THE SCREEN HEAD, SEVEN MORE TIMES. .head has existed since the Class Hall;
  // seven screens were still hand-writing back / title / note as a flex row,
  // each with its own margin and its own title colour. Converted by script
  // rather than by hand, which is what a pattern used seven times deserves.
  const handWritten = [];
  const lines = app.split("\n");
  lines.forEach((l, i) => {
    if (!/justifyContent: "space-between"/.test(l) || !/display: "flex"/.test(l)) return;
    if (/<button onClick=\{\(\) => setTab\(/.test(lines[i + 1] || "")) handWritten.push(i + 1);
  });
  ok(handWritten.length === 0, handWritten.length
    ? `${handWritten.length} screens still hand-write their head: lines ${handWritten.join(", ")}`
    : "no screen hand-writes its head any more");

  // City Management's buildings are destinations you are working towards, which
  // is the same shape the Adventure Gate uses for a place you can go.
  ok(/TOWN_BUILDINGS\.map[\s\S]{0,700}className=\{`dest\$\{building \? " is-here"/.test(app),
     "a town building under construction is marked the way the current zone is");
  ok(!/border: `1\.5px solid \$\{building \? "var\(--gilt\)"/.test(app),
     "…rather than by re-tinting its whole border");

  // THE QUEST BOARD. A bounty is a listed thing with a mark, a progress and a
  // payoff — the same object the inventory row already is, so it is written the
  // same way. Two specific faults it carried:
  //
  //   · the kind was said with a raw hex (#e0556a for a killing, #8fd0e0 for a
  //     fetching) tinting the progress bar, and with a literal ⚔️ / 🎒 in the
  //     title. Both are the same statement, and neither survives the theme;
  //   · the claim button inverted while UNAVAILABLE — verdigris fill under faint
  //     ink — so "In progress" was the loudest thing on the screen and failed
  //     contrast, while the button you could actually press was the quiet one.
  const board = (() => {
    const i = app.indexOf('{tab === "questboard" && (');
    return i < 0 ? "" : app.slice(i, app.indexOf('{tab === "tavernhall"', i));
  })();
  ok(board.length > 200, "the quest board is findable");
  ok(!/#[0-9a-fA-F]{6}/.test(board), "a bounty's kind is not said with a hex");
  ok(!/⚔|🎒/.test(board), "…nor with a literal emoji in its title");
  ok(/className="mark"[\s\S]{0,120}q\.kind === "kill" \? "sword" : "pack"/.test(board),
     "…it is said with the drawn mark every listed thing carries");
  ok(/className="mini is-gain">Claim/.test(board) && !/In progress/.test(board),
     "the claim is a quiet action that is simply disabled until it is earned");
  ok(panels.includes(".item.is-done {"),
     "…and a finished row is ruled off the way a finished building is");
}

sec("The title page, and the colours that were hiding in the data");
{
  // THE FRONT MATTER had never been touched. Two screens a player sees before
  // there is a character to be, and both of them rendered on a flat --sunk with
  // no parchment and no theme class — so a player who had chosen candlelight got
  // daylight until the moment they pressed a save.
  ok(app.includes('className={`title-page chronicle-ground ${themeClass(loadTheme())}`}'),
     "the title page sits on the themed, textured ground");
  ok((app.match(/className=\{`title-page chronicle-ground/g) || []).length === 2,
     "…and so does character creation");
  ok(shell.includes(".title-page {") && shell.includes(".title-name {"),
     "shell.css owns the frontispiece");
  ok(!/textShadow: "0 0 22px/.test(app), "the game's name is set in type, not in a glow");

  // HOVER WRITTEN IN JAVASCRIPT. The save rows set borderColor to #f0b429 on
  // enter and #2a2550 on leave — a colour from the palette this redesign
  // replaced, so hovering a character put a dark purple line on parchment. A
  // handler that assigns style is invisible to every sweep that reads style={{}}.
  ok(!/e\.currentTarget\.style\.borderColor/.test(app),
     "no element paints its own border from an event handler");
  ok(shell.includes(".save:hover"), "…hover is a stylesheet's job, where the theme can see it");

  // THE CLASS PALETTE. Six hexes carried in the class DATA, chosen against a
  // black ground, never touched by the colour sweep because they are identity.
  // Measured on parchment they run 1.08:1 (rogue) to 2.71:1 (warlock) — every
  // one fails AA and the rogue's yellow is unreadable. Same fix the rarities
  // got: the hue stays in the data, the theme decides the value.
  const clsIds = ["warrior", "mage", "rogue", "paladin", "hunter", "warlock"];
  for (const id of clsIds)
    ok(new RegExp(`\\.cls-${id}\\s*\\{ color: var\\(--cls-${id}\\); \\}`).test(panels),
       `.cls-${id} takes its ink from the theme`);
  const dayBlock = tokens.slice(0, tokens.indexOf("@media"));
  ok(clsIds.every((id) => new RegExp(`--cls-${id}:`).test(dayBlock)),
     "…and day defines all six rather than inheriting a night value");
  ok((tokens.match(/--cls-warrior:/g) || []).length === 3,
     "…in all three theme states, like every other token here");
  ok(!/style=\{\{ color: cls\.color \}\}/.test(app) && !/border: `1\.5px solid \$\{cls\.color\}`/.test(app),
     "nothing reads the raw class hex out of the data any more");

  // TWO CLASSES, ONE PICTURE. 🗡 and ⚔ both mapped to i-sword, so on the first
  // screen of the game the Rogue was drawn with the Warrior's weapon. The mage's
  // orb was a book and the warlock's eye was a bullseye. A class mark is the most
  // identity-bearing glyph in the set; near enough is not enough.
  const map = fs.readFileSync(path.join(root, 'design/emoji-map.mjs'), 'utf8');
  const sprite = fs.readFileSync(path.join(root, 'design/icons-sprite.svg'), 'utf8');
  for (const g of ["dagger", "orb", "eye", "horns"])
    ok(sprite.includes(`id="i-${g}"`), `the sprite draws a ${g}`);
  ok(/"🗡": "dagger"/.test(map), "the rogue's dagger is not the warrior's sword");
  ok(/"🔮": "orb"/.test(map) && /"👁": "eye"/.test(map),
     "…the mage carries an orb and the warlock an eye");
  // Every class and race resolves to a mark of its own, read out of the core data
  // rather than a list written here — a class added later cannot quietly collide.
  const core = fs.readFileSync(path.join(root, 'game-core/combat.mjs'), 'utf8');
  const emoji = (() => {
    const t = {};
    for (const m of map.matchAll(/"([^"]+)":\s*"([a-z]+)"/g)) t[m[1]] = m[2];
    return t;
  })();
  const strip = (e) => e.replace(/️/g, "");
  const raceMarks = (() => {
    const m = /const RACE_MARKS = \{([^}]*)\}/.exec(app);
    const t = {};
    if (m) for (const p of m[1].matchAll(/(\w+):\s*"([a-z]+)"/g)) t[p[1]] = p[2];
    return t;
  })();
  const grab = (re) => [...core.matchAll(re)].map((m) => ({ id: m[1], name: m[2], icon: strip(m[3]) }));
  const classes = grab(/\{ id: "(\w+)", name: "(\w+)", icon: "([^"]+)", color:/g);
  const races = grab(/\{ id: "(\w+)", name: "(\w+)", icon: "([^"]+)", faction:/g);
  ok(classes.length === 6 && races.length === 8, `${classes.length} classes and ${races.length} races in the core`);
  const clash = (list, marks) => {
    const seen = new Map(); const bad = [];
    for (const r of list) {
      const g = (marks && marks[r.id]) || emoji[r.icon];
      if (!g) { bad.push(`${r.name} has no drawing`); continue; }
      if (seen.has(g)) bad.push(`${r.name} and ${seen.get(g)} are both a ${g}`);
      else seen.set(g, r.name);
    }
    return bad;
  };
  const cb = clash(classes, null), rb = clash(races, raceMarks);
  ok(cb.length === 0, cb.length ? cb.join("; ") : "…every class has a silhouette of its own");
  ok(rb.length === 0, rb.length ? rb.join("; ") : "…and so does every race");
}

sec("An item sheet is a list of facts");
{
  // THE SHEET EVERY ITEM OPENS INTO. Sixteen <div>s of one line each, with six
  // different font sizes between 9.5 and 12.5 for what is a single voice, and a
  // colour picked per line. A fact is a line; what KIND of fact it is chooses
  // the ink, and nothing chooses the size.
  const tip = (() => {
    const i = app.indexOf("function ItemTooltip(");
    return i < 0 ? "" : app.slice(i, app.indexOf("\nfunction ", i + 10));
  })();
  ok(tip.length > 500, "the item sheet is findable");
  ok(sheets.includes(".fact {") && sheets.includes(".facts.is-ruled"),
     "sheets.css owns the fact list");
  ok(!/fontSize: 1[012]\.?5?/.test(tip) && !/fontSize: 9\.5/.test(tip),
     "no line in the sheet picks its own size");
  ok((tip.match(/className="fact/g) || []).length >= 8, "…they are all facts");

  // A SOCKET IS ROUND because a socket is a hole — the only round thing in the
  // game, and it earns it. It used to read the gem's rarity hex straight out of
  // the data for its rim, which is the palette that fails on parchment.
  ok(sheets.includes(".socket {") && sheets.includes(".socket.is-set"),
     "a socket is furniture, not an inline circle");
  ok(!/rarityById\(g\.rarity\)\.color/.test(tip),
     "…and its rim takes the themed rarity, not the raw hex");

  // A RELIC is legendary, so its text is the legendary hue. relicColor carried
  // one raw hex and one token for the game's two relics — two answers to a
  // question the rarity had already settled.
  ok(!/item\.relicColor|relicColor:/.test(app), "a relic does not carry a colour of its own");
  ok(sheets.includes(".fact.is-relic"), "…it is written in the legendary hand");

  // An action's label can contain an emoji ("🔒 Lock") and was rendered as bare
  // text, so the one glyph on the sheet the drawn set already had came out as a
  // system emoji next to five drawings.
  ok(/\{withIcons\(a\.label, 13\)\}/.test(tip), "an action's label goes through the drawn set");
}

sec("Ten more screens, and the colours that were arguments");
{
  // A SCREEN-LOCAL ACCENT. Two screens opened with `const acc = "#ffd479"` /
  // "#f0913e" and then painted their title, every item name and every price with
  // it. Measured on parchment the Battlemaster's gold is 1.35:1 — an entire shop
  // written in an ink you cannot read. A screen does not get a colour of its own.
  const accents = [...app.matchAll(/const acc = "(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]);
  ok(accents.length === 0, accents.length
    ? `${accents.length} screens still define a private accent: ${accents.join(", ")}`
    : "no screen defines an accent colour of its own");

  // A COLOUR PASSED AS AN ARGUMENT is the version of the same mistake that
  // survives a rewrite: `hub()` stopped reading its fifth parameter when it
  // became a .gateway, and four call sites kept passing a hex anyway. A dead
  // colour left in a call site is how the next person concludes it still matters.
  ok(!/hub\("[^"]+", "[^"]+", [\s\S]{0,200}?, "#[0-9a-fA-F]{6}"\)/.test(app),
     "no destination is passed a colour its component does not read");
  ok(!/col: "#[0-9a-fA-F]{6}", go:/.test(app),
     "…and the Tavern's four rooms are not four hues");
  ok(!/border: `1px solid \$\{cl\.color\}55`/.test(app),
     "no border is written as a class hex with an alpha suffix");

  // THE PARTY, five allies deep, every one of them in verdigris because the
  // ternary picked the same value on both branches. You are the one with the
  // rule down your left — the mark the game already uses for "here".
  ok(combat.includes(".ally {") && combat.includes(".ally.is-me"),
     "the party is furniture");
  ok(!/color: m\.me \? "var\(--verdigris\)" : "var\(--verdigris\)"/.test(app),
     "…and you are not the same colour as the bots");
  ok(/className=\{`ally\$\{m\.me \? " is-me" : ""\}/.test(app), "…nor a differently-bordered box");

  // THE QUEST TRACKER under the fight tinted each row by quest KIND, with the
  // same two hexes the Quest Board used before it learned to draw a mark.
  ok(combat.includes(".track {"), "a tracked quest is furniture");
  // Scoped to what is RENDERED. The same four hexes also name a dust, a scroll
  // and an empty bottle in the data tables, which is identity and is meant to
  // stay — the ratio check below draws the same line, and getting it wrong once
  // already made a passing guard look like a regression.
  const tinted = [...app.matchAll(/<Bar\b[^>]{0,300}?color=(?:"|\{")(#[0-9a-fA-F]{3,8})/g)].map((m) => m[1]);
  ok(tinted.length === 0, tinted.length
    ? `${tinted.length} bars are still tinted by hand: ${[...new Set(tinted)].join(", ")}`
    : "…and no bar in the game is tinted with a hand-picked hex");

  // Six screens' worth of one-off rows, all onto vocabulary that already existed.
  for (const [what, needle] of [

    ["a story chapter is an item", '{soon ? "coming soon" : <><Icon name="lock" size={10} /> locked</>}'],
    ["a talent is a card", 'className={`card${sel ? " is-on" : ""}`}'],
    ["a skill mod is a standing order", 'className="rule">\n                <div className="rule-head">'],
    ["a letter is a marginal note", 'className="aside-note">\n                    <b><Icon name={tone.icon}'],
    ["gathering counts what you hold in the ledger", 'className="ledger-label"><EmojiIcon emoji={MATERIALS[mk].icon}'],
  ]) ok(app.includes(needle), what);

  // Scoped to the Tavern's own block. .gateway is used on four other screens, so
  // a bare includes() passed even with the Tavern reverted — a guard that cannot
  // fail is worse than no guard, because it reads as coverage.
  const tavern = (() => {
    const i = app.indexOf('{tab === "tavern" && (');
    return i < 0 ? "" : app.slice(i, app.indexOf('{tab === "bestiary"', i));
  })();
  ok(tavern.includes('className="gateway"'), "the Tavern's rooms are gateways");
  ok(!/col:/.test(tavern), "…and its table carries no colours");
}

sec("Group content, and the panel that had been crashing");
{
  // THE GROUP ENCOUNTER is the one screen where several things are true at once
  // and you have a second to read all of them: five allies, one or more enemies,
  // who has aggro, what is casting, what lands next. It said all of that with
  // ELEVEN HEXES AND FIVE GLOWS — the failure mode a busy screen invites. State
  // is now the edge of the frame, in the three marks the rest of the game uses.
  const grp = (() => {
    const i = app.indexOf("function GroupCombat(");
    return i < 0 ? "" : app.slice(i, app.indexOf("\nfunction MultiplayerHub("));
  })();
  ok(grp.length > 2000, "the group encounter is findable");
  ok(combat.includes(".frame {") && combat.includes(".frame.is-target") && combat.includes(".frame.is-warned"),
     "a targetable frame is furniture");
  ok(!/#5fd39a|#ff9838|#241f3c|#3a6ea5|#5b8fd6|#c8a0ff/.test(grp),
     "…and none of the six frame hexes survive");
  ok(!/ROLES\[a\.role\]\.color/.test(grp), "an ally's bar is not tinted by role");
  ok(combat.includes(".pips") && !/boxShadow: `0 0 5px \$\{ri\.color\}/.test(grp),
     "a combo point is a box that is inked or not, and does not glow");
  ok(combat.includes(".act {") && combat.includes(".act.is-sealed") && combat.includes(".act.is-poor"),
     "the group action bar shares the seal grammar");
  ok(!/rgba\(10,8,18/.test(grp), "…and cooling is ink filling the seal, not a black square over it");

  // NOT ONE GLOW LEFT IN THE GAME. Five in group content, and the last of them
  // was the reason a busy screen read as a light show rather than a page.
  const glows = (app.match(/boxShadow: "0 0 /g) || []).length;
  ok(glows === 0, glows ? `${glows} glows remain` : "nothing in the game glows");
  const rgbas = [...app.matchAll(/rgba\(\d+,\s*\d+,\s*\d+[^)]*\)/g)].map((m) => m[0]);
  ok(rgbas.length === 0, rgbas.length
    ? `${rgbas.length} raw rgba colours remain: ${[...new Set(rgbas)].slice(0, 4).join(", ")}`
    : "…and no colour is written as a raw rgba");

  // GLOBAL CHAT WAS THROWING. Its input spread `inpStyle`, which was retired
  // when .field replaced it — an undefined identifier in a spread. A React error
  // boundary catches it, which is exactly why page-error checks stayed silent
  // and why the browser audit had to learn to read the DOM for the fallback.
  ok(!/\.\.\.inpStyle/.test(app), "nothing spreads a style object that no longer exists");
  ok(panels.includes(".talk {") && panels.includes(".said b.is-me"),
     "a chat transcript is furniture, and you are the one in the rubric");
  ok(!/color: \(m\.me \|\| m\.name === myName\) \? "var\(--verdigris\)" : "var\(--rar-epic\)"/.test(app),
     "…rather than every word in the accent colour");
  ok(!/background: transparent \? "rgba\(8,7,15/.test(app),
     "…and the overlay copy is a slip of paper, not a grey wash");

  // The hub's sub-tabs were filled pills whose UNSELECTED state was solid
  // verdigris, so the tab you were not on was the loud one.
  ok(/className=\{`leaf\$\{sub === id \? " is-open" : ""\}`\}/.test(app),
     "the Arena's sub-tabs are leaves like every other tab strip");
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
  // These were absolute floors — "more than 120 backgrounds", "more than 400
  // colours" — written to prove the sweep had run. They are the WRONG SHAPE for
  // a conversion that is still going: every screen that moves to a class
  // removes an inline colour, so the counts fall as the work succeeds, and the
  // floors started failing on progress. Twice now (the style-block scan did the
  // same). What actually matters is the RATIO: of the colours still written
  // inline, nearly all should be tokens rather than hexes.
  // Scoped to inline STYLE objects, walked brace by brace. Matching the whole
  // file instead counts the data tables — a zone's tint, a relic's hue, a
  // class's colour — which are identity and are meant to stay hexes. Getting
  // that wrong reported 83% and made the guard look like a regression.
  const inStyles = (() => {
    const blocks = []; let q = 0;
    while (true) {
      const j = app.indexOf("style={{", q); if (j < 0) break;
      let k = j + 8, d = 2;
      while (d > 0 && k < app.length) { if (app[k] === "{") d++; else if (app[k] === "}") d--; k++; }
      blocks.push(app.slice(j, k)); q = k;
    }
    return blocks.join("\n");
  })();
  const inlineTok = (inStyles.match(/var\(--/g) || []).length;
  const inlineHex = (inStyles.match(/"#[0-9a-fA-F]{3,8}"/g) || []).length;
  const pct = Math.round((inlineTok / (inlineTok + inlineHex)) * 100);
  ok(pct >= 97,
     `${pct}% of inline-style colours are tokens (${inlineTok} tokens, ${inlineHex} raw hexes)`);
}

console.log("\n" + (fail
  ? `❌ ${fail} chronicle check(s) failed`
  : "✅ prose in the body, quantities in the margin — from the log the game already writes"));
process.exit(fail ? 1 : 0);
