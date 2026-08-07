/* Enemy archetypes: a disposition has to change how a creature FIGHTS without changing how hard
 * the game is. Solo enemy health is level-based and does not self-calibrate the way group boss
 * health does, so an unbudgeted archetype change lands straight on the difficulty curve.
 *
 *   node game-core/enemy-archetype.test.cjs
 *
 * Requires `tsc` on PATH.
 */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-arch-'));
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
  const { CLASSES } = core;
  let fail = 0;
  const ok = (c, m) => { console.log("  " + (c ? "\\u2713" : "\\u2717") + " " + m); if (!c) fail++; };
  const IDS = CLASSES.map((c) => c.id);
  const LVL = 60;

  const profile = (cls) => {
    const a = ENEMY_ARCHETYPE[cls];
    const st = enemyStatBlock(LVL, cls, { rank: "normal", tier: "normal" });
    const e = { ...st, level: LVL, cls };
    const dmg = enemyBaseDamage(e);
    const mit = enemyMitigation(e, LVL);
    const hp = Math.floor((LVL * 26 + 50) * a.hp);
    // TOTAL damage per second: autos AND casts. An earlier version of this test measured only the
    // auto component, which is exactly why it passed while the shipped archetypes actually had a
    // x1.33 dps spread — the multiplier scaled cast damage too but only compensated for swing speed.
    const autoDps = dmg * AUTO_SHARE * (1 + a.crit * CRIT_BONUS) / a.atk;
    const castDps = dmg * CAST_SHARE / a.cast;
    return { a, dmg, autoDps, castDps, dps: autoDps + castDps, mit, hp, ehp: hp / (1 - mit) };
  };

  // --- the table covers everything, and unknown input is safe ----------------------------------
  {
    for (const cls of IDS) ok(!!ENEMY_ARCHETYPE[cls], cls + " has an archetype");
    ok(archetypeOf({ cls: "nonesuch" }) === NEUTRAL_ARCHETYPE, "an unknown disposition falls back to neutral rather than throwing");
    ok(archetypeOf(undefined) === NEUTRAL_ARCHETYPE, "…as does an enemy with no disposition at all (older saved battles)");
    ok(NEUTRAL_ARCHETYPE.atk === 1 && NEUTRAL_ARCHETYPE.hp === 1 && NEUTRAL_ARCHETYPE.armor === 0,
       "the neutral fallback is exactly the pre-archetype behaviour");
  }

  // --- damage per second is held at parity ------------------------------------------------------
  // This is the whole safety property: swing speed and crit are free to differ because damage per
  // hit is DERIVED from them. If someone authors dmg independently, this fails.
  {
    const dps = IDS.map((c) => profile(c).dps);
    const spread = Math.max(...dps) / Math.min(...dps);
    ok(spread < 1.02, "every disposition deals the same TOTAL damage per second (spread x" + spread.toFixed(3) + ")");
    ok(Math.abs(AUTO_SHARE + CAST_SHARE - 1) < 1e-9, "the auto and cast shares account for all of an enemy's output");
    // Assert the derivation itself rather than a proxy. Damage per hit is NOT monotonic in swing
    // speed any more — a mage-type swings slowest of all yet hits softest, because it also casts
    // most often and that share has to come out of the same budget. An earlier version of this
    // check assumed monotonicity and failed on four archetypes for that reason alone.
    for (const cls of IDS) {
      const a = ENEMY_ARCHETYPE[cls];
      const solved = archetypeDmgMult(a) * (AUTO_SHARE * (1 + a.crit * CRIT_BONUS) / a.atk + CAST_SHARE / a.cast);
      ok(Math.abs(solved - 1) < 1e-9,
         cls + ": swing x" + a.atk.toFixed(2) + ", cast x" + a.cast.toFixed(2) + ", crit "
         + (a.crit * 100).toFixed(0) + "% solve back to parity");
    }
    // Holding cast cadence and crit equal, a slower swing must still hit harder — otherwise the
    // rhythm is cosmetic.
    const same = (atk) => archetypeDmgMult({ atk, crit: 0, cast: 1 });
    ok(same(1.3) > same(1.0) && same(1.0) > same(0.7), "at equal cadence, a slower swing hits harder");
  }

  // --- the archetypes are actually distinguishable ------------------------------------------------
  {
    const eh = IDS.map((c) => profile(c).ehp);
    ok(Math.max(...eh) / Math.min(...eh) > 1.5,
       "effective health really differs (x" + (Math.max(...eh) / Math.min(...eh)).toFixed(2) + " between the toughest and the softest)");
    ok(profile("paladin").ehp > profile("rogue").ehp * 1.4, "a paladin-type is a wall next to a rogue-type");
    ok(profile("rogue").a.atk < 0.85 && profile("mage").a.atk > 1.15, "a rogue-type flurries where a mage-type winds up");
    ok(profile("rogue").a.crit > 0 && profile("mage").a.crit === 0, "only the archetypes meant to spike can crit");

    // Cadence: the same total output, split completely differently between autos and casts.
    const rogue = profile("rogue"), mage = profile("mage");
    ok(rogue.autoDps / rogue.dps > 0.75, "a rogue-type is " + (rogue.autoDps / rogue.dps * 100).toFixed(0) + "% auto-attacks — it barely casts");
    ok(mage.castDps / mage.dps > 0.5, "a mage-type is " + (mage.castDps / mage.dps * 100).toFixed(0) + "% casts — it leans on its spells");
    ok(mage.a.cast < rogue.a.cast * 0.5, "…and a mage-type casts far more often than a rogue-type");
    for (const cls of IDS) ok(ENEMY_ARCHETYPE[cls].cast > 0, cls + " has a cast cadence");
  }

  // --- the paladin filter bug ---------------------------------------------------------------------
  // paladin declares main "str", so deriving its damage type from the stat block filtered its 21
  // castable skills down to the 2 physical ones. It never used 19 of its own abilities, while being
  // the most armoured and longest-lived thing in the zone.
  {
    // Use the core's own helper rather than restating the rule — makeEnemy and the Bestiary both
    // call it, and a copy here would be a third definition free to drift from either.
    const usableFor = (cls) => ({
      all: core.enemyCastable(cls, 60).length,
      usable: core.enemyUsableSkills(cls, 60).length,
      prefersMagic: core.enemyPrefersMagic(cls, 60),
    });
    const pal = usableFor("paladin");
    ok(pal.prefersMagic, "a paladin-type is read as a caster, which is what 19 of its 21 skills are");
    ok(pal.usable >= pal.all * 0.7, "it can now draw on " + pal.usable + " of its " + pal.all + " skills (it had 2)");
    for (const cls of IDS) {
      const u = usableFor(cls);
      ok(u.usable >= 8, cls + " draws from a real pool (" + u.usable + " of " + u.all + ")");
    }
    ok(!usableFor("warrior").prefersMagic && usableFor("mage").prefersMagic,
       "…and the rule still reads a warrior as physical and a mage as magical");
    // The declaration itself now matches the kit, so the two can no longer disagree.
    ok(CLASSES.find((c) => c.id === "paladin").main === "int",
       "paladin declares Intellect, matching both its kit and where its damage measurably comes from");
    for (const cls of IDS) {
      const declared = CLASSES.find((c) => c.id === cls).main === "int";
      ok(declared === usableFor(cls).prefersMagic,
         cls + ": the declared main stat and its kit agree about whether it is a caster");
    }
  }

  // --- armor is real, and only where it should be -------------------------------------------------
  {
    for (const cls of ["warrior", "paladin"]) ok(profile(cls).mit > 0.15, cls + "-types turn " + (profile(cls).mit * 100).toFixed(0) + "% of a blow");
    for (const cls of ["rogue", "mage", "warlock"]) ok(profile(cls).mit === 0, cls + "-types carry no armor at all");
    ok(profile("paladin").mit > profile("warrior").mit, "the paladin-type is the most armoured");
    // Armor is derived from the same curve players use, so it must hold at every level, not just 60.
    const at = (lvl) => { const st = enemyStatBlock(lvl, "paladin", { rank: "normal", tier: "normal" });
      return enemyMitigation({ ...st, level: lvl }, lvl); };
    ok(Math.abs(at(10) - at(60)) < 0.03, "…and holds its mitigation across levels (" + (at(10) * 100).toFixed(0) + "% at 10, " + (at(60) * 100).toFixed(0) + "% at 60)");
  }

  // --- the difficulty curve did not move ------------------------------------------------------------
  {
    const BEFORE_EHP = 60 * 26 + 50;    // every disposition was exactly this, with no armor
    // Weighted by how often each disposition actually appears — dispositionFor hashes the creature
    // NAME, so the distribution is not uniform and a flat average would flatter the result.
    const NAMES = ["Goblin Bandit", "Forest Spider", "Bullywug", "Highway Thug", "Dust Devil",
                   "Scarecrow Golem", "Gnoll Raider", "Jungle Troll", "Goblin Raider", "Raptor",
                   "Panther", "Ashen Ghoul", "Cinder Imp", "Blight Hound", "Marsh Stalker"];
    const weighted = NAMES.reduce((s, n) => s + profile(dispositionFor(n)).ehp, 0) / NAMES.length;
    ok(Math.abs(weighted / BEFORE_EHP - 1) < 0.06,
       "the creatures a player actually meets are x" + (weighted / BEFORE_EHP).toFixed(3) + " as tough as before");
    const dpsNow = profile("warrior").dps;
    ok(Math.abs(dpsNow / 126.0 - 1) < 0.02,
       "…and hit for the same damage per second as before (" + dpsNow.toFixed(1) + " against 126.0)");
  }

  // NOTE: makeEnemy itself is defined INSIDE the React component, so it cannot be reached from
  // this harness the way enemyStatBlock and enemyBaseDamage can. Whether it actually applies the
  // archetype health multiplier and puts an armor value on the enemy is verified in the browser by
  // game-core/enemy-ui.check.mjs, which reads real enemies out of a real fight.

  console.log(fail ? "\\n\\u274c " + fail + " enemy archetype check(s) failed"
                   : "\\n\\u2705 enemy archetypes: same damage per second, genuinely different to fight");
  process.exit(fail ? 1 : 0);
})();`;
const run = path.join(dir, 'arch.cjs'); fs.writeFileSync(run, js);
require(run);
