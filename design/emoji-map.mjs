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
  "⚔": "sword", "🗡": "dagger", "🤺": "dagger",
  "🛡": "shield", "❤": "heart", "💔": "heart", "🩸": "blood",
  "💀": "skull", "☠": "skull", "🧟": "undead", "👻": "undead", "🦴": "undead",
  "⚡": "haste", "💫": "haste", "🌀": "haste", "🏃": "haste",
  "🔥": "flame", "🌋": "flame", "💥": "flame",
  "🎯": "target", "👁": "eye", "🔍": "eye",
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
  "📖": "tome", "📚": "tome", "🎓": "tome", "🔮": "orb",
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

  // --- the gaps the GameIcon swap exposed ---------------------------------
  // Routing item and enemy portraits through this table covered 163 of the 190
  // `icon:` fields in the data at a stroke. These are what was left standing as
  // raw colour emoji next to a page of ink, so these are what got drawn.
  "🌲": "pine", "🌳": "pine", "🎄": "pine", "🌴": "palm", "🌵": "palm",
  "❄": "frost", "🧊": "frost", "☃": "frost",
  "♾": "endless", "🔋": "charge", "🪫": "charge", "🔌": "charge",
  "🌅": "dawn", "🌄": "dawn", "🌇": "dawn",
  "⛓": "chain", "🔗": "chain", "↩": "return", "🔙": "return",
  "➕": "plus", "🎲": "dice", "☁": "cloud", "🌐": "globe", "📡": "globe",
  "🧑": "figure", "🧍": "figure", "👤": "figure", "🤖": "figure",
  "💬": "speak", "🗨": "speak", "📱": "speak",

  // Rarity and quality swatches. These are COLOUR, not iconography — the thing
  // they identify is the tier, and the design already writes a tier as a colour
  // on the ink. So they all become the one gem drawing and let .rar-* say which
  // gem it is, rather than thirteen near-identical coloured squares.
  "🟢": "gem", "🟠": "gem", "🟣": "gem", "🟤": "gem", "⚪": "gem", "🟡": "gem",
  "🔴": "gem", "🟥": "gem", "🟩": "gem", "🟦": "gem", "🟧": "gem", "🟪": "gem", "🟨": "gem",
  "🔻": "gem", "🔺": "gem", "🔶": "gem", "🔷": "gem", "💠": "gem", "♦": "gem",
  "🖤": "gem", "🔵": "gem", "💚": "gem", "⬛": "gem", "🤍": "gem", "💧": "gem", "🧿": "gem",

  // --- the armour slots ----------------------------------------------------
  // Measuring coverage against App.jsx alone reported 99%; the data tables
  // mostly live in game-core/combat.mjs, and counting BOTH files reported 81%.
  // The Armory's own slot grid was the most visible thing that miscount hid.
  "🪖": "helm", "🧣": "amulet", "📿": "amulet", "👕": "chest", "🎽": "chest",
  "🧤": "glove", "👖": "legs", "🩳": "legs", "🥾": "boot", "💍": "ring",

  // --- the recurring skill and enemy marks ---------------------------------
  "⏩": "haste", "🔆": "spark", "💢": "spark", "😤": "spark", "🪄": "spark",
  "☄": "spark", "🌠": "spark", "✨": "spark",
  "📣": "speak", "📯": "speak",
  "🪓": "axe", "✂": "dagger",
  "😈": "undead", "😱": "skull",
  "🐍": "beast", "🐂": "horns", "🐾": "beast", "🥷": "figure", "🤸": "figure",
  "⚖": "scales", "🚫": "ban", "✋": "ban",
  "🫀": "heart", "❤‍🔥": "heart", "💉": "flask", "🧉": "flask",
  "✝": "shrine", "🙏": "shrine", "🕊": "shrine",
  "🍃": "herb", "🪶": "herb", "🧹": "herb",
  "🧱": "shield", "🪞": "shield", "🪤": "target", "🃏": "dice",
  "🌫": "cloud", "🌧": "cloud", "🌩": "cloud", "🌤": "cloud",
  "☀": "dawn", "🌒": "abyss", "🔭": "globe", "💨": "haste", "🪝": "chain",
  // The hunter's shots and the rogue's mark. ↗ is an arrow in flight here, not
  // a UI arrow — which is why it maps while ⬆ and ⬇ deliberately do not.
  "↗": "bow", "🏴": "skull",
};

/* Deliberately NOT mapped, with reasons — so the gaps are a decision rather than
 * an oversight, and so nobody "finishes the job" by mapping them badly later.
 *
 *   ⬆⬇▶🔁⚖📊💾🏁📅   interface furniture that has no Chronicle equivalent yet.
 *      An arrow is not a drawing; when these get a home they get a decision.
 */
export const stripVS = (s) => s.replace(/️/g, "");
