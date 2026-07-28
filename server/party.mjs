// Builds the encounter party from room seats, filling empty slots with disguised bots.
//
// Combatants: a seat's `loadout.char` is a full combat-ready character object (the client
// publishes it on join, same shape the game already uses). Bot seats are built by the shared
// `buildBotChar`, which rolls a character of the right class and spec with gear at the
// encounter's own item level — so bots scale with the content rather than being fixed 60s.

// Every piece of Guild content, mirroring the client's DUNGEONS / RAIDS / HARD_RAID. Ids match
// the client's so a room id is stable across both. The boss is built by the SHARED
// guildBossDef, so an online fight is the same encounter the offline one would have been —
// the earlier hand-written stubs all pointed at BOSS_DEFS.ashen, which made every online run
// the Ashen Warden regardless of which dungeon you picked.
import { guildBossDef, SKILLS, buildBotChar, TRINITY_FILL } from "./combat.mjs";

const DUNGEONS = [
  { id: "deadmines",  name: "The Sunken Mine",   boss: "Bandit Lord Garrick", minLevel: 15 },
  { id: "scarlet",    name: "The Crimson Abbey", boss: "Champion Hadrok",     minLevel: 30 },
  { id: "uldaman",    name: "The Forgotten Vault", boss: "Stoneguard Aurok",  minLevel: 40 },
  { id: "blackrock",  name: "The Ember Deeps",   boss: "Emperor Vorgath",     minLevel: 50 },
  { id: "stratholme", name: "The Cursed City",   boss: "Baron Morthane",      minLevel: 56 },
];
const RAIDS = [
  { id: "moltencore", name: "The Molten Heart", boss: "Ignaroth the Flamelord", minLevel: 60 },
];

const HARD_DUNGEONS = [
  { id: "hd_deadmines",  name: "The Sunken Mine",     boss: "Bandit Lord Garrick", enemyLvl: 63 },
  { id: "hd_scarlet",    name: "The Crimson Abbey",   boss: "Champion Hadrok",     enemyLvl: 65 },
  { id: "hd_uldaman",    name: "The Forgotten Vault", boss: "Stoneguard Aurok",    enemyLvl: 66 },
  { id: "hd_blackrock",  name: "The Ember Deeps",     boss: "Emperor Vorgath",     enemyLvl: 67 },
  { id: "hd_stratholme", name: "The Cursed City",     boss: "Baron Morthane",      enemyLvl: 68 },
];
const HARD_RAID = { id: "hr_moltencore", name: "The Molten Heart", boss: "Ignaroth the Flamelord", enemyLvl: 72 };

// `kind` must match the client's strings exactly — guildBossDef keys off `includes("raid")`
// and `startsWith("hard")`, so "hard_dungeon" would silently produce a RAID boss.
const entry = (c, kind, partySize) => {
  const level = c.enemyLvl || (c.minLevel || 60) + 2;
  // Gear level for bot-fill, mirroring the client's guildLaunch: hard content drops at its own
  // ilvl, normal dungeons a little above their minimum level.
  const ilvl = kind === "hard-raid" ? 71
    : kind === "hard-dungeon" ? (c.dropIlvl || 66)
    : kind === "raid" ? (c.reqIlvl || 60)
    : Math.min(63, (c.minLevel || 60) + 3);
  return { id: c.id, name: c.name + (kind.startsWith("hard") ? " (Hard)" : ""), kind, partySize, level, ilvl,
           boss: guildBossDef(c, kind, level) };
};

export const MP_CONTENT = Object.fromEntries([
  ...DUNGEONS.map((d) => [d.id, entry(d, "dungeon", 4)]),
  ...HARD_DUNGEONS.map((d) => [d.id, entry(d, "hard-dungeon", 4)]),
  ...RAIDS.map((r) => [r.id, entry(r, "raid", 6)]),
  [HARD_RAID.id, entry(HARD_RAID, "hard-raid", 6)],
]);

export function contentById(id) { return MP_CONTENT[id] || null; }

const ROLES = ["tank", "healer", "support", "dps", "dps", "dps"];
const BOT_NAMES = ["Kaelen", "Sora", "Bran", "Yuki", "Rurik", "Mei", "Torvald", "Aya"];

// Bot-fill used to clone the joining player's character for every empty seat, so a party of
// warriors was handed the "healer" and "tank" roles with no heals and no mitigation between
// them. It then used fixed level-60 reference characters, which trivialised low-level content
// (a level-17 dungeon boss facing epic-geared 60s). Bots are now BUILT for the encounter:
// the client's own buildBotChar, now in the shared core, rolls a character of the right class
// and spec at the content's level and item level.
const roleScore = (role, s) => {
  const heal = (s.healPct || 0) + (s.hotPct || 0);
  const util = (s.cleanse ? 60 : 0) + (s.wardPct || 0) + (s.empowerPct || 0) + (s.hastePct || 0);
  const dmg = (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0);
  if (role === "healer") return heal * 3 + util + dmg * 0.05;
  if (role === "tank") return (s.wardPct || 0) * 3 + (s.cleanse ? 40 : 0) + dmg * 0.5;
  if (role === "support") return ((s.empowerPct || 0) + (s.hastePct || 0)) * 3 + (s.cleanse ? 40 : 0) + dmg * 0.5;
  return dmg;                                             // dps: just the biggest hits
};

// buildBotChar picks a generic loadout, so re-pick for the seat's role — otherwise the
// "healer" turns up with five damage spells and never heals anybody.
function botCharFor(role, content, level, name) {
  const [cls, spec] = TRINITY_FILL[role] || TRINITY_FILL.dps;
  const bc = buildBotChar(cls, spec, level, content.ilvl || 60);
  const pool = (SKILLS[cls] || []).filter((s) => (s.unlockLevel || 1) <= level);
  const selected = pool.slice().sort((a, b) => roleScore(role, b) - roleScore(role, a)).slice(0, 5).map((s) => s.name);
  bc.name = name;
  if (selected.length) bc.selectedSkills = selected;
  return bc;
}

// party: [{ char, role, tier, isHuman }] for createRun()
//
// `isHuman` is what makes a combatant player-driven: the core skips the AI for those allies
// and waits on their queued intent instead (see chooseAllyAction / resolveIntent). The array
// index is the ally id the core assigns ("a0", "a1", …), so the caller can map a seat to its
// combatant by position — that mapping is how the room routes intents.
export function buildPartyFromSeats(seats, content) {
  const filled = [];
  for (let i = 0; i < content.partySize; i++) {
    const seat = seats[i];
    if (seat && seat.loadout && seat.loadout.char) {
      filled.push({ char: seat.loadout.char, role: seat.role || ROLES[i] || "dps", tier: seat.loadout.tier, isHuman: !seat.bot });
      seat.allyId = "a" + i;   // ally ids are assigned by index in createEncounter
    } else {
      const template = seats.find((s) => s.loadout && s.loadout.char)?.loadout;
      if (!template) throw new Error("no loadout available to seed a combatant; publish loadout.char on join");
      const role = ROLES[i] || "dps";
      filled.push({ char: botCharFor(role, content, template.char.level || content.level, BOT_NAMES[i % BOT_NAMES.length]), role, tier: template.tier });
      if (seat) seat.bot = true;
    }
  }
  return filled;
}
