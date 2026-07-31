import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext()).newPage();
await p.route("**://*.supabase.co/**", (r) => r.abort());
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
const tap = async (lbl, ms = 900) => { await p.evaluate((lbl) => {
  const t = (e) => ((e.innerText != null ? e.innerText : e.textContent) || "").replace(/\s+/g, " ").trim();
  const els = [...document.querySelectorAll("button,div,span,a,option,text,tspan,g")].filter((e) => t(e).includes(lbl))
    .sort((a, b) => t(a).length - t(b).length);
  if (!els[0]) return false; const r = els[0].getBoundingClientRect();
  for (const ty of ["pointerdown","mousedown","mouseup","click"]) els[0].dispatchEvent(new MouseEvent(ty,{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
  return true; }, lbl); await p.waitForTimeout(ms); };
const txt = async () => (await p.$eval("#root", (e) => e.innerText)).replace(/\s+/g, " ");
await p.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
await tap("Create New Character"); await tap("Warrior"); await tap("Human");
const nb = await p.$("input"); if (nb) await nb.fill("Hardy");
await tap("Enter Eldoria", 1600);
const code = async (c) => { await tap("⚙️", 600);
  const box = await p.$('input[placeholder="Enter code..."]'); if (box) await box.fill(c);
  await p.evaluate(() => { const x=[...document.querySelectorAll("button")].find((y)=>/Redeem/i.test(y.innerText)); if(x) x.click(); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const x=[...document.querySelectorAll("button")].find((y)=>/^Close$/i.test(y.innerText.trim())); if(x) x.click(); });
  await p.waitForTimeout(800); };
await code("anvu");
for (let k=0;k<12;k++){ const picked = await p.evaluate(() => {
  const t=(e)=>((e.innerText!=null?e.innerText:e.textContent)||"").replace(/\s+/g," ").trim();
  if(!/Choose (your|a) .*talent/i.test(document.body.innerText)) return false;
  const o=[...document.querySelectorAll("button,div")].filter((e)=>/\+\d+(\.\d+)?%/.test(t(e))&&t(e).length<60).sort((a,b)=>t(a).length-t(b).length);
  if(!o[0]) return false; const r=o[0].getBoundingClientRect();
  for(const ty of ["pointerdown","mousedown","mouseup","click"]) o[0].dispatchEvent(new MouseEvent(ty,{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
  return true; }); if(!picked) break; await p.waitForTimeout(700); await tap("Confirm",600); await tap("Continue",600); }
await code("anvugear");
for (let k=0;k<5;k++){ await tap("Adventure Gate", 1300); if (/Dungeon/i.test(await txt())) break; }
await tap("Dungeons", 1200); await tap("The Sunken Mine", 1600);
let sawBoss=false, cleared=false, gearOnTrash=0, bossGear=0;
for (let i=0;i<300;i++){
  const s = await txt();
  if (/Final boss|Bandit Lord Garrick/i.test(s)) sawBoss = true;
  if (/cleared!/i.test(s)) { cleared = true; break; }
  await p.waitForTimeout(700);
}
const ok = [];
ok.push(["a run reaches its boss", sawBoss]);
ok.push(["and completes on it", cleared]);
ok.push(["no page errors", errs.length === 0]);
let bad=0; console.log("");
for (const [l,v] of ok){ console.log(`  ${v?"✓":"✗"} ${l}`); if(!v) bad++; }
if (errs.length) console.log("  errors: " + errs.join(" | "));
console.log(bad?`\n❌ ${bad} failed`:"\n✅ a run walks its waves and finishes on its boss");
await b.close(); process.exit(bad?1:0);
