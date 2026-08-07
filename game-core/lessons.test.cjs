/* Every system gets a lesson, every lesson is reachable, and no existing save is marched through
 * the tutorial a second time.
 *
 * A 704-playthrough sweep of 1-60 (game-core/levelling-sim.cjs) found the levelling game teaches
 * nothing Hard Mode then demands: zero deaths in 176 playthroughs, levelling in STARTER GEAR costs
 * 0.9 hours and never kills you, and skipping the rotation is only 2.6x slower. The one genuinely
 * mandatory purchase — the auto-potion upgrade — was unmarked, and without it a parked character
 * walls at level 39 with 0 of 176 runs reaching 60.
 *
 * The tutorial is now one level-gated lesson per system across the whole of 1-60. The checks that
 * matter are that no lesson can become unreachable, that the three things the sweep proved matter
 * are actually taught, and that a save from the old six-step shape survives the change.
 *
 *   node game-core/lessons.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-lesson-'));
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
  const lvlOf = (l) => (typeof l.level === "function" ? l.level() : l.level);
  const byId = (id) => LESSONS.find((l) => l.id === id);

  // --- the table is well formed -----------------------------------------------------------------
  {
    ok(LESSONS.length >= 25, "there are " + LESSONS.length + " lessons, one per system");
    ok(new Set(LESSONS.map((l) => l.id)).size === LESSONS.length, "no duplicate lesson ids");
    ok(LESSONS.every((l) => l.title && l.body && typeof l.done === "function"),
       "every lesson has a title, a body and a completion test");
    const lv = LESSONS.map(lvlOf);
    ok(lv.every((v) => v >= 1 && v <= 60), "every lesson unlocks inside 1-60");
    ok(lv.every((v, i) => i === 0 || v >= lv[i - 1]),
       "the table is in level order, so activeLesson always returns the earliest unfinished one");
    // A lesson pointing at a town spot that does not exist would flash nothing at all.
    const spots = new Set(TOWN_SPOTS.map((s) => s.dest));
    for (const l of LESSONS)
      ok(!l.highlight || spots.has(l.highlight), l.id + " highlights a real building (" + l.highlight + ")");
  }

  // --- the gates are the systems' OWN gates, not restated numbers --------------------------------
  // Restating a constant is how this codebase keeps breaking, so the two that have one are pinned.
  {
    ok(lvlOf(byId("auction")) === AH_ECON.unlockLevel,
       "the auction lesson opens exactly when the auction house does (" + AH_ECON.unlockLevel + ")");
    ok(lvlOf(byId("gambit")) === GAMBIT_UNLOCK_LEVEL,
       "the gambit lesson opens exactly when gambits do (" + GAMBIT_UNLOCK_LEVEL + ")");
    ok(lvlOf(byId("spec")) === SPEC_LEVEL, "the spec lesson opens when specs unlock (" + SPEC_LEVEL + ")");
  }

  // --- the three things the 704-run sweep proved matter are all taught ----------------------------
  {
    const pot = byId("autopot");
    ok(!!pot, "there is a lesson for the auto-potion upgrade — the purchase that decides whether a parked character reaches 60 at all");
    ok(pot.done({ upgrades: { autoPotion: true } }) === true && !pot.done({ upgrades: {} }),
       "…and it completes on OWNING it, not on reading about it");
    // There is deliberately NO auto-skill lesson: that system was removed, its handlers were left
    // orphaned, and the lesson that waited on it walled the tutorial at level 9. Automation is
    // gambits, and gambits have their own lesson at their own unlock.
    ok(!byId("autoskill"), "the auto-skill lesson is gone — it taught a system that no longer exists");
    ok(!!byId("gambit"), "…and automation is taught by the gambit lesson instead");
    const drink = byId("potion");
    ok(!!drink && drink.done({ tutorial: { drankPotion: true } }) && !drink.done({ tutorial: {} }),
       "a lesson forces actually drinking a potion");
    ok(lvlOf(drink) < lvlOf(pot), "…and it comes before the upgrade that automates it");
    ok(!!byId("dungeon") && byId("dungeon").done({ dungeonClears: 1 }) && !byId("dungeon").done({ dungeonClears: 0 }),
       "a lesson forces clearing a dungeon, which is where gear that matters comes from");
  }

  // --- every lesson is completable, and none completes by accident ---------------------------------
  {
    const fresh = core.normalizeChar(core.createCharacter("T", "warrior", "human"));
    for (const l of LESSONS) {
      // A lesson whose condition is already true on a brand-new character teaches nothing.
      const pre = !!l.done(fresh);
      ok(l.id === "fight" ? true : !pre, l.id + " is not already satisfied by a new character");
    }
    ok(activeLesson(fresh).id === LESSONS[0].id, "a new character starts on the first lesson");
    // Levelling past several gates at once must not skip them.
    const jumped = { ...fresh, level: 60 };
    ok(activeLesson(jumped).id === LESSONS[0].id,
       "a level-60 character with nothing done still starts at the beginning rather than skipping ahead");
  }

  // --- panel-visit lessons key off the shared c.seen map -------------------------------------------
  // The old tutorial needed a bespoke flag per step, which is why it only ever covered six systems.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    ok(/const setTab = useCallback\\(/.test(src) && /seen: \\{ \\.\\.\\.\\(c\\.seen \\|\\| \\{\\}\\), \\[t\\]: true \\}/.test(src),
       "opening any panel records it on c.seen, in one place");
    const seenLessons = LESSONS.filter((l) => /c\\.seen/.test(String(l.done)));
    ok(seenLessons.length >= 10, seenLessons.length + " lessons are satisfied by visiting their panel");
    for (const l of seenLessons) {
      // Whatever key it reads must be a tab the app can actually reach, or the lesson never clears.
      const keys = (String(l.done).match(/seen\\?\\.([a-z]+)/g) || []).map((m) => m.split(".")[1]);
      // Reachable means: some code path opens it. A panel may be a top-level tab, a Bank sub-tab,
      // or a building on the town map that enterBuilding forwards straight to setTab.
      const townDests = new Set(TOWN_SPOTS.map((sp) => sp.dest));
      const reachable = (k) => new RegExp('setTab\\\\("' + k + '"\\\\)').test(src)
        || new RegExp('setBagTab\\\\("' + k + '"\\\\)').test(src)
        || new RegExp('bagTab === "' + k + '"').test(src)
        || townDests.has(k);
      ok(keys.length > 0 && keys.every(reachable),
         l.id + " waits on a panel the game can open (" + keys.join(", ") + ")");
    }
    ok(core.normalizeChar({ ...core.createCharacter("T","warrior","human"), seen: "nonsense" }).seen instanceof Object,
       "junk in the save does not throw");
  }

  // --- auto-retreat ---------------------------------------------------------------------------------
  // Being handed a lesson mid-fight must not cost a death, and must never abandon content that
  // cannot be resumed.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\\\/g, '/')}", "utf8");
    const i = src.indexOf("const lastLessonRef");
    const body = src.slice(i, src.indexOf("}, [char, groupParty]);", i));
    ok(i > 0 && /stopCombat\\(\\)/.test(body), "a new lesson retreats the player from combat");
    ok(/COMBAT_TUTORIAL_IDS\\.includes\\(id\\)/.test(body),
       "…except when the lesson IS the fight, which would yank them out of their own objective");
    ok(/groupParty \\|\\| guildRunRef\\.current/.test(body) && /b\\.mode === "dungeon"/.test(body),
       "…and never out of a dungeon, raid, hard run or group run, which cannot be resumed");
    ok(/prev === undefined \\|\\| prev === id/.test(body), "…and not repeatedly for the same lesson");
    // undefined means "not looked yet"; null means "no lesson open". Treating them as one skipped
    // the commonest arrival of all: a caught-up player levelling into the next lesson.
    ok(/useRef\\(undefined\\)/.test(src.slice(src.indexOf("const lastLessonRef"), src.indexOf("const lastLessonRef") + 400)),
       "…and a player with NO lesson open still gets retreated when one arrives");
    ok(COMBAT_TUTORIAL_IDS.every((id) => !!byId(id)), "every combat-lesson id names a real lesson");
    ok(COMBAT_TUTORIAL_IDS.includes("dungeon"), "…including the dungeon lesson");
  }

  // --- an existing save is not made to repeat the tutorial ------------------------------------------
  {
    ok(JSON.stringify(core.TUTORIAL_STEP_IDS) === JSON.stringify(LESSONS.slice(0, 6).map((l) => l.id)),
       "the migration list matches the first six lessons exactly — a rename on one side only would re-run the tutorial for every player");

    const veteran = core.normalizeChar({ ...core.createCharacter("V", "mage", "human"), level: 40, kills: 9000,
      tutorial: { step: 6, done: true, visitedVendor: true, equipped: true, visitedBoard: true } });
    for (const id of core.TUTORIAL_STEP_IDS) ok(veteran.tutorial.doneIds[id] === true, "a finished player keeps '" + id + "'");
    const next = activeLesson(veteran);
    ok(next && !core.TUTORIAL_STEP_IDS.includes(next.id),
       "…and is handed a NEW lesson (" + (next && next.id) + "), not marched through the opening again");

    const partway = core.normalizeChar({ ...core.createCharacter("P", "rogue", "human"), level: 3, kills: 2,
      tutorial: { step: 3, done: false } });
    ok(Object.keys(partway.tutorial.doneIds).length === 3, "a player part-way through keeps the three steps they did");
    ok(activeLesson(partway).id === LESSONS[3].id, "…and resumes at the fourth");

    // A save with no tutorial block at all: an old character predating the field.
    const legacy = core.normalizeChar({ ...core.createCharacter("L", "hunter", "human"), level: 25, kills: 400, tutorial: undefined });
    ok(Object.keys(legacy.tutorial.doneIds).length === 6, "a save with no tutorial block is credited the opening six");
    const brandNew = core.normalizeChar(core.createCharacter("N", "warrior", "human"));
    ok(Object.keys(brandNew.tutorial.doneIds).length === 0, "…while a genuinely new character is credited nothing");
    ok(core.normalizeChar({ ...core.createCharacter("J","warrior","human"), tutorial: "nonsense" }).tutorial.doneIds,
       "junk in the tutorial field does not throw");
    // The old "done" flag meant "finished the six". If it survived, later lessons stay hidden.
    ok(veteran.tutorial.done === false, "the old 'done' flag is cleared, or the new lessons would never appear");
  }

  // --- the Guild and Arena lessons are RUN, not merely visited --------------------------------------
  // These two used to clear by opening the screen, so a player's first group boss was a real one
  // with three other people's time on the line, and their first bout went on their record.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\/g, '/')}", "utf8");
    const guild = byId("guild"), arena = byId("arena");
    ok(guild.done({ tutorial: { delveCleared: true } }) && !guild.done({ seen: { guild: true } }),
       "the Guild lesson needs the Training Delve CLEARED — opening the screen is not enough");
    ok(arena.done({ tutorial: { duelDone: true } }) && !arena.done({ seen: { arena: true } }),
       "the Arena lesson needs a Practice Duel FOUGHT — opening the screen is not enough");

    // Read exactly one function by matching its braces. Slicing a fixed number of characters ran
    // straight past startTutorialDuel into the online co-op block that follows it, so the test
    // "found" connectEncounter in the duel and failed on code that was not the duel's.
    const fnBody = (name) => {
      const i = src.indexOf("const " + name + " = ");
      if (i < 0) return "";
      let d = 0, started = false;
      for (let k = src.indexOf("{", i); k < src.length; k++) {
        if (src[k] === "{") { d++; started = true; }
        else if (src[k] === "}") { d--; if (started && d === 0) return src.slice(i, k + 1); }
      }
      return "";
    };
    // Comments mention the very calls being ruled out ("NOT mpProvider.findOpponent"), so a raw
    // text search finds the prose and reports a violation that is not in the code.
    const stripped = (t) => t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ").replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1");
    const delve = stripped(fnBody("startTutorialDelve")), duel = stripped(fnBody("startTutorialDuel"));
    ok(delve.length > 100, "startTutorialDelve was found and read (" + delve.length + " chars)");
    ok(duel.length > 100, "startTutorialDuel was found and read (" + duel.length + " chars)");

    // THE PROPERTY THAT MATTERS. connectEncounter is the only call that reaches the matchmaking
    // server. Neither tutorial may go near it: a practice run must never occupy a real room.
    ok(!/connectEncounter/.test(delve), "the Training Delve never contacts the matchmaking server");
    ok(!/connectEncounter/.test(duel), "the Practice Duel never contacts the matchmaking server");
    ok(/buildTrinityPartyOfSize/.test(delve), "…the delve fills its party with local bots");
    ok(!/findOpponent/.test(duel), "…and the duel never draws a REAL player's loadout from findOpponent");
    ok(/practice: true/.test(duel), "…and marks the bout practice");

    // A practice result must not touch the ladder, and a practice boss must not pay out.
    ok(src.includes("if (bSnap.practice)"), "a practice WIN is not recorded on the ladder");
    ok(src.includes("if (!b.practice) recordRated(false)"), "…and neither is a practice loss");
    ok(fnBody("onGroupCleared").includes("run.tutorialDelve"),
       "clearing the delve marks the lesson and stops — no loot roll, no GDKP auction, no lockout");
    // THE FAUCET. GroupCombat pays a flat purse on every offline clear. The delve has no lockout,
    // so paying it would make a practice boss unlimited gold — 1,400g a clear against an endgame
    // income of 13,180 an hour. Measured in a browser before this guard existed.
    ok(src.includes("if (!networked && !practice)"),
       "the Training Delve pays no clear purse — it has no lockout, so a payout would be a faucet");
    ok(src.includes("practice={!!groupRun?.tutorialDelve}"), "…and the delve is what marks the run practice");
    // Losing the practice bout must still count, or a player who cannot beat the bot is walled out.
    const lossPath = src.slice(src.indexOf("if (b.pvp) {"), src.indexOf("if (b.pvp) {") + 1100);
    ok(lossPath.includes("duelDone: true"),
       "losing the practice duel still teaches it — the lesson is the fight, not the result");
    // And a lesson arriving mid-bout must not yank the player out of one.
    ok(src.includes('b.pvp || b.mode === "dungeon"'), "auto-retreat never abandons an arena bout");
  }

  // --- COMPLETABILITY: every lesson condition must have something that can SET it ------------------
  //
  // This is the check that was missing. upgrades.autoPotion was READ in three places — the live
  // combat tick, simulateOffline and the autopot lesson — and WRITTEN in none, so no player could
  // ever own it and that lesson could never be finished. Worse, the 704-run sweep had already
  // measured that upgrade as the difference between reaching 60 and walling at level 39.
  //
  // Reading each lesson predicate and proving a writer exists is the general form of that bug.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\/g, '/')}", "utf8");
    // Everything OUTSIDE the lesson table. A lesson mentioning its own key proves nothing.
    const li = src.indexOf("const LESSONS = ["), le = src.indexOf("\\n];", li);
    const outside = src.slice(0, li) + src.slice(le);
    const townDests = new Set(TOWN_SPOTS.map((sp) => sp.dest));
    // Literal search rather than a built regex: escaping one through this harness is what produced
    // three broken patterns before this settled.
    const seenWriter = (k) => outside.indexOf('setTab("' + k + '")') > 0
      || outside.indexOf('setBagTab("' + k + '")') > 0
      || outside.indexOf('bagTab === "' + k + '"') > 0
      || townDests.has(k);
    const fieldWriter = (k) => new RegExp("\\\\b" + k + ":\\\\s*true").test(outside)
      || new RegExp("\\\\[" + k + "\\\\]:\\\\s*true").test(outside)
      || new RegExp("\\\\." + k + "\\\\s*=[^=]").test(outside)
      || new RegExp("\\\\b" + k + ":\\\\s*[A-Za-z0-9_.({\\\\[]").test(outside);

    // An upgrade is bought through a table, so the write is a DYNAMIC key — [up.id]: true — which
    // no literal search for "autoPotion: true" can see. It counts as a writer only when the id is
    // actually in the purchasable table AND that dynamic write exists AND the row is rendered;
    // a definition nobody can click is exactly the bug this section was added for.
    const upgradeWriter = (k) => (typeof VENDOR_UPGRADES !== "undefined")
      && VENDOR_UPGRADES.some((u) => u.id === k)
      && outside.indexOf("[up.id]: true") > 0
      && src.indexOf("VENDOR_UPGRADES.map") > 0;

    let unreachable = 0;
    for (const l of LESSONS) {
      const body = String(l.done);
      const keys = [];
      for (const m of body.matchAll(/c\\.seen(\\?)?\\.([A-Za-z0-9_]+)/g)) keys.push(["seen", m[2]]);
      for (const m of body.matchAll(/c\\.tutorial(\\?)?\\.([A-Za-z0-9_]+)/g)) keys.push(["tutorial", m[2]]);
      for (const m of body.matchAll(/c\\.upgrades(\\?)?\\.([A-Za-z0-9_]+)/g)) keys.push(["upgrades", m[2]]);
      for (const m of body.matchAll(/c\\.([A-Za-z0-9_]+)/g)) {
        const k = m[1];
        if (k === "seen" || k === "tutorial" || k === "upgrades" || k === "level") continue;
        keys.push(["char", k]);
      }
      if (!keys.length) { ok(false, l.id + " reads no character state at all — it can never complete"); unreachable++; continue; }
      // ANY one satisfiable path is enough: several lessons accept a legacy flag OR a panel visit.
      const reach = keys.map((kv) => (kv[0] === "seen" ? seenWriter(kv[1])
        : kv[0] === "upgrades" ? upgradeWriter(kv[1]) : fieldWriter(kv[1])));
      const good = reach.some(Boolean);
      if (!good) unreachable++;
      ok(good, l.id + " completable via " + keys.map((kv, i) =>
        (kv[0] === "char" ? "" : kv[0] + ".") + kv[1] + (reach[i] ? "" : " <NO WRITER>")).join(" / "));
    }
    ok(unreachable === 0, unreachable === 0
      ? "all " + LESSONS.length + " lessons are completable"
      : unreachable + " lesson(s) CANNOT be completed by any code path");

    // AFFORDABILITY. A lesson that asks for something the player cannot buy at its own level is
    // still uncompletable, just slowly. The first price written here was 2,500g against a measured
    // median purse of 610g at level 7 — the lesson would have stalled for most of the levelling
    // game. Measured from the shipped offline loop rather than pinned to a remembered number.
    {
      const beltLvl = lvlOf(byId("autopot"));
      const purses = [];
      for (let sd = 0; sd < 6; sd++) {
        const gold = rngm.withRng(rngm.makeRng(sd * 131 + 7), () => {
          let ch = core.normalizeChar(core.createCharacter("A", "warrior", "human"));
          let guard = 0;
          while (ch.level < beltLvl && guard++ < 600) {
            ch = core.armGambits(ch);   // a bar a player can actually build: gambits, not the dead auto-skill flag
            ch.consumables = { [conKey("heal", core.tierForLevel(ch.level))]: 500 };
            ch.offlineZoneId = getZoneForLevel(ch.level).id;
            ch.hp = core.maxHpFor(ch);
            const r = simulateOffline(ch, 6 * 60 * 1000);
            if (!r) break;
            ch = r.char;
          }
          return ch.gold;
        });
        purses.push(gold);
      }
      purses.sort((a, b) => a - b);
      const poor = purses[0];
      const cost = VENDOR_UPGRADES.find((u) => u.id === "autoPotion").cost;
      ok(cost <= poor, "the Draught Belt (" + cost.toLocaleString() + "g) is affordable at level "
        + beltLvl + " — the poorest of " + purses.length + " runs holds " + poor.toLocaleString() + "g");
    }

    // The Draught Belt specifically: purchasable, with gold, and actually rendered.
    const belt = VENDOR_UPGRADES.find((u) => u.id === "autoPotion");
    ok(!!belt, "the Draught Belt exists as a vendor upgrade");
    ok(!!belt && belt.cost > 0, "…and costs gold (" + (belt ? belt.cost.toLocaleString() : "?") + "g)");
    ok(!PREMIUM_ITEMS.some((it) => it.id === "autoPotion"),
       "…and is NOT a Ven purchase — the one upgrade a character cannot progress without must not sit behind the premium currency");
    ok(outside.indexOf("[up.id]: true") > 0, "…and buying it writes the flag the lesson and the combat tick both read");
    ok(src.indexOf("VENDOR_UPGRADES.map") > 0, "…and it is rendered in the vendor, not merely defined");
  }

  // --- the Draught Belt and the potion gambit must not fight over one stock --------------------------
  // Both drink from c.consumables. They used to keep SEPARATE clocks — the belt on POTION_CD, the
  // gambit on its own 8s key — so one dip below 30% fired both and spent two potions where one
  // would do. A potion restores 53-58% of the bar, so the second lands on a character already back
  // near 87% and throws most of itself away.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\/g, '/')}", "utf8");
    const fire = src.slice(src.indexOf("const fireConsumable"), src.indexOf("const fireConsumable") + 1600);
    // The belt is a BACKSTOP, so its trigger must sit under every threshold a gambit can be set to.
    // At 30% it fired on the same dip the player's own potion gambit was watching for, which left
    // the gambit nothing to do at 30 or 20 and made the two compete for one stock.
    {
      const gambitHps = GAMBIT_IFS.filter((x) => /selfhp/.test(x.id))
        .map((x) => Number(String(x.id).replace(/[^0-9]/g, "")) / 100).filter((n) => n > 0);
      ok(gambitHps.length >= 3, "there are " + gambitHps.length + " health thresholds a gambit can use ("
        + gambitHps.map((h) => (h * 100) + "%").join(", ") + ")");
      ok(AUTO_POTION_HP < Math.min(...gambitHps),
        "the belt fires at " + (AUTO_POTION_HP * 100) + "%, BELOW the lowest gambit threshold ("
        + (Math.min(...gambitHps) * 100) + "%) — a backstop, not a competitor");
      // Three hardcoded copies of this number is how it started: twice in simulateOffline, once in
      // the live tick. A parked character healing on a different rule from a live one is drift.
      const refs = src.split("AUTO_POTION_HP").length - 1;
      ok(refs >= 5, "every auto-potion site reads the one constant (" + refs + " references)");
      ok(src.indexOf("maxHp0 * 0.3") < 0 && src.indexOf("maxHpFor(c) * 0.3") < 0,
        "…and no site still carries its own hardcoded 30%");
    }

    // Literal search: escaping a regex through this harness silently dropped a backslash level and
    // turned "Date\\.now\\(\\)" into a pattern with an empty capture group that matched the wrong text.
    ok(fire.indexOf("Date.now() - lastPotionRef.current < POTION_CD") > 0,
       "the potion gambit honours the same cooldown the belt and the manual button use");
    ok(fire.indexOf("lastPotionRef.current = Date.now()") > 0,
       "…and taking a drink through a gambit starts that shared clock");
    // Auto Gambit used to roll across 50/30/20, so one bar in three duplicated the belt exactly.
    ok(src.indexOf('const potIf = "if_selfhp50"') > 0,
       "Auto Gambit writes its potion rule at 50%, ABOVE the belt's 30% — it catches the dip earlier rather than duplicating it");
  }

  // --- NAVIGATION: the building a lesson points at must actually lead to the panel it wants -------
  //
  // The check this replaces proved a WRITER EXISTED IN SOURCE. It did not ask whether that writer
  // was reachable, nor whether the instruction text named the right building. Both failed in ways
  // players hit: "Muscle Memory" sent them to a trainer in the Armory that does not exist (the
  // handler was orphaned code nothing called), and eight more lessons named a building that does
  // not contain the panel they describe — Salvage and Enchanting are Crafting Hall professions, not
  // Market benches; Talents are in the Class Hall, not the Hero's Statue; City Management hangs off
  // the Tavern; the Supply Master is in the Market; Mail is a bottom-bar button with no building.
  //
  // So walk the REAL navigation graph: from the lesson's own highlight, following setTab calls, can
  // the player reach the panel its done() waits on?
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\/g, '/')}", "utf8");
    const lines = src.split("\\n");
    // Where each {tab === "x" && block begins; a block runs to the next one.
    const starts = [];
    lines.forEach((l, n) => { const m = l.match(/\\{tab === "([a-z]+)" &&/); if (m) starts.push([n, m[1]]); });
    const edges = {};   // tab -> tabs it can open
    starts.forEach(([n, name], i) => {
      const end = i + 1 < starts.length ? starts[i + 1][0] : lines.length;
      const body = lines.slice(n, end).join("\\n");
      const out = new Set();
      for (const m of body.matchAll(/setTab\\("([a-z]+)"\\)/g)) out.add(m[1]);
      for (const m of body.matchAll(/setBagTab\\("([a-z]+)"\\)/g)) out.add(m[1]);
      edges[name] = [...new Set([...(edges[name] || []), ...out])];
    });
    // The Bank renders its sub-tabs from a table rather than literal setBagTab calls.
    const bagIds = [...src.matchAll(/\\["([a-z]+)", "[^"]*(?:Equipment|Items|Gems|Crafting|Quest)[^"]*"\\]/g)].map((m) => m[1]);
    edges.bag = [...new Set([...(edges.bag || []), ...bagIds])];
    // The town map opens any building directly, and the bottom bar always offers these.
    const ALWAYS = new Set([...TOWN_SPOTS.map((s) => s.dest), "town", "mail", "premium", "combat"]);

    // enterBuilding forwards some town-map destinations to a differently-named tab — the Tavern spot
    // is dest "quests" but opens tab "tavern". Read those aliases out of the function rather than
    // assuming, or the walk starts from a node that does not exist and reports a false failure.
    const eb = src.slice(src.indexOf("const enterBuilding"), src.indexOf("const enterBuilding") + 700);
    const alias = {};
    for (const line of eb.split(String.fromCharCode(10))) {
      const a = line.indexOf('dest === "'), b = line.indexOf('setTab("');
      if (a < 0 || b < 0 || b < a) continue;
      alias[line.slice(a + 10, line.indexOf('"', a + 10))] = line.slice(b + 8, line.indexOf('"', b + 8));
    }

    const reaches = (fromRaw, want) => {
      const from = alias[fromRaw] || fromRaw;
      if (ALWAYS.has(want)) return true;
      const seen = new Set(), stack = [from];
      while (stack.length) {
        const cur = stack.pop();
        if (cur === want) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const nx of (edges[cur] || [])) stack.push(nx);
      }
      return false;
    };

    let bad = 0;
    for (const l of LESSONS) {
      const body = String(l.done);
      const wants = [...new Set([...body.matchAll(/c\\.seen(\\?)?\\.([A-Za-z0-9_]+)/g)].map((m) => m[2]))];
      if (!wants.length) continue;              // action lessons are covered by the writer check
      const from = l.highlight || "town";
      // A lesson may accept any ONE of several panels (e.g. gambits OR gambitshop).
      const ok1 = wants.some((w) => reaches(from, w));
      if (!ok1) bad++;
      ok(ok1, l.id + ": " + from + " leads to " + wants.join(" or "));
    }
    ok(bad === 0, bad === 0 ? "every lesson's building actually leads to the panel it describes"
                            : bad + " lesson(s) point at a building that cannot reach their panel");
  }

  // --- DEAD CODE: a lesson may not depend on a handler nothing calls -------------------------------
  // buyAutoSkill was defined and never called from anywhere, so autoSkillsOwned could not be set and
  // the lesson that waited on it walled the tutorial at level 9 for every player.
  {
    const src = require("fs").readFileSync("${SRC.replace(/\\/g, '/')}", "utf8");
    const code = src.split("\\n").filter((l) => !l.trim().startsWith("//")).join("\\n");
    const handlers = [...code.matchAll(/^  const ([a-zA-Z0-9_]+) = \\(/gm)].map((m) => m[1]);
    const orphans = handlers.filter((h) => {
      const uses = code.split(new RegExp("\\\\b" + h + "\\\\b")).length - 1;
      return uses <= 1;                          // only the definition itself
    });
    ok(!orphans.includes("buyAutoSkill") && !orphans.includes("toggleAutoSkill"),
       "the orphaned auto-skill handlers are gone");
    // Report the rest rather than failing: not every unused helper is a bug, but a lesson must not
    // rest on one. This is the sweep that would have caught the original.
    if (orphans.length) console.log("    note: " + orphans.length + " defined-but-never-called handler(s): " + orphans.join(", "));
    for (const l of LESSONS) {
      const body = String(l.done);
      for (const o of orphans) ok(!body.includes(o), l.id + " does not depend on the orphan " + o);
    }
    ok(!/autoSkillsOwned/.test(LESSONS.map((l) => String(l.done)).join(" ")),
       "no lesson waits on autoSkillsOwned, which nothing can set");
  }

  // --- coverage: the systems the sweep named are all present ----------------------------------------
  {
    const want = ["potion", "autopot", "spec", "talent", "auction", "dungeon", "gems",
                  "gambit", "craft", "enchant", "temper", "guild", "arena", "hardprep"];
    for (const id of want) ok(!!byId(id), "a lesson exists for: " + id);
    const last = LESSONS[LESSONS.length - 1];
    ok(lvlOf(last) >= 55, "the last lesson lands at level " + lvlOf(last) + ", handing the player over to Hard Mode");
  }

  console.log(fail ? "\\n\\u274c " + fail + " lesson check(s) failed"
                   : "\\n\\u2705 lessons: every system is taught, gated by its own unlock, and old saves carry across");
  process.exit(fail ? 1 : 0);
})();`;
const runf = path.join(dir, 'lessons.cjs'); fs.writeFileSync(runf, js);
require(runf);
