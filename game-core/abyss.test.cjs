/* The Abyss: an endless ladder, gear that remembers where it came from, and a reroll that honours it.
 *
 * Three things here are load-bearing and easy to break silently.
 *
 * 1. THE LADDER IS MEASURED. The brief's difficulty requirements are testable statements about who
 *    can park where, so the tuning harness measures them against the real offline engine. This file
 *    pins the SHAPE of the curve and the constants that came out of that; abyss-tuning.cjs is what
 *    re-measures them.
 *
 * 2. THE ITEM CARRIES ITS RANK. An Abyss +7 piece rerolled without its rank would come back with
 *    Hard-mode numbers — the player pays up to 250,000 gold to make their best item worse, and
 *    nothing tells them. secondaryFor is the single definition, used by the drop roller and the
 *    Forge alike.
 *
 * 3. PARKING IS ONE PLACE. offlineZoneId and offlineAbyss must never both be set, or which one a
 *    character actually farmed would depend on the order of two ifs.
 *
 *   node game-core/abyss.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-ab-'));
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
  const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
  let fail = 0;
  const ok = (c, m) => { console.log((c ? "  \\u2713 " : "  \\u2717 ") + m); if (!c) fail++; };
  const sec = (t) => console.log(String.fromCharCode(10) + t);
  const mk = (o) => core.normalizeChar({ ...core.createCharacter("Delver", "warrior", "human"), level: 60, ...o });
  // BOTH random sources have to be seeded for an offline run to repeat. generateItem draws from the
  // scoped rng, so building a character's gear outside withRng let it fall back to Math.random and
  // roll different equipment every run — which put a borderline character on either side of the
  // survival line. The drop rolls inside simulateOffline call Math.random directly, so that one is
  // swapped too. Without both, the parking sections flapped between three and eight failures on
  // identical code.
  const seeded = (seed, body) => {
    const prev = Math.random; Math.random = rngm.makeRng(seed);
    try { return rngm.withRng(rngm.makeRng(seed), body); } finally { Math.random = prev; }
  };

  // --- the ladder ------------------------------------------------------------------------------
  sec("Eleven ranks, each meaningfully harder than the last");
  {
    ok(ABYSS.maxPlus === 10, "the ladder ends at +10, the solo endpoint");
    ok(ABYSS.reqIlvl === 71 && ABYSS.dropIlvl === 71, "tuned for and dropping ilvl 71");
    ok(ABYSS.killsPerDrop === 150, "about one piece every 150 kills");
    ok(Math.abs(ABYSS.legendaryChance - 0.05) < 1e-9, "5% legendary, 95% epic");
    // Every rank must be a REAL registered tier. Deriving one on the side is what made the first
    // tuning sweep pure noise: enemyStatBlock resolves a tier by id, so an object built elsewhere
    // had its offence and level bonus silently dropped and only health scaled.
    for (let p = 0; p <= ABYSS.maxPlus; p++)
      if (!DIFFICULTY_TIERS["abyss" + p]) { ok(false, "rank +" + p + " is a registered difficulty tier"); break; }
    ok(!!DIFFICULTY_TIERS.abyss10, "every rank +0..+10 is a registered difficulty tier");
    // Monotonic, and by enough to matter.
    let mono = true;
    for (let p = 1; p <= ABYSS.maxPlus; p++) {
      const a = abyssTierFor(p - 1), b = abyssTierFor(p);
      if (!(b.hp > a.hp && b.off > a.off && b.lvlBonus > a.lvlBonus)) mono = false;
    }
    ok(mono, "health, damage and level all rise at every step \\u2014 no rank is a free one");
    const t0 = abyssTierFor(0), t10 = abyssTierFor(10);
    ok(t10.hp / t0.hp > 4 && t10.off / t0.off > 2,
       "+10 foes have " + (t10.hp / t0.hp).toFixed(1) + "x the health and " + (t10.off / t0.off).toFixed(1) + "x the damage of +0");
    ok(abyssTierFor(0).off > DIFFICULTY_TIERS.hard.off * 0.8,
       "even +0 is in Hard Mode's league \\u2014 it is tuned for the gear that fight drops");
    ok(abyssTierFor(99) === abyssTierFor(10) && abyssTierFor(-5) === abyssTierFor(0), "the ladder clamps at both ends");
  }

  // --- what a rank is worth ----------------------------------------------------------------------
  sec("Deeper pays better, or nobody would go deeper");
  {
    ok(ABYSS.goldPerPlus > 0 && ABYSS.xpPerPlus > 0, "gold and XP both scale with the rank");
    const gold = src.slice(src.indexOf('if (b.mode === "abyss") {'), src.indexOf('if (b.mode === "abyss") {') + 400);
    ok(gold.indexOf("1 + ABYSS.goldPerPlus * ap") > 0, "\\u2026and the live kill actually applies it");
    ok(gold.indexOf("1 + ABYSS.xpPerPlus * ap") > 0, "\\u2026for XP too");
    // The offline path deliberately does NOT match it any more. Parking used to pay per kill
    // exactly as playing does, and that is what made 12 hours in a hard zone worth 836,518 gold.
    // It now pays a flat hourly tranche, so the rank premium lives on the LIVE kill only and the
    // depth you parked at buys you a better tranche instead. Both statements are pinned: the
    // per-kill lines must be gone, and the tranche must still reward depth.
    const off = src.slice(src.indexOf("const simulateOffline ="), src.indexOf("const predictOfflineDeath ="));
    ok(off.indexOf("goldGained +=") < 0 && off.indexOf("xpGained +=") < 0,
       "parking accrues no per-kill gold or XP at all \\u2014 the wage is gone");
    ok(IDLE.goldPerHour.abyss > IDLE.goldPerHour.hard && IDLE.goldPerHour.hard > IDLE.goldPerHour.zone,
       "\\u2026and depth still pays: " + IDLE.goldPerHour.zone + " -> " + IDLE.goldPerHour.hard + " -> " + IDLE.goldPerHour.abyss + " gold an hour");
    ok(IDLE.xpPerHour.abyss > IDLE.xpPerHour.hard && IDLE.xpPerHour.hard > IDLE.xpPerHour.zone,
       "\\u2026for experience too (" + IDLE.xpPerHour.zone + " -> " + IDLE.xpPerHour.hard + " -> " + IDLE.xpPerHour.abyss + ")");
  }

  // --- gear remembers where it came from ----------------------------------------------------------
  sec("An Abyss piece carries its rank, forever");
  {
    ok(Math.abs(core.abyssMult(0) - 1) < 1e-9, "Abyss +0 gear rolls at the ordinary ilvl 71 rate");
    ok(Math.abs(core.abyssMult(5) - 1.45) < 1e-9, "+5 rolls 45% higher \\u2014 a 24 line becomes " + Math.round(24 * core.abyssMult(5)));
    ok(Math.abs(core.abyssMult(10) - 1.9) < 1e-9, "+10 rolls 90% higher");
    ok(core.abyssMult(99) === core.abyssMult(10), "and it clamps");

    const at = (p) => core.secondaryFor(71, 5, "sta", p);
    ok(at(5) > at(0) && at(10) > at(5), "a line is bigger at every rank (" + at(0) + " -> " + at(5) + " -> " + at(10) + ")");

    const it = rngm.withRng(rngm.makeRng(7), () => core.generateItem(71, core.rarityById("legendary"), "head", "warrior", 7));
    ok(it.abyss === 7, "a generated piece is STAMPED with its rank");
    ok(it.ilvl === 71 && it.rarity === "legendary", "\\u2026at ilvl 71 legendary");
    const plain = rngm.withRng(rngm.makeRng(7), () => core.generateItem(71, core.rarityById("legendary"), "head", "warrior"));
    ok(plain.abyss === undefined, "a piece from anywhere else carries no rank at all");
    // Same seed, same everything except the rank: the abyss piece must be strictly better.
    const secOf = (x) => SECONDARY_KEYS.reduce((a, k) => a + (x.stats[k] || 0), 0);
    ok(secOf(it) > secOf(plain),
       "\\u2026and the +7 piece really does roll higher (" + secOf(it) + " vs " + secOf(plain) + " across its secondaries)");
  }

  // --- THE REROLL. The expensive one to get wrong. -------------------------------------------------
  sec("A reroll honours the rank the piece was born with");
  {
    const lo = (p) => rerollRange(71, "legendary", "sta", p)[0];
    const hi = (p) => rerollRange(71, "legendary", "sta", p)[1];
    ok(hi(7) > hi(0), "an Abyss +7 piece rerolls into a higher range than a Hard one (" + hi(0) + " -> " + hi(7) + ")");
    ok(lo(7) > lo(0), "\\u2026at the bottom of the range too");
    // The bug this prevents: rerolling a +7 piece WITHOUT passing its rank hands back Hard values.
    // At 250,000 gold a reroll, that is paying to make your best item worse, silently.
    ok(hi(undefined) === hi(0), "dropping the rank falls back to the Hard range \\u2014 which is exactly the bug");
    ok(src.indexOf("rollRerollValue(item.ilvl, item.rarity, newStat, item.abyss)") > 0,
       "so the Forge passes item.abyss when it rerolls");
    ok(src.indexOf("rerollRange(sel.ilvl, sel.rarity, s, sel.abyss)") > 0,
       "\\u2026and the range it SHOWS the player uses it too, so the preview cannot lie");
    // One definition, in the core, shared by the drop roller and the Forge.
    const coreSrc = require("fs").readFileSync("${path.join(__dirname, 'combat.mjs').replace(/\\\\/g, '/')}", "utf8");
    ok(coreSrc.indexOf("const secondaryFor = (ilvl, rarityIdx, stat, abyss) =>") > 0,
       "secondaryFor is defined once in the core, beside the nominal it scales");
    ok(coreSrc.indexOf("chosen.forEach((k) => { stats[k] += secondaryFor(ilvl, rarityIdx, k, abyss); });") > 0,
       "\\u2026and generateItem rolls through it rather than a second copy");
    ok(src.indexOf("return secondaryFor(ilvl || 1, RARITIES.findIndex((r) => r.id === rarityId), stat, abyss);") > 0,
       "\\u2026and so does the client's secNominal, so the two cannot drift");
  }

  // --- progression -----------------------------------------------------------------------------------
  sec("Kills bank per rank, and a rank opens the next");
  {
    const c = mk({});
    ok(abyssPlus(c) === 0 && abyssUnlocked(c) === 0, "a new character starts at the top of the Abyss");
    ok(!abyssOpen(c), "\\u2026and cannot enter at all until Hard Mode is finished");
    const cleared = mk({ hardBossKills: { "Ignaroth the Flamelord": 1 } });
    ok(abyssOpen(cleared), "felling the Molten Heart's boss opens it");

    // Kills are held PER RANK, so farming an easy rank cannot advance a harder one.
    const part = mk({ abyss: { plus: 0, unlocked: 2, kills: { 0: ABYSS.killGoal, 1: 5 } } });
    ok(abyssRankDone(part, 0) === true, "a rank at its kill goal is complete");
    ok(abyssRankDone(part, 1) === false, "\\u2026and the next one is not, on 5 kills");
    ok(abyssKills(part, 2) === 0, "a rank never entered has no progress");
    ok(abyssUnlocked(part) === 2 && abyssPlus(part) === 0,
       "the unlocked depth and the SELECTED depth are different things");
    // Junk and out-of-range values must normalise rather than throw.
    ok(core.normalizeChar({ ...core.createCharacter("D","warrior","human"), abyss: "nope" }).abyss.plus === 0,
       "junk in the save normalises to a valid record");
    ok(core.normalizeChar({ ...core.createCharacter("D","warrior","human"), abyss: { plus: 99, unlocked: 99 } }).abyss.plus === 10,
       "\\u2026and an out-of-range rank clamps to +10");
  }

  // --- parking -----------------------------------------------------------------------------------------
  sec("A character is parked in exactly one place");
  {
    // THREE places, and offlineSpot resolves which exactly once. Every gate asks it rather than
    // re-deriving the answer, so no two gates can disagree about whether a character is parked.
    ok(src.indexOf("const offlineSpot = (char) => {") > 0, "one function decides where a parked character is");
    for (const [call, what] of [["if (!offlineSpot(char)) return null;", "the death prediction"],
                                ["if (!offlineSpot(c) || elapsed < 60000)", "applyOffline"],
                                ["if (c && offlineSpot(c)) {", "the leave-the-page notifier"]])
      ok(src.indexOf(call) > 0, what + " asks offlineSpot rather than checking fields itself");
    // Mutually exclusive, all three ways. Leaving two set would make which one was farmed depend
    // on the order of the ifs inside offlineSpot.
    ok(src.indexOf("offlineZoneId: enabling ? zoneId : null, offlineHardId: null, offlineAbyss: null") > 0,
       "parking in a zone clears the hard zone AND the Abyss");
    ok(src.indexOf("offlineAbyss: enabling ? p : null, offlineZoneId: null, offlineHardId: null") > 0,
       "parking in the Abyss clears both the others");
    ok(src.indexOf("offlineHardId: enabling ? hzId : null, offlineZoneId: null, offlineAbyss: null") > 0,
       "\\u2026and parking in a hard zone clears both of those");
    ok(src.indexOf("const p = Math.max(0, Math.min(OFFLINE_ABYSS_MAX, Math.min(abyssUnlocked(c), plus)));") > 0,
       "you cannot park at a depth you have never reached, nor past the offline cap");
    ok(src.indexOf("if (died) { c.offlineZoneId = null; c.offlineHardId = null; c.offlineAbyss = null; }") > 0,
       "dying unparks from ALL THREE, so a corpse does not keep farming what killed it");
    ok(core.normalizeChar({ ...core.createCharacter("D","warrior","human"), offlineAbyss: 4 }).offlineAbyss === 4,
       "where you parked survives a reload");
  }

  // --- offline actually fights the Abyss -----------------------------------------------------------------
  sec("Parked in the Abyss means fighting the Abyss");
  {
    ok(src.indexOf('zoneEnemyProfile(zone, enemyLevel, abyssTierId(aPlus), 8)') > 0,
       "the offline profile is built from the rank's REAL tier, by id");
    ok(src.indexOf("const zoneEnemyProfile = (zone, level, tier = \\"normal\\", hpMult = 1) => {") > 0,
       "\\u2026which the profile builder had to learn to accept \\u2014 it modelled normal zones only");
    ok(src.indexOf("abyssDrops.push(generateItem(ABYSS.dropIlvl, rar, pickLootSlot(), c.cls, aPlus));") > 0,
       "parked drops are stamped with the rank too");
    ok(src.indexOf("const dep = depositItems(c, abyssDrops);") > 0,
       "\\u2026and are KEPT through depositItems rather than auto-sold like zone loot");
    ok(src.indexOf("c.gold = (c.gold || 0) + dep.gold;") > 0,
       "\\u2026with overflow proceeds ADDED to the purse, not replacing it");
    // Harder ranks must actually kill slower. Anything else means the tier is not reaching the sim.
    // ONLY THE BOTTOM OF THE ABYSS IS PARKABLE. Deeper ranks are meant to be played, so parking at
    // +10 must fight +0 — and that makes the old check here (compare kills at +0 against +10)
    // measure nothing at all, since both would be the same fight. It is replaced by the rule.
    ok(OFFLINE_ABYSS_MAX === 0, "the offline cap is Abyss +0");
    const spotAt = (p) => offlineSpot({ offlineAbyss: p });
    ok(spotAt(0).kind === "abyss" && spotAt(0).plus === 0, "parking at +0 fights +0");
    ok(spotAt(7).plus === 0 && spotAt(10).plus === 0,
       "\\u2026and a save claiming +7 or +10 is clamped to +0 rather than honoured");
    ok(src.indexOf("if (plus > OFFLINE_ABYSS_MAX) { showNotif(") > 0,
       "\u2026and the button says so instead of silently parking somewhere else");
    // The fight still has to be a real Abyss fight, not a normal zone wearing its name.
    const kills = (p, seeds) => {
      let total = 0;
      for (let s = 0; s < seeds; s++) {
        const r = seeded(400 + s * 977, () => {
          let c = core.normalizeChar(core.createCharacter("P", "warrior", "human"));
          c.level = 60; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); c = core.normalizeChar(c);
          for (const sl of core.GEAR_SLOTS.map((g) => g.id)) if (sl !== "relic")
            c.equipment[sl] = core.generateItem(71, core.rarityById("legendary"), sl, "warrior", 9);
          c = core.armGambits(c); c.hp = core.maxHpFor(c);
          if (p == null) c.offlineZoneId = "plaguelands"; else c.offlineAbyss = p;
          return simulateOffline(c, 60 * 60 * 1000);
        });
        total += r ? r.kills : 0;
      }
      return Math.round(total / seeds);
    };
    const kZone = kills(null, 4), kAbyss = kills(0, 4);
    ok(kAbyss > 0, "a strong build clears Abyss +0 offline (" + kAbyss + " kills an hour)");
    ok(kAbyss < kZone,
       "\u2026but slower than the normal zone it borrows its creatures from (" + kZone + "), because the tier is real");
  }

  // --- enchanting ------------------------------------------------------------------------------------------
  sec("An Abyss rank makes an enchant stronger");
  {
    // +1 per rank, added on top of whatever the enchanter's own skill reaches. A level-100
    // enchanter puts +24 Agility on ordinary gear and +28 on an Abyss +4 piece.
    const at100 = (ab) => enchantAmount("agi", 100, ab);
    ok(at100(undefined) === enchantCap("agi"),
       "a level-100 enchanter reaches the cap on ordinary gear (+" + at100(undefined) + ")");
    ok(at100(4) === at100(undefined) + 4,
       "\\u2026and +4 more on an Abyss +4 piece (+" + at100(4) + ")");
    ok(at100(0) === at100(undefined), "Abyss +0 adds nothing \\u2014 rank 0 is zero ranks");
    ok(at100(10) === at100(undefined) + 10, "+10 adds ten (+" + at100(10) + ")");
    ok(at100(99) === at100(undefined) + 10, "\\u2026and it clamps at the ladder's end");
    // The bonus deliberately sits OUTSIDE the cap. Clamping it back under would make the whole
    // feature invisible at max enchanting rank, which is the only rank that matters here.
    ok(at100(5) > enchantCap("agi"), "the rank bonus exceeds the skill cap, which is the point");
    // A lower-rank enchanter still benefits, so the feature is not endgame-only.
    ok(enchantAmount("agi", 50, 6) === enchantAmount("agi", 50, undefined) + 6,
       "a rank-50 enchanter gets the same +6 on an Abyss +6 piece");
    ok(src.indexOf("const amount = enchantAmount(stat, prof.level, it.abyss);") > 0,
       "the enchant actually passes the item's rank\\u2026");
    ok(src.indexOf("prof.level, (char.equipment[enchantSlot] || {}).abyss)") > 0,
       "\\u2026and the shop PREVIEWS the real number for the piece in that slot, not a generic one");
  }

  // --- hard-mode parking ---------------------------------------------------------------------------------
  sec("Hard zones can be farmed while away; hard dungeons and the raid cannot");
  {
    const hz = HARD_ZONES[0];
    const sp = offlineSpot({ offlineHardId: hz.id });
    ok(sp && sp.kind === "hard" && sp.hz.id === hz.id, "parking in a hard zone resolves to that zone");
    // Lockout content is deliberately absent. A dungeon run cannot be spent by someone who is not
    // there to spend it, and the raid is on a 24h cooldown for the same reason.
    ok(offlineSpot({ offlineHardId: "hd_deadmines" }) === null, "a hard DUNGEON is not a parking spot");
    ok(offlineSpot({ offlineHardId: "hr_moltencore" }) === null, "\\u2026nor is the hard raid");
    ok(offlineSpot({}) === null, "and a character parked nowhere is parked nowhere");

    const run = (id) => seeded(31, () => {
      let c = core.normalizeChar(core.createCharacter("H", "warrior", "human"));
      c.level = 60; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); c = core.normalizeChar(c);
      for (const sl of core.GEAR_SLOTS.map((g) => g.id)) if (sl !== "relic")
        c.equipment[sl] = core.generateItem(71, core.rarityById("legendary"), sl, "warrior");
      c = core.armGambits(c); c.hp = core.maxHpFor(c); c.offlineHardId = id;
      return simulateOffline(c, 4 * 60 * 60 * 1000);
    });
    const r = run(hz.id);
    ok(!!r && r.kills > 0, "a geared character parked in a hard zone actually fights (" + (r ? r.kills : 0) + " kills)");
    ok(r.hardZoneId === hz.id, "\\u2026and the report says which zone");
    ok((r.char.hardKills || {})[hz.id] > 0, "kills bank against that zone's goal");
    ok(r.gearKept > 0 || (r.char.inventory || []).length > 0,
       "\\u2026and its gear is KEPT, not auto-sold like normal-zone loot");
    // The kill goal must complete offline, or a player who farmed one overnight comes back to an
    // un-ticked zone and a chain that has not advanced.
    ok(src.indexOf("if (k >= hz.killGoal && !(c.hardZoneDone || {})[hz.id])") > 0,
       "the zone's kill goal completes offline too");
    ok(src.indexOf('zoneEnemyProfile(zone, enemyLevel, "hard", 8)') > 0,
       "hard-zone foes are modelled at the HARD tier, matching makeHardEnemy");
    // The Hard Mode gold doubling is a LIVE-kill rule; parking no longer pays per kill at all, so
    // what a hard zone is worth while away is its tranche — still well ahead of a normal zone,
    // which is the part that has to survive.
    ok(IDLE.goldPerHour.hard > IDLE.goldPerHour.zone * 2,
       "\\u2026and parking it is worth more than double a normal zone (" + IDLE.goldPerHour.hard + " against " + IDLE.goldPerHour.zone + " an hour)");
    ok(core.normalizeChar({ ...core.createCharacter("H","warrior","human"), offlineHardId: "hz_green" }).offlineHardId === "hz_green",
       "where you parked survives a reload");
  }

  // --- nothing throws away an Abyss item --------------------------------------------------------------------
  sec("Abyss gear is never disposed of automatically");
  {
    // The number that makes this matter: overflowSellPrice is derived from an item's GENERATION
    // value and knows nothing about where it came from. An Abyss +10 EPIC generates at ~1,412 and
    // would have auto-sold for 211 gold while being worth about 700,000 on the auction house.
    const ep = core.generateItem(71, core.rarityById("epic"), "head", "warrior", 10);
    ok(ep.rarity === "epic" && ep.abyss === 10, "an Abyss +10 EPIC exists and is not a legendary");
    ok(overflowGoesToMail(ep) === true,
       "a full bank HOLDS it in the mail rather than vendoring it for " + overflowSellPrice(ep) + " gold");
    ok(overflowGoesToMail(core.generateItem(71, core.rarityById("epic"), "head", "warrior", 0)) === true,
       "\\u2026including rank 0, which still floors at 100,000 gold");
    ok(overflowGoesToMail(core.generateItem(63, core.rarityById("epic"), "head", "warrior")) === false,
       "\\u2026while an ordinary epic is still sold, as it always was");
    ok(overflowGoesToMail(core.generateItem(71, core.rarityById("legendary"), "head", "warrior")) === true,
       "\\u2026and legendaries are still held, unchanged");
    // The other two doors out.
    ok(src.indexOf("if (it.abyss != null) { toBag.push(it); if (!firstShown) firstShown = it; return; }") > 0,
       "auto-sell-downgrades banks an Abyss piece instead of vendoring it");
    ok(src.indexOf("!it.locked && it.abyss == null && RARITIES.findIndex") > 0,
       "\\u2026and bulk salvage skips it entirely");
    ok(overflowSellPrice(ep) < 1000 && ahBaseValue(ep) > 500000,
       "the gap is real: " + overflowSellPrice(ep) + " gold against " + Math.round(ahBaseValue(ep)).toLocaleString());
  }

  // --- offline and live must pay the same ---------------------------------------------------------------------
  sec("Parking a hard zone pays what playing it pays");
  {
    // Souls are the Hard Mode crafting reagent and drop per kill in a hard zone. Omitting them
    // offline made parking strictly worse in a way nothing told the player.
    ok(src.indexOf("if (hzSoul && Math.random() < SOUL_ZONE_CHANCE)") > 0,
       "the offline hard branch rolls souls at the live per-kill rate");
    ok(src.indexOf("const hzSoul = hz ? soulForZone(hz.id) : null;") > 0,
       "\\u2026for the soul that zone actually drops");
    const r = seeded(77, () => {
      let c = core.normalizeChar(core.createCharacter("S", "warrior", "human"));
      c.level = 60; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); c = core.normalizeChar(c);
      for (const sl of core.GEAR_SLOTS.map((g) => g.id)) if (sl !== "relic")
        c.equipment[sl] = core.generateItem(71, core.rarityById("legendary"), sl, "warrior");
      c = core.armGambits(c); c.hp = core.maxHpFor(c); c.offlineHardId = HARD_ZONES[0].id;
      return simulateOffline(c, 12 * 60 * 60 * 1000);
    });
    ok(r && r.kills > 500, "a long parked stint racks up kills (" + (r ? r.kills : 0) + ")");
    ok(r.soulsFound > 0, "\\u2026and finds souls (" + r.soulsFound + "), which it previously never did");
    ok(Object.values(r.char.souls || {}).reduce((a, b) => a + b, 0) === r.soulsFound,
       "\\u2026and they actually land on the character");
  }

  // --- one definition, two files ----------------------------------------------------------------------------
  sec("The Abyss constants are not written twice");
  {
    // The recurring bug in this project is a constant living in two places and drifting. The stat
    // scale and the ladder length exist in the core (where generateItem needs them) and are read by
    // the client rather than restated, so this pins that they agree.
    const coreSrc = require("fs").readFileSync("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}", "utf8");
    const coreMax = /const ABYSS_MAX_PLUS = (\\d+);/.exec(coreSrc);
    const coreStat = /const ABYSS_STAT_PER_PLUS = ([\\d.]+);/.exec(coreSrc);
    ok(coreMax && Number(coreMax[1]) === ABYSS.maxPlus,
       "ABYSS_MAX_PLUS in the core matches ABYSS.maxPlus in the client (" + ABYSS.maxPlus + ")");
    ok(coreStat && Number(coreStat[1]) === ABYSS.statPerPlus,
       "ABYSS_STAT_PER_PLUS matches ABYSS.statPerPlus (" + ABYSS.statPerPlus + ")");
    ok(Math.abs(core.abyssMult(6) - (1 + ABYSS.statPerPlus * 6)) < 1e-9,
       "\\u2026and the core's multiplier really is built from that number");
  }

  // --- idle income -----------------------------------------------------------------------------------------
  sec("Camping pays a tranche, not a wage");
  {
    // The measured problem: 12 hours parked in a hard zone paid 836,518 gold, which is 3.3x what an
    // average player is meant to HOLD, twice a day, forever. About half of it was not combat gold
    // at all \u2014 a parked character dropped ~1,689 items, filled its bank, and the rest was
    // auto-sold into the purse.
    // The seed has to cover the GEAR, not just the run. generateItem draws from the scoped rng, so
    // building the equipment outside withRng let it fall back to Math.random and roll differently
    // every time — which put a borderline character on either side of the survival line run to run
    // and made this whole section flap.
    const park = (where, hours, gear) => {
      const g = gear || { ilvl: 71, rarity: "legendary" };
      return seeded(4242, () => {
        let c = core.normalizeChar(core.createCharacter("W", "warrior", "human"));
        c.level = 60; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); c = core.normalizeChar(c);
        for (const sl of core.GEAR_SLOTS.map((x) => x.id)) if (sl !== "relic")
          c.equipment[sl] = core.generateItem(g.ilvl, core.rarityById(g.rarity), sl, "warrior");
        c = core.armGambits(c); c.hp = core.maxHpFor(c); c.gold = 0; c.inventory = [];
        Object.assign(c, where);
        return simulateOffline(c, hours * 3600 * 1000);
      });
    };
    const hard12 = park({ offlineHardId: "hz_blight" }, 12);
    ok(hard12.goldGained === IDLE.goldPerHour.hard * 12,
       "12 hours in a hard zone pays exactly " + (IDLE.goldPerHour.hard * 12).toLocaleString() + " gold");
    ok(hard12.goldGained < 250000 * 0.1,
       "\\u2026which is under a tenth of the 250,000 an average player should hold");
    ok(836518 / hard12.goldGained > 50,
       "\\u2026a " + Math.round(836518 / hard12.goldGained) + "x cut from the measured 836,518");

    // FLAT, not per kill. A stronger character kills faster; under the old rule that made camping
    // MORE lucrative the better your gear, which is exactly backwards for an idle reward.
    //
    // Both of these SURVIVE the six hours — that is the point of the comparison. The pay is
    // read off the wall clock, so the only way to earn less is to stop being parked, and the only
    // thing that stops you is dying (pinned just below). If this ever compared a survivor against
    // a corpse it would pass or fail on the death, not on the gear.
    const modest = park({ offlineZoneId: "plaguelands" }, 6, { ilvl: 65, rarity: "epic" });
    const strong = park({ offlineZoneId: "plaguelands" }, 6);
    ok(!modest.died && !strong.died, "both the modest and the geared character survive the six hours");
    ok(modest.goldGained === strong.goldGained,
       "\\u2026and earn the SAME " + strong.goldGained.toLocaleString() + " gold, ilvl 65 epics or ilvl 71 legendaries");
    ok(modest.xpGained === strong.xpGained,
       "\\u2026and the same " + strong.xpGained.toLocaleString() + " experience");
    ok(strong.kills > modest.kills * 2,
       "\\u2026while the geared one still kills far more (" + strong.kills + " against " + modest.kills + ")");

    // Dying is the one thing that cuts the tranche short: a character who falls at hour three is
    // paid for three hours, not six, and the spot is switched off so the rest pays nothing.
    let naked = core.normalizeChar(core.createCharacter("Naked", "warrior", "human"));
    naked.level = 60; naked.unlockedSkills = core.SKILLS.warrior.map((x) => x.name);
    naked = core.normalizeChar(naked); naked = core.armGambits(naked);
    naked.hp = core.maxHpFor(naked); naked.gold = 0; naked.offlineZoneId = "plaguelands";
    const nakedRun = seeded(4242, () => simulateOffline(naked, 6 * 3600 * 1000));
    ok(nakedRun.died, "a naked character parked in the Plaguelands dies");
    ok(nakedRun.goldGained < strong.goldGained / 100,
       "\\u2026and is paid only for the " + nakedRun.secondsSimulated + "s it lasted (" + nakedRun.goldGained + " gold, not " + strong.goldGained.toLocaleString() + ")");
    ok(nakedRun.char.offlineZoneId === null, "\\u2026and stops being parked, so the rest of the night pays nothing");

    // Partial hours pay pro rata, so a 90-minute absence beats a 61-minute one.
    const halfHour = park({ offlineHardId: "hz_blight" }, 0.5);
    ok(Math.abs(halfHour.goldGained - IDLE.goldPerHour.hard / 2) <= 1,
       "half an hour pays half a tranche (" + halfHour.goldGained + ")");

    // Every hard zone pays the same. They borrow a NORMAL zone for flavour, and the old per-kill
    // path measured the over-level penalty against THAT zone's cap \u2014 so five of the six paid
    // ~0.03% of their gold and the whole reward curve was inverted.
    const green = park({ offlineHardId: "hz_green" }, 12);
    ok(green.goldGained === hard12.goldGained,
       "Greenhollow pays what the Blighted Marches pays (" + green.goldGained.toLocaleString() + ")");
  }

  sec("Five drops an hour, and not one more");
  {
    const park = (where, hours, seed) => seeded(seed || 31, () => {
      let c = core.normalizeChar(core.createCharacter("D", "warrior", "human"));
      c.level = 60; c.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); c = core.normalizeChar(c);
      for (const sl of core.GEAR_SLOTS.map((x) => x.id)) if (sl !== "relic")
        c.equipment[sl] = core.generateItem(71, core.rarityById("legendary"), sl, "warrior");
      c = core.armGambits(c); c.hp = core.maxHpFor(c); c.gold = 0; c.inventory = []; c.bankSlots = 5000;
      Object.assign(c, where);
      return simulateOffline(c, hours * 3600 * 1000);
    });
    ok(IDLE.dropsPerHour === 5, "five an hour");
    for (const [label, where] of [["hard zone", { offlineHardId: "hz_blight" }],
                                  ["normal zone", { offlineZoneId: "plaguelands" }],
                                  ["Abyss +0", { offlineAbyss: 0 }]]) {
      const r = park(where, 12, 31);
      ok(r.gearKept <= 12 * IDLE.dropsPerHour + IDLE.dropsPerHour,
         "12 hours in a " + label + " keeps " + r.gearKept + " items, never more than the allowance");
    }
    // The cap LIMITS; it does not grant. Asserting the Abyss simply lands "under" the allowance is
    // no test at all — at one piece per 150 kills and ~600 kills an hour its natural rate is about
    // four an hour against an allowance of five, close enough that the check passed or failed on
    // the seed. What is actually worth pinning is that the kept count still tracks the UNCAPPED
    // rate: kills/150, not the allowance.
    const ab = park({ offlineAbyss: 0 }, 12, 31);
    const abExpected = ab.kills / ABYSS.killsPerDrop;
    ok(ab.gearKept <= 12 * IDLE.dropsPerHour + IDLE.dropsPerHour,
       "12 hours in the Abyss keeps " + ab.gearKept + ", inside the allowance");
    ok(Math.abs(ab.gearKept - abExpected) < abExpected * 0.5,
       "\\u2026and that is its OWN 1-in-150 rate (" + ab.gearKept + " against " + abExpected.toFixed(1) + " expected from " + ab.kills + " kills), not the cap topping it up");
    // 1,689 was the old figure for the same stint.
    const hard = park({ offlineHardId: "hz_blight" }, 12, 31);
    ok(hard.gearKept < 100, "a hard zone keeps " + hard.gearKept + " rather than the ~1,689 it did");
    ok(1689 / Math.max(1, hard.gearKept) > 20,
       "\\u2026a " + Math.round(1689 / Math.max(1, hard.gearKept)) + "x cut in items to sort through");

    // THE CAP IS CHECKED BEFORE THE ROLL, not by trimming afterwards. Trimming would keep the
    // FIRST sixty of 1,689 rolls, quietly weighting a night's loot toward its first minutes.
    ok(src.indexOf("const roomForDrop = () =>") > 0 && src.indexOf("roomForDrop() && Math.random()") > 0,
       "the budget is consulted before rolling, so the kept items are spread across the whole stint");
    // Rates and tiers are untouched, which is what was asked for.
    ok(src.indexOf("Math.random() < 0.10 * 1.6 * (1 + _tb.drop)") > 0,
       "the hard-zone drop RATE is the live one, unchanged");
    ok(src.indexOf("Math.random() < 1 / ABYSS.killsPerDrop") > 0, "\\u2026and so is the Abyss's");
    ok(src.indexOf("rarityById(Math.random() < ABYSS.legendaryChance") > 0, "\\u2026and the rarity split");

    // Normal-zone offline loot used to be auto-SOLD, which was a second gold faucet on top of the
    // kill gold. It is kept now, under the same cap.
    ok(src.indexOf("offline loot auto-sold") < 0, "normal-zone drops are no longer auto-sold into gold");
    const zone = park({ offlineZoneId: "plaguelands" }, 12, 31);
    ok(zone.gearKept > 0 && (zone.char.inventory || []).length > 0,
       "\\u2026they land in the bank instead (" + zone.gearKept + " items)");
  }

  sec("Kills still count for everything they counted for");
  {
    // The whole point of rationing gold rather than kills: progression must keep moving.
    let c = seeded(88, () => {
      let k = core.normalizeChar(core.createCharacter("K", "warrior", "human"));
      k.level = 60; k.unlockedSkills = core.SKILLS.warrior.map((x) => x.name); k = core.normalizeChar(k);
      for (const sl of core.GEAR_SLOTS.map((x) => x.id)) if (sl !== "relic")
        k.equipment[sl] = core.generateItem(71, core.rarityById("legendary"), sl, "warrior");
      return core.armGambits(k);
    });
    c.hp = core.maxHpFor(c); c.offlineHardId = "hz_blight";
    const before = c.kills;
    const r = seeded(88, () => simulateOffline(c, 12 * 3600 * 1000));
    ok(r.kills > 5000, "twelve parked hours still produce " + r.kills.toLocaleString() + " kills");
    ok(r.char.kills === before + r.kills, "\\u2026which land on the character, so the battle pass advances");
    ok((r.char.hardKills || {}).hz_blight === r.kills, "\\u2026and bank against the hard zone's goal");
    const ab = { ...c, offlineHardId: null, offlineAbyss: 0 };
    const r2 = seeded(88, () => simulateOffline(ab, 12 * 3600 * 1000));
    ok((r2.char.abyss.kills || {})[0] === r2.kills, "\\u2026and Abyss ranks still bank their kills");
  }

  // --- reachability --------------------------------------------------------------------------------------
  sec("A player can find it");
  {
    ok(src.indexOf('abyssOpen(char) ? [["abyss", "🕳️ Abyss"]] : []') > 0,
       "the Adventure Gate grows an Abyss tab once Hard Mode is done \\u2014 and not before");
    ok(src.indexOf('{difficulty === "abyss" && (() => {') > 0, "\\u2026and the screen renders");
    ok(src.indexOf("onClick={() => startAbyss(p)}") > 0, "every unlocked rank can be entered");
    ok(src.indexOf("onClick={() => toggleOfflineAbyss(p)}") > 0, "\\u2026and parked in");
    ok(src.indexOf("{item.abyss != null && <div") > 0, "the item tooltip prints the rank under the name");
    ok(src.indexOf("secondaries roll {Math.round((abyssMult(item.abyss) - 1) * 100)}% higher") > 0,
       "\\u2026and says what the rank is actually worth");
  }

  console.log(fail ? String.fromCharCode(10) + "\\u274c " + fail + " Abyss check(s) failed"
                   : String.fromCharCode(10) + "\\u2705 the Abyss: a ladder that really gets harder, gear that remembers its rank, and one place to park");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'ab.cjs'); fs.writeFileSync(runf, js);
require(runf);
