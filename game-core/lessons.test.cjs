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

js += `
;(function(){
  const core = require("${path.join(__dirname, 'combat.mjs').replace(/\\/g, '/')}");
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
    const rot = byId("autoskill");
    ok(!!rot && rot.done({ autoSkillsOwned: { "Slam": true } }) && !rot.done({ autoSkillsOwned: {} }),
       "a lesson forces buying an auto-skill — no rotation measured 2.6x slower");
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

  // --- coverage: the systems the sweep named are all present ----------------------------------------
  {
    const want = ["potion", "autopot", "autoskill", "spec", "talent", "auction", "dungeon", "gems",
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
