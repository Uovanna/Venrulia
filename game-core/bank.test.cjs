/* The bank must never destroy an item.
 *
 * Every grant site used to end in `.slice(-120)`. slice(-120) keeps the LAST 120, so at capacity a
 * new item silently deleted the OLDEST one off the front — no message, no confirmation, and no
 * regard for whether it was locked. Locking guarded selling and salvaging and did nothing here, so
 * players lost gear they had explicitly protected. Nine call sites, one hardcoded literal each.
 *
 * Nothing is dropped now: at capacity a new item is auto-sold, unless it is a legendary, an
 * artifact or locked, in which case it waits in an overflow mailbox until there is room.
 *
 *   node game-core/bank.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-bank-'));
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
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };

  const mk = (n, over) => ({ id: "i" + n, name: "Item " + n, slotId: "chest", ilvl: 60,
    rarity: "rare", value: 400, stats: { str: 10 }, sockets: [], enchant: null, ...over });
  const fullBag = (c) => Array.from({ length: bankCap(c) }, (_, i) => mk(i));

  // --- capacity ---------------------------------------------------------------------------------
  {
    ok(bankCap({}) === BANK_BASE_SLOTS, "a new character banks " + BANK_BASE_SLOTS + " items");
    ok(bankCap({ bankSlots: 25 }) === BANK_BASE_SLOTS + 25, "a purchased expansion adds 25");
    ok(bankCap({ bankSlots: 100 }) === BANK_BASE_SLOTS + 100, "…and they stack");
    ok(bankCap({ bankSlots: -50 }) === BANK_BASE_SLOTS, "a negative value cannot shrink the bank");
    ok(bankCap(null) === BANK_BASE_SLOTS && bankCap(undefined) === BANK_BASE_SLOTS, "junk input still gives a capacity");
    const store = PREMIUM_ITEMS.find((x) => x.kind === "bank");
    ok(!!store, "the Ven shop sells bank slots");
    ok(store.slots === BANK_SLOTS_PER_BUY && store.slots === 25, "…25 slots a purchase");
    ok(store.cost === 100, "…for 100 Ven");
  }

  // --- THE BUG: nothing may be dropped -----------------------------------------------------------
  {
    const c = { inventory: fullBag({}), overflow: [] };
    ok(c.inventory.length === 120, "start at a full bank of 120");
    const r = depositItems(c, [mk(999)]);
    ok(r.inventory.length === 120, "a new item does not grow the bank past its cap");
    ok(r.inventory[0].id === "i0", "…and the OLDEST item is still there — this is what slice(-120) destroyed");
    const kept = new Set(r.inventory.map((x) => x.id));
    ok(c.inventory.every((x) => kept.has(x.id)), "every single item already in the bank survives");
    ok(r.sold.length === 1 && r.sold[0].item.id === "i999", "the NEW item is what gets auto-sold");
    ok(r.gold > 0, "…and the player is paid " + r.gold + "g for it");
  }

  // --- locked gear is never sold -----------------------------------------------------------------
  // Locking already guarded selling and salvaging. It has to guard this too.
  {
    const c = { inventory: fullBag({}), overflow: [] };
    const r = depositItems(c, [mk(999, { locked: true })]);
    ok(r.sold.length === 0, "a locked item is never auto-sold");
    ok(r.overflow.length === 1 && r.overflow[0].id === "i999", "…it waits in the mail instead");
  }

  // --- legendaries go to the mail, not the vendor -------------------------------------------------
  {
    const c = { inventory: fullBag({}), overflow: [] };
    const r = depositItems(c, [mk(1, { rarity: "legendary" }), mk(2, { rarity: "epic" }),
                               mk(3, { rarity: "artifact" }), mk(4, { artifact: true, rarity: "epic" })]);
    const mailedIds = r.mailed.map((x) => x.id).sort();
    ok(JSON.stringify(mailedIds) === JSON.stringify(["i1", "i3", "i4"]),
       "legendary and artifact pieces are held in the mail (" + mailedIds.join(", ") + ")");
    ok(r.sold.length === 1 && r.sold[0].item.rarity === "epic", "an epic at capacity is auto-sold");
  }

  // --- gear the player ALREADY owned is never sold --------------------------------------------------
  // Auto-equip swaps a piece off; selling THAT to make room for the piece that replaced it would be
  // the same data loss wearing a friendlier hat.
  {
    const c = { inventory: fullBag({}), overflow: [] };
    const swappedOff = mk(500, { rarity: "rare" });
    const r = depositItems(c, [mk(600)], [swappedOff]);
    ok(!r.sold.some((s) => s.item.id === "i500"), "a piece swapped off by auto-equip is never auto-sold");
    ok(r.overflow.some((x) => x.id === "i500"), "…it goes to the mail");
  }

  // --- room is used before anything overflows ---------------------------------------------------------
  {
    const c = { inventory: Array.from({ length: 118 }, (_, i) => mk(i)), overflow: [] };
    const r = depositItems(c, [mk(901), mk(902), mk(903)]);
    ok(r.inventory.length === 120, "the last two free slots are filled first");
    ok(r.sold.length === 1 && r.sold[0].item.id === "i903", "only the item that did not fit is sold");
  }

  // --- overflow comes home when space appears -----------------------------------------------------------
  {
    const c = { inventory: fullBag({}), overflow: [mk(801, { rarity: "legendary" }), mk(802, { rarity: "legendary" })] };
    const none = claimOverflow(c);
    ok(none.claimed.length === 0, "nothing returns while the bank is still full");
    const roomy = { inventory: c.inventory.slice(0, 119), overflow: c.overflow };
    const one = claimOverflow(roomy);
    ok(one.claimed.length === 1 && one.overflow.length === 1, "one slot frees exactly one item");
    ok(one.claimed[0].id === "i801", "…the one that has been waiting longest");
    const expanded = { inventory: c.inventory, overflow: c.overflow, bankSlots: 25 };
    const all = claimOverflow(expanded);
    ok(all.claimed.length === 2 && all.overflow.length === 0, "buying slots brings everything home");
  }

  // --- no call site may keep its own truncation ------------------------------------------------------
  // The bug was one hardcoded literal repeated nine times. If a new grant path reintroduces it, the
  // bank starts silently deleting again and nothing else here would notice.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    const code = src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ").replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1");
    const hits = (code.match(/slice\\(\\s*-\\s*120\\s*\\)/g) || []).length;
    ok(hits === 0, "no grant site truncates the bank by hand any more (" + hits + " found)");
    ok(/depositItems/.test(code) && /depositEarned/.test(code), "items enter the bank through the shared helpers");
  }

  // --- persistence -----------------------------------------------------------------------------------
  // Overflow is real gear the player owns. Losing it on reload would be the original bug again.
  {
    const c = core.normalizeChar({ ...core.createCharacter("T", "warrior", "human"),
      bankSlots: 50, overflow: [mk(1, { rarity: "legendary" })] });
    ok(c.bankSlots === 50, "purchased slots survive a reload");
    ok((c.overflow || []).length === 1, "…and so does the overflow mailbox");
    const fresh = core.normalizeChar(core.createCharacter("T", "warrior", "human"));
    ok(fresh.bankSlots === 0 && Array.isArray(fresh.overflow) && fresh.overflow.length === 0,
       "a character with neither field loads with sane defaults");
    const junk = core.normalizeChar({ ...core.createCharacter("T", "warrior", "human"),
      bankSlots: "nonsense", overflow: "nonsense" });
    ok(junk.bankSlots === 0 && Array.isArray(junk.overflow), "…and junk in the save does not throw");
  }

  console.log(fail ? "\\n\\u274c " + fail + " bank check(s) failed"
                   : "\\n\\u2705 the bank never destroys an item: overflow is sold, held, or waits in the mail");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'bank.cjs'); fs.writeFileSync(runf, js);
require(runf);
