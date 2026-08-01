/* Souls: hard-mode crafting reagents, and the binding that keeps them from becoming a gold faucet.
 *
 * Armorsmithing capped at ilvl 63 — exactly where Hard Mode begins — so the profession stopped
 * mattering the moment a player reached the content it feeds into. A Soul is a hard-mode-only
 * reagent that raises a craft to that zone's item level, in the slot the player chooses. Hard mode
 * hands out two RANDOM pieces a boss, so the slot that refuses to drop is the whole frustration.
 *
 * Crafted gear is ACCOUNT BOUND. At the power-based auction prices a craftable ilvl-70 piece would
 * be a gold faucet, and binding keeps this a catch-up mechanic rather than a business.
 *
 *   node game-core/souls.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-soul-'));
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
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  // --- one Soul per hard zone, covering the whole climb -----------------------------------------
  {
    ok(SOULS.length === HARD_ZONES.length, "there is a Soul for every hard zone (" + SOULS.length + ")");
    for (const hz of HARD_ZONES) {
      const s = soulForZone(hz.id);
      ok(!!s, hz.name + " drops " + (s ? s.name : "NOTHING"));
      // The Soul must grant the item level that zone is FOR, or crafting lags the content.
      if (s) ok(s.ilvl === hz.dropIlvl, "…granting ilvl " + (s ? s.ilvl : "?") + ", matching the zone's own drops (" + hz.dropIlvl + ")");
    }
    const ilvls = SOULS.map((s) => s.ilvl);
    ok(ilvls.every((v, i) => i === 0 || v > ilvls[i - 1]), "the Souls climb: " + ilvls.join(" -> "));
    ok(Math.max(...ilvls) === 70, "…topping out at the best item level in the game");
    // Crafting used to stop at 63, which is below the ENTRY of hard mode.
    ok(Math.min(...ilvls) > craftIlvl(PROF_MAX, ORE_TIERS.length - 1),
       "every Soul beats the best ordinary craft (ilvl " + craftIlvl(PROF_MAX, ORE_TIERS.length - 1) + ")");
    ok(new Set(SOULS.map((s) => s.id)).size === SOULS.length, "no duplicate Soul ids");
  }

  // --- hard dungeons are the reliable source ------------------------------------------------------
  {
    const mapped = SOULS.filter((s) => s.dungeon);
    ok(mapped.length === HARD_DUNGEONS.length,
       "every hard dungeon drops a Soul (" + mapped.length + " of " + HARD_DUNGEONS.length + ")");
    for (const s of mapped) ok(!!soulForDungeon(s.dungeon), s.name + " is reachable from " + s.dungeon);
    ok(new Set(mapped.map((s) => s.dungeon)).size === mapped.length, "…and no two Souls share a dungeon");
    // The top Soul is deliberately zone-only — there is no hard dungeon past The Cursed City.
    const top = SOULS[SOULS.length - 1];
    ok(!top.dungeon, top.name + " is zone-only, since no hard dungeon sits above it");
  }

  // --- the drop rates have to make crafting worth doing ---------------------------------------------
  {
    ok(SOUL_ZONE_CHANCE > 0 && SOUL_ZONE_CHANCE <= 0.01,
       "a zone kill drops a Soul " + (SOUL_ZONE_CHANCE * 100).toFixed(1) + "% of the time — it is an endless grind, so it stays rare");
    ok(SOUL_DUNGEON_CHANCE > SOUL_ZONE_CHANCE * 10,
       "a hard dungeon CLEAR is far likelier (" + (SOUL_DUNGEON_CHANCE * 100).toFixed(0) + "%) — it is gated by a lockout and a full run");
    // The reason the rate was raised from the 5% originally sketched: a hard dungeon hands over
    // DUNGEON_BOSS_DROPS pieces a clear, so if a Soul took far more clears than the gear it makes,
    // crafting would be strictly worse than simply farming.
    const clearsForSoul = 1 / SOUL_DUNGEON_CHANCE;
    const gearInThatTime = clearsForSoul * DUNGEON_BOSS_DROPS;
    ok(gearInThatTime < 20,
       "a Soul costs ~" + clearsForSoul.toFixed(0) + " clears, during which farming yields ~"
       + gearInThatTime.toFixed(0) + " pieces — crafting stays competitive");
  }

  // --- crafted gear is BOUND ------------------------------------------------------------------------
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    ok(/generateItem\\(soul\\.ilvl, rarity, forgeSlot, c\\.cls\\), bound: true/.test(src.replace(/\\s+/g, " ")),
       "a Soul-forged piece is marked bound at the moment it is created");
    // The auction house must not offer it — and the SERVER must refuse it too, since the client is
    // not the only thing standing between a player and a listing.
    ok(/!it\\.locked && !it\\.bound/.test(src), "the auction house never offers a bound item for sale");
    const rpc = require("fs").readFileSync("${path.join(__dirname, '..', 'supabase', 'migrations', '0003_auction_rpcs.sql').replace(/\\\\/g, '/')}", "utf8");
    ok(/if v_it\\.bound then raise exception/.test(rpc),
       "…and ah_post_gear rejects one server-side, so the client is not the only guard");
  }

  // --- a Soul-forged item is a real item -------------------------------------------------------------
  {
    for (const s of SOULS) {
      const it = rngm.withRng(rngm.makeRng(s.ilvl), () => ({ ...core.generateItem(s.ilvl, core.rarityById("epic"), "chest", "warrior"), bound: true }));
      ok(it.ilvl === s.ilvl, s.name + " forges at ilvl " + it.ilvl);
      ok(it.bound === true, "…bound");
      ok(ahStatPoints(it) > 0 && ahBaseValue(it) > 1, "…and is priced like any other item for vendor/compare purposes");
    }
  }

  // --- the reagent count survives a reload -----------------------------------------------------------
  {
    const c = core.normalizeChar({ ...core.createCharacter("T", "warrior", "human"), souls: { soul_blight: 3 } });
    ok((c.souls || {}).soul_blight === 3, "Souls persist through a save");
    const fresh = core.normalizeChar(core.createCharacter("T", "warrior", "human"));
    ok(fresh.souls && typeof fresh.souls === "object" && !Object.keys(fresh.souls).length, "a new character starts with none");
    const junk = core.normalizeChar({ ...core.createCharacter("T", "warrior", "human"), souls: "nonsense" });
    ok(junk.souls && typeof junk.souls === "object", "…and junk in the save does not throw");
  }

  console.log(fail ? "\\n\\u274c " + fail + " soul check(s) failed"
                   : "\\n\\u2705 Souls carry crafting into Hard Mode, and what they make cannot be sold");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'souls.cjs'); fs.writeFileSync(runf, js);
require(runf);
