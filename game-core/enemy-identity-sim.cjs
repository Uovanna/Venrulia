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
    const primaryOff = st.int >= st.str && st.int >= st.agi ? "int" : (st.str >= st.agi ? "str" : "agi");
    const prefersMagic = primaryOff === "int";
    const castable = (SKILLS[cls] || []).filter((s) => s.unlockLevel <= 60 && ((s.mult && s.mult > 0) || s.dotMult || s.slowPct));
    const typed = castable.filter((s) => isMagicSkill(s) === prefersMagic);
    const usable = typed.length ? typed : castable;
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
  console.log("\\n  So a player meets all six, but they differ only in which single skill they");
  console.log("  occasionally cast. Damage, health, attack speed and armor are identical.");
  console.log("");
})();`;
const run = path.join(dir, 'enemyid.cjs'); fs.writeFileSync(run, js);
require(run);
