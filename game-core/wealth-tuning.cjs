/* WEALTH TUNING — measures what an hour of idle farming is actually worth.
 *
 * Measures, changes nothing. The numbers in IDLE came out of this; re-run it after touching them,
 * or after any change to the offline loop, drop rates, the bank, or player power.
 *
 * The question it asks is the one the economy is built around: how rich does a player get for
 * doing nothing? It answers it against two stated targets — an average player holding 250,000 gold
 * and an ultra-wealthy one holding 5,000,000 — because a rate only means something next to the
 * purse it is meant to fill.
 *
 * WHY IT EXISTS. Idle used to pay a per-kill wage, exactly as playing does. That reads as fair and
 * is not: a parked character kills far more than a played one, so the better a player's gear the
 * more camping paid. Twelve hours in a hard zone measured 836,518 gold here, and about half of it
 * was not combat gold at all — the character dropped ~1,689 items, filled its bank within minutes,
 * and everything after that was auto-sold into the purse. Both halves of that are why gold and XP
 * are now a flat hourly tranche and drops are capped at five an hour.
 *
 * It reports `char.gold`, not the reported `goldGained`, deliberately: the tranche is only part of
 * what a stint is worth, and bank overflow sold on deposit is exactly the leak that made the old
 * number twice what anyone expected. Measuring the purse catches faucets the payout field misses.
 *
 * WHAT IT CANNOT MEASURE: playing with the tab open. The live tick still pays per kill, so an hour
 * watched is worth many times an hour parked, and no figure below reflects that. Every row here is
 * a floor on what an hour of the player's day is worth, never a ceiling.
 *
 *   node game-core/wealth-tuning.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const SEEDS = Number(process.argv[2]) || 5;   // node game-core/wealth-tuning.cjs [seeds]
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
  const g = (n) => Math.round(n).toLocaleString();
  // BOTH random sources are seeded, or the figures below do not reproduce. generateItem draws from
  // the scoped rng, so building gear outside withRng let it fall back to Math.random and equip a
  // different character every run; the drop rolls inside simulateOffline call Math.random directly.
  const seeded = (seed, body) => {
    const prev = Math.random; Math.random = rngm.makeRng(seed);
    try { return rngm.withRng(rngm.makeRng(seed), body); } finally { Math.random = prev; }
  };
  const build = (ilvl, rar, lvl) => seeded(1234, () => {
    let c = core.normalizeChar(core.createCharacter("W", "warrior", "human"));
    c.level = lvl; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); c = core.normalizeChar(c);
    for (const s of core.GEAR_SLOTS.map((x) => x.id)) if (s !== "relic")
      c.equipment[s] = core.generateItem(ilvl, core.rarityById(rar), s, "warrior");
    c = core.armGambits(c);
    c.consumables = { [conKey("heal", 6)]: 99999 };
    c.upgrades = { autoPotion: true };
    c.hp = core.maxHpFor(c);
    return c;
  });
  const run = (c, where, hours, seeds) => {
    let gold = 0, kills = 0, xp = 0, gear = 0, died = 0;
    for (let s = 0; s < seeds; s++) {
      const x = { ...c, equipment: { ...c.equipment }, inventory: [], gold: 0 };
      if (where.zone) x.offlineZoneId = where.zone;
      if (where.hard) x.offlineHardId = where.hard;
      if (where.abyss != null) x.offlineAbyss = where.abyss;
      const r = seeded(900 + s * 613, () => simulateOffline(x, hours * 3600 * 1000));
      if (!r) continue;
      gold += (r.char.gold || 0); kills += r.kills; xp += r.xpGained; gear += (r.gearKept || 0); if (r.died) died++;
    }
    return { gold: gold / seeds, kills: kills / seeds, xp: xp / seeds, gear: gear / seeds, died };
  };
  const rows = [
    ["normal zone (Blighted Marches)", build(63, "epic", 60), { zone: "plaguelands" }],
    ["HARD zone (Greenhollow)",        build(71, "legendary", 60), { hard: "hz_green" }],
    ["HARD zone (Blighted Marches)",   build(71, "legendary", 60), { hard: "hz_blight" }],
    ["ABYSS +0",                       build(71, "legendary", 60), { abyss: 0 }],
  ];
  for (const hrs of [1, 12]) {
    console.log(String.fromCharCode(10) + "PARKED " + hrs + "h \u2014 " + ${SEEDS} + " seeds");
    console.log("spot".padEnd(34) + "gold".padStart(10) + "xp".padStart(10)
              + "kills".padStart(9) + "drops".padStart(8) + "deaths".padStart(8) + "  (drop cap " + (hrs * 5) + ")");
    console.log("-".repeat(74));
    for (const [label, c, where] of rows) {
      const r = run(c, where, hrs, ${SEEDS});
      console.log(label.padEnd(34) + g(r.gold).padStart(10) + g(r.xp).padStart(10)
        + g(r.kills).padStart(9) + g(r.gear).padStart(8) + (r.died + "/" + ${SEEDS}).padStart(8));
    }
  }
  console.log(String.fromCharCode(10) + "AGAINST THE TARGETS");
  const hard12 = run(rows[2][1], rows[2][2], 12, ${SEEDS});
  console.log("  average player should hold      " + g(250000));
  console.log("  one 12h hard park now pays      " + g(hard12.gold)
            + "   (" + (hard12.gold / 250000 * 100).toFixed(1) + "% of that purse)");
  console.log("  was                             " + g(836518));
  console.log("  reduction                       " + (836518 / Math.max(1, hard12.gold)).toFixed(0) + "x");
  console.log("  camping alone to 5,000,000      " + g(5000000 / Math.max(1, hard12.gold * 2)) + " days");
  process.exit(0);
})();`;
const runf = path.join(dir, 'w.cjs'); fs.writeFileSync(runf, js); require(runf);
