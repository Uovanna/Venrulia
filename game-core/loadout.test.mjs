// Your skill bar has to survive a save and a reload.
//
// normalizeChar rebuilds selectedSkills on every load. It used to prepend the spec's signature
// skills, and since padSelectedSkills truncates to the slot count, that evicted real choices: a
// level-60 warrior who had deliberately picked five non-signature skills kept two of them after a
// single reload, silently and permanently.
import { normalizeChar, createCharacter, padSelectedSkills, specSkillNames,
         unlockedSlotCount, SKILLS, SPEC_SKILLS, buildBotChar } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const LEVEL = 60;
const CAP = unlockedSlotCount(LEVEL);
const build = (cls, spec, picks) => {
  const c = createCharacter("Test", cls, "human");
  c.level = LEVEL; c.spec = spec; c.selectedSkills = picks;
  return c;
};
const nonSigOf = (cls) => (SKILLS[cls] || []).filter((s) => !s.spec && s.unlockLevel <= LEVEL).map((s) => s.name);

// --- the reported bug ---------------------------------------------------------------------------
{
  const sig = specSkillNames("w_berserk");
  const picks = nonSigOf("warrior").slice(0, CAP);
  ok(picks.length === CAP, `a level-${LEVEL} warrior can fill all ${CAP} slots with non-signature skills`);
  ok(!picks.some((n) => sig.includes(n)), "…and none of them is a signature skill");

  const loaded = normalizeChar(build("warrior", "w_berserk", picks));
  ok(JSON.stringify(loaded.selectedSkills) === JSON.stringify(picks),
     "a full bar of non-signature skills survives a reload unchanged");
  ok(!loaded.selectedSkills.some((n) => sig.includes(n)),
     "…and no signature skill is forced in behind the player's back");
}

// --- it must hold for every class and spec --------------------------------------------------------
{
  for (const [cls, spec] of [["warrior", "w_berserk"], ["rogue", "r_ambush"], ["mage", "m_fire"],
                             ["paladin", "p_holy"], ["hunter", "h_snipe"], ["warlock", "l_scorch"]]) {
    const picks = nonSigOf(cls).slice(0, CAP);
    if (picks.length < CAP) continue;   // a class without enough non-signature skills cannot show this
    const loaded = normalizeChar(build(cls, spec, picks));
    ok(JSON.stringify(loaded.selectedSkills) === JSON.stringify(picks), `${cls}/${spec}: bar survives a reload`);
  }
}

// --- reloading repeatedly must not drift ------------------------------------------------------------
{
  const picks = nonSigOf("warrior").slice(0, CAP);
  let c = build("warrior", "w_berserk", picks);
  for (let i = 0; i < 5; i++) c = normalizeChar(c);
  ok(JSON.stringify(c.selectedSkills) === JSON.stringify(picks), "five consecutive reloads change nothing");
}

// --- signature skills still fill EMPTY slots ---------------------------------------------------------
// The fix must not stop a spec granting its skills — it must stop them evicting choices.
{
  const sig = specSkillNames("w_berserk");
  const picks = nonSigOf("warrior").slice(0, 2);
  const loaded = normalizeChar(build("warrior", "w_berserk", picks));
  ok(loaded.selectedSkills.slice(0, 2).join() === picks.join(), "the player's two picks keep their slots");
  ok(loaded.selectedSkills.length === CAP, `…the bar is still filled to ${CAP}`);
  ok(sig.every((n) => loaded.selectedSkills.includes(n)), "…and the empty slots went to the signature skills");
}

// --- a brand-new character is unaffected ---------------------------------------------------------------
{
  const fresh = normalizeChar(build("warrior", "w_berserk", []));
  ok(fresh.selectedSkills.length === CAP, "a character with nothing selected still gets a full bar");
  ok(specSkillNames("w_berserk").every((n) => fresh.selectedSkills.includes(n)),
     "…and it leads with the spec's signature skills, which is the point of choosing a spec");
}

// --- another spec's signatures are still discarded -------------------------------------------------------
{
  const other = specSkillNames("w_champion");
  const mine = specSkillNames("w_berserk");
  const loaded = normalizeChar(build("warrior", "w_berserk", [other[0], ...nonSigOf("warrior").slice(0, 3)]));
  ok(!loaded.selectedSkills.includes(other[0]),
     `a signature skill from a different spec (${other[0]}) is dropped on load`);
  ok(mine.some((n) => loaded.selectedSkills.includes(n)), "…and the freed slot goes to this spec's own");
}

// --- ordering matches applyLoadout ----------------------------------------------------------------------
// applyLoadout has always used [saved, ...signatures]. normalizeChar was the one place that did not,
// and that inconsistency is what this bug was.
{
  const sig = specSkillNames("w_berserk");
  const picks = nonSigOf("warrior").slice(0, 2);
  const ch = { cls: "warrior", level: LEVEL, spec: "w_berserk" };
  ok(JSON.stringify(padSelectedSkills(ch, [...picks, ...sig])) ===
     JSON.stringify(normalizeChar(build("warrior", "w_berserk", picks)).selectedSkills),
     "normalizeChar now orders its bar exactly the way applyLoadout does");
}

// --- bots must still run their full spec kit -------------------------------------------------------
// Preserving player choice cost BOTS a signature ability, which no existing test could see.
// createCharacter seeds selectedSkills with one basic skill, and normalizeChar rightly treats
// whatever is there as deliberate — so that starter skill took slot 1 and pushed the fifth
// signature off. For a tank that was Shield Wall; for a healer, Aegis of Light.
{
  for (const [cls, spec] of [["warrior", "w_prot"], ["paladin", "p_holy"], ["rogue", "r_ambush"],
                             ["mage", "m_support"], ["hunter", "h_support"]]) {
    const bot = withRng(makeRng(31), () => buildBotChar(cls, spec, 60, 66));
    const sig = specSkillNames(spec);
    const want = Math.min(sig.length, unlockedSlotCount(60));
    const on = sig.filter((n) => bot.selectedSkills.includes(n)).length;
    ok(on === want, `a ${cls} ${spec} bot carries ${on}/${want} of its signature skills`);
  }
  // The bar is still full — signatures fill it, they do not shrink it.
  const bot = withRng(makeRng(31), () => buildBotChar("warrior", "w_prot", 60, 66));
  ok(bot.selectedSkills.length === unlockedSlotCount(60), "…and its bar is full");
}

console.log(fail ? `\n❌ ${fail} loadout check(s) failed`
                 : "\n✅ skill bars survive a reload; signature skills fill empty slots without evicting choices");
process.exit(fail ? 1 : 0);
