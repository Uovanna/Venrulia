// Builds the encounter party from room seats, filling empty slots with disguised bots.
//
// Combatants: a seat's `loadout.char` is a full combat-ready character object (the client
// publishes it on join, same shape the game already uses). Bot seats need a generated
// combatant — `buildBotChar` — which is NOT yet in the shared core. Extracting it into
// game-core (same technique used for combat.mjs) is the small follow-on that lets the
// server construct bots itself; until then, bots reuse a rotation of the human loadouts.

// Every piece of Guild content, mirroring the client's DUNGEONS / RAIDS / HARD_RAID. Ids match
// the client's so a room id is stable across both. The boss is built by the SHARED
// guildBossDef, so an online fight is the same encounter the offline one would have been —
// the earlier hand-written stubs all pointed at BOSS_DEFS.ashen, which made every online run
// the Ashen Warden regardless of which dungeon you picked.
import { guildBossDef } from "./combat.mjs";

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
  return { id: c.id, name: c.name + (kind.startsWith("hard") ? " (Hard)" : ""), kind, partySize, level,
           boss: guildBossDef(c, kind, level) };
};

export const MP_CONTENT = Object.fromEntries([
  ...DUNGEONS.map((d) => [d.id, entry(d, "dungeon", 4)]),
  ...HARD_DUNGEONS.map((d) => [d.id, entry(d, "hard-dungeon", 4)]),
  ...RAIDS.map((r) => [r.id, entry(r, "raid", 6)]),
  [HARD_RAID.id, entry(HARD_RAID, "hard-raid", 6)],
]);

export function contentById(id) { return MP_CONTENT[id] || null; }

const ROLES = ["tank", "healer", "dps", "dps", "dps", "dps"];
const BOT_NAMES = ["Kaelen", "Sora", "Bran", "Yuki", "Rurik", "Mei", "Torvald", "Aya"];

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
      // Disguised bot: reuse a human loadout as a template, or a supplied bot template.
      const template = seats.find((s) => s.loadout && s.loadout.char)?.loadout;
      if (!template) throw new Error("no loadout available to seed a combatant; publish loadout.char on join");
      const botChar = { ...template.char, name: BOT_NAMES[i % BOT_NAMES.length] };
      filled.push({ char: botChar, role: ROLES[i] || "dps", tier: template.tier });
      if (seat) seat.bot = true;
    }
  }
  return filled;
}
