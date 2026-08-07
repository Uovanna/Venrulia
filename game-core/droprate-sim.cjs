/* Gear drop-rate simulator for the SOLO Adventure Gate loop.
 *
 * Drives the REAL rollLoot / rollRarityForZone / generateItem out of src/App.jsx rather than a
 * re-implementation, so the numbers describe the shipped game and stay honest after a tuning
 * change. Same transpile trick as determinism-core.cjs.
 *
 *   node game-core/droprate-sim.cjs [kills] [--drop=0.15]
 *
 * `--drop` applies a town drop bonus (townBonuses.drop) to every roll.
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const KILLS = Number(process.argv[2]) || 200000;
const TOWN_DROP = Number((process.argv.find((a) => a.startsWith('--drop=')) || '').split('=')[1]) || 0;

const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-drop-'));
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
  const KILLS = ${KILLS}, TOWN_DROP = ${TOWN_DROP};
  // LOOT_SLOTS lives in the shared core now, so it is an import here rather than a local.
  const __LOOT_SLOTS = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}").LOOT_SLOTS;
  const pct = (n) => (n * 100).toFixed(1) + "%";
  const pad = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);

  // One kill of the solo wilderness loop, exactly as resolveDeath drives it:
  //   every 10th kill is a boss; rewards decay 15% per level above the zone's cap.
  const simulate = (zone, charLevel) => {
    const over = Math.max(0, charLevel - zone.maxLevel);
    const rewardMult = Math.pow(0.85, over);
    const dropMult = rewardMult * (1 + TOWN_DROP);
    const enemyLvl = Math.max(zone.minLevel, Math.min(charLevel, zone.maxLevel));
    const byRarity = {}; let items = 0, bossKills = 0, ilvlSum = 0, ilvlMax = 0;
    for (let k = 1; k <= KILLS; k++) {
      const isBoss = k % 10 === 0;
      if (isBoss) bossKills++;
      const got = rollLoot({ level: enemyLvl, isBoss, dungeonId: null, guaranteed: false, clsId: "warrior", dropMult });
      for (const it of got) {
        items++; byRarity[it.rarity] = (byRarity[it.rarity] || 0) + 1;
        ilvlSum += it.ilvl; ilvlMax = Math.max(ilvlMax, it.ilvl);
      }
    }
    return { items, byRarity, per100: (items / KILLS) * 100, killsPerItem: KILLS / (items || 1),
             avgIlvl: items ? ilvlSum / items : 0, ilvlMax, rewardMult, enemyLvl };
  };

  const RAR = ["common", "uncommon", "rare", "epic", "legendary"];
  console.log("\\nSOLO ADVENTURE-GATE GEAR DROPS  —  " + KILLS.toLocaleString() + " kills per row"
    + (TOWN_DROP ? ", town drop bonus +" + pct(TOWN_DROP) : ", no town bonus"));
  console.log("Every 10th kill is a boss. dropChance = (boss ? 1 : 0.34) x DROP_RATE_MULT x rewardMult x zoneDropScale(level).");
  console.log("zoneDropScale is imported from the core, never restated here — a copied curve reports stale numbers.\\n");

  const header = pad("zone", 22) + rpad("lvl", 4) + rpad("items/100", 11) + rpad("kills/item", 11)
    + rpad("avg ilvl", 9) + "   " + RAR.map((r) => rpad(r.slice(0, 4), 7)).join("");
  console.log(header);
  console.log("-".repeat(header.length));

  const rows = [];
  for (const z of ZONES) {
    // A player who is AT the zone cap — the normal case while progressing.
    const r = simulate(z, z.maxLevel);
    rows.push([z, r]);
    console.log(pad(z.name, 22) + rpad(z.maxLevel, 4) + rpad(r.per100.toFixed(1), 11)
      + rpad(r.killsPerItem.toFixed(1), 11) + rpad(r.avgIlvl.toFixed(1), 9) + "   "
      + RAR.map((rr) => rpad(r.byRarity[rr] ? pct(r.byRarity[rr] / r.items).replace(".0", "") : "-", 7)).join(""));
  }

  // What over-levelling does to the same zone — the anti-farming curve already in the game.
  console.log("\\nOVER-LEVELLING FALLOFF (Greenhollow Wood, cap 10)");
  console.log(pad("your level", 12) + rpad("rewardMult", 12) + rpad("items/100", 11));
  for (const lvl of [10, 15, 20, 30, 45, 60]) {
    const r = simulate(ZONES[0], lvl);
    console.log(pad(lvl, 12) + rpad(r.rewardMult.toFixed(3), 12) + rpad(r.per100.toFixed(1), 11));
  }

  // Gearing pressure: 10 equippable slots. How many kills to see that many drops of a given
  // rarity FLOOR — not upgrades, just appearances, so this is the optimistic bound.
  console.log("\\nKILLS TO SEE 10 DROPS AT OR ABOVE A RARITY (10 gear slots)");
  console.log(pad("zone", 22) + rpad("any", 9) + rpad(">=rare", 10) + rpad(">=epic", 10));
  const order = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  for (const [z, r] of rows) {
    const share = (floor) => {
      let n = 0; for (const k in r.byRarity) if (order[k] >= order[floor]) n += r.byRarity[k];
      return n / KILLS;   // per kill
    };
    const need = (floor) => { const s = share(floor); return s > 0 ? Math.round(10 / s).toLocaleString() : "never"; };
    console.log(pad(z.name, 22) + rpad(need("common"), 9) + rpad(need("rare"), 10) + rpad(need("epic"), 10));
  }
  // ---- the number that actually matters: how fast does a player GEAR UP? -------------------
  // 18 drops per 100 kills only matters if they are upgrades. Equip greedily by (ilvl, total
  // stats) per slot, starting naked, and watch average equipped ilvl climb.
  console.log("\\nGEARING CURVE — start naked in the zone, equip every upgrade");
  const score = (it) => (it.ilvl || 0) * 100 + Object.values(it.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const gearUp = (zone, charLevel, killCap) => {
    const over = Math.max(0, charLevel - zone.maxLevel);
    const dropMult = Math.pow(0.85, over);
    const enemyLvl = Math.max(zone.minLevel, Math.min(charLevel, zone.maxLevel));
    const slots = {}; const marks = {}; let upgrades = 0, seen = 0;
    const targets = [0.25, 0.5, 0.9, 1.0];
    const nSlots = __LOOT_SLOTS.length;
    for (let k = 1; k <= killCap; k++) {
      for (const it of rollLoot({ level: enemyLvl, isBoss: k % 10 === 0, dungeonId: null, guaranteed: false, clsId: "warrior", dropMult })) {
        seen++;
        const cur = slots[it.slotId];
        if (!cur || score(it) > score(cur)) { slots[it.slotId] = it; upgrades++; }
      }
      const filled = Object.keys(slots).length;
      for (const t of targets) if (!marks[t] && filled >= Math.ceil(nSlots * t)) marks[t] = k;
    }
    const eq = Object.values(slots);
    const avgIlvl = eq.length ? eq.reduce((a, b) => a + b.ilvl, 0) / eq.length : 0;
    return { marks, upgrades, seen, filled: eq.length, nSlots, avgIlvl };
  };
  console.log(pad("zone", 22) + rpad("25% slots", 11) + rpad("50%", 11) + rpad("90%", 11) + rpad("all", 11)
    + rpad("upgrade%", 10) + rpad("avg ilvl", 10));
  for (const z of ZONES) {
    const g = gearUp(z, z.maxLevel, 4000);
    const m = (t) => g.marks[t] ? g.marks[t] + " kills" : ">4000";
    console.log(pad(z.name, 22) + rpad(m(0.25), 11) + rpad(m(0.5), 11) + rpad(m(0.9), 11) + rpad(m(1.0), 11)
      + rpad(pct(g.upgrades / (g.seen || 1)).replace(".0", ""), 10) + rpad(g.avgIlvl.toFixed(1), 10));
  }

  // Where normal mode leaves you vs what Hard Mode is built for.
  console.log("\\nHARD MODE GAP");
  const last = ZONES[ZONES.length - 1];
  const g = gearUp(last, last.maxLevel, 20000);
  console.log("  after 20,000 kills in " + last.name + ": avg equipped ilvl " + g.avgIlvl.toFixed(1)
    + " (normal-mode gear is hard-capped at 63)");
  // Measure the raid rather than restating its constant. It is the ONLY route from normal-mode
  // ilvl 63 to the ilvl 64 hard mode expects, so if the zone-scaling curve ever reached it the
  // bridge would close and nothing else here would notice.
  let raidItems = 0; const RAID_KILLS = 20000;
  for (let k = 0; k < RAID_KILLS; k++)
    raidItems += rollLoot({ level: 60, isBoss: k % 8 === 0, dungeonId: "moltencore", guaranteed: false, clsId: "warrior", dropMult: 1 }).length;
  const raidRate = raidItems / RAID_KILLS;
  console.log("  the normal RAID pays " + raidRate.toFixed(2) + " items per kill at ilvl 64 — the intended bridge,"
    + (raidRate > 0.8 ? " exempt from the zone curve as designed" : " WHICH THE ZONE CURVE HAS CLOSED"));
  console.log("  Hard dungeons drop ilvl 66 and their bosses are level 63-68; the hard raid drops 71");
  console.log("");
})();`;
const run = path.join(dir, 'sim.cjs'); fs.writeFileSync(run, js);
require(run);
