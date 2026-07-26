// Builds the encounter party from room seats, filling empty slots with disguised bots.
//
// Combatants: a seat's `loadout.char` is a full combat-ready character object (the client
// publishes it on join, same shape the game already uses). Bot seats need a generated
// combatant — `buildBotChar` — which is NOT yet in the shared core. Extracting it into
// game-core (same technique used for combat.mjs) is the small follow-on that lets the
// server construct bots itself; until then, bots reuse a rotation of the human loadouts.

// Minimal content catalogue. Source of truth is MP_CONTENT in the client; mirror the
// entries you expose as rooms here (or extract MP_CONTENT into the shared core too).
export const MP_CONTENT = {
  hard_deadmines: { id: "hard_deadmines", name: "The Sunken Mine (Hard)", boss: "ashen", partySize: 4 },
  trial_ashen:    { id: "trial_ashen",    name: "Trial of the Ashen King", boss: "ashen", partySize: 4 },
};
export function contentById(id) { return MP_CONTENT[id] || null; }

const ROLES = ["tank", "healer", "dps", "dps", "dps", "dps"];
const BOT_NAMES = ["Kaelen", "Sora", "Bran", "Yuki", "Rurik", "Mei", "Torvald", "Aya"];

// party: [{ char, role, tier }] for createRun()
export function buildPartyFromSeats(seats, content) {
  const filled = [];
  for (let i = 0; i < content.partySize; i++) {
    const seat = seats[i];
    if (seat && seat.loadout && seat.loadout.char) {
      filled.push({ char: seat.loadout.char, role: seat.role || ROLES[i] || "dps", tier: seat.loadout.tier });
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
