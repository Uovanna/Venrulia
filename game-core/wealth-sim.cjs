/* How much gold does a player actually have, and what is an item worth next to it?
 *
 * Drives the REAL simulateOffline / rollLoot / ahBaseValue / sellPrice out of src/App.jsx, so the
 * numbers describe the shipped economy rather than a re-derivation.
 *
 *   node game-core/wealth-sim.cjs
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-wealth-'));
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
  // App.jsx IMPORTS these from the core, so they are not bare locals in the transpiled module.
  const { createCharacter, generateItem, rarityById, LOOT_SLOTS, normalizeChar, maxHpFor,
          effectiveStats, secondaryPcts, mitigation } = core;
  const rngm = require("${path.join(__dirname, 'rng.mjs').replace(/\\/g, '/')}");
  const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
  const g = (n) => Math.round(n).toLocaleString();

  const HOUR = 3600 * 1000;

  // Play a character forward by repeatedly running the real offline loop, which is the same reward
  // maths the live loop uses. Stops at a target level or after a wall-clock budget.
  const playTo = (cls, targetLevel, maxHours, gearIlvl) => {
    let c = createCharacter("Sim", cls, "human");
    c.gold = 150;                       // starting purse, as createCharacter gives
    let hours = 0;
    while (c.level < targetLevel && hours < maxHours) {
      if (gearIlvl) { // keep gear roughly current so kill speed is representative
        const eq = { ...c.equipment };
        for (const s of LOOT_SLOTS) eq[s.id] = generateItem(Math.min(gearIlvl, Math.max(1, c.level)), rarityById("uncommon"), s.id, cls);
        c.equipment = eq; c.hp = maxHpFor(c);
      }
      // simulateOffline returns null unless the character is parked in a zone it qualifies for.
      c.offlineZoneId = getZoneForLevel(c.level).id;
      const before = c.level;
      const r = simulateOffline(c, HOUR);
      if (!r) break;
      c = r.char; hours += 1;
      if (r.kills === 0 && c.level === before) break;   // stuck: no progress possible
    }
    return { char: c, hours };
  };

  console.log("\\n=== 1. WHAT A PLAYER IS WORTH ===");
  console.log("Gold is (level x (boss?5:1) + 3) x 0.25 per kill, plus looted gear auto-sold at 15% of");
  console.log("its value. Simulated forward through the real offline loop.\\n");
  console.log(pad("milestone", 22) + rp("hours", 8) + rp("kills", 10) + rp("gold", 12) + rp("gold/hour", 12));

  const rows = [];
  for (const [label, lvl, cap] of [["level 30", 30, 400], ["level 60 (hard mode)", 60, 2000]]) {
    const r = rngm.withRng(rngm.makeRng(7), () => playTo("warrior", lvl, cap, 60));
    const c = r.char;
    rows.push({ label, gold: c.gold, kills: c.kills, hours: r.hours, level: c.level });
    console.log(pad(label, 22) + rp(r.hours, 8) + rp(g(c.kills), 10) + rp(g(c.gold), 12)
      + rp(g(c.gold / Math.max(1, r.hours)), 12));
  }

  // Endgame: a level-60 character keeps earning at a flat rate, so measure gold per hour directly
  // and express each ilvl bracket as "hours of play" rather than inventing a progression curve.
  // A real level-60: a spec, a full epic set, and its rotation switched on. A bare createCharacter
  // at level 60 has no spec and no auto-skills, kills far too slowly to out-heal the 2%-per-kill
  // regen, and dies within six minutes — which then extrapolated to a fictional 25,000 gold/hour.
  const armedSixty = (seed) => rngm.withRng(rngm.makeRng(seed), () => {
    const c = core.buildBotChar("warrior", "w_berserk", 60, 63);
    c.spec = "w_berserk"; c.gold = 0;
    c.autoSkillsOwned = {}; c.autoSkills = {};
    for (const n of (c.selectedSkills || [])) { c.autoSkillsOwned[n] = true; c.autoSkills[n] = true; }
    c.offlineZoneId = getZoneForLevel(60).id;
    c.hp = maxHpFor(c);
    return c;
  });
  const runs = [1, 2, 3, 4, 5].map((sd) => {
    const c = armedSixty(sd * 13);
    const r = simulateOffline(c, 10 * HOUR);
    return r ? { gold: r.goldGained, kills: r.kills, secs: r.secondsSimulated, died: r.died } : null;
  }).filter(Boolean);
  const totalSecs = runs.reduce((a, r) => a + r.secs, 0);
  const totalGold = runs.reduce((a, r) => a + r.gold, 0);
  const totalKills = runs.reduce((a, r) => a + r.kills, 0);
  const deaths = runs.filter((r) => r.died).length;
  const endgame = { gold: totalGold, kills: totalKills, hours: totalSecs / 3600, deaths, runs: runs.length };
  const goldPerHour = endgame.gold / Math.max(0.01, endgame.hours);
  console.log(pad("level 60, farming", 22) + rp(endgame.hours.toFixed(1), 8) + rp(g(endgame.kills), 10)
    + rp(g(endgame.gold), 12) + rp(g(goldPerHour), 12)
    + (deaths ? "   (" + deaths + "/" + runs.length + " runs ended in death)" : ""));

  // ---------------------------------------------------------------------------------------------
  console.log("\\n=== 1b. INCOME AT EACH HARD-MODE BRACKET ===");
  console.log("simulateOffline only knows the normal ZONES, so hard mode cannot be driven through it.");
  console.log("This reconstructs the live hard-zone loop from the shipped tables: makeHardEnemy builds");
  console.log("a CHAMPION at hpMult 8 (or a Lord at hpMult 10, 10% of spawns) on the 'hard' difficulty");
  console.log("tier, and resolveDeath pays it out. Enemy health, armor and the reward formula are the");
  console.log("real ones; only the tick-by-tick rotation is replaced by offlinePlayerDps.\\n");

  // resolveDeath and makeHardEnemy live INSIDE the React component and cannot be called from here.
  // Mirrored below, with the source line each rule comes from, so a drift is at least findable.
  const HARD_T = diffTier("hard");
  const hardZoneEnemy = (hz, isLord, name) => {
    const rank = isLord ? "lord" : "champion";
    const R = ENEMY_RANKS[rank];
    const hpMult = isLord ? 10 : 8;                         // makeHardEnemy
    const cls = dispositionFor(name);
    const arch = ENEMY_ARCHETYPE[cls] || NEUTRAL_ARCHETYPE;
    const st = enemyStatBlock(hz.enemyLvl, cls, { rank, tier: "hard" });
    // + Math.random()*20 of spawn jitter, dropped: it is 0.05% of a 30,000-hp champion.
    const hp = Math.floor((hz.enemyLvl * 26 + 50) * R.hp * HARD_T.hp * hpMult * arch.hp);
    return { ...st, level: hz.enemyLvl, cls, hp, maxHp: hp, isChampion: true, isLord, isBoss: false, arch };
  };

  // A level-60 with a spec, a full set at the bracket's ilvl, and its rotation switched on.
  const geared = (ilvl, seed) => rngm.withRng(rngm.makeRng(seed), () => {
    const c = core.buildBotChar("warrior", "w_berserk", 60, ilvl);
    c.spec = "w_berserk"; c.gold = 0; c.race = "human";
    c.autoSkillsOwned = {}; c.autoSkills = {};
    for (const n of (c.selectedSkills || [])) { c.autoSkillsOwned[n] = true; c.autoSkills[n] = true; }
    c.hp = maxHpFor(c);
    return c;
  });

  // A champion casts 2 of its class's skills, a Lord 4, drawn at random from the pool — so the
  // expected damage of a cast is the pool average, not any one skill. mult and dotMult both land on
  // the player; hits multiplies a nuke.
  const avgCastMult = (cls, level) => {
    const pool = core.enemyUsableSkills(cls, level);
    const hitters = pool.filter((s) => (s.mult && s.mult > 0) || s.dotMult);
    if (!hitters.length) return 0;
    return hitters.reduce((a, s) => a + (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0), 0) / hitters.length;
  };

  console.log(pad("hard zone", 24) + rp("ilvl", 6) + rp("enemy lvl", 11) + rp("enemy hp", 11)
    + rp("player dps", 12) + rp("sec/kill", 10) + rp("kills/h", 9) + rp("gold/h", 11)
    + rp("your hp", 9) + rp("incoming", 10) + rp("leech", 8) + rp("you live", 10));

  const hardRows = [];
  for (const hz of HARD_ZONES) {
    const c = geared(hz.reqIlvl, hz.enemyLvl * 7);
    const eff = effectiveStats(c);
    const sp = secondaryPcts(eff);
    const dps = core.offlinePlayerDps(c);
    const bz = ZONES.find((z) => z.id === hz.base);
    const names = (bz && bz.enemies) || ["Bandit"];

    // Average over the creature names the zone can actually spawn — dispositionFor hashes the NAME,
    // so archetype health and armor are not uniform across a zone.
    let ehpSum = 0, dmgSum = 0, n = 0;
    for (const nm of names) {
      for (const isLord of [false, true]) {
        const w = isLord ? 0.1 : 0.9;                       // makeHardEnemy: 10% Lord
        const e = hardZoneEnemy(hz, isLord, nm);
        // Player damage is reduced by the enemy's archetype armor (App.jsx:3161).
        const eff_hp = e.hp / (1 - enemyMitigation(e, c.level));
        // Enemy output: autos on an archetype-scaled swing timer, plus casts at ENEMY_SKILL_SCALE.
        const raw = enemyBaseDamage(e);
        const autoDps = raw * (enemyCanCast(e) ? enemyAutoMult(e.level) : 1)
          / ((ENEMY_BASE_INTERVAL * e.arch.atk) / 1000);
        // App.jsx:3273 — nextCastAt = now + ENEMY_CAST_CD * arch.cast
        const castDps = raw * ENEMY_SKILL_SCALE * avgCastMult(e.cls, e.level)
          / ((ENEMY_CAST_CD * e.arch.cast) / 1000);
        ehpSum += eff_hp * w; dmgSum += (autoDps + castDps) * w; n += w;
      }
    }
    const ehp = ehpSum / n, eDpsRaw = dmgSum / n;
    const mit = mitigation(eff.armor, hz.enemyLvl);
    const incoming = eDpsRaw * (1 - mit) * (1 - sp.vers / 200);
    const secs = ehp / dps;
    const killsPerHour = 3600 / secs;

    // resolveDeath, for a hard-zone champion at max level (App.jsx:2814-2821).
    // No rewardMult penalty in hard mode, and gold is DOUBLED at max level.
    const tb = core.townBonuses(c);
    let goldBase = Math.floor(60 * 1 + 2.5 + 1);            // rand*4+1 averaged
    goldBase = Math.floor(goldBase * 1.1);                  // human
    goldBase = Math.floor(goldBase * 0.25 * (1 + tb.gold)) * 2;
    // Drops: 10% per kill in a hard ZONE, x1.6 for a Lord. Vendored at value x 0.6 x 0.25.
    const dropRate = 0.10 * (0.9 + 0.1 * 1.6) * (1 + tb.drop);
    const it = rngm.withRng(rngm.makeRng(hz.dropIlvl), () =>
      generateItem(hz.dropIlvl, rarityById("epic"), "chest", c.cls));
    const dropGold = dropRate * Math.max(1, Math.floor(it.value * 0.6 * 0.25));
    const goldPerKill = goldBase + dropGold;
    const gph = killsPerHour * goldPerKill;

    // Health carries between kills in a hard zone with NO heal (App.jsx:2936 keeps hp: b.hp), so
    // leech is the only sustain. If it does not cover incoming, the farm is not actually runnable.
    const leech = dps * (sp.leech / 100);
    const net = incoming - leech;
    const hp = maxHpFor(c);
    // Health carries between kills with no heal, so "how many kills before you die" is the honest
    // measure — not whether you survive a single one.
    const killsAlive = net <= 0 ? Infinity : (hp / net) / secs;
    const live = killsAlive === Infinity ? "always" : killsAlive.toFixed(1) + " kills";

    hardRows.push({ hz, ilvl: hz.reqIlvl, dps, secs, killsPerHour, goldPerKill, gph,
                    anchor: ahBaseValue(it), vend: Math.max(1, Math.floor(it.value * 0.6 * 0.25)),
                    ehp, incoming, leech, killsAlive, hp });
    console.log(pad(hz.name, 24) + rp(hz.reqIlvl, 6) + rp(hz.enemyLvl, 11) + rp(g(ehp), 11)
      + rp(g(dps), 12) + rp(secs.toFixed(1), 10) + rp(g(killsPerHour), 9) + rp(g(gph), 11)
      + rp(g(hp), 9) + rp(g(incoming), 10) + rp(g(leech), 8) + rp(live, 10));
  }

  const first = hardRows[0], last = hardRows[hardRows.length - 1];
  console.log("\\n  Gold per kill is the SAME in every bracket (" + g(first.goldPerKill)
    + "g). resolveDeath prices a kill off the PLAYER's level, which is");
  console.log("  pinned at 60 — not off the zone or the enemy. Only kill speed and drop value move across 64-70,");
  console.log("  and enemy health grows faster than gear does, so income across the climb goes "
    + g(first.gph) + " -> " + g(last.gph) + " (x" + (last.gph / first.gph).toFixed(2) + ").");
  console.log("  Kill goals: " + first.hz.killGoal + " -> " + last.hz.killGoal + " kills, i.e. "
    + (first.hz.killGoal / first.killsPerHour).toFixed(1) + "h -> "
    + (last.hz.killGoal / last.killsPerHour).toFixed(1) + "h to clear a zone.");

  // -------- is that income actually reachable? ------------------------------------------------
  // The gold/hour above assumes the kills COMPLETE. Health carries between kills in a hard zone
  // with no heal (App.jsx:2936 keeps hp: b.hp), so this has to be checked, not assumed.
  console.log("\\n  BUT: none of that income is reachable solo. A hard-zone champion needs "
    + first.secs.toFixed(0) + "-" + last.secs.toFixed(0) + " seconds to kill and");
  console.log("  puts out " + g(first.incoming) + "-" + g(last.incoming) + " damage per second against a "
    + g(first.hp) + "-" + g(last.hp) + " health pool — it kills the player in "
    + Math.min(...hardRows.map((r) => r.hp / r.incoming)).toFixed(1) + "-"
    + Math.max(...hardRows.map((r) => r.hp / r.incoming)).toFixed(1) + " seconds.");
  console.log("  Best case (maxed Sanctum + both health talents ~ " + g(first.hp * 1.4 * 1.27)
    + " hp, top-tier auto-potion ~" + g(tierHeal(6) / (POTION_CD / 1000)) + " hp/s) still dies first.");

  // -------- where the money ACTUALLY comes from -------------------------------------------------
  console.log("\\n=== 1c. THE THREE INCOME CHANNELS AT LEVEL 60, SIDE BY SIDE ===");
  console.log("The same kill pays three completely different amounts depending on how it happens.\\n");
  // resolveDeath cuts normal-mode rewards by 95% at max level (App.jsx:2819) to push players into
  // Hard Mode. simulateOffline has no such line — it pays the pre-cap rate forever.
  const liveNormalPerKill = Math.floor(Math.floor(Math.floor(60 + 3.5) * 1.1) * 0.25) * 0.05;
  const offlinePerKill = endgame.gold / Math.max(1, endgame.kills);
  const offlineKph = endgame.kills / Math.max(0.01, endgame.hours);
  console.log(pad("channel", 34) + rp("kills/h", 10) + rp("gold/kill", 12) + rp("gold/h", 12) + rp("vs offline", 12));
  const chans = [
    ["offline farm, normal zone", offlineKph, offlinePerKill, goldPerHour],
    // Same enemies as the offline farm, so the same kill rate — only the payout differs.
    ["live farm, normal zone (max level)", offlineKph, liveNormalPerKill, offlineKph * liveNormalPerKill],
    ["live farm, hard zone (ilvl 64)", first.killsPerHour, first.goldPerKill, first.gph],
    ["live farm, hard zone (ilvl 69)", last.killsPerHour, last.goldPerKill, last.gph],
  ];
  for (const [label, kph, gpk, gph2] of chans) {
    console.log(pad(label, 34) + rp(g(kph), 10) + rp(gpk.toFixed(1), 12) + rp(g(gph2), 12)
      + rp("x" + (gph2 / goldPerHour).toFixed(3), 12));
  }
  console.log("\\n  Two structural gaps show up here, and together they are why gold feels weightless:");
  console.log("  1. resolveDeath cuts normal-mode gold by 95% at max level (App.jsx:2819) to push players");
  console.log("     into Hard Mode. simulateOffline never got that line, so PARKING OFFLINE pays "
    + (goldPerHour / Math.max(1, offlineKph * liveNormalPerKill)).toFixed(0) + "x what");
  console.log("     playing the same zone live pays, and " + (goldPerHour / last.gph).toFixed(0)
    + "x what the endgame it is meant to gate pays.");
  console.log("  2. Offline auto-sells every drop (App.jsx:1743). That is " + g(offlinePerKill - 17)
    + " of the " + offlinePerKill.toFixed(0) + " gold a kill,");
  console.log("     so the dominant income source in the game is vendoring loot the player never sees.");
  console.log("\\n  A player's wealth is therefore set by hours PARKED, not by hours played or by gear.");

  console.log("\\n=== 2. WHAT AN ITEM IS WORTH ===");
  console.log("ahBaseValue = ilvl x rarity.valueMult (the AH price anchor).");
  console.log("Vendor pays value x 0.6 x 0.25 = 15% of it.\\n");
  console.log(pad("ilvl", 7) + pad("rarity", 11) + rp("AH anchor", 12) + rp("vendor pays", 13)
    + rp("hours to earn", 15) + rp("% of a lvl-60 purse", 21));

  const purse60 = rows[1] ? rows[1].gold : 0;
  const brackets = [];
  for (const ilvl of [63, 64, 65, 66, 67, 68, 69, 70]) {
    const rar = ilvl >= 64 ? "epic" : "epic";
    const it = rngm.withRng(rngm.makeRng(ilvl), () => generateItem(ilvl, rarityById(rar), "chest", "warrior"));
    const anchor = ahBaseValue(it);
    // sellPrice is defined INSIDE the React component and cannot be reached from here. Mirrored
    // from src/App.jsx: relics are a flat 150g, everything else is 60% of value less 75%.
    const vend = Math.max(1, Math.floor(it.value * 0.6 * 0.25));
    brackets.push({ ilvl, anchor, vend });
    console.log(pad(ilvl, 7) + pad(rar, 11) + rp(g(anchor), 12) + rp(g(vend), 13)
      + rp((anchor / goldPerHour).toFixed(2) + " h", 15)
      + rp((anchor / Math.max(1, purse60) * 100).toFixed(1) + "%", 21));
  }

  console.log("\\n=== 3. THE PROBLEM, IN ONE NUMBER ===");
  const top = brackets[brackets.length - 1];
  console.log("  A level-60 player farms " + g(goldPerHour) + " gold an hour.");
  console.log("  The best item in the game anchors at " + g(top.anchor) + " gold — "
    + (top.anchor / goldPerHour).toFixed(2) + " hours of farming.");
  console.log("  Vendoring it pays " + g(top.vend) + ", which is " + (top.vend / goldPerHour * 60).toFixed(0) + " MINUTES of farming.");
  console.log("\\n  So there is no reason to list anything: the gold an item represents is noise next to");
  console.log("  what a player earns by simply playing. Selling is a rounding error, not a decision.");

  // What the item is actually WORTH in power, for comparison — this is the number a price should
  // track if listings are meant to matter.
  console.log("\\n=== 4. STAT POINTS PER ITEM (what a price could be anchored to instead) ===");
  const SCORED = ["str","agi","int","sta","armor","leech","resil","vers","cdr","csd","crit","haste"];
  console.log(pad("ilvl", 7) + pad("rarity", 11) + rp("stat points", 13) + rp("AH anchor", 12) + rp("gold/stat pt", 14));
  for (const [ilvl, rar] of [[30, "uncommon"], [60, "rare"], [63, "epic"], [66, "epic"], [70, "epic"], [70, "legendary"]]) {
    const it = rngm.withRng(rngm.makeRng(ilvl * 3), () => generateItem(ilvl, rarityById(rar), "chest", "warrior"));
    const pts = SCORED.reduce((s, k) => s + (it.stats[k] || 0), 0);
    const anchor = ahBaseValue(it);
    console.log(pad(ilvl, 7) + pad(rar, 11) + rp(pts, 13) + rp(g(anchor), 12)
      + rp(pts ? g(anchor / pts) : "-", 14));
  }
  console.log("\\n=== 5. WHAT GOLD IS ALREADY FOR (the sinks it competes with) ===");
  console.log("An item price only matters next to what else that gold buys.\\n");
  const sinks = [
    ["temper +5 (guaranteed)", [1,2,3,4,5].reduce((a,r)=>a+(TEMPER_CFG.cost[r]||0),0)],
    ["temper +10 (all ranks)", Object.values(TEMPER_CFG.cost).reduce((a,b)=>a+b,0)],
    ["one reroll (first)", TEMPER_CFG.reroll.start],
    ["one reroll (tenth)", TEMPER_CFG.reroll.max],
    ["ten rerolls", [0,1,2,3,4,5,6,7,8,9].reduce((a,n)=>a+rerollCost(n),0)],
  ];
  console.log(pad("sink", 26) + rp("gold", 12) + rp("hours to earn", 15));
  for (const [label, cost] of sinks) {
    console.log(pad(label, 26) + rp(g(cost), 12) + rp((cost / goldPerHour).toFixed(1) + " h", 15));
  }
  const topAnchor = brackets[brackets.length - 1].anchor;
  console.log("\\n  A best-in-slot item costs " + g(topAnchor) + " — a rounding error against a +10 temper.");
  console.log("  Gold is NOT worthless: tempering and rerolling are real sinks worth many hours each.");
  console.log("  It is specifically ITEMS that are priced as though they were vendor trash.");

  console.log("\\n=== 6. WHAT A PRICE WOULD HAVE TO BE ===");
  console.log("If a best-in-slot item should cost a meaningful slice of playtime:\\n");
  const it70 = rngm.withRng(rngm.makeRng(210), () => generateItem(70, rarityById("epic"), "chest", "warrior"));
  const pts70 = SCORED.reduce((s, k) => s + (it70.stats[k] || 0), 0);
  console.log(pad("target", 22) + rp("price", 12) + rp("gold/stat pt", 14) + rp("vs today", 12));
  for (const [label, hours] of [["30 minutes", 0.5], ["1 hour", 1], ["2 hours", 2], ["4 hours", 4]]) {
    const price = goldPerHour * hours;
    console.log(pad(label, 22) + rp(g(price), 12) + rp(g(price / pts70), 14)
      + rp("x" + (price / topAnchor).toFixed(0), 12));
  }
  console.log("\\n  A level-70 epic carries about " + pts70 + " stat points, so those targets imply roughly");
  console.log("  " + g(goldPerHour * 0.5 / pts70) + " to " + g(goldPerHour * 4 / pts70) + " gold per stat point, against today's ~25.");
  console.log("");
})();`;
const run = path.join(dir, 'wealth.cjs'); fs.writeFileSync(run, js);
require(run);
