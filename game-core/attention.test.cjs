/* Unattended live play pays what parking pays.
 *
 * Rationing the PARKED payout only moved the problem. The live tick pays a per-kill wage and the
 * same gambits fight either way, so once parking fell to 900 gold an hour a hard zone left running
 * on an open tab was worth about 30,000 — roughly 34x better than the thing it replaced. "Leave it
 * open on a spare monitor" became the optimal play, which is camping with extra steps.
 *
 * Three things here are load-bearing.
 *
 * 1. THE TWO RATES MUST BE ONE RATE. An hour ignored and an hour away have to pay the same number,
 *    from the same table. If they ever diverge, whichever is higher becomes the only thing anyone
 *    does, and no amount of tuning the other one matters.
 *
 * 2. ACCRUAL IS CUMULATIVE, NOT PER KILL. afkAccrue pays the difference between what a stretch is
 *    worth by now and what it has already handed over. Paying per kill — even a tiny amount — puts
 *    the wage straight back, because a parked character kills tens of thousands of things.
 *
 * 3. ONLY ENDLESS CONTENT COUNTS. Dungeons and hard raids finish on their own, so there is nothing
 *    to leave running, and PvP is another player's time. Rationing those would punish someone for
 *    reading a tooltip mid-run.
 *
 *   node game-core/attention.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-attn-'));
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
  const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
  let fail = 0;
  const ok = (c, m) => { console.log((c ? "  \\u2713 " : "  \\u2717 ") + m); if (!c) fail++; };
  const sec = (t) => console.log(String.fromCharCode(10) + t);
  const HOUR = 3600000;
  // The body of resolveDeath, for the wiring checks. Asserting against the whole file would let a
  // matching string somewhere else keep these green while the real call site rotted.
  const rd = src.slice(src.indexOf("const resolveDeath = (c, b) =>"), src.indexOf("const finishKill ="));

  // --- what can be left running -----------------------------------------------------------------
  sec("Only endless content can be left to run");
  {
    ok(endlessSpotOf({ mode: "zone" }) === "zone", "a normal zone is endless");
    ok(endlessSpotOf({ mode: "hard", hardKind: "zone" }) === "hard", "a hard ZONE is endless");
    ok(endlessSpotOf({ mode: "abyss" }) === "abyss", "the Abyss is endless");
    // These end on their own. A player cannot leave them farming, so rationing them would only
    // punish someone who stopped to read a tooltip in the middle of a run.
    ok(endlessSpotOf({ mode: "dungeon" }) === null, "a dungeon ends, so it is never rationed");
    ok(endlessSpotOf({ mode: "hard", hardKind: "dungeon" }) === null, "\\u2026nor is a hard dungeon");
    ok(endlessSpotOf({ mode: "hard", hardKind: "raid" }) === null, "\\u2026nor the hard raid");
    ok(endlessSpotOf({ mode: "zone", pvp: true }) === null, "PvP is another player's time and is never rationed");
    ok(endlessSpotOf(null) === null, "and no battle at all is nothing");
    // The three that ARE endless are exactly the three simulateOffline can park in, which is what
    // makes "an hour ignored equals an hour away" a statement about the same three places.
    ok(IDLE.goldPerHour.zone && IDLE.goldPerHour.hard && IDLE.goldPerHour.abyss,
       "and each has a parked rate to fall back to");
  }

  // --- the equivalence ---------------------------------------------------------------------------
  sec("An hour ignored pays exactly an hour away");
  {
    const t0 = 1700000000000;
    for (const spot of ["zone", "hard", "abyss"]) {
      const a = afkAccrue(null, spot, t0);              // stretch begins
      const b = afkAccrue(a.rec, spot, t0 + HOUR);      // one hour later
      ok(a.gold === 0 && a.xp === 0, "a " + spot + " stretch pays nothing at the instant it starts");
      ok(b.gold === IDLE.goldPerHour[spot],
         "\\u2026and " + IDLE.goldPerHour[spot].toLocaleString() + " gold after an hour, the parked rate exactly");
      ok(b.xp === IDLE.xpPerHour[spot],
         "\\u2026and " + IDLE.xpPerHour[spot].toLocaleString() + " experience, likewise");
    }
    // Twelve hours ignored against the twelve hours parked that the wealth harness measures.
    let rec = null;
    for (let h = 0; h <= 12; h++) rec = afkAccrue(rec, "hard", t0 + h * HOUR).rec;
    ok(rec.gold === IDLE.goldPerHour.hard * 12,
       "twelve hours on an open tab pays " + rec.gold.toLocaleString() + " \\u2014 the same as twelve parked");
    ok(rec.gold < 250000 * 0.1, "\\u2026still under a tenth of what an average player should hold");
    // The number this replaces.
    ok(30000 / (rec.gold / 12) > 30,
       "\\u2026against roughly 30,000 an hour before, a " + Math.round(30000 / (rec.gold / 12)) + "x cut");
  }

  // --- the trap: paying per kill ------------------------------------------------------------------
  sec("Accrual is cumulative, so kills cannot add up");
  {
    const t0 = 1700000000000;
    // A hard zone kills roughly 1,000 things an hour on an open tab. Paying ANY per-kill amount puts
    // the wage back, so the test is that a thousand calls and one call reach the same total.
    // Both stretches must START at t0. Seeding from null inside the loop would begin the stretch at
    // the FIRST kill instead, so the fast run would measure 0.999 hours against the slow run's 0.9
    // and the comparison would be of two different durations, not two different kill rates.
    const begin = () => afkAccrue(null, "hard", t0).rec;
    const race = (kills) => {
      let rec = begin(), gold = 0;
      for (let i = 1; i <= kills; i++) { const a = afkAccrue(rec, "hard", t0 + (i * HOUR) / kills); gold += a.gold; rec = a.rec; }
      return { gold, rec };
    };
    const fast = race(1000), slow = race(10);
    const once = afkAccrue(begin(), "hard", t0 + HOUR);
    ok(fast.gold === once.gold, "a thousand kills in an hour pay " + fast.gold.toLocaleString()
       + ", the same as one kill an hour later (" + once.gold.toLocaleString() + ")");
    ok(fast.rec.gold === fast.gold, "\\u2026and the running total agrees with what was handed over");
    // The same property stated as the thing a player would notice: killing FASTER earns no more.
    ok(slow.gold === fast.gold, "a character that kills 100x faster earns the same " + slow.gold.toLocaleString());
    const many = fast.rec;
    // And a kill a millisecond after the last one is worth nothing at all.
    const tick = afkAccrue(many, "hard", t0 + HOUR + 1);
    ok(tick.gold === 0 && tick.xp === 0, "a kill a millisecond later is worth nothing");
  }

  // --- the drop allowance -------------------------------------------------------------------------
  sec("Five drops an hour, ignored or away");
  {
    const t0 = 1700000000000;
    ok(afkAccrue(null, "hard", t0).budget === IDLE.dropsPerHour,
       "a fresh stretch allows " + IDLE.dropsPerHour + " drops");
    // The SAME formula simulateOffline uses. Written out here rather than imported so that changing
    // one and not the other fails instead of silently agreeing.
    for (const h of [0, 1, 5, 11]) {
      const want = Math.floor(h) * IDLE.dropsPerHour + IDLE.dropsPerHour;
      ok(afkAccrue({ since: t0, gold: 0, xp: 0, drops: 0 }, "hard", t0 + h * HOUR).budget === want,
         "\\u2026" + want + " after " + h + " hours, matching the parked allowance");
    }
    const full = afkAccrue({ since: t0, gold: 0, xp: 0, drops: 5 }, "hard", t0 + HOUR / 2);
    ok(!full.roomForDrop, "five kept in the first half hour closes the allowance");
    ok(afkAccrue({ since: t0, gold: 0, xp: 0, drops: 5 }, "hard", t0 + HOUR).roomForDrop,
       "\\u2026and the next hour opens it again");
  }

  // --- it is actually wired in ---------------------------------------------------------------------
  sec("resolveDeath really uses it");
  {
    ok(rd.indexOf("const afkSpot = endlessSpotOf(b);") > 0, "resolveDeath asks whether this fight is endless");
    ok(rd.indexOf("!attended()") > 0, "\\u2026and whether anyone is there");
    // ASSIGNED, not added. "goldBase += acc.gold" would keep the per-kill wage and stack the tranche
    // on top of it, which is worse than the bug this fixes.
    ok(rd.indexOf("goldBase = acc.gold; xpEarned = acc.xp;") > 0,
       "\\u2026and REPLACES the per-kill wage rather than adding to it");
    ok(rd.indexOf("nc.afk = afkRec;") > 0, "the stretch's running total is written to the character");
    // Gear through the allowance, gems held back entirely, because parking earns none of either.
    ok(rd.indexOf("const afkGear = (items) =>") > 0, "gear passes through the allowance");
    // Exactly three: the hard-zone roll, the shared zone/dungeon roll, and the Abyss roll. The hard
    // RUN boss drop is deliberately not among them — a run is not endless, so it is never rationed.
    ok((rd.match(/afkGear\\(/g) || []).length === 3,
       "\\u2026at all three endless drop sites, and only those");
    ok((rd.match(/if \\(!unattended\\) nc = grantGem\\(/g) || []).length === 2,
       "\\u2026and both gem sites are held back while nobody is looking");
    // Progression is NOT rationed: the kill still counts for everything it counted for.
    ok(rd.indexOf("nc.kills = c.kills + 1;") > 0, "the kill still counts");
    ok(rd.indexOf("hardKills") > 0, "\\u2026still banks against the hard zone's goal");
    ok(rd.indexOf("recordAbyssKill(nc, ap)") > 0, "\\u2026and against the Abyss rank");
    ok(rd.indexOf("soulForZone") > 0, "souls are untouched \\u2014 a reagent is not a wage");
  }

  // --- attention itself ------------------------------------------------------------------------------
  sec("What counts as being there");
  {
    ok(ATTENTION.afkAfterMs >= 5 * 60000,
       "the grace period is " + (ATTENTION.afkAfterMs / 60000) + " minutes \\u2014 long enough to watch a fight");
    ok(src.indexOf('const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"];') > 0,
       "any pointer, key, wheel or touch resets it");
    ok(src.indexOf("{ capture: true, passive: true }") > 0,
       "\\u2026listened for on capture, so nothing in the app can stop it short");
    // The rule itself, called rather than grepped for. The string-matching version of this check
    // passed happily while the logic was mutated away, because the same substring appears in an
    // unrelated visibility handler further down the file.
    const T = 1700000000000;
    ok(isAttended(T, T, false), "a player who just clicked is there");
    ok(isAttended(T, T + ATTENTION.afkAfterMs - 1, false), "\\u2026and still there a millisecond before the grace period ends");
    ok(!isAttended(T, T + ATTENTION.afkAfterMs, false), "\\u2026and gone the moment it does");
    // A hidden tab has definitionally nobody in it, and browsers keep the timers running.
    ok(!isAttended(T, T, true), "hiding the tab is unattended AT ONCE, without waiting out the grace period");
    ok(!isAttended(T, T + 1, true), "\\u2026and stays that way");
    ok(!isAttended(0, T, false), "a character that has never seen input is not attended");
    ok(src.indexOf("const attended = () => isAttended(lastInputRef.current, Date.now(),") > 0,
       "\\u2026and resolveDeath's check is that same rule, not a second copy of it");
    ok(src.indexOf("const onShow = () => { lastInputRef.current = Date.now();") > 0,
       "\\u2026and coming back counts as being there");
    // The record has to survive a reload, or reloading would be a free reset of both the accrued
    // hours and the drop allowance.
    const norm = core.normalizeChar({ ...core.createCharacter("A", "warrior", "human"),
      afk: { since: 1700000000000, gold: 10, xp: 20, drops: 3 } });
    ok(norm.afk && norm.afk.gold === 10 && norm.afk.drops === 3, "an unattended stretch survives a reload");
    ok(core.normalizeChar(core.createCharacter("B", "warrior", "human")).afk === null,
       "\\u2026and a fresh character has none");
    ok(core.normalizeChar({ ...core.createCharacter("C", "warrior", "human"), afk: { since: "x" } }).afk === null,
       "\\u2026and a junk record is discarded rather than trusted");
    const future = core.normalizeChar({ ...core.createCharacter("D", "warrior", "human"),
      afk: { since: Date.now() + 99 * HOUR, gold: 0, xp: 0, drops: 0 } });
    ok(future.afk.since <= Date.now(), "a stretch that claims to start in the future is clamped to now");
  }

  console.log(String.fromCharCode(10) + (fail
    ? "\\u274c " + fail + " attention check(s) failed"
    : "\\u2705 unattended live play pays what parking pays, and only endless content is rationed"));
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'a.cjs'); fs.writeFileSync(runf, js); require(runf);
