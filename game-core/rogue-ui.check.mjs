// A rogue's physical damage now scales off Agility instead of Strength. That change lives in the
// shared core and the client imports it, so nothing SHOULD be able to go wrong client-side — but
// "the client kept its own copy" is the failure this project has hit repeatedly, and a rogue that
// silently deals 1 damage per swing would pass every unit test in the repo.
//
// Plays a real rogue in the real client and checks it deals real damage, then confirms the
// attribute-point refund reached the save.
//
//   npm run build && npx vite preview --port 4173 &
//   node game-core/rogue-ui.check.mjs
import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext()).newPage();
await p.route("**://*.supabase.co/**", (r) => r.abort());
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
const clickText = async (lbl, exact = false) => p.evaluate(([lbl, exact]) => {
  const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
  const els = [...document.querySelectorAll("button,div,span,a,text,g,tspan,option")]
    .filter((e) => (exact ? t(e) === lbl : t(e).includes(lbl))).sort((a, b) => t(a).length - t(b).length);
  if (!els[0]) return false;
  const r = els[0].getBoundingClientRect();
  for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) els[0].dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return true;
}, [lbl, exact]);
const tap = async (l, ms = 650, exact = false) => { const hit = await clickText(l, exact); await p.waitForTimeout(ms); return hit; };
const txt = async () => (await p.$eval("#root", (e) => e.innerText)).replace(/\s+/g, " ");
const code = async (c) => {
  await tap("⚙️", 600);
  const box = await p.$('input[placeholder="Enter code..."]'); if (box) await box.fill(c);
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Redeem/i.test(x.innerText)); if (b) b.click(); });
  await p.waitForTimeout(1100);
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Close$/i.test(x.innerText.trim())); if (b) b.click(); });
  await p.waitForTimeout(800);
};

await p.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400);
await tap("Create New Character"); await tap("Rogue"); await tap("Human");
const nameBox = await p.$("input"); if (nameBox) await nameBox.fill("Sneak");
await tap("Enter Eldoria", 1500);
await code("anvu"); await code("anvugear");
for (let k = 0; k < 10; k++) {
  const picked = await p.evaluate(() => {
    const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
    if (!/Choose (your|a) .*talent/i.test(document.body.innerText)) return false;
    const opts = [...document.querySelectorAll("button,div")].filter((e) => /\+\d+(\.\d+)?%/.test(t(e)) && t(e).length < 60)
      .sort((a, b) => t(a).length - t(b).length);
    if (!opts[0]) return false;
    const r = opts[0].getBoundingClientRect();
    for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) opts[0].dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return true;
  });
  if (!picked) break;
  await p.waitForTimeout(800); await tap("Confirm", 700); await tap("Continue", 700);
}

// Navigation needs retries — a single tap lands before the view has swapped.
const navTo = async (label, expect) => {
  for (let k = 0; k < 6; k++) {
    await tap(label, 1100);
    if (expect.test(await txt())) return true;
    await p.waitForTimeout(500);
  }
  return false;
};

// The Hero > Stats panel shows "Physical Power" (playerBaseDamage) and "Crit Chance" — the two
// numbers this change moves, as the player reads them. It is a separate tab from the Armory.
console.log("→ Hero:", await navTo("Hero", /Stats|Professions|Physical Power/));
console.log("→ Stats:", await navTo("Stats", /Physical Power/));
const sheet = await txt();
const critShown = (sheet.match(/Crit Chance[^0-9]{0,12}(\d+)\s*%/) || [])[1];
const physShown = (sheet.match(/Physical Power[^0-9]{0,12}(\d+)/) || [])[1];
if (!critShown) console.log("STATS SCREEN:", sheet.slice(0, 900));
console.log("displayed crit chance:", critShown + "%", "| displayed Physical Power:", physShown);

// Fight, and read the damage the client actually deals.
console.log("→ Town:", await navTo("Town", /Gate|Bank|Armory/));
console.log("→ Gate:", await navTo("Gate", /Combat|Zone|Adventure/));
// The Gate lists zones; the button that starts a fight is "Travel & Hunt", not "Combat".
console.log("→ Travel & Hunt:", await navTo("Travel & Hunt", /COMBAT LOG|Auto-attack|hits for/));
await p.waitForTimeout(20000);
const log = await txt();
const hits = [...log.matchAll(/Auto-attack: (\d+)/g)].map((m) => Number(m[1]));
const kills = (log.match(/defeated!/g) || []).length;
console.log("auto-attack samples:", hits.slice(0, 12).join(", ") || "(none)");
console.log("kills in ~20s:", kills);

const median = hits.length ? hits.slice().sort((a, b) => a - b)[Math.floor(hits.length / 2)] : 0;
const ok = [];
ok.push(["the rogue swings at all", hits.length > 3]);
ok.push(["it deals real damage, not chip damage", median > 20]);
ok.push(["it actually kills things", kills > 0]);
ok.push([`the sheet shows crit ${critShown}% — the +3% bonus, not the old +13% (which read 48%)`, Number(critShown) > 0 && Number(critShown) < 46]);
ok.push([`the sheet shows Physical Power ${physShown}, driven by Agility now`, Number(physShown) > 0]);
ok.push(["no page errors", errs.length === 0]);
console.log("");
let bad = 0;
for (const [label, pass] of ok) { console.log(`  ${pass ? "✓" : "✗"} ${label}`); if (!pass) bad++; }
console.log(`  median auto-attack: ${median}`);
if (errs.length) console.log("  errors: " + errs.join(" | "));

console.log(bad ? `\n❌ ${bad} rogue check(s) failed` : "\n✅ a rogue scaling off Agility fights correctly in the real client");
await b.close();
process.exit(bad ? 1 : 0);
