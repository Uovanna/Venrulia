// The most important check here is the NEGATIVE one: a real character must raise no flags. This
// is a signal collector for a testing phase, and a collector that cries wolf on legitimate
// players is worse than none — it would train everyone to ignore the log it exists to produce.
import { readFileSync } from "fs";
import { loadoutFlags, logLoadout, MAX_LEVEL, MAX_SKILL_SLOTS } from "./loadout-check.mjs";
import { contentById } from "./party.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url), "utf8"));
let fail = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

const content = contentById("hd_stratholme");     // ilvl 66 hard dungeon
const real = fixture[0].char;

// --- legitimate characters are silent ----------------------------------------------------------
{
  for (const f of fixture) {
    const flags = loadoutFlags(f.char, content);
    ok(flags.length === 0, `a real fixture character (${f.char.cls} lvl ${f.char.level}) raises nothing`);
  }
  // The regression that made me change the rule: gear is judged against the PLAYER'S level, not
  // the content's. A level-60 running a level-17 dungeon out-gears it by design, and comparing
  // against content flagged every single one of them.
  ok(loadoutFlags(real, contentById("deadmines")).length === 0,
     "…including a max-level player in low-level content, who legitimately out-gears it");
  ok(loadoutFlags({ ...real, level: 20 }, content).some((f) => f.code === "ilvl"),
     "but ilvl 60 gear on a level-20 character IS flagged");
}

// --- the things worth noticing --------------------------------------------------------------------
{
  const bump = (over) => loadoutFlags({ ...real, ...over }, content);
  ok(bump({ level: MAX_LEVEL + 40 }).some((f) => f.code === "level"), `level ${MAX_LEVEL + 40} is flagged`);
  ok(bump({ level: 0 }).some((f) => f.code === "level"), "level 0 is flagged");
  ok(bump({ selectedSkills: Array(MAX_SKILL_SLOTS + 4).fill("X") }).some((f) => f.code === "skills"),
     `${MAX_SKILL_SLOTS + 4} skills on a ${MAX_SKILL_SLOTS}-slot bar is flagged`);

  const huge = { ...real, equipment: { ...real.equipment,
    weapon: { ...(Object.values(real.equipment || {})[0] || {}), name: "Impossible Blade", ilvl: 400 } } };
  const f = loadoutFlags(huge, content);
  ok(f.some((x) => x.code === "ilvl"), `ilvl 400 is flagged: "${f.find((x) => x.code === "ilvl")?.detail}"`);
  ok(loadoutFlags({ ...real, level: 60, equipment: { w: { name: "Raid drop", ilvl: 71 } } }, content).length === 0,
     "a level-60 in ilvl-71 hard-raid gear — the best the game rolls — is not flagged");

  const fat = { ...real, equipment: { ...real.equipment,
    weapon: { name: "Statstick", ilvl: 66, stats: { str: 9999 } } } };
  ok(loadoutFlags(fat, content).some((x) => x.code === "stats"), "an item with an impossible stat bag is flagged");

  ok(loadoutFlags(null, content)[0].code === "nochar", "a missing character is flagged, not a crash");
  ok(loadoutFlags(real, null).length === 0, "no content to compare against still works");
}

// --- it only speaks when there is something to say ------------------------------------------------
{
  const lines = [];
  logLoadout(real, content, "Legit", (m) => lines.push(m));
  ok(lines.length === 0, "a legitimate join logs nothing at all");
  logLoadout({ ...real, level: 999 }, content, "Sus", (m) => lines.push(m));
  ok(lines.length === 1 && /level\(/.test(lines[0]), `a suspicious join logs one line: ${lines[0]}`);
}

// --- and it never rejects ---------------------------------------------------------------------------
{
  ok(typeof loadoutFlags({ level: 9999 }, content) === "object", "flagging returns data; nothing here throws or rejects");
}

console.log(fail ? `\n❌ ${fail} loadout check(s) failed` : "\n✅ loadout signals: quiet for real characters, loud for impossible ones, fatal to none");
process.exit(fail ? 1 : 0);
