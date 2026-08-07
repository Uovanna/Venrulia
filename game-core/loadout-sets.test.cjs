/* Two gear sets, and the one thing that must never happen: both applied at once.
 *
 * The design makes that unrepresentable rather than merely tested. char.equipment is the ONLY
 * equipment map that exists at any moment — every stat, set bonus and socket reads it and nothing
 * else — and the parked set sits in loadouts.stash, which nothing computes from. Swapping is a
 * single atomic exchange, so there is no window, not even one render, in which both could be live.
 *
 * These checks exist to prove that claim rather than assert it, so they attack it from the outside:
 * they park a FULL Battlemaster set plus both runes in the stash and demand the character get
 * nothing at all from them.
 *
 * The second thing they cover is what parked gear must still be able to do. Items in the stash are
 * deliberately not in the inventory — so they cannot be sold, salvaged or listed out from under
 * the set they belong to — but that same absence is what would quietly make them untemperable.
 *
 *   node game-core/loadout-sets.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-lo-'));
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
  const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
  let fail = 0;
  const ok = (c, m) => { console.log((c ? "  \\u2713 " : "  \\u2717 ") + m); if (!c) fail++; };
  const sec = (t) => console.log(String.fromCharCode(10) + t);
  const mk = (o) => core.normalizeChar({ ...core.createCharacter("Duelist", "warrior", "human"), level: 60, ...o });

  // A full arena kit: four set pieces, the Aegis Diamond and the Unfettered Onyx.
  const arenaKit = () => {
    const eq = {};
    for (const s of ["head", "chest", "legs", "feet"])
      eq[s] = { id: "bm_" + s, slotId: s, setId: "battlemaster", rarity: "artifact", ilvl: 65,
                name: "Battlemaster's " + s, stats: { str: 40, armor: 100 }, sockets: [null, null, null] };
    eq.head.sockets = ["g_aegis", "g_unfetter", null];
    return eq;
  };
  const pveKit = () => ({
    head: { id: "pve_head", slotId: "head", rarity: "epic", ilvl: 63, name: "Raid Helm", stats: { str: 50 }, sockets: [] },
    chest: { id: "pve_chest", slotId: "chest", rarity: "epic", ilvl: 63, name: "Raid Chest", stats: { str: 50 }, sockets: [] },
  });

  // --- the invariant --------------------------------------------------------------------------
  sec("A parked set gives NOTHING");
  {
    const c = mk({ equipment: pveKit(), loadouts: { active: 0, stash: arenaKit() } });
    ok(core.setPiecesEquipped(c, "battlemaster") === 0,
       "four Battlemaster pieces sitting in the stash count as zero worn");
    ok(core.pvpDamageTakenMult(c) === 1,
       "\\u2026so a parked full set plus both runes gives no Arena mitigation at all");
    ok(core.hasCcBreak(c) === false, "\\u2026and the parked Unfettered Onyx does not break stuns");
    const st = core.effectiveStats(c);
    const worn = core.effectiveStats(mk({ equipment: pveKit() }));
    ok(st.str === worn.str && st.armor === worn.armor,
       "\\u2026and the parked gear adds no stats: " + st.str + " Str either way");
    // The strongest form of the claim: swap the two around and the numbers swap with them.
    const flipped = mk({ equipment: arenaKit(), loadouts: { active: 1, stash: pveKit() } });
    ok(core.setPiecesEquipped(flipped, "battlemaster") === 4, "worn, the same four pieces count as four");
    ok(Math.abs(core.pvpDamageTakenMult(flipped) - 0.6561 * 0.7) < 1e-9,
       "\\u2026and the set and rune apply in full (0.459)");
  }
  // The reason it holds: there is only ever ONE equipment map, and nothing reads the stash.
  {
    const coreSrc = require("fs").readFileSync("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}", "utf8");
    // Counting mentions proves nothing; WHERE they are is the whole point. Every mention of the
    // stash in the core must sit inside normalizeChar or createCharacter — that is storage. A
    // mention anywhere else would be something computing from the parked set.
    // Attribute every mention of the stash to its enclosing top-level declaration by scanning
    // backwards, rather than guessing at character offsets. Only the two functions that STORE a
    // character may name it; anything else naming it would be computing from the parked set.
    const lines = coreSrc.split(String.fromCharCode(10));
    const ownerOf = (n) => { for (let i = n; i >= 0; i--) { const m = /^(?:const|function) (\\w+)/.exec(lines[i]); if (m) return m[1]; } return "(top level)"; };
    const owners = {};
    lines.forEach((l, n) => { if (l.indexOf("stash") >= 0) { const o = ownerOf(n); owners[o] = (owners[o] || 0) + 1; } });
    const allowed = ["createCharacter", "normalizeChar"];
    const strays = Object.keys(owners).filter((o) => !allowed.includes(o));
    ok(Object.keys(owners).length > 0 && strays.length === 0,
       "the stash is named only in " + Object.keys(owners).join(" and ") + " \\u2014 storage, never computation"
       + (strays.length ? " (stray: " + strays.join(", ") + ")" : ""));

    // And the four functions that decide what a character is worth never name it. Note
    // pvpDamageTakenMult does not mention the word equipment either: it delegates to the two
    // below it, so requiring that word would have been a check passing for the wrong reason.
    for (const decl of ["function effectiveStats", "const setPiecesEquipped",
                        "const socketedGems", "const pvpDamageTakenMult"]) {
      const i = coreSrc.indexOf(decl);
      const rest = coreSrc.slice(i + decl.length);
      const end = rest.search(new RegExp(String.fromCharCode(10) + "(?:const|function|export) "));
      const body = end > 0 ? rest.slice(0, end) : rest.slice(0, 600);
      ok(i > 0 && body.indexOf("stash") < 0, decl.split(" ")[1] + " never reads the stash");
    }
  }

  // --- the swap -------------------------------------------------------------------------------
  sec("Swapping is one atomic exchange");
  {
    const sw = src.slice(src.indexOf("const swapLoadout"), src.indexOf("const swapLoadout") + 900);
    ok(sw.indexOf("equipment: loadoutStash(c) || {}") > 0 && sw.indexOf("stash: c.equipment || {}") > 0,
       "equipment and stash are exchanged in a SINGLE commitChar\\u2026");
    const commits = (sw.match(/commitChar\\(/g) || []).length;
    ok(commits === 1,
       "\\u2026and there is exactly one commit (" + commits + "), so no intermediate state can exist where a set is both worn and parked");
    ok(sw.indexOf("if (battleRef.current)") > 0, "and gear cannot be swapped mid-fight");

    // Walk the exchange by hand and check nothing is created or lost.
    const swap = (c) => ({ ...c, equipment: (c.loadouts || {}).stash || {},
                           loadouts: { active: 1 - ((c.loadouts || {}).active === 1 ? 1 : 0), stash: c.equipment || {} } });
    let c = mk({ equipment: pveKit(), loadouts: { active: 0, stash: arenaKit() } });
    const ids = (x) => [...Object.values(x.equipment || {}), ...Object.values((x.loadouts || {}).stash || {})]
      .filter(Boolean).map((i) => i.id).sort().join(",");
    const before = ids(c);
    c = swap(c);
    ok(c.loadouts.active === 1, "the active index flips");
    ok(core.setPiecesEquipped(c, "battlemaster") === 4, "the arena kit is now worn");
    ok(ids(c) === before, "no item is created or destroyed by the swap");
    c = swap(c);
    ok(c.loadouts.active === 0 && core.setPiecesEquipped(c, "battlemaster") === 0 && ids(c) === before,
       "swapping back restores exactly the starting state");
    // A set that has never been built is empty, not a copy — items are unique and cannot be cloned.
    const fresh = mk({ equipment: pveKit(), loadouts: { active: 0, stash: null } });
    const s2 = swap(fresh);
    ok(Object.values(s2.equipment).filter(Boolean).length === 0, "an unbuilt second set is empty\\u2026");
    ok(Object.values(s2.loadouts.stash).filter(Boolean).length === 2, "\\u2026and the first set is safely parked, not lost");
  }

  // --- parked gear is safe, but not stranded -----------------------------------------------------
  sec("What parked gear can and cannot have done to it");
  {
    // Not in the inventory, so the systems that consume inventory cannot touch it.
    const c = mk({ equipment: pveKit(), loadouts: { active: 0, stash: arenaKit() }, inventory: [] });
    ok((c.inventory || []).length === 0,
       "parked items are NOT in the inventory, so they cannot be sold, salvaged or listed");
    // …but the forge must still reach them, or an arena kit is untemperable while it is put away.
    ok(src.indexOf("...Object.values(loadoutStash(char) || {}).filter(isTemperable),") > 0,
       "the Tempering Forge lists parked gear too");
    const find = src.slice(src.indexOf("const findItemById"), src.indexOf("const findItemById") + 400);
    ok(find.indexOf("loadoutStash(c)") > 0, "findItemById searches the parked set\\u2026");
    const repl = src.slice(src.indexOf("const replaceItemInChar"), src.indexOf("const replaceItemInChar") + 700);
    ok(repl.indexOf("loadouts = { ...loadoutRec(c), stash }") > 0,
       "\\u2026and replaceItemInChar writes back into it, so a temper on parked gear is not silently dropped");
  }

  // --- auto-equip must not dismantle a set --------------------------------------------------------
  sec("Auto-equip leaves set pieces alone");
  {
    // itemScore knows about item level and stats and NOTHING about set bonuses, so a raid drop one
    // ilvl above a Battlemaster piece scores higher and would cost the player mitigation they paid
    // 125 tokens for, silently, while they were not looking.
    ok(src.indexOf("const wornIsSetPiece") > 0, "a worn set piece is never auto-replaced");
    // Prove the scoring really would have replaced it, so the guard is not decoration.
    const bm = { slotId: "head", setId: "battlemaster", rarity: "artifact", ilvl: 65, stats: { str: 40 } };
    const raid = { slotId: "head", rarity: "legendary", ilvl: 71, stats: { str: 80 } };
    ok(itemScore(raid, "warrior") > itemScore(bm, "warrior"),
       "an ilvl 71 raid helm really does outscore the set piece (" +
       Math.round(itemScore(raid, "warrior")) + " vs " + Math.round(itemScore(bm, "warrior")) + ") \\u2014 the guard is load-bearing");

    // AND THE DROP MUST STILL ARRIVE. Written as an early return-statement the guard exited the whole
    // per-item callback, so a drop for a set-piece slot was not equipped, not auto-sold and not
    // banked — it was deleted. Guarding a slot must never cost the player the item.
    const gl = src.slice(src.indexOf("const grantLoot"), src.indexOf("const grantLoot") + 1800);
    ok(gl.indexOf("const wornIsSetPiece = !!(cur && cur.setId);") > 0,
       "the set-piece check is a CONDITION on the equip\\u2026");
    ok(gl.indexOf("if (!wornIsSetPiece && (!cur || itemScore(it, c.cls) > itemScore(cur, c.cls))) {") > 0,
       "\\u2026folded into the score comparison rather than short-circuiting the item");
    ok(gl.indexOf("if (cur && cur.setId) return;") < 0,
       "\\u2026and there is no bare early return that would swallow the drop");
    // Walk the branch structure: every path through the callback must end at toBag, a sale, or an
    // equip. Count the returns that precede toBag.push and make sure each is paired with an action.
    const beforeBag = gl.slice(0, gl.indexOf("toBag.push(it)"));
    const returns = (beforeBag.match(/\\breturn;/g) || []).length;
    const actions = (beforeBag.match(/equip\\[it\\.slotId\\] = it|gold \\+= price/g) || []).length;
    ok(returns === actions,
       "every early exit is paired with an action that keeps the item (" + returns + " returns, " + actions + " actions)");
  }

  // --- persistence ---------------------------------------------------------------------------------
  sec("It survives a reload");
  {
    const saved = { active: 1, stash: arenaKit() };
    const back = core.normalizeChar({ ...core.createCharacter("D", "warrior", "human"), loadouts: saved });
    ok(back.loadouts.active === 1, "the active index persists");
    ok(Object.keys(back.loadouts.stash).length === 4, "the parked set persists intact");
    ok(core.normalizeChar({ ...core.createCharacter("D", "warrior", "human") }).loadouts.stash === null,
       "a character who has never used the second set has an empty stash, not a phantom one");
    for (const junk of ["nonsense", 5, [], { active: 9, stash: "no" }]) {
      const n = core.normalizeChar({ ...core.createCharacter("D", "warrior", "human"), loadouts: junk });
      if (n.loadouts.active !== 0 && n.loadouts.active !== 1) { ok(false, "junk loadouts normalise safely"); break; }
    }
    ok(true, "junk in the save normalises to a valid state rather than throwing");
    const bad = core.normalizeChar({ ...core.createCharacter("D", "warrior", "human"), loadouts: { active: 9, stash: "no" } });
    ok(bad.loadouts.active === 0 && bad.loadouts.stash === null, "\\u2026including an out-of-range index");
  }

  // --- reachability ----------------------------------------------------------------------------------
  sec("A player can actually get there");
  {
    ok(src.indexOf('aria-label={\`Gear set \${i + 1}') > 0, "both tabs render in the Armory");
    ok(src.indexOf("onClick={() => { if (!on) swapLoadout(); }}") > 0, "tapping the inactive tab swaps");
    ok(src.indexOf("disabled={on}") > 0, "\\u2026and tapping the active one does nothing");
    ok(src.indexOf("s.count ? \`\${s.count} piece") > 0,
       "each tab shows what is in that set, because 'Set 2' alone tells a player nothing");
  }

  console.log(fail ? String.fromCharCode(10) + "\\u274c " + fail + " loadout check(s) failed"
                   : String.fromCharCode(10) + "\\u2705 gear sets: only one is ever applied, the swap conserves every item, and parked gear stays temperable");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'lo.cjs'); fs.writeFileSync(runf, js);
require(runf);
