// Browser check for the parts of the feedback work that only exist in App.jsx: the notice
// banner, the potion button, and solo routing its potion through the core's input path. None of
// this is visible to the Vite build.
//
//   npm run build && npx vite preview --port 4173 &
//   node game-core/feedback-ui.check.mjs
//
// Needs playwright + the bundled Chromium (deliberately not a package.json dependency).
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext()).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
await p.route("**://*.supabase.co/**", (r) => r.abort());

const tap = async (l, ms = 700) => { await p.evaluate((lbl) => {
  const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
  const els = [...document.querySelectorAll("button,div,span,a,text,g,tspan")].filter((e) => t(e).includes(lbl)).sort((a, b) => t(a).length - t(b).length);
  if (els[0]) { const r = els[0].getBoundingClientRect();
    for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) els[0].dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); } }, l);
  await p.waitForTimeout(ms); };
const txt = async () => (await p.$eval("#root", (e) => e.innerText)).replace(/\s+/g, " ");
const navTo = async (l, expect) => { for (let k = 0; k < 6; k++) { await tap(l, 1100); if (expect.test(await txt())) return true; await p.waitForTimeout(400); } return false; };

await p.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400);
await tap("Create New Character"); await tap("Rogue"); await tap("Human");   // rogue: combo-point spender on the bar
const n = await p.$("input"); if (n) await n.fill("Feed");
await tap("Enter Eldoria", 1600);
await tap("⚙️", 700);
const box = await p.$('input[placeholder="Enter code..."]'); if (box) await box.fill("anvu");
await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Redeem/i.test(x.innerText)); if (b) b.click(); });
await p.waitForTimeout(1200);
await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Close$/i.test(x.innerText.trim())); if (b) b.click(); });
await p.waitForTimeout(800);
for (let k = 0; k < 10; k++) {
  const picked = await p.evaluate(() => {
    const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
    if (!/Choose (your|a) .*talent/i.test(document.body.innerText)) return false;
    const o = [...document.querySelectorAll("button,div")].filter((e) => /\+\d+(\.\d+)?%/.test(t(e)) && t(e).length < 60).sort((a, b) => t(a).length - t(b).length)[0];
    if (!o) return false; const r = o.getBoundingClientRect();
    for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) o.dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return true; });
  if (!picked) break; await p.waitForTimeout(800); await tap("Confirm", 600);
}

// The notice banner and the potion live in GroupCombat — the Guild's party content — not the
// wilderness screen. With no game server reachable this falls back to a local bot party, which
// is the same component running the same core path.
await tap("The Guild", 1600);
await p.evaluate(() => { const b = [...document.querySelectorAll("button")].filter((x) => x.innerText.trim() === "Queue"); if (b[0]) b[0].click(); });
await p.waitForTimeout(4000);
const inFight = /Potion \(/.test(await txt());
console.log("→ group combat:", inFight);
if (!inFight) { console.log("SCREEN:", (await txt()).slice(0, 400)); await b.close(); process.exit(1); }

const press = async (re) => p.evaluate((src) => {
  const b = [...document.querySelectorAll("button")].find((x) => new RegExp(src).test(x.innerText));
  if (!b) return false;
  b.disabled = false;
  const r = b.getBoundingClientRect();
  for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) b.dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return true;
}, re);
const buttons = async () => p.evaluate(() => [...document.querySelectorAll("button")].map((x) => x.innerText.replace(/\s+/g, " ").trim()));
console.log("action bar:", JSON.stringify((await buttons()).slice(1, 7)));

// --- 1) tap the class-resource spender with an empty bar -> the notice explains why -----------
// Rogue: Flurry spends combo points. Tapped immediately, the bar is empty.
let sawResource = null;
for (let k = 0; k < 30 && !sawResource; k++) {
  await press("Flurry");
  await p.waitForTimeout(120);
  const m = (await txt()).match(/Not enough [A-Za-z ]+ for [^(]+\(\d+\/\d+\)/);
  if (m) sawResource = m[0];
}
console.log("resource notice:", sawResource ? `"${sawResource}" ✓` : "never seen ✗");

// --- 2) the potion goes through the core input path -------------------------------------------
const potCount = async () => { const m = (await txt()).match(/Potion \((\d+)\)/); return m ? Number(m[1]) : null; };
// The party row swaps your HP% for "⚠ incoming" while a boss ability is telegraphed, so a
// single read lands on null fairly often. Retry briefly rather than treat that as unreadable.
const hpOf = async (tries = 8) => {
  for (let k = 0; k < tries; k++) {
    const m = (await txt()).match(/You (\d+)%/);
    if (m) return Number(m[1]);
    await p.waitForTimeout(220);
  }
  return null;
};

// at full health the potion is refused rather than wasted
if ((await hpOf()) === 100) {
  await press("Potion");
  await p.waitForTimeout(600);
  console.log("full-HP refusal:", /Already at full health/.test(await txt()) ? "shown ✓" : "not shown ✗");
}

// Wait for ANY damage. A DPS behind a competent tank can sit at 100% for a long time, so the
// signal to wait for is the boss's raid-wide chip (Lingering Wounds / Cataclysm), not a big hit.
let hp = await hpOf();
for (let k = 0; k < 80 && (hp === null || hp >= 100); k++) { await p.waitForTimeout(400); hp = await hpOf(); }
console.log("hp before potion:", hp === null ? "UNREADABLE — party panel not found" : hp + "%");
const before = await potCount();
await press("Potion");
await p.waitForTimeout(1000);
const after = await potCount(), t2 = await txt();
const hpAfter = await hpOf();
console.log(`potion charges ${before} -> ${after}`, after === before - 1 ? "✓" : "✗");
console.log(`hp ${hp}% -> ${hpAfter}%`, (hpAfter !== null && hp !== null && hpAfter > hp) ? "healed ✓" : "no heal ✗");
console.log("party log records the drink:", /drinks a potion/.test(t2) ? "✓" : "✗");

// --- 3) past the cap it refuses with a reason ----------------------------------------------------
await press("Potion");
await p.waitForTimeout(700);
console.log("past-cap notice:", /No potions left this fight/.test(await txt()) ? "shown ✓" : "not shown ✗");

console.log("errors:", errs.length ? errs.slice(0, 3) : "none");
await p.screenshot({ path: "/tmp/claude-0/-home-user-Venrulia/e812e375-6180-540b-98b2-e3287750d231/scratchpad/feedback.png", fullPage: true });
await b.close();
