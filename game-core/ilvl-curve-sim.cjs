/* What does a hard-mode ilvl actually buy?
 *
 * Item power was linear in ilvl, and a linear curve has a ceiling nobody can tune around: across
 * ilvl 63->70 the ratio is 4.50/4.15 = x1.08, and even an infinitely steep slope only approaches
 * 70/63 = x1.11. The ilvl 64-70 arc costs 1,250 -> 5,000 kills a zone and bought 6% more power.
 *
 * This measures the REAL generateItem / effectiveStats / offlinePlayerDps at every hard-mode
 * bracket, so the numbers describe the shipped curve rather than a re-derivation. To sweep the
 * growth rate, edit ENDGAME_ILVL_GROWTH in game-core/combat.mjs and re-run — each run measures
 * whatever is actually shipped.
 *
 *   node game-core/ilvl-curve-sim.cjs
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-ilvl-'));
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
  const rngm = require("${path.join(__dirname, 'rng.mjs').replace(/\\/g, '/')}");
  const { generateItem, rarityById, LOOT_SLOTS, maxHpFor, effectiveStats, secondaryPcts,
          mitigation, gearStatBase, endgameClimb, ENDGAME_ILVL_GROWTH, ENDGAME_ILVL_FLOOR } = core;
  const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
  const g = (n) => Math.round(n).toLocaleString();
  const SCORED = ["str","agi","int","sta","armor","leech","resil","vers","cdr","csd","crit","haste"];

  console.log("\\n=== THE CURVE AS SHIPPED ===");
  console.log("  gearStatBase = (1 + ilvl x 0.05) x rarityMult x " + ENDGAME_ILVL_GROWTH
    + "^(ilvl - " + ENDGAME_ILVL_FLOOR + ")");
  console.log("  Levelling gear (ilvl <= " + ENDGAME_ILVL_FLOOR + ") is unaffected: the climb term is exactly 1.\\n");

  // --- 1. is levelling really untouched? -------------------------------------------------------
  {
    const linear = (ilvl, ri) => (1 + ilvl * 0.05) * [0.5,0.8,1.2,1.8,2.6,3.8,3.8][ri];
    let same = true;
    for (let ilvl = 1; ilvl <= ENDGAME_ILVL_FLOOR; ilvl++)
      for (let ri = 0; ri < 6; ri++) if (Math.abs(gearStatBase(ilvl, ri) - linear(ilvl, ri)) > 1e-9) same = false;
    console.log("  levelling gear identical to the old curve at every ilvl/rarity: " + (same ? "YES" : "NO"));
  }

  // --- 2. what an ilvl is worth, per bracket ----------------------------------------------------
  console.log("\\n=== ITEM POWER BY BRACKET (400 rolls each, chest, epic) ===");
  console.log(pad("ilvl", 6) + rp("climb x", 9) + rp("raw pts", 9) + rp("vs 63", 8)
    + rp("armor", 8) + rp("wpn dmg", 9));
  const rows = [];
  for (const ilvl of [60, 63, 64, 65, 66, 67, 68, 69, 70, 71]) {
    const N = 400;
    const items = rngm.withRng(rngm.makeRng(ilvl * 17), () =>
      Array.from({ length: N }, () => generateItem(ilvl, rarityById("epic"), "chest", "warrior")));
    const raw = items.reduce((a, it) => a + SCORED.reduce((s, k) => s + (it.stats[k] || 0), 0), 0) / N;
    const armor = items.reduce((a, it) => a + (it.stats.armor || 0), 0) / N;
    const wpn = rngm.withRng(rngm.makeRng(ilvl * 5), () => generateItem(ilvl, rarityById("epic"), "weapon", "warrior"));
    const wd = wpn.wdmg ? (wpn.wdmg.min + wpn.wdmg.max) / 2 : 0;
    rows.push({ ilvl, raw, armor, wd });
    const base = rows.find((r) => r.ilvl === 63);
    console.log(pad(ilvl, 6) + rp("x" + endgameClimb(ilvl).toFixed(2), 9) + rp(raw.toFixed(1), 9)
      + rp(base ? "x" + (raw / base.raw).toFixed(2) : "-", 8) + rp(g(armor), 8) + rp(g(wd), 9));
  }
  const r63 = rows.find((r) => r.ilvl === 63), r70 = rows.find((r) => r.ilvl === 70);
  console.log("\\n  ilvl 63 -> 70 is now x" + (r70.raw / r63.raw).toFixed(2)
    + " raw stat points (it was x1.06, and a linear curve could never exceed x1.11).");

  // --- 3. what that does to a whole character ----------------------------------------------------
  console.log("\\n=== A FULL SET, AT EACH BRACKET ===");
  console.log("A level-60 warrior in a complete epic set at the bracket's ilvl, spec'd, rotation on.\\n");
  console.log(pad("ilvl", 6) + rp("hp", 9) + rp("armor", 8) + rp("mit%", 7) + rp("dps", 9)
    + rp("vs 63", 8) + rp("ehp", 10) + rp("vs 63", 8));
  // One rolled set per bracket is noise — a lucky ilvl-64 set can out-stat an unlucky 66 and make
  // the curve look non-monotonic when it is not. Average 60 independently rolled sets per bracket.
  const buildSet = (ilvl, seed) => rngm.withRng(rngm.makeRng(seed), () => {
    const ch = core.buildBotChar("warrior", "w_berserk", 60, ilvl);
    ch.spec = "w_berserk"; ch = core.armGambits(ch);   // a bar a player can actually build: gambits, not the dead auto-skill flag
    ch.hp = maxHpFor(ch); return ch;
  });
  const chars = [];
  for (const ilvl of [63, 64, 65, 66, 67, 68, 69, 70]) {
    const N = 60;
    let hp = 0, armor = 0, mit = 0, dps = 0, ehp = 0, leech = 0, vers = 0;
    for (let s = 0; s < N; s++) {
      const c = buildSet(ilvl, ilvl * 1000 + s * 13);
      const eff = effectiveStats(c), sp = secondaryPcts(eff);
      const h = maxHpFor(c), m = mitigation(eff.armor, 62);
      hp += h; armor += eff.armor; mit += m; dps += core.offlinePlayerDps(c); ehp += h / (1 - m);
      leech += sp.leech; vers += sp.vers;
    }
    hp /= N; armor /= N; mit /= N; dps /= N; ehp /= N; leech /= N; vers /= N;
    chars.push({ ilvl, hp, armor, mit, dps, ehp, leech, vers });
    const b = chars[0];
    console.log(pad(ilvl, 6) + rp(g(hp), 9) + rp(g(armor), 8) + rp((mit * 100).toFixed(1), 7)
      + rp(g(dps), 9) + rp("x" + (dps / b.dps).toFixed(2), 8) + rp(g(ehp), 10)
      + rp("x" + (ehp / b.ehp).toFixed(2), 8));
  }
  const c63 = chars[0], c70 = chars[chars.length - 1];
  console.log("\\n  Across the climb a character gains x" + (c70.dps / c63.dps).toFixed(2)
    + " damage and x" + (c70.ehp / c63.ehp).toFixed(2) + " effective health.");

  // --- 4. does the hard-mode grind get easier as you climb it? -----------------------------------
  // The whole point of a gear climb is that the content it gates becomes beatable. Hard-zone
  // enemies scale with the zone's enemyLvl, so this compares the two curves directly.
  console.log("\\n=== THE CLIMB AGAINST THE CONTENT IT GATES ===");
  console.log(pad("hard zone", 24) + rp("ilvl", 6) + rp("enemy ehp", 11)
    + rp("sec/kill", 10) + rp("incoming", 10) + rp("bare", 9) + rp("+potions", 10) + rp("verdict", 9));
  const HARD_T = diffTier("hard"), R = ENEMY_RANKS.champion;
  for (const hz of HARD_ZONES) {
    // Reuse the AVERAGED build for this bracket rather than rolling one more set — a single roll
    // put ilvl 64 below ilvl 63 in an earlier run purely on luck.
    const ch = chars.find((x) => x.ilvl === hz.reqIlvl) || chars[chars.length - 1];
    const bz = ZONES.find((z) => z.id === hz.base);
    const names = (bz && bz.enemies) || ["Bandit"];
    let ehpSum = 0, dmgSum = 0;
    for (const nm of names) {
      const cls = dispositionFor(nm);
      const arch = ENEMY_ARCHETYPE[cls] || NEUTRAL_ARCHETYPE;
      const st = enemyStatBlock(hz.enemyLvl, cls, { rank: "champion", tier: "hard" });
      const e = { ...st, level: hz.enemyLvl, cls, isChampion: true };
      const hp = Math.floor((hz.enemyLvl * 26 + 50) * R.hp * HARD_T.hp * 8 * arch.hp);
      ehpSum += hp / (1 - enemyMitigation(e, 60));
      dmgSum += enemyDpsOf(e);
    }
    const ehp = ehpSum / names.length, eDps = dmgSum / names.length;
    const dps = ch.dps;
    const mit = mitigation(ch.armor, hz.enemyLvl);
    const incoming = eDps * (1 - mit) * (1 - ch.vers / 200);
    const leech = dps * (ch.leech / 100);
    const secs = ehp / dps;
    const net = Math.max(0.01, incoming - leech);
    const live = ch.hp / net;
    // The auto-potion is a shipped mechanic a real player has bought, and it only fires below 30%
    // health — so it does not slow the first 70% of the bar, it extends the last 30%. Measuring
    // without it repeats the mistake that made a bare bench look like it could not farm at all.
    const potHps = tierHeal(6) / (POTION_CD / 1000);
    const livePot = 0.7 * ch.hp / net + 0.3 * ch.hp / Math.max(0.01, net - potHps);
    console.log(pad(hz.name, 24) + rp(hz.reqIlvl, 6) + rp(g(ehp), 11)
      + rp(secs.toFixed(1), 10) + rp(g(incoming), 10) + rp(live.toFixed(0) + "s", 9)
      + rp(livePot > 1e4 ? "sustains" : livePot.toFixed(0) + "s", 10)
      + rp(livePot > secs ? "clears" : "dies", 9));
  }
  console.log("\\n  'you live' is seconds before death with no heal but leech — hard zones carry health");
  console.log("  between kills. A bracket only 'clears' if that exceeds the time to kill one champion.");
  console.log("");
})();`;
const run = path.join(dir, 'ilvl.cjs'); fs.writeFileSync(run, js);
require(run);
