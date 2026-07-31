/* Can a non-DPS spec clear solo Hard Mode, and if not, WHY not?
 *
 * TANK SOLO DAMAGE IN HARD MODE — the finding that prompted this, stated accurately:
 * a Protection warrior at hard-mode entry gear deals 861 dps against a Berserker's 1,842, so the
 * same champion takes 35 seconds instead of 16. It does NOT lose the fight — its 20% damage
 * reduction carries it, and it survives 46s — but it farms at less than half the rate. (An earlier
 * pass reported the tank as dying outright. That measurement omitted the tank's damage reduction,
 * which is the entire point of the spec, and was wrong.)
 *
 * Three things could be causing that, and they need separating before anything is changed:
 *
 *   1. THE BAR.     A level-60 character has 5 skill slots. DPS specs have 3 signature skills and
 *                   two free slots for the class's best damage abilities; every non-DPS spec has
 *                   FIVE signatures, which fill the bar completely.
 *   2. THE SKILLS.  Non-DPS signatures are low-multiplier or deal no damage at all.
 *   3. THE SPEC.    Non-DPS specs carry a flat dmgPct penalty: -15% for tanks and support, -20%
 *                   for the healer.
 *
 * OPEN POSITIONS — measured, deliberately NOT changed. Recorded so the numbers survive:
 *
 *   m_wild (Arcanist) pays +3s on EVERY skill cooldown for a 30% double-cast. Even with Wild Magic
 *   now credited by offlinePlayerDps it is the weakest mage spec at 1,453 dps. Sweeping the
 *   constant: at +1.5s it measures 1,613, ahead of m_sword's 1,587. The upside is fine; the
 *   downside is overpriced by roughly a factor of two.
 *
 *   w_champion pays -25% attack speed for +15% cooldown reduction and is the WEAKEST spec in the
 *   game at 1,426 dps, against w_berserk's 1,945 in the same class. Softening the penalty to -12%
 *   only reaches 1,500, so the cooldown reduction is not carrying its half of the trade. This is
 *   not a second one-sided bug — cdrFracFor was checked and does apply spec cdr — it is tuning.
 *
 *   m_trick trades -15% magic damage for +2s of crowd control. The damage cost is measured; the
 *   survival benefit is NOT, because the fight model below has no crowd control in it. Its 1,554
 *   is a lower bound, not a verdict.
 *
 * This drives the real offlinePlayerDps / effectiveStats / enemy tables out of src/App.jsx and the
 * core, so the numbers describe the shipped game.
 *
 *   node game-core/spec-solo-sim.cjs
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-spec-'));
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
  const { effectiveStats, secondaryPcts, mitigation, maxHpFor, specSkillNames, specRole, specById,
          skillByName, unlockedSlotCount, offlinePlayerDps } = core;
  const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
  const g = (n) => Math.round(n).toLocaleString();
  const CAP = unlockedSlotCount(60);

  const NONDPS = [["w_prot", "warrior", "w_berserk"], ["p_prot", "paladin", "p_just"],
                  ["p_holy", "paladin", "p_just"], ["m_support", "mage", "m_wild"],
                  ["h_support", "hunter", "h_range"]];

  // ---------- how a spec's bar is actually composed -------------------------------------------
  const dmgOf = (ch, n) => { const s = skillByName(ch, n); if (!s) return 0; return (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0); };
  // The best damage bar a player could actually build for this spec: every skill the spec can see,
  // ranked by raw multiplier. Signatures are eligible — if one is good it stays.
  const bestDamageBar = (cls, spec) => {
    const ch = { cls, level: 60, spec };
    return core.skillPool(ch).filter((s) => s.unlockLevel <= 60)
      .map((s) => ({ n: s.name, d: (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0) }))
      .sort((a, b) => b.d - a.d).slice(0, CAP).map((x) => x.n);
  };

  console.log("\\n=== 1. WHAT FILLS THE BAR ===");
  console.log("A level-60 character has " + CAP + " skill slots.\\n");
  console.log(pad("spec", 12) + pad("role", 9) + rp("granted", 9) + rp("free slots", 12)
    + rp("dmg on bar", 12) + rp("bar dmg total", 15) + rp("best-5 total", 14) + rp("dmgPct", 9));
  const barRows = [];
  for (const [spec, cls, dpsSpec] of [...NONDPS.map((x) => x), ["w_berserk", "warrior", null],
                                       ["p_just", "paladin", null], ["m_wild", "mage", null],
                                       ["h_range", "hunter", null]]) {
    const ch = { cls, level: 60, spec };
    // What normalizeChar actually hands a fresh character: the granted signatures plus whatever
    // padSelectedSkills fills the remaining slots with. The raw signature list is NOT the bar.
    const sigs = core.normalizeChar({ ...core.createCharacter("T", cls, "human"), level: 60, spec, selectedSkills: [] }).selectedSkills;
    const sigDmg = sigs.reduce((a, n) => a + dmgOf(ch, n), 0);
    const best = bestDamageBar(cls, spec);
    const bestDmg = best.reduce((a, n) => a + dmgOf(ch, n), 0);
    const mods = (specById(spec) || {}).m || {};
    barRows.push({ spec, cls, dpsSpec, sigs, best, sigDmg, bestDmg, dmgPct: mods.dmgPct || 0 });
    console.log(pad(spec, 12) + pad(specRole(spec), 9) + rp(core.specGrantedSkills(spec).length, 9)
      + rp(Math.max(0, CAP - core.specGrantedSkills(spec).length), 12)
      + rp(sigs.filter((n) => dmgOf(ch, n) > 0).length, 10)
      + rp("x" + sigDmg.toFixed(2), 15) + rp("x" + bestDmg.toFixed(2), 14)
      + rp(mods.dmgPct ? (mods.dmgPct * 100).toFixed(0) + "%" : "-", 9));
  }
  console.log("\\n  Every non-DPS spec has FIVE signature skills and " + CAP + " slots, so its signatures fill the");
  console.log("  bar completely. Every DPS spec has three, leaving two slots for the class's best hitters.");

  // ---------- the fight ------------------------------------------------------------------------
  const HARD_T = diffTier("hard"), RANK = ENEMY_RANKS.champion;
  const zoneFight = (hz, ch) => {
    const bz = ZONES.find((z) => z.id === hz.base); const names = (bz && bz.enemies) || ["Bandit"];
    let ehpSum = 0, dmgSum = 0;
    for (const nm of names) {
      const cls = dispositionFor(nm); const arch = ENEMY_ARCHETYPE[cls] || NEUTRAL_ARCHETYPE;
      const st = enemyStatBlock(hz.enemyLvl, cls, { rank: "champion", tier: "hard" });
      const e = { ...st, level: hz.enemyLvl, cls, isChampion: true };
      ehpSum += Math.floor((hz.enemyLvl * 26 + 50) * RANK.hp * HARD_T.hp * 8 * arch.hp) / (1 - enemyMitigation(e, 60));
      dmgSum += enemyDpsOf(e);
    }
    const ehp = ehpSum / names.length, eDps = dmgSum / names.length;
    const mit = mitigation(ch.armor, hz.enemyLvl);
    // A tank's whole identity is its damage reduction, so it has to count here.
    const incoming = eDps * (1 - mit) * (1 - ch.vers / 200) * (1 - (ch.dr || 0));
    const leech = ch.dps * (ch.leech / 100);
    const secs = ehp / ch.dps;
    const net = Math.max(0.01, incoming - leech);
    const potHps = tierHeal(6) / (POTION_CD / 1000);
    const live = 0.7 * ch.hp / net + 0.3 * ch.hp / Math.max(0.01, net - potHps);
    return { secs, live, incoming, clears: live > secs };
  };

  // A realistically-built level-60: health talents and a maxed Sanctum, which is what a player who
  // has reached hard mode actually has. Benching without them measured a character nobody plays.
  const profile = (cls, spec, ilvl, bar) => {
    const N = 40; let hp = 0, armor = 0, dps = 0, leech = 0, vers = 0;
    for (let s = 0; s < N; s++) {
      const c = rngm.withRng(rngm.makeRng(ilvl * 977 + s * 13), () => {
        const x = core.buildBotChar(cls, spec, 60, ilvl);
        x.spec = spec;
        x.selectedSkills = [...bar];
        x.autoSkillsOwned = {}; x.autoSkills = {};
        for (const n of bar) { x.autoSkillsOwned[n] = true; x.autoSkills[n] = true; }
        x.town = { buildings: { sanctum: 10, barracks: 10 } };
        return x;
      });
      const eff = effectiveStats(c), sp = secondaryPcts(eff);
      hp += Math.floor(maxHpFor(c) * 1.27);   // Toughness + Fortitude, the health talents
      armor += eff.armor; dps += offlinePlayerDps(c); leech += sp.leech; vers += sp.vers;
    }
    const mods = (specById(spec) || {}).m || {};
    return { hp: hp / N, armor: armor / N, dps: dps / N, leech: leech / N, vers: vers / N, dr: mods.dr || 0 };
  };

  const HZ = HARD_ZONES[0];   // the entry bracket — if a spec cannot clear here it cannot start
  console.log("\\n=== 2. SOLO HARD MODE AT THE ENTRY BRACKET (" + HZ.name + ", ilvl " + HZ.reqIlvl + ") ===");
  console.log("Health talents + maxed town, as a player who has reached hard mode would have.\\n");
  console.log(pad("spec", 12) + pad("bar", 24) + rp("dps", 8) + rp("hp", 8) + rp("dr", 6)
    + rp("kill", 9) + rp("survive", 10) + rp("margin", 9) + rp("verdict", 9));

  const results = {};
  for (const row of barRows) {
    if (!row.dpsSpec) continue;   // reference DPS specs handled below
    for (const [label, bar] of [["its default bar", row.sigs], ["best damage skills", row.best]]) {
      const ch = profile(row.cls, row.spec, HZ.reqIlvl, bar);
      const f = zoneFight(HZ, ch);
      results[row.spec + "|" + label] = { ch, f };
      console.log(pad(row.spec, 12) + pad(label, 24) + rp(g(ch.dps), 8) + rp(g(ch.hp), 8)
        + rp((ch.dr * 100).toFixed(0) + "%", 6) + rp(f.secs.toFixed(1) + "s", 9)
        + rp(f.live > 1e4 ? "sustains" : f.live.toFixed(1) + "s", 10)
        + rp(f.live > 1e4 ? "huge" : "x" + (f.live / f.secs).toFixed(2), 9)
        + rp(f.clears ? "CLEARS" : "dies", 9));
    }
  }
  // Reference: what the same class's DPS spec does, with its own bar.
  console.log("");
  for (const row of barRows.filter((r) => !r.dpsSpec)) {
    const ch = profile(row.cls, row.spec, HZ.reqIlvl, row.sigs);
    const f = zoneFight(HZ, ch);
    results[row.spec] = { ch, f };
    console.log(pad(row.spec, 12) + pad("(dps ref, default bar)", 24) + rp(g(ch.dps), 8) + rp(g(ch.hp), 8)
      + rp((ch.dr * 100).toFixed(0) + "%", 6) + rp(f.secs.toFixed(1) + "s", 9)
      + rp(f.live > 1e4 ? "sustains" : f.live.toFixed(1) + "s", 10)
      + rp(f.live > 1e4 ? "huge" : "x" + (f.live / f.secs).toFixed(2), 9)
      + rp(f.clears ? "CLEARS" : "dies", 9));
  }

  // ---------- decomposition --------------------------------------------------------------------
  console.log("\\n=== 3. WHERE THE DAMAGE GAP ACTUALLY COMES FROM ===");
  console.log("Each non-DPS spec against its own class's DPS spec, split into the three causes.\\n");
  // Absolute numbers, not shares of a gap. Shares are misleading here: the "best bar" is an
  // OPTIMAL bar while the DPS reference runs its default bar, so the two effects can add up to
  // more than the gap between them and a percentage split would read as over 100%.
  console.log(pad("spec", 12) + rp("own bar", 10) + rp("+best bar", 16) + rp("+no penalty", 16)
    + rp("dps ref", 10) + rp("vs ref", 9));
  for (const row of barRows) {
    if (!row.dpsSpec) continue;
    const own = results[row.spec + "|its default bar"].ch.dps;
    const best = results[row.spec + "|best damage skills"].ch.dps;
    const ref = results[row.dpsSpec].ch.dps;
    // What the best bar WOULD do without the spec's flat damage penalty. dmgPct is a clean
    // multiplier on damage dealt, so this is arithmetic, not a second measurement.
    const noPenalty = best / (1 + row.dmgPct);
    console.log(pad(row.spec, 12) + rp(g(own), 10)
      + rp(g(best) + " (+" + ((best / own - 1) * 100).toFixed(0) + "%)", 16)
      + rp(g(noPenalty) + " (+" + ((noPenalty / best - 1) * 100).toFixed(0) + "%)", 16)
      + rp(g(ref), 10) + rp("x" + (best / ref).toFixed(2), 9));
  }
  console.log("\\n  'own bar'     = what the spec does today, signatures filling all " + CAP + " slots.");
  console.log("  '+best bar'   = the player swaps to the class's best damage skills. FREE, possible today.");
  console.log("  '+no penalty' = and the spec's flat dmgPct removed on top. Arithmetic, not measured.");
  console.log("  'vs ref'      = the best bar against the same class's DPS spec running its own bar.");

  console.log("\\n=== 4. DOES FIXING THE BAR ALONE MAKE THEM VIABLE? ===");
  for (const row of barRows) {
    if (!row.dpsSpec) continue;
    const a = results[row.spec + "|its default bar"], b = results[row.spec + "|best damage skills"];
    console.log("  " + pad(row.spec, 12) + " default bar: " + (a.f.clears ? "clears" : "dies")
      + "   best bar: " + (b.f.clears ? "CLEARS" : "dies")
      + "   (kill " + a.f.secs.toFixed(0) + "s -> " + b.f.secs.toFixed(0) + "s)");
  }

  console.log("\\n=== 5. SO: SKILL BAR, OR A CORE PROBLEM WITH THE SPECS? ===");
  console.log("  BOTH, but the bar is the larger and the more fixable half.\\n");
  console.log("  The bar is the structural cause. A level-60 character has " + CAP + " slots. Every DPS spec");
  console.log("  has 3 signature skills and 2 free slots for the class's best hitters; every non-DPS spec");
  console.log("  has 5 signatures, which fill the bar exactly. That is not a balance number anyone tuned —");
  console.log("  it is a slot count colliding with a signature count, and it costs 21-86% of their damage.");
  console.log("");
  console.log("  The flat dmgPct penalty is real but secondary: worth 18-25% on top, and defensible as");
  console.log("  the price of a role. It is not what is breaking these specs.");
  console.log("");
  console.log("  Swapping signatures for damage skills is FREE and possible today, and it flips p_holy");
  console.log("  and h_support from dying to clearing. But it is not actually a fix: a Holy paladin");
  console.log("  running five damage skills is not a healer any more. 'The player can work around it'");
  console.log("  and 'the spec works' are different claims.");
  console.log("");
  console.log("  Two things are NOT explained by any of this:");
  console.log("  - m_support dies even with a perfect damage bar. But m_wild, its own DPS reference,");
  console.log("    clears by a margin of only x1.05 — so the MAGE is marginal in hard mode, and the");
  console.log("    support spec is simply the first place that shows. That is a class problem.");
  console.log("  - Tanks are not failing at all. w_prot and p_prot clear on their own signatures; they");
  console.log("    are just slow (35s a kill against a Berserker's 16s), so they farm at half rate.");

  // ---------- every DPS spec against the same content -------------------------------------------
  console.log("\\n=== 6. EVERY DPS SPEC IN SOLO HARD MODE (entry bracket) ===");
  console.log("Same gear seeds, same default-bar rule, so the only variable is the spec.\\n");
  console.log(pad("spec", 12) + pad("class", 9) + rp("dps", 7) + rp("hp", 7) + rp("kill", 9)
    + rp("survive", 10) + rp("margin", 9) + rp("verdict", 9) + "   modifiers");
  const CLS_OF = { w: "warrior", m: "mage", r: "rogue", p: "paladin", h: "hunter", l: "warlock" };
  const dpsIds = Object.keys(core.SPEC_SKILLS)
    .filter((id) => CLS_OF[id.split("_")[0]] && specById(id) && specRole(id) === "dps");
  const allRows = dpsIds.map((id) => {
    const cls = CLS_OF[id.split("_")[0]];
    const bar = core.normalizeChar({ ...core.createCharacter("T", cls, "human"), level: 60, spec: id, selectedSkills: [] }).selectedSkills;
    const ch = profile(cls, id, HZ.reqIlvl, bar);
    const f = zoneFight(HZ, ch);
    return { id, cls, ch, f, mods: JSON.stringify((specById(id) || {}).m || {}) };
  }).sort((a, b) => b.ch.dps - a.ch.dps);
  for (const r of allRows) {
    console.log(pad(r.id, 12) + pad(r.cls, 9) + rp(g(r.ch.dps), 7) + rp(g(r.ch.hp), 7)
      + rp(r.f.secs.toFixed(1) + "s", 9)
      + rp(r.f.live > 1e4 ? "sustains" : r.f.live.toFixed(1) + "s", 10)
      + rp(r.f.live > 1e4 ? "huge" : "x" + (r.f.live / r.f.secs).toFixed(2), 9)
      + rp(r.f.clears ? "CLEARS" : "DIES", 9) + "   " + r.mods);
  }
  const byCls = {};
  for (const r of allRows) (byCls[r.cls] = byCls[r.cls] || []).push(r);
  console.log("\\n  class averages (dps / how many of its specs clear):");
  Object.entries(byCls).map(([c, v]) => [c, v.reduce((a, x) => a + x.ch.dps, 0) / v.length, v.filter((x) => x.f.clears).length, v.length])
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, d, cl, n]) => console.log("    " + pad(c, 10) + rp(g(d), 6) + "   " + cl + "/" + n + " clear"));
  const dying = allRows.filter((r) => !r.f.clears);
  console.log("\\n  specs that CANNOT clear the entry bracket solo: "
    + (dying.length ? dying.map((r) => r.id).join(", ") : "none"));
  console.log("");
})();`;
const runf = path.join(dir, 'spec.cjs'); fs.writeFileSync(runf, js);
require(runf);
