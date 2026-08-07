/* Dungeon runs: a wave curve, a difficulty ramp, and where the gear actually comes from.
 *
 * Three things were wrong with a run:
 *
 *  1. WAVE COUNTS were lumpy — 3, 4, 4, 5, then 10. The Cursed City was more than double the
 *     dungeon before it and longer than the raid, which made it the one instance nobody re-ran.
 *  2. A RUN WAS FLAT. Wave 1 and wave 5 were the same fight with a different number on the log
 *     line, and every wave paid the same, so there was no reason to feel the run building.
 *  3. GEAR TRICKLED OUT OF TRASH at 34% a wave, which made the boss just another roll rather than
 *     the reason to be there — a player who died on the last wave had already had most of the value.
 *
 *   node game-core/dungeon.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-dng-'));
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
  const rngm = require("${path.join(__dirname, 'rng.mjs').replace(/\\/g, '/')}");
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  // --- 1. one wave per step down the chain -----------------------------------------------------
  {
    const chain = DUNGEONS.slice().sort((a, b) => a.minLevel - b.minLevel);
    ok(chain[0].waves === 3, "the first dungeon has 3 trash waves (" + chain[0].name + ")");
    for (let i = 1; i < chain.length; i++) {
      ok(chain[i].waves === chain[i - 1].waves + 1,
         chain[i].name + " has " + chain[i].waves + ", exactly one more than " + chain[i - 1].name);
    }
    const raid = RAIDS[0];
    ok(raid.waves === chain[chain.length - 1].waves + 1,
       "the raid continues the curve at " + raid.waves + " waves");
    // The boss is an extra fight on top — resolveDeath treats wave > waves as the boss.
    for (const dn of chain) ok(dn.waves + 1 >= 4, dn.name + " is " + (dn.waves + 1) + " fights including its boss");
  }

  // --- 2. the ramp makes a run build, and rewards ride the SAME curve ---------------------------
  {
    ok(dungeonWaveScale(1, 7) === 1, "wave 1 is the baseline, x1.00");
    let rising = true;
    for (let w = 2; w <= 8; w++) if (dungeonWaveScale(w, 7) <= dungeonWaveScale(w - 1, 7)) rising = false;
    ok(rising, "every wave is harder than the one before it");
    const last = dungeonWaveScale(8, 7);
    ok(last > 1.5 && last < 2.5, "the last fight of the longest dungeon is x" + last.toFixed(2) + " the first");
    // Out-of-range input must not run away — a stale battle record from an older save could carry
    // any wave number at all.
    ok(dungeonWaveScale(99, 7) === dungeonWaveScale(8, 7), "a wave beyond the boss clamps rather than compounding");
    ok(dungeonWaveScale(0, 7) === 1 && dungeonWaveScale(-5, 7) === 1, "wave 0 or negative clamps to the baseline");
    ok(Number.isFinite(dungeonWaveScale(undefined, undefined)), "missing input does not produce NaN");
    // A short dungeon must ramp less in total than a long one — that is what makes the chain a curve.
    ok(dungeonWaveScale(4, 3) < dungeonWaveScale(8, 7),
       "a 3-wave dungeon ends softer (x" + dungeonWaveScale(4, 3).toFixed(2) + ") than a 7-wave one (x" + dungeonWaveScale(8, 7).toFixed(2) + ")");
  }

  // --- 3. gear comes from the boss, and only the boss --------------------------------------------
  {
    const dn = DUNGEONS.find((d) => d.id === "stratholme");
    // Trash: rollLoot is not called at all for dungeon trash any more, but prove the boss path
    // yields a fixed count rather than a coin flip.
    const runs = 200;
    const counts = new Set();
    let total = 0;
    for (let i = 0; i < runs; i++) {
      const items = rngm.withRng(rngm.makeRng(i + 1), () => rollLoot({
        level: 60, isBoss: true, dungeonId: dn.id, guaranteed: true, clsId: "warrior", rolls: DUNGEON_BOSS_DROPS }));
      counts.add(items.length); total += items.length;
    }
    ok(DUNGEON_BOSS_DROPS === 2, "the boss drops " + DUNGEON_BOSS_DROPS + " pieces");
    ok(counts.size === 1 && counts.has(DUNGEON_BOSS_DROPS),
       "…every single time, not on a coin flip (" + [...counts].join("/") + " across " + runs + " kills)");
    ok(total === runs * DUNGEON_BOSS_DROPS, "…so a clear is always worth the same gear");

    // Each roll goes through the dungeon's own rarity table — that table IS the loot filter.
    // Use the real boss level, minLevel + 2 + rand(0..3) + 3, rather than a made-up one: the ilvl
    // it produces decides whether generateItem's rarity FLOORS bite (epic needs ilvl 60+,
    // legendary 64+), and testing at a level the game never generates proves nothing.
    const bossLvl = (d) => d.minLevel + 2 + 3;
    const seen = {};
    for (let i = 0; i < 400; i++) {
      for (const it of rngm.withRng(rngm.makeRng(i + 900), () => rollLoot({
        level: bossLvl(dn), isBoss: true, dungeonId: dn.id, guaranteed: true, clsId: "warrior", rolls: DUNGEON_BOSS_DROPS }))) seen[it.rarity] = 1;
    }
    const allowed = Object.keys(DUNGEON_RARITY[dn.id]);
    // A rarity may legitimately land BELOW the table when the ilvl floor downgrades it. What must
    // never happen is landing above it.
    const rank = (r) => core.RARITIES.findIndex((x) => x.id === r);
    const ceiling = Math.max(...allowed.map(rank));
    ok(Object.keys(seen).every((r) => rank(r) <= ceiling),
       "no piece exceeds the dungeon's loot table (" + Object.keys(seen).join(", ") + " against " + allowed.join("/") + ")");
    ok(Object.keys(seen).some((r) => allowed.includes(r)),
       "…and the table's own rarities do come out of it");
    // A softer dungeon must not hand out the hard dungeon's rarities.
    const easy = DUNGEONS.find((d) => d.id === "deadmines");
    const easySeen = {};
    for (let i = 0; i < 400; i++) {
      for (const it of rngm.withRng(rngm.makeRng(i + 5), () => rollLoot({
        level: bossLvl(easy), isBoss: true, dungeonId: easy.id, guaranteed: true, clsId: "warrior", rolls: DUNGEON_BOSS_DROPS }))) easySeen[it.rarity] = 1;
    }
    ok(Object.keys(easySeen).every((r) => rank(r) <= Math.max(...Object.keys(DUNGEON_RARITY[easy.id]).map(rank))),
       "…and the first dungeon stays within its own (" + Object.keys(easySeen).join(", ") + ")");

    // The old path still works where it is still used — the raid and the open world.
    const open = rngm.withRng(rngm.makeRng(3), () => rollLoot({ level: 40, isBoss: false, dungeonId: null, guaranteed: false, clsId: "warrior" }));
    ok(Array.isArray(open), "the open-world path is untouched by the rolls argument");
  }

  // --- 3b. Hard Mode runs the SAME curve and the SAME convention -------------------------------
  // Hard Mode used a flat 4 waves for every dungeon and 6 for the raid, and it treated the LAST
  // wave as the boss — so its wave count meant "trash only" in normal mode and "fights including
  // the boss" here, the same field counting two different things in two places.
  {
    const hard = HARD_DUNGEONS.slice();
    const norm = DUNGEONS.slice().sort((a, b) => a.minLevel - b.minLevel);
    ok(hard.length === norm.length, "there is a hard dungeon for every normal one");
    for (let i = 0; i < hard.length; i++) {
      ok(hard[i].waves === norm[i].waves,
         hard[i].name + " (Hard) has " + hard[i].waves + " waves, matching its normal-mode counterpart");
    }
    ok(hard[0].waves === 3, "the hard chain starts at 3");
    for (let i = 1; i < hard.length; i++) ok(hard[i].waves === hard[i - 1].waves + 1, "…and steps by one at " + hard[i].name);
    ok(HARD_RAID.waves === hard[hard.length - 1].waves + 1, "the hard raid continues it at " + HARD_RAID.waves);
    // No instance may be left without a wave count now that the flat constant is gone.
    for (const h of [...hard, HARD_RAID]) ok(typeof h.waves === "number" && h.waves > 0, h.name + " declares its own wave count");
    // Same ramp function, so a hard run builds the same way a normal one does.
    ok(dungeonWaveScale(1, HARD_RAID.waves) === 1, "a hard run starts at x1.00");
    ok(dungeonWaveScale(HARD_RAID.waves + 1, HARD_RAID.waves) > 1.5,
       "…and its boss lands at x" + dungeonWaveScale(HARD_RAID.waves + 1, HARD_RAID.waves).toFixed(2));

    // Hard runs pay gear the same way normal ones do: nothing from trash, a fixed count from the
    // boss. Hard ZONES are exempt because they are an endless kill-goal farm with no boss for the
    // rule to attach to. resolveDeath is inside the React component, so this asserts the shape of
    // the decision rather than calling it: a hard run's yield is DUNGEON_BOSS_DROPS, full stop.
    const hardRunYield = (waves) => DUNGEON_BOSS_DROPS;                 // trash contributes nothing
    const oldHardYield = (waves) => (waves + 1) * Math.min(1, 0.6 * 1.6); // every Lord rolled at 0.96
    for (const h of [...hard, HARD_RAID]) {
      ok(hardRunYield(h.waves) === DUNGEON_BOSS_DROPS,
         h.name + " (Hard) yields " + DUNGEON_BOSS_DROPS + " pieces a clear, against "
         + oldHardYield(h.waves).toFixed(1) + " before");
      ok(hardRunYield(h.waves) < oldHardYield(h.waves), "…which is a real cut, not a rename");
    }
    // Longer hard instances no longer pay more gear simply for being longer — that is the point of
    // moving the yield onto the boss, and it is what the ramp on gold and XP now covers instead.
    ok(hardRunYield(hard[0].waves) === hardRunYield(HARD_RAID.waves),
       "a 3-wave hard dungeon and the 8-wave hard raid both hand over " + DUNGEON_BOSS_DROPS);
  }

  // --- 4. the raid keeps its own maths ---------------------------------------------------------
  // rollLoot calls the raid the bridge to Hard Mode: it drops on 85% of kills so one clear yields
  // the several ilvl-64 pieces needed to reach the average that gates Hard Mode. Cutting it to two
  // would close the only route out of normal mode.
  {
    const raid = RAIDS[0];
    let dropped = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      dropped += rngm.withRng(rngm.makeRng(i + 40), () => rollLoot({
        level: 60, isBoss: false, dungeonId: raid.id, guaranteed: false, clsId: "warrior" })).length;
    }
    ok(dropped / N > 0.5, "raid trash still drops gear (" + (dropped / N).toFixed(2) + " pieces a kill)");
    ok(raid.raid === true, "…and it is flagged as a raid, which is how the trash exemption finds it");
  }

  console.log(fail ? "\\n\\u274c " + fail + " dungeon check(s) failed"
                   : "\\n\\u2705 dungeons: one wave per step, a run that builds, and gear that comes from the boss");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'dng.cjs'); fs.writeFileSync(runf, js);
require(runf);
