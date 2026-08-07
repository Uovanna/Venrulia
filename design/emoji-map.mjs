/* Emoji → icon id. THE source of truth for the swap.
 *
 * The game addresses its icons as emoji today, in three different ways: data
 * fields (`icon: "⛏️"`), JSX text, and — for 152 of the occurrences — inside
 * plain strings handed to addLog and showNotif. Rewriting 886 call sites by hand
 * would be a very large diff with a very large number of places to be wrong.
 *
 * So the swap is a lookup instead. One table here, one substitution at the render
 * boundary, and every one of those three shapes is handled at once. An emoji that
 * is not in this table renders as itself, so coverage can grow without a flag day
 * and nothing ever disappears from the screen.
 *
 * Variation selectors (U+FE0F) are stripped before lookup — "⚔️" and "⚔" are the
 * same character to a player and were both in the source.
 */
export const EMOJI_ICON = {
  // --- combat -------------------------------------------------------------
  "⚔": "sword", "🗡": "sword", "🤺": "sword",
  "🛡": "shield", "❤": "heart", "💔": "heart", "🩸": "blood",
  "💀": "skull", "☠": "skull", "🧟": "undead", "👻": "undead", "🦴": "undead",
  "⚡": "haste", "💫": "haste", "🌀": "haste", "🏃": "haste",
  "🔥": "flame", "🌋": "flame", "💥": "flame",
  "🎯": "target", "👁": "target", "🔍": "target",
  "🏹": "bow", "💪": "sword", "🧠": "spark",

  // --- currency and reward ------------------------------------------------
  "💰": "coin", "💱": "coin", "💳": "coin", "🪙": "coin",
  "💎": "gem", "💠": "gem", "🔷": "gem", "🔶": "gem", "💜": "gem",
  "🎟": "ticket", "🎫": "ticket",
  "🏆": "trophy", "🏅": "trophy", "🥇": "trophy",
  "👑": "crown", "⭐": "star", "🌟": "star", "✨": "spark", "🎉": "spark", "🎁": "spark",

  // --- state --------------------------------------------------------------
  "⏳": "hourglass", "⏱": "hourglass", "⏰": "hourglass", "🐌": "hourglass", "⏸": "hourglass",
  "🔒": "lock", "🔓": "unlock", "🔑": "unlock",
  "✅": "check", "✔": "check", "☑": "check",
  "⚠": "warn", "⛔": "warn", "🆘": "warn", "❓": "warn", "☣": "warn",
  "🕳": "abyss", "🌑": "abyss", "🌙": "abyss",
  "⚙": "gear", "🎚": "gear", "🔧": "gear",

  // --- places -------------------------------------------------------------
  "🏰": "keep", "🏗": "keep", "🗿": "keep", "⛩": "keep",
  "🏦": "vault", "🏛": "vault",
  "🏪": "stall", "🛒": "stall", "🏬": "stall",
  "⚒": "anvil", "🔨": "hammer", "🛠": "anvil",
  "🏟": "arena", "🎰": "arena",
  "⛪": "shrine", "🕯": "shrine", "⚜": "shrine",
  "🍺": "tavern", "🍶": "tavern", "🎶": "tavern",
  "📜": "scroll", "📋": "scroll", "📇": "scroll", "🏷": "scroll",
  "📖": "tome", "📚": "tome", "🎓": "tome", "🔮": "tome",
  "📬": "mail", "📦": "mail", "✉": "mail",

  // --- craft --------------------------------------------------------------
  "⛏": "pick", "🪨": "pick", "🔩": "pick", "⚓": "pick",
  "🌿": "herb", "🌾": "herb", "🌱": "herb", "🍀": "herb", "🌸": "herb", "🌼": "herb", "🥀": "herb",
  "⚗": "flask", "🧪": "flask", "🧴": "flask",
  "🧵": "thread", "🧥": "chest",
  "♻": "spark", "🔱": "sword", "🧰": "pack", "🎒": "pack",

  // --- bestiary -----------------------------------------------------------
  "🐺": "beast", "🐆": "beast", "🐸": "beast", "🦎": "beast", "🦖": "beast",
  "🦇": "beast", "🕷": "beast", "🕸": "beast", "👹": "beast", "🍖": "beast", "🦷": "beast",
  "🐉": "drake", "🌪": "drake", "🌊": "drake",
};

/* Deliberately NOT mapped, with reasons — so the gaps are a decision rather than
 * an oversight, and so nobody "finishes the job" by mapping them badly later.
 *
 *   🟢🟠🟣🟤⚪🟡🔴🟥🟩🟦🟧🟪🟨  rarity and quality swatches. These are colour, not
 *      iconography — they become a CSS token, not a drawing.
 *   ➕⬆⬇▶↩🔁♾⚖📊📡📱🌐🤖💬🧑🧍   interface furniture and multiplayer chrome that
 *      the Chronicle has not been designed for yet.
 *   🌅🌄❄🔋🔌🪫💾🏁📅   one-offs awaiting their own screens.
 */
export const stripVS = (s) => s.replace(/️/g, "");
