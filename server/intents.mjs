// Intent queueing rules for a player seat. Kept out of EncounterRoom.mjs so they can be tested
// without standing up Colyseus (that module imports the server framework at load).

export const INTENT_QUEUE_MAX = 3;    // how many taps a player may line up ahead of the sim

// Shape a seat's intent queue from one incoming message.
//
// Queue rather than overwrite: this used to be last-wins, so tapping two skills inside one
// 120ms tick silently threw the first away — which reads exactly like "that button doesn't
// work". The cap keeps it from becoming a macro: you can line up the next couple of casts, not
// bank a whole rotation. Repeats of the SAME skill collapse, so holding a button does not eat
// the queue with duplicates.
export const queueIntent = (queue, intent, max = INTENT_QUEUE_MAX) => {
  const q = [...(queue || [])];
  // A potion is the one intent that names no skill. It spends a charge belonging to the whole
  // encounter, so the core decides whether it is allowed — the client only asks.
  if (intent && intent.potion === true) {
    const out = q.filter((x) => !x.potion);                 // one queued potion, never a stack
    out.push({ potion: true });
    while (out.length > max) out.shift();
    return out;
  }
  if (!intent || typeof intent.skillName !== "string") return q;   // malformed → queue unchanged
  const target = intent.target && (intent.target.type === "enemy" || intent.target.type === "ally") && typeof intent.target.id === "string"
    ? { type: intent.target.type, id: intent.target.id }
    : null;
  const out = q.filter((x) => x.skillName !== intent.skillName);
  out.push({ skillName: intent.skillName, target });
  while (out.length > max) out.shift();
  return out;
};
