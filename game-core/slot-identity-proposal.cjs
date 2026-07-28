/* PROPOSAL MODEL — per-slot secondary weighting.
 *
 * Today every slot draws secondaries from one pool with one weighting (stamina x3, everything
 * else x1), so a helm and a chest differ only by their armour scalar. This models giving each
 * slot a favoured pair WITHOUT touching game code: it generates real items, then re-rolls only
 * WHICH secondaries they carry under the proposed weights, preserving the rolled magnitudes
 * exactly (recovering secBase from the real roll, so nothing is inflated).
 *
 *   node game-core/slot-identity-proposal.cjs [ilvl] [samples]
 *
 * Requires `tsc` on PATH. Changes nothing; prints current vs proposed side by side.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const ILVL = Number(process.argv[2]) || 60;
const N = Number(process.argv[3]) || 6000;

const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-prop-'));
execSync(`tsc "${SRC}" --jsx react --target es2020 --module commonjs --outDir "${dir}" --allowJs --checkJs false --noResolve`, { stdio: 'inherit' });
const outName = fs.readdirSync(dir).find((f) => f.endsWith('.js'));
let js = fs.readFileSync(path.join(dir, outName), 'utf8');
const stub = '({default:{Component:function(){},createElement:function(){return{}},Fragment:"F"},useState:0,useEffect:0,useRef:0,useCallback:0,createElement:function(){return{}},Component:function(){},Fragment:"F"})';
js = js.replace('__importStar(require("react"))', stub);
js = js.replace(/require\("\.\.\/game-core\//g, `require("${path.join(__dirname).replace(/\\/g, '/')}/`);
js = js.replace(/import\.meta\.env/g, '({})');

js += `
;(function(){
  const ILVL = ${ILVL}, N = ${N};
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
  const { LOOT_SLOTS, generateItem, effectiveStats, offlinePlayerDps, maxHpFor, mitigation,
          rarityById, createCharacter } = core;
  const pad = (s, n) => String(s).padEnd(n); const rpad = (s, n) => String(s).padStart(n);

  // ---- THE PROPOSAL -------------------------------------------------------------------------
  // Two favoured secondaries per slot. Every secondary has at least two homes, so nothing becomes
  // unfindable; stamina keeps four, because it is the survivability backbone and starving it
  // would be a balance change dressed up as a flavour change.
  // Stamina keeps a floor everywhere. Without it, confining sta to four favoured slots quietly
  // cost ~7% of a full set's effective HP — a balance change hiding inside a flavour change, and
  // the wrong direction when Hard Mode is already reported as brutal.
  const FAV = 5, BASE = 1, STA_BASE = Number(process.env.STA_BASE || 2);
  const SLOT_SECONDARY = {
    head:     ["csd",   "cdr"],    // Precision — crit damage and cooldowns
    shoulder: ["sta",   "vers"],   // Bulwark-lite — health with a damage edge
    chest:    ["sta",   "resil"],  // Bulwark — the tankiest plate
    hands:    ["vers",  "csd"],    // Aggression — pure offence
    legs:     ["sta",   "leech"],  // Endurance — health and sustain
    feet:     ["cdr",   "vers"],   // Uptime — cooldowns and throughput
    weapon:   ["csd",   "vers"],   // Lethality — the damage slot leans into damage
    offhand:  ["resil", "sta"],    // Guard — mitigation and control resistance
    ring:     ["cdr",   "csd"],    // Attunement — the "rotation" slot
    trinket:  ["leech", "resil"],  // Esoteric — sustain and the odd defences
  };
  const POOL = ["sta", "leech", "vers", "resil", "cdr", "csd"];
  const SIZE = { sta: 1.0, leech: 0.5, vers: 0.5, resil: 0.5, cdr: 0.5, csd: 0.5 };

  // Re-roll only WHICH secondaries an item carries, keeping the rolled magnitudes. secBase is
  // recovered from the real roll so the proposal cannot silently inflate item power.
  const reroll = (it, slotId) => {
    const present = POOL.filter((k) => (it.stats[k] || 0) > 0);
    if (!present.length) return it;
    const secBase = Math.max(...present.map((k) => (it.stats[k] || 0) / (SIZE[k] || 0.5)));
    const fav = SLOT_SECONDARY[slotId] || [];
    const avail = [...POOL]; const chosen = [];
    for (let i = 0; i < present.length && avail.length; i++) {
      const w = avail.map((k) => (fav.includes(k) ? FAV : (k === "sta" ? STA_BASE : BASE)));
      const tot = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * tot, idx = 0;
      while (r >= w[idx]) { r -= w[idx]; idx++; }
      chosen.push(avail[idx]); avail.splice(idx, 1);
    }
    const stats = { ...it.stats };
    for (const k of POOL) stats[k] = 0;
    for (const k of chosen) stats[k] = Math.max(1, Math.round(secBase * (SIZE[k] || 0.5)));
    return { ...it, stats };
  };

  const CLS = "warrior", LEVEL = 60;
  const naked = (() => { const c = createCharacter("Bench", CLS, "human"); c.level = LEVEL;
    for (const k in c.equipment) c.equipment[k] = null; return c; })();
  const ehp = (c) => maxHpFor(c) / (1 - mitigation(effectiveStats(c).armor || 0, LEVEL));
  const baseDps = offlinePlayerDps(naked), baseEhp = ehp(naked);
  const rar = rarityById("rare");

  const measure = (useProposal) => {
    const out = {};
    for (const s of LOOT_SLOTS) {
      let dDps = 0, dEhp = 0; const mix = {};
      for (let i = 0; i < N; i++) {
        let it = generateItem(ILVL, rar, s.id, CLS);
        if (useProposal) it = reroll(it, s.id);
        for (const k of POOL) if ((it.stats[k] || 0) > 0) mix[k] = (mix[k] || 0) + 1;
        const c = { ...naked, equipment: { ...naked.equipment, [s.id]: it } };
        dDps += offlinePlayerDps(c) - baseDps;
        dEhp += ehp(c) - baseEhp;
      }
      out[s.id] = { dps: dDps / N, ehp: dEhp / N, mix };
    }
    return out;
  };

  const cur = measure(false), prop = measure(true);
  const spread = (m, key) => {
    const v = LOOT_SLOTS.filter((s) => s.id !== "weapon").map((s) => m[s.id][key]).sort((a, b) => a - b);
    return v[v.length - 1] / (v[0] || 1);
  };

  console.log("\\nPROPOSED PER-SLOT SECONDARY IDENTITY — ilvl " + ILVL + ", rare, " + N.toLocaleString() + " rolls/slot");
  console.log("Magnitudes are preserved; only WHICH secondaries appear changes.\\n");
  const h = pad("slot", 10) + pad("identity", 20) + rpad("dps now", 9) + rpad("dps new", 9)
    + rpad("ehp now", 9) + rpad("ehp new", 9) + "   top secondaries (new)";
  console.log(h); console.log("-".repeat(h.length));
  for (const s of LOOT_SLOTS) {
    const c = cur[s.id], p = prop[s.id];
    const top = Object.entries(p.mix).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, n]) => k + " " + Math.round(n / N * 100) + "%").join(", ");
    console.log(pad(s.id, 10) + pad((SLOT_SECONDARY[s.id] || []).join("/"), 20)
      + rpad(c.dps.toFixed(1), 9) + rpad(p.dps.toFixed(1), 9)
      + rpad(Math.round(c.ehp), 9) + rpad(Math.round(p.ehp), 9) + "   " + top);
  }

  console.log("\\nSPREAD ACROSS NON-WEAPON SLOTS  (higher = slots differ more)");
  console.log("  damage        now x" + spread(cur, "dps").toFixed(2) + "   ->  proposed x" + spread(prop, "dps").toFixed(2));
  console.log("  survivability now x" + spread(cur, "ehp").toFixed(2) + "   ->  proposed x" + spread(prop, "ehp").toFixed(2));

  const tot = (m, key) => LOOT_SLOTS.reduce((a, s) => a + m[s.id][key], 0);
  console.log("\\nTOTAL POWER OF A FULL SET (must stay roughly flat — this is identity, not a buff)");
  console.log("  sum of slot dps   now " + tot(cur, "dps").toFixed(1) + "  ->  proposed " + tot(prop, "dps").toFixed(1)
    + "   (" + ((tot(prop, "dps") / tot(cur, "dps") - 1) * 100).toFixed(1) + "%)");
  console.log("  sum of slot ehp   now " + Math.round(tot(cur, "ehp")) + "  ->  proposed " + Math.round(tot(prop, "ehp"))
    + "   (" + ((tot(prop, "ehp") / tot(cur, "ehp") - 1) * 100).toFixed(1) + "%)");
  console.log("");
})();`;
const run = path.join(dir, 'prop.cjs'); fs.writeFileSync(run, js);
require(run);
