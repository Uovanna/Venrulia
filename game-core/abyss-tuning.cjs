/* ABYSS TUNING — measures the difficulty ladder against the gating requirements.
 *
 * Measures, changes nothing. The numbers in ABYSS and DIFFICULTY_TIERS.abyss came out of this;
 * re-run it after touching either, or after any change to player power, gear or the offline loop.
 *
 * The question it asks is the one the whole ladder is built around: can this build PARK here?
 * simulateOffline is the gambit/auto-farm engine, so "survives an hour with no deaths" is the
 * real definition of auto-farmable rather than a guess from a damage formula.
 *
 * OFFLINE PARKING IS CAPPED AT ABYSS +0. Deeper ranks must be played, so this harness measures
 * them by making rank 0 temporarily BE rank N — which models "a character fighting rank-N foes
 * with gambits running" and is exactly what the gating requirements are about. It does not reach
 * past the product's clamp.
 *
 * WHAT IT CANNOT MEASURE: manual play. There is no simulator for a human using cooldowns and
 * potions perfectly, so the brief's "can manually farm +5 but not +7" is not verified here — only
 * the auto-farm ceilings are. Manual play is strictly stronger than parked play, so an auto
 * ceiling is a floor for what a person can do by hand.
 *
 * Two traps this harness fell into, both caught by the BUILD CHECK below rather than by the
 * results looking wrong:
 *   1. generateItem does not set .lines. Writing lines without ensureTemperData first zeroed every
 *      secondary — stamina fell 220 to 38 and the "fully invested" build measured WEAKER than the
 *      fresh one.
 *   2. enemyStatBlock resolves a difficulty tier by ID. Deriving a tier object on the side meant
 *      only enemy health scaled with + rank offline, so every rank fought identically and the
 *      first sweep was pure noise.
 *
 *   node game-core/abyss-tuning.cjs
 *
 * Requires `tsc` on PATH.
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
js = js.replace(/require\("\.\/chronicle\.jsx"\)/g, '({ChronicleStyles:function(){return null},Chronicle:function(){return null},loadTheme:function(){return "auto"},saveTheme:function(){},themeClass:function(){return "theme-day"}})');

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

  
  // ---- ABYSS TUNING -------------------------------------------------------------------------
  // Build a level-60 character at a stated investment level and ask: can it AUTO-FARM (gambits,
  // offline, the same engine a parked player runs on) the Abyss at each + rank?
  //
  // "Can auto-farm" = survives a long slice without dying. simulateOffline reports deaths, so this
  // is measured rather than inferred from a damage formula.
  const RARITY_IDX = { epic: 4, legendary: 5 };
  const buildGear = ({ ilvl, rarity, temper, abyss, perfect }) => {
    const eq = {};
    for (const slot of core.GEAR_SLOTS.map((g) => g.id)) {
      if (slot === "relic") continue;
      const it = core.generateItem(ilvl, core.rarityById(rarity), slot, "warrior");
      // generateItem does NOT set .lines — they are captured lazily from .stats the first time the
      // Forge touches an item. Writing lines without capturing them first zeroes every secondary,
      // which is exactly what the first version of this harness did: stamina fell 220 -> 38 and the
      // "fully invested" build came out WEAKER than the fresh one.
      ensureTemperData(it);
      const mult = (perfect ? 1.3 : 1) * (abyss ? 1 + 0.09 * abyss : 1);
      if (mult !== 1) it.lines = it.lines.map((l) => ({ stat: l.stat, base: Math.max(1, Math.round(l.base * mult)) }));
      if (abyss) it.abyss = abyss;
      if (temper) {
        it.temperLog = Array.from({ length: temper }, (_, k) => (k === 9 ? 6 : 1));
        it.temper = temper;
        it.temperBonus = it.temperLog.reduce((a, b) => a + b, 0);
      }
      syncItemStats(it);
      eq[slot] = it;
    }
    return eq;
  };
  const canAutoFarm = (profile, plus, seeds = 4) => {
    let deaths = 0, kills = 0, hours = 0;
    for (let s = 0; s < seeds; s++) {
      let c = normalizeChar(createCharacter("Abyss", "warrior", "human"));
      c.level = 60; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name);
      c.spec = (TALENT_L60.warrior || [{}])[0].id;
      c = normalizeChar(c);
      c.equipment = buildGear(profile);
      c = core.armGambits(c);
      c.consumables = { [conKey("heal", 6)]: 9999 };
      c.upgrades = { autoPotion: true };
      // Offline parking is capped at Abyss +0 by design, so measuring a deeper rank means making
      // rank 0 BE that rank for the duration rather than reaching past the cap. Measurement tool,
      // not a back door: the product's clamp is untouched.
      // Save and restore, or the override leaks: without this the NEXT measurement inherits the
      // previous rank's tier and the +0 column reads as harder than +5.
      const savedT0 = DIFFICULTY_TIERS.abyss0;
      DIFFICULTY_TIERS.abyss0 = DIFFICULTY_TIERS["abyss" + plus];
      c.offlineAbyss = 0;
      c.hp = maxHpFor(c);
      const r = rngm.withRng(rngm.makeRng(500 + s * 131), () => simulateOffline(c, 60 * 60 * 1000));
      DIFFICULTY_TIERS.abyss0 = savedT0;
      if (!r) continue;
      if (r.died) deaths++;
      kills += r.kills || 0; hours += (r.secondsSimulated || 0) / 3600;
    }
    return { deaths, seeds, kills: Math.round(kills / seeds), survives: deaths === 0 };
  };
  const AB_PROFILES = [
    { id: "fresh",   label: "just cleared Hard raid (ilvl71 epic, no temper, random secondaries)",
      gear: { ilvl: 71, rarity: "epic", temper: 0, abyss: 0, perfect: false } },
    { id: "abyss3",  label: "farmed Abyss +3, tempered +5",
      gear: { ilvl: 71, rarity: "epic", temper: 5, abyss: 3, perfect: false } },
    { id: "abyss5",  label: "Abyss +5 gear, tempered +7, good secondaries",
      gear: { ilvl: 71, rarity: "epic", temper: 7, abyss: 5, perfect: true } },
    { id: "endgame", label: "Abyss 8-9 legendary, +10 temper, perfect secondaries",
      gear: { ilvl: 71, rarity: "legendary", temper: 10, abyss: 9, perfect: true } },
  ];
  // Rebuild the per-rank tiers after changing the knobs — they are baked at module load.
  const retune = (off, hp, lvl, hpP, offP, lvlP) => {
    ABYSS.hpPerPlus = hpP; ABYSS.offPerPlus = offP; ABYSS.lvlPerPlus = lvlP;
    for (let p = 0; p <= 10; p++) DIFFICULTY_TIERS["abyss" + p] = {
      name: p ? "Abyss +" + p : "Abyss",
      off: off * Math.pow(offP, p), hp: hp * Math.pow(hpP, p), lvlBonus: lvl + lvlP * p };
  };
  // Scan EVERY rank rather than stopping at the first death: with a stochastic sim a single
  // unlucky seed would otherwise report a ceiling several ranks too low, which is what made the
  // first sweep look non-monotonic.
  const ceiling = (gear, seeds) => { let top = -1;
    for (let p = 0; p <= 10; p++) if (canAutoFarm(gear, p, seeds).survives) top = p; return top; };

  retune(3.5, 1.35, 11, 1.18, 1.10, 1);
  console.log(String.fromCharCode(10) + "CONFIRM \u2014 base 3.5/1.35/11, hp^1.18, off^1.10, lvl+1 (8 seeds)");
  console.log("profile".padEnd(52) + [0,1,2,3,4,5,6,7,8,9,10].map((p) => ("+" + p).padStart(5)).join("") + "   ceiling");
  for (const P of AB_PROFILES) {
    const row = []; let top = -1;
    for (let p = 0; p <= 10; p++) { const r = canAutoFarm(P.gear, p, 8);
      row.push((r.deaths === 0 ? "ok" : (r.deaths === r.seeds ? "die" : "?" + r.deaths)).padStart(5));
      if (r.deaths === 0) top = p; }
    console.log(P.label.slice(0,51).padEnd(52) + row.join("") + String(top).padStart(10));
  }
  console.log(String.fromCharCode(10) + "  (ok = survived an hour on every seed; ?n = died on n of 8)");
  process.exit(0);
})();`;
const runf = path.join(dir, 'abyss.cjs'); fs.writeFileSync(runf, js);
require(runf);
