/* Do enemies feel like their designed class?
 *
 * Every creature gets a disposition (dispositionFor -> a class id) which sets its stat block and
 * its skill pool. This measures what that disposition actually CHANGES, driving the real
 * enemyStatBlock / enemyBaseDamage / makeEnemy paths out of App.jsx.
 *
 *   node game-core/enemy-identity-sim.cjs
 *
 * Requires `tsc` on PATH. Measures; changes nothing.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-enemyid-'));
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
  const { CLASSES, SKILLS, isMagicSkill } = core;
  const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
  const IDS = CLASSES.map((c) => c.id);

  // ---- 1. STAT BLOCK + DAMAGE -----------------------------------------------------------------
  console.log("\\n=== 1. WHAT A DISPOSITION CHANGES ON THE SHEET ===");
  console.log("enemyStatBlock puts the class's declared main stat in the big slot; the other two");
  console.log("get ENEMY_OFF_SPREAD. enemyBaseDamage then takes max(str, agi, int).\\n");
  console.log(pad("disposition", 13) + pad("main", 6) + rp("str", 6) + rp("agi", 6) + rp("int", 6) + rp("sta", 7)
    + rp("base dmg", 11) + rp("hp", 9) + rp("armor", 8));
  const rows = [];
  for (const cls of IDS) {
    const st = enemyStatBlock(60, cls, { rank: "normal", tier: "normal" });
    const e = { ...st, level: 60 };
    const dmg = enemyBaseDamage(e);
    const hp = Math.floor((60 * 26 + 50) * 1.0 * 1.0);
    rows.push({ cls, st, dmg, hp });
    console.log(pad(cls, 13) + pad(CLASSES.find((c) => c.id === cls).main, 6)
      + rp(st.str, 6) + rp(st.agi, 6) + rp(st.int, 6) + rp(st.sta, 7)
      + rp(dmg.toFixed(1), 11) + rp(hp, 9) + rp(st.armor === undefined ? "none" : st.armor, 8));
  }
  const dmgs = rows.map((r) => r.dmg);
  console.log("\\n  base damage spread across all six dispositions: x"
    + (Math.max(...dmgs) / Math.min(...dmgs)).toFixed(2)
    + "   (max() erases which stat holds the value)");
  console.log("  enemies carry no armor field at all, so no disposition is tankier than another.");

  // ---- 2. SKILLS --------------------------------------------------------------------------------
  console.log("\\n=== 2. THE ONE THING THAT DOES DIFFER: THE SKILL POOL ===");
  console.log("makeEnemy picks from SKILLS[disposition], filtered to the damage type its highest");
  console.log("offensive stat implies. Rank decides HOW MANY: normal 1, champion 2, boss 3, lord 4.\\n");
  console.log(pad("disposition", 13) + rp("castable", 10) + rp("magic", 8) + rp("phys", 7) + rp("with CC", 9) + "   pool it draws from");
  for (const cls of IDS) {
    const st = enemyStatBlock(60, cls, { rank: "normal", tier: "normal" });
    const castable = (SKILLS[cls] || []).filter((s) => s.unlockLevel <= 60 && ((s.mult && s.mult > 0) || s.dotMult || s.slowPct));
    const magicCount = castable.filter(isMagicSkill).length;
    const prefersMagic = magicCount * 2 > castable.length;
    const typed = castable.filter((s) => isMagicSkill(s) === prefersMagic);
    const lopsided = typed.length * 4 >= castable.length * 3;
    const usable = (lopsided && typed.length) ? typed : castable;
    console.log(pad(cls, 13) + rp(castable.length, 10)
      + rp(castable.filter(isMagicSkill).length, 8)
      + rp(castable.filter((s) => !isMagicSkill(s)).length, 7)
      + rp(usable.filter((s) => s.slowPct).length, 9)
      + "   " + usable.slice(0, 3).map((s) => s.name).join(", ") + (usable.length > 3 ? ", …" : ""));
  }

  // ---- 3. HOW OFTEN A SKILL ACTUALLY LANDS ------------------------------------------------------
  console.log("\\n=== 3. HOW MUCH OF A FIGHT IS THE SKILL? ===");
  console.log("A normal trash mob gets ONE skill. Everything else it does is an auto-attack.\\n");
  const RANKS = [["normal", {}], ["champion", { champion: true }], ["boss", { isBoss: true }]];
  console.log(pad("rank", 11) + rp("skills", 9) + rp("hp mult", 10) + rp("dmg mult", 11));
  for (const [name] of RANKS) {
    const R = ENEMY_RANKS[name];
    console.log(pad(name, 11) + rp(R.skills, 9) + rp("x" + R.hp, 10) + rp("x" + R.off, 11));
  }

  // ---- 4. WHAT A PLAYER ACTUALLY MEETS ----------------------------------------------------------
  console.log("\\n=== 4. WHAT THE PLAYER ACTUALLY MEETS ===");
  console.log("Every 10th kill is a boss, so trash is ~90% of everything fought.\\n");
  const names = {};
  for (const cls of IDS) names[cls] = 0;
  const ZONE_NAMES = ["Goblin Bandit", "Forest Spider", "Bullywug", "Highway Thug", "Dust Devil",
                      "Scarecrow Golem", "Gnoll Raider", "Jungle Troll", "Goblin Raider", "Raptor",
                      "Panther", "Ashen Ghoul", "Cinder Imp", "Blight Hound", "Marsh Stalker"];
  for (const n of ZONE_NAMES) names[dispositionFor(n)]++;
  console.log("  dispositions across " + ZONE_NAMES.length + " real creature names:");
  for (const cls of IDS) console.log("    " + pad(cls, 12) + names[cls] + " creature(s)");
  // ---- 5. THREAT BUDGET -------------------------------------------------------------------------
  // Solo enemy health is level-based and does NOT self-calibrate the way group boss health does, so
  // any archetype change lands straight on the difficulty curve unless the budget is held.
  console.log("\\n=== 5. THREAT BUDGET — what the archetypes cost the difficulty curve ===");
  console.log("Total dps (autos AND casts) is held at parity by deriving damage-per-hit from swing");
  console.log("speed, crit and cast cadence together.");
  console.log("Health and armor are where the archetypes are allowed to differ.\\n");
  const LVL = 60;
  console.log(pad("disposition", 13) + rp("swing", 8) + rp("cast", 7) + rp("dmg/hit", 10) + rp("crit", 7)
    + rp("auto", 8) + rp("+cast", 8) + rp("= dps", 8) + rp("hp", 8) + rp("mit", 6) + rp("ehp", 7));
  const budget = [];
  for (const cls of IDS) {
    const a = ENEMY_ARCHETYPE[cls];
    const st = enemyStatBlock(LVL, cls, { rank: "normal", tier: "normal" });
    const e = { ...st, level: LVL, cls };
    const dmg = enemyBaseDamage(e);
    // TOTAL damage per second — autos AND casts. Measuring only autos is what hid a x1.33 real
    // spread behind a table that claimed parity.
    const autoDps = dmg * AUTO_SHARE * (1 + a.crit * CRIT_BONUS) / a.atk;
    const castDps = dmg * CAST_SHARE / a.cast;
    const dps = autoDps + castDps;
    const hp = Math.floor((LVL * 26 + 50) * a.hp);
    const mit = enemyMitigation(e, LVL);
    const eh = hp / (1 - mit);
    budget.push({ cls, dps, eh, threat: dps * eh });
    console.log(pad(cls, 13) + rp("x" + a.atk.toFixed(2), 8) + rp("x" + a.cast.toFixed(2), 7)
      + rp(dmg.toFixed(1), 10) + rp((a.crit * 100).toFixed(0) + "%", 7)
      + rp(autoDps.toFixed(1), 8) + rp(castDps.toFixed(1), 8) + rp(dps.toFixed(1), 8)
      + rp(hp, 8) + rp((mit * 100).toFixed(0) + "%", 6) + rp(Math.round(eh), 7));
  }
  const dpsV = budget.map((b) => b.dps), ehV = budget.map((b) => b.eh);
  const base = { dps: 126.0, eh: 1610 };  // what every disposition was before archetypes   // what every disposition was before archetypes
  console.log("\\n  dps spread across dispositions:  x" + (Math.max(...dpsV) / Math.min(...dpsV)).toFixed(2)
    + "   (was x1.00 — held at parity on purpose)");
  console.log("  ehp spread across dispositions:  x" + (Math.max(...ehV) / Math.min(...ehV)).toFixed(2)
    + "   (was x1.00 — this is the identity)");
  const meanDps = dpsV.reduce((x, y) => x + y, 0) / dpsV.length;
  const meanEh = ehV.reduce((x, y) => x + y, 0) / ehV.length;
  console.log("\\n  population average vs before:  dps x" + (meanDps / base.dps).toFixed(3)
    + "   effective health x" + (meanEh / base.eh).toFixed(3));
  // Dispositions are not evenly distributed — dispositionFor hashes the creature NAME, so the real
  // load depends on how often each one actually turns up.
  let wEh = 0, wN = 0;
  for (const n of ZONE_NAMES) { const c = dispositionFor(n); wEh += budget.find((b) => b.cls === c).eh; wN++; }
  console.log("  weighted by how often each disposition really appears: effective health x"
    + (wEh / wN / base.eh).toFixed(3));
  console.log("  A player meeting a mix of dispositions should feel about the same total load.");
  console.log("");
})();`;
const run = path.join(dir, 'enemyid.cjs'); fs.writeFileSync(run, js);
require(run);
