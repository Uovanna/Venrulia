// End-to-end check of the gambit behaviours that live in App.jsx and cannot be unit-tested:
// the "Do NOT use this skill" veto, slot-order priority, and legacy save migration. The Vite
// build does not catch client-only mistakes (this run is what caught App.jsx keeping its OWN
// normalizeChar, which meant the migration never ran and every existing player's gambits would
// have gone silent), so drive the real UI rather than trusting the unit tests alone.
//
//   npm run build && npx vite preview --port 4173 &
//   node game-core/gambit-ui.check.mjs              # slot 1 vetoed  -> Power Strike never fires
//   CONTROL=1 node game-core/gambit-ui.check.mjs    # slot 1 casting -> Power Strike dominates
//   MIGRATE=1 node game-core/gambit-ui.check.mjs    # name-keyed save -> slot-keyed on load
//
// Needs playwright + the bundled Chromium; it is not a package.json dependency on purpose,
// since Netlify would then install it on every deploy.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext()).newPage();
// Block the Supabase cloud save. It is authoritative on launch unless roe_cloud_ts is newer, so
// a hand-written localStorage save gets silently overwritten on reload — which made the
// migration check unreadable.
await p.route("**://*.supabase.co/**", (r) => r.abort());
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
const clickText = async (lbl, exact = false) => p.evaluate(([lbl, exact]) => {
  const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
  // The town map is SVG — text/g/tspan must be in the selector or building taps do nothing.
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
await tap("Create New Character"); await tap("Warrior"); await tap("Human");
const nameBox = await p.$("input"); if (nameBox) await nameBox.fill("Veto");
await tap("Enter Eldoria", 1500);
await code("anvu");     // level 60 — all five slots + gambits unlocked
await code("gambit");   // own every gambit so both parts are pickable

// `anvu` jumps to 60, which stacks up every talent-tier prompt (10/20/30/40/50) as a blocking
// modal. Clear them by taking whatever the first option is — the choice is irrelevant here.
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
  console.log("  talent prompt cleared:", picked);
  await p.waitForTimeout(800);
  await tap("Confirm", 700); await tap("Continue", 700);
}

const navTo = async (label, expect) => {
  for (let k = 0; k < 6; k++) {
    await tap(label, 1100);
    if (expect.test(await txt())) return true;
    await p.waitForTimeout(500);
  }
  return false;
};
console.log("→ Armory:", await navTo("Armory", /Gambits/));
console.log("→ Gambits tab:", await navTo("Gambits", /THEN|Pick a skill/));
const bar = await p.evaluate(() => {
  const s = document.querySelector("select"); return s ? [...s.options].map((o) => o.text) : [];
});
console.log("skill dropdown:", JSON.stringify(bar));
if (!bar.length) { console.log("SCREEN:", (await txt()).slice(0, 900)); await b.close(); process.exit(1); }

const pickSkill = async (i) => { await p.evaluate((i) => { const s = document.querySelector("select");
  s.selectedIndex = i; s.dispatchEvent(new Event("change", { bubbles: true })); }, i); await p.waitForTimeout(700); };
const setRule = async (ifLbl, thenLbl) => {
  const a = await tap(ifLbl, 550); const c = await tap(thenLbl, 550);
  return a && c;
};

// Slot 1: unconditional veto.  Slot 2: unconditional cast.
await pickSkill(0);
// CONTROL=1 swaps slot 1's veto for a normal cast. Slot 1 should then win priority and Power
// Strike should dominate the log — which is what proves the veto (not some other gate) is
// what silences it in the default run.
const slot1Then = process.env.CONTROL ? "Use Power Strike" : "Do NOT use this skill";
const r1 = await setRule("In combat (always)", slot1Then);
console.log("slot 1 THEN =", slot1Then);
await pickSkill(1);
const r2 = await setRule("In combat (always)", "Use Lacerate");
console.log("rule 1 (slot1 = veto) set:", r1, "| rule 2 (slot2 = cast) set:", r2);
console.log("stored rules:", await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("wow_idlecraft_save")); let g = null;
  const w = (o) => { if (!o || typeof o !== "object" || g) return;
    if (o.gambits && Array.isArray(o.selectedSkills)) { g = o.gambits.rules; return; }
    for (const k of Object.keys(o)) w(o[k]); }; w(s); return JSON.stringify(g);
}));

