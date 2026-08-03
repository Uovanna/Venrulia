/* What does the "▲ upgrade" label actually measure?
 *
 * itemScore drives every upgrade/downgrade notation, auto-equip, and auto-sell decision. This
 * drives the REAL itemScore/statWeight out of src/App.jsx and compares what it SAYS an item is
 * worth against what the item is actually worth in combat (offlinePlayerDps / maxHpFor from the
 * core), so the two can be seen to disagree rather than assumed to agree.
 *
 *   node game-core/upgrade-score-sim.cjs
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-score-'));
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
  const { buildBotChar, offlinePlayerDps, maxHpFor, POWER_PER_STAT } = core;
  const pad = (s, n) => String(s).padEnd(n); const rpad = (s, n) => String(s).padStart(n);

  // A level-60 warrior (physical, Strength-scaling) and a mage (magic, Intellect-scaling), so the
  // asymmetry between "a main stat" and "a main stat YOUR class uses" is visible.
  const subjects = [["warrior", "w_berserk", "str"], ["mage", "m_fire", "int"], ["rogue", "r_ambush", "agi"]];

  // buildBotChar leaves auto-skills off, and offlinePlayerDps SKIPS every skill that is not
  // switched on — so measuring a bot straight out of the box measures auto-attacks alone. That
  // reads as "Intellect is worth nothing to a mage", which is an artifact of the harness rather
  // than a fact about the game. Turn the rotation on so the numbers describe a real player.
  const armed = (cls, spec, ilvl) => {
    let c = buildBotChar(cls, spec, 60, ilvl); c.spec = spec;
    c = core.armGambits(c);   // a bar a player can actually build: gambits, not the dead auto-skill flag
    return c;
  };

  const ILVL = 63, RIDX = 4;                        // epic
  const perStat = Math.max(1, Math.round((1 + ILVL * 0.05) * 2.6));
  const powerVal = Math.max(1, Math.round(perStat * POWER_PER_STAT));

  // Hand-built pieces so the comparison is controlled — same slot, same ilvl, same secondaries.
  const mk = (mains, power) => {
    const stats = { str: 0, agi: 0, int: 0, sta: 0, armor: 40, dmg: 0, leech: 0, resil: 0, vers: 0, cdr: 0, csd: 0, crit: 0, haste: 0, ap: 0, sp: 0 };
    for (const m of mains) stats[m] = perStat;
    if (power) stats[power] = powerVal;
    return { id: "x", name: mains.join("+") + (power ? " +" + power.toUpperCase() : ""), slotId: "chest",
             icon: "", rarity: "epic", ilvl: ILVL, stats, value: 1, enchant: null, wdmg: null,
             mains, sockets: [] };
  };

  console.log("\\n=== 1. WHAT itemScore COUNTS ===");
  console.log("SCORE_STATS is the list itemScore walks; statWeight is what each one is worth.\\n");
  // ap/sp and wdmg are handled by itemScore OUTSIDE the SCORE_STATS loop, so "not listed" does
  // not mean "not counted" for those three. Probe the real function instead of reading the list.
  const probe = (k) => {
    const bare = { id:"p", slotId:"chest", rarity:"epic", ilvl:63, mains:["str"], sockets:[], enchant:null, wdmg:null,
      stats:{ str:11,agi:0,int:0,sta:0,armor:0,dmg:0,leech:0,resil:0,vers:0,cdr:0,csd:0,crit:0,haste:0,ap:0,sp:0 } };
    const with20 = JSON.parse(JSON.stringify(bare)); with20.stats[k] = (with20.stats[k] || 0) + 20;
    return (itemScore(with20, "warrior") - itemScore(bare, "warrior")) / 20;
  };
  for (const k of ["str","agi","int","sta","armor","leech","resil","vers","cdr","csd","crit","haste","ap","sp"]) {
    const inList = SCORE_STATS.includes(k);
    const w = statWeight("warrior", k), real = probe(k);
    const note = real === 0 ? "  <- scores NOTHING"
               : !inList ? "  <- counted outside the SCORE_STATS loop"
               : "";
    console.log("  " + pad(k, 7) + rpad(inList ? "listed" : "-", 8) + rpad("weight " + w, 12)
      + rpad("actually " + real.toFixed(2), 15) + note);
  }

  console.log("\\n=== 2. FOCUSED (1 main + Power) vs DUAL (2 mains) ===");
  console.log("Power is granted at perStat x " + POWER_PER_STAT + " = " + powerVal + " on a " + perStat + "-per-stat epic,");
  console.log("and damage converts str/int at x1.4 and ap/sp at x1.0 — so by design they are equal.\\n");

  for (const [cls, spec, mainOf] of subjects) {
    console.log("  --- " + cls + " (" + spec + "), scales off " + mainOf.toUpperCase() + " ---");
    const base = armed(cls, spec, ILVL);
    const powerKind = mainOf === "int" ? "sp" : "ap";
    const others = ["str","agi","int"].filter((k) => k !== mainOf);
    const rows = [
      ["focused: " + mainOf + " + " + powerKind.toUpperCase(), mk([mainOf], powerKind)],
      ["dual:    " + mainOf + " + " + others[0],               mk([mainOf, others[0]], null)],
      ["dual:    " + others[0] + " + " + others[1] + " (neither is yours)", mk([others[0], others[1]], null)],
    ];
    console.log("    " + pad("piece", 42) + rpad("itemScore", 11) + rpad("real dps", 11) + rpad("real hp", 10));
    const measured = [];
    for (const [label, item] of rows) {
      let c = JSON.parse(JSON.stringify(base));
      c.equipment.chest = item; c.spec = spec;
      const sc = itemScore(item, cls);
      const dps = offlinePlayerDps(c), hp = maxHpFor(c);
      measured.push({ label, sc, dps, hp });
      console.log("    " + pad(label, 42) + rpad(sc.toFixed(1), 11) + rpad(dps.toFixed(1), 11) + rpad(Math.round(hp), 10));
    }
    const best = measured.reduce((a, b) => (b.dps > a.dps ? b : a));
    const scoreBest = measured.reduce((a, b) => (b.sc > a.sc ? b : a));
    console.log("    strongest in COMBAT: " + best.label.trim());
    console.log("    what the UI CALLS best: " + scoreBest.label.trim()
      + (best.label === scoreBest.label ? "   (agree)" : "   <-- DISAGREE"));
    console.log("");
  }

  console.log("=== 3. THE SIZE OF THE ERROR ===");
  console.log("For each class, how much dps the score is blind to on a focused piece.\\n");
  for (const [cls, spec, mainOf] of subjects) {
    const base = armed(cls, spec, ILVL);
    const powerKind = mainOf === "int" ? "sp" : "ap";
    const focused = mk([mainOf], powerKind);
    const others = ["str","agi","int"].filter((k) => k !== mainOf);
    const dual = mk([mainOf, others[0]], null);
    const dpsOf = (it) => { const c = JSON.parse(JSON.stringify(base)); c.equipment.chest = it; return offlinePlayerDps(c); };
    const dF = dpsOf(focused), dD = dpsOf(dual);
    const sF = itemScore(focused, cls), sD = itemScore(dual, cls);
    console.log("  " + pad(cls, 9) + " focused is " + rpad(((dF / dD - 1) * 100).toFixed(1) + "% dps", 14)
      + " but scores " + rpad(((sF / sD - 1) * 100).toFixed(1) + "%", 10) + " vs the dual piece");
  }

  console.log("=== 4. IS A MAIN STAT A MAIN STAT? ===");
  console.log("statWeight(clsId, stat) takes a class and never reads it: str/agi/int are all 1.0.");
  console.log("But only STR feeds physical damage and only INT feeds magic damage — agility buys");
  console.log("attack speed and crit instead. So the three are not interchangeable.\\n");
  console.log("  " + pad("class", 10) + pad("scales off", 12) + "dps per 30 points of each main stat");
  for (const [cls, spec, mainOf] of subjects) {
    const base = armed(cls, spec, ILVL);
    const dpsWith = (stat) => {
      let c = JSON.parse(JSON.stringify(base));
      c.equipment.chest = mk([], null);
      if (stat) c.equipment.chest.stats[stat] = 30;
      return offlinePlayerDps(c);
    };
    const none = dpsWith(null);
    const parts = ["str","agi","int"].map((k) => k + " +" + ((dpsWith(k) / none - 1) * 100).toFixed(1) + "%");
    console.log("  " + pad(cls, 10) + pad(mainOf.toUpperCase(), 12) + parts.join("   "));
  }
  console.log("\\n  itemScore prices all three of these at exactly 1.0 for every class.\\n");

  console.log("=== 5. THE DORMANT-POWER TRAP, AND WHETHER IT IS GUARDED ===");
  console.log("Power goes dormant while a piece carries two main stats, and gems and enchants both");
  console.log("count toward that — so adding a main stat to a focused piece can cost more than it gives.\\n");
  {
    const [cls, spec, mainOf] = subjects[0];
    const base = armed(cls, spec, ILVL);
    const focused = mk([mainOf], "ap");
    const disarmed = JSON.parse(JSON.stringify(focused));
    disarmed.stats.agi = 6;                       // as if a Chipped Amber had been socketed
    disarmed.mains = [mainOf, "agi"];
    const dpsOf = (it) => { const c = JSON.parse(JSON.stringify(base)); c.equipment.chest = it; return offlinePlayerDps(c); };
    const live = dpsOf(focused), dead = dpsOf(disarmed);
    console.log("  focused chest, Power live:              " + live.toFixed(1) + " dps");
    console.log("  same chest +6 AGI (Power now dormant):  " + dead.toFixed(1) + " dps   ("
      + ((dead / live - 1) * 100).toFixed(1) + "%)");
    console.log("  itemScore for the two:                  " + itemScore(focused, cls).toFixed(1)
      + "  vs  " + itemScore(disarmed, cls).toFixed(1) + "  <- the score RISES as the piece gets worse");
    console.log("\\n  Both paths that can do this ARE guarded — socketGem and the enchant flow both");
    console.log("  call wouldDormantPower and raise a confirm. The trap is closed at the point of");
    console.log("  action; it is only the SCORE that still misreads the result.");
  }
  console.log("");
})();`;
const run = path.join(dir, 'score.cjs'); fs.writeFileSync(run, js);
require(run);
