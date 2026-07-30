// Does slot identity actually reach the player? The unit tests prove generateItem's
// distribution, but they call it directly. This drives the real client: roll a full epic set in
// the browser, read the equipped items out of the save, and confirm a helm and a pair of legs
// are visibly different items rather than the same roll under two names.
//
// Everything the build cannot see lives here — the client has its own copies of things often
// enough (normalizeChar, generateItem, SEC_SIZE) that "it compiled" proves very little.
//
//   npm run build && npx vite preview --port 4173 &
//   node game-core/gear-ui.check.mjs
//
// Needs playwright + the bundled Chromium; deliberately not a package.json dependency, since
// Netlify would then install it on every deploy.
import { chromium } from "playwright";
import { SLOT_SECONDARY, SECONDARY_POOL } from "./combat.mjs";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext()).newPage();
await p.route("**://*.supabase.co/**", (r) => r.abort());   // the cloud save is authoritative on launch
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
const code = async (c) => {
  await tap("⚙️", 600);
  const box = await p.$('input[placeholder="Enter code..."]'); if (box) await box.fill(c);
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Redeem/i.test(x.innerText)); if (b) b.click(); });
  await p.waitForTimeout(1100);
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Close$/i.test(x.innerText.trim())); if (b) b.click(); });
  await p.waitForTimeout(800);
};

await p.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400);
await tap("Create New Character"); await tap("Warrior"); await tap("Human");
const nameBox = await p.$("input"); if (nameBox) await nameBox.fill("Gearcheck");
await tap("Enter Eldoria", 1500);
await code("anvu");        // level 60, so drops roll at full ilvl
// `anvu` stacks every talent-tier prompt as a blocking modal; clear them, the choice is moot.
for (let k = 0; k < 10; k++) {
  const picked = await p.evaluate(() => {
    const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
    if (!/Choose (your|a) .*talent/i.test(document.body.innerText)) return false;
    const opts = [...document.querySelectorAll("button,div")].filter((e) => /\+\d+(\.\d+)?%/.test(t(e)) && t(e).length < 60)
      .sort((a, b) => t(a).length - t(b).length);
    if (!opts[0]) return false;
    const r = opts[0].getBoundingClientRect();
    for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) opts[0].dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return t(opts[0]);
  });
  if (!picked) break;
  await p.waitForTimeout(800);
  await tap("Confirm", 700); await tap("Continue", 700);
}

// Read the character straight out of the save. Both bags matter: `anvugear`/`frankie` equip the
// set, while `hardmode` drops it into the inventory — reading only `equipment` made that code
// look like it had rolled the previous set again, which reads as a broken RNG rather than a
// broken check.
const readChar = () => p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("wow_idlecraft_save")); let c = null;
  const w = (o) => { if (!o || typeof o !== "object" || c) return;
    if (o.equipment && Array.isArray(o.selectedSkills)) { c = { equipment: o.equipment, inventory: o.inventory || [] }; return; }
    for (const k of Object.keys(o)) w(o[k]); }; w(s);
  return c;
});

// The gear codes are one-shot per character, so this samples the three of them rather than
// re-rolling one. Thirty items is far too few to re-measure the per-slot distribution — the unit
// tests do that against the same shared function — but it is plenty to answer the question a
// browser can uniquely answer: does the CLIENT's bundled generateItem behave like the core's,
// or has App.jsx drifted again.
let hp = null, sample = null; const seenIds = new Set();
const lines = [];   // one entry per rolled secondary line, across every set
console.log("");
for (const [c, label, bag] of [["anvugear", "epic", "equipment"], ["hardmode", "rare ilvl-64", "inventory"],
                               ["frankie", "green", "equipment"]]) {
  await code(c);
  // The save is written asynchronously, so read until genuinely new items appear rather than
  // trusting a fixed wait — a stale read is indistinguishable from a set that rolled the same.
  let items = [];
  for (let k = 0; k < 12; k++) {
    const ch = await readChar();
    const got = ch ? (bag === "equipment" ? Object.values(ch.equipment || {}) : ch.inventory) : [];
    items = got.filter((it) => it && it.stats && it.slotId && it.slotId !== "relic" && !seenIds.has(it.id));
    // The bag already holds starter gear, so keep only the ten the code just appended.
    if (bag === "inventory") items = items.slice(-10);
    if (items.length >= 8) break;
    await p.waitForTimeout(400);
  }
  if (items.length < 8) { console.log(`\n❌ '${c}' produced only ${items.length} new items in the ${bag} — the save never refreshed.`); await b.close(); process.exit(1); }
  for (const it of items) seenIds.add(it.id);
  console.log(`  ${label.padEnd(13)} ${items.length} items, ${items[0].rarity} ilvl ${items[0].ilvl}`);
  if (label === "epic") sample = Object.fromEntries(items.map((it) => [it.slotId, it]));
  for (const it of items) {
    if (!SLOT_SECONDARY[it.slotId]) continue;
    for (const k of SECONDARY_POOL) if ((it.stats[k] || 0) > 0) lines.push({ slot: it.slotId, k, label });
  }
  hp = await p.evaluate(() => { const m = document.body.innerText.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*HP/i); return m ? m[2] : null; });
}

const favLines = lines.filter((l) => SLOT_SECONDARY[l.slot].includes(l.k)).length;
const share = lines.length ? favLines / lines.length : 0;
console.log(`\nWHAT THE CLIENT ROLLED — 3 full sets, ${lines.length} secondary lines\n`);
for (const slot of Object.keys(SLOT_SECONDARY)) {
  const mine = lines.filter((l) => l.slot === slot);
  const shown = mine.map((l) => (SLOT_SECONDARY[slot].includes(l.k) ? l.k.toUpperCase() : l.k)).join(" ");
  console.log(`  ${slot.padEnd(9)} ${SLOT_SECONDARY[slot].join("/").padEnd(13)} rolled: ${shown}`);
}

// Uniform rolling would put the favoured pair (2 of 8 stats) at ~25%. The table aims for ~65%.
// Anything under 40% across the whole sample means the client is not using the table at all.
const identityHolds = share >= 0.4;
console.log(`\n  favoured lines: ${favLines}/${lines.length} = ${(share * 100).toFixed(0)}%  (uniform would be ~25%, the table targets ~65%)`);

// crit and haste only became rollable in step 0. If the client bundle were stale or keeping its
// own pool, they would simply never appear.
const newStats = ["crit", "haste"].filter((k) => lines.some((l) => l.k === k));
console.log(`  step-0 stats present on drops: ${newStats.join(", ") || "NONE — the client is not using the new pool"}`);

const headSecs = SECONDARY_POOL.filter((k) => (sample.head?.stats?.[k] || 0) > 0);
const legSecs = SECONDARY_POOL.filter((k) => (sample.legs?.stats?.[k] || 0) > 0);
console.log(`\n  one epic set, as the player sees it:`);
console.log(`    ${sample.head?.name} — ${headSecs.join(", ")}`);
console.log(`    ${sample.legs?.name} — ${legSecs.join(", ")}`);
console.log(`  max hp with a full green set: ${hp}`);
console.log(`  errors: ${errs.length ? errs.join(" | ") : "none"}`);

const bad = !identityHolds || newStats.length < 2 || errs.length;
console.log(bad ? `\n❌ identity ${identityHolds ? "holds" : "MISSING"}, ${newStats.length}/2 step-0 stats seen, ${errs.length} page error(s)`
                : "\n✅ slot identity reaches real drops in the real client");
await b.close();
process.exit(bad ? 1 : 0);