// MIGRATION: rewrite the stored rules back to the OLD skill-name keys, reload, and confirm the
// client's normalizeChar converts them to slot keys. Without this every existing player's
// gambits would go silent, since the evaluator only reads rules[1..5].
if (process.env.MIGRATE) {
  const before = await p.evaluate(() => {
    const KEY = "wow_idlecraft_save"; const save = JSON.parse(localStorage.getItem(KEY));
    let done = null;
    const w = (o) => { if (!o || typeof o !== "object" || done) return;
      if (o.gambits && Array.isArray(o.selectedSkills)) {
        const bar = o.selectedSkills, old = {};
        for (const k of Object.keys(o.gambits.rules || {})) old[bar[Number(k) - 1]] = o.gambits.rules[k];
        o.gambits.rules = old; done = JSON.stringify(old); return; }
      for (const k of Object.keys(o)) w(o[k]); };
    w(save); localStorage.setItem(KEY, JSON.stringify(save));
    localStorage.setItem("roe_cloud_ts", String(Date.now() + 600000));
    return done;
  });
  console.log("legacy (name-keyed) rules written:", before);
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(1800);
  await tap("Veto", 1500);
  const after = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("wow_idlecraft_save")); let g = null;
    const w = (o) => { if (!o || typeof o !== "object" || g) return;
      if (o.gambits && Array.isArray(o.selectedSkills)) { g = o.gambits.rules; return; }
      for (const k of Object.keys(o)) w(o[k]); }; w(s); return JSON.stringify(g);
  });
  console.log("after load                     :", after);
  console.log("migrated to slot keys:", /"1":/.test(after) && !/"Power Strike":/.test(after) ? "✓" : "✗");
  await b.close(); process.exit(0);
}

console.log("→ Town:", await navTo("🏰 Town", /Adventure Gate/));
console.log("→ Gate:", await navTo("Adventure Gate", /Travel & Hunt/));
console.log("→ Zone:", await navTo("⚔️ Travel & Hunt", /Enter Combat/));
console.log("→ Combat:", await navTo("⚔️ Enter Combat", /COMBAT LOG/));

// Read ONLY the combat log — the ability bar prints every skill name, so whole-screen text
// tallies nothing.
const logTxt = async () => { const t = await txt(); const i = t.indexOf("COMBAT LOG"); return i < 0 ? "" : t.slice(i, i + 4000); };
const seen = {}; const names = ["Power Strike", "Lacerate", "Spinning Slash", "Devastating Blow", "Concussive Blow"];
for (let k = 0; k < 45; k++) {
  const t = await logTxt();
  for (const n of names) if (t.includes(n)) seen[n] = (seen[n] || 0) + 1;
  await p.waitForTimeout(400);
}
console.log("\ncombat-log sample:", (await logTxt()).slice(0, 340));
console.log("\nlog mentions (~18s):", JSON.stringify(seen));
console.log("slot 1 Power Strike, VETOED  →", !seen["Power Strike"] ? "never used ✓" : `used (${seen["Power Strike"]}) ✗`);
console.log("slot 2 Lacerate,     ALLOWED →", seen["Lacerate"] ? `used (${seen["Lacerate"]}) ✓` : "never used ✗");
console.log("errors:", errs.length ? errs.slice(0, 3) : "none");
await p.screenshot({ path: "/tmp/claude-0/-home-user-Venrulia/e812e375-6180-540b-98b2-e3287750d231/scratchpad/veto.png", fullPage: true });
await b.close();
