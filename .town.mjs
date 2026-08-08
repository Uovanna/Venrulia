import { chromium } from 'playwright';
import { createCharacter, normalizeChar } from '/home/user/Venrulia/game-core/combat.mjs';
const OUT='/tmp/claude-0/-home-user-Venrulia/e812e375-6180-540b-98b2-e3287750d231/scratchpad';
const c = normalizeChar(createCharacter('Scriptor','warrior','human'));
c.level=60; c.gold=84210; c.talentTutorialDone=true; c.spec='w_berserk';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const theme of ['day','night']) {
  const ctx = await b.newContext({ viewport:{width:420,height:1000}, deviceScaleFactor:2 });
  const page = await ctx.newPage(); const errs=[];
  page.on('pageerror', e=>errs.push(String(e.message)));
  await page.addInitScript(([s,t])=>{localStorage.setItem('wow_idlecraft_save',s);localStorage.setItem('roe_chronicle_theme',t);},[JSON.stringify([c]),theme]);
  await page.goto('http://localhost:4173/'); await page.waitForTimeout(1800);
  await page.locator('text=Scriptor').first().click({force:true}); await page.waitForTimeout(1600);
  await page.screenshot({path:`${OUT}/town-${theme}.png`, fullPage:true});
  console.log(theme, JSON.stringify(await page.evaluate(()=>{
    const svg=document.querySelector('svg[aria-label="Town map"]');
    const bg=svg && svg.querySelector('path[fill^="url"]');
    const hails=document.querySelectorAll('.hail').length;
    // does the map ground resolve, or fall back to black?
    const stop = svg && svg.querySelector('stop');
    return { hails, stopColor: stop && getComputedStyle(stop).stopColor,
             mapStroke: bg && getComputedStyle(bg).stroke,
             emoji: (document.body.innerText.match(/[\u{1F300}-\u{1FAFF}]/gu)||[]).join(''),
             pageScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })), 'errors', errs.slice(0,2));
  await ctx.close();
}
await b.close();
