/* Daily sign-in: the rewards are what was asked for, and the server owns the clock and the dice.
 *
 * The exploit this system invites is obvious — every other clock in the game is the device's, so a
 * reward gated on "a new day" would be farmed by moving the date forward, taking thirty days and
 * the milestone legendary in a minute. The claim is therefore an RPC whose row is stamped with the
 * DATABASE's now(), and the reward is rolled from a seed the server stores, so a replayed call
 * returns the same seed and cannot re-roll the item.
 *
 * These checks cover the reward table (pure, testable here) and PIN the SQL that enforces the rest,
 * because the SQL is a second copy of the rules living in a language the JS audit cannot see —
 * which is exactly how the auction house broke.
 *
 *   node game-core/daily.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const SQL = path.join(__dirname, '..', 'supabase', 'migrations', '0015_daily_signin.sql');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-daily-'));
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
  const sql = require("fs").readFileSync("${SQL.replace(/\\\\/g, '/')}", "utf8");
  const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
  const rw = (streak, weekend, ilvl) => dailyRewardFor({ streak, isWeekend: weekend, avgIlvl: ilvl || 40, cls: "warrior" });

  // --- the rewards asked for ----------------------------------------------------------------------
  {
    ok(rw(1, false).ven === 5, "a weekday pays 5 Ven");
    ok(rw(1, true).ven === 10, "a weekend pays 10 Ven");
    ok(rw(1, true).rolls.length === 1 && rw(1, true).rolls[0].rarity === "epic",
       "…and a weekend also rolls an epic");
    ok(rw(1, false).rolls.length === 0, "a weekday rolls no gear");
    // The epic is at the player's AVERAGE EQUIPPED item level, not their character level.
    ok(rw(1, true, 63).rolls[0].ilvl === 63, "the weekend epic is rolled at the average equipped ilvl (63)");
    ok(rw(1, true, 7).rolls[0].ilvl === 7, "…and follows a poorly-geared player down (7)");
  }

  // --- every 5th consecutive day ------------------------------------------------------------------
  {
    const bonus = [];
    for (let d = 1; d <= 30; d++) if (rw(d, false).ven > 5) bonus.push(d);
    ok(JSON.stringify(bonus) === JSON.stringify([5, 10, 15, 20, 25, 30]),
       "the streak bonus lands on 5, 10, 15, 20, 25, 30 (" + bonus.join(", ") + ")");
    ok(rw(5, false).ven === 15, "day 5 on a weekday pays 5 + 10 = 15 Ven");
    ok(rw(10, true).ven === 20, "day 10 on a weekend pays 10 + 10 = 20 Ven");
    ok(rw(4, false).ven === 5 && rw(6, false).ven === 5, "days either side of a bonus pay the plain rate");
  }

  // --- the 30-day milestone -------------------------------------------------------------------------
  {
    const d30 = rw(30, false);
    ok(d30.ven === 5 + 10 + 100, "day 30 pays the daily, the 5th-day bonus AND 100 Ven (" + d30.ven + ")");
    ok(d30.rolls.some((r) => r.rarity === "legendary"), "…and rolls a legendary");
    ok(!rw(29, false).rolls.length && !rw(31, false).rolls.length,
       "no legendary on the days either side of it");
    const d30w = rw(30, true);
    ok(d30w.rolls.length === 2, "a day-30 that falls on a weekend rolls BOTH the epic and the legendary");
    ok(d30w.ven === 10 + 10 + 100, "…and pays " + d30w.ven + " Ven");
    // The streak decays rather than resets, so 60 is reachable and must pay again.
    ok(rw(60, false).rolls.some((r) => r.rarity === "legendary"), "day 60 pays the milestone again");
  }

  // --- the roll is reproducible from the server's seed, and only from it ----------------------------
  // Replaying the RPC returns the SAME seed, so the same item. If the client rolled its own, a player
  // could call until they liked the result.
  {
    const c = core.normalizeChar({ ...core.createCharacter("D", "warrior", "human"), level: 60 });
    const roll = (seed) => rngm.withRng(rngm.makeRng(seed), () =>
      core.generateItem(63, core.rarityById("epic"), core.pickLootSlot(), "warrior"));
    const a = roll(12345), b = roll(12345), d = roll(999);
    ok(a.name === b.name && a.ilvl === b.ilvl && JSON.stringify(a.stats) === JSON.stringify(b.stats),
       "the same seed always produces the same item");
    ok(a.name !== d.name || JSON.stringify(a.stats) !== JSON.stringify(d.stats),
       "…and a different seed produces a different one");
    ok(/withRng\\(makeRng\\(Number\\(row\\.seed\\)/.test(src),
       "the client rolls from the SERVER's seed, not one of its own");
  }

  // --- the claim cannot be replayed, re-rolled, or clock-shifted ------------------------------------
  // Pinning the SQL: it is a second copy of the rules in a language nothing else here can read.
  {
    ok(/primary key \\(user_id, utc_day\\)/.test(sql),
       "a second claim on the same day is refused by the PRIMARY KEY, not by a check anything can skip");
    ok(/now\\(\\) at time zone 'utc'/.test(sql), "the day comes from the DATABASE clock, never the caller's");
    ok(/security definer/.test(sql), "the claim runs as a definer function");
    ok(/auth\\.uid\\(\\)/.test(sql) && /raise exception 'not signed in'/.test(sql),
       "…and refuses an unauthenticated caller");
    ok(/if found then[\\s\\S]{0,220}v_prev\\.seed, false/.test(sql),
       "a replayed claim hands back the STORED seed, so the item cannot be re-rolled");
    ok(/enable row level security/.test(sql) && /auth\\.uid\\(\\) = user_id/.test(sql),
       "a player can only read their own claims");
    // A revoke from PUBLIC reads like it closes the door and does not: Supabase grants EXECUTE
    // to anon and authenticated DIRECTLY, not through PUBLIC. Checked against the live project after
    // applying 0015, anon still held EXECUTE on both RPCs. Nothing leaked — daily_signin raises
    // 'not signed in' and daily_history filters on auth.uid() — but a revoke that does not revoke is
    // worse than none, because the next reader believes it.
    ok(sql.indexOf("revoke all on function daily_signin() from public") > 0, "PUBLIC is revoked");
    const migDir = require("path").join("${path.join(__dirname, '..').replace(/\\/g, '/')}", "supabase", "migrations");
    const allSql = require("fs").readdirSync(migDir)
      .map((f) => require("fs").readFileSync(require("path").join(migDir, f), "utf8")).join(" ");
    ok(allSql.indexOf("revoke execute on function daily_signin() from anon") > 0,
       "…and so is anon, explicitly — the PUBLIC revoke alone did not remove it");
    ok(allSql.indexOf("revoke execute on function daily_history(date, date) from anon") > 0,
       "…on the history RPC too");
  }

  // --- the streak decays by one; it does not reset ---------------------------------------------------
  {
    ok(/greatest\\(1, v_prev\\.streak \\+ 1 - \\(v_gap - 1\\)\\)/.test(sql),
       "a missed day costs ONE day of streak, and never drops below 1");
    // Walk the SQL's own arithmetic: streak 20, back after a 3-day gap (2 missed) -> 19.
    const next = (prev, gap) => Math.max(1, prev + 1 - (gap - 1));
    ok(next(20, 1) === 21, "signing in the next day continues the streak (20 -> 21)");
    ok(next(20, 3) === 19, "two missed days costs two (20 -> 19)");
    ok(next(2, 30) === 1, "a long absence floors at 1 rather than going negative");
    ok(next(0, 1) === 1, "a first-ever claim is day 1");
  }

  // --- UTC, so the weekend is the same day for everyone ---------------------------------------------
  {
    ok(/extract\\(isodow from v_today\\) in \\(6, 7\\)/.test(sql), "the server calls Saturday and Sunday the weekend");
    ok(utcIsWeekend("2026-08-08") && utcIsWeekend("2026-08-09"), "the client agrees: 8 Aug 2026 is a Saturday, 9th a Sunday");
    ok(!utcIsWeekend("2026-08-07") && !utcIsWeekend("2026-08-10"), "…and Friday and Monday are not");
    ok(/toISOString\\(\\)\\.slice\\(0, 10\\)/.test(src), "the client's day string is UTC, matching the server's");
  }

  // --- state survives a reload -----------------------------------------------------------------------
  {
    const c = core.normalizeChar({ ...core.createCharacter("D", "mage", "human"),
      daily: { lastDay: "2026-08-01", streak: 12, history: [{ day: "2026-08-01", streak: 12, weekend: true }] } });
    ok(c.daily.streak === 12 && c.daily.lastDay === "2026-08-01", "the streak and last claim persist");
    ok(c.daily.history.length === 1, "…and so does the calendar history");
    const fresh = core.normalizeChar(core.createCharacter("D", "mage", "human"));
    ok(fresh.daily.streak === 0 && fresh.daily.lastDay === null, "a new character has claimed nothing");
    ok(core.normalizeChar({ ...fresh, daily: "nonsense" }).daily.streak === 0, "junk in the save does not throw");
  }

  // --- claiming requires a connection, and the reward is banked safely --------------------------------
  {
    ok(/Connection required to claim your daily sign-in/.test(src),
       "an offline player is told a connection is required rather than silently failing");
    // depositItems returns a gold field meaning AUTO-SELL PROCEEDS. Spreading the whole result onto
    // character would replace their purse with that figure — usually zero.
    ok(/gold: \\(nc\\.gold \\|\\| 0\\) \\+ dep\\.gold/.test(src),
       "the gift is banked through depositItems without clobbering the player's gold");
    ok(!/const dep = depositItems\\(nc, items\\); nc = \\{ \\.\\.\\.nc, \\.\\.\\.dep \\}/.test(src),
       "…and the whole deposit result is never spread onto the character");
  }

  // --- the level-10 offer: its window, its choice, and where it goes afterwards ---------------------
  {
    const HOUR = 3600 * 1000, T = 1000000000000;
    const mk = (over) => core.normalizeChar({ ...core.createCharacter("O", "warrior", "human"), ...over });

    ok(offerState(mk({ level: 9 }), T) === "hidden", "below level " + OFFER.level + " there is no offer");
    ok(offerState(mk({ level: OFFER.level }), T) === "live", "at level " + OFFER.level + " it is live");
    // THE POINT OF seenAt: the clock starts when the icon is SHOWN, not when they levelled. A window
    // that expires while someone is logged out is a window they never had.
    const seen = mk({ level: 20, offer: { seenAt: T, taken: false, pick: null } });
    ok(offerState(seen, T + 1) === "live", "…and stays live just after it is first seen");
    ok(offerState(seen, T + 23 * HOUR) === "live", "still live at 23 hours");
    ok(offerState(seen, T + 24 * HOUR + 1) === "expired", "expired just past 24 hours");
    ok(offerMsLeft(seen, T + 6 * HOUR) === 18 * HOUR, "the countdown reads 18h left after 6");
    ok(offerMsLeft(seen, T + 99 * HOUR) === 0, "…and never goes negative");
    // A player who reaches 10, closes the game for a week, and comes back must still get 24 hours.
    const never = mk({ level: 40, offer: { seenAt: 0, taken: false, pick: null } });
    ok(offerState(never, T + 500 * HOUR) === "live",
       "a player who levelled long ago but never SAW the icon still gets their full window");
    ok(offerState(mk({ level: 40, offer: { seenAt: T, taken: true, pick: "offhand" } }), T) === "taken",
       "once bought it is taken, in every state");

    // The bundle: one artifact always, plus exactly one choice.
    ok(OFFER.grant.slot === "weapon", "the guaranteed piece is the main-hand");
    ok(OFFER.choices.length === 2, "there are two choices");
    ok(OFFER.choices.some((x) => x.slot === "weapon") && OFFER.choices.some((x) => x.slot === "offhand"),
       "…a second weapon, or an off-hand");
    ok(OFFER.usd === "0.99", "priced at $" + OFFER.usd);
    // Deliberately a loss leader: the shop sells ONE of these for 1,500 Ven, and Ven runs 99 for
    // $0.99. Pinned so nobody "fixes" it into line with the shop later.
    const shopArt = PREMIUM_ITEMS.find((x) => x.kind === "artifact");
    const packRate = VEN_PACKS[0].ven / Number(VEN_PACKS[0].usd);        // Ven per dollar
    const shopUsd = (shopArt.cost * 2) / packRate;
    ok(shopUsd > 10, "two artifacts cost about $" + shopUsd.toFixed(2) + " at shop rate — this sells them for $" + OFFER.usd);

    // Literal searches: escaping a regex through this harness keeps dropping a backslash level and
    // turning a pattern into one that matches the wrong thing, or nothing.
    const src2 = src;
    ok(src2.indexOf("const buyOffer = () =>") > 0 && src2.indexOf("In-app purchases coming soon") > 0,
       "the buy button shows the same coming-soon notice as the Ven packs — nothing charges yet");
    ok(src2.indexOf("const grantOffer = (pickId) =>") > 0 && src2.indexOf("taken: true, pick: pick.id") > 0,
       "…while the grant path is written and marks the offer taken, so a provider is one call away");
    ok(src2.indexOf("for (const slot of [OFFER.grant.slot, pick.slot])") > 0,
       "the grant forges the guaranteed piece AND the chosen one");
    ok(src2.indexOf("depositEarned(nc, art)") > 0, "…and banks them through the shared helper, respecting the bank cap");
    ok(src2.indexOf('offerState(char, now) === "expired"') > 0, "an expired offer appears in the Ven shop's Offers section");
    ok(src2.indexOf('offerState(char, now) === "live"') > 0, "…and the town-map icon shows only while it is live");
    ok(src2.indexOf("if (!(char.offer || {}).seenAt) markOfferSeen()") > 0,
       "rendering the icon is what starts the clock");

    // Persistence.
    const back = core.normalizeChar({ ...mk({ level: 20 }), offer: { seenAt: T, taken: true, pick: "offhand" } });
    ok(back.offer.taken === true && back.offer.pick === "offhand" && back.offer.seenAt === T,
       "the offer state survives a reload");
    ok(core.normalizeChar({ ...mk({}), offer: "nonsense" }).offer.taken === false, "junk in the save does not throw");
  }

  console.log(fail ? "\\n\\u274c " + fail + " daily check(s) failed"
                   : "\\n\\u2705 daily sign-in + the level-10 offer: rewards right, server owns the clock, offer window is honest");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'daily.cjs'); fs.writeFileSync(runf, js);
require(runf);
