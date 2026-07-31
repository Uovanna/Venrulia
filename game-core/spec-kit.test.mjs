// Every spec gets the same shape of skill bar, and the damage estimate credits what live combat does.
//
// Two problems, found by measuring solo hard mode with the group-role specs:
//
//  1. A level-60 bar has 5 slots. Every DPS spec has 3 signature skills and fills the last two with
//     class skills — a Berserker's default bar carried x10.20 of damage multiplier. Every group-role
//     spec had FIVE signatures, which filled the bar exactly: a Protection warrior's carried x2.90
//     and a Holy paladin's x3.70. That was never tuned; it was a slot count colliding with a
//     signature count, and it cost those specs 21-86% of their damage. Only SPEC_AUTOGRANT
//     signatures are handed to an empty bar now. The rest are NOT removed — they stay in the pool.
//
//  2. offlinePlayerDps applied the Arcanist's +3s cooldown penalty but never its Wild Magic
//     double-cast, so the spec was charged for its downside and credited with none of its upside —
//     in offline farming, in its multiplayer power rating, and in every group dps estimate.
import { SPEC_SKILLS, SPEC_AUTOGRANT, specSkillNames, specGrantedSkills, specRole, specById,
         normalizeChar, createCharacter, buildBotChar, unlockedSlotCount, skillByName, skillPool,
         offlinePlayerDps, isMagicSkill, talentFlag, SKILLS } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const CAP = unlockedSlotCount(60);
const CLASS_OF = { w: "warrior", m: "mage", r: "rogue", p: "paladin", h: "hunter", l: "warlock" };
const clsOf = (spec) => CLASS_OF[spec.split("_")[0]];
const defaultBar = (spec) => normalizeChar({ ...createCharacter("T", clsOf(spec), "human"), level: 60, spec, selectedSkills: [] }).selectedSkills;
const barDmg = (spec, bar) => { const ch = { cls: clsOf(spec), level: 60, spec };
  return bar.reduce((a, n) => { const s = skillByName(ch, n); return a + (s ? (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0) : 0); }, 0); };
const ALL = Object.keys(SPEC_SKILLS).filter((s) => clsOf(s) && specById(s));

// --- every spec grants the same number, so every bar has the same shape ------------------------
{
  ok(SPEC_AUTOGRANT === 3, `a spec grants ${SPEC_AUTOGRANT} signature skills to an empty bar`);
  ok(SPEC_AUTOGRANT < CAP, `…leaving ${CAP - SPEC_AUTOGRANT} slots for the player's own choices`);
  for (const spec of ALL) {
    ok(specGrantedSkills(spec).length === Math.min(SPEC_AUTOGRANT, specSkillNames(spec).length),
       `${spec} grants ${specGrantedSkills(spec).length}`);
  }
  const roles = [...new Set(ALL.map(specRole))];
  ok(roles.length > 1, `the check covers more than one role (${roles.join(", ")})`);
}

// --- the freed slots actually reach the bar ------------------------------------------------------
{
  for (const spec of ALL) {
    const bar = defaultBar(spec);
    ok(bar.length === CAP, `${spec}: a fresh character still gets a full ${CAP}-slot bar`);
    const sigOnBar = bar.filter((n) => specSkillNames(spec).includes(n)).length;
    ok(sigOnBar <= SPEC_AUTOGRANT, `${spec}: at most ${SPEC_AUTOGRANT} of the bar is signatures (${sigOnBar})`);
  }
  // The point of the change: a group-role bar can now hurt something.
  for (const spec of ALL.filter((s) => specRole(s) !== "dps")) {
    const d = barDmg(spec, defaultBar(spec));
    ok(d > 5, `${spec}: its default bar carries x${d.toFixed(2)} of damage (it was x2.90-x5.00 with five signatures)`);
  }
  // The property that matters is not "all bars are equal" — DPS specs differ from each other by
  // x2.3 on raw multiplier alone and that is fine. It is that a group-role bar is no longer BELOW
  // every DPS bar in the game, which is exactly where all five of them used to sit.
  const dpsBars = ALL.filter((s) => specRole(s) === "dps").map((s) => barDmg(s, defaultBar(s)));
  const worstDps = Math.min(...dpsBars);
  for (const spec of ALL.filter((s) => specRole(s) !== "dps")) {
    const d = barDmg(spec, defaultBar(spec));
    ok(d > worstDps * 0.9,
       `${spec} (x${d.toFixed(2)}) is inside the DPS range, not under it (weakest DPS bar is x${worstDps.toFixed(2)})`);
  }
}

// --- the other signatures are NOT taken away ------------------------------------------------------
// Visibility comes from the skill's own `spec` field, so everything the spec owns stays selectable.
{
  for (const spec of ALL) {
    const ch = { cls: clsOf(spec), level: 60, spec };
    const reachable = new Set(skillPool(ch).map((s) => s.name));
    const missing = specSkillNames(spec).filter((n) => !reachable.has(n));
    ok(missing.length === 0, `${spec}: all ${specSkillNames(spec).length} of its signatures remain selectable`);
  }
}

