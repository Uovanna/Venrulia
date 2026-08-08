import React, { useState, useEffect, useRef, useCallback } from "react";
import { rng, makeRng, withRng, pick, rngPick, rngInt, makeClock } from "../game-core/rng.mjs";
import { IconSprite, Icon, EmojiIcon, withIcons } from "./icons.jsx";
import { ChronicleStyles, Chronicle, loadTheme, saveTheme, themeClass } from "./chronicle.jsx";
import {
  CLASSES,
  RACES,
  GEMS,
  GEAR_SETS,
  setPiecesEquipped,
  pvpDamageTakenMult,
  hasCcBreak,
  socketsOf,
  MAIN_KEYS,
  itemMainTotals,
  itemMainCount,
  itemPowerRaw,
  itemHasPower,
  itemPowerActive,
  SKILLS,
  PHYSICAL_SKILLS,
  skillType,
  isMagicSkill,
  CLASS_RESOURCES,
  classResource,
  RES_DECAY_MS,
  resTotal,
  resSync,
  resExpire,
  drFactor,
  resAdd,
  resTake,
  MARK_DMG_PER_STACK,
  SKILL_SLOT_LEVELS,
  unlockedSlotCount,
  classSkills,
  specVisible,
  skillPool,
  skillByName,
  SKILL_MOD_POWER,
  skillModPts,
  skillModPotency,
  skillModEffectList,
  hasSkillModEffect,
  clamp,
  activeBuffs,
  effectiveStats,
  tierForLevel,
  tierBuffPct,
  wardPct,
  PLAYER_BASE_INTERVAL,
  empowerMultOf,
  physBuffMultOf,
  isPlayerDebuff,
  TALENT_TIERS,
  TALENT_L60,
  _gU,
  _gS1,
  _gO,
  _gS2,
  _off,
  SPEC_TREES,
  specById,
  specRole,
  roleOf,
  POWER_GEMS,
  ALL_GEMS,
  gemById,
  socketedGems,
  gemFlatCd,
  talentRows,
  selectedTalents,
  skillIsSpender,
  skillIsBuilder,
  skillIsDot,
  skillIsNuke,
  condHpOk,
  condMatchesSkill,
  talentSkillMult,
  talentFlag,
  talentDotDur,
  talentCcDur,
  talentMods,
  maxHpFor,
  weaponAvgDmg,
  townLvl,
  townBonuses,
  HEX_MAX_STACKS,
  hexStackMult,
  classDmgMod,
  computeDamage,
  playerBaseDamage,
  AGI_SPEED_CAP,
  agiAtkSpeed,
  critChanceFor,
  mitigation,
  enemyDamageForLevel,
  LEECH_MULT,
  secondaryPcts,
  critMultFor,
  cdrPerCdOf,
  PET,
  petMaxHp,
  petHitDamage,
  petDps,
  cdrPerDebuffOf,
  enemyDebuffCount,
  skillsOnCd,
  cdrFracFor,
  offlinePlayerDps,
  BOT_TIERS,
  PVP_TOUGHNESS,
  PVP_SKILL_CUT,
  PVP_SKILL_MULT,
  botCanAfford,
  chooseBotSkill,
  applySkillCore,
  GRP,
  healPowerOf,
  skIsHeal,
  skIsHot,
  skIsCleanse,
  skIsAoeHeal,
  skIsTaunt,
  skIsInterrupt,
  skIsDef,
  skIsPartyBuff,
  skThreatMult,
  roleThreatBase,
  grpSkills,
  grpReady,
  grpInjured,
  grpPrimaryEnemy,
  grpTopThreat,
  grpAddThreat,
  grpEstDps,
  mkAlly,
  ADD_ABILITIES,
  BOSS_DEFS,
  mkEncEnemy,
  allyById,
  grpAdds,
  grpIncoming,
  createEncounter,
  chooseAllyAction,
  applyAllyAction,
  grpWardOf,
  grpHitAlly,
  grpRaidDamage,
  grpResolveTarget,
  ALL_SPEC_SKILL_NAMES,
  ITEM_BASES,
  MAIN_SUFFIXES,
  POWER_AFFIX_MIN_ILVL,
  POWER_PER_STAT,
  PREFIXES,
  PROFESSIONS,
  RARITY_STAT_MULT,
  SPEC_SKILLS,
  baseArmorFor,
  emptyProfessions,
  emptySockets,
  gearStatBase,
  secondaryNominal,
  secondaryFor,
  abyssMult,
  ABYSS_MAX_PLUS,
  TRINITY_FILL,
  botTier,
  buildBotChar,
  specClassOf,
  specSkillNames,
  specGrantedSkills,
  SPEC_AUTOGRANT,
  guildBossDef,
  HUNTER_WEAPONS,
  gambitCondMet,
  gambitFiresSkill,
  executeThreshold,
  intentRejection,
  potionRejection,
  migrateGambitKeys,
  gdkpReserve,
  SECONDARY_POOL,
  hasteOf,
  pickSlotSecondary,
  SEC_SIZE,
  pickLootSlot,
  zoneDropScale,
  physScalingStat,
  enemyPrefersMagic,
  enemyUsableSkills,
  gdkpBotCeiling,
  // These used to be defined a SECOND time in App.jsx. Nothing forced the two copies to agree,
  // so the client and the authoritative server could silently run different rules — which is
  // exactly how normalizeChar lost the gambit slot migration. One definition now, imported.
  RARITIES,
  rarityById,
  GEAR_SLOTS,
  LOOT_SLOTS,
  generateItem,
  emptyEquipment,
  createCharacter,
  normalizeChar,
  mainStatsOf,
  migrateItem,
  migrateSpec,
  nameWithSuffix,
  padSelectedSkills,
  slotById,
  socketCountFor,
  starterGear,
  stepEncounter,
  suffixByMains,
  uid,
  weaponRangeFor,
} from "../game-core/combat.mjs";

// ============================================================
// REALMS OF ELDORIA — a fantasy idle RPG
// Systems: classes, races, gear + loot tables, equipment slots,
// professions, zones, dungeons, active combat skills, auction house,
// gold economy, save/load.
// ============================================================

// ---------- CLASSES ----------


// Each creature has a fixed "disposition" (class) so its stats & skills are consistent and match the
// Bestiary. Hand-author specific foes in the override map below; anything unlisted is derived by a
// stable hash over CLASSES, so newly-added classes are automatically folded into the roster and any
// override id that no longer exists safely falls back to the hash.
const ENEMY_DISPOSITION_OVERRIDES = {
  "Goblin": "warlock",
  // "Cultist": "warlock", ...  ← add explicit dispositions here as desired
};
const dispositionFor = (name) => {
  const o = ENEMY_DISPOSITION_OVERRIDES[name];
  if (o && CLASSES.some((c) => c.id === o)) return o;
  const h = [...(name || "?")].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return CLASSES[h % CLASSES.length].id;
};

// ---------- GEAR STAT WEIGHTS ----------
// weight of a stat when scoring gear. Classes no longer have a primary stat, so all three
// base stats are weighted equally; Stamina and combat secondaries follow.
// What one point of a stat is worth when deciding whether an item is an upgrade.
//
// Main stats are priced per class, because they are not interchangeable. A class turns exactly
// one stat into physical damage (physScalingStat — Agility for rogues and hunters, Strength for
// everyone else) and Intellect into magic damage. Measured at level 60 / ilvl 63, 30 points of
// the stat a class actually scales off is worth ~11-19% dps; 30 points of a stat it does not use
// is worth 0.0%. Pricing all three at 1.0 meant a warrior chest rolling agi+int scored exactly as
// well as one rolling str+agi while being ~7% worse, and auto-sell kept the wrong one.
// Measured dps gain from +30 of each main stat at level 60 / ilvl 63, averaged over twelve seeded
// gear rolls and normalised to each class's own best stat. game-core/mainstat-weights.test.cjs
// re-measures and fails if the table drifts from what the combat code actually does.
//
// Declared explicitly rather than inferred from each class's `main`, because that declaration is
// not reliable for hybrids: paladin declares "str" while its damage measurably comes from
// Intellect (7.8% per 30 against Strength's 4.7%), so an inference would confidently mis-price it.
//
// The floor of 0.15 is deliberate. A stat a class genuinely cannot use measures 0.0%, but pricing
// it at zero would let auto-sell vendor an otherwise excellent piece purely for carrying one dead
// line, and main stats are only ever one part of an item.
const MAIN_STAT_FLOOR = 0.15;
const MAIN_WEIGHTS = {
  warrior: { str: 1.0,  agi: 0.5,  int: 0.15 },
  rogue:   { str: 0.15, agi: 1.0,  int: 0.15 },
  hunter:  { str: 0.15, agi: 1.0,  int: 0.15 },
  paladin: { str: 0.6,  agi: 0.75, int: 1.0  },
  mage:    { str: 0.8,  agi: 0.85, int: 1.0  },
  warlock: { str: 0.55, agi: 0.7,  int: 1.0  },
};
const mainStatWeightFor = (clsId, stat) => {
  const row = MAIN_WEIGHTS[clsId];
  if (row) return row[stat] ?? MAIN_STAT_FLOOR;
  // An unknown class still has to score something sane: full weight on whatever it scales its
  // physical damage off, and a real but smaller value everywhere else.
  return stat === physScalingStat(clsId) ? 1.0 : 0.5;
};
const statWeight = (clsId, stat) => {
  if (stat === "str" || stat === "agi" || stat === "int") return mainStatWeightFor(clsId, stat);
  // Secondaries are priced by measurement, not by hand. game-core/statweight-calibration.mjs
  // measures each one through the real combat code across six classes and twelve seeded gear
  // rolls, in units of one point of the class's OWN scaling stat, and
  // game-core/itemscore.test.cjs re-measures the damage ones and fails if the table drifts.
  //
  // The hand-set values these replaced were internally inconsistent by up to 2.6x: crit damage
  // measured 1.03 and was priced at 0.4, versatility measured 0.68 and was priced at 0.35. Main
  // stats were correct, so secondaries were collectively undervalued against them and the upgrade
  // label systematically preferred main-stat pieces over better secondary ones.
  //
  // Stamina stays the anchor for DEFENCE at 0.75 against a measured 1.40 points of effective
  // health, an exchange rate of 0.536. That rate is the game's existing view on how much
  // survivability is worth against damage, and it is preserved rather than re-decided here.
  if (stat === "sta") return 0.75;
  // Attack/Spell Power, and weapon damage, all enter computeDamage as flat additions where a main
  // stat enters at x1.4 — so a point of any of them is worth 1/1.4 of a main stat. Measured across
  // six classes at 0.716 against the 0.714 arithmetic predicts. Power was missing entirely before,
  // and since it only ever appears on single-main-stat gear its absence made every focused piece
  // read 10.3% worse than a dual piece it actually matches or beats in combat.
  if (stat === "ap" || stat === "sp" || stat === "dmg") return 0.7;
  // Crit damage is the one weight that does NOT hold still across the endgame, because its value is
  // proportional to crit chance and crit chance keeps climbing with gear. Re-measured against the
  // endgame ilvl curve: 1.0 at ilvl 60, 1.3 at 63, 1.6 at 66, 2.2 at 70. Priced at the entry
  // bracket, so it is honest where players enter hard mode and conservative above it — a single
  // number cannot be right across a x2.2 range. If crit damage starts dominating endgame gear, the
  // lever is SEC_CAP.csd / SEC_RATE.csd in the core, not this weight.
  if (stat === "csd") return 1.3;     // measured 1.28 at ilvl 63
  if (stat === "vers") return 0.7;    // measured 0.68
  if (stat === "crit") return 0.55;   // measured 0.53
  if (stat === "cdr") return 0.45;    // measured 0.43
  if (stat === "armor") return 0.45;  // measured 0.47 as effective health
  if (stat === "haste") return 0.2;   // measured 0.19
  // Leech and resilience are the two this harness cannot measure honestly, so both keep their
  // existing hand-set values rather than being moved on a model.
  //
  // Leech returns a share of damage dealt as healing, so its worth is proportional to how long the
  // fight lasts: 0.21 over a 2s trash kill, 1.04 over 10s, 6.27 against a group boss. 0.45 sits at
  // roughly a 4s fight, which matches a game where trash dies in about 1.5 seconds. Moving it is a
  // decision about which content the upgrade label should optimise for, not a correction.
  if (stat === "leech") return 0.45;
  // Resilience cuts damage-over-time and gives a chance to resist stuns and slows. Neither shows
  // up in throughput or effective health, so it measures 0.00 here — which is a limit of the
  // harness, not the stat. Left at judgement; scoring it at zero would be actively wrong.
  if (stat === "resil") return 0.25;
  return 0;
};

// ---------- RACES ----------


// ---------- RARITIES ----------

// ---------- ARTIFACT GEAR (Ven "top-up" reward — weapon & off-hand only) ----------
// Artifacts re-forge as you level rather than being replaced: ilvl = max(40, level + 5). That gives
// instant power early (an ilvl-40 weapon at level 1), tapers in relevance as normal gear catches up,
// and is finally outclassed by Hard Mode's ilvl 65+. Rolls at legendary magnitude.
// Artifacts re-forge as you level rather than being replaced. The curve is deliberately tapered:
// levels 1–35 sit at the ilvl-40 floor (instant early power), then track level+5 up to ilvl 55 at
// level 50, after which growth halves — landing at ilvl 60 by max level. That keeps artifacts under
// normal mode's ilvl-63 ceiling and clearly outclassed by Hard Mode's ilvl 65+. Rolls at legendary magnitude.
const ARTIFACT_BASE_ILVL = 40;
const ARTIFACT_TAPER_LEVEL = 50; // growth halves past this level
// Lifted out of the component so the daily sign-in reward and its test can use it: the weekend
// gift is rolled at the player's average equipped item level.
const avgEquippedIlvl = (c) => {
  const items = Object.values((c && c.equipment) || {}).filter((it) => it && it.ilvl && it.slotId !== "relic"); // relics have no ilvl and don't count
  if (!items.length) return (c && c.level) || 1; // no gear yet → base on character level
  return Math.round(items.reduce((s, it) => s + it.ilvl, 0) / items.length);
};
const artifactIlvl = (level) => {
  const l = level || 1;
  return l <= ARTIFACT_TAPER_LEVEL
    ? Math.max(ARTIFACT_BASE_ILVL, l + 5)
    : Math.round((ARTIFACT_TAPER_LEVEL + 5) + (l - ARTIFACT_TAPER_LEVEL) * 0.5);
};
// The two primaries that best serve each class (str/agi/int; Stamina rolls as a secondary).
const ARTIFACT_STATS = {
  warrior: ["str", "agi"], // Strength drives every swing; Agility adds attack speed & crit
  mage:    ["int", "agi"], // Intellect powers spells; Agility adds attack speed & crit
  rogue:   ["agi", "str"], // Agility is the engine; Strength boosts physical strikes
  paladin: ["str", "int"], // Strength for weapon damage; Intellect for their magic-typed holy skills
  hunter:  ["agi", "str"], // Agility for speed & crit; Strength for physical shots
  warlock: ["int", "agi"], // Intellect powers shadow magic; Agility adds speed & crit
};

// ---------- SOCKETS ----------
// Only Epic/Legendary/Artifact gear has sockets. Rings & trinkets are the only *droppable* gear that
// can roll them; artifacts always carry a full three. Gems slot in later — this is the framework.


 // null = empty socket, else a gem id
const REFORGE_SOCKET_VEN = 100; // Ven to burn a bonded gem out of a socket (the gem is destroyed)

// ---------- GEMS ----------
// Socketed into Epic/Legendary/Artifact gear. Drop alongside gear using the same zone/dungeon rarity
// bands, so a gem's rarity is rolled by the same system that decides an item's. Legendary gems are
// "Souls" — they grant a level-60 signature talent, including ones from classes you aren't.
//   stats: flat attributes · m: the same modifier keys talents use · regen: % max HP restored per second



const openSockets = (item) => socketsOf(item).filter((g) => !g).length;
// Squished, roughly-linear rarity scaling (replaces the old 2^rarity curve). Zone gear (low
// rarity) keeps you afloat; the big jumps live in Rare/Epic/Legendary from dungeons & raids.
 // poor..legendary, artifact (artifact matches legendary)

// ================= UNIT ICON FRAMEWORK =================
// Swap emoji icons for custom art WITHOUT touching render sites. Register an image here and
// every <GameIcon> that references that key/emoji renders the image instead of the emoji.
//   • key   = a semantic unit key (enemy/creature name, class id, race id) OR the emoji string
//   • value = an image URL or base64 data URI ("data:image/png;base64,....")
// Lookup order in <GameIcon>: imgKey first, then the emoji. Anything unregistered falls back
// to the original emoji, so this is safe to leave empty until art exists. Example:
//   const ICON_OVERRIDES = { "👹": "data:image/png;base64,....", warrior: "/art/warrior.png" };
const ICON_OVERRIDES = {
  // (empty — add entries as custom images/models become available)
};
// The portrait of a THING — an item, a gem, an enemy, a class. Three fallbacks,
// in order: a supplied bitmap, the drawn glyph for that emoji, and finally the
// emoji itself.
//
// The middle step is the one that matters. GameIcon rendered its emoji raw for
// the whole of the redesign, which meant every item row in the Bank, the Armory
// and the Auction House — the screens a player spends the most time reading —
// still showed the operating system's colour emoji next to a page of ink. It is
// the largest single source of emoji left in the game and it needed no work per
// call site: the mapping already existed, GameIcon simply was not asking.
function GameIcon({ icon, imgKey, size = 28, rounded = true, style }) {
  const src = (imgKey && ICON_OVERRIDES[imgKey]) || (icon && ICON_OVERRIDES[icon]);
  if (src) return <img src={src} alt="" draggable={false} style={{ width: size, height: size, objectFit: "contain", borderRadius: rounded ? Math.round(size * 0.16) : 0, display: "inline-block", verticalAlign: "middle", imageRendering: "auto", ...style }} />;
  return <EmojiIcon emoji={icon} size={size} style={style} />;
}

// ---------- GEAR SLOTS ----------

// Relics are rare, gameplay-altering items (one per applicable dungeon). Not enchantable, no random stats.
const RELICS = [
  { id: "miners_charm", name: "Miner's Charm", icon: "⛏️", dungeonId: "deadmines", color: "#e0a955", desc: "Mining “Smash” cooldown −1s · 50% chance for double ore when manually mining." },
  { id: "verdant_idol", name: "Verdant Idol", icon: "🌿", dungeonId: "scarlet", color: "var(--verdigris)", desc: "Herbalism “Harvest” cooldown −1s · 50% chance for double herbs when manually harvesting." },
];
const relicForDungeon = (dungeonId) => RELICS.find((r) => r.dungeonId === dungeonId);
const makeRelic = (def, ilvl) => ({ id: uid(), name: def.name, slotId: "relic", icon: def.icon, rarity: "legendary", ilvl: null, relicId: def.id, relicDesc: def.desc, relicColor: def.color, stats: {}, enchant: null });



// ---------- GEAR NAMING: the suffix IS the main-stat contract ----------
// Every item's suffix maps 1:1 to the primary stats it carries, so a player (or an Auction House
// filter) can read "of the Tiger" and know it rolled +Agi +Int without opening the tooltip.



const wouldDormantPower = (it, stat) => {
  if (!itemPowerActive(it) || !MAIN_KEYS.includes(stat)) return false;
  const t = itemMainTotals(it); t[stat] = (t[stat] || 0) + 1;
  return MAIN_KEYS.filter((k) => t[k] > 0).length > 1;
};
// Keys are DERIVED from each entry's stat list, so a suffix can never drift out of sync with it.


// Derive an item's main stats from what it actually carries (works for gear made before this system).

 // incl. legacy
// Rebuild a name so its suffix matches the item's real stats (idempotent).


// ---------- ZONES ----------
const ZONES = [
  { id: "elwynn", name: "Greenhollow Wood", minLevel: 1, maxLevel: 10, icon: "🌲", color: "#4a7c3f", desc: "A peaceful woodland near the village.", enemies: ["Goblin", "Bandit", "Forest Spider", "Bullywug"] },
  { id: "westfall", name: "Brackenfield Plains", minLevel: 10, maxLevel: 20, icon: "🌾", color: "#c4a35a", desc: "Dusty farmlands plagued by bandits.", enemies: ["Highway Thug", "Dust Devil", "Scarecrow Golem", "Gnoll Raider"] },
  { id: "duskwood", name: "Gloomwood", minLevel: 20, maxLevel: 30, icon: "🕸️", color: "#5a3a6b", desc: "A cursed forest haunted by the undead.", enemies: ["Skeleton", "Dire Wolf", "Dark Rider", "Giant Spider"] },
  { id: "stranglethorn", name: "Tanglevine Jungle", minLevel: 30, maxLevel: 45, icon: "🌴", color: "#1a6b2a", desc: "Jungle teeming with raiders and trolls.", enemies: ["Jungle Troll", "Goblin Raider", "Raptor", "Panther"] },
  { id: "searing", name: "Emberwaste Canyon", minLevel: 45, maxLevel: 55, icon: "🌋", color: "#8b2500", desc: "A volcanic wasteland of ash and flame.", enemies: ["Ash Dwarf", "Fire Elemental", "Lava Spawn", "Fire Ogre"] },
  { id: "plaguelands", name: "The Blighted Marches", minLevel: 55, maxLevel: 60, icon: "☠️", color: "#2d4a1e", desc: "Land consumed by a deathly blight.", enemies: ["Plague Ghoul", "Risen Warrior", "Plague Bat", "Wraith"] },
];

// ---------- DUNGEONS ----------
const DUNGEONS = [
  // `waves` counts TRASH only — the boss is an extra encounter on top, because resolveDeath treats
  // wave > waves as the boss. So a run is waves + 1 fights. (Hard Mode uses the opposite
  // convention as Hard Mode, which used to treat the last wave as the boss and now does not.)
  //
  // One wave per step down the chain: 3, 4, 5, 6, 7, and the raid at 8. The Cursed City used to
  // have 10 against The Ember Deeps' 5 — more than double the dungeon before it, and longer than
  // the raid, which made it the one instance nobody wanted to run twice.
  //
  // `lootFloor` is dead data: nothing reads it. DUNGEON_RARITY is the real loot table.
  { id: "deadmines", name: "The Sunken Mine", minLevel: 15, icon: "⚓", color: "#7a5230", boss: "Bandit Lord Garrick", waves: 3, lootFloor: "uncommon", goldMult: 6, hpMult: 4 },
  { id: "scarlet", name: "The Crimson Abbey", minLevel: 30, icon: "⛪", color: "#a11", boss: "Champion Hadrok", waves: 4, lootFloor: "uncommon", goldMult: 8, hpMult: 4 },
  { id: "uldaman", name: "The Forgotten Vault", minLevel: 40, icon: "🏛️", color: "#b8860b", boss: "Stoneguard Aurok", waves: 5, lootFloor: "rare", goldMult: 10, hpMult: 4 },
  { id: "blackrock", name: "The Ember Deeps", minLevel: 50, icon: "🔥", color: "var(--rubric)", boss: "Emperor Vorgath", waves: 6, lootFloor: "rare", goldMult: 14, hpMult: 4 },
  { id: "stratholme", name: "The Cursed City", minLevel: 56, icon: "💀", color: "#3a5a2a", boss: "Baron Morthane", waves: 7, lootFloor: "epic", goldMult: 18, hpMult: 4 },
];

// ---------- RAIDS (endgame, ilvl-gated, 24h lockout) ----------
const RAIDS = [
  { id: "moltencore", name: "The Molten Heart", icon: "🌋", color: "#ff4500", boss: "Ignaroth the Flamelord", waves: 8, goldMult: 28, minLevel: 60, reqIlvl: 60, raid: true, hpMult: 4,
    enemies: ["Lava Surger", "Molten Giant", "Magma Hound", "Flame Sentinel", "Fire Drake", "Cinder Fiend", "Ancient Salamander"],
    desc: "Descend into the fiery heart of the mountain to face Ignaroth the Flamelord." },
];
const RAID_COOLDOWN = 24 * 3600000; // 24 hours

// ---------- DUNGEON DIFFICULTY RAMP ----------
// A run used to be flat: wave 1 and wave 5 were the same fight with a different number on the log
// line, and every wave paid the same. One function decides how much harder a wave is than the
// first, and BOTH the enemy and the payout key off it — so a wave that is 70% harder is also worth
// 70% more, automatically, and the shape can be retuned in one place without the two drifting.
//
// ACCELERATING, not linear. Early waves are close to free and the last two bite, so a run feels
// like it is closing in on something rather than repeating itself. The exponent is what makes a
// SHORT dungeon stay gentle without needing its own rule: the same curve that ends a 7-wave run at
// x1.85 only reaches x1.23 by the end of a 3-wave one, because the ramp compounds with depth
// rather than with a flat per-wave step.
const DUNGEON_RAMP = {
  perWave: 0.04,   // scale on the accelerating term
  curve: 1.6,      // >1 back-loads the difficulty; 1.0 would be plain linear
  bossBonus: 0.0,  // the boss already carries its own hpMult and rank; no extra ramp on top
};
// How many pieces the final boss of an instance drops. This is now the ENTIRE gear yield of a run,
// since trash pays gold and XP only, so it is a fixed count rather than a coin flip.
const DUNGEON_BOSS_DROPS = 2;
// `wave` is 1-based and the boss arrives at waves + 1, in BOTH normal and Hard Mode.
const dungeonWaveScale = (wave, waves) => {
  const w = Math.max(1, Math.min(wave || 1, (waves || 1) + 1));
  return 1 + DUNGEON_RAMP.perWave * Math.pow(w - 1, DUNGEON_RAMP.curve)
           + (w > (waves || 1) ? DUNGEON_RAMP.bossBonus : 0);
};
const instanceById = (id) => DUNGEONS.find((d) => d.id === id) || RAIDS.find((r) => r.id === id);

// ---------- HARD MODE (endgame progression) ----------
// Extreme-difficulty zones (kill-goal grinds) and dungeons (10-boss-kill grinds), gated by average ilvl
// and prior completion. Gear ilvl 64→65 is a modest step; 64→71 is a huge jump — a long retention arc.
const HARD_ZONES = [
  { id: "hz_green",  base: "elwynn",        name: "Greenhollow Wood",    icon: "🌲", reqIlvl: 64, dropIlvl: 65, killGoal: 1250,  prev: null,       enemyLvl: 62 },
  { id: "hz_brack",  base: "westfall",      name: "Brackenfield Plains", icon: "🌾", reqIlvl: 65, dropIlvl: 66, killGoal: 1875,  prev: "hz_green", enemyLvl: 64 },
  { id: "hz_gloom",  base: "duskwood",      name: "Gloomwood",           icon: "🕸️", reqIlvl: 66, dropIlvl: 67, killGoal: 2500, prev: "hz_brack", enemyLvl: 66 },
  { id: "hz_tangle", base: "stranglethorn", name: "Tanglevine Jungle",   icon: "🌴", reqIlvl: 67, dropIlvl: 68, killGoal: 3125, prev: "hz_gloom", enemyLvl: 68 },
  { id: "hz_ember",  base: "searing",       name: "Emberwaste Canyon",   icon: "🌋", reqIlvl: 68, dropIlvl: 69, killGoal: 3750, prev: "hz_tangle",enemyLvl: 70 },
  { id: "hz_blight", base: "plaguelands",   name: "The Blighted Marches",icon: "☠️", reqIlvl: 69, dropIlvl: 70, killGoal: 5000, prev: "hz_ember", enemyLvl: 72 },
];
// `waves` mirrors the normal-mode chain exactly: 3, 4, 5, 6, 7, and the raid at 8, counting TRASH
// only with the boss as an extra fight on top. Hard Mode used a flat 4 for every dungeon and 6 for
// the raid, so its five instances were the same length as each other and a different length from
// their normal-mode counterparts.
const HARD_DUNGEONS = [
  { id: "hd_deadmines",  base: "deadmines",  name: "The Sunken Mine",     icon: "⚓", boss: "Bandit Lord Garrick", dropIlvl: 65, reqIlvl: 65, prevBoss: null, prevZone: null, enemyLvl: 63, waves: 3 },
  { id: "hd_scarlet",    base: "scarlet",    name: "The Crimson Abbey",   icon: "⛪", boss: "Champion Hadrok",     dropIlvl: 66, prevBoss: "Bandit Lord Garrick", prevZone: "hz_green", enemyLvl: 65, waves: 4 },
  { id: "hd_uldaman",    base: "uldaman",    name: "The Forgotten Vault", icon: "🏛️", boss: "Stoneguard Aurok",    dropIlvl: 67, prevBoss: "Champion Hadrok", prevZone: "hz_brack", enemyLvl: 66, waves: 5 },
  { id: "hd_blackrock",  base: "blackrock",  name: "The Ember Deeps",     icon: "🔥", boss: "Emperor Vorgath",     dropIlvl: 68, prevBoss: "Stoneguard Aurok", prevZone: "hz_gloom", enemyLvl: 67, waves: 6 },
  { id: "hd_stratholme", base: "stratholme", name: "The Cursed City",     icon: "💀", boss: "Baron Morthane",      dropIlvl: 69, prevBoss: "Emperor Vorgath", prevZone: "hz_tangle", enemyLvl: 68, completeCount: 10, waves: 7 },
];
const HARD_RAID = { id: "hr_moltencore", base: "moltencore", name: "The Molten Heart", icon: "🌋", boss: "Ignaroth the Flamelord", dropIlvl: 71, enemyLvl: 72, waves: 8 };
const HARD_BOSS_REQ = 10; // boss kills to unlock the next hard dungeon

// ---------- THE ABYSS (endless solo endgame) ----------
// One endless zone, entered at whatever + rank you have unlocked. There is no chain of instances
// here: the ladder IS the content, and a rank is "completed" by a kill goal exactly as a Hard zone
// is, which is what unlocks the next +.
//
// It opens only after Hard Mode is finished — the Molten Heart cleared — because it is tuned for
// the gear that fight drops and nothing below it stands a chance.
//
// SCALING. Each + multiplies enemy health and offence and adds to their effective stat level, so
// power grows along the same curve levelling does rather than as a flat number bolted on. The
// multipliers are MEASURED against the gating requirements, not chosen — see abyss-tuning.cjs.
const ABYSS = {
  maxPlus: 10,
  reqIlvl: 71,            // Hard raid gear or better
  dropIlvl: 71,
  killsPerDrop: 150,      // one piece every 150 kills, on average
  legendaryChance: 0.05,  // the other 95% are epic
  enemyLvl: 74,
  killGoal: 2000,         // kills to complete a rank and unlock the next +
  // Per + rank. Health and damage compound; the level bonus is additive because that is how the
  // tier table already expresses "these things are simply further up the curve".
  hpPerPlus: 1.18,
  offPerPlus: 1.10,
  lvlPerPlus: 1,
  // What a + rank is worth to the player, beyond the fight being harder.
  goldPerPlus: 0.35,      // +35% gold a kill, per rank
  xpPerPlus: 0.25,
  // SECONDARY STAT RANGE. The headline of the whole system: a line that caps at 24 on Hard rolls
  // up to 35 at Abyss +5. 24 x (1 + 0.09 x 5) = 34.8. At +10 a line rolls to 1.9x its Hard value.
  statPerPlus: 0.09,
};
// The multiplier a piece of gear carries for the rank it dropped in. Stored ON the item, so a
// reroll at the Forge years later still rolls into the range the item was born with.
const abyssStatMult = (plus) => 1 + ABYSS.statPerPlus * Math.max(0, Math.min(ABYSS.maxPlus, plus || 0));
const abyssRec = (c) => (c && c.abyss) || { plus: 0, unlocked: 0, kills: {} };
const abyssPlus = (c) => Math.max(0, Math.min(ABYSS.maxPlus, abyssRec(c).plus || 0));
const abyssUnlocked = (c) => Math.max(0, Math.min(ABYSS.maxPlus, abyssRec(c).unlocked || 0));
const abyssKills = (c, plus) => ((abyssRec(c).kills || {})[plus] || 0);
const abyssRankDone = (c, plus) => abyssKills(c, plus) >= ABYSS.killGoal;
// Hard Mode is finished when its raid boss has fallen. That is the gate.
// "Abyss" for the base rank, "Abyss +7" above it. One definition, used by the tooltip, the log and
// the shop, so the three cannot disagree about what a piece is called.
const abyssLabel = (plus) => (plus ? `Abyss +${plus}` : "Abyss");
const abyssOpen = (c) => (((c && c.hardBossKills) || {})["Ignaroth the Flamelord"] || 0) > 0;

const hardZoneById = (id) => HARD_ZONES.find((z) => z.id === id);
const hardDungeonById = (id) => HARD_DUNGEONS.find((d) => d.id === id);
const hardZoneUnlocked = (c, avgIlvl, hz) => avgIlvl >= hz.reqIlvl && (!hz.prev || !!c.hardZoneDone?.[hz.prev]);
// A hard dungeon needs: the ilvl floor (entry dungeon only), HARD_BOSS_REQ kills of the previous
// dungeon's boss, AND completion of the hard zone that precedes it in the chain.
const hardDungeonUnlocked = (c, avgIlvl, hd) => (hd.reqIlvl ? avgIlvl >= hd.reqIlvl : true) && (!hd.prevBoss || (c.hardBossKills?.[hd.prevBoss] || 0) >= HARD_BOSS_REQ) && (!hd.prevZone || !!c.hardZoneDone?.[hd.prevZone]);
const hardRaidUnlocked = (c) => (c.hardBossKills?.["Baron Morthane"] || 0) >= HARD_BOSS_REQ && !!c.hardZoneDone?.["hz_blight"];

// A single themed drop per enemy type — reserved for the upcoming quest & town-building systems.
const ENEMY_DROPS = {
  // Greenhollow Wood
  "Goblin": { id: "goblinBone", name: "Goblin Bone", icon: "🦴", color: "#c9b98a" },
  "Bandit": { id: "silk", name: "Silk", icon: "🧵", color: "#d98fb0" },
  "Forest Spider": { id: "spiderVenom", name: "Spider Venom", icon: "🕷️", color: "#6fbf6f" },
  "Bullywug": { id: "frogSlime", name: "Frog Slime", icon: "🐸", color: "#7fc46f" },
  // Brackenfield Plains
  "Highway Thug": { id: "wornLeather", name: "Worn Leather", icon: "🧥", color: "#a9784a" },
  "Dust Devil": { id: "dustMote", name: "Dust Mote", icon: "🌪️", color: "#cbb98a" },
  "Scarecrow Golem": { id: "strawBundle", name: "Straw Bundle", icon: "🌾", color: "#d9c26a" },
  "Gnoll Raider": { id: "gnollFang", name: "Gnoll Fang", icon: "🐺", color: "#b0996a" },
  // Gloomwood
  "Skeleton": { id: "crackedBone", name: "Cracked Bone", icon: "☠️", color: "#e0ddc9" },
  "Dire Wolf": { id: "wolfPelt", name: "Wolf Pelt", icon: "🐺", color: "#8a8a8a" },
  "Dark Rider": { id: "shadowCloth", name: "Shadow Cloth", icon: "🌑", color: "#6a6588" },
  "Giant Spider": { id: "giantChitin", name: "Giant Chitin", icon: "🕸️", color: "#8a7aac" },
  // Tanglevine Jungle
  "Jungle Troll": { id: "trollHide", name: "Troll Hide", icon: "🟢", color: "#5fa85f" },
  "Goblin Raider": { id: "scrapMetal", name: "Scrap Metal", icon: "🔩", color: "#9aa0a6" },
  "Raptor": { id: "raptorClaw", name: "Raptor Claw", icon: "🦖", color: "#8fbf6f" },
  "Panther": { id: "sleekPelt", name: "Sleek Pelt", icon: "🐆", color: "#5a5a6a" },
  // Emberwaste Canyon
  "Ash Dwarf": { id: "cinderDust", name: "Cinder Dust", icon: "⚒️", color: "#a05a3a" },
  "Fire Elemental": { id: "elementalEmber", name: "Elemental Ember", icon: "🔥", color: "#ff7a3a" },
  "Lava Spawn": { id: "lavaRock", name: "Lava Rock", icon: "🪨", color: "#c0502a" },
  "Fire Ogre": { id: "charredHide", name: "Charred Hide", icon: "🍖", color: "#8a4a2a" },
  // The Blighted Marches
  "Plague Ghoul": { id: "rottingFlesh", name: "Rotting Flesh", icon: "🧟", color: "#7a9a5a" },
  "Risen Warrior": { id: "rustedBlade", name: "Rusted Blade", icon: "⚔️", color: "#9a7a5a" },
  "Plague Bat": { id: "batWing", name: "Bat Wing", icon: "🦇", color: "#7a6a8a" },
  "Wraith": { id: "ectoplasm", name: "Ectoplasm", icon: "👻", color: "#9fe0d0" },
  // The Molten Heart (raid)
  "Lava Surger": { id: "surgingEmber", name: "Surging Ember", icon: "🔥", color: "#ff5a2a" },
  "Molten Giant": { id: "moltenFragment", name: "Molten Fragment", icon: "🌋", color: "#e0602a" },
  "Magma Hound": { id: "magmaFang", name: "Magma Fang", icon: "🦷", color: "#d05a3a" },
  "Flame Sentinel": { id: "sentinelCore", name: "Sentinel Core", icon: "🟠", color: "#ffa54a" },
  "Fire Drake": { id: "drakeScale", name: "Drake Scale", icon: "🐉", color: "#c0402a" },
  "Cinder Fiend": { id: "cinderAsh", name: "Cinder Ash", icon: "🌑", color: "#8a5a4a" },
  "Ancient Salamander": { id: "salamanderHide", name: "Salamander Hide", icon: "🦎", color: "#b0703a" },
};
const DROP_BY_ID = Object.fromEntries(Object.values(ENEMY_DROPS).map((d) => [d.id, d]));
// resolve an enemy's drop by name; longest match first so "Goblin Raider" beats "Goblin" for champion variants
const ENEMY_DROP_KEYS = Object.keys(ENEMY_DROPS).sort((a, b) => b.length - a.length);
const dropForEnemy = (enemy) => {
  if (!enemy || enemy.isMimic) return null;
  if (ENEMY_DROPS[enemy.name]) return ENEMY_DROPS[enemy.name];
  const key = ENEMY_DROP_KEYS.find((k) => enemy.name.includes(k));
  return key ? ENEMY_DROPS[key] : null;
};
// canonical enemy-type name (folds champion/boss variants back to the base type); null for mimics/unknown
const enemyTypeName = (enemy) => {
  if (!enemy || enemy.isMimic) return null;
  if (ENEMY_DROPS[enemy.name]) return enemy.name;
  return ENEMY_DROP_KEYS.find((k) => enemy.name.includes(k)) || null;
};

// ---------- BESTIARY ----------
// Short lore for every enemy type; the Bestiary reveals an entry once the player has slain one.
const ENEMY_LORE = {
  "Goblin": "Small, greedy scavengers that swarm the woodland fringes, stealing anything shiny and biting anything slow.",
  "Bandit": "Desperate outlaws who prey on travelers along the old roads, hiding their loot beneath silken cloaks.",
  "Forest Spider": "Ambush hunters that string the canopy with venomous silk and drop on the unwary.",
  "Bullywug": "Marsh-dwelling frog-folk, territorial and quick to croak an alarm before their kin descend.",
  "Highway Thug": "Hardened robbers of the plains who favor blunt clubs and blunter manners.",
  "Dust Devil": "A whirling elemental born of parched wind, scouring the fields into barren dust.",
  "Scarecrow Golem": "Once a farmer's ward against crows, now animated by lingering field-magic gone sour.",
  "Gnoll Raider": "Hyena-kin marauders that hunt in cackling packs, driven by hunger and spite.",
  "Skeleton": "Restless bones raised by the curse that blankets Gloomwood, clattering ever forward.",
  "Dire Wolf": "Enormous pack predators whose howls freeze the blood of lone travelers.",
  "Dark Rider": "Silent horsemen cloaked in shadow, said to be the curse's grim messengers.",
  "Giant Spider": "A monstrous weaver whose webs span whole ravines and whose bite fells an ox.",
  "Jungle Troll": "Towering, regenerating brutes that guard the deep jungle with bone clubs and tusked grins.",
  "Goblin Raider": "Better-armed cousins of the woodland goblins, plundering ruins for scrap and relics.",
  "Raptor": "Swift pack-hunting reptiles with sickle claws and an appetite for anything warm.",
  "Panther": "Sleek jungle stalkers that strike from shadow and vanish before the body falls.",
  "Ash Dwarf": "Exiles who dwell in the volcanic wastes, their skin blackened by centuries of forge-smoke.",
  "Fire Elemental": "A living flame given form and fury, drawn to anything that will burn.",
  "Lava Spawn": "Molten creatures that ooze from cracks in the canyon floor, cooling into rock when slain.",
  "Fire Ogre": "Hulking brutes whose hides have hardened to charred plates in the endless heat.",
  "Plague Ghoul": "A shambling husk consumed by the blight, spreading rot with every clawing touch.",
  "Risen Warrior": "Fallen soldiers dragged back from death, still clutching their rusted blades.",
  "Plague Bat": "Diseased fliers that roost in the ruined towers of the marches, carrying sickness on their wings.",
  "Wraith": "A vengeful spirit bound to the blight, its wail draining warmth and hope alike.",
  "Lava Surger": "A tide of living magma that surges through the Molten Heart's arteries.",
  "Molten Giant": "A colossus of half-cooled stone and fire, each footfall cracking the cavern floor.",
  "Magma Hound": "Blazing beasts that hunt the deep tunnels in molten packs.",
  "Flame Sentinel": "Ancient guardians forged to defend the mountain's fiery core.",
  "Fire Drake": "Lesser dragonkin wreathed in flame, circling the heart of the volcano.",
  "Cinder Fiend": "Malicious sparks of the deep fire, coalesced into gleeful, burning malice.",
  "Ancient Salamander": "A primordial beast that has basked in the mountain's heart since the world was young.",
};
// ordered enemy roster with their home region, for the Bestiary
const ALL_ENEMY_TYPES = (() => {
  const out = []; const seen = new Set();
  for (const z of ZONES) for (const n of z.enemies) if (!seen.has(n)) { seen.add(n); out.push({ name: n, origin: z.name, minLevel: z.minLevel, maxLevel: z.maxLevel, color: z.color }); }
  for (const r of RAIDS) for (const n of (r.enemies || [])) if (!seen.has(n)) { seen.add(n); out.push({ name: n, origin: r.name, minLevel: r.minLevel, maxLevel: r.minLevel, color: r.color }); }
  return out;
})();
const enemyRepHp = (level) => level * 26 + 50; // representative HP at a given level (matches makeEnemy base)

// ---------- QUESTS ----------
const BOARD_QUEST_SLOTS = 4;
// minimal XP + greatly reduced gold for a repeatable board quest (gold no longer scales with count)
const boardQuestReward = (level, count) => ({ xp: Math.max(15, Math.floor(xpForLevel(level) * 0.01)), gold: Math.max(3, Math.floor(level * 2.5)) });
const rollBoardQuest = (c, zoneId) => {
  const z = zoneId && zoneId !== "any" ? ZONES.find((zz) => zz.id === zoneId) : null;
  const zoneEnemies = z && z.enemies && z.enemies.length ? z.enemies : null;
  const lvl = c.level || 1;
  const kind = Math.random() < 0.55 ? "kill" : "collect";
  if (kind === "kill") {
    const encountered = Object.keys(c.killsByType || {});
    const pool = zoneEnemies || (encountered.length ? encountered : ["Goblin", "Bandit", "Forest Spider", "Bullywug"]);
    const targetName = pick(pool);
    const count = 35 + Math.floor(lvl * 2.5) + Math.floor(Math.random() * 25); // large kill requirement
    return { id: uid(), kind: "kill", target: targetName, count, baseline: (c.killsByType?.[targetName] || 0), reward: boardQuestReward(lvl, count) };
  }
  const base = zoneEnemies || Object.keys(c.killsByType || {});
  const collectPool = base.filter((k) => ENEMY_DROPS[k]);
  const pool = collectPool.length ? collectPool : Object.keys(ENEMY_DROPS);
  const targetName = pick(pool);
  const drop = ENEMY_DROPS[targetName];
  const count = 15 + Math.floor(lvl * 1.2) + Math.floor(Math.random() * 15); // large collect requirement
  return { id: uid(), kind: "collect", target: drop.id, targetName, count, reward: boardQuestReward(lvl, count) };
};
const questProgress = (c, q) => {
  if (q.kind === "kill") return Math.min(q.count, Math.max(0, (c.killsByType?.[q.target] || 0) - (q.baseline || 0)));
  return Math.min(q.count, c.drops?.[q.target] || 0);
};
const questLabel = (q) => q.kind === "kill" ? `Slay ${q.count} ${q.target}` : `Collect ${q.count} ${DROP_BY_ID[q.target]?.name || q.targetName}`;

// ---------- STORY (Tavern Hall) — framework; chapters to be written ----------
const STORY_QUESTS = [
  { id: "ch1", chapter: 1, title: "Whispers in Greenhollow", teaser: "Something stirs in the woodland dark. The innkeeper has heard rumors…", status: "coming_soon", reward: { xp: 0, items: 0 } },
  { id: "ch2", chapter: 2, title: "The Blighted Road", teaser: "A caravan never reached Brackenfield. Its fate is bound to a deeper rot.", status: "locked", reward: { xp: 0, items: 0 } },
  { id: "ch3", chapter: 3, title: "Embers of the Old War", teaser: "The volcano remembers a war the world has forgotten.", status: "locked", reward: { xp: 0, items: 0 } },
];

// ---------- LESSONS — one per system, gated by level, spanning the whole of 1-60 ----------
//
// A 704-playthrough sweep of 1-60 (game-core/levelling-sim.cjs) found that the levelling game
// teaches almost nothing Hard Mode then demands:
//
//   * ZERO deaths in 176 playthroughs across all 22 specs with the ordinary kit.
//   * Levelling the whole way in STARTER GEAR costs 0.9 hours and still never kills you, so
//     nothing on the road to 60 establishes that item level matters.
//   * Never buying the rotation is 2.6x slower and still never fatal, so it reads as a preference.
//   * The one genuinely mandatory purchase — the auto-potion upgrade — is unmarked. Without it a
//     parked character walls at level 39 and 0 of 176 runs reach 60.
//
// So the tutorial is no longer six steps ending at level 6. Each system a player must understand
// before Hard Mode has a lesson, it unlocks at the level that system does, and it has to be
// completed. `level` is the gate; `highlight` flashes that building on the town map.
//
// Being flagged for a new lesson RETREATS the player from solo combat (see the effect that watches
// activeLesson) so the interruption never costs them a death.
const LESSONS = [
  // --- the opening six: unchanged behaviour, now carrying an explicit level gate ---------------
  { id: "fight", level: 1, title: "First Blood", body: "Tap the flashing ⚔️ Adventure Gate, then defeat a monster in the wilds.", highlight: "world", forLevel: 1, done: (c) => (c.kills || 0) >= 1 },
  { id: "shop", level: 1, title: "Stock the Pack", body: "Visit the flashing 🏪 Market, enter the Vendor, and browse the shop.", highlight: "market", forLevel: 0, reward: { heal: 10 }, done: (c) => !!c.tutorial?.visitedVendor || !!c.seen?.vendor },
  { id: "gear", level: 2, title: "Gear Up", body: "Open the flashing 🏦 Bank and equip the white gear to upgrade a gray piece.", highlight: "bag", forLevel: 2, done: (c) => !!c.tutorial?.equipped },
  { id: "hunt", level: 3, title: "Cull the Beasts", body: "Return to the ⚔️ Adventure Gate and defeat 5 monsters.", highlight: "world", forLevel: 3, done: (c) => (c.kills || 0) >= 5 },
  { id: "trade", level: 4, title: "Learn a Trade", body: "Enter the flashing ⚒️ Crafting Hall and begin gathering with a profession.", highlight: "prof", forLevel: 4, done: (c) => Object.values(c.professions || {}).some((p) => p && p.active) },
  { id: "bounty", level: 5, title: "Bounty Hunter", body: "Visit the flashing 🍺 Tavern and open the Quest Board to take a bounty.", highlight: "quests", forLevel: 5, done: (c) => !!c.tutorial?.visitedBoard || !!c.seen?.questboard },

  // --- staying alive. The measured difference between finishing and walling at 39 ---------------
  { id: "potion", level: 6, title: "Field Medicine", body: "Drink a Healing Potion. Open 🎒 the Bank's Items tab and use one — health does not come back on its own.", highlight: "bag", done: (c) => !!c.tutorial?.drankPotion },
  { id: "autopot", level: 7, title: "The Draught Belt", body: "Buy the Draught Belt from the 🏪 Market's Vendor, under Permanent Upgrades. It drinks for you at 15% health — the last line before you fall, under anything your own gambits do. A parked hero without one stops progressing entirely.", highlight: "market", done: (c) => !!c.upgrades?.autoPotion },

  // --- fighting properly ------------------------------------------------------------------------
  { id: "skills", level: 8, title: "Know Your Kit", body: "Open the flashing 🗿 Hero\u2019s Statue and look over your Ability Slots. Which five you carry is the whole of your damage — tap a skill to slot it.", highlight: "hero", done: (c) => !!c.seen?.hero },
  // "Muscle Memory" stood here and asked the player to buy an Auto-Skill from a trainer. There is no
  // trainer: that system was removed when automation became gambits-only, and its handlers were left
  // uncalled, so the lesson could NEVER complete. Since activeLesson serves the earliest unfinished
  // lesson, it walled the tutorial — a player who did everything the UI allows finished 9 of 30 and
  // was stuck here forever. There is nothing to teach at level 9; automation arrives with gambits at
  // 20 and has its own lesson there.
  { id: "spec", level: 10, title: "Choose a Path", body: "Visit the flashing ⛪ Class Hall and pick a Specialization. It grants three signature skills and reshapes how you fight.", highlight: "classhall", done: (c) => !!c.spec },
  { id: "talent", level: 11, title: "The First Talent", body: "Open the flashing 🎓 Class Hall, choose \u{1F31F} Talents, and spend your point. New rows open at 20, 30, 40 and 50.", highlight: "classhall", done: (c) => !!(c.talents || {})[10] || !!c.talentTutorialDone },
  { id: "attrs", level: 12, title: "Raw Potential", body: "Spend an attribute point at the 🗿 Hero's Statue. Points are yours to place every level.", highlight: "hero", done: (c) => Object.values(c.allocated || {}).some((v) => v > 0) },

  // --- the economy ------------------------------------------------------------------------------
  { id: "auction", level: () => AH_ECON.unlockLevel, title: "The Trading Floor", body: "The 🏛️ Auction House is open. Visit it — gear you cannot use is worth more to another player than to a vendor.", highlight: "auction", done: (c) => !!c.seen?.auction },
  { id: "dungeon", level: 15, title: "Into the Dark", body: "Run a Dungeon from the ⚔️ Adventure Gate. Bosses drop the gear the open world will not.", highlight: "world", done: (c) => (c.dungeonClears || 0) >= 1 },
  { id: "salvage", level: 17, title: "Nothing Wasted", body: "Open the \u2692\uFE0F Crafting Hall and tap your Salvage profession. Break down a piece you will never wear.", highlight: "prof", done: (c) => !!c.seen?.salvage },
  { id: "gems", level: 18, title: "Set in Stone", body: "Open the 🏦 Bank's Gems tab. Sockets turn a good piece into your best one.", highlight: "bag", done: (c) => !!c.seen?.bag && !!c.seen?.gems },

  // --- automation and depth ---------------------------------------------------------------------
  { id: "gambit", level: () => GAMBIT_UNLOCK_LEVEL, title: "Standing Orders", body: "Gambits are open — and they are the ONLY thing that casts a skill without you tapping it. Open the \u{1F6E1}\uFE0F Armory, tap Equip Gambits, and set a rule (or press Auto Gambit). Buy more at the \u{1F3EA} Market\u2019s Gambit Shop.", highlight: "gear", done: (c) => !!c.seen?.gambits || !!c.seen?.gambitshop },
  { id: "town", level: 22, title: "Build the Town", body: "Open the \u{1F37A} Tavern and choose City Management. Town buildings pay a permanent bonus to everything you do.", highlight: "quests", done: (c) => !!c.seen?.citymgmt },
  { id: "craft", level: 24, title: "The Anvil", body: "Craft a piece of armour in the ⚒️ Crafting Hall's Forge, using ore you have mined.", highlight: "prof", done: (c) => !!c.seen?.forge },
  { id: "brew", level: 26, title: "Better Draughts", body: "Visit the ⚒️ Crafting Hall's Brewery. Stronger potions are the difference in a long fight.", highlight: "prof", done: (c) => !!c.seen?.brewery },
  { id: "enchant", level: 30, title: "Bound in Runes", body: "Open the \u2692\uFE0F Crafting Hall and tap your Enchanting profession. Put an enchant on a piece you intend to keep.", highlight: "prof", done: (c) => !!c.seen?.enchanting },
  { id: "bestiary", level: 32, title: "Know the Enemy", body: "Open the Bestiary in the 🍺 Tavern. What you have killed is recorded, and what it drops with it.", highlight: "quests", done: (c) => !!c.seen?.bestiary },
  { id: "skillmod", level: 35, title: "Reshape a Skill", body: "Visit the ⛪ Class Hall's Skill Mods and change what one of your abilities does.", highlight: "classhall", done: (c) => !!c.seen?.skillmods },
  { id: "temper", level: 38, title: "The Forge Heat", body: "Visit the 🏪 Market's Tempering Forge. Every failure raises the next attempt until the rank is guaranteed — read the odds before you spend.", highlight: "market", done: (c) => !!c.seen?.temper },

  // --- other people. Visiting only: none of these lessons queues the player for anything. -------
  { id: "guild", level: 40, title: "Not Alone", body: "Run the Training Delve at 🏛️ The Guild. A practice party of four, no lockout and nothing at stake — learn to interrupt, hold a role and survive a boss before a real group depends on you.", highlight: "guild", done: (c) => !!c.tutorial?.delveCleared },
  { id: "arena", level: 45, title: "The Sands", body: "Fight a Practice Duel at the ⚔️ Arena. An unranked bout against a training partner — nothing is recorded, win or lose.", highlight: "arena", done: (c) => !!c.tutorial?.duelDone },
  { id: "mail", level: 48, title: "The Courier", body: "Tap the \u{1F4EC} Mail button in the bottom bar \u2014 it is there from any screen, not inside a building. Auction sales and overflow from a full bank arrive here.", highlight: null, done: (c) => !!c.seen?.mail },

  // --- the handover to Hard Mode ------------------------------------------------------------------
  { id: "supply", level: 52, title: "Lay In Supplies", body: "Open the \u{1F3EA} Market and visit the Supply Master \u2014 bottles, flasks and blank scrolls. Consumables are no longer optional from here on.", highlight: "market", done: (c) => !!c.seen?.supply },
  { id: "hardprep", level: 58, title: "Before the Threshold", body: "Hard Mode judges item level, your rotation and your potions — all three. Check your 🛡️ Armory and make sure every slot is filled before you cross.", highlight: "gear", done: (c) => !!c.seen?.gear && (c.level || 1) >= 59 },
];
// Kept as the old name so nothing that referenced the opening run breaks.
const TUTORIAL_STEPS = LESSONS;
const COMBAT_TUTORIAL_IDS = ["fight", "hunt", "dungeon"]; // lessons that progress through combat
// The lowest-level lesson the player has unlocked and not finished. Level gates it, so a lesson for
// a system that is still locked never appears — and a player who levels past several at once is
// walked through them in order rather than having them silently skipped.
const lessonDone = (c, l) => !!((c.tutorial || {}).doneIds || {})[l.id];
// A gate may be a function so it can read a constant declared further down this file rather than
// restating the number. Duplicated constants drifting apart is the bug this codebase keeps finding.
const lessonLevel = (l) => (typeof l.level === "function" ? l.level() : l.level);
const activeLesson = (c) => {
  if (!c) return null;
  const lvl = c.level || 1;
  return LESSONS.find((l) => lessonLevel(l) <= lvl && !lessonDone(c, l)) || null;
};
const lessonsComplete = (c) => LESSONS.filter((l) => lessonDone(c, l)).length;
const tutorialStep = activeLesson;
const tutorialHighlight = (c) => { const s = activeLesson(c); return s ? s.highlight : null; };


// ---------- PROFESSIONS ----------

const PROF_MAX = 100;

// Ore tiers: unlock by Mining rank, each maps to a crafting rarity distribution.
const ORE_TIERS = [
  { id: "copper", name: "Copper Ore", node: "Copper Vein", icon: "🟤", color: "#b87333", unlock: 1, craft: { common: 80, uncommon: 20 } },
  { id: "tin", name: "Tin Ore", node: "Tin Seam", icon: "⚪", color: "#cfcfcf", unlock: 12, craft: { common: 60, uncommon: 40 } },
  { id: "iron", name: "Iron Ore", node: "Iron Deposit", icon: "⚙️", color: "#8a8a8a", unlock: 24, craft: { common: 40, uncommon: 45, rare: 15 } },
  { id: "silver", name: "Silver Ore", node: "Silver Lode", icon: "🔩", color: "#cfd8e8", unlock: 36, craft: { uncommon: 60, rare: 40 } },
  { id: "gold", name: "Gold Ore", node: "Gold Vein", icon: "🟡", color: "var(--gilt)", unlock: 48, craft: { uncommon: 35, rare: 50, epic: 15 } },
  { id: "mithril", name: "Mithril Ore", node: "Mithril Deposit", icon: "🔷", color: "#5fa8d3", unlock: 60, craft: { rare: 60, epic: 40 } },
  { id: "truesilver", name: "Truesilver Ore", node: "Truesilver Lode", icon: "💠", color: "#7ee0e0", unlock: 72, craft: { rare: 35, epic: 65 } },
  { id: "adamant", name: "Adamantite Ore", node: "Adamant Cluster", icon: "🟢", color: "#3fbf6f", unlock: 84, craft: { rare: 10, epic: 90 } },
  { id: "crystalline", name: "Crystalline Ore", node: "Crystalline Ore", icon: "💎", color: "#c08bff", unlock: 999, craft: { epic: 90, legendary: 10 } },
];
const oreTierById = (id) => ORE_TIERS.find((o) => o.id === id);
const oreTierIndex = (id) => ORE_TIERS.findIndex((o) => o.id === id);
const highestOreTierIdx = (miningLevel) => { let idx = 0; for (let i = 0; i < ORE_TIERS.length; i++) if ((miningLevel || 1) >= ORE_TIERS[i].unlock) idx = i; return idx; };
const oreCraftCost = (tierIdx) => 4 + tierIdx * 4;   // ore units required (strict, grows with tier)
const oreGoldCost = (tierIdx) => 40 + tierIdx * 70;  // gold cost grows with tier
const craftIlvl = (armorLevel, tierIdx) => Math.max(1, Math.min(63, Math.round((armorLevel || 1) * 0.45) + tierIdx * 3)); // ilvl from armorsmith rank + ore tier; maxes at 63

// ---------- SOULS: hard-mode crafting reagents ----------
// Armorsmithing stopped at ilvl 63, which is exactly where Hard Mode begins — so the moment a
// player reached the content the profession was aimed at, the profession stopped mattering. A Soul
// is a hard-mode-only reagent that raises a craft to that zone's item level.
//
// The point is TARGETED gear. Hard mode drops two random pieces a boss, so the slot that refuses to
// appear is the whole frustration; forge already lets you choose the slot, so a Soul turns crafting
// into the answer to bad luck rather than a second, worse loot table.
//
// Crafted gear is ACCOUNT BOUND. At the new power-based auction prices a craftable ilvl-70 piece
// would be a gold faucet, and binding is also what keeps this a catch-up mechanic rather than a
// business. ah_post_gear in supabase/migrations already refuses to list a bound item, so the server
// enforces it too — the client is not the only thing standing in the way.
const SOULS = [
  { id: "soul_green",  name: "Soul of Greenhollow",       icon: "🌲", zone: "hz_green",  dungeon: "hd_deadmines",  ilvl: 65, color: "#6fbf6f" },
  { id: "soul_brack",  name: "Soul of Brackenfield",      icon: "🌾", zone: "hz_brack",  dungeon: "hd_scarlet",    ilvl: 66, color: "#d8c06a" },
  { id: "soul_gloom",  name: "Soul of Gloomwood",         icon: "🕸️", zone: "hz_gloom",  dungeon: "hd_uldaman",    ilvl: 67, color: "#9a8ab8" },
  { id: "soul_tangle", name: "Soul of Tanglevine",        icon: "🌴", zone: "hz_tangle", dungeon: "hd_blackrock",  ilvl: 68, color: "#5fae7a" },
  { id: "soul_ember",  name: "Soul of Emberwaste",        icon: "🌋", zone: "hz_ember",  dungeon: "hd_stratholme", ilvl: 69, color: "#e0703a" },
  { id: "soul_blight", name: "Soul of the Blighted Marches", icon: "☠️", zone: "hz_blight", dungeon: null,         ilvl: 70, color: "#8fbf6f" },
];
const soulById = (id) => SOULS.find((s) => s.id === id);
const soulForZone = (hardZoneId) => SOULS.find((s) => s.zone === hardZoneId);
const soulForDungeon = (hardDungeonId) => SOULS.find((s) => s.dungeon === hardDungeonId);
// Zone rate is per KILL and a hard zone is an endless grind, so it stays low. The dungeon rate is
// per CLEAR — a run is 4-8 fights behind a lockout — so at the 5% originally sketched a Soul would
// take ~20 clears while those same clears hand over 40 pieces of gear, making crafting strictly
// worse than farming. 20% puts a Soul at ~5 clears, which is a chase without being a wall.
const SOUL_ZONE_CHANCE = 0.005;
const SOUL_DUNGEON_CHANCE = 0.20;
// Souls are heavy: a craft costs the reagent plus top-tier ore and real gold.
const SOUL_CRAFT_GOLD = 25000;
// Herb tiers: unlock by Herbalism rank; each maps to a potion tier (0-6) that Alchemy can brew.
const HERB_TIERS = [
  { id: "bluepetal", name: "Bluepetal", node: "Bluepetal", icon: "🌸", color: "#7fb0e8", unlock: 1, ptier: 0 },
  { id: "sunblossom", name: "Sunblossom", node: "Sunblossom", icon: "🌼", color: "#ffd94a", unlock: 16, ptier: 1 },
  { id: "thornweed", name: "Thornweed", node: "Thornweed", icon: "🥀", color: "#c07a5a", unlock: 32, ptier: 2 },
  { id: "mossroot", name: "Mossroot", node: "Mossroot", icon: "🍀", color: "#6fbf6f", unlock: 48, ptier: 3 },
  { id: "wildvine", name: "Wildvine", node: "Wildvine", icon: "🌿", color: "#4f9f5f", unlock: 64, ptier: 4 },
  { id: "frostleaf", name: "Frostleaf", node: "Frostleaf", icon: "❄️", color: "#9fe0e0", unlock: 80, ptier: 5 },
  { id: "emberbloom", name: "Emberbloom", node: "Emberbloom", icon: "🔥", color: "#ff8a4a", unlock: 96, ptier: 6 },
];
const MAT_BY_ID = Object.fromEntries([...ORE_TIERS, ...HERB_TIERS].map((m) => [m.id, m]));
const GATHER_TIERS = { mining: ORE_TIERS, herbalism: HERB_TIERS };          // per-gatherer tier lists
const highestTierIdx = (tiers, lvl) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if ((lvl || 1) >= tiers[i].unlock) idx = i; return idx; };
const herbBrewCost = (ptier) => 3 + ptier * 2;       // herbs required to brew (grows with tier)
const potionGoldCost = (ptier) => 20 + ptier * 25;   // gold cost to brew, grows with tier
// "Dust of <stat>" — rare salvage byproducts that guarantee an enchant of that stat
const STAT_DUST_META = {
  str: { name: "Dust of Strength", icon: "🟥", color: "#C79C6E" },
  agi: { name: "Dust of Agility", icon: "🟩", color: "var(--verdigris)" },
  int: { name: "Dust of Intellect", icon: "🟦", color: "#69CCF0" },
  sta: { name: "Dust of Stamina", icon: "🟧", color: "#e0556a" },
  leech: { name: "Dust of Leech", icon: "🟪", color: "#b06fd6" },
  vers: { name: "Dust of Versatility", icon: "🔶", color: "#e0a955" },
  resil: { name: "Dust of Resilience", icon: "🟨", color: "#d6c86f" },
};
const ENCHANT_STATS = Object.keys(STAT_DUST_META);
const statDustId = (stat) => `dust_${stat}`;
const MATERIALS = {
  ...ORE_TIERS.reduce((m, o) => { m[o.id] = { name: o.name, icon: o.icon, color: o.color }; return m; }, {}),
  ...HERB_TIERS.reduce((m, h) => { m[h.id] = { name: h.name, icon: h.icon, color: h.color }; return m; }, {}),
  dust: { name: "Arcane Dust", icon: "✨", color: "#c08bff" },
  ...ENCHANT_STATS.reduce((m, s) => { m[statDustId(s)] = { name: STAT_DUST_META[s].name, icon: STAT_DUST_META[s].icon, color: STAT_DUST_META[s].color }; return m; }, {}),
};
const ARMOR_CRAFT_SLOTS = ["weapon", "head", "shoulder", "chest", "hands", "legs", "feet", "offhand", "trinket"];

// ---------- SKILLS (active abilities) ----------
// Skill effect model. A skill may carry any combination of:
//  mult (instant dmg), hits (multi-hit count), dot{Mult,Dur,Icon}, slow{Pct,Dur},
//  haste{Pct,Dur}, dodge{Pct,Dur}, healPct (instant), hot{Pct,Dur}, lifesteal, desc.


// ---------- SKILL TYPES (Physical scales with Strength · Magic scales with Intellect) ----------
// Physical skills scale from Strength/Agility; everything else is Magic (scales from Intellect).

 // everything not listed as Physical is Magic
const skillTypeLabel = (name) => skillType(name) === "physical" ? "Physical" : "Magic";


// ---------- SIGNATURE SKILLS (auto-granted by Specialization) ----------
// Each carries a `spec` tag; skillPool only surfaces it while that spec is active. unlockLevel 10
// matches SPEC_LEVEL. Same effect model as every other skill — the spec's *passive* (its old L60
// effect) supplies the identity; these three skills express its combat curve.


// ---------- CLASS RESOURCES ----------
// Every class runs on its own resource with its own generation rule and payoff. This is the backbone
// of class identity: two classes can both "deal damage", but they arrive there by different play
// patterns. Multiplayer-facing: each resource implies a distinct role contribution.
//   gen  — how the resource accrues
//   pay  — what spending it does


// Resource is volatile: every unit expires RES_DECAY_MS after it is generated unless spent, oldest
// first. 15s was chosen by simulation — it is the exact point where "spend on cooldown" retains
// ~92-99% of everything you generate, while anything longer adds no value and only enables hoarding.
// Net effect: you can plan a payoff around your spender's cooldown, but you cannot bank power.







 // hunter: each Mark raises your damage to that target
const SHARD_TICKS_PER = 3;       // warlock: DoT ticks needed per Soul Shard

// ---------- SKILL SLOTS & MULTICLASS (Class Hall) ----------

const MAX_SKILL_SLOTS = SKILL_SLOT_LEVELS.length;


// A signature skill (spec-tagged) is only visible while its Specialization is the active one.

// every class skill unlocks purely by reaching its level — the choice is which ones you slot


// Only skills actually slotted on your bar can be cast — Gambits must never fire an unequipped ability.
const equippedSkills = (char) => (char.selectedSkills || []).map((n) => skillByName(char, n)).filter(Boolean);
const isEquipped = (char, name) => (char.selectedSkills || []).includes(name);
// ---------- SKILL MODS (per-skill investment; points from leveling, minus milestone levels) ----------
const SKILL_MOD_CAP = 20;
const SKILL_MOD_BREAKS = [10, 20];         // an effect may be added at each breakpoint
              // +2% skill potency per point (minimal power; effects are the payoff)
const SKILL_MOD_EFFECTS = [
  { id: "ms_lifesteal", name: "Vampiric",   icon: "🩸", desc: "Heal for 25% of the damage this skill deals." },
  { id: "ms_stun",      name: "Concussive", icon: "💫", desc: "This skill stuns the target for 1s." },
  { id: "ms_slow",      name: "Crippling",  icon: "🐌", desc: "This skill slows the target 50% for 2s." },
  { id: "ms_cdr",       name: "Efficient",  icon: "⏱️", desc: "Reduce this skill's cooldown by 25%." },
  { id: "ms_crit",      name: "Deadly",     icon: "⚡", desc: "+25% critical strike chance for this skill." },
  { id: "ms_dodge",     name: "Evasive",    icon: "🌀", desc: "Gain +20% dodge for 3s when used (great on utility skills)." },
];
const skillModEffectById = (id) => SKILL_MOD_EFFECTS.find((e) => e.id === id);
const skillClassOf = (name) => { for (const cid in SKILLS) if ((SKILLS[cid] || []).some((s) => s.name === name)) return cid; return null; };
const modPointsInRange = (start, level) => { let c = 0; for (let n = start; n <= (level || 1); n++) if (n % 10 !== 0) c++; return c; }; // one point per level, excluding milestone (×10) levels
const primaryModTotal = (char) => modPointsInRange(5, char.level || 1);                            // class: levels 5–60

const skillModSpent = (char, clsId) => { let s = 0; const m = (char && char.skillMods) || {}; for (const n in m) if (skillClassOf(n) === clsId) s += (m[n].pts || 0); return s; };
const primaryModAvail = (char) => primaryModTotal(char) - skillModSpent(char, char.cls);





// ============================================================
// HELPERS
// ============================================================
// ---------- DETERMINISTIC CORE (Phase 0) ----------
// Ambient seeded RNG + injected clock so the combat core can run reproducibly — the foundation for the
// group encounter reducer AND the future authoritative server (client prediction must match server).
// _rng defaults to Math.random, so normal play is byte-for-byte unchanged; only code that runs a block
// under withRng()/a seed becomes deterministic.
// rng / makeRng / withRng / pick / rngPick / rngInt / makeClock all come from
// ../game-core/rng.mjs (imported above) — the same module the server ticks.





// XP per level. Retention-tuned shape (exponent 2.6): very fast early, moderate mid, longer
// late. LEVELING_SCALE compresses total 6→60 to ~5h of combat (tune this one number: lower =
// faster, e.g. 0.033 ≈ 2.5h, 0.132 ≈ 10h — assumes ~4–5s per kill at level-appropriate gear).
const LEVELING_SCALE = 0.066;
const xpForLevel = (lvl) => Math.max(10, Math.floor(15 * Math.pow(lvl, 2.6) * LEVELING_SCALE));
const MAX_LEVEL = 60;
// after level 60, surplus XP becomes Honor; each Honor level grants 1 attribute point.
// Anchored to the ORIGINAL level-60 cost so faster leveling doesn't also speed up Honor.
const honorXpForLevel = (h) => Math.floor(15 * Math.pow(MAX_LEVEL, 2.6) * (1 + h * 0.12));
const professionXpForLevel = (lvl) => Math.floor(30 * Math.pow(lvl, 1.25));
// ---------- HOW LONG A PROFESSION TAKES ----------
// Idle training ran at a flat 3 XP every 2.5s, which is 96.5 HOURS to reach rank 100 — four days of
// real time for a system that is meant to sit in the background. The rate is now DERIVED from the
// target, so retuning it means editing the hours and nothing else.
//
// Active gathering is worth twice as much: half the idle time. It asks for attention, so it should
// pay for it — before this it was actually SLOWER at 47.7 hours, which made playing the minigame
// strictly worse than ignoring it.
const PROF_IDLE_HOURS_TO_MAX = 10;
const PROF_ACTIVE_HOURS_TO_MAX = PROF_IDLE_HOURS_TO_MAX / 2;
const PROF_IDLE_TICK_MS = 2500;
const PROF_TOTAL_XP = (() => { let t = 0; for (let l = 1; l < PROF_MAX; l++) t += professionXpForLevel(l); return t; })();
const profIdleXpPerTick = () => Math.max(1, Math.round(PROF_TOTAL_XP / (PROF_IDLE_HOURS_TO_MAX * 3600000 / PROF_IDLE_TICK_MS)));
// ---------- CRAFTING XP STANDARD ----------
// Working rarer stock teaches you more: each material tier above the first multiplies the craft's
// profession XP. Higher tiers also cost proportionally more material, so this rewards *quality*
// without making low-tier spam competitive — and meaningfully shortens the climb to Master.
const CRAFT_XP_TIER_MULT = 1.5;
const craftXp = (baseXp, tierIdx) => Math.max(1, Math.round(baseXp * Math.pow(CRAFT_XP_TIER_MULT, Math.max(0, tierIdx || 0))));
const enchantXpTier = (ilvl) => Math.min(8, Math.floor((ilvl || 1) / 8)); // enchanting scales off the target item's ilvl
// ---- active gathering (combat-like ore/herb mining) ----
const GATHER_NODES = {
  mining: { icon: "🪨", verb: "Mine", names: ["Copper Vein", "Tin Seam", "Iron Deposit", "Silver Lode", "Gold Vein", "Mithril Deposit", "Truesilver Lode", "Adamant Cluster", "Crystalline Ore"], mat: "ore", bonusMat: "richOre", bonusChance: 0.2, bonusLabel: "💎 Rich Ore" },
  herbalism: { icon: "🌿", verb: "Harvest", names: ["Bluepetal", "Sunblossom", "Thornweed", "Mossroot", "Wildvine", "Frostleaf", "Emberbloom", "Duskflower", "Gloomcap"], mat: "herb", bonusMat: "healingHerb", bonusChance: 0.4, bonusLabel: "🌱 Healing Herb" },
};
const gatherNodeMaxHp = (tierIdx) => 40 + (tierIdx || 0) * 25;  // node toughness scales with MATERIAL tier (not player level)
const gatherPower = (lvl) => 6 + (lvl || 1) * 0.6;   // damage per swing scales with skill level
// Calibrated, not guessed: swept against the real node health, swing timer and power curve until a
// full 1->100 climb lands on PROF_ACTIVE_HOURS_TO_MAX. At 540 it was 47.7 hours; at 51 it is 4.9.
// There is no closed form for this — node toughness and swing damage both move with level — so the
// divisor is a measured constant and game-core/profession.test.cjs re-measures it.
const GATHER_XP_DIVISOR = 51;
const gatherXpPerNode = (lvl) => Math.max(2, Math.round(professionXpForLevel(lvl) / GATHER_XP_DIVISOR));
const makeGatherNode = (pid, lvl, tierIdx) => {
  const tiers = GATHER_TIERS[pid];
  const ti = (tierIdx == null ? highestTierIdx(tiers, lvl) : tierIdx);
  const t = tiers[ti];
  const maxHp = gatherNodeMaxHp(ti);
  return { pid, name: t.node, icon: pid === "mining" ? "🪨" : t.icon, hp: maxHp, maxHp, tierIdx: ti };
};
// Arcane Dust yielded by salvaging a piece of gear (scales with rarity + item level)
const salvageReward = (item) => { const rIdx = Math.max(0, RARITIES.findIndex((r) => r.id === item.rarity)); return Math.max(1, 1 + Math.max(0, rIdx - 2) + Math.floor((item.ilvl || 1) / 25)); };
// notable gold fee to salvage, scaling with rarity and item level
const salvageGoldCost = (item) => { const r = Math.max(0, RARITIES.findIndex((x) => x.id === item.rarity)); return Math.max(1, Math.floor((15 + (item.ilvl || 1) * 3) * (1 + r * 0.6) * 0.34)); };
const SALVAGE_MIN_RARITY = 2; // uncommon; white/gray gear can't be manually salvaged

const getZoneForLevel = (level) => ZONES.find((z) => level >= z.minLevel && level <= z.maxLevel) || ZONES[ZONES.length - 1];

// ---- rarity drop tables ----
const rollWeighted = (w) => {
  const entries = Object.entries(w);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return rarityById(k); }
  return rarityById(entries[entries.length - 1][0]);
};
const ZONE_RARITY_BANDS = [
  { max: 10, w: { common: 85, uncommon: 15 } },
  { max: 20, w: { common: 80, uncommon: 19, rare: 1 } },
  { max: 30, w: { uncommon: 80, rare: 19, epic: 1 } },
  { max: 45, w: { uncommon: 60, rare: 39, epic: 1 } },
  { max: 999, w: { uncommon: 45, rare: 45, epic: 9, legendary: 1 } },
];
const DUNGEON_RARITY = {
  deadmines: { uncommon: 90, rare: 10 },
  scarlet: { uncommon: 40, rare: 50, epic: 10 },
  uldaman: { rare: 90, epic: 9, legendary: 1 },
  blackrock: { rare: 80, epic: 15, legendary: 5 },
  stratholme: { epic: 95, legendary: 5 },
  moltencore: { epic: 90, legendary: 10 },
};
const rollRarityForZone = (level) => rollWeighted((ZONE_RARITY_BANDS.find((b) => level <= b.max) || ZONE_RARITY_BANDS[ZONE_RARITY_BANDS.length - 1]).w);
const rollRarityForDungeon = (dungeonId) => rollWeighted(DUNGEON_RARITY[dungeonId] || { uncommon: 100 });


const DROP_RATE_MULT = 0.4; // gear drop rate greatly reduced

// ---- inherent Armor (all non-weapon gear) & weapon damage range (WoW-style) ----
// Every non-weapon piece carries base Armor that scales with the gear/rarity curve (helps
// survivability, esp. levels 1-30, and makes upgrades clearer). Weapons carry a min–max
// damage range instead of Armor.

// enchant scaling: never exceeds what an ilvl-65 legendary item can roll for that stat
const ENCH_SIZE = { str: 1, agi: 1, int: 1, sta: 1, leech: 0.65, vers: 0.55, resil: 0.45 };
const enchantCap = (stat) => Math.max(1, Math.round(gearStatBase(65, 5) * (ENCH_SIZE[stat] || 1)));
// ABYSS ENCHANTING. A rank adds one point to whatever the enchanter would otherwise give, so the
// same level-100 enchanter puts +24 Agility on ordinary gear and +28 on an Abyss +4 piece. The
// bonus is added OUTSIDE the cap deliberately: the cap describes how far an enchanter's skill
// reaches, and the extra comes from the item, not from them. Clamping it back under the cap would
// make the whole feature invisible at max rank, which is the only rank that matters.
const enchantAbyssBonus = (abyss) => (abyss == null ? 0 : Math.max(0, Math.min(ABYSS_MAX_PLUS, abyss)));
const enchantAmount = (stat, enchLevel, abyss) => { const cap = enchantCap(stat); const frac = Math.min(1, ((enchLevel || 1) - 1) / 99); return Math.max(1, Math.min(cap, Math.round(1 + (cap - 1) * frac))) + enchantAbyssBonus(abyss); };


// back-fill inherent armor / weapon range onto items from older saves



// Forge an artifact. `existing` re-forges in place on level-up, preserving the item's identity
// (name + which secondaries it rolled) while its magnitudes scale with the new ilvl.
function makeArtifact(clsId, slotId, level, existing) {
  // A fixed-ilvl artifact ignores the level curve entirely. That is the whole difference between a
  // Ven-shop artifact, which re-forges as you level, and a Battlemaster piece bought at 65.
  const ilvl = (existing && existing.fixedIlvl) || artifactIlvl(level);
  const rarity = rarityById("artifact");
  const rIdx = RARITIES.findIndex((r) => r.id === "artifact");
  const slot = slotById(slotId);
  // Normally the class table decides, and always gives both. A Battlemaster piece is bought with a
  // CHOSEN main stat, so an existing shape wins — otherwise a re-forge would silently overwrite the
  // thing the player was asked to pick.
  const mains = (existing && existing.shape && existing.shape.mains) || ARTIFACT_STATS[clsId] || ["str", "agi"];
  const perStat = Math.max(1, Math.round((1 + ilvl * 0.05) * RARITY_STAT_MULT[rIdx]));
  const secBase = Math.max(1, Math.round(perStat * 0.7));
  // legendary rolls 4 secondaries; the 2 guaranteed mains consume one slot → 3 secondaries.
  // Rolled through the SAME shared table as every other drop. This carried its own copy of the
  // secondary pool, its own size table and its own stamina bias, all of which went stale: crit and
  // haste never rolled on an artifact at all, stamina lines came out 21% small (11 against 14),
  // and a weapon ignored its csd/crit identity entirely.
  let secs = existing?.shape?.secs;
  if (!secs) {
    secs = [];
    for (let i = 0; i < 3; i++) { const k = pickSlotSecondary(slotId, secs); if (!k) break; secs.push(k); }
  }
  const stats = { str: 0, agi: 0, int: 0, sta: 0, armor: 0, dmg: 0, leech: 0, resil: 0, vers: 0, cdr: 0, csd: 0, crit: 0, haste: 0, ap: 0, sp: 0 };
  mains.forEach((k) => { stats[k] += perStat; });
  secs.forEach((k) => { stats[k] += Math.max(1, Math.round(secBase * (SEC_SIZE[k] || 0.5))); });
  // focused artifacts earn Power on the same terms as any other gear
  if (mains.length === 1 && ilvl >= POWER_AFFIX_MIN_ILVL) stats[mains[0] === "int" ? "sp" : "ap"] += Math.max(1, Math.round(perStat * POWER_PER_STAT));
  const isWeapon = slotId === "weapon";
  if (!isWeapon) stats.armor += baseArmorFor(ilvl, rIdx, slotId);
  const wdmg = isWeapon ? weaponRangeFor(ilvl, rIdx) : null;
  const base = existing?.baseName || (slotId === "weapon" && clsId === "hunter" ? pick(HUNTER_WEAPONS) : pick(ITEM_BASES[slotId] || ["Relic"]));
  const name = existing?.name || `Ancient ${base} of Ages`;
  return {
    id: existing?.id || uid(), name, baseName: base, slotId, icon: slot.icon, rarity: "artifact", ilvl, stats,
    value: Math.max(1, Math.round(ilvl * rarity.valueMult)), enchant: existing?.enchant || null, wdmg,
    artifact: true, shape: { mains, secs }, locked: existing?.locked ?? true, // artifacts lock by default
    setId: existing?.setId || null, fixedIlvl: existing?.fixedIlvl || null,
    sockets: existing?.sockets || emptySockets(socketCountFor("artifact", slotId)),
  };
}

// ap/sp are scored separately in itemScore rather than listed here, because Power is dormant
// while a piece carries two main stats — counting it unconditionally would make the score RISE
// when a main-stat gem or enchant disarms a focused piece.
const SCORE_STATS = ["str", "agi", "int", "sta", "armor", "leech", "resil", "vers", "cdr", "csd", "crit", "haste"];

// ============================================================
// TEMPERING FORGE — BDO-style enhancement (+N) + secondary reroll
// ============================================================
// One tunable block. Temper/reroll state rides on the item itself, so all costs
// reset per-item automatically; fail stacks live on the character (transferable).
//
// THE LADDER. Every failed attempt raises the chance of the next one until the rank is GUARANTEED,
// so a rank can never be walled off by dice alone. What was measured before this shipped, pushing
// one piece from +0 to +10 over 20,000 runs at the endgame income of 13,180 gold an hour:
//
//   the old rules, unprotected   63,745,000g   4,836 h   15 items destroyed (p90: 50)
//   the old rules, protected     11,085,000g     841 h    1 item      · 1,015 Ven
//   this ladder, unprotected      2,673,000g     203 h    1 item  (p90: 2)
//
// De-ranking is gone. It is the one failure that can undo paid progress, and it fought the pity
// directly — a de-rank threw away the very stacks that were meant to rescue the attempt.
//
// Destruction now fires ONLY on a failed attempt, and at a fraction of the old rate. The two used
// to be independent rolls, so a SUCCESS could still destroy the item, and the shop displayed
// success/de-rank/destroy figures that summed to 121% because no single roll produced them.
//
// The rates cannot be raised much without breaking the pity outright: at the old 60% destroy the
// piece is gone in under two attempts, long before a 1% base chance has climbed anywhere. That
// combination was measured at 3.27 BILLION gold and 686 items destroyed. Pity is only worth
// anything if the item survives to collect it.
const TEMPER_CFG = {
  maxRank: 10,
  safeMax: 5,               // reaching ranks 1..5 is guaranteed (no destroy, no risk at all)
  cost: { 1: 2000, 2: 5000, 3: 10000, 4: 18000, 5: 28000, 6: 50000, 7: 80000, 8: 120000, 9: 150000, 10: 180000 },
  // Per risky rank: base chance, failures that GUARANTEE it, and the chance a FAILED attempt
  // destroys the piece. The step is derived from `pity` rather than listed, so the guarantee
  // cannot drift away from the number shown to the player.
  ladder: {
    6:  { p0: 0.50, pity: 5,  destroy: 0.00 },
    7:  { p0: 0.35, pity: 8,  destroy: 0.01 },
    8:  { p0: 0.20, pity: 12, destroy: 0.02 },
    9:  { p0: 0.10, pity: 16, destroy: 0.03 },
    10: { p0: 0.01, pity: 20, destroy: 0.04 },
  },
  protectVen: { 6: 5, 7: 8, 8: 12, 9: 18, 10: 25 },       // Ven to negate DESTRUCTION, the only failure left
  grantAtRank: (r) => (r === 10 ? 6 : 1),                 // stat points added to each secondary line on success → +5 at +5, +15 at +10
  failStackPct: 0.04,       // 4% double-chance per stack → 25 stacks = guaranteed
  failStackMax: 25,
  reroll: { start: 100000, max: 250000, rampRolls: 10, jitter: 0.30, pool: SECONDARY_POOL },
};
// Derived from the core rather than restated: these used to be hand-kept copies, so adding a
// secondary meant remembering to update the temper shop too or it would silently ignore it.
const SECONDARY_KEYS = SECONDARY_POOL;
const isTemperable = (it) => !!it && !it.relicId && it.slotId !== "relic"; // relics excluded; all rarities + artifacts allowed
// What one secondary line is worth at a given ilvl/rarity. This used to restate generateItem's
// formula under a comment saying it mirrored it — and a copy labelled as a copy is still a copy.
// It missed the endgame ilvl curve entirely, so a 100k-250k reroll on an ilvl-70 line would have
// handed back a pre-curve value about 45% smaller. One definition, in the core, for both.
// Every one of these takes the item's ABYSS RANK, because a rank widens the range a line rolls in
// and that has to hold for the life of the item. A +7 piece rerolled without it would quietly come
// back with Hard-mode numbers — the player would pay 250,000 gold to make their best item worse,
// and nothing would tell them. secondaryFor is the single definition, in the core beside the drop
// roller, so the two cannot drift.
function secNominal(ilvl, rarityId, stat, abyss) {
  return secondaryFor(ilvl || 1, RARITIES.findIndex((r) => r.id === rarityId), stat, abyss);
}
const rerollRange = (ilvl, rarityId, stat, abyss) => { const n = secNominal(ilvl, rarityId, stat, abyss); return [Math.max(1, Math.round(n * (1 - TEMPER_CFG.reroll.jitter))), Math.max(1, Math.round(n * (1 + TEMPER_CFG.reroll.jitter)))]; };
const rollRerollValue = (ilvl, rarityId, stat, abyss) => { const [lo, hi] = rerollRange(ilvl, rarityId, stat, abyss); return lo + Math.floor(Math.random() * (hi - lo + 1)); };
const temperCost = (targetRank) => TEMPER_CFG.cost[targetRank] || 0;
const rerollCost = (rerollsDone) => { const { start, max, rampRolls } = TEMPER_CFG.reroll; const n = Math.min(rerollsDone, rampRolls - 1); return Math.round(start + (max - start) * (n / (rampRolls - 1))); };
const doubleChanceFor = (stacks) => Math.min(1, (stacks || 0) * TEMPER_CFG.failStackPct);
// Pity is held ON THE ITEM and KEYED BY TARGET RANK, which is what stops it being laundered.
// A character-wide counter could be farmed on cheap +5→+6 attempts and spent on +9→+10, and a
// counter shared across ranks would do the same thing within one piece. It is lost when the piece
// is destroyed — that loss is the stake the risk is there to provide.
const temperPityAt = (it, target) => Math.max(0, Math.floor(((it && it.pity) || {})[target] || 0));
// What an attempt at `target` actually looks like right now. One roll, so the numbers a player
// reads are the numbers that get rolled.
function temperOdds(it, target) {
  const st = TEMPER_CFG.ladder[target];
  if (!st) return { chance: 1, destroy: 0, stacks: 0, cap: 0, left: 0, step: 0, safe: true };
  const step = (1 - st.p0) / st.pity;
  const stacks = temperPityAt(it, target);
  const chance = Math.min(1, st.p0 + step * stacks);
  return { chance, destroy: st.destroy, stacks, cap: st.pity, left: Math.max(0, st.pity - stacks), step, safe: false };
}
// lazily capture an item's secondary lines + temper fields (base stats → discrete lines) on first shop use
function ensureTemperData(it) {
  if (!Array.isArray(it.lines)) it.lines = SECONDARY_KEYS.filter((k) => (it.stats[k] || 0) > 0).map((k) => ({ stat: k, base: it.stats[k] }));
  if (typeof it.temper !== "number") it.temper = 0;
  if (typeof it.temperBonus !== "number") it.temperBonus = 0;
  if (!Array.isArray(it.temperLog)) it.temperLog = [];
  if (typeof it.rerolls !== "number") it.rerolls = 0;
  if (typeof it.linesIlvl !== "number") it.linesIlvl = it.ilvl || 1;
  if (!it.pity || typeof it.pity !== "object" || Array.isArray(it.pity)) it.pity = {};
  return it;
}
// fold lines + temper bonus back into it.stats (kept as the single source of truth for scoring/combat/tooltips)
function syncItemStats(it) {
  if (!Array.isArray(it.lines)) return it;
  for (const k of SECONDARY_KEYS) it.stats[k] = 0;
  for (const ln of it.lines) it.stats[ln.stat] = (it.stats[ln.stat] || 0) + ln.base + (it.temperBonus || 0);
  return it;
}
const temperSuffix = (it) => (it && it.temper ? ` +${it.temper}` : "");

const itemScore = (item, clsId) => {
  if (!item) return 0;
  const s = item.stats, e = item.enchant || {};
  let sc = item.ilvl || 0;
  for (const k of SCORE_STATS) sc += ((s[k] || 0) + (e[k] || 0)) * statWeight(clsId, k);
  if (item.wdmg) sc += ((item.wdmg.min + item.wdmg.max) / 2) * statWeight(clsId, "dmg"); // weapon damage range
  // Power counts only while it is live. effectiveStats applies the same rule, so an item that has
  // been given a second main stat scores the Power it no longer grants at zero — matching what
  // the character sheet already does rather than what the item happens to still carry.
  if (itemPowerActive(item)) sc += (((s.ap || 0) + (s.sp || 0)) + ((e.ap || 0) + (e.sp || 0))) * statWeight(clsId, "ap");
  return sc;
};

// Gem drop. Rarity is rolled by the same zone/dungeon bands as gear; only the drop CHANCE differs,
// so gems ride the normal gear drop system rather than a parallel one.
const GEM_DROP_RATE = 0.05; // base chance per kill, before boss/dungeon/town modifiers
function rollGem({ level, isBoss, dungeonId, dropMult = 1 }) {
  if (!dungeonId && !isBoss) return null; // open-world trash never drops gems — they come from elites & instances
  const inst = dungeonId ? instanceById(dungeonId) : null;
  const isRaid = !!inst?.raid;
  // Zone-scaled on the same curve as gear. The comment above says gems ride the normal gear drop
  // system, and once gear started thinning out toward the endgame they stopped doing so — gems
  // were quietly becoming MORE common relative to gear exactly where gear was being starved.
  //
  // Unlike gear, the raid is NOT exempt here. That exemption exists solely to keep the ilvl-64
  // bridge from normal mode to hard mode open, and gems are not part of that bridge.
  const chance = GEM_DROP_RATE * (isBoss ? 4 : 1) * (isRaid ? 3 : dungeonId ? 2 : 1) * DROP_RATE_MULT * dropMult * zoneDropScale(level);
  if (Math.random() > chance) return null;
  const rarity = dungeonId ? rollRarityForDungeon(dungeonId) : rollRarityForZone(level);
  const pool = ALL_GEMS.filter((g) => g.rarity === rarity.id);
  if (!pool.length) return null; // e.g. "poor" has no gems
  return pick(pool);
}

// loot roll on enemy death → array of items (0-2, or exactly `rolls` when one is given)
//
// `rolls` is the dungeon-boss path: the boss of an instance drops a FIXED number of items rather
// than one guaranteed plus a coin flip. Trash no longer drops gear at all, so this is the entire
// gear yield of a run and leaving it to a coin flip made two identical clears pay differently for
// no reason the player could see. Each roll goes through the same DUNGEON_RARITY table — that
// table is the loot filter.
function rollLoot({ level, isBoss, dungeonId, guaranteed, clsId, dropMult = 1, rolls = 0 }) {
  const items = [];
  const inst = dungeonId ? instanceById(dungeonId) : null;
  const isRaid = !!inst?.raid;
  if (rolls > 0) {
    const ilvlOf = () => (isRaid ? 64 : Math.max(1, Math.min(63, Math.round(level + (Math.random() * 4 - 1)))));
    for (let i = 0; i < rolls; i++) items.push(generateItem(ilvlOf(), rollRarityForDungeon(dungeonId), pickLootSlot(), clsId));
    return items;
  }
  // The normal-mode raid is the bridge to Hard Mode: it drops frequently so one clear yields
  // several pieces, and it is exempt from the zone scaling below for exactly that reason.
  const dropChance = guaranteed ? 1 : isRaid ? 0.85 : (isBoss ? 1 : 0.34) * DROP_RATE_MULT * dropMult * zoneDropScale(level);
  if (Math.random() > dropChance) return items;
  // Normal mode caps at ilvl 63 (Blighted Marches); the raid always drops ilvl 64 → lets you reach avg 64 for Hard Mode.
  const ilvl = isRaid ? 64 : Math.max(1, Math.min(63, Math.round(level + (Math.random() * 4 - 1))));
  const rar = () => (dungeonId ? rollRarityForDungeon(dungeonId) : rollRarityForZone(level));
  items.push(generateItem(ilvl, rar(), pickLootSlot(), clsId));
  if (isBoss && Math.random() < 0.5) items.push(generateItem(isRaid ? 64 : Math.min(63, ilvl + 1), rar(), pickLootSlot(), clsId));
  return items;
}

// effective combined stats from base + level + equipment




// ---------- CONSUMABLES ----------
const CONSUMABLE_DEFS = [
  { id: "heal", name: "Healing Potion", icon: "🧪", kind: "heal", color: "#ff5544", desc: "Restore health instantly" },
  { id: "dmgpot", name: "Potion of Might", icon: "⚗️", kind: "dmgbuff", color: "#ff8855", desc: "Increased damage dealt for 5 min" },
  { id: "armorpot", name: "Potion of Warding", icon: "⚗️", kind: "reducebuff", color: "#88aaff", desc: "Reduced damage taken for 5 min" },
  { id: "str", name: "Scroll of Strength", icon: "📜", kind: "buff", stat: "str", color: "#C79C6E", desc: "+Strength for 1 hour" },
  { id: "agi", name: "Scroll of Agility", icon: "📜", kind: "buff", stat: "agi", color: "var(--verdigris)", desc: "+Agility for 1 hour" },
  { id: "int", name: "Scroll of Intellect", icon: "📜", kind: "buff", stat: "int", color: "#69CCF0", desc: "+Intellect for 1 hour" },
  { id: "sta", name: "Scroll of Health", icon: "📜", kind: "buff", stat: "sta", color: "#e0556a", desc: "+Stamina (max HP) for 1 hour" },
];
const consumableById = (id) => CONSUMABLE_DEFS.find((c) => c.id === id);
// Supply Master goods (needed to brew consumables)
const SUPPLY_ITEMS = [
  { id: "potionBottle", name: "Empty Potion Bottle", icon: "🍶", color: "#8fd0e0", price: 2 },
  { id: "emptyFlask", name: "Empty Flask", icon: "🧴", color: "#b0e08f", price: 10 },
  { id: "blankScroll", name: "Blank Scroll", icon: "📜", color: "#d9c89a", price: 10 },
];
// ---------- GAMBIT SYSTEM (if/then automation equipped to skills) ----------
const GAMBIT_ROLL_COST = 1000;
const GAMBIT_ROLL10_COST = 10000;
const GAMBIT_SLOT_VEN = 100;   // cost of a second gambit slot on a skill
const SHARD_EXCHANGE = 20;     // shards to redeem a chosen gambit
const GAMBIT_IFS = [
  { id: "if_always",   label: "In combat (always)",        icon: "♾️", rarity: "common" },
  { id: "if_ehp50",    label: "Target HP ≤ 50%",           icon: "🎯", rarity: "uncommon" },
  { id: "if_selfhp50", label: "Your HP ≤ 50%",             icon: "❤️", rarity: "uncommon" },
  { id: "if_ehp20",    label: "Target HP ≤ 20%",           icon: "🩸", rarity: "rare" },
  { id: "if_selfhp30", label: "Your HP ≤ 30%",             icon: "💔", rarity: "rare" },
  { id: "if_selfhp20", label: "Your HP ≤ 20%",             icon: "🆘", rarity: "rare" },
  { id: "if_debuffed", label: "You are debuffed",          icon: "☣️", rarity: "rare" },
  { id: "if_boss",     label: "Enemy is a Boss",           icon: "💀", rarity: "rare" },
  { id: "if_champion", label: "Enemy is a Champion or Lord", icon: "⭐", rarity: "epic" },
  { id: "if_hard",     label: "Fighting in Hard Mode",     icon: "🔥", rarity: "epic" },
  { id: "if_no_might", label: "Might buff inactive",       icon: "⚗️", rarity: "uncommon" },
  { id: "if_no_ward",  label: "Warding buff inactive",     icon: "🛡️", rarity: "uncommon" },
  { id: "if_no_str",   label: "Strength scroll inactive",  icon: "📜", rarity: "uncommon" },
  { id: "if_no_agi",   label: "Agility scroll inactive",   icon: "📜", rarity: "uncommon" },
  { id: "if_no_int",   label: "Intellect scroll inactive", icon: "📜", rarity: "uncommon" },
  { id: "if_no_sta",   label: "Health scroll inactive",    icon: "📜", rarity: "uncommon" },
  // Execute range is per-spec, read from that spec's own talents (Assassin 20%, Exile 30%,
  // Berserker 35%, Wild 40%…) rather than a flat number — see executeThreshold in the core.
  { id: "if_execute",  label: "Target in execute range",   icon: "🗡️", rarity: "legendary" },
  { id: "if_resfull",  label: "Class resource full",       icon: "⚡", rarity: "rare" },
  { id: "if_res80",    label: "Class resource ≥ 80%",      icon: "🔋", rarity: "uncommon" },
  { id: "if_res50",    label: "Class resource < 50%",      icon: "🔌", rarity: "uncommon" },
  { id: "if_res20",    label: "Class resource < 20%",      icon: "🪫", rarity: "rare" },
  // Slot-based cooldown checks. These reference the BAR POSITION, so a rule keeps working when
  // you swap which ability sits in that slot.
  ...Array.from({ length: MAX_SKILL_SLOTS }, (_, i) => i + 1).flatMap((n) => [
    { id: `if_sk${n}_cd`,  label: `Skill ${n} on cooldown`,  icon: "⏳", rarity: "uncommon" },
    { id: `if_sk${n}_rdy`, label: `Skill ${n} off cooldown`, icon: "✅", rarity: "uncommon" },
  ]),
];
const _gslug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const GAMBIT_THENS = (() => {
  const out = [], seen = new Set();
  for (const cid in SKILLS) for (const s of SKILLS[cid]) if (!seen.has(s.name)) { seen.add(s.name); out.push({ id: "then_sk_" + _gslug(s.name), label: "Use " + s.name, icon: s.icon || "✨", rarity: s.unlockLevel >= 40 ? "rare" : s.unlockLevel >= 20 ? "uncommon" : "common", kind: "skill", skill: s.name }); }
  for (const d of CONSUMABLE_DEFS) out.push({ id: "then_con_" + d.id, label: "Use " + d.name, icon: d.icon, rarity: "common", kind: "consumable", consumable: d.id });
  // A veto rather than an action: while its condition holds, the skill this rule is equipped to
  // is held back, letting a higher-priority slot take the cast instead.
  out.push({ id: "then_skip", label: "Do NOT use this skill", icon: "⛔", rarity: "rare", kind: "veto" });
  return out;
})();
const ALL_GAMBITS = [...GAMBIT_IFS.map((g) => ({ ...g, type: "if" })), ...GAMBIT_THENS.map((g) => ({ ...g, type: "then" }))];
const gambitById = (id) => ALL_GAMBITS.find((g) => g.id === id);
const GAMBIT_RARITY_WEIGHT = { common: 40, uncommon: 20, rare: 8, epic: 2.5, legendary: 0.5 };
const gambitWeight = (g) => (GAMBIT_RARITY_WEIGHT[g.rarity] || 10) * (g.type === "if" ? 0.5 : 1); // "if" statements are rarer than "then"
// A "then: use skill" is only relevant if the character can actually cast that skill (primary or dual class)
const gambitAccessible = (char, id) => { const g = gambitById(id); if (!g) return false; if (g.type === "then" && g.kind === "skill") return isEquipped(char, g.skill); return true; };
const rollOneGambit = (pool) => { const src = (pool && pool.length) ? pool : ALL_GAMBITS; const total = src.reduce((s, g) => s + gambitWeight(g), 0); let r = Math.random() * total; for (const g of src) { r -= gambitWeight(g); if (r <= 0) return g; } return src[0]; };
// ---------- AUTO GAMBIT ----------
// Gambits are a good system that asks a lot before it gives anything: a player has to understand
// priority order, conditions and vetoes before their bar does anything at all. This lays down a
// sane default from the gambits they ALREADY OWN, so the system works out of the box and stays
// there to be learned rather than being a wall.
//
// The rules it writes are ordinary rules — nothing special-cased — so a player can inspect them,
// reorder them, or tear them up.
const autoGambitPlan = (c) => {
  const owned = (c.gambits && c.gambits.owned) || {};
  const has = (id) => !!owned[id];
  const bar = (c.selectedSkills || []).slice(0, unlockedSlotCount(c.level));
  // Best owned condition from a preference list, or null if the player owns none of them.
  const pick = (...ids) => ids.find(has) || null;
  const rules = {};
  bar.forEach((name, i) => {
    const slotNo = i + 1;
    const sk = skillByName(c, name); if (!sk) return;
    const thenId = "then_sk_" + _gslug(name);
    if (!has(thenId)) return;                       // cannot script a skill they have not unlocked
    let ifId;
    if (skIsHeal(sk) || skIsHot(sk)) ifId = pick("if_selfhp50", "if_selfhp30", "if_selfhp20", "if_always");
    else if (skIsDef(sk))            ifId = pick("if_selfhp30", "if_selfhp50", "if_selfhp20", "if_always");
    else if (skIsCleanse(sk))        ifId = pick("if_debuffed", "if_always");
    else if (skIsTaunt(sk))          ifId = pick("if_always");
    // A finisher is worth holding for its window; a builder should just run.
    else if (skillIsSpender(sk))     ifId = pick("if_res80", "if_resfull", "if_always");
    else                             ifId = pick("if_always");
    if (!ifId) return;
    rules[slotNo] = [{ if: ifId, then: thenId }];
  });
  // A general rule for staying alive, if they own the pieces for one.
  const general = [];
  const healCon = CONSUMABLE_DEFS.find((d) => d.id === "heal");
  const potThen = healCon ? "then_con_" + healCon.id : null;
  // 50%, not a roll across 50/30/20. The Draught Belt already drinks at 30%, so a generated rule at
  // 30 or 20 duplicates it and teaches nothing; at 50 the gambit catches the dip EARLIER than the
  // belt, which is the reason to hold one. A player can still set 30 or 20 by hand.
  const potIf = "if_selfhp50";
  if (potThen && has(potThen) && potIf) general.push({ if: potIf, then: potThen });
  return { rules, general };
};

const GENERAL_SLOT_COSTS = [100, 300, 500]; // Ven cost for general gambit slots 3, 4, 5 (2 are free)
const GAMBIT_UNLOCK_LEVEL = 20; // the gambit system unlocks at character level 20
const supplyById = (id) => SUPPLY_ITEMS.find((s) => s.id === id);
// which supply a given recipe consumes: heal→bottle, might/warding→flask, scrolls→blank scroll
const supplyForConsumable = (def) => def.kind === "heal" ? "potionBottle" : (def.kind === "dmgbuff" || def.kind === "reducebuff") ? "emptyFlask" : "blankScroll";

// ---------- vendor tier system (9-level bands: I=1-9, II=10-19, … VII=60) ----------
const POTION_TIER_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const tierMidLevel = (t) => (t >= 6 ? 60 : t * 10 + 5); // midpoint level of each band
// reference (typical, level-appropriate) HP at a level — used to size potion heals
const referenceHp = (lvl) => Math.floor(lvl * 22 + (7 + Math.floor(lvl * 0.5) + Math.round(lvl * 0.35)) * 11 + 60);
// static heal per tier = 50% of typical HP at the band's midpoint (strong early in a band, weaker late)
const tierHeal = (t) => Math.floor(referenceHp(tierMidLevel(t)) * 0.5);
 // Might/Warding: 5% at tier I, +5% per tier (max 35% at VII)
const tierScrollAmount = (t) => Math.max(3, Math.round(tierMidLevel(t) * 0.7)); // scroll stat points by tier
// consumables are stored per-tier so a crafted/bought potion keeps its tier forever (no auto-upgrade)
const conKey = (id, tier) => `${id}@${tier}`;
// Module scope on purpose: the live combat tick and the offline simulator both need to read the
// player's potion stock, and a second copy inside the component is how the two drift apart.
const conCount = (c, id, tier) => ((c && c.consumables) || {})[conKey(id, tier)] || 0;
const conTotal = (c, id) => { let s = 0; for (let t = 0; t <= 6; t++) s += conCount(c, id, t); return s; };
// PERMANENT VENDOR UPGRADES — bought once, with gold.
//
// `upgrades.autoPotion` was READ in three places (the live tick, simulateOffline and the lesson) and
// WRITTEN in none, so no player could ever own it. That is not a cosmetic gap: the 704-playthrough
// sweep in game-core/levelling-sim.cjs measured it as the difference between reaching 60 and walling
// at level 39 — without it, 0 of 176 parked runs finished. It is deliberately GOLD and not Ven: the
// one mechanic a character cannot progress without must not sit behind the premium currency.
const VENDOR_UPGRADES = [
  // 200g, re-measured. This price has always been derived from what a character actually holds when
  // its lesson opens, never picked: 2,500 first, cut to 400 when a level-7 purse measured 610. Idle
  // income is now a flat hourly tranche rather than a per-kill wage, and the same measurement gives
  // 256 — a levelling character dies about eighty seconds into each stint and is paid for those
  // eighty seconds, so it earns far less of the window than a max-level one. 400 would have stalled
  // the lesson exactly the way 2,500 once did. The gate on this is meant to be knowing it exists,
  // not grinding for it.
  { id: "autoPotion", name: "Draught Belt", icon: "\u{1F9EA}", cost: 200,
    desc: "Drinks your best healing potion automatically at 15% health — a backstop beneath your own potion gambits, in combat and while parked offline." },
];
const vendorUpgradeOwned = (c, id) => !!((c && c.upgrades) || {})[id];
const bestTier = (c, id) => { for (let t = 6; t >= 0; t--) if (conCount(c, id, t) > 0) return t; return -1; };

const potionHeal = (level) => tierHeal(tierForLevel(level));         // HP restored (static within a tier)
const scrollAmount = (level) => Math.max(3, Math.round(tierMidLevel(tierForLevel(level)) * 0.7)); // stat points (static within a tier)
const mightPct = (level) => tierBuffPct(tierForLevel(level));        // Potion of Might: +% damage dealt
         // Potion of Warding: % damage reduction
const POTION_PRICE_KINDS = ["heal", "dmgbuff", "reducebuff"];
// price = the old per-level price evaluated at the band midpoint (fixed for the whole band)
const consumablePrice = (def, level) => {
  const mid = tierMidLevel(tierForLevel(level));
  return POTION_PRICE_KINDS.includes(def.kind) ? Math.floor(mid * 4 + 12) : Math.floor((mid * 9 + 28) * 1.5);
};
// Sell value for a specific tier = half the vendor purchase price of that same tier
const consumableSellPrice = (def, tier) => {
  const mid = tierMidLevel(tier);
  const buy = POTION_PRICE_KINDS.includes(def.kind) ? Math.floor(mid * 4 + 12) : Math.floor((mid * 9 + 28) * 1.5);
  return Math.max(1, Math.floor(buy / 2));
};
const tieredName = (def, level) => `${def.name} ${POTION_TIER_ROMAN[tierForLevel(level)]}`;
const BUFF_DURATION = 3600000; // 1 hour (scrolls)
const POTION_BUFF_DURATION = 300000; // 5 min (combat potions)
const POTION_CD = 5000; // 5 second potion-use cooldown
// The Draught Belt drinks at 15%, BELOW every threshold a gambit can be set to (50 / 30 / 20). It
// is a last-resort backstop, not the primary: at 30% it fired on the same dip a player's own potion
// gambit was watching for, which left the gambit with nothing to do at 30 or 20 and made the two
// systems compete for one stock. Sitting under all of them gives the gambit a real job at every
// threshold and leaves the belt as the net that catches what the gambit missed.
//
// ONE constant, because this number was written out three times — twice inside simulateOffline and
// once in the live tick — and a parked character healing on a different rule from a live one is the
// exact drift the offline-parity suite exists to catch.
const AUTO_POTION_HP = 0.15;
// ---- enemy skill casting (makes combat deadlier) ----
const ENEMY_SKILL_SCALE = 0.55;   // enemy skill damage vs their normal hit
const ENEMY_CAST_CD = 4200;       // ms between enemy skill casts
const ENEMY_FIRST_CAST = 2000;    // ms delay before an enemy's first cast
// ---- combat engine timing & status-effect helpers ----
 // baseline attack speed increased 33% (~1053ms)
const ENEMY_BASE_INTERVAL = Math.round(((1400 / 3) * 2) / 0.67); // enemy attack rate reduced 33% (~1393ms)
const ENGINE_TICK = 200; // ms
const hasteMultOf = (effects) => (effects || []).filter((e) => e.kind === "haste").reduce((m, e) => m * (1 + e.pct / 100), 1);
const enemySpeedMultOf = (effects) => (effects || []).filter((e) => e.kind === "slow").reduce((m, e) => m * (1 - e.pct / 100), 1);
// player slow/stun from enemy debuffs (mirrors enemySpeedMultOf); 0 => stunned
const playerSpeedMultOf = (effects) => (effects || []).filter((e) => e.kind === "pslow").reduce((m, e) => m * (1 - e.pct / 100), 1);
const dodgePctOf = (effects) => (effects || []).filter((e) => e.kind === "dodge").reduce((m, e) => Math.max(m, e.pct / 100), 0);
// buff/utility skill effects: empower = +% damage dealt, ward = −% damage taken

 // Spellbreaker: +5% physical per stack
const wardMultOf = (effects) => (effects || []).filter((e) => e.kind === "ward").reduce((m, e) => m * (1 - e.pct / 100), 1);

const BUFF_META = {
  dmgpct: { icon: "⚔️", color: "#ff8855", label: (a) => `+${a}% Dmg` },
  reducepct: { icon: "🛡️", color: "#88aaff", label: (a) => `-${a}% Taken` },
};

// ---------- TALENT TREES (WoW: WoD-style — one row per tier, pick 1 of 3) ----------
const TALENT_RESPEC_COST = 150; // gold per row change
// Shared talent rows 10-50 (the old level-60 Signature row is now the Specialization system)



// ---------- PER-SPEC TALENT TREES ----------
// Each Specialization has its own 6-row tree: 10 Utility · 20 Survival · 30 Offense ·
// 40 Signature Offense (staple-hooked, conditional) · 50 Survival · 60 Capstone. Three choices per
// row. Shared Utility/Survival/Offense rows come from factories; the two offensive tiers are
// hand-authored per spec so options never repeat within a category and hook that spec's staples.
// Conditional damage uses the `cond` schema wired in talentSkillMult / talentAutoMult above.




// bespoke offensive rows: [40 signature, 60 capstone] per spec



// ---------- SPECIALIZATIONS ----------
// Each class's three level-60 signatures (TALENT_L60 above) are now its Specializations. Selecting
// one (unlocks at level 10) applies its passive AND auto-grants three signature skills. Free to swap.
// Signature skills per spec (each is defined in SKILLS[cls] with a matching `spec` tag).

// One-line combat identity for each spec (shown in the Class Hall spec picker).
const SPEC_CURVE = {
  w_berserk:  "Haste snowball — swinging faster the longer you fight. Ramps hard, opens slow.",
  w_champion: "Cooldown burst — heavy CDR to cycle enormous Rage-dumps in rhythmic windows.",
  w_antimage: "Durable anti-magic attrition — eat magic, turn mitigation into offense, grind them down.",
  m_wild:  "Charge-detonation burst — chaotic, high-ceiling arcane spikes.",
  m_trick: "Control attrition — slows, roots, and sustained ticks win the long fight.",
  m_sword: "Melee weave — Int-scaling autos woven between casts for steady damage.",
  r_ambush: "Opener + execute burst — huge first strike and lethal finish, sags mid-fight.",
  r_corr:   "DoT sustained — layered poisons, long fights, minimal burst.",
  r_wild:   "Consistent speed — all-crit, high attack speed, well-rounded, never spikes.",
  p_just:  "Holy Int burst — convert banked Aegis into holy nukes.",
  p_king:  "Fortress — bank huge Aegis, rare but enormous detonations, hard to kill.",
  p_exile: "Physical melee — no magic, consistent auto-driven weapon damage.",
  h_snipe: "Single big-shot burst — stack Marks, then one lethal shot.",
  h_trap:  "Pet + trap attrition — control and beast-driven over-time damage.",
  h_range: "Rapid consistent shots — attack speed and versatility, no big spenders.",
  l_scorch: "Direct-damage burst — raw shadow/fire nukes over drawn-out DoTs.",
  l_hex:    "DoT master — many afflictions, shard-fed, little burst.",
  l_demon:  "Pet + auto hybrid — a demon plus Int-scaling autos for steady damage.",
  w_prot:     "Tank — trade damage for threat and mitigation; hold the boss off your party.",
  p_holy:     "Healer — single-target, over-time and party-wide healing; light holy damage between heals.",
  p_prot:     "Tank — threat, taunts and heavy cooldowns; the party's anchor.",
  m_support:  "Support — party haste, spell interrupts and protective wards over raw damage.",
  h_support:  "Support — combat anthems, interrupts and off-healing; utility over damage.",
};
const SPEC_LEVEL = 10;
const specsFor = (clsId) => TALENT_L60[clsId] || [];

 // removed specs remap to their replacement



const specCurve = (id) => SPEC_CURVE[id] || "";
 // every signature-skill name (for pruning on swap)

// ---------- SPEC LOADOUTS ----------
// Each Specialization remembers its own template: equipped skills, auto-cast toggles, skill-mod
// investment and Gambit wiring. Swapping banks the loadout you are leaving and restores the one you
// are entering, so a spec button is effectively a saved build. Purchases (autoSkillsOwned, gambit
// owned/shards) stay global — only configuration is per-spec. Skill-mod points are derived from
// level, so each template allocates the same budget independently; nothing can be double-spent.
const captureLoadout = (c) => ({
  selectedSkills: [...(c.selectedSkills || [])],
  autoSkills: { ...(c.autoSkills || {}) },
  skillMods: JSON.parse(JSON.stringify(c.skillMods || {})),
  gambits: {
    rules: JSON.parse(JSON.stringify((c.gambits && c.gambits.rules) || {})),
    slots: JSON.parse(JSON.stringify((c.gambits && c.gambits.slots) || {})),
    general: JSON.parse(JSON.stringify((c.gambits && c.gambits.general) || [])),
  },
});
// Restore a template onto a character whose .spec is ALREADY the target spec.
const applyLoadout = (c, L, sigNames) => {
  const okSkill = (n) => !ALL_SPEC_SKILL_NAMES.has(n) || sigNames.includes(n); // drop other specs' signatures
  const nc = { ...c };
  nc.selectedSkills = padSelectedSkills(nc, [...(L.selectedSkills || []).filter(okSkill), ...sigNames]);
  nc.autoSkills = Object.fromEntries(Object.entries(L.autoSkills || {}).filter(([k]) => okSkill(k)));
  nc.skillMods = Object.fromEntries(Object.entries(L.skillMods || {}).filter(([k]) => okSkill(k)));
  // Gambit maps are keyed by BAR SLOT now, so they travel with the loadout as-is — the old
  // okSkill() filter was for skill-name keys and would have discarded every rule.
  const okSlot = (k) => /^[1-9]$/.test(k) && Number(k) <= unlockedSlotCount(nc.level);
  const rules = {}, slots = {};
  for (const k in ((L.gambits && L.gambits.rules) || {})) if (okSlot(k)) rules[k] = L.gambits.rules[k];
  for (const k in ((L.gambits && L.gambits.slots) || {})) if (okSlot(k)) slots[k] = L.gambits.slots[k];
  nc.gambits = { ...(c.gambits || {}), rules, slots, general: [...((L.gambits && L.gambits.general) || [])] };
  return nc;
};
const hasLoadout = (c, specId) => !!(c && c.specLoadouts && c.specLoadouts[specId]);
// Pure spec swap: banks the outgoing template, restores the incoming one (or builds a default).
// Returns { char, restored }. Kept at module scope so it is testable without React.
const switchSpecCore = (c, specId) => {
  // The GRANTED three, not the whole kit. Choosing Protection used to hand over five signature
  // skills into a five-slot bar, which left no room for a damage skill and is what made the
  // group-role specs so slow to kill anything. The other two remain in the pool to pick up.
  const newSig = specGrantedSkills(specId);
  const banked = { ...(c.specLoadouts || {}) };
  if (c.spec && c.spec !== specId) banked[c.spec] = captureLoadout(c);
  let nc = { ...c, spec: specId, specLoadouts: banked };
  const saved = banked[specId];
  if (saved) return { char: applyLoadout(nc, saved, newSig), restored: true };
  const kept = (c.selectedSkills || []).filter((n) => !ALL_SPEC_SKILL_NAMES.has(n));
  nc.selectedSkills = padSelectedSkills(nc, [...newSig, ...kept]);
  if (nc.gambits) {
    // Slot-keyed rules survive a spec change — the bar position is still yours even though the
    // signature skill sitting in it just swapped.
    const okSlot = (k) => /^[1-9]$/.test(k) && Number(k) <= unlockedSlotCount(nc.level);
    const rules = {}; for (const k in (nc.gambits.rules || {})) if (okSlot(k)) rules[k] = nc.gambits.rules[k];
    const slots = {}; for (const k in (nc.gambits.slots || {})) if (okSlot(k)) slots[k] = nc.gambits.slots[k];
    nc.gambits = { ...nc.gambits, rules, slots };
  }
  return { char: nc, restored: false };
};

// ---------- GROUP ROLES (Phase 1) ----------
// Every spec has a combat role. DPS specs work in BOTH solo idle play and group instances; tank/healer/
// support specs are the group-content meta. specRole() defaults any untagged spec to "dps".
const ROLES = {
  tank:    { id: "tank",    name: "Tank",    icon: "🛡️", color: "#5b8fd6", blurb: "Holds enemy threat and soaks damage." },
  healer:  { id: "healer",  name: "Healer",  icon: "🌅", color: "#5fd39a", blurb: "Keeps the party alive; single-target + AoE healing." },
  support: { id: "support", name: "Support", icon: "🎶", color: "#c8a0ff", blurb: "Interrupts, party buffs and off-healing." },
  dps:     { id: "dps",     name: "DPS",     icon: "⚔️", color: "#e0a955", blurb: "Deals damage; manages personal threat." },
};



// ---------- LEGENDARY POWER GEMS ----------
// The old class-signature "Soul" gems are retired. Legendary gems now grant powerful, STACKING
// effects — socket several copies for a compounding payoff. m-based gems fold into talentMods;
// flagged ones are wired directly into combat & consumables below.



// every gem currently socketed into equipped gear

const gemRegen = (char) => socketedGems(char).reduce((n, g) => n + (g.regen || 0), 0); // % max HP per second
// stacking power-gem accessors
              // seconds shaved off every skill
const gemPotionMult = (char) => 1 + socketedGems(char).reduce((n, g) => n + (g.potionMult || 0), 0);  // ×potion effect
const gemScrollMult = (char) => 1 + socketedGems(char).reduce((n, g) => n + (g.scrollMult || 0), 0);  // ×scroll effect
const gemAutoExec = (char) => { const gs = socketedGems(char).filter((g) => g.autoExec); return gs.length ? 0.05 + (gs.length - 1) * 0.02 : 0; }; // execute HP threshold
const gemAutoCritStack = (char) => socketedGems(char).reduce((n, g) => n + (g.autoCritStack || 0), 0); // +crit dmg per auto until a crit
 // per-spec tree once specialized; shared tiers before then

// ---------- CONDITIONAL TALENT DAMAGE (spec offensive talents) ----------
// A talent may carry a `cond` describing a situational damage bonus:
//   { kind, pct, hpBelow?, hpAbove?, skill? }
//   kind: "nuke" | "spender" | "builder" | "dot" | "skill" | "auto" | "all"
// These are summed in one place each for skills and auto-attacks, keeping the blast radius tiny.







const talentAutoMult = (char, hpFrac) => {
  let bonus = 0;
  for (const t of selectedTalents(char)) { const c = t.cond; if (c && c.kind === "auto" && condHpOk(c, hpFrac)) bonus += c.pct; }
  return 1 + bonus;
};


 // extra seconds on crowd control you apply (Trickster/Trapper; used in PvE & PvP)





const rollWeaponDmg = (char) => { const w = char.equipment && char.equipment.weapon; if (!w) return 0; if (w.wdmg) return w.wdmg.min + rng() * (w.wdmg.max - w.wdmg.min); return (w.stats && w.stats.dmg) || 0; };
// ---------- TOWN / CITY upgrades: account-wide passive bonuses ----------



const TOWN_BUILDINGS = [
  { id: "townhall",   name: "Town Hall",   icon: "🏛️", max: 12, goldBase: 800, goldMult: 2.25, timeBase: 300, timeMult: 2.55, mats: [{ id: "iron", base: 18 }], drops: [{ id: "goblinBone", base: 14 }], bonus: (l) => `+${(l * 1.5).toFixed(1)}% XP & Gold`, desc: "Seat of power. Raises the max level of every other building and boosts all XP & gold." },
  { id: "warcollege", name: "War College", icon: "📚", max: 12, goldBase: 420, goldMult: 2.15, timeBase: 240, timeMult: 2.45, mats: [{ id: "tin", base: 26 }], drops: [{ id: "crackedBone", base: 12 }], bonus: (l) => `+${l * 6}% combat XP`, desc: "Drill yards and libraries — sharpen the edge, earn more XP per kill." },
  { id: "vault",      name: "Vault",       icon: "💰", max: 12, goldBase: 400, goldMult: 2.2,  timeBase: 240, timeMult: 2.45, mats: [{ id: "copper", base: 32 }, { id: "silver", base: 8 }], drops: [{ id: "silk", base: 10 }], bonus: (l) => `+${l * 6}% gold from kills`, desc: "Iron-bound coffers that skim a richer cut from every fallen foe." },
  { id: "foundry",    name: "Foundry",     icon: "⚒️", max: 12, goldBase: 500, goldMult: 2.2,  timeBase: 300, timeMult: 2.5,  mats: [{ id: "iron", base: 22 }, { id: "mithril", base: 5 }], drops: [{ id: "scrapMetal", base: 9 }], bonus: (l) => `+${l * 4}% gear drop rate`, desc: "Roaring forges that draw finer loot from the wilds." },
  { id: "barracks",   name: "Barracks",    icon: "⚔️", max: 12, goldBase: 520, goldMult: 2.2,  timeBase: 300, timeMult: 2.5,  mats: [{ id: "iron", base: 24 }], drops: [{ id: "wolfPelt", base: 9 }], bonus: (l) => `+${(l * 2.5).toFixed(1)}% damage dealt`, desc: "Trains the garrison — permanently increases your damage." },
  { id: "sanctum",    name: "Sanctum",     icon: "⛩️", max: 12, goldBase: 460, goldMult: 2.2,  timeBase: 300, timeMult: 2.5,  mats: [{ id: "bluepetal", base: 26 }, { id: "sunblossom", base: 12 }], drops: [{ id: "ectoplasm", base: 7 }], bonus: (l) => `+${l * 4}% max health`, desc: "A hallowed refuge that fortifies your lifeblood." },
  { id: "storehouse", name: "Storehouse",  icon: "📦", max: 12, goldBase: 360, goldMult: 2.15, timeBase: 240, timeMult: 2.4,  mats: [{ id: "copper", base: 40 }], drops: [{ id: "frogSlime", base: 11 }], bonus: (l) => `+${l * 5}% gathered materials`, desc: "Granaries and warehouses that multiply every harvest." },
];
const townBuildingById = (id) => TOWN_BUILDINGS.find((b) => b.id === id);
const townCostAt = (bld, lv) => ({
  gold: Math.round(bld.goldBase * Math.pow(bld.goldMult, lv)),
  mats: bld.mats.map((m) => ({ id: m.id, qty: Math.round(m.base * Math.pow(1.9, lv)) })),
  drops: bld.drops.map((d) => ({ id: d.id, qty: Math.round(d.base * Math.pow(1.9, lv)) })),
});
const townTimeAt = (bld, lv) => Math.round(bld.timeBase * Math.pow(bld.timeMult, lv)); // seconds to build lv -> lv+1
const TOWNHALL_LEVEL_REQ = (targetLv) => targetLv * 4; // Town Hall level N needs character level N*4
// max level a building may currently reach: Town Hall is gated by character level; others by Town Hall level
const townMaxBuildable = (char, bld) => bld.id === "townhall" ? Math.min(bld.max, Math.floor((char.level || 1) / 4)) : Math.min(bld.max, townLvl(char, "townhall"));

// ---------- PREMIUM: Ven currency, auras, tickets, VIP shop ----------
const PERMA_TS = 4102444800000; // ~year 2100 — effectively permanent
const VEN_PACKS = [
  { ven: 99, usd: "0.99" }, { ven: 499, usd: "4.99" }, { ven: 999, usd: "9.99" },
  { ven: 1999, usd: "29.99" }, { ven: 4999, usd: "49.99" }, { ven: 9999, usd: "99.99" },
];
// ============================================================
// DAILY SIGN-IN — rewards for coming back
// ============================================================
// The SERVER owns both the clock and the dice (supabase/migrations/0015_daily_signin.sql). This
// file only turns the row it hands back into rewards, which is why every number lives here in one
// table and the roll is a pure function of the server's seed.
//
// A missed day costs ONE day of streak rather than resetting it. The whole point of the system is
// to recover a lapsed player, and a hard reset punishes exactly the player it exists to bring back.
const DAILY = {
  weekdayVen: 5,
  weekendVen: 10,
  bonusEvery: 5,            // every 5th consecutive day: 5, 10, 15, 20, 25, 30
  bonusVen: 10,
  milestoneDay: 30,
  milestoneVen: 100,
  weekendRarity: "epic",
  milestoneRarity: "legendary",
};
// The day boundary is UTC, matching the server's (now() at time zone 'utc')::date. Local dates
// would let a player nudge a claim by changing timezone, and would make "weekend" mean different
// days for different people.
const utcDayString = (d) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
const utcIsWeekend = (dayStr) => { const dow = new Date(dayStr + "T00:00:00Z").getUTCDay(); return dow === 0 || dow === 6; };
const dailyIsBonusDay = (streak) => streak > 0 && streak % DAILY.bonusEvery === 0;
const dailyIsMilestone = (streak) => streak > 0 && streak % DAILY.milestoneDay === 0;

// What a claim pays. `rolls` describes the gear to generate — the CALLER generates it inside a
// withRng scope seeded by the server, so the same claim always produces the same item and a
// replayed call cannot re-roll it.
const dailyRewardFor = ({ streak, isWeekend, avgIlvl, cls }) => {
  const lines = [];
  let ven = isWeekend ? DAILY.weekendVen : DAILY.weekdayVen;
  lines.push(`+${isWeekend ? DAILY.weekendVen : DAILY.weekdayVen} Ven${isWeekend ? " (weekend)" : ""}`);
  const rolls = [];
  if (isWeekend) {
    rolls.push({ rarity: DAILY.weekendRarity, ilvl: Math.max(1, Math.round(avgIlvl || 1)), why: "weekend gift" });
    lines.push(`an ${DAILY.weekendRarity} at your average item level (${Math.max(1, Math.round(avgIlvl || 1))})`);
  }
  if (dailyIsBonusDay(streak)) { ven += DAILY.bonusVen; lines.push(`+${DAILY.bonusVen} Ven — day ${streak} streak bonus`); }
  if (dailyIsMilestone(streak)) {
    ven += DAILY.milestoneVen;
    rolls.push({ rarity: DAILY.milestoneRarity, ilvl: Math.max(1, Math.round(avgIlvl || 1)), why: `day ${streak}` });
    lines.push(`+${DAILY.milestoneVen} Ven and a ${DAILY.milestoneRarity} — ${streak} days running`);
  }
  return { ven, rolls, lines, cls };
};

// ============================================================
// FIRST-PURCHASE OFFER — the level-10 artifact bundle
// ============================================================
// Deliberately a LOSS LEADER. The Ven shop sells an artifact weapon or off-hand at 1,500 Ven each,
// and Ven packs run $0.99 for 99, so two artifacts is roughly $29.99 at shop rate. This sells the
// same two for 99c. That is the point — it is the one-time hook that converts a free player — so
// nobody should "correct" it later by pricing it against the shop.
//
// The 24 hours runs from the first time the player SEES the icon, not from the moment they reached
// level 10: a window that expires while someone is logged out is a window they never had.
const OFFER = {
  id: "starter_artifacts",
  level: 10,
  windowMs: 24 * 3600 * 1000,
  usd: "0.99",
  name: "Champion's Bundle",
  grant: { slot: "weapon" },                                   // always given
  choices: [                                                   // and one of these
    { id: "weapon2", slot: "weapon",  name: "A second Artifact Weapon", icon: "⚔️",
      desc: "A spare main-hand to swap between — or to temper as a second project." },
    { id: "offhand", slot: "offhand", name: "Artifact Off-hand",        icon: "🛡️",
      desc: "Fills the other hand. Three sockets, and it re-forges as you level." },
  ],
};
// hidden → below level 10 · live → inside the 24h · expired → past it, now in the Ven shop's Offers
// tab · taken → already bought.
const offerState = (c, now) => {
  if (!c) return "hidden";
  if ((c.offer || {}).taken) return "taken";
  if ((c.level || 1) < OFFER.level) return "hidden";
  const seenAt = (c.offer || {}).seenAt || 0;
  if (!seenAt) return "live";                                  // qualified but not yet shown: the clock starts now
  return (now - seenAt) < OFFER.windowMs ? "live" : "expired";
};
const offerMsLeft = (c, now) => Math.max(0, (((c && c.offer) || {}).seenAt || now) + OFFER.windowMs - now);

// ---------- BATTLE PASS ----------
// A levelling companion: 20 ranks earned by killing, finishing at about the same time as level 60.
//
// killsPerRank is MEASURED, not guessed. Simulating 1-60 for all 22 specs over 6 seeds (132
// completed runs) put the kill count at min 4,070, median 4,139, max 4,269 — a remarkably tight
// spread, because kills to 60 are driven by the XP curve rather than by class. 20 ranks x 200 is
// 4,000, which every measured run cleared with about 70 kills to spare. Anything at 225/rank
// (4,500) was reached by none of them.
//
// PROGRESS RIDES char.kills THROUGH A BASELINE rather than a counter of its own. A second counter
// would have to be incremented at every kill site — live combat, the offline sim, dungeons, raids,
// the arena — and missing one would be invisible until a player noticed their bar was slow. The
// baseline is stamped when the pass record is created, so a level-60 veteran with 247,726 lifetime
// kills starts at rank 0 like everyone else, and a new character starts at 0 because they are at 0.
const PASS = {
  ranks: 20,
  killsPerRank: 200,
  venCost: 100,
  ticketRanks: [5, 10, 15],   // see below: a ticket every rank would be worth 19x the pass price
  gold: 1000,                 // both tracks, every rank
  finalGold: 100000,
  finalGems: 2,
  finalIlvl: 64,              // the legendary floor, and the bridge item into Hard Mode
};

const passRec = (c) => (c && c.pass) || {};
const passKills = (c) => Math.max(0, ((c && c.kills) || 0) - (passRec(c).base || 0));
const passRank = (c) => Math.min(PASS.ranks, Math.floor(passKills(c) / PASS.killsPerRank));
const passKillsInto = (c) => (passRank(c) >= PASS.ranks ? PASS.killsPerRank : passKills(c) % PASS.killsPerRank);
const passOwnsPaid = (c) => !!passRec(c).paid;
const passClaimed = (c, rank, paid) => !!((passRec(c)[paid ? "claimedPaid" : "claimedFree"] || {})[rank]);
const passCanClaim = (c, rank, paid) =>
  rank >= 1 && rank <= PASS.ranks && passRank(c) >= rank && !passClaimed(c, rank, paid) && (!paid || passOwnsPaid(c));
const passUnclaimed = (c) => {
  let n = 0;
  for (let r = 1; r <= passRank(c); r++) { if (passCanClaim(c, r, false)) n++; if (passCanClaim(c, r, true)) n++; }
  return n;
};

// What a rank pays. Free is gold and nothing else — it is the consolation track, and a player who
// never spends should still see the bar mean something.
//
// The paid track gives a Dungeon Reset Ticket on three ranks rather than all twenty. That ticket
// sells for 99 Ven in the premium shop, so nineteen of them would be 1,881 Ven of value inside a
// 100 Ven pass — an 18.8x inversion that would take the shop ticket off the market entirely. Three
// is 297 Ven, which still makes the pass comfortably worth buying without repricing anything else.
const passReward = (rank, paid) => {
  if (!paid) return { gold: PASS.gold, gems: 0, gemRarity: null, tickets: 0, item: null };
  if (rank === PASS.ranks)
    return { gold: PASS.finalGold, gems: PASS.finalGems, gemRarity: "legendary", tickets: 0,
             item: { ilvl: PASS.finalIlvl, rarity: "legendary" } };
  return { gold: PASS.gold, gems: 1, gemRarity: "epic",
           tickets: PASS.ticketRanks.includes(rank) ? 1 : 0, item: null };
};

const passRewardLines = (rank, paid) => {
  const r = passReward(rank, paid), out = [`${r.gold.toLocaleString()}g`];
  if (r.gems) out.push(`${r.gems > 1 ? `${r.gems} ` : ""}random ${r.gemRarity} gem${r.gems > 1 ? "s" : ""}`);
  if (r.tickets) out.push(`${r.tickets} Dungeon Reset Ticket`);
  if (r.item) out.push(`ilvl ${r.item.ilvl} ${r.item.rarity} gear`);
  return out;
};

// A claim must not be re-rollable. There is no server in this flow — unlike the daily sign-in,
// which gets its seed from the database — so the seed is derived from the character and the rank.
// Reloading and claiming again yields the SAME gem and the same item, which is what stops a player
// save-scumming rank 20 until the legendary is the piece they wanted.
const passSeed = (c, rank, paid) => {
  const s = `${(c && c.id) || "c"}:${rank}:${paid ? "p" : "f"}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
};

// Duplicates are allowed, as asked: the legendary gems all say "Stacks" in their own descriptions,
// so a second Warmonger's Ruby is a second +8% damage rather than a wasted roll.
const passRollGems = (rank, paid, rng) => {
  const r = passReward(rank, paid);
  if (!r.gems) return [];
  const pool = ALL_GEMS.filter((g) => g.rarity === r.gemRarity);
  if (!pool.length) return [];
  return Array.from({ length: r.gems }, () => pool[Math.floor(rng() * pool.length) % pool.length]);
};

const PREMIUM_ITEMS = [
  { id: "dungeonReset",  kind: "ticket", name: "Dungeon Reset Ticket",         icon: "🎟️", cost: 99,   desc: "Enter a dungeon once even when out of runs." },
  { id: "arenaChallenge", kind: "ticket", name: "Arena Challenge Ticket",       icon: "🏟️", cost: 99,   desc: "Challenge the Arena once while out of daily runs." },
  { id: "auraXp5",   kind: "aura", aura: "xp",   hours: 5,      name: "Aura of Experience (5h)",        icon: "✨", cost: 250,  desc: "Instantly gain +75% experience for 5 hours." },
  { id: "auraXp24",  kind: "aura", aura: "xp",   hours: 24,     name: "Aura of Experience (24h)",       icon: "✨", cost: 1999, desc: "Instantly gain +75% experience for 24 hours." },
  { id: "auraXpP",   kind: "aura", aura: "xp",   hours: "perm", name: "Aura of Experience (Permanent)", icon: "🌟", cost: 2999, desc: "Instantly gain +75% experience, forever." },
  { id: "auraGold5", kind: "aura", aura: "gold", hours: 5,      name: "Aura of Gold (5h)",              icon: "💰", cost: 250,  desc: "Instantly gain +100% gold for 5 hours." },
  { id: "auraGold24",kind: "aura", aura: "gold", hours: 24,     name: "Aura of Gold (24h)",             icon: "💰", cost: 1999, desc: "Instantly gain +100% gold for 24 hours." },
  { id: "auraGoldP", kind: "aura", aura: "gold", hours: "perm", name: "Aura of Gold (Permanent)",       icon: "🏆", cost: 3000, desc: "Instantly gain +100% gold, forever." },
  { id: "gemCascade", kind: "gem", gem: "g_cascade", name: "Cascade Diamond", icon: "🔻", cost: 1200, desc: "Artifact gem: +10% cooldown reduction per skill on cooldown — ignores the CDR cap." },
  { id: "artifactWeapon",  kind: "artifact", slot: "weapon",  name: "Artifact Weapon",   icon: "⚔️", cost: 1500, desc: "Deep-red relic. Re-forges as you level (ilvl 40 → 60), 3 sockets." },
  { id: "artifactOffhand", kind: "artifact", slot: "offhand", name: "Artifact Off-hand", icon: "🛡️", cost: 1500, desc: "Deep-red relic. Re-forges as you level (ilvl 40 → 60), 3 sockets." },
  { id: "bankSlots", kind: "bank", slots: 25, name: "Bank Expansion (+25 slots)", icon: "🏦", cost: 100, desc: "Permanently adds 25 slots to your bank. Buy as many as you like." },
];
const VEN_TO_GOLD = 1000; // 1 Ven → 1,000 gold (100 Ven = 100,000 gold)

// ---------- THE ARENA: attempts, payouts and streaks ----------
// Rated arena had no limit and paid one token per win, zero per loss. Both change here, and they
// change together: a daily allowance is what gives the Arena Challenge Ticket something to do.
// That ticket has been buyable in the Ven shop since it was written and NOTHING has ever consumed
// it — it is the Draught Belt problem again, an item a player can pay for that does nothing.
//
// An attempt is spent on ENTRY, not on the result. "Consumed on win or loss" is the intent, but a
// counter that only moves at the end is one a player can dodge by retreating from a losing fight
// and re-queueing, which would make the allowance meaningless and the ticket worthless again.
// Entry is the only moment that cannot be avoided.
//
// THE NUMBERS ARE MEASURED, not chosen. Simulating 10 bouts a day over 40,000 days at a 50% win
// rate — streaks forming and breaking naturally — the original 5/1/+1 paid 35.7 tokens a day, so
// the full 2,500-token chase (4 set pieces, 2 runes, +5 on all four) took 10.0 weeks. That was too
// long. These values put it at 71.7 a day and 5.0 weeks.
//
// WHERE THE INCREASE SITS is deliberate. The loss payout is UNCHANGED at 1, so the whole adjustment
// falls on wins: of the extra 36 tokens a day, 31 come from the win base and 5 from the streak.
// That holds the streak at 15% of income — the same share it had before — so a streak stays a
// bonus for playing well rather than becoming the only way to afford anything.
const ARENA = {
  dailyRuns: 10,
  winTokens: 11,
  lossTokens: 1,
  streakBonusMax: 5,   // +2 per consecutive win, so the 6th win and beyond pay 11 + 10 = 21
  streakBonusPer: 2,
};
// Payout for a bout, given the streak BEFORE it. Win 1 pays 11; wins run 11, 13, 15, 17, 19, 21,
// and hold at 21. A perfect day is 180 tokens; a day without a single win is still 10.
const arenaPayout = (win, streakBefore) =>
  win ? ARENA.winTokens + Math.min(ARENA.streakBonusMax, Math.max(0, streakBefore || 0)) * ARENA.streakBonusPer
      : ARENA.lossTokens;
const arenaToday = (c) => {
  const a = (c && c.arena) || {};
  const day = utcDayString();
  return a.day === day ? { day, runs: a.runs || 0, streak: a.streak || 0 } : { day, runs: 0, streak: a.streak || 0 };
};
const arenaRunsLeft = (c) => Math.max(0, ARENA.dailyRuns - arenaToday(c).runs);
const arenaTicketsLeft = (c) => ((c && c.tickets) || {}).arenaChallenge || 0;
const arenaCanEnter = (c) => arenaRunsLeft(c) > 0 || arenaTicketsLeft(c) > 0;

// ---------- THE BATTLEMASTER: the Arena Token shop ----------
// Everything here costs Arena Tokens and nothing here can be bought with gold or Ven. The set gear
// is the point; the rest exists so a player who is not chasing the set still has somewhere to spend.
//
// LIMITS are per UTC week (Monday-based, matching ISO) or lifetime. They exist to stop a hoarded
// balance being dumped into consumables the moment the shop opens, and they are checked against a
// stored counter rather than inferred, so a limit cannot be dodged by reloading.
const BM_SET_ID = "battlemaster";
const BM_PIECE_COST = 125;
const BM_PIECE_ILVL = 65;
const BM_SLOTS = ["head", "chest", "legs", "feet"];
const BM_SLOT_LABEL = { head: "Helm", chest: "Breastplate", legs: "Legguards", feet: "Sabatons" };
// Tempering PvP gear: tokens, not gold, and it stops at +5 — the whole safe band, no destroy risk.
// 25+35+50+60+80 = 250 tokens to reach +5, which is the figure asked for.
const BM_TEMPER_MAX = 5;
const BM_TEMPER_COST = { 1: 25, 2: 35, 3: 50, 4: 60, 5: 80 };
const bmTemperTotal = () => Object.values(BM_TEMPER_COST).reduce((a, b) => a + b, 0);

const BM_SHOP = [
  { id: "bm_gemEpic",       kind: "gemRoll", rarity: "epic",      cost: 25,  limit: 10, per: "week",
    icon: "💠", name: "Random Epic Gem",        desc: "One epic gem, rolled from the same table as any drop." },
  { id: "bm_gemLegendary",  kind: "gemRoll", rarity: "legendary", cost: 25,  limit: 2,  per: "week",
    icon: "🌟", name: "Random Legendary Gem",   desc: "One legendary power gem. Duplicates stack." },
  { id: "bm_arenaChallenge",kind: "ticket",  ticket: "arenaChallenge", cost: 50, limit: 5, per: "week",
    icon: "🏟️", name: "Arena Challenge Ticket", desc: "One extra rated bout once your ten daily attempts are gone." },
  { id: "bm_dungeonReset",  kind: "ticket",  ticket: "dungeonReset",   cost: 100, limit: 5, per: "week",
    icon: "🎟️", name: "Dungeon Reset Ticket",   desc: "Enter a dungeon once even when out of runs." },
  { id: "bm_bankSlots",     kind: "bank",    slots: 25,           cost: 150, limit: 3,  per: "life",
    icon: "🏦", name: "Bank Expansion (+25)",   desc: "Permanently adds 25 bank slots." },
  { id: "bm_runeAegis",     kind: "gem",     gem: "g_aegis",      cost: 500,
    icon: "💎", name: "Aegis Diamond",          desc: "Artifact rune: take 30% less damage in the Arena. Does not stack." },
  { id: "bm_runeUnfetter",  kind: "gem",     gem: "g_unfetter",   cost: 500,
    icon: "⛓️", name: "Unfettered Onyx",        desc: "Artifact rune: breaks the first stun applied to you each fight. Does not stack." },
  ...BM_SLOTS.map((slot) => ({
    id: `bm_${slot}`, kind: "setPiece", slot, cost: BM_PIECE_COST,
    icon: slotById(slot).icon, name: `Battlemaster's ${BM_SLOT_LABEL[slot]}`,
    desc: `Artifact, item level ${BM_PIECE_ILVL}. You choose its main stat on purchase.`,
  })),
];

// UTC week key, Monday-based. Sunday is day 0 in JS, which would otherwise start the week on the
// day most players treat as its end.
const utcWeekString = (d) => {
  const t = d ? new Date(d) : new Date();
  const dow = (t.getUTCDay() + 6) % 7;                       // Mon=0 … Sun=6
  const mon = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow));
  return mon.toISOString().slice(0, 10);
};
const bmRec = (c) => (c && c.bm) || {};
// Weekly counters reset by comparing the stored week key, so nothing has to run on a schedule.
const bmCounts = (c) => {
  const r = bmRec(c);
  return r.week === utcWeekString() ? (r.counts || {}) : {};
};
const bmBought = (c, entry) => (entry.per === "life" ? (bmRec(c).life || {}) : bmCounts(c))[entry.id] || 0;
const bmLeft = (c, entry) => (entry.limit == null ? Infinity : Math.max(0, entry.limit - bmBought(c, entry)));
const bmCanBuy = (c, entry) => (c.arenaTokens || 0) >= entry.cost && bmLeft(c, entry) > 0;

// Is this a Battlemaster piece? Everything that treats PvP gear differently — the +5 temper cap,
// the token cost, the re-forge exemption — keys off this one predicate rather than re-deriving it.
const isPvpSetItem = (it) => !!it && it.setId === BM_SET_ID;


// ---------- BANK CAPACITY ----------
// The bank held a hard 120 and every grant site ended in `.slice(-120)`. slice(-120) keeps the LAST
// 120 — so at capacity a new item silently deleted the OLDEST one off the front, with no message
// and no regard for whether it was locked. Locking guarded selling and salvaging and did nothing
// here, so players lost gear they had explicitly protected.
//
// Nothing is ever dropped now. At capacity a new item is auto-sold, except a legendary or artifact,
// which is held in an overflow mailbox until there is room.
const BANK_BASE_SLOTS = 120;
const BANK_SLOTS_PER_BUY = 25;      // matches the VEN_STORE entry above
const bankCap = (c) => BANK_BASE_SLOTS + Math.max(0, (c && c.bankSlots) || 0);
const bankFree = (c) => Math.max(0, bankCap(c) - ((c && c.inventory && c.inventory.length) || 0));
const bankIsFull = (c) => bankFree(c) <= 0;
// Vendor price, the same 15% of value the rest of the game pays.
const overflowSellPrice = (it) => Math.max(1, Math.floor(((it && it.value) || 0) * 0.6 * 0.25));
// Legendaries and artifacts are too valuable to vendor behind the player's back.
// What is too valuable to be auto-sold when the bank is full. Rarity was the whole rule, which was
// fine until the Abyss: an Abyss +10 EPIC is worth about 700,000 gold on the auction house and
// overflowSellPrice would have paid 211 for it, because that price is derived from the item's
// GENERATION value and knows nothing about where it came from. A 3,335x loss, silently, to a
// player who simply had a full bank.
//
// Anything carrying an Abyss rank is held instead. That includes rank 0: a base Abyss piece still
// floors at 100,000 gold.
const overflowGoesToMail = (it) => !!it && (it.rarity === "legendary" || it.rarity === "artifact" || it.artifact || it.abyss != null);

// The ONE way items enter the bank. Returns the new inventory, the gold from anything auto-sold,
// the overflow mailbox, and a summary the caller can log or notify from.
//
// `protectedItems` is gear the player ALREADY owned — swapped off by auto-equip, returned from a
// cancelled listing, and so on. It is never auto-sold; if there is no room it waits in the mail.
// Selling something a player already had, to make room for something they just found, would be the
// same data loss in a friendlier costume. It is placed first, for the same reason.
const depositItems = (c, items, protectedItems) => {
  const inventory = [...((c && c.inventory) || [])];
  const overflow = [...((c && c.overflow) || [])];
  let gold = 0;
  const sold = [], mailed = [];
  const place = (it, maySell) => {
    if (!it) return;
    if (inventory.length < bankCap(c)) { inventory.push(it); return; }
    if (!maySell || overflowGoesToMail(it) || it.locked) { overflow.push(it); mailed.push(it); return; }
    const p = overflowSellPrice(it); gold += p; sold.push({ item: it, price: p });
  };
  for (const it of (protectedItems || [])) place(it, false);
  for (const it of (items || [])) place(it, true);
  return { inventory, overflow, gold, sold, mailed, full: inventory.length >= bankCap(c) };
};

// Something the player earned or paid for — a relic, a crafted piece, a won auction lot, mail they
// collected. Never auto-sold; if the bank is full it waits in the overflow mailbox. Returns the
// inventory/overflow pair to spread onto the character.
const depositEarned = (c, items) => {
  const r = depositItems(c, [], Array.isArray(items) ? items : [items]);
  return { inventory: r.inventory, overflow: r.overflow, mailed: r.mailed };
};

// Pull items back out of the overflow mailbox as space appears.
const claimOverflow = (c) => {
  const inventory = [...((c && c.inventory) || [])];
  const overflow = [...((c && c.overflow) || [])];
  const claimed = [];
  while (overflow.length && inventory.length < bankCap(c)) { const it = overflow.shift(); inventory.push(it); claimed.push(it); }
  return { inventory, overflow, claimed };
};
const auraUntil = (char, type) => (char && char.auras && char.auras[type]) || 0;
const auraActive = (char, type) => auraUntil(char, type) > Date.now();
const auraXpMult = (char) => auraActive(char, "xp") ? 1.75 : 1;     // Aura of Experience: +75%
const auraGoldMult = (char) => auraActive(char, "gold") ? 2.0 : 1;  // Aura of Gold: +100%

                                   // Curseweaver: affliction stack cap
 // each stack past the first: +40% tick damage (5 stacks = 2.6×)
 // data-driven class damage trait


 // expected damage (skills, display, offline)
// Agility grants attack speed, capped at +20% (100 Agi).
// Agility is the TEMPO stat: it buys crit and attack speed. The old 0.20 ceilings were reached at
// 100 Agi — i.e. already capped on a geared level 60 — which made Agility literally worthless at
// endgame. Same per-point rate, much higher ceilings, so Agi now scales across the whole gear curve.





 // tuned for inherent base armor on all gear
// fixed pre-mitigation damage per enemy level (no character-level scaling, no random variance)

// Skill-casting enemies deal softer AUTO-attacks (their skills carry the danger instead).
// The reduction is strongest in the intro zones (levels 1-20) so early gearing is smoother,
// then fades to full damage in the high-level zones where combat is meant to be demanding.
const enemyAutoMult = (level) => (level <= 10 ? 0.45 : level <= 20 ? 0.6 : level <= 30 ? 0.75 : level <= 45 ? 0.9 : 1);
const enemyCanCast = (enemy) => (SKILLS[enemy.cls] || []).some((s) => s.unlockLevel <= (enemy.level || 1) && ((s.mult && s.mult > 0) || s.dotMult || s.slowPct));
// Dungeon & raid enemies hit much harder (skill-attentive fights). Raids hit harder still.
const isRaidId = (id) => RAIDS.some((r) => r.id === id);
const instanceDmgMult = (enemy) => (enemy.dmgMult != null ? enemy.dmgMult : (!enemy.dungeonId ? 1 : isRaidId(enemy.dungeonId) ? 1.8 : 1.5));
// ---------- ENEMY SCALING STANDARD ----------
// All enemy power flows through the two tables below. Tuning difficulty means editing a row here —
// never sprinkling ad-hoc percentages through combat. Adding a tier (e.g. Hell) is one new row.
const ENEMY_STAT_BASE = (level) => Math.floor(level * 4 + 12); // primary-stat magnitude at a given level
const ENEMY_OFF_SPREAD = 0.4;  // off-primary offensive stats, as a fraction of the primary stat
const DMG_PER_STAT = 0.5;      // primary offensive stat → damage per hit

// Rank = how elite a single foe is. Drives offense, health, skill count and drops together.
const ENEMY_RANKS = {
  normal:   { off: 1.0, hp: 1.0, skills: 1, drops: 1 },
  champion: { off: 1.2, hp: 1.6, skills: 2, drops: 2 },
  boss:     { off: 1.4, hp: 2.2, skills: 3, drops: 3 },
  lord:     { off: 1.4, hp: 2.2, skills: 4, drops: 3 }, // Lord = champion bonus doubled, always brings CC
};
const rankNameOf = (e) => e.isBoss ? "boss" : e.isLord ? "lord" : e.isChampion ? "champion" : "normal";
const rankOf = (e) => ENEMY_RANKS[rankNameOf(e)];

// ---------- ENEMY ARCHETYPES: making a disposition mean something ----------
// Every creature already had a disposition, and it decided almost nothing: measured at level 60,
// all six produced identical damage (126.0), identical health (1610) and no armor at all, because
// enemyBaseDamage takes max(str, agi, int) and erases which stat the disposition chose. The only
// real difference was which single skill a trash mob occasionally cast.
//
// These multipliers give each one a shape. `atk` scales the swing interval, so a rogue-type swings
// fast and light where a warrior-type swings slow and heavy; `dmg` is then derived to hold damage
// per second at parity, since solo enemy health is level-based and does NOT self-calibrate the way
// group boss health does — an unbudgeted change here lands straight on the difficulty curve.
//
// Health and armor are deliberately NOT held flat: that is where the archetypes are allowed to
// differ, so a rogue-type dies fast and a paladin-type grinds. `armor` is a multiple of the level
// curve where 1.0 is 20% mitigation.
// `cast` scales the gap between skill casts, which is the other half of an archetype's rhythm: a
// mage-type casts almost twice as often as the baseline while a rogue-type barely casts at all.
const ENEMY_ARCHETYPE = {
  warrior: { atk: 1.15, hp: 0.88, armor: 1.2, crit: 0.00, cast: 1.50 },  // slow, heavy, armoured; rarely casts
  paladin: { atk: 1.10, hp: 1.00, armor: 1.5, crit: 0.00, cast: 0.85 },  // the wall — grinds and keeps casting
  rogue:   { atk: 0.70, hp: 0.85, armor: 0.0, crit: 0.25, cast: 1.70 },  // a flurry of small spiky hits, almost pure autos
  hunter:  { atk: 0.90, hp: 0.90, armor: 0.5, crit: 0.15, cast: 1.10 },  // steady pressure
  mage:    { atk: 1.30, hp: 0.80, armor: 0.0, crit: 0.00, cast: 0.60 },  // slow swings, constant casting
  warlock: { atk: 1.20, hp: 0.90, armor: 0.0, crit: 0.00, cast: 0.70 },  // attrition rather than burst
};
const NEUTRAL_ARCHETYPE = { atk: 1, hp: 1, armor: 0, crit: 0, cast: 1 };
const archetypeOf = (e) => (e && ENEMY_ARCHETYPE[e.cls]) || NEUTRAL_ARCHETYPE;
// Damage per hit is derived, never authored: whatever the swing interval, crit rate and cast
// cadence are, total damage per second comes out at parity. Authoring them independently is how a
// "feel" change quietly becomes a difficulty change.
//
// Both halves of an enemy's output have to be in this, and the first version of it was wrong for
// exactly that reason: it compensated only for swing speed while the multiplier it produced ALSO
// scaled cast damage, handing slow archetypes free throughput. Measured, casts are 39% of an
// enemy's damage at level 60 (autos 0.718 x base per second against casts 0.455), so ignoring them
// left a x1.33 spread in real damage behind a table that claimed parity.
const CRIT_BONUS = 0.8;    // a crit deals 1.8x, so it adds 0.8 of a hit
const AUTO_SHARE = 0.61;   // measured: see game-core/enemy-identity-sim.cjs
const CAST_SHARE = 0.39;
// Auto damage scales with how fast you swing and how often you crit; cast damage scales with how
// often you cast. Solve for the multiplier that puts the sum back at 1.
const archetypeDmgMult = (a) =>
  1 / (AUTO_SHARE * (1 + a.crit * CRIT_BONUS) / a.atk + CAST_SHARE / (a.cast || 1));
// Armor that yields ARMOR_UNIT_MIT mitigation at factor 1.0, derived from the same mitigation
// curve players use so it stays correct at every level rather than only at 60.
const ARMOR_UNIT_MIT = 0.20;
// How much of an incoming blow an enemy's archetype turns. Uses the same mitigation curve players
// do, so an armoured enemy behaves the way an armoured player does.
const enemyMitigation = (enemy, attackerLevel) => mitigation((enemy && enemy.armor) || 0, attackerLevel || 1);
const enemyArmorFor = (level, factor) =>
  factor > 0 ? Math.round((ARMOR_UNIT_MIT / (1 - ARMOR_UNIT_MIT)) * (45 + (level || 1) * 15) / 5 * factor) : 0;

// Difficulty = the content tier a foe is fought in. `lvlBonus` raises its effective stat level, so
// power grows along the same curve as levelling rather than as a flat multiplier bolted on top.
const DIFFICULTY_TIERS = {
  normal: { name: "Normal", off: 1,  hp: 1, lvlBonus: 0 },
  hard:   { name: "Hard",   off: 4,  hp: 1.5, lvlBonus: 12 },
  // THE ABYSS. Base rank (+0) is tuned so a player who has just cleared the Hard raid — ilvl 71
  // gear, no tempering, whatever secondaries happened to roll — can farm it, and no further. Every
  // + rank multiplies it from here; see ABYSS below.
  abyss:  { name: "Abyss",  off: 3.5, hp: 1.35, lvlBonus: 11 },
};
const diffTier = (id) => DIFFICULTY_TIERS[id] || DIFFICULTY_TIERS.normal;

// Every + rank is registered as a REAL difficulty tier, keyed "abyss0".."abyss10". That matters
// more than it looks: enemyStatBlock and makeEnemy both resolve a tier by ID, so anything that
// derived a tier object on the side would have its offence and level bonus silently ignored by one
// of them. Measured the hard way — the first version scaled only health offline, which made every
// rank identical to fight and the tuning sweep pure noise.
const abyssTierId = (plus) => `abyss${Math.max(0, Math.min(ABYSS.maxPlus, plus || 0))}`;
for (let p = 0; p <= ABYSS.maxPlus; p++) {
  const b = DIFFICULTY_TIERS.abyss;
  DIFFICULTY_TIERS[`abyss${p}`] = {
    name: p ? `Abyss +${p}` : "Abyss",
    off: b.off * Math.pow(ABYSS.offPerPlus, p),
    hp: b.hp * Math.pow(ABYSS.hpPerPlus, p),
    lvlBonus: b.lvlBonus + ABYSS.lvlPerPlus * p,
  };
}
const abyssTierFor = (plus) => DIFFICULTY_TIERS[abyssTierId(plus)];


const enemyStatBlock = (level, cls, { rank = "normal", tier = "normal" } = {}) => {
  const c = CLASSES.find((x) => x.id === cls) || CLASSES[0];
  const R = ENEMY_RANKS[rank] || ENEMY_RANKS.normal;
  const T = diffTier(tier);
  const B = ENEMY_STAT_BASE(level + T.lvlBonus); // difficulty raises effective level, then rank scales it
  const st = {
    str: Math.round(B * ENEMY_OFF_SPREAD),
    agi: Math.round(B * ENEMY_OFF_SPREAD),
    int: Math.round(B * ENEMY_OFF_SPREAD),
    sta: Math.round(B * R.hp * T.hp),
    // Armor comes from the archetype, so a warrior-type actually turns blows and a mage-type does
    // not. Enemies had no armor field at all before this.
    armor: enemyArmorFor(level + T.lvlBonus, (ENEMY_ARCHETYPE[cls] || NEUTRAL_ARCHETYPE).armor),
  };
  st[c.main] = Math.round(B * R.off * T.off); // the class main stat (str/agi/int) carries the primary value
  return st;
};
const enemyDamageStat = (enemy) => Math.max(enemy.str || 0, enemy.int || 0, enemy.agi || 0);
// A creature casts `rank.skills` abilities drawn at random from its class pool, so the expected
// damage of any one cast is the pool average — not any single skill. Shared so the offline
// simulator and the wealth model cannot drift apart from what makeEnemy actually hands out.
const avgEnemySkillMult = (cls, level) => {
  const hitters = enemyUsableSkills(cls, level).filter((s) => (s.mult && s.mult > 0) || s.dotMult);
  if (!hitters.length) return 0;
  return hitters.reduce((a, s) => a + (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0), 0) / hitters.length;
};
// Total damage per second an enemy puts out: autos on the archetype's swing timer, plus casts at
// ENEMY_SKILL_SCALE on the archetype's cast timer. This is the live tick's own arithmetic
// (App.jsx enemyCast + the auto-attack branch), collected in one place so a simulation of a fight
// and the fight itself agree.
const enemyDpsOf = (enemy) => {
  const a = archetypeOf(enemy);
  const raw = enemyBaseDamage(enemy);
  const autos = raw * (enemyCanCast(enemy) ? enemyAutoMult(enemy.level) : 1)
    / ((ENEMY_BASE_INTERVAL * a.atk) / 1000);
  const casts = raw * ENEMY_SKILL_SCALE * avgEnemySkillMult(enemy.cls, enemy.level)
    / ((ENEMY_CAST_CD * a.cast) / 1000);
  return autos + casts;
};
// full pre-mitigation base damage for an enemy (used by both auto-attacks and skill casts)
const enemyBaseDamage = (enemy) => (enemy.str != null ? enemyDamageStat(enemy) * DMG_PER_STAT : enemyDamageForLevel(enemy.level) * rankOf(enemy).off) * instanceDmgMult(enemy) * archetypeDmgMult(archetypeOf(enemy));

// ---------- SAVE ----------
// All save data lives in localStorage under a stable key so it persists across app
// closes and version updates. normalizeChar() migrates newly added fields; older keys
// are imported once.
const SAVE_KEY = "wow_idlecraft_save";
const LEGACY_KEYS = ["wow_idle_save_v3", "wow_idle_save_v2"];

const loadSave = () => {
  try {
    const cur = localStorage.getItem(SAVE_KEY);
    if (cur) return JSON.parse(cur);
    for (const lk of LEGACY_KEYS) {
      const old = localStorage.getItem(lk);
      if (old) { localStorage.setItem(SAVE_KEY, old); return JSON.parse(old); } // migrate forward
    }
    return null;
  } catch { return null; }
};
const writeSave = (d) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); localStorage.setItem(CLOUD_TS_KEY, String(Date.now())); } catch {} };

// ---------- CLOUD SAVE (Supabase) ----------
// Account-based cloud save. The whole saves array is stored as one JSON row per user (table
// `saves`, column `data jsonb`), protected by Row-Level Security. localStorage stays as the offline
// cache; cloud is authoritative on login unless this device has newer offline progress (last-write-
// wins by timestamp). Players are signed in ANONYMOUSLY on launch (instant play + same-device cloud
// backup) and can later link Google to sync across devices. The URL + publishable key below are
// public, client-safe values; security comes from RLS. Never ship the service_role/secret key.
// Requires the @supabase/supabase-js UMD script (window.supabase), loaded by the standalone HTML.
const SUPABASE_URL = "https://hofkfxuyurjnmzhzrarw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_71rQN-5zRmqRH9nm6qhWaw_gXBOFdPp";
const CLOUD_TS_KEY = "roe_cloud_ts";        // last LOCAL write (dirty clock, bumped by writeSave)
const CLOUD_SYNCED_KEY = "roe_cloud_synced"; // cloud updated_at as of our last successful sync
let _sb = null;
const getSupabase = () => {
  if (typeof window === "undefined" || !window.supabase || !window.supabase.createClient) return null;
  if (_sb) return _sb;
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return _sb;
};
const localSaveTs = () => { try { return Number(localStorage.getItem(CLOUD_TS_KEY) || 0); } catch { return 0; } };
const setLocalSaveTs = (t) => { try { localStorage.setItem(CLOUD_TS_KEY, String(t)); } catch {} };
const syncedTs = () => { try { return Number(localStorage.getItem(CLOUD_SYNCED_KEY) || 0); } catch { return 0; } };
const setSyncedTs = (t) => { try { localStorage.setItem(CLOUD_SYNCED_KEY, String(t)); } catch {} };
// tiny roster summary for the conflict prompt (count + strongest character)
const savesSummary = (arr) => {
  const list = Array.isArray(arr) ? arr : [];
  if (!list.length) return "empty";
  const top = list.reduce((a, b) => ((b.level || 0) > (a.level || 0) ? b : a), list[0]);
  return `${list.length} character${list.length === 1 ? "" : "s"} · top: ${top.name || "?"} Lv${top.level || 1}`;
};


// ---------- starting gear (gray/poor tier, class-appropriate) ----------






// ============================================================
// SHARED UI COMPONENTS
// ============================================================
const Faction = ({ faction }) => (
  <span style={{ color: faction === "alliance" ? "var(--verdigris)" : "var(--rubric)", fontWeight: 700, fontSize: 11 }}>
    {faction === "alliance" ? "⚜️ The Concord" : "🔴 The Warband"}
  </span>
);

/* Vitals are HATCHED, not filled. A solid bar reads as a progress meter from any
   other app; hatching reads as something a person shaded in, and it still reads
   at 5px tall. The stripes are the fill and the gaps are the trough showing
   through — a blend mode over a solid colour washed out entirely on the night
   ground, which is the version that got shipped and reverted. */
const Bar = ({ current, max, color, height = 8, label, sub }) => (
  <div style={{ width: "100%" }}>
    {label && <div style={{ fontSize: 10, color: "var(--ink-faint)", marginBottom: 2, display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", letterSpacing: ".04em" }}><span>{withIcons(label, 12)}</span>{sub && <span>{withIcons(sub, 11)}</span>}</div>}
    <div style={{ background: "var(--sunk)", borderRadius: "var(--r-sm)", height, overflow: "hidden", border: "1px solid var(--rule)", padding: 1 }}>
      <div style={{ width: `${clamp((current / max) * 100, 0, 100)}%`, height: "100%", transition: "width 0.25s ease",
        background: `repeating-linear-gradient(115deg, ${color || "var(--gilt)"} 0 2.5px, transparent 2.5px 4.5px)` }} />
    </div>
  </div>
);

const CombatLog = ({ log }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  return (
    <div ref={ref} style={{ background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "8px 10px", height: 116, overflowY: "auto", fontSize: 11, lineHeight: 1.55, fontFamily: "ui-monospace, monospace" }}>
      {log.length === 0 && <div style={{ color: "var(--ink-faint)" }}>Awaiting combat...</div>}
      {log.map((e, i) => <div key={i} style={{ color: e.color || "var(--ink-soft)" }}>{withIcons(e.text, 13)}</div>)}
    </div>
  );
};

const STAT_LABEL = { str: "Str", agi: "Agi", int: "Int", sta: "Sta", armor: "Armor", dmg: "Dmg", leech: "Leech", resil: "Resilience", vers: "Versatility", cdr: "Cooldown Reduction", csd: "Crit Damage", crit: "Crit Chance", haste: "Haste", ap: "Attack Power", sp: "Spell Power" };

// ============================================================
// AUCTION HOUSE — economy config, value anchors, catalogs
// ============================================================
// One tunable block (single-row tuning). Balance = edit here, nothing else.
const AH_ECON = {
  unlockLevel: 15,          // AH node & Mail gate
  // Deposit charged to post; CONSUMED (never refunded). Was 0.25, set when a best-in-slot item
  // anchored at 1,540g and the deposit was therefore ~385g. Now that a price tracks an item's
  // power, 25% of a top listing would be over 6,000g — half an hour of endgame income, burned even
  // if nobody buys. 0.06 keeps a real cost to spamming the shelves without making listing a gamble.
  postFeePct: 0.06,
  saleTaxPct: 0.15,         // cut removed from every sale (gold sink)
  bandPct: 0.75,            // legal price band: base ± this fraction
  stackSize: 50,            // materials & drops post in stacks of exactly this
  listDurationMs: 48 * 3600 * 1000,   // player listing lifetime → return via Mail
  sweepMinMs: 12000,        // throttle the market sweep
  // ---- backend supply (phantom stock the player can buy; never labeled) ----
  stockGear: 16,            // standing gear-listing floor
  stockStacks: 10,          // standing material/drop-stack floor
  refillPerSweep: 3,        // gradual top-up so shelves are never bare, never flooded
  phantomLifeMinMs: 25 * 60 * 1000,
  phantomLifeMaxMs: 110 * 60 * 1000,
  ilvlBands: [[6, 24], [28, 52], [56, 70]],   // early / mid / late — always represented
  marketRarityW: { poor: 8, common: 34, uncommon: 34, rare: 18, epic: 6 }, // NO legendary/artifact stock
  // phantom demand curve is sellChancePerHour() below
};
// ---------- WHAT AN ITEM IS WORTH ON THE SHELF ----------
// This was `ilvl x rarity.valueMult`, which had two problems. It could not tell a well-rolled piece
// from a badly-rolled one of the same ilvl — every ilvl-70 epic was worth exactly 1,540g, so there
// was nothing for a market to be a market ABOUT. And it was flat: measured against real farming
// income, a best-in-slot item was 0.15 hours of play while a +5 temper was 31 hours, so listing
// anything was a rounding error rather than a decision.
//
// Price now follows the POWER an item carries, on a progressive curve. Vendor prices are
// deliberately untouched: the gap between what a vendor pays and what a buyer pays is the whole
// reason to walk to the auction house, and widening it is the point.
const AH_PRICE = {
  perPoint: 7.4,   // gold at one weighted stat point; calibrated below
  exponent: 1.8,   // progressive — doubling an item's power raises its price ~3.5x
  // ABYSS PREMIUM. A flat floor added on top of whatever the piece's stats are worth, so an Abyss
  // item is never priced like the ilvl 71 raid drop it superficially resembles. 100,000 at rank 0
  // and 50,000 more for every + above it: an Abyss +7 legendary floors at 450,000 before its stats
  // are counted at all.
  //
  // Added AFTER the socket and enchant multipliers, deliberately. Folding it in first would have
  // those multipliers act on the floor as well — three sockets would add 24,000 gold to a piece
  // for holes that are still empty — and the premium is meant to be a property of where the item
  // came from, not something sockets can amplify.
  abyssBase: 100000,
  abyssPerPlus: 50000,
};
// Calibration: perPoint is set so a best-in-slot epic (ilvl 70, ~94 weighted points) lands at about
// two hours of measured endgame income (~13,300 g/h) => ~25,000g. Re-measure with
// game-core/wealth-sim.cjs whenever income moves; game-core/ah-price.test.cjs fails if it drifts.
//
// Weighted, not raw: a point of crit damage and a point of haste are not the same purchase, and
// statWeight already knows the difference because it was measured through the combat code. Main
// stats count at full weight regardless of class — every item's mains suit SOME buyer, and a
// shelf price cannot depend on who is looking at it.
const AH_MAIN_WEIGHT = 1;
const AH_SCORED = ["str", "agi", "int", "sta", "armor", "leech", "resil", "vers", "cdr", "csd",
                   "crit", "haste", "ap", "sp", "dmg"];
function ahStatPoints(item) {
  if (!item) return 0;
  // An enchant is a FLAT stat map — { agi: 28 } — which is what enchantGear writes and what
  // effectiveStats consumes. Reading enchant.stats found nothing on every item in the game, so
  // every enchanted piece was priced as though its enchant granted zero while still collecting the
  // 10% enchanted premium. The nested read is kept as a fallback in case any old row carries it.
  const s = item.stats || {}, en = item.enchant || {}, e = en.stats || en;
  let pts = 0;
  for (const k of AH_SCORED) {
    // Power is dormant on dual-main-stat gear, and a buyer cannot spend what the item will not give.
    if ((k === "ap" || k === "sp") && !itemPowerActive(item)) continue;
    const amount = (s[k] || 0) + (e[k] || 0);
    if (!amount) continue;
    pts += amount * (MAIN_KEYS.includes(k) ? AH_MAIN_WEIGHT : statWeight("warrior", k));
  }
  // A weapon's damage range is its whole point and lives outside stats{}.
  if (item.wdmg) pts += ((item.wdmg.min + item.wdmg.max) / 2) * statWeight("warrior", "dmg");
  return pts;
}
// Deterministic value anchor — NO jitter, so the seller's band and backend pricing agree.
function ahBaseValue(item) {
  if (!item) return 1;
  const pts = ahStatPoints(item);
  // A relic or anything else with no scorable stats still needs a price rather than a zero.
  if (!(pts > 0)) return Math.max(1, Math.round((item.ilvl || 1) * rarityById(item.rarity).valueMult));
  let v = Math.max(1, Math.round(AH_PRICE.perPoint * Math.pow(pts, AH_PRICE.exponent)));
  const sockets = Array.isArray(item.sockets) ? item.sockets.length : 0;
  if (sockets) v = Math.round(v * (1 + 0.08 * sockets));   // socket premium: power the buyer can add
  if (item.enchant) v = Math.round(v * 1.10);              // enchant premium, on top of its stats
  if (item.abyss != null) v += ahAbyssPremium(item.abyss); // where it came from, on top of what it is
  return Math.max(1, v);
}
// The premium a piece carries for the depth it was pulled from. Its own function because the
// server has to compute the same number in plpgsql, and a formula written out twice in two
// languages is the exact shape of every pricing bug this project has already had.
const ahAbyssPremium = (plus) =>
  AH_PRICE.abyssBase + AH_PRICE.abyssPerPlus * Math.max(0, Math.min(ABYSS_MAX_PLUS, plus || 0));
const ahBand = (base) => [Math.max(1, Math.ceil(base * (1 - AH_ECON.bandPct))), Math.floor(base * (1 + AH_ECON.bandPct))];
const ahPostFee = (base) => Math.max(1, Math.floor(base * AH_ECON.postFeePct));
const ahNetAfterTax = (price) => Math.max(1, Math.floor(price * (1 - AH_ECON.saleTaxPct)));

// ---- material / drop unit values (mats had no gold value before; derive one) ----
// Base unit values ×3 (crafting/gathering materials); mob drops unchanged.
const oreUnitValue = (id) => { const i = Math.max(0, oreTierIndex(id)); return Math.round(9 * Math.pow(1.7, i)); };
const herbUnitValue = (id) => { const h = HERB_TIERS.find((x) => x.id === id); return Math.round(9 * Math.pow(1.7, h ? h.ptier : 0)); };
const DUST_UNIT_VALUE = { dust: 36 }; // arcane dust; stat dusts handled below
const DROP_ZONE_IDX = Object.fromEntries(Object.values(ENEMY_DROPS).map((d, i) => [d.id, Math.min(6, Math.floor(i / 4))]));
const dropUnitValue = (id) => Math.round(4 * Math.pow(1.6, DROP_ZONE_IDX[id] ?? 0));
// unit value for any postable material/drop id, by kind
function stackUnitValue(kind, id) {
  if (kind === "drop") return dropUnitValue(id);
  if (oreTierById(id)) return oreUnitValue(id);
  if (HERB_TIERS.some((h) => h.id === id)) return herbUnitValue(id);
  if (id === "dust") return DUST_UNIT_VALUE.dust;
  if (id.startsWith("dust_")) return 120; // stat dusts are rare salvage (×3)
  return 12;
}
const stackBaseValue = (kind, id) => Math.max(1, stackUnitValue(kind, id) * AH_ECON.stackSize);
// display meta for a material/drop id
function stackMeta(kind, id) {
  if (kind === "drop") return DROP_BY_ID[id] || { name: id, icon: "🎒", color: "#d0a0c0" };
  return MATERIALS[id] || { name: id, icon: "⛏️", color: "var(--ink-soft)" };
}

// phantom demand: chance-per-hour a player's listing sells, by price/base ratio
const sellChancePerHour = (ratio) => clamp(0.95 * Math.exp(-1.9 * (clamp(ratio, 0.25, 1.75) - 0.4)), 0.02, 0.95);
const AH_SELLERS = ["Aldric", "Brenna", "Corvus", "Dahlia", "Eamon", "Fenwick", "Greta", "Hollis", "Isolde", "Jarl", "Kestrel", "Lira", "Mordecai", "Nadia", "Osric", "Perrin", "Quill", "Rhoswen", "Soren", "Tamsin", "Ulric", "Vesper", "Wynn", "Yorick", "Zephyra", "Bram", "Cael", "Delyth", "Elowen", "Faelan"];
// convert rolled secondary-stat rating totals into capped percentages
 // leech effectiveness (set to 1 to revert the ~33% nerf)

// combat modifiers derived from secondaries
   // crit multiplier (base 1.8, up to 3.8 with CSD)
// Gear + talent CDR is capped at 90%. Cascade Diamond adds cooldown reduction on top of that cap,
// scaling with how many of your skills are currently on cooldown (needs live battle state).

// ---- Beastmaster: Savage Companion pet (relocated damage) + CDR per enemy debuff ----


 // scales off your own damage






// ================= OFFLINE COMBAT =================
const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000; // 12 hour cap
const OFFLINE_NOTIF_ID = 8801;

// Cross-environment notifications: uses the Capacitor LocalNotifications plugin on device
// (can schedule while the app is closed), and falls back to the web Notification API in the browser.
const LocalNotify = {
  plugin: () => (typeof window !== "undefined" && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null,
  webOk: () => typeof Notification !== "undefined",
  async ensurePermission() {
    const p = this.plugin();
    try {
      if (p) { const r = await p.requestPermissions(); return r && r.display === "granted"; }
      if (this.webOk()) {
        if (Notification.permission === "default") return (await Notification.requestPermission()) === "granted";
        return Notification.permission === "granted";
      }
    } catch {}
    return false;
  },
  async scheduleDefeat(atMs) {
    const p = this.plugin();
    try {
      if (p) {
        await p.schedule({ notifications: [{ id: OFFLINE_NOTIF_ID, title: "Realms of Eldoria", body: "Offline combat ended — your character was defeated.", schedule: { at: new Date(atMs), allowWhileIdle: true } }] });
        return true;
      }
    } catch {}
    return false; // web cannot schedule while closed
  },
  async cancelScheduled() {
    const p = this.plugin();
    try { if (p) await p.cancel({ notifications: [{ id: OFFLINE_NOTIF_ID }] }); } catch {}
  },
  async fireNow(body) {
    const p = this.plugin();
    try { if (p) { await p.schedule({ notifications: [{ id: OFFLINE_NOTIF_ID + 1, title: "Realms of Eldoria", body }] }); return; } } catch {}
    try { if (this.webOk() && Notification.permission === "granted") new Notification("Realms of Eldoria", { body }); } catch {}
  },
  // A full bank while idle-battling means every non-legendary drop is being auto-sold on arrival.
  // That is recoverable — no item is lost — but the player should be told rather than discover it
  // from their gold going up. Its own id so it never replaces the defeat notification.
  async bankFull(body, atMs) {
    const p = this.plugin();
    try {
      if (p) {
        await p.schedule({ notifications: [{ id: OFFLINE_NOTIF_ID + 2, title: "Realms of Eldoria", body,
          ...(atMs ? { schedule: { at: new Date(atMs), allowWhileIdle: true } } : {}) }] });
        return true;
      }
    } catch {}
    try { if (this.webOk() && Notification.permission === "granted") { new Notification("Realms of Eldoria", { body }); return true; } } catch {}
    return false;
  },
  async cancelBankFull() {
    const p = this.plugin();
    try { if (p) await p.cancel({ notifications: [{ id: OFFLINE_NOTIF_ID + 2 }] }); } catch {}
  },
};

// Average sustained DPS for offline auto-combat: auto-attacks + ONLY purchased & enabled auto-skills.


// What a representative fight in a zone looks like. The live loop builds a creature per kill and
// hashes its NAME to a disposition, which then drives health, armor and how often it swings or
// casts. Offline has no per-kill creature, so it averages the zone's roster — that is what "a
// typical fight here" means. Before this, offline fought a creature that existed nowhere in the
// game: no archetype health, no armor, and a damage curve 27% below the live one.
// `tier` and `hpMult` let the offline simulator model content harder than a normal zone. Without
// them the Abyss could not be auto-farmed at all — which would make its entire gating design
// meaningless, since "can this build park here" is the question the whole ladder is built around.
const zoneEnemyProfile = (zone, level, tier = "normal", hpMult = 1) => {
  const names = (zone && zone.enemies && zone.enemies.length) ? zone.enemies : [null];
  const atRank = (rank) => {
    let hp = 0, mit = 0, dps = 0;
    for (const nm of names) {
      const cls = nm ? dispositionFor(nm) : CLASSES[0].id;
      const st = enemyStatBlock(level, cls, { rank, tier });
      const e = { ...st, level, cls, isBoss: rank === "boss" };
      hp += (ENEMY_ARCHETYPE[cls] || NEUTRAL_ARCHETYPE).hp * hpMult;
      mit += enemyMitigation(e, level);
      dps += enemyDpsOf(e);
    }
    return { hp: hp / names.length, mit: mit / names.length, dps: dps / names.length };
  };
  const normal = atRank("normal"), boss = atRank("boss");
  // NOTE: the live loop also spawns a Mimic (champion rank) on 5% of encounters. Offline does not
  // model it, so offline stays a shade easier than live by that much.
  return { hpMult: normal.hp, mit: normal.mit, dps: (isBoss) => (isBoss ? boss.dps : normal.dps) };
};

// Simulate up to `elapsedMs` (capped at 12h) of auto-combat in the character's chosen offline zone.
// Returns null if nothing to do. Mirrors the live zone reward formulas. Loot is auto-sold for gold.
// WHERE A PARKED CHARACTER IS FIGHTING. Exactly one of three places, resolved once so nothing
// downstream has to re-derive it:
//
//   a normal zone   the ordinary levelling grind
//   a HARD zone     endless kill-goal farm; hard dungeons and the raid are NOT parkable, because
//                   they are lockout content and a lockout cannot be spent while nobody is there
//   the Abyss at +0 and only +0. Deeper ranks must be played, not left running.
//
// OFFLINE_ABYSS_MAX is the whole of that last rule. It is a constant rather than a literal 0
// because "you can park at the bottom and nowhere else" is a design decision, and a bare 0 buried
// in a clamp reads like an accident.
const OFFLINE_ABYSS_MAX = 0;
const offlineSpot = (char) => {
  if (!char) return null;
  if (char.offlineAbyss != null)
    return { kind: "abyss", plus: Math.max(0, Math.min(OFFLINE_ABYSS_MAX, char.offlineAbyss)) };
  const hz = hardZoneById(char.offlineHardId);
  if (hz) return { kind: "hard", hz };
  const z = ZONES.find((x) => x.id === char.offlineZoneId);
  return z ? { kind: "zone", zone: z } : null;
};

// ---------- IDLE INCOME ----------
// Camping used to pay per kill, exactly as playing does, and 12 hours parked in a hard zone was
// measured at 836,518 gold — 3.3x what an average player is meant to HOLD, twice a day, forever.
// About half of that was not even combat gold: a parked character dropped ~1,689 items, filled its
// bank in minutes, and everything after that was auto-sold straight into the purse.
//
// So idle no longer pays per kill at all. It pays a flat TRANCHE per hour parked, and the kill loop
// is otherwise untouched: kills still bank toward the battle pass, hard-zone goals, Abyss ranks and
// quests, deaths still happen, potions are still drunk. Only the money and the experience are
// rationed, which is what "minor progress while away" has to mean if playing is to be worth more
// than not playing.
//
// A flat rate is also the point of "set intervals": a stronger character kills faster, and under
// the old rule that made camping MORE lucrative the better your gear. Now it does not.
const IDLE = {
  goldPerHour: { zone: 400, hard: 900, abyss: 1200 },
  xpPerHour:   { zone: 900, hard: 1800, abyss: 2400 },
  // FIVE DROPS AN HOUR, everywhere. Not a rate change and not a tier change — the roll that decides
  // WHETHER a kill drops and WHAT rarity it is is untouched, and the cap simply stops accepting
  // once five have landed in the current hour. Twelve hours is 60 items rather than 1,689, so a
  // player returning in the morning has a list they can actually read.
  dropsPerHour: 5,
};
const idleRate = (table, spotKind) => table[spotKind] || table.zone;

// ---------- unattended live play ----------
// Rationing the PARKED payout only moved the problem. The live tick pays a full per-kill wage, and
// the same gambits and auto-potions fight either way, so once parking dropped to 900 gold an hour a
// hard zone left running on an open tab was worth about 30,000 — roughly 34x better than the thing
// it replaced. The optimal play became "leave the game open on a spare monitor", which is camping
// with extra steps and exactly what this was all meant to stop.
//
// So the wage is not a property of being LIVE, it is a property of being THERE. A session with a
// person in it pays per kill, as it always has. A session nobody has touched for ten minutes pays
// the parked tranche and the parked five drops an hour — identical to leaving, because it is.
//
// Ten minutes is deliberately generous: this is a game you can win by setting up gambits and
// watching, and any pointer, key, wheel or touch event anywhere in the app resets it. Hiding the
// tab starts the clock immediately, because a backgrounded tab has definitionally nobody in it.
const ATTENTION = { afkAfterMs: 10 * 60 * 1000 };
// Pure, so the rule can be tested without a browser. A hidden tab is unattended AT ONCE rather than
// after the grace period: the timers keep running when a tab is backgrounded, and there is nobody
// there by definition, so serving out ten more minutes of full wages would just be the loophole
// again in a smaller window.
const isAttended = (lastInputAt, now, hidden) => !hidden && (now - (lastInputAt || 0)) < ATTENTION.afkAfterMs;

// Only ENDLESS content can be left to run. Dungeons and hard raids finish and hand back an idle
// screen, so there is nothing to leave running; PvP is another player's time and is never rationed.
const endlessSpotOf = (b) =>
  !b || b.pvp ? null
  : b.mode === "abyss" ? "abyss"
  : b.mode === "hard" ? (b.hardKind === "zone" ? "hard" : null)
  : b.mode === "zone" ? "zone"
  : null;

// What an unattended stretch has earned but not yet been paid. Pure, so it can be tested without a
// browser, and CUMULATIVE rather than per-kill: it pays the difference between what the stretch is
// worth by now and what it has already handed over. That is what makes the payout independent of
// how many things died in it — a fast character and a slow one reach the same total, and a kill
// that arrives a millisecond after the last one is worth nothing extra.
const afkAccrue = (rec, spot, now) => {
  const since = (rec && rec.since) || now;
  const paidGold = (rec && rec.gold) || 0, paidXp = (rec && rec.xp) || 0, kept = (rec && rec.drops) || 0;
  const hours = Math.max(0, now - since) / 3600000;
  const gold = Math.max(0, Math.floor(idleRate(IDLE.goldPerHour, spot) * hours) - paidGold);
  const xp = Math.max(0, Math.floor(idleRate(IDLE.xpPerHour, spot) * hours) - paidXp);
  // The same allowance simulateOffline uses, computed the same way, so an hour away and an hour
  // ignored hand over the same number of items.
  const budget = Math.floor(hours) * IDLE.dropsPerHour + IDLE.dropsPerHour;
  return { gold, xp, budget, roomForDrop: kept < budget,
           rec: { since, gold: paidGold + gold, xp: paidXp + xp, drops: kept } };
};

const simulateOffline = (char, elapsedMs) => {
  const spot = offlineSpot(char);
  if (!spot) return null;
  const aPlus = spot.kind === "abyss" ? spot.plus : null;
  const hz = spot.kind === "hard" ? spot.hz : null;
  // Hard zones and the Abyss both borrow the flavour of a real zone for enemy names and
  // dispositions; only their tier, level and health multiplier differ.
  const zone = spot.kind === "zone" ? spot.zone
             : hz ? (ZONES.find((z) => z.id === hz.base) || ZONES[ZONES.length - 1])
                  : (ZONES.find((z) => z.id === "plaguelands") || ZONES[ZONES.length - 1]);
  if (!zone || char.level < zone.minLevel) return null;
  const secs = Math.min(elapsedMs, OFFLINE_CAP_MS) / 1000;
  if (secs < 30) return null;

  const c = { ...char };
  const eff = effectiveStats(c);
  const sp = secondaryPcts(eff);
  const maxHp0 = maxHpFor(c);
  const enemyLevel = hz ? hz.enemyLvl : aPlus != null ? ABYSS.enemyLvl : clamp(c.level, zone.minLevel, zone.maxLevel);
  const mit = mitigation(eff.armor, enemyLevel);
  const dps = offlinePlayerDps(c);
  const leechPct = sp.leech / 100;
  const lowLvlMult = c.level < 5 ? 0.8 : 1;
  // Enemy output now comes from the same stat block and cadence the live tick uses, not the legacy
  // per-level curve — the two were a flat 27% apart at every level, which made offline a measurably
  // easier game than the one being played. Casts count too; offline used to model autos only.
  // Abyss foes are Champion-rank at the tier's health multiplier, matching what makeAbyssEnemy
  // spawns live — the two must agree or a player's parked results would not match their played ones.
  // Hard-zone and Abyss foes are Champion-rank at x8 health, matching what makeHardEnemy and
  // makeAbyssEnemy spawn live. The two MUST agree: a parked result that does not match a played
  // one is the offline simulator lying about the game.
  const prof = hz ? zoneEnemyProfile(zone, enemyLevel, "hard", 8)
             : aPlus != null ? zoneEnemyProfile(zone, enemyLevel, abyssTierId(aPlus), 8)
             : zoneEnemyProfile(zone, enemyLevel);
  const eDps = (boss) => Math.max(1, prof.dps(boss) * (1 - mit) * (1 - sp.vers / 200) * lowLvlMult);
  const normalHp = (enemyLevel * 26 + 50) * prof.hpMult + 10;
  const bossHp = (enemyLevel * 26 + 50) * 2.2 * prof.hpMult + 10;

  let hp = Math.min(maxHp0, char.hp || maxHp0);
  let timeUsed = 0, kills = 0, xpGained = 0, goldGained = 0, died = false, killCount = c.kills || 0, guard = 0;
  // Potions are spent from the real stock, so an offline stint can run the player dry the way a
  // live one does. Copy the map first — `c` is a shallow clone of the caller's character.
  const autoPot = !!(c.upgrades && c.upgrades.autoPotion);
  let potionsDrunk = 0, lastPotionAt = -POTION_CD / 1000;   // first sip allowed immediately
  let abyssKilled = 0, hardKilled = 0; const abyssDrops = [], hardDrops = [], zoneDrops = [], hardSouls = {};
  const hzSoul = hz ? soulForZone(hz.id) : null;
  c.consumables = { ...(c.consumables || {}) };

  while (timeUsed < secs && guard++ < 500000) {
    const isBoss = killCount > 0 && (killCount + 1) % 10 === 0;
    const ehp = isBoss ? bossHp : normalHp;
    // Armoured archetypes turn player blows offline exactly as they do live (see the player-damage
    // branch of the combat tick), so an armoured creature genuinely takes longer to kill.
    const ktime = ehp / Math.max(1, dps * (1 - prof.mit));
    if (timeUsed + ktime > secs) break; // out of time, no death
    const incoming = Math.floor(ktime * eDps(isBoss));
    const leechHeal = leechPct > 0 ? Math.floor(leechPct * ehp) : 0;
    let hpAfter = hp - incoming + leechHeal;
    // Auto-potion, exactly as the live tick runs it: below AUTO_POTION_HP, drink the best potion
    // owned, at most once every POTION_CD. Offline ignored this entirely, which mattered far more
    // once offline stopped under-reporting enemy damage — a player who survives live on potions was
    // dying offline for want of a mechanic they had already bought.
    // The cooldown runs on wall-clock, not per fight: at ~1.6s a kill, a per-kill budget would
    // round every sip away and the upgrade would do nothing.
    if (autoPot && hpAfter < maxHp0 * AUTO_POTION_HP) {
      let at = Math.max(lastPotionAt + POTION_CD / 1000, timeUsed);
      while (hpAfter < maxHp0 * AUTO_POTION_HP && at <= timeUsed + ktime) {
        const t = bestTier(c, "heal");
        if (t < 0) break;
        const key = conKey("heal", t);
        c.consumables = { ...c.consumables, [key]: c.consumables[key] - 1 };
        if (c.consumables[key] <= 0) delete c.consumables[key];
        hpAfter = Math.min(maxHp0, hpAfter + tierHeal(t));
        potionsDrunk++; lastPotionAt = at; at += POTION_CD / 1000;
      }
    }
    if (hpAfter <= 0) { died = true; break; } // defeated mid-fight
    hp = Math.min(maxHp0, hpAfter + Math.floor(maxHp0 * 0.02)); // survived → 2% heal on kill
    timeUsed += ktime; killCount++; kills++;

    const over = Math.max(0, c.level - zone.maxLevel);
    const rewardMult = Math.pow(0.85, over);
    let xpEarned = Math.floor((c.level * (isBoss ? 9 : 3) + 10) * rewardMult);
    if (c.race === "undead") xpEarned = Math.floor(xpEarned * 1.1);
    const _tb = townBonuses(c);
    xpEarned = Math.floor(xpEarned * (1 + _tb.xp) * auraXpMult(c));
    let gold = Math.floor(c.level * (isBoss ? 5 : 1) + 3);
    if (c.race === "human") gold = Math.floor(gold * 1.1);
    gold = Math.max(0, Math.floor(gold * 0.25 * rewardMult * (1 + _tb.gold) * auraGoldMult(c)));
    // At max level normal-mode rewards drop 95% — the endgame is meant to live in Hard Mode.
    // resolveDeath has always done this; simulateOffline never got the line, so a parked character
    // earned the pre-cap rate forever. That one omission made parking the most profitable activity
    // in the game by a factor of 33, and it is why item prices read as worthless next to a purse.
    // Loot is deliberately NOT cut here, matching resolveDeath, which cuts XP and gold only.
    // GOLD AND XP ARE NOT PAID PER KILL while parked — they arrive in hourly tranches after the
    // loop. What a kill still does is progress: it counts, it can drop, and it can kill you.
    //
    // THE DROP CAP. Five an hour, and the cap is checked BEFORE the roll rather than by trimming a
    // list afterwards: trimming would let a 12-hour stint roll 1,689 items and keep the first 60,
    // which quietly weights the kept ones toward the beginning of the night for no reason a player
    // could ever see. Refusing to roll once the hour is full is the same distribution, shorter.
    const dropBudget = Math.floor(timeUsed / 3600) * IDLE.dropsPerHour + IDLE.dropsPerHour;
    const roomForDrop = () => (hardDrops.length + abyssDrops.length + zoneDrops.length) < dropBudget;
    if (hz) {
      hardKilled++;
      // Rate and rarity are EXACTLY the live ones. Only the count is capped.
      if (roomForDrop() && Math.random() < 0.10 * 1.6 * (1 + _tb.drop)) {
        const rar = hz.dropIlvl >= 70 ? rollRarityForDungeon("stratholme") : rollRarityForZone(60);
        hardDrops.push(generateItem(hz.dropIlvl, rar, pickLootSlot(), c.cls));
      }
      // Souls are a crafting reagent, not wealth, and stay per-kill at the live rate.
      if (hzSoul && Math.random() < SOUL_ZONE_CHANCE) hardSouls[hzSoul.id] = (hardSouls[hzSoul.id] || 0) + 1;
    } else if (aPlus == null) {
      // Normal zones used to auto-SELL every offline drop, which made them a gold faucet on top of
      // the kill gold. They are kept now, under the same cap: a levelling player parked overnight
      // should come back to a few upgrades, not a wall of vendor trash converted into coin.
      if (roomForDrop()) {
        for (const it of rollLoot({ level: enemyLevel, isBoss, dungeonId: null, guaranteed: false, clsId: c.cls, dropMult: rewardMult * (1 + _tb.drop) })) {
          if (!roomForDrop()) break;
          zoneDrops.push(it);
        }
      }
    } else {
      abyssKilled++;
      if (roomForDrop() && Math.random() < 1 / ABYSS.killsPerDrop) {
        const rar = rarityById(Math.random() < ABYSS.legendaryChance ? "legendary" : "epic");
        abyssDrops.push(generateItem(ABYSS.dropIlvl, rar, pickLootSlot(), c.cls, aPlus));
      }
    }
  }

  // ---- the tranche ----
  // One payment for the whole stint, from the wall clock rather than from how many things died.
  // Partial hours pay pro rata, so a 90-minute absence is not worth the same as a 61-minute one.
  //
  // The clock is `secs` — time PARKED — not `timeUsed`, which is time spent swinging. The two
  // differ by a whole character's worth: timeUsed stops one kill short for a strong build
  // and barely leaves zero for a weak one, so paying on it would quietly restore the "better gear
  // earns more while away" rule this whole change exists to remove. Dying is the one thing that
  // shortens the stint: a character who falls at hour three is paid for three hours, and the spot
  // is switched off below, so the rest of the night pays nothing at all.
  {
    const spot = hz ? "hard" : aPlus != null ? "abyss" : "zone";
    const hours = (died ? timeUsed : secs) / 3600;
    goldGained = Math.floor(idleRate(IDLE.goldPerHour, spot) * hours);
    xpGained = Math.floor(idleRate(IDLE.xpPerHour, spot) * hours);
    c.xp = (c.xp || 0) + xpGained;
    while (c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level)) { c.xp -= xpForLevel(c.level); c.level++; }
    if (c.level >= MAX_LEVEL) {
      c.honorXp = (c.honorXp || 0) + c.xp; c.xp = 0;
      while (c.honorXp >= honorXpForLevel(c.honor || 0)) { c.honorXp -= honorXpForLevel(c.honor || 0); c.honor = (c.honor || 0) + 1; c.attrPoints = (c.attrPoints || 0) + 1; }
    }
  }
  c.gold = (c.gold || 0) + goldGained;
  c.kills = killCount;
  if (aPlus != null && abyssKilled) {
    const rec = c.abyss || { plus: 0, unlocked: 0, kills: {} };
    const kills2 = { ...(rec.kills || {}), [aPlus]: ((rec.kills || {})[aPlus] || 0) + abyssKilled };
    let unlocked = rec.unlocked || 0;
    if (kills2[aPlus] >= ABYSS.killGoal && aPlus >= unlocked && unlocked < ABYSS.maxPlus) unlocked = aPlus + 1;
    c.abyss = { ...rec, kills: kills2, unlocked };
  }
  if (hz && hardKilled) {
    const k = ((c.hardKills || {})[hz.id] || 0) + hardKilled;
    c.hardKills = { ...(c.hardKills || {}), [hz.id]: k };
    // The kill goal completes offline too. A player who parked in a hard zone overnight and came
    // back to an un-ticked zone would have farmed it for nothing.
    if (k >= hz.killGoal && !(c.hardZoneDone || {})[hz.id])
      c.hardZoneDone = { ...(c.hardZoneDone || {}), [hz.id]: true };
  }
  for (const id in hardSouls) c.souls = { ...(c.souls || {}), [id]: ((c.souls || {})[id] || 0) + hardSouls[id] };
  const kept = [...hardDrops, ...zoneDrops];
  if (kept.length) {
    const dep = depositItems(c, kept);
    c.inventory = dep.inventory; c.overflow = dep.overflow; c.gold = (c.gold || 0) + dep.gold;
  }
  if (abyssDrops.length) {
    // Through depositItems, so the bank cap, the overflow sale and the mail all behave exactly as
    // they do live rather than the drops appearing from nowhere.
    const dep = depositItems(c, abyssDrops);
    c.inventory = dep.inventory; c.overflow = dep.overflow; c.gold = (c.gold || 0) + dep.gold;
  }
  c.unlockedSkills = (SKILLS[c.cls] || []).filter((s) => s.unlockLevel <= c.level).map((s) => s.name);
  c.selectedSkills = padSelectedSkills(c, c.selectedSkills);
  c.hp = maxHpFor(c); // revive ready for play
  if (died) { c.offlineZoneId = null; c.offlineHardId = null; c.offlineAbyss = null; } // defeat pauses offline combat until re-enabled
  c.lastActive = Date.now();
  return { char: c, kills, xpGained, goldGained, leveledTo: c.level, died, potionsDrunk,
           abyssPlus: aPlus, hardZoneId: hz ? hz.id : null,
           gearKept: abyssDrops.length + hardDrops.length + zoneDrops.length,
           soulsFound: Object.values(hardSouls).reduce((a, b) => a + b, 0),
           secondsSimulated: Math.floor(timeUsed) };
};

// Predict how long (ms) until the character would die in offline combat, or null if they
// survive the full 12h cap. Death timing is deterministic, so this matches the real run.
const predictOfflineDeath = (char) => {
  if (!offlineSpot(char)) return null;
  const res = simulateOffline(char, OFFLINE_CAP_MS);
  if (res && res.died) return Math.max(1000, res.secondsSimulated * 1000);
  return null;
};

/* Rarity is expressed as a CLASS, not a hex. The colours in RARITIES are tuned
   for a black ground and four of the seven are unreadable on parchment; the
   theme decides the ink now, and the core data stays untouched because the
   server has no opinion about what colour an epic is. */
const rarClass = (r) => "rar-" + (typeof r === "string" ? r : (r && r.id) || "common");

function ItemCard({ item, children, compare, cls, onClick }) {
  const r = rarityById(item.rarity);
  const merged = { ...item.stats };
  if (item.enchant) for (const k in item.enchant) merged[k] = (merged[k] || 0) + item.enchant[k];
  const statLine = Object.entries(merged).filter(([, v]) => v > 0).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`).join(", ");
  const dmgLine = item.wdmg ? `${item.wdmg.min}–${item.wdmg.max} damage` : "";
  const bodyLine = [dmgLine, statLine].filter(Boolean).join(" · ") || "—";
  const delta = compare !== undefined && compare !== null ? itemScore(item, cls) - compare : null;
  return (
    <div className="item">
      <button className="item-tap" onClick={onClick} disabled={!onClick}>
        <span className="mark"><GameIcon icon={item.icon} imgKey={item.iconKey} size={24} /></span>
        <span className="item-body">
          <span className={`item-name ${rarClass(r)}`}>
            {item.enchant ? <Icon name="spark" size={11} /> : null}{item.name}{temperSuffix(item)}
          </span>
          <span className="item-meta">
            {slotById(item.slotId)?.name}{item.ilvl ? ` · ilvl ${item.ilvl}` : ""}{item.bound ? " · bound" : ""}
          </span>
          <span className="item-stats">{item.relicId ? "Relic" : bodyLine}</span>
          {item.relicDesc && <span className="item-note">{item.relicDesc}</span>}
          {item.enchant && <span className="item-note is-enchant">Enchant: {Object.entries(item.enchant).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`).join(", ")}</span>}
          {delta !== null && (
            <span className={`item-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-side"}`}>
              {delta > 0 ? `+${Math.round(delta)} better` : delta < 0 ? `${Math.round(delta)} worse` : "an even trade"}
            </span>
          )}
        </span>
      </button>
      <div className="item-acts">{children}</div>
    </div>
  );
}

/* `tone` replaces the old free-form colour: three meanings instead of a palette.
   Callers still pass `color` in a few places; it is ignored on purpose, because a
   button that can be any colour is how a screen ends up with nine of them. */
const MiniBtn = ({ onClick, children, tone, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className={`mini${tone === "warn" ? " is-warn" : tone === "gain" ? " is-gain" : ""}`}>{children}</button>
);

// WoW-style item tooltip popup — shows one item's full details; `actions` are optional buttons.
function ItemTooltip({ item, onClose, actions, onSocket }) {
  if (!item) return null;
  const r = rarityById(item.rarity);
  const merged = { ...item.stats }; if (item.enchant) for (const k in item.enchant) merged[k] = (merged[k] || 0) + item.enchant[k];
  const mainKeys = ["str", "agi", "int", "sta"];
  const secKeys = ["ap", "sp", "leech", "resil", "vers", "cdr", "csd", "crit", "haste"];
  const temperBonus = item.temperBonus || 0;
  const temperByStat = {};
  if (temperBonus > 0 && Array.isArray(item.lines)) for (const ln of item.lines) temperByStat[ln.stat] = (temperByStat[ln.stat] || 0) + temperBonus;
  const temperNote = (k) => temperByStat[k] ? <span style={{ color: "var(--bole)", fontSize: 9.5, fontWeight: 400 }}> (+{temperByStat[k]} ⚒️)</span> : null;
  return (
    <div onClick={onClose} className="veil is-over">
      <div onClick={(e) => e.stopPropagation()} className={`sheet is-rarity is-narrow ${rarClass(item.rarity)}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span className="mark"><GameIcon icon={item.icon} imgKey={item.iconKey} size={32} /></span>
          <div style={{ minWidth: 0 }}>
            <div className={rarClass(item.rarity)} style={{ fontWeight: 600, fontSize: "var(--step-0)", lineHeight: 1.15 }}>{item.enchant ? "✨ " : ""}{item.name}{temperSuffix(item)}</div>
            {/* The rank sits directly under the name, exactly as asked, and above the rarity line —
                where the piece came from is the first thing about an Abyss item that matters. */}
            {item.abyss != null && <div className="rar-epic" style={{ fontSize: 11, fontWeight: 600 }}>{abyssLabel(item.abyss)}</div>}
            <div className="item-meta">{r.name} · {slotById(item.slotId)?.name}</div>
          </div>
        </div>
        {item.ilvl ? <div style={{ color: "var(--gilt)", fontSize: 11.5, marginBottom: 5 }}>Item Level {item.ilvl}{item.artifact ? <span style={{ color: "var(--rubric)", marginLeft: 6 }}>· re-forges with your level</span> : null}{item.abyss ? <span style={{ color: "var(--rar-epic)", marginLeft: 6 }}>· secondaries roll {Math.round((abyssMult(item.abyss) - 1) * 100)}% higher</span> : null}</div> : null}
        {item.temper > 0 ? <div style={{ color: "var(--bole)", fontSize: 11, marginBottom: 5, fontWeight: 700 }}><Icon name="anvil" /> Tempered +{item.temper} <span style={{ color: "var(--bole)", fontWeight: 400 }}>· +{temperBonus} to each of its {item.lines?.length || 0} secondary line{(item.lines?.length || 0) === 1 ? "" : "s"}</span></div> : null}
        {(() => { const suf = suffixByMains(item.mains && item.mains.length ? item.mains : mainStatsOf(item)); return suf
          ? <div style={{ color: "var(--ink-soft)", fontSize: 10.5, marginBottom: 5 }}>{suf.name} <span style={{ color: "var(--ink-faint)" }}>— always {suf.desc}</span></div> : null; })()}
        {itemHasPower(item) && !itemPowerActive(item) && (
          <div style={{ color: "var(--bole)", fontSize: 10.5, marginBottom: 5 }}><Icon name="warn" /> {item.stats.sp > 0 ? "Spell" : "Attack"} Power inactive — two main stats</div>
        )}
        {socketsOf(item).length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <span style={{ color: "var(--ink-soft)", fontSize: 10.5 }}>Sockets</span>
            {socketsOf(item).map((gid, i) => { const g = gid && gemById(gid); return (
              <span key={i} onClick={onSocket ? (e) => { e.stopPropagation(); onSocket(item, i); } : undefined}
                title={g ? `${g.name} — ${g.desc}` : "Empty socket"}
                style={{ width: 19, height: 19, borderRadius: "50%", background: g ? "var(--raised)" : "var(--sunk)", border: `1.5px solid ${g ? rarityById(g.rarity).color : "var(--rule)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, cursor: onSocket ? "pointer" : "default" }}>{g ? g.icon : ""}</span>
            ); })}
            <span style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>({openSockets(item)} empty{onSocket ? " · tap to bond" : ""})</span>
          </div>
        )}
        {item.wdmg && <div style={{ color: "var(--bole)", fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}><Icon name="sword" /> {item.wdmg.min} – {item.wdmg.max} Damage</div>}
        {merged.armor > 0 && <div style={{ color: "var(--ink-soft)", fontSize: 12.5, marginBottom: 2 }}><Icon name="shield" /> {merged.armor} Armor</div>}
        <div style={{ borderTop: "1px solid var(--hairline)", margin: "7px 0", paddingTop: 6 }}>
          {mainKeys.filter((k) => merged[k] > 0).map((k) => <div key={k} style={{ color: "var(--ink)", fontSize: 12 }}>+{merged[k]} {STAT_LABEL[k]}{temperNote(k)}</div>)}
          {secKeys.filter((k) => merged[k] > 0).map((k) => <div key={k} style={{ color: "var(--ink-soft)", fontSize: 12 }}>+{merged[k]} {STAT_LABEL[k]}{temperNote(k)}</div>)}
          {mainKeys.concat(secKeys).every((k) => !(merged[k] > 0)) && !item.wdmg && merged.armor <= 0 && !item.relicDesc && <div style={{ color: "var(--ink-faint)", fontSize: 12 }}>No bonuses</div>}
          {item.relicDesc && <div style={{ color: item.relicColor || "var(--gilt)", fontSize: 12, lineHeight: 1.35 }}><Icon name="sword" /> {item.relicDesc}</div>}
          {item.enchant && <div style={{ color: "var(--rar-epic)", fontSize: 12, marginTop: 3 }}><Icon name="spark" /> Enchant: {Object.entries(item.enchant).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`).join(", ")}</div>}
        </div>
        <div style={{ color: "var(--ink-faint)", fontSize: 10.5 }}>Sell value: {item.value}g</div>
        {/* The actions carry a `color` from their call sites — four different hexes
            describing "you can do this". They are all the same kind of thing, so
            they are all written the same way; only a destructive one is marked. */}
        {actions && actions.length > 0 && (
          <div className="sheet-acts" style={{ flexWrap: "wrap" }}>
            {actions.map((a, i) => (
              <button key={i} onClick={() => { a.onClick(); if (!a.keepOpen) onClose(); }}
                className={`go${a.tone === "warn" ? "" : " is-quiet"}`} style={{ minWidth: 78 }}>{a.label}</button>
            ))}
          </div>
        )}
        <button onClick={onClose} className="link" style={{ display: "block", margin: "10px auto 0" }}>Close</button>
      </div>
    </div>
  );
}

// ============================================================
// CHARACTER SELECT
// ============================================================
function CharacterSelectScreen({ saves, onSelect, onNew, onDelete, exportData, importData }) {
  const [showBackup, setShowBackup] = useState(false);
  const [importText, setImportText] = useState("");
  const [exportCode, setExportCode] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDel, setConfirmDel] = useState(null); // index pending deletion confirmation

  const doExport = () => { const c = exportData(); setExportCode(c); setShowBackup(true); try { navigator.clipboard?.writeText(c); setMsg("Backup code copied to clipboard"); } catch { setMsg("Backup code generated"); } };
  const doImport = () => { if (!importText.trim()) return; const ok = importData(importText); setMsg(ok ? "Save restored!" : "Invalid backup code"); if (ok) setImportText(""); };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sunk)", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{ fontSize: 46, marginBottom: 6 }}>⚔️</div>
        <h1 style={{ color: "var(--gilt)", fontFamily: "Georgia, serif", fontSize: 28, margin: 0, textShadow: "0 0 22px var(--bole)" }}>Realms of Eldoria</h1>
        <p style={{ color: "var(--verdigris)", margin: "6px 0 0", fontSize: 13 }}>An Idle Fantasy Adventure</p>
      </div>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {saves.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ color: "var(--ink-soft)", fontSize: 12, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Your Characters</div>
            {saves.map((save, i) => {
              const cls = CLASSES.find((c) => c.id === save.cls);
              const race = RACES.find((r) => r.id === save.race);
              return (
                <div key={save.id || i} onClick={() => onSelect(i)} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "14px 16px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#f0b429")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2550")}>
                  <div style={{ fontSize: 30 }}>{cls?.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "var(--ink)", fontWeight: 700, fontSize: 15 }}>{save.name}</div>
                    <div style={{ color: cls?.color, fontSize: 12 }}>Level {save.level} {race?.name} {cls?.name}</div>
                    <div style={{ color: "var(--ink-faint)", fontSize: 11 }}>{ZONES.find((z) => z.id === save.currentZoneId)?.name} · {save.kills || 0} kills · 💰{save.gold || 0}g</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDel(i); }} style={{ background: "none", border: "1px solid var(--rubric)", borderRadius: 4, color: "var(--rubric)", padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>Delete</button>
                </div>
              );
            })}
          </div>
        )}
        {confirmDel !== null && saves[confirmDel] && (
          <div onClick={() => setConfirmDel(null)} className="veil">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-warn">
              <div className="sheet-mark"><EmojiIcon emoji="⚠️" size={22} /></div>
              <div className="sheet-title">Delete Character?</div>
              <div style={{ color: "var(--ink)", fontSize: 13, lineHeight: 1.55, textAlign: "center", marginBottom: 16 }}>You are about to permanently delete <b>{saves[confirmDel].name}</b> (Level {saves[confirmDel].level} {CLASSES.find((c) => c.id === saves[confirmDel].cls)?.name}). This <b>cannot be undone</b> — all progress will be lost forever.</div>
              <div className="sheet-acts">
                <button onClick={() => setConfirmDel(null)} className="go is-quiet">Cancel</button>
                <button onClick={() => { const idx = confirmDel; setConfirmDel(null); onDelete(idx); }} className="go">Delete Forever</button>
              </div>
            </div>
          </div>
        )}
        <button onClick={onNew} className="go"><Icon name="spark" /> Create New Character</button>

        {/* ---------------- Save data ---------------- */}
        <div style={{ marginTop: 26, background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Save Data</div>
          <div style={{ color: "var(--ink-faint)", fontSize: 11, marginBottom: 12 }}>Your characters are saved on this device. Export a backup code to keep a copy or move your progress to another device.</div>

          {/* Backup & restore — local export/import */}
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={doExport} style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--verdigris)", borderRadius: 7, color: "var(--ink-soft)", fontSize: 12, fontWeight: 600, padding: "9px 8px", cursor: "pointer" }}>⬆ Export backup</button>
              <button onClick={() => setShowBackup((v) => !v)} style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 7, color: "var(--ink-soft)", fontSize: 12, fontWeight: 600, padding: "9px 8px", cursor: "pointer" }}>⬇ Restore</button>
            </div>
            {showBackup && (
              <div>
                {exportCode && (
                  <textarea readOnly value={exportCode} onFocus={(e) => e.target.select()} style={{ width: "100%", height: 54, background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 6, color: "var(--ink-soft)", fontSize: 10, padding: 8, marginBottom: 8, boxSizing: "border-box", resize: "none", fontFamily: "ui-monospace, monospace" }} />
                )}
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste a backup code here, then tap Restore…" style={{ width: "100%", height: 54, background: "var(--sunk)", border: "1px solid var(--ink-faint)", borderRadius: 6, color: "var(--ink)", fontSize: 10, padding: 8, boxSizing: "border-box", resize: "none", fontFamily: "ui-monospace, monospace" }} />
                <button onClick={doImport} className="go is-quiet">Restore from code</button>
                <div style={{ color: "var(--ink-faint)", fontSize: 10, marginTop: 6 }}><Icon name="warn" /> Restoring replaces the characters currently on this device.</div>
              </div>
            )}
            {msg && <div style={{ color: "var(--gilt)", fontSize: 11, marginTop: 8, textAlign: "center" }}>{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CREATE CHARACTER
// ============================================================
function CreateCharacterScreen({ onCreate, onBack }) {
  const [step, setStep] = useState(0);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedRace, setSelectedRace] = useState(null);
  const [name, setName] = useState("");

  return (
    <div style={{ minHeight: "100vh", background: "var(--sunk)", padding: "24px 16px", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <button onClick={step === 0 ? onBack : () => setStep((s) => s - 1)} style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 20, cursor: "pointer" }}>←</button>
        <h2 style={{ color: "var(--gilt)", fontFamily: "Georgia, serif", margin: 0 }}>{step === 0 ? "Choose Your Class" : step === 1 ? "Choose Your Race" : "Name Your Hero"}</h2>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {["Class", "Race", "Name"].map((s, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--gilt)" : "var(--raised)" }} />)}
      </div>

      {step === 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {CLASSES.map((cls) => (
            <div key={cls.id} onClick={() => { setSelectedClass(cls.id); setStep(1); }} style={{ background: "var(--raised)", border: "2px solid var(--verdigris)", borderRadius: 10, padding: 14, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 30, marginBottom: 4 }}><EmojiIcon emoji={cls.icon} /></div>
              <div style={{ color: cls.color, fontWeight: 700, fontSize: 13 }}>{cls.name}</div>
              <div style={{ color: "var(--ink-faint)", fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>{cls.desc}</div>
              <div style={{ color: "var(--gilt)", fontSize: 10, marginTop: 6, fontStyle: "italic" }}>{cls.passive}</div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {RACES.map((race) => (
            <div key={race.id} onClick={() => { setSelectedRace(race.id); setStep(2); }} style={{ background: "var(--raised)", border: "2px solid var(--verdigris)", borderRadius: 10, padding: 14, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}><EmojiIcon emoji={race.icon} /></div>
              <div style={{ color: "var(--ink)", fontWeight: 700, fontSize: 13 }}>{race.name}</div>
              <Faction faction={race.faction} />
              <div style={{ color: "var(--ink-faint)", fontSize: 10, marginTop: 6, lineHeight: 1.4 }}>{race.bonus}</div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 10, padding: 20, marginBottom: 18 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 40 }}>{CLASSES.find((c) => c.id === selectedClass)?.icon}</div>
              <div style={{ color: "var(--gilt)", fontWeight: 700 }}>{RACES.find((r) => r.id === selectedRace)?.name} {CLASSES.find((c) => c.id === selectedClass)?.name}</div>
              <Faction faction={RACES.find((r) => r.id === selectedRace)?.faction} />
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter character name..." maxLength={20}
              style={{ width: "100%", background: "var(--sunk)", border: "1px solid var(--ink-faint)", borderRadius: 6, color: "var(--ink)", padding: "12px 14px", fontSize: 16, outline: "none", boxSizing: "border-box" }} />
          </div>
          <button disabled={name.trim().length < 2} onClick={() => onCreate(name.trim(), selectedClass, selectedRace)}
            style={{ width: "100%", background: name.trim().length >= 2 ? "var(--raised)" : "var(--raised)", border: `2px solid ${name.trim().length >= 2 ? "var(--gilt)" : "var(--ink)"}`, borderRadius: 10, color: name.trim().length >= 2 ? "var(--gilt)" : "var(--ink-faint)", fontSize: 16, fontWeight: 700, padding: 16, cursor: name.trim().length >= 2 ? "pointer" : "default", fontFamily: "Georgia, serif" }}><Icon name="sword" /> Enter Eldoria</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN GAME SCREEN
// ============================================================
// ============================================================
// TOWN HUB — interactive map that replaces the tab bar
// ============================================================
/* What the market holds. Data rather than five hand-written buttons, for the same
   reason TOWN_SPOTS is data: a destination that only exists inside a JSX callback
   cannot be checked by anything. lessons.test.cjs reads this to prove every
   panel-visit lesson waits on a panel the game can actually open. */
const MARKET_STALLS = [
  { dest: "vendor",       icon: "coin",   name: "Vendor",           blurb: "Potions and scrolls, and a buyer for what you no longer carry" },
  { dest: "supply",       icon: "flask",  name: "Supply Master",    blurb: "Bottles, flasks and blank scrolls for the crafting hall" },
  { dest: "temper",       icon: "anvil",  name: "Tempering Forge",  blurb: "Strengthen a piece, or reroll what it rolled \u2014 the deepest gold sink there is" },
  { dest: "gambitshop",   icon: "target", name: "Gambit Shop",      blurb: "Standing orders, bought by the roll" },
  { dest: "battlemaster", icon: "shield", name: "Battlemaster",     blurb: "Arena tokens only \u2014 set gear, runes and tickets" },
];

const TOWN_SPOTS = [
  { dest: "world",     name: "Adventure Gate", x: 180, y: 62,  type: "gate",      ldy: 40 },
  { dest: "bag",       name: "Bank",           x: 74,  y: 152, type: "bank",      ldy: 36 },
  { dest: "market",    name: "Market",         x: 286, y: 152, type: "market",    ldy: 36 },
  { dest: "gear",      name: "Armory",         x: 74,  y: 262, type: "armory",    ldy: 36 },
  { dest: "hero",      name: "Hero's Statue",  x: 180, y: 258, type: "statue",    ldy: 40 },
  { dest: "auction",   name: "Auction House",  x: 286, y: 262, type: "auction",   ldy: 36 },
  { dest: "prof",      name: "Crafting Hall",  x: 74,  y: 372, type: "forge",     ldy: 36 },
  { dest: "quests",    name: "Tavern",         x: 286, y: 372, type: "tavern",    ldy: 36 },
  { dest: "classhall", name: "Class Hall",     x: 180, y: 446, type: "temple",    ldy: 38 },
  { dest: "guild",     name: "The Guild",      x: 74,  y: 546, type: "guild",     ldy: 40 },
  { dest: "arena",     name: "Arena",          x: 286, y: 546, type: "colosseum", ldy: 44 },
];
const INK = "var(--ink)";
function House({ roof = "var(--bole)", wall = "var(--raised)" }) {
  return (<>
    <rect x={-24} y={-6} width={48} height={30} rx={1.5} fill={wall} stroke={INK} strokeWidth={2} />
    <path d="M-29,-6 L0,-27 L29,-6 Z" fill={roof} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
    <rect x={-6} y={8} width={12} height={16} rx={1} fill="var(--bole)" stroke="var(--ink)" strokeWidth={1.4} />
    <rect x={-19} y={1} width={8} height={8} fill="var(--sunk)" stroke="var(--ink)" strokeWidth={1.1} />
    <rect x={11} y={1} width={8} height={8} fill="var(--sunk)" stroke="var(--ink)" strokeWidth={1.1} />
  </>);
}
function BuildingArt({ type }) {
  switch (type) {
    case "gate": return (<>
      <rect x={-38} y={-28} width={16} height={42} fill="var(--raised)" stroke={INK} strokeWidth={2} />
      <rect x={22} y={-28} width={16} height={42} fill="var(--raised)" stroke={INK} strokeWidth={2} />
      <rect x={-38} y={-34} width={76} height={9} fill="var(--sunk)" stroke={INK} strokeWidth={2} />
      <path d="M-20,14 L-20,-10 Q-20,-22 0,-22 Q20,-22 20,-10 L20,14 Z" fill="var(--sunk)" stroke={INK} strokeWidth={1.8} />
      {[-38, -25, 17, 30].map((bx, i) => <rect key={i} x={bx} y={-40} width={8} height={7} fill="var(--raised)" stroke={INK} strokeWidth={1.3} />)}
      <path d="M0,-40 L0,-52" stroke={INK} strokeWidth={1.6} />
      <path d="M0,-52 L13,-48 L0,-44 Z" fill="var(--rubric)" stroke={INK} strokeWidth={0.8} />
    </>);
    case "bank": return (<>
      <House roof="var(--ink-soft)" />
      <circle cx={0} cy={-13} r={5.5} fill="var(--gilt)" stroke={INK} strokeWidth={1.3} />
      <circle cx={0} cy={-13} r={2.4} fill="none" stroke={INK} strokeWidth={0.9} />
    </>);
    case "market": return (<>
      <rect x={-26} y={6} width={52} height={18} fill="var(--sunk)" stroke={INK} strokeWidth={2} />
      <rect x={-26} y={-20} width={4} height={28} fill="var(--bole)" />
      <rect x={22} y={-20} width={4} height={28} fill="var(--bole)" />
      <path d="M-30,-20 L30,-20 L26,-7 L-26,-7 Z" fill="var(--raised)" stroke={INK} strokeWidth={2} />
      {[-26, -10, 6, 22].map((sx, i) => <path key={i} d={`M${sx},-20 L${sx - 2},-7 L${sx + 6},-7 L${sx + 8},-20 Z`} fill="var(--rubric)" />)}
      <rect x={-17} y={12} width={11} height={11} fill="var(--bole)" stroke={INK} strokeWidth={1} />
      <rect x={6} y={12} width={11} height={11} fill="var(--bole)" stroke={INK} strokeWidth={1} />
    </>);
    case "armory": return (<>
      <House roof="var(--bole)" />
      <path d="M0,-19 L6,-16.5 L6,-11 Q6,-7 0,-4 Q-6,-7 -6,-11 L-6,-16.5 Z" fill="var(--hairline)" stroke={INK} strokeWidth={1.3} />
      <path d="M-4,-16 L4,-8 M4,-16 L-4,-8" stroke={INK} strokeWidth={1.2} />
    </>);
    case "auction": return (<>
      <House roof="var(--bole)" />
      <path d="M0,-27 L0,-9" stroke={INK} strokeWidth={1.4} />
      <path d="M0,-27 L11,-24 L8,-20 L11,-16 L0,-18 Z" fill="var(--bole)" stroke={INK} strokeWidth={0.8} />
    </>);
    case "forge": return (<>
      <House roof="var(--ink-soft)" />
      <rect x={11} y={-27} width={9} height={13} fill="var(--bole)" stroke={INK} strokeWidth={1.3} />
      <circle cx={15} cy={-31} r={3} fill="var(--hairline)" opacity={0.75} />
      <circle cx={18} cy={-37} r={4} fill="var(--hairline)" opacity={0.5} />
      <rect x={-6} y={9} width={12} height={15} rx={1} fill="var(--rubric)" stroke={INK} strokeWidth={1.3} />
      <path d="M-18,-9 L-8,-9 L-10,-5 L-16,-5 Z" fill="var(--sunk)" stroke={INK} strokeWidth={0.7} />
    </>);
    case "tavern": return (<>
      <House roof="var(--bole)" />
      <rect x={-19} y={1} width={8} height={8} fill="var(--rubric)" stroke="var(--ink)" strokeWidth={1.1} />
      <rect x={11} y={1} width={8} height={8} fill="var(--rubric)" stroke="var(--ink)" strokeWidth={1.1} />
      <path d="M24,-8 L32,-8 L32,2" stroke={INK} strokeWidth={1.3} fill="none" />
      <rect x={27} y={2} width={10} height={9} rx={1} fill="var(--raised)" stroke={INK} strokeWidth={1} />
      <rect x={29.5} y={4.5} width={4} height={4} fill="var(--bole)" />
    </>);
    case "temple": return (<>
      <rect x={-30} y={23} width={60} height={5} fill="var(--raised)" stroke={INK} strokeWidth={1.5} />
      <rect x={-27} y={3} width={54} height={20} fill="var(--raised)" stroke={INK} strokeWidth={2} />
      {[-22, -11, 0, 11, 22].map((cx, i) => <rect key={i} x={cx - 2} y={3} width={4} height={20} fill="var(--raised)" stroke={INK} strokeWidth={0.9} />)}
      <path d="M-31,3 L0,-18 L31,3 Z" fill="var(--raised)" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
    </>);
    case "statue": return (<>
      <rect x={-20} y={17} width={40} height={9} fill="var(--raised)" stroke={INK} strokeWidth={2} />
      <rect x={-13} y={5} width={26} height={13} fill="var(--raised)" stroke={INK} strokeWidth={2} />
      <path d="M-6,5 Q-9,-6 -4,-6 L4,-6 Q9,-6 6,5 Z" fill="var(--sunk)" stroke={INK} strokeWidth={1.5} />
      <circle cx={0} cy={-11} r={5} fill="var(--sunk)" stroke={INK} strokeWidth={1.5} />
      <path d="M4,-4 L13,-20" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M13,-20 L13,-32" stroke="var(--ink-soft)" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M9,-20 L17,-20" stroke={INK} strokeWidth={1.8} />
    </>);
    case "guild": return (<>
      <rect x={-30} y={-20} width={60} height={40} rx={3} fill="var(--raised)" stroke={INK} strokeWidth={2.4} />
      <path d="M-30,-20 L0,-34 L30,-20 Z" fill="var(--sunk)" stroke={INK} strokeWidth={2} />
      <path d="M0,-12 L10,-6 L10,8 L0,14 L-10,8 L-10,-6 Z" fill="var(--bole)" stroke={INK} strokeWidth={1.8} />
      <path d="M0,-12 L0,14 M-10,1 L10,1" stroke={INK} strokeWidth={1.2} />
    </>);
    case "colosseum": return (<>
      <ellipse cx={0} cy={0} rx={46} ry={27} fill="var(--raised)" stroke={INK} strokeWidth={2.4} />
      <ellipse cx={0} cy={-3} rx={28} ry={14} fill="var(--sunk)" stroke={INK} strokeWidth={1.6} />
      {[-32, -18, -4, 10, 24].map((ax, i) => <path key={i} d={`M${ax},15 Q${ax + 5},6 ${ax + 10},15`} fill="var(--sunk)" stroke={INK} strokeWidth={1} />)}
      <path d="M-42,-22 L-42,-36 L-30,-32 L-42,-28" fill="var(--rubric)" stroke={INK} strokeWidth={0.9} />
      <path d="M42,-22 L42,-36 L30,-32 L42,-28" fill="var(--verdigris)" stroke={INK} strokeWidth={0.9} />
    </>);
    default: return <House />;
  }
}
function TownHub({ onEnter, highlight, charLevel = 1 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 6px 12px" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 440 }}>
        <svg viewBox="0 0 360 620" style={{ width: "100%", display: "block" }} role="img" aria-label="Town map">
          <defs>
            <radialGradient id="parch" cx="50%" cy="42%" r="72%">
              <stop offset="0%" stopColor="var(--raised)" />
              <stop offset="72%" stopColor="var(--ground)" />
              <stop offset="100%" stopColor="var(--ground)" />
            </radialGradient>
            <style>{`.tspot{cursor:pointer} .tspot:active{opacity:.8} @keyframes townglow{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
          </defs>
          <path d="M12,10 Q8,20 14,32 L10,120 Q16,132 11,150 L14,300 Q9,320 13,360 L10,470 Q15,500 12,540 L14,600 Q30,606 60,602 L150,606 Q200,602 250,606 L320,602 Q346,606 348,588 L344,470 Q350,430 346,400 L349,220 Q345,180 348,150 L345,60 Q349,30 344,14 Q320,8 290,12 L200,8 Q140,12 90,9 Z"
            fill="url(#parch)" stroke="var(--rule)" strokeWidth={3} />
          <path d="M180,90 L180,560 M74,152 L286,152 M74,262 L286,262 M74,372 L286,372" stroke="var(--hairline)" strokeWidth={6} strokeLinecap="round" opacity={0.55} />
          <path d="M180,90 L180,560 M74,152 L286,152 M74,262 L286,262 M74,372 L286,372" stroke="var(--hairline)" strokeWidth={1.4} strokeDasharray="2 5" opacity={0.7} />
          <g transform="translate(324,42)" opacity={0.75}>
            <circle r={13} fill="none" stroke={INK} strokeWidth={1} />
            <path d="M0,-13 L3,0 L0,13 L-3,0 Z" fill="var(--rubric)" stroke={INK} strokeWidth={0.6} />
            <path d="M-13,0 L0,3 L13,0 L0,-3 Z" fill="var(--raised)" stroke={INK} strokeWidth={0.6} />
            <text x={0} y={-15} textAnchor="middle" fontSize={7} fontWeight="700" fill={INK}>N</text>
          </g>
          {TOWN_SPOTS.map((s) => {
            const hot = highlight && s.dest === highlight;
            const locked = s.dest === "auction" && charLevel < AH_ECON.unlockLevel;
            const lw = Math.max(40, s.name.length * 5.9 + 14);
            return (
              <g key={s.dest} className="tspot" onClick={() => onEnter(s.dest)} role="button" aria-label={s.name} style={{ opacity: locked ? 0.55 : 1 }}>
                {hot && <ellipse cx={s.x} cy={s.y - 2} rx={44} ry={38} fill="none" stroke="var(--rubric)" strokeWidth={2} strokeDasharray="5 4" style={{ animation: "townglow 1.1s ease-in-out infinite" }} />}
                <g transform={`translate(${s.x},${s.y})`}><BuildingArt type={s.type} /></g>
                {locked && <g transform={`translate(${s.x - 8},${s.y - 10})`}><Icon name="lock" size={16} /></g>}
                <g transform={`translate(${s.x},${s.y + s.ldy})`}>
                  <rect x={-lw / 2} y={-9} width={lw} height={16} rx={3} fill={hot ? "var(--ink)" : "var(--raised)"} stroke={hot ? "var(--rubric)" : INK} strokeWidth={1.2} />
                  <text x={0} y={2.5} textAnchor="middle" fontSize={10} fontWeight="600" fontFamily="var(--serif)" fill={hot ? "var(--raised)" : "var(--ink)"}>{(hot ? "▸ " : "") + (locked ? `${s.name} · Lv${AH_ECON.unlockLevel}` : s.name)}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ color: "var(--ink-faint)", fontSize: 10.5, marginTop: 8, textAlign: "center" }}>Tap a building to enter · the Statue opens your Hero</div>
    </div>
  );
}
// Which room a profession opens, and what the row says it will do. This lived as
// five if/else branches inside the row and five more colour-tinted hints beside
// the name; it is data about the UI, so it sits with the UI rather than in the
// core's PROFESSIONS table, which knows nothing about tabs.
const PROF_ROOM = { mining: "gather", herbalism: "gather", salvage: "salvage",
                    armorsmith: "forge", alchemy: "brewery", enchanting: "enchanting" };
const PROF_VERB = { mining: "mine", herbalism: "gather", salvage: "salvage",
                    armorsmith: "forge", alchemy: "brew", enchanting: "enchant" };

function GameScreen({ character: initChar, onSave, onBack }) {
  const [char, setChar] = useState(() => normalizeChar(initChar));
  const [tab, setTabRaw] = useState("town");
  // Every panel the player opens is recorded once, on `c.seen`. Lessons that only ask a player to
  // LOOK at a system read this, so a new lesson costs one line in the table rather than a flag
  // threaded through its screen — the old tutorial needed a bespoke field per step, which is why
  // it only ever covered six of them.
  const setTab = useCallback((t) => {
    setTabRaw(t);
    const c = charRef.current;
    if (c && t && !(c.seen || {})[t]) commitChar({ ...c, seen: { ...(c.seen || {}), [t]: true } });
  }, []);
  const navHistory = useRef([]);      // screen history for the back arrow
  const backNav = useRef(false);      // true while a back-navigation is in progress
  const lastTabRef = useRef("town");
  const [lastHard, setLastHard] = useState(null); // last Hard Mode instance entered {id, kind}
  const [showSettings, setShowSettings] = useState(false);
  const [worldTab, setWorldTab] = useState("zones");
  const [heroTab, setHeroTab] = useState("stats");
  const [bagTab, setBagTabRaw] = useState("equipment");
  // The Bank's sub-tabs are panels too — Gems in particular is a whole system that has no top-level
  // tab, so a lesson keyed on it would otherwise never be satisfiable. Same recorder as setTab.
  const setBagTab = useCallback((t) => {
    setBagTabRaw(t);
    const c = charRef.current;
    if (c && t && !(c.seen || {})[t]) commitChar({ ...c, seen: { ...(c.seen || {}), [t]: true } });
  }, []);
  // Track screen history so the back arrow returns to the previous screen (not always Town)
  useEffect(() => {
    if (lastTabRef.current !== tab) {
      if (backNav.current) backNav.current = false;
      else { navHistory.current.push(lastTabRef.current); if (navHistory.current.length > 40) navHistory.current.shift(); }
      lastTabRef.current = tab;
    }
  }, [tab]);
  const goBack = () => {
    if (navHistory.current.length > 0) { backNav.current = true; setTab(navHistory.current.pop()); }
    else setTab("town");
  };
  const [sellOpen, setSellOpen] = useState(false);
  const [attrWithGear, setAttrWithGear] = useState(true);
  const [promo, setPromo] = useState("");
  const [combatLog, setCombatLog] = useState([{ text: "🌄 Your adventure begins..." }]);
  const [battle, setBattle] = useState(null);
  const [notification, setNotification] = useState(null);
  const [lastLoot, setLastLoot] = useState(null);
  const [ahView, setAhView] = useState("browse"); // browse | sell | mine
  const [srvListings, setSrvListings] = useState([]); // buyable (server, phantom + other players)
  const [srvMine, setSrvMine] = useState([]);         // my active listings (server)
  const [srvMail, setSrvMail] = useState([]);         // my uncollected mail (server)
  const [ahErr, setAhErr] = useState(null);
  const [ahBusy, setAhBusy] = useState(false);
  const [temperSel, setTemperSel] = useState(null); // selected item id
  const [temperMode, setTemperMode] = useState("temper"); // temper | reroll
  const [temperProtect, setTemperProtect] = useState(false);
  const [ahCat, setAhCat] = useState("gear");      // gear | mat  (browse + sell filter)
  const [ahFilters, setAhFilters] = useState({ text: "", stats: [], ilvlMin: "", ilvlMax: "", slot: "", rMin: "", rMax: "" });
  const [ahSell, setAhSell] = useState(null);      // { kind:'gear', item } | { kind:'mat'|'drop', id }
  const [ahPrice, setAhPrice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [lastPotion, setLastPotion] = useState(0);
  const [offlineReport, setOfflineReport] = useState(null);
  const [compareItem, setCompareItem] = useState(null);
  const [compareSlot, setCompareSlot] = useState(null); // which equipped slot to compare against (rogue weapon → main/off hand)
  useEffect(() => { setCompareSlot(null); }, [compareItem]);
  const [tooltip, setTooltip] = useState(null); // { item, actions }
  const showItem = (item, actions = []) => setTooltip({ item, actions });
  const [gatherId, setGatherId] = useState(null);
  const [gatherNode, setGatherNode] = useState(null);
  const gatherNodeRef = useRef(null);
  const [gatherTierIdx, setGatherTierIdx] = useState(0);
  const gatherTierRef = useRef(0);
  const selectGatherTier = (idx) => { gatherTierRef.current = idx; setGatherTierIdx(idx); setNode(makeGatherNode(gatherId, charRef.current.professions[gatherId]?.level || 1, idx)); commitChar({ ...charRef.current, gatherTier: { ...(charRef.current.gatherTier || {}), [gatherId]: idx } }); };
  const [gatherFlash, setGatherFlash] = useState("");
  const [lastDungeonId, setLastDungeon] = useState(null); // remembers the dungeon/raid you were just in, to offer a re-run
  const [forgeSlot, setForgeSlot] = useState("chest");
  const [forgeOre, setForgeOre] = useState(0);
  const [brewPotionId, setBrewPotionId] = useState("heal");
  const [brewHerbIdx, setBrewHerbIdx] = useState(0);
  const [enchantSlot, setEnchantSlot] = useState("weapon");
  const [matsOpen, setMatsOpen] = useState(false);
  const [dropsOpen, setDropsOpen] = useState(false);
  const [bestiarySel, setBestiarySel] = useState(null);
  const [bestiaryMode, setBestiaryMode] = useState("normal"); // "normal" | "hard" (Bestiary stat preview)
  const [trainClass, setTrainClass] = useState(null); // class whose trainable skills are being viewed
  const [venExchange, setVenExchange] = useState(""); // Ven→gold exchange amount (premium shop)
  const [socketPick, setSocketPick] = useState(null); // { item, idx } — choosing a gem for a socket
  const [reforgeConfirm, setReforgeConfirm] = useState(null); // { item, idx } — confirming a socket reforge
  const [gachaResults, setGachaResults] = useState(null); // last gacha pull results (modal)
  const [gambitShopTab, setGambitShopTab] = useState("roll");
  const [gambitSkill, setGambitSkill] = useState(null); // skill currently being edited in the gambit screen
  const [gambitMode, setGambitMode] = useState("skill"); // "skill" | "general"
  const [difficulty, setDifficulty] = useState("normal"); // "normal" | "hard" (Adventure Gate toggle)
  const [resetPrompt, setResetPrompt] = useState(null); // dungeon pending reset-ticket confirmation
  const [enchantConfirm, setEnchantConfirm] = useState(null); // enchant that would put an item's Power dormant
  const [socketConfirm, setSocketConfirm] = useState(null);   // gem that would put an item's Power dormant
  const [supplyQty, setSupplyQty] = useState(1);
  const [vendorQty, setVendorQty] = useState(1);
  const [boardZone, setBoardZone] = useState("any");
  // ---------- Gambits ----------
  const gambitRoll = (n) => {
    const c = charRef.current;
    if ((c.level || 1) < GAMBIT_UNLOCK_LEVEL) { showNotif(`Gambits unlock at level ${GAMBIT_UNLOCK_LEVEL}`); return; }
    const cost = n === 10 ? GAMBIT_ROLL10_COST : GAMBIT_ROLL_COST;
    if (c.gold < cost) { showNotif(`Need ${cost.toLocaleString()}g for ${n} roll${n > 1 ? "s" : ""}`); return; }
    const pool = ALL_GAMBITS.filter((x) => gambitAccessible(c, x.id)); // never roll skills you can't use
    const owned = { ...(c.gambits.owned || {}) }, shards = { ...(c.gambits.shards || {}) };
    const results = [];
    for (let i = 0; i < n; i++) { const g = rollOneGambit(pool); const dup = !!owned[g.id]; if (dup) shards[g.id] = (shards[g.id] || 0) + 1; else owned[g.id] = true; results.push({ id: g.id, dup }); }
    commitChar({ ...c, gold: c.gold - cost, gambits: { ...c.gambits, owned, shards } });
    setGachaResults(results);
  };
  const shardTotal = (c) => Object.values(c.gambits?.shards || {}).reduce((s, n) => s + n, 0);
  const exchangeShards = (targetId) => {
    const c = charRef.current;
    if (c.gambits.owned?.[targetId]) { showNotif("Already unlocked"); return; }
    if (shardTotal(c) < SHARD_EXCHANGE) { showNotif(`Need ${SHARD_EXCHANGE} shards`); return; }
    const shards = { ...(c.gambits.shards || {}) };
    let need = SHARD_EXCHANGE;
    for (const id of Object.keys(shards).sort((a, b) => shards[b] - shards[a])) { if (need <= 0) break; const take = Math.min(shards[id], need); shards[id] -= take; need -= take; if (shards[id] <= 0) delete shards[id]; }
    commitChar({ ...c, gambits: { ...c.gambits, shards, owned: { ...(c.gambits.owned || {}), [targetId]: true } } });
    showNotif(`✨ Unlocked ${gambitById(targetId)?.label}!`);
  };
  const gambitSlotsFor = (c, slotNo) => (c.gambits?.slots?.[slotNo]) || 1;
  const buyGambitSlot = (slotNo) => {
    const c = charRef.current;
    if (gambitSlotsFor(c, slotNo) >= 2) { showNotif("Already at 2 gambits"); return; }
    if ((c.ven || 0) < GAMBIT_SLOT_VEN) { showNotif(`Costs ${GAMBIT_SLOT_VEN} 💎 Ven`); return; }
    commitChar({ ...c, ven: c.ven - GAMBIT_SLOT_VEN, gambits: { ...c.gambits, slots: { ...(c.gambits.slots || {}), [slotNo]: 2 } } });
    showNotif("🎯 Second gambit unlocked for this skill");
  };
  const setGambitPart = (slotNo, slotIdx, part, gambitId) => {
    const c = charRef.current;
    const rules = { ...(c.gambits.rules || {}) };
    const arr = [...(rules[slotNo] || [])];
    while (arr.length <= slotIdx) arr.push({ if: null, then: null });
    arr[slotIdx] = { ...arr[slotIdx], [part]: (arr[slotIdx]?.[part] === gambitId ? null : gambitId) };
    rules[slotNo] = arr;
    commitChar({ ...c, gambits: { ...c.gambits, rules } });
  };
  const applyAutoGambit = () => {
    const c = charRef.current;
    if ((c.level || 1) < GAMBIT_UNLOCK_LEVEL) { showNotif(`Gambits unlock at level ${GAMBIT_UNLOCK_LEVEL}`); return; }
    const plan = autoGambitPlan(c);
    const n = Object.keys(plan.rules).length;
    if (!n && !plan.general.length) { showNotif("No owned gambits fit your bar yet — roll a few first"); return; }
    const general = [...(c.gambits.general || [])];
    plan.general.forEach((r, i) => { if (i < generalSlotsFor(c)) general[i] = r; });
    commitChar({ ...c, gambits: { ...c.gambits, rules: { ...(c.gambits.rules || {}), ...plan.rules }, general } });
    showNotif(`⚙️ Auto-set ${n} gambit${n === 1 ? "" : "s"}`);
    addLog(`⚙️ Auto gambit: ${n} rule(s) written from your owned gambits`);
  };

  const generalSlotsFor = (c) => c.gambits?.generalSlots || 2;
  const buyGeneralSlot = () => {
    const c = charRef.current;
    const cur = generalSlotsFor(c);
    if (cur >= 5) { showNotif("Already at 5 general gambits"); return; }
    const cost = GENERAL_SLOT_COSTS[cur - 2]; // slot 3→100, 4→300, 5→500
    if ((c.ven || 0) < cost) { showNotif(`Costs ${cost} 💎 Ven`); return; }
    commitChar({ ...c, ven: c.ven - cost, gambits: { ...c.gambits, generalSlots: cur + 1 } });
    showNotif(`⚙️ General gambit ${cur + 1} unlocked`);
  };
  const setGeneralPart = (slotIdx, part, gambitId) => {
    const c = charRef.current;
    const arr = [...(c.gambits.general || [])];
    while (arr.length <= slotIdx) arr.push({ if: null, then: null });
    arr[slotIdx] = { ...arr[slotIdx], [part]: (arr[slotIdx]?.[part] === gambitId ? null : gambitId) };
    commitChar({ ...c, gambits: { ...c.gambits, general: arr } });
  };
  const moveGambitRule = (slotNo, idx, dir) => {
    const c = charRef.current; const cnt = gambitSlotsFor(c, slotNo);
    const arr = [...((c.gambits.rules || {})[slotNo] || [])];
    while (arr.length < cnt) arr.push({ if: null, then: null });
    const j = idx + dir; if (j < 0 || j >= cnt) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    commitChar({ ...c, gambits: { ...c.gambits, rules: { ...(c.gambits.rules || {}), [slotNo]: arr } } });
  };
  const moveGeneralRule = (idx, dir) => {
    const c = charRef.current; const cnt = generalSlotsFor(c);
    const arr = [...(c.gambits.general || [])];
    while (arr.length < cnt) arr.push({ if: null, then: null });
    const j = idx + dir; if (j < 0 || j >= cnt) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    commitChar({ ...c, gambits: { ...c.gambits, general: arr } });
  };
  const buySupply = (def) => {
    const c = charRef.current; const qty = Math.max(1, Math.min(999, Math.floor(supplyQty) || 1));
    const cost = def.price * qty;
    if (c.gold < cost) { showNotif(`Need ${cost}g for ${qty}× ${def.name}`); return; }
    commitChar({ ...c, gold: c.gold - cost, supplies: { ...(c.supplies || {}), [def.id]: ((c.supplies || {})[def.id] || 0) + qty } });
    showNotif(`Bought ${qty}× ${def.name}`);
  };
  // grant XP + handle level-ups (used by quests; mirrors combat leveling)
  const applyXp = (c, amount) => {
    let newXp = (c.xp || 0) + amount, newLevel = c.level, leveled = false;
    const beforeSlots = unlockedSlotCount(c.level);
    while (newLevel < MAX_LEVEL && newXp >= xpForLevel(newLevel)) { newXp -= xpForLevel(newLevel); newLevel++; leveled = true; }
    if (newLevel >= MAX_LEVEL) newXp = 0;
    let nc = { ...c, xp: newXp, level: newLevel };
    nc.unlockedSkills = (SKILLS[nc.cls] || []).filter((s) => s.unlockLevel <= newLevel).map((s) => s.name);
    const afterSlots = unlockedSlotCount(newLevel);
    if (afterSlots > beforeSlots) { nc.selectedSkills = padSelectedSkills(nc, nc.selectedSkills); addLog(`🌟 New ability slot unlocked! (${afterSlots}/${MAX_SKILL_SLOTS})`); }
    if (leveled) { nc.hp = maxHpFor(nc); addLog(`🎉 Reached level ${newLevel}!`); }
    return nc;
  };
  const ensureBoard = () => { const c = charRef.current; const board = c.quests?.board?.length ? c.quests.board : Array.from({ length: BOARD_QUEST_SLOTS }, () => rollBoardQuest(c, boardZone)); commitChar({ ...c, quests: { ...c.quests, board }, tutorial: { ...(c.tutorial || {}), visitedBoard: true } }); };
  const rerollQuest = (qid) => { const c = charRef.current; commitChar({ ...c, quests: { ...c.quests, board: (c.quests?.board || []).map((q) => q.id === qid ? rollBoardQuest(c, boardZone) : q) } }); };
  const changeBoardZone = (zoneId) => { setBoardZone(zoneId); const c = charRef.current; commitChar({ ...c, quests: { ...c.quests, board: Array.from({ length: BOARD_QUEST_SLOTS }, () => rollBoardQuest(c, zoneId)) } }); };
  const claimQuest = (q) => {
    const c = charRef.current;
    if (questProgress(c, q) < q.count) return;
    let nc = { ...c };
    if (q.kind === "collect") nc = { ...nc, drops: { ...nc.drops, [q.target]: Math.max(0, (nc.drops[q.target] || 0) - q.count) } };
    nc = { ...nc, gold: nc.gold + q.reward.gold };
    nc = applyXp(nc, q.reward.xp);
    nc = { ...nc, quests: { ...nc.quests, board: (nc.quests?.board || []).map((x) => x.id === q.id ? rollBoardQuest(nc, boardZone) : x) } };
    commitChar(nc);
    showNotif(`Quest complete! +${q.reward.xp} XP · +${q.reward.gold}g`);
    addLog(`📜 Quest complete: ${questLabel(q)}`);
  };
  // ---------- Class Hall: choose / swap Specialization (free, from level 10) ----------
  // Selecting a spec auto-grants its three signature skills, strips the previous spec's, prunes any
  // gambits that referenced removed skills, and applies the spec's passive (via selectedTalents).
  const setSpec = (specId) => {
    const c = charRef.current;
    const spec = specById(specId);
    if (!spec || specClassOf(specId) !== c.cls) { showNotif("Not a specialization for your class"); return; }
    if ((c.level || 1) < SPEC_LEVEL) { showNotif(`Specializations unlock at level ${SPEC_LEVEL}`); return; }
    if (c.spec === specId) return;
    const { char: nc, restored } = switchSpecCore(c, specId);
    commitChar(nc);
    if (restored) {
      showNotif(`${spec.icon} ${spec.name} — template restored`);
      addLog(`${spec.icon} Specialized as ${spec.name}. Your saved template (skills, mods, gambits) was restored.`);
    } else {
      showNotif(`${spec.icon} Specialization: ${spec.name}!`);
      addLog(`${spec.icon} Specialized as ${spec.name}. Signature skills granted: ${specGrantedSkills(specId).join(", ")}.`);
    }
  };
  const toggleSelectedSkill = (name) => {
    const c = charRef.current;
    if (!skillByName(c, name)) return;
    const cap = unlockedSlotCount(c.level);
    let sel = [...(c.selectedSkills || [])];
    if (sel.includes(name)) sel = sel.filter((n) => n !== name);
    else { if (sel.length >= cap) { showNotif(`Only ${cap} ability slot${cap > 1 ? "s" : ""} unlocked`); return; } sel.push(name); }
    commitChar({ ...c, selectedSkills: sel });
  };
  // ---------- Town / City building ----------
  const townCanBuild = (c, bld) => {
    const cur = townLvl(c, bld.id);
    if (cur >= townMaxBuildable(c, bld)) return { ok: false, reason: bld.id === "townhall" ? `Requires character level ${TOWNHALL_LEVEL_REQ(cur + 1)}` : `Requires Town Hall level ${cur + 1}` };
    const cost = townCostAt(bld, cur);
    if (c.gold < cost.gold) return { ok: false, reason: "Not enough gold" };
    for (const m of cost.mats) if ((c.materials?.[m.id] || 0) < m.qty) return { ok: false, reason: "Not enough materials" };
    for (const d of cost.drops) if ((c.drops?.[d.id] || 0) < d.qty) return { ok: false, reason: "Not enough enemy drops" };
    return { ok: true };
  };
  const startBuild = (id) => {
    const c = charRef.current;
    if (c.town?.build) { showNotif("Another building is already under construction"); return; }
    const bld = townBuildingById(id); if (!bld) return;
    const chk = townCanBuild(c, bld);
    if (!chk.ok) { showNotif(chk.reason); return; }
    const cur = townLvl(c, id);
    const cost = townCostAt(bld, cur);
    const mats = { ...c.materials }; for (const m of cost.mats) mats[m.id] = (mats[m.id] || 0) - m.qty;
    const drops = { ...c.drops }; for (const d of cost.drops) drops[d.id] = (drops[d.id] || 0) - d.qty;
    const endsAt = Date.now() + townTimeAt(bld, cur) * 1000;
    commitChar({ ...c, gold: c.gold - cost.gold, materials: mats, drops, town: { ...(c.town || {}), build: { id, level: cur + 1, endsAt } } });
    showNotif(`🏗️ ${bld.name} → level ${cur + 1} underway!`);
    addLog(`🏗️ Construction began: ${bld.name} → level ${cur + 1}`);
  };
  const collectBuild = () => {
    const c = charRef.current; const bd = c.town?.build; if (!bd || Date.now() < bd.endsAt) return;
    const buildings = { ...(c.town?.buildings || {}), [bd.id]: bd.level };
    commitChar({ ...c, town: { buildings, build: null } });
    const bld = townBuildingById(bd.id);
    showNotif(`✅ ${bld?.name} is now level ${bd.level}!`);
    addLog(`✅ ${bld?.name} completed — level ${bd.level}. ${bld ? bld.bonus(bd.level) : ""}`);
  };
  const rushBuildCost = (bd) => Math.max(1, Math.ceil(Math.max(0, (bd.endsAt - Date.now())) / 60000)); // 1 Ven per minute remaining
  const rushBuild = () => {
    const c = charRef.current; const bd = c.town?.build; if (!bd) return;
    const cost = rushBuildCost(bd);
    if ((c.ven || 0) < cost) { showNotif(`Rush costs ${cost} 💎 Ven`); return; }
    const buildings = { ...(c.town?.buildings || {}), [bd.id]: bd.level };
    commitChar({ ...c, ven: c.ven - cost, town: { buildings, build: null } });
    const bld = townBuildingById(bd.id);
    showNotif(`⚡ Rushed ${bld?.name} to level ${bd.level}! (−${cost} 💎)`);
    addLog(`⚡ Rushed ${bld?.name} — now level ${bd.level}. ${bld ? bld.bonus(bd.level) : ""}`);
  };
  useEffect(() => {
    const iv = setInterval(() => { const bd = charRef.current?.town?.build; if (bd && Date.now() >= bd.endsAt) collectBuild(); }, 2000);
    return () => clearInterval(iv);
  }, []);
  // ---------- Premium shop ----------
  const buyPremium = (item) => {
    const c = charRef.current;
    if ((c.ven || 0) < item.cost) { showNotif(`Need ${item.cost} 💎 Ven`); return; }
    let nc = { ...c, ven: c.ven - item.cost };
    if (item.kind === "ticket") {
      nc = { ...nc, tickets: { ...nc.tickets, [item.id]: (nc.tickets?.[item.id] || 0) + 1 } };
      showNotif(`${item.icon} ${item.name} purchased`);
    } else if (item.kind === "aura") {
      const cur = nc.auras?.[item.aura] || 0;
      const until = item.hours === "perm" ? PERMA_TS : Math.max(Date.now(), cur === PERMA_TS ? Date.now() : cur) + item.hours * 3600000;
      nc = { ...nc, auras: { ...nc.auras, [item.aura]: cur === PERMA_TS ? PERMA_TS : until } };
      showNotif(`${item.icon} ${item.name} active!`);
      addLog(`${item.icon} Activated ${item.name}`);
    } else if (item.kind === "gem") {
      const g = gemById(item.gem);
      nc = { ...nc, gems: { ...(nc.gems || {}), [item.gem]: ((nc.gems || {})[item.gem] || 0) + 1 } };
      showNotif(`${g.icon} ${g.name} acquired`);
      addLog(`${g.icon} Bought ${g.name}`, rarityById(g.rarity).color);
    } else if (item.kind === "artifact") {
      const art = makeArtifact(nc.cls, item.slot, nc.level);
      // Through the same door as everything else. This pushed straight onto inventory with no cap
      // at all, so a purchased artifact could sit above the bank limit and be the next thing the
      // old truncation threw away.
      const d = depositEarned(nc, art);
      nc = { ...nc, inventory: d.inventory, overflow: d.overflow };
      showNotif(d.mailed.length ? `${item.icon} ${art.name} forged — bank full, it is in your mail`
                                : `${item.icon} ${art.name} forged — check your Bag!`);
      addLog(`${item.icon} Forged ${art.name} (ilvl ${art.ilvl})`);
    } else if (item.kind === "bank") {
      nc = { ...nc, bankSlots: Math.max(0, (nc.bankSlots || 0) + item.slots) };
      showNotif(`${item.icon} Bank expanded — ${bankCap(nc)} slots`);
      addLog(`${item.icon} Bank expanded to ${bankCap(nc)} slots`);
      // Anything waiting in the mail can come home now that there is room.
      const cl = claimOverflow(nc);
      if (cl.claimed.length) {
        nc = { ...nc, inventory: cl.inventory, overflow: cl.overflow };
        addLog(`📬 ${cl.claimed.length} item(s) returned from your mail`);
      }
    }
    commitChar(nc);
  };
  // exchange an arbitrary amount of Ven for gold at a flat rate
  const exchangeVen = (amt) => {
    const c = charRef.current;
    const n = Math.floor(Number(amt) || 0);
    if (n <= 0) { showNotif("Enter an amount of Ven"); return; }
    if ((c.ven || 0) < n) { showNotif(`Need ${n.toLocaleString()} 💎 Ven`); return; }
    const gold = n * VEN_TO_GOLD;
    commitChar({ ...c, ven: c.ven - n, gold: (c.gold || 0) + gold });
    showNotif(`💰 +${gold.toLocaleString()} gold`);
    addLog(`💰 Exchanged ${n.toLocaleString()} Ven for ${gold.toLocaleString()} gold`);
    setVenExchange("");
  };
  const buyVenStub = () => { showNotif("💳 In-app purchases coming soon — Google Play & more"); };
  // ---------- Talents ----------
  const talentChangeCost = (c) => TALENT_RESPEC_COST * (((c && c.talentChanges) || 0) + 1); // 150g × (changes + 1)
  const selectTalent = (level, optionId) => {
    const c = charRef.current;
    if ((c.level || 1) < level) { showNotif(`Unlocks at level ${level}`); return; }
    const cur = c.talents?.[level];
    if (cur === optionId) return;
    const row = talentRows(c).find((r) => r.level === level);
    const opt = row?.options.find((o) => o.id === optionId);
    if (!opt) return;
    const cost = cur ? talentChangeCost(c) : 0; // first pick of a row is free; changing costs 150g × times changed
    if (cost > 0 && c.gold < cost) { showNotif(`Changing a talent costs ${cost.toLocaleString()}g`); return; }
    const nc = { ...c, talents: { ...(c.talents || {}), [level]: optionId }, gold: c.gold - cost, talentChanges: cur ? ((c.talentChanges || 0) + 1) : (c.talentChanges || 0) };
    commitChar(nc);
    showNotif(`${opt.icon} ${opt.name}${cost > 0 ? ` (−${cost.toLocaleString()}g)` : " learned"}`);
  };
  // ---------- Skill Mods ----------
  const investSkillMod = (name) => {
    const c = charRef.current;
    const cid = skillClassOf(name);
    if (cid !== c.cls) { showNotif("Not one of your skills"); return; }
    const avail = primaryModAvail(c);
    if (avail <= 0) { showNotif("No skill-mod points available"); return; }
    const cur = c.skillMods?.[name] || { pts: 0, effects: {} };
    if (cur.pts >= SKILL_MOD_CAP) { showNotif(`${name} is maxed (${SKILL_MOD_CAP})`); return; }
    commitChar({ ...c, skillMods: { ...(c.skillMods || {}), [name]: { pts: cur.pts + 1, effects: cur.effects || {} } } });
  };
  const chooseSkillModEffect = (name, bp, effectId) => {
    const c = charRef.current;
    const cur = c.skillMods?.[name]; if (!cur || cur.pts < bp) { showNotif(`Reach ${bp} points first`); return; }
    const effects = { ...(cur.effects || {}) };
    if (effects[bp] === effectId) { delete effects[bp]; } // tap again to clear
    else { const other = SKILL_MOD_BREAKS.find((b) => b !== bp); if (effects[other] === effectId) { showNotif("Already applied at the other breakpoint"); return; } effects[bp] = effectId; }
    commitChar({ ...c, skillMods: { ...c.skillMods, [name]: { ...cur, effects } } });
  };
  const skillModRefundCost = (c) => 150 * (((c && c.skillModRefunds) || 0) + 1);
  const refundSkillMod = (name) => {
    const c = charRef.current;
    const cur = c.skillMods?.[name]; if (!cur || !cur.pts) return;
    const cost = skillModRefundCost(c);
    if (c.gold < cost) { showNotif(`Refund costs ${cost.toLocaleString()}g`); return; }
    const nm = { ...c.skillMods }; delete nm[name];
    commitChar({ ...c, skillMods: nm, gold: c.gold - cost, skillModRefunds: (c.skillModRefunds || 0) + 1 });
    showNotif(`♻️ Refunded ${name} (−${cost.toLocaleString()}g)`);
  };
  const completeTalentTutorial = (optionId) => {
    const c = charRef.current;
    const opt = TALENT_TIERS[0].options.find((o) => o.id === optionId); if (!opt) return;
    commitChar({ ...c, talents: { ...(c.talents || {}), 10: optionId }, talentTutorialDone: true });
    showNotif(`${opt.icon} ${opt.name} learned!`);
    addLog(`🌟 Talent path chosen: ${opt.name}. Manage talents under the Hero's Statue.`);
  };
  // A lesson completes the moment its condition is met. This used to watch three fields, which was
  // enough for six steps keyed on kills and professions; the lessons now key on gear, upgrades,
  // spec, talents and panels visited, so it watches the whole character instead. commitChar hands
  // back a new object, so this runs once per change and settles.
  useEffect(() => {
    const c = charRef.current;
    if (!c) return;
    const lesson = activeLesson(c);
    if (!lesson || !lesson.done(c)) return;
    // The opening six carry their original level-band XP and item rewards. Later lessons pay a
    // fifth of a level — a nudge for detouring, deliberately too small to move the levelling curve
    // the 704-run sweep measured.
    const xp = lesson.forLevel != null ? (lesson.forLevel ? xpForLevel(lesson.forLevel) : 0)
                                       : Math.floor(xpForLevel(lessonLevel(lesson)) * 0.2);
    let nc = xp ? applyXp({ ...c }, xp) : { ...c };
    let rewardMsg = xp ? `+${xp.toLocaleString()} XP` : "";
    if (lesson.reward?.heal) {
      const key = conKey("heal", 0);
      nc = { ...nc, consumables: { ...nc.consumables, [key]: (nc.consumables[key] || 0) + lesson.reward.heal } };
      rewardMsg = `+${lesson.reward.heal} Healing Potion I`;
    }
    const doneIds = { ...((nc.tutorial || {}).doneIds || {}), [lesson.id]: true };
    const allDone = LESSONS.every((l) => doneIds[l.id]);
    nc = { ...nc, tutorial: { ...nc.tutorial, doneIds, step: Object.keys(doneIds).length, done: allDone } };
    commitChar(nc);
    addLog(`✅ ${lesson.title} complete${rewardMsg ? " — " + rewardMsg : ""}!`);
    showNotif(`✅ ${lesson.title}!${rewardMsg ? " " + rewardMsg : ""}${allDone ? " · Every system learned!" : ""}`);
  }, [char]);

  const [gatherTapCd, setGatherTapCd] = useState(0); // timestamp the manual swing is ready again
  const [, setGatherTick] = useState(0);             // forces re-render for the live cooldown countdown
  const setNode = (n) => { gatherNodeRef.current = n; setGatherNode(n); };
  const GATHER_TAP_CD = 3000; // 3s cooldown on the manual swing
  const hasRelic = (c, relicId) => c.equipment?.relic?.relicId === relicId;
  const gatherTapCdFor = (c, pid) => GATHER_TAP_CD - (((pid === "mining" && hasRelic(c, "miners_charm")) || (pid === "herbalism" && hasRelic(c, "verdant_idol"))) ? 1000 : 0);
  const smashNode = () => {
    if (Date.now() < gatherTapCd || !gatherId) return;
    const c = charRef.current;
    hitNode(gatherPower(c.professions[gatherId]?.level || 1));
    setGatherTapCd(Date.now() + gatherTapCdFor(c, gatherId));
  };

  // 1s clock drives buff timers, potion cooldown, and AH reroll countdown
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);

  // Out-of-combat regeneration: heal 5% of max health per minute while not fighting.
  const regenRef = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => {
      if (battleRef.current) { regenRef.current = Date.now(); return; } // no passive regen during combat
      const c = charRef.current; if (!c) return;
      const mx = maxHpFor(c);
      const cur = clamp(typeof c.hp === "number" ? c.hp : mx, 0, mx);
      if (cur >= mx) { regenRef.current = Date.now(); return; }
      const nowMs = Date.now();
      const msPerHp = 60000 / (mx * 0.05); // time to regen 1 HP at 5% of max per minute
      const whole = Math.floor((nowMs - regenRef.current) / msPerHp);
      if (whole >= 1) { regenRef.current += whole * msPerHp; commitChar({ ...charRef.current, hp: Math.min(mx, cur + whole) }); }
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  const cls = CLASSES.find((c) => c.id === char.cls);
  const race = RACES.find((r) => r.id === char.race);

  // refs so interval / handlers always read fresh state
  const charRef = useRef(char);
  const battleRef = useRef(battle);
  const lastPotionRef = useRef(0);
  // When the player last did anything at all. Drives the attended/unattended split in resolveDeath.
  const lastInputRef = useRef(Date.now());
  const attended = () => isAttended(lastInputRef.current, Date.now(),
    typeof document !== "undefined" && document.visibilityState === "hidden");
  // Artifacts re-forge whenever the character's level moves, so their ilvl always tracks level + 5.
  const syncArtifacts = (c) => {
    const want = artifactIlvl(c.level);
    let touched = false;
    const fix = (it) => {
      // A fixed-ilvl artifact never re-forges. Without this, a Battlemaster piece bought at ilvl 65
      // would be dragged to artifactIlvl(60) = 60 on the very next commit AND have its mains
      // regenerated from the class table, throwing away both the item level it was paid for and the
      // main stat the player chose.
      if (it?.artifact && it.fixedIlvl) return it;
      if (it?.artifact && it.ilvl !== want) {
        touched = true;
        const next = makeArtifact(c.cls, it.slotId, c.level, it);
        // carry the tempering/reroll overlay through the re-forge (scale line bases to the new ilvl)
        if (Array.isArray(it.lines) || it.temper) {
          next.temper = it.temper || 0;
          next.temperBonus = it.temperBonus || 0;
          next.temperLog = Array.isArray(it.temperLog) ? it.temperLog : [];
          next.rerolls = it.rerolls || 0;
          // Artifacts re-forge on every level change. Dropping the pity here would silently reset
          // the ladder each time the player levelled, which is the one thing it must never do.
          next.pity = (it.pity && typeof it.pity === "object" && !Array.isArray(it.pity)) ? { ...it.pity } : {};
          const ratio = it.linesIlvl > 0 ? want / it.linesIlvl : 1;
          next.lines = (it.lines || []).map((l) => ({ stat: l.stat, base: Math.max(1, Math.round(l.base * ratio)) }));
          next.linesIlvl = want;
          syncItemStats(next);
        }
        return next;
      }
      return it;
    };
    const equipment = {}; for (const k in (c.equipment || {})) equipment[k] = fix(c.equipment[k]);
    const inventory = (c.inventory || []).map(fix);
    return touched ? { ...c, equipment, inventory } : c;
  };
  // Every write to the character goes through here, which makes it the one place that can reliably
  // bring overflow home. Sell something, expand the bank, equip a piece — the moment a slot frees
  // up, whatever was waiting in the mail comes back on its own. claimOverflow only moves items when
  // there is room, so this cannot loop.
  const commitChar = useCallback((next) => {
    let n = syncArtifacts(next);
    if (n && (n.overflow || []).length && bankFree(n) > 0) {
      const cl = claimOverflow(n);
      if (cl.claimed.length) n = { ...n, inventory: cl.inventory, overflow: cl.overflow };
    }
    charRef.current = n; setChar(n); onSave(n);
  }, [onSave]);
  const commitBattle = useCallback((next) => { battleRef.current = next; setBattle(next); }, []);

  // No colour argument. There used to be one on 100 of these calls, in fourteen
  // different hexes, and the Chronicle has never read it: an entry's kind is
  // derived from the sentence, because sentence shapes are far more stable than
  // whoever-was-writing-that-day's choice of amber. They were stored and ignored.
  const addLog = useCallback((text) => setCombatLog((prev) => [...prev.slice(-70), { text }]), []);
  const showNotif = useCallback((msg) => { setNotification(msg); setTimeout(() => setNotification(null), 2400); }, []);
  const chatState = useGlobalChat(char, showNotif); // shared global chat (town float + combat tab + guild)
  const [combatSide, setCombatSide] = useState("log"); // combat panel tab: log | chat
  // Which way round the light is. Per DEVICE, not per character — it follows the
  // reader's system preference until they say otherwise.
  const [chronicleTheme, setChronicleTheme] = useState(loadTheme);
  const [townChatOpen, setTownChatOpen] = useState(false);
  const [groupBoss, setGroupBoss] = useState("ashen"); // chosen Trinity Trial boss
  const [groupRun, setGroupRun] = useState(null); // active Guild/Trial run (Trinity engine)
  const groupRunRef = useRef(null); useEffect(() => { groupRunRef.current = groupRun; }, [groupRun]);
  const [partyCode, setPartyCode] = useState(""); // optional: friends entering the same code always land in one room
  const [guildQueue, setGuildQueue] = useState(null); // { content, size, kind, party, countdown, launch }
  const guildRunRef = useRef(null); // active Guild run context (for the GDKP bid on the final boss)
  const botCharRef = useRef(null);  // PvP bot: the geared character it plays
  const botMirrorRef = useRef(null); // PvP bot: its battle state (bot=caster, player=target)
  const botTierRef = useRef(null);   // PvP bot: competence tier
  const pveBotsRef = useRef(null);   // PvE party bots: [{ id, char, tier, mirror, down }] that damage the boss for real
  const [guildBid, setGuildBid] = useState(null); // { items, party } when a boss loot bid is open
  const [groupParty, setGroupParty] = useState(null); // party members (with sim hp) shown in group-content combat
  const groupPartyRef = useRef(null); useEffect(() => { groupPartyRef.current = groupParty; }, [groupParty]);
  const [groupReses, setGroupReses] = useState(0); // battle-reses remaining this run (display)
  const resesRef = useRef(0);                        // same, read from the combat loop

  // ---------- offline combat ----------
  const markActive = useCallback(() => {
    const c = charRef.current; if (!c) return;
    commitChar({ ...c, lastActive: Date.now() });
  }, [commitChar]);

  const notifyDefeat = useCallback(() => {
    // On native, a notification was already scheduled to fire at the moment of defeat while closed.
    // Only fire an immediate one as the web fallback (browser can't schedule while closed).
    if (!LocalNotify.plugin()) LocalNotify.fireNow("Offline combat ended — your character was defeated.");
  }, []);

  const applyOffline = useCallback(() => {
    const c = charRef.current; if (!c) return;
    const t = Date.now();
    const elapsed = t - (c.lastActive || t);
    if (!offlineSpot(c) || elapsed < 60000) { commitChar({ ...c, lastActive: t }); return; }
    const startLevel = c.level;
    const res = simulateOffline(c, elapsed);
    if (!res || res.kills === 0) { commitChar({ ...c, lastActive: t }); return; }
    commitChar(res.char);
    const sp = offlineSpot(c);
    setOfflineReport({ ...res, levelsGained: res.leveledTo - startLevel,
      zoneName: sp && sp.kind === "abyss" ? abyssLabel(sp.plus)
              : sp && sp.kind === "hard" ? `${sp.hz.name} (Hard)`
              : (ZONES.find((z) => z.id === c.offlineZoneId) || {}).name || "" });
    if (res.died) { showNotif("💀 Offline combat ended — you were defeated"); notifyDefeat(); }
    else if (bankIsFull(res.char)) {
      const waiting = (res.char.overflow || []).length;
      showNotif(waiting ? `🏦 Bank full — ${waiting} item(s) waiting in your mail`
                        : "🏦 Bank full — new gear is being auto-sold");
    }
  }, [commitChar, showNotif, notifyDefeat]);

  // toggle offline auto-combat for a zone (single desired zone; checking one clears others)
  const toggleOfflineZone = useCallback((zoneId) => {
    const c = charRef.current; if (!c) return;
    const enabling = c.offlineZoneId !== zoneId;
    if (enabling) LocalNotify.ensurePermission(); // ask for notification permission up front
    // Parking somewhere clears the other place. A character is in ONE place; leaving both set
    // would make which one they actually farmed depend on the order of two ifs.
    commitChar({ ...c, offlineZoneId: enabling ? zoneId : null, offlineHardId: null, offlineAbyss: null, lastActive: Date.now() });
    showNotif(enabling ? "🌙 Offline combat enabled" : "Offline combat disabled");
  }, [commitChar, showNotif]);
  // Park in the Abyss at a given rank. Only ranks already unlocked, so a player cannot leave a
  // character grinding a depth they have never reached.
  // Only the BOTTOM of the Abyss can be parked in. Deeper ranks are meant to be played, and the
  // clamp is here rather than in the caller so no future button can route around it.
  const toggleOfflineAbyss = useCallback((plus) => {
    const c = charRef.current; if (!c) return;
    const p = Math.max(0, Math.min(OFFLINE_ABYSS_MAX, Math.min(abyssUnlocked(c), plus)));
    if (plus > OFFLINE_ABYSS_MAX) { showNotif(`Only ${abyssLabel(OFFLINE_ABYSS_MAX)} can be farmed while away — deeper ranks must be played.`); return; }
    const enabling = c.offlineAbyss !== p;
    if (enabling) LocalNotify.ensurePermission();
    commitChar({ ...c, offlineAbyss: enabling ? p : null, offlineZoneId: null, offlineHardId: null, lastActive: Date.now() });
    showNotif(enabling ? `🌙 Parked in ${abyssLabel(p)}` : "Offline combat disabled");
  }, [commitChar, showNotif]);
  // Park in a hard ZONE. Hard dungeons and the raid are deliberately absent: they are lockout
  // content, and a lockout cannot be spent by someone who is not there to spend it.
  const toggleOfflineHard = useCallback((hzId) => {
    const c = charRef.current; if (!c) return;
    const hz = hardZoneById(hzId); if (!hz) return;
    if (!hardZoneUnlocked(c, avgEquippedIlvl(c), hz)) { showNotif("🔒 Not unlocked yet"); return; }
    const enabling = c.offlineHardId !== hzId;
    if (enabling) LocalNotify.ensurePermission();
    commitChar({ ...c, offlineHardId: enabling ? hzId : null, offlineZoneId: null, offlineAbyss: null, lastActive: Date.now() });
    showNotif(enabling ? `🌙 Parked in ${hz.name} (Hard)` : "Offline combat disabled");
  }, [commitChar, showNotif]);

  // run offline progress on open & when returning; schedule a defeat notification when leaving
  useEffect(() => {
    applyOffline();
    const onHide = () => {
      markActive();
      const c = charRef.current;
      LocalNotify.cancelScheduled(); LocalNotify.cancelBankFull();
      if (c && offlineSpot(c)) {
        const ms = predictOfflineDeath(c);
        if (ms != null) LocalNotify.scheduleDefeat(Date.now() + ms); // fires at the predicted defeat time
        // Idle-battling with nowhere to put anything: warn on the way out, so the player knows
        // before they come back to a pile of gold instead of gear.
        if (bankIsFull(c)) {
          const waiting = (c.overflow || []).length;
          LocalNotify.bankFull(waiting
            ? `Your bank is full — ${waiting} item(s) are waiting in your mail and new gear is being sold.`
            : `Your bank is full (${bankCap(c)} slots) — new gear is being auto-sold while you are away.`);
        }
      }
    };
    const onShow = () => { lastInputRef.current = Date.now(); LocalNotify.cancelScheduled(); LocalNotify.cancelBankFull(); applyOffline(); };
    const onVis = () => (document.visibilityState === "hidden" ? onHide() : onShow());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onHide);
    // Any sign of life resets the attention clock. Listened for on the capture phase at the document
    // so nothing can stop it short, and passively so it never costs a frame of scroll performance.
    const onInput = () => { lastInputRef.current = Date.now(); };
    const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"];
    for (const ev of INPUTS) document.addEventListener(ev, onInput, { capture: true, passive: true });
    const iv = setInterval(markActive, 20000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeunload", onHide);
      for (const ev of INPUTS) document.removeEventListener(ev, onInput, { capture: true });
      clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- enemy spawning ----------
  const makeEnemy = (level, opts = {}) => {
    const { isBoss = false, dungeon = null, name = null, hpMult = 1, champion = false, mimic = false, lord = false, tier = "normal" } = opts;
    const rank = isBoss ? "boss" : lord ? "lord" : (champion || mimic) ? "champion" : "normal";
    const R = ENEMY_RANKS[rank], T = diffTier(tier);
    const inst = dungeon ? instanceById(dungeon) : null;
    const nm = mimic ? "Mimic Chest" : (name || (inst?.enemies ? pick(inst.enemies) : pick(getZoneForLevel(level).enemies)));
    const cls = dispositionFor(nm); // fixed disposition per creature (matches the Bestiary)
    // Archetype health sits alongside rank and difficulty: a rogue-type is fragile, a paladin-type
    // is a wall. Damage per second is held at parity, so this is where the archetypes are allowed
    // to actually differ. Resolved after `cls`, which it depends on.
    const arch = ENEMY_ARCHETYPE[cls] || NEUTRAL_ARCHETYPE;
    const baseHp = Math.floor((level * 26 + 50) * R.hp * T.hp * hpMult * arch.hp + Math.random() * 20); // rank + difficulty + archetype drive health
    const stats = enemyStatBlock(level, cls, { rank, tier });
    // Shared with the Bestiary — one definition of what a creature fights with.
    const usable = enemyUsableSkills(cls, level);
    const ccPool = usable.filter((s) => s.slowPct);
    const skillCount = R.skills; // Champion 2, Boss 3, Lord 4 (+CC) — from the rank table
    const chosen = [];
    if (lord && ccPool.length) chosen.push(pick(ccPool)); // Lords always bring a crowd-control skill
    const rest = usable.filter((s) => !chosen.includes(s));
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    for (const s of rest) { if (chosen.length >= skillCount) break; chosen.push(s); }
    return { ...stats, name: nm, iconKey: nm, isBoss, isChampion: champion || mimic || lord, isLord: lord, isMimic: mimic, dungeonId: dungeon, level, icon: mimic ? "🧰" : isBoss ? "💀" : lord ? "👑" : champion ? "⚔️" : "👹", hp: baseHp, maxHp: baseHp, cls, skills: chosen, nextCastAt: 0 };
  };

  // ---------- award loot (auto-equip or to bag) ----------
  // ---------- socketing ----------
  // Socketing is PERMANENT — a gem bonds to the item and can never be removed or replaced.
  const socketGem = (item, idx, gemId, confirmed) => {
    const c = charRef.current;
    if (socketsOf(item)[idx]) { showNotif("🔒 That socket is already bonded"); return; }
    if (((c.gems || {})[gemId] || 0) < 1) { showNotif("You don't own that gem"); return; }
    const g = gemById(gemId); if (!g) return;
    const addsMain = MAIN_KEYS.find((k) => (g.stats && g.stats[k] > 0) && wouldDormantPower(item, k));
    if (addsMain && !confirmed) { setSocketConfirm({ item, idx, gemId, gem: g, stat: addsMain }); return; } // would put Power dormant
    setSocketConfirm(null);
    const apply = (it) => { if (it?.id !== item.id) return it; const sk = [...socketsOf(it)]; sk[idx] = gemId; return { ...it, sockets: sk }; };
    const gems = { ...(c.gems || {}), [gemId]: (c.gems[gemId] || 0) - 1 };
    if (gems[gemId] <= 0) delete gems[gemId];
    const equipment = {}; for (const k in (c.equipment || {})) equipment[k] = apply(c.equipment[k]);
    commitChar({ ...c, gems, equipment, inventory: (c.inventory || []).map(apply) });
    addLog(`${g.icon} ${g.name} bonded to ${item.name}`, rarityById(g.rarity).color);
    showNotif(`${g.icon} Socketed ${g.name}`);
    setSocketPick(null);
  };
  // Reforge: burn a bonded gem out of a socket for Ven. The socket is freed; the gem is destroyed.
  const reforgeSocket = (item, idx) => {
    const c = charRef.current;
    const gid = socketsOf(item)[idx];
    if (!gid) { setReforgeConfirm(null); return; }
    if ((c.ven || 0) < REFORGE_SOCKET_VEN) { showNotif(`Costs ${REFORGE_SOCKET_VEN} 💎 Ven`); return; }
    const g = gemById(gid);
    const apply = (it) => { if (it?.id !== item.id) return it; const sk = [...socketsOf(it)]; sk[idx] = null; return { ...it, sockets: sk }; };
    const equipment = {}; for (const k in (c.equipment || {})) equipment[k] = apply(c.equipment[k]);
    commitChar({ ...c, ven: c.ven - REFORGE_SOCKET_VEN, equipment, inventory: (c.inventory || []).map(apply) });
    addLog(`🔥 ${g?.name || "Gem"} burned out of ${item.name} — socket freed`);
    showNotif("🔥 Socket reforged");
    setReforgeConfirm(null);
  };
  const grantGem = (c, gem) => {
    if (!gem) return c;
    const r = rarityById(gem.rarity);
    addLog(`${gem.icon} ${gem.name} (${r.name} gem)`, r.color);
    if (gem.rarity === "legendary" || gem.rarity === "epic") showNotif(`${gem.icon} ${gem.name}!`);
    return { ...c, gems: { ...(c.gems || {}), [gem.id]: ((c.gems || {})[gem.id] || 0) + 1 } };
  };
  const grantLoot = (c, items) => {
    if (!items.length) return c;
    let inv = [...c.inventory];
    let equip = { ...c.equipment };
    let gold = c.gold;
    let firstShown = null;
    const toBag = [], unequipped = [];
    items.forEach((it) => {
      if (c.autoEquip) {
        const cur = equip[it.slotId];
        // AUTO-EQUIP MUST NOT DISMANTLE A SET. itemScore knows about item level and stats and
        // nothing about set bonuses, so a raid drop one ilvl above a Battlemaster piece scores
        // higher and would silently cost the player 10% Arena mitigation they paid 125 tokens for.
        // A worn set piece is only ever replaced by hand.
        //
        // This gates the EQUIP only. Written as an early `return` it exited the whole per-item
        // callback, so a drop for that slot was not equipped, not sold and not banked — it was
        // deleted. The drop still has to reach the bag below.
        const wornIsSetPiece = !!(cur && cur.setId);
        if (!wornIsSetPiece && (!cur || itemScore(it, c.cls) > itemScore(cur, c.cls))) {
          if (cur) unequipped.push(cur);
          equip[it.slotId] = it;
          if (!firstShown) firstShown = it;
          addLog(`✨ Equipped ${it.name}`, rarityById(it.rarity).color);
          return;
        }
      }
      // auto-sell downgrades upgrade: vendor anything not better than equipped
      if (c.autoSellDowngrades) {
        const eqp = equip[it.slotId];
        // Never auto-sell Abyss gear. A +0 piece that scores below a +10 one is still a 125,000
        // gold item, and vendoring it for a few hundred is not what "sell my downgrades" means.
        if (it.abyss != null) { toBag.push(it); if (!firstShown) firstShown = it; return; }
        if (eqp && itemScore(it, c.cls) <= itemScore(eqp, c.cls)) {
          const price = Math.max(1, Math.floor(it.value * 0.6 * 0.25));
          gold += price;
          addLog(`💰 Auto-sold ${it.name} (+${price}g)`);
          return;
        }
      }
      toBag.push(it);
      if (!firstShown) firstShown = it;
    });
    // Everything reaching the bank goes through one door, so nothing can be silently dropped.
    // `unequipped` is gear the player already owned — it is never auto-sold, only held.
    const res = depositItems({ ...c, inventory: inv }, toBag, unequipped);
    for (const it of toBag) {
      if (res.mailed.includes(it)) addLog(`📬 Bank full — ${it.name} is waiting in your mail`, rarityById(it.rarity).color);
      else if (res.sold.some((s) => s.item === it)) addLog(`💰 Bank full — auto-sold ${it.name} (+${overflowSellPrice(it)}g)`);
      else addLog(`🎁 Looted ${it.name}`, rarityById(it.rarity).color);
    }
    if (firstShown) { setLastLoot(firstShown); setTimeout(() => setLastLoot(null), 2600); }
    return { ...c, inventory: res.inventory, overflow: res.overflow, equipment: equip, gold: gold + res.gold };
  };

  // ---------- resolve enemy death → returns {char, battle} ----------
  const resolveDeath = (c, b) => {
    const enemy = b.enemy;
    // drastically lower rewards when farming a zone far below your level
    let rewardMult = 1;
    if (b.mode !== "dungeon" && b.mode !== "hard") {
      // Normal open-world farming: rewards fall off when grinding zones far below your level.
      const z = ZONES.find((zz) => zz.id === c.currentZoneId) || getZoneForLevel(enemy.level);
      const over = Math.max(0, c.level - z.maxLevel);
      rewardMult = Math.pow(0.85, over); // ~15% less per level above the zone's cap
    }
    // Deeper into a run is both harder and better paid, off the one shared ramp. Hard Mode dungeons
    // and the hard raid ride it too; hard ZONES are endless farm with no wave, so they sit at x1.00.
    const waveScale = b.mode === "dungeon"
      ? dungeonWaveScale(b.wave, (instanceById(b.dungeonId) || {}).waves)
      : (b.mode === "hard" && b.hardKind && b.hardKind !== "zone")
        ? dungeonWaveScale(b.wave, b.waves)
        : 1;
    let xpEarned = Math.floor((c.level * (enemy.isBoss ? 9 : 3) + 10) * rewardMult);
    if (b.mode === "dungeon") xpEarned = Math.floor(xpEarned * 3 * waveScale); // dungeons & raids grant triple XP, ramped by wave
    else if (waveScale !== 1) xpEarned = Math.floor(xpEarned * waveScale);      // Hard Mode dungeons & raid ride the same ramp
    const _tb = townBonuses(c);
    xpEarned = Math.floor(xpEarned * (1 + _tb.xp) * auraXpMult(c)); // War College + Town Hall
    let goldBase = Math.floor(c.level * (enemy.isBoss ? 5 : 1) + Math.random() * 4 + 1);
    if (b.mode === "dungeon") goldBase = Math.floor(goldBase * (instanceById(b.dungeonId)?.goldMult || 4) / 3 * waveScale);
    else if (waveScale !== 1) goldBase = Math.floor(goldBase * waveScale);     // Hard Mode dungeons & raid
    if (c.race === "human") goldBase = Math.floor(goldBase * 1.1);
    goldBase = Math.max(0, Math.floor(goldBase * 0.25 * rewardMult * (1 + _tb.gold) * auraGoldMult(c))); // mob gold reduced by 75%, then zone penalty, then Vault + Town Hall
    // At max level, normal-mode combat rewards drop 95% — the endgame lives in Hard Mode (quest & gathering income unaffected)
    if (b.mode !== "hard" && c.level >= MAX_LEVEL) { xpEarned = Math.floor(xpEarned * 0.05); goldBase = Math.floor(goldBase * 0.05); }
    // Hard Mode at max level pays +100% gold to reward the endgame grind
    if (b.mode === "hard" && c.level >= MAX_LEVEL) goldBase = Math.floor(goldBase * 2);
    // The Abyss pays like Hard Mode, plus a rank premium. Every + is more dangerous, so every + is
    // worth more — otherwise the correct play is always to farm the easiest rank you can park on.
    if (b.mode === "abyss") {
      const ap = b.abyssPlus || 0;
      goldBase = Math.floor(goldBase * 2 * (1 + ABYSS.goldPerPlus * ap));
      xpEarned = Math.floor(xpEarned * (1 + ABYSS.xpPerPlus * ap));
    }

    // ----- attended, or merely running? -----
    // Everything above computed the per-kill wage. If nobody has touched the game for ten minutes
    // and this is endless content, that wage is replaced wholesale by the parked tranche — the same
    // arithmetic simulateOffline uses, so an hour ignored is worth exactly an hour away. The kill
    // itself is untouched below this line: it still counts, still banks toward goals, still drops
    // souls and materials, and can still kill you.
    const afkSpot = endlessSpotOf(b);
    const unattended = !!afkSpot && !attended();
    let afkRec = null, afkBudget = Infinity;
    if (unattended) {
      const acc = afkAccrue(c.afk, afkSpot, Date.now());
      goldBase = acc.gold; xpEarned = acc.xp; afkRec = acc.rec; afkBudget = acc.budget;
    }
    // Gear obeys the parked five-an-hour allowance while nobody is looking, and gems are held back
    // entirely, because a parked character earns none of either beyond that. Everything else a kill
    // produces — souls, materials, bestiary progress, enemy drops, Ven — is progression rather than
    // wealth, and is left exactly as it was.
    const afkGear = (items) => {
      if (!unattended) return items;
      const out = [];
      for (const it of items) { if (afkRec.drops >= afkBudget) break; afkRec.drops++; out.push(it); }
      return out;
    };

    addLog(unattended
      ? `✅ ${enemy.name} defeated! (idle — paid by the hour)`
      : `✅ ${enemy.name} defeated! +${xpEarned} XP, +${goldBase}g`);

    let nc = { ...c };
    const xpGain = c.race === "undead" ? Math.floor(xpEarned * 1.1) : xpEarned;
    let newXp = c.xp + xpGain;
    let newLevel = c.level;
    let newHonor = c.honor || 0, newHonorXp = c.honorXp || 0, newAttrPoints = c.attrPoints || 0;
    const beforeSlots = unlockedSlotCount(c.level);
    let leveled = false, honorGained = false;
    while (newLevel < MAX_LEVEL && newXp >= xpForLevel(newLevel)) {
      newXp -= xpForLevel(newLevel);
      newLevel++;
      leveled = true;
    }
    if (newLevel >= MAX_LEVEL) {
      // at max level surplus XP feeds Honor levels (1 attribute point each)
      newHonorXp += newXp; newXp = 0;
      while (newHonorXp >= honorXpForLevel(newHonor)) { newHonorXp -= honorXpForLevel(newHonor); newHonor++; newAttrPoints++; honorGained = true; }
    }
    nc.xp = newXp; nc.level = newLevel;
    nc.unlockedSkills = (SKILLS[c.cls] || []).filter((s) => s.unlockLevel <= newLevel).map((s) => s.name);
    if (unlockedSlotCount(newLevel) > beforeSlots) { nc.selectedSkills = padSelectedSkills(nc, c.selectedSkills); addLog(`🌟 New ability slot unlocked! (${unlockedSlotCount(newLevel)}/${MAX_SKILL_SLOTS})`); }
    nc.honor = newHonor; nc.honorXp = newHonorXp; nc.attrPoints = newAttrPoints;
    nc.gold = c.gold + goldBase;
    // The stretch's running total, or nothing at all once somebody is back. Clearing it on the first
    // attended kill is what makes the grace period repeatable: walk away again and a fresh stretch
    // starts from that moment rather than resuming the old one's accrued hours.
    nc.afk = afkRec;
    nc.kills = c.kills + 1;
    nc.bossKills = enemy.isBoss ? c.bossKills + 1 : c.bossKills;

    if (leveled) { addLog(`🎉 LEVEL UP! Now level ${newLevel}!`); showNotif(`🎉 Level ${newLevel}!`); }
    if (honorGained) { addLog(`⭐ Honor Level ${newHonor}! +1 attribute point`); showNotif(`⭐ Honor Level ${newHonor}!`); }

    // loot (level-banded zones / dungeon-specific tables; dungeon bosses guaranteed)
    const isDungeon = b.mode === "dungeon";
    const isHard = b.mode === "hard";
    if (isHard) {
      // Hard Mode drops now follow the same rule as a normal dungeon: a RUN pays gold and XP
      // through its waves and hands over its gear at the boss. Hard trash are all Lords, so the old
      // 0.6 x 1.6 rate meant almost every kill dropped — a hard raid was worth roughly nine pieces
      // a clear and the boss was just the last of them.
      //
      // Hard ZONES keep their own rate. They are an endless kill-goal farm with no boss to hand
      // anything over at, so the run rule has nothing to attach to.
      // Souls: per-kill in a zone, per-CLEAR in a dungeon (the boss, not its trash).
      const soul = b.hardKind === "zone" ? soulForZone(b.hardId)
                 : (enemy.hardBoss ? soulForDungeon(b.hardId) : null);
      if (soul) {
        const rate = b.hardKind === "zone" ? SOUL_ZONE_CHANCE : SOUL_DUNGEON_CHANCE;
        if (Math.random() < rate) {
          nc = { ...nc, souls: { ...(nc.souls || {}), [soul.id]: ((nc.souls || {})[soul.id] || 0) + 1 } };
          addLog(`${soul.icon} ${soul.name} — a hard-mode crafting reagent!`, soul.color);
          showNotif(`${soul.icon} ${soul.name}!`);
        }
      }
      const isHardRun = b.hardKind && b.hardKind !== "zone";
      const hardRar = () => (b.dropIlvl >= 70 ? rollRarityForDungeon("stratholme") : rollRarityForZone(60));
      const guildBoss = guildRunRef.current && (enemy.isBoss || enemy.hardBoss);
      if (!isHardRun) {
        const rate = 0.10 * (enemy.isBoss || enemy.isLord ? 1.6 : 1) * (1 + townBonuses(nc).drop);
        if (Math.random() < rate && !guildBoss) nc = grantLoot(nc, afkGear([generateItem(b.dropIlvl, hardRar(), pickLootSlot(), nc.cls)]));
        if (!unattended) nc = grantGem(nc, rollGem({ level: enemy.level, isBoss: enemy.isBoss || enemy.isLord, dungeonId: "stratholme", dropMult: 1 + townBonuses(nc).drop }));
      } else if (enemy.hardBoss && !guildBoss) { // Guild boss gear is awarded through the GDKP bid, not auto-looted
        nc = grantLoot(nc, Array.from({ length: DUNGEON_BOSS_DROPS }, () => generateItem(b.dropIlvl, hardRar(), pickLootSlot(), nc.cls)));
        nc = grantGem(nc, rollGem({ level: enemy.level, isBoss: true, dungeonId: "stratholme", dropMult: 1 + townBonuses(nc).drop }));
      }
      // progression tracking
      if (b.hardKind === "zone") {
        const hz = hardZoneById(b.hardId);
        const k = ((nc.hardKills || {})[b.hardId] || 0) + 1;
        nc = { ...nc, hardKills: { ...(nc.hardKills || {}), [b.hardId]: k } };
        if (hz && k >= hz.killGoal && !nc.hardZoneDone?.[b.hardId]) { nc = { ...nc, hardZoneDone: { ...(nc.hardZoneDone || {}), [b.hardId]: true } }; addLog(`🏆 ${hz.name} (Hard) conquered — ${hz.killGoal} kills!`); showNotif(`🏆 ${hz.name} complete!`); }
      } else if (enemy.hardBoss) {
        const bk = ((nc.hardBossKills || {})[enemy.hardBoss] || 0) + 1;
        nc = { ...nc, hardBossKills: { ...(nc.hardBossKills || {}), [enemy.hardBoss]: bk } };
        const hd = hardDungeonById(b.hardId);
        addLog(`☠️ ${enemy.hardBoss} slain (${bk}${hd?.completeCount ? "/" + hd.completeCount : "/" + HARD_BOSS_REQ})`);
        if (hd?.completeCount && bk >= hd.completeCount && !nc.hardDungeonDone?.[b.hardId]) { nc = { ...nc, hardDungeonDone: { ...(nc.hardDungeonDone || {}), [b.hardId]: true } }; addLog(`🏆 ${hd.name} (Hard) cleared!`); showNotif(`🏆 ${hd.name} complete!`); }
        if (b.hardKind === "raid" && bk >= HARD_BOSS_REQ && !nc.hardDungeonDone?.[b.hardId]) { nc = { ...nc, hardDungeonDone: { ...(nc.hardDungeonDone || {}), [b.hardId]: true } }; addLog("🔥 The Molten Heart falls — HELL MODE awaits!"); showNotif("🔥 Hard Mode raid cleared!"); }
      }
    } else if (isDungeon && !enemy.isBoss && !(instanceById(b.dungeonId) || {}).raid) {
      // Dungeon TRASH pays gold and XP only. Gear used to trickle out of every wave at 34%, which
      // made the boss just another roll rather than the reason to be here, and meant a player who
      // died on the last wave had still had most of the run's value. The ramp above is what makes
      // pushing deeper worth it now.
      //
      // The RAID is deliberately exempt. rollLoot calls it the bridge to Hard Mode — it drops on
      // 85% of kills so one clear yields the several ilvl-64 pieces a player needs to reach the
      // average that gates Hard Mode. Cutting it to two would close the only route out of normal
      // mode, the same reason zoneDropScale exempts it.
    } else {
      if (!(guildRunRef.current && enemy.isBoss)) nc = grantLoot(nc, afkGear(rollLoot({ level: enemy.level, isBoss: enemy.isBoss, dungeonId: isDungeon ? b.dungeonId : null, guaranteed: isDungeon && enemy.isBoss, clsId: nc.cls, dropMult: rewardMult * (1 + townBonuses(nc).drop), rolls: isDungeon && enemy.isBoss && !(instanceById(b.dungeonId) || {}).raid ? DUNGEON_BOSS_DROPS : 0 }))); // Guild boss gear comes through the GDKP bid; the raid keeps its own drop maths
      if (!unattended) nc = grantGem(nc, rollGem({ level: enemy.level, isBoss: enemy.isBoss, dungeonId: isDungeon ? b.dungeonId : null, dropMult: rewardMult * (1 + townBonuses(nc).drop) }));
    }

    // Enemy-specific drop (for the upcoming quest & building systems): normal 50%, champions/bosses guaranteed & more
    const edrop = dropForEnemy(enemy);
    if (edrop && (enemy.isBoss || enemy.isChampion || Math.random() < 0.5)) {
      const dq = rankOf(enemy).drops; // drop quantity from the rank table
      nc = { ...nc, drops: { ...(nc.drops || {}), [edrop.id]: ((nc.drops || {})[edrop.id] || 0) + dq } };
      addLog(`${edrop.icon} +${dq} ${edrop.name}`, edrop.color);
    }
    // Bestiary / quest kill tracking (folds champions into their base type)
    const etype = enemyTypeName(enemy);
    if (etype) nc = { ...nc, killsByType: { ...(nc.killsByType || {}), [etype]: ((nc.killsByType || {})[etype] || 0) + 1 } };
    // 💎 Ven — an extremely rare premium-currency drop
    if (Math.random() < (enemy.isBoss ? 0.006 : 0.0004)) { const vg = enemy.isBoss ? 2 : 1; nc = { ...nc, ven: (nc.ven || 0) + vg }; addLog(`💎 Rare drop! +${vg} Ven`); showNotif(`💎 +${vg} Ven!`); }

    // Mimic Chest: subtle crafting materials suited to the player's gathering ranks, growing with zone level
    if (enemy.isMimic) {
      const oreTier = ORE_TIERS[highestOreTierIdx(nc.professions?.mining?.level || 1)];
      const herbTier = HERB_TIERS[highestTierIdx(HERB_TIERS, nc.professions?.herbalism?.level || 1)];
      const q = 1 + Math.floor((enemy.level || 1) / 25); // very subtle (1 → 3), scales with zone level
      const mats = { ...nc.materials };
      mats[oreTier.id] = (mats[oreTier.id] || 0) + q;
      mats[herbTier.id] = (mats[herbTier.id] || 0) + q;
      nc = { ...nc, materials: mats };
      addLog(`🧰 The Mimic Chest bursts! +${q} ${oreTier.name}, +${q} ${herbTier.name}`);
      showNotif(`🧰 Mimic loot: +${q} ${oreTier.name} · +${q} ${herbTier.name}`);
      if ((nc.professions?.mining?.level || 1) >= PROF_MAX && Math.random() < 0.005) { // 0.5% crystalline at max mining
        nc = { ...nc, materials: { ...nc.materials, crystalline: (nc.materials.crystalline || 0) + 1 } };
        addLog("💎 The Mimic held a shard of Crystalline Ore!"); showNotif("💎 Crystalline Ore!");
      }
    }

    // Relics: never from zones. Extremely rare from dungeon mobs (that dungeon's relic), very rare from raid mobs (any relic).
    if (b.mode === "dungeon") {
      const inst = instanceById(b.dungeonId);
      let relicDef = null;
      if (inst?.raid) { if (Math.random() < 0.015) relicDef = pick(RELICS); }          // raids: very rare, any relic
      else { const d = relicForDungeon(b.dungeonId); if (d && Math.random() < 0.005) relicDef = d; } // dungeons: extremely rare, this dungeon's relic
      if (relicDef) {
        nc = { ...nc, ...depositEarned(nc, makeRelic(relicDef, enemy.level)) };
        addLog(`🔱 RELIC DROP: ${relicDef.name}!`);
        showNotif(`🔱 Relic drop: ${relicDef.name}!`);
      }
      // Molten Heart raid: 1% Crystalline Ore at max mining rank
      if (inst?.id === "moltencore" && (nc.professions?.mining?.level || 1) >= PROF_MAX && Math.random() < 0.01) {
        nc = { ...nc, materials: { ...nc.materials, crystalline: (nc.materials.crystalline || 0) + 1 } };
        addLog("💎 Crystalline Ore glimmers in the Molten Heart!"); showNotif("💎 Crystalline Ore!");
      }
    }

    // ----- the Abyss: bank the kill, roll the drop -----
    if (b.mode === "abyss") {
      const ap = b.abyssPlus || 0;
      const prog = recordAbyssKill(nc, ap);
      nc = { ...nc, abyss: prog.abyss };
      if (prog.msg) { addLog(prog.msg); showNotif(prog.msg); }
      // One piece every 150 kills on average, 95% epic and 5% legendary. Rolled per kill rather
      // than counted, so a run of bad luck is possible and a run of good luck is too — a hard
      // counter would make the 150th kill the only one that ever mattered.
      if (Math.random() < 1 / ABYSS.killsPerDrop) {
        const rar = rarityById(Math.random() < ABYSS.legendaryChance ? "legendary" : "epic");
        const it = generateItem(ABYSS.dropIlvl, rar, pickLootSlot(), c.cls, ap);
        // The roll happens either way — rate and rarity are never touched — and the allowance
        // decides whether the piece is kept, exactly as it does while parked.
        if (afkGear([it]).length) {
          nc = { ...nc, ...depositEarned(nc, it) };
          addLog(`🕳️ ${it.name} — ${abyssLabel(ap)}, ilvl ${it.ilvl}`, rar.color);
          showNotif(`🕳️ ${rar.name} drop: ${it.name}`);
        }
      }
    }

    // ----- next encounter -----
    let nb;
    if (b.mode === "abyss") {
      // Endless. No waves, no boss, no end — the next one simply walks up.
      nb = { ...b, enemy: makeAbyssEnemy(b.abyssPlus || 0), hp: b.hp, enemyEffects: [],
             enemyNextAt: Date.now() + ENEMY_BASE_INTERVAL, playerNextAt: Date.now() + 600 };
    } else if (b.mode === "hard") {
      if (b.hardKind === "zone") {
        const e = makeHardEnemy(hardZoneById(b.hardId), "zone"); // endless zone farm
        nb = { ...b, enemy: e, hp: b.hp, enemyEffects: [], enemyNextAt: Date.now() + ENEMY_BASE_INTERVAL, playerNextAt: Date.now() + 600 };
      } else {
        const inst = b.hardKind === "raid" ? HARD_RAID : hardDungeonById(b.hardId);
        if (enemy.hardBoss) { // final-wave boss slain → run complete
          addLog(`🏆 ${inst.name} (Hard) cleared!`); showNotif(`🏆 ${inst.name} cleared!`);
          nb = null;
        } else {
          const nextWave = b.wave + 1;
          // waves + 1, matching normal mode. Hard Mode used to treat the LAST wave as the boss,
          // so `waves` meant "fights including the boss" here and "trash only" there — the same
          // field counting two different things in two places.
          const isBossWave = nextWave > b.waves;
          const e = makeHardEnemy(inst, b.hardKind, isBossWave, nextWave);
          addLog(isBossWave ? `⚔️ Final boss: ${inst.boss}!` : `🔥 Wave ${nextWave}/${b.waves}`);
          nb = { ...b, wave: nextWave, enemy: e, hp: b.hp, enemyEffects: [], enemyNextAt: Date.now() + ENEMY_BASE_INTERVAL, playerNextAt: Date.now() + 600 };
        }
      }
    } else if (b.mode === "dungeon") {
      if (enemy.isBoss) {
        nc.dungeonClears = (nc.dungeonClears || 0) + 1;
        const dn = instanceById(b.dungeonId);
        addLog(`🏆 ${dn?.name} cleared!`);
        showNotif(`🏆 ${dn?.name} cleared!`);
        nb = null; // back to idle
      } else {
        const nextWave = b.wave + 1;
        const dn = instanceById(b.dungeonId);
        const isBossWave = nextWave > dn.waves;
        const enemyLvl = dn.minLevel + 2 + Math.floor(Math.random() * 4) + (isBossWave ? 3 : 0);
        // The same ramp the rewards use, so a wave that pays 70% more is 70% harder.
        const ramp = dungeonWaveScale(nextWave, dn.waves);
        const e = makeEnemy(enemyLvl, isBossWave
          ? { isBoss: true, dungeon: dn.id, name: `💀 ${dn.boss}`, hpMult: (dn.hpMult || 1) * ramp }
          : { dungeon: dn.id, champion: true, hpMult: (dn.raid ? 1.3 : 1.1) * (dn.hpMult || 1) * ramp });
        addLog(isBossWave ? `⚔️ Final boss: ${dn.boss}!` : `⚔️ Wave ${nextWave}/${dn.waves}`);
        nb = { ...b, wave: nextWave, enemy: e, hp: b.hp, enemyEffects: [], enemyNextAt: Date.now() + ENEMY_BASE_INTERVAL, playerNextAt: Date.now() + 600 };
      }
    } else {
      // zones are chosen manually (you can revisit any unlocked zone in the World tab)
      const z = ZONES.find((z) => z.id === nc.currentZoneId) || ZONES[0];
      const nextIsBoss = nc.kills > 0 && nc.kills % 10 === 0;
      const enemyLvl = clamp(nc.level, z.minLevel, z.maxLevel);
      const e = makeEnemy(enemyLvl, nextIsBoss ? { isBoss: true, name: `💀 ${pick(z.enemies)} Champion` } : (Math.random() < 0.05 ? { mimic: true } : {}));
      e.name = (nextIsBoss || e.isMimic) ? e.name : pick(z.enemies);
      if (e.isMimic) addLog("🧰 A Mimic Chest appears — defeat it for crafting materials!");
      nb = { ...b, enemy: e, hp: b.hp, enemyEffects: [], enemyNextAt: Date.now() + ENEMY_BASE_INTERVAL, playerNextAt: Date.now() + 600 };
    }
    // 2% max-health heal on every enemy defeated (carries into the next encounter)
    if (nb) {
      nb.drPlayer = {}; nb.drEnemy = {}; // debuff diminishing-returns reset per enemy
      if (nc.cls === "hunter") { nb.resQ = []; nb.res = 0; } // Marks are bound to the target and die with it
      nb.hp = Math.min(maxHpFor(nc), nb.hp + Math.floor(maxHpFor(nc) * 0.02)); // 2% heal per kill
    }
    // full heal on level up; keep persistent HP synced
    if (nb && leveled) nb.hp = maxHpFor(nc);
    nc.hp = nb ? nb.hp : maxHpFor(nc);
    return { char: nc, battle: nb };
  };

  const finishKill = (c, bSnap) => {
    if (bSnap && bSnap.pvp) { botCharRef.current = null; botMirrorRef.current = null; botTierRef.current = null; commitBattle(null);
      if (bSnap.practice) { const pc = charRef.current; commitChar({ ...pc, tutorial: { ...(pc.tutorial || {}), duelDone: true } }); addLog(`🎯 Practice bout won against ${bSnap.ratedOpp?.name || "your partner"} — unranked, nothing recorded.`); }
      else { recordRated(true); addLog(`🏆 You defeated ${bSnap.ratedOpp?.name || "your rival"}!`); }
      setTab("arena"); return; }
    const res = resolveDeath(c, bSnap);
    commitChar(res.char);
    commitBattle(res.battle);
    if (res.battle === null) { setGroupParty(null); pveBotsRef.current = null; } // run ended → drop the party panel
    // GDKP: a Guild run's final boss just fell (run complete → battle cleared) → open the loot bid
    if (res.battle === null && guildRunRef.current && (bSnap.mode === "dungeon" || bSnap.mode === "hard") && bSnap.hardKind !== "zone") {
      const gr = guildRunRef.current; guildRunRef.current = null;
      const floor = rarityById("epic");
      const items = [generateItem(gr.ilvl, floor, pickLootSlot(), res.char.cls)];
      if (gr.raid) items.push(generateItem(gr.ilvl, floor, pickLootSlot(), res.char.cls)); // raids drop two
      setGuildBid({ items, party: gr.party });
    }
  };

  // Apply a skill's full effect bag to a battle snapshot. Returns { battle, died }.
  const applySkill = (skill, c, bIn, now) => applySkillCore(skill, c, bIn, now, addLog);

  const useSkill = (skill) => {
    const b = battleRef.current; const c = charRef.current;
    if (!b) { showNotif("Enter combat first!"); return; }
    if (talentFlag(c, "noSkills")) { showNotif("Your talent disables skills"); return; }
    if (talentFlag(c, "noMagic") && isMagicSkill(skill)) { showNotif("Exiled — cannot use magic skills"); return; }
    if (playerSpeedMultOf(b.playerEffects) <= 0) { showNotif("💫 Stunned — can't use skills!"); return; }
    if ((b.cooldowns?.[skill.name] || 0) > Date.now()) return;
    if (b.pvp && (b.pvpGcdUntil || 0) > Date.now()) { showNotif("⏳ Global cooldown — time your next skill"); return; } // PvP anti-spam
    const nowTs = Date.now();
    const res = applySkill(skill, c, b, nowTs);
    if (b.pvp) res.battle.pvpGcdUntil = nowTs + PVP_GCD;
    if (res.died) finishKill(c, res.battle);
    else commitBattle(res.battle);
  };

  // defeat: pay the spirit healer, cleanse poison, lose half XP progress, PAUSE combat
  const applyDefeat = () => {
    const c = charRef.current; const b = battleRef.current;
    if (!b) return;
    if (b.pvp) { botCharRef.current = null; botMirrorRef.current = null; botTierRef.current = null; guildRunRef.current = null; setGroupParty(null);
      // A practice bout counts as learned whether it was won or lost — the lesson is the fight, not
      // the result, and a player who cannot beat the partner must not be walled out of the game.
      const base = { ...c, hp: maxHpFor(c) };
      commitChar(b.practice ? { ...base, tutorial: { ...(base.tutorial || {}), duelDone: true } } : base);
      commitBattle(null);
      if (!b.practice) recordRated(false);
      addLog(b.practice ? `🎯 ${b.ratedOpp?.name || "Your partner"} took that one — unranked, nothing recorded. Lesson learned.`
                        : `💀 ${b.ratedOpp?.name || "Your rival"} bested you in the arena.`);
      setTab("arena"); return; }
    // GROUP RUN death rule: an individual death does NOT fail the run. A living teammate battle-reses
    // you (limited charges). The run only fails on a true wipe — reses exhausted or every member down.
    if (guildRunRef.current && groupPartyRef.current) {
      const livingMates = (groupPartyRef.current || []).filter((m) => !m.me && m.hp > 0).length;
      if (resesRef.current > 0 && livingMates > 0) {
        resesRef.current -= 1; setGroupReses(resesRef.current);
        commitBattle({ ...b, hp: Math.max(1, Math.round(maxHpFor(c) * 0.4)) }); // revived at 40% — fight continues
        addLog(`✚ A teammate battle-reses you! (${resesRef.current} left)`); showNotif("✚ Battle-res!");
        return;
      }
      guildRunRef.current = null; setGroupParty(null); pveBotsRef.current = null; // out of reses / whole party down → wipe (run fails, no bid)
      commitChar({ ...c, hp: maxHpFor(c) }); commitBattle(null);
      addLog("☠️ Party wipe — the run fails."); showNotif("☠️ Party wiped");
      setTab("guild");
      return;
    }
    guildRunRef.current = null; setGroupParty(null); // solo defeat (existing behavior)
    const wasHard = b.mode === "hard";
    const lowLevel = c.level < 10;
    const penalty = lowLevel ? 0 : Math.min(c.gold, Math.max(Math.floor(c.level * 6), Math.floor(c.gold * 0.1)));
    const xpLost = lowLevel ? 0 : Math.floor(c.xp * 0.25);
    const nc = { ...c, gold: c.gold - penalty, xp: c.xp - xpLost, hp: maxHpFor(c) };
    commitChar(nc);
    if (lowLevel) { addLog("💀 You died! No penalty under level 10. Combat paused."); showNotif("💀 Defeated — no penalty (under 10)"); }
    else { addLog(`💀 You died! The shrine healer charges ${penalty}g and you lose ${xpLost} XP. Combat paused.`); showNotif(`💀 Defeated — lost ${penalty}g & ${xpLost} XP`); }
    commitBattle(null);
  };

  // enemy casts a class skill at the player (direct damage, a DoT debuff, or a slow/stun debuff)
  // Diminishing returns on crowd control (stun/slow only): 1st full, 2nd 35%, 3rd+ immune. Refreshes count.
  // Resets per enemy. DoTs are exempt. (Warlock Hexer refreshes via autos and never calls this, so it's exempt.)
  // Dungeon/Raid enrage: after 90s of the whole run, enemy damage ramps +5%/second until cleared or you die.
  const enrageMult = (w, now) => {
    const isRun = w.mode === "dungeon" || (w.mode === "hard" && w.hardKind && w.hardKind !== "zone");
    if (!isRun || !w.runStart) return 1;
    const over = (now - w.runStart - 90000) / 1000;
    return over > 0 ? 1 + 0.05 * over : 1;
  };
  const enemyCast = (c, w, now) => {
    const pool = (w.enemy.skills && w.enemy.skills.length) ? w.enemy.skills : (SKILLS[w.enemy.cls] || []).filter((s) => s.unlockLevel <= w.enemy.level && ((s.mult && s.mult > 0) || s.dotMult || s.slowPct));
    if (!pool.length) return false;
    const sk = pick(pool);
    const isMagicHit = skillType(sk.name) === "magic"; const spellbreak = talentFlag(c, "spellbreaker"); // Spellbreaker reacts to magic
    const magicCut = isMagicHit && spellbreak ? 0.85 : 1;
    const elite = w.enemy.isBoss || w.enemy.isChampion || w.enemy.isLord; // Bosses/Champions/Lords apply doubled debuffs
    const debuffMult = elite ? 2 : 1;
    const eff = effectiveStats(c); const mit = mitigation(eff.armor, w.enemy.level); const sp = secondaryPcts(eff); const ab = activeBuffs(c);
    const base = enemyBaseDamage(w.enemy) * ENEMY_SKILL_SCALE * enrageMult(w, now); // Hard Mode damage now lives in enemy stats; dungeon enrage ramp still applies
    const wardLow = (d) => { // Warding potion + ward buffs + early-game protection (applies to everything)
      d = d * wardMultOf(w.playerEffects);
      if (ab.reducepct) d = d * (1 - ab.reducepct.amount / 100);
      if (c.level < 5) d = d * 0.8;
      return Math.max(1, Math.floor(d));
    };
    // direct nukes: mitigated by armor only (Versatility no longer reduces skill damage)
    const directDmg = (dmg) => wardLow(dmg * (1 - mit) * magicCut);
    // DoT ability damage: reduced by Resilience (its dedicated defense), not armor
    const dotDmg = (dmg) => wardLow(dmg * (1 - sp.resil / 100) * magicCut);
    if (isMagicHit && spellbreak && (sk.mult || sk.dotMult)) { const pb = w.playerEffects.find((e) => e.kind === "physbuff"); if (pb) { pb.stacks = Math.min(5, (pb.stacks || 0) + 1); pb.expires = now + 12000; } else { w.playerEffects.push({ kind: "physbuff", name: "Spell Feedback", icon: "⚔️", stacks: 1, expires: now + 12000 }); } addLog(`⚔️ Spell Feedback — +${Math.min(5, (w.playerEffects.find((e) => e.kind === "physbuff") || {}).stacks || 1) * 5}% physical damage`); }
    if (sk.mult && sk.mult > 0) {
      const dmg = directDmg(base * sk.mult * (sk.hits || 1));
      w.hp = Math.max(0, w.hp - dmg);
      addLog(`✦ ${w.enemy.name} casts ${sk.name} — ${dmg}!`);
    }
    if (sk.dotMult) {
      const per = Math.max(1, Math.floor((dotDmg(base * sk.dotMult) * debuffMult) / (sk.dotDur || 3)));
      w.playerEffects = w.playerEffects.filter((e) => !(e.kind === "pdot" && e.name === sk.name));
      w.playerEffects.push({ kind: "pdot", name: sk.name, icon: sk.dotIcon || "☠️", dmgPerTick: per, nextTick: now + 1000, expires: now + (sk.dotDur || 3) * 1000 * debuffMult });
      addLog(`${sk.icon} ${w.enemy.name}'s ${sk.name} afflicts you — ${per}/s`);
    }
    if (sk.slowPct) {
      const isStun = sk.slowPct >= 100;
      const drf = drFactor(w, "player", isStun ? "stun" : "slow", true); // peek
      // Resilience gives a chance to resist stun/slow debuffs
      if (drf <= 0) { addLog(`🛡️ You resist more ${isStun ? "stuns" : "slows"} (diminishing returns)`); }
      else if (Math.random() < sp.resil / 100) {
        addLog(`🛡️ Resilience resists ${w.enemy.name}'s ${sk.name}!`);
      } else {
        drFactor(w, "player", isStun ? "stun" : "slow"); // consume a stack
        const ccMult = sk.name === "Fear" ? 1 : debuffMult; // Fear is exempt from the elite CC-duration doubling
        w.playerEffects = w.playerEffects.filter((e) => !(e.kind === "pslow" && e.name === sk.name));
        w.playerEffects.push({ kind: "pslow", name: sk.name, icon: isStun ? "💫" : "🐌", pct: isStun ? 100 : Math.round(sk.slowPct * drf), expires: now + (sk.slowDur || 3) * 1000 * ccMult * drf * (isMagicHit && spellbreak ? 0.8 : 1) });
        addLog(`${sk.icon} ${w.enemy.name}'s ${sk.name} ${isStun ? "stuns" : "slows"} you!`);
      }
    }
    return w.hp <= 0;
  };

  // ---------- combat engine: variable attack speed, DoTs, HoTs, slows, dodge ----------
  useEffect(() => {
    if (!battle) return;
    const iv = setInterval(() => {
      const c = charRef.current; const b = battleRef.current;
      if (!b) return;
      const now = Date.now();
      const maxHp = maxHpFor(c);
      const sp = secondaryPcts(effectiveStats(c));
      let w = { ...b, enemy: { ...b.enemy }, playerEffects: (b.playerEffects || []).filter((e) => e.expires > now), enemyEffects: (b.enemyEffects || []).filter((e) => e.expires > now) };
      let dirty = w.playerEffects.length !== (b.playerEffects || []).length || w.enemyEffects.length !== (b.enemyEffects || []).length;

      // ---------- Beastmaster: Savage Companion (persistent, killable pet) ----------
      if (talentFlag(c, "beastPet")) {
        if (!w.pet) w.pet = { hp: petMaxHp(c), maxHp: petMaxHp(c), nextAt: now + PET.interval, resummonAt: 0 };
        const pet = w.pet;
        if (pet.hp <= 0 && pet.resummonAt && now >= pet.resummonAt) { pet.hp = pet.maxHp; pet.resummonAt = 0; pet.nextAt = now + PET.interval; addLog("🐺 Your Savage Companion returns to your side!"); dirty = true; }
        if (pet.hp > 0 && w.enemy.hp > 0) {
          let gp = 0;
          while (now >= (pet.nextAt || 0) && w.enemy.hp > 0 && gp++ < 4) {
            let pd = petHitDamage(c); if (pet.empowerUntil && now < pet.empowerUntil) pd = Math.floor(pd * (1 + PET.empower));
            const pcrit = Math.random() < critChanceFor(c); if (pcrit) pd = Math.floor(pd * critMultFor(c));
            w.enemy.hp = Math.max(0, w.enemy.hp - pd); addLog(`🐺 Savage Companion mauls for ${pd}${pcrit ? " ⚡" : ""}`);
            pet.nextAt = (pet.nextAt || now) + PET.interval; dirty = true;
          }
          if ((pet.nextAt || 0) < now) pet.nextAt = now + PET.interval;
        }
      }

      // player auto-attacks (class rate × haste, reduced by enemy slow/stun debuffs)
      const pSpeed = Math.max(0.1, 1 + agiAtkSpeed(c) + talentMods(c).atkSpeed + hasteOf(c)) * hasteMultOf(w.playerEffects) * playerSpeedMultOf(w.playerEffects);
      const stunned = pSpeed <= 0;
      if (stunned) { if (w.playerNextAt < now + 150) { w.playerNextAt = now + 150; dirty = true; } }
      const pInterval = stunned ? Infinity : PLAYER_BASE_INTERVAL / pSpeed;
      const critStackPer = gemAutoCritStack(c); // Frenzy Star: +crit dmg per auto until a crit lands
      const execThresh = gemAutoExec(c);         // Executioner's Eye: auto-slay below this % HP
      let g = 0;
      while (!stunned && now >= w.playerNextAt && w.enemy.hp > 0 && g++ < 6) {
        const crit = Math.random() < critChanceFor(c);
        let dmg = Math.floor(computeDamage(c, rollWeaponDmg(c), talentFlag(c, "intAuto")) * empowerMultOf(w.playerEffects) * (talentFlag(c, "intAuto") ? 1 : physBuffMultOf(w.playerEffects))); // Spellsword/Demon: autos scale from Int; empower buffs boost damage; Spellbreaker boosts physical autos
        dmg *= 1 + talentMods(c).autoPct; // Exiled +25% / Hexer −75%
        dmg *= talentAutoMult(c, (w.enemy.maxHp > 0 ? w.enemy.hp / w.enemy.maxHp : 1)); // spec auto talents
        if (crit) { dmg *= critMultFor(c) + (w.autoCritStacks || 0) * critStackPer; w.autoCritStacks = 0; } // spend banked Frenzy stacks
        else if (critStackPer > 0) w.autoCritStacks = (w.autoCritStacks || 0) + 1;
        dmg = Math.max(1, Math.floor(dmg * (w.pvp ? PVP_AUTO_MULT : 1)));
        dmg = Math.max(1, Math.floor(dmg * (1 - enemyMitigation(w.enemy, c.level))));   // armoured archetypes turn blows
        w.enemy.hp = Math.max(0, w.enemy.hp - dmg);
        if (execThresh > 0 && w.enemy.hp > 0 && w.enemy.hp <= (w.enemy.maxHp || 0) * execThresh) { w.enemy.hp = 0; addLog("👁️ Executioner's Eye — slain!"); } // instant kill on execute
        if (sp.leech > 0 || talentMods(c).leech > 0) { const h = Math.floor(dmg * (sp.leech + talentMods(c).leech) / 100); if (h > 0) w.hp = Math.min(maxHp, w.hp + h); }
        if (talentFlag(c, "hexRefresh")) { w.enemyEffects.forEach((e) => { if (e.dur) e.expires = now + e.dur; }); } // Hexer: refresh your debuffs on the enemy
        addLog(`🗡️ Auto-attack: ${dmg}${crit ? " ⚡" : ""}`, crit ? "#FFD700" : "#7EC8E3");
        w.playerNextAt += pInterval; dirty = true;
      }
      if (w.enemy.hp <= 0) { finishKill(c, w); return; }
      if (!stunned && now >= w.playerNextAt) w.playerNextAt = now + pInterval;

      // Skill automation is handled exclusively by the Gambit system below (no free auto-cast).

      // Gambit automation — evaluate each skill's if/then rules and fire the action
      if (!stunned && (c.level || 1) >= GAMBIT_UNLOCK_LEVEL) {
        const rules = c.gambits?.rules || {};
        const gMaxHp = maxHpFor(c);
        // Conditions are evaluated by the shared core so they can be unit-tested headlessly.
        const slotSkills = c.selectedSkills || [];
        const condMet = (ifId) => gambitCondMet(ifId, {
          char: c, w, now, maxHp: gMaxHp, buffs: activeBuffs(charRef.current), slotSkills,
        });
        const fireConsumable = (tg) => {
          const cc = charRef.current; const def = consumableById(tg.consumable); if (!def) return;
          const t = bestTier(cc, def.id); if (t < 0 || conCount(cc, def.id, t) <= 0) return;
          const key = conKey(def.id, t);
          if (def.kind === "heal") {
            const ck = "gcd_" + def.id;
            // The Draught Belt and this gambit drink from ONE potion stock but used to keep two
            // separate clocks, so a single dip below 30% fired both and spent two potions where one
            // would do. A potion restores 53-58% of the bar, so the second lands on a character
            // already back at ~87% and throws most of itself away. The manual/belt cooldown is
            // honoured here as well, and taking a drink starts it — one shared clock, three sources.
            if (Date.now() - lastPotionRef.current < POTION_CD) return;
            if (w.hp >= gMaxHp || (w.cooldowns?.[ck] || 0) > now) return;
            w.hp = Math.min(gMaxHp, w.hp + Math.round(tierHeal(t) * gemPotionMult(cc))); w.cooldowns = { ...(w.cooldowns || {}), [ck]: now + 8000 };
            lastPotionRef.current = Date.now(); setLastPotion(Date.now());
            commitChar({ ...cc, consumables: { ...cc.consumables, [key]: cc.consumables[key] - 1 } });
            addLog(`🧪 Gambit: ${def.name} (+HP)`); dirty = true;
          } else if (def.kind === "dmgbuff" || def.kind === "reducebuff") {
            const bkey = def.kind === "dmgbuff" ? "dmgpct" : "reducepct";
            if (activeBuffs(cc)[bkey]) return;
            commitChar({ ...cc, consumables: { ...cc.consumables, [key]: cc.consumables[key] - 1 }, buffs: { ...cc.buffs, [bkey]: { amount: Math.round(tierBuffPct(t) * gemPotionMult(cc)), expires: now + POTION_BUFF_DURATION } } });
            addLog(`⚗️ Gambit: ${def.name}`, def.color); dirty = true;
          } else {
            if (activeBuffs(cc)[def.stat]) return;
            commitChar({ ...cc, consumables: { ...cc.consumables, [key]: cc.consumables[key] - 1 }, buffs: { ...cc.buffs, [def.stat]: { amount: Math.round(tierScrollAmount(t) * gemScrollMult(cc)), expires: now + BUFF_DURATION } } });
            addLog(`📜 Gambit: ${def.name}`, def.color); dirty = true;
          }
        };
        const runRule = (rule) => {
          if (gambitById(rule?.then)?.kind === "veto") return false;   // handled by the veto pass
          if (w.pvp) return false; // gambits are disabled in Rated PvP — play it by hand
          if (!rule || !rule.if || !rule.then || !condMet(rule.if)) return false;
          const tg = gambitById(rule.then); if (!tg) return false;
          if (tg.kind === "skill") {
            const sk = isEquipped(c, tg.skill) ? skillByName(c, tg.skill) : null; // must be slotted on the bar
            if (sk && (w.cooldowns?.[sk.name] || 0) <= now && !talentFlag(c, "noSkills") && !(talentFlag(c, "noMagic") && isMagicSkill(sk))) {
              const res = applySkill(sk, c, w, now); w = res.battle; dirty = true;
              if (res.died) { finishKill(c, w); return true; }
            }
          } else if (tg.kind === "consumable") { fireConsumable(tg); }
          return false;
        };
        // General gambits (consumable-focused) first, then the bar in SLOT ORDER — slot 1 is
        // highest priority, so you shape your rotation by arranging the bar. Evaluation used to
        // walk `rules` in object key order, which made "which rule wins" effectively arbitrary.
        for (const rule of (c.gambits?.general || [])) { if (runRule(rule)) return; }
        // Veto pass: a "do NOT use" rule holds its own slot back for this tick, so a lower slot
        // can take the cast instead. Resolved up front so priority order stays predictable.
        const vetoed = new Set();
        for (let n = 1; n <= MAX_SKILL_SLOTS; n++) {
          for (const rule of (rules[n] || [])) {
            if (gambitById(rule.then)?.kind === "veto" && rule.if && condMet(rule.if)) { vetoed.add(n); break; }
          }
        }
        for (let n = 1; n <= MAX_SKILL_SLOTS; n++) {
          if (vetoed.has(n)) continue;
          for (const rule of (rules[n] || [])) { if (runRule(rule)) return; }
        }
      }

      // class resource is volatile — unspent power decays away
      if ((w.resQ || []).length && resExpire(w, now)) { addLog(`${classResource(c.cls).icon} Unspent ${classResource(c.cls).name} fades away`); dirty = true; }

      // gem regeneration — socketed Emeralds restore a % of max HP each second
      const gRegen = gemRegen(c);
      if (gRegen > 0 && w.hp > 0 && w.hp < maxHp) {
        if (!w.regenNextAt) w.regenNextAt = now + 1000;
        if (now >= w.regenNextAt) {
          const heal = Math.max(1, Math.floor(maxHp * gRegen / 100));
          w.hp = Math.min(maxHp, w.hp + heal); w.regenNextAt = now + 1000; dirty = true;
        }
      }

      // enemy DoTs
      w.enemyEffects.forEach((e) => {
        if (e.kind === "dot") { let g2 = 0; while (now >= e.nextTick && w.enemy.hp > 0 && g2++ < 6) { w.enemy.hp = Math.max(0, w.enemy.hp - e.dmgPerTick); if (c.cls === "warlock") { w.shardTicks = (w.shardTicks || 0) + 1; if (w.shardTicks >= SHARD_TICKS_PER) { w.shardTicks = 0; if (resTotal(w) < CLASS_RESOURCES.warlock.max) { resAdd(w, 1, CLASS_RESOURCES.warlock.max, now); addLog("💜 Soul Shard harvested"); } } } const lp = sp.leech + talentMods(c).leech; if (lp > 0) w.hp = Math.min(maxHp, w.hp + Math.floor(e.dmgPerTick * lp / 100)); addLog(`${e.icon} ${e.name}: ${e.dmgPerTick}`); e.nextTick += 1000; dirty = true; } }
      });
      // PvE party bots: scale the boss for the group (once), then let each bot damage it for real
      if (pveBotsRef.current && pveBotsRef.current.length && !w.pvp && !w.enemy.mirror) {
        if (!w.enemy._partyScaled) { const f = 1 + pveBotsRef.current.reduce((s, b) => s + b.tier.dmg * 0.75, 0); w.enemy.hp = Math.round(w.enemy.hp * f); w.enemy.maxHp = Math.round(w.enemy.maxHp * f); w.enemy._partyScaled = true; dirty = true; }
        pveBotStep(w, now); dirty = true;
      }
      if (w.enemy.hp <= 0) { finishKill(c, w); return; }

      // PvP mirror bot: run its real rotation instead of the generic enemy AI
      if (w.enemy.mirror) {
        botStep(c, w, now); dirty = true;
        if (w.hp <= 0) { applyDefeat(); return; }
      }

      // enemy casts class skills (deadlier combat) — but not while stunned
      if (!w.enemy.nextCastAt) w.enemy.nextCastAt = now + ENEMY_FIRST_CAST;
      if (!w.enemy.mirror && now >= w.enemy.nextCastAt) {
        if (enemySpeedMultOf(w.enemyEffects) > 0) {
          const playerDied = enemyCast(c, w, now);
          if (playerDied) { applyDefeat(); return; }
        }
        w.enemy.nextCastAt = now + (w.enemy.castCd || ENEMY_CAST_CD) * archetypeOf(w.enemy).cast; dirty = true;
      }

      // enemy attacks (respect stun/slow + dodge + reduce buff)
      const slowMult = enemySpeedMultOf(w.enemyEffects);
      if (w.enemy.mirror) { /* mirror bot deals its damage via botStep */ }
      else if (slowMult <= 0) { if (w.enemyNextAt < now + 150) { w.enemyNextAt = now + 150; dirty = true; } }
      else {
        // Swing rhythm is the archetype's: a rogue-type flurries, a mage-type winds up.
        const eArch = archetypeOf(w.enemy);
        const eInterval = (ENEMY_BASE_INTERVAL * eArch.atk) / slowMult;
        const eff = effectiveStats(c); const mit = mitigation(eff.armor, w.enemy.level); const ab = activeBuffs(c);
        const dodgeChance = Math.max(c.race === "nightelf" ? 0.03 : 0, dodgePctOf(w.playerEffects));
        let g3 = 0;
        while (now >= w.enemyNextAt && g3++ < 6) {
          if (Math.random() < dodgeChance) { addLog("🌀 Dodged the attack!"); }
          else {
            const eCrit = eArch.crit > 0 && Math.random() < eArch.crit;   // only the archetypes that are meant to spike
            const rawDmg = enemyBaseDamage(w.enemy) * (enemyCanCast(w.enemy) ? enemyAutoMult(w.enemy.level) : 1) * enrageMult(w, now) * (eCrit ? 1 + CRIT_BONUS : 1); // Hard Mode damage now lives in enemy stats; dungeon enrage still applies
            let eDmg = Math.max(1, Math.floor(rawDmg * (1 - mit)));
            if (ab.reducepct) eDmg = Math.max(1, Math.floor(eDmg * (1 - ab.reducepct.amount / 100)));
            eDmg = Math.max(1, Math.floor(eDmg * (1 - sp.vers / 200))); // Versatility reduces auto-attack (white) damage
            if (talentMods(c).dr > 0) eDmg = Math.max(1, Math.floor(eDmg * (1 - talentMods(c).dr))); // talent damage reduction
            eDmg = Math.max(1, Math.floor(eDmg * wardMultOf(w.playerEffects))); // ward buffs reduce damage taken
            if (c.cls === "paladin" && (w.res || 0) > 0) { // Aegis soaks the blow before your health does
              const soak = resTake(w, Math.min(resTotal(w), eDmg)); eDmg -= soak;
              if (soak > 0) addLog(`🛡️ Aegis absorbs ${Math.floor(soak)}`);
              if (eDmg <= 0) { dirty = true; return; }
            }
            if (c.cls === "warrior") { resAdd(w, 5, CLASS_RESOURCES.warrior.max, now); } // Rage builds as you're struck
            if (c.level < 5) eDmg = Math.max(1, Math.floor(eDmg * 0.8)); // early-game protection: -20% until level 5
            if (talentFlag(c, "beastPet") && w.pet && w.pet.hp > 0 && Math.random() < PET.snipe) { // the companion draws some blows — a second target, not a shield
              w.pet.hp = Math.max(0, w.pet.hp - eDmg); addLog(`🐺 Savage Companion is struck for ${eDmg}`); 
              if (w.pet.hp <= 0) { w.pet.resummonAt = now + PET.resummonMs; addLog("🐺 Your Savage Companion is slain! (returns in 15s)"); }
              dirty = true;
            } else {
              w.hp = Math.max(0, w.hp - eDmg);
              addLog(`🩸 ${w.enemy.name} hits for ${eDmg}`);
              if (w.hp <= 0) { applyDefeat(); return; }
            }
          }
          w.enemyNextAt += eInterval; dirty = true;
        }
      }

      // enemy-applied DoT debuffs tick on the player
      w.playerEffects.forEach((e) => {
        if (e.kind === "pdot") { let gp = 0; while (now >= e.nextTick && gp++ < 6) { w.hp = Math.max(0, w.hp - e.dmgPerTick); addLog(`${e.icon} ${e.name}: ${e.dmgPerTick}`); e.nextTick += 1000; dirty = true; } }
      });
      if (w.hp <= 0) { applyDefeat(); return; }

      // player HoTs
      w.playerEffects.forEach((e) => {
        if (e.kind === "hot") { let g4 = 0; while (now >= e.nextTick && g4++ < 6) { w.hp = Math.min(maxHp, w.hp + e.healPerTick); addLog(`➕ Heal ${e.healPerTick}`); e.nextTick += 1000; dirty = true; } }
      });

      if (dirty) commitBattle(w);
    }, ENGINE_TICK);
    return () => clearInterval(iv);
  }, [battle ? battle.mode + (battle.dungeonId || "") : null]);

  // ---------- auto-potion + auto-cleanse (per second; only acts in combat) ----------
  useEffect(() => {
    const iv = setInterval(() => {
      const c = charRef.current; const b = battleRef.current;
      // auto-potion upgrade: drink a heal below AUTO_POTION_HP — a backstop under every gambit
      if (b && b.enemy.hp > 0 && c.upgrades?.autoPotion && conTotal(c, "heal") > 0 && Date.now() - lastPotionRef.current >= POTION_CD) {
        const bt = bestTier(c, "heal");
        if (bt >= 0 && b.hp < maxHpFor(c) * AUTO_POTION_HP && b.hp < maxHpFor(c)) {
          const healed = Math.min(maxHpFor(c), b.hp + tierHeal(bt));
          const key = conKey("heal", bt);
          commitBattle({ ...b, hp: healed });
          commitChar({ ...c, consumables: { ...c.consumables, [key]: c.consumables[key] - 1 } });
          lastPotionRef.current = Date.now(); setLastPotion(Date.now());
          addLog(`🧪 Auto-potion (+${healed - b.hp} HP)`);
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [commitChar, commitBattle, addLog]);

  // ---------- gathering idle tick (gives materials, no gold) ----------
  const lowestDowngradeGreenPlus = (c) => {
    const eligible = c.inventory.filter((it) => it.slotId !== "relic" && !it.relicId && !it.locked && it.abyss == null && RARITIES.findIndex((r) => r.id === it.rarity) >= 2 && isDowngrade(c, it));
    if (!eligible.length) return null;
    return eligible.reduce((lo, it) => (it.value < lo.value ? it : lo), eligible[0]);
  };
  useEffect(() => {
    const iv = setInterval(() => {
      const c = charRef.current;
      const activeIds = Object.keys(c.professions).filter((pid) => c.professions[pid]?.active && PROFESSIONS.find((p) => p.id === pid)?.type === "gathering");
      if (!activeIds.length) return;
      let nc = { ...c, professions: { ...c.professions }, materials: { ...c.materials } };
      activeIds.forEach((pid) => {
        const def = PROFESSIONS.find((p) => p.id === pid);
        const prof = { ...nc.professions[pid] };
        const add = (k, n) => { nc.materials[k] = (nc.materials[k] || 0) + n; };
        const salvageOne = () => {
          const target = lowestDowngradeGreenPlus(nc);
          if (target) { const rIdx = RARITIES.findIndex((r) => r.id === target.rarity); const dust = 1 + Math.max(0, rIdx - 2); add("dust", dust); nc.inventory = nc.inventory.filter((i) => i.id !== target.id); addLog(`♻️ Salvaged ${target.name} → ${dust} Dust`); }
        };
        if (prof.level >= PROF_MAX) {
          // Idle Gather: at max rank, keep harvesting the last-selected material each tick
          if (GATHER_TIERS[pid]) { const tiers = GATHER_TIERS[pid]; let ti = nc.gatherTier?.[pid]; if (ti == null) ti = highestTierIdx(tiers, prof.level); ti = Math.min(tiers.length - 1, ti); if (tiers[ti] && tiers[ti].unlock <= PROF_MAX) add(tiers[ti].id, 1); }
          else if (pid === "salvage") salvageOne();
          nc.professions[pid] = prof;
          return;
        }
        // Derived from PROF_IDLE_HOURS_TO_MAX, with the same +/-1 jitter the flat rate had.
        const base = profIdleXpPerTick();
        let gain = Math.max(1, base + Math.floor(Math.random() * 3) - 1);
        if (c.race === "gnome") gain = Math.ceil(gain * 1.15);
        prof.xp = (prof.xp || 0) + gain;
        const needed = professionXpForLevel(prof.level);
        if (prof.xp >= needed) {
          prof.xp -= needed; prof.level += 1;
          addLog(`⛏️ ${def.name} → rank ${prof.level}`, def.color);
          if (GATHER_TIERS[pid]) { const tiers = GATHER_TIERS[pid]; add(tiers[highestTierIdx(tiers, prof.level)].id, 1); }
          if (pid === "salvage") salvageOne();
        }
        nc.professions[pid] = prof;
      });
      commitChar(nc);
    }, 2500);
    return () => clearInterval(iv);
  }, [commitChar, addLog]);

  // ---------- combat controls ----------
  const curHp = (c) => clamp(typeof c.hp === "number" ? c.hp : maxHpFor(c), 1, maxHpFor(c));
  const startZone = () => {
    const c = charRef.current;
    const z = ZONES.find((z) => z.id === c.currentZoneId) || ZONES[0];
    const e = makeEnemy(clamp(c.level, z.minLevel, z.maxLevel), Math.random() < 0.05 ? { mimic: true } : {});
    if (!e.isMimic) e.name = pick(z.enemies); else addLog("🧰 A Mimic Chest appears — defeat it for crafting materials!");
    const t = Date.now();
    commitBattle({ mode: "zone", hp: curHp(c), enemy: e, res: 0, resQ: [], shardTicks: 0, cooldowns: {}, playerEffects: [], enemyEffects: [], playerNextAt: t + PLAYER_BASE_INTERVAL, enemyNextAt: t + ENEMY_BASE_INTERVAL });
    addLog(`⚔️ Hunting in ${z.name}...`);
  };
  // travel to a zone and immediately begin hunting on the combat screen
  const huntZone = (z) => {
    const c = charRef.current;
    if (c.level < z.minLevel) { showNotif(`Requires level ${z.minLevel}`); return; }
    setLastDungeon(null);
    const nc = { ...c, currentZoneId: z.id };
    commitChar(nc);
    startZone();
    setTab("combat");
  };
  const DUNGEON_RUN_LIMIT = 3;
  const DUNGEON_WINDOW = 3600000; // ALL runs reset in full every hour (from the first run of the window)
  const dungeonWindowActive = (r) => !!(r && r.start && (Date.now() - r.start < DUNGEON_WINDOW));
  const dungeonRunsLeft = (c, dnId) => {
    const r = c.dungeonRuns?.[dnId];
    if (!dungeonWindowActive(r)) return DUNGEON_RUN_LIMIT; // no active window → runs are full again
    return Math.max(0, DUNGEON_RUN_LIMIT - (r.runs || 0));
  };
  const dungeonResetLeft = (c, dnId) => { const r = c.dungeonRuns?.[dnId]; return dungeonWindowActive(r) ? Math.max(0, r.start + DUNGEON_WINDOW - Date.now()) : 0; };
  const startDungeon = (dn, useTicket = false) => {
    const c = charRef.current;
    if (c.level < dn.minLevel) { showNotif(`Requires level ${dn.minLevel}`); return; }
    let nc;
    if (dungeonRunsLeft(c, dn.id) <= 0) {
      if (useTicket && (c.tickets?.dungeonReset || 0) > 0) { nc = { ...c, tickets: { ...c.tickets, dungeonReset: c.tickets.dungeonReset - 1 } }; showNotif("🎟️ Dungeon Reset Ticket used"); }
      else { showNotif("Out of runs — tap the timer to use a reset ticket"); return; }
    } else {
      const prev = c.dungeonRuns?.[dn.id];
      const rec = dungeonWindowActive(prev) ? { start: prev.start, runs: (prev.runs || 0) + 1 } : { start: Date.now(), runs: 1 };
      nc = { ...c, dungeonRuns: { ...c.dungeonRuns, [dn.id]: rec } };
    }
    commitChar(nc);
    setLastDungeon(dn.id);
    const enemyLvl = dn.minLevel + 2 + Math.floor(Math.random() * 4);
    // Through the ramp even at wave 1, where it is x1.00 — so the first fight cannot drift away
    // from the rest of the run if the ramp's shape is retuned.
    const e = makeEnemy(enemyLvl, { dungeon: dn.id, champion: true, hpMult: (dn.raid ? 1.3 : 1.1) * (dn.hpMult || 1) * dungeonWaveScale(1, dn.waves) });
    const t = Date.now();
    commitBattle({ mode: "dungeon", dungeonId: dn.id, wave: 1, runStart: t, drPlayer: {}, drEnemy: {}, hp: curHp(nc), enemy: e, res: 0, resQ: [], shardTicks: 0, cooldowns: {}, playerEffects: [], enemyEffects: [], playerNextAt: t + PLAYER_BASE_INTERVAL, enemyNextAt: t + ENEMY_BASE_INTERVAL });
    setTab("combat");
    addLog(`🏰 Entering ${dn.name}! Wave 1/${dn.waves}`);
  };
  const raidCooldownLeft = (c, id) => Math.max(0, (c.raidCooldowns?.[id] || 0) - Date.now());
  const startRaid = (raid) => {
    const c = charRef.current;
    if (avgEquippedIlvl(c) < raid.reqIlvl) { showNotif(`Requires avg ilvl ${raid.reqIlvl}`); return; }
    if (raidCooldownLeft(c, raid.id) > 0) { showNotif("Raid is on cooldown"); return; }
    const nc = { ...c, raidCooldowns: { ...(c.raidCooldowns || {}), [raid.id]: Date.now() + RAID_COOLDOWN } };
    commitChar(nc);
    setLastDungeon(raid.id);
    const enemyLvl = raid.minLevel + 2 + Math.floor(Math.random() * 3);
    const e = makeEnemy(enemyLvl, { dungeon: raid.id, champion: true, hpMult: 1.3 * (raid.hpMult || 1) });
    const t = Date.now();
    commitBattle({ mode: "dungeon", dungeonId: raid.id, wave: 1, runStart: t, drPlayer: {}, drEnemy: {}, hp: curHp(nc), enemy: e, res: 0, resQ: [], shardTicks: 0, cooldowns: {}, playerEffects: [], enemyEffects: [], playerNextAt: t + PLAYER_BASE_INTERVAL, enemyNextAt: t + ENEMY_BASE_INTERVAL });
    setTab("combat");
    addLog(`🌋 Entering ${raid.name}! Wave 1/${raid.waves}`);
  };
  // Hard Mode enemies: power comes from the "hard" row of DIFFICULTY_TIERS; these hpMults are the
  // per-content-type health weighting on top of it (zone < dungeon trash < dungeon boss < raid boss).
  // `wave` drives the same accelerating ramp normal-mode dungeons use, so a Hard Mode run builds
  // the same way. Zones are endless farm and have no wave, so they sit at x1.00.
  const makeHardEnemy = (inst, kind, bossWave, wave) => {
    const T = "hard";
    const ramp = kind === "zone" ? 1 : dungeonWaveScale(wave || 1, hardWaveCount(inst));
    if (kind === "zone") {
      const bz = ZONES.find((z) => z.id === inst.base);
      const isLord = Math.random() < 0.1; // Lords appear at the same ~10% rate champions do in normal zones
      const e = isLord
        ? makeEnemy(inst.enemyLvl, { lord: true, hpMult: 10, tier: T })   // rare elite Lord
        : makeEnemy(inst.enemyLvl, { champion: true, hpMult: 8, tier: T }); // standard Hard zone Champion
      if (bz) e.name = `${isLord ? "👑 " : ""}${pick(bz.enemies)}`;
      return e;
    }
    // dungeons & raid: Lord-tier waves; the final wave is the named boss (tracked for the 10-kill unlock)
    if (bossWave) {
      const e = makeEnemy(inst.enemyLvl, { lord: true, name: `👑 ${inst.boss}`, hpMult: (kind === "raid" ? 24 : 14) * ramp, tier: T });
      e.hardBoss = inst.boss;
      return e;
    }
    const bz = ZONES.find((z) => z.id === inst.base);
    const e = makeEnemy(inst.enemyLvl, { lord: true, hpMult: (kind === "raid" ? 16 : 10) * ramp, tier: T }); // Lord trash
    if (bz) e.name = `👑 ${pick(bz.enemies)}`;
    return e;
  };
  // ---------- THE ABYSS ----------
  // Champion-rank foes at the rank's tier. There is no wave structure and no boss: the Abyss is an
  // endless zone, and the kill counter is the whole of its progression.
  const makeAbyssEnemy = (plus) => {
    const bz = ZONES.find((z) => z.id === "plaguelands") || ZONES[ZONES.length - 1];
    const isLord = Math.random() < 0.1;
    const e = makeEnemy(ABYSS.enemyLvl, { lord: isLord, champion: !isLord, hpMult: isLord ? 10 : 8, tier: abyssTierId(plus) });
    if (bz) e.name = `${isLord ? "👑 " : ""}${pick(bz.enemies)}`;
    e.abyssPlus = plus;
    return e;
  };
  const startAbyss = (plus) => {
    const c = charRef.current;
    if (battleRef.current) { showNotif("Finish current fight first"); return; }
    if (!abyssOpen(c)) { showNotif("🔒 Clear Hard Mode first — the Molten Heart must fall"); return; }
    const p = Math.max(0, Math.min(abyssUnlocked(c), plus));
    if (avgEquippedIlvl(c) < ABYSS.reqIlvl) { showNotif(`🔒 Requires average item level ${ABYSS.reqIlvl}`); return; }
    commitChar({ ...c, abyss: { ...abyssRec(c), plus: p } });
    const t = Date.now();
    commitBattle({ mode: "abyss", abyssPlus: p, dropIlvl: ABYSS.dropIlvl, wave: 1, waves: 0, runStart: t,
      drPlayer: {}, drEnemy: {}, hp: curHp(c), enemy: makeAbyssEnemy(p), res: 0, resQ: [], shardTicks: 0,
      cooldowns: {}, playerEffects: [], enemyEffects: [], playerNextAt: t + PLAYER_BASE_INTERVAL, enemyNextAt: t + ENEMY_BASE_INTERVAL });
    setTab("combat");
    addLog(`🕳️ The Abyss${p ? ` +${p}` : ""} — no waves, no boss, no end. Only what you can survive.`);
  };
  // A kill in the Abyss banks against THAT rank. Reaching the goal unlocks the next +, once.
  const recordAbyssKill = (c, plus) => {
    const rec = abyssRec(c);
    const kills = { ...(rec.kills || {}), [plus]: (rec.kills || {})[plus] + 1 || 1 };
    let unlocked = rec.unlocked || 0;
    let msg = null;
    if (kills[plus] >= ABYSS.killGoal && plus >= unlocked && unlocked < ABYSS.maxPlus) {
      unlocked = plus + 1;
      msg = `🕳️ The Abyss deepens — +${unlocked} unlocked`;
    }
    return { abyss: { ...rec, kills, unlocked }, msg };
  };

  // Per instance, off its own `waves`, exactly as normal mode does. This was a flat 4 for every
  // hard dungeon and 6 for the raid, so the five hard instances were all the same length.
  const hardWaveCount = (inst) => (inst && inst.waves) || 4;
  const startHard = (inst, kind, useTicket = false) => {
    const c = charRef.current;
    if (battleRef.current) { showNotif("Finish current fight first"); return; }
    const avg = avgEquippedIlvl(c);
    if (kind === "zone" && !hardZoneUnlocked(c, avg, inst)) { showNotif(`🔒 Requires ilvl ${inst.reqIlvl}${inst.prev ? " & previous zone" : ""}`); return; }
    if (kind === "dungeon" && !hardDungeonUnlocked(c, avg, inst)) { showNotif(inst.reqIlvl && avg < inst.reqIlvl ? `🔒 Requires ilvl ${inst.reqIlvl}` : (inst.prevZone && !c.hardZoneDone?.[inst.prevZone]) ? `🔒 Complete ${hardZoneById(inst.prevZone)?.name} first` : `🔒 Requires ${HARD_BOSS_REQ} ${inst.prevBoss} kills`); return; }
    if (kind === "raid" && !hardRaidUnlocked(c)) { showNotif("🔒 Complete Hard Mode first"); return; }
    let nc = c;
    // Dungeons & raids honor the same lockouts as normal mode; zones are freely farmable
    if (kind === "dungeon") {
      if (dungeonRunsLeft(c, inst.id) <= 0) {
        if (useTicket && (c.tickets?.dungeonReset || 0) > 0) { nc = { ...c, tickets: { ...c.tickets, dungeonReset: c.tickets.dungeonReset - 1 } }; showNotif("🎟️ Dungeon Reset Ticket used"); }
        else { const left = dungeonResetLeft(c, inst.id); showNotif((c.tickets?.dungeonReset || 0) > 0 ? "Out of runs — use a 🎟️ ticket to enter" : `⏳ Out of runs — resets in ${fmtClock(left)}`); return; }
      } else {
        const prev = c.dungeonRuns?.[inst.id];
        const rec = dungeonWindowActive(prev) ? { start: prev.start, runs: (prev.runs || 0) + 1 } : { start: Date.now(), runs: 1 };
        nc = { ...c, dungeonRuns: { ...c.dungeonRuns, [inst.id]: rec } };
      }
    } else if (kind === "raid") {
      if (raidCooldownLeft(c, inst.id) > 0) { showNotif("Hard raid is on cooldown"); return; }
      nc = { ...c, raidCooldowns: { ...(c.raidCooldowns || {}), [inst.id]: Date.now() + RAID_COOLDOWN } };
    }
    commitChar(nc);
    const waves = kind === "zone" ? 0 : hardWaveCount(inst);
    // The boss now arrives at waves + 1, so wave 1 is never the boss — same rule as normal mode.
    const e = makeHardEnemy(inst, kind, false, 1);
    const t = Date.now();
    commitBattle({ mode: "hard", hardId: inst.id, hardKind: kind, dropIlvl: inst.dropIlvl, wave: 1, waves, runStart: t, drPlayer: {}, drEnemy: {}, hp: curHp(nc), enemy: e, res: 0, resQ: [], shardTicks: 0, cooldowns: {}, playerEffects: [], enemyEffects: [], playerNextAt: t + PLAYER_BASE_INTERVAL, enemyNextAt: t + ENEMY_BASE_INTERVAL });
    setTab("combat");
    addLog(kind === "zone" ? `🔥 HARD MODE — ${inst.name}! Extreme danger.` : `🔥 HARD MODE — ${inst.name}! Wave 1/${waves}`);
    setLastHard({ id: inst.id, kind });
  };
  // ---------- GUILD: queue group content, backfill a party with bots (15s), then run REAL combat ----------
  // Guild PvE now runs on the Trinity engine: a role-based encounter with a live party.
  const guildLaunch = (content, kind, party, useTicket) => {
    const c = charRef.current;
    const raid = kind.includes("raid");
    const size = raid ? 6 : 4;
    const ilvl = kind === "hard-raid" ? (HARD_RAID.dropIlvl || 71)
      : kind === "hard-dungeon" ? (content.dropIlvl || 66)
      : kind === "raid" ? (content.reqIlvl || 60)
      : Math.min(63, (content.minLevel || 60) + 3);
    // consume the Guild lockout (independent of the solo one)
    let nc = c;
    if (raid) nc = { ...nc, guildRaidCooldowns: { ...(nc.guildRaidCooldowns || {}), [content.id]: Date.now() + GUILD_RAID_COOLDOWN } };
    else if (useTicket) { nc = { ...nc, tickets: { ...nc.tickets, dungeonReset: Math.max(0, (nc.tickets?.dungeonReset || 0) - 1) } }; showNotif("🎟️ Dungeon Reset Ticket used"); }
    else {
      const prev = nc.guildDungeonRuns?.[content.id];
      const rec = guildWindowActive(prev) ? { start: prev.start, runs: (prev.runs || 0) + 1 } : { start: Date.now(), runs: 1 };
      nc = { ...nc, guildDungeonRuns: { ...(nc.guildDungeonRuns || {}), [content.id]: rec } };
    }
    commitChar(nc);
    const tp = buildTrinityPartyOfSize(nc, ilvl, size);
    const label = `${content.name}${kind.startsWith("hard") ? " (Hard)" : ""}`;
    const localRun = { content, kind, size, ilvl, raid, bossDef: guildBossDef(content, kind, nc.level),
      party: tp, bidParty: (party && party.length) ? party : partyForBid(tp), label };
    // Guild content runs on the authoritative server. The queue and its unlock requirements
    // above are untouched — only the party and the ticking move server-side. Connect BEFORE
    // opening the combat screen, otherwise a local fight would play for the seconds the room
    // takes to form and then be yanked out from under the player. If the server can't be
    // reached we fall back to the local Trinity run rather than blocking them from playing.
    // Open the combat screen as soon as we are IN the room, not once the party has formed —
    // it renders a live lobby, so players can see each other arrive instead of guessing.
    // `uid` is what the server mails rewards to. Without it grantRewards skips the seat and a
    // cleared run pays nothing, silently — which is exactly what happened on the first live GDKP.
    ensureUid()
      .then((uid) => mpProvider.connectEncounter({ contentId: content.id, char: nc, ilvl, uid, code: partyCode.trim() }))
      .then((room) => { setGroupRun({ ...localRun, online: true, room }); setTab("group"); })
      .catch((e) => {
        const why = e?.message || "server unreachable";
        showNotif(`⚠️ Playing offline — ${why}`);
        setGroupRun({ ...localRun, offlineReason: why });   // shown on the combat screen, not just a toast
        setTab("group");
      });
  };
  // Trinity Trials: 24h lockout each, GDKP reward at the boss's own ilvl
  const startTrial = (bossId) => {
    if (battleRef.current) { showNotif("Finish your current fight first"); return; }
    const c = charRef.current;
    const left = trialCdLeft(c, bossId);
    if (left > 0) { showNotif(`⏳ On cooldown — ${fmtCd(left)}`); return; }
    const b = BOSS_DEFS[bossId]; if (!b) return;
    const ilvl = TRIAL_ILVL[bossId] || 64;
    // NOTE: the 24h lockout is charged on CLEAR (see onGroupCleared) — wiping costs you nothing but time.
    const tp = buildTrinityPartyOfSize(c, ilvl, 4);
    setGroupRun({ trial: true, bossId, ilvl, size: 4, raid: false, bossDef: b, party: tp, bidParty: partyForBid(tp), label: b.name });
    setTab("group");
  };
  // ---------- TUTORIAL DELVE + PRACTICE DUEL — bots only, and deliberately never online -------
  //
  // The Guild and Arena lessons used to be satisfied by opening the screen, which taught nothing:
  // a player's first group boss was a real one, with three other people's time on the line, and
  // their first arena bout went on their record.
  //
  // Both of these run ENTIRELY LOCALLY. mpProvider.connectEncounter is the only call that reaches
  // the matchmaking server, and neither path touches it — the delve builds its party with
  // buildTrinityPartyOfSize (the same local bots startTrial uses) and the duel builds its opponent
  // with buildBotChar. So a player can learn group and rated play without ever occupying a real
  // room or being matched against a real person.
  const TUTORIAL_DELVE_ID = "tutorial_delve";
  const startTutorialDelve = () => {
    if (battleRef.current) { showNotif("Finish your current fight first"); return; }
    const c = charRef.current;
    // The boss scales to the player, so this reads the same at 40 as at 60. `guildBossDef` gives it
    // the full teaching kit: a tank-buster, an interruptible cast and raid-wide damage.
    const ilvl = Math.max(1, avgEquippedIlvl(c) || Math.min(63, (c.level || 40) + 3));
    const content = { id: TUTORIAL_DELVE_ID, name: "The Training Delve", boss: "Drillmaster Vane" };
    const bossDef = { ...guildBossDef(content, "dungeon", c.level || 40),
      desc: "A practice bout. Interrupt the cast, keep the party alive, and nothing here is recorded." };
    setGroupRun({ tutorialDelve: true, bossId: TUTORIAL_DELVE_ID, ilvl, size: 4, raid: false, bossDef,
      party: buildTrinityPartyOfSize(c, ilvl, 4), bidParty: null, label: "Training Delve (practice)" });
    setTab("group");
    addLog("🏛️ The Training Delve — a practice party. No lockout, no loot, nothing at stake.");
  };
  const startTutorialDuel = () => {
    if (battleRef.current) { showNotif("Finish your current fight first"); return; }
    const c = charRef.current;
    // An explicitly built bot, NOT mpProvider.findOpponent — that can hand back a snapshot of a
    // real player, and a practice bout must never be fought against someone's actual character.
    const cls = pick(CLASSES); const specs = specsFor(cls.id);
    const opp = { name: "Sparring Partner " + mpName(), cls: cls.id, spec: specs.length ? pick(specs).id : null,
                  rating: arenaRating(((c.mp || {}).lifetime || {}).wins || 0, ((c.mp || {}).lifetime || {}).losses || 0) };
    startRatedMatch(opp, { practice: true });
  };

  // ---------- online co-op: join the authoritative server's room ----------
  // The server owns the seed, the party and every tick. We wait for `assigned` (which names our
  // combatant) before opening the combat screen, so the UI always knows which ally is ours.
  // Boss down → GDKP loot bid (Epic floor; Trials roll a 10% Legendary per item)
  const onGroupCleared = () => {
    const run = groupRunRef.current; if (!run) return;
    let c = charRef.current;
    // The Training Delve is a lesson, not content: it marks itself learned and stops. No lockout is
    // charged, no loot rolls and no GDKP auction runs — a practice boss must not be a gold faucet,
    // and it has no lockout to gate one.
    if (run.tutorialDelve) {
      commitChar({ ...c, tutorial: { ...(c.tutorial || {}), delveCleared: true } });
      addLog("🏛️ Training Delve cleared. That is how a group fight works — the real ones drop loot.");
      showNotif("🏛️ Training Delve cleared!");
      return;
    }
    // Trials lock on the KILL, not on entry — the lockout gates rewards, not attempts.
    if (run.trial && run.bossId) {
      c = { ...c, trialCooldowns: { ...(c.trialCooldowns || {}), [run.bossId]: Date.now() + TRIAL_COOLDOWN } };
      commitChar(c);
    }
    // Multiplayer (Guild) Hard dungeon / raid clears feed the SAME hardBossKills counter solo runs
    // use — so a group kill of e.g. Bandit Lord Garrick counts toward unlocking the next Hard dungeon in single-player.
    if (run.content && (run.kind === "hard-dungeon" || run.kind === "hard-raid")) {
      const boss = run.content.boss;
      if (boss) {
        const bk = ((c.hardBossKills || {})[boss] || 0) + 1;
        c = { ...c, hardBossKills: { ...(c.hardBossKills || {}), [boss]: bk } };
        const hd = run.kind === "hard-raid" ? HARD_RAID : hardDungeonById(run.content.id);
        addLog(`☠️ ${boss} slain with your group (${bk}${hd?.completeCount ? "/" + hd.completeCount : "/" + HARD_BOSS_REQ}) — counts toward Hard Mode unlocks`);
        if (hd?.completeCount && bk >= hd.completeCount && !c.hardDungeonDone?.[run.content.id]) { c = { ...c, hardDungeonDone: { ...(c.hardDungeonDone || {}), [run.content.id]: true } }; addLog(`🏆 ${hd.name} (Hard) cleared!`); }
        if (run.kind === "hard-raid" && bk >= HARD_BOSS_REQ && !c.hardDungeonDone?.[run.content.id]) { c = { ...c, hardDungeonDone: { ...(c.hardDungeonDone || {}), [run.content.id]: true } }; }
        commitChar(c);
      }
    }
    // Online, the ROOM rolls the loot and runs the auction — every player must see one drop and
    // bid in one sale. Rolling here as well is what produced four different "drops" per run, each
    // player bidding against simulated rivals in a private auction. The server's `loot` messages
    // drive the modal instead (see the groupRun.room handler below).
    if (run.online && run.room) return;
    const n = run.raid ? 2 : 1;
    const items = [];
    for (let i = 0; i < n; i++) {
      const leg = run.trial && Math.random() < TRIAL_LEGENDARY_CHANCE;
      items.push(generateItem(run.ilvl, rarityById(leg ? "legendary" : "epic"), pickLootSlot(), c.cls));
    }
    setGuildBid({ items, party: run.bidParty });
  };

  // Online GDKP: the room broadcasts the lot, the running high, and the hammer. This holds the
  // latest server view so LootBidModal can render it instead of simulating its own auction.
  const [netBid, setNetBid] = useState(null);   // { lot, sold, done, myAllyId }
  useEffect(() => {
    const run = groupRun;
    // Deliberately NOT clearing netBid when the run goes away. Leaving the combat screen tears
    // groupRun down while the auction is still running, and wiping here closed the bid modal
    // mid-sale. A live auction outlives its encounter; it clears itself on `phase: "done"`, and
    // starting a new online run replaces it below.
    if (!run?.online || !run.room) return;
    const room = run.room;
    setNetBid(null);                                   // a NEW run starts with no auction

    room.onMessage("loot", (m) => {
      if (m.phase === "done") { setNetBid((p) => p && { ...p, done: true }); return; }
      if (m.phase === "sold") {
        setNetBid((p) => ({ ...(p || {}), sold: m, lot: null, myAllyId: run.myAllyId }));
        // The winner's item and everyone's share are settled by the server into mail; this is
        // just the announcement, so nothing is granted locally.
        addLog(m.winnerName
          ? `🔨 ${m.item?.name || "Lot"} sold to ${m.winnerName} for ${m.price}g — your share is in the mail`
          : `🔨 ${m.item?.name || "Lot"} went unsold (reserve not met)`);
        return;
      }
      setNetBid({ lot: m.lot, sold: null, done: false, myAllyId: run.myAllyId });
    });
  }, [groupRun?.room]);
  // Can this Guild content be entered right now? (Guild lockouts are separate from solo.)
  const guildGate = (content, kind) => {
    const c = charRef.current;
    if (kind.includes("raid")) { const l = guildRaidCdLeft(c, content.id); return l > 0 ? { ok: false, msg: `On cooldown · ${fmtCd(l)}` } : { ok: true }; }
    if (guildRunsLeft(c, content.id) > 0) return { ok: true };
    return (c.tickets?.dungeonReset || 0) > 0 ? { ok: false, ticket: true, msg: "Out of runs — use a 🎟️ ticket?" } : { ok: false, msg: `Out of runs · resets in ${fmtCd(guildWindowLeft(c, content.id))}` };
  };
  const queueGuild = (content, kind, size, useTicket) => {
    if (battleRef.current) { showNotif("Finish your current fight first"); return; }
    const g = guildGate(content, kind);
    if (!g.ok && !(useTicket && g.ticket)) { showNotif(g.msg || "Unavailable"); return; }
    // Go straight to the server's lobby. The old local countdown backfilled a FAKE party and
    // said "GO", and then the real server lobby opened behind it — two queues stacked, the
    // first of them meaningless. The server lobby is the only one that decides anything.
    guildLaunch(content, kind, null, !!(useTicket && g.ticket));
  };
  useEffect(() => {
    if (!guildQueue) return;
    if (guildQueue.countdown <= 0) {
      // Launch branch: do NOT call setGuildQueue here (that would re-run this effect and clear the
      // timeout below before it fires — the bug where nothing happened after "Go"). Party is already
      // filled on the final tick, so just start the real run.
      const { content, kind, size, party, useTicket } = guildQueue;
      const full = party.length >= size ? party : mpProvider.fillParty(size, party[0].power, charRef.current.level, party);
      const t = setTimeout(() => { setGuildQueue(null); guildLaunch(content, kind, full, useTicket); }, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGuildQueue((q) => {
      if (!q) return q;
      const nextCd = q.countdown - 1;
      let party = q.party;
      if (nextCd <= 0) party = mpProvider.fillParty(q.size, q.party[0].power, charRef.current.level, q.party); // fill remaining slots on the final tick
      else if (q.party.length < q.size && Math.random() < 0.4) party = [...q.party, mpBot(q.party[0].power, charRef.current.level)];
      return { ...q, party, countdown: nextCd };
    }), 1000);
    return () => clearTimeout(t);
  }, [guildQueue]);

  // Party health for group content: the local player's bar reads real battle HP; teammates (bots for
  // now) drift — taking hits, getting healed, occasionally going down and being revived. A teammate
  // dying does NOT fail the run; only YOUR death (a full wipe of the real combatant) ends it.
  const inGroupCombat = groupParty != null; // stable boolean → effect runs once per group run, not per tick
  useEffect(() => {
    if (!inGroupCombat) return;
    const iv = setInterval(() => {
      if (!battleRef.current) return;
      setGroupParty((prev) => prev && prev.map((m) => {
        if (m.me) return m;
        let hp = m.hp;
        if (hp <= 0) { if (Math.random() < 0.18) hp = 35; }                                                   // a healer revives a downed teammate
        else { const dmg = Math.random() < 0.35 ? Math.round(6 + Math.random() * 22) : 0; const heal = Math.random() < 0.45 ? Math.round(6 + Math.random() * 16) : 0; hp = Math.max(0, Math.min(100, hp - dmg + heal)); }
        if (pveBotsRef.current) { const b = pveBotsRef.current.find((x) => x.id === m.id); if (b) b.down = hp <= 0; } // downed bots stop damaging the boss
        return { ...m, hp };
      }));
    }, 1500);
    return () => clearInterval(iv);
  }, [inGroupCombat]);

  // The PvP bot runs its real class kit through the skill engine each tick: a mirrored battle where the
  // bot is the caster and the player is the target. Its outgoing damage (autos + skills + DoTs) is
  // mitigated by the player's armor and applied to the player's real HP.
  const botStep = (playerChar, w, now) => {
    const bc = botCharRef.current; let bw = botMirrorRef.current; const tier = botTierRef.current || BOT_TIERS.experienced;
    if (!bc || !bw) return;
    bw.playerEffects = (bw.playerEffects || []).filter((e) => !e.expires || e.expires > now);
    bw.enemyEffects = (bw.enemyEffects || []).filter((e) => !e.expires || e.expires > now);
    resExpire(bw, now);
    bw.hp = w.enemy.hp;                              // bot's own HP (the player has been damaging it)
    bw.enemy.hp = w.hp; bw.enemy.maxHp = maxHpFor(playerChar); // player is the bot's target
    const pe = effectiveStats(playerChar); const pmit = mitigation(pe.armor, playerChar.level);
    const before = bw.enemy.hp;
    // bot auto-attacks (raw; mitigation applied to the tick total below)
    const speed = Math.max(0.1, 1 + agiAtkSpeed(bc) + talentMods(bc).atkSpeed) * hasteMultOf(bw.playerEffects);
    const interval = PLAYER_BASE_INTERVAL / speed;
    if (!bw.playerNextAt) bw.playerNextAt = now;
    const autoOn = tier.key === "new" ? 0.7 : tier.key === "experienced" ? 0.92 : 1;
    let g = 0;
    while (now >= bw.playerNextAt && bw.enemy.hp > 0 && g++ < 6) {
      if (rng() < autoOn) { const crit = rng() < critChanceFor(bc); let d = Math.floor(computeDamage(bc, rollWeaponDmg(bc), talentFlag(bc, "intAuto")) * empowerMultOf(bw.playerEffects)); d *= 1 + talentMods(bc).autoPct; if (crit) d *= critMultFor(bc); bw.enemy.hp = Math.max(0, bw.enemy.hp - Math.max(1, Math.floor(d * PVP_AUTO_MULT))); }
      bw.playerNextAt += interval;
    }
    if (now >= bw.playerNextAt) bw.playerNextAt = now + interval;
    // bot's damage-over-time debuffs tick on the player
    (bw.enemyEffects || []).forEach((e) => { if (e.kind === "dot") { let g2 = 0; while (now >= e.nextTick && bw.enemy.hp > 0 && g2++ < 6) { bw.enemy.hp = Math.max(0, bw.enemy.hp - e.dmgPerTick); e.nextTick += 1000; } } });
    // bot rotation — REAL skill engine, resource + cooldown gated, tier-driven quality
    if (!bw.nextGcd) bw.nextGcd = now;
    if (now >= bw.nextGcd) { const sk = chooseBotSkill(bc, bw, now, tier); if (sk) { const r = applySkillCore(sk, bc, bw, now, () => {}); bw = r.battle; botMirrorRef.current = bw; addLog(`✦ ${w.enemy.name} casts ${sk.name}`); } bw.nextGcd = now + PVP_GCD; }
    // UNFETTERED ONYX. In the bot's mirror the PLAYER is `bw.enemy`, so a stun cast on the player
    // arrives in bw.enemyEffects as a 100% slow. Break the first one of the fight and mark it spent
    // on the battle, not the character — "each fight" has to mean each fight, and a flag on the save
    // would make the rune a once-per-character trinket.
    if (!w.ccBroken && hasCcBreak(playerChar)) {
      const stun = (bw.enemyEffects || []).find((e) => e.kind === "slow" && e.pct >= 100);
      if (stun) {
        bw.enemyEffects = bw.enemyEffects.filter((e) => e !== stun);
        botMirrorRef.current = bw;
        w.ccBroken = true;
        addLog("⛓️ Unfettered Onyx shatters the stun!");
      }
    }
    // apply the mitigated tick total to the player's real HP
    //
    // This one line is where EVERY point of arena damage lands: the bot's auto-attacks, its DoT
    // ticks and its skill casts all accumulate into `raw` above and are mitigated once here. That
    // is why the Battlemaster set bonus and the Aegis Diamond apply at this point and nowhere
    // else — spreading them across the three sources would have been three chances to miss one.
    const raw = Math.max(0, before - bw.enemy.hp);
    const dealt = Math.floor(raw * (1 - pmit) * BOT_DMG * tier.dmg * pvpDamageTakenMult(playerChar));
    w.hp = Math.max(0, w.hp - dealt);
    bw.enemy.hp = w.hp; // keep the mirror's target in sync with the real player HP
  };

  // PvE party bots: each living bot runs its real class rotation against the shared boss (same engine as
  // you), dealing unmitigated damage like a player. Downed bots (per the party panel) sit out.
  const pveBotStep = (w, now) => {
    const bots = pveBotsRef.current; if (!bots || !bots.length) return;
    for (const b of bots) {
      if (b.down || w.enemy.hp <= 0) continue;
      let bw = b.mirror; const bc = b.char; const tier = b.tier;
      bw.playerEffects = (bw.playerEffects || []).filter((e) => !e.expires || e.expires > now);
      bw.enemyEffects = (bw.enemyEffects || []).filter((e) => !e.expires || e.expires > now);
      resExpire(bw, now);
      bw.enemy.hp = w.enemy.hp; bw.enemy.maxHp = w.enemy.maxHp; bw.enemy.level = w.enemy.level;
      const before = bw.enemy.hp;
      const speed = Math.max(0.1, 1 + agiAtkSpeed(bc) + talentMods(bc).atkSpeed) * hasteMultOf(bw.playerEffects);
      const interval = PLAYER_BASE_INTERVAL / speed;
      if (!bw.playerNextAt) bw.playerNextAt = now;
      const autoOn = tier.key === "new" ? 0.7 : tier.key === "experienced" ? 0.92 : 1;
      let g = 0;
      while (now >= bw.playerNextAt && bw.enemy.hp > 0 && g++ < 6) {
        if (rng() < autoOn) { const crit = rng() < critChanceFor(bc); let d = Math.floor(computeDamage(bc, rollWeaponDmg(bc), talentFlag(bc, "intAuto")) * empowerMultOf(bw.playerEffects)); d *= 1 + talentMods(bc).autoPct; if (crit) d *= critMultFor(bc); bw.enemy.hp = Math.max(0, bw.enemy.hp - Math.max(1, Math.floor(d))); }
        bw.playerNextAt += interval;
      }
      if (now >= bw.playerNextAt) bw.playerNextAt = now + interval;
      (bw.enemyEffects || []).forEach((e) => { if (e.kind === "dot") { let g2 = 0; while (now >= e.nextTick && bw.enemy.hp > 0 && g2++ < 6) { bw.enemy.hp = Math.max(0, bw.enemy.hp - e.dmgPerTick); e.nextTick += 1000; } } });
      if (!bw.nextGcd) bw.nextGcd = now;
      if (now >= bw.nextGcd) { const sk = chooseBotSkill(bc, bw, now, tier); if (sk) { const r = applySkillCore(sk, bc, bw, now, () => {}); b.mirror = r.battle; } bw.nextGcd = now + BOT_GCD; }
      const dealt = Math.max(0, before - b.mirror.enemy.hp);
      w.enemy.hp = Math.max(0, w.enemy.hp - dealt); // bots hit the boss for real (unmitigated, like you)
    }
  };

  // ---------- RATED PvP: a live duel vs a class-accurate bot that runs the real combat engine ----------
  // `opts.practice` marks a TUTORIAL bout: same fight, same bot, but the result is not recorded
  // and no Arena Token is paid. A player's first duel should not go on their permanent record.
  const startRatedMatch = (opp, opts) => {
    const practice = !!(opts && opts.practice);
    const c = charRef.current;
    if (battleRef.current) { showNotif("Finish your current fight first"); return; }
    // Practice Duels are free and unlimited: they are the Arena lesson, they record nothing, and
    // gating them would let a player spend their day on the tutorial.
    if (!practice) {
      if (!arenaCanEnter(c)) { showNotif(`No attempts left today — ${ARENA.dailyRuns} a day. Buy a 🏟️ Arena Challenge Ticket.`); return; }
      const a = arenaToday(c);
      if (a.runs < ARENA.dailyRuns) {
        commitChar({ ...c, arena: { day: a.day, runs: a.runs + 1, streak: a.streak } });
      } else {
        // Out of daily attempts: spend a ticket. This is the first thing in the game that has ever
        // consumed one — it has been buyable since it was written and nothing has taken it.
        commitChar({ ...c, arena: { day: a.day, runs: a.runs, streak: a.streak },
                     tickets: { ...(c.tickets || {}), arenaChallenge: arenaTicketsLeft(c) - 1 } });
        showNotif("🏟️ Arena Challenge Ticket used");
      }
    }
    // charRef was just updated by the attempt charge above; re-read so the bot is built from the
    // committed character rather than the pre-charge snapshot.
    const cc = charRef.current;
    const lvl = cc.level || 60;
    const lt = (cc.mp && cc.mp.lifetime) || { wins: 0, losses: 0 };
    const myRating = arenaRating(lt.wins, lt.losses);
    const oppRating = opp.rating || myRating;
    const tier = botTier(oppRating);
    const ilvl = Math.max(1, avgEquippedIlvl(c) || 60);
    // the bot IS a geared character of the opponent's class/spec at your ilvl — it plays its own kit
    const bc = buildBotChar(opp.cls, opp.spec, lvl, ilvl);
    const botHp = maxHpFor(bc);
    const clsInfo = CLASSES.find((x) => x.id === opp.cls) || {};
    const hp = Math.round(botHp * tier.hp);
    const t = Date.now();
    // the real-battle enemy = the bot (what the PLAYER targets). `mirror` routes its turns to botStep.
    const e = { name: opp.name, iconKey: opp.name, cls: opp.cls, level: lvl, icon: clsInfo.icon || "🗡️", isChampion: true, isBoss: true, isPvp: true, mirror: true, hp, maxHp: hp, str: 1, skills: [], nextCastAt: 0 };
    botCharRef.current = bc; botTierRef.current = tier;
    // the bot's own battle view: bot=caster, player=target
    botMirrorRef.current = { pvp: true, enemy: { name: c.name, cls: c.cls, level: lvl, hp: maxHpFor(c), maxHp: maxHpFor(c) }, hp, maxHp: hp, playerEffects: [], enemyEffects: [], cooldowns: {}, res: 0, resQ: [], shardTicks: 0, playerNextAt: t + PLAYER_BASE_INTERVAL, nextGcd: t + 900 };
    commitBattle({ mode: "pvp", pvp: true, practice, ratedOpp: { name: opp.name, rating: oppRating, tier: tier.label, cls: opp.cls }, wave: 1, waves: 1, runStart: t, drPlayer: {}, drEnemy: {}, hp: maxHpFor(c), enemy: e, res: 0, resQ: [], shardTicks: 0, cooldowns: {}, playerEffects: [], enemyEffects: [], playerNextAt: t + PLAYER_BASE_INTERVAL, enemyNextAt: t + ENEMY_BASE_INTERVAL });
    setTab("combat");
    addLog(practice
      ? `🎯 Practice Duel — ${opp.name}, a ${tier.label.toLowerCase()} ${clsInfo.name || opp.cls}. Unranked: win or lose, nothing is recorded.`
      : `⚔️ Rated Arena — ${opp.name}, a ${tier.label.toLowerCase()} ${clsInfo.name || opp.cls} (${oppRating}). They fight for real — bring your best.`);
  };
  const recordRated = (win) => {
    const c = charRef.current; const mp = c.mp || {};
    const r = mp.rated || { wins: 0, losses: 0, start: Date.now() };
    const lt = mp.lifetime || { wins: 0, losses: 0 };
    // A loss now pays too. Arena prices are deliberately steep, and a player who loses every bout
    // of a bad session should still end it closer to a purchase than they started — otherwise the
    // shop is only ever reachable by the players who least need it.
    const a = arenaToday(c);
    const pay = arenaPayout(win, a.streak);
    const streak = win ? a.streak + 1 : 0;
    commitChar({ ...c,
      arenaTokens: (c.arenaTokens || 0) + pay,
      arena: { day: a.day, runs: a.runs, streak },
      mp: { ...mp,
        rated: { wins: (r.wins || 0) + (win ? 1 : 0), losses: (r.losses || 0) + (win ? 0 : 1), start: r.start }, // 24h prize window
        lifetime: { wins: (lt.wins || 0) + (win ? 1 : 0), losses: (lt.losses || 0) + (win ? 0 : 1) },            // drives Conquest Rating
      },
    });
    const bonus = pay - ARENA.winTokens;
    showNotif(win
      ? `🏆 Rated win! +${pay} 🎟️${bonus > 0 ? ` (${streak} win streak)` : ""}`
      : `💀 Rated loss — +${pay} 🎟️${a.streak > 0 ? ` · streak of ${a.streak} broken` : ""}`);
  };
  const stopCombat = () => {
    guildRunRef.current = null; setGroupParty(null); pveBotsRef.current = null; // leaving a run cancels any pending Guild bid + party panel
    const b = battleRef.current;
    if (b) commitChar({ ...charRef.current, hp: b.hp }); // keep current health on retreat
    addLog("⏸ Retreated from combat.");
    commitBattle(null);
  };
  // AUTO-RETREAT. Being handed a new lesson mid-fight used to mean reading it while something was
  // hitting you. Levelling past a gate steps the player out of a solo fight first, keeping their
  // current health, so the interruption can never cost a death.
  // `undefined` means "not looked yet"; `null` means "looked, and there is no lesson open". They
  // have to be distinguishable: a caught-up player sits on null, and null -> a new lesson is the
  // single most common way a lesson arrives. Collapsing the two skipped exactly that case.
  const lastLessonRef = useRef(undefined);
  useEffect(() => {
    const c = charRef.current;
    const lesson = activeLesson(c);
    const id = lesson ? lesson.id : null;
    const prev = lastLessonRef.current;
    lastLessonRef.current = id;
    if (!id || prev === undefined || prev === id) return;   // first look, or the same lesson still open
    if (COMBAT_TUTORIAL_IDS.includes(id)) return;          // this lesson IS the fight — do not yank them out
    const b = battleRef.current;
    if (!b) return;
    // Never abandon group or instanced content on the player's behalf: a dungeon, raid or Guild run
    // cannot be resumed where it left off, so retreating from one would cost far more than a death.
    if (groupParty || guildRunRef.current || b.pvp || b.mode === "dungeon" || b.mode === "raid" || b.mode === "hard") return;
    stopCombat();
    setTab("town");
    showNotif(`📜 New lesson: ${lesson.title} — withdrawn from combat`);
    addLog(`📜 You withdraw to town: ${lesson.title}.`);
  }, [char, groupParty]);

  // can the remembered dungeon/raid be run right now (not locked out)?
  const instanceRunnable = (c, id) => { const inst = instanceById(id); if (!inst) return false; return inst.raid ? raidCooldownLeft(c, id) <= 0 : dungeonRunsLeft(c, id) > 0; };
  const reEnterInstance = () => { const inst = instanceById(lastDungeonId); if (!inst) return; if (inst.raid) startRaid(inst); else startDungeon(inst); };

  // ---------- consumables (stored per-tier; a potion keeps its tier forever) ----------
  // conCount/conTotal/bestTier now live at module scope so the offline simulator can drink from the
  // same stock the live tick does — see above ItemCard.
  const buyConsumable = (def) => {
    const c = charRef.current;
    const qty = Math.max(1, Math.min(999, Math.floor(vendorQty) || 1));
    const price = consumablePrice(def, c.level) * qty;
    if (c.gold < price) { showNotif(`Need ${price}g for ${qty}× ${tieredName(def, c.level)}`); return; }
    const tier = tierForLevel(c.level); const key = conKey(def.id, tier);
    commitChar({ ...c, gold: c.gold - price, consumables: { ...c.consumables, [key]: (c.consumables[key] || 0) + qty } });
    showNotif(`Bought ${qty}× ${tieredName(def, c.level)}`);
  };

  const sellConsumable = (def, tier) => {
    const c = charRef.current; const key = conKey(def.id, tier);
    if ((c.consumables?.[key] || 0) <= 0) { showNotif("None to sell"); return; }
    const price = consumableSellPrice(def, tier);
    commitChar({ ...c, gold: c.gold + price, consumables: { ...c.consumables, [key]: c.consumables[key] - 1 } });
    showNotif(`💰 Sold ${def.name} ${POTION_TIER_ROMAN[tier]} for ${price}g`);
  };
  const buyVendorUpgrade = (up) => {
    const c = charRef.current;
    if (vendorUpgradeOwned(c, up.id)) { showNotif("Already owned"); return; }
    if ((c.gold || 0) < up.cost) { showNotif(`Need ${up.cost.toLocaleString()}g`); return; }
    commitChar({ ...c, gold: c.gold - up.cost, upgrades: { ...(c.upgrades || {}), [up.id]: true } });
    showNotif(`${up.icon} ${up.name} purchased!`);
    addLog(`${up.icon} ${up.name} — ${up.desc}`);
  };
  // use one consumable of a specific tier (defaults to the best tier you own)
  const useConsumable = (def, tier) => {
    let c = charRef.current;
    const t = (tier == null) ? bestTier(c, def.id) : tier;
    if (t < 0 || conCount(c, def.id, t) <= 0) { showNotif("None left — brew or buy it"); return; }
    const key = conKey(def.id, t);
    const roman = POTION_TIER_ROMAN[t];
    if (def.kind === "dmgbuff" || def.kind === "reducebuff") {
      const bkey = def.kind === "dmgbuff" ? "dmgpct" : "reducepct";
      const amount = Math.round(tierBuffPct(t) * gemPotionMult(c));
      commitChar({ ...c, consumables: { ...c.consumables, [key]: c.consumables[key] - 1 }, buffs: { ...c.buffs, [bkey]: { amount, expires: Date.now() + POTION_BUFF_DURATION } } });
      addLog(`⚗️ ${def.name} ${roman} active (${BUFF_META[bkey].label(amount)}, 5 min)`, def.color);
      showNotif(`${def.name} ${roman} active`);
      return;
    }
    if (def.kind === "heal") {
      if (Date.now() - lastPotion < POTION_CD) return; // 5s potion cooldown
      const b = battleRef.current;
      const mx = maxHpFor(c);
      const cur = b ? b.hp : (typeof c.hp === "number" ? c.hp : mx);
      if (cur >= mx) { showNotif("Already at full health"); return; }
      const healed = Math.min(mx, cur + Math.round(tierHeal(t) * gemPotionMult(c)));
      if (b) commitBattle({ ...b, hp: healed });
      if (!c.tutorial?.drankPotion) c = { ...c, tutorial: { ...(c.tutorial || {}), drankPotion: true } };
      commitChar({ ...c, hp: healed, consumables: { ...c.consumables, [key]: c.consumables[key] - 1 } });
      setLastPotion(Date.now()); lastPotionRef.current = Date.now();
      addLog(`🧪 Drank ${def.name} ${roman} (+${healed - cur} HP)`);
      return;
    }
    const amount = Math.round(tierScrollAmount(t) * gemScrollMult(c));
    commitChar({ ...c, consumables: { ...c.consumables, [key]: c.consumables[key] - 1 }, buffs: { ...c.buffs, [def.stat]: { amount, expires: Date.now() + BUFF_DURATION } } });
    showNotif(`${def.name} ${roman}: +${amount} ${STAT_LABEL[def.stat]} for 1h`);
    addLog(`📜 ${def.name} ${roman} active (+${amount} ${STAT_LABEL[def.stat]})`, def.color);
  };
  // brew a fixed-tier potion/scroll from herbs (Alchemy)
  const brewPotion = () => {
    const c = charRef.current; const prof = c.professions.alchemy; if (!prof) return;
    const herb = HERB_TIERS[brewHerbIdx]; const def = consumableById(brewPotionId); if (!herb || !def) return;
    const ptier = herb.ptier; const herbCost = herbBrewCost(ptier); const goldCost = potionGoldCost(ptier);
    const qty = 1 + Math.floor((prof.level || 1) / 100); // Alchemy rank yields extra potions
    const supId = supplyForConsumable(def); const supDef = supplyById(supId);
    if ((c.materials[herb.id] || 0) < herbCost) { showNotif(`Need ${herbCost} ${herb.name}`); return; }
    if ((c.supplies?.[supId] || 0) < qty) { showNotif(`Need ${qty} ${supDef.name} — buy from Supply Master`); return; }
    if (c.gold < goldCost) { showNotif(`Need ${goldCost}g`); return; }
    const key = conKey(def.id, ptier);
    commitChar({ ...c, gold: c.gold - goldCost, materials: { ...c.materials, [herb.id]: c.materials[herb.id] - herbCost }, supplies: { ...(c.supplies || {}), [supId]: (c.supplies[supId] || 0) - qty }, consumables: { ...c.consumables, [key]: (c.consumables[key] || 0) + qty }, professions: { ...c.professions, alchemy: gainProfXp(prof, craftXp(20, brewHerbIdx)) } });
    addLog(`⚗️ Brewed ${qty}× ${def.name} ${POTION_TIER_ROMAN[ptier]}`, def.color);
    showNotif(`Brewed ${qty}× ${def.name} ${POTION_TIER_ROMAN[ptier]}`);
  };

  // ---------- gear actions ----------
  const sellPrice = (item) => (item.slotId === "relic" || item.relicId) ? 150 : Math.max(1, Math.floor(item.value * 0.6 * 0.25)); // relics (artifacts) flat 150g; else 60% value -75%
  // ---------- GEAR SETS: two loadouts, one active ----------
  // The invariant that matters: char.equipment is the ONLY equipment map in existence at any
  // moment. Every stat, every set bonus and every socket reads it and nothing else. The parked set
  // lives in loadouts.stash, which nothing computes from. Swapping is a single atomic exchange, so
  // there is no window — not even one render — in which both sets could be applied.
  const loadoutRec = (c) => (c && c.loadouts) || { active: 0, stash: null };
  const loadoutActive = (c) => (loadoutRec(c).active === 1 ? 1 : 0);
  const loadoutStash = (c) => loadoutRec(c).stash;
  const equipmentPieces = (eq) => Object.values(eq || {}).filter(Boolean);
  const loadoutSummary = (eq) => {
    const items = equipmentPieces(eq).filter((it) => it && it.ilvl && it.slotId !== "relic");
    const pvp = equipmentPieces(eq).filter((it) => it && it.setId === BM_SET_ID).length;
    return { count: equipmentPieces(eq).length,
             ilvl: items.length ? Math.round(items.reduce((a, it) => a + it.ilvl, 0) / items.length) : 0,
             pvp };
  };
  const swapLoadout = () => {
    const c = charRef.current;
    if (battleRef.current) { showNotif("Finish your current fight first"); return; }
    const to = 1 - loadoutActive(c);
    // The exchange. Both halves move in ONE commit — writing equipment first and the stash second
    // would leave a state where the outgoing set was both worn and parked.
    commitChar({ ...c,
      equipment: loadoutStash(c) || {},
      loadouts: { active: to, stash: c.equipment || {} },
    });
    const s = loadoutSummary(loadoutStash(c));
    showNotif(s.count
      ? `Set ${to + 1} equipped — ${s.count} piece${s.count === 1 ? "" : "s"}, ilvl ${s.ilvl}`
      : `Set ${to + 1} is empty — equip from your bank`);
    addLog(`🗡️ Switched to gear Set ${to + 1}`);
  };

  const equipItem = (item, targetSlot) => {
    const c = charRef.current;
    const slot = targetSlot || item.slotId;
    const cur = c.equipment[slot];
    const inv = c.inventory.filter((i) => i.id !== item.id);
    if (cur) inv.push(cur);
    commitChar({ ...c, equipment: { ...c.equipment, [slot]: item }, inventory: inv, tutorial: { ...(c.tutorial || {}), equipped: true } });
    showNotif(`Equipped ${item.name}`);
  };
  // Rogues may wield a weapon in the off-hand slot
  const canOffhandWeapon = (item) => char.cls === "rogue" && item.slotId === "weapon";
  const unequip = (slotId) => {
    const c = charRef.current;
    const cur = c.equipment[slotId];
    if (!cur) return;
    commitChar({ ...c, equipment: { ...c.equipment, [slotId]: null }, inventory: [...c.inventory, cur] });
  };
  const toggleLock = (item) => {
    const c = charRef.current;
    const locked = !item.locked;
    commitChar({ ...c, inventory: c.inventory.map((i) => i.id === item.id ? { ...i, locked } : i) });
    showNotif(locked ? `🔒 Locked ${item.name}` : `🔓 Unlocked ${item.name}`);
  };
  const sellItem = (item) => {
    const c = charRef.current;
    if (item.locked) { showNotif("🔒 Item is locked — unlock to sell"); return; }
    const price = sellPrice(item);
    commitChar({ ...c, gold: c.gold + price, inventory: c.inventory.filter((i) => i.id !== item.id) });
    addLog(`💰 Sold ${item.name} for ${price}g`);
  };
  const sellByRarity = (rarityId) => {
    const c = charRef.current;
    const toSell = c.inventory.filter((i) => i.rarity === rarityId && !i.locked); // never sell locked items
    if (!toSell.length) { showNotif("None of that rarity"); return; }
    const total = toSell.reduce((s, i) => s + sellPrice(i), 0);
    const ids = new Set(toSell.map((i) => i.id));
    commitChar({ ...c, gold: c.gold + total, inventory: c.inventory.filter((i) => !ids.has(i.id)) });
    showNotif(`Sold ${toSell.length} ${rarityById(rarityId).name} (+${total}g)`);
  };
  const isDowngrade = (c, it) => { const eqp = c.equipment[it.slotId]; return !!eqp && itemScore(it, c.cls) <= itemScore(eqp, c.cls); };
  const sellDowngrades = () => {
    const c = charRef.current;
    const toSell = c.inventory.filter((i) => isDowngrade(c, i) && !i.locked); // never sell locked items
    if (!toSell.length) { showNotif("No downgrades to sell"); return; }
    const total = toSell.reduce((s, i) => s + sellPrice(i), 0);
    const ids = new Set(toSell.map((i) => i.id));
    commitChar({ ...c, gold: c.gold + total, inventory: c.inventory.filter((i) => !ids.has(i.id)) });
    showNotif(`Sold ${toSell.length} downgrades (+${total}g)`);
  };

  // ---------- auction house ----------

  // ============================================================
  // AUCTION HOUSE / MAIL — server-backed (Supabase). Shared listings + mail live
  // on the server (band enforced there); gold/inventory stay in the trusted blob.
  // ============================================================
  const sbRef = useRef(null);
  const getSbC = () => { if (!sbRef.current) sbRef.current = getSupabase(); return sbRef.current; };
  const ahUid = useRef(null);
  const ensureUid = async () => { if (ahUid.current) return ahUid.current; const sb = getSbC(); if (!sb) return null; try { ahUid.current = (await sb.auth.getSession()).data.session?.user?.id || null; } catch {} return ahUid.current; };
  const AH_NAME = (seed) => AH_SELLERS[Math.abs([...String(seed || "x")].reduce((a, ch) => ((a << 5) - a + ch.charCodeAt(0)) | 0, 0)) % AH_SELLERS.length];
  const mapRow = (r, uid) => ({
    id: r.id, kind: r.kind, price: r.price, base: r.base_value, sellerId: r.seller_id, mine: !!uid && r.seller_id === uid,
    seller: r.seller_name || AH_NAME(r.seller_id || r.id), expiresAt: new Date(r.expires_at).getTime(),
    item: r.kind === "gear" ? (r.item?.data || null) : null, matId: r.kind !== "gear" ? r.mat_id : null, qty: r.qty,
  });
  const loadListings = async () => {
    const sb = getSbC(); if (!sb) { setAhErr("offline"); return; }
    try {
      const uid = await ensureUid();
      const { data, error } = await sb.from("ah_listing").select("*, item:item_id(data)").eq("status", "active").order("posted_at", { ascending: false }).limit(250);
      if (error) { setAhErr(error.message); return; }
      setAhErr(null);
      const rows = (data || []).map((r) => mapRow(r, uid)).filter((l) => l.kind !== "gear" || l.item);
      setSrvListings(rows.filter((l) => !l.mine));
      setSrvMine(rows.filter((l) => l.mine));
    } catch (e) { console.warn("loadListings:", e); setAhErr(String(e?.message || e)); }
  };
  const loadMail = async () => {
    const sb = getSbC(); if (!sb) return;
    try {
      const uid = await ensureUid(); if (!uid) return;
      const { data } = await sb.from("mail").select("*").eq("user_id", uid).eq("collected", false).order("created_at", { ascending: false });
      setSrvMail((data || []).map((m) => ({ id: m.id, kind: m.kind, ...(m.payload || {}), createdAt: new Date(m.created_at).getTime() })));
    } catch (e) { console.warn("loadMail:", e); }
  };
  // apply a claimed/returned goods payload to the trusted blob
  const applyGoods = (c, p) => {
    // GDKP settlements can carry a NEGATIVE gold delta — the winner bought the lot. The room
    // refused any bid beyond the purse when it was placed, but gold can be spent elsewhere in
    // between, so the floor keeps a claim from ever pushing a character below zero.
    let inv = c.inventory, mats = { ...c.materials }, drops = { ...c.drops };
    let gold = Math.max(0, c.gold + (p.gold || 0));
    if (p.item) inv = depositEarned({ ...c, inventory: inv }, p.item).inventory;
    if (Array.isArray(p.items)) inv = depositEarned({ ...c, inventory: inv }, p.items).inventory;   // a run can win several lots
    if (p.mat_id) { if (p.mat_kind === "drop") drops[p.mat_id] = (drops[p.mat_id] || 0) + p.qty; else mats[p.mat_id] = (mats[p.mat_id] || 0) + p.qty; }
    return { ...c, gold, inventory: inv, materials: mats, drops };
  };

  const postGear = async (item, price) => {
    const sb = getSbC(); if (!sb) { showNotif("Connection required to use the Auction House."); return; }
    const c = charRef.current;
    if (item.artifact || item.relicId || item.slotId === "relic") { showNotif("That item can't be listed."); return; }
    const base = ahBaseValue(item); const [lo, hi] = ahBand(base); const p = clamp(Math.round(price), lo, hi); const fee = ahPostFee(base);
    if (c.gold < fee) { showNotif(`Need ${fee}g deposit to list.`); return; }
    setAhBusy(true);
    const { error } = await sb.rpc("ah_list_gear", { p_item: item, p_price: p, p_seller_name: c.name });
    setAhBusy(false);
    if (error) { showNotif(error.message); return; }
    commitChar({ ...c, gold: c.gold - fee, inventory: c.inventory.filter((i) => i.id !== item.id) });
    setAhSell(null); setAhPrice(""); setAhView("mine"); showNotif(`Listed ${item.name} · −${fee}g deposit`);
    loadListings();
  };
  // ---------- the level-10 first-purchase offer ----------
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPick, setOfferPick] = useState(OFFER.choices[0].id);
  // The 24 hours starts the first time the icon is actually SHOWN, so it cannot run down while the
  // player is logged out. Stamped once, then never touched again.
  const markOfferSeen = useCallback(() => {
    const c = charRef.current;
    if (!c || (c.offer || {}).seenAt || (c.offer || {}).taken) return;
    if ((c.level || 1) < OFFER.level) return;
    commitChar({ ...c, offer: { ...(c.offer || {}), seenAt: Date.now() } });
  }, [commitChar]);
  // Everything below the payment is built and tested; only the charge itself is missing. When a
  // provider lands, its success callback calls grantOffer and nothing else changes.
  const grantOffer = (pickId) => {
    const c = charRef.current;
    if ((c.offer || {}).taken) { showNotif("Already claimed."); return; }
    const pick = OFFER.choices.find((x) => x.id === pickId) || OFFER.choices[0];
    let nc = { ...c };
    const made = [];
    for (const slot of [OFFER.grant.slot, pick.slot]) {
      const art = makeArtifact(nc.cls, slot, nc.level);
      const d = depositEarned(nc, art);
      nc = { ...nc, inventory: d.inventory, overflow: d.overflow };
      made.push(art);
    }
    nc = { ...nc, offer: { ...(nc.offer || {}), taken: true, pick: pick.id } };
    commitChar(nc);
    setOfferOpen(false);
    showNotif(`\u2694\uFE0F ${OFFER.name} claimed — check your Bag!`);
    for (const a of made) addLog(`\u2694\uFE0F ${a.name} (ilvl ${a.ilvl})`);
  };
  const buyOffer = () => {
    // No payment provider is wired yet — VEN_PACKS' buttons show the same notice. The grant path
    // above is complete and tested, so this is one call away from working.
    showNotif("\u{1F4B3} In-app purchases coming soon — Google Play & more");
  };

  // ---------- battle pass ----------
  const [passOpen, setPassOpen] = useState(false);
  // Buying is retroactive: everything already earned becomes claimable at once. That is what makes
  // buying at rank 18 worth 100 Ven — a pass that only paid forward would be nearly worthless to
  // the player most likely to have noticed it, and the Ven sink would never fire.
  const buyPass = () => {
    const c = charRef.current;
    if (passOwnsPaid(c)) { showNotif("You already own the Champion's Pass."); return; }
    if ((c.ven || 0) < PASS.venCost) { showNotif(`Costs ${PASS.venCost} \u{1F48E} Ven`); return; }
    commitChar({ ...c, ven: (c.ven || 0) - PASS.venCost, pass: { ...passRec(c), paid: true } });
    const owed = passRank(c);
    showNotif(owed > 0 ? `⚔️ Champion's Pass unlocked — ${owed} rank${owed > 1 ? "s" : ""} ready to claim`
                       : "⚔️ Champion's Pass unlocked");
    addLog(`⚔️ Champion's Pass purchased — −${PASS.venCost} Ven`);
  };

  const claimPassRank = (rank, paid, quiet = false) => {
    const c = charRef.current;
    if (!passCanClaim(c, rank, paid)) return;
    const r = passReward(rank, paid);
    // Seeded from the character and the rank, so reloading and claiming again cannot re-roll the
    // legendary into a different piece. Gems take the generator directly; generateItem reads the
    // ambient RNG, so it needs the same stream scoped around it.
    const rng = makeRng(passSeed(c, rank, paid));
    const gems = passRollGems(rank, paid, rng);
    const items = r.item ? withRng(rng, () => [generateItem(r.item.ilvl, rarityById(r.item.rarity), pickLootSlot(), c.cls)]) : [];

    let nc = { ...c, gold: (c.gold || 0) + r.gold };
    for (const g of gems) nc = grantGem(nc, g);
    if (r.tickets) nc = { ...nc, tickets: { ...(nc.tickets || {}), dungeonReset: ((nc.tickets || {}).dungeonReset || 0) + r.tickets } };
    if (items.length) {
      // depositItems' `gold` is AUTO-SELL PROCEEDS, not the purse — take the three character fields
      // and ADD the proceeds, the same trap the daily claim had to avoid.
      const dep = depositItems(nc, items);
      nc = { ...nc, inventory: dep.inventory, overflow: dep.overflow, gold: (nc.gold || 0) + dep.gold };
      if (dep.sold.length) addLog(`\u{1F4B0} Bank full — sold ${dep.sold.length} for ${dep.gold}g`);
      if (dep.mailed.length) addLog(`\u{1F4EC} Bank full — ${dep.mailed.length} held in the mail`);
    }
    const key = paid ? "claimedPaid" : "claimedFree";
    nc = { ...nc, pass: { ...passRec(nc), [key]: { ...(passRec(nc)[key] || {}), [rank]: true } } };
    commitChar(nc);
    const lines = [`${r.gold.toLocaleString()}g`, ...gems.map((g) => g.name),
                   ...(r.tickets ? [`${r.tickets} Dungeon Reset Ticket`] : []),
                   ...items.map((it) => `${it.name} (ilvl ${it.ilvl})`)];
    addLog(`\u{1F3C5} Pass rank ${rank} (${paid ? "Champion" : "Free"}) — ${lines.join(", ")}`, paid ? "#f0b429" : "#7fd0ff");
    if (!quiet) showNotif(`\u{1F3C5} Rank ${rank}: ${lines.join(" · ")}`);
  };

  // Claim-all is why commitChar assigning charRef.current SYNCHRONOUSLY matters: each pass through
  // the loop re-reads the ref, so the rewards accumulate instead of the last claim overwriting the
  // gold of the ones before it. The per-rank notification is suppressed — twenty of them would
  // just be one banner flickering — and a single summary is shown instead.
  const claimPassAll = () => {
    let n = 0, gold = (charRef.current.gold || 0);
    for (let r = 1; r <= passRank(charRef.current); r++) {
      if (passCanClaim(charRef.current, r, false)) { claimPassRank(r, false, true); n++; }
      if (passCanClaim(charRef.current, r, true)) { claimPassRank(r, true, true); n++; }
    }
    if (!n) { showNotif("Nothing to claim yet."); return; }
    showNotif(`\u{1F3C5} Claimed ${n} reward${n > 1 ? "s" : ""} · +${((charRef.current.gold || 0) - gold).toLocaleString()}g`);
  };

  // ---------- daily sign-in ----------
  // The claim is an RPC because the device clock cannot be trusted with it: moving the date forward
  // would otherwise hand a player thirty days and the milestone legendary in a minute. The server
  // stamps the row with its own now(), the (user, day) primary key is what makes a second claim
  // impossible, and the SEED it returns is stored — so replaying the call returns the same seed and
  // cannot re-roll the item.
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyResult, setDailyResult] = useState(null);   // { lines, items } for the reward panel
  const claimDaily = async () => {
    const sb = getSbC();
    if (!sb) { showNotif("Connection required to claim your daily sign-in."); return; }
    const c = charRef.current;
    setDailyBusy(true);
    const { data, error } = await sb.rpc("daily_signin");
    setDailyBusy(false);
    if (error) { showNotif(error.message || "Could not reach the sign-in ledger."); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { showNotif("Could not reach the sign-in ledger."); return; }
    if (!row.fresh) { showNotif("Already signed in today."); return; }

    const reward = dailyRewardFor({ streak: row.streak, isWeekend: row.is_weekend,
                                    avgIlvl: avgEquippedIlvl(c), cls: c.cls });
    // Rolled from the SERVER's seed, so the item is reproducible and cannot be re-rolled.
    const items = withRng(makeRng(Number(row.seed) || 1), () =>
      reward.rolls.map((r) => generateItem(r.ilvl, rarityById(r.rarity), pickLootSlot(), c.cls)));

    const hist = [...(c.daily?.history || []).filter((h) => h.day !== row.utc_day),
                  { day: row.utc_day, streak: row.streak, weekend: !!row.is_weekend }].slice(-60);
    let nc = { ...c, ven: (c.ven || 0) + reward.ven,
               daily: { lastDay: row.utc_day, streak: row.streak, history: hist } };
    if (items.length) {
      // depositItems returns `gold` meaning AUTO-SELL PROCEEDS, not the character's purse. Spreading
      // the whole result onto the character would replace their gold with that figure — usually 0.
      // Take the three fields that belong on a character and ADD the proceeds.
      const dep = depositItems(nc, items);
      nc = { ...nc, inventory: dep.inventory, overflow: dep.overflow, gold: (nc.gold || 0) + dep.gold };
      if (dep.sold.length) addLog(`\u{1F4B0} Bank full \u2014 sold ${dep.sold.length} for ${dep.gold}g`);
      if (dep.mailed.length) addLog(`\u{1F4EC} Bank full \u2014 ${dep.mailed.length} held in the mail`);
    }
    commitChar(nc);
    setDailyResult({ lines: reward.lines, items, streak: row.streak });
    addLog(`\u{1F4C5} Daily sign-in \u2014 day ${row.streak}: ${reward.lines.join(", ")}`);
  };

  const postStack = async (kind, id, price) => {
    const sb = getSbC(); if (!sb) { showNotif("Connection required to use the Auction House."); return; }
    const c = charRef.current; const pool = kind === "drop" ? "drops" : "materials";
    const have = (c[pool] || {})[id] || 0;
    if (have < AH_ECON.stackSize) { showNotif(`Need ${AH_ECON.stackSize} to post a stack.`); return; }
    const base = stackBaseValue(kind, id); const [lo, hi] = ahBand(base); const p = clamp(Math.round(price), lo, hi); const fee = ahPostFee(base);
    if (c.gold < fee) { showNotif(`Need ${fee}g deposit to list.`); return; }
    setAhBusy(true);
    const { error } = await sb.rpc("ah_list_stack", { p_kind: kind, p_mat_id: id, p_price: p, p_seller_name: c.name });
    setAhBusy(false);
    if (error) { showNotif(error.message); return; }
    commitChar({ ...c, gold: c.gold - fee, [pool]: { ...c[pool], [id]: have - AH_ECON.stackSize } });
    setAhSell(null); setAhPrice(""); setAhView("mine"); showNotif(`Listed ${stackMeta(kind === "drop" ? "drop" : "mat", id).name} ×${AH_ECON.stackSize} · −${fee}g deposit`);
    loadListings();
  };
  const buyAh = async (L) => {
    const sb = getSbC(); if (!sb) { showNotif("Connection required."); return; }
    const c = charRef.current; if (L.mine) return;
    if (c.gold < L.price) { showNotif("Not enough gold!"); return; }
    setAhBusy(true);
    const { error } = await sb.rpc("ah_purchase", { p_listing_id: L.id });
    setAhBusy(false);
    if (error) { showNotif(error.message); loadListings(); return; }
    commitChar({ ...c, gold: c.gold - L.price });
    showNotif(`Bought · ${L.price}g — check Mail 📬`); loadListings();
  };
  const cancelAh = async (L) => {
    const sb = getSbC(); if (!sb) return; if (!L.mine) return;
    setAhBusy(true);
    const { data, error } = await sb.rpc("ah_unlist", { p_listing_id: L.id });
    setAhBusy(false);
    if (error) { showNotif(error.message); return; }
    commitChar(applyGoods(charRef.current, data || {}));
    showNotif("Listing cancelled — goods returned."); loadListings();
  };
  const collectMail = async (m) => {
    const sb = getSbC(); if (!sb) return;
    const { data, error } = await sb.rpc("mail_claim", { p_id: m.id });
    if (error) { showNotif(error.message); loadMail(); return; }
    commitChar(applyGoods(charRef.current, data || {}));
    loadMail();
  };
  const collectAllMail = async () => {
    const sb = getSbC(); if (!sb) return;
    const { data, error } = await sb.rpc("mail_claim_all");
    if (error) { showNotif(error.message); return; }
    let c = charRef.current;
    for (const p of (data || [])) c = applyGoods(c, p);
    commitChar(c); loadMail(); showNotif("Collected all mail.");
  };
  // load on open + keep a live subscription for cross-player updates
  useEffect(() => { try { if (tab === "auction") loadListings(); if (tab === "auction" || tab === "mail") loadMail(); } catch (e) { console.warn("AH load:", e); } }, [tab]);
  useEffect(() => { let ch;
    try {
      loadMail(); const sb = getSbC(); if (!sb) return;
      (async () => {
        try {
          const uid = await ensureUid();
          ch = sb.channel("ah-live").on("postgres_changes", { event: "*", schema: "public", table: "ah_listing" }, () => loadListings())
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "mail", filter: uid ? `user_id=eq.${uid}` : undefined }, () => loadMail())
            .subscribe();
        } catch (e) { console.warn("AH realtime:", e); }
      })();
    } catch (e) { console.warn("AH init:", e); }
    return () => { try { const s = getSbC(); if (s && ch) s.removeChannel(ch); } catch {} };
  }, []);

  // ---------- the Battlemaster (Arena Token shop) ----------
  const [bmPick, setBmPick] = useState(null);   // { entry } while the main-stat chooser is open

  const bmRecord = (c, entry) => {
    const r = bmRec(c), week = utcWeekString();
    if (entry.per === "life") return { ...r, life: { ...(r.life || {}), [entry.id]: ((r.life || {})[entry.id] || 0) + 1 } };
    // A new week wipes the counters by REPLACING them, not by clearing keys one at a time — a stale
    // key surviving a reset would silently eat part of the next week's allowance.
    const counts = r.week === week ? { ...(r.counts || {}) } : {};
    counts[entry.id] = (counts[entry.id] || 0) + 1;
    return { ...r, week, counts };
  };

  // Forge a set piece with the main stats the player chose. `mains` is one or two keys: two is the
  // normal artifact shape, one earns the Power affix at ilvl 65 (POWER_AFFIX_MIN_ILVL is 60), which
  // is the real trade — breadth against a focused stat that pays Attack or Spell Power on top.
  const makeSetPiece = (c, slot, mains) =>
    makeArtifact(c.cls, slot, c.level, {
      shape: { mains },            // the chosen main stat(s) win over the class table
      setId: BM_SET_ID,            // membership rides on the item, so the bonus cannot be faked
      fixedIlvl: BM_PIECE_ILVL,    // 65 forever — makeArtifact reads this instead of the curve
      name: `Battlemaster's ${BM_SLOT_LABEL[slot]}`,
      baseName: BM_SLOT_LABEL[slot],
    });

  const buyBattlemaster = (entry, mains) => {
    const c = charRef.current;
    if ((c.arenaTokens || 0) < entry.cost) { showNotif(`Need ${entry.cost} 🎟️ Arena Tokens.`); return; }
    if (bmLeft(c, entry) <= 0) {
      showNotif(entry.per === "life" ? `Limit reached — ${entry.limit} per character.` : `Limit reached — ${entry.limit} this week.`);
      return;
    }
    let nc = { ...c, arenaTokens: (c.arenaTokens || 0) - entry.cost, bm: bmRecord(c, entry) };
    let what = entry.name;

    if (entry.kind === "ticket") {
      nc = { ...nc, tickets: { ...(nc.tickets || {}), [entry.ticket]: ((nc.tickets || {})[entry.ticket] || 0) + 1 } };
    } else if (entry.kind === "bank") {
      nc = { ...nc, bankSlots: (nc.bankSlots || 0) + entry.slots };
    } else if (entry.kind === "gem") {
      nc = grantGem(nc, gemById(entry.gem));
    } else if (entry.kind === "gemRoll") {
      const pool = ALL_GEMS.filter((g) => g.rarity === entry.rarity);
      const g = pool[Math.floor(Math.random() * pool.length)];
      nc = grantGem(nc, g); what = g.name;
    } else if (entry.kind === "setPiece") {
      const it = makeSetPiece(nc, entry.slot, mains);
      const dep = depositItems(nc, [it]);
      nc = { ...nc, inventory: dep.inventory, overflow: dep.overflow, gold: (nc.gold || 0) + dep.gold };
      what = `${it.name} (ilvl ${it.ilvl}, ${mains.map((k) => STAT_LABEL[k] || k).join(" + ")})`;
      if (dep.mailed.length) addLog("📬 Bank full — held in the mail");
    }
    commitChar(nc);
    setBmPick(null);
    showNotif(`🎟️ −${entry.cost} · ${what}`);
    addLog(`🛡️ Battlemaster: ${what} for ${entry.cost} Arena Tokens`);
  };

  // ---------- tempering forge ----------
  const cloneItem = (it) => JSON.parse(JSON.stringify(it));
  // swap an item (by id) wherever it lives — inventory or an equipped slot; next=null destroys it
  // Both of these must know about the PARKED set as well as the worn one. A player's arena kit
  // spends most of its life in the stash, and gear you cannot temper or reroll while it is put
  // away is gear you have to swap into first for no reason the player could guess.
  const replaceItemInChar = (c, id, next) => {
    const inventory = c.inventory.map((i) => (i && i.id === id ? next : i)).filter(Boolean);
    const equipment = { ...c.equipment };
    for (const k in equipment) if (equipment[k]?.id === id) { if (next) equipment[k] = next; else delete equipment[k]; }
    let loadouts = c.loadouts;
    const st = loadoutStash(c);
    if (st && Object.values(st).some((i) => i && i.id === id)) {
      const stash = { ...st };
      for (const k in stash) if (stash[k]?.id === id) { if (next) stash[k] = next; else delete stash[k]; }
      loadouts = { ...loadoutRec(c), stash };
    }
    return { ...c, inventory, equipment, loadouts };
  };
  // find the current live copy of an item by id (worn first, then the parked set, then bags)
  const findItemById = (c, id) => {
    for (const k in (c.equipment || {})) if (c.equipment[k]?.id === id) return c.equipment[k];
    const st = loadoutStash(c) || {};
    for (const k in st) if (st[k]?.id === id) return st[k];
    return (c.inventory || []).find((i) => i && i.id === id) || null;
  };
  const temperItem = (srcItem, useProtect) => {
    const c = charRef.current;
    const it0 = findItemById(c, srcItem.id); if (!it0 || !isTemperable(it0)) return;
    const rank = it0.temper || 0;
    // PvP set gear runs on its own ladder: it stops at +5 and it is paid for in Arena Tokens, never
    // gold. +5 is the whole of the SAFE band, so a Battlemaster piece can never be destroyed and
    // never needs Ven protection — the risk half of tempering simply does not apply to it.
    const pvp = isPvpSetItem(it0);
    const maxRank = pvp ? BM_TEMPER_MAX : TEMPER_CFG.maxRank;
    if (rank >= maxRank) { showNotif(pvp ? `Arena gear stops at +${BM_TEMPER_MAX}.` : "Already at max +10."); return; }
    const target = rank + 1;
    const cost = pvp ? (BM_TEMPER_COST[target] || 0) : temperCost(target);
    if (pvp) {
      if ((c.arenaTokens || 0) < cost) { showNotif(`Need ${cost} 🎟️ Arena Tokens to attempt +${target}.`); return; }
    } else if (c.gold < cost) { showNotif(`Need ${cost.toLocaleString()}g to attempt +${target}.`); return; }
    const risky = !pvp && rank >= TEMPER_CFG.safeMax;
    const venCost = useProtect && risky ? (TEMPER_CFG.protectVen[target] || 0) : 0;
    if (venCost && (c.ven || 0) < venCost) { showNotif(`Need ${venCost} Ven to protect.`); return; }
    const item = ensureTemperData(cloneItem(it0));
    let gold = pvp ? c.gold : c.gold - cost, ven = (c.ven || 0) - venCost, fs = c.failStacks || 0;
    const tokens = pvp ? (c.arenaTokens || 0) - cost : (c.arenaTokens || 0);
    // ONE roll against the chance the shop displayed. Success and destruction used to be separate
    // independent rolls, which meant a successful temper could still destroy the piece.
    const odds = risky ? temperOdds(item, target) : null;
    const success = !risky || Math.random() < odds.chance;
    if (success) {
      const doubled = Math.random() < doubleChanceFor(fs);
      const grant = TEMPER_CFG.grantAtRank(target) * (doubled ? 2 : 1);
      item.temperLog.push(grant);
      item.temper = item.temperLog.length;
      item.temperBonus = item.temperLog.reduce((a, b) => a + b, 0);
      delete item.pity[target];   // the ladder for THIS rank is spent; higher ranks keep their own
      syncItemStats(item);
      if (item.artifact) item.shape = { ...(item.shape || {}), secs: item.lines.map((l) => l.stat) };
      commitChar(replaceItemInChar({ ...c, gold, ven, arenaTokens: tokens, failStacks: 0 }, it0.id, item)); // success consumes fail stacks
      showNotif(doubled ? `✨ +${item.temper}! DOUBLE — +${grant}/line!` : `✨ Success! Now +${item.temper}`);
      return;
    }
    // A failure never takes a rank away any more. It buys a better chance at the next attempt,
    // and — unless the piece is warded — carries the one risk left.
    item.pity[target] = odds.stacks + 1;
    const next = temperOdds(item, target);
    const destroyed = !useProtect && Math.random() < odds.destroy;
    if (destroyed) {
      commitChar(replaceItemInChar({ ...c, gold, ven, arenaTokens: tokens, failStacks: fs + 1 }, it0.id, null));
      showNotif(`☠️ ${it0.name} was destroyed! Its forge progress is gone with it.`);
    } else {
      commitChar(replaceItemInChar({ ...c, gold, ven, arenaTokens: tokens, failStacks: fs + 1 }, it0.id, item));
      showNotif(next.chance >= 1
        ? `🔥 Failed — but +${target} is now GUARANTEED on the next attempt.`
        : `🔥 Failed. +${target} is now ${Math.round(next.chance * 100)}%${next.left ? ` · guaranteed in ${next.left}` : ""}`);
    }
  };
  const rerollLine = (srcItem, lineIdx) => {
    const c = charRef.current;
    const it0 = findItemById(c, srcItem.id); if (!it0 || !isTemperable(it0)) return;
    const item = ensureTemperData(cloneItem(it0));
    const ln = item.lines[lineIdx]; if (!ln) return;
    const cost = rerollCost(item.rerolls);
    if (c.gold < cost) { showNotif(`Need ${cost.toLocaleString()}g to reroll.`); return; }
    // Reroll follows the SAME slot weighting drops use, so the shop cannot launder slot identity
    // back out — rerolling a chest into pure crit damage would make the whole table meaningless.
    // Off-stats stay reachable (~1 roll in 3), so an off-spec piece is a find, not an impossibility.
    // Every stat already on the item is excluded, not just this line's: that guarantees a paid
    // reroll changes something AND stops it landing on a stat another line already carries, which
    // would silently sum into one larger line rather than reading as a second one. Drops have
    // de-duplicated since slot identity shipped; this brings the shop in line with them.
    // Four lines is the maximum and there are eight secondaries, so at least four remain.
    const taken = (item.lines || []).map((l) => l.stat);
    const newStat = pickSlotSecondary(item.slotId, taken) || pickSlotSecondary(item.slotId, [ln.stat]) || pick(TEMPER_CFG.reroll.pool);
    ln.stat = newStat;
    ln.base = rollRerollValue(item.ilvl, item.rarity, newStat, item.abyss);
    item.rerolls += 1;
    syncItemStats(item);
    if (item.artifact) item.shape = { ...(item.shape || {}), secs: item.lines.map((l) => l.stat) };
    commitChar(replaceItemInChar({ ...c, gold: c.gold - cost }, it0.id, item));
    showNotif(`🎲 Rerolled → ${STAT_LABEL[newStat]} +${ln.base}`);
  };

  // ---------- promo codes ----------
  const PROMO_CODES = {
    anvu: {
      label: "Level 60 boost",
      apply: (c) => {
        const allSkills = SKILLS[c.cls].map((s) => s.name);
        const nc = { ...c, level: 60, xp: 0, unlockedSkills: allSkills };
        nc.selectedSkills = padSelectedSkills(nc, nc.selectedSkills);
        nc.hp = maxHpFor(nc);
        return { char: nc, msg: "🎉 Leveled to 60 with all skills unlocked!" };
      },
    },
    anvu15: {
      label: "Level 15 boost",
      apply: (c) => {
        const skills = (SKILLS[c.cls] || []).filter((s) => s.unlockLevel <= 15).map((s) => s.name);
        const nc = { ...c, level: 15, xp: 0, unlockedSkills: skills };
        nc.selectedSkills = padSelectedSkills(nc, nc.selectedSkills);
        nc.hp = maxHpFor(nc);
        return { char: nc, msg: "🎉 Leveled to 15!" };
      },
    },
    anvugear: {
      label: "Full epic gear set",
      apply: (c) => {
        const epic = RARITIES.find((r) => r.id === "epic");
        const equipment = { ...c.equipment };
        GEAR_SLOTS.filter((s) => s.id !== "relic").forEach((s) => { equipment[s.id] = generateItem(Math.max(1, c.level), epic, s.id, c.cls); });
        const nc = { ...c, equipment };
        nc.hp = maxHpFor(nc);
        return { char: nc, msg: "🟣 Full set of epic gear equipped!" };
      },
    },
    frankie: {
      label: "Full green gear set",
      apply: (c) => {
        const green = RARITIES.find((r) => r.id === "uncommon");
        const equipment = { ...c.equipment };
        GEAR_SLOTS.filter((s) => s.id !== "relic").forEach((s) => { equipment[s.id] = generateItem(Math.max(1, c.level), green, s.id, c.cls); });
        const nc = { ...c, equipment };
        nc.hp = maxHpFor(nc);
        return { char: nc, msg: "🟢 Full set of green gear equipped!" };
      },
    },
    relga: {
      label: "Both dungeon relics",
      apply: (c) => {
        const relics = RELICS.map((def) => makeRelic(def, Math.max(1, c.level)));
        const nc = { ...c, ...depositEarned(c, relics) };
        return { char: nc, msg: "🔱 Miner's Charm & Verdant Idol added to your bag!" };
      },
    },
    anvugold: {
      label: "100,000 gold",
      apply: (c) => ({ char: { ...c, gold: c.gold + 100000 }, msg: "💰 +100,000 gold!" }),
    },
    venrule: {
      label: "10,000 Ven",
      repeatable: true, // TESTING ONLY — unlimited redemptions; remove this code before launch
      apply: (c) => ({ char: { ...c, ven: (c.ven || 0) + 10000 }, msg: "💎 +10,000 Ven!" }),
    },
    hardmode: {
      label: "Full ilvl-64 rare gear set",
      apply: (c) => {
        const rare = RARITIES.find((r) => r.id === "rare");
        const gear = GEAR_SLOTS.filter((s) => s.id !== "relic").map((s) => generateItem(64, rare, s.id, c.cls));
        return { char: { ...c, inventory: [...(c.inventory || []), ...gear] }, msg: "🔥 Received a full set of ilvl-64 rare gear — check your Bag!" };
      },
    },
    // TESTING ONLY — remove before launch. Maxes every profession, gathering and crafting alike,
    // so the crafting and gathering systems can be exercised without a 10-hour grind first.
    maxp: {
      label: "Max all professions (TEST)",
      apply: (c) => {
        const professions = { ...(c.professions || {}) };
        for (const def of PROFESSIONS) professions[def.id] = { ...(professions[def.id] || {}), level: PROF_MAX, xp: 0, active: !!(professions[def.id] || {}).active };
        return { char: { ...c, professions }, msg: `⚒️ All ${PROFESSIONS.length} professions set to rank ${PROF_MAX}.` };
      },
    },
    gambit: {
      label: "All gambits",
      apply: (c) => { const owned = { ...(c.gambits?.owned || {}) }; for (const g of ALL_GAMBITS) owned[g.id] = true; return { char: { ...c, gambits: { ...(c.gambits || { shards: {}, rules: {}, slots: {}, general: [], generalSlots: 2 }), owned } }, msg: "🎯 Unlocked every gambit!" }; },
    },
  };
  const redeemPromo = () => {
    const code = promo.trim().toLowerCase();
    if (!code) return;
    const def = PROMO_CODES[code];
    if (!def) { showNotif("Invalid code"); return; }
    const c = charRef.current;
    if (!def.repeatable && c.redeemed?.[code]) { showNotif("Code already redeemed"); return; }
    const res = def.apply(c);
    commitChar(def.repeatable ? res.char : { ...res.char, redeemed: { ...c.redeemed, [code]: true } });
    setPromo("");
    showNotif(res.msg);
    addLog(`🎟️ Promo redeemed: ${def.label}`);
  };

  // ---------- honor attribute allocation ----------
  const allocateAttr = (stat) => {
    const c = charRef.current;
    if ((c.attrPoints || 0) <= 0) { showNotif("No attribute points"); return; }
    commitChar({ ...c, attrPoints: c.attrPoints - 1, allocated: { ...c.allocated, [stat]: (c.allocated?.[stat] || 0) + 1 } });
  };

  // ---------- auto-skill actions ----------
  // The per-skill Auto-Cast purchase (autoSkillCost / buyAutoSkill / toggleAutoSkill) lived here and
  // was DELETED. Its UI was removed when the live tick moved to "Skill automation is handled
  // exclusively by the Gambit system (no free auto-cast)", but the three handlers stayed behind with
  // nothing calling them — so char.autoSkillsOwned could never be set by anyone. That dead flag was
  // still load-bearing in offlinePlayerDps, which meant parked characters counted auto-attacks only,
  // and a tutorial lesson asked players to buy from a trainer that does not exist.

  // ---------- profession actions ----------
  const toggleProfession = (pid) => {
    const c = charRef.current;
    const turningOn = !c.professions[pid]?.active;
    const profs = { ...c.professions };
    // only ONE gathering profession trains AFK at a time
    if (turningOn) Object.keys(profs).forEach((k) => { if (PROFESSIONS.find((p) => p.id === k)?.type === "gathering") profs[k] = { ...profs[k], active: false }; });
    profs[pid] = { ...profs[pid], active: turningOn };
    commitChar({ ...c, professions: profs });
  };
  // reward for depleting a gathering node (materials + tiny gold + XP)
  const rewardGatherNode = (pid, lvl) => {
    const c = charRef.current;
    const mats = { ...c.materials };
    const pLvl = c.professions[pid]?.level || 1;
    const tiers = GATHER_TIERS[pid];
    const tIdx = gatherNodeRef.current?.tierIdx ?? highestTierIdx(tiers, pLvl);
    const tier = tiers[tIdx]; const next = tiers[tIdx + 1];
    const bandEnd = next ? next.unlock : PROF_MAX;
    const progress = Math.max(0, Math.min(1, (pLvl - tier.unlock) / Math.max(1, bandEnd - tier.unlock)));
    let qty = Math.random() < 0.5 ? 1 : 2; // 50% chance for 1, 50% for 2
    // Relic: 50% chance for double yield when manually mining/harvesting (this path is active-only; idle tick is separate)
    const dblRelic = (pid === "mining" && hasRelic(c, "miners_charm")) || (pid === "herbalism" && hasRelic(c, "verdant_idol"));
    let doubled = false;
    if (dblRelic && Math.random() < 0.5) { qty *= 2; doubled = true; }
    const _gb = townBonuses(c).gather; // Storehouse (town)
    if (_gb > 0) { const ex = qty * _gb; qty += Math.floor(ex) + (Math.random() < (ex % 1) ? 1 : 0); }
    mats[tier.id] = (mats[tier.id] || 0) + qty;
    let flash = `+${qty} ${tier.name}${doubled ? " ×2!" : ""}`;
    // small chance to gather the NEXT (still-locked) tier, scaling with closeness to unlocking it
    if (next && next.unlock <= PROF_MAX && pLvl < next.unlock && Math.random() < 0.15) { mats[next.id] = (mats[next.id] || 0) + 1; flash += ` · ✨ ${next.name}!`; addLog(`✨ Found rare ${next.name}!`, next.color); }
    const gold = 1 + Math.floor(Math.random() * 3); // minuscule gold per node
    const before = c.professions[pid]?.level || 1;
    const prof = gainProfXp(c.professions[pid] || { level: 1, xp: 0, active: true }, gatherXpPerNode(before));
    if (prof.level > before) addLog(`${PROFESSIONS.find((p) => p.id === pid)?.icon} ${PROFESSIONS.find((p) => p.id === pid)?.name} → rank ${prof.level}!`, PROFESSIONS.find((p) => p.id === pid)?.color);
    commitChar({ ...c, materials: mats, gold: c.gold + gold, professions: { ...c.professions, [pid]: prof } });
    setGatherFlash(flash); setTimeout(() => setGatherFlash(""), 900);
  };
  const hitNode = (power) => {
    const c = charRef.current; const pid = gatherId; if (!pid) return;
    const lvl = c.professions[pid]?.level || 1;
    const ti = gatherTierRef.current;
    let node = gatherNodeRef.current || makeGatherNode(pid, lvl, ti);
    const hp = node.hp - power;
    if (hp <= 0) { rewardGatherNode(pid, lvl); setNode(makeGatherNode(pid, lvl, ti)); }
    else setNode({ ...node, hp });
  };
  const startGathering = (pid) => {
    const c = charRef.current;
    const profs = { ...c.professions };
    if (!profs[pid]) profs[pid] = { level: 1, xp: 0, active: false };
    Object.keys(profs).forEach((k) => { if (PROFESSIONS.find((p) => p.id === k)?.type === "gathering") profs[k] = { ...profs[k], active: k === pid }; });
    const tiers = GATHER_TIERS[pid];
    let ti = tiers ? highestTierIdx(tiers, profs[pid].level) : 0;
    if (tiers && c.gatherTier?.[pid] != null) ti = Math.min(highestTierIdx(tiers, profs[pid].level), c.gatherTier[pid]); // resume last-selected (within unlocked range)
    commitChar({ ...c, professions: profs, gatherTier: { ...(c.gatherTier || {}), [pid]: ti } });
    gatherTierRef.current = ti; setGatherTierIdx(ti);
    setGatherId(pid); setNode(makeGatherNode(pid, profs[pid].level, ti)); setGatherTapCd(0); setTab("gathering");
  };
  // manually salvage a chosen bag item into Arcane Dust
  const salvageItem = (item) => {
    const c = charRef.current;
    if (item.locked) { showNotif("🔒 Item is locked — unlock to salvage"); return; }
    const rIdx = Math.max(0, RARITIES.findIndex((r) => r.id === item.rarity));
    if (rIdx < SALVAGE_MIN_RARITY) { showNotif("Common gear can't be salvaged"); return; }
    const goldCost = salvageGoldCost(item);
    if (c.gold < goldCost) { showNotif(`Salvage costs ${goldCost}g`); return; }
    const dust = salvageReward(item);
    const mats = { ...c.materials, dust: (c.materials.dust || 0) + dust };
    let bonus = "";
    const itemStats = ENCHANT_STATS.filter((s) => (item.stats?.[s] || 0) > 0 || (item.enchant?.[s] || 0) > 0);
    if (itemStats.length && Math.random() < 0.06) { // very small chance for a stat dust of a stat on the item
      const s = pick(itemStats); const id = statDustId(s);
      mats[id] = (mats[id] || 0) + 1; bonus = ` · ${STAT_DUST_META[s].icon} ${STAT_DUST_META[s].name}!`;
      addLog(`✨ Extracted a ${STAT_DUST_META[s].name}!`, STAT_DUST_META[s].color);
    }
    const before = c.professions.salvage?.level || 1;
    const prof = gainProfXp(c.professions.salvage || { level: 1, xp: 0, active: false }, 12 + rIdx * 8 + Math.floor((item.ilvl || 1) / 3));
    commitChar({ ...c, gold: c.gold - goldCost, materials: mats, inventory: c.inventory.filter((i) => i.id !== item.id), professions: { ...c.professions, salvage: prof } });
    addLog(`♻️ Salvaged ${item.name} (−${goldCost}g) → ${dust} ✨ Dust${bonus}`);
    if (prof.level > before) addLog(`♻️ Salvage → rank ${prof.level}!`);
    showNotif(`Salvaged → ${dust} Dust${bonus ? " + a stat dust!" : ""}`);
  };
  // active mining loop — auto-swings at the node while the gathering screen is open
  useEffect(() => {
    if (tab !== "gathering" || !gatherId) return;
    if (!gatherNodeRef.current) setNode(makeGatherNode(gatherId, charRef.current.professions[gatherId]?.level || 1, gatherTierRef.current));
    const swing = setInterval(() => { hitNode(gatherPower(charRef.current.professions[gatherId]?.level || 1)); }, 850);
    const tick = setInterval(() => setGatherTick((t) => t + 1), 200); // live cooldown countdown
    return () => { clearInterval(swing); clearInterval(tick); };
  }, [tab, gatherId]);
  const gainProfXp = (prof, amount) => {
    let p = { ...prof }; p.xp = (p.xp || 0) + amount;
    while (p.level < PROF_MAX && p.xp >= professionXpForLevel(p.level)) { p.xp -= professionXpForLevel(p.level); p.level += 1; }
    return p;
  };
  const profRank = (lvl) => (lvl < 25 ? "Apprentice" : lvl < 50 ? "Journeyman" : lvl < 75 ? "Expert" : lvl < 100 ? "Artisan" : "Master");

  // ---------- crafting actions ----------
  // Forge with a Soul: the reagent sets the item level, the ore still sets the rarity, and the slot
  // is whatever the player picked — which is the point, since hard mode hands out two RANDOM pieces
  // a boss and the missing slot is the whole frustration.
  const forgeWithSoul = (soulId) => {
    const c = charRef.current; const prof = c.professions.armorsmith; if (!prof) return;
    const soul = soulById(soulId); if (!soul) return;
    if (((c.souls || {})[soulId] || 0) < 1) { showNotif(`You have no ${soul.name}`); return; }
    const tier = ORE_TIERS[forgeOre]; const oreCost = oreCraftCost(forgeOre);
    if ((c.materials[tier.id] || 0) < oreCost) { showNotif(`Need ${oreCost} ${tier.name}`); return; }
    if ((c.gold || 0) < SOUL_CRAFT_GOLD) { showNotif(`Need ${SOUL_CRAFT_GOLD.toLocaleString()}g`); return; }
    const rarity = rollWeighted(tier.craft);
    // Bound on creation. A craftable ilvl-70 piece on the auction house would be a gold faucet at
    // the new power-based prices, and binding keeps this a catch-up mechanic rather than a trade.
    const item = { ...generateItem(soul.ilvl, rarity, forgeSlot, c.cls), bound: true };
    const souls = { ...(c.souls || {}), [soulId]: (c.souls[soulId] || 0) - 1 };
    if (souls[soulId] <= 0) delete souls[soulId];
    commitChar({
      ...c, souls, gold: c.gold - SOUL_CRAFT_GOLD,
      materials: { ...c.materials, [tier.id]: c.materials[tier.id] - oreCost },
      ...depositEarned(c, item),
      professions: { ...c.professions, armorsmith: gainProfXp(prof, craftXp(60, forgeOre)) },
    });
    addLog(`${soul.icon} Forged ${item.name} (ilvl ${item.ilvl}, account bound)`, rarityById(item.rarity).color);
    showNotif(`${soul.icon} Forged ilvl-${item.ilvl} ${slotById(forgeSlot).name}!`);
  };

  const ARMOR_ORE_COST = 3;
  const forge = () => {
    const c = charRef.current; const prof = c.professions.armorsmith; if (!prof) return;
    const tier = ORE_TIERS[forgeOre]; const oreCost = oreCraftCost(forgeOre); const goldCost = oreGoldCost(forgeOre);
    if ((c.materials[tier.id] || 0) < oreCost) { showNotif(`Need ${oreCost} ${tier.name}`); return; }
    if (c.gold < goldCost) { showNotif(`Need ${goldCost}g`); return; }
    const ilvl = craftIlvl(prof.level, forgeOre);
    const rarity = rollWeighted(tier.craft); // rollWeighted returns the rarity object
    const item = generateItem(ilvl, rarity, forgeSlot, c.cls);
    commitChar({ ...c, gold: c.gold - goldCost, materials: { ...c.materials, [tier.id]: c.materials[tier.id] - oreCost }, ...depositEarned(c, item), professions: { ...c.professions, armorsmith: gainProfXp(prof, craftXp(25, forgeOre)) } });
    addLog(`⚒️ Forged ${item.name}`, rarityById(item.rarity).color);
    showNotif(`Forged ${rarity.name} ${slotById(forgeSlot).name}!`);
  };
  const ARCANE_ENCHANT_COST = 5;
  // dustKind: "dust" (Arcane → random stat) or "dust_<stat>" (guaranteed that stat)
  const enchantGear = (slotId, dustKind, confirmed) => {
    const c = charRef.current; const prof = c.professions.enchanting; if (!prof) return;
    const it = c.equipment[slotId]; if (!it) { showNotif("Equip gear to enchant"); return; }
    if (it.slotId === "relic") { showNotif("Relics cannot be enchanted"); return; }
    let stat, cost;
    if (dustKind === "dust") { cost = ARCANE_ENCHANT_COST; if ((c.materials.dust || 0) < cost) { showNotif(`Need ${cost} Arcane Dust`); return; } stat = pick(ENCHANT_STATS); }
    else { stat = dustKind.replace("dust_", ""); cost = 5; if ((c.materials[dustKind] || 0) < 5) { showNotif(`Need 5 ${STAT_DUST_META[stat].name}`); return; } }
    const amount = enchantAmount(stat, prof.level, it.abyss);
    if (wouldDormantPower(it, stat) && !confirmed) { // adding a 2nd main stat trades the Power away
      setEnchantConfirm({ slotId, dustKind, stat, amount, item: it });
      return;
    }
    setEnchantConfirm(null);
    const newItem = { ...it, enchant: { [stat]: amount } };
    const mats = { ...c.materials }; mats[dustKind] = (mats[dustKind] || 0) - cost;
    commitChar({ ...c, materials: mats, equipment: { ...c.equipment, [slotId]: newItem }, professions: { ...c.professions, enchanting: gainProfXp(prof, craftXp(25, enchantXpTier(it.ilvl))) } });
    addLog(`✨ Enchanted ${it.name}: +${amount} ${STAT_LABEL[stat]}`);
    showNotif(`Enchanted: +${amount} ${STAT_LABEL[stat]}`);
  };

  const maxHP = maxHpFor(char);
  const eff = effectiveStats(char);
  const zone = ZONES.find((z) => z.id === char.currentZoneId) || ZONES[0];
  const knownSkills = (char.selectedSkills || []).map((n) => skillByName(char, n)).filter(Boolean).slice(0, unlockedSlotCount(char.level));

  // timer helpers (re-evaluated each second via `now`)
  const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`; return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`; };
  const activeBuffList = Object.entries(char.buffs || {}).filter(([, b]) => b && b.expires > now).map(([stat, b]) => ({ stat, ...b }));
  const potionCdLeft = Math.max(0, POTION_CD - (now - lastPotion));
  const playerDebuffs = battle ? (battle.playerEffects || []).filter(isPlayerDebuff) : [];
  const playerBuffs = battle ? (battle.playerEffects || []).filter((e) => !isPlayerDebuff(e)) : [];
  const mailCount = srvMail.length;

  // town buildings → tab panels
  const enterBuilding = (dest) => {
    if (dest === "quests") { setTab("tavern"); return; } // Tavern hub (Bestiary / Quest Board / Tavern Hall)
    if (dest === "world" && battleRef.current) { setTab("combat"); return; } // resume an active fight
    if (dest === "auction" && (char.level || 1) < AH_ECON.unlockLevel) { showNotif(`🔒 Auction House unlocks at level ${AH_ECON.unlockLevel}`); return; }
    setTab(dest);
  };

  return (
    <div className={`shell chronicle-ground ${themeClass(chronicleTheme)}`}
      style={{ height: "100dvh", minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* The signpost pulse. It used to be a gold GLOW, which is the one thing the
          Chronicle has no vocabulary for — parchment does not emit light. It is a
          ring drawn around the thing instead, in the same rubric the log uses for
          your own deeds, and it takes its colour from the theme like everything
          else. */}
      <style>{`@keyframes tutflash { 0%,100% { box-shadow: 0 0 0 0 transparent; border-color: var(--rule); } 50% { box-shadow: 0 0 0 3px var(--rubric); border-color: var(--rubric); } } @keyframes tutflash-sm { 0%,100%{opacity:.4;transform:scale(1);} 50%{opacity:1;transform:scale(1.2);} }`}</style>
      {notification && (
        <div className="notice">{withIcons(notification, 15)}</div>
      )}
      {lastLoot && (
        <div style={{ position: "fixed", bottom: 78, left: "50%", transform: "translateX(-50%)", background: "var(--sunk)", border: `2px solid ${rarityById(lastLoot.rarity).color}`, borderRadius: 12, padding: "8px 14px", zIndex: 999, fontSize: 12, color: rarityById(lastLoot.rarity).color, fontWeight: 700 }}><EmojiIcon emoji={lastLoot.icon} /> {lastLoot.name}</div>
      )}
      {guildBid && (
        <LootBidModal items={guildBid.items} party={guildBid.party} char={char} commitChar={commitChar} showNotif={showNotif} onClose={() => { setGuildBid(null); setTab("guild"); }} />
      )}
      {/* Online GDKP is the same modal reading the room's auction instead of simulating one. */}
      {!guildBid && netBid && (netBid.lot || netBid.sold || netBid.done) && (
        <LootBidModal net={netBid} room={groupRun?.room} char={char} commitChar={commitChar} showNotif={showNotif}
                      onClose={() => { setNetBid(null); setTab("guild"); }} />
      )}
      {offlineReport && (
        <div onClick={() => setOfflineReport(null)} className="veil">
          <div onClick={(e) => e.stopPropagation()} className={`sheet ${offlineReport.died ? "is-warn" : "is-prize"}`}>
            <div className="sheet-mark">{offlineReport.died ? <EmojiIcon emoji="💀" size={22} /> : <EmojiIcon emoji="🌙" size={22} />}</div>
            <h3 className="sheet-title">{offlineReport.died ? "Defeated While Away" : "Welcome Back!"}</h3>
            <div style={{ color: "var(--ink-soft)", fontSize: 12, textAlign: "center", marginBottom: 14 }}>
              {Math.floor(offlineReport.secondsSimulated / 3600)}h {Math.floor((offlineReport.secondsSimulated % 3600) / 60)}m of auto-combat{offlineReport.zoneName ? ` in ${offlineReport.zoneName}` : ""}
            </div>
            {[["⚔️ Enemies defeated", offlineReport.kills.toLocaleString()], ["✨ XP gained", offlineReport.xpGained.toLocaleString()], ["💰 Gold gained", offlineReport.goldGained.toLocaleString()], ...(offlineReport.levelsGained > 0 ? [["🎉 Levels gained", `+${offlineReport.levelsGained}`]] : [])].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--verdigris)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-soft)" }}>{k}</span><span style={{ color: "var(--ink)", fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            {offlineReport.died && <div style={{ color: "var(--rubric)", fontSize: 11.5, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>Your hero fell in battle, so offline combat has been paused. Re-enable it from the World screen when ready.</div>}
            <button onClick={() => setOfflineReport(null)} className="go is-quiet">Continue</button>
          </div>
        </div>
      )}

      {tooltip && <ItemTooltip item={tooltip.item} actions={tooltip.actions} onClose={() => setTooltip(null)} onSocket={(it, i) => { setTooltip(null); if (socketsOf(it)[i]) setReforgeConfirm({ item: it, idx: i }); else setSocketPick({ item: it, idx: i }); }} />}

      {/* reforge — burn a bonded gem out of a socket for Ven (destroys the gem) */}
      {reforgeConfirm && (() => {
        const g = gemById(socketsOf(reforgeConfirm.item)[reforgeConfirm.idx]);
        const afford = (char.ven || 0) >= REFORGE_SOCKET_VEN;
        return (
          <div onClick={() => setReforgeConfirm(null)} className="veil">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-warn">
              <div className="sheet-mark"><EmojiIcon emoji="🔥" size={22} /></div>
              <div className="sheet-title">Reforge Socket?</div>
              <div style={{ color: "var(--ink)", fontSize: 12.5, lineHeight: 1.55, textAlign: "center", marginBottom: 14 }}>
                This burns <b className={g ? rarClass(g.rarity) : undefined}><EmojiIcon emoji={g?.icon} size={13} /> {g?.name || "the gem"}</b> out of <b>{reforgeConfirm.item.name}</b>, freeing the socket.
                <br /><span style={{ color: "var(--rubric)" }}>The gem is destroyed — it does not return to your bag.</span>
              </div>
              <div className="sheet-acts">
                <button onClick={() => setReforgeConfirm(null)} className="go is-quiet">Cancel</button>
                <button onClick={() => reforgeSocket(reforgeConfirm.item, reforgeConfirm.idx)} disabled={!afford} className="go"><Icon name="flame" size={14} /> Reforge · <Icon name="gem" size={12} /> {REFORGE_SOCKET_VEN}</button>
              </div>
              {!afford && <div className="sheet-note" style={{ marginTop: 7, marginBottom: 0, color: "var(--rubric)" }}>You hold <Icon name="gem" size={10} /> {(char.ven || 0).toLocaleString()}</div>}
            </div>
          </div>
        );
      })()}

      {/* gem picker — choose a gem for an empty socket */}
      {socketPick && (() => {
        const owned = Object.entries(char.gems || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ g: gemById(id), n })).filter((x) => x.g)
          .sort((a, b) => RARITIES.findIndex((r) => r.id === b.g.rarity) - RARITIES.findIndex((r) => r.id === a.g.rarity));
        return (
          <div onClick={() => setSocketPick(null)} className="veil">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-gain is-wide">
              <div className="sheet-title"><Icon name="gem" size={15} /> Socket a Gem</div>
              <div className="sheet-note">{socketPick.item.name} · socket {socketPick.idx + 1}</div>
              <div className="aside-note is-warn"><span><Icon name="warn" size={12} /> Bonding is permanent. A socket can only be cleared by reforging (💎 {REFORGE_SOCKET_VEN}), which destroys the gem.</span></div>
              {owned.length === 0 && <div className="empty">No gems yet — they drop from enemies alongside gear.</div>}
              <div>
                {owned.map(({ g, n }) => (
                  <button key={g.id} onClick={() => socketGem(socketPick.item, socketPick.idx, g.id)} className="choice">
                    <span className="choice-head">
                      <span className="mark"><EmojiIcon emoji={g.icon} size={18} /></span>
                      <span className={`choice-name ${rarClass(g.rarity)}`}>
                        {g.name} <small>×{n}</small>
                      </span>
                    </span>
                    <span className="choice-body">{g.desc}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setSocketPick(null)} className="go is-quiet">Cancel</button>
            </div>
          </div>
        );
      })()}

      {compareItem && (() => {
        const bag = compareItem;
        const offhandable = canOffhandWeapon(bag);
        const slot = (offhandable && compareSlot) ? compareSlot : bag.slotId;
        const equipped = char.equipment[slot] || null;
        const merged = (it) => { if (!it) return {}; const m = { ...it.stats }; if (it.enchant) for (const k in it.enchant) m[k] = (m[k] || 0) + it.enchant[k]; return m; };
        const em = merged(equipped), bm = merged(bag);
        const keys = ["str", "agi", "int", "sta", "armor", "leech", "resil", "vers", "cdr", "csd", "crit", "haste"];
        const wAvg = (it) => (it && it.wdmg ? (it.wdmg.min + it.wdmg.max) / 2 : 0);
        const wDelta = Math.round(wAvg(bag) - wAvg(equipped));
        const statLines = (it) => { const m = merged(it); return keys.filter((k) => (m[k] || 0) > 0).map((k) => `+${m[k]} ${STAT_LABEL[k]}`); };
        const scoreDelta = itemScore(bag, char.cls) - itemScore(equipped, char.cls);
        // Two panels side by side. They used to be bordered in each item's rarity,
        // which made the comparison read as "green thing versus purple thing"
        // rather than as two columns of the same numbers.
        const Panel = ({ item, title }) => (
          <div className="set" style={{ cursor: "default" }}>
            <div className="eyebrow">{title}</div>
            {item ? (
              <>
                <div className={`set-name ${rarClass(item.rarity)}`}><EmojiIcon emoji={item.icon} size={15} /> {item.name}</div>
                <div className="set-meta">{item.ilvl ? `ilvl ${item.ilvl} · ` : ""}{rarityById(item.rarity).name}</div>
                {item.wdmg && <div className="item-stats"><Icon name="sword" size={12} /> {item.wdmg.min}–{item.wdmg.max} Dmg</div>}
                {statLines(item).map((l, i) => <div key={i} className="item-stats">{l}</div>)}
              </>
            ) : <div className="empty" style={{ padding: "10px 0" }}>Empty slot</div>}
          </div>
        );
        return (
          <div onClick={() => setCompareItem(null)} className="veil">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-gain is-wide">
              <h3 className="sheet-title">Compare Gear</h3>
              {offhandable && (
                <div className="sets">
                  {[["weapon", "🗡️ vs Main-hand"], ["offhand", "🗡️ vs Off-hand"]].map(([s, label]) => (
                    <button key={s} onClick={() => setCompareSlot(s)} style={{ flex: 1, background: slot === s ? "var(--gilt)" : "var(--raised)", border: `1px solid ${slot === s ? "var(--gilt)" : "var(--hairline)"}`, borderRadius: 8, color: slot === s ? "var(--gilt)" : "var(--ink-soft)", fontSize: 11.5, fontWeight: 700, padding: "6px 4px", cursor: "pointer" }}>{label}</button>
                  ))}
                </div>
              )}
              <div className="sets" style={{ alignItems: "stretch" }}>
                <Panel item={equipped} title={offhandable ? (slot === "offhand" ? "Off-hand" : "Main-hand") : "Equipped"} />
                <Panel item={bag} title="In your bag" />
              </div>
              {/* deltas under the bag item */}
              <div style={{ marginTop: 10, background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "9px 12px" }}>
                <div style={{ color: "var(--ink-soft)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>If you equip the bag item{offhandable && slot === "offhand" ? " in your off-hand" : ""}</div>
                {(() => {
                  const rows = keys.map((k) => ({ k, d: (bm[k] || 0) - (em[k] || 0) })).filter((r) => r.d !== 0);
                  if (!rows.length && !wDelta) return <div style={{ color: "var(--ink-faint)", fontSize: 12 }}>No stat changes.</div>;
                  return <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px" }}>
                    {wDelta !== 0 && <span style={{ color: wDelta > 0 ? "var(--verdigris)" : "var(--rubric)", fontSize: 12.5, fontWeight: 600 }}>{wDelta > 0 ? "+" : ""}{wDelta} Weapon Dmg</span>}
                    {rows.map((r) => (
                    <span key={r.k} style={{ color: r.d > 0 ? "var(--verdigris)" : "var(--rubric)", fontSize: 12.5, fontWeight: 600 }}>{r.d > 0 ? "+" : ""}{r.d} {STAT_LABEL[r.k]}</span>
                  ))}</div>;
                })()}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--verdigris)", fontSize: 11.5, color: "var(--verdigris)" }}>Overall: <span style={{ color: scoreDelta > 0 ? "var(--verdigris)" : scoreDelta < 0 ? "var(--rubric)" : "var(--verdigris)", fontWeight: 700 }}>{scoreDelta > 0 ? "▲ Upgrade" : scoreDelta < 0 ? "▼ Downgrade" : "≈ Sidegrade"}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                {char.inventory.some((i) => i.id === bag.id) && <button onClick={() => { equipItem(bag, offhandable ? slot : undefined); setCompareItem(null); }} style={{ flex: 1, background: `var(--raised)`, border: `1.5px solid ${cls?.color || "var(--verdigris)"}`, borderRadius: 10, color: cls?.color || "var(--verdigris)", fontSize: 13, fontWeight: 700, padding: 10, cursor: "pointer" }}>{offhandable && slot === "offhand" ? "Equip off-hand" : "Equip this"}</button>}
                <button onClick={() => setCompareItem(null)} style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 10, color: "var(--ink-soft)", fontSize: 13, fontWeight: 700, padding: 10, cursor: "pointer" }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header — tap to jump to the combat screen */}
      <div onClick={() => setTab("combat")} title="Go to combat" className="shell-hdr" role="button" tabIndex={0}>
        <div className="shell-id">
          <span className="shell-avatar"><GameIcon icon={cls?.icon} imgKey={char.cls} size={26} /></span>
          <div className="shell-who">
            <div className="shell-name">
              <span>{char.name}</span>
              <span className="chip">Lv {char.level}</span>
              {char.level >= MAX_LEVEL && <span title="Honor Level" className="chip is-honour">Honour {char.honor || 0}{(char.attrPoints || 0) > 0 ? ` · +${char.attrPoints}` : ""}</span>}
            </div>
            <div className="shell-where">{race?.name} {cls?.name} · {battle && battle.mode === "hard" ? (() => { const inst = hardZoneById(battle.hardId) || hardDungeonById(battle.hardId) || HARD_RAID; return <span className="chip is-hard"><Icon name="flame" size={11} /> {inst.name}</span>; })() : battle && battle.mode === "dungeon" ? <span>{instanceById(battle.dungeonId)?.icon} {instanceById(battle.dungeonId)?.name}</span> : <><EmojiIcon emoji={zone.icon} /> {zone.name}</>}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(playerBuffs.length > 0 || playerDebuffs.length > 0) && (
              <div className="shell-wards">
                {playerBuffs.map((e, i) => (
                  <span key={"b" + i} title={`${e.kind === "haste" ? "+" + e.pct + "% haste" : e.kind === "dodge" ? e.pct + "% dodge" : e.kind === "empower" ? "+" + e.pct + "% damage" : e.kind === "ward" ? "−" + e.pct + "% damage taken" : e.kind === "hot" ? "heal " + e.healPerTick + "/s" : e.kind}`} className="ward">
                    <EmojiIcon emoji={e.icon} /><span style={{ color: "var(--verdigris)", fontFamily: "ui-monospace, monospace", fontSize: 9.5 }}>{Math.ceil((e.expires - now) / 1000)}s</span>
                  </span>
                ))}
                {playerDebuffs.map((e, i) => (
                  <span key={"d" + i} title={`${e.name} · ${e.kind === "pdot" ? e.dmgPerTick + "/s" : e.pct >= 100 ? "stun" : e.pct + "% slow"}`} className="ward">
                    <EmojiIcon emoji={e.icon} /><span style={{ color: "var(--rubric)", fontFamily: "ui-monospace, monospace", fontSize: 9.5 }}>{Math.ceil((e.expires - now) / 1000)}s</span>
                  </span>
                ))}
              </div>
            )}
            <div className="shell-purse">
              <span className="is-gold"><Icon name="coin" size={11} />{char.gold.toLocaleString()}</span>
              <span className="is-ven"><Icon name="gem" size={11} />{(char.ven || 0).toLocaleString()}</span>
              <span className="is-kills"><Icon name="skull" size={11} />{(char.kills || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <Bar current={battle ? battle.hp : Math.min(char.hp ?? maxHP, maxHP)} max={maxHP} color="var(--rubric)" height={6} label={`❤️ ${battle ? battle.hp : Math.min(char.hp ?? maxHP, maxHP)}/${maxHP} HP`} />
          {battle && (() => { // class resource — the engine of your class fantasy
            const R = classResource(char.cls); const v = battle.res || 0;
            // surface the expiry clock so the payoff window is visible, not guesswork
            const oldest = (battle.resQ || []).reduce((m, u) => Math.min(m, u.exp), Infinity);
            const left = v > 0 && isFinite(oldest) ? Math.max(0, (oldest - Date.now()) / 1000) : 0;
            const urgent = left > 0 && left <= 4;
            return (
              <div style={{ marginTop: 4 }}>
                <Bar current={v} max={R.max} color={urgent ? "#ff6a33" : R.color} height={5}
                  label={`${R.icon} ${Math.floor(v)}${R.max <= 5 ? "/" + R.max : ""} ${R.name}${left > 0 ? ` · ${left.toFixed(0)}s` : ""}`} />
              </div>
            );
          })()}
          <div style={{ marginTop: 4 }}>
            {char.level >= MAX_LEVEL
              ? <Bar current={char.honorXp || 0} max={honorXpForLevel(char.honor || 0)} color="#ff8000" height={5} label={`⭐ Honor ${char.honor || 0}`} sub={`${char.honorXp || 0}/${honorXpForLevel(char.honor || 0)}`} />
              : <Bar current={char.xp} max={xpForLevel(char.level)} color="#f0b429" height={5} label={`✨ XP`} sub={`${char.xp}/${xpForLevel(char.level)}`} />}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: tab === "town" ? "4px" : 14 }}>

        {/* ============ TOWN HUB ============ */}
        {/* Tutorial quest banner — follows the player across every screen while active */}
        {(() => {
          const step = activeLesson(char);
          if (!step) return null;
          const doneN = lessonsComplete(char);
          const xp = step.forLevel != null ? (step.forLevel ? xpForLevel(step.forLevel) : 0)
                                           : Math.floor(xpForLevel(lessonLevel(step)) * 0.2);
          return (
            <div className="lesson">
              <div className="lesson-head">
                <span className="lesson-title"><Icon name="scroll" size={14} /> Lesson {doneN + 1}: {step.title}</span>
                <span className="lesson-count">{doneN}/{LESSONS.length} · Lv {lessonLevel(step)}</span>
              </div>
              <div className="lesson-body">{withIcons(step.body, 13)}</div>
              <div className="lesson-rail"><i style={{ width: `${Math.round((doneN / LESSONS.length) * 100)}%` }} /></div>
              <div className="lesson-next">
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--gilt)", animation: "tutflash-sm 1.1s ease-in-out infinite" }} />
                {tab === "town" ? "Follow the glowing signpost" : "Return to Town to find the glowing signpost"} · reward: {step.reward?.heal ? `${step.reward.heal} Healing Potion I` : `${xp.toLocaleString()} XP`}
              </div>
            </div>
          );
        })()}

        {/* The town map, with its floating icons anchored TO THE MAP.
            They used to be absolute with no positioned ancestor, so they resolved against the
            viewport and landed on top of the header — which is not a fixed height: the honor bar
            replaces the XP bar at 60, and the lesson banner appears and disappears above. Anchoring
            to this wrapper means the corner of the map is the corner of the map whatever is above. */}
        {tab === "town" && (
          <div style={{ position: "relative" }}>
            <TownHub onEnter={enterBuilding} highlight={tutorialHighlight(char)} charLevel={char.level || 1} />

            {/* Top-left cluster: sign-in, then anything else that wants the player's eye.
                The battle pass sits to the RIGHT of the sign-in, so the first row reads
                [daily][pass] and the offer hangs below the daily. */}
            <div className="hails">
              <div className="hails-row">
              {/* Marked due while today is unclaimed — that mark is the only thing that
                  tells a returning player there is something waiting. */}
              {(() => {
                const today = utcDayString();
                const claimed = (char.daily?.lastDay || null) === today;
                const streak = char.daily?.streak || 0;
                return (
                  <button onClick={() => { setDailyResult(null); setDailyOpen(true); }} aria-label="Daily sign-in"
                    className={`hail${claimed ? "" : " is-due"}`}>
                    <Icon name="scroll" size={18} />
                    <span className="hail-label">{streak > 0 ? `${streak}d` : "Daily"}</span>
                    {!claimed && <span className="hail-tally">!</span>}
                  </button>
                );
              })()}

              {/* Battle pass, to the right of the sign-in. The tally counts rewards WAITING,
                  not ranks earned — an unclaimed count is the only number worth interrupting for. */}
              {(() => {
                const rank = passRank(char), waiting = passUnclaimed(char);
                const pct = rank >= PASS.ranks ? 100 : Math.round(passKillsInto(char) / PASS.killsPerRank * 100);
                return (
                  <button onClick={() => setPassOpen(true)} aria-label="Battle pass"
                    className={`hail${waiting ? " is-due" : ""}`}>
                    <Icon name="trophy" size={18} />
                    <span className="hail-label">R{rank}</span>
                    <span className="hail-rail"><i style={{ width: `${pct}%` }} /></span>
                    {waiting > 0 && <span className="hail-tally">{waiting}</span>}
                  </button>
                );
              })()}
              </div>

              {/* The level-10 offer, under the sign-in. Rendering it is what starts its 24 hours. */}
              {offerState(char, now) === "live" && (() => {
                if (!(char.offer || {}).seenAt) markOfferSeen();
                const left = offerMsLeft(char, now);
                const hrs = Math.floor(left / 3600000), mins = Math.floor((left % 3600000) / 60000);
                return (
                  <button onClick={() => setOfferOpen(true)} aria-label="Limited offer" className="hail is-due">
                    <Icon name="sword" size={18} />
                    <span className="hail-label">${OFFER.usd}</span>
                    <span className="hail-label">{hrs}h {mins}m</span>
                  </button>
                );
              })()}
            </div>
          </div>
        )}
        {offerOpen && (() => {
          const left = offerMsLeft(char, now);
          const hrs = Math.floor(left / 3600000), mins = Math.floor((left % 3600000) / 60000);
          const expired = offerState(char, now) === "expired";
          return (
            <div onClick={() => setOfferOpen(false)} className="veil">
              <div onClick={(e) => e.stopPropagation()} className="sheet is-warn">
                <div className="sheet-mark"><Icon name="sword" size={22} /></div>
                <div className="sheet-title">{OFFER.name}</div>
                <div className="sheet-note">
                  {expired ? "Available in the Ven shop's Offers tab" : `Ends in ${hrs}h ${mins}m`}
                </div>
                <div style={{ background: "var(--raised)", border: "1px solid var(--rubric)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ color: "var(--ink)", fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}><Icon name="sword" /> Artifact Weapon</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.45 }}>Deep-red relic. Three sockets, and it re-forges as you level so it never falls behind.</div>
                </div>
                <div style={{ color: "var(--rubric)", fontSize: 11, fontWeight: 700, marginBottom: 5 }}>…and choose one more:</div>
                {OFFER.choices.map((ch) => (
                  <button key={ch.id} onClick={() => setOfferPick(ch.id)}
                    style={{ width: "100%", textAlign: "left", marginBottom: 6, cursor: "pointer",
                      background: offerPick === ch.id ? "var(--rar-epic)" : "var(--rar-epic)",
                      border: `1.5px solid ${offerPick === ch.id ? "var(--rubric)" : "var(--rar-epic)"}`, borderRadius: 10, padding: "9px 11px" }}>
                    <div style={{ color: offerPick === ch.id ? "var(--rubric)" : "var(--ink-soft)", fontSize: 12.5, fontWeight: 700 }}>
                      {offerPick === ch.id ? "◉" : "○"} <EmojiIcon emoji={ch.icon} /> {ch.name}
                    </div>
                    <div style={{ color: "var(--ink-soft)", fontSize: 10.5, lineHeight: 1.4, marginLeft: 16 }}>{ch.desc}</div>
                  </button>
                ))}
                <button onClick={buyOffer} className="go">${OFFER.usd} — Claim the bundle</button>
                <button onClick={() => setOfferOpen(false)} className="go is-quiet">Maybe later</button>
              </div>
            </div>
          );
        })()}

        {/* THE BATTLE PASS. Two vertical tracks with the progress rail running between them:
            free on the left, Champion on the right, and the rank nodes on the rail itself. The
            rail is the thing that makes the layout readable — it is one continuous line the eye
            follows down, and a row's position on it says whether it is earned, next, or far off. */}
        {passOpen && (() => {
          const rank = passRank(char), owned = passOwnsPaid(char), waiting = passUnclaimed(char);
          const kills = passKills(char), into = passKillsInto(char);
          const done = rank >= PASS.ranks;
          const cell = (r, paid) => {
            const rw = passReward(r, paid);
            const earned = rank >= r, claimed = passClaimed(char, r, paid);
            const canClaim = passCanClaim(char, r, paid);
            const locked = paid && !owned;
            const cls = ["pass-cell", canClaim && "is-ready", claimed && "is-claimed",
                         locked && "is-shut", earned && !claimed && "is-earned"].filter(Boolean).join(" ");
            return (
              <button onClick={() => canClaim && claimPassRank(r, paid)} disabled={!canClaim} className={cls}
                aria-label={`Rank ${r} ${paid ? "Champion" : "Free"}${canClaim ? " — claim" : ""}`}>
                {passRewardLines(r, paid).map((l, i) => <b key={i}>{withIcons(l, 12)}</b>)}
                <span className="pass-state">
                  {claimed ? "claimed" : canClaim ? "tap to claim" : locked ? "champion only" : earned ? "—" : "locked"}
                </span>
              </button>
            );
          };
          return (
            <div onClick={() => setPassOpen(false)} className="veil">
              <div onClick={(e) => e.stopPropagation()} className="sheet is-gain is-wide"
                   style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>

                {/* Header: what the pass is, and where the player is on it. */}
                <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--rule)" }}>
                  <div className="head" style={{ marginBottom: 6, paddingBottom: 6 }}>
                    <span className="head-title" style={{ textAlign: "left" }}><Icon name="trophy" size={15} /> Champion's Pass</span>
                    <button onClick={() => setPassOpen(false)} className="head-back">Close</button>
                  </div>
                  <div className="meter-row">
                    <span>Rank {rank} of {PASS.ranks} · {kills.toLocaleString()} kills</span>
                    {!done && <span>{(PASS.killsPerRank - into).toLocaleString()} to rank {rank + 1}</span>}
                  </div>
                  <div className="meter">
                    <i style={{ width: `${Math.round((rank + (done ? 0 : into / PASS.killsPerRank)) / PASS.ranks * 100)}%` }} />
                  </div>
                  {!owned && (
                    <button onClick={buyPass} className="go">
                      Unlock Champion · <Icon name="gem" size={12} /> {PASS.venCost} Ven
                      {rank > 0 && <span className="sheet-note" style={{ marginBottom: 0, marginTop: 3 }}>
                        {rank} rank{rank > 1 ? "s" : ""} already earned — claimable immediately
                      </span>}
                    </button>
                  )}
                  {waiting > 0 && (
                    <button onClick={claimPassAll} className="go is-quiet is-on">Claim all {waiting} waiting</button>
                  )}
                </div>

                {/* Column headings, aligned to the two tracks and the rail between them. */}
                <div className="pass-row" style={{ padding: "8px 14px 4px" }}>
                  <span className="eyebrow" style={{ flex: 1, marginBottom: 0 }}>Free</span>
                  <span style={{ width: 30 }} />
                  <span className="eyebrow" style={{ flex: 1, marginBottom: 0, justifyContent: "flex-end" }}>
                    Champion {owned ? "" : <Icon name="lock" size={10} />}
                  </span>
                </div>

                {/* The track. */}
                <div style={{ overflowY: "auto", padding: "0 14px 14px" }}>
                  {Array.from({ length: PASS.ranks }, (_, i) => i + 1).map((r) => {
                    const earned = rank >= r, isNext = !earned && rank + 1 === r;
                    return (
                      <div key={r} className="pass-row">
                        {cell(r, false)}
                        {/* The rail: a continuous line with this rank's node on it. */}
                        <div className={`pass-rail${earned ? " is-earned" : ""}`}>
                          {/* The final rank is the only one that is worth marking out. */}
                          <div className={["pass-node", earned && "is-earned", isNext && "is-next",
                                           r === PASS.ranks && "is-crown"].filter(Boolean).join(" ")}>
                            {r === PASS.ranks ? <Icon name="crown" size={13} /> : r}
                          </div>
                        </div>
                        {cell(r, true)}
                      </div>
                    );
                  })}
                  <div className="ledger-note" style={{ marginTop: 10, textAlign: "center" }}>
                    {PASS.killsPerRank} kills per rank · {(PASS.killsPerRank * PASS.ranks).toLocaleString()} for the crown,
                    about what a run from 1 to 60 takes.
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {dailyOpen && (() => {
          const today = utcDayString();
          const claimedToday = (char.daily?.lastDay || null) === today;
          const hist = {}; for (const h of (char.daily?.history || [])) hist[h.day] = h;
          // The current UTC month, Monday-first, so weekends sit together at the end of a row.
          const now = new Date(today + "T00:00:00Z");
          const y = now.getUTCFullYear(), m = now.getUTCMonth();
          const first = new Date(Date.UTC(y, m, 1));
          const lead = (first.getUTCDay() + 6) % 7;                 // Monday = 0
          const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const streak = char.daily?.streak || 0;
          const nextBonus = DAILY.bonusEvery - ((streak) % DAILY.bonusEvery);
          return (
            <div onClick={() => setDailyOpen(false)} className="veil">
              <div onClick={(e) => e.stopPropagation()} className="sheet is-gain">
                <div className="sheet-mark"><Icon name="scroll" size={22} /></div>
                <div className="sheet-title">Daily Sign-In</div>
                <div className="sheet-lede">
                  {streak > 0 ? `${streak} day${streak === 1 ? "" : "s"} running · ${nextBonus} more to the next bonus`
                              : "Sign in to start a streak"}
                </div>

                <div className="cal" style={{ marginBottom: 4 }}>
                  {["M","T","W","T","F","S","S"].map((d, i) => (
                    <div key={i} className={`cal-head${i >= 5 ? " is-wknd" : ""}`}>{d}</div>
                  ))}
                </div>
                <div className="cal" style={{ marginBottom: 12 }}>
                  {Array.from({ length: lead }).map((_, i) => <div key={"p" + i} />)}
                  {Array.from({ length: days }, (_, i) => {
                    const dayStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                    const isToday = dayStr === today, past = dayStr < today;
                    const got = hist[dayStr], wknd = utcIsWeekend(dayStr);
                    const cls = ["cal-day", wknd && "is-wknd", past && !got && "is-past", got && "is-got", isToday && "is-today"]
                      .filter(Boolean).join(" ");
                    return (
                      <div key={dayStr} className={cls}
                        title={got ? `claimed · day ${got.streak}` : past ? "missed" : wknd ? "weekend" : ""}>
                        {i + 1}
                        <i>{got ? "\u2713" : past ? "\u00b7" : wknd ? "\u2605" : ""}</i>
                      </div>
                    );
                  })}
                </div>

                {dailyResult ? (
                  <div className="aside-note is-gain">
                    <b>Day {dailyResult.streak} claimed</b>
                    {dailyResult.lines.map((l, i) => <span key={i} style={{ display: "block" }}>· {l}</span>)}
                    {dailyResult.items.map((it) => (
                      <span key={it.id} className={rarClass(it.rarity)} style={{ display: "block", marginTop: 2 }}>
                        <Icon name="spark" size={12} /> {it.name} (ilvl {it.ilvl})
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="ledger">
                    {/* The value column is mono and never wraps, so anything longer
                        than a quantity belongs under the row, not in it. */}
                    {[["Weekdays", `${DAILY.weekdayVen} Ven`, null],
                      ["Weekends", `${DAILY.weekendVen} Ven`, `and an ${DAILY.weekendRarity} at your item level`],
                      [`Every ${DAILY.bonusEvery}th day running`, `+${DAILY.bonusVen} Ven`, null],
                      [`Day ${DAILY.milestoneDay}`, `${DAILY.milestoneVen} Ven`, `and a ${DAILY.milestoneRarity}`]].map(([k, v, note]) => (
                      <div key={k} className="ledger-row">
                        <div className="ledger-line">
                          <span className="ledger-label">{k}</span>
                          <span className="ledger-val">{v}</span>
                        </div>
                        {note && <div className="ledger-note">{note}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="ledger-note" style={{ textAlign: "center" }}>Miss a day and the streak drops by one, not to zero.</div>

                <button onClick={claimedToday ? () => setDailyOpen(false) : claimDaily} disabled={dailyBusy}
                  className={`go${claimedToday ? " is-quiet" : ""}`}>
                  {dailyBusy ? "Signing in\u2026" : claimedToday ? "Close" : "Sign in for today"}
                </button>
                <div className="sheet-note" style={{ marginTop: 6, marginBottom: 0 }}>
                  Days reset at midnight UTC · a connection is required to claim
                </div>
              </div>
            </div>
          );
        })()}

        {tab === "town" && (
          <>
            <button onClick={() => setTownChatOpen((v) => !v)} aria-label="Global chat" className="foot-btn" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 74, zIndex: 330 }}><Icon name="tavern" size={14} /> Chat{chatState.chatLive ? " ●" : ""}</button>
            {townChatOpen && (
              <div onClick={() => setTownChatOpen(false)} className="veil is-foot">
                <div onClick={(e) => e.stopPropagation()} className="sheet is-wide" style={{ padding: "12px 14px" }}>
                  <ChatPanel chatState={chatState} myName={char.name} height={300} transparent />
                  <button onClick={() => setTownChatOpen(false)} className="go is-quiet">Close</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============ COMBAT TAB ============ */}
        {tab === "combat" && (
          <div>
          <div className={`cpage chronicle-ground ${themeClass(chronicleTheme)}`}>
            {/* ---- the adversary ---- */}
            {battle ? (
              <>
                <div className="foe">
                  <span className="foe-cut">
                    <GameIcon icon={battle.enemy.icon} imgKey={battle.enemy.iconKey} size={46} />
                  </span>
                  <div className="foe-body">
                    <h3 className="foe-name">
                      {battle.mode === "hard" && <span className="foe-rank is-hard">Hard</span>}
                      {battle.enemy.isLord && <span className="foe-rank is-lord">Lord</span>}
                      {battle.enemy.isChampion && !battle.enemy.isLord && !battle.enemy.isBoss && <span className="foe-rank is-champion">Champion</span>}
                      {battle.enemy.name}
                    </h3>
                    <p className="foe-where">
                      Lv {battle.enemy.level}
                      {battle.mode === "hard" ? ` · ${(hardZoneById(battle.hardId) || hardDungeonById(battle.hardId) || HARD_RAID).name}`
                        : battle.mode === "dungeon" ? ` · ${instanceById(battle.dungeonId)?.name} · wave ${battle.wave}`
                        : ` · ${zone.name}`}
                    </p>
                    <div className="foe-wounds"><i style={{ width: `${clamp((battle.enemy.hp / battle.enemy.maxHp) * 100, 0, 100)}%` }} /></div>
                    <p className="foe-tally">{battle.enemy.hp} / {battle.enemy.maxHp}</p>
                  </div>
                </div>
                {/* what is riding on the fight — yours and its */}
                {((battle.enemyEffects || []).length > 0 || activeBuffList.length > 0) && (
                  <div className="wards">
                    {activeBuffList.map((b) => {
                      const meta = BUFF_META[b.stat];
                      return (
                        <span key={`b${b.stat}`} className="ward">
                          {meta ? <EmojiIcon emoji={meta.icon} size={12} /> : <Icon name="scroll" size={12} />}
                          {meta ? meta.label(b.amount) : `+${b.amount} ${STAT_LABEL[b.stat]}`} · {fmtClock(b.expires - now)}
                        </span>
                      );
                    })}
                    {(battle.enemyEffects || []).map((e, i) => (
                      <span key={`e${i}`} className="ward" title={e.name}>
                        <EmojiIcon emoji={e.icon} size={12} />{e.name} · {Math.ceil((e.expires - now) / 1000)}s
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (() => {
              const reHardInst = difficulty === "hard" && lastHard ? (lastHard.kind === "zone" ? hardZoneById(lastHard.id) : lastHard.kind === "raid" ? HARD_RAID : hardDungeonById(lastHard.id)) : null;
              const reDn = !reHardInst && lastDungeonId && instanceRunnable(char, lastDungeonId) ? instanceById(lastDungeonId) : null;
              const where = reHardInst || reDn;
              return (
                <div className="cempty">
                  <h3>{where ? where.name : zone.name}</h3>
                  <p style={{ margin: 0 }}>
                    {reHardInst ? "Hard Mode — the page is open again."
                      : reDn ? (reDn.raid ? "Cleared. Enter again." : `Cleared. ${dungeonRunsLeft(char, reDn.id)} run${dungeonRunsLeft(char, reDn.id) === 1 ? "" : "s"} left today.`)
                      : "Nothing written yet."}
                  </p>
                </div>
              );
            })()}

            {/* ---- THE CHRONICLE ---- */}
            {combatSide === "log"
              ? <Chronicle log={combatLog} height={188} />
              : <div style={{ padding: "0 13px" }}><ChatPanel chatState={chatState} myName={char.name} height={172} /></div>}

            {/* ---- the hand ---- */}
            <div className="seals">
              {knownSkills.map((sk) => {
                const cdEnd = battle?.cooldowns?.[sk.name] || 0;
                const nowMs = Date.now();
                const onCd = cdEnd > nowMs;
                const effCd = Math.max(1, Math.round(sk.cd * (1 - cdrFracFor(char)) - gemFlatCd(char)));
                const remain = onCd ? Math.min(effCd, Math.max(1, Math.ceil((cdEnd - nowMs) / 1000))) : 0;
                const auto = gambitFiresSkill(char, sk.name);
                return (
                  <div key={sk.name} className={`seal-slot${onCd ? " is-sealed" : ""}${auto ? " is-auto" : ""}`}>
                    <button className={`seal${onCd ? " is-sealed" : ""}`} onClick={() => useSkill(sk)}
                      disabled={!battle || onCd} title={auto ? `${sk.desc} — cast by a gambit` : sk.desc}
                      style={!battle ? { opacity: .55 } : undefined}>
                      {onCd ? <span className="seal-wait">{remain}</span> : <EmojiIcon emoji={sk.icon} size={19} />}
                    </button>
                    <span className="seal-name">{sk.name}</span>
                  </div>
                );
              })}
              {(() => {
                const def = consumableById("heal");
                const qty = conTotal(char, "heal");
                const onCd = potionCdLeft > 0;
                const disabled = !battle || qty <= 0 || onCd;
                return (
                  <div className="seal-slot">
                    <button className="seal seal-draught" onClick={() => useConsumable(def)} disabled={disabled}
                      title={onCd ? `Ready in ${fmtClock(potionCdLeft)}` : `Healing draught (${qty} left)`}
                      style={disabled ? { opacity: .55 } : undefined}>
                      <Icon name="flask" size={18} />
                      {qty > 0 && !onCd && <span className="seal-count">{qty}</span>}
                    </button>
                    <span className="seal-name">{onCd ? fmtClock(potionCdLeft) : "Draught"}</span>
                  </div>
                );
              })()}
            </div>

            {/* ---- leave / enter, and which way round the light is ---- */}
            <div style={{ display: "flex", gap: 6, padding: "0 13px 13px", background: "var(--sunk)" }}>
              {(() => {
                const reHardInst = !battle && difficulty === "hard" && lastHard ? (lastHard.kind === "zone" ? hardZoneById(lastHard.id) : lastHard.kind === "raid" ? HARD_RAID : hardDungeonById(lastHard.id)) : null;
                const reDn = !battle && !reHardInst && lastDungeonId && instanceRunnable(char, lastDungeonId) ? instanceById(lastDungeonId) : null;
                const onClick = battle ? stopCombat : reHardInst ? () => startHard(reHardInst, lastHard.kind) : reDn ? reEnterInstance : startZone;
                const label = battle ? (battle.mode === "dungeon" ? "Leave the dungeon" : "Close the page")
                  : reHardInst ? `Enter ${reHardInst.name}` : reDn ? `Enter ${reDn.name}` : "Take up the quill";
                return <button className={`leave${battle ? "" : " is-enter"}`} onClick={onClick}>{label}</button>;
              })()}
              <button className="leave" style={{ width: "auto", flex: "none", padding: "11px 13px" }}
                title={`Reading by ${themeClass(chronicleTheme) === "theme-night" ? "candlelight" : "daylight"} — tap to change`}
                onClick={() => {
                  const next = themeClass(chronicleTheme) === "theme-night" ? "day" : "night";
                  setChronicleTheme(next); saveTheme(next);
                }}>
                <Icon name={themeClass(chronicleTheme) === "theme-night" ? "shrine" : "abyss"} size={15} />
              </button>
              <button className="leave" style={{ width: "auto", flex: "none", padding: "11px 13px" }}
                title={combatSide === "log" ? "Show chat" : "Show the chronicle"}
                onClick={() => setCombatSide(combatSide === "log" ? "chat" : "log")}>
                <Icon name={combatSide === "log" ? "tavern" : "scroll"} size={15} />
              </button>
            </div>
          </div>

            {(() => {
              if (groupParty) { // group content → party health instead of the quest tracker
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ color: "var(--ink-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}><Icon name="heart" /> Party</span>
                      <span style={{ color: groupReses > 0 ? "var(--verdigris)" : "var(--ink-faint)", fontSize: 10, fontWeight: 700 }}>✚ {groupReses} battle-res{groupReses === 1 ? "" : "es"}</span>
                    </div>
                    {groupParty.map((m) => {
                      const hp = m.me ? Math.round(100 * (battle ? battle.hp / maxHpFor(char) : 0)) : m.hp;
                      const down = hp <= 0;
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--sunk)", border: `1px solid ${m.me ? "var(--verdigris)" : "var(--hairline)"}`, borderRadius: 8, padding: "6px 9px", marginBottom: 5, opacity: down ? 0.5 : 1 }}>
                          <span style={{ fontSize: 14 }}>{m.icon || "🧑"}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ color: m.me ? "var(--verdigris)" : "var(--verdigris)", fontSize: 11, fontWeight: 700 }}>{m.name}{m.me ? " (you)" : ""}{m.specName ? ` · ${m.specName}` : ""}</span><span style={{ color: down ? "var(--rubric)" : "var(--ink-soft)", fontSize: 9.5, fontWeight: 700 }}>{down ? "DOWN" : hp + "%"}</span></div>
                            <Bar current={down ? 0 : hp} max={100} color={down ? "#e07a7a" : (hp < 35 ? "#e0a955" : "#2ecc71")} height={5} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              const tut = char.tutorial;
              const tstep = tut && !tut.done ? TUTORIAL_STEPS[Math.min(tut.step || 0, TUTORIAL_STEPS.length - 1)] : null;
              const combatTut = tstep && COMBAT_TUTORIAL_IDS.includes(tstep.id) ? tstep : null;
              const board = char.quests?.board || [];
              if (!combatTut && board.length === 0) return null;
              const row = (key, title, prog, count, color) => (
                <div key={key} style={{ background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 600 }}>{title}</span>
                    <span style={{ color: prog >= count ? "var(--verdigris)" : "var(--ink-soft)", fontSize: 10 }}>{prog}/{count}</span>
                  </div>
                  <Bar current={prog} max={count} color={prog >= count ? "#5fd35f" : color} height={5} />
                </div>
              );
              return (
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 6, color: "var(--ink-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}><Icon name="sword" /> Active Quests</div>
                  {combatTut && (() => { const count = combatTut.id === "hunt" ? 5 : 1; return row("tut", `📜 ${combatTut.title}`, Math.min(count, char.kills || 0), count, "#f0b429"); })()}
                  {board.map((q) => row(q.id, `${q.kind === "kill" ? "⚔️" : "🎒"} ${questLabel(q)}`, questProgress(char, q), q.count, q.kind === "kill" ? "#e0556a" : "#8fd0e0"))}
                  <div style={{ color: "var(--ink-faint)", fontSize: 9.5, textAlign: "center", marginTop: 2 }}>Progress tracked here · turn quests in at the Tavern Quest Board.</div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ============ GEAR TAB (equipped) ============ */}
        {tab === "gear" && (
          <div>
            <button onClick={() => setTab("gambits")} className="gateway">
              <span className="mark"><Icon name="target" size={18} /></span>
              <span className="gateway-body"><b>Standing orders</b><span>The rules your character fights by when you are not watching</span></span>
              <span className="gateway-more">&rsaquo;</span>
            </button>
            {/* TWO GEAR SETS. The tab is a switch, not a view: tapping the inactive one swaps the
                gear. Each tab shows what is actually in that set — piece count, average item level
                and any Battlemaster pieces — because "Set 2" on its own tells a player nothing
                about which is their arena kit. */}
            {(() => {
              const active = loadoutActive(char);
              const sets = [
                { i: 0, eq: active === 0 ? char.equipment : loadoutStash(char) },
                { i: 1, eq: active === 1 ? char.equipment : loadoutStash(char) },
              ];
              return (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {sets.map(({ i, eq }) => {
                    const on = active === i, s = loadoutSummary(eq);
                    return (
                      <button key={i} onClick={() => { if (!on) swapLoadout(); }} disabled={on}
                        aria-label={`Gear set ${i + 1}${on ? " (active)" : " — switch"}`}
                        className={`set${on ? " is-worn" : ""}`}>
                        <div className="set-name">
                          Set {i + 1}
                          {on && <span className="chip is-hard">Worn</span>}
                        </div>
                        <div className="set-meta">
                          {s.count ? `${s.count} piece${s.count === 1 ? "" : "s"} · ilvl ${s.ilvl}` : "empty"}
                          {s.pvp ? ` · ${s.pvp} arena` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="eyebrow">
              <span>What you are wearing</span>
              {/* The last native control in the game. A browser checkbox paints
                  itself the operating system's accent blue, which is the one
                  colour on the page nothing else can reach. */}
              <button onClick={() => commitChar({ ...charRef.current, autoEquip: !char.autoEquip })}
                aria-pressed={!!char.autoEquip} className={`toggle${char.autoEquip ? " is-on" : ""}`}>auto-equip</button>
            </div>
            {(() => {
              const slotSquare = (slotId, big) => {
                const it = char.equipment[slotId]; const r = it ? rarityById(it.rarity) : null; const slot = slotById(slotId);
                return (
                  <button key={slotId} title={it ? it.name : slot.name} disabled={!it}
                    onClick={() => { if (it) showItem(it, [{ label: "Take off", onClick: () => unequip(slotId) }]); }}
                    className={`slot${big ? " slot-wide" : ""}${it ? "" : " is-empty"}`}>
                    {it ? <GameIcon icon={it.icon} imgKey={it.iconKey} size={big ? 30 : 32} /> : <EmojiIcon emoji={slot.icon} size={18} />}
                    {it && !big && it.ilvl && <span className="slot-ilvl">{it.ilvl}</span>}
                    {big && (it
                      ? <span className="item-body">
                          <span className={`item-name ${rarClass(r)}`}>{it.enchant ? <Icon name="spark" size={11} /> : null}{it.name}</span>
                          <span className="item-meta">ilvl {it.ilvl}{it.wdmg ? ` · ${it.wdmg.min}\u2013${it.wdmg.max} damage` : ""}</span>
                        </span>
                      : <span className="item-meta">No weapon in hand</span>)}
                  </button>
                );
              };
              return (
                <>
                  <div className="slots">
                    <div className="slot-col">{["head", "shoulder", "chest", "hands", "legs"].map((s) => slotSquare(s))}</div>
                    <div className="figure">
                      <GameIcon icon={cls?.icon} imgKey={char.cls} size={40} />
                      <div className="figure-cls">{race?.name} {cls?.name}</div>
                      <div className="figure-note">portrait to come</div>
                    </div>
                    <div className="slot-col">{["feet", "offhand", "ring", "trinket", "relic"].map((s) => slotSquare(s))}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>{slotSquare("weapon", true)}</div>
                </>
              );
            })()}
            <div className="statline">
              <span><Icon name="sword" size={11} />Str <b>{eff.str}</b></span>
              <span><Icon name="haste" size={11} />Agi <b>{eff.agi}</b></span>
              <span><Icon name="spark" size={11} />Int <b>{eff.int}</b></span>
              <span><Icon name="heart" size={11} />Sta <b>{eff.sta}</b></span>
              <span><Icon name="shield" size={11} />Armour <b>{eff.armor}</b></span>
              <span>ilvl <b>{avgEquippedIlvl(char)}</b></span>
              <span>Weapon <b>{char.equipment?.weapon?.wdmg ? `${char.equipment.weapon.wdmg.min}\u2013${char.equipment.weapon.wdmg.max}` : "\u2014"}</b></span>
            </div>
            <div className="empty" style={{ padding: "10px 0 0" }}>Tap any slot to read the piece</div>
          </div>
        )}

        {/* ============ BAG TAB ============ */}
        {tab === "bag" && (
          <div>
            <div className="leaves">
              {[["equipment", "Equipment", "shield"], ["items", "Items", "flask"], ["gems", "Gems", "gem"],
                ["crafting", "Crafting", "anvil"], ["quest", "Quest", "scroll"]].map(([id, label, icon]) => (
                <button key={id} onClick={() => setBagTab(id)}
                  className={`leaf${bagTab === id ? " is-open" : ""}`}
                  aria-current={bagTab === id ? "page" : undefined}>
                  <Icon name={icon} size={13} />{label}
                </button>
              ))}
            </div>

            {bagTab === "equipment" && (
              <>
                {/* Capacity, stated plainly. The bank silently deleted the oldest item at 120 with
                    no indication it was even near the limit. */}
                <div style={{ marginBottom: 12 }}>
                  <div className={`meter-row${bankIsFull(char) ? " is-full" : ""}`}>
                    <span>{char.inventory.length} of {bankCap(char)} kept{bankIsFull(char) ? " \u2014 full, new gear is sold" : ""}</span>
                    <span>+{BANK_SLOTS_PER_BUY} for 100 Ven</span>
                  </div>
                  <div className={`meter${bankIsFull(char) ? " is-full" : ""}`}>
                    <i style={{ width: `${clamp((char.inventory.length / bankCap(char)) * 100, 0, 100)}%` }} />
                  </div>
                </div>
                {(char.overflow || []).length > 0 && (
                  <div className="aside-note is-gain">
                    <b><Icon name="mail" size={13} /> {(char.overflow || []).length} held in the mail</b>
                    <span>Too valuable to sell. They come back the moment you free a slot.</span>
                  </div>
                )}
                {char.inventory.length === 0 && <div className="empty">Nothing kept. What you find will be written here.</div>}
                <div>
                  {[...char.inventory].sort((a, b) => b.ilvl - a.ilvl || itemScore(b, char.cls) - itemScore(a, char.cls)).map((it) => (
                    <ItemCard key={it.id} item={it} cls={char.cls} compare={itemScore(char.equipment[it.slotId], char.cls)}
                      onClick={() => showItem(it, [
                        { label: "Equip", onClick: () => equipItem(it) },
                        { label: "Compare", keepOpen: false, onClick: () => setCompareItem(it) },
                        { label: it.locked ? "🔓 Unlock" : "🔒 Lock", color: "#8fd0e0", onClick: () => toggleLock(it) },
                        ...(it.locked ? [] : [{ label: "Sell", tone: "warn", onClick: () => sellItem(it) }]),
                      ])}>
                      <MiniBtn onClick={() => equipItem(it)} tone="gain">Wear</MiniBtn>
                      {canOffhandWeapon(it) && <MiniBtn onClick={() => equipItem(it, "offhand")}>Off-hand</MiniBtn>}
                      <MiniBtn onClick={() => setCompareItem(it)}>Compare</MiniBtn>
                      <MiniBtn onClick={() => toggleLock(it)}><Icon name={it.locked ? "lock" : "unlock"} size={11} /></MiniBtn>
                    </ItemCard>
                  ))}
                </div>
              </>
            )}

            {bagTab === "items" && (() => {
              const entries = [];
              for (const d of CONSUMABLE_DEFS) for (let t = 6; t >= 0; t--) { const n = char.consumables[conKey(d.id, t)] || 0; if (n > 0) entries.push({ d, t, n }); }
              const tix = char.tickets || {};
              const auraLabel = (type) => { const u = char.auras?.[type] || 0; if (u >= PERMA_TS) return "Permanent"; if (u > now) return fmtClock(u - now) + " left"; return null; };
              const venItems = [];
              if ((tix.dungeonReset || 0) > 0) venItems.push({ icon: "🎟️", name: "Dungeon Reset Ticket", sub: `×${tix.dungeonReset} · tap a dungeon's timer to use`, col: "#7fd0ff" });
              if ((tix.arenaChallenge || 0) > 0) venItems.push({ icon: "🏟️", name: "Arena Challenge Ticket", sub: `×${tix.arenaChallenge} · for the Arena`, col: "#7fd0ff" });
              if (auraLabel("xp")) venItems.push({ icon: "✨", name: "Aura of Experience", sub: `+75% XP · ${auraLabel("xp")}`, col: "#c8a0ff" });
              if (auraLabel("gold")) venItems.push({ icon: "💰", name: "Aura of Gold", sub: `+100% gold · ${auraLabel("gold")}`, col: "#FFD700" });
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {venItems.length > 0 && (<>
                    <div className="eyebrow"><span><Icon name="gem" size={11} /> Premium</span></div>
                    {venItems.map((v, i) => (
                      <div key={"v" + i} className="item">
                        <span className="mark"><EmojiIcon emoji={v.icon} size={18} /></span>
                        <div className="item-body">
                          <span className="item-name">{v.name}</span>
                          <span className="item-stats">{v.sub}</span>
                        </div>
                      </div>
                    ))}
                    {entries.length > 0 && <div className="eyebrow"><span>Consumables</span></div>}
                  </>)}
                  {entries.length === 0 && venItems.length === 0 && <div className="empty">No consumables. Brew them with Alchemy or buy at the Vendor.</div>}
                  {entries.map(({ d, t, n }) => {
                    const eff = d.kind === "heal" ? `Restores ${tierHeal(t)} HP` : d.kind === "dmgbuff" ? `+${tierBuffPct(t)}% damage · 5 min` : d.kind === "reducebuff" ? `−${tierBuffPct(t)}% damage taken · 5 min` : `+${tierScrollAmount(t)} ${STAT_LABEL[d.stat]} · 1 hour`;
                    return (
                      <div key={d.id + t} className="item">
                        <span className="mark"><EmojiIcon emoji={d.icon} size={18} /></span>
                        <div className="item-body">
                          <span className="item-name">{d.name} {POTION_TIER_ROMAN[t]}<small className="item-meta" style={{ marginLeft: 6 }}>{n} held</small></span>
                          <span className="item-stats">{eff}</span>
                        </div>
                        <MiniBtn onClick={() => useConsumable(d, t)} color={d.color}>Use</MiniBtn>
                        <MiniBtn onClick={() => sellConsumable(d, t)} color="#FFD700">Sell {consumableSellPrice(d, t)}g</MiniBtn>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {bagTab === "gems" && (() => {
              const owned = Object.entries(char.gems || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ g: gemById(id), n })).filter((x) => x.g)
                .sort((a, b) => RARITIES.findIndex((r) => r.id === b.g.rarity) - RARITIES.findIndex((r) => r.id === a.g.rarity) || a.g.name.localeCompare(b.g.name));
              return (
                <div>
                  <div className="ledger-note" style={{ marginBottom: 10 }}>
                    Gems socket into Epic, Legendary and Artifact gear. Open an item and tap an empty socket to bond one — <b>permanently</b>. A socket can only be cleared by reforging, which destroys the gem.
                  </div>
                  {owned.length === 0 && <div className="empty">No gems yet — they drop from enemies alongside gear.</div>}
                  <div>
                    {owned.map(({ g, n }) => (
                      <div key={g.id} className="item">
                        <span className="mark"><EmojiIcon emoji={g.icon} size={17} /></span>
                        <div className="item-body">
                          <span className={`item-name ${rarClass(g.rarity)}`}>{g.name}<small className="item-meta" style={{ marginLeft: 6 }}>{n} held</small></span>
                          <span className="item-stats">{g.desc}</span>
                        </div>
                        <span className="state">{rarityById(g.rarity).name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {bagTab === "crafting" && (
              <div className="ledger">
                {Object.entries(char.materials || {}).filter(([, v]) => v > 0).length === 0
                  ? <div className="empty">No crafting materials yet — mine, gather or salvage for them.</div>
                  : Object.entries(char.materials).filter(([, v]) => v > 0).map(([k, v]) => {
                    const m = MATERIALS[k];
                    return (
                      <div key={k} className="ledger-row">
                        <div className="ledger-line">
                          <span className="ledger-label">
                            {m ? <EmojiIcon emoji={m.icon} size={14} /> : null} {m ? m.name : k}
                          </span>
                          <span className="ledger-val">{v.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {bagTab === "quest" && (() => {
              const owned = Object.entries(char.drops || {}).filter(([, v]) => v > 0);
              return (
                <div>
                  <div className="ledger-note" style={{ marginBottom: 10 }}>Enemy drops, collected for quests and the coming town-building system.</div>
                  {owned.length === 0 ? <div className="empty">No quest items yet. Slay enemies to collect their drops.</div> : (
                    <div>
                      {owned.map(([k, v]) => { const d = DROP_BY_ID[k]; if (!d) return null; return (
                        <div key={k} className="item">
                          <span className="mark"><EmojiIcon emoji={d.icon} size={18} /></span>
                          <div className="item-body">
                            <span className="item-name">{d.name}</span>
                            <span className="item-meta">{ENEMY_DROP_KEYS.find((n) => ENEMY_DROPS[n]?.id === k) ? `Drops from ${ENEMY_DROP_KEYS.find((n) => ENEMY_DROPS[n]?.id === k)}` : "Enemy drop"}</span>
                          </div>
                          <span className="ledger-val">{v.toLocaleString()}</span>
                        </div>
                      ); })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ============ VENDOR TAB ============ */}
        {tab === "tavern" && (
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>The Tavern</div>
            {[
              { t: "bestiary", icon: "📖", name: "Bestiary", desc: "Lore & stats for every foe you've slain", col: "#c9a86a", go: () => setTab("bestiary") },
              { t: "questboard", icon: "📜", name: "Quest Board", desc: "Repeatable bounties for gold & a little XP", col: "#8fd0e0", go: () => { ensureBoard(); setTab("questboard"); } },
              { t: "tavernhall", icon: "🍺", name: "Tavern Hall", desc: "The grand story — big rewards await", col: "#e0a955", go: () => setTab("tavernhall") },
              { t: "citymgmt", icon: "🏛️", name: "City Management", desc: "Shape and grow the town", col: "#8a9bd0", go: () => setTab("citymgmt") },
            ].map((o) => (
              <button key={o.t} onClick={o.go} style={{ width: "100%", textAlign: "left", background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 12, padding: "16px 18px", cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 30 }}><EmojiIcon emoji={o.icon} /></span>
                <span><span style={{ color: o.col, fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif", display: "block" }}>{o.name}</span><span style={{ color: "var(--ink-soft)", fontSize: 11.5 }}>{o.desc}</span></span>
              </button>
            ))}
          </div>
        )}

        {tab === "bestiary" && (() => {
          const sel = bestiarySel && ALL_ENEMY_TYPES.find((e) => e.name === bestiarySel);
          const unlocked = (n) => (char.killsByType?.[n] || 0) > 0;
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <button onClick={() => (sel ? setBestiarySel(null) : setTab("tavern"))} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← {sel ? "Bestiary" : "Tavern"}</button>
                <span style={{ color: "var(--bole)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="tome" /> Bestiary</span>
                <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>{ALL_ENEMY_TYPES.filter((e) => unlocked(e.name)).length}/{ALL_ENEMY_TYPES.length}</span>
              </div>
              {sel ? (() => {
                const drop = ENEMY_DROPS[sel.name]; const k = char.killsByType?.[sel.name] || 0; const lvl = Math.round((sel.minLevel + sel.maxLevel) / 2);
                const repCls = CLASSES.find((c) => c.id === dispositionFor(sel.name)); // this creature's fixed disposition (matches actual spawns)
                const hard = bestiaryMode === "hard";
                const baseZone = ZONES.find((z) => z.enemies.includes(sel.name)); // the creature's home zone
                const hz = baseZone ? HARD_ZONES.find((h) => h.base === baseZone.id) : null; // its Hard Mode counterpart
                const showLvl = hard ? (hz ? hz.enemyLvl : lvl + 5) : lvl; // Hard zones run enemies at a fixed elevated level
                const eStats = enemyStatBlock(showLvl, repCls.id, hard ? { rank: "champion", tier: "hard" } : {}); // Hard: Champion rank on the hard difficulty tier
                const showHp = hard ? Math.round(enemyRepHp(showLvl) * ENEMY_RANKS.champion.hp * diffTier("hard").hp * 8) : enemyRepHp(showLvl); // Champion rank × hard tier × zone weighting
                const prefersMagic = enemyPrefersMagic(repCls.id, showLvl);   // the rule makeEnemy uses
                const eSkills = (SKILLS[repCls.id] || []).filter((s) => s.unlockLevel <= showLvl && ((s.mult && s.mult > 0) || s.dotMult || s.slowPct) && isMagicSkill(s) === prefersMagic);
                const statMeta = [["str", "💪", "Str"], ["agi", "🏹", "Agi"], ["int", "🧠", "Int"], ["sta", "❤️", "Sta"]];
                return (
                  <div>
                    <div style={{ background: "var(--sunk)", border: `1px solid ${sel.color}66`, borderRadius: 12, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 34 }}>{drop?.icon || "👹"}</span>
                        <div><div style={{ color: "var(--ink)", fontWeight: 700, fontSize: 16, fontFamily: "Georgia, serif" }}>{sel.name}</div><div style={{ color: sel.color, fontSize: 11 }}>{sel.origin}</div></div>
                      </div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12, fontStyle: "italic" }}>{ENEMY_LORE[sel.name] || "Little is known of this creature."}</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        {[["normal", "Normal"], ["hard", "🔥 Hard Mode"]].map(([id, label]) => (
                          <button key={id} onClick={() => setBestiaryMode(id)} style={{ flex: 1, background: bestiaryMode === id ? (id === "hard" ? "var(--rubric)" : "var(--raised)") : "var(--verdigris)", border: `1px solid ${bestiaryMode === id ? (id === "hard" ? "var(--rubric)" : "var(--gilt)") : "var(--hairline)"}`, borderRadius: 7, color: bestiaryMode === id ? (id === "hard" ? "var(--rubric)" : "var(--gilt)") : "var(--ink-faint)", padding: "7px 4px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{label}</button>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        {[["Level", hard ? `${showLvl}` : `${sel.minLevel}–${sel.maxLevel}`], ["Health", `~${showHp.toLocaleString()}`], ["Slain", `${k}`]].map(([a, b]) => (
                          <div key={a} style={{ flex: "1 1 28%", background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                            <div style={{ color: "var(--ink-soft)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1 }}>{a}</div>
                            <div style={{ color: hard && a !== "Slain" ? "var(--rubric)" : "var(--gilt)", fontSize: 14, fontWeight: 700 }}>{b}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Attributes <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ink-soft)" }}>· {repCls.name} · {hard ? "Champion, Hard" : "normal"} · Lv {showLvl}</span></div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        {statMeta.map(([key, ic, lbl]) => { const isPrim = key === repCls.main; return (
                          <div key={key} style={{ flex: 1, background: "var(--raised)", border: `1px solid ${isPrim ? sel.color + "88" : "var(--hairline)"}`, borderRadius: 8, padding: "7px 4px", textAlign: "center" }}>
                            <div style={{ fontSize: 13 }}>{ic}</div>
                            <div style={{ color: "var(--ink-soft)", fontSize: 8.5, textTransform: "uppercase" }}>{lbl}</div>
                            <div style={{ color: isPrim ? sel.color : "var(--ink)", fontSize: 13, fontWeight: 700 }}>{eStats[key]}</div>
                          </div>
                        ); })}
                      </div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Possible Skills <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ink-soft)" }}>· {prefersMagic ? "arcane" : "physical"}{hard ? " · Champion draws 2" : ""}</span></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                        {eSkills.length ? eSkills.map((s) => (<span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 7, padding: "4px 8px", fontSize: 11, color: "var(--ink-soft)" }}><EmojiIcon emoji={s.icon} /> {s.name}{s.slowPct ? <span style={{ color: "var(--verdigris)", fontSize: 9 }}>CC</span> : null}</span>)) : <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>Attacks only</span>}
                      </div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 9.5, fontStyle: "italic", marginBottom: 12 }}>Each creature keeps a fixed disposition. Higher-rank foes (Champion/Boss/Lord) wield more skills and stronger stats.</div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Drops</div>
                      {drop ? <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--sunk)", border: `1px solid ${drop.color}55`, borderRadius: 8, padding: "6px 10px" }}><span style={{ fontSize: 16 }}><EmojiIcon emoji={drop.icon} /></span><span style={{ color: drop.color, fontSize: 12, fontWeight: 600 }}>{drop.name}</span><span style={{ color: "var(--ink-faint)", fontSize: 11 }}>×{char.drops?.[drop.id] || 0} held</span></div> : <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>None</span>}
                    </div>
                  </div>
                );
              })() : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ALL_ENEMY_TYPES.map((e) => { const on = unlocked(e.name); const drop = ENEMY_DROPS[e.name]; return (
                    <button key={e.name} disabled={!on} onClick={() => setBestiarySel(e.name)} style={{ display: "flex", alignItems: "center", gap: 10, background: on ? "var(--sunk)" : "var(--verdigris)", border: `1px solid ${on ? e.color + "44" : "var(--verdigris)"}`, borderRadius: 8, padding: "9px 11px", cursor: on ? "pointer" : "default", textAlign: "left" }}>
                      <span style={{ fontSize: 20, filter: on ? "none" : "grayscale(1) brightness(0.4)" }}>{on ? (drop?.icon || "👹") : "❓"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: on ? "var(--ink)" : "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>{on ? e.name : "???"}</div>
                        <div style={{ color: on ? "var(--ink-soft)" : "var(--verdigris)", fontSize: 10 }}>{on ? `${e.origin} · slain ${char.killsByType[e.name]}×` : `Lvl ${e.minLevel}–${e.maxLevel} · undiscovered`}</div>
                        {on && drop && <div style={{ color: drop.color, fontSize: 9.5, marginTop: 1 }}><EmojiIcon emoji={drop.icon} /> {drop.name} <span style={{ color: "var(--ink-faint)" }}>×{char.drops?.[drop.id] || 0}</span></div>}
                      </div>
                      {on && <span style={{ color: "var(--ink-faint)", fontSize: 14 }}>›</span>}
                    </button>
                  ); })}
                </div>
              )}
            </div>
          );
        })()}

        {tab === "questboard" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={() => setTab("tavern")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Tavern</button>
              <span style={{ color: "var(--verdigris)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="scroll" /> Quest Board</span>
              <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>repeatable</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>
              <span style={{ color: "var(--ink-soft)", fontSize: 12, whiteSpace: "nowrap" }}>Quests for:</span>
              <select value={boardZone} onChange={(e) => changeBoardZone(e.target.value)} style={{ flex: 1, minWidth: 0, background: "var(--sunk)", border: "1px solid var(--rule)", borderRadius: 6, color: "var(--ink)", fontSize: 12.5, padding: "6px 8px", cursor: "pointer" }}>
                <option value="any">Any — foes I've encountered</option>
                {ZONES.map((z) => <option key={z.id} value={z.id}>{z.name} (Lv {z.minLevel}–{z.maxLevel})</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(char.quests?.board || []).map((q) => {
                const prog = questProgress(char, q); const done = prog >= q.count; const col = q.kind === "kill" ? "#e0556a" : "#8fd0e0";
                return (
                  <div key={q.id} style={{ background: "var(--sunk)", border: `1px solid ${done ? "var(--verdigris)" : "var(--hairline)"}`, borderRadius: 10, padding: "11px 13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ color: "var(--ink)", fontSize: 13, fontWeight: 700 }}>{q.kind === "kill" ? "⚔️" : "🎒"} {questLabel(q)}</span>
                      <span style={{ color: "var(--gilt)", fontSize: 10.5 }}>+{q.reward.xp} XP · +{q.reward.gold}g</span>
                    </div>
                    <div style={{ marginBottom: 8 }}><Bar current={prog} max={q.count} color={done ? "#5fd35f" : col} height={6} /><div style={{ color: "var(--ink-soft)", fontSize: 10, marginTop: 2 }}>{prog}/{q.count}</div></div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => claimQuest(q)} disabled={!done} style={{ flex: 1, background: done ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${done ? "var(--verdigris)" : "var(--ink)"}`, borderRadius: 8, color: done ? "var(--verdigris)" : "var(--ink-faint)", fontSize: 12, fontWeight: 700, padding: 8, cursor: done ? "pointer" : "default" }}>{done ? "✓ Claim" : "In progress"}</button>
                      <button onClick={() => rerollQuest(q.id)} style={{ background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 8, color: "var(--ink-soft)", fontSize: 12, fontWeight: 700, padding: "8px 12px", cursor: "pointer" }}>↻</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "tavernhall" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={() => setTab("tavern")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Tavern</button>
              <span style={{ color: "var(--gilt)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="tavern" /> Tavern Hall</span>
              <span />
            </div>
            <div style={{ color: "var(--ink-soft)", fontSize: 12, fontStyle: "italic", marginBottom: 14, lineHeight: 1.5 }}>The keeper leans in with tales of a grander purpose. These story quests will reward great experience and rare items — the tale is still being written.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STORY_QUESTS.map((s) => {
                const soon = s.status === "coming_soon";
                return (
                  <div key={s.id} style={{ background: "var(--sunk)", border: `1px solid ${soon ? "var(--bole)" : "var(--verdigris)"}`, borderRadius: 10, padding: "12px 14px", opacity: soon ? 1 : 0.6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--ink)", fontSize: 13, fontWeight: 700, fontFamily: "Georgia, serif" }}>Ch. {s.chapter} · {s.title}</span>
                      <span style={{ color: soon ? "var(--gilt)" : "var(--ink-faint)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1 }}>{soon ? "Coming soon" : "🔒 Locked"}</span>
                    </div>
                    <div style={{ color: "var(--ink-soft)", fontSize: 11.5, marginTop: 4, fontStyle: "italic" }}>{s.teaser}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "citymgmt" && (() => {
          const fmtDur = (s) => { s = Math.max(0, Math.round(s)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; if (d > 0) return `${d}d ${h}h`; if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m ${sec}s`; return `${sec}s`; };
          const build = char.town?.build;
          const activeBld = build && townBuildingById(build.id);
          const remain = build ? (build.endsAt - now) / 1000 : 0;
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("tavern")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Tavern</button>
                <span style={{ color: "var(--verdigris)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="vault" /> City Management</span>
                <span style={{ color: "var(--ink-soft)", fontSize: 11 }}>Town Hall Lv{townLvl(char, "townhall")}</span>
              </div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>Raise your town for permanent, account-wide bonuses. Costs and build times climb steeply — one project at a time.</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, fontSize: 11 }}>
                <span style={{ color: "var(--gilt)" }}><Icon name="coin" /> {char.gold.toLocaleString()}</span>
                <span style={{ color: "var(--ink-soft)" }}><Icon name="pick" /> {Object.values(char.materials || {}).reduce((a, b) => a + b, 0)} mats</span>
                <span style={{ color: "var(--rar-epic)" }}><Icon name="pack" /> {Object.values(char.drops || {}).reduce((a, b) => a + b, 0)} drops</span>
              </div>

              {build && activeBld && (
                <div style={{ background: "var(--raised)", border: "1.5px solid var(--bole)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ color: "var(--gilt)", fontWeight: 700, fontSize: 13 }}><Icon name="keep" /> <EmojiIcon emoji={activeBld.icon} /> {activeBld.name} → Lv{build.level}</span>
                    <span style={{ color: remain <= 0 ? "var(--verdigris)" : "var(--gilt)", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{remain <= 0 ? "Complete!" : fmtDur(remain)}</span>
                  </div>
                  <Bar current={Math.max(0, townTimeAt(activeBld, build.level - 1) - Math.max(0, remain))} max={townTimeAt(activeBld, build.level - 1)} color="#f0b429" height={6} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {remain <= 0
                      ? <button onClick={collectBuild} style={{ flex: 1, background: "var(--raised)", border: "1.5px solid var(--verdigris)", borderRadius: 8, color: "var(--ink-soft)", fontSize: 12.5, fontWeight: 700, padding: 9, cursor: "pointer" }}><Icon name="check" /> Collect</button>
                      : (() => { const rc = Math.max(1, Math.ceil(remain / 60)); const afford = (char.ven || 0) >= rc; return (
                          <button onClick={rushBuild} disabled={!afford} style={{ flex: 1, background: afford ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${afford ? "var(--verdigris)" : "var(--ink)"}`, borderRadius: 8, color: afford ? "var(--ink-soft)" : "var(--ink-faint)", fontSize: 12, fontWeight: 700, padding: 9, cursor: afford ? "pointer" : "default" }}><Icon name="haste" /> Rush · 💎 {rc.toLocaleString()}</button>
                        ); })()}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {TOWN_BUILDINGS.map((bld) => {
                  const cur = townLvl(char, bld.id);
                  const maxB = townMaxBuildable(char, bld);
                  const atCap = cur >= bld.max;
                  const gated = !atCap && cur >= maxB;
                  const cost = townCostAt(bld, cur);
                  const chk = townCanBuild(char, bld);
                  const building = build?.id === bld.id;
                  const canStart = !build && chk.ok;
                  return (
                    <div key={bld.id} style={{ background: "var(--sunk)", border: `1.5px solid ${building ? "var(--gilt)" : cur > 0 ? "var(--rule)" : "var(--hairline)"}`, borderRadius: 11, padding: "11px 13px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: 24 }}><EmojiIcon emoji={bld.icon} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 700, fontFamily: "Georgia, serif" }}>{bld.name} <span style={{ color: "var(--ink-soft)", fontSize: 11 }}>Lv{cur}/{bld.max}</span></div>
                          <div style={{ color: cur > 0 ? "var(--verdigris)" : "var(--ink-faint)", fontSize: 10.5 }}>{cur > 0 ? `Active: ${bld.bonus(cur)}` : "Not yet built"}</div>
                        </div>
                      </div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 10.5, lineHeight: 1.5, marginBottom: 8 }}>{bld.desc}</div>
                      {atCap ? (
                        <div style={{ color: "var(--gilt)", fontSize: 11.5, fontWeight: 700, textAlign: "center", padding: 6 }}>★ Fully upgraded</div>
                      ) : (
                        <>
                          <div style={{ background: "var(--sunk)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                            <div style={{ color: "var(--ink-soft)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Upgrade to Lv{cur + 1} → <span style={{ color: "var(--verdigris)" }}>{bld.bonus(cur + 1)}</span></div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
                              <span style={{ color: char.gold >= cost.gold ? "var(--gilt)" : "var(--rubric)" }}><Icon name="coin" /> {cost.gold.toLocaleString()}</span>
                              {cost.mats.map((m) => <span key={m.id} style={{ color: (char.materials?.[m.id] || 0) >= m.qty ? "var(--ink-soft)" : "var(--rubric)" }}>{MAT_BY_ID[m.id]?.icon || "⛏️"} {m.qty} {MAT_BY_ID[m.id]?.name || m.id}</span>)}
                              {cost.drops.map((d) => <span key={d.id} style={{ color: (char.drops?.[d.id] || 0) >= d.qty ? "var(--rar-epic)" : "var(--rubric)" }}>{DROP_BY_ID[d.id]?.icon || "🎒"} {d.qty} {DROP_BY_ID[d.id]?.name || d.id}</span>)}
                              <span style={{ color: "var(--bole)" }}><Icon name="hourglass" /> {fmtDur(townTimeAt(bld, cur))}</span>
                            </div>
                          </div>
                          <button onClick={() => startBuild(bld.id)} disabled={!canStart} style={{ width: "100%", background: canStart ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${canStart ? "var(--verdigris)" : "var(--ink)"}`, borderRadius: 8, color: canStart ? "var(--verdigris)" : "var(--ink-faint)", fontSize: 12, fontWeight: 700, padding: 9, cursor: canStart ? "pointer" : "default" }}>
                            {building ? "🏗️ Under construction" : build ? "Another build in progress" : gated ? (chk.reason || "Locked") : chk.ok ? (cur === 0 ? "🔨 Build" : "⬆️ Upgrade") : chk.reason}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {tab === "premium" && (() => {
          const fmtDur = (s) => { s = Math.max(0, Math.round(s)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`; };
          const auraLabel = (type) => { const u = char.auras?.[type] || 0; if (u >= PERMA_TS) return "Permanent"; if (u > now) return fmtDur((u - now) / 1000) + " left"; return null; };
          return (
            <div>
              <div className="head">
                <button className="head-back" onClick={() => setTab("town")}>&#8592; Town</button>
                <span className="head-title"><Icon name="gem" size={15} /> Premium Shop</span>
                <span className="price"><Icon name="gem" size={11} /> {(char.ven || 0).toLocaleString()}</span>
              </div>

              {(auraLabel("xp") || auraLabel("gold") || (char.tickets?.dungeonReset || 0) > 0 || (char.tickets?.arenaChallenge || 0) > 0) && (
                <div className="statline">
                  {auraLabel("xp") && <span><Icon name="spark" size={12} /> XP aura <b>{auraLabel("xp")}</b></span>}
                  {auraLabel("gold") && <span><Icon name="coin" size={12} /> Gold aura <b>{auraLabel("gold")}</b></span>}
                  {(char.tickets?.dungeonReset || 0) > 0 && <span><Icon name="ticket" size={12} /> Dungeon <b>{char.tickets.dungeonReset}</b></span>}
                  {(char.tickets?.arenaChallenge || 0) > 0 && <span><Icon name="arena" size={12} /> Arena <b>{char.tickets.arenaChallenge}</b></span>}
                </div>
              )}

              {/* OFFERS — where a limited-time offer goes once its window closes. It does not vanish;
                  it stops being urgent. Shown only once the town-map window has expired, and hidden
                  once taken, so it is never two places at once. */}
              {offerState(char, now) === "expired" && (
                <>
                  <div className="eyebrow"><span>Offers</span></div>
                  <button onClick={() => setOfferOpen(true)} className="choice is-on">
                    <span className="choice-head">
                      <span className="mark"><Icon name="sword" size={18} /></span>
                      <span className="choice-name">{OFFER.name}</span>
                      <span className="price">${OFFER.usd}</span>
                    </span>
                    <span className="choice-body">An Artifact Weapon plus your choice of a second weapon or an off-hand.</span>
                  </button>
                </>
              )}

              <div className="eyebrow"><span>Boosts and tickets</span></div>
              <div style={{ marginBottom: 16 }}>
                {PREMIUM_ITEMS.filter((it) => !(it.kind === "aura" && (char.auras?.[it.aura] || 0) >= PERMA_TS)).map((it) => {
                  const afford = (char.ven || 0) >= it.cost;
                  return (
                    <div key={it.id} className="item">
                      <span className="mark"><EmojiIcon emoji={it.icon} size={18} /></span>
                      <div className="item-body">
                        <span className="item-name">{it.name}{it.hours === "perm" ? <small className="item-meta" style={{ marginLeft: 6 }}>permanent</small> : null}</span>
                        <span className="item-stats">{it.desc}</span>
                      </div>
                      <div className="item-acts">
                        <MiniBtn onClick={() => buyPremium(it)} disabled={!afford} tone={afford ? "gain" : undefined}>
                          {it.cost.toLocaleString()} Ven
                        </MiniBtn>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="eyebrow"><span>Moneychanger</span><span>1 Ven &#8594; {VEN_TO_GOLD.toLocaleString()}g</span></div>
              {(() => {
                const n = Math.max(0, Math.floor(Number(venExchange) || 0));
                const gold = n * VEN_TO_GOLD;
                const afford = n > 0 && (char.ven || 0) >= n;
                return (
                  <div className={`bench${afford ? " is-ready" : ""}`}>
                    <div className="bulk" style={{ borderTop: 0, paddingTop: 0 }}>
                      <span className="bulk-label">Ven to change</span>
                      <input type="number" min={1} value={venExchange} className="bulk-n" aria-label="Ven to exchange"
                        onChange={(e) => setVenExchange(e.target.value)} />
                      {[100, 500, 1000].map((q) => (
                        <button key={q} onClick={() => setVenExchange(String(q))}
                          className={`pick${String(q) === venExchange ? " is-on" : ""}`}>{q}</button>
                      ))}
                      <button onClick={() => setVenExchange(String(char.ven || 0))} className="pick">All</button>
                    </div>
                    <div className="ledger-line">
                      <span className="ledger-label">You will receive</span>
                      <span className="ledger-val" style={{ color: n > 0 ? "var(--gilt)" : "var(--ink-faint)" }}>
                        <Icon name="coin" size={12} /> {gold.toLocaleString()}g
                      </span>
                    </div>
                    {n > 0 && !afford && (
                      <div className="ledger-note" style={{ color: "var(--rubric)" }}>
                        Not enough Ven — you hold {(char.ven || 0).toLocaleString()}.
                      </div>
                    )}
                    <button onClick={() => exchangeVen(venExchange)} disabled={!afford} className="go">Exchange</button>
                  </div>
                );
              })()}

              <div className="eyebrow"><span>Get Ven</span></div>
              <div className="sets" style={{ flexWrap: "wrap" }}>
                {VEN_PACKS.map((p) => (
                  <div key={p.ven} className="set" style={{ flex: "1 1 30%", minWidth: 96, textAlign: "center", cursor: "default" }}>
                    <div className="set-name" style={{ justifyContent: "center" }}><Icon name="gem" size={14} /> {p.ven.toLocaleString()}</div>
                    <button onClick={buyVenStub} className="go is-quiet">${p.usd}</button>
                  </div>
                ))}
              </div>
              <div className="ledger-note" style={{ textAlign: "center", marginTop: 12 }}>In-app purchases are not yet enabled. Payment options (Google Play & others) are coming soon. Ven can also drop, extremely rarely, from slain foes.</div>
            </div>
          );
        })()}

        {tab === "previewskills" && (() => {
          const cid = trainClass || char.cls;
          const cl = CLASSES.find((c) => c.id === cid) || CLASSES[0];
          const list = classSkills(cid);
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("classhall")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Class Hall</button>
                <span style={{ color: cl.color, fontFamily: "Georgia, serif", fontSize: 15 }}><EmojiIcon emoji={cl.icon} /> {cl.name} Skills</span>
                <span />
              </div>
              <div style={{ background: "var(--sunk)", border: `1px solid ${cl.color}55`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ color: cl.color, fontSize: 12.5, fontWeight: 700, fontFamily: "Georgia, serif", marginBottom: 3 }}><Icon name="target" /> Previewing {cl.name}</div>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.5 }}>Every ability this class can bring. Each unlocks at its level — dual specializing adds these to your skill pool too.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {list.map((s) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--sunk)", border: "1px solid var(--hairline)", borderLeft: `3px solid ${cl.color}`, borderRadius: 8, padding: "9px 11px" }}>
                    <span style={{ fontSize: 19 }}><EmojiIcon emoji={s.icon} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 12.5, fontWeight: 700 }}>{s.name} <span style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Lv {s.unlockLevel}</span></span>
                      <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 10.5 }}>{s.desc}</span>
                      <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 9.5 }}>Level {s.unlockLevel} · {s.cd}s cooldown · {skillTypeLabel(s.name)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {tab === "trainable" && (() => {
          const cid = trainClass || char.cls;
          const cl = CLASSES.find((c) => c.id === cid) || CLASSES[0];
          const list = [...classSkills(cid)].sort((a, b) => (a.unlockLevel || 1) - (b.unlockLevel || 1));
          const next = list.find((s) => char.level < s.unlockLevel);
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("classhall")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Class Hall</button>
                <span style={{ color: cl.color, fontFamily: "Georgia, serif", fontSize: 15 }}><EmojiIcon emoji={cl.icon} /> Skill Progression</span>
                <span style={{ color: "var(--ink-soft)", fontSize: 12, fontWeight: 700 }}>Lv {char.level}</span>
              </div>
              <div style={{ background: "var(--raised)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ color: "var(--ink-soft)", fontSize: 12.5, fontWeight: 700, fontFamily: "Georgia, serif", marginBottom: 3 }}><Icon name="tome" /> Every skill unlocks by level</div>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.5 }}>Reach the level and the art is yours — nothing to buy or farm. The choice is <b>which {MAX_SKILL_SLOTS} you carry</b> into battle.{next ? <> Next: <b style={{ color: cl.color }}><EmojiIcon emoji={next.icon} /> {next.name}</b> at level {next.unlockLevel}.</> : <> You have learned every art of your class.</>}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {list.map((s) => {
                  const has = char.level >= s.unlockLevel;
                  return (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, background: has ? "var(--verdigris)" : "var(--sunk)", border: `1px solid ${has ? "var(--verdigris)" : "var(--hairline)"}`, borderLeft: `3px solid ${has ? "var(--verdigris)" : cl.color}`, borderRadius: 8, padding: "9px 11px", opacity: has ? 1 : 0.55 }}>
                      <span style={{ fontSize: 19 }}><EmojiIcon emoji={s.icon} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", color: has ? "var(--verdigris)" : "var(--verdigris)", fontSize: 12.5, fontWeight: 700 }}>{s.name} {s.spec && <span style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>· signature</span>}</span>
                        <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 10.5 }}>{s.desc}</span>
                        <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 9.5 }}>Level {s.unlockLevel}{s.cd ? ` · ${s.cd}s cooldown` : ""}</span>
                      </span>
                      <span style={{ color: has ? "var(--verdigris)" : "var(--ink-faint)", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>{has ? "✓ Unlocked" : `🔒 Lv ${s.unlockLevel}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {tab === "skillmods" && (() => {
          const pAvail = primaryModAvail(char), pTot = primaryModTotal(char);
          const refundCost = skillModRefundCost(char);
          const renderSkill = (sk) => {
            const pts = skillModPts(char, sk.name);
            const md = char.skillMods?.[sk.name];
            const poolAvail = pAvail;
            return (
              <div key={sk.name} style={{ background: "var(--sunk)", border: `1px solid ${pts > 0 ? "var(--verdigris)" : "var(--hairline)"}`, borderRadius: 11, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}><EmojiIcon emoji={sk.icon} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--ink)", fontSize: 13, fontWeight: 700 }}>{sk.name} {pts > 0 && <span style={{ color: "var(--rar-epic)" }}>+{pts}</span>}</div>
                    <div style={{ color: "var(--ink-soft)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.5 }}>{skillTypeLabel(sk.name)} · +{Math.round(skillModPotency(char, sk.name) * 100)}% potency</div>
                    {/* What the skill actually does. Investing points in a name alone asked the
                        player to remember every ability's effect from another screen. */}
                    {sk.desc && <div style={{ color: "var(--ink-soft)", fontSize: 10, marginTop: 2, lineHeight: 1.35 }}>{sk.desc}</div>}
                  </div>
                  <button onClick={() => investSkillMod(sk.name)} disabled={poolAvail <= 0 || pts >= SKILL_MOD_CAP} style={{ background: (poolAvail > 0 && pts < SKILL_MOD_CAP) ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${(poolAvail > 0 && pts < SKILL_MOD_CAP) ? "var(--rar-epic)" : "var(--ink)"}`, borderRadius: 8, color: (poolAvail > 0 && pts < SKILL_MOD_CAP) ? "var(--rar-epic)" : "var(--ink-faint)", fontSize: 15, fontWeight: 700, width: 34, height: 30, cursor: (poolAvail > 0 && pts < SKILL_MOD_CAP) ? "pointer" : "default" }}>+</button>
                </div>
                <div style={{ height: 6, background: "var(--raised)", borderRadius: 4, overflow: "hidden", marginBottom: 8, position: "relative" }}>
                  <div style={{ width: `${(pts / SKILL_MOD_CAP) * 100}%`, height: "100%", background: "var(--ground)" }} />
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--sunk)" }} />
                </div>
                {SKILL_MOD_BREAKS.map((bp) => {
                  const unlocked = pts >= bp;
                  const chosen = md?.effects?.[bp];
                  return (
                    <div key={bp} style={{ marginBottom: 6, opacity: unlocked ? 1 : 0.5 }}>
                      <div style={{ color: unlocked ? "var(--rar-epic)" : "var(--ink-faint)", fontSize: 9.5, fontWeight: 700, marginBottom: 3 }}>{bp} pts — {unlocked ? "add an effect:" : `locked (reach ${bp})`}</div>
                      {unlocked && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {SKILL_MOD_EFFECTS.map((ef) => {
                            const sel = chosen === ef.id;
                            const usedOther = md?.effects?.[SKILL_MOD_BREAKS.find((b) => b !== bp)] === ef.id;
                            return (
                              <button key={ef.id} onClick={() => chooseSkillModEffect(sk.name, bp, ef.id)} disabled={usedOther && !sel} title={ef.desc} style={{ background: sel ? "var(--raised)" : "var(--raised)", border: `1px solid ${sel ? "var(--rar-epic)" : usedOther ? "var(--verdigris)" : "var(--rule)"}`, borderRadius: 6, color: sel ? "var(--rar-epic)" : usedOther ? "var(--ink-faint)" : "var(--verdigris)", fontSize: 9.5, fontWeight: 600, padding: "4px 7px", cursor: (usedOther && !sel) ? "default" : "pointer" }}><EmojiIcon emoji={ef.icon} /> {ef.name}</button>
                            );
                          })}
                        </div>
                      )}
                      {unlocked && chosen && <div style={{ color: "var(--ink-soft)", fontSize: 9, marginTop: 3 }}>{skillModEffectById(chosen)?.desc}</div>}
                    </div>
                  );
                })}
                {pts > 0 && <button onClick={() => refundSkillMod(sk.name)} style={{ marginTop: 2, background: "var(--raised)", border: "1px solid var(--ink-faint)", borderRadius: 7, color: "var(--rubric)", fontSize: 10, fontWeight: 600, padding: "5px 9px", cursor: "pointer" }}><Icon name="spark" /> Refund · {refundCost.toLocaleString()}g</button>}
              </div>
            );
          };
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("classhall")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Class Hall</button>
                <span style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="spark" /> Skill Mods</span>
                <span />
              </div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>Earn a point every level (except milestone levels 10/20/30/40/50/60), starting at level 5. Invest up to {SKILL_MOD_CAP} into a skill for scaling potency, and add an effect at {SKILL_MOD_BREAKS.join(" & ")} points. Refunds cost {TALENT_RESPEC_COST}g × times refunded.</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ color: "var(--rar-epic)", fontSize: 16, fontWeight: 700 }}>{pAvail}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Skill-mod points available ({pTot} total)</div>
                </div>
              </div>
              <div style={{ color: "var(--gilt)", fontSize: 11, fontWeight: 700, margin: "4px 0 6px" }}>{CLASSES.find((x) => x.id === char.cls)?.name}{char.spec ? ` — ${specById(char.spec)?.name}` : ""}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{(SKILLS[char.cls] || []).filter((sk) => specVisible(char, sk)).map((sk) => renderSkill(sk))}</div>
            </div>
          );
        })()}

        {tab === "arena" && (
          <MultiplayerHub char={char} commitChar={commitChar} showNotif={showNotif} onExit={() => setTab("town")} onStartRated={startRatedMatch}
            onStartPractice={startTutorialDuel} lessonWantsDuel={(activeLesson(char) || {}).id === "arena"} />
        )}

        {tab === "group" && (
          <GroupCombat char={char} commitChar={commitChar} ilvl={groupRun?.ilvl || avgEquippedIlvl(char)}
            bossId={groupRun ? undefined : groupBoss} bossDef={groupRun?.bossDef} party={groupRun?.party}
            label={groupRun?.label} onCleared={onGroupCleared}
            room={groupRun?.room} myAllyId={groupRun?.myAllyId} offlineReason={groupRun?.offlineReason}
            practice={!!groupRun?.tutorialDelve}
            onExit={() => { try { groupRun?.room?.leave(); } catch { /* already gone */ } setGroupRun(null); setTab("guild"); }} />
        )}

        {tab === "guild" && (() => {
          const avg = avgEquippedIlvl(char);
          if (guildQueue) {
            const c = guildQueue;
            return (
              <div style={{ textAlign: "center" }}>
                <div className="head">
                  <button className="head-back" onClick={() => setGuildQueue(null)}>&larr; Step out</button>
                  <span className="head-title">Gathering a party</span>
                  <span className="head-note" />
                </div>
                <div style={{ marginBottom: 4 }}><EmojiIcon emoji={c.content.icon} size={26} /></div>
                <div className="head-title">{c.content.name}{c.kind.startsWith("hard") ? " \u2014 Hard" : ""}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 30, color: "var(--rubric)", margin: "10px 0", fontVariantNumeric: "tabular-nums" }}>{c.countdown > 0 ? c.countdown : "\u2014"}</div>
                <p className="item-stats" style={{ marginBottom: 12 }}>Filling the empty places. The fight opens on the combat page.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                  {c.party.map((m) => (
                    <div key={m.id} className="item">
                      <span className="mark"><EmojiIcon emoji={m.icon} size={16} /></span>
                      <div className="item-body">
                        <span className="item-name">{m.name}{m.me ? " (you)" : ""}</span>
                        <span className="item-meta">{m.specName}</span>
                      </div>
                    </div>))}
                  {Array.from({ length: Math.max(0, c.size - c.party.length) }).map((_, i) => (
                    <div key={"e" + i} className="empty" style={{ padding: "10px 0" }}>an empty place</div>))}
                </div>
              </div>
            );
          }
          // status pill + gating for a piece of Guild content (lockouts are independent of solo)
          const row = (item, kind, size, unlocked, req) => {
            const raid = kind.includes("raid");
            const cdLeft = raid ? guildRaidCdLeft(char, item.id) : 0;
            const runs = raid ? 0 : guildRunsLeft(char, item.id);
            const winLeft = raid ? 0 : guildWindowLeft(char, item.id);
            const out = raid ? cdLeft > 0 : runs <= 0;
            const tickets = char.tickets?.dungeonReset || 0;
            const canTicket = out && !raid && tickets > 0;
            // A tone rather than a hex: open, soon, or shut. Three states beat five
            // colours, and the theme decides what each one looks like.
            const pill = raid
              ? (cdLeft > 0 ? { t: fmtCd(cdLeft), tone: "is-shut" } : { t: "Open", tone: "is-open" })
              : (runs > 0 ? { t: `${runs}/${GUILD_RUN_LIMIT} runs${winLeft > 0 ? ` · ${fmtCd(winLeft)}` : ""}`,
                             tone: runs === GUILD_RUN_LIMIT ? "is-open" : "is-soon" }
                          : { t: `none left · ${fmtCd(winLeft)}`, tone: "is-shut" });
            return (
              <div key={item.id} className={`item${unlocked ? "" : " is-shut"}`} style={unlocked ? undefined : { opacity: .55 }}>
                <span className="mark"><EmojiIcon emoji={item.icon} size={20} /></span>
                <div className="item-body">
                  <span className="item-name">
                    {item.name}
                    {kind.startsWith("hard") && <span className="chip is-hard">Hard</span>}
                  </span>
                  <span className="item-meta">{item.boss || "Boss"} · {size} players{req ? ` · ${req}` : ""}</span>
                  {unlocked && <span className={`state ${pill.tone}`}>{pill.t}</span>}
                </div>
                <div className="item-acts">
                  {!unlocked ? <span className="state is-shut"><Icon name="lock" size={11} /></span>
                    : canTicket ? <MiniBtn onClick={() => queueGuild(item, kind, size, true)}>Ticket ({tickets})</MiniBtn>
                    : out ? <span className="state is-shut">Locked</span>
                    : <MiniBtn onClick={() => queueGuild(item, kind, size)} tone="gain">Queue</MiniBtn>}
                </div>
              </div>
            );
          };
          // Trinity Trial row — same layout, 24h lockout, GDKP reward at the boss's own ilvl
          const trialRow = (b) => {
            const left = trialCdLeft(char, b.id);
            const ready = left <= 0;
            return (
              <div key={b.id} className="item">
                <span className="mark"><Icon name="sword" size={18} /></span>
                <span className="item-body">
                  <span className="item-name">{b.name}</span>
                  <span className="item-meta">Lv {b.level} · 4 players · ilvl {TRIAL_ILVL[b.id] || 64} loot</span>
                  <span className={ready ? "state is-open" : "state is-shut"}>
                    {ready ? "available · epic floor, 10% legendary · a wipe costs nothing" : fmtCd(left)}
                  </span>
                </span>
                {ready ? <button onClick={() => startTrial(b.id)} className="go" style={{ width: "auto", margin: 0 }}>Enter</button>
                       : <span className="state is-shut"><Icon name="hourglass" size={10} /> locked</span>}
              </div>
            );
          };
          return (
            <div>
              <div className="head">
                <button className="head-back" onClick={() => setTab("town")}>&larr; Town</button>
                <span className="head-title">The Guild</span>
                <span className="head-note">ilvl {avg}</span>
              </div>
              <p className="item-stats" style={{ marginBottom: 12 }}>
                You fight your calling's role here &mdash; <b>{ROLES[roleOf(char)].name}</b> &mdash;
                while a tank, a healer, support and damage fill the rest of the party. Threat, interrupts, tank-busters and
                healing all count. What you spend here is kept separately from your solo runs.
              </p>
              <div className="sift" style={{ marginBottom: 12 }}>
                <input className="field" value={partyCode} placeholder="A word you and a friend agree on"
                  onChange={(e) => setPartyCode(e.target.value.slice(0, 16))} />
                <span className="item-stats">Share it and you will always land in the same run. Leave it blank to be matched with anyone.</span>
              </div>
              {/* The Training Delve sits ABOVE the real content, because it is what a player should
                  run first. It flashes while its lesson is open, matching the town-map signpost. */}
              {(() => {
                const les = activeLesson(char);
                const wanted = les && les.id === "guild";
                const learned = !!char.tutorial?.delveCleared;
                return (
                  <button onClick={startTutorialDelve} className="gateway"
                    style={wanted ? { animation: "tutflash 1.4s ease-in-out infinite" } : undefined}>
                    <span className="mark"><Icon name="target" size={18} /></span>
                    <span className="gateway-body">
                      <b>The Training Delve {learned ? <span className="state is-open">cleared</span> : null}</b>
                      <span style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.45, display: "block" }}>
                        A practice party of four against a teaching boss. No lockout, no loot, nothing recorded —
                        and it never occupies a real group.
                      </span>
                    </span>
                  </button>
                );
              })()}
              <div className="eyebrow"><span>Dungeons · 4 players · {GUILD_RUN_LIMIT} runs/hour</span></div>
              {DUNGEONS.map((d) => row(d, "dungeon", 4, char.level >= d.minLevel, `Lv ${d.minLevel}`))}
              {HARD_DUNGEONS.map((d) => row(d, "hard-dungeon", 4, hardDungeonUnlocked(char, avg, d), d.reqIlvl ? `ilvl ${d.reqIlvl}` : `${HARD_BOSS_REQ}× ${d.prevBoss || "prev"}`))}
              <div className="eyebrow"><span>Raids · 6 players · 24h lockout</span></div>
              {RAIDS.map((r) => row(r, "raid", 6, avg >= r.reqIlvl, `ilvl ${r.reqIlvl}`))}
              {row(HARD_RAID, "hard-raid", 6, hardRaidUnlocked(char), "Hard cleared")}
              <div className="eyebrow"><span>Trinity Trials · 4 players · 24h lockout</span></div>
              <div className="ledger-note" style={{ marginBottom: 7 }}>Pure mechanic checks. Every clear opens a <b>GDKP loot bid</b> — Epic floor with a 10% shot at Legendary. The lockout is spent <b>only when the boss dies</b>, so a wipe costs nothing but time.</div>
              {Object.values(BOSS_DEFS).map((b) => trialRow(b))}
            </div>
          );
        })()}

        {tab === "classhall" && (() => {
          const cls = CLASSES.find((x) => x.id === char.cls);
          const specs = specsFor(char.cls);
          const specUnlocked = (char.level || 1) >= SPEC_LEVEL;
          const activeSpec = specById(char.spec);
          const hub = (icon, title, sub, onClick) => (
            <button onClick={onClick} className="gateway">
              <span className="mark">{typeof icon === "string" ? <EmojiIcon emoji={icon} size={18} /> : icon}</span>
              <span className="gateway-body"><b>{title}</b><span>{sub}</span></span>
              <span className="gateway-more">&rsaquo;</span>
            </button>
          );
          return (
            <div>
              <div className="head">
                <button className="head-back" onClick={() => setTab("town")}>&larr; Town</button>
                <span className="head-title">Class Hall</span>
                <span className="head-note">{cls?.name}</span>
              </div>

              {/* ---- Specialization picker ---- */}
              <div className="eyebrow">
                <span>Your calling</span>
                <span>{activeSpec ? activeSpec.name : specUnlocked ? "choose one" : `opens at level ${SPEC_LEVEL}`}</span>
              </div>
              <p className="item-stats" style={{ marginBottom: 12 }}>A calling reshapes how {cls?.name} plays: it grants its signature skills and applies its passive. Change it whenever you like, at no cost — each one remembers its own bar, mods and standing orders, and hands them back when you return to it.</p>
              <div style={{ marginBottom: 16 }}>
                {specs.map((sp) => {
                  const active = char.spec === sp.id;
                  return (
                    <div key={sp.id} className={`choice${active ? " is-on" : ""}${specUnlocked || active ? "" : " is-shut"}`}>
                      <div className="choice-head">
                        <span className="mark"><EmojiIcon emoji={sp.icon} size={18} /></span>
                        <span className="choice-name">{sp.name}<small>{specCurve(sp.id)}</small></span>
                        {active ? <span className="state is-open">Chosen</span>
                          : hasLoadout(char, sp.id) ? <span className="state" title="A saved bar, mods and standing orders">Saved</span> : null}
                      </div>
                      <div className="choice-body" style={{ marginBottom: 8 }}>{sp.desc}</div>
                      <div className="tags" style={{ marginBottom: 9 }}>
                        {specSkillNames(sp.id).map((n, si) => { const sk = (SKILLS[char.cls] || []).find((s) => s.name === n);
                          // Only the first SPEC_AUTOGRANT are put on the bar for you; the rest belong to
                          // the spec and are yours to slot in. Showing all five as though they were all
                          // granted is how a Protection warrior ended up with no room for a damage skill.
                          const granted = si < SPEC_AUTOGRANT; return (
                          <span key={n} className={`tag${granted ? " is-given" : ""}`}
                            title={granted ? "Put on your bar when you choose this calling" : "Belongs to this calling \u2014 slot it in yourself"}>
                            <EmojiIcon emoji={sk?.icon} size={11} />{n}</span>
                        ); })}
                      </div>
                      {active ? (
                        <span style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 }}>✓ Specialized</span>
                      ) : !specUnlocked ? (
                        <button disabled style={{ background: "var(--raised)", border: "1.5px solid var(--ink)", borderRadius: 8, color: "var(--ink-faint)", fontSize: 11.5, fontWeight: 700, padding: "8px 12px", cursor: "default" }}><Icon name="lock" /> Unlocks at Lv {SPEC_LEVEL}</button>
                      ) : (
                        <button onClick={() => setSpec(sp.id)} style={{ background: `var(--raised)`, border: `1.5px solid ${cls.color}`, borderRadius: 8, color: cls.color, fontSize: 11.5, fontWeight: 700, padding: "8px 14px", cursor: "pointer" }}>{hasLoadout(char, sp.id) ? "📋 Restore template" : char.spec ? "Switch to this" : "Specialize"}</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ---- Hub ---- */}
              <div style={{ color: "var(--ink-soft)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Training</div>
              {hub("🌟", "Talents", (char.level || 1) >= 10 ? "Choose a talent for each tier that reshapes your class" : `Talents unlock at level 10`, () => setTab("talenttree"), "#f0b429")}
              {hub("📖", "Skill Progression", "Every class skill and the level it unlocks", () => { setTrainClass(char.cls); setTab("trainable"); }, "#e0b050")}
              {hub("✨", "Equip Skills", "Set your active ability loadout", () => { setHeroTab("skills"); setTab("hero"); }, "#69CCF0")}
              {hub("🔮", "Skill Mods", "Invest points to empower individual skills", () => setTab("skillmods"), "#c8a0ff")}
            </div>
          );
        })()}

        {tab === "talenttree" && (() => {
          const cls = CLASSES.find((x) => x.id === char.cls);
          const activeSpec = specById(char.spec);
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("classhall")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Class Hall</button>
                <span style={{ color: "var(--gilt)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="star" /> Talents</span>
                <span style={{ color: activeSpec ? cls?.color : "var(--ink-faint)", fontSize: 11, fontWeight: 700 }}>{activeSpec ? activeSpec.name : "No spec"}</span>
              </div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.5, marginBottom: 12 }}>Choose one talent per tier to shape how your {activeSpec ? activeSpec.name : cls?.name} plays. {activeSpec ? "These options are tuned to this specialization's staples." : "Pick a Specialization in the Class Hall to unlock its bespoke tree."} Rows unlock at levels 10–60. Your first pick per row is free; changing a talent costs <span style={{ color: "var(--gilt)" }}>{TALENT_RESPEC_COST}g × your changes</span> — next change: <span style={{ color: "var(--gilt)", fontWeight: 700 }}>{talentChangeCost(char).toLocaleString()}g</span>.</div>
              {char.level < 10 && <div style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "14px 12px", textAlign: "center", color: "var(--ink-soft)", fontSize: 12, marginBottom: 12 }}><Icon name="lock" /> Your talents awaken at <b>level 10</b>. Keep adventuring!</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {talentRows(char).map((row) => {
                  const unlocked = char.level >= row.level;
                  const chosen = char.talents?.[row.level];
                  return (
                    <div key={row.level} style={{ opacity: unlocked ? 1 : 0.55 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ color: row.level === 60 ? "var(--rubric)" : (row.level === 40 ? "var(--bole)" : "var(--gilt)"), fontSize: 12, fontWeight: 700, fontFamily: "Georgia, serif" }}>Lv{row.level} · {row.tier}</span>
                        {!unlocked && <span style={{ color: "var(--ink-faint)", fontSize: 10 }}><Icon name="lock" /> Level {row.level}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {row.options.map((o) => {
                          const sel = chosen === o.id;
                          return (
                            <button key={o.id} disabled={!unlocked} onClick={() => selectTalent(row.level, o.id)} style={{ flex: 1, minWidth: 0, background: sel ? "var(--raised)" : "var(--sunk)", border: `1.5px solid ${sel ? "var(--gilt)" : "var(--hairline)"}`, borderRadius: 9, padding: "8px 5px", cursor: unlocked ? "pointer" : "default" }}>
                              <div style={{ fontSize: 18 }}><EmojiIcon emoji={o.icon} /></div>
                              <div style={{ color: sel ? "var(--gilt)" : "var(--ink)", fontSize: 10.5, fontWeight: 700, marginTop: 2 }}>{o.name}</div>
                              <div style={{ color: "var(--ink-soft)", fontSize: 8.8, marginTop: 2, lineHeight: 1.35 }}>{o.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {tab === "market" && (
          <div>
            <div className="eyebrow"><span>The market</span></div>
            {MARKET_STALLS.map((st) => {
              const note = st.dest === "gambitshop" && char.level < GAMBIT_UNLOCK_LEVEL
                ? `Opens at level ${GAMBIT_UNLOCK_LEVEL}`
                : st.dest === "battlemaster" ? `${char.arenaTokens || 0} tokens` : null;
              return (
                <button key={st.dest} className="gateway" onClick={() => {
                  if (st.dest === "vendor") {
                    const c = charRef.current;
                    if (!c.tutorial?.visitedVendor) commitChar({ ...c, tutorial: { ...(c.tutorial || {}), visitedVendor: true } });
                  }
                  setTab(st.dest);
                }}>
                  <span className="mark"><Icon name={st.icon} size={18} /></span>
                  <span className="gateway-body"><b>{st.name}</b><span>{st.blurb}</span></span>
                  {note && <span className="chip">{note}</span>}
                  <span className="gateway-more">&rsaquo;</span>
                </button>
              );
            })}
          </div>
        )}

        {tab === "temper" && (() => {
          const acc = "#f0913e";
          // Equipped and LOCKED gear only. The list used to be every temperable item a player
          // owned, which at a full bank is 120+ rows to scroll past to reach the piece they
          // actually wear — and tempering something you are about to vendor is never the intent.
          // Locking is the existing "I care about this" signal, so it doubles as the opt-in for
          // anything not currently worn.
          const items = [
            ...Object.values(char.equipment || {}).filter(isTemperable),
            // The parked set. Without this a player's arena kit is untemperable for as long as it
            // is put away, which is most of the time.
            ...Object.values(loadoutStash(char) || {}).filter(isTemperable),
            ...(char.inventory || []).filter((it) => isTemperable(it) && it.locked),
          ];
          const sel = temperSel ? items.find((i) => i.id === temperSel) : null;
          const fs = char.failStacks || 0;
          const dblPct = Math.round(doubleChanceFor(fs) * 100);
          // ----- detail computations -----
          let detail = null;
          if (sel) {
            const lines = Array.isArray(sel.lines) ? sel.lines : SECONDARY_KEYS.filter((k) => (sel.stats[k] || 0) > 0).map((k) => ({ stat: k, base: sel.stats[k] }));
            const tRank = sel.temper || 0, tBonus = sel.temperBonus || 0, rerolls = sel.rerolls || 0;
            detail = { lines, tRank, tBonus, rerolls };
          }
          return (
          <div>
            <div className="head">
              <button onClick={() => setTab("market")} className="head-back">&#8592; Market</button>
              <span className="head-title"><Icon name="anvil" size={15} /> Tempering Forge</span>
            </div>
            <div className="statline">
              <span><Icon name="coin" size={12} /> <b>{char.gold.toLocaleString()}</b></span>
              <span><Icon name="gem" size={12} /> <b>{char.ven || 0}</b></span>
              {/* Distinct from a piece's forge heat: this one is character-wide and pays a DOUBLE
                  stat grant rather than a better chance, so it reads as its own counter. */}
              <span style={{ marginLeft: "auto" }}><Icon name="spark" size={12} /> <b>{fs}</b> lucky stack{fs === 1 ? "" : "s"} · {dblPct}% double</span>
            </div>

            {!sel && (
              <div>
                <div className="ledger-note" style={{ margin: "10px 0" }}>Select a piece to temper or reroll. Relics cannot be forged.</div>
                {items.length === 0 && <div className="empty">No forgeable gear.</div>}
                {items.map((it) => {
                  // Banked heat is real, paid-for progress. It has to be visible from the list,
                  // or a player cannot tell which piece they were part-way through.
                  const heat = (it.temper || 0) >= TEMPER_CFG.safeMax && (it.temper || 0) < TEMPER_CFG.maxRank
                    ? temperOdds(it, (it.temper || 0) + 1) : null;
                  return (
                    <button key={it.id} onClick={() => { setTemperSel(it.id); setTemperMode("temper"); setTemperProtect(false); }}
                      className="item item-tap" style={{ width: "100%" }}>
                      <span className="mark"><GameIcon icon={it.icon} size={20} /></span>
                      <span className="item-body">
                        <span className={`item-name ${rarClass(it.rarity)}`}>{it.name}{temperSuffix(it)}</span>
                        <span className="item-meta">
                          {slotById(it.slotId)?.name} · ilvl {it.ilvl}{it.rerolls ? ` · ${it.rerolls} rerolls` : ""}
                        </span>
                        {heat && heat.stacks > 0 && (
                          <span className={heat.chance >= 1 ? "state is-open" : "state is-soon"}>
                            <Icon name="flame" size={10} /> {heat.chance >= 1 ? "next is guaranteed" : `${Math.round(heat.chance * 100)}% · ${heat.stacks} heat`}
                          </span>
                        )}
                      </span>
                      {it.temper ? <span className="item-delta is-up">+{it.temper}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}

            {sel && detail && (() => {
              const rc = rarityById(sel.rarity).color;
              const { lines, tRank, tBonus, rerolls } = detail;
              return (
              <div>
                <div className="item">
                  <span className="mark"><GameIcon icon={sel.icon} size={24} /></span>
                  <div className="item-body">
                    <span className={`item-name ${rarClass(sel.rarity)}`}>{sel.name}{temperSuffix(sel)}</span>
                    <span className="item-meta">{rarityById(sel.rarity).name} · {slotById(sel.slotId)?.name} · ilvl {sel.ilvl}</span>
                  </div>
                  <button onClick={() => setTemperSel(null)} className="link">Close</button>
                </div>
                <div className="leaves">
                  <button onClick={() => setTemperMode("temper")} className={`leaf${temperMode === "temper" ? " is-open" : ""}`}>
                    <Icon name="anvil" size={13} /> Temper
                  </button>
                  <button onClick={() => setTemperMode("reroll")} className={`leaf${temperMode === "reroll" ? " is-open" : ""}`}>
                    <Icon name="dice" size={13} /> Reroll stats
                  </button>
                </div>

                {temperMode === "temper" && (() => {
                  if (tRank >= TEMPER_CFG.maxRank) return <div style={{ color: acc, textAlign: "center", padding: 16, fontWeight: 700 }}><Icon name="spark" /> Maxed at +10 — its lines carry +15 each.</div>;
                  const target = tRank + 1;
                  const cost = temperCost(target);
                  const risky = tRank >= TEMPER_CFG.safeMax;
                  const odds = temperOdds(sel, target);
                  const protectOn = temperProtect && risky;
                  const venCost = risky ? (TEMPER_CFG.protectVen[target] || 0) : 0;
                  const eDestroy = protectOn ? 0 : odds.destroy;
                  const eSuccess = Math.round(odds.chance * 100);
                  const grant = TEMPER_CFG.grantAtRank(target);
                  const canGold = char.gold >= cost, canVen = !protectOn || (char.ven || 0) >= venCost;
                  return (
                    <div className={`bench${canGold && canVen ? " is-ready" : ""}`}>
                      <div className="ledger-line">
                        <span className="ledger-label">+{tRank} &#8594; <b>+{target}</b></span>
                        <span className="ledger-val">{cost.toLocaleString()}g</span>
                      </div>
                      <div className="bench-what">
                        Each secondary line: <b>+{tBonus}</b> &#8594; <b>+{tBonus + grant}</b> on success{dblPct > 0 ? `, doubled ${dblPct}% of the time` : ""}.
                      </div>
                      {!risky ? (
                        <div className="aside-note is-gain" style={{ marginTop: 10, marginBottom: 10 }}>
                          <span>Guaranteed up to +{TEMPER_CFG.safeMax}. Beyond that it can fail.</span>
                        </div>
                      ) : (
                        <div className="ledger" style={{ marginTop: 10 }}>
                          <div className="ledger-row">
                            <div className="ledger-line">
                              <span className="ledger-label">Success</span>
                              <span className="ledger-val is-gear">{odds.chance >= 1 ? "guaranteed" : `${eSuccess}%`}</span>
                            </div>
                          </div>
                          {/* There is no failure to have a consequence once the ladder is full, so
                              quoting a destroy chance here would just be frightening and untrue. */}
                          {odds.chance < 1 && (
                            <div className="ledger-row">
                              <div className="ledger-line">
                                <span className="ledger-label">On failure — destroyed</span>
                                <span className="ledger-val" style={{ color: protectOn ? "var(--verdigris)" : "var(--rubric)" }}>
                                  {protectOn ? "0% — warded" : `${Math.round(eDestroy * 100)}%`}
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="ledger-row">
                            {odds.chance >= 1
                              ? <div className="ledger-note" style={{ textAlign: "center" }}><Icon name="flame" size={11} /> The forge is ready — this attempt cannot fail.</div>
                              : <>
                                  <div className="ledger-line">
                                    <span className="ledger-label"><Icon name="flame" size={12} /> Forge heat</span>
                                    <span className="ledger-val">{odds.stacks}/{odds.cap} · +{Math.round(odds.step * 100)}% each</span>
                                  </div>
                                  <div className="meter" style={{ marginTop: 5 }}>
                                    <i style={{ width: `${Math.round((odds.stacks / odds.cap) * 100)}%` }} />
                                  </div>
                                  <div className="ledger-note">
                                    Guaranteed after {odds.left} more failure{odds.left === 1 ? "" : "s"}. Heat is kept on this piece, for this rank only — and is lost if it is destroyed.
                                  </div>
                                </>}
                          </div>
                        </div>
                      )}
                      {risky && (
                        <button onClick={() => setTemperProtect((v) => !v)} className={`go is-quiet${protectOn ? " is-on" : ""}`}>
                          <Icon name="shield" size={13} /> {protectOn ? "Warded" : "Ward"} · <Icon name="gem" size={11} /> {venCost}
                          {protectOn ? " — a failure costs the gold, never the piece" : ""}
                        </button>
                      )}
                      <button onClick={() => temperItem(sel, protectOn)} disabled={!canGold || !canVen} className="go">
                        {!canGold ? `Need ${cost.toLocaleString()}g` : !canVen ? `Need ${venCost} Ven` : <><Icon name="anvil" size={14} /> Temper to +{target}</>}
                      </button>
                    </div>
                  );
                })()}

                {temperMode === "reroll" && (() => {
                  if (!lines.length) return <div className="empty">This item has no secondary stat lines to reroll.</div>;
                  const cost = rerollCost(rerolls);
                  const ranges = TEMPER_CFG.reroll.pool.map((s) => rerollRange(sel.ilvl, sel.rarity, s, sel.abyss));
                  const rlo = Math.min(...ranges.map((r) => r[0])), rhi = Math.max(...ranges.map((r) => r[1]));
                  const canGold = char.gold >= cost;
                  return (
                    <div className={`bench${canGold ? " is-ready" : ""}`}>
                      <div className="bench-what" style={{ marginTop: 0 }}>
                        Reroll a line to a random secondary — Stamina, Leech, Resilience, Versatility, Cooldown Reduction or Crit Damage. Duplicates are re-rolled away.
                      </div>
                      <div className="bench-cost">
                        <span className={canGold ? "is-held" : "is-short"}>{cost.toLocaleString()}g</span>
                        <span>rolls {rlo}–{rhi}</span>
                        <span>{rerolls} so far</span>
                      </div>
                      <div className="ledger" style={{ marginTop: 10, marginBottom: 0 }}>
                        {lines.map((ln, i) => (
                          <div key={i} className="ledger-row">
                            <div className="ledger-line">
                              <span className="ledger-label">{STAT_LABEL[ln.stat]} <span className="item-meta" style={{ display: "inline" }}>+{ln.base}</span></span>
                              <span className="ledger-val">
                                <button onClick={() => rerollLine(sel, i)} disabled={!canGold} className="mini">Reroll</button>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })()}
          </div>
          );
        })()}

        {/* ============ THE BATTLEMASTER ============ */}
        {tab === "battlemaster" && (() => {
          const acc = "#ffd479";
          const tok = char.arenaTokens || 0;
          const gear = BM_SHOP.filter((e) => e.kind === "setPiece");
          const runes = BM_SHOP.filter((e) => e.kind === "gem");
          const goods = BM_SHOP.filter((e) => !["setPiece", "gem"].includes(e.kind));
          const owned = setPiecesEquipped(char, BM_SET_ID);
          const row = (e) => {
            const left = bmLeft(char, e), can = bmCanBuy(char, e), poor = tok < e.cost;
            return (
              <button key={e.id} disabled={!can}
                onClick={() => (e.kind === "setPiece" ? setBmPick(e) : buyBattlemaster(e))}
                aria-label={`Buy ${e.name}`}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 11,
                  background: can ? "var(--raised)" : "var(--raised)",
                  border: `1px solid ${can ? "var(--gilt)" : "var(--verdigris)"}`, borderRadius: 10,
                  padding: "11px 12px", marginBottom: 8, cursor: can ? "pointer" : "default",
                  opacity: can ? 1 : 0.55 }}>
                <span style={{ fontSize: 24, width: 28, textAlign: "center" }}><EmojiIcon emoji={e.icon} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: can ? acc : "var(--ink-soft)", fontWeight: 700, fontSize: 13, display: "block" }}>{e.name}</span>
                  <span style={{ color: "var(--ink-soft)", fontSize: 10.5, lineHeight: 1.4, display: "block" }}>{e.desc}</span>
                  {e.limit != null && (
                    <span style={{ color: left > 0 ? "var(--verdigris)" : "var(--rubric)", fontSize: 9.5 }}>
                      {left > 0 ? `${left} of ${e.limit} left ${e.per === "life" ? "(lifetime)" : "this week"}`
                                : `Limit reached ${e.per === "life" ? "(lifetime)" : "— resets Monday"}`}
                    </span>
                  )}
                </span>
                <span style={{ color: poor ? "var(--rubric)" : acc, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}><Icon name="ticket" /> {e.cost}</span>
              </button>
            );
          };
          const head = (t, sub) => (
            <div style={{ marginTop: 14, marginBottom: 7 }}>
              <div style={{ color: acc, fontSize: 11, fontWeight: 800, letterSpacing: 0.7 }}>{t}</div>
              {sub && <div style={{ color: "var(--ink-faint)", fontSize: 10, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
            </div>
          );
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <button onClick={() => setTab("market")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Market</button>
                <span style={{ color: acc, fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="shield" /> Battlemaster</span>
              </div>
              <div style={{ background: "var(--raised)", border: "1px solid var(--bole)", borderRadius: 10, padding: "10px 12px", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--ink-soft)", fontSize: 11 }}>Arena Tokens · earned only in the Arena</span>
                <span style={{ color: acc, fontSize: 19, fontWeight: 800 }}><Icon name="ticket" /> {tok.toLocaleString()}</span>
              </div>
              <div style={{ color: "var(--ink-faint)", fontSize: 10, lineHeight: 1.5, marginBottom: 2 }}>
                Nothing here can be bought with gold or Ven. A rated win pays {ARENA.winTokens} tokens
                (up to {ARENA.winTokens + ARENA.streakBonusMax * ARENA.streakBonusPer} on a streak) and a loss still pays {ARENA.lossTokens}.
              </div>

              {head("BATTLEMASTER'S REGALIA", `Artifact, item level ${BM_PIECE_ILVL}, three sockets each. Every piece worn: take ${Math.round(GEAR_SETS[BM_SET_ID].perPiece * 100)}% less damage in the Arena — ${owned}/4 worn, ${Math.round((1 - Math.pow(1 - GEAR_SETS[BM_SET_ID].perPiece, owned)) * 100)}% now. Temperable to +${BM_TEMPER_MAX} with tokens (${bmTemperTotal()} for the lot); rerolls stay on gold.`)}
              {gear.map(row)}

              {head("ARENA RUNES", "Artifact gems for any socket. Neither stacks — a second copy does nothing.")}
              {runes.map(row)}

              {head("SUPPLIES")}
              {goods.map(row)}
              <div style={{ height: 16 }} />
            </div>
          );
        })()}

        {/* Main-stat chooser. Asked BEFORE the tokens are spent, and cancellable, because the
            choice is permanent — a set piece never re-forges, so this is the only time it is made. */}
        {bmPick && (() => {
          const cls = CLASSES.find((x) => x.id === char.cls) || {};
          const pair = ARTIFACT_STATS[char.cls] || ["str", "agi"];
          const opts = [
            { mains: pair, label: `${STAT_LABEL[pair[0]]} + ${STAT_LABEL[pair[1]]}`, sub: "Both main stats, the standard artifact shape — more total stat, spread across two." },
            ...pair.map((k) => ({ mains: [k], label: `${STAT_LABEL[k]} only`,
              sub: `Everything in ${STAT_LABEL[k]}, and a focused piece at ilvl ${BM_PIECE_ILVL} also earns ${k === "int" ? "Spell" : "Attack"} Power.` })),
          ];
          return (
            <div onClick={() => setBmPick(null)} className="veil">
              <div onClick={(e) => e.stopPropagation()} className="sheet is-warn">
                <div className="sheet-title"><EmojiIcon emoji={bmPick.icon} /> {bmPick.name}</div>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>
                  Choose its main stat. This is permanent — a set piece is fixed at item level {BM_PIECE_ILVL} and never re-forges.
                </div>
                {opts.map((o) => (
                  <button key={o.label} onClick={() => buyBattlemaster(bmPick, o.mains)}
                    aria-label={`Forge with ${o.label}`}
                    style={{ width: "100%", textAlign: "left", background: "var(--raised)", border: "1.5px solid var(--bole)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                    <span style={{ color: "var(--bole)", fontWeight: 800, fontSize: 13, display: "block" }}>{o.label}</span>
                    <span style={{ color: "var(--ink-soft)", fontSize: 10.5, lineHeight: 1.45 }}>{o.sub}</span>
                  </button>
                ))}
                <button onClick={() => setBmPick(null)} className="go is-quiet">
                  Cancel — keep my {bmPick.cost} tokens
                </button>
              </div>
            </div>
          );
        })()}

        {tab === "gambitshop" && (() => {
          const g = char.gambits || { owned: {}, shards: {} };
          const rarCol = (id) => rarityById(gambitById(id)?.rarity || "common").color;
          const accessible = ALL_GAMBITS.filter((x) => gambitAccessible(char, x.id)); // hide skills this character can't use
          if ((char.level || 1) < GAMBIT_UNLOCK_LEVEL) return (
            <div>
              <div className="head">
                <button onClick={() => setTab("market")} className="head-back">&#8592; Market</button>
                <span className="head-title"><Icon name="arena" size={15} /> Gambit Shop</span>
              </div>
              <div className="bench">
                <div className="sheet-mark"><Icon name="lock" size={22} /></div>
                <div className="bench-name" style={{ textAlign: "center" }}>Gambits unlock at level {GAMBIT_UNLOCK_LEVEL}</div>
                <div className="bench-what" style={{ textAlign: "center" }}>
                  Reach level {GAMBIT_UNLOCK_LEVEL} to automate your skills with if/then gambits. You are level {char.level}.
                </div>
              </div>
            </div>
          );
          return (
            <div>
              <div className="head">
                <button onClick={() => setTab("market")} className="head-back">&#8592; Market</button>
                <span className="head-title"><Icon name="arena" size={15} /> Gambit Shop</span>
                <span className="price"><Icon name="coin" size={11} /> {char.gold.toLocaleString()}</span>
              </div>
              <div className="leaves">
                {[["roll", "Roll"], ["shards", "Shards"], ["collection", "Collection"]].map(([id, label]) => (
                  <button key={id} onClick={() => setGambitShopTab(id)} className={`leaf${gambitShopTab === id ? " is-open" : ""}`}>{label}</button>
                ))}
              </div>

              {gambitShopTab === "roll" && (
                <div>
                  <div className="bench">
                    <div className="sheet-mark"><Icon name="dice" size={22} /></div>
                    <div className="bench-name" style={{ textAlign: "center" }}>Gambit Gacha</div>
                    <div className="bench-what" style={{ textAlign: "center" }}>
                      Roll for <b>if</b> and <b>then</b> gambits. If-conditions are the rarer half; duplicates become shards.
                    </div>
                    <div className="sheet-acts">
                      <button onClick={() => gambitRoll(1)} disabled={char.gold < GAMBIT_ROLL_COST} className="go">
                        Roll · {GAMBIT_ROLL_COST.toLocaleString()}g
                      </button>
                      <button onClick={() => gambitRoll(10)} disabled={char.gold < GAMBIT_ROLL10_COST} className="go">
                        Roll ten · {GAMBIT_ROLL10_COST.toLocaleString()}g
                      </button>
                    </div>
                  </div>
                  <div className="ledger-note" style={{ textAlign: "center" }}>
                    Owned {accessible.filter((x) => g.owned?.[x.id]).length}/{accessible.length} · {shardTotal(char)} shards
                  </div>
                </div>
              )}

              {gambitShopTab === "shards" && (
                <div>
                  <div className="ledger-note" style={{ marginBottom: 10 }}>
                    Duplicate pulls become shards. Spend {SHARD_EXCHANGE} of them on any gambit you do not own yet.
                  </div>
                  {Object.keys(g.shards || {}).length > 0 && (
                    <div className="picks">
                      {Object.entries(g.shards).map(([id, n]) => (
                        <span key={id} className={`pick is-on ${rarClass(gambitById(id)?.rarity || "common")}`}>
                          {gambitById(id)?.label || id} <small>{n}</small>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="eyebrow"><span>Redeem a locked gambit</span><span>{shardTotal(char)} shards</span></div>
                  <div>
                    {accessible.filter((x) => !g.owned?.[x.id]).map((x) => {
                      const canBuy = shardTotal(char) >= SHARD_EXCHANGE;
                      return (
                        <div key={x.id} className="item">
                          <span className="mark"><EmojiIcon emoji={x.icon} size={16} /></span>
                          <div className="item-body">
                            <span className={`item-name ${rarClass(x.rarity)}`}>{x.type === "if" ? "IF " : "THEN "}{x.label}</span>
                            <span className="item-meta">{x.rarity}</span>
                          </div>
                          <div className="item-acts">
                            <MiniBtn onClick={() => exchangeShards(x.id)} disabled={!canBuy} tone={canBuy ? "gain" : undefined}>
                              {SHARD_EXCHANGE} shards
                            </MiniBtn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {gambitShopTab === "collection" && (
                <div>
                  {["if", "then"].map((typ) => (
                    <React.Fragment key={typ}>
                      <div className="eyebrow"><span>{typ === "if" ? "If — conditions" : "Then — actions"}</span></div>
                      {accessible.filter((x) => x.type === typ).map((x) => { const owned = !!g.owned?.[x.id]; return (
                        <div key={x.id} className={`item${owned ? "" : " is-shut"}`} style={owned ? undefined : { opacity: 0.5 }}>
                          <span className="mark"><EmojiIcon emoji={owned ? x.icon : "❓"} size={16} /></span>
                          <div className="item-body">
                            <span className={owned ? `item-name ${rarClass(x.rarity)}` : "item-name"}>{owned ? x.label : "Not yet found"}</span>
                            <span className="item-meta">{x.rarity}{g.shards?.[x.id] ? ` · ${g.shards[x.id]} shards` : ""}</span>
                          </div>
                        </div>
                      ); })}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {tab === "gambits" && (() => {
          const g = char.gambits || { owned: {}, rules: {}, slots: {} };
          const pool = equippedSkills(char); // only abilities on your bar can be automated
          const skName = gambitSkill && pool.some((s) => s.name === gambitSkill) ? gambitSkill : (pool[0] && pool[0].name);
          const ownedIfs = GAMBIT_IFS.filter((x) => g.owned?.[x.id]);
          const skillIfs = ownedIfs.filter((x) => !x.id.startsWith("if_no_")); // buff-check IFs are General-only
          // Skill mode THEN: only this skill's own "use" gambit (potions/scrolls live in the General tab)
          // The veto is offered alongside this skill's own "use" gambit; consumables stay General.
          const ownedThens = GAMBIT_THENS.filter((x) => g.owned?.[x.id] && (x.skill === skName || x.kind === "veto"));
          const sk = pool.find((s) => s.name === skName);
          // Gambits are keyed by BAR SLOT, so a rule stays put when you swap the ability in it.
          const slotNo = Math.max(1, (char.selectedSkills || []).indexOf(skName) + 1);
          const rules = g.rules?.[slotNo] || [];
          const slots = gambitSlotsFor(char, slotNo);
          if ((char.level || 1) < GAMBIT_UNLOCK_LEVEL) return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("gear")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Armory</button>
                <span style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="target" /> Equip Gambits</span>
                <span />
              </div>
              <div style={{ background: "var(--raised)", border: "1px solid var(--rar-epic)", borderRadius: 12, padding: "22px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 34, marginBottom: 6 }}>🔒</div>
                <div style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 15 }}>Gambits unlock at level {GAMBIT_UNLOCK_LEVEL}</div>
              </div>
            </div>
          );
          const partBtn = (part, slotIdx, list, onPick, curVal) => (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {list.length === 0 && <span style={{ color: "var(--ink-faint)", fontSize: 10 }}>None owned — roll in the Gambit Shop.</span>}
              {list.map((x) => { const sel = curVal === x.id; return (
                <button key={x.id} onClick={() => onPick(x.id)} style={{ background: sel ? "var(--rar-epic)" : "var(--raised)", border: `1px solid ${sel ? "var(--rar-epic)" : rarityById(x.rarity).color + "44"}`, borderRadius: 6, color: sel ? "var(--rar-epic)" : "var(--verdigris)", fontSize: 10, fontWeight: 600, padding: "4px 7px", cursor: "pointer" }}><EmojiIcon emoji={x.icon} /> {x.label}</button>
              ); })}
            </div>
          );
          const genRules = g.general || [];
          const genSlots = generalSlotsFor(char);
          const conThens = GAMBIT_THENS.filter((x) => g.owned?.[x.id] && x.kind === "consumable"); // General is for consumables
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button onClick={() => setTab("gear")} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Armory</button>
                <span style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="target" /> Equip Gambits</span>
                <span />
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["skill", "🎯 By Skill"], ["general", "⚙️ General"]].map(([id, label]) => (
                  <button key={id} onClick={() => setGambitMode(id)} style={{ flex: 1, background: gambitMode === id ? "var(--verdigris)" : "var(--sunk)", border: `1px solid ${gambitMode === id ? "var(--rar-epic)" : "var(--hairline)"}`, borderRadius: 8, color: gambitMode === id ? "var(--rar-epic)" : "var(--ink-faint)", padding: "8px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
                ))}
              </div>

              {gambitMode === "skill" && (<>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 8 }}>Pick a skill, then set its <b>IF</b> condition and <b>THEN</b> action. It fires automatically in combat.</div>
                {/* The system asks a lot before it gives anything back. This lays down a working
                    default from the gambits already owned, so a player who does not want to learn
                    priority order still gets a bar that fires. */}
                <button onClick={applyAutoGambit}
                  style={{ width: "100%", background: "var(--raised)", border: "1.5px solid var(--rar-epic)", borderRadius: 10, color: "var(--rar-epic)", fontSize: 12.5, fontWeight: 700, padding: "10px 8px", marginBottom: 10, cursor: "pointer" }}>
                  <Icon name="gear" /> Auto Gambit — set them up for me
                  <span style={{ display: "block", fontSize: 10, color: "var(--ink-soft)", fontWeight: 500, marginTop: 2 }}>
                    Writes a sensible rule for every skill on your bar, using only gambits you own. Overwrites those slots.
                  </span>
                </button>
                <select value={skName} onChange={(e) => setGambitSkill(e.target.value)} style={{ width: "100%", background: "var(--sunk)", border: "1px solid var(--rule)", borderRadius: 8, color: "var(--ink)", fontSize: 13, padding: "8px 10px", marginBottom: 12, cursor: "pointer" }}>
                  {pool.map((s) => {
                    // Slots are addressed by number now — the same numbers the "Skill N on
                    // cooldown" conditions refer to, and the order gambits are evaluated in.
                    const n = (char.selectedSkills || []).indexOf(s.name) + 1;
                    const configured = g.rules?.[n]?.some((r) => r?.if && r?.then);
                    return <option key={s.name} value={s.name}>{`Skill ${n}`} · <EmojiIcon emoji={s.icon} /> {s.name}{configured ? " ✓" : ""}</option>;
                  })}
                </select>
                {sk && <div style={{ color: "var(--ink-soft)", fontSize: 10.5, marginBottom: 8 }}>
                  <Icon name="gear" /> <b style={{ color: "var(--rar-epic)" }}>Skill {slotNo}</b> — gambits fire in slot order, so Skill 1 has the highest priority.
                </div>}
                {sk && Array.from({ length: slots }).map((_, i) => (
                  <div key={i} style={{ background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ color: "var(--rar-epic)", fontSize: 11, fontWeight: 700 }}>Priority {i + 1}</div>
                      {slots > 1 && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => moveGambitRule(slotNo, i, -1)} disabled={i === 0} style={{ background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 5, color: i === 0 ? "var(--ink-faint)" : "var(--rar-epic)", fontSize: 11, padding: "2px 7px", cursor: i === 0 ? "default" : "pointer" }}>▲</button>
                          <button onClick={() => moveGambitRule(slotNo, i, 1)} disabled={i === slots - 1} style={{ background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 5, color: i === slots - 1 ? "var(--ink-faint)" : "var(--rar-epic)", fontSize: 11, padding: "2px 7px", cursor: i === slots - 1 ? "default" : "pointer" }}>▼</button>
                        </div>
                      )}
                    </div>
                    <div style={{ color: "var(--rubric)", fontSize: 10.5, fontWeight: 700 }}>IF</div>
                    {partBtn("if", i, skillIfs, (id) => setGambitPart(slotNo, i, "if", id), rules[i]?.if)}
                    <div style={{ color: "var(--ink-soft)", fontSize: 10.5, fontWeight: 700, marginTop: 8 }}>THEN</div>
                    {partBtn("then", i, ownedThens, (id) => setGambitPart(slotNo, i, "then", id), rules[i]?.then)}
                  </div>
                ))}
                {slots < 2 && (
                  <button onClick={() => buyGambitSlot(slotNo)} style={{ width: "100%", background: (char.ven || 0) >= GAMBIT_SLOT_VEN ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${(char.ven || 0) >= GAMBIT_SLOT_VEN ? "var(--verdigris)" : "var(--ink)"}`, borderRadius: 8, color: (char.ven || 0) >= GAMBIT_SLOT_VEN ? "var(--ink-soft)" : "var(--ink-faint)", fontSize: 12, fontWeight: 700, padding: 10, cursor: "pointer" }}>➕ Second gambit for this skill · 💎 {GAMBIT_SLOT_VEN}</button>
                )}
              </>)}

              {gambitMode === "general" && (<>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 10 }}>General gambits automate your <b>consumables</b> — e.g. <i>if your HP ≤ 20%, use a Healing Potion</i>, or <i>if a Strength scroll is inactive, use one</i>. You have {genSlots} slots (2 free).</div>
                {Array.from({ length: genSlots }).map((_, i) => (
                  <div key={i} style={{ background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ color: "var(--rar-epic)", fontSize: 11, fontWeight: 700 }}>Priority {i + 1}</div>
                      {genSlots > 1 && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => moveGeneralRule(i, -1)} disabled={i === 0} style={{ background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 5, color: i === 0 ? "var(--ink-faint)" : "var(--rar-epic)", fontSize: 11, padding: "2px 7px", cursor: i === 0 ? "default" : "pointer" }}>▲</button>
                          <button onClick={() => moveGeneralRule(i, 1)} disabled={i === genSlots - 1} style={{ background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 5, color: i === genSlots - 1 ? "var(--ink-faint)" : "var(--rar-epic)", fontSize: 11, padding: "2px 7px", cursor: i === genSlots - 1 ? "default" : "pointer" }}>▼</button>
                        </div>
                      )}
                    </div>
                    <div style={{ color: "var(--rubric)", fontSize: 10.5, fontWeight: 700 }}>IF</div>
                    {partBtn("if", i, ownedIfs, (id) => setGeneralPart(i, "if", id), genRules[i]?.if)}
                    <div style={{ color: "var(--ink-soft)", fontSize: 10.5, fontWeight: 700, marginTop: 8 }}>THEN</div>
                    {partBtn("then", i, conThens, (id) => setGeneralPart(i, "then", id), genRules[i]?.then)}
                  </div>
                ))}
                {genSlots < 5 && (
                  <button onClick={buyGeneralSlot} style={{ width: "100%", background: (char.ven || 0) >= GENERAL_SLOT_COSTS[genSlots - 2] ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${(char.ven || 0) >= GENERAL_SLOT_COSTS[genSlots - 2] ? "var(--verdigris)" : "var(--ink)"}`, borderRadius: 8, color: (char.ven || 0) >= GENERAL_SLOT_COSTS[genSlots - 2] ? "var(--ink-soft)" : "var(--ink-faint)", fontSize: 12, fontWeight: 700, padding: 10, cursor: "pointer" }}>➕ General gambit {genSlots + 1} · 💎 {GENERAL_SLOT_COSTS[genSlots - 2]}</button>
                )}
              </>)}
            </div>
          );
        })()}

        {tab === "supply" && (
          <div>
            <div className="head">
              <button onClick={() => setTab("market")} className="head-back">&#8592; Market</button>
              <span className="head-title"><Icon name="mail" size={15} /> Supply Master</span>
              <span className="price"><Icon name="coin" size={11} /> {char.gold.toLocaleString()}</span>
            </div>
            <div className="bulk">
              <span className="bulk-label">How many</span>
              <button onClick={() => setSupplyQty((q) => Math.max(1, q - 1))} className="bulk-step" aria-label="One fewer">&#8722;</button>
              <input type="number" value={supplyQty} min={1} className="bulk-n" aria-label="Quantity"
                onChange={(e) => setSupplyQty(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))} />
              <button onClick={() => setSupplyQty((q) => Math.min(999, q + 1))} className="bulk-step" aria-label="One more">+</button>
              {[10, 50, 100].map((n) => (
                <button key={n} onClick={() => setSupplyQty(n)} className={`pick${supplyQty === n ? " is-on" : ""}`}>{n}</button>
              ))}
            </div>
            <div>
              {SUPPLY_ITEMS.map((s) => {
                const owned = char.supplies?.[s.id] || 0; const total = s.price * Math.max(1, supplyQty); const afford = char.gold >= total;
                return (
                  <div key={s.id} className="item">
                    <span className="mark"><EmojiIcon emoji={s.icon} size={18} /></span>
                    <div className="item-body">
                      <span className="item-name">{s.name}</span>
                      <span className="item-meta">{s.price}g each · {owned} held</span>
                    </div>
                    <div className="item-acts">
                      <MiniBtn onClick={() => buySupply(s)} disabled={!afford} tone={afford ? "gain" : undefined}>
                        Buy {Math.max(1, supplyQty)} · {total.toLocaleString()}g
                      </MiniBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "vendor" && (
          <div>
            <div className="head">
              <span className="head-title" style={{ textAlign: "left" }}><Icon name="stall" size={15} /> Vendor</span>
              <span className="price"><Icon name="coin" size={11} /> {char.gold.toLocaleString()}</span>
            </div>

            {/* Permanent upgrades first: the Draught Belt is the one purchase a character cannot
                progress without, so it must not be buried under the consumable list. */}
            <div className="eyebrow"><span>Permanent upgrades</span></div>
            <div style={{ marginBottom: 18 }}>
              {VENDOR_UPGRADES.map((up) => {
                const owned = vendorUpgradeOwned(char, up.id);
                const canBuy = (char.gold || 0) >= up.cost;
                const wanted = (activeLesson(char) || {}).id === "autopot" && up.id === "autoPotion";
                return (
                  <div key={up.id} className="item"
                    style={wanted && !owned ? { animation: "tutflash 1.4s ease-in-out infinite" } : undefined}>
                    <span className="mark"><EmojiIcon emoji={up.icon} size={18} /></span>
                    <div className="item-body">
                      <span className="item-name">{up.name}{owned ? " ✓" : ""}</span>
                      <span className="item-stats">{up.desc}</span>
                    </div>
                    <div className="item-acts">
                      {owned
                        ? <span className="state is-open">owned</span>
                        : <MiniBtn onClick={() => buyVendorUpgrade(up)} tone={canBuy ? "gain" : undefined}>{up.cost.toLocaleString()}g</MiniBtn>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Buy consumables */}
            <div style={{ color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Consumables — for level {char.level}</div>
            <div className="bulk">
              <span className="bulk-label">How many</span>
              <button onClick={() => setVendorQty((q) => Math.max(1, q - 1))} className="bulk-step" aria-label="One fewer">&#8722;</button>
              <input type="number" value={vendorQty} min={1} className="bulk-n" aria-label="Quantity"
                onChange={(e) => setVendorQty(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))} />
              <button onClick={() => setVendorQty((q) => Math.min(999, q + 1))} className="bulk-step" aria-label="One more">+</button>
              {[10, 50, 100].map((n) => (
                <button key={n} onClick={() => setVendorQty(n)} className={`pick${vendorQty === n ? " is-on" : ""}`}>{n}</button>
              ))}
            </div>
            <div style={{ marginBottom: 18 }}>
              {CONSUMABLE_DEFS.map((def) => {
                const qty = Math.max(1, vendorQty);
                const price = consumablePrice(def, char.level) * qty;
                const owned = conTotal(char, def.id);
                const effectText = def.kind === "heal" ? `Restores ${potionHeal(char.level)} HP` : def.kind === "dmgbuff" ? `+${mightPct(char.level)}% damage · 5 min` : def.kind === "reducebuff" ? `−${wardPct(char.level)}% damage taken · 5 min` : `+${scrollAmount(char.level)} ${STAT_LABEL[def.stat]} · 1 hour`;
                const canBuy = char.gold >= price;
                return (
                  <div key={def.id} className="item">
                    <span className="mark"><EmojiIcon emoji={def.icon} size={18} /></span>
                    <div className="item-body">
                      <span className="item-name">{tieredName(def, char.level)}{owned > 0 ? <small className="item-meta" style={{ marginLeft: 6 }}>{owned} held</small> : null}</span>
                      <span className="item-stats">{effectText}</span>
                    </div>
                    <div className="item-acts">
                      <MiniBtn onClick={() => buyConsumable(def)} disabled={!canBuy} tone={canBuy ? "gain" : undefined}>Buy {qty} · {price.toLocaleString()}g</MiniBtn>
                      {owned > 0 && <MiniBtn onClick={() => useConsumable(def)}>Use</MiniBtn>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upgrades */}
            <div className="eyebrow"><span>Upgrades</span></div>
            <div className="item" style={{ marginBottom: 18 }}>
              <span className="mark"><Icon name="coin" size={18} /></span>
              <div className="item-body">
                <span className="item-name">Auto-sell downgrades</span>
                <span className="item-stats">Vendor looted gear that is not an upgrade</span>
              </div>
              <div className="item-acts">
                <MiniBtn onClick={() => commitChar({ ...charRef.current, autoSellDowngrades: !charRef.current.autoSellDowngrades })}
                  tone={char.autoSellDowngrades ? "gain" : undefined}>{char.autoSellDowngrades ? "On" : "Off"}</MiniBtn>
              </div>
            </div>

            {/* Sell equipment (collapsible, collapsed by default) */}
            <div className="eyebrow">
              <span>Sell gear · {char.inventory.length}</span>
              <button onClick={() => setSellOpen((s) => !s)} className="link">{sellOpen ? "hide" : "show"}</button>
            </div>
            {sellOpen && (
              <>
                {(() => {
                  const byRarity = char.inventory.reduce((m, it) => { (m[it.rarity] = m[it.rarity] || []).push(it); return m; }, {});
                  const dgCount = char.inventory.filter((i) => isDowngrade(char, i)).length;
                  return (
                    <div className="picks">
                      <button onClick={sellDowngrades} className="pick">Sell downgrades{dgCount ? ` · ${dgCount}` : ""}</button>
                      {RARITIES.filter((r) => byRarity[r.id]?.length).map((r) => (
                        <button key={r.id} onClick={() => sellByRarity(r.id)} className={`pick ${rarClass(r.id)}`}>
                          Sell {r.name} <small>{byRarity[r.id].length}</small>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {char.inventory.length === 0 && <div className="empty">No gear to sell.</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[...char.inventory].sort((a, b) => b.ilvl - a.ilvl || itemScore(b, char.cls) - itemScore(a, char.cls)).map((it) => (
                    <ItemCard key={it.id} item={it} cls={char.cls} compare={itemScore(char.equipment[it.slotId], char.cls)}
                      onClick={() => showItem(it, [
                        { label: "Compare", onClick: () => setCompareItem(it) },
                        { label: it.locked ? "🔓 Unlock" : "🔒 Lock", color: "#8fd0e0", onClick: () => toggleLock(it) },
                        ...(it.locked ? [] : [{ label: `Sell ${sellPrice(it)}g`, color: "var(--gilt)", onClick: () => sellItem(it) }]),
                      ])}>
                      <MiniBtn onClick={() => toggleLock(it)} color={it.locked ? "#8fd0e0" : "#667"}>{it.locked ? "🔒" : "🔓"}</MiniBtn>
                      {!it.locked && <MiniBtn onClick={() => sellItem(it)} color="#FFD700">Sell {sellPrice(it)}g</MiniBtn>}
                    </ItemCard>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ============ WORLD TAB (zones + dungeons) ============ */}
        {tab === "world" && (
          <div>
            <div className="eyebrow">
              <span>The adventure gate</span>
              <span>Level {char.level}</span>
            </div>
            {/* Two strips, not two rows of filled pills. The register you are reading
                in (Normal / Hard / Abyss) is the outer one and takes the leaves; what
                kind of content you are looking at is a filter under it. */}
            <div className="leaves">
              {[["normal", "Normal"], ["hard", "Hard"], ...(abyssOpen(char) ? [["abyss", "The Abyss"]] : [])].map(([id, label]) => (
                <button key={id} onClick={() => setDifficulty(id)} className={`leaf${difficulty === id ? " is-open" : ""}`}>{label}</button>
              ))}
            </div>
            {difficulty !== "abyss" && (
            <div className="toggles" style={{ marginBottom: 14 }}>
              {[["zones", "Zones"], ["dungeons", "Dungeons"], ["raids", "Raids"]].map(([id, label]) => (
                <button key={id} onClick={() => setWorldTab(id)} className={`toggle${worldTab === id ? " is-on" : ""}`}>{label}</button>
              ))}
            </div>
            )}

            {/* ============ THE ABYSS ============ */}
            {difficulty === "abyss" && (() => {
              const avg = avgEquippedIlvl(char);
              const geared = avg >= ABYSS.reqIlvl;
              const unlocked = abyssUnlocked(char), sel = abyssPlus(char);
              return (
                <div>
                  <div className="aside-note">
                    <b><Icon name="abyss" size={14} /> The Abyss</b>
                    <span>
                      Endless. No waves, no boss, nothing to clear — only how deep you can stand to go.
                      Every kill banks against the rank you are on; {ABYSS.killGoal.toLocaleString()} of them opens the next.
                    </span>
                    <div className="item-meta" style={{ marginTop: 6 }}>
                      <span className={geared ? "state is-open" : "state is-shut"}>ilvl {avg} · requires {ABYSS.reqIlvl}</span>
                    </div>
                    <div className="ledger-note">
                      ilvl {ABYSS.dropIlvl} drops, about one every {ABYSS.killsPerDrop} kills · {Math.round((1 - ABYSS.legendaryChance) * 100)}% epic, {Math.round(ABYSS.legendaryChance * 100)}% legendary
                    </div>
                  </div>
                  {Array.from({ length: ABYSS.maxPlus + 1 }, (_, p) => p).map((p) => {
                    const open = p <= unlocked, kills = abyssKills(char, p), done = abyssRankDone(char, p);
                    const t = abyssTierFor(p);
                    const canRun = open && geared && !battle;
                    return (
                      <div key={p} className={`dest${p === sel ? " is-here" : done ? " is-done" : ""}${open ? "" : " is-shut"}`}>
                        <div className="dest-head">
                          <span className="mark"><Icon name="abyss" size={20} /></span>
                          <div className="dest-body">
                            <div className="dest-name">
                              {abyssLabel(p)}
                              {p === sel && <span className="state is-open">current</span>}
                              {done && p !== sel && <span className="state is-open">cleared</span>}
                            </div>
                            <div className="item-meta">
                              ×{t.hp.toFixed(1)} health · ×{t.off.toFixed(1)} damage · +{Math.round(ABYSS.goldPerPlus * p * 100)}% gold · secondaries +{Math.round((abyssMult(p) - 1) * 100)}%
                            </div>
                          </div>
                        </div>
                        <div className="dest-bar">
                          <Bar current={Math.min(kills, ABYSS.killGoal)} max={ABYSS.killGoal} color="var(--rar-epic)" height={6}
                               label={done ? "Complete" : "Progress"} sub={`${Math.min(kills, ABYSS.killGoal).toLocaleString()}/${ABYSS.killGoal.toLocaleString()}`} />
                        </div>
                        <button disabled={!canRun} onClick={() => startAbyss(p)} aria-label={`Enter ${abyssLabel(p)}`} className="go">
                          {!open ? `Complete ${abyssLabel(p - 1)} first` : !geared ? `Requires ilvl ${ABYSS.reqIlvl}`
                            : battle ? "Finish current fight first" : `Descend to ${abyssLabel(p)}`}
                        </button>
                        {/* Parking. The Abyss is where a geared player leaves their character, so
                            the option belongs beside the descend button, not buried in a settings
                            screen — and only ranks already reached can be parked in. */}
                        {open && geared && (p <= OFFLINE_ABYSS_MAX ? (
                          <button onClick={() => toggleOfflineAbyss(p)} aria-label={`Park in ${abyssLabel(p)}`}
                            className={`go is-quiet${char.offlineAbyss === p ? " is-on" : ""}`}>
                            {char.offlineAbyss === p ? "Parked here — tap to stop" : "Park here while away"}
                          </button>
                        ) : (
                          <div className="ledger-note" style={{ marginTop: 8, textAlign: "center" }}>
                            Cannot be farmed while away — only {abyssLabel(OFFLINE_ABYSS_MAX)} can be parked in
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {difficulty === "hard" && (() => {
              const avg = avgEquippedIlvl(char);
              if (worldTab === "zones") return (
                <div>
                  <div className="aside-note is-warn">
                    <b><Icon name="flame" size={14} /> Hard Zones</b>
                    <span>Drop ilvl 65–70. Grind each kill goal to unlock the next.</span>
                    <div className="item-meta" style={{ marginTop: 6 }}>
                      <span className={avg >= 64 ? "state is-open" : "state is-shut"}>ilvl {avg} · requires 64</span>
                    </div>
                  </div>
                  {HARD_ZONES.map((hz) => {
                    const done = !!char.hardZoneDone?.[hz.id]; const unlocked = hardZoneUnlocked(char, avg, hz); const kills = char.hardKills?.[hz.id] || 0; const canRun = unlocked && !battle;
                    return (
                      <div key={hz.id} className={`dest${done ? " is-done" : ""}${unlocked || done ? "" : " is-shut"}`}>
                        <div className="dest-head">
                          <span className="mark"><EmojiIcon emoji={hz.icon} size={20} /></span>
                          <div className="dest-body">
                            <div className="dest-name">{hz.name} {done && <span className="state is-open">complete</span>}</div>
                            <div className="item-meta">Drops ilvl {hz.dropIlvl} · req ilvl {hz.reqIlvl}{hz.prev ? ` + ${hardZoneById(hz.prev)?.name}` : ""}</div>
                          </div>
                        </div>
                        <div className="dest-bar">
                          <Bar current={Math.min(kills, hz.killGoal)} max={hz.killGoal} color={done ? "var(--verdigris)" : "var(--rubric)"} height={6}
                               label="Kill goal" sub={`${kills.toLocaleString()} / ${hz.killGoal.toLocaleString()}`} />
                        </div>
                        <button disabled={!canRun} onClick={() => startHard(hz, "zone")} className="go">{!unlocked ? `Requires ilvl ${hz.reqIlvl}${hz.prev ? " + the zone before it" : ""}` : battle ? "Finish current fight first" : done ? "Farm again" : "Enter Hard Zone"}</button>
                        {/* Hard ZONES are parkable — they are endless kill-goal farm with nothing
                            on a lockout. Hard dungeons and the raid deliberately are not. */}
                        {unlocked && (
                          <button onClick={() => toggleOfflineHard(hz.id)} aria-label={`Park in ${hz.name}`}
                            className={`go is-quiet${char.offlineHardId === hz.id ? " is-on" : ""}`}>
                            {char.offlineHardId === hz.id ? "Parked here — tap to stop" : "Park here while away"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
              if (worldTab === "dungeons") return (
                <div>
                  {HARD_DUNGEONS.map((hd) => {
                    const unlocked = hardDungeonUnlocked(char, avg, hd); const bk = char.hardBossKills?.[hd.boss] || 0; const done = !!char.hardDungeonDone?.[hd.id]; const runsLeft = dungeonRunsLeft(char, hd.id); const canRun = unlocked && !battle && runsLeft > 0; const prevKills = hd.prevBoss ? (char.hardBossKills?.[hd.prevBoss] || 0) : null;
                    const hasTicket = (char.tickets?.dungeonReset || 0) > 0; const canTicket = unlocked && !battle && runsLeft <= 0 && hasTicket;
                    return (
                      <div key={hd.id} className={`dest${done ? " is-done" : ""}${unlocked || done ? "" : " is-shut"}`}>
                        <div className="dest-head">
                          <span className="mark"><EmojiIcon emoji={hd.icon} size={20} /></span>
                          <div className="dest-body">
                            <div className="dest-name">
                              {hd.name} {done && <span className="state is-open">cleared</span>}
                              <span className={`state ${runsLeft > 0 ? "is-open" : "is-shut"}`}>{runsLeft}/{DUNGEON_RUN_LIMIT} runs</span>
                            </div>
                            <div className="item-meta">Drops ilvl {hd.dropIlvl} · Boss: {hd.boss} · {hd.waves} waves</div>
                            <div className="ledger-note">{hd.reqIlvl ? `Unlock: ilvl ${hd.reqIlvl}` : `Unlock: ${prevKills}/${HARD_BOSS_REQ} ${hd.prevBoss}`}{hd.prevZone ? <> · <span className={char.hardZoneDone?.[hd.prevZone] ? "state is-open" : "state is-shut"}>{hardZoneById(hd.prevZone)?.name}{char.hardZoneDone?.[hd.prevZone] ? " done" : " unfinished"}</span></> : null}{hd.completeCount ? ` · clear: ${bk}/${hd.completeCount}` : ` · ${hd.boss}: ${bk}`}</div>
                          </div>
                        </div>
                        <button disabled={!canRun && !canTicket} onClick={() => startHard(hd, "dungeon", canTicket && !canRun)} className="go">{!unlocked ? (hd.reqIlvl && avg < hd.reqIlvl ? `Requires ilvl ${hd.reqIlvl}` : (hd.prevZone && !char.hardZoneDone?.[hd.prevZone]) ? `Complete ${hardZoneById(hd.prevZone)?.name}` : `${HARD_BOSS_REQ} ${hd.prevBoss} kills`) : battle ? "Finish current fight first" : runsLeft <= 0 ? (canTicket ? "Use a Reset Ticket" : "No runs left") : "Enter Hard Dungeon"}</button>
                      </div>
                    );
                  })}
                </div>
              );
              // raids
              const unlocked = hardRaidUnlocked(char); const done = !!char.hardDungeonDone?.[HARD_RAID.id]; const bk = char.hardBossKills?.[HARD_RAID.boss] || 0; const cd = raidCooldownLeft(char, HARD_RAID.id); const canRun = unlocked && !battle && cd <= 0;
              return (
                <div className={`dest${done ? " is-done" : ""}${unlocked || done ? "" : " is-shut"}`}>
                  <div className="dest-head">
                    <span className="mark"><EmojiIcon emoji={HARD_RAID.icon} size={24} /></span>
                    <div className="dest-body">
                      <div className="dest-name">
                        {HARD_RAID.name} {done && <span className="state is-open">cleared</span>}
                        {cd > 0 && <span className="state is-shut">{fmtClock(cd)}</span>}
                      </div>
                      <div className="item-meta">Drops ilvl {HARD_RAID.dropIlvl} · Boss: {HARD_RAID.boss} · {HARD_RAID.waves} waves</div>
                      <div className="ledger-note">Requires all Hard Mode complete · {bk}/{HARD_BOSS_REQ} kills{done ? " · unlocks HELL mode" : ""}</div>
                    </div>
                  </div>
                  <button disabled={!canRun} onClick={() => startHard(HARD_RAID, "raid")} className="go">{!unlocked ? "Complete Hard Mode first" : battle ? "Finish current fight first" : cd > 0 ? `On cooldown — ${fmtClock(cd)}` : "Enter Hard Raid"}</button>
                </div>
              );
            })()}

            {difficulty === "normal" && worldTab === "zones" && ZONES.map((z) => {
              const unlocked = char.level >= z.minLevel;
              const current = z.id === char.currentZoneId;
              const completed = char.level > z.maxLevel;
              return (
                <div key={z.id} className={`dest${current ? " is-here" : completed ? " is-done" : ""}${unlocked ? "" : " is-shut"}`}>
                  <div className="dest-head">
                    <span className="mark"><EmojiIcon emoji={z.icon} size={22} /></span>
                    <div className="dest-body">
                      <div className="dest-name">
                        {z.name}
                        {current && <span className="state is-open">you are here</span>}
                        {completed && !current && <span className="state is-open">outgrown</span>}
                      </div>
                      <div className="item-meta">Levels {z.minLevel}–{z.maxLevel}</div>
                    </div>
                  </div>
                  <div className="dest-desc">{z.desc}</div>
                  {current && <div className="dest-bar"><Bar current={Math.max(0, char.level - z.minLevel)} max={z.maxLevel - z.minLevel} height={6} label="Zone progress" sub={`${char.level}/${z.maxLevel}`} /></div>}
                  <div className="tags" style={{ marginTop: 8 }}>
                    {z.enemies.map((e) => <span key={e} className="tag">{e}</span>)}
                  </div>
                  {unlocked ? (
                    <>
                      <button onClick={() => huntZone(z)} className="go"><Icon name="sword" size={14} /> Travel &amp; Hunt</button>
                      <button onClick={() => toggleOfflineZone(z.id)} aria-pressed={char.offlineZoneId === z.id}
                        className={`go is-quiet${char.offlineZoneId === z.id ? " is-on" : ""}`}>
                        {char.offlineZoneId === z.id ? "Hunting here while away — tap to stop" : "Hunt here while away"}
                      </button>
                      {char.offlineZoneId === z.id && (
                        <div className="ledger-note" style={{ marginTop: 5 }}>Earns XP &amp; gold while the app is closed (up to 12h). Uses only purchased auto-skills. Stops on defeat.</div>
                      )}
                    </>
                  ) : (
                    <div className="ledger-note" style={{ marginTop: 8, textAlign: "center" }}><Icon name="lock" size={12} /> Unlocks at level {z.minLevel}</div>
                  )}
                </div>
              );
            })}

            {difficulty === "normal" && worldTab === "dungeons" && DUNGEONS.map((d) => {
              const unlocked = char.level >= d.minLevel;
              const runsLeft = dungeonRunsLeft(char, d.id);
              const resetLeft = dungeonResetLeft(char, d.id);
              const onCd = runsLeft <= 0 && resetLeft > 0;
              const canRun = unlocked && !battle && runsLeft > 0;
              return (
                <div key={d.id} className={`dest${unlocked ? "" : " is-shut"}`}>
                  <div className="dest-head">
                    <span className="mark"><EmojiIcon emoji={d.icon} size={22} /></span>
                    <div className="dest-body">
                      <div className="dest-name">
                        {d.name}
                        {!onCd && <span className={`state ${runsLeft > 0 ? "is-open" : "is-shut"}`}>{runsLeft}/{DUNGEON_RUN_LIMIT} runs</span>}
                        {onCd && <span className="state is-soon">{fmtClock(resetLeft)}</span>}
                      </div>
                      <div className="item-meta">Req. Lvl {d.minLevel} · {d.waves} waves · Boss: {d.boss}</div>
                      {onCd
                        ? <button className="link" style={{ marginTop: 3 }} onClick={() => setResetPrompt(d)}>Runs reset in {fmtClock(resetLeft)} — use a ticket?</button>
                        : resetLeft > 0 ? <div className="ledger-note">Resets in {fmtClock(resetLeft)}</div> : null}
                    </div>
                  </div>
                  <button disabled={!unlocked || !!battle || (!canRun && !onCd)} onClick={() => { if (canRun) startDungeon(d); else if (onCd) setResetPrompt(d); }} className="go">
                    {!unlocked ? `Requires Level ${d.minLevel}` : battle ? "Finish current fight first" : onCd ? `Runs reset in ${fmtClock(resetLeft)} — use a ticket?` : runsLeft <= 0 ? "No runs left" : "Travel — Run Dungeon"}
                  </button>
                </div>
              );
            })}

            {difficulty === "normal" && worldTab === "raids" && RAIDS.map((rd) => {
              const avg = avgEquippedIlvl(char);
              const meetsIlvl = avg >= rd.reqIlvl;
              const cdLeft = raidCooldownLeft(char, rd.id);
              const onCd = cdLeft > 0;
              const canRun = meetsIlvl && !onCd && !battle;
              return (
                <div key={rd.id} className={`dest${meetsIlvl ? "" : " is-shut"}`}>
                  <div className="dest-head">
                    <span className="mark"><EmojiIcon emoji={rd.icon} size={24} /></span>
                    <div className="dest-body">
                      <div className="dest-name">
                        {rd.name}
                        <span className="chip">Raid</span>
                        {onCd && <span className="state is-shut">{fmtClock(cdLeft)}</span>}
                      </div>
                      <div className="item-meta">Req. ilvl {rd.reqIlvl} · {rd.waves} waves · Boss: {rd.boss}</div>
                      <div className={meetsIlvl ? "state is-open" : "state is-shut"} style={{ marginTop: 2 }}>Your ilvl {avg}{meetsIlvl ? "" : ` · need ${rd.reqIlvl}`}</div>
                    </div>
                  </div>
                  <div className="dest-desc">{rd.desc}</div>
                  <div className="tags" style={{ marginTop: 8 }}>
                    <span className="tag is-given rar-epic">90% epic</span>
                    <span className="tag is-given rar-legendary">10% legendary</span>
                    <span className="tag"><Icon name="hourglass" size={11} /> 24h lockout</span>
                  </div>
                  <button disabled={!canRun} onClick={() => startRaid(rd)} className="go">
                    {!meetsIlvl ? `Requires avg ilvl ${rd.reqIlvl}` : onCd ? `On cooldown — ${fmtClock(cdLeft)}` : battle ? "Finish current fight first" : "Travel — Enter Raid"}
                  </button>
                </div>
              );
            })}

          </div>
        )}
        {tab === "auction" && (() => {
          if (!getSbC()) return (
            <div className="empty">
              <div style={{ fontStyle: "normal", fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>The hall is shut</div>
              The Auction House is kept elsewhere. Reconnect to browse, buy and sell.
            </div>
          );
          const fi = undefined;   // fields are styled by .field now, not by an object
          const MAIN_FILTER = [["str", "Str"], ["agi", "Agi"], ["int", "Int"], ["sta", "Sta"]];
          const RARITY_OPTS = RARITIES.filter((r) => r.id !== "artifact");
          const f = ahFilters;
          const matchGear = (it) => {
            if (!it) return false;
            if (f.text && !it.name.toLowerCase().includes(f.text.toLowerCase())) return false;
            if (f.slot && it.slotId !== f.slot) return false;
            const ri = RARITIES.findIndex((r) => r.id === it.rarity);
            if (f.rMin !== "" && ri < Number(f.rMin)) return false;
            if (f.rMax !== "" && ri > Number(f.rMax)) return false;
            if (f.ilvlMin !== "" && (it.ilvl || 0) < Number(f.ilvlMin)) return false;
            if (f.ilvlMax !== "" && (it.ilvl || 0) > Number(f.ilvlMax)) return false;
            for (const s of f.stats) if (!(((it.stats?.[s] || 0) + (it.enchant?.[s] || 0)) > 0)) return false;
            return true;
          };
          const matchStack = (L) => { if (!f.text) return true; return stackMeta(L.kind === "drop" ? "drop" : "mat", L.matId).name.toLowerCase().includes(f.text.toLowerCase()); };
          const buyable = srvListings.filter((L) => (ahCat === "gear" ? L.kind === "gear" : L.kind !== "gear"));
          const shown = ahCat === "gear" ? buyable.filter((L) => matchGear(L.item)) : buyable.filter(matchStack);
          const mine = srvMine;
          // Bound gear is not tradeable. ah_post_gear rejects it server-side too, so offering it
          // here would only produce an error the player cannot act on.
          const postableGear = (char.inventory || []).filter((it) => !it.artifact && !it.relicId && it.slotId !== "relic" && !it.locked && !it.bound);
          const postableMats = [
            ...Object.entries(char.materials || {}).filter(([, q]) => q >= AH_ECON.stackSize).map(([id, q]) => ({ kind: "mat", id, q })),
            ...Object.entries(char.drops || {}).filter(([, q]) => q >= AH_ECON.stackSize).map(([id, q]) => ({ kind: "drop", id, q })),
          ];
          const stackListingRow = (L) => { const meta = stackMeta(L.kind === "drop" ? "drop" : "mat", L.matId); return (
            <div key={L.id} className="item">
              <span className="mark"><GameIcon icon={meta.icon} size={22} /></span>
              <div className="item-body">
                <span className="item-name">{meta.name} &times;{L.qty}</span>
                <span className="item-meta">{L.seller} · {fmtClock(L.expiresAt - now)} left</span>
              </div>
              <div className="item-acts">
                <MiniBtn onClick={() => buyAh(L)} disabled={char.gold < L.price}
                  tone={char.gold >= L.price ? "gain" : undefined}>Buy · {L.price.toLocaleString()}g</MiniBtn>
              </div>
            </div>
          ); };
          return (
          <div>
            <div className="eyebrow">
              <span>The auction house</span>
              <span className="price"><Icon name="coin" size={11} /> {char.gold.toLocaleString()}</span>
            </div>
            {/* view tabs */}
            <div className="leaves">
              {[["browse", "Browse", "target"], ["sell", "Offer", "coin"],
                ["mine", `Mine${mine.length ? ` (${mine.length})` : ""}`, "scroll"]].map(([id, label, icon]) => (
                <button key={id} onClick={() => setAhView(id)} className={`leaf${ahView === id ? " is-open" : ""}`}
                  aria-current={ahView === id ? "page" : undefined}><Icon name={icon} size={13} />{label}</button>
              ))}
            </div>

            {ahView === "browse" && (<>
              <div className="toggles" style={{ marginBottom: 10 }}>
                {[["gear", "Gear"], ["mat", "Materials"]].map(([id, label]) => (
                  <button key={id} onClick={() => setAhCat(id)} className={`toggle${ahCat === id ? " is-on" : ""}`}
                    aria-pressed={ahCat === id}>{label}</button>
                ))}
              </div>
              <div className="sift">
                <input className="field" value={f.text} onChange={(e) => setAhFilters({ ...f, text: e.target.value })}
                  placeholder={ahCat === "gear" ? "Search by name\u2026" : "Search materials\u2026"} />
                {ahCat === "gear" && (<>
                  <div className="toggles">
                    {MAIN_FILTER.map(([k, lbl]) => { const on = f.stats.includes(k); return (
                      <button key={k} aria-pressed={on} className={`toggle${on ? " is-on" : ""}`}
                        onClick={() => setAhFilters({ ...f, stats: on ? f.stats.filter((x) => x !== k) : [...f.stats, k] })}>{lbl}</button>
                    ); })}
                  </div>
                  <div className="fields">
                    <input className="field is-num" value={f.ilvlMin} onChange={(e) => setAhFilters({ ...f, ilvlMin: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="ilvl from" />
                    <input className="field is-num" value={f.ilvlMax} onChange={(e) => setAhFilters({ ...f, ilvlMax: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="ilvl to" />
                  </div>
                  <div className="fields">
                    <select className="field" value={f.slot} onChange={(e) => setAhFilters({ ...f, slot: e.target.value })}>
                      <option value="">Any slot</option>
                      {LOOT_SLOTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select className="field" value={f.rMin} onChange={(e) => setAhFilters({ ...f, rMin: e.target.value })}>
                      <option value="">Min rarity</option>
                      {RARITY_OPTS.map((r) => <option key={r.id} value={RARITIES.findIndex((x) => x.id === r.id)}>{r.name}</option>)}
                    </select>
                    <select className="field" value={f.rMax} onChange={(e) => setAhFilters({ ...f, rMax: e.target.value })}>
                      <option value="">Max rarity</option>
                      {RARITY_OPTS.map((r) => <option key={r.id} value={RARITIES.findIndex((x) => x.id === r.id)}>{r.name}</option>)}
                    </select>
                  </div>
                  {(f.text || f.stats.length || f.ilvlMin || f.ilvlMax || f.slot || f.rMin !== "" || f.rMax !== "") && (
                    <button className="link" onClick={() => setAhFilters({ text: "", stats: [], ilvlMin: "", ilvlMax: "", slot: "", rMin: "", rMax: "" })}>Start again</button>
                  )}
                </>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ahCat === "gear" ? shown.map((L) => (
                  <div key={L.id}>
                    <ItemCard item={L.item} cls={char.cls} compare={itemScore(char.equipment[L.item.slotId], char.cls)}
                      onClick={() => showItem(L.item, [
                        { label: "Compare", onClick: () => setCompareItem(L.item) },
                        { label: `Buy ${L.price}g`, color: char.gold >= L.price ? "var(--gilt)" : "var(--ink-faint)", onClick: () => buyAh(L) },
                      ])}>
                      <MiniBtn onClick={() => buyAh(L)} color={char.gold >= L.price ? "#FFD700" : "#666"} bg={char.gold >= L.price ? "#1a1830" : "#15131f"}>Buy {L.price}g</MiniBtn>
                    </ItemCard>
                    <div className="item-meta" style={{ padding: "0 0 4px" }}>{L.seller} · {fmtClock(L.expiresAt - now)} left</div>
                  </div>
                )) : shown.map(stackListingRow)}
                {shown.length === 0 && <div className="empty">Nothing on the block matches that.</div>}
              </div>
            </>)}

            {ahView === "sell" && (<>
              <div className="toggles" style={{ marginBottom: 10 }}>
                {[["gear", "Gear"], ["mat", "Materials"]].map(([id, label]) => (
                  <button key={id} aria-pressed={ahCat === id} className={`toggle${ahCat === id ? " is-on" : ""}`}
                    onClick={() => { setAhCat(id); setAhSell(null); }}>{label.replace(/^[^ ]+ /, "")}</button>
                ))}
              </div>
              {ahSell && (() => {
                const base = ahSell.kind === "gear" ? ahBaseValue(ahSell.item) : stackBaseValue(ahSell.kind, ahSell.id);
                const [lo, hi] = ahBand(base); const fee = ahPostFee(base);
                const priceNum = ahPrice === "" ? base : clamp(Number(ahPrice) || 0, lo, hi);
                const meta = ahSell.kind === "gear" ? null : stackMeta(ahSell.kind, ahSell.id);
                return (
                  <div className="bench is-ready">
                    <div className="ledger-line">
                      <span className="ledger-label">{ahSell.kind === "gear" ? ahSell.item.name : `${meta.name} \u00d7${AH_ECON.stackSize}`}</span>
                      <button className="link" onClick={() => { setAhSell(null); setAhPrice(""); }}>put back</button>
                    </div>
                    <div className="bench-what">
                      Worth about <span className="price">{base.toLocaleString()}g</span>. The hall will take anything between{" "}
                      <span className="price">{lo.toLocaleString()}</span> and <span className="price">{hi.toLocaleString()}</span>.
                    </div>
                    <div className="bulk" style={{ borderTop: 0, paddingTop: 0, marginTop: 10 }}>
                      <span className="bulk-label">Your price</span>
                      <input value={ahPrice} onChange={(e) => setAhPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                        placeholder={String(base)} className="field is-num" style={{ flex: 1, minWidth: 0 }} aria-label="Asking price" />
                      <span className="price">{priceNum.toLocaleString()}g</span>
                    </div>
                    <div className="bench-cost">
                      <span className={char.gold >= fee ? "is-held" : "is-short"}>deposit −{fee.toLocaleString()}g</span>
                      <span>you keep {ahNetAfterTax(priceNum).toLocaleString()}g after the 15% cut</span>
                    </div>
                    <button onClick={() => ahSell.kind === "gear" ? postGear(ahSell.item, priceNum) : postStack(ahSell.kind, ahSell.id, priceNum)}
                      disabled={char.gold < fee} className="go">
                      {char.gold >= fee ? `List for 48h · −${fee.toLocaleString()}g deposit` : `Need ${fee.toLocaleString()}g deposit`}
                    </button>
                  </div>
                );
              })()}
              {ahCat === "gear" ? (
                <div>
                  {postableGear.length === 0 && <div className="empty">No listable gear in your bags. Artifacts and relics cannot be traded.</div>}
                  {postableGear.map((it) => (
                    <ItemCard key={it.id} item={it} cls={char.cls} onClick={() => { setAhSell({ kind: "gear", item: it }); setAhPrice(String(ahBaseValue(it))); }}>
                      <MiniBtn onClick={() => { setAhSell({ kind: "gear", item: it }); setAhPrice(String(ahBaseValue(it))); }}>List · ~{ahBaseValue(it).toLocaleString()}g</MiniBtn>
                    </ItemCard>
                  ))}
                </div>
              ) : (
                <div>
                  {postableMats.length === 0 && <div className="empty">Nothing stackable to sell. Materials and drops list in stacks of {AH_ECON.stackSize}.</div>}
                  {postableMats.map((m) => { const meta = stackMeta(m.kind, m.id); const base = stackBaseValue(m.kind, m.id); return (
                    <div key={`${m.kind}:${m.id}`} className="item">
                      <span className="mark"><GameIcon icon={meta.icon} size={20} /></span>
                      <div className="item-body">
                        <span className="item-name">{meta.name}</span>
                        <span className="item-meta">{m.q} held · a stack of {AH_ECON.stackSize} is worth about {base.toLocaleString()}g</span>
                      </div>
                      <div className="item-acts">
                        <MiniBtn onClick={() => { setAhSell({ kind: m.kind, id: m.id }); setAhPrice(String(base)); }}>List {AH_ECON.stackSize}</MiniBtn>
                      </div>
                    </div>
                  ); })}
                </div>
              )}
            </>)}

            {ahView === "mine" && (
              <div>
                {mine.length === 0 && <div className="empty">No active listings. Sold auctions and unsold returns arrive in the Mailbox.</div>}
                {mine.map((L) => { const meta = L.kind === "gear" ? null : stackMeta(L.kind === "drop" ? "drop" : "mat", L.matId); return (
                  <div key={L.id} className="item">
                    <span className="mark"><GameIcon icon={L.kind === "gear" ? L.item.icon : meta.icon} size={20} /></span>
                    <div className="item-body">
                      <span className={L.kind === "gear" ? `item-name ${rarClass(L.item.rarity)}` : "item-name"}>
                        {L.kind === "gear" ? L.item.name : `${meta.name} ×${L.qty}`}
                      </span>
                      <span className="item-meta">{L.price.toLocaleString()}g · {fmtClock(L.expiresAt - now)} left</span>
                    </div>
                    <div className="item-acts">
                      <MiniBtn onClick={() => cancelAh(L)} tone="warn">Cancel</MiniBtn>
                    </div>
                  </div>
                ); })}
              </div>
            )}
          </div>
          );
        })()}

        {tab === "mail" && (
          <div>
            <div className="head">
              <span className="head-title" style={{ textAlign: "left" }}><Icon name="mail" size={15} /> Mailbox</span>
              {getSbC() && srvMail.length > 0 && <MiniBtn onClick={collectAllMail} color="#7CFC9E" bg="#122015">Collect All</MiniBtn>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!getSbC() && <div className="empty"><Icon name="globe" size={13} /> Connection required — your mail is kept elsewhere.</div>}
              {getSbC() && srvMail.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 12, textAlign: "center", padding: 24 }}>Your mailbox is empty.</div>}
              {srvMail.map((m) => {
                const tone = m.kind === "gdkp" ? { icon: "🔨", c: "#c8a0ff", tag: "Group loot settled" } : m.kind === "sale" ? { icon: "💰", c: "#FFD700", tag: "Auction sold" } : m.kind === "purchase" ? { icon: "📦", c: "#69CCF0", tag: "Purchase" } : { icon: "↩️", c: "#e0a955", tag: "Expired — returned" };
                return (
                  <div key={m.id} style={{ background: "var(--sunk)", border: `1px solid ${tone.c}44`, borderLeft: `3px solid ${tone.c}`, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ color: tone.c, fontSize: 12.5, fontWeight: 700 }}><EmojiIcon emoji={tone.icon} /> {tone.tag}</span>
                      <span style={{ color: "var(--ink-faint)", fontSize: 10 }}>{fmtClock(now - m.createdAt)} ago</span>
                    </div>
                    <div style={{ color: "var(--bole)", fontSize: 12, marginBottom: 3 }}>{m.subject}</div>
                    {m.kind === "sale" && <div style={{ color: "var(--ink-soft)", fontSize: 10.5, marginBottom: 6 }}>Sold to {m.from} for {m.gross}g · −{m.tax}g AH cut (15%) · <b>Net {m.gold}g</b></div>}
                    {m.kind === "gdkp" && <div style={{ color: "var(--ink-soft)", fontSize: 10.5, marginBottom: 6 }}>{m.note || "GDKP settlement"} · <b style={{ color: (m.gold || 0) < 0 ? "var(--rubric)" : "var(--verdigris)" }}>{(m.gold || 0) < 0 ? `−${mpFmt(Math.abs(m.gold))}g` : `+${mpFmt(m.gold || 0)}g`}</b>{Array.isArray(m.items) && m.items.length ? ` · ${m.items.length} item(s)` : ""}</div>}
                    {m.kind === "purchase" && <div style={{ color: "var(--ink-soft)", fontSize: 10.5, marginBottom: 6 }}>Bought from {m.from} for {m.gross}g — collect your goods below.</div>}
                    {m.kind === "expired" && <div style={{ color: "var(--ink-soft)", fontSize: 10.5, marginBottom: 6 }}>Your listing expired unsold. The deposit was not refunded.</div>}
                    <button onClick={() => collectMail(m)} style={{ width: "100%", background: "var(--raised)", border: "1.5px solid var(--verdigris)", borderRadius: 8, color: "var(--ink-soft)", fontSize: 12, fontWeight: 700, padding: 8, cursor: "pointer" }}>
                      {m.kind === "gdkp" ? (Array.isArray(m.items) && m.items.length ? `Collect ${m.items.length} item(s) & settle ${m.gold >= 0 ? "+" : ""}${m.gold}g` : `Settle ${m.gold >= 0 ? "+" : ""}${m.gold}g`)
                        : m.kind === "sale" ? `Collect ${m.gold}g` : m.item ? "Collect item" : `Collect ${m.qty}× goods`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ PROFESSIONS TAB ============ */}
        {tab === "enchanting" && (() => {
          const prof = char.professions.enchanting || { level: 1, xp: 0 };
          const equipped = GEAR_SLOTS.filter((s) => char.equipment[s.id] && s.id !== "relic"); // relics are not enchantable
          const it = char.equipment[enchantSlot];
          const pcol = "#c08bff";
          return (
            <div>
              <div className="head">
                <button onClick={() => setTab("prof")} className="head-back">&#8592; Professions</button>
                <span className="head-title"><Icon name="spark" size={15} /> Enchanting</span>
                <span className="price"><Icon name="spark" size={11} /> {(char.materials.dust || 0).toLocaleString()}</span>
              </div>
              <div className="meter-row">
                <span>{profRank(prof.level)} · Rank {prof.level}/{PROF_MAX}</span>
                <span>{prof.xp || 0}/{professionXpForLevel(prof.level)} xp</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Bar current={prof.xp || 0} max={professionXpForLevel(prof.level)} height={6} />
              </div>
              {equipped.length === 0 ? <div className="empty">Equip gear first, then enchant it here.</div> : (
                <>
                  <div className="eyebrow"><span>Gear to enchant</span></div>
                  <div className="picks">
                    {equipped.map((s) => { const gi = char.equipment[s.id]; return (
                      <button key={s.id} onClick={() => setEnchantSlot(s.id)}
                        className={`pick${enchantSlot === s.id ? " is-on" : ""} ${rarClass(gi.rarity)}`}>
                        <EmojiIcon emoji={s.icon} size={13} /> {s.name}
                      </button>
                    ); })}
                  </div>
                  {it && (
                    <div className="bench">
                      <div className={`bench-name ${rarClass(it.rarity)}`}>{it.enchant ? "✨ " : ""}{it.name}</div>
                      <div className="bench-what">
                        {it.enchant ? `Already enchanted: ${Object.entries(it.enchant).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`).join(", ")} — enchanting again replaces it`
                                    : "No enchant yet"}
                      </div>
                      <div className="bench-cost">
                        <span>+{craftXp(25, enchantXpTier(it.ilvl))} xp{enchantXpTier(it.ilvl) > 0 ? ` ×${Math.pow(CRAFT_XP_TIER_MULT, enchantXpTier(it.ilvl)).toFixed(1)}` : ""}</span>
                        <span>ilvl {it.ilvl}</span>
                      </div>
                    </div>
                  )}
                  <div className="eyebrow"><span>Random enchant</span><span>{ARCANE_ENCHANT_COST} Arcane Dust</span></div>
                  <button onClick={() => enchantGear(enchantSlot, "dust")} disabled={(char.materials.dust || 0) < ARCANE_ENCHANT_COST}
                    className="go" style={{ marginTop: 0, marginBottom: 14 }}>
                    <Icon name="spark" size={14} /> Roll a random enchant
                  </button>
                  <div className="eyebrow">
                    <span>Guaranteed enchant</span>
                    <span>5 dust of that stat</span>
                  </div>
                  <div>
                    {ENCHANT_STATS.map((s) => { const owned = char.materials[statDustId(s)] || 0; const ok = owned >= 5; const amt = enchantAmount(s, prof.level, (char.equipment[enchantSlot] || {}).abyss); const m = MATERIALS[statDustId(s)]; return (
                      <button key={s} onClick={() => enchantGear(enchantSlot, statDustId(s))} disabled={!ok} className="item item-tap" style={{ width: "100%" }}>
                        <span className="mark"><EmojiIcon emoji={m.icon} size={16} /></span>
                        <span className="item-body">
                          <span className="item-name">{m.name}</span>
                          <span className="item-meta">{owned}/5 held</span>
                        </span>
                        <span className={ok ? "state is-open" : "state is-shut"}>+{amt} {STAT_LABEL[s]}</span>
                      </button>
                    ); })}
                  </div>
                  <div className="ledger-note" style={{ textAlign: "center", marginTop: 10 }}>Enchant strength scales with Enchanting rank, capping at an ilvl-65 roll.</div>
                </>
              )}
            </div>
          );
        })()}

        {tab === "brewery" && (() => {
          const prof = char.professions.alchemy || { level: 1, xp: 0 };
          const def = consumableById(brewPotionId);
          const herb = HERB_TIERS[brewHerbIdx];
          const ptier = herb.ptier;
          const herbCost = herbBrewCost(ptier), goldCost = potionGoldCost(ptier);
          const owned = char.materials[herb.id] || 0;
          const qty = 1 + Math.floor((prof.level || 1) / 100);
          const supId = supplyForConsumable(def); const supDef = supplyById(supId); const supOwned = char.supplies?.[supId] || 0;
          const canBrew = owned >= herbCost && char.gold >= goldCost && supOwned >= qty;
          const pcol = "#9482C9";
          const effText = def.kind === "heal" ? `Restores ${tierHeal(ptier)} HP` : def.kind === "dmgbuff" ? `+${tierBuffPct(ptier)}% damage · 5 min` : def.kind === "reducebuff" ? `−${tierBuffPct(ptier)}% damage taken · 5 min` : `+${tierScrollAmount(ptier)} ${STAT_LABEL[def.stat]} · 1 hour`;
          return (
            <div>
              <div className="head">
                <button onClick={() => setTab("prof")} className="head-back">&#8592; Professions</button>
                <span className="head-title"><Icon name="flask" size={15} /> Alchemy</span>
                <span className="price"><Icon name="coin" size={11} /> {char.gold.toLocaleString()}</span>
              </div>
              <div className="meter-row">
                <span>{profRank(prof.level)} · Rank {prof.level}/{PROF_MAX}</span>
                <span>{prof.xp || 0}/{professionXpForLevel(prof.level)} xp</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Bar current={prof.xp || 0} max={professionXpForLevel(prof.level)} height={6} />
              </div>

              <div className="eyebrow"><span>Recipe</span></div>
              <div className="picks">
                {CONSUMABLE_DEFS.map((d) => (
                  <button key={d.id} onClick={() => setBrewPotionId(d.id)}
                    className={`pick${brewPotionId === d.id ? " is-on" : ""}`}>
                    <EmojiIcon emoji={d.icon} size={13} /> {d.name}
                  </button>
                ))}
              </div>

              <div className="eyebrow"><span>Herb — sets the potion's tier</span></div>
              <div className="picks">
                {HERB_TIERS.map((h, i) => (
                  <button key={h.id} onClick={() => setBrewHerbIdx(i)}
                    className={`pick${brewHerbIdx === i ? " is-on" : ""}`}>
                    <EmojiIcon emoji={h.icon} size={13} /> {h.name} <small>{char.materials[h.id] || 0}</small>
                  </button>
                ))}
              </div>

              <div className={`bench${canBrew ? " is-ready" : ""}`}>
                <div className="bench-name">
                  {def.name} {POTION_TIER_ROMAN[ptier]}{qty > 1 ? <span className="item-meta" style={{ display: "inline", marginLeft: 6 }}>×{qty}</span> : null}
                </div>
                <div className="bench-what">{effText}</div>
                <div className="bench-cost">
                  <span className={owned >= herbCost ? "is-held" : "is-short"}>{herbCost} {herb.name}</span>
                  <span className={supOwned >= qty ? "is-held" : "is-short"}>{qty} {supDef.name}</span>
                  <span className={char.gold >= goldCost ? "is-held" : "is-short"}>{goldCost}g</span>
                  <span>+{craftXp(20, brewHerbIdx)} xp{brewHerbIdx > 0 ? ` ×${Math.pow(CRAFT_XP_TIER_MULT, brewHerbIdx).toFixed(1)}` : ""}</span>
                </div>
                <div className="ledger-note" style={{ marginTop: 6 }}>Brewed potions keep this tier permanently — they will not upgrade as you level.</div>
              </div>

              <button onClick={brewPotion} disabled={!canBrew} className="go">
                <Icon name="flask" size={14} /> Brew {def.name} {POTION_TIER_ROMAN[ptier]}
                {owned < herbCost ? ` — need ${herbCost} ${herb.name}` : supOwned < qty ? ` — need ${qty} ${supDef.name}` : char.gold < goldCost ? ` — need ${goldCost}g` : ""}
              </button>
            </div>
          );
        })()}

        {tab === "forge" && (() => {
          const prof = char.professions.armorsmith || { level: 1, xp: 0 };
          const tier = ORE_TIERS[forgeOre];
          const oreCost = oreCraftCost(forgeOre), goldCost = oreGoldCost(forgeOre);
          const ilvl = craftIlvl(prof.level, forgeOre);
          const owned = char.materials[tier.id] || 0;
          const totalW = Object.values(tier.craft).reduce((a, b) => a + b, 0);
          const rates = Object.entries(tier.craft).sort((a, b) => RARITIES.findIndex((r) => r.id === a[0]) - RARITIES.findIndex((r) => r.id === b[0]));
          const canCraft = owned >= oreCost && char.gold >= goldCost;
          const pcol = "#C79C6E";
          return (
            <div>
              <div className="head">
                <button onClick={() => setTab("prof")} className="head-back">&#8592; Professions</button>
                <span className="head-title"><Icon name="anvil" size={15} /> Armorsmith</span>
                <span className="price"><Icon name="coin" size={11} /> {char.gold.toLocaleString()}</span>
              </div>
              <div className="meter-row">
                <span>{profRank(prof.level)} · Rank {prof.level}/{PROF_MAX}</span>
                <span>{prof.xp || 0}/{professionXpForLevel(prof.level)} xp</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Bar current={prof.xp || 0} max={professionXpForLevel(prof.level)} height={6} />
              </div>

              <div className="eyebrow"><span>Gear slot</span></div>
              <div className="picks">
                {ARMOR_CRAFT_SLOTS.map((sid) => (
                  <button key={sid} onClick={() => setForgeSlot(sid)}
                    className={`pick${forgeSlot === sid ? " is-on" : ""}`}>
                    <EmojiIcon emoji={slotById(sid).icon} size={13} /> {slotById(sid).name}
                  </button>
                ))}
              </div>

              <div className="eyebrow"><span>Ore — determines rarity</span></div>
              <div className="picks">
                {ORE_TIERS.map((t, i) => (
                  <button key={t.id} onClick={() => setForgeOre(i)}
                    className={`pick${forgeOre === i ? " is-on" : ""}`}>
                    <EmojiIcon emoji={t.icon} size={13} /> {t.name} <small>{char.materials[t.id] || 0}</small>
                  </button>
                ))}
              </div>

              <div className={`bench${canCraft ? " is-ready" : ""}`}>
                <div className="bench-name"><EmojiIcon emoji={slotById(forgeSlot).icon} size={16} /> {slotById(forgeSlot).name}</div>
                <div className="bench-what">Item level {ilvl}</div>
                <div className="bench-cost">
                  <span className={owned >= oreCost ? "is-held" : "is-short"}>{oreCost} {tier.name}</span>
                  <span className={char.gold >= goldCost ? "is-held" : "is-short"}>{goldCost.toLocaleString()}g</span>
                  <span>+{craftXp(25, forgeOre)} xp{forgeOre > 0 ? ` ×${Math.pow(CRAFT_XP_TIER_MULT, forgeOre).toFixed(1)}` : ""}</span>
                </div>
                <div className="bench-cost">
                  {rates.map(([rid, w]) => (
                    <span key={rid} className={rarClass(rid)}>{Math.round((w / totalW) * 100)}% {rarityById(rid).name}</span>
                  ))}
                </div>
              </div>

              <button onClick={forge} disabled={!canCraft} className="go">
                <Icon name="anvil" size={14} /> Forge {slotById(forgeSlot).name}
                {owned < oreCost ? ` — need ${oreCost} ${tier.name.replace(" Ore", "")}` : char.gold < goldCost ? ` — need ${goldCost.toLocaleString()}g` : ""}
              </button>

              {/* Souls raise a craft to a hard-mode item level. Ordinary forging caps at 63, which
                  is exactly where Hard Mode begins — so without these the profession stops
                  mattering at the moment the content it feeds into starts. */}
              {(() => {
                const held = SOULS.filter((s) => ((char.souls || {})[s.id] || 0) > 0);
                return (
                  <div style={{ marginTop: 14, background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "11px 13px" }}>
                    <div style={{ color: "var(--ink-soft)", fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}><Icon name="tome" /> Soul Forging — hard-mode item levels</div>
                    <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.45, marginBottom: held.length ? 9 : 0 }}>
                      A Soul sets the item level; your ore still sets the rarity and the slot is the one you picked above.
                      Costs the Soul, {oreCost} {tier.name} and <span style={{ color: "var(--gilt)" }}>{SOUL_CRAFT_GOLD.toLocaleString()}g</span>.
                      <b style={{ color: "var(--ink-soft)" }}> Crafted gear is account bound</b> and cannot be sold on the auction house.
                      {!held.length && <><br />Souls drop in Hard Mode zones and from hard dungeon bosses.</>}
                    </div>
                    {held.map((s) => {
                      const can = (char.materials[tier.id] || 0) >= oreCost && (char.gold || 0) >= SOUL_CRAFT_GOLD;
                      return (
                        <button key={s.id} onClick={() => forgeWithSoul(s.id)} disabled={!can}
                          style={{ width: "100%", marginTop: 6, background: can ? "var(--raised)" : "var(--verdigris)", border: `1.5px solid ${can ? s.color : "var(--ink)"}`, borderRadius: 10, color: can ? "var(--rar-epic)" : "var(--ink-faint)", fontSize: 12.5, fontWeight: 700, padding: "10px 8px", cursor: can ? "pointer" : "default", textAlign: "left" }}>
                          <EmojiIcon emoji={s.icon} /> {s.name} <span style={{ color: s.color }}>×{(char.souls || {})[s.id]}</span>
                          <span style={{ display: "block", fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 500, marginTop: 2 }}>
                            Forge an <b style={{ color: s.color }}>ilvl {s.ilvl}</b> {slotById(forgeSlot).name}
                            {!can && ((char.materials[tier.id] || 0) < oreCost ? ` — need ${oreCost} ${tier.name}` : ` — need ${SOUL_CRAFT_GOLD.toLocaleString()}g`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {tab === "salvage" && (() => {
          const pdef = PROFESSIONS.find((p) => p.id === "salvage");
          const prof = char.professions.salvage || { level: 1, xp: 0 };
          const items = [...char.inventory].filter((it) => it.slotId !== "relic" && !it.relicId && Math.max(0, RARITIES.findIndex((r) => r.id === it.rarity)) >= SALVAGE_MIN_RARITY).sort((a, b) => b.ilvl - a.ilvl || itemScore(b, char.cls) - itemScore(a, char.cls));
          return (
            <div>
              <div className="head">
                <button onClick={() => setTab("prof")} className="head-back">&#8592; Professions</button>
                <span className="head-title"><EmojiIcon emoji={pdef.icon} size={15} /> Salvage</span>
                <span className="price"><Icon name="spark" size={11} /> {(char.materials.dust || 0).toLocaleString()}</span>
              </div>
              <div className="meter-row">
                <span>{profRank(prof.level)} · Rank {prof.level}/{PROF_MAX}</span>
                <span>{prof.xp || 0}/{professionXpForLevel(prof.level)} xp</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Bar current={prof.xp || 0} max={professionXpForLevel(prof.level)} height={6} />
              </div>
              <div className="ledger-note" style={{ marginBottom: 10 }}>Break down uncommon-or-better gear into Arcane Dust, for gold. A rare roll also yields a Dust of Stat.</div>
              {items.length === 0 && <div className="empty">No uncommon+ gear to salvage.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {items.map((it) => {
                  const dust = salvageReward(it); const cost = salvageGoldCost(it); const afford = char.gold >= cost;
                  return (
                    <ItemCard key={it.id} item={it} cls={char.cls}
                      onClick={() => showItem(it, [
                        { label: it.locked ? "🔓 Unlock" : "🔒 Lock", color: "#8fd0e0", onClick: () => toggleLock(it) },
                        ...(it.locked ? [] : [{ label: `♻️ Salvage · ${cost}g → ${dust}✨`, color: "#c08bff", onClick: () => salvageItem(it) }]),
                        { label: "Compare", onClick: () => setCompareItem(it) },
                      ])}>
                      <MiniBtn onClick={() => toggleLock(it)} color={it.locked ? "#8fd0e0" : "#667"}>{it.locked ? "🔒" : "🔓"}</MiniBtn>
                      {!it.locked && <MiniBtn onClick={() => salvageItem(it)} color={afford ? "#c08bff" : "#777"} bg="#1a1330"><Icon name="spark" /> {dust}✨ · {cost}g</MiniBtn>}
                    </ItemCard>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {tab === "gathering" && gatherId && (() => {
          const def = GATHER_NODES[gatherId];
          const pdef = PROFESSIONS.find((p) => p.id === gatherId);
          const prof = char.professions[gatherId] || { level: 1, xp: 0 };
          const node = gatherNode;
          return (
            <div>
              <div className="head">
                <button onClick={() => setTab("prof")} className="head-back">&#8592; Professions</button>
                <span className="head-title"><EmojiIcon emoji={pdef.icon} size={15} /> {pdef.name}</span>
              </div>
              <div className="meter-row">
                <span>{profRank(prof.level)} · Rank {prof.level}/{PROF_MAX}</span>
                <span>{prof.xp || 0}/{professionXpForLevel(prof.level)} xp</span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Bar current={prof.xp || 0} max={professionXpForLevel(prof.level)} height={6} />
              </div>
              {GATHER_TIERS[gatherId] && (() => {
                const tiers = GATHER_TIERS[gatherId];
                const gLvl = char.professions[gatherId]?.level || 1;
                const unlocked = tiers.map((t, i) => ({ t, i })).filter(({ t }) => gLvl >= t.unlock);
                const nextLocked = tiers[highestTierIdx(tiers, gLvl) + 1];
                const label = gatherId === "mining" ? "Ore vein" : "Herb patch";
                return (
                  <div>
                    <div className="eyebrow"><span>{label} — pick any unlocked tier</span></div>
                    <div className="picks">
                      {unlocked.map(({ t, i }) => (
                        <button key={t.id} onClick={() => selectGatherTier(i)}
                          className={`pick${gatherTierIdx === i ? " is-on" : ""}`}>
                          <EmojiIcon emoji={t.icon} size={13} /> {t.name}
                        </button>
                      ))}
                      {nextLocked && (
                        <span className="pick is-shut">
                          <Icon name="lock" size={11} /> {nextLocked.name.replace(" Ore", "")} <small>rank {nextLocked.unlock}</small>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="bench" style={{ textAlign: "center", padding: 20 }}>
                <div style={{ marginBottom: 6 }}><EmojiIcon emoji={node?.icon} size={48} /></div>
                <div className="bench-name" style={{ marginBottom: 10 }}>{node?.name || "—"}</div>
                <Bar current={Math.max(0, node?.hp || 0)} max={node?.maxHp || 1} color={pdef.color} height={11} label={`${Math.max(0, Math.ceil(node?.hp || 0))}/${node?.maxHp || 0}`} />
                <div style={{ height: 18, marginTop: 8 }}>{gatherFlash && <span style={{ color: "var(--verdigris)", fontSize: 13, fontWeight: 700 }}>{gatherFlash}</span>}</div>
              </div>
              {(() => {
                const remain = Math.max(0, gatherTapCd - Date.now());
                const onCd = remain > 0;
                const isMining = gatherId === "mining";
                const label = onCd ? `⏳ ${(remain / 1000).toFixed(1)}s` : (isMining ? "⛏️ Smash" : "🌿 Harvest");
                return (
                  <button onClick={smashNode} disabled={onCd}
                    style={{ width: "100%", background: onCd ? "var(--sunk)" : `var(--raised)`, border: `2px solid ${onCd ? "var(--gilt)" : pdef.color}`, borderRadius: 12, color: onCd ? "var(--ink-soft)" : "var(--ink)", fontSize: 16, fontWeight: 700, padding: 16, cursor: onCd ? "default" : "pointer", marginBottom: 4 }}>
                    {label}
                  </button>
                );
              })()}
              {(() => {
                const remain = Math.max(0, gatherTapCd - Date.now());
                return <div style={{ textAlign: "center", fontSize: 10.5, color: remain > 0 ? "var(--gilt)" : "var(--verdigris)", marginBottom: 14 }}>{(gatherTapCdFor(char, gatherId) / 1000).toFixed(0)}s cooldown · {remain > 0 ? `ready in ${(remain / 1000).toFixed(1)}s` : "ready"}</div>;
              })()}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {(() => {
                  let keys;
                  if (GATHER_TIERS[gatherId]) { const tiers = GATHER_TIERS[gatherId]; const ti = gatherTierIdx; const next = tiers[ti + 1]; keys = next ? [tiers[ti].id, next.id] : [tiers[ti].id]; }
                  else keys = [def.mat, def.bonusMat];
                  return keys.map((mk) => (
                    <div key={mk} style={{ flex: 1, background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "9px 11px", display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 18 }}>{MATERIALS[mk].icon}</span>
                      <div><div style={{ color: "var(--ink-soft)", fontSize: 10.5 }}>{MATERIALS[mk].name}</div><div style={{ color: MATERIALS[mk].color, fontSize: 14, fontWeight: 700 }}>{char.materials[mk] || 0}</div></div>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ color: "var(--ink-faint)", fontSize: 10.5, textAlign: "center" }}>Auto-swinging while open · tap to mine faster. This gatherer also trains slowly on its own while you're away.</div>
            </div>
          );
        })()}

        {tab === "prof" && (
          <div>
            {/* What you hold. Both stores were rows of chips tinted with each
                material's own data colour — fifty small colours across two rows,
                on a screen whose whole job is telling you whether you have
                enough of something. The count is what matters, so the count is
                what is written; a chip you hold nothing of is faded. */}
            <div className="eyebrow">
              <span>Materials</span>
              <button onClick={() => setMatsOpen((o) => !o)} className="link">{matsOpen ? "hide" : "show"}</button>
            </div>
            {matsOpen && (
              <div className="picks">
                {Object.entries(MATERIALS).map(([k, m]) => (
                  <span key={k} className={`pick${(char.materials[k] || 0) > 0 ? " is-on" : " is-shut"}`}>
                    <EmojiIcon emoji={m.icon} size={13} /> {m.name} <small>{char.materials[k] || 0}</small>
                  </span>
                ))}
              </div>
            )}

            {/* enemy drops — quest & town-building materials (collapsible) */}
            {(() => { const owned = Object.entries(char.drops || {}).filter(([, v]) => v > 0); return (
              <>
                <div className="eyebrow">
                  <span>Loot drops · {owned.length}</span>
                  <button onClick={() => setDropsOpen((o) => !o)} className="link">{dropsOpen ? "hide" : "show"}</button>
                </div>
                {dropsOpen && (
                  owned.length === 0
                    ? <div className="ledger-note" style={{ marginBottom: 14 }}>Slay enemies to collect their drops — saved for the coming quest and town-building systems.</div>
                    : <div className="picks">
                        {owned.map(([k, v]) => { const d = DROP_BY_ID[k]; if (!d) return null; return (
                          <span key={k} className="pick is-on">
                            <EmojiIcon emoji={d.icon} size={13} /> {d.name} <small>{v}</small>
                          </span>
                        ); })}
                      </div>
                )}
              </>
            ); })()}

            <div className="eyebrow"><span>Professions</span></div>
            <div className="ledger-note" style={{ marginBottom: 12 }}>Learn and train every profession. Only one gatherer trains while you are away; open a gatherer to make it the active one.</div>
            {PROFESSIONS.map((prof) => {
              const data = char.professions[prof.id];
              const learned = !!data;
              const active = data?.active;
              const canLearn = !learned;
              const goldBase = learned ? data.level * 10 : 0;
              return (
                <div key={prof.id} className={`dest${active ? " is-here" : ""}${learned ? "" : " is-shut"}`}>
                  <div className="dest-head">
                    {/* The whole row is the way in, except the pause control. Which room
                        it opens is data on the profession, not five branches here. */}
                    <button onClick={() => { const to = PROF_ROOM[prof.id]; if (to === "gather") startGathering(prof.id); else if (to) setTab(to); }}
                      disabled={!PROF_ROOM[prof.id]} className="item-tap" style={{ alignItems: "center" }}>
                      <span className="mark"><EmojiIcon emoji={prof.icon} size={20} /></span>
                      <span className="dest-body">
                        <span className="dest-name">
                          {prof.name}
                          <span className="chip">{prof.type}</span>
                          {PROF_ROOM[prof.id] && <span className="state">{PROF_VERB[prof.id] || "open"}</span>}
                        </span>
                        <span className="item-meta">{prof.desc}</span>
                      </span>
                    </button>
                    {prof.type === "gathering" && (
                      <MiniBtn onClick={() => toggleProfession(prof.id)} tone={active ? "gain" : undefined}>
                        {active ? "Pause" : ((char.professions[prof.id]?.level || 1) >= PROF_MAX ? "Idle gather" : "Idle train")}
                      </MiniBtn>
                    )}
                  </div>

                  {learned && (
                    <div className="dest-bar">
                      <div className="meter-row">
                        <span>{profRank(data.level)} · {data.level}/{PROF_MAX}</span>
                        {active && prof.type === "gathering" && <span className="state is-open">gathering</span>}
                      </div>
                      <Bar current={data.xp || 0} max={professionXpForLevel(data.level)} height={6} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============ HERO TAB (stats + skills) ============ */}
        {tab === "hero" && (
          <div>
            <div className="leaves">
              {[["stats", "Stats"], ["skills", "Skills"]].map(([id, label]) => (
                <button key={id} onClick={() => setHeroTab(id)} className={`leaf${heroTab === id ? " is-open" : ""}`}>{label}</button>
              ))}
            </div>

            {heroTab === "stats" && (
              <>
                {/* The plate at the foot of the statue: who this is, in one line. */}
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                  <span className="mark" style={{ padding: 5 }}><EmojiIcon emoji={cls?.icon} size={26} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--step-1)", fontWeight: 600, lineHeight: 1.15 }}>{char.name}</div>
                    <div className="item-meta">{race?.name} {cls?.name}</div>
                    <Faction faction={race?.faction} />
                  </div>
                </div>

                <div className="eyebrow"><span>The record</span></div>
                <div className="ledger">
                  {[
                    { label: "Level", value: char.level, icon: "⭐" },
                    { label: "Health", value: maxHP, icon: "❤️" },
                    { label: "Physical Power", value: playerBaseDamage(char, false), icon: "⚔️" },
                    { label: "Magic Power", value: playerBaseDamage(char, true), icon: "🔮" },
                    { label: "Attack Speed", value: `+${Math.round(agiAtkSpeed(char) * 100)}%`, icon: "🏃" },
                    { label: "Crit Chance", value: `${Math.round(critChanceFor(char) * 100)}%`, icon: "⚡" },
                    { label: "Armor", value: eff.armor, icon: "🛡️" },
                    { label: "Gold", value: `${char.gold.toLocaleString()}g`, icon: "💰" },
                    { label: "Kills", value: (char.kills || 0).toLocaleString(), icon: "☠️" },
                    { label: "Boss Kills", value: (char.bossKills || 0).toLocaleString(), icon: "💀" },
                    { label: "Dungeons Cleared", value: char.dungeonClears || 0, icon: "🏰" },
                  ].map((row) => (
                    <div key={row.label} className="ledger-row">
                      <div className="ledger-line">
                        <span className="ledger-label"><EmojiIcon emoji={row.icon} size={14} /> {row.label}</span>
                        <span className="ledger-val">{row.value}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="eyebrow">
                  <span>Attributes{(char.attrPoints || 0) > 0 ? ` — ${char.attrPoints} to spend` : ""}</span>
                  <span className="toggles">
                    {[["base", "Base"], ["gear", "With gear"]].map(([id, lbl]) => (
                      <button key={id} onClick={() => setAttrWithGear(id === "gear")}
                        className={`toggle${attrWithGear === (id === "gear") ? " is-on" : ""}`}>{lbl}</button>
                    ))}
                  </span>
                </div>
                <div className="ledger">
                  {(() => {
                    const base = char.stats; const lvlB = Math.floor(char.level * 0.5);
                    const baseVals = { str: base.str + lvlB, agi: base.agi + lvlB, int: base.int + lvlB, sta: base.sta + lvlB };
                    const meta = [
                      ["str", "💪 Strength", "Increases auto-attack & physical skill damage"],
                      ["agi", "🏃 Agility", "Increases attack speed (max +20%) & crit rate for all attacks"],
                      ["int", "🧠 Intellect", "Increases magic skill damage"],
                      ["sta", "❤️ Stamina", "Increases maximum health"],
                    ];
                    return meta.map(([k, label, desc]) => (
                      <div key={k} className="ledger-row">
                        <div className="ledger-line">
                          <span className="ledger-label">{withIcons(label, 14)}</span>
                          <span className="ledger-val">
                            {attrWithGear ? eff[k] : baseVals[k]}
                            {attrWithGear && eff[k] !== baseVals[k] ? <span className="is-gear">({eff[k] - baseVals[k] >= 0 ? "+" : ""}{eff[k] - baseVals[k]})</span> : null}
                            {(char.allocated?.[k] || 0) > 0 && <span className="is-spent" title="Points you placed"><Icon name="star" size={10} />{char.allocated[k]}</span>}
                            {(char.attrPoints || 0) > 0 && <button className="mini is-gain" onClick={() => allocateAttr(k)} aria-label={`Spend a point on ${label.replace(/^\S+\s*/, "")}`}>+</button>}
                          </span>
                        </div>
                        <div className="ledger-note">{desc}</div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Secondary stats (gear affixes) */}
                {(() => {
                  const sp = secondaryPcts(eff);
                  const rows = [
                    ["🩸 Leech", `${sp.leech.toFixed(1)}%`, "Heals you for a portion of damage dealt"],
                    ["🛡️ Resilience", `${sp.resil.toFixed(1)}%`, `−${sp.resil.toFixed(1)}% damage from damage-over-time effects, and ${sp.resil.toFixed(1)}% chance to resist stun / slow debuffs`],
                    ["⚖️ Versatility", `${sp.vers.toFixed(1)}%`, `+${sp.vers.toFixed(1)}% damage dealt, and −${(sp.vers / 2).toFixed(1)}% auto-attack damage taken`],
                    ["⏱️ Cooldown Reduction", `${sp.cdr.toFixed(1)}%`, `Reduces ability cooldowns by ${sp.cdr.toFixed(1)}% (cap 15%)`],
                    ["💥 Crit Damage", `+${sp.csd.toFixed(0)}%`, `Critical strikes deal ${(180 + sp.csd).toFixed(0)}% weapon damage (base 180%, cap +200%)`],
                  ];
                  return (
                    <>
                      <div className="eyebrow"><span>What the gear adds</span></div>
                      <div className="ledger">
                        {rows.map(([label, val, desc]) => (
                          <div key={label} className="ledger-row">
                            <div className="ledger-line">
                              <span className="ledger-label">{withIcons(label, 14)}</span>
                              <span className="ledger-val">{val}</span>
                            </div>
                            <div className="ledger-note">{desc}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}

                <button onClick={onBack} className="go is-quiet">&#8592; Save &amp; Character Select</button>
              </>
            )}

            {heroTab === "skills" && (() => {
              const cap = unlockedSlotCount(char.level);
              const sel = char.selectedSkills || [];
              const pool = skillPool(char);
              const nextSlot = SKILL_SLOT_LEVELS.find((l) => l > (char.level || 1));
              const activeSpec = specById(char.spec);
              return (
                <>
                  <div className="eyebrow">
                    <span>Ability slots</span>
                    <span className={sel.length >= cap ? "state is-shut" : "state is-open"}>{sel.length}/{cap} filled</span>
                  </div>
                  <div className="dest-desc" style={{ marginTop: 0, marginBottom: 12 }}>
                    Choose up to {cap} of your {MAX_SKILL_SLOTS} abilities to take into battle. {nextSlot ? `Next slot unlocks at level ${nextSlot}. ` : "All slots unlocked. "}
                    {activeSpec ? <>Specialization: <b>{activeSpec.name}</b> — its signature skills are granted automatically.</> : (char.level >= SPEC_LEVEL ? "Choose a Specialization in the Class Hall to unlock signature skills." : `Specializations unlock at level ${SPEC_LEVEL} (Class Hall).`)}
                  </div>
                  {pool.map((skill) => {
                    const selected = sel.includes(skill.name);
                    const fromSpec = !!skill.spec; // a signature skill of the active spec
                    const canAdd = selected || sel.length < cap;
                    return (
                      <div key={skill.name} onClick={() => toggleSelectedSkill(skill.name)}
                        className={`choice${selected ? " is-on" : ""}${canAdd ? "" : " is-shut"}`} role="button" tabIndex={0}>
                        <div className="choice-head">
                          <span className="mark"><EmojiIcon emoji={skill.icon} size={22} /></span>
                          <div className="choice-name">
                            {skill.name}
                            {fromSpec && <span className="chip" style={{ marginLeft: 6 }}>Signature</span>}
                            <small>{skillTypeLabel(skill.name)} · {skill.cd}s cd</small>
                          </div>
                          <span className={selected ? "state is-open" : canAdd ? "state" : "state is-shut"}>{selected ? "slotted" : canAdd ? "free slot" : "full"}</span>
                        </div>
                        <div className="choice-body">{skill.desc}</div>
                        {selected && (
                          <div style={{ marginTop: 9 }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setTab("gambits")} className="link"><Icon name="target" size={12} /> Automate via Gambit</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* The foot of the page */}
      <div className="shell-foot">
        <button onClick={goBack} aria-label="Back" className="foot-btn"
          disabled={tab === "town" && navHistory.current.length === 0}>&#8592;</button>
        <button onClick={() => setTab("premium")} aria-label="Premium Shop" className="foot-btn"
          style={tab === "premium" ? { borderColor: "var(--verdigris)", color: "var(--verdigris)" } : undefined}>
          <Icon name="gem" size={16} />
        </button>
        <button onClick={() => setTab("town")} className="foot-btn is-home"
          style={tab === "town" ? { borderColor: "var(--gilt)", color: "var(--gilt)" } : undefined}>
          <Icon name="keep" size={16} /> Town
        </button>
        <button onClick={() => setTab("mail")} aria-label="Mailbox" className="foot-btn"
          style={tab === "mail" ? { borderColor: "var(--gilt)", color: "var(--gilt)" } : undefined}>
          <Icon name="mail" size={16} />{mailCount > 0 && <span className="tally">{mailCount > 99 ? "99+" : mailCount}</span>}
        </button>
        <button onClick={() => setShowSettings(true)} aria-label="Settings" className="foot-btn">
          <Icon name="gear" size={16} />
        </button>
      </div>

      {char && tab === "town" && (char.level || 1) >= 10 && !char.talentTutorialDone && (
        <div className="veil">
          <div className="sheet is-warn is-wide">
            <div className="sheet-mark"><EmojiIcon emoji="🌟" size={22} /></div>
            <div className="sheet-title">Your Talents Awaken!</div>
            <div className="sheet-lede">Reaching level 10 unlocks <b>Talents</b> — one choice per tier that reshapes how your class plays. New rows open at 20, 30, 40 and 50. At level 10 you also choose a <b>Specialization</b> in the Class Hall, which grants signature skills. You can change any talent later for {TALENT_RESPEC_COST}g under the Hero's Statue.<br /><br /><b>Choose your first talent to continue:</b></div>
            {TALENT_TIERS[0].options.map((o) => (
              <button key={o.id} onClick={() => completeTalentTutorial(o.id)} className="choice">
                <span className="choice-head">
                  <span className="mark"><EmojiIcon emoji={o.icon} size={20} /></span>
                  <span className="choice-name">{o.name}</span>
                </span>
                <span className="choice-body">{o.desc}</span>
              </button>
            ))}
            <div className="sheet-note">Crowd Control · Level 10 tier</div>
          </div>
        </div>
      )}

      {gachaResults && (
        <div onClick={() => setGachaResults(null)} className="veil">
          <div onClick={(e) => e.stopPropagation()} className="sheet is-prize is-wide">
            <div className="sheet-title"><Icon name="arena" /> {gachaResults.length} Gambit{gachaResults.length > 1 ? "s" : ""}!</div>
            <div>
              {gachaResults.map((r, i) => { const x = gambitById(r.id); if (!x) return null; return (
                <div key={i} className={`item ${rarClass(x.rarity)}`}>
                  <span className="mark"><EmojiIcon emoji={x.icon} size={18} /></span>
                  <div className="item-body">
                    <span className={`item-name ${rarClass(x.rarity)}`}>{x.type === "if" ? "IF " : "THEN "}{x.label}</span>
                    <span className="item-meta">{x.rarity}</span>
                  </div>
                  <span className={r.dup ? "state" : "state is-open"}>
                    {r.dup ? <><Icon name="gem" size={10} /> shard</> : "new"}
                  </span>
                </div>
              ); })}
            </div>
            <button onClick={() => setGachaResults(null)} className="go is-quiet">Continue</button>
          </div>
        </div>
      )}

      {/* Enchanting a second main stat trades this piece's Power away — make that explicit */}
      {enchantConfirm && (() => {
        const d = enchantConfirm; const it = d.item;
        const kind = (it.stats.sp || 0) > 0 ? "Spell" : "Attack";
        const amt = (it.stats.sp || 0) > 0 ? it.stats.sp : it.stats.ap;
        return (
          <div onClick={() => setEnchantConfirm(null)} className="veil">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-warn">
              <div className="sheet-mark"><EmojiIcon emoji="⚠️" size={22} /></div>
              <div className="sheet-title">Trade away {kind} Power?</div>
              <div className="sheet-lede">
                <b>{it.name}</b> is focused, so it grants <b>+{amt} {kind} Power</b>. Adding <b>+{d.amount} {STAT_LABEL[d.stat]}</b> gives it a second main stat, which puts that Power <b style={{ color: "var(--bole)" }}>dormant</b> until the enchant is replaced.
              </div>
              <div className="sheet-acts">
                <button onClick={() => setEnchantConfirm(null)} className="go is-quiet">Keep the Power</button>
                <button onClick={() => { const q = enchantConfirm; setEnchantConfirm(null); enchantGear(q.slotId, q.dustKind, true); }} className="go">Enchant anyway</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Same warning for socketing a gem that adds a second main stat */}
      {socketConfirm && (() => {
        const d = socketConfirm; const it = d.item;
        const kind = (it.stats.sp || 0) > 0 ? "Spell" : "Attack";
        const amt = (it.stats.sp || 0) > 0 ? it.stats.sp : it.stats.ap;
        return (
          <div onClick={() => setSocketConfirm(null)} className="veil is-over">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-warn">
              <div className="sheet-mark"><EmojiIcon emoji="⚠️" size={22} /></div>
              <div className="sheet-title">Trade away {kind} Power?</div>
              <div className="sheet-lede">
                <b>{it.name}</b> grants <b>+{amt} {kind} Power</b> because it carries one main stat. Bonding <b>{d.gem.icon} {d.gem.name}</b> adds {STAT_LABEL[d.stat]}, putting that Power <b style={{ color: "var(--bole)" }}>dormant</b>. Socketing is <b>permanent</b>.
              </div>
              <div className="sheet-acts">
                <button onClick={() => setSocketConfirm(null)} className="go is-quiet">Keep the Power</button>
                <button onClick={() => { const q = socketConfirm; setSocketConfirm(null); socketGem(q.item, q.idx, q.gemId, true); }} className="go">Socket anyway</button>
              </div>
            </div>
          </div>
        );
      })()}

      {resetPrompt && (() => {
        const d = resetPrompt;
        const tix = char.tickets?.dungeonReset || 0;
        return (
          <div onClick={() => setResetPrompt(null)} className="veil">
            <div onClick={(e) => e.stopPropagation()} className="sheet is-gain">
              <div className="sheet-mark"><EmojiIcon emoji="🎟️" size={22} /></div>
              <div className="sheet-title">Use a Dungeon Reset Ticket?</div>
              <div className="sheet-lede">You're out of runs for <b><EmojiIcon emoji={d.icon} /> {d.name}</b>. Spend one Dungeon Reset Ticket to run it once more now, without waiting for the timer.</div>
              <div style={{ background: "var(--raised)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "8px 12px", marginBottom: 14, textAlign: "center", color: tix > 0 ? "var(--ink-soft)" : "var(--rubric)", fontSize: 12 }}><Icon name="ticket" /> Tickets held: <b>{tix}</b></div>
              {tix > 0 ? (
                <div className="sheet-acts">
                  <button onClick={() => setResetPrompt(null)} className="go is-quiet">Cancel</button>
                  <button onClick={() => { const dn = resetPrompt; setResetPrompt(null); startDungeon(dn, true); }} className="go">Use Ticket &amp; Run</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setResetPrompt(null)} style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 10, color: "var(--ink-soft)", fontSize: 13, fontWeight: 700, padding: 11, cursor: "pointer" }}>Close</button>
                  <button onClick={() => { setResetPrompt(null); setTab("premium"); }} style={{ flex: 1, background: "var(--raised)", border: "1.5px solid var(--verdigris)", borderRadius: 10, color: "var(--ink-soft)", fontSize: 13, fontWeight: 700, padding: 11, cursor: "pointer" }}><Icon name="gem" /> Get Tickets</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {showSettings && (
        <div onClick={() => setShowSettings(false)} className="veil">
          <div onClick={(e) => e.stopPropagation()} className="sheet is-gain">
            <h3 className="sheet-title"><Icon name="gear" size={15} /> Settings</h3>
            <div className="ledger">
              {[["autoEquip", "Auto-equip upgrades", "Automatically equip dropped upgrades"], ["autoSellDowngrades", "Auto-sell downgrades", "Vendor loot that isn't an upgrade"]].map(([key, label, desc]) => (
                <div key={key} className="ledger-row">
                  <div className="ledger-line">
                    <span className="ledger-label">{label}</span>
                    <span className="ledger-val">
                      <button onClick={() => commitChar({ ...charRef.current, [key]: !charRef.current[key] })}
                        aria-pressed={!!char[key]} className={`mini${char[key] ? " is-gain" : ""}`}>{char[key] ? "On" : "Off"}</button>
                    </span>
                  </div>
                  <div className="ledger-note">{desc}</div>
                </div>
              ))}
            </div>

            {/* How the page is lit. Stored per device, not on the character — which
                way round the light is has nothing to do with who you are playing. */}
            <div className="eyebrow">
              <span>The light</span>
              <span className="toggles">
                {[["auto", "System"], ["day", "Day"], ["night", "Night"]].map(([id, lbl]) => (
                  <button key={id} onClick={() => { setChronicleTheme(id); saveTheme(id); }}
                    className={`toggle${chronicleTheme === id ? " is-on" : ""}`}>{lbl}</button>
                ))}
              </span>
            </div>

            <div className="eyebrow"><span><Icon name="ticket" size={11} /> Promo codes</span></div>
            <div className="ledger-note" style={{ marginBottom: 6 }}>Redeem codes for items and experience.</div>
            <div className="fields" style={{ alignItems: "flex-end" }}>
              <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Enter code"
                onKeyDown={(e) => { if (e.key === "Enter") redeemPromo(); }} className="field" />
              <button onClick={redeemPromo} className="mini" style={{ flex: "none" }}>Redeem</button>
            </div>

            <button onClick={() => { setShowSettings(false); onBack(); }} className="go is-quiet">Save &amp; Character Select</button>
            <button onClick={() => setShowSettings(false)} className="link" style={{ display: "block", margin: "10px auto 0" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
// ================= MULTIPLAYER FRAMEWORK (Phase 1 — bot-simulated, server-ready) =================
// There is no real backend yet. Everything routes through `mpProvider`, which currently fills parties,
// opponents, leaderboards and chat with BOTS so the whole flow is playable today. When the authoritative
// server (Colyseus) lands, only mpProvider's methods get swapped — the UI and game logic stay put.
// Bots are deliberately disguised as players (handle-style names, gear, latency) and never labelled.
const MP_QUEUE_WAIT = 15; // seconds before bots backfill empty party slots
const COPY_ITEM_VEN = 20; // Ven to buy an exact copy of a lost bid item
// ---------- BOT IDENTITY (persistent, efficient — reused by parties, ladders, chat) ----------
// A large multi-pattern name generator keeps repeats rare across leaderboards & chat. Cheap: array picks.
const MP_ADJ = ["Shadow", "Frost", "Ember", "Storm", "Iron", "Night", "Dread", "Gale", "Ashen", "Void", "Blood", "Grim", "Silent", "Crimson", "Rune", "Onyx", "Azure", "Hollow", "Savage", "Wraith", "Thorn", "Dusk", "Pyre", "Vex", "Mourn", "Hex", "Fell", "Umbra", "Raven", "Wolf", "Cinder", "Gloom", "Rime", "Bane", "Ghost", "Feral", "Sable", "Verdant", "Molten", "Tempest", "Obsidian", "Wither", "Scorn", "Vile", "Stone", "Wild", "Draken", "Solar", "Lunar", "Star"];
const MP_NOUN = ["fang", "blade", "reaver", "bane", "howl", "bringer", "claw", "mourn", "spike", "veil", "song", "heart", "fury", "stalk", "wing", "maw", "shard", "wight", "brand", "coil", "step", "weaver", "guard", "hunter", "fall", "born", "strike", "render", "seeker", "warden", "caller", "fist", "vein", "root", "gaze", "tide", "spire", "thorn", "crow", "hound", "raker", "pact", "sworn", "storm", "shade", "kin", "hollow", "grasp", "cleave", "wraith"];
const MP_SYL1 = ["Kael", "Thal", "Vor", "Zin", "Mor", "Rha", "Syl", "Grim", "Ael", "Bran", "Cyr", "Dre", "Eryn", "Fael", "Gor", "Hald", "Ith", "Jor", "Kor", "Lyr", "Mal", "Nyx", "Oth", "Pyr", "Quel", "Rav", "Sael", "Tyr", "Val", "Wyn", "Xar", "Zeph", "Bel", "Cael", "Dorn"];
const MP_SYL2 = ["ion", "eth", "ar", "us", "yn", "or", "ael", "is", "ax", "en", "oth", "ir", "an", "iel", "ux", "as", "em", "il", "orn", "ath", "une", "yr", "ok", "esh"];
const MP_TAG = ["", "", "", "", "TV", "GG", "HD", "xX", "pvp", "EU", "NA", "OW", "the1st", "II", "V"];
const mpName = () => {
  const r = Math.random();
  let base;
  if (r < 0.5) base = pick(MP_ADJ) + pick(MP_NOUN);
  else if (r < 0.82) base = pick(MP_SYL1) + pick(MP_SYL2) + (Math.random() < 0.4 ? pick(MP_SYL2) : "");
  else base = pick(MP_ADJ) + "_" + pick(MP_NOUN);
  const tag = pick(MP_TAG);
  return base + (tag ? tag : (Math.random() < 0.22 ? String(Math.floor(Math.random() * 999)) : ""));
};
const MP_CHAT_LINES = ["LFM raid need 2 dps", "anyone selling an artifact weapon?", "gg last boss", "that bid war was brutal lol", "who's tanking?", "grats on the drop!", "need heals for hard dungeon", "arena is rough today", "just hit a new power score 🔥", "trading ore for gems, pm me", "wipe on enrage again ugh", "stack on the boss", "nice roll", "anyone doing rated arena?", "new patch when", "my rogue is unstoppable rn", "buff paladins pls", "who wants to run Molten Heart", "gl on your bids", "world boss up?", "that copy-for-ven saved me lol", "climbing the ladder, wish me luck", "pull when ready", "anyone got a spare gem?", "that boss hits like a truck", "almost hit 2k rating", "lf guild, dm me", "the guild finder is so fast now", "who's up for a dungeon"];
const mpChatLine = () => ({ id: "bot_" + Math.random().toString(36).slice(2), name: mpName(), text: pick(MP_CHAT_LINES), t: Date.now() });
// GDKP reserve pricing and rival ceilings now live in the core — an online clear is auctioned by
// the server, so both sides must price a lot identically. (gdkpBotCeiling uses rng() there, which
// is Math.random outside a seeded scope, so the offline auction is unchanged.)
const mpPowerOf = (char) => { const e = effectiveStats(char); const dps = Math.round(offlinePlayerDps(char)); return Math.max(50, Math.round(dps * 6 + maxHpFor(char) * 0.5 + (e.str + e.agi + e.int + e.sta))); };
const mpDpsFromPower = (power) => Math.max(1, Math.round(power / 6));
const mpBot = (targetPower, level) => {
  const cls = pick(CLASSES); const specs = specsFor(cls.id); const spec = specs.length ? pick(specs) : null;
  const power = Math.max(50, Math.round((targetPower || 400) * (0.78 + Math.random() * 0.5)));
  return { id: "bot_" + Math.random().toString(36).slice(2, 8), name: mpName(), cls: cls.id, clsName: cls.name, icon: cls.icon, color: cls.color, spec: spec ? spec.id : null, specName: spec ? spec.name : null, level: level || 60, power, ilvl: 60 + Math.floor(Math.random() * 12), latency: 18 + Math.floor(Math.random() * 190), isBot: true };
};
// ----- provider seam: replace these with real server calls later -----
// Persistent ladder roster — stable identities (name/class) cached across refreshes & sessions so the
// board feels alive; only their records drift on refresh. Real players replace this later.
let _mpRoster = null;
const MP_ROSTER_KEY = "roe_mp_roster_v1";
const mpLadderRoster = (count) => {
  if (!_mpRoster) { try { _mpRoster = JSON.parse(localStorage.getItem(MP_ROSTER_KEY) || "null"); } catch { _mpRoster = null; } }
  if (!_mpRoster || _mpRoster.length < count) {
    _mpRoster = [];
    for (let i = 0; i < count; i++) {
      const cls = pick(CLASSES); const specs = specsFor(cls.id); const spec = specs.length ? pick(specs) : null;
      const n = 20 + Math.floor(Math.random() * 760); const wr = 0.34 + Math.random() * 0.44; const wins = Math.round(n * wr);
      _mpRoster.push({ id: "lb_" + Math.random().toString(36).slice(2, 8), name: mpName(), cls: cls.id, clsName: cls.name, icon: cls.icon, color: cls.color, spec: spec ? spec.id : null, specName: spec ? spec.name : null, wins, losses: n - wins });
    }
    try { localStorage.setItem(MP_ROSTER_KEY, JSON.stringify(_mpRoster)); } catch {}
  }
  return _mpRoster;
};
const mpRosterDrift = () => { // nudge records so ratings shift a little on refresh (same identities)
  if (!_mpRoster) return;
  _mpRoster = _mpRoster.map((b) => { const g = 1 + Math.floor(Math.random() * 4); const wr = 0.34 + Math.random() * 0.44; const w = Math.round(g * wr); return { ...b, wins: b.wins + w, losses: b.losses + (g - w) }; });
  try { localStorage.setItem(MP_ROSTER_KEY, JSON.stringify(_mpRoster)); } catch {}
};
// Authoritative encounter server (Colyseus). Override at build time with VITE_GAME_SERVER.
const GAME_SERVER_URL = (import.meta.env && import.meta.env.VITE_GAME_SERVER) || "wss://eldoria-game-server-production.up.railway.app";
const mpProvider = {
  _realOpps: [], // cache of real opponent snapshots (primed on Arena open)
  // ---- authoritative co-op rooms ----
  // Joins the server's encounter room. The server owns the seed, the party and every tick;
  // this client only sends intents and renders what comes back.
  connectEncounter: async ({ contentId, char, role, ilvl, uid, code }) => {
    const { Client } = await import("colyseus.js");   // lazy: only pulled in when playing online
    const client = new Client(GAME_SERVER_URL);
    const room = await client.joinOrCreate("encounter", {
      contentId,
      code: code || "",                                 // shared code = guaranteed same room
      name: char.name,
      role: role || roleOf(char),
      uid: uid || null,
      // The purse the room checks GDKP bids against. Sent once on join and held server-side, so a
      // bid beyond it is refused when it is made rather than discovered at settlement.
      gold: char.gold || 0,
      // The server builds the combatant from this and never trusts anything else the client says.
      loadout: { char, tier: botTier(mpPowerOf(char)), ilvl },
    });
    return room;
  },
  fillParty: (size, targetPower, level, existing) => { const out = existing.slice(); while (out.length < size) out.push(mpBot(targetPower, level)); return out; },
  findOpponent: (targetPower, level, targetRating) => {
    const pool = mpProvider._realOpps || [];
    if (pool.length) {
      let cands = pool;
      if (targetRating) { const near = pool.filter((o) => Math.abs((o.rating || 1000) - targetRating) <= 350); if (near.length) cands = near; }
      const o = cands[Math.floor(Math.random() * cands.length)];
      const ci = CLASSES.find((c) => c.id === o.cls) || {};
      return { id: "pvp_" + o.user_id, name: o.name, cls: o.cls, clsName: ci.name, icon: ci.icon, color: ci.color, spec: o.spec, level: o.level || level || 60, power: o.power || targetPower, rating: o.rating, latency: 20 + Math.floor(Math.random() * 180), isBot: false, real: true };
    }
    return mpBot(targetPower, level);
  },
  ladder: (n, playerPower, level) => { const arr = []; for (let i = 0; i < n; i++) { const p = Math.round((playerPower || 400) * (0.35 + (i / n) * 1.7) * (0.9 + Math.random() * 0.2)); arr.push(mpBot(Math.max(50, p), level)); } return arr; },
  // ---- live PvP (Supabase pvp_snapshot; self-only writes, public reads) ----
  publish: async (snap) => {
    const sb = getSupabase(); if (!sb) return;
    try {
      const uid = (await sb.auth.getSession()).data.session?.user?.id; if (!uid) return;
      await sb.from("pvp_snapshot").upsert({ user_id: uid, name: (snap.name || "Adventurer").slice(0, 24), cls: snap.cls, spec: snap.spec || null, level: snap.level || 60, power: snap.power || 0, wins: snap.wins || 0, losses: snap.losses || 0, updated_at: new Date().toISOString() });
    } catch (e) { console.warn("pvp publish:", e); }
  },
  fetchLadder: async (limit = 50) => {
    const sb = getSupabase(); if (!sb) return [];
    try {
      const uid = (await sb.auth.getSession()).data.session?.user?.id;
      const { data } = await sb.from("pvp_snapshot").select("*").order("rating", { ascending: false }).limit(limit);
      const rows = (data || []).filter((r) => r.user_id !== uid);
      mpProvider._realOpps = rows;
      return rows;
    } catch (e) { console.warn("pvp ladder:", e); return []; }
  },
};
// group-content catalogue (dungeons = 4 players, raids = 6)
const MP_CONTENT = [
  ...DUNGEONS.map((d) => ({ id: "mp_" + d.id, kind: "dungeon", size: 4, name: d.name, icon: d.icon, color: d.color, boss: d.boss, level: d.minLevel, ilvl: Math.min(63, d.minLevel + 3), goldMult: d.goldMult || 8 })),
  { id: "mp_" + HARD_RAID.id, kind: "raid", size: 6, name: HARD_RAID.name, icon: HARD_RAID.icon || "🌋", color: "#ff4500", boss: HARD_RAID.boss, level: HARD_RAID.enemyLvl || 72, ilvl: HARD_RAID.dropIlvl || 71, goldMult: 30, hard: true },
  ...RAIDS.map((r) => ({ id: "mp_" + r.id, kind: "raid", size: 6, name: r.name, icon: r.icon, color: r.color, boss: r.boss, level: r.minLevel, ilvl: r.reqIlvl || 60, goldMult: r.goldMult || 28 })),
];
const mpFmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n)));
// Conquest Rating — blends win rate with match volume so a proven high-volume record outranks a
// tiny flawless one (e.g. 51% of 500 games > 100% of 10). Win rate is the driver (0% wins → base,
// no matter the volume); log-scaled volume amplifies it. Starts at 1000 (placement).
const arenaRating = (wins, losses) => {
  const w = wins || 0, l = losses || 0, n = w + l;
  if (n === 0) return 1000;
  const p = w / n;
  return Math.round(1000 + 1000 * p * Math.log10(n + 1));
};
// ---------- BOT SKILL TIERS ----------
// Every bot behaves as one of three archetypes. Higher rating skews toward the sharper players:
// tankier, hits harder, and works its rotation faster. Used for PvP now, reusable for PvE bots later.


// a reference "geared player" of a class/spec at a given ilvl — gives realistic HP & DPS to size a bot

// ---------- BOT ROTATION (real skill engine) ----------
// Bots run their actual class kit through applySkillCore with real resources & cooldowns. The rotation
// chooser's quality scales with tier: experts spend on cooldown and pool resources for spenders;
// newer players hesitate and pick sloppily. Tunable globals below.
const BOT_GCD = 1100;   // ms between a bot's skill casts (its global cooldown)
const BOT_DMG = 2.4;    // bot outgoing-damage factor — players hit enemies unmitigated, so this keeps bots competitive after the player's mitigation is applied. Tune here.
// ---------- RATED PvP BALANCE ---------- (symmetric: applies to both you and the bot)
// Longer, more tactical duels: a flat "toughness" reduction on all PvP damage + an extra cut on skills,
// so bursting isn't a one-shot and steady play / timing matters. Plus a global cooldown to stop spam.
                                    // flat PvP damage reduction (Resilience-style)
                                    // additional cut on skill damage only
const PVP_AUTO_MULT = 1 - PVP_TOUGHNESS;                       // 0.75 → auto damage −25%
    // 0.45 → skill damage −55%
const PVP_GCD = 1250;                                          // ms between the player's skill casts in PvP



// ---------- shared skill engine (used by solo combat AND multiplayer group encounters) ----------


// ---------- GDKP loot bid modal (Guild boss kills): bid gold vs the party; buy a copy for Ven on a loss ----------
// `net` switches this from a locally simulated auction to a spectator of the ROOM's auction:
// the lot, the running high and the hammer all arrive from the server, bids go back over the
// wire, and nothing is granted here because the server settles into mail. Everything below the
// data layer — the item card, the bid buttons — is identical either way.
function LootBidModal({ items, party, char, commitChar, showNotif, onClose, net, room }) {
  const online = !!net;
  const queue = (items || []).filter(Boolean);
  const [idx, setIdx] = useState(0);
  const [bid, setBid] = useState(null);
  const [done, setDone] = useState(online ? false : queue.length === 0);
  const item = online ? (net.lot?.item || net.sold?.item || null) : queue[idx];
  useEffect(() => {
    if (online || !item || done) return;
    const reserve = gdkpReserve(item);
    const bidders = (party || []).filter((m) => !m.me).map((m) => ({ name: m.name, maxBid: gdkpBotCeiling(reserve, m.power) }));
    setBid({ timeLeft: 15, high: 0, highName: null, min: reserve, bidders, resolved: false, iWon: false, payout: 0 });
  }, [idx, done, online]);
  // Online, `bid` is a projection of the server's view rather than state this component owns.
  useEffect(() => {
    if (!online) return;
    if (net.done) { setDone(true); return; }
    if (net.sold) {
      const iWon = net.sold.winnerId && net.sold.winnerId === net.myAllyId;
      setBid((B) => ({ ...(B || {}), resolved: true, iWon, high: net.sold.price,
                       highName: net.sold.winnerName, payout: iWon ? 0 : (net.sold.share || 0) }));
      return;
    }
    if (net.lot) {
      setBid((B) => ({ ...(B || {}), resolved: false, passed: B?.passed && B?.lotIndex === net.lot.index,
                       lotIndex: net.lot.index, high: net.lot.high, highName: net.lot.highBidderName,
                       min: net.lot.reserve, minNext: net.lot.minNext, timeLeft: net.lot.secondsLeft }));
    }
  }, [net, online]);
  const resolveBid = () => setBid((B) => {
    if (!B || B.resolved) return B;
    const iWon = !B.passed && B.highName === char.name && B.high > 0;
    if (iWon) { commitChar({ ...char, gold: Math.max(0, (char.gold || 0) - B.high), ...depositEarned(char, item) }); return { ...B, resolved: true, iWon: true }; }
    const share = B.high > 0 ? Math.floor(B.high / Math.max(2, (party || []).length)) : 0;
    if (share > 0) commitChar({ ...char, gold: (char.gold || 0) + share });
    return { ...B, resolved: true, iWon: false, payout: share };
  });
  useEffect(() => {
    if (online) return;               // the room owns the clock and the rivals
    if (!bid || bid.resolved || done) return;
    if (bid.timeLeft <= 0) { if (!bid.passed) setBid((B) => (B && !B.resolved) ? { ...B, passed: B.highName !== char.name, autoPassed: B.highName !== char.name } : B); resolveBid(); return; } // no action by 0s = pass
    const t = setTimeout(() => setBid((B) => {
      if (!B || B.resolved) return B;
      let { high, highName, bidders } = B;
      const floor = high > 0 ? high + 20 : (B.min || 0);                       // the opening bid must meet the reserve
      const elig = bidders.filter((b) => b.maxBid >= floor && Math.random() < 0.5);
      if (elig.length) { const b = pick(elig); const raise = high > 0 ? high + Math.round(20 + Math.random() * Math.max(20, high * 0.25)) : floor; high = Math.min(b.maxBid, Math.max(floor, raise)); highName = b.name; }
      return { ...B, timeLeft: B.timeLeft - 1, high, highName };
    }), 1000);
    return () => clearTimeout(t);
  }, [bid, done]);
  const placeBid = (amt) => {
    // Online the bid is a request: the room re-checks it against the purse it was told on join
    // and against the current high, and answers with a `notice` if it refuses.
    if (online) {
      if (!bid || bid.resolved || bid.passed) return;
      room && room.send("bid", { amount: Math.max(bid.minNext || bid.min || 0, amt) });
      return;
    }
    setBid((B) => {
      if (!B || B.resolved || B.passed) return B;
      const target = Math.max(B.high > 0 ? B.high + 20 : (B.min || 0), amt);   // can't bid under the reserve
      if (target > (char.gold || 0)) { showNotif && showNotif("Not enough gold to bid that much"); return B; }
      return { ...B, high: target, highName: char.name, timeLeft: Math.max(B.timeLeft, 4) };
    });
  };
  // Passing steps you out of the bidding but keeps you in the room until the hammer falls —
  // the auction plays out in full so your cut is a share of the FINAL price, not an early one.
  const passBid = () => {
    if (online) { room && room.send("pass", {}); setBid((B) => B && { ...B, passed: true }); return; }
    setBid((B) => (!B || B.resolved) ? B : { ...B, passed: true });
  };
  // Online the room decides when the next lot opens; "next" is just acknowledging the result.
  const next = () => {
    if (online) { setBid((B) => B && { ...B, resolved: false, acked: true }); return; }
    if (idx + 1 < queue.length) setIdx(idx + 1); else setDone(true);
  };
  const buyCopy = () => {
    if ((char.ven || 0) < COPY_ITEM_VEN) { showNotif && showNotif(`Need ${COPY_ITEM_VEN} 💎 Ven for a copy`); return; }
    commitChar({ ...char, ven: (char.ven || 0) - COPY_ITEM_VEN, ...depositEarned(char, { ...item }) });
    showNotif && showNotif(`💎 Bought a copy of ${item.name}`); next();
  };
  const rc = (r) => rarityById(r) || { color: "var(--ink-faint)", name: "" };
  return (
    <div className="veil is-over">
      <div className="sheet is-prize is-wide" style={{ textAlign: "center" }}>
        {done || !item ? (
          <>
            <div className="sheet-mark"><EmojiIcon emoji="🏆" size={22} /></div>
            <div className="sheet-title">Loot distributed — run complete!</div>
            <button onClick={onClose} className="go">Continue</button>
          </>
        ) : (<>
          <div className="sheet-title">Boss Loot · Bid Gold {queue.length > 1 ? `(${idx + 1}/${queue.length})` : ""}</div>
          <div className={`aside-note ${rarClass(item.rarity)}`} style={{ borderLeftColor: "var(--rar)", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span className="mark"><EmojiIcon emoji={item.icon || "🎁"} size={22} /></span>
              <div style={{ minWidth: 0 }}>
                <div className={rarClass(item.rarity)} style={{ fontSize: "var(--step-0)", fontWeight: 600, lineHeight: 1.15 }}>{item.enchant ? "✨ " : ""}{item.name}{temperSuffix(item)}</div>
                <div className="item-meta">ilvl {item.ilvl} · {rc(item.rarity).name}{item.slotId && slotById(item.slotId) ? ` · ${slotById(item.slotId).name}` : ""}</div>
              </div>
            </div>
            {(() => {
              const merged = { ...(item.stats || {}) }; if (item.enchant) for (const k in item.enchant) merged[k] = (merged[k] || 0) + item.enchant[k];
              const mainKeys = ["str", "agi", "int", "sta"], secKeys = ["ap", "sp", "leech", "resil", "vers", "cdr", "csd", "crit", "haste"];
              const socks = socketsOf(item);
              const bare = mainKeys.concat(secKeys).every((k) => !(merged[k] > 0)) && !item.wdmg && !(merged.armor > 0) && !item.relicDesc;
              return (
                <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 6, display: "flex", flexDirection: "column", gap: 1 }}>
                  {item.wdmg && <div style={{ color: "var(--bole)", fontSize: 11.5, fontWeight: 600 }}><Icon name="sword" /> {item.wdmg.min} – {item.wdmg.max} Damage</div>}
                  {merged.armor > 0 && <div style={{ color: "var(--ink-soft)", fontSize: 11.5 }}><Icon name="shield" /> {merged.armor} Armor</div>}
                  {mainKeys.filter((k) => merged[k] > 0).map((k) => <div key={k} style={{ color: "var(--ink)", fontSize: 11.5 }}>+{merged[k]} {STAT_LABEL[k]}</div>)}
                  {secKeys.filter((k) => merged[k] > 0).map((k) => <div key={k} style={{ color: "var(--ink-soft)", fontSize: 11.5 }}>+{merged[k]} {STAT_LABEL[k]}</div>)}
                  {item.relicDesc && <div style={{ color: item.relicColor || "var(--gilt)", fontSize: 11, lineHeight: 1.3 }}><Icon name="sword" /> {item.relicDesc}</div>}
                  {socks.length > 0 && <div style={{ color: "var(--ink-soft)", fontSize: 10, marginTop: 2 }}><Icon name="gem" /> Sockets: {socks.map((gid) => { const g = gid && gemById(gid); return g ? g.icon : "○"; }).join(" ")}</div>}
                  {item.enchant && <div style={{ color: "var(--rar-epic)", fontSize: 10.5 }}><Icon name="spark" /> {Object.entries(item.enchant).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`).join(", ")}</div>}
                  {bare && <div style={{ color: "var(--ink-faint)", fontSize: 11 }}>No bonuses</div>}
                </div>
              );
            })()}
          </div>
          {!bid ? null : !bid.resolved ? (<>
            <div style={{ color: "var(--rar-epic)", fontSize: 13, marginBottom: 2 }}>High bid: <b>{bid.high ? mpFmt(bid.high) + "g" : "—"}</b>{bid.highName ? ` · ${bid.highName}` : ""}</div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 10 }}>Reserve <b>{mpFmt(bid.min || 0)}g</b> · {bid.timeLeft}s left · your gold: {mpFmt(char.gold || 0)}</div>
            {bid.passed ? (
              <div style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 9, padding: "10px 12px", color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.5 }}>
                ✋ <b>You passed.</b> Staying until the hammer falls so your cut is a share of the final price.
              </div>
            ) : (<>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>{[100, 500, 1000].map((inc) => (<button key={inc} onClick={() => placeBid((bid.high > 0 ? bid.high : (bid.min || 0)) + inc)} className="go is-quiet" style={{ margin: 0, flex: 1 }}>+{mpFmt(inc)}</button>))}</div>
              <button onClick={() => placeBid(bid.high > 0 ? bid.high + 20 : (bid.min || 0))} className="go">{bid.high > 0 ? `Bid ${mpFmt(bid.high + 20)}g` : `Open at ${mpFmt(bid.min || 0)}g`}</button>
              <button onClick={passBid} className="go is-quiet">Pass</button>
            </>)}
          </>) : bid.iWon ? (<>
            <div style={{ color: "var(--verdigris)", fontSize: 13, fontWeight: 700, marginBottom: 12 }}><Icon name="trophy" /> You won {item.name} for {mpFmt(bid.high)}g!</div>
            <button onClick={next} className="go">{idx + 1 < queue.length ? "Next item" : "Finish"}</button>
          </>) : (<>
            <div style={{ color: "var(--rubric)", fontSize: 12, marginBottom: 4 }}>{bid.autoPassed ? "Time expired — you passed. " : bid.passed ? "You passed. " : ""}{bid.high > 0 ? `${bid.highName || "A rival"} won the roll` : "No bids met the reserve — the lot went unsold"}{bid.payout ? ` — your full share: +${mpFmt(bid.payout)}g` : ""}.</div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 10 }}>Buy an exact copy for {COPY_ITEM_VEN} 💎 Ven? (you have {char.ven || 0})</div>
            <button onClick={buyCopy} className="go"><Icon name="gem" /> Buy copy · {COPY_ITEM_VEN} Ven</button>
            <button onClick={next} className="go is-quiet">No thanks</button>
          </>)}
        </>)}
      </div>
    </div>
  );
}

// ---------- shared global chat (Supabase Realtime) — used in town, combat, and the Guild/Arena ----------
function useGlobalChat(char, showNotif) {
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLive, setChatLive] = useState(false);
  const myUid = useRef(null);
  const cref = useRef(char); useEffect(() => { cref.current = char; });
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setChat([mpChatLine(), mpChatLine(), mpChatLine()]); const iv = setInterval(() => setChat((c) => [...c, mpChatLine()].slice(-80)), 9000); return () => clearInterval(iv); }
    let channel = null, cancelled = false;
    const toMsg = (r) => ({ id: String(r.id), name: r.name, text: r.text, t: Date.parse(r.created_at) || Date.now() });
    (async () => {
      try { myUid.current = (await sb.auth.getSession()).data.session?.user?.id || null; } catch {}
      const { data } = await sb.from("messages").select("id,name,text,created_at").order("created_at", { ascending: false }).limit(60);
      if (!cancelled && data) setChat(data.reverse().map(toMsg));
      channel = sb.channel("global-chat")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => { setChat((c) => (c.some((m) => m.id === String(row.id)) ? c : [...c, toMsg(row)].slice(-80))); })
        .subscribe((status) => { if (status === "SUBSCRIBED") setChatLive(true); });
    })();
    return () => { cancelled = true; try { channel && sb.removeChannel(channel); } catch {} };
  }, []);
  // Ambient bot chatter in the LIVE chat — only while online (subscribed), very infrequent
  // (~2–10 msgs/hour). Injected locally so the shared table isn't flooded; each next line is scheduled
  // at a random 6–30 min gap. When real server-side bots exist they'll post to the shared feed instead.
  useEffect(() => {
    if (!chatLive) return;
    let timer;
    const schedule = () => { const delay = (6 + Math.random() * 24) * 60000; timer = setTimeout(() => { setChat((c) => [...c, mpChatLine()].slice(-80)); schedule(); }, delay); };
    schedule();
    return () => clearTimeout(timer);
  }, [chatLive]);
  const sendChat = async () => {
    const c = cref.current; const t = chatInput.trim(); if (!t) return; setChatInput("");
    const sb = getSupabase();
    if (!sb) { setChat((cc) => [...cc, { id: Math.random().toString(36).slice(2), name: c.name, text: t, me: true, t: Date.now() }].slice(-80)); return; }
    let uid = myUid.current; if (!uid) { try { uid = (await sb.auth.getSession()).data.session?.user?.id; myUid.current = uid; } catch {} }
    const { error } = await sb.from("messages").insert({ name: (c.name || "Adventurer").slice(0, 24), text: t.slice(0, 200), user_id: uid });
    if (error) { showNotif && showNotif("Chat: " + error.message); setChatInput(t); }
  };
  return { chat, chatInput, setChatInput, sendChat, chatLive };
}
function ChatPanel({ chatState, myName, height = 260, transparent }) {
  const { chat, chatInput, setChatInput, sendChat, chatLive } = chatState;
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [chat]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "var(--ink-soft)", fontSize: 11, fontWeight: 700 }}>🌐 Global Chat</span>
        <span style={{ color: chatLive ? "var(--verdigris)" : "var(--ink-soft)", fontSize: 9.5, fontWeight: 700 }}>{chatLive ? "● live" : "○ connecting…"}</span>
      </div>
      <div ref={ref} style={{ background: transparent ? "rgba(8,7,15,0.55)" : "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 8, padding: 10, height, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {chat.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 11 }}>No messages yet — say hello!</div>}
        {chat.map((m) => (<div key={m.id} style={{ fontSize: 11.5, lineHeight: 1.4 }}><span style={{ color: (m.me || m.name === myName) ? "var(--verdigris)" : "var(--rar-epic)", fontWeight: 700 }}>{m.name}:</span> <span style={{ color: "var(--verdigris)" }}>{m.text}</span></div>))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Say something…" style={{ ...inpStyle, marginBottom: 0, flex: 1 }} />
        <button onClick={sendChat} className="go" style={{ width: "auto", margin: 0 }}>Send</button>
      </div>
    </div>
  );
}

// ============================================================================================
// GROUP ENCOUNTER ENGINE (Phase 3) — a pure, deterministic trinity-combat reducer.
// Headless (no React/DOM). Reads the Phase-1 role skill fields (heal/threat/interrupt/party buffs)
// and runs under the Phase-0 seeded RNG, so it produces identical results on client and server.
// Contract: stepEncounter(state, dtMs) -> new state (does not mutate the input).
// ============================================================================================





















// ---- Boss roster: data-driven ability timelines (Phase 4) ----
// ability kinds: auto | tankbuster | raidcast(interruptible) | raidtick | spike(random) | summon | enrage






const ABILITY_ICON = { tankbuster: "🔨", raidcast: "⏳", raidtick: "🌋", spike: "🌑", summon: "➕", enrage: "🔥", auto: "⚔️" };
const grpNextTelegraph = (en, now) => { let best = null; for (const ab of en.abilities || []) { if (ab.kind === "auto" || ab.nextAt === Infinity) continue; const t = ab.nextAt - now; if (t < 0) continue; if (!best || t < best.t) best = { ab, t }; } return best; };
// A prompt when the moment belongs to the human's role — turns reaction into ownership.
const grpYourCall = (enc, me, now) => {
  if (!me || me.down) return null;
  const inc = grpIncoming(enc, now);
  const casting = enc.enemies.find((e) => e.hp > 0 && e.castBar && e.castBar.interruptible);
  const adds = enc.enemies.filter((e) => e.hp > 0 && e.isAdd);
  const boss = enc.enemies.find((e) => e.isBoss && e.hp > 0);
  const worst = grpInjured(enc.allies);
  if (me.role === "support" && casting) return { text: "Interrupt the cast — now!", color: "#c8a0ff" };
  if (me.role === "healer" && enc.allies.some((a) => !a.down && (a.debuffs || []).length)) return { text: "Cleanse the curse!", color: "#5fd39a" };
  if (me.role === "healer" && inc.raidSoon) return { text: "Raid damage incoming — AoE heal!", color: "#5fd39a" };
  if (me.role === "healer" && worst && worst.hp < worst.maxHp * 0.5) return { text: `${worst.isHuman ? "You're" : worst.name + " is"} low — heal!`, color: "#5fd39a" };
  if (me.role === "tank" && inc.busterSoon) return { text: "Tank-buster incoming — mitigate!", color: "#5b8fd6" };
  if (me.role === "tank" && boss && boss.targetId && boss.targetId !== me.id) return { text: "You've lost aggro — taunt it back!", color: "#5b8fd6" };
  if (me.role === "dps" && adds.length) return { text: "Adds are up — swap and burn them!", color: "#e0a955" };
  if (me.role === "dps" && boss && boss.enraged) return { text: "Enraged — burn it down!", color: "#e0a955" };
  return null;
};



// ---- role AI: returns { skill, targetAllyId?, targetEnemyId? } or null ----










// Build a trinity party: the human plays their own role; bots fill the remaining tank/healer/support/dps.

const buildTrinityParty = (char, ilvl) => {
  const myRole = roleOf(char);
  const party = [{ char, role: myRole, isHuman: true, tier: BOT_TIERS.expert }];
  for (const r of ["tank", "healer", "support", "dps"]) {
    if (r === myRole) continue;
    const [cls, spec] = TRINITY_FILL[r];
    const bc = buildBotChar(cls, spec, char.level, ilvl || 66); bc.name = mpName();
    party.push({ char: bc, role: r, tier: botTier(1500 + Math.random() * 700) });
  }
  return party;
};

// ---------- GUILD MULTIPLAYER (Trinity engine for ALL group PvE) ----------
const GUILD_RUN_LIMIT = 3;                 // runs per dungeon, per window — independent of solo
const GUILD_WINDOW = 3600000;              // runs refill one hour after the window's first entry
const GUILD_RAID_COOLDOWN = 24 * 3600000;  // per raid
const TRIAL_COOLDOWN = 24 * 3600000;       // per Trinity Trial
const TRIAL_ILVL = { ashen: 64, molten: 65, harbinger: 66 }; // reward ilvl per Trial boss
const TRIAL_LEGENDARY_CHANCE = 0.10;       // otherwise Epic floor
const guildWindowActive = (r, now) => !!(r && r.start && ((now || Date.now()) - r.start < GUILD_WINDOW));
const guildRunsLeft = (c, id, now) => { const r = c && c.guildDungeonRuns && c.guildDungeonRuns[id]; return guildWindowActive(r, now) ? Math.max(0, GUILD_RUN_LIMIT - (r.runs || 0)) : GUILD_RUN_LIMIT; };
const guildWindowLeft = (c, id, now) => { const r = c && c.guildDungeonRuns && c.guildDungeonRuns[id]; return guildWindowActive(r, now) ? Math.max(0, r.start + GUILD_WINDOW - (now || Date.now())) : 0; };
const guildRaidCdLeft = (c, id, now) => Math.max(0, ((c && c.guildRaidCooldowns && c.guildRaidCooldowns[id]) || 0) - (now || Date.now()));
const trialCdLeft = (c, id, now) => Math.max(0, ((c && c.trialCooldowns && c.trialCooldowns[id]) || 0) - (now || Date.now()));
// Compact "2h 14m" style countdown for the cooldown pills.
const fmtCd = (ms) => { if (ms <= 0) return ""; const s = Math.ceil(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`; };
// Turn a dungeon/raid into a Trinity encounter so Guild content runs the same role-based fight.
// Trinity party padded out to the content's group size (extra slots are DPS).
const buildTrinityPartyOfSize = (char, ilvl, size) => {
  const party = buildTrinityParty(char, ilvl);
  for (let i = party.length; i < (size || 4); i++) {
    const [cls, spec] = TRINITY_FILL.dps;
    const bc = buildBotChar(cls, spec, char.level, ilvl || 66); bc.name = mpName();
    party.push({ char: bc, role: "dps", tier: botTier(1500 + Math.random() * 700) });
  }
  return party;
};
// Display roster for the GDKP bid (LootBidModal wants {name, power, me}).
const partyForBid = (party) => (party || []).map((p, i) => p.isHuman
  ? { id: "me", name: p.char.name, me: true, power: mpPowerOf(p.char) }
  : { id: "p" + i, name: p.char.name, power: mpPowerOf(p.char) });

// `room` (a Colyseus room) switches this from a locally-simulated fight to an authoritative
// one: the server owns every tick and this renders its snapshots, sending intents instead of
// mutating state. Everything below the data layer — targeting, the action bar, telegraphs —
// is identical either way, because both sides run the same game-core.
function GroupCombat({ char, commitChar, onExit, bossId, bossDef, ilvl, party, onCleared, label, room, myAllyId: myAllyIdProp, offlineReason, practice }) {
  const networked = !!room;
  // Which combatant is ours arrives with the server's `assigned` message at start, and the
  // lobby tells us who else is waiting. Both are held here so the screen can be opened the
  // moment we join rather than after the party forms — a minute of blank screen would be
  // worse than the matchmaking bug this window exists to fix.
  const [myAllyId, setMyAllyId] = useState(myAllyIdProp || null);
  const [lobby, setLobby] = useState(null);
  const [enc, setEnc] = useState(() => networked ? null : createEncounter({ party: party || buildTrinityParty(char, ilvl), boss: bossDef || bossId || "ashen", seed: (Date.now() >>> 0) }));
  const rewarded = useRef(false);
  const [target, setTarget] = useState(null); // { type:"ally"|"enemy", id } — manual target, else smart auto
  // Online, the authoritative confirmation of a tap is a full round trip away (RTT + up to two
  // 120ms ticks), which reads as the button ignoring you. `localQueued` echoes the tap
  // immediately so the action bar responds at once; the server remains the only thing that
  // decides what actually happens, and its snapshot supersedes the echo as soon as it lands.
  // NB: must sit above the `!enc` early return — declaring it later changes the hook count
  // between the waiting-room and in-combat renders (React #310).
  const localQueued = useRef(null);
  // Why the last tap did nothing ("Not enough Rage", "on cooldown", "no potions left"). Online
  // this arrives as a private `notice` message — it is nobody else's business — and solo it is
  // read off the state the local step returns. Same core rules produce both.
  const [notice, setNotice] = useState(null);
  // Solo drives its own clock, so a potion has to ride the same input path the server uses
  // rather than being applied here; that keeps ONE implementation of what a potion does.
  const pendingInput = useRef(null);
  useEffect(() => {
    if (networked) {                                              // server drives time; we only render
      room.onMessage("state", setEnc);
      room.onMessage("assigned", (a) => setMyAllyId(a.allyId));
      room.onMessage("lobby", setLobby);
      room.onMessage("notice", (n) => setNotice({ ...n, at: Date.now() }));
      return;
    }
    const iv = setInterval(() => setEnc((p) => {
      if (!p || p.cleared || p.wiped) return p;
      const inp = pendingInput.current; pendingInput.current = null;
      const me = inp && p.allies.find((a) => a.isHuman);
      return stepEncounter(p, 120, me ? { [me.id]: inp } : undefined);
    }), 120); // sim is ~0.13ms/step, so a fine tick is smooth & cheap
    return () => clearInterval(iv);
  }, [networked]);
  // Solo notices ride on the state the step returns (online they come as their own message).
  useEffect(() => {
    if (networked || !enc) return;
    const n = (enc.notices || [])[0];
    if (n) setNotice({ ...n, at: Date.now() });
  }, [enc?.tick]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!enc?.cleared || rewarded.current) return;
    rewarded.current = true;
    // Online clears are paid by the server (rewards.mjs → Supabase mail); paying locally too
    // would hand out the gold twice.
    // A clear pays a flat purse offline. The Training Delve must NOT: it has no lockout, so paying
    // it would make a practice boss an unlimited gold faucet — measured at 1,400g a clear against
    // an endgame income of 13,180 an hour, which is several times the best farm in the game.
    if (!networked && !practice) { const gold = 400 + (char.level || 60) * 25; commitChar({ ...char, gold: (char.gold || 0) + gold }); }
    if (onCleared) onCleared(enc);
  }, [enc?.cleared]);
  if (!enc) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "18px 14px", textAlign: "center" }}>
      <button onClick={onExit} style={{ float: "left", background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Leave</button>
      <div style={{ color: "var(--ink-soft)", fontSize: 11, fontWeight: 700, paddingTop: 6 }}>🌐 Online — authoritative server</div>
      <div style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 2 }}><Icon name="sword" /> Forming Party</div>
      <div style={{ color: "var(--ink)", fontSize: 13, marginBottom: 10 }}>{lobby?.contentName || label || "Encounter"}</div>
      {lobby?.code ? <div style={{ color: "var(--gilt)", fontSize: 11, marginBottom: 8 }}><Icon name="unlock" /> Party code <b>{lobby.code}</b> — anyone using it joins you</div> : null}
      <div style={{ color: "var(--verdigris)", fontSize: 30, fontWeight: 800, margin: "6px 0" }}>{lobby ? `${lobby.players.length}/${lobby.size}` : "…"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left", margin: "10px 0" }}>
        {(lobby?.players || []).map((p, i) => (
          <div key={i} style={{ background: "var(--verdigris)", border: "1px solid var(--verdigris)", borderRadius: 8, padding: "7px 10px", color: "var(--ink-soft)", fontSize: 12, fontWeight: 700 }}>
            {ROLES[p.role]?.icon || "🧑"} {p.name}
          </div>
        ))}
        {Array.from({ length: Math.max(0, (lobby?.size || 4) - (lobby?.players.length || 1)) }).map((_, i) => (
          <div key={"e" + i} style={{ border: "1px dashed var(--verdigris)", borderRadius: 8, padding: 8, color: "var(--ink-faint)", fontSize: 11, textAlign: "center" }}>waiting for a player…</div>
        ))}
      </div>
      <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>
        {lobby ? `Empty seats fill with adventurers in ${lobby.secondsLeft}s` : "Connecting to the server…"}
      </div>
    </div>
  );
  // Online there may be several humans, so "me" is the ally the server assigned, not just any human.
  const isMe = (a) => networked ? a.id === myAllyId : !!a.isHuman;
  const me = enc.allies.find(isMe) || enc.allies[0];
  const nowE = enc.elapsed;
  const mySkills = (char.selectedSkills || []).map((n) => skillByName(char, n)).filter(Boolean).slice(0, 6);
  const queuedName = networked
    ? (me.pendingSkillName || (localQueued.current && localQueued.current.tick + 4 > enc.tick ? localQueued.current.name : null))
    : (me.pendingAction && me.pendingAction.skill && me.pendingAction.skill.name);
  const cast = (sk) => {
    if (enc.cleared || enc.wiped) return;
    // Answer immediately from the same rules the server uses, so a refused tap explains itself
    // instead of looking like a dead button. The server still re-checks online — this is
    // feedback, not authority.
    //
    // `me` comes from the SERVER SNAPSHOT online, and fullSnapshot strips `char` (the client
    // already has its own). intentRejection reads ally.char.selectedSkills, so passing the bare
    // snapshot ally threw on every tap and killed the handler before it could send — skills
    // appeared completely dead online while potions, which never touch char, kept working.
    // The character is ours and local, so put it back; bw (cooldowns, resource) is in the snapshot.
    const rej = intentRejection({ ...me, char }, { skillName: sk.name }, enc.elapsed);
    if (rej) { setNotice({ ...rej, at: Date.now() }); return; }
    if (networked) {
      localQueued.current = { name: sk.name, tick: enc.tick };   // optimistic echo, expires in ~4 ticks
      // Name the skill; never send the object. The server re-checks it against our own loadout.
      room.send("intent", { skillName: sk.name, target: target || undefined });
      return;
    }
    setEnc((p) => {
      if (!p || p.cleared || p.wiped) return p;
      const h = p.allies.find((a) => a.isHuman); if (!h || h.down) return p;
      return { ...p, allies: p.allies.map((a) => a.isHuman ? { ...a, pendingAction: { skill: sk, ...grpResolveTarget(p, sk, target) } } : a) };
    });
  };
  // A potion spends a charge belonging to the whole encounter, so online it is asked for and
  // the server decides. Solo takes the identical path through the local step — the rules for
  // what a potion does and when it is refused live in the core, once.
  const potion = () => {
    if (enc.cleared || enc.wiped) return;
    const rej = potionRejection(enc, me);
    if (rej) { setNotice({ ...rej, at: Date.now() }); return; }   // instant answer; the server still re-checks
    if (networked) room.send("intent", { potion: true });
    else pendingInput.current = { potion: true };
  };
  const barPct = (c, m) => Math.max(0, Math.min(100, (c / (m || 1)) * 100));
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={onExit} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Leave</button>
        <span style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 15 }}>
          {networked
            ? <span style={{ color: "var(--verdigris)" }} title="Authoritative server — real players">🌐 Online</span>
            : <span style={{ color: "var(--bole)" }} title={offlineReason || "Local fight with bots"}>🤖 Solo</span>}
        </span>
        <span style={{ color: "var(--ink-soft)", fontSize: 10 }}>{ROLES[me.role].icon} You: {ROLES[me.role].name}</span>
      </div>
      {offlineReason && (
        <div style={{ background: "var(--raised)", border: "1px solid var(--bole)", borderRadius: 9, padding: "7px 10px", marginBottom: 6, color: "var(--bole)", fontSize: 11, lineHeight: 1.4 }}>
          <Icon name="warn" /> <b>Offline fight</b> — couldn't reach the game server, so this party is bots. Reason: {offlineReason}
        </div>
      )}
      {/* enemies */}
      {enc.enemies.map((en) => { const aggro = enc.allies.find((a) => a.id === en.targetId); const onMe = aggro && isMe(aggro); const sel = target && target.type === "enemy" && target.id === en.id; return (
        <div key={en.id} onClick={() => en.hp > 0 && setTarget({ type: "enemy", id: en.id })} style={{ background: "var(--raised)", border: `${sel ? 2 : 1}px solid ${sel ? "var(--rubric)" : "var(--rubric)"}`, borderRadius: 10, padding: "8px 10px", marginBottom: 6, opacity: en.hp <= 0 ? 0.4 : 1, cursor: en.hp > 0 ? "pointer" : "default", boxShadow: sel ? "0 0 8px rgba(255,107,74,0.4)" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ color: "var(--rubric)", fontSize: 13, fontWeight: 700 }}>{sel ? "🎯 " : ""}{en.name}{en.isBoss ? " 👑" : ""}</span><span style={{ color: "var(--ink-soft)", fontSize: 10 }}>{mpFmt(en.hp)}/{mpFmt(en.maxHp)}{aggro ? ` · 🎯 ${isMe(aggro) ? "YOU" : aggro.name}` : ""}</span></div>
          <div style={{ height: 9, background: "var(--raised)", borderRadius: 5, overflow: "hidden" }}><div style={{ height: "100%", width: `${barPct(en.hp, en.maxHp)}%`, background: "var(--ground)", transition: "width 0.14s linear" }} /></div>
          {en.castBar && (<div style={{ marginTop: 4 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--bole)", fontSize: 10, fontWeight: 700 }}><Icon name="hourglass" /> {en.castBar.name} — INTERRUPT!</span></div><div style={{ height: 5, background: "var(--bole)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${barPct(en.castBar.endsAt - nowE, en.castBar.endsAt - (en.castBar.endsAt - 2400)) }%`, background: "var(--gilt)", transition: "width .2s" }} /></div></div>)}
          {!en.castBar && en.hp > 0 && (() => { const tg = grpNextTelegraph(en, nowE); if (!tg || tg.t > 6000) return null; const secs = Math.ceil(tg.t / 1000); const soon = tg.t < 2500; const label = tg.ab.name || (tg.ab.kind === "raidtick" ? "Raid damage" : tg.ab.kind === "summon" ? "Summon" : tg.ab.kind); return (<div style={{ marginTop: 4, color: soon ? "var(--bole)" : "var(--ink-soft)", fontSize: 9.5, fontWeight: soon ? 700 : 400 }}>{ABILITY_ICON[tg.ab.kind] || "•"} {label} in {secs}s{tg.ab.kind === "tankbuster" ? " (tank: mitigate)" : tg.ab.kind === "raidcast" ? " (support: interrupt)" : tg.ab.kind === "raidtick" ? " (healer: AoE)" : ""}</div>); })()}
          {onMe && !me.role.includes("tank") && <div style={{ color: "var(--rubric)", fontSize: 9.5, marginTop: 3, fontWeight: 700 }}><Icon name="warn" /> It's targeting you — you have aggro!</div>}
        </div>
      ); })}
      {/* party */}
      <div style={{ color: "var(--ink-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "8px 0 4px" }}>Party · ✚ {enc.reses} battle-res</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
        {(() => { const inc = grpIncoming(enc, nowE); const boss = enc.enemies.find((e) => e.isBoss && e.hp > 0); const busterId = boss ? boss.targetId : null; return enc.allies.map((a) => { const sel = target && target.type === "ally" && target.id === a.id; const incoming = !a.down && (inc.raidSoon || (inc.busterSoon && a.id === busterId)); const glow = sel ? "#5fd39a" : incoming ? "#ff9838" : (isMe(a) ? "#3a6ea5" : "#241f3c"); return (
          <div key={a.id} onClick={() => !a.down && setTarget({ type: "ally", id: a.id })} style={{ background: isMe(a) ? "var(--verdigris)" : "var(--sunk)", border: `${sel || incoming ? 2 : 1}px solid ${glow}`, borderRadius: 8, padding: "6px 8px", opacity: a.down ? 0.45 : 1, cursor: a.down ? "default" : "pointer", boxShadow: sel ? "0 0 8px rgba(95,211,154,0.4)" : incoming ? "0 0 9px rgba(255,152,56,0.55)" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ color: isMe(a) ? "var(--verdigris)" : "var(--verdigris)", fontSize: 11, fontWeight: 700 }}>{sel ? "🎯 " : ""}{ROLES[a.role].icon} {isMe(a) ? "You" : a.name}{(a.debuffs || []).length ? " " + (a.debuffs[0].icon || "☠️") : ""}{(a.hots || []).length ? " 🕯️" : ""}</span><span style={{ color: a.down ? "var(--rubric)" : (a.debuffs || []).length ? "var(--rubric)" : incoming ? "var(--bole)" : "var(--ink-soft)", fontSize: 9 }}>{a.down ? "DOWN" : (a.debuffs || []).length ? "cleanse!" : incoming ? "⚠ incoming" : Math.round(barPct(a.hp, a.maxHp)) + "%"}</span></div>
            <div style={{ height: 7, background: "var(--sunk)", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${a.down ? 0 : barPct(a.hp, a.maxHp)}%`, background: ROLES[a.role].color, transition: "width 0.14s linear" }} /></div>
          </div>
        ); }); })()}
      </div>
      {/* your-call banner */}
      {(() => { const call = grpYourCall(enc, me, nowE); if (!call) return null; return (
        <div style={{ background: `${call.color}22`, border: `1px solid ${call.color}`, borderRadius: 9, padding: "7px 10px", marginBottom: 6, textAlign: "center", color: call.color, fontSize: 12, fontWeight: 700, boxShadow: "none" }}>→ Your call: {call.text}</div>
      ); })()}
      {/* resource meter + GCD */}
      {(() => {
        const ri = classResource(char.cls); const res = Math.round(resTotal(me.bw)); const rmax = ri.max || 100;
        const onGcd = nowE < (me.nextGcd || 0); const gcdFrac = onGcd ? Math.max(0, Math.min(1, (me.nextGcd - nowE) / GRP.gcd)) : 0;
        const spender = mySkills.find((s) => s.spend); const ripe = (rmax <= 10 ? res >= rmax : res >= rmax * 0.75); const finisherReady = ripe && (spender ? botCanAfford(char, me.bw, spender) : rmax <= 10);
        return (
          <div style={{ margin: "2px 0 6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: ri.color, fontSize: 10, fontWeight: 700 }}><EmojiIcon emoji={ri.icon} /> {ri.name}</span>
              <span style={{ fontSize: 9.5 }}>{finisherReady ? <span style={{ color: ri.color, fontWeight: 700 }}><Icon name="haste" /> {spender ? spender.name + " ready" : "ready — spend it"}</span> : <span style={{ color: "var(--ink-soft)" }}>{rmax <= 10 ? "" : `${res}/${rmax}`}</span>}</span>
            </div>
            {rmax <= 10 ? (
              <div style={{ display: "flex", gap: 4 }}>{Array.from({ length: rmax }).map((_, i) => (<div key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: i < res ? ri.color : "var(--verdigris)", border: `1px solid ${i < res ? ri.color : "var(--verdigris)"}`, boxShadow: i < res ? `0 0 5px ${ri.color}66` : "none" }} />))}</div>
            ) : (
              <div style={{ height: 8, background: "var(--raised)", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, (res / rmax) * 100)}%`, background: ri.color, transition: "width .2s" }} /></div>
            )}
            <div style={{ height: 3, marginTop: 3, background: onGcd ? "var(--verdigris)" : "transparent", borderRadius: 2, overflow: "hidden" }}>{onGcd && <div style={{ height: "100%", width: `${(1 - gcdFrac) * 100}%`, background: "var(--verdigris)", transition: "width .1s linear" }} />}</div>
          </div>
        );
      })()}
      {/* action bar */}
      <div style={{ color: "var(--ink-soft)", fontSize: 9.5, marginBottom: 4, textAlign: "center" }}>{target ? (() => { const t = target.type === "ally" ? enc.allies.find((a) => a.id === target.id) : enc.enemies.find((e) => e.id === target.id); return t ? `🎯 Target: ${t && isMe(t) ? "You" : t.name}${target.type === "ally" ? " (heal)" : ""} · tap a frame to change` : "tap a frame to target"; })() : "Tap an ally to heal them or an enemy to focus — otherwise skills auto-target"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {mySkills.map((sk) => { const cd = (me.bw.cooldowns[sk.name] || 0); const onCd = cd > nowE; const onGcd = nowE < (me.nextGcd || 0); const afford = botCanAfford(char, me.bw, sk); const ready = !onCd && afford && !me.down; const queued = queuedName === sk.name; const util = sk.heal || sk.healAoe ? "#5fd39a" : sk.taunt ? "#5b8fd6" : sk.interrupt ? "#c8a0ff" : "#e0a955"; const cdFrac = onCd && sk.cd ? Math.max(0, Math.min(1, (cd - nowE) / (sk.cd * 1000))) : 0; return (
          // Deliberately NOT disabled when unavailable. A greyed-out button answers "you can't"
          // but never "why", which is the actual complaint — you are left guessing whether the
          // skill is on cooldown, unaffordable, or the button is simply broken. A tap now says.
          <button key={sk.name} onClick={() => cast(sk)} style={{ position: "relative", overflow: "hidden", flex: "1 1 30%", background: ready ? "var(--raised)" : "var(--verdigris)", border: `${queued ? 2 : 1}px solid ${queued ? "var(--bole)" : ready ? util : !afford ? "var(--rubric)" : "var(--hairline)"}`, borderRadius: 9, color: ready ? "var(--ink)" : "var(--ink-faint)", fontSize: 11, fontWeight: 700, padding: "9px 5px", cursor: "pointer", boxShadow: queued ? "0 0 7px rgba(255,212,121,0.5)" : "none" }}>
            <span style={{ position: "relative", zIndex: 2 }}>{queued ? "▸ " : ""}{sk.icon || "✦"} {sk.name}{onCd ? ` ${Math.ceil((cd - nowE) / 1000)}s` : !afford ? " ·" : ""}</span>
            {onCd && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${cdFrac * 100}%`, background: "rgba(10,8,18,0.72)", zIndex: 1, transition: "width 0.14s linear" }} />}
            {!onCd && onGcd && !me.down && !queued && <div style={{ position: "absolute", inset: 0, background: "rgba(10,8,18,0.45)", zIndex: 1 }} />}
          </button>
        ); })}
        <button onClick={potion} style={{ flex: "1 1 30%", background: enc.potionsUsed < enc.potionCap ? "var(--raised)" : "var(--verdigris)", border: `1px solid ${enc.potionsUsed < enc.potionCap ? "var(--gilt)" : "var(--hairline)"}`, borderRadius: 9, color: enc.potionsUsed < enc.potionCap ? "var(--bole)" : "var(--ink-faint)", fontSize: 11, fontWeight: 700, padding: "9px 5px", cursor: "pointer" }}><Icon name="flask" /> Potion ({enc.potionCap - enc.potionsUsed})</button>
      </div>
      {/* Why the last tap did nothing. Sits directly under the bar so it reads as an answer to
          the button you just pressed, and clears itself after a couple of seconds. */}
      {notice && (
        <div style={{ background: "var(--raised)", border: "1px solid var(--rubric)", borderRadius: 8, padding: "6px 10px", margin: "6px 0", color: "var(--rubric)", fontSize: 11, fontWeight: 700, textAlign: "center" }}>
          {notice.code === "resource" ? "⚡" : notice.code === "cooldown" ? "⏳" : notice.code === "nopotions" ? "🧪" : "⛔"} {notice.text}
        </div>
      )}
      {/* log */}
      <div style={{ background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 8, padding: 8, height: 96, overflowY: "auto", fontSize: 10.5, color: "var(--verdigris)", lineHeight: 1.5, display: "flex", flexDirection: "column-reverse" }}>
        <div>{enc.log.slice(-8).map((l, i) => <div key={i}>{l}</div>)}</div>
      </div>
      {(enc.cleared || enc.wiped) && (
        <div className="veil">
          <div className={`sheet ${enc.cleared ? "is-gain" : "is-warn"}`} style={{ textAlign: "center" }}>
            <div className="sheet-mark">{enc.cleared ? <EmojiIcon emoji="🏆" size={22} /> : <EmojiIcon emoji="💀" size={22} />}</div>
            <div className="sheet-title">{enc.cleared ? "Encounter Cleared!" : "Party Wiped"}</div>
            <div className="sheet-lede">{enc.cleared ? `Cleared in ${(enc.elapsed / 1000).toFixed(0)}s · +${400 + (char.level || 60) * 25} gold` : "The encounter beat you. Regroup and try again."}</div>
            <button onClick={onExit} className="go">{enc.cleared ? "Continue" : "Leave"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MultiplayerHub({ char, commitChar, showNotif, onExit, onStartRated, onStartPractice, lessonWantsDuel }) {
  const cls = CLASSES.find((c) => c.id === char.cls) || {};
  const myPower = mpPowerOf(char);
  const myDps = Math.max(1, Math.round(offlinePlayerDps(char)));
  const me = { id: "me", name: char.name, cls: char.cls, clsName: cls.name, icon: cls.icon, color: cls.color, spec: char.spec, level: char.level, power: myPower, latency: 0, isBot: false, me: true };
  const mp = char.mp || {};

  const [sub, setSub] = useState("ladder"); // ladder | rated  (PvE lives in the Guild; chat is global)

  // Publish our defense snapshot to the live ladder and prime the real-opponent pool on open.
  // Re-runs whenever our record changes (e.g. returning here after a rated match).
  const _lt = (char.mp && char.mp.lifetime) || { wins: 0, losses: 0 };
  useEffect(() => {
    mpProvider.publish({ name: char.name, cls: char.cls, spec: char.spec, level: char.level, power: myPower, wins: _lt.wins, losses: _lt.losses });
    mpProvider.fetchLadder(50);
  }, [_lt.wins, _lt.losses, myPower]);

  // ============ GROUP FINDER (retained for reference; PvE now runs through the Guild) ============
  const [phase, setPhase] = useState("browse"); // browse | queue | encounter | loot | done
  const [content, setContent] = useState(null);
  const [party, setParty] = useState([]);
  const [countdown, setCountdown] = useState(MP_QUEUE_WAIT);
  const [enc, setEnc] = useState(null);           // { bossName, bossHp, bossMax, partyHp, partyMax, passive, elapsed, enrage, cds, log }
  const encRef = useRef(null); useEffect(() => { encRef.current = enc; }, [enc]);
  const [loot, setLoot] = useState(null);         // { queue:[items], idx, bid:{...} }
  const [rewardMsg, setRewardMsg] = useState("");

  const startQueue = (c) => { setContent(c); setParty([me]); setCountdown(MP_QUEUE_WAIT); setPhase("queue"); setRewardMsg(""); };

  // queue countdown → occasional early "join", full backfill at 0
  useEffect(() => {
    if (phase !== "queue" || !content) return;
    if (countdown <= 0) {
      const full = mpProvider.fillParty(content.size, myPower, content.level, [me]);
      setParty(full);
      const t = setTimeout(() => beginEncounter(content, full), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setParty((p) => (p.length < content.size && Math.random() < 0.4 ? [...p, mpBot(myPower, content.level)] : p));
      setCountdown((n) => n - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, content]);

  const beginEncounter = (c, full) => {
    const now = Date.now();
    const botDps = full.filter((m) => !m.me).reduce((s, m) => s + mpDpsFromPower(m.power), 0);
    const pdps = Math.max(1, Math.round(offlinePlayerDps(char)));
    const dur = c.kind === "raid" ? 90 : 55; // seconds at passive rate; your real skills/crits shorten it
    const bossMax = Math.max(800, Math.round((botDps + pdps) * dur));
    const level = c.level || 60;
    const enemy = { name: c.boss || "Boss", cls: pick(CLASSES).id, level, hp: bossMax, maxHp: bossMax, isBoss: true, skills: [] };
    // a REAL battle-state object — the same shape the solo engine uses, so applySkillCore & the
    // auto-attack math run identically (resources, DoTs, crits, buffs, talents, gems all apply).
    const w = { enemy, hp: maxHpFor(char), playerEffects: [], enemyEffects: [], cooldowns: {}, resQ: [], res: 0, playerNextAt: now + 600, enemyNextAt: now + ENEMY_BASE_INTERVAL, runStart: now, mode: c.kind === "raid" ? "hard" : "dungeon", hardKind: "dungeon" };
    const partyMax = full.reduce((s, m) => s + (m.me ? maxHpFor(char) : Math.round(m.power * 3)), 0);
    setEnc({ w, bossName: enemy.name, bossMax, partyHp: partyMax, partyMax, botDps, enrage: c.kind === "raid" ? 95 : 70, elapsed: 0, log: [`⚔️ Engaging ${enemy.name}!`], _done: false });
    setPhase("encounter");
  };

  // encounter loop — the local player runs on the REAL engine (auto-attacks + your DoTs + gems),
  // bots add simulated pressure, the boss hits back via the real damage/mitigation model. No gambits.
  useEffect(() => {
    if (phase !== "encounter") return;
    const TICK = 350;
    const iv = setInterval(() => {
      setEnc((E) => {
        if (!E || E._done) return E;
        const now = Date.now(); const c = char; const maxHp = maxHpFor(c);
        const sp = secondaryPcts(effectiveStats(c));
        let w = { ...E.w, enemy: { ...E.w.enemy }, playerEffects: (E.w.playerEffects || []).filter((e) => e.expires > now), enemyEffects: (E.w.enemyEffects || []).filter((e) => e.expires > now) };
        let log = E.log; const pushLog = (t) => { log = [...log, t].slice(-9); };
        // player auto-attacks (identical math to the solo loop)
        const pSpeed = Math.max(0.1, 1 + agiAtkSpeed(c) + talentMods(c).atkSpeed + hasteOf(c)) * hasteMultOf(w.playerEffects) * playerSpeedMultOf(w.playerEffects);
        const pInterval = PLAYER_BASE_INTERVAL / pSpeed;
        const critStackPer = gemAutoCritStack(c), execThresh = gemAutoExec(c);
        let g = 0;
        while (now >= w.playerNextAt && w.enemy.hp > 0 && g++ < 8) {
          const crit = Math.random() < critChanceFor(c);
          let dmg = Math.floor(computeDamage(c, rollWeaponDmg(c), talentFlag(c, "intAuto")) * empowerMultOf(w.playerEffects));
          dmg *= 1 + talentMods(c).autoPct;
          dmg *= talentAutoMult(c, w.enemy.maxHp > 0 ? w.enemy.hp / w.enemy.maxHp : 1);
          if (crit) { dmg *= critMultFor(c) + (w.autoCritStacks || 0) * critStackPer; w.autoCritStacks = 0; } else if (critStackPer > 0) w.autoCritStacks = (w.autoCritStacks || 0) + 1;
          dmg = Math.max(1, Math.floor(dmg));
          w.enemy.hp = Math.max(0, w.enemy.hp - dmg);
          if (execThresh > 0 && w.enemy.hp > 0 && w.enemy.hp <= w.enemy.maxHp * execThresh) w.enemy.hp = 0;
          if (sp.leech > 0 || talentMods(c).leech > 0) { const h = Math.floor(dmg * (sp.leech + talentMods(c).leech) / 100); if (h > 0) w.hp = Math.min(maxHp, w.hp + h); }
          w.playerNextAt += pInterval;
        }
        if (now >= w.playerNextAt) w.playerNextAt = now + pInterval;
        // your damage-over-time effects tick on the boss (same as solo)
        w.enemyEffects.forEach((e) => { if (e.kind === "dot") { let g2 = 0; while (now >= e.nextTick && w.enemy.hp > 0 && g2++ < 6) { w.enemy.hp = Math.max(0, w.enemy.hp - e.dmgPerTick); const lp = sp.leech + talentMods(c).leech; if (lp > 0) w.hp = Math.min(maxHp, w.hp + Math.floor(e.dmgPerTick * lp / 100)); e.nextTick += 1000; } } });
        // bots add pressure (the one simulated part — no bot combat engine yet)
        w.enemy.hp = Math.max(0, w.enemy.hp - E.botDps * (TICK / 1000));
        resExpire(w, now);
        // boss attacks (real per-level damage, mitigated by your armor + ward, avoidable by dodge)
        const elapsed = E.elapsed + TICK / 1000;
        let partyHp = E.partyHp;
        const enrOver = Math.max(0, elapsed - E.enrage);
        const enr = enrOver > 0 ? 1 + 0.06 * enrOver : 1;
        if (now >= w.enemyNextAt) {
          const dodge = w.playerEffects.filter((e) => e.kind === "dodge").reduce((m, e) => Math.max(m, e.pct), 0) / 100;
          const ward = w.playerEffects.filter((e) => e.kind === "ward").reduce((m, e) => m + e.pct, 0) / 100;
          const raw = enemyDamageForLevel(w.enemy.level) * (content.kind === "raid" ? 1.4 : 1.0) * enr;
          const mit = mitigation(sp.armor || 0, w.enemy.level);
          const hit = Math.max(1, Math.round(raw * (1 - mit) * (1 - ward)));
          partyHp -= hit * 2;
          if (Math.random() > dodge) w.hp = Math.max(0, w.hp - Math.round(hit * 0.6)); else pushLog("🌀 You dodge the boss!");
          w.enemyNextAt = now + ENEMY_BASE_INTERVAL;
          if (enrOver > 0 && Math.floor(elapsed) === Math.ceil(E.enrage)) pushLog("🔥 ENRAGE — burn it down!");
        }
        const gRegen = gemRegen(c); if (gRegen > 0 && w.hp > 0 && w.hp < maxHp) { if (!w.regenNextAt) w.regenNextAt = now + 1000; if (now >= w.regenNextAt) { w.hp = Math.min(maxHp, w.hp + Math.max(1, Math.floor(maxHp * gRegen / 100))); w.regenNextAt = now + 1000; } }
        if (w.enemy.hp <= 0) { setTimeout(() => finishEncounter(true), 40); return { ...E, w, elapsed, partyHp, _done: true, log: [...log, "💀 Boss defeated!"].slice(-9) }; }
        if (partyHp <= 0 || w.hp <= 0) { setTimeout(() => finishEncounter(false), 40); return { ...E, w, elapsed, partyHp: Math.max(0, partyHp), _done: true, log: [...log, "☠️ The party has wiped..."].slice(-9) }; }
        return { ...E, w, elapsed, partyHp, log };
      });
    }, 350);
    return () => clearInterval(iv);
  }, [phase, content, char]);

  const playerSkills = (char.selectedSkills || []).map((n) => skillByName(char, n)).filter(Boolean).slice(0, 6);
  const castSkill = (sk) => {
    setEnc((E) => {
      if (!E || E._done || E.w.enemy.hp <= 0) return E;
      const now = Date.now();
      if ((E.w.cooldowns && E.w.cooldowns[sk.name] || 0) > now) return E;                 // still on cooldown
      if (talentFlag(char, "noMagic") && isMagicSkill(sk)) return E;                        // Crusader can't cast magic
      let log = E.log;
      const res = applySkillCore(sk, char, E.w, now, (t) => { log = [...log, t].slice(-9); }); // REAL skill engine
      const next = { ...E, w: res.battle, log };
      if (res.died) { setTimeout(() => finishEncounter(true), 40); next._done = true; }
      return next;
    });
  };

  const finishEncounter = (win) => {
    if (encRef.current && encRef.current._done) return; if (encRef.current) encRef.current._done = true;
    if (!win) { setPhase("done"); setRewardMsg("The party wiped — no loot this time. Regroup and try again."); return; }
    const floor = content.kind === "raid" ? "epic" : (content.ilvl >= 60 ? "epic" : "rare");
    const drops = [generateItem(content.ilvl, rarityById(floor), pickLootSlot(), char.cls)];
    if (content.kind === "raid") drops.push(generateItem(content.ilvl, rarityById("epic"), pickLootSlot(), char.cls));
    openBid(drops, 0);
  };

  // ---- GDKP-style loot bid: bid gold vs the party; losers of the roll can buy an exact copy for Ven ----
  const openBid = (queue, idx) => {
    if (idx >= queue.length) { setPhase("done"); setRewardMsg("Run complete! Bidding finished."); return; }
    const item = queue[idx];
    const reserve = gdkpReserve(item);
    const bidders = party.filter((m) => !m.me).map((m) => ({ name: m.name, maxBid: gdkpBotCeiling(reserve, m.power), cur: 0 }));
    setLoot({ queue, idx, item, timeLeft: 15, high: 0, highName: null, min: reserve, myEntered: false, bidders, pot: 0, resolved: false });
    setPhase("loot");
  };
  useEffect(() => {
    if (phase !== "loot" || !loot || loot.resolved) return;
    if (loot.timeLeft <= 0) { if (!loot.passed) setLoot((L) => (L && !L.resolved) ? { ...L, passed: L.highName !== char.name, autoPassed: L.highName !== char.name } : L); resolveBid(); return; } // no action by 0s = pass
    const t = setTimeout(() => {
      setLoot((L) => {
        if (!L || L.resolved) return L;
        let high = L.high, highName = L.highName, bidders = L.bidders;
        // a bot may raise if it's below its ceiling
        const floor = high > 0 ? high + 20 : (L.min || 0);                      // the opening bid must meet the reserve
        const eligible = bidders.filter((b) => b.maxBid >= floor && Math.random() < 0.5);
        if (eligible.length) { const b = pick(eligible); const raise = high > 0 ? high + Math.round(20 + Math.random() * Math.max(20, high * 0.25)) : floor; high = Math.min(b.maxBid, Math.max(floor, raise)); highName = b.name; }
        return { ...L, timeLeft: L.timeLeft - 1, high, highName };
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, loot]);

  const placeBid = (amount) => {
    setLoot((L) => {
      if (!L || L.resolved || L.passed) return L;
      const target = Math.max(L.high > 0 ? L.high + 20 : (L.min || 0), amount);  // can't bid under the reserve
      if (target > (char.gold || 0)) { showNotif && showNotif("Not enough gold to bid that much"); return L; }
      return { ...L, high: target, highName: char.name, myEntered: true, timeLeft: Math.max(L.timeLeft, 4) };
    });
  };
  // Pass = step out of the bidding but stay for the whole auction, so your cut is a share of the
  // FINAL hammer price rather than whatever the bid happened to be when you stepped away.
  const passBid = () => setLoot((L) => (!L || L.resolved) ? L : { ...L, passed: true });
  const resolveBid = () => {
    setLoot((L) => {
      if (!L || L.resolved) return L;
      const iWon = !L.passed && L.highName === char.name && L.high > 0;
      let nc = { ...char };
      if (iWon) {
        nc.gold = Math.max(0, (nc.gold || 0) - L.high);
        { const d = depositEarned(nc, L.item); nc.inventory = d.inventory; nc.overflow = d.overflow; }
        commitChar(nc);
        setRewardMsg(`🏆 You won ${L.item.name} for ${mpFmt(L.high)}g!`);
        setTimeout(() => openBid(L.queue, L.idx + 1), 1400);
        return { ...L, resolved: true, iWon: true };
      }
      // a bot won: GDKP payout — the winning bid is split among the other rollers (you included)
      if (L.high > 0) { const share = Math.floor(L.high / Math.max(2, party.length)); if (share > 0) { nc.gold = (nc.gold || 0) + share; commitChar(nc); } }
      return { ...L, resolved: true, iWon: false, payout: L.high > 0 ? Math.floor(L.high / Math.max(2, party.length)) : 0 };
    });
  };
  const buyCopy = () => {
    if ((char.ven || 0) < COPY_ITEM_VEN) { showNotif && showNotif(`Need ${COPY_ITEM_VEN} 💎 Ven for a copy`); return; }
    const L = loot; if (!L) return;
    const nc = { ...char, ven: (char.ven || 0) - COPY_ITEM_VEN, ...depositEarned(char, { ...L.item }) };
    commitChar(nc);
    setRewardMsg(`💎 Bought an exact copy of ${L.item.name} for ${COPY_ITEM_VEN} Ven.`);
    setTimeout(() => openBid(L.queue, L.idx + 1), 1000);
  };
  const skipCopy = () => { const L = loot; if (L) setTimeout(() => openBid(L.queue, L.idx + 1), 50); };
  const leaveGroup = () => { setPhase("browse"); setContent(null); setParty([]); setEnc(null); setLoot(null); };

  // ============ ARENA — LADDER (power leaderboard) ============
  const [ladder, setLadder] = useState(null);
  const lifetime = mp.lifetime || { wins: 0, losses: 0 };
  const myRating = arenaRating(lifetime.wins, lifetime.losses);
  const buildLadder = async (drift) => {
    if (drift) mpRosterDrift();
    let real = [];
    try { real = await mpProvider.fetchLadder(50); } catch {}
    const realEntries = real.map((o) => { const ci = CLASSES.find((c) => c.id === o.cls) || {}; return { id: "pvp_" + o.user_id, name: o.name, cls: o.cls, clsName: ci.name, icon: ci.icon, color: ci.color, spec: o.spec, specName: null, power: o.power || 0, wins: o.wins || 0, losses: o.losses || 0, rated: { wins: o.wins || 0, losses: o.losses || 0 }, rating: o.rating || arenaRating(o.wins, o.losses), real: true }; });
    const need = Math.max(0, 24 - realEntries.length);
    const bots = need > 0 ? mpLadderRoster(need).map((b) => ({ ...b, rated: { wins: b.wins, losses: b.losses }, rating: arenaRating(b.wins, b.losses) })) : [];
    const meEntry = { ...me, rated: lifetime, rating: myRating };
    const field = realEntries.concat(bots).concat([meEntry]).sort((a, b) => b.rating - a.rating);
    const rank = field.findIndex((x) => x.me) + 1;
    setLadder({ field, rank });
    const best = mp.ladderBest ? Math.min(mp.ladderBest, rank) : rank;
    if (best !== mp.ladderBest) commitChar({ ...char, mp: { ...mp, ladderBest: best } });
  };
  useEffect(() => { if (sub === "ladder" && !ladder) buildLadder(false); }, [sub]);

  // ============ ARENA — RATED (live matchmaking, 24h W/L window) ============
  const rated = mp.rated || { wins: 0, losses: 0, start: Date.now() };
  const windowMs = 24 * 3600000;
  const windowLeft = Math.max(0, rated.start + windowMs - Date.now());
  const windowOver = windowLeft <= 0;
  const net = Math.max(0, (rated.wins || 0) - (rated.losses || 0));
  const [match, setMatch] = useState(null); // { opp, state:"searching"|"result", win }
  const findMatch = () => {
    const oppRating = Math.max(1000, Math.round(myRating + (Math.random() * 320 - 130))); // your bracket, tilted slightly tougher
    const base = mpProvider.findOpponent(myPower, char.level, myRating);
    const opp = { ...base, rating: base.rating || oppRating };
    if (onStartRated) { onStartRated(opp); return; } // fight live on the real combat screen; W/L recorded on result
    // fallback (no combat host): quick resolve
    const win = Math.random() < myPower / (myPower + opp.power);
    commitChar({ ...char, mp: { ...mp, rated: { wins: (rated.wins || 0) + (win ? 1 : 0), losses: (rated.losses || 0) + (win ? 0 : 1), start: rated.start } } });
    setMatch({ opp, state: "result", win });
  };
  const claimRated = () => {
    const reward = net * 40 + (net >= 10 ? 200 : 0);
    const ven = Math.floor(net / 5) * 5;
    commitChar({ ...char, gold: (char.gold || 0) + reward, ven: (char.ven || 0) + ven, mp: { ...mp, rated: { wins: 0, losses: 0, start: Date.now() } } });
    showNotif && showNotif(`🏆 Rated rewards: +${mpFmt(reward)}g${ven ? ` · +${ven} 💎` : ""}`);
    setMatch(null);
  };
  const fmtDur = (ms) => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return `${h}h ${m}m`; };

  // ---------- shared bits ----------
  const memberRow = (m, extra) => (
    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: m.me ? "var(--verdigris)" : "var(--verdigris)", border: `1px solid ${m.me ? "var(--verdigris)" : "var(--hairline)"}`, borderRadius: 8, padding: "6px 9px" }}>
      <span style={{ fontSize: 16 }}>{m.icon || "🧑"}</span>
      <span style={{ flex: 1, minWidth: 0 }}><span style={{ color: m.me ? "var(--verdigris)" : "var(--verdigris)", fontSize: 12, fontWeight: 700 }}>{m.name}{m.me ? " (you)" : ""}</span><span style={{ color: "var(--ink-soft)", fontSize: 9.5, display: "block" }}>{m.specName || m.clsName || ""} · {mpFmt(m.power)} pwr{m.latency ? ` · ${m.latency}ms` : ""}</span></span>
      {extra}
    </div>
  );
  const bar = (val, max, color) => (<div style={{ background: "var(--sunk)", borderRadius: 6, height: 12, overflow: "hidden", border: "1px solid var(--hairline)" }}><div style={{ width: `${Math.max(0, Math.min(100, (val / max) * 100))}%`, height: "100%", background: color, transition: "width .3s" }} /></div>);
  const tabBtn = (id, label) => (<button onClick={() => setSub(id)} style={{ flex: 1, background: sub === id ? "var(--raised)" : "var(--verdigris)", border: `1px solid ${sub === id ? "var(--rule)" : "var(--hairline)"}`, borderRadius: 8, color: sub === id ? "var(--ink)" : "var(--ink-soft)", fontSize: 11.5, fontWeight: 700, padding: "8px 4px", cursor: "pointer" }}>{label}</button>);

  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={onExit} style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--ink)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>← Town</button>
        <span style={{ color: "var(--rar-epic)", fontFamily: "Georgia, serif", fontSize: 15 }}><Icon name="sword" /> Multiplayer</span>
        <span style={{ color: "var(--ink-soft)", fontSize: 10.5 }}>Power {mpFmt(myPower)}</span>
      </div>
      <div style={{ background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 8, padding: "6px 10px", marginBottom: 10, color: "var(--ink-soft)", fontSize: 10, lineHeight: 1.4, textAlign: "center" }}>Arena — Ladder & Rated PvP. You face real players' loadouts when they're online; training bots fill in the rest.</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>{tabBtn("ladder", "🏆 Ladder")}{tabBtn("rated", "⚔️ Rated PvP")}</div>

      {sub === "finder" && phase === "browse" && (
        <div>
          <div style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>Queue for group content. Empty slots fill after {MP_QUEUE_WAIT}s. No auto-combat or gambits here — you play your skills by hand. Bosses drop loot you <b>bid gold</b> on against the party.</div>
          {["dungeon", "raid"].map((kind) => (
            <div key={kind}>
              <div className="eyebrow"><span>{kind === "dungeon" ? "Dungeons · 4 players" : "Raids · 6 players"}</span></div>
              {MP_CONTENT.filter((c) => c.kind === kind).map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--sunk)", border: "1px solid var(--hairline)", borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
                  <span style={{ fontSize: 22 }}><EmojiIcon emoji={c.icon} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ color: c.color || "var(--verdigris)", fontSize: 13, fontWeight: 700 }}>{c.name}</span><span style={{ color: "var(--ink-soft)", fontSize: 10, display: "block" }}>{c.boss} · Lv {c.level} · ilvl {c.ilvl}{c.hard ? " · Hard" : ""}</span></span>
                  <button onClick={() => startQueue(c)} className="go" style={{ width: "auto", margin: 0 }}>Queue</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {sub === "finder" && phase === "queue" && content && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 4 }}><EmojiIcon emoji={content.icon} /></div>
          <div style={{ color: "var(--ink)", fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700 }}>{content.name}</div>
          <div style={{ color: "var(--rar-epic)", fontSize: 34, fontWeight: 800, margin: "8px 0" }}>{countdown}</div>
          <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 12 }}>Finding players… filling with available adventurers at 0.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, textAlign: "left" }}>
            {party.map((m) => memberRow(m))}
            {Array.from({ length: Math.max(0, content.size - party.length) }).map((_, i) => (<div key={"e" + i} style={{ border: "1px dashed var(--verdigris)", borderRadius: 8, padding: "10px 9px", color: "var(--ink-faint)", fontSize: 11, textAlign: "center" }}>searching…</div>))}
          </div>
          <button onClick={leaveGroup} className="go is-quiet">Leave queue</button>
        </div>
      )}

      {sub === "finder" && phase === "encounter" && enc && (() => {
        const w = enc.w; const now = Date.now(); const myMax = maxHpFor(char);
        return (
        <div>
          <div style={{ textAlign: "center", marginBottom: 6 }}><span style={{ color: "var(--rubric)", fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700 }}>{enc.bossName}</span>{label && label !== enc.bossName && <span style={{ color: "var(--ink-soft)", fontSize: 10.5, display: "block" }}>{label}</span>}</div>
          <div style={{ marginBottom: 4 }}>{bar(w.enemy.hp, enc.bossMax, "var(--rubric)")}</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-soft)", fontSize: 9.5, marginBottom: 8 }}><span>{mpFmt(w.enemy.hp)} / {mpFmt(enc.bossMax)}</span><span>{enc.elapsed >= enc.enrage ? "🔥 ENRAGED" : `enrage in ${Math.max(0, Math.ceil(enc.enrage - enc.elapsed))}s`}</span></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}><div style={{ color: "var(--ink-soft)", fontSize: 9.5, marginBottom: 2 }}>Party</div>{bar(enc.partyHp, enc.partyMax, "var(--verdigris)")}</div>
            <div style={{ flex: 1 }}><div style={{ color: "var(--ink-soft)", fontSize: 9.5, marginBottom: 2 }}>You · {mpFmt(w.hp)}/{mpFmt(myMax)}{(w.res || 0) > 0 ? ` · ${classResource(char.cls).icon}${Math.floor(w.res)}` : ""}</div>{bar(w.hp, myMax, "var(--verdigris)")}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {playerSkills.length ? playerSkills.map((sk) => { const cd = (w.cooldowns && w.cooldowns[sk.name]) || 0; const ready = now >= cd; return (
              <button key={sk.name} onClick={() => castSkill(sk)} disabled={!ready} style={{ flex: "1 1 44%", background: ready ? "var(--raised)" : "var(--verdigris)", border: `1px solid ${ready ? "var(--rule)" : "var(--hairline)"}`, borderRadius: 9, color: ready ? "var(--ink)" : "var(--ink-faint)", fontSize: 11.5, fontWeight: 700, padding: "10px 6px", cursor: ready ? "pointer" : "default" }}>{sk.icon || "✨"} {sk.name}{!ready ? ` (${Math.ceil((cd - now) / 1000)}s)` : ""}</button>
            ); }) : <button onClick={() => castSkill({ name: "Strike", mult: 1.5, cd: 3, icon: "🗡️" })} className="go"><Icon name="sword" /> Strike</button>}
          </div>
          <div style={{ background: "var(--sunk)", border: "1px solid var(--verdigris)", borderRadius: 8, padding: 8, height: 92, overflowY: "auto", fontSize: 10, color: "var(--verdigris)", lineHeight: 1.5 }}>{enc.log.map((l, i) => <div key={i}>{withIcons(l, 12)}</div>)}</div>
        </div>
        );
      })()}

      {sub === "finder" && phase === "loot" && loot && (
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "var(--gilt)", fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Loot Roll · Bid Gold</div>
          <div style={{ background: "var(--sunk)", border: `2px solid ${rarityById(loot.item.rarity).color || "var(--ink-faint)"}`, borderRadius: 12, padding: "12px", marginBottom: 10 }}>
            <div style={{ fontSize: 26 }}>{loot.item.icon || "🎁"}</div>
            <div style={{ color: rarityById(loot.item.rarity).color || "var(--ink)", fontSize: 14, fontWeight: 700 }}>{loot.item.name}</div>
            <div style={{ color: "var(--ink-soft)", fontSize: 10 }}>ilvl {loot.item.ilvl} · {rarityById(loot.item.rarity).name}</div>
          </div>
          {!loot.resolved ? (
            <>
              <div style={{ color: "var(--rar-epic)", fontSize: 13, marginBottom: 2 }}>High bid: <b>{loot.high ? mpFmt(loot.high) + "g" : "—"}</b>{loot.highName ? ` · ${loot.highName}` : ""}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 10 }}>Reserve <b>{mpFmt(loot.min || 0)}g</b> · {loot.timeLeft}s left · your gold: {mpFmt(char.gold || 0)}</div>
              {loot.passed ? (
                <div style={{ background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 9, padding: "10px 12px", color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.5 }}>
                  ✋ <b>You passed.</b> Staying until the hammer falls so your cut is a share of the final price.
                </div>
              ) : (<>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {[100, 500, 1000].map((inc) => (<button key={inc} onClick={() => placeBid((loot.high > 0 ? loot.high : (loot.min || 0)) + inc)} className="go is-quiet" style={{ margin: 0, flex: 1 }}>+{mpFmt(inc)}</button>))}
                </div>
                <button onClick={() => placeBid(loot.high > 0 ? loot.high + 20 : (loot.min || 0))} className="go">{loot.high > 0 ? `Bid ${mpFmt(loot.high + 20)}g` : `Open at ${mpFmt(loot.min || 0)}g`}</button>
                <button onClick={passBid} className="go is-quiet">Pass</button>
              </>)}
            </>
          ) : loot.iWon ? (
            <div style={{ color: "var(--verdigris)", fontSize: 13, fontWeight: 700 }}>{rewardMsg || "You won the item!"}</div>
          ) : (
            <>
              <div style={{ color: "var(--rubric)", fontSize: 12, marginBottom: 4 }}>{loot.autoPassed ? "Time expired — you passed. " : loot.passed ? "You passed. " : ""}{loot.highName || "A rival"} won the roll{loot.payout ? ` — your full share: +${mpFmt(loot.payout)}g` : ""}.</div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 10 }}>Buy an exact copy for {COPY_ITEM_VEN} 💎 Ven? (you have {char.ven || 0})</div>
              <button onClick={buyCopy} className="go"><Icon name="gem" /> Buy copy · {COPY_ITEM_VEN} Ven</button>
              <button onClick={skipCopy} className="go is-quiet">No thanks</button>
            </>
          )}
        </div>
      )}

      {sub === "finder" && phase === "done" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🏁</div>
          <div style={{ color: "var(--ink)", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>{rewardMsg || "Run complete."}</div>
          <button onClick={leaveGroup} className="go">Back to Group Finder</button>
        </div>
      )}

      {sub === "ladder" && (
        <div>
          <div style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>The Conquest Ladder ranks champions by <b>Rating</b> — win rate amplified by how many matches you've played, so consistency over time beats a small hot streak. {mp.ladderBest ? <>Best rank: <b>#{mp.ladderBest}</b>.</> : null}</div>
          {ladder && (<>
            <div style={{ textAlign: "center", background: "var(--verdigris)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "10px", marginBottom: 10 }}>
              <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>Rank</span> <span style={{ color: "var(--ink)", fontSize: 20, fontWeight: 800 }}>#{ladder.rank}</span> <span style={{ color: "var(--ink-soft)", fontSize: 11 }}>· Rating </span><span style={{ color: "var(--gilt)", fontSize: 15, fontWeight: 800 }}>{myRating}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ladder.field.slice(0, 20).map((m, i) => { const rec = m.rated || { wins: 0, losses: 0 }; const gp = (rec.wins || 0) + (rec.losses || 0); const wr = gp ? Math.round((rec.wins / gp) * 100) : 0; return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: m.me ? "var(--verdigris)" : "var(--sunk)", border: `1px solid ${m.me ? "var(--verdigris)" : "var(--verdigris)"}`, borderRadius: 7, padding: "5px 9px" }}>
                  <span style={{ color: i < 3 ? "var(--gilt)" : "var(--ink-faint)", fontSize: 12, fontWeight: 800, width: 26 }}>#{i + 1}</span>
                  <span style={{ fontSize: 14 }}><EmojiIcon emoji={m.icon} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ color: m.me ? "var(--verdigris)" : "var(--verdigris)", fontSize: 12, fontWeight: m.me ? 700 : 500, display: "block" }}>{m.name}{m.me ? " (you)" : ""}</span><span style={{ color: "var(--ink-faint)", fontSize: 9 }}>{wr}% · {gp} games</span></span>
                  <span style={{ color: "var(--gilt)", fontSize: 13, fontWeight: 800 }}>{m.rating}</span>
                </div>
              ); })}
            </div>
            <button onClick={() => buildLadder(true)} className="go is-quiet">Refresh ladder</button>
          </>)}
        </div>
      )}

      {sub === "rated" && (
        <div>
          <div style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>Rated Arena — live 1v1 matchmaking. Every <b>win</b> grants a 🎟️ Arena Token and raises your Rating; wins over 24h pay prizes (losses subtract).</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: "var(--gilt)", fontSize: 22, fontWeight: 800 }}>{myRating}</div><div style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Rating</div></div>
            <div style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--bole)", borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: "var(--bole)", fontSize: 22, fontWeight: 800 }}><Icon name="ticket" /> {char.arenaTokens || 0}</div><div style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Arena Tokens</div></div>
          </div>
          <div style={{ color: "var(--ink-faint)", fontSize: 9.5, textAlign: "center", marginBottom: 8 }}>Lifetime {lifetime.wins || 0}W / {lifetime.losses || 0}L · Spend tokens at the 🛡️ Battlemaster in the Market</div>
          {/* Attempts and streak. Shown BEFORE the queue button, because running out mid-session
              with no warning is how a limit reads as a bug rather than a rule. */}
          {(() => {
            const left = arenaRunsLeft(char), tix = arenaTicketsLeft(char), st = arenaToday(char).streak;
            const next = arenaPayout(true, st);
            return (
              <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap",
                            fontSize: 10.5, marginBottom: 10, color: "var(--ink-soft)" }}>
                <span>Attempts today: <b style={{ color: left > 0 ? "var(--verdigris)" : "var(--rubric)" }}>{left}/{ARENA.dailyRuns}</b></span>
                {left === 0 && tix > 0 && <span><Icon name="arena" /> Tickets: <b>{tix}</b></span>}
                {st > 0 && <span><Icon name="flame" /> Streak <b style={{ color: "var(--bole)" }}>{st}</b></span>}
                <span>Next win: <b style={{ color: "var(--bole)" }}>+{next} 🎟️</b></span>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: "var(--verdigris)", fontSize: 20, fontWeight: 800 }}>{rated.wins || 0}</div><div style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Wins</div></div>
            <div style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--verdigris)", borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: "var(--rubric)", fontSize: 20, fontWeight: 800 }}>{rated.losses || 0}</div><div style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Losses</div></div>
            <div style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--rule)", borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: "var(--rar-epic)", fontSize: 20, fontWeight: 800 }}>{net}</div><div style={{ color: "var(--ink-soft)", fontSize: 9.5 }}>Net</div></div>
          </div>
          <div style={{ color: "var(--ink-soft)", fontSize: 10.5, textAlign: "center", marginBottom: 12 }}>{windowOver ? "Window ended — claim your prizes to start a new one." : `Window resets in ${fmtDur(windowLeft)}`}</div>
          {windowOver ? (
            <button onClick={claimRated} className="go"><Icon name="trophy" /> Claim prizes (net {net})</button>
          ) : match && match.state === "searching" ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "var(--rar-epic)", fontSize: 13 }}><Icon name="target" /> Finding an opponent near your power…</div>
          ) : match && match.state === "result" ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, marginBottom: 4 }}>{match.win ? "🏆" : "💀"}</div>
              <div style={{ color: match.win ? "var(--verdigris)" : "var(--rubric)", fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{match.win ? "Victory!" : "Defeat"}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 12 }}>vs {match.opp.name} · {mpFmt(match.opp.power)} pwr</div>
              <button onClick={findMatch} className="go">Queue again</button>
            </div>
          ) : !arenaCanEnter(char) ? (
            <div style={{ textAlign: "center", padding: "14px 10px", background: "var(--raised)", border: "1px solid var(--rubric)", borderRadius: 10, marginBottom: 8 }}>
              <div style={{ color: "var(--rubric)", fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Out of attempts today</div>
              <div style={{ color: "var(--ink-soft)", fontSize: 11, lineHeight: 1.5 }}>
                {ARENA.dailyRuns} rated bouts a day. A 🏟️ Arena Challenge Ticket buys another —
                50 tokens at the Battlemaster, or 99 Ven in the shop. Practice Duels stay free.
              </div>
            </div>
          ) : (
            <>
              {/* A first bout should not go on a permanent record. This one is fought against an
                  explicitly built bot — never mpProvider.findOpponent, which can return a real
                  player's loadout — and neither a win nor a loss is recorded. */}
              <button onClick={onStartPractice} disabled={!onStartPractice}
                style={{ width: "100%", background: "var(--raised)",
                  border: `1.5px solid ${lessonWantsDuel ? "var(--gilt)" : "var(--verdigris)"}`, borderRadius: 10,
                  color: lessonWantsDuel ? "var(--gilt)" : "var(--verdigris)", fontSize: 13, fontWeight: 700,
                  padding: "11px", cursor: "pointer", marginBottom: 8,
                  animation: lessonWantsDuel ? "tutflash 1.4s ease-in-out infinite" : "none" }}>
                <Icon name="target" /> Practice Duel {char.tutorial?.duelDone ? "✓" : ""}
                <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 10, fontWeight: 400, marginTop: 2 }}>
                  Unranked, against a training partner. Nothing is recorded, win or lose.
                </span>
              </button>
              <button onClick={findMatch} className="go"><Icon name="sword" /> Find match</button>
            </>
          )}
        </div>
      )}

    </div>
  );
}

// Catches any render/lifecycle crash and shows the error instead of a black screen,
// with a recovery path. Saves live separately, so this never loses data.
class GameErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error("Realms of Eldoria crashed:", err, info); } catch {} }
  render() {
    if (this.state.err) {
      const msg = String((this.state.err && (this.state.err.stack || this.state.err.message)) || this.state.err);
      return (
        <div style={{ maxWidth: 500, margin: "40px auto", padding: 20, fontFamily: "system-ui, sans-serif", color: "var(--verdigris)" }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 10 }}>⚠️</div>
          <div style={{ color: "var(--gilt)", fontWeight: 700, fontSize: 16, textAlign: "center", marginBottom: 10, fontFamily: "Georgia, serif" }}>Something broke while loading</div>
          <div style={{ background: "var(--raised)", border: "1px solid var(--rubric)", borderRadius: 8, padding: 12, fontSize: 11.5, color: "var(--rubric)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto", marginBottom: 12 }}>{msg}</div>
          <div style={{ color: "var(--ink-soft)", fontSize: 12, marginBottom: 12 }}>Your character is saved separately and was not lost. Reload to try again — if it keeps happening, screenshot this message.</div>
          <button onClick={() => { try { window.location.reload(); } catch {} }} style={{ width: "100%", background: "var(--raised)", border: "1.5px solid var(--rule)", borderRadius: 10, color: "var(--ink)", fontSize: 14, fontWeight: 700, padding: 12, cursor: "pointer" }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [screen, setScreen] = useState("select");
  const [saves, setSaves] = useState(() => (loadSave() || []).map(normalizeChar));
  const [activeIdx, setActiveIdx] = useState(null);
  const savesRef = useRef(saves);
  useEffect(() => { savesRef.current = saves; }, [saves]);

  // ----- cloud save state -----
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [emailMode, setEmailMode] = useState(false); // reveal the email-code fallback in the Sync panel
  const [authStage, setAuthStage] = useState("email"); // email → code
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingCloud, setPendingCloud] = useState(null); // { data, cloudMs, cloudSummary, localSummary } when a real conflict needs the player's choice
  const isAnon = !session || !!session.user?.is_anonymous;
  const linked = !!session && !session.user?.is_anonymous; // has a real identity → cross-device

  const persist = (next) => { setSaves(next); writeSave(next); };
  const handleSelect = (i) => { setActiveIdx(i); setScreen("game"); };
  const handleCreate = (name, cls, race) => {
    const nc = createCharacter(name, cls, race);
    const next = [...saves, nc];
    persist(next); setActiveIdx(next.length - 1); setScreen("game");
  };
  const handleDelete = (i) => persist(saves.filter((_, idx) => idx !== i));
  const handleSave = (updated) => {
    setSaves((prev) => { const next = prev.map((s, i) => (i === activeIdx ? updated : s)); writeSave(next); return next; });
  };

  // ----- cloud sync core -----
  // Two clocks decide direction without nagging: localSaveTs (bumped on every local write) and
  // syncedTs (the cloud's updated_at as of our last successful sync). "Local changed since sync" =
  // localSaveTs > syncedTs. A one-way update (only one side moved) syncs silently; only a genuine
  // conflict — BOTH sides advanced since the last sync AND the data differs — prompts the player.
  const pushCloud = useCallback(async (next) => {
    const sb = getSupabase(); if (!sb) return;
    const uid = (await sb.auth.getSession()).data.session?.user?.id; if (!uid) return;
    setSyncMsg("Saving…");
    const iso = new Date().toISOString();
    const { error } = await sb.from("saves").upsert({ user_id: uid, data: next, updated_at: iso }, { onConflict: "user_id" });
    if (error) setSyncMsg("Save failed: " + error.message);
    else { const ms = Date.parse(iso); setLocalSaveTs(ms); setSyncedTs(ms); setSyncMsg("Synced ✓ " + new Date().toLocaleTimeString()); } // clean + synced as of this push
  }, []);
  // apply a cloud snapshot onto this device (download), marking it clean + synced
  const adoptCloud = useCallback((arr, cloudMs) => {
    const norm = (Array.isArray(arr) ? arr : []).map(normalizeChar);
    setSaves(norm); writeSave(norm); setLocalSaveTs(cloudMs); setSyncedTs(cloudMs); setActiveIdx(null);
    setSyncMsg("Loaded cloud save ✓");
  }, []);
  const pullCloud = useCallback(async (sess) => {
    const sb = getSupabase(); if (!sb || !sess) return;
    setSyncMsg("Syncing…");
    const { data, error } = await sb.from("saves").select("data,updated_at").eq("user_id", sess.user.id).maybeSingle();
    if (error) { setSyncMsg("Sync error: " + error.message); return; }
    const local = savesRef.current || [];
    if (!data) { await pushCloud(local); return; } // nothing in the cloud yet → upload this device
    const cloudMs = Date.parse(data.updated_at) || 0;
    const cloudArr = Array.isArray(data.data) ? data.data : [];
    const localDirty = localSaveTs() > syncedTs();   // this device has edits made since our last sync
    const cloudAdvanced = cloudMs > syncedTs();       // another device pushed since our last sync
    const sameData = JSON.stringify(local) === JSON.stringify(cloudArr.map(normalizeChar));
    if (sameData) { setLocalSaveTs(cloudMs); setSyncedTs(cloudMs); setSyncMsg("Up to date ✓"); return; } // identical — just reconcile clocks
    if (cloudAdvanced && localDirty) { // genuine conflict → let the player choose
      setPendingCloud({ data: cloudArr, cloudMs, cloudSummary: savesSummary(cloudArr.map(normalizeChar)), localSummary: savesSummary(local) });
      setSyncMsg("");
      return;
    }
    if (cloudAdvanced) { adoptCloud(cloudArr, cloudMs); return; } // only the cloud moved → safe download
    await pushCloud(local); // only this device moved → upload
  }, [pushCloud, adoptCloud]);
  const resolveConflict = (choice) => {
    const pc = pendingCloud; if (!pc) return;
    setPendingCloud(null);
    if (choice === "cloud") adoptCloud(pc.data, pc.cloudMs); // download cloud, replace this device
    else pushCloud(savesRef.current); // keep this device, overwrite the cloud
  };
  // push only if this device has unsynced changes (localSaveTs > syncedTs). Safe to call anytime.
  const flushCloud = useCallback(() => {
    if (!session || pendingCloud) return;
    if (localSaveTs() > syncedTs()) pushCloud(savesRef.current);
  }, [session, pendingCloud, pushCloud]);
  // last-ditch upload for hard app/tab close: a keepalive fetch fires synchronously and can outlive
  // the page. Uses the current access token from session (getSession is async and unsafe on unload).
  // Best-effort only — it doesn't update the sync clocks, so the next launch re-uploads if it failed.
  const beaconFlush = () => {
    try {
      if (!session || pendingCloud || localSaveTs() <= syncedTs()) return;
      const token = session.access_token, uid = session.user?.id;
      if (!token || !uid) return;
      fetch(SUPABASE_URL + "/rest/v1/saves?on_conflict=user_id", {
        method: "POST", keepalive: true,
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: uid, data: savesRef.current, updated_at: new Date().toISOString() }),
      });
    } catch {}
  };

  // auth lifecycle: sign in ANONYMOUSLY on launch so play is instant and progress cloud-backs-up on
  // this device with no login wall. Signing in with Google (or email) later moves to that account for
  // cross-device sync. Cloud pulls run on first load and on an explicit sign-in only — never on a
  // background token refresh, so in-progress local edits are never clobbered.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setAuthReady(true); return; }
    let unsub = null;
    // If we came back from an OAuth redirect carrying an error (e.g. the old email_exists case),
    // surface it and strip it from the address bar so it doesn't linger or re-trigger.
    try {
      const hay = (typeof window !== "undefined") ? (window.location.hash + "&" + window.location.search) : "";
      const m = hay.match(/error_code=([^&]+)/);
      if (m) {
        const code = decodeURIComponent(m[1]);
        setSyncMsg(code === "email_exists" ? "That Google account already exists — tap Continue with Google again to sign into it." : "Sign-in error: " + code);
        if (window.history?.replaceState) window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
    (async () => {
      try {
        let sess = (await sb.auth.getSession()).data.session;
        if (!sess) { const r = await sb.auth.signInAnonymously(); if (r.error) setSyncMsg("Cloud unavailable: " + r.error.message); sess = r.data?.session || null; }
        setSession(sess); setAuthReady(true);
        if (sess) pullCloud(sess);
      } catch (e) { setAuthReady(true); setSyncMsg("Cloud error: " + (e?.message || e)); }
    })();
    const res = sb.auth.onAuthStateChange((event, s) => { setSession(s); if (s && event === "SIGNED_IN") pullCloud(s); });
    unsub = res?.data?.subscription;
    return () => { try { unsub?.unsubscribe?.(); } catch {} };
  }, [pullCloud]);

  // (1) debounced push ~5s after the last change (fires during lulls)
  useEffect(() => {
    if (!session || pendingCloud) return;
    const t = setTimeout(flushCloud, 5000);
    return () => clearTimeout(t);
  }, [saves, session, pendingCloud, flushCloud]);

  // (2) safety-net: during continuous play the 5s timer keeps resetting, so also flush unsynced
  // changes at least every 30s. flushCloud is a no-op unless there's something new to upload.
  useEffect(() => {
    if (!session) return;
    const iv = setInterval(flushCloud, 30000);
    return () => clearInterval(iv);
  }, [session, flushCloud]);

  // (3) flush when the app is backgrounded or closed. visibilitychange→hidden is the reliable signal
  // on mobile (app switch / home); pagehide/beforeunload catch desktop tab close via keepalive fetch.
  useEffect(() => {
    if (!session) return;
    const onHide = () => { if (document.visibilityState === "hidden") { flushCloud(); beaconFlush(); } };
    const onClose = () => beaconFlush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onClose);
    window.addEventListener("beforeunload", onClose);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onClose); window.removeEventListener("beforeunload", onClose); };
  }, [session, flushCloud, pendingCloud]);

  // auth actions
  const signInGoogle = async () => {
    const sb = getSupabase(); if (!sb) return;
    setBusy(true); setSyncMsg("Opening Google…");
    // Always SIGN IN with Google (don't linkIdentity). Linking fails if the Google email already has
    // an account (error_code=email_exists) — which is exactly the cross-device case — and the failure
    // only comes back after the redirect, so it can't be caught here. Signing in loads that account's
    // cloud save; any progress made on this device carries up via pullCloud when the account is new.
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: (typeof window !== "undefined" ? window.location.origin : undefined) } });
    setBusy(false);
    if (error) setSyncMsg("Google sign-in error: " + error.message);
    // on success the browser redirects to Google and back; onAuthStateChange finishes the sign-in
  };
  const sendCode = async () => {
    const sb = getSupabase(); if (!sb) return;
    if (!/.+@.+\..+/.test(authEmail.trim())) { setSyncMsg("Enter a valid email."); return; }
    setBusy(true); setSyncMsg("Sending code…");
    const { error } = await sb.auth.signInWithOtp({ email: authEmail.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setSyncMsg("Error: " + error.message);
    else { setAuthStage("code"); setSyncMsg("Check your email for a 6-digit code."); }
  };
  const verifyCode = async () => {
    const sb = getSupabase(); if (!sb) return;
    setBusy(true); setSyncMsg("Verifying…");
    const { data, error } = await sb.auth.verifyOtp({ email: authEmail.trim(), token: authCode.trim(), type: "email" });
    setBusy(false);
    if (error) { setSyncMsg("Invalid or expired code: " + error.message); return; }
    setSession(data.session || null); setAuthCode(""); setAuthStage("email"); setEmailMode(false); setShowCloud(false);
    if (data.session) pullCloud(data.session);
  };
  const signOut = async () => {
    const sb = getSupabase(); if (!sb) return;
    try { await sb.auth.signOut(); const r = await sb.auth.signInAnonymously(); setSession(r.data?.session || null); } catch {}
    setSyncMsg("Signed out — back to a device-only account on this device.");
  };

  // ----- backup codes (export/import save data, stored in localStorage) -----
  const exportData = () => { try { return btoa(unescape(encodeURIComponent(JSON.stringify(saves)))); } catch { return ""; } };
  const importData = (code) => {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(String(code).trim()))));
      if (!Array.isArray(data)) return false;
      const norm = data.map(normalizeChar);
      persist(norm); setActiveIdx(null);
      return true;
    } catch { return false; }
  };

  const cloudOverlay = showCloud ? (
    <div onClick={() => setShowCloud(false)} className="veil">
      <div onClick={(e) => e.stopPropagation()} className="sheet is-gain is-wide">
        <div className="sheet-mark"><EmojiIcon emoji="☁️" size={22} /></div>
        <div className="sheet-title">{linked ? "Cloud Save" : "Sync Across Devices"}</div>
        {linked ? (
          <>
            <div style={{ color: "var(--ink-soft)", fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>Signed in as <b>{session.user?.email || "your account"}</b>. Your {saves.length} character{saves.length === 1 ? "" : "s"} sync automatically across your devices.</div>
            <button onClick={() => { if (session) pullCloud(session); }} className="go">Sync now</button>
            <button onClick={signOut} className="go is-quiet">Sign out</button>
            <button onClick={() => setShowCloud(false)} className="go is-quiet">Close</button>
          </>
        ) : (
          <>
            <div style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.55, marginBottom: 12 }}>Your progress already saves automatically on this device. Sign in to <b>sync across devices</b> and keep it safe if you reinstall — your current characters carry over.</div>
            <button disabled={busy} onClick={signInGoogle} style={btnGoogle}><span style={{ fontWeight: 700 }}>G</span>&nbsp; Continue with Google</button>
            {!emailMode ? (
              <button onClick={() => { setEmailMode(true); setSyncMsg(""); }} className="go is-quiet">Use an email code instead</button>
            ) : authStage === "email" ? (
              <>
                <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@email.com" className="field" />
                <button disabled={busy} onClick={sendCode} className="go is-quiet">Send me a code</button>
              </>
            ) : (
              <>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, marginBottom: 6 }}>Enter the 6-digit code sent to <b>{authEmail}</b>.</div>
                <input value={authCode} onChange={(e) => setAuthCode(e.target.value)} placeholder="123456" inputMode="numeric" className="field" />
                <button disabled={busy} onClick={verifyCode} className="go is-quiet">Verify &amp; sign in</button>
                <button onClick={() => { setAuthStage("email"); setSyncMsg(""); }} className="link" style={{ display: "block", margin: "8px auto 0" }}>← use a different email</button>
              </>
            )}
            <button onClick={() => setShowCloud(false)} className="link" style={{ display: "block", margin: "8px auto 0" }}>Keep playing on this device only</button>
          </>
        )}
        {syncMsg && <div style={{ color: "var(--ink-soft)", fontSize: 10.5, textAlign: "center", marginTop: 10 }}>{syncMsg}</div>}
      </div>
    </div>
  ) : null;

  const cloudButton = screen === "select" ? (
    <button onClick={() => setShowCloud(true)} title="Cloud save" style={{ position: "fixed", top: 10, right: 10, zIndex: 350, background: linked ? "var(--raised)" : "var(--raised)", border: `1px solid ${linked ? "var(--verdigris)" : "var(--rule)"}`, borderRadius: 20, color: linked ? "var(--verdigris)" : "var(--rar-epic)", fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>☁️ {linked ? "Synced" : "Sync"}</button>
  ) : null;

  const conflictModal = pendingCloud ? (() => {
    const when = pendingCloud.cloudMs ? new Date(pendingCloud.cloudMs).toLocaleString() : "recently";
    return (
      <div className="veil">
        <div className="sheet is-prize is-wide">
          <div className="sheet-mark"><EmojiIcon emoji="⚠️" size={22} /></div>
          <div className="sheet-title">Two versions of your save</div>
          <div style={{ color: "var(--ink-soft)", fontSize: 11.5, lineHeight: 1.55, marginBottom: 12 }}>This device and the cloud have both changed since they last synced. Choose which to keep — the other is replaced.</div>
          <div className="aside-note">
            <b><Icon name="cloud" size={12} /> Cloud · saved {when}</b>
            <span>{pendingCloud.cloudSummary}</span>
          </div>
          <div className="aside-note">
            <b><Icon name="speak" size={12} /> This device</b>
            <span>{pendingCloud.localSummary}</span>
          </div>
          <button onClick={() => resolveConflict("cloud")} className="go">☁️ Use the cloud save</button>
          <button onClick={() => resolveConflict("local")} className="go is-quiet">📱 Keep this device's save</button>
        </div>
      </div>
    );
  })() : null;

  let body = null;
  if (screen === "select") body = <CharacterSelectScreen saves={saves} onSelect={handleSelect} onNew={() => setScreen("create")} onDelete={handleDelete} exportData={exportData} importData={importData} />;
  else if (screen === "create") body = <CreateCharacterScreen onCreate={handleCreate} onBack={() => setScreen("select")} />;
  else if (screen === "game" && activeIdx !== null && saves[activeIdx]) body = <GameScreen key={activeIdx} character={saves[activeIdx]} onSave={handleSave} onBack={() => { flushCloud(); setScreen("select"); }} />;
  // The sprite mounts ONCE, above everything. <use href="#id"> resolves against the
  // document, so a second copy would duplicate every symbol id and references would
  // bind to whichever happened to parse first.
  return <><ChronicleStyles /><IconSprite /><GameErrorBoundary>{body}</GameErrorBoundary>{cloudButton}{cloudOverlay}{conflictModal}</>;
}

// btnPrimary, btnGhost and inpStyle are gone: they were the last three shared
// style objects, and between them they carried a near-black input border and
// near-white input text on parchment — hexes the colour sweep could not see
// because they lived in a plain object rather than a style prop. Their jobs are
// .go, .go.is-quiet and .field.
//
// btnGoogle stays hardcoded and unthemed on purpose: Google's sign-in branding
// specifies that white, that grey and that border, and a parchment version of
// it would be a brand violation rather than a design decision.
const btnGoogle = { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", border: "1.5px solid #dadce0", borderRadius: 10, color: "#3c4043", fontSize: 13.5, fontWeight: 700, padding: 11, cursor: "pointer", marginBottom: 8 };
