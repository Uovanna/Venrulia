/* Secondary-stat soft caps: how easily does a level-60 hit them, and what would a diminishing
 * returns curve do instead?
 *
 * Today every secondary converts LINEARLY and then slams into a hard cap:
 *   leech min(25, r*0.5)   resil min(30, r*0.6)   vers min(20, r*0.4)
 *   cdr   min(15, r*0.3)   csd   min(200, r*4)
 * All five therefore cap at exactly 50 rating, which rerolling reaches trivially.
 *
 *   node game-core/softcap-sim.cjs [ilvl] [rarity]
 *
 * Requires `tsc` on PATH. Measures and models; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const ILVL = Number(process.argv[2]) || 63;
const RARITY = process.argv[3] || "epic";

const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-cap-'));
execSync(`tsc "${SRC}" --jsx react --target es2020 --module commonjs --outDir "${dir}" --allowJs --checkJs false --noResolve`, { stdio: 'inherit' });
const outName = fs.readdirSync(dir).find((f) => f.endsWith('.js'));
let js = fs.readFileSync(path.join(dir, outName), 'utf8');
const stub = '({default:{Component:function(){},createElement:function(){return{}},Fragment:"F"},useState:0,useEffect:0,useRef:0,useCallback:0,createElement:function(){return{}},Component:function(){},Fragment:"F"})';
js = js.replace('__importStar(require("react"))', stub);
js = js.replace(/require\("\.\.\/game-core\//g, `require("${path.join(__dirname).replace(/\\/g, '/')}/`);
js = js.replace(/import\.meta\.env/g, '({})');
// App.jsx now imports its icon set. These harnesses compile App.jsx into a temp dir, so a
// relative require would resolve against that dir and blow up. The icons are pure rendering
// and no test asserts on them, so they are stubbed rather than compiled.
js = js.replace(/require\("\.\/icons\.jsx"\)/g, '({IconSprite:function(){return null},Icon:function(){return null},EmojiIcon:function(){return null},withIcons:function(t){return t}})');
js = js.replace(/require\("\.\/chronicle\.jsx"\)/g, '({ChronicleStyles:function(){return null},Chronicle:function(){return null},loadTheme:function(){return "auto"},saveTheme:function(){},themeClass:function(){return "theme-day"}})');

js += `
;(function(){
  const ILVL = ${ILVL}, RARITY = ${JSON.stringify(RARITY)};
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const { LOOT_SLOTS, generateItem, rarityById } = core;
  const pad = (s, n) => String(s).padEnd(n); const rpad = (s, n) => String(s).padStart(n);
  // IMPORTED, not restated. An earlier version copied these tables "so the report cannot drift
  // from the game" and then drifted the moment the rates changed, reporting pre-change numbers
  // with total confidence. Read them from the core.
  const SEC = core.SECONDARY_POOL;
  const CAP = core.SEC_CAP, RATE = core.SEC_RATE;
  const capAt = (k) => CAP[k] / RATE[k];          // rating needed to hard-cap

  console.log("\\nSECONDARY SOFT CAPS — ilvl " + ILVL + " " + RARITY + " full set (10 slots)\\n");
  console.log(pad("stat", 8) + rpad("cap %", 8) + rpad("per rating", 12) + rpad("rating to cap", 15));
  for (const k of Object.keys(CAP)) {
    console.log(pad(k, 8) + rpad(CAP[k] + "%", 8) + rpad(RATE[k], 12) + rpad(capAt(k), 15));
  }
  console.log("  -> every secondary caps at the SAME 50 rating");

  // How much rating does a realistic full set actually carry?
  const N = 4000;
  const totals = {}; for (const k of SEC) totals[k] = 0;
  for (let i = 0; i < N; i++) {
    for (const s of LOOT_SLOTS) {
      const it = generateItem(ILVL, rarityById(RARITY), s.id, "warrior");
      for (const k of SEC) totals[k] += (it.stats[k] || 0);
    }
  }
  console.log("\\nA FULL SET, SPREAD NATURALLY (average rating per stat across 10 slots)");
  console.log(pad("stat", 8) + rpad("rating", 9) + rpad("cap", 7) + rpad("% of cap", 10) + rpad("yields", 10));
  for (const k of Object.keys(CAP)) {
    const r = totals[k] / N;
    const yielded = core.secPct(k, r);
    console.log(pad(k, 8) + rpad(r.toFixed(1), 9) + rpad(capAt(k), 7)
      + rpad((r / capAt(k) * 100).toFixed(0) + "%", 10) + rpad(yielded.toFixed(1) + "%", 10));
  }

  // Now CONCENTRATE: reroll every line on every item into one stat. This is what the reroll
  // shop lets a player do today, and it is the case that trivialises the caps.
  console.log("\\nCONCENTRATED BY REROLLING (every line on all 10 slots into ONE stat)");
  console.log(pad("stat", 8) + rpad("rating", 9) + rpad("cap", 7) + rpad("x over cap", 12) + rpad("wasted", 10));
  const lineCounts = [];
  for (let i = 0; i < 500; i++) {
    let lines = 0, ratingIfAll = 0;
    for (const s of LOOT_SLOTS) {
      const it = generateItem(ILVL, rarityById(RARITY), s.id, "warrior");
      const present = SEC.filter((k) => (it.stats[k] || 0) > 0);
      lines += present.length;
      // if every one of those lines were rerolled into the same non-stamina stat
      if (!present.length) continue;
      const per = Math.max(...present.map((k) => (it.stats[k] || 0) / (k === "sta" ? 1.0 : 0.5)));
      ratingIfAll += present.length * Math.round(per * 0.5);
    }
    lineCounts.push({ lines, ratingIfAll });
  }
  const avgLines = lineCounts.reduce((a, b) => a + b.lines, 0) / lineCounts.length;
  const avgConc = lineCounts.reduce((a, b) => a + b.ratingIfAll, 0) / lineCounts.length;
  for (const k of Object.keys(CAP)) {
    const over = avgConc / capAt(k);
    console.log(pad(k, 8) + rpad(avgConc.toFixed(0), 9) + rpad(capAt(k), 7)
      + rpad("x" + over.toFixed(1), 12) + rpad(Math.max(0, avgConc - capAt(k)).toFixed(0), 10));
  }
  console.log("  average secondary lines across a full set: " + avgLines.toFixed(1));

  // ---- PROPOSAL --------------------------------------------------------------------------
  // A plain saturating curve (cap * r/(r+K)) was the obvious idea and it is WRONG here: it also
  // halves the value of a normally-geared player, who only carries ~14 rating per stat. The
  // problem is not that rating is worth too much, it is that CONCENTRATION past 50 is free and
  // then abruptly worthless.
  //
  // So: linear and untouched up to a soft cap S, then a hyperbolic tail that approaches the hard
  // cap without ever reaching it. Natural gearing feels identical; stacking one stat keeps paying
  // but pays less and less, and nothing is ever fully wasted.
  //
  //   r <= S : effective = r
  //   r >  S : effective = S + (capAt - S) * (r - S) / ((r - S) + D)
  const S_FRAC = Number(process.env.S_FRAC || 0.5);   // soft cap at half the hard cap
  const D = Number(process.env.D || 50);              // tail width: bigger = slower approach
  const eff = (k, r) => {
    const hard = capAt(k), S = hard * S_FRAC;
    if (r <= S) return r;
    return S + (hard - S) * (r - S) / ((r - S) + D);
  };
  const nowPct = (k, r) => Math.min(CAP[k], r * RATE[k]);   // the OLD linear+wall, for comparison
  const newPct = (k, r) => core.secPct(k, r);              // what the game now actually does

  console.log("\\nPROPOSED: linear to a soft cap, then a hyperbolic tail to the hard cap");
  console.log("  soft cap S = " + (S_FRAC * 100) + "% of the hard cap (25 rating), tail width D = " + D + "\\n");
  console.log(pad("rating", 8) + rpad("vers now", 10) + rpad("vers new", 10) + rpad("csd now", 10) + rpad("csd new", 10)
    + "   " + rpad("+10 now", 9) + rpad("+10 new", 9));
  for (const r of [14, 25, 40, 50, 75, 100, 150, 200]) {
    const dNow = nowPct("vers", r + 10) - nowPct("vers", r);
    const dNew = newPct("vers", r + 10) - newPct("vers", r);
    console.log(pad(r, 8) + rpad(nowPct("vers", r).toFixed(1) + "%", 10) + rpad(newPct("vers", r).toFixed(1) + "%", 10)
      + rpad(nowPct("csd", r).toFixed(0) + "%", 10) + rpad(newPct("csd", r).toFixed(0) + "%", 10)
      + "   " + rpad("+" + dNow.toFixed(2), 9) + rpad("+" + dNew.toFixed(2), 9));
  }

  console.log("\\nWHAT THIS DOES TO THE TWO PLAYERS THAT MATTER");
  const natural = 14.2, conc = 100;
  for (const k of ["vers", "csd", "leech"]) {
    console.log("  " + pad(k, 6)
      + " naturally geared (" + natural + " rating): now " + nowPct(k, natural).toFixed(1)
      + "% -> new " + newPct(k, natural).toFixed(1) + "%   (unchanged)");
    console.log("  " + pad("", 6)
      + " reroll-stacked (" + conc + " rating): now " + nowPct(k, conc).toFixed(1)
      + "% -> new " + newPct(k, conc).toFixed(1) + "%   ("
      + ((newPct(k, conc) / nowPct(k, conc) - 1) * 100).toFixed(0) + "%)");
  }
  console.log("\\n  rating needed to reach 90% of the hard cap:");
  for (const k of ["vers"]) {
    let r = 0; while (newPct(k, r) < CAP[k] * 0.9 && r < 100000) r += 1;
    console.log("    now " + capAt(k) + "   ->   proposed " + r);
  }
  console.log("");
})();`;
const run = path.join(dir, 'cap.cjs'); fs.writeFileSync(run, js);
require(run);