// --- a player's existing bar is never rewritten -----------------------------------------------------
// Granting fewer skills must not become a way to evict choices a player already made.
{
  const spec = "w_prot", cls = "warrior";
  const kit = specSkillNames(spec);
  const c = { ...createCharacter("T", cls, "human"), level: 60, spec, selectedSkills: [...kit] };
  const loaded = normalizeChar(c);
  ok(JSON.stringify(loaded.selectedSkills) === JSON.stringify(kit),
     "a tank who already carries all five signatures keeps all five across a reload");
  // And a player who chose damage skills keeps those.
  const dmgBar = skillPool({ cls, level: 60, spec }).filter((s) => s.unlockLevel <= 60 && s.mult > 0)
    .sort((a, b) => b.mult - a.mult).slice(0, CAP).map((s) => s.name);
  const loaded2 = normalizeChar({ ...c, selectedSkills: dmgBar });
  ok(JSON.stringify(loaded2.selectedSkills) === JSON.stringify(dmgBar),
     "…and a tank who chose five damage skills keeps those instead");
}

// --- bots still run their whole role kit --------------------------------------------------------
// A tank bot without its taunt, or a healer without Aegis of Light, would break group content.
{
  for (const [cls, spec] of [["warrior", "w_prot"], ["paladin", "p_holy"], ["paladin", "p_prot"],
                             ["mage", "m_support"], ["hunter", "h_support"]]) {
    const bot = withRng(makeRng(31), () => buildBotChar(cls, spec, 60, 66));
    const kit = specSkillNames(spec);
    const on = kit.filter((n) => bot.selectedSkills.includes(n)).length;
    ok(on === Math.min(kit.length, CAP), `a ${spec} bot still carries ${on}/${Math.min(kit.length, CAP)} of its kit`);
  }
}

// --- the group-role damage skills are among the granted three -------------------------------------
// Arcane Barrage and Aimed Shot sat 4th in their spec's list, so granting three would have handed a
// support a bar that could barely hurt anything.
{
  for (const spec of ALL.filter((s) => specRole(s) !== "dps")) {
    const ch = { cls: clsOf(spec), level: 60, spec };
    const granted = specGrantedSkills(spec);
    const dmg = granted.filter((n) => { const s = skillByName(ch, n); return s && ((s.mult || 0) > 0 || s.dotMult); }).length;
    ok(dmg >= 2, `${spec}: ${dmg} of its ${SPEC_AUTOGRANT} granted signatures deal damage`);
  }
}

// --- Wild Magic is credited by the damage estimate --------------------------------------------------
{
  const mk = (spec) => withRng(makeRng(77), () => {
    const c = buildBotChar("mage", spec, 60, 64); c.spec = spec;
    c.selectedSkills = defaultBar(spec);
    c.autoSkillsOwned = {}; c.autoSkills = {};
    for (const n of c.selectedSkills) { c.autoSkillsOwned[n] = true; c.autoSkills[n] = true; }
    return c;
  });
  const wild = mk("m_wild");
  ok(talentFlag(wild, "wildmagic"), "the Arcanist carries the Wild Magic flag");
  ok(wild.selectedSkills.some((n) => { const s = skillByName(wild, n); return s && isMagicSkill(s) && s.mult > 0; }),
     "…and its default bar contains magic skills for it to double-cast");
  // Golden value. Before the fix this bench measured 955; the estimate ignored the 30% double-cast
  // while still applying the spec's +3s cooldown. If someone removes the credit it drops back.
  const dps = offlinePlayerDps(wild);
  ok(dps > 955 * 1.05,
     `its measured dps is ${Math.round(dps)}, above the ${955} it read when Wild Magic was ignored`);
  // The credit must be confined to magic skills — a physical bar cannot benefit from it.
  const physOnly = { ...wild };
  physOnly.selectedSkills = skillPool(wild).filter((s) => s.unlockLevel <= 60 && !isMagicSkill(s) && s.mult > 0).slice(0, CAP).map((s) => s.name);
  physOnly.autoSkillsOwned = {}; physOnly.autoSkills = {};
  for (const n of physOnly.selectedSkills) { physOnly.autoSkillsOwned[n] = true; physOnly.autoSkills[n] = true; }
  ok(physOnly.selectedSkills.length === 0 || offlinePlayerDps(physOnly) < dps,
     "…and a physical-only bar gets no Wild Magic credit");
}

console.log(fail ? `\n❌ ${fail} spec kit check(s) failed`
                 : "\n✅ every spec gets the same bar shape, keeps its whole kit available, and Wild Magic is counted");
process.exit(fail ? 1 : 0);
