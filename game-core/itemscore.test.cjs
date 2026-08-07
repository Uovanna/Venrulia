/* itemScore drives the ▲/▼ upgrade label, auto-equip, and auto-sell. It lives in App.jsx rather
 * than the core, so this uses the same transpile harness the simulators do in order to test the
 * REAL function instead of a copy of it.
 *
 *   node game-core/itemscore.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-scoretest-'));
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
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const { SECONDARY_POOL, POWER_PER_STAT } = core;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  const ILVL = 63, PER = 11, POWER = Math.round(PER * POWER_PER_STAT);
  const mk = (over, mains) => ({ id: "x", name: "Bench", slotId: "chest", icon: "", rarity: "epic",
    ilvl: ILVL, value: 1, enchant: null, wdmg: null, sockets: [],
    mains: mains || [],
    stats: Object.assign({ str:0,agi:0,int:0,sta:0,armor:0,dmg:0,leech:0,resil:0,vers:0,cdr:0,csd:0,crit:0,haste:0,ap:0,sp:0 }, over) });

  // --- every scored stat actually scores -----------------------------------------------------
  {
    for (const k of SECONDARY_POOL) {
      const w = statWeight("warrior", k);
      ok(w > 0, k + " has a non-zero weight (it is a rollable secondary, so scoring it at 0 makes it invisible to auto-sell)");
    }
    for (const k of ["str", "agi", "int", "ap", "sp"]) ok(statWeight("warrior", k) > 0, k + " has a non-zero weight");
    // The defect this replaced: crit and haste were added to SCORE_STATS in step 0 but never
    // given a weight, so statWeight fell through to its final "return 0".
    const base = mk({});
    for (const k of SECONDARY_POOL) {
      ok(itemScore(mk({ [k]: 20 }), "warrior") > itemScore(base, "warrior"), "20 " + k + " makes an item score higher");
    }
  }

  // --- Power is counted, and only while it is live ---------------------------------------------
  {
    const focused = mk({ str: PER, ap: POWER }, ["str"]);
    const bare    = mk({ str: PER }, ["str"]);
    ok(itemScore(focused, "warrior") > itemScore(bare, "warrior"),
       "Attack Power raises an item's score (it was worth exactly nothing before)");

    // A point of Power is 1/1.4 of a main stat because damage converts them at x1.4 and x1.0.
    const gain = itemScore(focused, "warrior") - itemScore(bare, "warrior");
    ok(Math.abs(gain / POWER - 0.7) < 1e-9, "…priced at 0.7 per point, measured at 0.716 across six classes");

    // Dormant Power must score zero, or the score RISES as the piece gets worse.
    const disarmed = mk({ str: PER, agi: 6, ap: POWER }, ["str", "agi"]);
    const disarmedNoPower = mk({ str: PER, agi: 6 }, ["str", "agi"]);
    ok(itemScore(disarmed, "warrior") === itemScore(disarmedNoPower, "warrior"),
       "a second main stat puts Power dormant, and the score stops counting it");
    ok(itemScore(disarmed, "warrior") < itemScore(focused, "warrior") + 6,
       "…so adding a main stat to a focused piece cannot look like a pure gain");
  }

  // --- focused vs dual, which is what started this ---------------------------------------------
  {
    // Measured in combat at level 60 / ilvl 63: focused is +2.6% dps for a warrior, +0.6% for a
    // mage, +0.0% for a rogue. It used to score 10.3% WORSE than dual in every case.
    const focused = mk({ str: PER, ap: POWER }, ["str"]);
    const dual    = mk({ str: PER, agi: PER }, ["str", "agi"]);
    const r = itemScore(focused, "warrior") / itemScore(dual, "warrior");
    // itemScore is an ORDINAL proxy, not a dps predictor: it is a weighted sum sitting on top of a
    // flat ilvl term, so it will never track a dps ratio point for point. What has to be true is
    // that it ranks the two the same way combat does. Measured, focused is +1.8% dps for a warrior
    // and scores +6.3%; before Power was counted at all it scored 10.3% BEHIND while still being
    // ahead in combat, which is the failure this replaced.
    ok(r > 1 && r < 1.15,
       "a focused piece now outranks an equivalent dual piece, as it does in combat, ratio " + r.toFixed(3));
    ok(itemScore(mk({ str: PER, ap: POWER }, ["str"]), "rogue") < itemScore(mk({ agi: PER, ap: POWER }, ["agi"]), "rogue"),
       "…and the ranking is per class: a rogue prefers the Agility piece over the Strength one");
  }

  // --- the property that makes the label trustworthy ---------------------------------------------
  {
    // Nothing an item can carry may be worth negative score, or auto-sell starts vendoring gear
    // for having stats on it.
    const base = itemScore(mk({}), "warrior");
    for (const k of ["str","agi","int","sta","armor","leech","resil","vers","cdr","csd","crit","haste"]) {
      ok(itemScore(mk({ [k]: 15 }), "warrior") >= base, k + " never lowers a score");
    }
  }

  // --- the secondary weights match what the combat code does -----------------------------------
  // These were hand-set and had drifted by up to 2.6x (crit damage measured 1.03 and was priced at
  // 0.4). They are now measured, so this re-measures them and fails if the table drifts again.
  {
    const { buildBotChar, offlinePlayerDps } = core;
    const rngm = require("${path.join(__dirname, 'rng.mjs').replace(/\\/g, '/')}");
    // The same twelve seeds the calibration uses. Stats sitting near their soft cap have a
    // marginal value that depends on how much of them the gear already rolled — versatility reads
    // 0.55 on six seeds and 0.68 on twelve, a uniform shift across every class rather than noise —
    // so the sample has to match or the test and the tool disagree by construction.
    const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 101, 202, 303];
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // The same six classes the calibration script uses. A smaller sample reads differently
    // (versatility measures 0.54 on three classes against 0.68 on six), and a test that disagrees
    // with the tool the numbers came from is worse than no test.
    const SCALES_OFF = { warrior: "str", rogue: "agi", hunter: "agi", paladin: "int", mage: "int", warlock: "int" };
    const SPECS = { warrior: "w_berserk", rogue: "r_ambush", hunter: "h_snipe",
                    paladin: "p_just", mage: "m_fire", warlock: "l_scorch" };
    const armed = (cls, sd) => rngm.withRng(rngm.makeRng(sd), () => {
      let c = buildBotChar(cls, SPECS[cls], 60, 63); c.spec = SPECS[cls];
      c = core.armGambits(c);   // a bar a player can actually build: gambits, not the dead auto-skill flag
      c.equipment.chest = { ...c.equipment.chest, stats: { ...c.equipment.chest.stats, ap: 0, sp: 0 } };
      return c;
    });
    const gain = (cls, stat, amt) => mean(SEEDS.map((sd) => {
      const b = armed(cls, sd), d0 = offlinePlayerDps(b);
      const k = JSON.parse(JSON.stringify(b));
      k.equipment.chest.stats[stat] = (k.equipment.chest.stats[stat] || 0) + amt;
      return offlinePlayerDps(k) / d0 - 1;
    }));
    // In units of one point of the class's OWN scaling stat, averaged over classes. Using one
    // class's Strength as the unit would be wrong: it is worth 0.00% to a rogue.
    for (const stat of ["csd", "vers", "crit", "cdr", "haste"]) {
      const measured = mean(Object.keys(SPECS).map((cls) => gain(cls, stat, 30) / gain(cls, SCALES_OFF[cls], 30)));
      const w = statWeight("warrior", stat);
      ok(Math.abs(w - measured) < 0.15,
         stat + " is priced " + w + " against a measured " + measured.toFixed(2) + " per point");
    }
    // Weapon damage and Power enter computeDamage identically, so they must be priced identically.
    ok(statWeight("warrior", "dmg") === statWeight("warrior", "ap"),
       "weapon damage and Attack Power are priced the same — they are the same flat addition");
  }

  // --- the temper shop's reroll cannot stack a stat onto a line that already has it -------------
  // rerollLine itself lives inside the React component and cannot be called here, but everything it
  // touches is module-level. This runs the same sequence — ensureTemperData, the exclusion the
  // reroll uses, then syncItemStats — and checks the invariant that motivated the change: a stat
  // landing twice would silently SUM into one larger line rather than reading as a second one.
  {
    // generateItem/pickSlotSecondary are IMPORTED by App.jsx, so in the transpiled module they are
    // not bare locals — only App.jsx's own definitions are. Take them from the core.
    const { rarityById, generateItem, pickSlotSecondary } = core;
    let collisions = 0, nulls = 0;
    for (let i = 0; i < 600; i++) {
      const it = ensureTemperData(generateItem(63, rarityById("legendary"), "chest", "warrior"));
      if (!Array.isArray(it.lines) || !it.lines.length) { nulls++; continue; }
      const idx = i % it.lines.length;
      const taken = it.lines.map((l) => l.stat);
      const picked = pickSlotSecondary(it.slotId, taken) || pickSlotSecondary(it.slotId, [it.lines[idx].stat]);
      if (picked == null) { nulls++; continue; }
      it.lines[idx].stat = picked;
      syncItemStats(it);
      // After the reroll every line must still be its own stat.
      if (new Set(it.lines.map((l) => l.stat)).size !== it.lines.length) collisions++;
    }
    ok(collisions === 0, "600 rerolls on 4-line items produced no duplicated line (" + collisions + " collisions)");
    ok(nulls === 0, "…and the exclusion always left a legal stat to pick (" + nulls + " fallbacks)");
  }

  console.log(fail ? "\\n\\u274c " + fail + " itemScore check(s) failed"
                   : "\\n\\u2705 itemScore: every rollable stat counts, Power counts only while live, focused matches dual");
  process.exit(fail ? 1 : 0);
})();`;
const run = path.join(dir, 'scoretest.cjs'); fs.writeFileSync(run, js);
require(run);
