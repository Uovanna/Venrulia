/* Professions have to be reachable, and active play has to beat ignoring the game.
 *
 * Idle training ran at a flat 3 XP every 2.5s — 96.5 HOURS to reach rank 100, four days of real
 * time for a system meant to tick away in the background. Active gathering, which asks the player
 * to actually sit there and swing, was SLOWER still at 47.7 hours. Playing the minigame was
 * strictly worse than never opening it.
 *
 * Idle is now derived from a target in hours, so retuning it is one number. Active is calibrated to
 * half that: it costs attention, so it pays double.
 *
 *   node game-core/profession.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-prof-'));
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
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  // --- idle is derived from the target, not hand-set ---------------------------------------------
  {
    ok(PROF_IDLE_HOURS_TO_MAX === 10, "idle training targets " + PROF_IDLE_HOURS_TO_MAX + " hours to rank " + PROF_MAX);
    const perTick = profIdleXpPerTick();
    const hours = (PROF_TOTAL_XP / perTick) * PROF_IDLE_TICK_MS / 3600000;
    ok(Math.abs(hours - PROF_IDLE_HOURS_TO_MAX) < 0.5,
       "…and the derived rate of " + perTick + " XP a tick actually lands there (" + hours.toFixed(2) + " h)");
    ok(perTick > 3, "…which is far above the flat 3 XP that took 96.5 hours");
    // Derived, so moving the target moves the rate. If someone replaces it with a literal this fails.
    ok(profIdleXpPerTick() === Math.max(1, Math.round(PROF_TOTAL_XP / (PROF_IDLE_HOURS_TO_MAX * 3600000 / PROF_IDLE_TICK_MS))),
       "the rate is computed from the target rather than hardcoded");
  }

  // --- active play beats idling ------------------------------------------------------------------
  {
    ok(PROF_ACTIVE_HOURS_TO_MAX === PROF_IDLE_HOURS_TO_MAX / 2,
       "active gathering targets half the idle time (" + PROF_ACTIVE_HOURS_TO_MAX + " h)");
    // Walk the real curve: node toughness and swing damage both move with level, so there is no
    // closed form — this re-measures what the shipped constants actually produce.
    const SWING_MS = 850;
    let secs = 0;
    for (let l = 1; l < PROF_MAX; l++) {
      const per = gatherXpPerNode(l);
      const nodes = professionXpForLevel(l) / per;
      const ti = Math.min(8, Math.floor(l / 12));
      secs += nodes * Math.ceil(gatherNodeMaxHp(ti) / gatherPower(l)) * SWING_MS / 1000;
    }
    const hours = secs / 3600;
    ok(Math.abs(hours - PROF_ACTIVE_HOURS_TO_MAX) < 0.6,
       "…and the shipped divisor of " + GATHER_XP_DIVISOR + " lands there (" + hours.toFixed(2) + " h)");
    ok(hours < PROF_IDLE_HOURS_TO_MAX,
       "active is FASTER than idle — it was slower (47.7 h against 96.5), so playing was a penalty");
    ok(gatherXpPerNode(1) >= 2, "a rank-1 node is still worth something");
    ok(gatherXpPerNode(99) > gatherXpPerNode(1), "later nodes are worth more, matching the xp curve");
  }

  // --- the testing promo code --------------------------------------------------------------------
  // Flagged for removal before launch; the test exists so it is not forgotten silently.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    ok(/\\bmaxp:\\s*\\{/.test(src), "the MaxP testing code exists");
    ok(/TESTING ONLY — remove before launch/.test(src), "…and is marked for removal before launch");
    const block = src.slice(src.indexOf("maxp:"), src.indexOf("maxp:") + 700);
    ok(/PROF_MAX/.test(block) && /PROFESSIONS/.test(block),
       "…and maxes EVERY profession from the table rather than a hardcoded list");
  }

  // --- the temper shop only offers gear worth tempering ---------------------------------------------
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    ok(/isTemperable\\(it\\) && it\\.locked/.test(src),
       "the temper shop lists equipped gear plus LOCKED gear only, not the whole bank");
  }


  // --- Auto Gambit writes a usable default from OWNED gambits only -----------------------------
  // The system asks a player to understand priority order, conditions and vetoes before their bar
  // does anything at all. This lays down a working default so it can be learned rather than being
  // a wall — but it must never invent a gambit the player has not unlocked.
  {
    const mkChar = (owned, level) => {
      const c = core.normalizeChar({ ...core.createCharacter("T", "warrior", "human"), level: level || 60, spec: "w_berserk" });
      c.gambits = { owned, shards: {}, rules: {}, slots: {}, general: [], generalSlots: 2 };
      return c;
    };
    const allOwned = {};
    for (const g of ALL_GAMBITS) allOwned[g.id] = true;

    const rich = mkChar(allOwned);
    const plan = autoGambitPlan(rich);
    const slots = Object.keys(plan.rules);
    ok(slots.length > 0, "it writes a rule for a bar with everything unlocked (" + slots.length + " slots)");
    ok(slots.every((n) => Number(n) >= 1 && Number(n) <= core.unlockedSlotCount(rich.level)),
       "…keyed by real bar slots, the same numbers the cooldown conditions use");
    ok(Object.values(plan.rules).every((arr) => arr.every((r) => r.if && r.then)),
       "…and every rule it writes is complete: an IF and a THEN");
    ok(Object.values(plan.rules).every((arr) => arr.every((r) => allOwned[r.if] && allOwned[r.then])),
       "…drawn only from gambits the player owns");

    // The whole point: a player who owns nothing gets nothing invented for them.
    const poor = mkChar({});
    const none = autoGambitPlan(poor);
    ok(Object.keys(none.rules).length === 0 && none.general.length === 0,
       "a player who owns no gambits gets no rules invented");

    // Owning only a THEN and no IF cannot produce a half-written rule.
    const halfId = "then_sk_" + _gslug((core.SKILLS.warrior.find((x) => x.unlockLevel <= 60) || {}).name || "");
    const half = mkChar({ [halfId]: true });
    const hp = autoGambitPlan(half);
    ok(Object.values(hp.rules).every((arr) => arr.every((r) => r.if && r.then)),
       "owning a THEN but no IF writes nothing rather than half a rule");

    // It must react to what the skill IS, not fill everything with "always". A Berserker's bar is
    // all damage, so it legitimately gets one condition — a HEALER is where the branching shows.
    const healer = core.normalizeChar({ ...core.createCharacter("T", "paladin", "human"), level: 60, spec: "p_holy" });
    healer.gambits = { owned: allOwned, shards: {}, rules: {}, slots: {}, general: [], generalSlots: 2 };
    const hplan = autoGambitPlan(healer);
    const hconds = new Set(Object.values(hplan.rules).map((arr) => arr[0].if));
    ok(hconds.size >= 2, "a healer's bar gets more than one kind of condition (" + [...hconds].join(", ") + ")");
    ok([...hconds].some((id) => /selfhp/.test(id)), "…and its heals are gated on low health, not spammed on cooldown");
    // The general slot should carry a survival rule when the player owns the pieces.
    ok(plan.general.length > 0 && /selfhp/.test(plan.general[0].if || ""),
       "a general rule drinks a potion when low, if that gambit is owned");
  }

  console.log(fail ? "\\n\\u274c " + fail + " profession check(s) failed"
                   : "\\n\\u2705 professions: idle reaches max in its target time, and playing actively beats idling");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'prof.cjs'); fs.writeFileSync(runf, js);
require(runf);
