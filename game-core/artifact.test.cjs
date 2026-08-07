/* Artifacts are built by makeArtifact in App.jsx, on a path completely separate from generateItem.
 * That separation is why the gear pass silently skipped them: they carried their own secondary
 * pool, their own size table and their own stamina bias, so crit and haste could never roll on an
 * artifact at all, stamina lines came out 21% under every other item, and a weapon ignored its
 * declared csd/crit identity.
 *
 * This drives the REAL makeArtifact and checks it agrees with the shared tables.
 *
 *   node game-core/artifact.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-artifact-'));
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
  const { SECONDARY_POOL, SLOT_SECONDARY, SEC_SIZE, RARITY_STAT_MULT, RARITIES } = core;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  const N = 4000;
  const roll = (slot, cls) => {
    const hit = {}; let lines = 0, dupes = 0, staSum = 0, staN = 0;
    for (let i = 0; i < N; i++) {
      const a = makeArtifact(cls, slot, 60, null);
      const secs = SECONDARY_POOL.filter((k) => (a.stats[k] || 0) > 0);
      lines += secs.length;
      if (new Set(secs).size !== secs.length) dupes++;
      for (const k of secs) hit[k] = (hit[k] || 0) + 1;
      if (a.stats.sta > 0) { staSum += a.stats.sta; staN++; }
    }
    return { hit, lines: lines / N, dupes, sta: staN ? staSum / staN : 0 };
  };

  // --- every secondary must be reachable ------------------------------------------------------
  {
    const r = roll("weapon", "rogue");
    for (const k of SECONDARY_POOL) {
      ok((r.hit[k] || 0) > 0, k + " can roll on an artifact (" + ((r.hit[k] || 0) / N * 100).toFixed(1) + "%)");
    }
  }

  // --- artifacts obey slot identity like every other drop --------------------------------------
  // Artifacts are weapon and off-hand only, and those two slots favour completely different pairs,
  // so this is a real discriminator rather than a formality.
  for (const [slot, cls] of [["weapon", "rogue"], ["offhand", "warrior"]]) {
    const { hit } = roll(slot, cls);
    const fav = SLOT_SECONDARY[slot];
    const favRate = fav.reduce((a, k) => a + (hit[k] || 0), 0) / fav.length / N;
    const off = SECONDARY_POOL.filter((k) => !fav.includes(k));
    const offRate = off.reduce((a, k) => a + (hit[k] || 0), 0) / off.length / N;
    ok(favRate > offRate * 1.8,
       slot + " artifacts favour their own pair (" + fav.join("/") + ") " + (favRate * 100).toFixed(0)
       + "% against " + (offRate * 100).toFixed(0) + "% for an off-stat");
  }
  {
    const w = roll("weapon", "rogue").hit, o = roll("offhand", "warrior").hit;
    ok(w.csd > o.csd && o.resil > w.resil, "a weapon reads as crit-damage gear and an off-hand as guard gear");
  }

  // --- magnitudes come from the shared size table ------------------------------------------------
  {
    const r = roll("weapon", "rogue");
    const rIdx = RARITIES.findIndex((x) => x.id === "artifact");
    // Read the ilvl off a real artifact rather than recomputing it — artifactIlvl is an App.jsx
    // local, and re-deriving it here would be one more copy to drift.
    const ilvl = makeArtifact("rogue", "weapon", 60, null).ilvl;
    const perStat = Math.max(1, Math.round((1 + ilvl * 0.05) * RARITY_STAT_MULT[rIdx]));
    const secBase = Math.max(1, Math.round(perStat * 0.7));
    const expected = Math.max(1, Math.round(secBase * SEC_SIZE.sta));
    ok(Math.abs(r.sta - expected) < 0.5,
       "a stamina line rolls " + r.sta.toFixed(1) + ", matching the shared SEC_SIZE (" + expected + ")");
    ok(SEC_SIZE.sta > 1, "…and that is the bigger stamina roll, not the 1.0 the local copy had");
  }

  // --- structure ---------------------------------------------------------------------------------
  {
    const r = roll("weapon", "rogue");
    ok(r.dupes === 0, "an artifact never rolls the same secondary twice");
    ok(Math.abs(r.lines - 3) < 0.05, "an artifact carries 3 secondary lines (" + r.lines.toFixed(2) + ")");
  }

  // --- re-forging preserves identity --------------------------------------------------------------
  // Artifacts re-forge in place on level-up. If a re-forge re-rolled its secondaries, every level
  // would reshuffle a player's weapon.
  {
    const first = makeArtifact("rogue", "weapon", 40, null);
    const later = makeArtifact("rogue", "weapon", 60, first);
    ok(JSON.stringify(later.shape.secs) === JSON.stringify(first.shape.secs),
       "re-forging at a higher level keeps the same secondaries (" + first.shape.secs.join(", ") + ")");
    ok(later.ilvl > first.ilvl && later.stats[first.shape.secs[0]] > first.stats[first.shape.secs[0]],
       "…while their magnitudes scale with the new ilvl");
  }

  console.log(fail ? "\\n\\u274c " + fail + " artifact check(s) failed"
                   : "\\n\\u2705 artifacts roll through the same shared tables as every other drop");
  process.exit(fail ? 1 : 0);
})();`;
const run = path.join(dir, 'artifact.cjs'); fs.writeFileSync(run, js);
require(run);
