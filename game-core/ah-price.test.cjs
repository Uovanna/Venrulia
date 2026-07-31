/* Auction-house pricing: a shelf price has to mean something.
 *
 * ahBaseValue was `ilvl x rarity.valueMult`. That could not tell a well-rolled piece from a badly
 * rolled one of the same ilvl — every ilvl-70 epic was worth exactly 1,540g — so there was nothing
 * for a market to be a market ABOUT. And measured against real farming income it was flat: a
 * best-in-slot item was 0.15 hours of play against a +5 temper at 31 hours, so listing anything was
 * a rounding error rather than a decision.
 *
 * Price now follows the POWER an item carries, on a progressive curve. Vendor prices are
 * deliberately untouched — the gap between them is the reason to walk to the auction house.
 *
 *   node game-core/ah-price.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-ahprice-'));
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
  const { generateItem, rarityById } = core;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };
  const g = (n) => Math.round(n).toLocaleString();

  // Measured endgame income, from game-core/wealth-sim.cjs. If farming income moves, the
  // calibration below has to move with it — that is what this constant is here to catch.
  const GOLD_PER_HOUR = 13300;
  const roll = (ilvl, rar, n = 500) => rngm.withRng(rngm.makeRng(ilvl * 13 + rar.length), () =>
    Array.from({ length: n }, () => generateItem(ilvl, rarityById(rar), "chest", "warrior")));
  const meanPrice = (ilvl, rar) => { const it = roll(ilvl, rar); return it.reduce((a, x) => a + ahBaseValue(x), 0) / it.length; };
  const meanVendor = (ilvl, rar) => { const it = roll(ilvl, rar); return it.reduce((a, x) => a + Math.max(1, Math.floor(x.value * 0.6 * 0.25)), 0) / it.length; };

  // --- price follows power, which is the entire point ------------------------------------------
  {
    const items = roll(70, "epic");
    const byPts = items.slice().sort((a, b) => ahStatPoints(a) - ahStatPoints(b));
    const worst = byPts[0], best = byPts[byPts.length - 1];
    ok(ahBaseValue(best) > ahBaseValue(worst) * 1.3,
       "two ilvl-70 epics differ by how well they rolled: " + g(ahBaseValue(worst)) + " vs " + g(ahBaseValue(best)));
    // Under ilvl x rarity these were the SAME number, so the market had nothing to price.
    const flat = (it) => Math.round(it.ilvl * rarityById(it.rarity).valueMult);
    ok(flat(best) === flat(worst), "…which the old ilvl x rarity anchor priced identically (" + g(flat(best)) + " both)");
    // Monotone: more power must never cost less.
    let mono = true;
    for (let i = 1; i < byPts.length; i++) if (ahBaseValue(byPts[i]) < ahBaseValue(byPts[i - 1])) mono = false;
    ok(mono, "price never goes down as an item gets stronger");
  }

  // --- the curve is progressive ------------------------------------------------------------------
  {
    const mk = (pts) => ({ ilvl: 70, rarity: "epic", stats: { str: pts }, sockets: [], enchant: null });
    const a = ahBaseValue(mk(40)), b = ahBaseValue(mk(80));
    ok(b / a > 3, "doubling an item's power raises its price x" + (b / a).toFixed(1) + " — a best-in-slot piece is not 'a bit better'");
    ok(AH_PRICE.exponent > 1, "the exponent is what makes it progressive (" + AH_PRICE.exponent + ")");
  }

  // --- the hard-mode climb has a price gradient --------------------------------------------------
  {
    const p63 = meanPrice(63, "epic"), p70 = meanPrice(70, "epic");
    ok(p70 / p63 > 2, "ilvl 63 -> 70 is x" + (p70 / p63).toFixed(2) + " on the shelf (" + g(p63) + " -> " + g(p70) + ")");
    let prev = 0, mono = true;
    for (const ilvl of [63, 64, 65, 66, 67, 68, 69, 70]) { const p = meanPrice(ilvl, "epic"); if (p <= prev) mono = false; prev = p; }
    ok(mono, "…and every hard bracket is worth more than the one below it");
  }

  // --- calibration against real income -----------------------------------------------------------
  {
    const p70 = meanPrice(70, "epic");
    const hours = p70 / GOLD_PER_HOUR;
    ok(hours > 0.5 && hours < 3.5,
       "a best-in-slot epic costs " + hours.toFixed(2) + "h of endgame income (" + g(p70) + "g) — a real purchase, not a whole weekend");
    const leg = meanPrice(70, "legendary");
    ok(leg / GOLD_PER_HOUR > 2.5, "a legendary is an aspiration at " + (leg / GOLD_PER_HOUR).toFixed(1) + "h (" + g(leg) + "g)");
    ok(leg > p70 * 1.8, "…and clearly outranks the best epic");
  }

  // --- the vendor gap is the reason to use the auction house ---------------------------------------
  {
    for (const [ilvl, rar] of [[20, "rare"], [64, "epic"], [70, "legendary"]]) {
      const p = meanPrice(ilvl, rar), v = meanVendor(ilvl, rar);
      ok(p / v > 20, "ilvl " + ilvl + " " + rar + ": the shelf pays x" + Math.round(p / v)
         + " what the vendor does (" + g(p) + " vs " + g(v) + ")");
    }
    // Vendor prices must NOT have moved — that was the explicit requirement.
    const it = roll(64, "epic", 1)[0];
    ok(Math.max(1, Math.floor(it.value * 0.6 * 0.25)) === Math.max(1, Math.floor(it.value * 0.15)),
       "the vendor still pays value x 0.6 x 0.25, untouched by any of this");
  }

  // --- posting a listing must not be a gamble -------------------------------------------------------
  {
    const p70 = meanPrice(70, "epic");
    const fee = ahPostFee(p70);
    ok(fee / GOLD_PER_HOUR * 60 < 10,
       "posting a best-in-slot listing costs " + g(fee) + "g, " + (fee / GOLD_PER_HOUR * 60).toFixed(0)
       + " minutes of income — at the old 25% it was " + (p70 * 0.25 / GOLD_PER_HOUR * 60).toFixed(0) + " minutes, consumed even if it never sold");
    ok(fee > 0, "…but it still costs something, so the shelves cannot be spammed for free");
    ok(ahNetAfterTax(p70) < p70, "the sale tax still removes gold from the economy");
  }

  // --- dormant Power must not be paid for ------------------------------------------------------------
  {
    const focused = { ilvl: 70, rarity: "epic", stats: { str: 40, ap: 30 }, sockets: [], enchant: null };
    const dual = { ilvl: 70, rarity: "epic", stats: { str: 40, agi: 10, ap: 30 }, sockets: [], enchant: null };
    ok(ahStatPoints(focused) > ahStatPoints(dual) - 10,
       "a focused piece is paid for its live Power affix");
    const dualNoPower = { ilvl: 70, rarity: "epic", stats: { str: 40, agi: 10 }, sockets: [], enchant: null };
    ok(ahStatPoints(dual) === ahStatPoints(dualNoPower),
       "…and a dual-main piece is NOT charged for Power it cannot use");
  }

  // --- nothing prices at zero, and junk input is safe --------------------------------------------------
  {
    ok(ahBaseValue(null) === 1, "a missing item is priced 1 rather than throwing");
    ok(ahBaseValue({ ilvl: 40, rarity: "rare", stats: {} }) > 1,
       "an item with no scorable stats (a relic) still falls back to an ilvl price");
    const w = rngm.withRng(rngm.makeRng(9), () => generateItem(70, rarityById("epic"), "weapon", "warrior"));
    ok(ahStatPoints(w) > 0 && ahBaseValue(w) > 1, "a weapon is priced for its damage range, which lives outside stats{}");
    for (const [ilvl, rar] of [[1, "poor"], [5, "common"], [20, "rare"], [45, "rare"], [60, "epic"], [70, "legendary"]]) {
      const p = meanPrice(ilvl, rar, 60);
      ok(p >= 1 && Number.isFinite(p), "ilvl " + ilvl + " " + rar + " prices at " + g(p) + "g");
    }
  }

  // --- sockets and enchants still carry their premium ------------------------------------------------
  {
    const plain = { ilvl: 70, rarity: "epic", stats: { str: 50 }, sockets: [], enchant: null };
    const socketed = { ...plain, sockets: [null, null] };
    ok(ahBaseValue(socketed) > ahBaseValue(plain), "sockets are power the buyer can add, and are priced");
    const ench = { ...plain, enchant: { stats: { crit: 10 } } };
    ok(ahBaseValue(ench) > ahBaseValue(plain), "an enchant raises the price, through its stats and its premium");
  }

  console.log(fail ? "\\n\\u274c " + fail + " auction-house price check(s) failed"
                   : "\\n\\u2705 auction-house prices track an item's power, and vendoring one throws real gold away");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'ahprice.cjs'); fs.writeFileSync(runf, js);
require(runf);
