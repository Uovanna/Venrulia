/* Two questions for step 0:
 *   1. How far behind is a healer spec in SOLO play, really? (No spec has an auto-attack
 *      penalty, so the gap has to be measured rather than assumed.)
 *   2. What should haste's cap be, as a new gear secondary?
 *
 *   node game-core/healer-haste-sim.cjs
 *
 * Requires `tsc` on PATH. Measures and models; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-hh-'));
execSync(`tsc "${SRC}" --jsx react --target es2020 --module commonjs --outDir "${dir}" --allowJs --checkJs false --noResolve`, { stdio: 'inherit' });
const outName = fs.readdirSync(dir).find((f) => f.endsWith('.js'));
let js = fs.readFileSync(path.join(dir, outName), 'utf8');
const stub = '({default:{Component:function(){},createElement:function(){return{}},Fragment:"F"},useState:0,useEffect:0,useRef:0,useCallback:0,createElement:function(){return{}},Component:function(){},Fragment:"F"})';
js = js.replace('__importStar(require("react"))', stub);
js = js.replace(/require\("\.\.\/game-core\//g, `require("${path.join(__dirname).replace(/\\/g, '/')}/`);
js = js.replace(/import\.meta\.env/g, '({})');

js += `
;(function(){
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const { buildBotChar, offlinePlayerDps, maxHpFor, critChanceFor, SPECS } = core;
  const pad = (s, n) => String(s).padEnd(n); const rpad = (s, n) => String(s).padStart(n);

  // ---- 1. HEALER SOLO VIABILITY ---------------------------------------------------------
  console.log("\\nSOLO THROUGHPUT BY SPEC — level 60, ilvl 63");
  console.log("No spec carries an auto-attack penalty, so any healer gap comes from its KIT.\\n");
  const specs = [
    ["paladin", "p_holy",   "Holy (healer)"],
    ["paladin", "p_prot",   "Protection (tank)"],
    ["paladin", "p_just",   "Justicar (dps)"],
    ["warrior", "w_prot",   "Protection (tank)"],
    ["warrior", "w_berserk","Berserker (dps)"],
    ["mage",    "m_support","Chronomancer (support)"],
    ["mage",    "m_fire",   "Fire (dps)"],
    ["hunter",  "h_support","Warden (support)"],
    ["hunter",  "h_snipe",  "Sniper (dps)"],
    ["rogue",   "r_ambush", "Assassin (dps)"],
  ];
  const rows = [];
  for (const [cls, spec, label] of specs) {
    const c = buildBotChar(cls, spec, 60, 63); c.spec = spec;
    const dps = offlinePlayerDps(c);
    rows.push({ label, dps, hp: maxHpFor(c), crit: critChanceFor(c) });
  }
  const bestDps = Math.max(...rows.map((r) => r.dps));
  console.log(pad("spec", 26) + rpad("dps", 8) + rpad("vs best", 10) + rpad("hp", 8) + rpad("crit", 8));
  for (const r of rows.sort((a, b) => b.dps - a.dps)) {
    console.log(pad(r.label, 26) + rpad(Math.round(r.dps), 8) + rpad((r.dps / bestDps * 100).toFixed(0) + "%", 10)
      + rpad(Math.round(r.hp), 8) + rpad((r.crit * 100).toFixed(0) + "%", 8));
  }
  const heal = rows.find((r) => /healer/.test(r.label));
  console.log("\\n  Holy sits at " + (heal.dps / bestDps * 100).toFixed(0) + "% of the best solo dps.");
  console.log("  A kill takes ~" + (bestDps / heal.dps).toFixed(1) + "x as long as the strongest spec's.");

  // ---- 2. HASTE CAP MODELS -----------------------------------------------------------------
  // Haste shortens the auto-attack interval: dps scales 1/(1 - h). That is HYPERBOLIC, so a
  // linear "% haste" runs away near 100% — the cap is not cosmetic, it is what keeps the curve
  // finite. Existing secondaries cap at: cdr 15%, vers 20%, leech 25%, resil 30%.
  console.log("\\nHASTE CAP MODELS — haste multiplies attacks per second by 1/(1 - h)");
  console.log(pad("cap", 8) + rpad("dps at cap", 13) + rpad("vs vers cap", 13) + rpad("rating for cap", 16) + "   feel");
  const versGain = 0.20;   // versatility's cap, for comparison
  for (const cap of [0.10, 0.15, 0.20, 0.25, 0.30, 0.40]) {
    const gain = 1 / (1 - cap) - 1;
    const rate = 0.3;                       // same rating->% rate as cdr
    const feel = gain < versGain * 0.8 ? "weaker than versatility"
               : gain < versGain * 1.35 ? "comparable to versatility"
               : gain < versGain * 2 ? "clearly the best damage stat"
               : "dominates everything";
    console.log(pad((cap * 100).toFixed(0) + "%", 8) + rpad("+" + (gain * 100).toFixed(1) + "%", 13)
      + rpad("x" + (gain / versGain).toFixed(2), 13) + rpad(Math.round(cap * 100 / rate), 16) + "   " + feel);
  }

  console.log("\\n  marginal value of +5% haste, by how much you already have:");
  for (const h of [0, 0.10, 0.20, 0.30, 0.40]) {
    const d = (1 / (1 - (h + 0.05))) - (1 / (1 - h));
    console.log("    at " + rpad((h * 100).toFixed(0) + "%", 4) + " haste:  +" + (d * 100).toFixed(2) + "% dps"
      + (h >= 0.3 ? "   <- runaway begins" : ""));
  }
  console.log("\\n  Haste also shortens the GCD in group play, so it is worth MORE there than the");
  console.log("  auto-attack maths above suggests. A cap set on solo numbers will be generous online.");
  console.log("");
})();`;
const run = path.join(dir, 'hh.cjs'); fs.writeFileSync(run, js);
require(run);
