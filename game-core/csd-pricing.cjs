/* Is crit damage (csd) priced correctly?
 *
 * csd raises the crit MULTIPLIER (critMultFor = 1.8 + csd% / 100), so its value is multiplied by
 * how often you crit — while versatility adds flat damage. Pricing a multiplicative stat with a
 * linear rating conversion is how a stat ends up worthless for one class and mandatory for
 * another. This measures the real exchange rate at several crit chances.
 *
 *   node game-core/csd-pricing.cjs
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-csd-'));
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
  const pad = (s, n) => String(s).padEnd(n); const rpad = (s, n) => String(s).padStart(n);
  // Imported from the core, never restated — a copied table silently reports stale numbers.
  const _c = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const CAP = _c.SEC_CAP, RATE = _c.SEC_RATE;
  const BASE_CRIT_MULT = 1.8;
  // Use the core's own conversion (diminishing returns included) rather than re-deriving it.
  const versPct = (r) => _c.secPct("vers", r);
  const csdPct  = (r) => _c.secPct("csd", r);

  // Expected damage multiplier: crits land 'p' of the time at (1.8 + csd/100)x.
  const dmgMult = (p, csdRating, versRating) =>
    (1 + p * (BASE_CRIT_MULT + csdPct(csdRating) / 100 - 1)) * (1 + versPct(versRating) / 100);

  console.log("\\nCRIT DAMAGE vs VERSATILITY — expected damage multiplier");
  console.log("csd is multiplicative with crit chance; vers is flat. 10 rating spent either way.\\n");
  console.log(pad("crit chance", 13) + rpad("+10 vers", 11) + rpad("+10 csd", 11) + rpad("csd/vers", 11) + "   verdict");
  for (const p of [0.12, 0.20, 0.25, 0.35, 0.50, 0.80]) {
    const base = dmgMult(p, 0, 0);
    const gVers = dmgMult(p, 0, 10) / base - 1;
    const gCsd  = dmgMult(p, 10, 0) / base - 1;
    const ratio = gCsd / (gVers || 1e-9);
    const verdict = ratio > 1.6 ? "csd dominates" : ratio < 0.65 ? "csd is dead weight" : "comparable";
    console.log(pad((p * 100).toFixed(0) + "%", 13) + rpad((gVers * 100).toFixed(2) + "%", 11)
      + rpad((gCsd * 100).toFixed(2) + "%", 11) + rpad("x" + ratio.toFixed(2), 11) + "   " + verdict);
  }

  console.log("\\nWHO SITS WHERE (crit chance from class/race/agility — never from gear)");
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const { createCharacter, critChanceFor, buildBotChar } = core;
  for (const [cls, race, label] of [["warrior", "human", "warrior"], ["rogue", "human", "rogue"],
                                    ["rogue", "troll", "rogue (troll)"], ["mage", "human", "mage"],
                                    ["paladin", "human", "paladin"]]) {
    const c = buildBotChar(cls, "", 60, 63); c.race = race;
    const p = critChanceFor(c);
    const gVers = dmgMult(p, 0, 10) / dmgMult(p, 0, 0) - 1;
    const gCsd  = dmgMult(p, 10, 0) / dmgMult(p, 0, 0) - 1;
    console.log("  " + pad(label, 15) + rpad((p * 100).toFixed(0) + "% crit", 10)
      + "   10 rating is worth  vers " + (gVers * 100).toFixed(2) + "%  /  csd " + (gCsd * 100).toFixed(2)
      + "%   (x" + (gCsd / gVers).toFixed(2) + ")");
  }

  console.log("\\nTHE SWING ACROSS THE ROSTER");
  const ps = [0.12, 0.80];
  const r = ps.map((p) => (dmgMult(p, 10, 0) / dmgMult(p, 0, 0) - 1) / (dmgMult(p, 0, 10) / dmgMult(p, 0, 0) - 1));
  console.log("  csd is worth x" + r[0].toFixed(2) + " a versatility point at 12% crit, and x" + r[1].toFixed(2) + " at 80%.");
  console.log("  That is a x" + (r[1] / r[0]).toFixed(1) + " swing in the value of the SAME stat, decided by class.");
  console.log("");
})();`;
const run = path.join(dir, 'csd.cjs'); fs.writeFileSync(run, js);
require(run);
