// Sanity SIGNALS for a client-published `loadout.char`.
//
// The server builds a combatant from whatever the client sends and does not verify it, so an
// edited payload could field an inflated character. Among invited testers that risk is close to
// nil, and a validator written now would have to guess its thresholds — one that wrongly rejects
// a legitimate player mid-run costs far more than the cheating it prevents.
//
// So this REJECTS NOTHING. It reports what looks out of range, the room logs it, and a testing
// phase hands back the real distribution of legitimate values. That is what a validator needs
// before it can be written honestly; turning this into one later is a matter of choosing which
// flags become fatal.
export const MAX_LEVEL = 60;
export const MAX_SKILL_SLOTS = 5;

// content is optional — when present, gear is judged against what that content should drop.
export function loadoutFlags(char, content) {
  const flags = [];
  if (!char || typeof char !== "object") return [{ code: "nochar", detail: "loadout.char missing or not an object" }];

  const lvl = Number(char.level) || 0;
  if (lvl > MAX_LEVEL) flags.push({ code: "level", detail: `level ${lvl} > ${MAX_LEVEL}` });
  if (lvl < 1) flags.push({ code: "level", detail: `level ${lvl} < 1` });

  const skills = Array.isArray(char.selectedSkills) ? char.selectedSkills : [];
  if (skills.length > MAX_SKILL_SLOTS) flags.push({ code: "skills", detail: `${skills.length} skills on a ${MAX_SKILL_SLOTS}-slot bar` });

  const gear = Object.values(char.equipment || {}).filter(Boolean);
  const ilvls = gear.map((i) => Number(i.ilvl) || 0);
  const maxIlvl = ilvls.length ? Math.max(...ilvls) : 0;
  // Judge gear against the PLAYER'S level, not the content's drop level. Out-gearing content is
  // normal — a level-60 running a level-17 dungeon is the common case, and comparing against the
  // content flagged every one of them. What is odd is gear far above what a character of this
  // level could have earned. The highest the game rolls is the hard raid at ilvl 71.
  if (lvl && maxIlvl > lvl + 15) flags.push({ code: "ilvl", detail: `ilvl ${maxIlvl} on a level ${lvl} character` });
  if (maxIlvl > 100) flags.push({ code: "ilvl", detail: `ilvl ${maxIlvl} exceeds anything the game rolls` });

  // Gear the game does not hand out: more equipped pieces than there are slots, or stat bags an
  // item of that level could not roll.
  if (gear.length > 12) flags.push({ code: "slots", detail: `${gear.length} equipped pieces` });
  for (const it of gear) {
    const total = Object.values(it.stats || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    if (total > 2000) { flags.push({ code: "stats", detail: `${it.name || "item"} carries ${total} total stats` }); break; }
  }

  return flags;
}

// One line, only when something looks off — silence is the normal case.
export function logLoadout(char, content, who, log = console.warn) {
  const flags = loadoutFlags(char, content);
  if (!flags.length) return flags;
  log(`[loadout] ${who}: ${flags.map((f) => `${f.code}(${f.detail})`).join(", ")}`);
  return flags;
}
