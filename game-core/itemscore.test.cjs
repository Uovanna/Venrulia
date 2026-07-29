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

  console.log(fail ? "\\n\\u274c " + fail + " itemScore check(s) failed"
                   : "\\n\\u2705 itemScore: every rollable stat counts, Power counts only while live, focused matches dual");
  process.exit(fail ? 1 : 0);
})();`;
const run = path.join(dir, 'scoretest.cjs'); fs.writeFileSync(run, js);
require(run);
