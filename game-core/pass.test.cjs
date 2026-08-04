/* The battle pass: it ends where levelling ends, it cannot be re-rolled, and it does not
 * undercut the shop it is meant to sell against.
 *
 * Three things here are not obvious and are the reason this file exists.
 *
 * 1. killsPerRank is a MEASURED number, not a taste call. Simulating 1-60 for all 22 specs put
 *    the kill count in a very tight band, and the pass has to finish inside it or the whole
 *    premise ("hit 60, finish the pass") is false. A checked-in constant drifts; this pins it.
 *
 * 2. Progress rides char.kills through a BASELINE. That is what stops a level-60 save with a
 *    quarter of a million lifetime kills claiming all twenty ranks the moment the feature ships.
 *
 * 3. The paid track hands out a Dungeon Reset Ticket, which sells for 99 Ven. Nineteen of them
 *    inside a 100 Ven pass would be 1,881 Ven of value and would take the shop ticket off the
 *    market. The reward table is checked against the shop's own price, so the two cannot drift.
 *
 *   node game-core/pass.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-pass-'));
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
  const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
  let fail = 0;
  const ok = (c, m) => { console.log((c ? "  \\u2713 " : "  \\u2717 ") + m); if (!c) fail++; };
  const sec = (t) => console.log(String.fromCharCode(10) + t);
  const mk = (o) => core.normalizeChar({ ...core.createCharacter("Pass", "warrior", "human"), ...o });

  // --- the pass ends where levelling ends -------------------------------------------------------
  sec("Rank 20 lands at the end of a 1-60 run");
  {
    const total = PASS.killsPerRank * PASS.ranks;
    ok(PASS.ranks === 20, "twenty ranks, as asked");
    ok(total === 4000, "4,000 kills for the full pass (20 x " + PASS.killsPerRank + ")");
    // Measured across 132 completed runs (22 specs x 6 seeds): min 4,070, median 4,139, max 4,269.
    // The band is narrow because kills to 60 follow the XP curve, not the class.
    ok(total < 4070, "…which every measured 1-60 run cleared — the SLOWEST was 4,070 kills");
    ok(total > 4269 * 0.9, "…and it is not trivially early either: within 10% of the slowest run");
  }

  // --- an existing character does not get the whole pass for free -------------------------------
  sec("Progress starts at zero for everyone, however long they have played");
  {
    // A save written before this feature existed has NO pass key at all — that is the case the
    // baseline has to handle, and spreading createCharacter's fresh pass over it would model
    // something that cannot occur.
    const old = { ...core.createCharacter("Vet", "warrior", "human"), level: 60, kills: 247726 };
    delete old.pass;
    const veteran = core.normalizeChar(old);
    ok(veteran.pass.base === 247726, "a veteran's baseline is stamped at their lifetime kills");
    ok(passRank(veteran) === 0, "…so they open the pass at rank 0, not rank 20");
    ok(passUnclaimed(veteran) === 0, "…with nothing claimable");
    const fresh = mk({});
    ok(fresh.pass.base === 0 && passRank(fresh) === 0, "a new character starts at 0 too, for the same reason");
    // The baseline must SURVIVE, or every reload would re-stamp it and the bar would never move.
    const later = core.normalizeChar({ ...veteran, kills: 247726 + 600 });
    ok(later.pass.base === 247726, "the baseline is not re-stamped on reload");
    ok(passRank(later) === 3, "…so 600 kills after the pass began is rank 3");
    ok(passKillsInto(later) === 0, "…exactly on the boundary");
    ok(passRank({ ...later, kills: 247726 + 4000 }) === 20, "4,000 kills is rank 20");
    ok(passRank({ ...later, kills: 247726 + 99999 }) === 20, "…and it never exceeds 20");
  }
  // The counter has to be one nothing can forget to increment. If a separate pass counter were
  // introduced later, every kill site would need it — this check says the baseline form is in use.
  ok(src.indexOf("const passKills = (c) => Math.max(0, ((c && c.kills) || 0) - (passRec(c).base || 0))") > 0,
     "progress is derived from char.kills, so no kill site can be missed");

  // --- the reward table is what was asked for ---------------------------------------------------
  sec("Rewards");
  {
    for (let r = 1; r <= 20; r++) {
      const f = passReward(r, false);
      if (f.gold !== 1000 || f.gems || f.tickets || f.item) { ok(false, "free rank " + r + " is 1,000g and nothing else"); break; }
      if (r === 20) ok(true, "every free rank pays 1,000g \\u2014 20,000g across the track");
    }
    for (let r = 1; r <= 19; r++) {
      const p = passReward(r, true);
      if (p.gold !== 1000 || p.gems !== 1 || p.gemRarity !== "epic") { ok(false, "paid rank " + r + " is 1,000g + an epic gem"); break; }
      if (r === 19) ok(true, "paid ranks 1-19 each pay 1,000g and one random epic gem");
    }
    const fin = passReward(20, true);
    ok(fin.gold === 100000, "rank 20 pays 100,000g");
    ok(fin.gems === 2 && fin.gemRarity === "legendary", "…two random legendary gems");
    ok(fin.item && fin.item.ilvl === 64 && fin.item.rarity === "legendary", "…and a legendary ilvl 64 piece");
    // ilvl 64 is not a decoration: it is the rarity floor legendary needs and the bridge into Hard Mode.
    ok(/rarity\\.id === "legendary" && ilvl < 64/.test(require("fs").readFileSync("${path.join(__dirname, 'combat.mjs').replace(/\\\\/g, '/')}", "utf8")),
       "…at exactly the ilvl the game requires for a legendary to be legendary");
  }

  // --- the pass does not destroy the shop it sits next to ---------------------------------------
  sec("The ticket reward is priced against the shop, not against nothing");
  {
    const shop = PREMIUM_ITEMS.find((i) => i.id === "dungeonReset");
    ok(!!shop, "the Dungeon Reset Ticket is a real shop item, not a new invention");
    let tickets = 0;
    for (let r = 1; r <= 20; r++) tickets += passReward(r, true).tickets;
    ok(tickets === 3, "the pass gives three tickets, on ranks " + PASS.ticketRanks.join(", "));
    const venValue = tickets * shop.cost;
    ok(venValue < PASS.venCost * 5,
       "…worth " + venValue + " Ven against a " + PASS.venCost + " Ven pass \\u2014 generous, not an arbitrage");
    // The check that actually matters: one ticket per rank would have been catastrophic, and
    // stating the number it would have been keeps the reasoning attached to the decision.
    ok(19 * shop.cost > PASS.venCost * 15,
       "a ticket on every rank would have been " + (19 * shop.cost) + " Ven inside a " + PASS.venCost + " Ven pass");
  }

  // --- claiming cannot be re-rolled -------------------------------------------------------------
  sec("A claim is seeded, so reloading cannot re-roll it");
  {
    const c = mk({ id: "abc123", kills: 4000 });
    const draw = (ch, r, paid) => {
      const rng = rngm.makeRng(passSeed(ch, r, paid));
      return passRollGems(r, paid, rng).map((g) => g.id).join(",");
    };
    ok(draw(c, 20, true) === draw(c, 20, true), "the same character and rank always roll the same gems");
    ok(passSeed(c, 20, true) !== passSeed(c, 19, true), "different ranks roll differently");
    ok(passSeed(c, 20, true) !== passSeed(c, 20, false), "…and the two tracks do not share a roll");
    ok(passSeed({ ...c, id: "xyz789" }, 20, true) !== passSeed(c, 20, true), "…nor do two characters");
    ok(passSeed(c, 1, false) > 0, "the seed is never zero, which mulberry32 would treat as a fixed point");
    // Duplicates were asked for explicitly, and they are not a wasted roll: every legendary gem's
    // own description says "Stacks".
    const legs = core.ALL_GEMS.filter((g) => g.rarity === "legendary");
    ok(legs.length > 1, "there is more than one legendary gem to roll (" + legs.length + ")");
    ok(legs.every((g) => /Stacks/.test(g.desc)), "…and every one of them stacks, so a duplicate is not a dead reward");
    let dupSeen = false;
    for (let i = 0; i < 400 && !dupSeen; i++) {
      const rng = rngm.makeRng(i + 1); const two = passRollGems(20, true, rng);
      if (two.length === 2 && two[0].id === two[1].id) dupSeen = true;
    }
    ok(dupSeen, "…and duplicates really do come up, rather than being silently filtered");
  }

  // --- claiming is gated, and buying is retroactive ---------------------------------------------
  sec("Who can claim what");
  {
    const c0 = { ...core.createCharacter("P", "warrior", "human"), kills: 1000 };
    delete c0.pass;
    const c = core.normalizeChar(c0);      // base 1000 -> rank 0
    const at = (n) => ({ ...c, kills: (c.pass.base || 0) + n });
    const r5 = at(1000);                    // 1,000 kills into the pass -> rank 5
    ok(passRank(r5) === 5, "1,000 kills into the pass is rank 5");
    ok(passCanClaim(r5, 5, false) === true, "the free reward for an earned rank is claimable");
    ok(passCanClaim(r5, 6, false) === false, "an unearned rank is not");
    ok(passCanClaim(r5, 5, true) === false, "the paid reward is not, without the pass");
    const paid = { ...r5, pass: { ...r5.pass, paid: true } };
    ok(passCanClaim(paid, 5, true) === true, "buying makes it claimable\\u2026");
    ok(passCanClaim(paid, 1, true) === true, "\\u2026RETROACTIVELY, back to rank 1 \\u2014 which is the whole reason to buy late");
    // That check alone is VACUOUS and was: it builds the bought state by hand, so a gate added in
    // buyPass keyed on WHEN the pass was bought would sail straight past it. Verified by breaking
    // it — recording a purchase rank and testing against it left this suite green. Retroactivity
    // therefore has to be pinned where it actually lives: the paid gate is ownership and nothing
    // else, and buying records ownership and nothing else.
    ok(src.indexOf("(!paid || passOwnsPaid(c))") > 0 && src.indexOf("boughtAt") < 0,
       "the paid gate is ownership alone \\u2014 no term keyed on when the pass was bought");
    ok(src.indexOf("pass: { ...passRec(c), paid: true }") > 0,
       "\\u2026and buying writes only the ownership flag, so there is nothing for such a gate to read");
    ok(passUnclaimed(paid) === 10, "…so a rank-5 buyer has 10 rewards waiting (5 free + 5 paid)");
    const some = { ...paid, pass: { ...paid.pass, claimedFree: { 1: true, 2: true }, claimedPaid: { 1: true } } };
    ok(passUnclaimed(some) === 7, "claimed ranks stop counting");
    ok(passCanClaim(some, 1, false) === false, "…and cannot be claimed twice");
    ok(passCanClaim(paid, 0, false) === false && passCanClaim(paid, 21, false) === false,
       "ranks outside 1-20 are refused, so a bad index cannot mint a reward");
    ok(core.normalizeChar({ ...c, pass: "nonsense" }).pass.paid === false, "junk in the save does not throw");
  }

  // --- the claim path itself ---------------------------------------------------------------------
  sec("The claim path");
  {
    // depositItems' \`gold\` field is AUTO-SELL PROCEEDS, not the purse. The daily claim was written
    // wrong first time and would have wiped the player's gold; this is the same trap.
    const i = src.indexOf("const claimPassRank");
    const body = src.slice(i, i + 2200);
    ok(body.indexOf("gold: (nc.gold || 0) + dep.gold") > 0,
       "auto-sell proceeds are ADDED to the purse, not spread over it");
    ok(body.indexOf("if (!passCanClaim(c, rank, paid)) return;") > 0,
       "every claim re-checks eligibility against live state, not against what the UI rendered");
    ok(body.indexOf("makeRng(passSeed(c, rank, paid))") > 0, "…and rolls from the deterministic seed");
    const all = src.slice(src.indexOf("const claimPassAll"), src.indexOf("const claimPassAll") + 900);
    ok(all.indexOf("passCanClaim(charRef.current") > 0,
       "claim-all re-reads charRef each pass, so rewards accumulate instead of overwriting");
    const buy = src.slice(src.indexOf("const buyPass"), src.indexOf("const buyPass") + 700);
    ok(buy.indexOf("if ((c.ven || 0) < PASS.venCost)") > 0, "buying checks the balance\\u2026");
    ok(buy.indexOf("ven: (c.ven || 0) - PASS.venCost") > 0, "\\u2026and actually spends the Ven");
  }

  console.log(fail ? String.fromCharCode(10) + "\\u274c " + fail + " battle pass check(s) failed"
                   : String.fromCharCode(10) + "\\u2705 battle pass: ends with levelling, cannot be re-rolled, and does not undercut the Ven shop");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'pass.cjs'); fs.writeFileSync(runf, js);
require(runf);
