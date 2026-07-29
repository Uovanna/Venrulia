// Enemy archetypes, verified where they actually happen.
//
// makeEnemy is defined INSIDE the React component, so no transpile harness can reach it — the unit
// test can prove the archetype TABLE is right and prove nothing about whether makeEnemy applies it.
// This fights real creatures in the real client and reads the outcome out of the combat log.
//
//   npm run build && npx vite preview --port 4173 &
//   node game-core/enemy-ui.check.mjs
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
const navTo = async (label, expect) => {
  for (let k = 0; k < 6; k++) { await tap(label, 1100); if (expect.test(await txt())) return true; await p.waitForTimeout(500); }
  return false;
};
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
const nameBox = await p.$("input"); if (nameBox) await nameBox.fill("Bait");
await tap("Enter Eldoria", 1500);
await code("anvu");            // level 60 so the fight is against level-appropriate creatures
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

// Whichever zone the character starts in is fine. What this check needs is several creatures of
// the SAME rank and level fighting back, so their dispositions are the only thing left that can
// differ — not a particular zone. Deliberately naked: gear would kill trash before it swung.
console.log("→ Town:", await navTo("Town", /Gate|Bank|Armory/));
console.log("→ Gate:", await navTo("Gate", /Zones|Travel/));
// Each zone card has its OWN "Travel & Hunt" button, and tapping by text picks the shortest match
// — always the first card. That silently kept the character in the starter zone, where enemies are
// level 10 and the 20-point spawn jitter is bigger than the archetype difference itself. Find the
// button INSIDE the target zone's card instead.
const ZONE = "The Blighted Marches";
const travelTo = async (zone) => p.evaluate((zone) => {
  const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
  // The card is the smallest element that mentions the zone AND offers travel.
  const cards = [...document.querySelectorAll("div")]
    .filter((e) => t(e).includes(zone) && /Travel & Hunt/.test(t(e)))
    .sort((a, b) => t(a).length - t(b).length);
  if (!cards[0]) return "no card";
  const btn = [...cards[0].querySelectorAll("button,div,span")]
    .filter((e) => /Travel & Hunt/.test(t(e))).sort((a, b) => t(a).length - t(b).length)[0];
  if (!btn) return "no button";
  const r = btn.getBoundingClientRect();
  for (const ty of ["pointerdown", "mousedown", "mouseup", "click"]) btn.dispatchEvent(new MouseEvent(ty, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return "clicked";
}, zone);
let travelled = "";
for (let k = 0; k < 5; k++) {
  travelled = await travelTo(ZONE);
  await p.waitForTimeout(1800);
  if (/COMBAT LOG|Auto-attack|hits for/.test(await txt())) break;
}
console.log("→ " + ZONE + ":", travelled);
console.log("→ in combat:", /COMBAT LOG|Auto-attack|hits for/.test(await txt()));

// Damage is the wrong thing to read here. A level-60 player's armor floors low-level enemy hits
// into a 5-11 band, and a x2.23 difference in raw damage disappears into that rounding — an early
// version of this check reported every creature hitting for 10 and looked like a flat failure.
// Enemy MAX HEALTH carries the archetype with nothing in between: makeEnemy multiplies it straight
// into baseHp. The header reads "<Name> Level <n> · <Zone> <icon> ❤️ <cur>/<max>".
// The screen is one run-on string, so the name has to be anchored tightly or it swallows whatever
// UI text precedes it — a looser pattern produced creatures called "Healing Potion I Bandit".
// Each word must be Capitalised-then-lowercase, which excludes stray tokens like "I" and "CHAMPION".
const ENEMY_RE = /([A-Z][a-z']+(?: [A-Z][a-z']+)?) Level (\d+) · [^❤]{0,40}❤️ \d+\/(\d+)/g;
const RANKED = /(CHAMPION|BOSS|LORD)$/i;
const byName = {};
for (let k = 0; k < 60; k++) {
  const chunk = await txt();
  for (const m of chunk.matchAll(ENEMY_RE)) {
    // A ranked enemy has its marker immediately before the name; rank multiplies health on its own
    // (champion x1.6, boss x2.2), so mixing ranks in would look like an archetype difference.
    const name = m[1].trim();
    const before = chunk.slice(Math.max(0, m.index - 14), m.index).trim();
    if (RANKED.test(before) || /(Champion|Lord|Boss)/i.test(name)) continue;
    (byName[name] = byName[name] || []).push({ hp: Number(m[3]), lvl: Number(m[2]) });
  }
  await p.waitForTimeout(900);
}

// Compare against what the health WOULD have been without archetypes: (level * 26 + 50) at normal
// rank, plus up to 20 points of spawn jitter. That is a firmer test than hoping one zone happens to
// contain creatures from opposite ends of the table — a single zone has only a handful of names and
// they can easily hash to the same archetype.
const rows = Object.entries(byName)
  .map(([name, hs]) => {
    const uniq = [...new Set(hs.map((h) => h.hp))].sort((a, b) => a - b);
    const lvl = hs[0].lvl;
    const hp = uniq[Math.floor(uniq.length / 2)];   // median: jitter is additive, 0..20
    return { name, n: uniq.length, hp, lvl, base: lvl * 26 + 50, ratio: (hp - 10) / (lvl * 26 + 50) };
  })
  .sort((a, b) => b.hp - a.hp);

console.log(`\nENEMY MAX HEALTH, NORMAL RANK ONLY (${rows.length} distinct creatures)\n`);
console.log("  creature              level      hp   un-archetyped   implied multiplier");
for (const r of rows) {
  console.log(`  ${r.name.padEnd(22)}${String(r.lvl).padStart(5)}${String(r.hp).padStart(8)}`
    + `${String(r.base).padStart(16)}${("x" + r.ratio.toFixed(2)).padStart(21)}`);
}

// The table's multipliers, as shipped.
const TABLE = [0.80, 0.85, 0.88, 0.90, 1.00];
const near = (r) => TABLE.some((t) => Math.abs(r - t) < 0.05);
const ok = [];
ok.push(["real creatures were observed", rows.length >= 1]);
ok.push(["they are level-appropriate, not starter-zone trash", rows.every((r) => r.lvl >= 30)]);
// If makeEnemy ignored the archetype, every ratio would sit at 1.00 with only jitter around it.
ok.push([`health is multiplied by the archetype, not left at the flat baseline (${rows.map((r) => "x" + r.ratio.toFixed(2)).join(", ")})`,
         rows.some((r) => r.ratio < 0.95)]);
ok.push(["every creature's health matches a multiplier that is actually in the table", rows.every((r) => near(r.ratio))]);
ok.push(["no page errors", errs.length === 0]);

console.log("");
let bad = 0;
for (const [label, pass] of ok) { console.log(`  ${pass ? "✓" : "✗"} ${label}`); if (!pass) bad++; }
if (errs.length) console.log("  errors: " + errs.join(" | "));
console.log(bad ? `\n❌ ${bad} enemy check(s) failed` : "\n✅ enemy archetypes reach real fights: makeEnemy gives each disposition its own health pool");
await b.close();
process.exit(bad ? 1 : 0);
