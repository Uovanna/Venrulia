/* Offline progression has to be the SAME GAME as live progression.
 *
 * simulateOffline is a closed-form approximation of the live combat tick, and it had drifted from
 * it in three ways that all pushed the same direction — offline was easier and paid more:
 *
 *   1. Offline paid a per-kill wage, exactly as playing does, and a parked character kills far more
 *      than a played one — twelve hours in a hard zone came to 836,518 gold. Giving offline
 *      resolveDeath's 95% max-level cut fixed the arithmetic without fixing that. Gold and XP are
 *      now a flat hourly tranche instead, which is the ONE thing offline deliberately does not
 *      share with live. Section 1 pins that so nobody restores the wage in the name of parity.
 *   2. Offline enemy damage came from the legacy per-level curve while live combat derives it from
 *      a stat block. The two were a flat 27% apart at EVERY level, and offline modelled
 *      auto-attacks only — enemies never cast.
 *   3. Offline enemies had no archetype health and no armor, so they were creatures that exist
 *      nowhere in the live game.
 *
 * Fixing 2 and 3 without also giving offline the auto-potion the live tick drinks would have
 * replaced one asymmetry with its mirror image, so that is asserted here too.
 *
 *   node game-core/offline-parity.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-offpar-'));
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
  const { maxHpFor, enemyDamageForLevel } = core;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };
  const HOUR = 3600 * 1000;

  // One character definition, cloned per case, so a difference between runs is the thing under
  // test and never a different randomly-rolled character.
  const bench = (level, opts) => rngm.withRng(rngm.makeRng(4242), () => {
    let c = core.buildBotChar("warrior", "w_berserk", level, 60);
    c.level = level; c.spec = "w_berserk"; c.gold = 0; c.race = "human";
    c = core.armGambits(c);   // a bar a player can actually build: gambits, not the dead auto-skill flag
    c.offlineZoneId = getZoneForLevel(level).id;
    c.upgrades = { autoPotion: !!(opts && opts.pots) };
    c.consumables = (opts && opts.pots) ? { [conKey("heal", 6)]: 100000 } : {};
    c.hp = maxHpFor(c);
    return c;
  });
  const run = (c, hours) => rngm.withRng(rngm.makeRng(99), () => simulateOffline(c, (hours || 10) * HOUR));

  // --- 1. offline pays by the hour, and by less than playing ---------------------------------------
  {
    // This section used to assert that resolveDeath's 95% max-level cut reached the offline per-kill
    // reward. Offline HAS no per-kill reward any more: giving it the cut fixed the arithmetic but
    // not the problem, because a parked character kills so many things that even a cut wage came to
    // 836,518 gold in twelve hours. Gold and XP are now a flat hourly tranche.
    //
    // That is a deliberate divergence from live, and this is where it is pinned so that nobody
    // "restores parity" by putting the wage back. Everything else about the stint still has to match
    // the live game — the enemies, the damage, the potions, the drops — and sections 2 onward are
    // unchanged. Only the money is rationed.
    const r = run(bench(MAX_LEVEL, { pots: true }), 10);
    ok(!!r && r.kills > 100, "a max-level run produces a usable sample (" + (r ? r.kills.toLocaleString() : 0) + " kills)");
    ok(r.goldGained === IDLE.goldPerHour.zone * 10,
       "ten parked hours pay ten tranches (" + r.goldGained.toLocaleString() + "g), whatever happened in them");
    ok(r.xpGained === IDLE.xpPerHour.zone * 10, "…and ten tranches of experience (" + r.xpGained.toLocaleString() + ")");

    // The load-bearing comparison: PLAYING must beat PARKING. A live max-level kill in a normal zone
    // pays its base gold cut by 95%, and even against that floor the parked rate per kill is lower.
    const gpk = r.goldGained / Math.max(1, r.kills);
    const base = Math.floor(Math.floor(Math.floor(MAX_LEVEL + 3) * 1.1) * 0.25);
    ok(gpk < base * 0.05, "a parked kill is worth " + gpk.toFixed(2) + "g against the " + (base * 0.05).toFixed(2)
       + "g the same kill pays live at the 95% max-level cut — playing beats parking");
    // XP: at max level surplus XP is redirected into Honor, so the tranche still feeds progression.
    ok(r.char.honor > 0 || r.char.honorXp > 0, "XP at max level feeds Honor rather than vanishing");
  }

  // --- 2. offline fights the same creature live does ----------------------------------------------
  {
    const zone = ZONES.find((z) => z.id === getZoneForLevel(60).id);
    const prof = zoneEnemyProfile(zone, 60);
    ok(prof.hpMult > 0 && prof.hpMult < 1.0,
       "offline enemies carry the archetype health multiplier (x" + prof.hpMult.toFixed(3) + "), not a flat 1.0");
    ok(prof.mit > 0, "…and armoured archetypes turn " + (prof.mit * 100).toFixed(1)
       + "% of a player's blow offline, as they do live");

    // The legacy curve is what offline USED to run on. It is still exported and still used by the
    // group-content path, so the assertion is that offline no longer agrees with it.
    const legacyDps = enemyDamageForLevel(60) * enemyAutoMult(60) / (ENEMY_BASE_INTERVAL / 1000);
    ok(prof.dps(false) > legacyDps * 1.15,
       "offline enemy output (" + prof.dps(false).toFixed(1) + " dps) now exceeds the legacy curve ("
       + legacyDps.toFixed(1) + ") it used to use");
    // Casts are part of that output; before, offline modelled auto-attacks only.
    const cls = dispositionFor(zone.enemies[0]);
    ok(avgEnemySkillMult(cls, 60) > 0, "enemies have skills worth casting (" + cls + " averages x"
       + avgEnemySkillMult(cls, 60).toFixed(2) + " per cast)");
    const st = enemyStatBlock(60, cls, { rank: "normal" });
    const e = { ...st, level: 60, cls };
    const autosOnly = enemyBaseDamage(e) * enemyAutoMult(60) / ((ENEMY_BASE_INTERVAL * archetypeOf(e).atk) / 1000);
    ok(enemyDpsOf(e) > autosOnly,
       "…and enemyDpsOf counts them: " + enemyDpsOf(e).toFixed(1) + " dps against "
       + autosOnly.toFixed(1) + " from auto-attacks alone");
    // A boss is scaled by its RANK inside the stat block, not by a flat multiplier bolted on.
    ok(prof.dps(true) > prof.dps(false), "a boss hits harder than a normal creature offline");

    // Everything above proves the PROFILE is right and proves nothing about whether
    // simulateOffline uses it — an earlier version of this test passed happily with the loop still
    // running the legacy curve. Tie the two together: predict the run's kill count from the
    // profile, and require the real run to match.
    let c = bench(60, { pots: true });
    const lvl = Math.max(zone.minLevel, Math.min(60, zone.maxLevel));
    const p2 = zoneEnemyProfile(zone, lvl);
    const nHp = (lvl * 26 + 50) * p2.hpMult + 10;
    const bHp = (lvl * 26 + 50) * 2.2 * p2.hpMult + 10;
    // Armor makes an enemy genuinely slower to kill; without it the prediction is ~16% short.
    const effDps = core.offlinePlayerDps(c) * (1 - p2.mit);
    const avgKtime = ((nHp * 9 + bHp) / 10) / effDps;   // one kill in ten is a boss
    const predicted = (10 * 3600) / avgKtime;
    const actual = run(c, 10).kills;
    const err = Math.abs(actual / predicted - 1);
    ok(err < 0.05, "the real offline run kills " + actual.toLocaleString() + " creatures against "
       + Math.round(predicted).toLocaleString() + " predicted from the archetype profile ("
       + (err * 100).toFixed(1) + "% apart) — the loop really runs on it");
  }

  // --- 3. the auto-potion the live tick drinks is drunk offline too -------------------------------
  // Without this, correcting enemy damage would simply have made offline HARDER than live rather
  // than equal to it — the player would be dying for want of a mechanic they had already bought.
  {
    const withPots = run(bench(60, { pots: true }), 10);
    const without = run(bench(60, { pots: false }), 10);
    ok(!!withPots && !!without, "both runs produce results");
    ok((withPots.potionsDrunk || 0) > 0, "a parked player with the upgrade drinks potions ("
       + (withPots.potionsDrunk || 0).toLocaleString() + " over 10 hours)");
    ok(!withPots.died, "…and survives the full stint");
    ok(withPots.kills > without.kills,
       "…outlasting the same character with no potions (" + withPots.kills.toLocaleString()
       + " kills against " + without.kills.toLocaleString() + ")");
    // Potions are a real cost, not a free heal: the stock goes down.
    const left = (withPots.char.consumables || {})[conKey("heal", 6)] || 0;
    ok(left < 100000, "…and the potions are actually spent from the stock (" + (100000 - left).toLocaleString() + " used)");
    ok(left === 100000 - withPots.potionsDrunk, "…exactly as many as were reported drunk");
  }

  // --- 4. running dry is fatal, so the stock genuinely matters ------------------------------------
  {
    let c = bench(60, { pots: true });
    c.consumables = { [conKey("heal", 6)]: 3 };   // barely any
    const r = run(c, 10);
    ok(!!r && (r.potionsDrunk || 0) <= 3, "a player can only drink the potions they own");
    ok(Object.keys(r.char.consumables || {}).length === 0 || !(r.char.consumables[conKey("heal", 6)] > 0),
       "…and an empty stack is cleared rather than left at zero");
  }

  // --- 5. the helpers are shared, not copied -------------------------------------------------------
  // conCount/conTotal/bestTier were component-scoped, which is why the offline loop could not read
  // the player's potions in the first place. Being module-scope is the fix.
  {
    ok(typeof conCount === "function" && typeof conTotal === "function" && typeof bestTier === "function",
       "the consumable helpers are module-scope, so live combat and offline read one stock");
    let c = { consumables: { [conKey("heal", 2)]: 4, [conKey("heal", 5)]: 1 } };
    ok(conTotal(c, "heal") === 5, "conTotal counts every tier");
    ok(bestTier(c, "heal") === 5, "bestTier picks the strongest potion owned");
    ok(bestTier({ consumables: {} }, "heal") === -1, "…and reports -1 when there is nothing to drink");
    ok(conCount(undefined, "heal", 1) === 0, "…and a character with no consumables map does not throw");
  }

  console.log(fail ? "\\n\\u274c " + fail + " offline parity check(s) failed"
                   : "\\n\\u2705 offline progression is the same game as live: same rewards, same enemies, same potions");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'offpar.cjs'); fs.writeFileSync(runf, js);
require(runf);
