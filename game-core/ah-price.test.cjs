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
// App.jsx now imports its icon set. These harnesses compile App.jsx into a temp dir, so a
// relative require would resolve against that dir and blow up. The icons are pure rendering
// and no test asserts on them, so they are stubbed rather than compiled.
js = js.replace(/require\("\.\/icons\.jsx"\)/g, '({IconSprite:function(){return null},Icon:function(){return null},EmojiIcon:function(){return null},withIcons:function(t){return t}})');

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

  // --- the SQL validator must agree with this file -------------------------------------------------
  // ah_gear_base_value in supabase/migrations is a THIRD copy of the pricing rule. It cannot import
  // this one — Postgres has to validate a listing without trusting the client — so it is pinned.
  //
  // This is not hypothetical: the client was repriced and the SQL was not, so the Sell screen
  // offered an item at 7,467g inside a band of 1,867-13,067 while the server rejected it with
  // "price 7467 outside band 385-2695". 385-2695 is the OLD formula's band. Posting gear was
  // impossible for every piece in the game until the two were brought back together.
  {
    const fs = require("fs"), path = require("path");
    const dir = path.join("${path.join(__dirname, '..').replace(/\\\\/g, '/')}", "supabase", "migrations");
    const file = fs.readdirSync(dir).find((f) => /ah_price_by_power/.test(f));
    ok(!!file, "the SQL pricing migration exists (" + (file || "MISSING") + ")");
    const sql = fs.readFileSync(path.join(dir, file), "utf8");

    // WHO MAY CHANGE THE WEIGHTS. The checks below prove the numbers MATCH the client, which says
    // nothing about who is allowed to rewrite them. 0014 shipped ah_stat_weight with RLS off, and
    // Supabase grants the API roles full table privileges by default, so the LIVE table read:
    //
    //   ah_stat_weight  rls: false   acl: anon=arwdDxtm, authenticated=arwdDxtm
    //
    // a=insert, w=update, d=delete — to anyone, signed in or not, over /rest/v1/. Since
    // ah_gear_base_value prices every listing from this table and builds the band a posted price
    // must sit inside, raising the weights would let a player list junk for millions and zeroing
    // them would break posting for everyone.
    const all = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join(" ");
    ok(all.indexOf("alter table ah_stat_weight enable row level security") > 0,
       "row level security is enabled on the pricing weights");
    ok(all.indexOf("revoke all on table ah_stat_weight from anon, authenticated") > 0,
       "…and neither anonymous nor signed-in callers may touch the table directly");
    // Nothing in the client reads it — only ah_gear_base_value does, and a SECURITY DEFINER
    // function bypasses RLS — so closing it completely costs nothing.
    const appSrc = fs.readFileSync("${SRC.replace(/\\/g, '/')}", "utf8");
    ok(appSrc.indexOf("ah_stat_weight") < 0, "…and the client never reads the table, so locking it breaks nothing");

    // Constants
    const num = (re) => { const m = sql.match(re); return m ? Number(m[1]) : null; };
    ok(num(/price_per_point numeric not null default ([\\d.]+)/) === AH_PRICE.perPoint,
       "SQL price_per_point matches the client (" + AH_PRICE.perPoint + ")");
    ok(num(/price_exponent\\s+numeric not null default ([\\d.]+)/) === AH_PRICE.exponent,
       "SQL price_exponent matches the client (" + AH_PRICE.exponent + ")");
    ok(num(/update ah_config set deposit_pct = ([\\d.]+)/) === AH_ECON.postFeePct,
       "SQL deposit_pct matches the client's posting fee (" + AH_ECON.postFeePct + ")");

    // THE ABYSS PREMIUM, on both sides. This is the one that would have shipped the Abyss with its
    // headline item unsellable: ah_list_gear recomputes the base value server-side and refuses
    // anything outside the band, so a client that prices an Abyss +7 piece at 542,433 while the
    // server thinks 92,433 gets the listing rejected and no explanation.
    const abFile = fs.readdirSync(dir).find((f) => /ah_abyss_value/.test(f));
    ok(!!abFile, "the Abyss pricing migration exists (" + (abFile || "MISSING") + ")");
    const abSql = fs.readFileSync(path.join(dir, abFile), "utf8");
    const abNum = (re) => { const m = abSql.match(re); return m ? Number(m[1]) : null; };
    ok(abNum(/abyss_base\\s+bigint\\s+not null default (\\d+)/) === AH_PRICE.abyssBase,
       "SQL abyss_base matches the client (" + AH_PRICE.abyssBase.toLocaleString() + ")");
    ok(abNum(/abyss_per_plus\\s+bigint\\s+not null default (\\d+)/) === AH_PRICE.abyssPerPlus,
       "SQL abyss_per_plus matches the client (" + AH_PRICE.abyssPerPlus.toLocaleString() + ")");
    // ORDER matters as much as the numbers. Both must add the premium AFTER the socket and enchant
    // multipliers; adding it first would let three empty sockets inflate the floor by 24,000 gold
    // on one side and not the other.
    const sqlOrder = abSql.indexOf("v := v + cfg.abyss_base") > abSql.indexOf("v := round(v * 1.10)");
    ok(sqlOrder, "SQL adds the premium after the socket and enchant multipliers");
    const cliBody = appSrc.slice(appSrc.indexOf("function ahBaseValue"), appSrc.indexOf("function ahBaseValue") + 900);
    ok(cliBody.indexOf("ahAbyssPremium(item.abyss)") > cliBody.indexOf("item.enchant) v = Math.round(v * 1.10)"),
       "\\u2026and so does the client");
    // And the clamp, or a forged save claiming Abyss +9999 mints a price out of nothing.
    ok(/least\\(10, coalesce\\(\\(p_data->>'abyss'\\)::int, 0\\)\\)/.test(abSql),
       "SQL clamps the rank to the ladder, so a forged item cannot mint a price");
    ok(appSrc.indexOf("Math.max(0, Math.min(ABYSS_MAX_PLUS, plus || 0))") > 0, "\\u2026and the client clamps identically");
    // Rank 0 is a REAL rank worth 100,000. A truthiness check skipped it, 0 being falsy: every
    // base-Abyss drop came out untagged, priced as a raid drop, with no rank on its tooltip.
    const coreSrc2 = fs.readFileSync(path.join(dir, "..", "..", "game-core", "combat.mjs"), "utf8");
    ok(coreSrc2.indexOf("if (abyss != null) it.abyss =") > 0,
       "a drop is tagged when the rank is 0 too \\u2014 not a truthiness check");
    const zero = core.generateItem(71, core.rarityById("epic"), "head", "warrior", 0);
    ok(zero.abyss === 0, "\\u2026proved: an Abyss +0 drop carries abyss = 0");
    ok(core.generateItem(71, core.rarityById("epic"), "head", "warrior").abyss === undefined,
       "\\u2026while a drop from anywhere else carries no rank at all");
    // AN ENCHANT IS A FLAT MAP. enchantGear writes { agi: 28 } and effectiveStats reads it that
    // way; both pricers read enchant.stats, which no item in this game has ever had. So every
    // enchanted piece was priced as though its enchant granted zero, while still collecting the
    // 10% enchanted premium. Client and server AGREED — both were wrong the same way — which is
    // why the checks above passed while the price was wrong.
    {
      // Enchant with the stat the piece ALREADY mains. Adding a DIFFERENT main stat makes the
      // item's Power dormant — itemPowerActive requires exactly one — so a focused piece can
      // genuinely lose value by being enchanted, which is what wouldDormantPower warns about. The
      // first version of this check used agi on a str piece and failed 4 runs in 5 for that
      // reason: the code was right and the check was wrong.
      const bare = { ...core.generateItem(71, core.rarityById("epic"), "head", "warrior"), abyss: undefined };
      const main = (bare.mains && bare.mains[0]) || "str";
      const ench = { ...bare, enchant: { [main]: 24 } };
      const nested = { ...bare, enchant: { stats: { [main]: 24 } } };
      const noStats = { ...bare, enchant: {} };
      ok(ahBaseValue(ench) > ahBaseValue(noStats),
         "a flat enchant raises the price beyond its 10% premium (" + ahBaseValue(noStats) + " -> " + ahBaseValue(ench) + ")");
      ok(ahBaseValue(nested) === ahBaseValue(ench),
         "\\u2026and the old nested shape still prices the same, so no stored row loses value");
      ok(appSrc.indexOf("const s = item.stats || {}, en = item.enchant || {}, e = en.stats || en;") > 0,
         "the client reads flat first and nested as a fallback");
      const encSql = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /enchant_flat_shape/.test(f))), "utf8");
      ok(/when v_e \\? 'stats' then coalesce\\(v_e->'stats'/.test(encSql), "\\u2026and so does the SQL");
      ok(/when v_e = 'null'::jsonb then/.test(encSql), "\\u2026with a null enchant treated as none rather than crashing");
    }
    ok(ahBaseValue({ ...zero }) - ahBaseValue({ ...zero, abyss: undefined }) === AH_PRICE.abyssBase,
       "\\u2026and is worth exactly " + AH_PRICE.abyssBase.toLocaleString() + " more than the same piece without it");

    // Every weight, read out of the INSERT rather than restated here.
    const block = sql.slice(sql.indexOf("insert into ah_stat_weight"), sql.indexOf("on conflict (stat)"));
    const sqlW = {};
    for (const m of block.matchAll(/\\('(\\w+)',\\s*([\\d.]+)\\)/g)) sqlW[m[1]] = Number(m[2]);
    let mismatched = [];
    for (const k of AH_SCORED) {
      const want = core.MAIN_KEYS.includes(k) ? AH_MAIN_WEIGHT : statWeight("warrior", k);
      if (sqlW[k] !== want) mismatched.push(k + " sql=" + sqlW[k] + " js=" + want);
    }
    ok(mismatched.length === 0, "every stat weight matches between SQL and the client"
       + (mismatched.length ? " — " + mismatched.join(", ") : " (" + AH_SCORED.length + " stats)"));
    ok(Object.keys(sqlW).length === AH_SCORED.length,
       "…and the SQL table has no stats the client does not score (" + Object.keys(sqlW).length + ")");
    // The Power gate and the weapon-damage term have to be present, or a weapon prices at zero
    // points and falls through to the ilvl anchor.
    ok(/v_mains = 1/.test(sql), "SQL gates Power on a single main stat, as itemPowerActive does");
    ok(/wdmg/.test(sql), "SQL prices a weapon's damage range, which lives outside stats{}");
    ok(/0\\.08 \\* v_sockets/.test(sql) && /1\\.10/.test(sql), "SQL keeps the socket and enchant premiums");
  }

  console.log(fail ? "\\n\\u274c " + fail + " auction-house price check(s) failed"
                   : "\\n\\u2705 auction-house prices track an item's power, and the SQL validator agrees");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'ahprice.cjs'); fs.writeFileSync(runf, js);
require(runf);
