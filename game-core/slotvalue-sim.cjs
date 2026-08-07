/* What is a gear SLOT actually worth?
 *
 * Measures the marginal contribution of each equipment slot to damage and survivability using
 * the game's own formulas (effectiveStats / offlinePlayerDps / maxHpFor / mitigation), by
 * equipping one slot at a time onto an otherwise-naked character of the same level.
 *
 *   node game-core/slotvalue-sim.cjs [ilvl] [samples]
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const ILVL = Number(process.argv[2]) || 60;
const N = Number(process.argv[3]) || 4000;

const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-slot-'));
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
  const ILVL = ${ILVL}, N = ${N};
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const { LOOT_SLOTS, generateItem, effectiveStats, offlinePlayerDps, maxHpFor, mitigation,
          rarityById, createCharacter, ARMOR_SLOT_WEIGHT } = core;
  const pad = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);

  const CLS = "warrior", LEVEL = 60;
  const naked = (() => { const c = createCharacter("Bench", CLS, "human"); c.level = LEVEL;
    for (const k in c.equipment) c.equipment[k] = null; return c; })();

  // Survivability in one number: effective HP against a same-level attacker, i.e. how much raw
  // damage you can absorb once armour mitigation is applied.
  const ehp = (c) => maxHpFor(c) / (1 - mitigation(effectiveStats(c).armor || 0, LEVEL));
  const baseDps = offlinePlayerDps(naked), baseEhp = ehp(naked);

  const rar = rarityById("rare");
  console.log("\\nMARGINAL VALUE OF ONE SLOT — ilvl " + ILVL + ", rare, level " + LEVEL + " " + CLS
    + ", " + N.toLocaleString() + " rolls per slot");
  console.log("Naked baseline: " + Math.round(baseDps) + " dps, " + Math.round(baseEhp) + " ehp\\n");

  const header = pad("slot", 11) + rpad("+dps", 9) + rpad("+dps%", 8) + rpad("+ehp", 9) + rpad("+ehp%", 8)
    + rpad("armor", 8) + rpad("mainstat", 10) + rpad("armorW", 8);
  console.log(header); console.log("-".repeat(header.length));

  const rows = [];
  for (const s of LOOT_SLOTS) {
    let dDps = 0, dEhp = 0, arm = 0, main = 0;
    for (let i = 0; i < N; i++) {
      const it = generateItem(ILVL, rar, s.id, CLS);
      const c = { ...naked, equipment: { ...naked.equipment, [s.id]: it } };
      dDps += offlinePlayerDps(c) - baseDps;
      dEhp += ehp(c) - baseEhp;
      arm += (it.stats && it.stats.armor) || 0;
      main += ["str", "agi", "int", "sta"].reduce((a, k) => a + ((it.stats && it.stats[k]) || 0), 0);
    }
    const r = { slot: s.id, dps: dDps / N, ehp: dEhp / N, armor: arm / N, main: main / N };
    rows.push(r);
    console.log(pad(s.id, 11) + rpad(r.dps.toFixed(1), 9) + rpad((r.dps / baseDps * 100).toFixed(1) + "%", 8)
      + rpad(Math.round(r.ehp), 9) + rpad((r.ehp / baseEhp * 100).toFixed(1) + "%", 8)
      + rpad(Math.round(r.armor), 8) + rpad(r.main.toFixed(1), 10)
      + rpad(ARMOR_SLOT_WEIGHT[s.id] ?? "-", 8));
  }

  // How far apart are the slots really? Spread tells you whether a slot is a decision or a number.
  const nonWeapon = rows.filter((r) => r.slot !== "weapon");
  const span = (key) => {
    const v = nonWeapon.map((r) => r[key]).sort((a, b) => a - b);
    return { lo: v[0], hi: v[v.length - 1], ratio: v[v.length - 1] / (v[0] || 1) };
  };
  const d = span("dps"), e = span("ehp");
  console.log("\\nSPREAD ACROSS NON-WEAPON SLOTS");
  console.log("  damage:        " + d.lo.toFixed(1) + " .. " + d.hi.toFixed(1) + " dps  (x" + d.ratio.toFixed(2) + ")");
  console.log("  survivability: " + Math.round(e.lo) + " .. " + Math.round(e.hi) + " ehp  (x" + e.ratio.toFixed(2) + ")");
  const w = rows.find((r) => r.slot === "weapon");
  if (w) console.log("  weapon vs best armour slot: " + w.dps.toFixed(1) + " vs " + d.hi.toFixed(1)
    + " dps  (x" + (w.dps / (d.hi || 1)).toFixed(1) + ")");

  // Are the STAT rolls slot-dependent at all, or only the armour term?
  console.log("\\nMAIN-STAT ROLL BY SLOT (the part that drives damage)");
  const mains = rows.map((r) => r.main.toFixed(1));
  console.log("  " + rows.map((r) => r.slot + "=" + r.main.toFixed(1)).join("  "));
  const uniq = new Set(mains.map((m) => Math.round(Number(m))));
  console.log("  distinct rounded values: " + uniq.size + (uniq.size <= 2 ? "  → main stats are effectively slot-INDEPENDENT" : ""));
  console.log("");
})();`;
const run = path.join(dir, 'slot.cjs'); fs.writeFileSync(run, js);
require(run);
