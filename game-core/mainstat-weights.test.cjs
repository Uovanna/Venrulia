/* MAIN_WEIGHTS in App.jsx prices each main stat per class, and those numbers came from measuring
 * the combat code. A hand-written table copied from a measurement is exactly the thing that goes
 * stale silently, so this re-measures and fails if the two have drifted apart.
 *
 *   node game-core/mainstat-weights.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-mainw-'));
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

js += `
;(function(){
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const rngm = require("${path.join(__dirname, 'rng.mjs').replace(/\\/g, '/')}");
  const { buildBotChar, offlinePlayerDps } = core;
  const { withRng, makeRng } = rngm;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };
  const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 101, 202, 303];
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // buildBotChar rolls random gear, so build ONE character per seed and clone it per variant —
  // calling it again per variant compares two different characters and reports pure noise.
  const armed = (cls, spec, sd) => withRng(makeRng(sd), () => {
    let c = buildBotChar(cls, spec, 60, 63); c.spec = spec;
    c = core.armGambits(c);   // a bar a player can actually build: gambits, not the dead auto-skill flag
    // Adding a main stat to a FOCUSED piece puts its Power affix dormant, which reads as a stat
    // being worth negative dps and has nothing to do with the stat itself.
    c.equipment.chest = { ...c.equipment.chest, stats: { ...c.equipment.chest.stats, ap: 0, sp: 0 } };
    return c;
  });
  const gain = (cls, spec, stat) => mean(SEEDS.map((sd) => {
    const b = armed(cls, spec, sd), d0 = offlinePlayerDps(b);
    let c = JSON.parse(JSON.stringify(b));
    c.equipment.chest.stats[stat] = (c.equipment.chest.stats[stat] || 0) + 30;
    return offlinePlayerDps(c) / d0 - 1;
  }));

  const SPECS = { warrior: "w_berserk", rogue: "r_ambush", hunter: "h_snipe",
                  paladin: "p_just", mage: "m_fire", warlock: "l_scorch" };
  console.log("  class      stat   measured   weight   (ratio to the class's best stat)");
  for (const cls of Object.keys(SPECS)) {
    const spec = SPECS[cls];
    const g = { str: gain(cls, spec, "str"), agi: gain(cls, spec, "agi"), int: gain(cls, spec, "int") };
    const best = Math.max(g.str, g.agi, g.int);
    for (const stat of ["str", "agi", "int"]) {
      const ratio = best > 0 ? g[stat] / best : 0;
      const w = statWeight(cls, stat);
      // A stat the class cannot use measures ~0 and is deliberately floored, so only assert the
      // floor there. Everywhere else the weight must track the measurement.
      const floored = ratio < 0.2;
      const pass = floored ? w <= 0.2 : Math.abs(w - ratio) < 0.2;
      console.log("    " + cls.padEnd(9) + stat.padEnd(6)
        + (ratio * 100).toFixed(0).padStart(7) + "%" + String(w).padStart(9)
        + (pass ? "" : "   <- DRIFTED"));
      if (!pass) fail++;
    }
    // Whatever a class scales off must be its highest-weighted main stat, or the label points the
    // wrong way for the item that matters most.
    const bestStat = ["str", "agi", "int"].reduce((a, k) => (g[k] > g[a] ? k : a), "str");
    ok(statWeight(cls, bestStat) >= Math.max(...["str", "agi", "int"].map((k) => statWeight(cls, k))),
       cls + ": its best stat in combat (" + bestStat + ") is also its highest-weighted one");
  }

  // The property the whole change exists for: a piece carrying a stat the class cannot use must
  // score below one carrying the stat it scales off.
  ok(statWeight("rogue", "agi") > statWeight("rogue", "str"), "a rogue values Agility over Strength");
  ok(statWeight("warrior", "str") > statWeight("warrior", "agi"), "a warrior values Strength over Agility");
  ok(statWeight("mage", "int") > statWeight("mage", "str"), "a mage values Intellect over Strength");
  ok(statWeight("nonesuch", "str") > 0, "an unknown class still scores main stats rather than zeroing them");

  console.log(fail ? "\\n\\u274c " + fail + " main-stat weight check(s) failed"
                   : "\\n\\u2705 main-stat weights match what the combat code actually does");
  process.exit(fail ? 1 : 0);
})();`;
const run = path.join(dir, 'mainw.cjs'); fs.writeFileSync(run, js);
require(run);
