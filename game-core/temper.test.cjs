/* Tempering must never be walled off by dice, and a success must never destroy the item.
 *
 * The old forge rolled destruction and de-rank INDEPENDENTLY, and rolled them alongside success
 * rather than instead of it — so a successful temper could still destroy the piece, and the shop
 * displayed "Success 26% · De-rank 35% · Destroy 60%", figures summing to 121% that no single roll
 * could ever produce. Pushing one piece from +0 to +10 cost a median of 63,745,000 gold and FIFTEEN
 * destroyed items, which at 13,180 gold an hour is 4,836 hours.
 *
 * Every failure now raises the next attempt's chance until the rank is guaranteed. De-rank is gone
 * — it was the one outcome that destroyed paid progress, and it worked directly against the pity it
 * was sharing a roll with. Destruction survives, but only on a FAILED attempt and at a fraction of
 * the old rate: at the old 60% the piece dies in under two attempts, long before a 1% base chance
 * has climbed anywhere, which measured at 3.27 BILLION gold and 686 items destroyed.
 *
 *   node game-core/temper.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-temper-'));
execSync(`tsc "${SRC}" --jsx react --target es2020 --module commonjs --outDir "${dir}" --allowJs --checkJs false --noResolve`, { stdio: 'inherit' });
const outName = fs.readdirSync(dir).find((f) => f.endsWith('.js'));
let js = fs.readFileSync(path.join(dir, outName), 'utf8');
const stub = '({default:{Component:function(){},createElement:function(){return{}},Fragment:"F"},useState:0,useEffect:0,useRef:0,useCallback:0,createElement:function(){return{}},Component:function(){},Fragment:"F"})';
js = js.replace('__importStar(require("react"))', stub);
js = js.replace(/require\("\.\.\/game-core\//g, `require("${path.join(__dirname).replace(/\\/g, '/')}/`);
js = js.replace(/import\.meta\.env/g, '({})');

js += `
;(function(){
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };
  const g = (n) => Math.round(n).toLocaleString();
  // Endgame income, measured by wealth-sim.cjs. Every hour figure below is gold divided by this.
  const GPH = 13180;
  const RISKY = Object.keys(TEMPER_CFG.ladder).map(Number).sort((a, b) => a - b);

  // --- the ladder always terminates ---------------------------------------------------------------
  // This is the whole point of the rework: no rank may be unreachable, however unlucky the player.
  {
    for (const t of RISKY) {
      const st = TEMPER_CFG.ladder[t];
      const it = ensureTemperData({ ilvl: 70, stats: {}, temper: t - 1 });
      ok(Math.abs(temperOdds(it, t).chance - st.p0) < 1e-9,
         "+" + (t - 1) + " -> +" + t + " opens at " + (st.p0 * 100).toFixed(0) + "%");
      // Walk the real failures rather than trusting the arithmetic.
      for (let n = 1; n <= st.pity; n++) it.pity[t] = n;
      ok(temperOdds(it, t).chance >= 1,
         "…and is GUARANTEED after exactly " + st.pity + " failures");
      it.pity[t] = st.pity - 1;
      ok(temperOdds(it, t).chance < 1, "…but not one failure sooner");
      it.pity[t] = st.pity + 50;
      ok(temperOdds(it, t).chance === 1, "…and cannot exceed certainty");
    }
    // The sketch that started this asked for 1% at the final rank. It survived.
    ok(TEMPER_CFG.ladder[10].p0 === 0.01, "the last rank still opens at 1%, as designed");
    ok(RISKY.every((t, i) => i === 0 || TEMPER_CFG.ladder[t].p0 <= TEMPER_CFG.ladder[RISKY[i - 1]].p0),
       "each rank is harder than the one below it");
    ok(RISKY.every((t, i) => i === 0 || TEMPER_CFG.ladder[t].pity >= TEMPER_CFG.ladder[RISKY[i - 1]].pity),
       "…and takes at least as many failures to force");
  }

  // --- de-ranking is gone ---------------------------------------------------------------------------
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    const code = src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ").replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1");
    ok(!/derank|de-rank/i.test(code), "no code path de-ranks an item any more");
    ok(!/TEMPER_CFG\\.odds/.test(code), "…and the old paired destroy/de-rank table is gone");
    // temperLog.pop() WAS the de-rank. If it comes back, a failure starts eating paid ranks again.
    ok(!/temperLog\\.pop\\(\\)/.test(code), "…nothing pops a rank off the temper log");
  }

  // --- one roll, so the displayed odds are the rolled odds ---------------------------------------
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    const body = src.slice(src.indexOf("const temperItem ="), src.indexOf("const rerollLine ="));
    ok(/const success = !risky \\|\\| Math\\.random\\(\\) < odds\\.chance/.test(body),
       "success is decided by ONE roll against the chance the shop displayed");
    // The destroy roll must be unreachable from a success. Comparing indexOf("return;") against the
    // destroy roll looked like it checked this and did not: temperItem opens with argument guards
    // that return, so the first "return;" always sat above everything and the test could not fail.
    // Match the braces of the success branch instead and read what is actually inside it.
    const iIf = body.indexOf("if (success) {");
    let depth = 0, end = -1;
    for (let i = body.indexOf("{", iIf); i < body.length && iIf >= 0; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    const branch = iIf >= 0 && end > iIf ? body.slice(iIf, end) : "";
    ok(!!branch, "the success branch is a block that can be read");
    ok(/\\breturn;/.test(branch), "…which returns rather than falling through into the failure path");
    ok(!/odds\\.destroy/.test(branch), "the destruction roll is unreachable from a success");
    ok(/odds\\.destroy/.test(body.slice(end)), "…and lives after it, on the failure path");
    ok(/item\\.pity\\[target\\] = odds\\.stacks \\+ 1/.test(body), "a failure banks a stack");
    ok(/delete item\\.pity\\[target\\]/.test(body), "…and a success spends the stacks for that rank");
    // Every rank the shop shows as risky must actually be in the ladder, or temperOdds returns the
    // safe default and the piece silently becomes unbreakable.
    for (let t = TEMPER_CFG.safeMax + 1; t <= TEMPER_CFG.maxRank; t++)
      ok(!!TEMPER_CFG.ladder[t], "rank +" + t + " has ladder odds defined");
    ok(temperOdds({}, TEMPER_CFG.safeMax).safe === true, "a safe rank reports itself safe");
  }

  // --- pity cannot be laundered ---------------------------------------------------------------------
  // A character-wide counter could be farmed on cheap +5->+6 attempts and spent on +9->+10. A
  // counter shared across ranks within one piece does the same thing. Both are per-rank, per-item.
  {
    const a = ensureTemperData({ ilvl: 70, stats: {}, temper: 9 });
    a.pity[6] = 99;
    ok(Math.abs(temperOdds(a, 10).chance - TEMPER_CFG.ladder[10].p0) < 1e-9,
       "heat banked on a cheap rank does nothing for an expensive one");
    const b = ensureTemperData({ ilvl: 70, stats: {}, temper: 9 });
    ok(temperOdds(b, 10).stacks === 0, "…and a second piece starts cold");
    ok(temperOdds({ pity: "nonsense" }, 10).stacks === 0, "junk in the save does not throw");
    ok(temperOdds({ pity: { 10: -5 } }, 10).stacks === 0, "…and a negative count cannot lower the chance");
    ok(ensureTemperData({ ilvl: 1, stats: {}, pity: [1,2] }).pity.constructor === Object,
       "…and an array where the map should be is repaired");
  }

  // --- artifacts must not lose their heat when they re-forge -------------------------------------
  // syncArtifacts rebuilds every artifact whenever the character's level moves. It copies the
  // temper fields across by name, so a field it forgets is silently reset on every level-up.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    const body = src.slice(src.indexOf("const syncArtifacts ="), src.indexOf("const syncArtifacts =") + 1600);
    ok(/next\\.pity =/.test(body), "an artifact carries its forge heat through a re-forge");
    ok(/next\\.temper = /.test(body) && /next\\.temperLog = /.test(body), "…along with its rank and log");
  }

  // --- the cost curve reads correctly ---------------------------------------------------------------
  {
    const ranks = [];
    for (let t = 1; t <= TEMPER_CFG.maxRank; t++) ranks.push(TEMPER_CFG.cost[t]);
    ok(ranks.every((v) => v > 0), "every rank has a price");
    ok(ranks.every((v, i) => i === 0 || v > ranks[i - 1]),
       "the price rises at every step — the risky ranks are never cheaper than the safe ones");
    const safe = ranks.slice(0, TEMPER_CFG.safeMax).reduce((a, b) => a + b, 0);
    const all = ranks.reduce((a, b) => a + b, 0);
    ok(all / GPH < 60, "a flawless run floors at " + g(all) + "g (" + (all / GPH).toFixed(0) + " h)");
    ok(safe / GPH < 8, "…of which the guaranteed +5 is " + g(safe) + "g (" + (safe / GPH).toFixed(1) + " h)");
  }

  // --- what it actually costs, end to end -------------------------------------------------------
  // Driven by the SHIPPED temperOdds and cost table, so retuning either moves these numbers.
  {
    const run = (protect) => {
      let gold = 0, rank = 0, items = 1;
      const it = ensureTemperData({ ilvl: 70, stats: {}, temper: 0 });
      while (rank < TEMPER_CFG.maxRank) {
        const t = rank + 1;
        gold += TEMPER_CFG.cost[t];
        if (rank < TEMPER_CFG.safeMax) { rank = t; continue; }
        const o = temperOdds(it, t);
        if (Math.random() < o.chance) { rank = t; delete it.pity[t]; }
        else {
          it.pity[t] = o.stacks + 1;
          if (!protect && Math.random() < o.destroy) { rank = 0; items++; it.pity = {}; }
        }
      }
      return { gold, items };
    };
    const N = 20000;
    const q = (rows, key, p) => { const v = rows.map((r) => r[key]).sort((a, b) => a - b); return v[Math.floor(v.length * p)]; };
    const rows = []; for (let i = 0; i < N; i++) rows.push(run(false));
    const med = q(rows, "gold", 0.5), p90 = q(rows, "gold", 0.9);
    console.log("    +0 -> +10 over " + g(N) + " runs: median " + g(med) + "g (" + (med / GPH).toFixed(0)
      + " h), p90 " + g(p90) + "g (" + (p90 / GPH).toFixed(0) + " h)");
    // The agreed budget is 200 hours at base. Allow the band a retune would stay inside.
    ok(med / GPH > 150 && med / GPH < 260,
       "a median climb costs " + (med / GPH).toFixed(0) + " hours against the 200 agreed");
    ok(p90 / GPH < 500, "…and an unlucky one stays under 500 h (" + (p90 / GPH).toFixed(0) + " h)");
    ok(med < 63745000 / 10, "…against 63,745,000g under the old rules, more than a 10x cut");
    ok(q(rows, "items", 0.5) === 1, "the median player destroys NOTHING, against 15 pieces before");
    ok(q(rows, "items", 0.9) <= 3, "…and the unlucky tail loses " + (q(rows, "items", 0.9) - 1) + ", against 49");

    // Warding is the only protection, so it has to be worth its Ven. It buys certainty, and the
    // gold it saves lands in the TAIL rather than the median — that is what insurance is.
    const wr = []; for (let i = 0; i < N; i++) wr.push(run(true));
    ok(wr.every((r) => r.items === 1), "a warded climb never loses the piece");
    ok(q(wr, "gold", 0.9) < p90, "…and cuts the unlucky case from " + g(p90) + "g to " + g(q(wr, "gold", 0.9)) + "g");
    const venAll = RISKY.reduce((a, t) => a + TEMPER_CFG.protectVen[t], 0);
    ok(RISKY.every((t) => TEMPER_CFG.protectVen[t] > 0), "every risky rank has a Ven price (" + venAll + " for one of each)");
    ok(RISKY.every((t, i) => i === 0 || TEMPER_CFG.protectVen[t] >= TEMPER_CFG.protectVen[RISKY[i - 1]]),
       "…rising with the rank it protects");
  }

  // --- destruction stays low enough for the ladder to be climbable -------------------------------
  // The failure mode this rework exists to avoid: destruction so likely that the piece dies before
  // the pity matures. Measure the chance of reaching the guarantee alive at each rank.
  {
    for (const t of RISKY) {
      const st = TEMPER_CFG.ladder[t];
      const step = (1 - st.p0) / st.pity;
      let surv = 1, lose = 0;
      for (let n = 0; n <= st.pity; n++) {
        const p = Math.min(1, st.p0 + step * n);
        lose += surv * (1 - p) * st.destroy;
        surv *= (1 - p) * (1 - st.destroy);
      }
      ok(lose < 0.25, "+" + (t - 1) + " -> +" + t + ": " + (lose * 100).toFixed(0) + "% chance of losing the piece");
    }
    ok(TEMPER_CFG.ladder[6].destroy === 0, "the first risky rank cannot destroy at all — it is the on-ramp");
    ok(RISKY.every((t) => TEMPER_CFG.ladder[t].destroy <= 0.10),
       "no rank destroys on more than a tenth of failures (it was 35-60% of ALL attempts)");
  }

  console.log(fail ? "\\n\\u274c " + fail + " temper check(s) failed"
                   : "\\n\\u2705 tempering: every rank is guaranteed eventually, and only a FAILURE can destroy");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'temper.cjs'); fs.writeFileSync(runf, js);
require(runf);
