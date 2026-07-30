/* rollGem lives in App.jsx, so this uses the transpile harness to test the real function.
 *
 * Gems are described in the source as riding the normal gear drop system. Once gear became
 * zone-scaled they stopped doing so, and gems were quietly becoming MORE common relative to gear
 * exactly where gear was being starved. This checks they now fall on the same curve.
 *
 *   node game-core/gem-drops.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-gem-'));
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
  const { zoneDropScale, ZONE_DROP_MIN } = core;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  const N = 120000;
  const rate = (level, dungeonId) => {
    let n = 0;
    for (let i = 0; i < N; i++) if (rollGem({ level, isBoss: true, dungeonId, dropMult: 1 })) n++;
    return n / N * 100;   // per 100 boss kills
  };

  // --- gems fall on the zone curve --------------------------------------------------------------
  {
    const low = rate(10, null), high = rate(60, null);
    ok(low > high, "an endgame boss drops gems less often than a starter-zone boss (" + low.toFixed(1) + " vs " + high.toFixed(1) + " per 100)");
    const ratio = high / low, expected = zoneDropScale(60) / zoneDropScale(10);
    ok(Math.abs(ratio - expected) < 0.06,
       "…by the same factor gear uses (" + ratio.toFixed(2) + " against zoneDropScale's " + expected.toFixed(2) + ")");
    ok(high > 1, "the endgame still drops gems — starved, not closed (" + high.toFixed(1) + " per 100 boss kills)");

    let prev = Infinity;
    for (const lvl of [10, 20, 30, 45, 55, 60]) {
      const r = rate(lvl, null);
      ok(r <= prev + 0.15, "level " + lvl + " is no more generous than the level below it (" + r.toFixed(1) + ")");
      prev = r;
    }
  }

  // --- the shape of the drop is otherwise unchanged ----------------------------------------------
  {
    ok(rollGem({ level: 60, isBoss: false, dungeonId: null, dropMult: 1 }) === null,
       "open-world trash still never drops gems");
    const dungeon = rate(60, "deadmines"), open = rate(60, null);
    ok(dungeon > open, "a dungeon boss still drops gems more often than an open-world boss (" + dungeon.toFixed(1) + " vs " + open.toFixed(1) + ")");
    // Unlike gear, the raid is NOT exempt: that exemption exists only to keep the ilvl-64 bridge
    // to hard mode open, and gems are not part of that bridge.
    const raid = rate(60, "moltencore");
    ok(raid < rate(10, "moltencore"), "the raid is scaled too — it is not the gem bridge to hard mode");
  }

  console.log(fail ? "\\n\\u274c " + fail + " gem drop check(s) failed"
                   : "\\n\\u2705 gems ride the same zone curve as gear");
  process.exit(fail ? 1 : 0);
})();`;
const run = path.join(dir, 'gem.cjs'); fs.writeFileSync(run, js);
require(run);
