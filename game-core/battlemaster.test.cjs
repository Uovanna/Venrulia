/* The Battlemaster: the Arena's own economy, and the first gear set in the game.
 *
 * Four things here are easy to get wrong and expensive to get wrong late.
 *
 * 1. The set bonus is MULTIPLICATIVE. Four pieces at a flat 10% is 40%; at 0.9^4 it is 34.4%. The
 *    gap is small today and the reason is not — additive stacking has no ceiling, so a six-piece
 *    set would reach 60% and a ten-piece one would reach zero damage taken.
 *
 * 2. It is PvP-ONLY. A global 34% damage reduction would be the strongest defensive item in the
 *    game and would trivialise Hard Mode, which is tuned without it.
 *
 * 3. The set pieces are ilvl 65 and must NEVER re-forge. syncArtifacts drags every artifact to
 *    artifactIlvl(level), which is 60 at max — so without the fixed-ilvl exemption a piece would
 *    lose both the item level it was paid for and the main stat the player chose, on the very
 *    next commit.
 *
 * 4. The Arena Challenge Ticket has been buyable since it was written and NOTHING has ever
 *    consumed it. The daily attempt limit is what finally gives it a job, so the check that it is
 *    actually spent is the point of the feature, not a detail of it.
 *
 *   node game-core/battlemaster.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-bm-'));
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
  const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
  let fail = 0;
  const ok = (c, m) => { console.log((c ? "  \\u2713 " : "  \\u2717 ") + m); if (!c) fail++; };
  const sec = (t) => console.log(String.fromCharCode(10) + t);
  const mk = (o) => core.normalizeChar({ ...core.createCharacter("Gladiator", "warrior", "human"), level: 60, ...o });
  const shop = (id) => BM_SHOP.find((e) => e.id === id);

  // --- token payouts ---------------------------------------------------------------------------
  sec("A bout pays, win or lose, and a streak pays more");
  {
    ok(arenaPayout(true, 0) === 11, "the first win pays 11");
    ok(arenaPayout(false, 0) === 1, "a loss still pays 1 \\u2014 a bad session still moves you toward a purchase");
    const walk = [1,2,3,4,5,6,7,8].map((n) => arenaPayout(true, n - 1));
    ok(walk.join(",") === "11,13,15,17,19,21,21,21",
       "wins 1-8 pay " + walk.join(", ") + " \\u2014 +2 a win, holding at 21 from the sixth");
    ok(arenaPayout(true, 999) === 21, "the bonus caps however long the streak runs");
    ok(arenaPayout(false, 20) === 1, "a loss pays the flat 1 regardless of the streak it just ended");

    // THE TUNING IS THE POINT, so it is measured here rather than trusted. Ten bouts a day at a
    // 50% win rate, streaks forming and breaking naturally, against the full 2,500-token chase.
    // The original 5/1/+1 paid 35.7 a day and took 10.0 weeks, which was too long.
    const sim = (winRate) => {
      let total = 0, streak = 0, seed = 12345;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let d = 0; d < 40000; d++) for (let r = 0; r < ARENA.dailyRuns; r++) {
        if (rnd() < winRate) { total += arenaPayout(true, streak); streak++; }
        else { total += arenaPayout(false, streak); streak = 0; }
      }
      return total / 40000;
    };
    const CHASE = 4 * BM_PIECE_COST + 2 * 500 + 4 * bmTemperTotal();
    ok(CHASE === 2500, "the full chase is 2,500 tokens (4 pieces + 2 runes + tempering all four)");
    const perDay = sim(0.5), weeks = CHASE / perDay / 7;
    ok(Math.abs(perDay - 71.7) < 1.5, "a 50% win rate pays " + perDay.toFixed(1) + " tokens a day");
    ok(weeks > 4.5 && weeks < 5.5, "\\u2026so the full chase takes " + weeks.toFixed(1) + " weeks, not the 10.0 it did");
    // A losing player must not be locked out of the shop entirely.
    ok(CHASE / sim(0.4) / 7 < 7.5, "even at a 40% win rate it is " + (CHASE / sim(0.4) / 7).toFixed(1) + " weeks");

    // Where the increase sits was a design decision, so pin it: the loss payout is untouched and
    // the streak stays a small share, or the streak becomes the only way to afford anything.
    ok(ARENA.lossTokens === 1, "the loss payout is UNCHANGED \\u2014 the whole adjustment falls on wins");
    let base = 0, bonus = 0, st = 0, sd = 999;
    const r2 = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 200000; i++) {
      if (r2() < 0.5) { base += ARENA.winTokens; bonus += Math.min(ARENA.streakBonusMax, st) * ARENA.streakBonusPer; st++; }
      else { base += ARENA.lossTokens; st = 0; }
    }
    const share = bonus / (base + bonus);
    ok(share > 0.10 && share < 0.20,
       "the streak is " + Math.round(share * 100) + "% of income \\u2014 a bonus for playing well, not the whole economy");
  }

  // --- the daily allowance, and the ticket it finally gives a job to ---------------------------
  sec("Ten rated bouts a day, then a ticket or nothing");
  {
    const c = mk({});
    ok(ARENA.dailyRuns === 10, "ten attempts a day");
    ok(arenaRunsLeft(c) === 10 && arenaCanEnter(c), "a fresh day starts with all ten");
    const spent = { ...c, arena: { day: utcDayString(), runs: 10, streak: 0 } };
    ok(arenaRunsLeft(spent) === 0, "…and none after ten");
    ok(!arenaCanEnter(spent), "with no ticket, that is the end of the day");
    const withTicket = { ...spent, tickets: { ...spent.tickets, arenaChallenge: 2 } };
    ok(arenaCanEnter(withTicket), "a ticket buys another bout");
    // The allowance is keyed on a UTC day string, so it cannot be reset by changing timezone.
    const yesterday = { ...c, arena: { day: "2020-01-01", runs: 10, streak: 4 } };
    ok(arenaRunsLeft(yesterday) === 10, "yesterday's ten do not count against today");
    ok(arenaToday(yesterday).streak === 4, "…but the streak survives the date roll");
    ok(/toISOString\\(\\)\\.slice\\(0, 10\\)/.test(src), "the day boundary is UTC, not the device's");
  }
  // The ticket is the whole reason the limit exists. Nothing consumed it before this change.
  {
    const gate = src.slice(src.indexOf("const startRatedMatch"), src.indexOf("const startRatedMatch") + 1600);
    ok(gate.indexOf("arenaChallenge: arenaTicketsLeft(c) - 1") > 0,
       "entering the arena on a ticket actually SPENDS it \\u2014 nothing in the game did that before");
    ok(gate.indexOf("if (!arenaCanEnter(c))") > 0, "…and a player with neither attempts nor tickets is refused");
    ok(gate.indexOf("if (!practice)") > 0, "Practice Duels are exempt: they are the lesson, and they record nothing");
    // Charging on ENTRY rather than on the result is deliberate: a counter that only moves at the
    // end can be dodged by retreating from a losing fight, which would void the limit entirely.
    ok(gate.indexOf("runs: a.runs + 1") > 0, "an attempt is charged on entry, so retreating cannot dodge it");
  }

  // --- the set bonus ---------------------------------------------------------------------------
  sec("Battlemaster's Regalia");
  {
    const set = core.GEAR_SETS.battlemaster;
    ok(!!set, "the set exists in the core, where combat can see it");
    ok(set.perPiece === 0.10, "10% a piece, as asked");
    ok(set.pvpOnly === true, "PvP ONLY \\u2014 a global 34% would be the best defensive item in the game");
    ok(set.slots.join(",") === "head,chest,legs,feet", "four slots: helm, breastplate, legguards, sabatons");

    const piece = (slot) => ({ slotId: slot, setId: "battlemaster", sockets: [null, null, null] });
    const withN = (n) => { const c = mk({}); c.equipment = {};
      set.slots.slice(0, n).forEach((s) => { c.equipment[s] = piece(s); }); return c; };
    const at = (n) => core.pvpDamageTakenMult(withN(n));
    ok(at(0) === 1, "no pieces, no reduction");
    ok(Math.abs(at(1) - 0.9) < 1e-9, "one piece: 0.900");
    ok(Math.abs(at(2) - 0.81) < 1e-9, "two: 0.810");
    ok(Math.abs(at(4) - 0.6561) < 1e-9, "four: 0.6561 \\u2014 34.4% less damage taken");
    // The property that matters more than the number.
    ok(at(4) > 0, "compounding can never reach zero damage taken, however many pieces a set gains");
    ok(Math.abs(at(4) - (1 - 0.40)) > 0.05, "…and it is NOT the additive 40%, which is the whole point");
    // Membership rides on the item, so it cannot be faked by naming an item after the set.
    const impostor = mk({}); impostor.equipment = { head: { slotId: "head", name: "Battlemaster's Helm" } };
    ok(core.pvpDamageTakenMult(impostor) === 1, "an item merely NAMED after the set counts for nothing");
    ok(core.setPiecesEquipped(withN(3), "battlemaster") === 3, "the counter reads equipped pieces only");
    const bagged = withN(0); bagged.inventory = [piece("head"), piece("chest")];
    ok(core.pvpDamageTakenMult(bagged) === 1, "pieces sitting in the bank do nothing");
  }

  // --- the runes -------------------------------------------------------------------------------
  sec("Arena runes");
  {
    const aegis = core.ALL_GEMS.find((g) => g.id === "g_aegis");
    const onyx  = core.ALL_GEMS.find((g) => g.id === "g_unfetter");
    ok(aegis && aegis.rarity === "artifact" && aegis.pvpDr === 0.30, "Aegis Diamond: artifact tier, 30% PvP reduction");
    ok(onyx && onyx.rarity === "artifact" && onyx.ccBreak === true, "Unfettered Onyx: artifact tier, breaks a stun");
    ok(aegis.noStack && onyx.noStack, "both are flagged noStack\\u2026");
    ok(/does not stack/i.test(aegis.desc) && /does not stack/i.test(onyx.desc), "\\u2026and both SAY so on the gem");

    const c = mk({}); c.equipment = { head: { slotId: "head", sockets: ["g_aegis", null, null] } };
    ok(Math.abs(core.pvpDamageTakenMult(c) - 0.7) < 1e-9, "one Aegis: 30% less damage");
    c.equipment.head.sockets = ["g_aegis", "g_aegis", "g_aegis"];
    ok(Math.abs(core.pvpDamageTakenMult(c) - 0.7) < 1e-9,
       "THREE Aegis Diamonds are still 30% \\u2014 noStack is enforced, not just advertised");
    // Set and rune are different sources and do compound. This is the intended floor.
    const full = mk({}); full.equipment = {};
    for (const s of ["head", "chest", "legs", "feet"]) full.equipment[s] = { slotId: s, setId: "battlemaster", sockets: [] };
    full.equipment.head.sockets = ["g_aegis"];
    ok(Math.abs(core.pvpDamageTakenMult(full) - 0.6561 * 0.7) < 1e-9,
       "full set + Aegis = 0.459 \\u2014 46% of incoming damage gets through, the intended ceiling");
    ok(core.hasCcBreak(mk({})) === false, "no rune, no stun break");
    const cc = mk({}); cc.equipment = { head: { slotId: "head", sockets: ["g_unfetter"] } };
    ok(core.hasCcBreak(cc) === true, "socketing the Onyx grants it");
    // The stun break is per FIGHT, so it must be marked on the battle and not on the save.
    ok(src.indexOf("w.ccBroken = true") > 0 && src.indexOf("!w.ccBroken && hasCcBreak") > 0,
       "the break is spent on the BATTLE, so 'each fight' means each fight rather than once per character");
  }

  // --- damage actually flows through the reduction ----------------------------------------------
  sec("The reduction reaches the player's health");
  {
    // Every point of arena damage — autos, DoT ticks and casts — accumulates into raw and is
    // mitigated at ONE line. Applying the set at three separate sources would have been three
    // chances to miss one.
    ok(src.indexOf("const dealt = Math.floor(raw * (1 - pmit) * BOT_DMG * tier.dmg * pvpDamageTakenMult(playerChar));") > 0,
       "the PvP damage funnel multiplies by pvpDamageTakenMult");
    const funnels = (src.match(/const dealt = Math\\.floor\\(raw \\* \\(1 - pmit\\)/g) || []).length;
    ok(funnels === 1, "…and there is exactly one such funnel (" + funnels + "), so nothing bypasses it");
  }

  // --- the gear itself --------------------------------------------------------------------------
  sec("A purchased piece is ilvl 65, keeps its chosen stat, and never re-forges");
  {
    ok(BM_PIECE_ILVL === 65 && BM_PIECE_COST === 125, "item level 65, 125 tokens a piece");
    const seed = { shape: { mains: ["str"] }, setId: BM_SET_ID, fixedIlvl: BM_PIECE_ILVL,
                   name: "Battlemaster's Helm", baseName: "Helm" };
    const it = makeArtifact("warrior", "head", 60, seed);
    ok(it.ilvl === 65, "forged at 65 even though artifactIlvl(60) is " + artifactIlvl(60));
    ok(it.setId === "battlemaster", "carries its set membership");
    ok(it.fixedIlvl === 65, "…and the flag that keeps it there");
    ok(it.shape.mains.join(",") === "str", "the CHOSEN main stat wins over the class table");
    ok(it.stats.str > 0 && it.stats.agi === 0, "…and the stats follow it: Strength only");
    ok(it.stats.ap > 0, "a focused piece at 65 earns Attack Power, which is the trade for going single");
    ok((it.sockets || []).length === 3, "three sockets, like any artifact");
    const both = makeArtifact("warrior", "head", 60, { ...seed, shape: { mains: ["str", "agi"] } });
    ok(both.stats.str > 0 && both.stats.agi > 0, "choosing both gives both\\u2026");
    ok(!both.stats.ap, "\\u2026and no Power, because Power is dormant while a piece carries two mains");

    // THE ONE THAT MATTERS. syncArtifacts re-forges every artifact to the level curve.
    ok(src.indexOf("if (it?.artifact && it.fixedIlvl) return it;") > 0,
       "syncArtifacts returns a fixed-ilvl piece untouched \\u2014 without this it drops to " + artifactIlvl(60));
    const guard = src.indexOf("if (it?.artifact && it.fixedIlvl) return it;");
    const reforge = src.indexOf("if (it?.artifact && it.ilvl !== want) {");
    ok(guard > 0 && reforge > guard, "…and the exemption is checked BEFORE the re-forge, not after");
  }

  // --- tempering PvP gear ------------------------------------------------------------------------
  sec("Arena gear tempers on tokens, and stops at +5");
  {
    ok(BM_TEMPER_MAX === 5, "+5 is the cap");
    ok(bmTemperTotal() === 250, "and 250 tokens buys all five (" +
       [1,2,3,4,5].map((r) => BM_TEMPER_COST[r]).join(" + ") + ")");
    ok(BM_TEMPER_MAX <= TEMPER_CFG.safeMax,
       "+5 is inside the SAFE band, so a set piece can never be destroyed and never needs Ven");
    ok(isPvpSetItem({ setId: "battlemaster" }) === true, "the predicate recognises a set piece");
    ok(isPvpSetItem({ setId: null }) === false && isPvpSetItem(null) === false, "…and nothing else");
    const t = src.slice(src.indexOf("const temperItem"), src.indexOf("const temperItem") + 1800);
    ok(t.indexOf("const risky = !pvp && rank >= TEMPER_CFG.safeMax;") > 0, "PvP gear is never in the risky band");
    ok(t.indexOf("(c.arenaTokens || 0) < cost") > 0, "it is paid for in Arena Tokens\\u2026");
    ok(t.indexOf("let gold = pvp ? c.gold : c.gold - cost") > 0, "\\u2026and gold is NOT charged for it");
    ok(t.indexOf("rank >= maxRank") > 0 && t.indexOf("BM_TEMPER_MAX") > 0, "and it refuses past +5");
    // Rerolls stay on gold, as asked — only the + ranks move to tokens.
    const rr = src.slice(src.indexOf("const rerollLine"), src.indexOf("const rerollLine") + 900);
    ok(rr.indexOf("rerollCost(item.rerolls)") > 0 && rr.indexOf("arenaTokens") < 0,
       "rerolling a secondary still costs gold at the normal rate");
  }

  // --- shop prices and limits ---------------------------------------------------------------------
  sec("The shop");
  {
    const want = [["bm_dungeonReset", 100, 5], ["bm_arenaChallenge", 50, 5], ["bm_bankSlots", 150, 3],
                  ["bm_gemEpic", 25, 10], ["bm_gemLegendary", 25, 2],
                  ["bm_runeAegis", 500, null], ["bm_runeUnfetter", 500, null]];
    for (const [id, cost, limit] of want) {
      const e = shop(id);
      ok(!!e && e.cost === cost && (e.limit == null ? null : e.limit) === limit,
         id + ": " + cost + " tokens" + (limit == null ? ", unlimited" : ", limit " + limit));
    }
    for (const slot of BM_SLOTS) ok(shop("bm_" + slot).cost === 125, "bm_" + slot + ": 125 tokens");
    ok(shop("bm_bankSlots").per === "life", "the bank expansion limit is LIFETIME");
    ok(shop("bm_gemEpic").per === "week" && shop("bm_dungeonReset").per === "week", "the rest reset weekly");

    // Weekly counters reset by comparing a stored week key, so nothing has to run on a schedule.
    const e = shop("bm_gemEpic");
    const c = mk({ arenaTokens: 1000, bm: { week: utcWeekString(), counts: { bm_gemEpic: 10 } } });
    ok(bmLeft(c, e) === 0 && !bmCanBuy(c, e), "ten epic gems this week is the lot");
    const lastWeek = mk({ arenaTokens: 1000, bm: { week: "2020-01-06", counts: { bm_gemEpic: 10 } } });
    ok(bmLeft(lastWeek, e) === 10 && bmCanBuy(lastWeek, e), "…and last week's count does not follow you into this one");
    const life = shop("bm_bankSlots");
    const used = mk({ arenaTokens: 1000, bm: { week: "2020-01-06", life: { bm_bankSlots: 3 } } });
    ok(bmLeft(used, life) === 0, "a LIFETIME limit is not wiped by a new week");
    ok(!bmCanBuy(mk({ arenaTokens: 0 }), e), "and you still have to be able to afford it");
    // Monday-based, because Sunday is day 0 in JS and would start the week on the day players
    // treat as its end.
    ok(utcWeekString("2026-08-05") === "2026-08-03", "the week starts on Monday (5 Aug 2026 -> Mon 3rd)");
    ok(utcWeekString("2026-08-09") === "2026-08-03", "…and Sunday the 9th still belongs to it");
    ok(utcWeekString("2026-08-10") === "2026-08-10", "…while Monday the 10th starts the next");
  }

  // --- reachability -------------------------------------------------------------------------------
  sec("A player can actually get there");
  {
    // The market renders its stalls from MARKET_STALLS now, so there is no literal
    // setTab("battlemaster") to grep for. Reading the table proves the same thing
    // and proves it better: the stall has to be listed for the button to exist.
    ok(MARKET_STALLS.some((st) => st.dest === "battlemaster"),
       "the Market hub carries a Battlemaster stall");
    ok(src.indexOf('{tab === "battlemaster" && (() => {') > 0, "…and the tab renders");
    ok(src.indexOf('onClick={() => (e.kind === "setPiece" ? setBmPick(e) : buyBattlemaster(e))}') > 0,
       "every row buys, and a set piece opens the stat chooser first");
    ok(src.indexOf("buyBattlemaster(bmPick, o.mains)") > 0, "the chooser passes the chosen mains through");
    ok(src.indexOf("Cancel — keep my") > 0, "…and it can be cancelled without spending, since the choice is permanent");
    const buy = src.slice(src.indexOf("const buyBattlemaster"), src.indexOf("const buyBattlemaster") + 1500);
    ok(buy.indexOf("if (bmLeft(c, entry) <= 0)") > 0, "the purchase re-checks the limit against live state");
    ok(buy.indexOf("arenaTokens: (c.arenaTokens || 0) - entry.cost") > 0, "…and actually spends the tokens");
    ok(buy.indexOf("gold: (nc.gold || 0) + dep.gold") > 0,
       "a set piece banks through depositItems, ADDING the auto-sell proceeds rather than replacing the purse");
  }

  console.log(fail ? String.fromCharCode(10) + "\\u274c " + fail + " Battlemaster check(s) failed"
                   : String.fromCharCode(10) + "\\u2705 Battlemaster: PvP-only set that compounds, gear that never re-forges, and a ticket that is finally spent");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'bm.cjs'); fs.writeFileSync(runf, js);
require(runf);
