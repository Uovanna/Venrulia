/* Levelling 1 -> 60 for every class and every spec: where players die, which specs lag, how long.
 *
 * 1-60 is meant to be the tutorial — the stretch that unlocks every system and teaches the game
 * before Hard Mode starts asking real questions. So the numbers that matter are not "is it
 * survivable" but WHERE it stops being survivable, and whether some specs teach a harder game than
 * others for no stated reason.
 *
 * WHAT IS REAL HERE, AND WHAT IS MODELLED — this decides how much the output is worth:
 *
 *   REAL: the fight. simulateOffline out of src/App.jsx resolves every kill — the same enemy stat
 *         blocks, archetypes, mitigation, auto-potion, regen-per-kill and death rule the live loop
 *         uses. Levels, XP and the zone curve are its own. Death penalties mirror resolveDeath.
 *
 *   REAL: the gear table. Drops come from rollLoot at the character's own level and are equipped
 *         through the shipped itemScore, which is what the live auto-equip does.
 *
 *   MODELLED: that gear reaches the player at all. simulateOffline AUTO-SELLS every drop, so a
 *         character run through it alone never upgrades a slot and would meet level-55 enemies in
 *         starter gear. Loot is rolled a second time here and equipped; the gold from that second
 *         roll is DISCARDED, since the offline loop already paid for it.
 *
 * A FIRST PASS OF THIS MEASURED ZERO DEATHS ACROSS ALL 22 SPECS. That is not a difficulty reading,
 * it is a reading of one very well-equipped player. So the run is repeated across four profiles
 * instead, because "who dies" turns out to be a question about which systems a player has found
 * rather than which spec they picked. The profiles are the real output of this file.
 *
 * AUTOMATION IS GAMBITS. An earlier version of this file armed its "rotation" profile by setting
 * char.autoSkillsOwned — a per-skill purchase whose UI had been removed, so nothing could set it and
 * the profile described a character nobody could build. Skills are armed through armGambits now, and
 * only from GAMBIT_UNLOCK_LEVEL, because below that a parked hero genuinely has no automation: there
 * is nobody at the screen to tap a button. That correction moved the no-potion wall from 39 to 28.
 *
 *   node game-core/levelling-sim.cjs [seedsPerSpec]
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const SEEDS = Number(process.argv[2]) || 8;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-level-'));
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
  const { createCharacter, normalizeChar, maxHpFor, tierForLevel, CLASSES, TALENT_L60 } = core;
  const SEEDS = ${SEEDS};
  const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
  const g = (n) => Math.round(n).toLocaleString();
  const SLICE = 6 * 60 * 1000;      // six game-minutes: fine enough to place a death on a level
  const MAXL = 60;

  // Four players, differing only in which systems they have found. Everything else is identical.
  const PROFILES = [
    { id: "engaged",  label: "gambits + potions + gear",  rotation: true,  potions: true,  gear: true  },
    { id: "nopots",   label: "gambits + gear, NO potions",  rotation: true, potions: false, gear: true  },
    { id: "autos",    label: "gear only, NO gambits",     rotation: false, potions: true,  gear: true  },
    { id: "nogear",   label: "gambits + potions, NO gear upgrades", rotation: true, potions: true, gear: false },
  ];

  const runOne = (cls, spec, P) => {
    let c = normalizeChar(createCharacter("Sim", cls, "human"));
    const deaths = [];                 // level at each death
    const timeAtLevel = new Array(61).fill(0);
    let hours = 0, stalled = false, specSet = false, guard = 0;
    const GUARD = 6000;

    while (c.level < MAXL && hours < 400 && guard++ < GUARD) {
      if (!specSet && c.level >= SPEC_LEVEL) {          // a spec is taken the moment it unlocks
        c.spec = spec; c.selectedSkills = []; c = normalizeChar(c); specSet = true;
      }
      c.upgrades = { ...(c.upgrades || {}), autoPotion: !!P.potions };
      // Automation is gambits — the auto-skill flag this used to set has no UI behind it, so a
      // "rotation" profile built that way described a character nobody could make. Gambits do not
      // exist before their unlock, so below it even the engaged profile swings and nothing else:
      // there is nobody parked at the screen to tap a button.
      c = (P.rotation && (c.level || 1) >= GAMBIT_UNLOCK_LEVEL)
        ? core.armGambits(c) : { ...c, gambits: { ...(c.gambits || {}), rules: {} } };
      c.consumables = P.potions ? { [conKey("heal", tierForLevel(c.level))]: 500 } : {};
      c.offlineZoneId = getZoneForLevel(c.level).id;    // death nulls this; re-park each slice
      c.hp = maxHpFor(c);

      const before = c.level;
      const r = simulateOffline(c, SLICE);
      if (!r) { stalled = true; break; }
      c = r.char;
      const slice = Math.max(0.0001, (r.secondsSimulated || 0) / 3600);
      hours += slice; timeAtLevel[Math.min(60, before)] += slice;

      if (r.died) {
        deaths.push(before);
        // resolveDeath: nothing under level 10, else the larger of level*6 or a tenth of the purse,
        // plus a quarter of banked XP. Health restored, combat resumes.
        if (before >= 10) {
          c.gold = Math.max(0, c.gold - Math.min(c.gold, Math.max(Math.floor(before * 6), Math.floor(c.gold * 0.1))));
          c.xp = Math.max(0, (c.xp || 0) - Math.floor((c.xp || 0) * 0.25));
        }
      } else if (r.kills === 0 && c.level === before) { stalled = true; break; }

      // GEAR. The offline loop sells every drop, so upgrades are rolled here from the same table
      // and equipped through the same itemScore the live auto-equip uses. Gold is discarded.
      if (P.gear) {
        const drops = Math.max(1, Math.round((r.kills || 0) / 25));
        for (let d = 0; d < drops; d++)
          for (const it of rollLoot({ level: c.level, isBoss: d === 0, dungeonId: null,
                                      guaranteed: false, clsId: c.cls, dropMult: 1 })) {
            const cur = c.equipment[it.slotId];
            if (!cur || itemScore(it, c.cls) > itemScore(cur, c.cls)) c.equipment = { ...c.equipment, [it.slotId]: it };
          }
      }
    }
    // A run that exhausts the slice guard did NOT take that long to level — it never levelled.
    // Reporting its accumulated hours and death count as a measurement would be inventing a figure
    // out of where the loop happened to be cut off, so it is marked and excluded from the averages.
    if (guard >= GUARD || hours >= 400) stalled = true;
    return { level: c.level, hours, deaths, timeAtLevel, stalled, finished: c.level >= MAXL };
  };

  const PAIRS = [];
  for (const cl of CLASSES) for (const sp of (TALENT_L60[cl.id] || [])) PAIRS.push([cl.id, sp.id, sp.name]);
  const BRACKETS = [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59]];

  console.log("\\n" + "=".repeat(108));
  console.log("LEVELLING 1 -> 60 · " + PAIRS.length + " specs x " + SEEDS + " runs x " + PROFILES.length
    + " profiles = " + g(PAIRS.length * SEEDS * PROFILES.length) + " playthroughs");
  console.log("=".repeat(108));

  const store = {};   // profile -> { rows, deathsByLevel, timeByLevel }
  for (const P of PROFILES) {
    const rows = [], deathsByLevel = new Array(61).fill(0), timeByLevel = new Array(61).fill(0);
    for (const [cls, spec, name] of PAIRS) {
      const runs = [];
      for (let s = 0; s < SEEDS; s++)
        runs.push(rngm.withRng(rngm.makeRng(s * 7919 + spec.length * 131 + cls.charCodeAt(0) * 17 + P.id.length),
                               () => runOne(cls, spec, P)));
      for (const r of runs) {
        for (const lv of r.deaths) deathsByLevel[Math.min(60, lv)]++;
        for (let l = 1; l <= 60; l++) timeByLevel[l] += r.timeAtLevel[l];
      }
      // Averages are taken over runs that FINISHED. A stalled run contributes its death pattern
      // and its wall level, but never a "time to 60" it did not achieve.
      const fin = runs.filter((r) => r.finished);
      const mean = (arr, f) => (arr.length ? arr.reduce((a, r) => a + f(r), 0) / arr.length : NaN);
      rows.push({ cls, spec, name, role: core.specRole ? core.specRole(spec) : "",
        hours: mean(fin, (r) => r.hours), deaths: mean(fin, (r) => r.deaths.length),
        wall: mean(runs.filter((r) => r.stalled), (r) => r.level),
        reached: fin.length, runs: runs.length,
        stalled: runs.filter((r) => r.stalled).length });
    }
    store[P.id] = { rows, deathsByLevel, timeByLevel };
  }

  // ---- 1. the profiles, side by side --------------------------------------------------------------
  console.log("\\n=== 1. WHO ACTUALLY DIES ===\\n");
  console.log("Same 22 specs, same seeds. The only difference is which systems the player has found.\\n");
  console.log(pad("profile", 34) + rp("hours to 60", 13) + rp("deaths", 9)
    + rp("reached 60", 12) + rp("stalled", 9) + rp("wall at lvl", 13));
  for (const P of PROFILES) {
    const { rows } = store[P.id];
    const fin = rows.filter((r) => r.reached > 0);
    const h = fin.length ? fin.reduce((a, r) => a + r.hours, 0) / fin.length : NaN;
    const d = fin.length ? fin.reduce((a, r) => a + r.deaths, 0) / fin.length : NaN;
    const reached = rows.reduce((a, r) => a + r.reached, 0), total = rows.reduce((a, r) => a + r.runs, 0);
    const walls = rows.filter((r) => !isNaN(r.wall));
    const wall = walls.length ? walls.reduce((a, r) => a + r.wall, 0) / walls.length : NaN;
    console.log(pad(P.label, 34) + rp(isNaN(h) ? "never" : h.toFixed(1) + " h", 13)
      + rp(isNaN(d) ? "-" : d.toFixed(1), 9) + rp(reached + "/" + total, 12)
      + rp(rows.reduce((a, r) => a + r.stalled, 0), 9)
      + rp(isNaN(wall) ? "-" : wall.toFixed(1), 13));
  }

  // ---- 2. where the deaths land -------------------------------------------------------------------
  for (const P of PROFILES) {
    const { deathsByLevel, timeByLevel } = store[P.id];
    const total = deathsByLevel.reduce((a, b) => a + b, 0);
    if (!total) { console.log("\\n=== 2." + (PROFILES.indexOf(P) + 1) + ". " + P.label.toUpperCase()
      + " — no deaths recorded in " + g(PAIRS.length * SEEDS) + " playthroughs ==="); continue; }
    console.log("\\n=== 2." + (PROFILES.indexOf(P) + 1) + ". WHERE THEY DIE · " + P.label + " ===\\n");
    console.log(pad("bracket", 11) + rp("deaths", 9) + rp("share", 8) + rp("hours", 10)
      + rp("deaths/10h", 12) + "  risk");
    for (const [a, b] of BRACKETS) {
      let d = 0, h = 0;
      for (let l = a; l <= b; l++) { d += deathsByLevel[l]; h += timeByLevel[l]; }
      const rate = d / Math.max(0.01, h) * 10;
      console.log(pad(a + "-" + b, 11) + rp(g(d), 9) + rp((d / Math.max(1, total) * 100).toFixed(1) + "%", 8)
        + rp(h.toFixed(0), 10) + rp(rate.toFixed(2), 12) + "  " + "#".repeat(Math.min(46, Math.round(rate * 2))));
    }
    const worst = deathsByLevel.map((d, l) => ({ l, d, h: timeByLevel[l], rate: d / Math.max(0.01, timeByLevel[l]) * 10 }))
      .filter((x) => x.l >= 1 && x.h > 0.3 && x.d > 0).sort((a, b) => b.rate - a.rate).slice(0, 8);
    if (worst.length) {
      console.log("\\n" + pad("  worst levels", 15) + rp("deaths", 9) + rp("hours", 9) + rp("deaths/10h", 12) + "  zone");
      for (const w of worst)
        console.log(pad("  level " + w.l, 15) + rp(g(w.d), 9) + rp(w.h.toFixed(1), 9) + rp(w.rate.toFixed(2), 12)
          + "  " + ((getZoneForLevel(w.l) || {}).name || ""));
    }
  }

  // ---- 3. spec spread, measured on the profile that can actually die -------------------------------
  const risky = PROFILES.find((P) => store[P.id].deathsByLevel.reduce((a, b) => a + b, 0) > 0) || PROFILES[0];
  for (const P of PROFILES) {
    const { rows } = store[P.id];
    const hs = rows.map((r) => r.hours).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    const median = hs.length ? hs[Math.floor(hs.length / 2)] : NaN;
    console.log("\\n=== 3." + (PROFILES.indexOf(P) + 1) + ". SPEC SPREAD · " + P.label
      + " (median " + median.toFixed(1) + " h) ===\\n");
    console.log(pad("spec", 13) + pad("name", 14) + pad("role", 9) + rp("hours", 8) + rp("vs median", 12)
      + rp("deaths", 9) + rp("reached 60", 12));
    for (const r of [...rows].sort((a, b) => b.hours - a.hours)) {
      const slow = r.hours / Math.max(0.01, median);
      if (isNaN(r.hours)) { console.log(pad(r.spec, 13) + pad(r.name, 14) + pad(r.role, 9) + rp("never", 8) + rp("-", 12) + rp("-", 9) + rp("0/" + r.runs, 12) + "  <-- walls at level " + (isNaN(r.wall) ? "?" : r.wall.toFixed(0))); continue; }
      const flag = slow > 1.15 ? "  <-- lags" : slow < 0.87 ? "  <-- ahead" : "";
      console.log(pad(r.spec, 13) + pad(r.name, 14) + pad(r.role, 9) + rp(r.hours.toFixed(1), 8)
        + rp((slow >= 1 ? "+" : "") + ((slow - 1) * 100).toFixed(0) + "%", 12)
        + rp(r.deaths.toFixed(1), 9) + rp(r.reached + "/" + r.runs, 12) + flag);
    }
  }

  // ---- 4. per-class roll-up on the engaged profile -------------------------------------------------
  console.log("\\n=== 4. BY CLASS · " + PROFILES[0].label + " ===\\n");
  console.log(pad("class", 10) + rp("specs", 7) + rp("avg hours", 12) + rp("spread", 10)
    + rp("best", 14) + rp("worst", 14));
  for (const cl of CLASSES) {
    const rs = store[PROFILES[0].id].rows.filter((r) => r.cls === cl.id); if (!rs.length) continue;
    const byH = [...rs].sort((a, b) => a.hours - b.hours);
    console.log(pad(cl.id, 10) + rp(rs.length, 7)
      + rp((rs.reduce((a, r) => a + r.hours, 0) / rs.length).toFixed(1), 12)
      + rp("x" + (byH[byH.length - 1].hours / Math.max(0.01, byH[0].hours)).toFixed(2), 10)
      + rp(byH[0].spec, 14) + rp(byH[byH.length - 1].spec, 14));
  }

  // ---- 5. what the tutorial teaches ----------------------------------------------------------------
  console.log("\\n=== 5. SYSTEMS A PLAYER MEETS ON THE WAY TO 60 ===\\n");
  const gates = [
    ["Specialization", SPEC_LEVEL], ["Auction House", 15],
  ];
  for (const [name, lvl] of gates) console.log("  " + pad(name, 24) + "level " + lvl);
  console.log("\\n  Skill slots unlock at: " + [...Array(60).keys()].map((i) => i + 1)
    .filter((l) => l === 1 || core.unlockedSlotCount(l) > core.unlockedSlotCount(l - 1)).join(", "));
  console.log("");
})();`;
const runf = path.join(dir, 'levelling.cjs'); fs.writeFileSync(runf, js);
require(runf);
