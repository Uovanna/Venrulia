// Realms of Eldoria — deterministic combat core (Phase 0, stage 2). Auto-lifted from App.jsx.
import { rng, makeRng, withRng, pick, rngPick, rngInt, makeClock } from './rng.mjs';

const CLASSES = [
  { id: "warrior", name: "Warrior", icon: "⚔️", color: "#C79C6E", desc: "Mighty melee fighter with high armor", main: "str", stats: { str: 10, agi: 5, int: 2, sta: 8 }, passive: "+15% melee dmg" },
  { id: "mage", name: "Mage", icon: "🔮", color: "#69CCF0", desc: "Arcane caster of devastating spells", main: "int", stats: { str: 2, agi: 4, int: 12, sta: 4 }, passive: "+20% spell dmg" },
  // The passive text read "+25% crit chance" while the code granted 13%, and now grants 3% — a
  // class description that overstated its own bonus by a factor of two before this change.
  //
  // Finesse (dmgMod -0.16) stays. It was originally payment for the large class crit bonus, and
  // once that dropped to +3% it looked like an unpaid penalty — but what it now pays for is
  // Agility scaling: a point of Agility is worth 1.39x a warrior's Strength to a rogue, the
  // steepest per-point scaling on the roster. Measured at level 60 / ilvl 63 the rogue sits at
  // 1047 dps against a warrior's 1213 and a mage's 931, so it is mid-pack, not starved. Removing
  // Finesse would put it at 1247 — top of the roster — and widen the spread from x1.30 to x1.34.
  { id: "rogue", name: "Rogue", icon: "🗡️", color: "#FFF569", desc: "Swift assassin striking from shadows", main: "agi", stats: { str: 5, agi: 12, int: 3, sta: 6 }, passive: "+3% crit · Finesse: −16% raw damage, +39% Agility scaling", dmgMod: -0.16 },
  // Declares Intellect: 19 of its 21 castable skills are magic, and measured at level 60 a
  // paladin gains 7.8% dps from 30 Intellect against 4.7% from Strength. It read "str" for a long
  // time, which filtered its enemy skill pool down to 2 abilities and mispriced its gear.
  { id: "paladin", name: "Paladin", icon: "🛡️", color: "#F58CBA", desc: "Holy warrior who heals and tanks", main: "int", stats: { str: 8, agi: 3, int: 7, sta: 9 }, passive: "+10% healing" },
  { id: "hunter", name: "Hunter", icon: "🏹", color: "#ABD473", desc: "Ranged master with a loyal beast", main: "agi", stats: { str: 4, agi: 10, int: 5, sta: 7 }, passive: "+15% ranged dmg" },
  { id: "warlock", name: "Warlock", icon: "👁️", color: "#9482C9", desc: "Dark caster commanding demons", main: "int", stats: { str: 3, agi: 3, int: 11, sta: 6 }, passive: "+20% DoT dmg" },
];
const RACES = [
  { id: "human", name: "Human", icon: "👤", faction: "alliance", bonus: "Diplomacy: +10% gold" },
  { id: "dwarf", name: "Dwarf", icon: "⛏️", faction: "alliance", bonus: "Stoneform: +5% armor" },
  { id: "nightelf", name: "Elf", icon: "🌿", faction: "alliance", bonus: "Quickness: +3% dodge" },
  { id: "gnome", name: "Gnome", icon: "⚙️", faction: "alliance", bonus: "+15% profession xp" },
  { id: "orc", name: "Orc", icon: "💀", faction: "horde", bonus: "Blood Fury: +5% damage" },
  { id: "troll", name: "Troll", icon: "🪄", faction: "horde", bonus: "Berserking: +5% crit" },
  { id: "undead", name: "Undead", icon: "☠️", faction: "horde", bonus: "Cannibalize: +10% xp" },
  { id: "tauren", name: "Minotaur", icon: "🐂", faction: "horde", bonus: "Endurance: +5% health" },
];
const GEMS = [
  // COMMON — flat attributes
  { id: "g_chip_ruby",   name: "Chipped Ruby",     icon: "🔻", rarity: "common",    desc: "+6 Strength",            stats: { str: 6 } },
  { id: "g_chip_amber",  name: "Chipped Amber",    icon: "🔶", rarity: "common",    desc: "+6 Agility",             stats: { agi: 6 } },
  { id: "g_chip_sapph",  name: "Chipped Sapphire", icon: "🔷", rarity: "common",    desc: "+6 Intellect",           stats: { int: 6 } },
  { id: "g_chip_emer",   name: "Chipped Emerald",  icon: "💚", rarity: "common",    desc: "+8 Stamina",             stats: { sta: 8 } },
  // UNCOMMON — small percentages & the first regeneration
  { id: "g_pol_ruby",    name: "Polished Ruby",    icon: "🔺", rarity: "uncommon",  desc: "+1.5% damage",           m: { dmgPct: 0.015 } },
  { id: "g_pol_emer",    name: "Polished Emerald", icon: "🟩", rarity: "uncommon",  desc: "Restore 0.25% HP/sec",   regen: 0.25 },
  { id: "g_pol_sapph",   name: "Polished Sapphire",icon: "🟦", rarity: "uncommon",  desc: "+2% critical chance",    m: { crit: 0.02 } },
  { id: "g_pol_onyx",    name: "Polished Onyx",    icon: "⬛", rarity: "uncommon",  desc: "−1.5% damage taken",     m: { dr: 0.015 } },
  // RARE — notable
  { id: "g_flaw_ruby",   name: "Flawless Ruby",    icon: "♦️", rarity: "rare",      desc: "+3% damage",             m: { dmgPct: 0.03 } },
  { id: "g_flaw_emer",   name: "Flawless Emerald", icon: "🍀", rarity: "rare",      desc: "Restore 0.6% HP/sec",    regen: 0.6 },
  { id: "g_flaw_onyx",   name: "Flawless Onyx",    icon: "🖤", rarity: "rare",      desc: "−3% damage taken",       m: { dr: 0.03 } },
  { id: "g_flaw_topaz",  name: "Flawless Topaz",   icon: "🟠", rarity: "rare",      desc: "+3% leech",              m: { leech: 3 } },
  { id: "g_flaw_opal",   name: "Flawless Opal",    icon: "🤍", rarity: "rare",      desc: "+4% max health",         m: { hpPct: 0.04 } },
  // EPIC — passive powers
  { id: "g_rad_ruby",    name: "Radiant Ruby",     icon: "❤️‍🔥", rarity: "epic",   desc: "+5% damage",             m: { dmgPct: 0.05 } },
  { id: "g_rad_emer",    name: "Living Emerald",   icon: "🌿", rarity: "epic",      desc: "Restore 1.25% HP/sec",   regen: 1.25 },
  { id: "g_storm",       name: "Stormheart",       icon: "⚡", rarity: "epic",      desc: "+5% attack speed",       m: { atkSpeed: 0.05 } },
  { id: "g_runed",       name: "Runed Diamond",    icon: "💠", rarity: "epic",      desc: "+5% cooldown reduction", m: { cdr: 0.05 } },
  { id: "g_vamp",        name: "Vampiric Prism",   icon: "🩸", rarity: "epic",      desc: "+5% leech",              m: { leech: 5 } },
  { id: "g_potent",      name: "Potent Chrysoberyl", icon: "🔆", rarity: "epic",    desc: "+6% skill potency",      m: { skillPot: 0.06 } },
  // ARTIFACT — Ven-only, and the sole source of CDR that ignores the 90% cap
  { id: "g_cascade",     name: "Cascade Diamond",  icon: "🔻", rarity: "artifact", desc: "+10% cooldown reduction for every skill on cooldown — ignores the CDR cap", cdrPerCd: 0.10 },
];
const socketsOf = (item) => (Array.isArray(item?.sockets) ? item.sockets : []);
const MAIN_KEYS = ["str", "agi", "int"];
const itemMainTotals = (it) => {
  const tot = { str: 0, agi: 0, int: 0 };
  if (!it) return tot;
  for (const k of MAIN_KEYS) tot[k] += ((it.stats && it.stats[k]) || 0) + ((it.enchant && it.enchant[k]) || 0);
  for (const gid of socketsOf(it)) { const g = gid && gemById(gid); if (g && g.stats) for (const k of MAIN_KEYS) tot[k] += (g.stats[k] || 0); }
  return tot;
};
const itemMainCount = (it) => { const t = itemMainTotals(it); return MAIN_KEYS.filter((k) => t[k] > 0).length; };
const itemPowerRaw = (it) => (((it && it.stats && it.stats.ap) || 0) + ((it && it.stats && it.stats.sp) || 0));
const itemHasPower = (it) => itemPowerRaw(it) > 0;
const itemPowerActive = (it) => itemHasPower(it) && itemMainCount(it) === 1;
const SKILLS = {
  warrior: [
    // RAGE — builds from trading blows, then cashes out. The longer the fight, the harder you hit.
    { name: "Power Strike", icon: "⚔️", unlockLevel: 1, cd: 3, mult: 2.0, gen: 15, desc: "200% damage · +15 Rage" },
    { name: "Lacerate", icon: "🩸", unlockLevel: 5, cd: 6, dotMult: 2.5, dotDur: 5, dotIcon: "🩸", gen: 10, desc: "Bleed 250% over 5s · +10 Rage" },
    { name: "Spinning Slash", icon: "🌀", unlockLevel: 10, cd: 8, hits: 3, mult: 0.9, gen: 20, desc: "3 hits of 90% · +20 Rage" },
    { name: "Devastating Blow", icon: "💀", unlockLevel: 40, cd: 15, mult: 2.0, spend: "all", spendMult: 0.02, desc: "200% damage +2% per Rage spent — consumes all Rage" },
    { name: "Concussive Blow", icon: "🌪️", unlockLevel: 20, cd: 20, mult: 2.0, slowPct: 100, slowDur: 2, gen: 20, desc: "200% damage, stun 2s · +20 Rage" },
    // Rage: defense feeds fury, fury buys power. Warrior utility GENERATES; warrior payoffs SPEND.
    { name: "Iron Guard", icon: "🛡️", unlockLevel: 15, cd: 40, wardPct: 30, wardDur: 8, gen: 25, desc: "−30% damage taken 8s · +25 Rage" },
    { name: "Second Breath", icon: "💨", unlockLevel: 25, cd: 35, hotPct: 30, hotDur: 6, gen: 20, desc: "Heal 30% over 6s · +20 Rage" },
    { name: "Shake It Off", icon: "🧹", unlockLevel: 35, cd: 30, cleanse: true, healPct: 10, gen: 15, desc: "Clear debuffs, heal 10% · +15 Rage" },
    { name: "Rallying Cry", icon: "📣", unlockLevel: 50, cd: 60, empowerPct: 45, empowerDur: 12, cost: 25, desc: "+45% damage 12s · costs 25 Rage" },
    { name: "Warlord's Presence", icon: "👑", unlockLevel: 55, cd: 60, empowerPct: 25, empowerDur: 12, hastePct: 15, hasteDur: 12, cost: 40, desc: "Command the field — +25% damage & +15% attack speed 12s · costs 40 Rage" },
    { name: "Cleaving Arc", icon: "⚔️", unlockLevel: 12, cd: 4, mult: 2.1, gen: 12, desc: "210% damage · +12 Rage" },
    { name: "Reckless Swing", icon: "💢", unlockLevel: 18, cd: 3, mult: 2.2, gen: 18, desc: "220% damage · +18 Rage" },
    { name: "Sundering Blow", icon: "🔨", unlockLevel: 28, cd: 12, mult: 3.2, gen: 15, desc: "320% damage · +15 Rage" },
    { name: "Executioner's Drop", icon: "🪓", unlockLevel: 38, cd: 25, mult: 5.0, cost: 50, desc: "500% damage · costs 50 Rage" },
    { name: "Berserker's Surge", icon: "🔴", unlockLevel: 45, cd: 45, hastePct: 30, hasteDur: 10, spend: "all", spendDur: 0.08, desc: "+30% attack speed — duration grows 0.08s per Rage spent" },
  ],
  mage: [
    // ARCANE CHARGE — every cast escalates the next. Chain spells, then detonate.
    { name: "Flame Bolt", icon: "🔥", unlockLevel: 1, cd: 3, mult: 1.8, gen: 1, desc: "180% damage · +1 Charge" },
    { name: "Immolate", icon: "☄️", unlockLevel: 5, cd: 6, dotMult: 2.5, dotDur: 5, dotIcon: "🔥", gen: 1, desc: "Set ablaze — burn 250% over 5s · +1 Charge" },
    { name: "Arcane Shards", icon: "✨", unlockLevel: 10, cd: 10, hits: 3, mult: 0.9, gen: 1, desc: "3 hits of 90% · +1 Charge" },
    { name: "Frost Nova", icon: "🔵", unlockLevel: 20, cd: 20, mult: 1.6, slowPct: 100, slowDur: 2, gen: 1, desc: "160% damage, freeze 2s · +1 Charge" },
    { name: "Inferno Blast", icon: "💥", unlockLevel: 40, cd: 15, mult: 2.2, spend: "all", spendMult: 0.30, desc: "220% damage +30% per Charge — consumes all Charges" },
    // Arcane Charge: nearly everything a mage does adds a charge; the biggest effects burn them.
    { name: "Arcane Shielding", icon: "🔷", unlockLevel: 15, cd: 40, wardPct: 35, wardDur: 8, gen: 1, desc: "−35% damage taken 8s · +1 Charge" },
    { name: "Quickened Casting", icon: "⏩", unlockLevel: 45, cd: 45, hastePct: 30, hasteDur: 10, gen: 1, desc: "+30% attack speed 10s · +1 Charge" },
    { name: "Runic Mending", icon: "🪞", unlockLevel: 25, cd: 35, hotPct: 28, hotDur: 6, gen: 1, desc: "Runes knit flesh — heal 28% over 6s · +1 Charge" },
    { name: "Spell Ward", icon: "🧿", unlockLevel: 35, cd: 30, cleanse: true, gen: 1, desc: "Clear all debuffs · +1 Charge" },
    { name: "Font of Power", icon: "🌟", unlockLevel: 55, cd: 60, empowerPct: 25, empowerDur: 12, wardPct: 20, wardDur: 12, cost: 2, desc: "Become a wellspring — +25% damage & −20% damage taken 12s · costs 2 Charges" },
    { name: "Frost Shard", icon: "❄️", unlockLevel: 12, cd: 3, mult: 2.0, gen: 1, desc: "200% damage · +1 Charge" },
    { name: "Ember Ray", icon: "🔆", unlockLevel: 18, cd: 4, mult: 2.1, gen: 1, desc: "210% damage · +1 Charge" },
    { name: "Prismatic Orb", icon: "🔮", unlockLevel: 28, cd: 12, mult: 3.3, gen: 1, desc: "330% damage · +1 Charge" },
    { name: "Firestorm", icon: "🌋", unlockLevel: 38, cd: 25, mult: 5.0, cost: 2, desc: "500% damage · costs 2 Charges" },
    { name: "Arcane Overload", icon: "💠", unlockLevel: 50, cd: 60, empowerPct: 45, empowerDur: 12, cost: 3, desc: "+45% damage 12s · costs 3 Charges" },
  ],
  rogue: [
    // COMBO POINTS — build with strikes, then finish. Nothing lands without setup.
    { name: "Sneak Attack", icon: "🗡️", unlockLevel: 1, cd: 3, mult: 1.8, gen: 1, desc: "180% damage · +1 Combo Point" },
    { name: "Venom Strike", icon: "🧪", unlockLevel: 5, cd: 6, dotMult: 2.0, dotDur: 4, dotIcon: "🧪", gen: 1, desc: "Poison 200% over 4s · +1 Combo Point" },
    { name: "Flurry", icon: "✂️", unlockLevel: 10, cd: 8, hits: 1, mult: 0.8, spend: "all", spendHits: 1, desc: "80% per hit — one extra hit per Combo Point spent" },
    { name: "Cheap Shot", icon: "💉", unlockLevel: 20, cd: 20, mult: 1.6, slowPct: 100, slowDur: 2, gen: 1, desc: "160% damage, stun 2s · +1 Combo Point" },
    { name: "Eviscerate", icon: "🌀", unlockLevel: 40, cd: 15, mult: 2.0, spend: "all", spendMult: 0.30, desc: "200% damage +30% per Combo Point — consumes all" },
    // Combo Points: builders feed the bar, finishers cash it. Even rogue utility is build-or-spend.
    { name: "Shadow Veil", icon: "🌫️", unlockLevel: 15, cd: 40, dodgePct: 35, dodgeDur: 6, gen: 1, desc: "+35% dodge 6s · +1 Combo Point" },
    { name: "Deft Reflexes", icon: "🤸", unlockLevel: 45, cd: 45, hastePct: 30, hasteDur: 10, gen: 1, desc: "+30% attack speed 10s · +1 Combo Point" },
    { name: "Antidote", icon: "🧪", unlockLevel: 35, cd: 30, cleanse: true, hotPct: 15, hotDur: 5, gen: 1, desc: "Clear debuffs, heal 15% over 5s · +1 Combo Point" },
    { name: "Nightshade Tonic", icon: "🧉", unlockLevel: 25, cd: 35, hotPct: 28, hotDur: 6, gen: 1, desc: "A steadying draught — heal 28% over 6s · +1 Combo Point" },
    { name: "Vanish", icon: "💨", unlockLevel: 55, cd: 60, empowerPct: 25, empowerDur: 12, dodgePct: 40, dodgeDur: 6, cost: 3, desc: "Slip into shadow and strike — +25% damage 12s & +40% dodge 6s · costs 3 Combo Points" },
    { name: "Backstab", icon: "🗡️", unlockLevel: 12, cd: 3, mult: 2.1, gen: 1, desc: "210% damage · +1 Combo Point" },
    { name: "Twin Fangs", icon: "🐍", unlockLevel: 18, cd: 4, hits: 2, mult: 1.15, gen: 2, desc: "2 hits of 115% · +2 Combo Points" },
    { name: "Rending Cut", icon: "🩸", unlockLevel: 28, cd: 12, dotMult: 3.5, dotDur: 5, dotIcon: "🩸", gen: 1, desc: "Bleed 350% over 5s · +1 Combo Point" },
    { name: "Assassinate", icon: "☠️", unlockLevel: 38, cd: 25, mult: 5.0, cost: 3, desc: "500% damage · costs 3 Combo Points" },
    { name: "Death Mark", icon: "🏴", unlockLevel: 50, cd: 60, empowerPct: 45, empowerDur: 12, cost: 3, desc: "+45% damage 12s · costs 3 Combo Points" },
  ],
  paladin: [
    // AEGIS — bank a shield with every holy strike, then detonate it. Defense becomes offense.
    { name: "Holy Strike", icon: "✝️", unlockLevel: 1, cd: 3, mult: 1.9, gen: 12, desc: "190% damage · +12 Aegis" },
    { name: "Censure", icon: "⚖️", unlockLevel: 5, cd: 6, dotMult: 2.4, dotDur: 5, dotIcon: "✨", gen: 15, desc: "Holy censure sears 240% over 5s · +15 Aegis" },
    { name: "Radiant Burst", icon: "🔱", unlockLevel: 10, cd: 10, hits: 3, mult: 0.95, gen: 30, desc: "3 bursts of holy light, 95% each · +30 Aegis" },
    { name: "Stunning Blow", icon: "⚖️", unlockLevel: 20, cd: 20, mult: 2.0, slowPct: 100, slowDur: 2, gen: 20, desc: "200% damage, stun 2s · +20 Aegis" },
    { name: "Divine Wrath", icon: "🔨", unlockLevel: 40, cd: 15, mult: 2.0, spend: "all", spendMult: 0.012, desc: "200% damage +1.2% per Aegis detonated — consumes your shield" },
    // Aegis: every holy act banks shield. The greatest works spend it — defense IS the resource.
    { name: "Divine Bulwark", icon: "🛡️", unlockLevel: 15, cd: 45, wardPct: 35, wardDur: 10, gen: 60, desc: "−35% damage taken 10s · +60 Aegis" },
    { name: "Mending Touch", icon: "🙏", unlockLevel: 25, cd: 90, healPct: 50, gen: 40, desc: "Heal 50% · +40 Aegis" },
    { name: "Purify", icon: "🕊️", unlockLevel: 35, cd: 30, cleanse: true, gen: 30, desc: "Clear all debuffs · +30 Aegis" },
    { name: "Zeal", icon: "✨", unlockLevel: 45, cd: 45, hastePct: 30, hasteDur: 10, gen: 30, desc: "Righteous fervor — +30% attack speed 10s · +30 Aegis" },
    { name: "Aura of Valor", icon: "🔆", unlockLevel: 55, cd: 60, empowerPct: 25, empowerDur: 12, hotPct: 20, hotDur: 8, gen: 50, desc: "A radiant aura — +25% damage 12s & heal 20% over 8s · +50 Aegis" },
    { name: "Righteous Blow", icon: "⚡", unlockLevel: 12, cd: 3, mult: 2.0, gen: 15, desc: "200% holy damage · +15 Aegis" },
    { name: "Consecrated Strike", icon: "✨", unlockLevel: 18, cd: 4, mult: 2.1, gen: 18, desc: "210% holy damage · +18 Aegis" },
    { name: "Searing Verdict", icon: "🔥", unlockLevel: 28, cd: 12, mult: 3.2, gen: 25, desc: "320% holy damage · +25 Aegis" },
    { name: "Sunhammer", icon: "🔨", unlockLevel: 38, cd: 25, mult: 5.0, cost: 60, desc: "500% damage · costs 60 Aegis" },
    { name: "Exalted Light", icon: "🌅", unlockLevel: 50, cd: 60, empowerPct: 45, empowerDur: 12, cost: 100, desc: "+45% damage 12s · costs 100 Aegis" },
  ],
  hunter: [
    // MARKS — every shot marks the quarry (+6% damage taken each), then the kill shot cashes them in.
    { name: "Piercing Shot", icon: "🏹", unlockLevel: 1, cd: 3, mult: 1.9, gen: 1, desc: "190% damage · +1 Mark" },
    { name: "Bola Shot", icon: "↗️", unlockLevel: 20, cd: 20, mult: 1.6, slowPct: 100, slowDur: 2, gen: 1, desc: "160% damage, ensnared 2s · +1 Mark" },
    { name: "Serrated Arrow", icon: "🎯", unlockLevel: 5, cd: 6, dotMult: 2.4, dotDur: 5, dotIcon: "🩸", gen: 1, desc: "A barbed head bleeds 240% over 5s · +1 Mark" },
    { name: "Arrow Volley", icon: "⚡", unlockLevel: 10, cd: 10, hits: 4, mult: 0.75, gen: 1, desc: "4 arrows, 75% each · +1 Mark" },
    { name: "Killing Arrow", icon: "💀", unlockLevel: 40, cd: 15, mult: 2.5, spend: "all", spendMult: 0.14, desc: "250% damage +14% per Mark — consumes all Marks" },
    // Marks: the hunter's whole kit tags the quarry. Utility marks too — nothing is wasted motion.
    { name: "Camouflage", icon: "🍃", unlockLevel: 15, cd: 40, dodgePct: 30, dodgeDur: 6, gen: 1, desc: "+30% dodge 6s · +1 Mark" },
    { name: "Herbal Salve", icon: "🌿", unlockLevel: 25, cd: 35, hotPct: 35, hotDur: 7, gen: 1, desc: "Heal 35% over 7s · +1 Mark" },
    { name: "Trail Ward", icon: "🪶", unlockLevel: 35, cd: 40, wardPct: 25, wardDur: 8, cleanse: true, gen: 1, desc: "Clear debuffs, −25% damage taken 8s · +1 Mark" },
    { name: "Rapid Fire", icon: "⚡", unlockLevel: 45, cd: 60, hastePct: 30, hasteDur: 8, gen: 2, desc: "+30% attack speed 8s · +2 Marks" },
    { name: "Hunter's Focus", icon: "🔭", unlockLevel: 55, cd: 60, empowerPct: 25, empowerDur: 12, hastePct: 15, hasteDur: 12, cost: 2, desc: "Perfect focus — +25% damage & +15% attack speed 12s · costs 2 Marks" },
    { name: "Snap Shot", icon: "🏹", unlockLevel: 12, cd: 3, mult: 2.0, gen: 1, desc: "200% ranged damage · +1 Mark" },
    { name: "Barbed Arrow", icon: "🪝", unlockLevel: 18, cd: 4, mult: 2.1, gen: 1, desc: "210% ranged damage · +1 Mark" },
    { name: "Sundering Shot", icon: "💥", unlockLevel: 28, cd: 12, mult: 3.2, gen: 1, desc: "320% ranged damage · +1 Mark" },
    { name: "Hail of Arrows", icon: "🌧️", unlockLevel: 38, cd: 25, hits: 5, mult: 1.0, cost: 2, desc: "5 hits of 100% · costs 2 Marks" },
    { name: "Predator's Mark", icon: "👁️", unlockLevel: 50, cd: 60, empowerPct: 45, empowerDur: 12, cost: 3, desc: "+45% damage 12s · costs 3 Marks" },
  ],
  warlock: [
    // SOUL SHARDS — harvested from your own damage-over-time ticks, then burned for ruin.
    { name: "Shadow Lance", icon: "🌑", unlockLevel: 1, cd: 3, mult: 1.8, desc: "180% damage" },
    { name: "Withering Curse", icon: "🕷️", unlockLevel: 5, cd: 8, dotMult: 2.5, dotDur: 6, dotIcon: "🕷️", desc: "Affliction 250% over 6s — ticks harvest Soul Shards" },
    { name: "Searing Flames", icon: "🔥", unlockLevel: 10, cd: 10, hits: 3, mult: 0.9, desc: "Flames wash over the target — 3 hits of 90%" },
    { name: "Fear", icon: "😱", unlockLevel: 20, cd: 20, mult: 1.6, slowPct: 100, slowDur: 2, desc: "160% damage, cowering 2s" },
    { name: "Doombolt", icon: "💜", unlockLevel: 40, cd: 15, mult: 2.0, spend: "all", spendMult: 0.35, desc: "200% damage +35% per Soul Shard — consumes all Shards" },
    // Soul Shards: afflictions harvest them, and every great working burns them. Nothing is free.
    { name: "Demonic Ward", icon: "😈", unlockLevel: 15, cd: 45, wardPct: 30, wardDur: 8, gen: 1, desc: "−30% damage taken 8s · +1 Soul Shard" },
    { name: "Curse Break", icon: "⛓️", unlockLevel: 35, cd: 30, cleanse: true, gen: 1, desc: "Clear all debuffs · +1 Soul Shard" },
    { name: "Fiendish Alacrity", icon: "🌑", unlockLevel: 45, cd: 45, hastePct: 30, hasteDur: 10, gen: 1, desc: "Your demon lends its swiftness — +30% attack speed 10s · +1 Soul Shard" },
    { name: "Siphon Vitality", icon: "🖤", unlockLevel: 25, cd: 35, healPct: 28, gen: 1, desc: "Drain the living — heal 28% · +1 Soul Shard" },
    { name: "Dark Pact", icon: "🩸", unlockLevel: 55, cd: 60, empowerPct: 25, empowerDur: 12, hotPct: 20, hotDur: 8, cost: 2, desc: "Bargain in blood — +25% damage 12s & heal 20% over 8s · costs 2 Soul Shards" },
    { name: "Umbral Bolt", icon: "🌒", unlockLevel: 12, cd: 3, mult: 2.0, desc: "200% shadow damage" },
    { name: "Soul Rend", icon: "💔", unlockLevel: 18, cd: 4, mult: 2.1, gen: 1, desc: "210% shadow damage · +1 Soul Shard" },
    { name: "Creeping Blight", icon: "🕸️", unlockLevel: 28, cd: 12, dotMult: 3.5, dotDur: 5, dotIcon: "🕸️", desc: "Blight 350% over 5s — ticks harvest Shards" },
    { name: "Ruinous Blast", icon: "💀", unlockLevel: 38, cd: 25, mult: 5.0, cost: 2, desc: "500% damage · costs 2 Soul Shards" },
    { name: "Fiend's Bargain", icon: "😈", unlockLevel: 50, cd: 60, empowerPct: 45, empowerDur: 12, cost: 3, desc: "+45% damage 12s · costs 3 Soul Shards" },
  ],
};
const PHYSICAL_SKILLS = new Set([
  "Power Strike", "Lacerate", "Spinning Slash", "Devastating Blow", "Sneak Attack", "Piercing Shot", "Bola Shot", "Precise Shot", "Arrow Volley", "Killing Arrow",
  "Battle Fervor", "Venom Strike", "Flurry", "Healing Draught", "Evasion",
  "Rallying Cry", "Iron Guard", "Second Breath", "Shake It Off", "Warlord's Presence", "Cleaving Arc", "Reckless Swing", "Sundering Blow", "Executioner's Drop", "Berserker's Surge",
  "Shadow Veil", "Deft Reflexes", "Antidote", "Killer's Focus", "Vanish", "Backstab", "Twin Fangs", "Rending Cut", "Assassinate", "Death Mark",
  "Hunter's Focus", "Camouflage", "Herbal Salve", "Trail Ward", "Rapid Fire", "Snap Shot", "Barbed Arrow", "Sundering Shot", "Hail of Arrows", "Predator's Mark",
]);

// ---------- GAMBIT CONDITIONS ----------
// The gambit DATA (which ifs/thens exist, what you own) is client-side, but evaluating a
// condition is pure combat logic, so it lives here where it can be tested headlessly.

// A spec's real execute window, read from its own talents rather than invented: several
// talents already say "+X% to enemies below Y%", so the widest of those Y values is what that
// build actually treats as execute range (Assassin 20%, Exile 30%, Berserker 35%, …).
// Falls back to the class-wide executeNN talent flag, then to a neutral 20%.
const EXECUTE_DEFAULT = 0.20;
const executeThreshold = (char) => {
  // Prefer talents that boost NUKES below a threshold — those describe the spec's general
  // execute window. Single-skill talents are ignored for this: Berserker has one that reads
  // "below 50%", but that is one ability's bonus, not the point at which the spec executes.
  let nuke = 0, any = 0;
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    const c = o.cond;
    if (c && typeof c.hpBelow === "number") {
      any = Math.max(any, c.hpBelow);
      if (c.kind === "nuke" || c.kind === "all" || c.kind === "auto") nuke = Math.max(nuke, c.hpBelow);
    }
    if (typeof o.f === "string") { const m = o.f.match(/^execute(\d+)$/); if (m) nuke = Math.max(nuke, Number(m[1]) / 100); }
    for (const k in o) walk(o[k]);
  };
  if (char && char.spec) walk(SPEC_TREES[char.spec]);
  if (!nuke && !any && char) walk(TALENT_L60[char.cls]);   // class-wide executeNN flag
  return nuke || any || EXECUTE_DEFAULT;
};

// ctx: { char, w, now, maxHp, buffs, slotSkills } — slotSkills is the bar, index 0 = "Skill 1".
const gambitCondMet = (ifId, ctx) => {
  const { char, w, now, maxHp, buffs } = ctx;
  const e = w.enemy || {};
  const eFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  const ri = classResource(char.cls) || { max: 100 };
  const resFrac = (ri.max || 100) > 0 ? resTotal(w) / (ri.max || 100) : 0;
  // "Skill N on/off cooldown" resolves N against the bar, so a rule survives swapping which
  // ability sits in that slot.
  const slotCd = (n) => {
    const name = (ctx.slotSkills || [])[n - 1];
    if (!name) return null;                       // empty slot: neither on nor off cooldown
    return (w.cooldowns?.[name] || 0) > now;
  };
  switch (ifId) {
    case "if_always": return true;
    case "if_ehp50": return eFrac <= 0.5;
    case "if_ehp20": return eFrac <= 0.2;
    case "if_execute": return eFrac <= executeThreshold(char);
    case "if_selfhp50": return w.hp <= maxHp * 0.5;
    case "if_selfhp30": return w.hp <= maxHp * 0.3;
    case "if_selfhp20": return w.hp <= maxHp * 0.2;
    case "if_debuffed": return (w.playerEffects || []).some(isPlayerDebuff);
    case "if_champion": return !!(e.isChampion || e.isLord);
    case "if_boss": return !!e.isBoss;
    case "if_hard": return w.mode === "hard";
    case "if_resfull": return resFrac >= 0.999;
    case "if_res80": return resFrac >= 0.8;
    case "if_res50": return resFrac < 0.5;
    case "if_res20": return resFrac < 0.2;
    case "if_no_might": return !buffs.dmgpct;
    case "if_no_ward": return !buffs.reducepct;
    case "if_no_str": return !buffs.str;
    case "if_no_agi": return !buffs.agi;
    case "if_no_int": return !buffs.int;
    case "if_no_sta": return !buffs.sta;
    default: {
      const m = /^if_sk([1-5])_(cd|rdy)$/.exec(ifId || "");
      if (m) { const on = slotCd(Number(m[1])); return on === null ? false : (m[2] === "cd" ? on : !on); }
      return false;
    }
  }
};

// ---------- SIGNATURE (spec) SKILLS ----------
// These used to live in App.jsx, which merged them into SKILLS and PHYSICAL_SKILLS at module
// load. The server never runs App.jsx, so its SKILLS table had no signature skills at all:
// skillByName could not find "Cold Open", grpSkills dropped it, and resolveIntent rejected the
// intent — a signature skill could never fire online. The PHYSICAL_SKILLS registration matters
// just as much: without it these would scale off Int instead of Str, so client and server would
// disagree on damage even when the skill did land.
const SPEC_SKILL_DEFS = {
  warrior: [
    { name: "Frenzied Onslaught", icon: "🌀", unlockLevel: 10, spec: "w_berserk", cd: 5, hits: 3, mult: 1.1, gen: 20, desc: "3 hits of 110% · +20 Rage" },
    { name: "Bloodletting Roar", icon: "📣", unlockLevel: 10, spec: "w_berserk", cd: 30, hastePct: 20, hasteDur: 10, gen: 20, desc: "+20% attack speed 10s · +20 Rage" },
    { name: "Reckless Abandon", icon: "💢", unlockLevel: 10, spec: "w_berserk", cd: 8, mult: 2.4, gen: 30, desc: "240% damage · +30 Rage" },
    { name: "Cataclysm Slam", icon: "💥", unlockLevel: 10, spec: "w_champion", cd: 14, mult: 2.2, spend: "all", spendMult: 0.02, desc: "220% damage +2% per Rage — consumes all Rage" },
    { name: "Warbringer", icon: "🌪️", unlockLevel: 10, spec: "w_champion", cd: 40, empowerPct: 30, empowerDur: 10, cost: 25, desc: "+30% damage 10s · costs 25 Rage" },
    { name: "Unbreakable Momentum", icon: "🛡️", unlockLevel: 10, spec: "w_champion", cd: 35, wardPct: 30, wardDur: 8, gen: 30, desc: "−30% damage taken 8s · +30 Rage" },
    { name: "Spell Reflection", icon: "🪞", unlockLevel: 10, spec: "w_antimage", cd: 30, wardPct: 35, wardDur: 6, gen: 20, desc: "−35% damage taken 6s · +20 Rage" },
    { name: "Runic Cleave", icon: "🩸", unlockLevel: 10, spec: "w_antimage", cd: 8, dotMult: 3.0, dotDur: 5, dotIcon: "🩸", gen: 15, desc: "Bleed 300% over 5s · +15 Rage" },
    { name: "Bulwark Vengeance", icon: "🔨", unlockLevel: 10, spec: "w_antimage", cd: 12, mult: 3.4, gen: 15, desc: "340% damage · +15 Rage" },
    { name: "Shield Slam", icon: "🛡️", unlockLevel: 10, spec: "w_prot", cd: 5, mult: 1.5, threatMult: 4, gen: 25, desc: "150% dmg · high threat · +25 Rage" },
    { name: "Challenging Shout", icon: "📣", unlockLevel: 10, spec: "w_prot", cd: 12, mult: 0.6, taunt: true, threatMult: 6, gen: 15, desc: "Taunt all enemies to you · +15 Rage" },
    { name: "Last Stand", icon: "🪨", unlockLevel: 10, spec: "w_prot", cd: 30, wardPct: 45, wardDur: 8, gen: 20, desc: "−45% damage taken 8s · +20 Rage" },
    { name: "Thunder Clap", icon: "🌩️", unlockLevel: 10, spec: "w_prot", cd: 6, mult: 0.8, aoeThreat: true, threatMult: 3, gen: 20, desc: "High threat on ALL enemies (grabs adds) · +20 Rage" },
    { name: "Shield Wall", icon: "🧱", unlockLevel: 10, spec: "w_prot", cd: 90, wardPct: 60, wardDur: 8, gen: 10, desc: "−60% damage taken 8s (major cooldown) · +10 Rage" },
  ],
  mage: [
    { name: "Arcane Surge", icon: "✨", unlockLevel: 10, spec: "m_wild", cd: 6, mult: 2.2, gen: 2, desc: "220% damage · +2 Charges" },
    { name: "Mana Rupture", icon: "💥", unlockLevel: 10, spec: "m_wild", cd: 14, mult: 2.4, spend: "all", spendMult: 0.30, desc: "240% damage +30% per Charge — consumes all Charges" },
    { name: "Overcharged Nova", icon: "💠", unlockLevel: 10, spec: "m_wild", cd: 20, mult: 3.2, spend: "all", spendMult: 0.35, desc: "320% damage +35% per Charge — consumes all Charges" },
    { name: "Glacial Chains", icon: "🧊", unlockLevel: 10, spec: "m_trick", cd: 10, mult: 1.6, slowPct: 50, slowDur: 3, gen: 1, desc: "160% damage, slow 50% 3s · +1 Charge" },
    { name: "Frozen Orb", icon: "🔵", unlockLevel: 10, spec: "m_trick", cd: 10, dotMult: 3.0, dotDur: 6, dotIcon: "❄️", gen: 1, desc: "Frost 300% over 6s · +1 Charge" },
    { name: "Winter's Bite", icon: "❄️", unlockLevel: 10, spec: "m_trick", cd: 6, mult: 2.4, gen: 1, desc: "240% damage · +1 Charge" },
    { name: "Runeblade Strike", icon: "🗡️", unlockLevel: 10, spec: "m_sword", cd: 4, mult: 2.1, gen: 1, desc: "210% damage · +1 Charge" },
    { name: "Blade Cadence", icon: "⏩", unlockLevel: 10, spec: "m_sword", cd: 30, hastePct: 25, hasteDur: 8, gen: 1, desc: "+25% attack speed 8s · +1 Charge" },
    { name: "Arcane Riposte", icon: "🔆", unlockLevel: 10, spec: "m_sword", cd: 24, empowerPct: 30, empowerDur: 8, cost: 2, desc: "+30% damage 8s · costs 2 Charges" },
    { name: "Counterspell", icon: "🚫", unlockLevel: 10, spec: "m_support", cd: 12, mult: 1.2, interrupt: true, gen: 1, desc: "Interrupt an enemy cast · 120% dmg · +1 Charge" },
    { name: "Temporal Surge", icon: "⏩", unlockLevel: 10, spec: "m_support", cd: 40, partyHastePct: 20, partyHasteDur: 10, gen: 2, desc: "Party +20% attack speed 10s · +2 Charges" },
    { name: "Arcane Ward", icon: "🔮", unlockLevel: 10, spec: "m_support", cd: 18, partyWardPct: 15, partyWardDur: 8, offheal: 0.15, gen: 1, desc: "Party −15% damage taken 8s + minor heal · +1 Charge" },
    { name: "Arcane Barrage", icon: "🌠", unlockLevel: 10, spec: "m_support", cd: 4, mult: 2.2, gen: 1, desc: "220% arcane damage (filler) · +1 Charge" },
    { name: "Dampen Magic", icon: "🌀", unlockLevel: 10, spec: "m_support", cd: 40, partyWardPct: 25, partyWardDur: 10, gen: 1, desc: "Party −25% damage taken 10s (raid cooldown) · +1 Charge" },
  ],
  rogue: [
    { name: "Cold Open", icon: "🗡️", unlockLevel: 10, spec: "r_ambush", cd: 4, mult: 2.4, gen: 2, desc: "240% damage · +2 Combo Points" },
    { name: "Killing Intent", icon: "🎯", unlockLevel: 10, spec: "r_ambush", cd: 24, empowerPct: 35, empowerDur: 8, cost: 2, desc: "+35% damage 8s · costs 2 Combo Points" },
    { name: "Throat Slit", icon: "☠️", unlockLevel: 10, spec: "r_ambush", cd: 16, mult: 3.2, spend: "all", spendMult: 0.30, desc: "320% damage +30% per Combo Point — consumes all" },
    { name: "Virulent Blades", icon: "🧪", unlockLevel: 10, spec: "r_corr", cd: 6, dotMult: 2.4, dotDur: 5, dotIcon: "🧪", gen: 1, desc: "Poison 240% over 5s · +1 Combo Point" },
    { name: "Festering Wounds", icon: "🩸", unlockLevel: 10, spec: "r_corr", cd: 10, dotMult: 3.6, dotDur: 6, dotIcon: "🩸", gen: 1, desc: "Bleed 360% over 6s · +1 Combo Point" },
    { name: "Toxic Bloom", icon: "☠️", unlockLevel: 10, spec: "r_corr", cd: 8, dotMult: 3.0, dotDur: 4, dotIcon: "☠️", gen: 1, desc: "Toxin 300% over 4s · +1 Combo Point" },
    { name: "Relentless Flurry", icon: "✂️", unlockLevel: 10, spec: "r_wild", cd: 5, hits: 3, mult: 1.0, gen: 1, desc: "3 hits of 100% · +1 Combo Point" },
    { name: "Fleetblade", icon: "🌀", unlockLevel: 10, spec: "r_wild", cd: 30, hastePct: 25, hasteDur: 8, gen: 1, desc: "+25% attack speed 8s · +1 Combo Point" },
    { name: "Twin Daggers", icon: "🗡️", unlockLevel: 10, spec: "r_wild", cd: 4, hits: 2, mult: 1.2, gen: 2, desc: "2 hits of 120% · +2 Combo Points" },
  ],
  paladin: [
    { name: "Verdict of Flame", icon: "🔥", unlockLevel: 10, spec: "p_just", cd: 12, mult: 2.2, spend: "all", spendMult: 0.010, desc: "220% damage +1% per Aegis — consumes shield" },
    { name: "Sanctified Zeal", icon: "✨", unlockLevel: 10, spec: "p_just", cd: 40, empowerPct: 25, empowerDur: 12, gen: 30, desc: "+25% damage 12s · +30 Aegis" },
    { name: "Judgment Beam", icon: "🔱", unlockLevel: 10, spec: "p_just", cd: 6, mult: 2.3, gen: 20, desc: "230% holy damage · +20 Aegis" },
    { name: "Aegis Overflow", icon: "🛡️", unlockLevel: 10, spec: "p_king", cd: 5, mult: 2.0, gen: 40, desc: "200% damage · +40 Aegis" },
    { name: "Consecrated Ground", icon: "🌟", unlockLevel: 10, spec: "p_king", cd: 40, wardPct: 35, wardDur: 12, gen: 60, desc: "−35% damage taken 12s · +60 Aegis" },
    { name: "Retribution Wall", icon: "🪨", unlockLevel: 10, spec: "p_king", cd: 30, wardPct: 25, wardDur: 10, gen: 40, desc: "−25% damage taken 10s · +40 Aegis" },
    { name: "Zealot's Flurry", icon: "⚔️", unlockLevel: 10, spec: "p_exile", cd: 5, hits: 3, mult: 1.0, gen: 20, desc: "3 hits of 100% · +20 Aegis" },
    { name: "Righteous Momentum", icon: "📣", unlockLevel: 10, spec: "p_exile", cd: 30, hastePct: 20, hasteDur: 10, gen: 30, desc: "+20% attack speed 10s · +30 Aegis" },
    { name: "Executioner's Verdict", icon: "🪓", unlockLevel: 10, spec: "p_exile", cd: 14, mult: 3.6, gen: 20, desc: "360% damage · +20 Aegis" },
    { name: "Holy Light", icon: "🌅", unlockLevel: 10, spec: "p_holy", cd: 4, mult: 1.3, heal: 0.55, gen: 15, desc: "Heal an ally 55% · 130% holy dmg · +15 Aegis" },
    { name: "Divine Radiance", icon: "🌟", unlockLevel: 10, spec: "p_holy", cd: 15, mult: 1.4, healAoe: 0.32, gen: 20, desc: "Heal the party 32% · 140% holy dmg · +20 Aegis" },
    { name: "Holy Smite", icon: "☀️", unlockLevel: 10, spec: "p_holy", cd: 5, mult: 2.3, heal: 0.12, gen: 20, desc: "230% holy dmg · heal ally 12% · +20 Aegis" },
    { name: "Beacon of Light", icon: "🕯️", unlockLevel: 10, spec: "p_holy", cd: 9, mult: 1.0, hot: 0.10, hotDur: 12, gen: 15, desc: "Heal-over-time 10%/s for 12s · 100% holy dmg · +15 Aegis" },
    { name: "Cleanse", icon: "💧", unlockLevel: 10, spec: "p_holy", cd: 6, cleanse: true, gen: 5, desc: "Remove harmful effects from an ally · +5 Aegis" },
    { name: "Aegis of Light", icon: "🌤️", unlockLevel: 10, spec: "p_holy", cd: 45, partyWardPct: 30, partyWardDur: 8, gen: 20, desc: "Party −30% damage taken 8s (raid cooldown) · +20 Aegis" },
    { name: "Shield of the Righteous", icon: "🛡️", unlockLevel: 10, spec: "p_prot", cd: 5, mult: 1.6, threatMult: 4, gen: 25, desc: "160% dmg · high threat · +25 Aegis" },
    { name: "Hand of Authority", icon: "✋", unlockLevel: 10, spec: "p_prot", cd: 12, mult: 0.8, taunt: true, threatMult: 6, gen: 15, desc: "Taunt · forces the enemy onto you · +15 Aegis" },
    { name: "Guardian's Bulwark", icon: "🪨", unlockLevel: 10, spec: "p_prot", cd: 25, wardPct: 40, wardDur: 8, gen: 30, desc: "−40% damage taken 8s · +30 Aegis" },
    { name: "Consecration", icon: "🔆", unlockLevel: 10, spec: "p_prot", cd: 8, mult: 0.7, aoeThreat: true, threatMult: 3, gen: 20, desc: "Hallowed ground — high threat on ALL enemies · +20 Aegis" },
    { name: "Ardent Defender", icon: "🧱", unlockLevel: 10, spec: "p_prot", cd: 90, wardPct: 60, wardDur: 8, gen: 15, desc: "−60% damage taken 8s (major cooldown) · +15 Aegis" },
  ],
  hunter: [
    { name: "Steady Aim", icon: "🎯", unlockLevel: 10, spec: "h_snipe", cd: 6, mult: 2.6, gen: 2, desc: "260% damage · +2 Marks" },
    { name: "Piercing Focus", icon: "🔭", unlockLevel: 10, spec: "h_snipe", cd: 24, empowerPct: 35, empowerDur: 10, cost: 2, desc: "+35% damage 10s · costs 2 Marks" },
    { name: "Deadeye Shot", icon: "💀", unlockLevel: 10, spec: "h_snipe", cd: 15, mult: 2.6, spend: "all", spendMult: 0.16, desc: "260% damage +16% per Mark — consumes all Marks" },
    { name: "Savage Companion", icon: "🐺", unlockLevel: 10, spec: "h_trap", cd: 20, petEmpower: true, gen: 1, desc: "Instantly resummon your companion and empower it (+50% pet damage 10s) · +1 Mark" },
    { name: "Snake Trap", icon: "🐍", unlockLevel: 10, spec: "h_trap", cd: 14, snakeVenom: 3, gen: 1, desc: "Loose a nest of snakes — apply 3 stacking Venom debuffs (feeds cooldown reduction) · +1 Mark" },
    { name: "Venomous Companion", icon: "🐍", unlockLevel: 10, spec: "h_trap", cd: 8, dotMult: 2.6, dotDur: 5, dotIcon: "🐍", gen: 1, desc: "Your companion's venom — 260% poison over 5s · +1 Mark" },
    { name: "Rapid Volley", icon: "⚡", unlockLevel: 10, spec: "h_range", cd: 4, hits: 3, mult: 0.9, gen: 1, desc: "3 hits of 90% · +1 Mark" },
    { name: "Hunter's Rhythm", icon: "🏹", unlockLevel: 10, spec: "h_range", cd: 30, hastePct: 30, hasteDur: 8, gen: 2, desc: "+30% attack speed 8s · +2 Marks" },
    { name: "Twin Shot", icon: "↗️", unlockLevel: 10, spec: "h_range", cd: 4, hits: 2, mult: 1.2, gen: 2, desc: "2 hits of 120% · +2 Marks" },
    { name: "Disrupting Shot", icon: "🚫", unlockLevel: 10, spec: "h_support", cd: 12, mult: 1.4, interrupt: true, gen: 1, desc: "Interrupt an enemy cast · 140% dmg · +1 Mark" },
    { name: "Rallying Anthem", icon: "🎶", unlockLevel: 10, spec: "h_support", cd: 40, partyEmpowerPct: 15, partyEmpowerDur: 10, gen: 2, desc: "Party +15% damage 10s · +2 Marks" },
    { name: "Mending Volley", icon: "💚", unlockLevel: 10, spec: "h_support", cd: 10, mult: 1.2, offheal: 0.18, gen: 1, desc: "120% dmg · heal the party 18% · +1 Mark" },
    { name: "Aimed Shot", icon: "🎯", unlockLevel: 10, spec: "h_support", cd: 4, mult: 2.4, gen: 1, desc: "240% damage (filler) · +1 Mark" },
    { name: "Warding Cry", icon: "📯", unlockLevel: 10, spec: "h_support", cd: 40, partyWardPct: 25, partyWardDur: 10, gen: 1, desc: "Party −25% damage taken 10s (raid cooldown) · +1 Mark" },
  ],
  warlock: [
    { name: "Chaos Bolt", icon: "🌑", unlockLevel: 10, spec: "l_scorch", cd: 14, mult: 2.4, spend: "all", spendMult: 0.35, desc: "240% damage +35% per Soul Shard — consumes all Shards" },
    { name: "Immolation Burst", icon: "🔥", unlockLevel: 10, spec: "l_scorch", cd: 6, mult: 2.4, desc: "240% fire damage" },
    { name: "Cataclysm", icon: "💀", unlockLevel: 10, spec: "l_scorch", cd: 20, mult: 3.2, spend: "all", spendMult: 0.40, desc: "320% damage +40% per Soul Shard — consumes all" },
    { name: "Unstable Affliction", icon: "🕷️", unlockLevel: 10, spec: "l_hex", cd: 8, dotMult: 3.2, dotDur: 6, dotIcon: "🕷️", desc: "Affliction 320% over 6s — ticks harvest Shards" },
    { name: "Corruption Spread", icon: "🕸️", unlockLevel: 10, spec: "l_hex", cd: 10, dotMult: 3.6, dotDur: 5, dotIcon: "🕸️", desc: "Blight 360% over 5s — ticks harvest Shards" },
    { name: "Soul Harvest", icon: "🖤", unlockLevel: 10, spec: "l_hex", cd: 8, dotMult: 2.8, dotDur: 6, dotIcon: "🖤", desc: "Drain 280% over 6s — ticks harvest Shards" },
    { name: "Soul Detonation", icon: "💥", unlockLevel: 10, spec: "l_hex", cd: 12, detonate: 1.30, desc: "Consume every affliction — bursts for 130% of their remaining damage (stack them high first)" },
    { name: "Summon Fiend", icon: "😈", unlockLevel: 10, spec: "l_demon", cd: 12, dotMult: 3.4, dotDur: 8, dotIcon: "😈", desc: "Fiend rends 340% over 8s" },
    { name: "Demonic Empowerment", icon: "🔆", unlockLevel: 10, spec: "l_demon", cd: 24, empowerPct: 35, empowerDur: 10, cost: 2, desc: "+35% damage 10s · costs 2 Soul Shards" },
    { name: "Soul Link", icon: "💜", unlockLevel: 10, spec: "l_demon", cd: 5, mult: 2.1, gen: 1, desc: "210% shadow damage · +1 Soul Shard" },
  ],
};
for (const cid in SPEC_SKILL_DEFS) SKILLS[cid] = [...(SKILLS[cid] || []), ...SPEC_SKILL_DEFS[cid]];
// Register physical signature skills (all others default to Magic → Int scaling).
["Frenzied Onslaught", "Bloodletting Roar", "Reckless Abandon", "Cataclysm Slam", "Warbringer", "Unbreakable Momentum", "Spell Reflection", "Runic Cleave", "Bulwark Vengeance",
 "Cold Open", "Killing Intent", "Throat Slit", "Virulent Blades", "Festering Wounds", "Toxic Bloom", "Relentless Flurry", "Fleetblade", "Twin Daggers",
 "Zealot's Flurry", "Righteous Momentum", "Executioner's Verdict",
 "Steady Aim", "Piercing Focus", "Deadeye Shot", "Savage Companion", "Snare Trap", "Venom Coating", "Rapid Volley", "Hunter's Rhythm", "Twin Shot",
].forEach((n) => PHYSICAL_SKILLS.add(n));
const skillType = (name) => PHYSICAL_SKILLS.has(name) ? "physical" : "magic";
const isMagicSkill = (skill) => skill && skillType(skill.name) === "magic";
const CLASS_RESOURCES = {
  warrior: { id: "rage",   name: "Rage",         icon: "🔥", color: "#C79C6E", max: 100,
             gen: "Builds as you strike and as you're struck", pay: "Devastating Blow converts all Rage into damage" },
  mage:    { id: "arcane", name: "Arcane Charge", icon: "✨", color: "#69CCF0", max: 5,
             gen: "Every spell you cast adds a charge", pay: "Inferno Blast detonates all charges at +30% each" },
  rogue:   { id: "combo",  name: "Combo Points",  icon: "🗡️", color: "#FFF569", max: 5,
             gen: "Builders add a point per strike", pay: "Flurry spends every point as an extra hit" },
  paladin: { id: "aegis",  name: "Aegis",         icon: "🛡️", color: "#F58CBA", max: 400,
             gen: "Your holy strikes bank a damage-absorbing shield", pay: "Divine Wrath detonates the shield as damage" },
  hunter:  { id: "mark",   name: "Marks",         icon: "🎯", color: "#ABD473", max: 5,
             gen: "Every shot marks your quarry (+6% damage taken each)", pay: "Killing Arrow consumes the marks for a lethal shot" },
  warlock: { id: "shard",  name: "Soul Shards",   icon: "💜", color: "#9482C9", max: 5,
             gen: "Harvested from your damage-over-time ticks", pay: "Doombolt burns shards for devastating damage" },
};
const classResource = (cls) => CLASS_RESOURCES[cls] || CLASS_RESOURCES.warrior;
const RES_DECAY_MS = 15000;
const resTotal = (b) => (b.resQ || []).reduce((n, u) => n + u.amt, 0);
const resSync = (b) => { b.res = resTotal(b); return b.res; };
const resExpire = (b, now) => { const q = b.resQ || []; const keep = q.filter((u) => u.exp > now); if (keep.length !== q.length) { b.resQ = keep; resSync(b); return true; } return false; };
const drFactor = (w, target, kind, peek) => {
    const key = target === "player" ? "drPlayer" : "drEnemy";
    const store = w[key] || (w[key] = {});
    const n = store[kind] || 0;
    const factor = n === 0 ? 1 : n === 1 ? 0.35 : 0;
    if (!peek && factor > 0) store[kind] = n + 1;
    return factor;
  };
const resAdd = (b, amt, max, now) => { const cur = resTotal(b); const add = Math.min(amt, Math.max(0, max - cur)); if (add > 0) { b.resQ = [...(b.resQ || []), { amt: add, exp: now + RES_DECAY_MS }]; resSync(b); } };
const resTake = (b, amt) => { // consume oldest-first; returns how much was actually taken
  let need = amt, took = 0; const q = [...(b.resQ || [])];
  while (need > 0 && q.length) { const u = q[0]; const t = Math.min(u.amt, need); u.amt -= t; need -= t; took += t; if (u.amt <= 0) q.shift(); }
  b.resQ = q; resSync(b); return took;
};
const MARK_DMG_PER_STACK = 0.06;
const SKILL_SLOT_LEVELS = [1, 5, 10, 20, 40];
const unlockedSlotCount = (level) => SKILL_SLOT_LEVELS.filter((l) => l <= (level || 1)).length;
const classSkills = (cls) => SKILLS[cls] || [];
const specVisible = (char, s) => !s.spec || char.spec === s.spec;
const skillPool = (char) => classSkills(char.cls).filter((s) => specVisible(char, s));
const skillByName = (char, name) => skillPool(char).find((s) => s.name === name);
const SKILL_MOD_POWER = 0.02;
const skillModPts = (char, name) => (char.skillMods && char.skillMods[name] && char.skillMods[name].pts) || 0;
const skillModPotency = (char, name) => skillModPts(char, name) * SKILL_MOD_POWER;
const skillModEffectList = (char, name) => { const e = (char.skillMods && char.skillMods[name] && char.skillMods[name].effects) || {}; return Object.values(e); };
const hasSkillModEffect = (char, name, id) => skillModEffectList(char, name).includes(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function activeBuffs(char) {
  const now = Date.now();
  const out = {};
  Object.entries(char.buffs || {}).forEach(([stat, b]) => { if (b && b.expires > now) out[stat] = b; });
  return out;
}
function effectiveStats(char) {
  const eq = { str: 0, agi: 0, int: 0, sta: 0, armor: 0, dmg: 0, leech: 0, resil: 0, vers: 0, cdr: 0, csd: 0, crit: 0, haste: 0, ap: 0, sp: 0 };
  Object.values(char.equipment || {}).forEach((it) => {
    if (!it) return;
    for (const k in eq) { if (k === "ap" || k === "sp") continue; eq[k] += (it.stats[k] || 0) + ((it.enchant && it.enchant[k]) || 0); }
    for (const gid of socketsOf(it)) { const g = gid && gemById(gid); if (g?.stats) for (const k in eq) eq[k] += (g.stats[k] || 0); } // socketed gems
    if (itemPowerActive(it)) { eq.ap += (it.stats.ap || 0); eq.sp += (it.stats.sp || 0); } // dormant while the piece carries two main stats
  });
  const buffs = activeBuffs(char);
  const buffOf = (k) => (buffs[k] ? buffs[k].amount : 0);
  const lvlBonus = Math.floor(char.level * 0.5);
  const al = char.allocated || {};
  const out = {
    str: char.stats.str + (al.str || 0) + lvlBonus + eq.str + buffOf("str"),
    agi: char.stats.agi + (al.agi || 0) + lvlBonus + eq.agi + buffOf("agi"),
    int: char.stats.int + (al.int || 0) + lvlBonus + eq.int + buffOf("int"),
    sta: char.stats.sta + (al.sta || 0) + lvlBonus + eq.sta + buffOf("sta"),
    armor: eq.armor,
    dmg: eq.dmg,
    leech: eq.leech,
    resil: eq.resil,
    vers: eq.vers,
    cdr: eq.cdr,
    csd: eq.csd,
    crit: eq.crit,     // crit CHANCE rating from gear
    haste: eq.haste,   // attack-speed rating from gear
    ap: eq.ap, // Attack Power — flat physical damage
    sp: eq.sp, // Spell Power  — flat magic damage
  };
  return out;
}
const tierForLevel = (lvl) => Math.min(6, Math.max(0, Math.floor((lvl || 1) / 10)));
const tierBuffPct = (t) => 5 * (t + 1);
const wardPct = (level) => tierBuffPct(tierForLevel(level));
const PLAYER_BASE_INTERVAL = Math.round(1400 / 1.33);
const empowerMultOf = (effects) => (effects || []).filter((e) => e.kind === "empower").reduce((m, e) => m * (1 + e.pct / 100), 1);
const physBuffMultOf = (effects) => 1 + Math.min(5, ((effects || []).find((e) => e.kind === "physbuff") || {}).stacks || 0) * 0.05;
const isPlayerDebuff = (e) => e.kind === "pdot" || e.kind === "pslow";
const TALENT_TIERS = [
  { level: 10, tier: "Crowd Control", options: [
    { id: "cc_a", name: "Shackle Runes", icon: "🔗", desc: "+8% attack speed", m: { atkSpeed: 0.08 } },
    { id: "cc_b", name: "Iron Resolve",  icon: "🛡️", desc: "+6% damage reduction", m: { dr: 0.06 } },
    { id: "cc_c", name: "Disrupting Blows", icon: "💫", desc: "+12% skill potency", m: { skillPot: 0.12 } },
  ] },
  { level: 20, tier: "Survivability", options: [
    { id: "sv_a", name: "Toughness",  icon: "❤️", desc: "+12% maximum health", m: { hpPct: 0.12 } },
    { id: "sv_b", name: "Stone Skin", icon: "🪨", desc: "+8% damage reduction", m: { dr: 0.08 } },
    { id: "sv_c", name: "Bloodthirst", icon: "🩸", desc: "+8% leech", m: { leech: 8 } },
  ] },
  { level: 30, tier: "Offense", options: [
    { id: "of1_a", name: "Ferocity", icon: "⚔️", desc: "+8% damage dealt", m: { dmgPct: 0.08 } },
    { id: "of1_b", name: "Focus",    icon: "🎯", desc: "+16% skill potency", m: { skillPot: 0.16 } },
    { id: "of1_c", name: "Empower",  icon: "✨", desc: "+30% buff duration", m: { buffDur: 0.30 } },
  ] },
  { level: 40, tier: "Offense", options: [
    { id: "of2_a", name: "Onslaught", icon: "💥", desc: "+10% damage dealt", m: { dmgPct: 0.10 } },
    { id: "of2_b", name: "Mastery",   icon: "🔮", desc: "+20% skill potency", m: { skillPot: 0.20 } },
    { id: "of2_c", name: "Precision", icon: "⚡", desc: "+6% critical chance", m: { crit: 0.06 } },
  ] },
  { level: 50, tier: "Survivability", options: [
    { id: "sv2_a", name: "Fortitude", icon: "❤️", desc: "+15% maximum health", m: { hpPct: 0.15 } },
    { id: "sv2_b", name: "Bulwark",   icon: "🛡️", desc: "+10% damage reduction", m: { dr: 0.10 } },
    { id: "sv2_c", name: "Vampirism", icon: "🩸", desc: "+12% leech", m: { leech: 12 } },
  ] },
];
const TALENT_L60 = {
  warrior: [
    { id: "w_berserk",  name: "Berserker",   icon: "😤", desc: "+10% attack speed per empty ability slot (bypasses the cap).", f: "berserk" },
    { id: "w_champion", name: "Juggernaut",  icon: "🏅", desc: "+15% cooldown reduction, but −25% attack speed.", m: { cdr: 0.15, atkSpeed: -0.25 } },
    { id: "w_antimage", name: "Spellbreaker", icon: "🚫", desc: "−15% magic damage taken & −20% magic crowd control. Taking magic damage grants +5% physical damage (stacks 5×).", f: "spellbreaker" },
    { id: "w_prot",     name: "Protection",  icon: "🛡️", role: "tank", desc: "Group Tank — high threat & −20% damage taken. Your damage −15%.", m: { dr: 0.20, dmgPct: -0.15 } },
  ],
  mage: [
    { id: "m_wild",   name: "Arcanist",    icon: "🎲", desc: "30% chance to double-cast magic skills. +3s skill cooldown.", f: "wildmagic", m: { skillCd: 3 } },
    { id: "m_trick",  name: "Frostweaver", icon: "🃏", desc: "Crowd control lasts 2s longer. Magic damage −15%.", m: { magicPct: -0.15 }, ccDur: 2 },
    { id: "m_sword",  name: "Spellblade",  icon: "🗡️", desc: "Auto-attacks scale from Intellect and you weave skills freely. +10% attack speed.", f: "intAuto", m: { atkSpeed: 0.10 } },
    { id: "m_support", name: "Chronomancer", icon: "⏳", role: "support", desc: "Group Support — party haste, interrupts & wards. Your damage −15%.", m: { dmgPct: -0.15 } },
  ],
  rogue: [
    { id: "r_ambush", name: "Assassin",    icon: "🥷", desc: "Skill damage +40%. +15% damage to enemies below 30% health. Auto-attacks −40%.", f: "execute30", m: { skillPot: 0.40, autoPct: -0.40 } },
    { id: "r_corr",   name: "Corruptor",   icon: "☠️", desc: "Magic skills +15%. All skills apply their damage over 3s.", f: "dotSkills", dotDur: 3, m: { magicPct: 0.15 } },
    { id: "r_wild",   name: "Wild Striker", icon: "💢", desc: "Crit chance fixed at 80% (ignores gear crit). 45% chance to miss with skills.", f: "hardCrit80", f2: "wildstrike" },
  ],
  paladin: [
    { id: "p_just",  name: "Templar",   icon: "⚖️", desc: "Skills scale from Intellect. +10% CDR. Physical damage −10%.", f: "skillsInt", m: { cdr: 0.10, physPct: -0.10 } },
    { id: "p_exile", name: "Crusader",  icon: "⛓️", desc: "+50% auto-attack damage. Cannot use magic skills.", f: "noMagic", m: { autoPct: 0.50 } },
    { id: "p_holy",  name: "Holy",      icon: "🌅", role: "healer", desc: "Group Healer — your skills heal allies (single, party & over-time). Your damage −20%.", m: { dmgPct: -0.20 } },
    { id: "p_prot",  name: "Protection", icon: "🛡️", role: "tank", desc: "Group Tank — high threat, taunts & −22% damage taken. Your damage −15%.", m: { dr: 0.22, dmgPct: -0.15 } },
  ],
  hunter: [
    { id: "h_snipe", name: "Marksman",    icon: "🎯", desc: "+15% damage dealt. +1s skill cooldown.", m: { dmgPct: 0.15, skillCd: 1 } },
    { id: "h_trap",  name: "Beastmaster", icon: "🐺", desc: "Your Savage Companion fights beside you — a persistent pet enemies can kill. Your own damage −20%. +10% cooldown reduction per debuff on the enemy (max +50%).", f: "beastPet", f2: "cdrPerDebuff", m: { dmgPct: -0.20 } },
    { id: "h_range", name: "Ranger",      icon: "🏹", desc: "+10% attack speed — rapid, skill-driven shots. No damage mitigation.", m: { dmgPct: -0.05, atkSpeed: 0.10 } },
    { id: "h_support", name: "Warden",    icon: "🎶", role: "support", desc: "Group Support — anthems, interrupts & off-healing. Your damage −15%.", m: { dmgPct: -0.15 } },
  ],
  warlock: [
    { id: "l_scorch", name: "Pyrelock",    icon: "🔥", desc: "Magic damage +15%. Physical damage −10%.", m: { magicPct: 0.15, physPct: -0.10 } },
    { id: "l_hex",    name: "Curseweaver", icon: "🕯️", desc: "Recasting an affliction stacks it (max 5) — each stack empowers its ticks. Auto-attacks −75% but refresh your afflictions, keeping stacks alive.", f: "dotSkills", f2: "hexRefresh", f3: "hexStack", dotDur: 2, m: { autoPct: -0.75 } },
    { id: "l_demon",  name: "Demonbinder", icon: "😈", desc: "Auto-attacks scale from Intellect; your demon fights alongside you. +5% attack speed.", f: "intAuto", m: { atkSpeed: 0.05 } },
  ],
};
const _gU = (p) => ({ level: 10, tier: "Utility", options: [
  { id: p + "u_a", name: "Quickened",  icon: "⏩", desc: "+8% attack speed", m: { atkSpeed: 0.08 } },
  { id: p + "u_b", name: "Focus",      icon: "🎯", desc: "+12% skill potency", m: { skillPot: 0.12 } },
  { id: p + "u_c", name: "Efficiency", icon: "⏱️", desc: "+6% cooldown reduction", m: { cdr: 0.06 } },
] });
const _gS1 = (p) => ({ level: 20, tier: "Survival", options: [
  { id: p + "s_a", name: "Toughness",   icon: "❤️", desc: "+12% maximum health", m: { hpPct: 0.12 } },
  { id: p + "s_b", name: "Stone Skin",  icon: "🪨", desc: "+8% damage reduction", m: { dr: 0.08 } },
  { id: p + "s_c", name: "Bloodthirst", icon: "🩸", desc: "+8% leech", m: { leech: 8 } },
] });
const _gO = (p) => ({ level: 30, tier: "Offense", options: [
  { id: p + "o_a", name: "Ferocity",    icon: "⚔️", desc: "+8% damage dealt", m: { dmgPct: 0.08 } },
  { id: p + "o_b", name: "Mastery",     icon: "🔮", desc: "+16% skill potency", m: { skillPot: 0.16 } },
  { id: p + "o_c", name: "Empowerment", icon: "✨", desc: "+30% buff duration", m: { buffDur: 0.30 } },
] });
const _gS2 = (p) => ({ level: 50, tier: "Survival", options: [
  { id: p + "s2_a", name: "Fortitude", icon: "❤️", desc: "+15% maximum health", m: { hpPct: 0.15 } },
  { id: p + "s2_b", name: "Bulwark",   icon: "🛡️", desc: "+10% damage reduction", m: { dr: 0.10 } },
  { id: p + "s2_c", name: "Vampirism", icon: "🩸", desc: "+12% leech", m: { leech: 12 } },
] });
const _off = {
  // ---- Warrior ----
  w_berserk: [
    [ { id: "w_berserk_x_a", name: "Frothing Blows", icon: "🌀", desc: "Frenzied Onslaught deals +40%.", cond: { kind: "skill", skill: "Frenzied Onslaught", pct: 0.40 } },
      { id: "w_berserk_x_b", name: "Reckless Finish", icon: "💢", desc: "Reckless Abandon deals +50% to enemies below 50%.", cond: { kind: "skill", skill: "Reckless Abandon", hpBelow: 0.5, pct: 0.50 } },
      { id: "w_berserk_x_c", name: "Rage Flood", icon: "🔴", desc: "Builders deal +20% damage.", cond: { kind: "builder", pct: 0.20 } } ],
    [ { id: "w_berserk_c_a", name: "Unbridled Fury", icon: "😤", desc: "+10% attack speed.", m: { atkSpeed: 0.10 } },
      { id: "w_berserk_c_b", name: "Bloodbath", icon: "🩸", desc: "Nukes deal +30% to enemies below 35%.", cond: { kind: "nuke", hpBelow: 0.35, pct: 0.30 } },
      { id: "w_berserk_c_c", name: "Savagery", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } } ],
  ],
  w_champion: [
    [ { id: "w_champion_x_a", name: "Cataclysmic Force", icon: "💥", desc: "Cataclysm Slam deals +50%.", cond: { kind: "skill", skill: "Cataclysm Slam", pct: 0.50 } },
      { id: "w_champion_x_b", name: "Spender's Might", icon: "🔨", desc: "Spenders deal +30% damage.", cond: { kind: "spender", pct: 0.30 } },
      { id: "w_champion_x_c", name: "Executioner", icon: "🪓", desc: "Executioner's Drop deals +40%.", cond: { kind: "skill", skill: "Executioner's Drop", pct: 0.40 } } ],
    [ { id: "w_champion_c_a", name: "Grand Mastery", icon: "🔮", desc: "+18% skill potency.", m: { skillPot: 0.18 } },
      { id: "w_champion_c_b", name: "Opening Slam", icon: "🏅", desc: "Spenders deal +35% to enemies above 70%.", cond: { kind: "spender", hpAbove: 0.7, pct: 0.35 } },
      { id: "w_champion_c_c", name: "Relentless Cycle", icon: "⏱️", desc: "+8% cooldown reduction.", m: { cdr: 0.08 } } ],
  ],
  w_antimage: [
    [ { id: "w_antimage_x_a", name: "Runic Edge", icon: "🩸", desc: "Runic Cleave deals +45%.", cond: { kind: "skill", skill: "Runic Cleave", pct: 0.45 } },
      { id: "w_antimage_x_b", name: "Absorbed Wrath", icon: "🔨", desc: "Bulwark Vengeance deals +40%.", cond: { kind: "skill", skill: "Bulwark Vengeance", pct: 0.40 } },
      { id: "w_antimage_x_c", name: "Attrition", icon: "⚔️", desc: "All skills deal +15% damage.", cond: { kind: "all", pct: 0.15 } } ],
    [ { id: "w_antimage_c_a", name: "Grindstone", icon: "⚔️", desc: "+10% damage dealt.", m: { dmgPct: 0.10 } },
      { id: "w_antimage_c_b", name: "War of Attrition", icon: "🛡️", desc: "Skills deal +25% to enemies above 60%.", cond: { kind: "all", hpAbove: 0.6, pct: 0.25 } },
      { id: "w_antimage_c_c", name: "Lifedrinker", icon: "🩸", desc: "+10% leech.", m: { leech: 10 } } ],
  ],
  // ---- Mage ----
  m_wild: [
    [ { id: "m_wild_x_a", name: "Nova Overload", icon: "💠", desc: "Overcharged Nova deals +50%.", cond: { kind: "skill", skill: "Overcharged Nova", pct: 0.50 } },
      { id: "m_wild_x_b", name: "Rupturing Charges", icon: "💥", desc: "Mana Rupture deals +40%.", cond: { kind: "skill", skill: "Mana Rupture", pct: 0.40 } },
      { id: "m_wild_x_c", name: "Detonator", icon: "✨", desc: "Spenders deal +25% damage.", cond: { kind: "spender", pct: 0.25 } } ],
    [ { id: "m_wild_c_a", name: "Arcane Fury", icon: "🔮", desc: "+18% magic damage.", m: { magicPct: 0.18 } },
      { id: "m_wild_c_b", name: "Killing Spike", icon: "💠", desc: "Nukes deal +30% to enemies below 40%.", cond: { kind: "nuke", hpBelow: 0.4, pct: 0.30 } },
      { id: "m_wild_c_c", name: "Spell Mastery", icon: "🎯", desc: "+18% skill potency.", m: { skillPot: 0.18 } } ],
  ],
  m_trick: [
    [ { id: "m_trick_x_a", name: "Deep Freeze", icon: "🔵", desc: "Frozen Orb deals +45%.", cond: { kind: "skill", skill: "Frozen Orb", pct: 0.45 } },
      { id: "m_trick_x_b", name: "Lingering Frost", icon: "❄️", desc: "DoTs deal +30% damage.", cond: { kind: "dot", pct: 0.30 } },
      { id: "m_trick_x_c", name: "Wearing Cold", icon: "🧊", desc: "Skills deal +30% to enemies above 60%.", cond: { kind: "all", hpAbove: 0.6, pct: 0.30 } } ],
    [ { id: "m_trick_c_a", name: "Frostfire", icon: "🔮", desc: "+15% magic damage.", m: { magicPct: 0.15 } },
      { id: "m_trick_c_b", name: "Endless Winter", icon: "❄️", desc: "DoTs deal +40% to enemies above 50%.", cond: { kind: "dot", hpAbove: 0.5, pct: 0.40 } },
      { id: "m_trick_c_c", name: "Prolonged Chill", icon: "✨", desc: "+30% buff duration.", m: { buffDur: 0.30 } } ],
  ],
  m_sword: [
    [ { id: "m_sword_x_a", name: "Runic Momentum", icon: "🗡️", desc: "Runeblade Strike deals +45%.", cond: { kind: "skill", skill: "Runeblade Strike", pct: 0.45 } },
      { id: "m_sword_x_b", name: "Bladeweaving", icon: "⚔️", desc: "+30% auto-attack damage.", m: { autoPct: 0.30 } },
      { id: "m_sword_x_c", name: "Finishing Cut", icon: "🩸", desc: "Auto-attacks deal +35% to enemies below 40%.", cond: { kind: "auto", hpBelow: 0.4, pct: 0.35 } } ],
    [ { id: "m_sword_c_a", name: "Arcane Edge", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } },
      { id: "m_sword_c_b", name: "Duelist's Speed", icon: "⏩", desc: "+15% attack speed.", m: { atkSpeed: 0.15 } },
      { id: "m_sword_c_c", name: "Opening Strikes", icon: "🗡️", desc: "Auto-attacks deal +25% to enemies above 70%.", cond: { kind: "auto", hpAbove: 0.7, pct: 0.25 } } ],
  ],
  // ---- Rogue ----
  r_ambush: [
    [ { id: "r_ambush_x_a", name: "Bloody Finish", icon: "☠️", desc: "Throat Slit deals +60% to enemies below 20%.", cond: { kind: "skill", skill: "Throat Slit", hpBelow: 0.2, pct: 0.60 } },
      { id: "r_ambush_x_b", name: "Perfect Opener", icon: "🗡️", desc: "Cold Open deals +50%.", cond: { kind: "skill", skill: "Cold Open", pct: 0.50 } },
      { id: "r_ambush_x_c", name: "First Blood", icon: "🥷", desc: "Spenders deal +30% to enemies above 80%.", cond: { kind: "spender", hpAbove: 0.8, pct: 0.30 } } ],
    [ { id: "r_ambush_c_a", name: "Assassinate", icon: "☠️", desc: "Nukes deal +50% to enemies below 20%.", cond: { kind: "nuke", hpBelow: 0.2, pct: 0.50 } },
      { id: "r_ambush_c_b", name: "Lethality", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } },
      { id: "r_ambush_c_c", name: "Killer's Focus", icon: "🎯", desc: "All skills deal +20% damage.", cond: { kind: "all", pct: 0.20 } } ],
  ],
  r_corr: [
    [ { id: "r_corr_x_a", name: "Virulence", icon: "☠️", desc: "DoTs deal +35% damage.", cond: { kind: "dot", pct: 0.35 } },
      { id: "r_corr_x_b", name: "Full Bloom", icon: "🧪", desc: "Toxic Bloom deals +50%.", cond: { kind: "skill", skill: "Toxic Bloom", pct: 0.50 } },
      { id: "r_corr_x_c", name: "Fester", icon: "🩸", desc: "Festering Wounds deals +45%.", cond: { kind: "skill", skill: "Festering Wounds", pct: 0.45 } } ],
    [ { id: "r_corr_c_a", name: "Slow Death", icon: "☠️", desc: "DoTs deal +40% to enemies above 50%.", cond: { kind: "dot", hpAbove: 0.5, pct: 0.40 } },
      { id: "r_corr_c_b", name: "Toxicology", icon: "🔮", desc: "+16% magic damage.", m: { magicPct: 0.16 } },
      { id: "r_corr_c_c", name: "Potent Venom", icon: "🎯", desc: "+20% skill potency.", m: { skillPot: 0.20 } } ],
  ],
  r_wild: [
    [ { id: "r_wild_x_a", name: "Whirling Steel", icon: "✂️", desc: "Relentless Flurry deals +40%.", cond: { kind: "skill", skill: "Relentless Flurry", pct: 0.40 } },
      { id: "r_wild_x_b", name: "Honed Autos", icon: "🗡️", desc: "+25% auto-attack damage.", m: { autoPct: 0.25 } },
      { id: "r_wild_x_c", name: "Twinned Edge", icon: "🗡️", desc: "Twin Daggers deals +45%.", cond: { kind: "skill", skill: "Twin Daggers", pct: 0.45 } } ],
    [ { id: "r_wild_c_a", name: "Steady Hand", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } },
      { id: "r_wild_c_b", name: "Fleetfooted", icon: "⏩", desc: "+15% attack speed.", m: { atkSpeed: 0.15 } },
      { id: "r_wild_c_c", name: "Constant Pressure", icon: "🎯", desc: "All skills deal +18% damage.", cond: { kind: "all", pct: 0.18 } } ],
  ],
  // ---- Paladin ----
  p_just: [
    [ { id: "p_just_x_a", name: "Flames of Verdict", icon: "🔥", desc: "Verdict of Flame deals +50%.", cond: { kind: "skill", skill: "Verdict of Flame", pct: 0.50 } },
      { id: "p_just_x_b", name: "Radiant Beam", icon: "🔱", desc: "Judgment Beam deals +40%.", cond: { kind: "skill", skill: "Judgment Beam", pct: 0.40 } },
      { id: "p_just_x_c", name: "Divine Detonation", icon: "✨", desc: "Spenders deal +30% damage.", cond: { kind: "spender", pct: 0.30 } } ],
    [ { id: "p_just_c_a", name: "Holy Mastery", icon: "🔮", desc: "+16% skill potency.", m: { skillPot: 0.16 } },
      { id: "p_just_c_b", name: "Final Judgment", icon: "🔥", desc: "Nukes deal +30% to enemies below 40%.", cond: { kind: "nuke", hpBelow: 0.4, pct: 0.30 } },
      { id: "p_just_c_c", name: "Swift Justice", icon: "⏱️", desc: "+8% cooldown reduction.", m: { cdr: 0.08 } } ],
  ],
  p_king: [
    [ { id: "p_king_x_a", name: "Overflowing Aegis", icon: "🛡️", desc: "Aegis Overflow deals +45%.", cond: { kind: "skill", skill: "Aegis Overflow", pct: 0.45 } },
      { id: "p_king_x_b", name: "Detonation", icon: "👑", desc: "Spenders deal +35% damage.", cond: { kind: "spender", pct: 0.35 } },
      { id: "p_king_x_c", name: "Fortress Assault", icon: "🪨", desc: "Skills deal +20% to enemies above 70%.", cond: { kind: "all", hpAbove: 0.7, pct: 0.20 } } ],
    [ { id: "p_king_c_a", name: "Immovable", icon: "❤️", desc: "+15% maximum health.", m: { hpPct: 0.15 } },
      { id: "p_king_c_b", name: "Righteous Power", icon: "⚔️", desc: "+10% damage dealt.", m: { dmgPct: 0.10 } },
      { id: "p_king_c_c", name: "Sanguine Faith", icon: "🩸", desc: "+12% leech.", m: { leech: 12 } } ],
  ],
  p_exile: [
    [ { id: "p_exile_x_a", name: "Zealous Blades", icon: "⚔️", desc: "Zealot's Flurry deals +40%.", cond: { kind: "skill", skill: "Zealot's Flurry", pct: 0.40 } },
      { id: "p_exile_x_b", name: "Final Verdict", icon: "🪓", desc: "Executioner's Verdict deals +50% to enemies below 30%.", cond: { kind: "skill", skill: "Executioner's Verdict", hpBelow: 0.3, pct: 0.50 } },
      { id: "p_exile_x_c", name: "Weapon Master", icon: "🗡️", desc: "+25% auto-attack damage.", m: { autoPct: 0.25 } } ],
    [ { id: "p_exile_c_a", name: "Crusader's Might", icon: "⚔️", desc: "+14% physical damage.", m: { physPct: 0.14 } },
      { id: "p_exile_c_b", name: "Execution", icon: "🪓", desc: "Nukes deal +40% to enemies below 30%.", cond: { kind: "nuke", hpBelow: 0.3, pct: 0.40 } },
      { id: "p_exile_c_c", name: "Zeal", icon: "⏩", desc: "+12% attack speed.", m: { atkSpeed: 0.12 } } ],
  ],
  // ---- Hunter ----
  h_snipe: [
    [ { id: "h_snipe_x_a", name: "Perfect Shot", icon: "🎯", desc: "Steady Aim deals +45%.", cond: { kind: "skill", skill: "Steady Aim", pct: 0.45 } },
      { id: "h_snipe_x_b", name: "Deadeye", icon: "💀", desc: "Deadeye Shot deals +50%.", cond: { kind: "skill", skill: "Deadeye Shot", pct: 0.50 } },
      { id: "h_snipe_x_c", name: "Opening Volley", icon: "🏹", desc: "Spenders deal +35% to enemies above 70%.", cond: { kind: "spender", hpAbove: 0.7, pct: 0.35 } } ],
    [ { id: "h_snipe_c_a", name: "Sharpshooter", icon: "⚔️", desc: "+16% damage dealt.", m: { dmgPct: 0.16 } },
      { id: "h_snipe_c_b", name: "Kill Shot", icon: "💀", desc: "Nukes deal +40% to enemies below 35%.", cond: { kind: "nuke", hpBelow: 0.35, pct: 0.40 } },
      { id: "h_snipe_c_c", name: "Ballistics", icon: "🎯", desc: "+18% skill potency.", m: { skillPot: 0.18 } } ],
  ],
  h_trap: [
    [ { id: "h_trap_x_a", name: "Savage Bond", icon: "🐺", desc: "Savage Companion deals +45%.", cond: { kind: "skill", skill: "Savage Companion", pct: 0.45 } },
      { id: "h_trap_x_b", name: "Toxins", icon: "🧪", desc: "DoTs deal +35% damage.", cond: { kind: "dot", pct: 0.35 } },
      { id: "h_trap_x_c", name: "Coated Barbs", icon: "🧪", desc: "Venom Coating deals +40%.", cond: { kind: "skill", skill: "Venom Coating", pct: 0.40 } } ],
    [ { id: "h_trap_c_a", name: "Pack Tactics", icon: "🐾", desc: "DoTs deal +40% to enemies above 50%.", cond: { kind: "dot", hpAbove: 0.5, pct: 0.40 } },
      { id: "h_trap_c_b", name: "Beastmastery", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } },
      { id: "h_trap_c_c", name: "Ensnaring Web", icon: "🪤", desc: "Crowd control lasts 2s longer.", ccDur: 2 } ],
  ],
  h_range: [
    [ { id: "h_range_x_a", name: "Volley Fire", icon: "⚡", desc: "Rapid Volley deals +40%.", cond: { kind: "skill", skill: "Rapid Volley", pct: 0.40 } },
      { id: "h_range_x_b", name: "Double Nock", icon: "↗️", desc: "Twin Shot deals +45%.", cond: { kind: "skill", skill: "Twin Shot", pct: 0.45 } },
      { id: "h_range_x_c", name: "Quickdraw", icon: "🏹", desc: "+25% auto-attack damage.", m: { autoPct: 0.25 } } ],
    [ { id: "h_range_c_a", name: "Marksmanship", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } },
      { id: "h_range_c_b", name: "Rapid Fire", icon: "⏩", desc: "+15% attack speed.", m: { atkSpeed: 0.15 } },
      { id: "h_range_c_c", name: "Sustained Barrage", icon: "🎯", desc: "All skills deal +18% damage.", cond: { kind: "all", pct: 0.18 } } ],
  ],
  // ---- Warlock ----
  l_scorch: [
    [ { id: "l_scorch_x_a", name: "Chaotic Surge", icon: "🌑", desc: "Chaos Bolt deals +50%.", cond: { kind: "skill", skill: "Chaos Bolt", pct: 0.50 } },
      { id: "l_scorch_x_b", name: "Cataclysmic Ruin", icon: "💀", desc: "Cataclysm deals +45%.", cond: { kind: "skill", skill: "Cataclysm", pct: 0.45 } },
      { id: "l_scorch_x_c", name: "Immolate", icon: "🔥", desc: "Nukes deal +30% to enemies below 40%.", cond: { kind: "nuke", hpBelow: 0.4, pct: 0.30 } } ],
    [ { id: "l_scorch_c_a", name: "Dark Fury", icon: "🔮", desc: "+18% magic damage.", m: { magicPct: 0.18 } },
      { id: "l_scorch_c_b", name: "Shard Detonation", icon: "💀", desc: "Spenders deal +35% damage.", cond: { kind: "spender", pct: 0.35 } },
      { id: "l_scorch_c_c", name: "Pyromastery", icon: "🎯", desc: "+16% skill potency.", m: { skillPot: 0.16 } } ],
  ],
  l_hex: [
    [ { id: "l_hex_x_a", name: "Unstable Ruin", icon: "🕷️", desc: "Unstable Affliction deals +50%.", cond: { kind: "skill", skill: "Unstable Affliction", pct: 0.50 } },
      { id: "l_hex_x_b", name: "Plague Bearer", icon: "🕸️", desc: "DoTs deal +35% damage.", cond: { kind: "dot", pct: 0.35 } },
      { id: "l_hex_x_c", name: "Spreading Rot", icon: "🕸️", desc: "Corruption Spread deals +45%.", cond: { kind: "skill", skill: "Corruption Spread", pct: 0.45 } } ],
    [ { id: "l_hex_c_a", name: "Withering Curse", icon: "🕯️", desc: "DoTs deal +40% to enemies above 50%.", cond: { kind: "dot", hpAbove: 0.5, pct: 0.40 } },
      { id: "l_hex_c_b", name: "Malefic Power", icon: "🔮", desc: "+16% magic damage.", m: { magicPct: 0.16 } },
      { id: "l_hex_c_c", name: "Affliction Mastery", icon: "🎯", desc: "+20% skill potency.", m: { skillPot: 0.20 } } ],
  ],
  l_demon: [
    [ { id: "l_demon_x_a", name: "Fiendish Wrath", icon: "😈", desc: "Summon Fiend deals +45%.", cond: { kind: "skill", skill: "Summon Fiend", pct: 0.45 } },
      { id: "l_demon_x_b", name: "Demonic Autos", icon: "🗡️", desc: "+30% auto-attack damage.", m: { autoPct: 0.30 } },
      { id: "l_demon_x_c", name: "Bound Soul", icon: "💜", desc: "Soul Link deals +40%.", cond: { kind: "skill", skill: "Soul Link", pct: 0.40 } } ],
    [ { id: "l_demon_c_a", name: "Demonic Might", icon: "⚔️", desc: "+12% damage dealt.", m: { dmgPct: 0.12 } },
      { id: "l_demon_c_b", name: "Frenzied Fiend", icon: "⏩", desc: "+12% attack speed.", m: { atkSpeed: 0.12 } },
      { id: "l_demon_c_c", name: "Lasting Torment", icon: "😈", desc: "DoTs deal +30% damage.", cond: { kind: "dot", pct: 0.30 } } ],
  ],
};
const SPEC_TREES = (() => {
  const out = {};
  for (const specId in _off) {
    const p = specId + "_";
    out[specId] = [
      _gU(p), _gS1(p), _gO(p),
      { level: 40, tier: "Signature Offense", options: _off[specId][0] },
      _gS2(p),
      { level: 60, tier: "Capstone", options: _off[specId][1] },
    ];
  }
  return out;
})();
const specById = (id) => { for (const cid in TALENT_L60) { const s = (TALENT_L60[cid] || []).find((x) => x.id === id); if (s) return s; } return null; };
const specRole = (id) => { const s = specById(id); return (s && s.role) || "dps"; };
const roleOf = (char) => specRole(char && char.spec);
const POWER_GEMS = [
  { id: "g_runescribe",  name: "Runescribed Diamond", icon: "💠", rarity: "legendary", desc: "−1s to every skill cooldown. Stacks.", flatCd: 1 },
  { id: "g_execeye",     name: "Executioner's Eye",   icon: "👁️", rarity: "legendary", desc: "Your auto-attacks instantly slay enemies at or below 5% health. Stacks (+2% threshold each).", autoExec: 0.05 },
  { id: "g_frenzystar",  name: "Frenzy Star",         icon: "⭐", rarity: "legendary", desc: "Each auto-attack builds +8% critical damage until your next critical strike. Stacks.", autoCritStack: 0.08 },
  { id: "g_alchprism",   name: "Alchemist's Prism",   icon: "⚗️", rarity: "legendary", desc: "Potions are twice as effective. Stacks (+100% each).", potionMult: 1 },
  { id: "g_scribeprism", name: "Scribe's Prism",      icon: "📜", rarity: "legendary", desc: "Stat scrolls are twice as effective. Stacks (+100% each).", scrollMult: 1 },
  { id: "g_warmonger",   name: "Warmonger's Ruby",    icon: "🔺", rarity: "legendary", desc: "+8% damage dealt. Stacks.", m: { dmgPct: 0.08 } },
  { id: "g_sanguine",    name: "Sanguine Heart",      icon: "🫀", rarity: "legendary", desc: "+10% leech. Stacks.", m: { leech: 10 } },
];
const ALL_GEMS = [...GEMS, ...POWER_GEMS];
const gemById = (id) => ALL_GEMS.find((g) => g.id === id);
const socketedGems = (char) => {
  const out = [];
  for (const it of Object.values(char?.equipment || {})) for (const gid of socketsOf(it)) if (gid) { const g = gemById(gid); if (g) out.push(g); }
  return out;
};
const gemFlatCd = (char) => socketedGems(char).reduce((n, g) => n + (g.flatCd || 0), 0);
const talentRows = (char) => { const sp = char && char.spec; return (sp && SPEC_TREES[sp]) ? SPEC_TREES[sp] : TALENT_TIERS; };
const selectedTalents = (char) => {
  const t = (char && char.talents) || {}; const out = [];
  for (const r of talentRows(char)) { const id = t[r.level]; if (id) { const o = r.options.find((x) => x.id === id); if (o) out.push(o); } }
  const sp = specById(char && char.spec); if (sp) out.push(sp); // your Specialization's passive
  return out;
};
const skillIsSpender = (sk) => !!sk && (sk.spend === "all" || (sk.cost || 0) > 0);
const skillIsBuilder = (sk) => !!sk && (sk.gen || 0) > 0;
const skillIsDot = (sk) => !!sk && (sk.dotMult || 0) > 0;
const skillIsNuke = (sk) => !!sk && (sk.mult || 0) > 0 && !((sk.dotMult || 0) > 0);
const condHpOk = (cond, hpFrac) => (cond.hpBelow == null || hpFrac <= cond.hpBelow) && (cond.hpAbove == null || hpFrac >= cond.hpAbove);
const condMatchesSkill = (cond, sk) => {
  switch (cond.kind) {
    case "auto": return false;
    case "all": return true;
    case "skill": return !!sk && sk.name === cond.skill;
    case "spender": return skillIsSpender(sk);
    case "builder": return skillIsBuilder(sk);
    case "dot": return skillIsDot(sk);
    case "nuke": return skillIsNuke(sk);
    default: return false;
  }
};
const talentSkillMult = (char, sk, hpFrac) => {
  let bonus = 0;
  for (const t of selectedTalents(char)) { const c = t.cond; if (c && c.kind !== "auto" && condMatchesSkill(c, sk) && condHpOk(c, hpFrac)) bonus += c.pct; }
  return 1 + bonus;
};
const talentFlag = (char, key) => selectedTalents(char).some((o) => o.f === key || o.f2 === key || o.f3 === key);
const talentDotDur = (char) => { const o = selectedTalents(char).find((t) => t.f === "dotSkills" || t.f2 === "dotSkills"); return o ? (o.dotDur || 0) : 0; };
const talentCcDur = (char) => selectedTalents(char).reduce((s, o) => s + (o.ccDur || 0), 0);
const talentMods = (char) => {
  const m = { hpPct: 0, dr: 0, leech: 0, dmgPct: 0, physPct: 0, magicPct: 0, skillPot: 0, buffDur: 0, cdr: 0, atkSpeed: 0, crit: 0, autoPct: 0, skillCd: 0 };
  for (const o of selectedTalents(char)) if (o.m) for (const k in o.m) m[k] = (m[k] || 0) + o.m[k];
  for (const g of socketedGems(char)) if (g.m) for (const k in g.m) m[k] = (m[k] || 0) + g.m[k]; // socketed gems
  if (talentFlag(char, "berserk")) { const empty = Math.max(0, unlockedSlotCount(char.level) - ((char.selectedSkills || []).length)); m.atkSpeed += empty * 0.10; }
  return m;
};
const maxHpFor = (char) => {
  const eff = effectiveStats(char);
  const race = RACES.find((r) => r.id === char.race);
  let hp = Math.floor(char.level * 22 + eff.sta * 11 + 60);
  if (race?.id === "tauren") hp = Math.floor(hp * 1.05);
  hp = Math.floor(hp * (1 + townBonuses(char).hp)); // Sanctum (town)
  hp = Math.floor(hp * (1 + talentMods(char).hpPct)); // talents
  return hp;
};
const weaponAvgDmg = (char) => { const w = char.equipment && char.equipment.weapon; if (!w) return 0; if (w.wdmg) return (w.wdmg.min + w.wdmg.max) / 2; return (w.stats && w.stats.dmg) || 0; };
const townLvl = (char, id) => (char && char.town && char.town.buildings && char.town.buildings[id]) || 0;
const townBonuses = (char) => ({
  xp: townLvl(char, "townhall") * 0.015 + townLvl(char, "warcollege") * 0.06,   // % more combat XP
  gold: townLvl(char, "townhall") * 0.015 + townLvl(char, "vault") * 0.06,      // % more gold from kills
  drop: townLvl(char, "foundry") * 0.04,                                        // % more gear-drop chance
  dmg: townLvl(char, "barracks") * 0.025,                                       // % more damage dealt
  hp: townLvl(char, "sanctum") * 0.04,                                          // % more max health
  gather: townLvl(char, "storehouse") * 0.05,                                   // % more gathered materials
});
const HEX_MAX_STACKS = 5;
const hexStackMult = (st) => 1 + (Math.max(1, st) - 1) * 0.40;
const classDmgMod = (clsId) => { const c = CLASSES.find((x) => x.id === clsId); return (c && c.dmgMod) || 0; };
// Which stat a class turns into PHYSICAL damage. Every class already declares a `main`, and
// rogue and hunter have always declared "agi" — the damage term simply never read it, so a rogue
// scaled off Strength while wearing gear named for Agility. Measured before this change, a rogue
// gained 12.0% dps from 30 Strength and 4.4% from 30 Agility, and no class on the roster had
// Agility as its best stat.
//
// Casters are deliberately excluded. Their `main` is Intellect and their real damage is magic,
// which already scales off Intellect; routing their incidental auto-attack through it as well
// would be a straight buff to mages and warlocks that nothing here is asking for.
const physScalingStat = (clsId) => {
  const cls = CLASSES.find((c) => c.id === clsId);
  return cls && cls.main === "agi" ? "agi" : "str";
};
// All three convert at the same rate.
//
// Agility was briefly set to 1.0 here, on the reasoning that it also buys attack speed and crit
// and so should pay for them. That was wrong, and wrong in a way worth recording: the 1.0 came
// from the MARGINAL value of +30 Agility, but this rate multiplies the WHOLE damage term. Cutting
// it to 1.0 took 29% off every Agility class's existing damage base — measured, rogue -12.1% and
// hunter -9.6% total dps — which no marginal comparison could see.
//
// At 1.4 the double-dip is real at the margin (a point of Agility is worth 1.39x a warrior's
// Strength to a rogue, 1.63x to a hunter) but it does not need paying for, because Strength and
// Intellect are worth NOTHING to those classes while a warrior still gets value from Agility
// gear. Priced as what a random main-stat roll is worth — which is what a drop actually is, since
// gear rolls all three with equal probability — the roster reads:
//
//                    before        after
//   warrior           1.00          1.00
//   rogue             0.91          0.97
//   hunter            1.07          1.12
//   casters      1.05-1.07     1.05-1.07
//   spread           x1.18         x1.16
//
// Concentration cancels the double-dip almost exactly, and the roster ends slightly tighter than
// it started.
const STAT_DMG_RATE = { str: 1.4, int: 1.4, agi: 1.4 };
const computeDamage = (char, weaponDmg, magic) => {
  const eff = effectiveStats(char);
  const statKey = magic ? "int" : physScalingStat(char.cls);
  const statVal = eff[statKey] || 0;
  const power = magic ? (eff.sp || 0) : (eff.ap || 0);      // Spell/Attack Power — flat damage from single-stat gear
  let dmg = (char.level * 2 + 4 + statVal * STAT_DMG_RATE[statKey] + weaponDmg + power) * 0.75; // weapon damage comes from its min–max range
  dmg *= 1 + secondaryPcts(eff).vers / 100; // Versatility increases damage dealt
  const ab = activeBuffs(char);
  if (ab.dmgpct) dmg *= 1 + ab.dmgpct.amount / 100;
  if (char.race === "orc") dmg *= 1.05;
  dmg *= 1 + townBonuses(char).dmg; // Barracks (town)
  const _tm = talentMods(char);
  dmg *= 1 + _tm.dmgPct + (magic ? _tm.magicPct : _tm.physPct); // talents (all + by type)
  dmg *= 1 + (classDmgMod(char.cls)); // class trait — Rogue "Finesse": light blades trade raw power for precision (crit)
  return Math.max(1, Math.floor(dmg));
};
const playerBaseDamage = (char, magic) => computeDamage(char, weaponAvgDmg(char), magic);
const AGI_SPEED_CAP = 0.30, AGI_CRIT_CAP = 0.35, AGI_RATE = 0.002;
const agiAtkSpeed = (char) => Math.min(AGI_SPEED_CAP, (effectiveStats(char).agi || 0) * AGI_RATE);
// Haste from gear, as a fraction. Attacks per second scale 1/(1-h), so this is hyperbolic and
// the 15% cap is what keeps it finite — at 30% the marginal value of +5% is already double what
// it is at 0%. It also shortens the group GCD, so it is worth more online than solo.
const hasteOf = (char) => secondaryPcts(effectiveStats(char)).haste / 100;
const CRIT_SOFT_CAP = 0.55;   // total crit chance, gear included, before heavy damping
const CRIT_BASE = 0.12;       // everyone
// The rogue's class bonus. It used to be +13%, which put a level-1 rogue at 28% crit against a
// warrior's 13% — more than twice the roster — and a geared level-60 rogue at 48%, close enough
// to the 55% soft cap that its own Agility was being damped. At +3% a fresh rogue reads 18% and
// a geared one 38% against the roster's ~33%: still visibly the crit class, no longer eating its
// own headroom. Measured cost at the time of the change: -5.8% dps, paid back by Agility
// becoming its damage stat.
const CRIT_ROGUE_BONUS = 0.03;
const critChanceFor = (char) => {
  if (talentFlag(char, "hardCrit80")) return 0.80; // Wild Striker — fixed 80%, ignores gear crit
  const cls = CLASSES.find((c) => c.id === char.cls);
  let c = CRIT_BASE;
  if (cls.id === "rogue") c += CRIT_ROGUE_BONUS;
  if (char.race === "troll") c += 0.05;
  const eff = effectiveStats(char);
  c += Math.min(AGI_CRIT_CAP, eff.agi * AGI_RATE);
  c += talentMods(char).crit; // Precision
  c += secondaryPcts(eff).crit / 100;   // crit CHANCE is a gear secondary now, not class-only
  // Total crit soft-caps at 55%. Without a ceiling, gear crit compounds with crit damage (each
  // makes the other better) and the pair eats every other secondary; it would also make the Wild
  // Striker talent's fixed 80% meaningless. Excess is not discarded, just heavily damped.
  return Math.min(1, Math.max(0, c <= CRIT_SOFT_CAP ? c : CRIT_SOFT_CAP + (c - CRIT_SOFT_CAP) * 0.25));
};
const mitigation = (armor, attackerLevel) => clamp((armor * 5) / (armor * 5 + 45 + attackerLevel * 15), 0, 0.75);
// Which damage type a creature favours, and the pool it draws from. Decided by the MAJORITY of the
// class's own kit rather than by its declared main stat: deriving it from the declaration broke
// hybrids, filtering a paladin's 21 castable skills down to the 2 physical ones.
//
// Lives here rather than in the client because two places need the same answer — makeEnemy, which
// picks what a creature actually casts, and the Bestiary, which tells the player what to expect.
// They had separate copies of the rule and would have disagreed about paladins.
const enemyCastable = (clsId, level) =>
  (SKILLS[clsId] || []).filter((s) => s.unlockLevel <= (level || 1) && ((s.mult && s.mult > 0) || s.dotMult || s.slowPct));
const enemyPrefersMagic = (clsId, level) => {
  const pool = enemyCastable(clsId, level);
  return pool.filter(isMagicSkill).length * 2 > pool.length;
};
// A kit close to evenly split keeps both halves rather than throwing one away.
const enemyUsableSkills = (clsId, level) => {
  const pool = enemyCastable(clsId, level);
  const typed = pool.filter((s) => isMagicSkill(s) === enemyPrefersMagic(clsId, level));
  return (typed.length && typed.length * 4 >= pool.length * 3) ? typed : pool;
};
const enemyDamageForLevel = (level) => Math.floor(level * 2 + 6);
const LEECH_MULT = 0.67;
// ---------- SECONDARY CONVERSION ----------
// Rating -> percentage. Two rules changed here and both were measured first.
//
// 1) DIMINISHING RETURNS. Every secondary used to convert linearly and then slam into a hard cap,
//    and because the rates were chosen to match the caps they ALL capped at exactly 50 rating.
//    A naturally geared 60 carries ~14 rating per stat; rerolling every line into one stat
//    reaches ~100 — twice the cap, with half the investment doing literally nothing and no reason
//    to stop short of exactly 50. Now: linear up to a soft cap at half the hard cap, then a
//    hyperbolic tail that approaches the hard cap without reaching it. Natural gearing is
//    unchanged, stacking keeps paying but pays less, and no point is ever worth exactly zero.
//
//    A plain saturating curve (cap * r/(r+K)) was tried first and rejected: it also halved a
//    normally geared player, because the problem was never that rating is worth too much.
//
// 2) csd REPRICED 4 -> 1.5. Crit damage multiplies with crit chance while versatility is flat, so
//    10 rating of csd was worth x1.09 a versatility point at 12% crit and x4.88 at 80% — the same
//    stat swinging x4.5 in value by class, and every real spec sat at x2.3-x3.4. It was not a
//    choice, it was the answer. 1.5 lands it beside versatility at ~35% crit, where the roster is.
const SEC_CAP  = { leech: 25, resil: 30, vers: 20, cdr: 15, csd: 200, crit: 20, haste: 15 };
const SEC_RATE = { leech: 0.5, resil: 0.6, vers: 0.4, cdr: 0.3, csd: 1.5, crit: 0.35, haste: 0.3 };
const SEC_SOFT_FRAC = 0.5;   // soft cap sits at half the hard cap
const SEC_TAIL = 50;         // tail width: how slowly the hard cap is approached beyond it

// Effective rating after diminishing returns.
const secEffectiveRating = (stat, r) => {
  const cap = SEC_CAP[stat], rate = SEC_RATE[stat];
  if (!cap || !rate || r <= 0) return 0;
  const hard = cap / rate, soft = hard * SEC_SOFT_FRAC;
  if (r <= soft) return r;
  return soft + (hard - soft) * (r - soft) / ((r - soft) + SEC_TAIL);
};
const secPct = (stat, r) => secEffectiveRating(stat, r) * SEC_RATE[stat];

const secondaryPcts = (eff) => ({
  leech: secPct("leech", eff.leech || 0) * LEECH_MULT,  // % of damage dealt returned as healing
  resil: secPct("resil", eff.resil || 0),   // % reduction to DoT damage AND % chance to resist stun/slow
  vers: secPct("vers", eff.vers || 0),      // % more damage dealt; and (half that) reduces auto-attack damage taken
  cdr: secPct("cdr", eff.cdr || 0),         // % skill cooldown reduction
  csd: secPct("csd", eff.csd || 0),         // % bonus critical strike damage
  crit: secPct("crit", eff.crit || 0),      // % critical strike CHANCE from gear
  haste: secPct("haste", eff.haste || 0),   // % faster attacks; also shortens the group GCD
});
const critMultFor = (char) => 1.8 + secondaryPcts(effectiveStats(char)).csd / 100;
// Heals crit, on the same chance and multiplier as damage. Before this, crit chance and crit
// damage were worth exactly nothing to a healer — they had no way to convert either stat into
// output, so half of every gear roll was dead for them while a dps got full value.
const critHeal = (char, amount) => {
  const crit = rng() < Math.min(1, critChanceFor(char));
  return { amount: crit ? Math.round(amount * critMultFor(char)) : Math.round(amount), crit };
};
const cdrPerCdOf = (char) => socketedGems(char).reduce((n, g) => n + (g.cdrPerCd || 0), 0);
const PET = { interval: 2000, hitFrac: 1.8, hpFrac: 0.40, resummonMs: 15000, snipe: 0.25, empower: 0.5, empowerMs: 10000 };
const petMaxHp = (char) => Math.max(1, Math.round(maxHpFor(char) * PET.hpFrac));
const petHitDamage = (char) => Math.max(1, Math.round(PET.hitFrac * playerBaseDamage(char, false)));
const petDps = (char) => (petHitDamage(char) * (1 + critChanceFor(char) * (critMultFor(char) - 1))) / (PET.interval / 1000);
const cdrPerDebuffOf = (char) => talentFlag(char, "cdrPerDebuff") ? 0.10 : 0;
const enemyDebuffCount = (battle, now) => (battle?.enemyEffects || []).filter((e) => (e.kind === "dot" || e.kind === "slow") && (!e.expires || e.expires > now)).length;
const skillsOnCd = (char, battle, now) => {
  const cds = battle?.cooldowns || {};
  return skillPool(char).reduce((n, sk) => n + ((cds[sk.name] || 0) > now ? 1 : 0), 0);
};
const cdrFracFor = (char, battle, now) => {
  const capped = Math.min(0.9, secondaryPcts(effectiveStats(char)).cdr / 100 + talentMods(char).cdr);
  const per = cdrPerCdOf(char); const perDbf = cdrPerDebuffOf(char);
  if ((!per && !perDbf) || !battle) return capped;
  const n = now ?? Date.now();
  let bonus = per * skillsOnCd(char, battle, n); // uncapped, stacks past 90%
  if (perDbf) bonus += Math.min(0.50, perDbf * enemyDebuffCount(battle, n)); // Beastmaster: +10%/debuff, capped +50%
  return Math.min(0.99, capped + bonus); // 0.99 guard keeps cooldowns from hitting zero
};
const offlinePlayerDps = (char) => {
  const physBase = playerBaseDamage(char, false);
  const magicBase = playerBaseDamage(char, true);
  const tm = talentMods(char);
  const critFactor = 1 + critChanceFor(char) * (critMultFor(char) - 1); // crits deal critMult (1.8x + CSD)
  const autoBase = (talentFlag(char, "intAuto") ? magicBase : physBase) * (1 + tm.autoPct); // Spellsword/Demon Int autos, Exiled/Hexer autoPct
  let dps = (autoBase * critFactor * Math.max(0.1, 1 + agiAtkSpeed(char) + tm.atkSpeed + hasteOf(char))) / (PLAYER_BASE_INTERVAL / 1000);
  const hexStacked = talentFlag(char, "hexStack") ? hexStackMult(3.5) : 1; // Curseweaver: afflictions sit around 3-4 stacks once maintained
  let dotPool = 0, detonator = null;
  if (!talentFlag(char, "noSkills")) for (const name of (char.selectedSkills || []).slice(0, unlockedSlotCount(char.level))) {
    const sk = skillByName(char, name); if (!sk) continue;
    if (talentFlag(char, "noMagic") && isMagicSkill(sk)) continue;
    const owned = char.autoSkillsOwned?.[sk.name];
    const on = char.autoSkills?.[sk.name];
    if (!owned || !on || !sk.cd) continue;
    const sbase = (isMagicSkill(sk) || talentFlag(char, "skillsInt")) ? magicBase : physBase; // magic → Int, physical → Str
    if (sk.detonate) { detonator = { sk, sbase }; continue; } // scored after the affliction pool is known
    const potf = 1 + tm.skillPot + skillModPotency(char, sk.name);
    const instant = (sk.mult || 0) * (sk.hits || 1) * potf * critFactor; // instant hits can crit
    const dot = (sk.dotMult || 0) * potf * hexStacked + (sk.snakeVenom ? sk.snakeVenom * 0.9 : 0); // Snake Trap: N venom stacks ≈ 0.9× base each
    const perCast = (instant + dot) * (talentFlag(char, "wildstrike") ? 0.55 : 1); // Wild Striker: 45% of skill casts miss
    const cd = Math.max(0.5, sk.cd * (1 - cdrFracFor(char)) * (hasSkillModEffect(char, sk.name, "ms_cdr") ? 0.75 : 1) + (tm.skillCd || 0) - gemFlatCd(char));
    if (sk.dotMult) dotPool += (sk.dotMult || 0) * potf * hexStacked * sbase; // affliction value a detonation can consume
    if (perCast > 0) dps += (perCast * sbase) / cd;
  }
  if (detonator && dotPool > 0) { // consuming afflictions trades their remaining ticks for an instant burst
    const dcd = Math.max(0.5, detonator.sk.cd * (1 - cdrFracFor(char)) + (tm.skillCd || 0) - gemFlatCd(char));
    dps += ((detonator.sk.detonate - 1) * 0.5 * dotPool) / dcd; // net gain over letting them tick out
  }
  if (talentFlag(char, "beastPet")) dps += petDps(char); // Savage Companion contributes while alive (offline assumes uptime)
  return Math.max(1, dps);
};
const BOT_TIERS = {
  new:         { key: "new",         label: "New",         hp: 0.85, dmg: 0.72, cast: 0.80 },
  experienced: { key: "experienced", label: "Experienced", hp: 1.00, dmg: 1.00, cast: 1.00 },
  expert:      { key: "expert",      label: "Expert",      hp: 1.12, dmg: 1.28, cast: 1.35 },
};
const PVP_TOUGHNESS = 0.25;
const PVP_SKILL_CUT = 0.60;
const PVP_SKILL_MULT = (1 - PVP_TOUGHNESS) * PVP_SKILL_CUT;
// Resource check. This gates BOTH the action bar's enabled state and the server's
// resolveIntent, so it has to agree with what applySkillCore will actually do.
//
// It only looked at `spend` (8 skills) and ignored `cost` (17 skills), so a skill you could
// not pay for looked ready, was accepted, ate your tap and then silently did nothing —
// applySkillCore refuses it downstream. That is why a Paladin healer, whose kit spends Aegis,
// found that no skills worked, while a rogue built out of generators found that all of them did.
const botCanAfford = (bc, bw, s) => {
  if (s.spend === "all") return resTotal(bw) > 0;
  if (typeof s.spend === "number") return resTotal(bw) >= s.spend;
  if (typeof s.cost === "number") return resTotal(bw) >= s.cost;
  return true;
};
const chooseBotSkill = (bc, bw, now, tier) => {
  const skills = (bc.selectedSkills || []).map((n) => skillByName(bc, n)).filter(Boolean);
  const ready = skills.filter((s) => (bw.cooldowns[s.name] || 0) <= now && botCanAfford(bc, bw, s));
  if (!ready.length) return null;
  if (tier.key === "new" && rng() < 0.4) return null;            // new players hesitate / clip the GCD
  if (tier.key === "experienced" && rng() < 0.12) return null;
  const resMax = (CLASS_RESOURCES[bc.cls] || {}).max || 100;
  const value = (s) => { let v = (s.mult || 0) * (s.hits || 1) + (s.dotMult || 0) * 0.8; if (s.spend && resTotal(bw) > resMax * 0.4) v += 2; if (s.gen && resTotal(bw) < resMax * 0.5) v += 1; return v; };
  if (tier.key === "expert") { ready.sort((a, b) => value(b) - value(a)); return ready[0]; }               // optimal
  if (tier.key === "experienced") { ready.sort((a, b) => value(b) - value(a)); return rng() < 0.7 ? ready[0] : pick(ready); }
  return pick(ready);                                                     // new: whatever's up
};
function applySkillCore(skill, c, bIn, now, log) {
    const maxHp = maxHpFor(c);
    const tm = talentMods(c);
    const hpFrac = (bIn.enemy && bIn.enemy.maxHp > 0) ? bIn.enemy.hp / bIn.enemy.maxHp : 1; // for conditional (execute/opener) talents
    let b = { ...bIn, enemy: { ...bIn.enemy }, cooldowns: { ...(bIn.cooldowns || {}), [skill.name]: now + Math.max(500, skill.cd * 1000 * (1 - cdrFracFor(c, bIn, now)) * (hasSkillModEffect(c, skill.name, "ms_cdr") ? 0.75 : 1) + (tm.skillCd || 0) * 1000 - gemFlatCd(c) * 1000) }, playerEffects: [...(bIn.playerEffects || [])], enemyEffects: [...(bIn.enemyEffects || [])] };
    const base = playerBaseDamage(c, isMagicSkill(skill) || talentFlag(c, "skillsInt")) * empowerMultOf(bIn.playerEffects) * (bIn.pvp ? PVP_SKILL_MULT : 1) * (!(isMagicSkill(skill) || talentFlag(c, "skillsInt")) ? physBuffMultOf(bIn.playerEffects) : 1); // Justice: all skills scale from Int; empower buffs boost damage; PvP applies the skill cut; Spellbreaker boosts physical
    // ---- class resource: pay costs, spend, and generate ----
    const RES = classResource(c.cls);
    b.resQ = [...(b.resQ || [])];
    resExpire(b, now); // volatile: drop anything that timed out before this cast
    let spent = 0;
    if (skill.cost) { if (resTotal(b) < skill.cost) { log(`${skill.icon} Not enough ${RES.name} (${Math.floor(resTotal(b))}/${skill.cost})`, "#888"); return { battle: bIn, died: false }; } resTake(b, skill.cost); }
    if (skill.spend === "all") spent = resTake(b, resTotal(b));
    if (skill.gen) resAdd(b, skill.gen, RES.max, now);
    resSync(b);
    if (spent > 0) log(`${RES.icon} ${skill.name} consumes ${Math.floor(spent)} ${RES.name}`, RES.color);
    let dealt = 0;
    if (talentFlag(c, "wildstrike") && rng() < 0.45) { log(`${skill.icon} ${skill.name} missed!`, "#cc6644"); return { battle: b, died: false }; } // Wild Striker
    if (skill.mult && skill.mult > 0) {
      let potMult = skill.mult * (1 + tm.skillPot + skillModPotency(c, skill.name));
      if (spent > 0 && skill.spendMult) potMult *= (1 + spent * skill.spendMult); // resource spender payoff
      if (talentFlag(c, "execute30") && hpFrac <= 0.30) potMult *= 1.15; // Assassin — bonus vs low-HP targets
      if (talentFlag(c, "wildmagic") && isMagicSkill(skill) && rng() < 0.30) { potMult *= 2; log("🎲 Wild Magic double-cast!", "#c08bff"); } // Wild Magic
      potMult *= talentSkillMult(c, skill, hpFrac); // spec offensive talents (conditional/staple hooks)
      const hits = (skill.hits || 1) + (spent > 0 && skill.spendHits ? Math.round(spent * skill.spendHits) : 0); // combo-point finisher
      const dotDur = talentDotDur(c); // Corruptor 3s / Hexer 2s — deliver skill damage over time
      const critBonus = hasSkillModEffect(c, skill.name, "ms_crit") ? 0.25 : 0; // Deadly mod
      let overTime = 0;
      for (let i = 0; i < hits; i++) {
        const crit = rng() < Math.min(1, critChanceFor(c) + critBonus);
        let dmg = base * potMult * (0.9 + rng() * 0.2) * (1 + (c.cls === "hunter" ? (b.res || 0) * MARK_DMG_PER_STACK : 0)); if (crit) dmg *= critMultFor(c); // hunter Marks amplify
        dmg = Math.max(1, Math.floor(dmg));
        if (dotDur > 0) { overTime += dmg; }
        else {
          b.enemy.hp = Math.max(0, b.enemy.hp - dmg); dealt += dmg;
          log(`${skill.icon} ${skill.name}: ${dmg}${crit ? " ⚡" : ""}`, crit ? "#FFD700" : "#c08bff");
          if (b.enemy.hp <= 0) break;
        }
      }
      if (dotDur > 0 && overTime > 0) {
        const per = Math.max(1, Math.floor(overTime / dotDur));
        b.enemyEffects = b.enemyEffects.filter((e) => !(e.kind === "dot" && e.talent && e.name === skill.name));
        b.enemyEffects.push({ kind: "dot", talent: true, name: skill.name, icon: skill.icon || "☠️", dmgPerTick: per, nextTick: now + 1000, expires: now + dotDur * 1000 + 900, dur: dotDur * 1000 + 900 });
        log(`${skill.icon} ${skill.name} — ${per}/s over ${dotDur}s`, "#c08bff");
      }
    }
    if (skill.lifesteal && dealt > 0) { b.hp = Math.min(maxHp, b.hp + dealt); log(`✟ ${skill.name} heals ${dealt}`, "#7CFC9E"); }
    else if (dealt > 0) { const lp = secondaryPcts(effectiveStats(c)).leech + tm.leech; if (lp > 0) b.hp = Math.min(maxHp, b.hp + Math.floor(dealt * lp / 100)); }
    // ----- Skill-mod breakpoint effects -----
    if (hasSkillModEffect(c, skill.name, "ms_lifesteal") && dealt > 0) { const h = Math.floor(dealt * 0.25); if (h > 0) { b.hp = Math.min(maxHp, b.hp + h); log(`🩸 ${skill.name} heals ${h}`, "#7CFC9E"); } }
    if (hasSkillModEffect(c, skill.name, "ms_stun")) { const ms = (1 + talentCcDur(c)) * 1000; b.enemyEffects = b.enemyEffects.filter((e) => !(e.kind === "slow" && e.name === skill.name + "·stun")); b.enemyEffects.push({ kind: "slow", name: skill.name + "·stun", icon: "💫", pct: 100, expires: now + ms, dur: ms }); log(`💫 ${skill.name} stuns 1s!`, "#c08bff"); }
    if (hasSkillModEffect(c, skill.name, "ms_slow")) { const ms = (2 + talentCcDur(c)) * 1000; b.enemyEffects = b.enemyEffects.filter((e) => !(e.kind === "slow" && e.name === skill.name + "·slow")); b.enemyEffects.push({ kind: "slow", name: skill.name + "·slow", icon: "🐌", pct: 50, expires: now + ms, dur: ms }); }
    if (hasSkillModEffect(c, skill.name, "ms_dodge")) { b.playerEffects = b.playerEffects.filter((e) => e.kind !== "dodge"); b.playerEffects.push({ kind: "dodge", icon: "🌀", pct: 20, expires: now + 3000 * (1 + tm.buffDur) }); log(`🌀 ${skill.name}: +20% dodge`, "#7CFC9E"); }
    if (skill.dotMult) {
      const per = Math.max(1, Math.floor((base * skill.dotMult * (1 + tm.skillPot) * talentSkillMult(c, skill, hpFrac)) / skill.dotDur));
      if (talentFlag(c, "hexStack")) { // Curseweaver: recasting stacks the affliction (max 5) instead of adding a parallel copy
        const ex = b.enemyEffects.find((e) => e.kind === "dot" && e.name === skill.name);
        const st = Math.min(HEX_MAX_STACKS, ((ex && ex.stacks) || 0) + 1);
        b.enemyEffects = b.enemyEffects.filter((e) => !(e.kind === "dot" && e.name === skill.name));
        b.enemyEffects.push({ kind: "dot", name: skill.name, icon: skill.dotIcon || "☠️", stacks: st, basePerTick: per, dmgPerTick: Math.max(1, Math.floor(per * hexStackMult(st))), nextTick: now + 1000, expires: now + skill.dotDur * 1000, dur: skill.dotDur * 1000 });
        log(`${skill.icon} ${skill.name} ×${st} — ${Math.max(1, Math.floor(per * hexStackMult(st)))}/s`, "#c08bff");
      } else {
        b.enemyEffects.push({ kind: "dot", name: skill.name, icon: skill.dotIcon || "☠️", dmgPerTick: per, nextTick: now + 1000, expires: now + skill.dotDur * 1000, dur: skill.dotDur * 1000 });
        log(`${skill.icon} ${skill.name} — ${per}/s for ${skill.dotDur}s`, "#c08bff");
      }
    }
    if (skill.detonate) { // Curseweaver: consume every affliction for a burst of their remaining damage
      const dots = b.enemyEffects.filter((e) => e.kind === "dot");
      if (!dots.length) { log(`${skill.icon} No afflictions to detonate`, "#888"); }
      else {
        let remaining = 0;
        for (const d of dots) remaining += (d.dmgPerTick || 0) * Math.max(0, (d.expires - now) / 1000);
        const burst = Math.max(1, Math.floor(remaining * skill.detonate));
        b.enemyEffects = b.enemyEffects.filter((e) => e.kind !== "dot");
        b.enemy.hp = Math.max(0, b.enemy.hp - burst); dealt += burst;
        log(`💥 ${skill.name} detonates ${dots.length} affliction${dots.length > 1 ? "s" : ""} — ${burst}!`, "#ff8844");
      }
    }
    if (skill.snakeVenom) { const per = Math.max(1, Math.floor(base * 0.9 / 8)); for (let i = 0; i < skill.snakeVenom; i++) { const nm = "Venom " + (i + 1); b.enemyEffects = b.enemyEffects.filter((e) => !(e.kind === "dot" && e.name === nm)); b.enemyEffects.push({ kind: "dot", name: nm, icon: "🐍", dmgPerTick: per, nextTick: now + 1000, expires: now + 8000, dur: 8000 }); } log(`🐍 ${skill.name} — ${skill.snakeVenom} venom stacks (${per}/s each)`, "#8fd35f"); }
    if (skill.petEmpower && talentFlag(c, "beastPet")) { if (!b.pet) b.pet = { hp: petMaxHp(c), maxHp: petMaxHp(c), nextAt: now + PET.interval, resummonAt: 0 }; b.pet.hp = b.pet.maxHp; b.pet.resummonAt = 0; b.pet.empowerUntil = now + PET.empowerMs; log(`🐺 Savage Companion resummoned & empowered (+${Math.round(PET.empower * 100)}% ${PET.empowerMs / 1000}s)!`, "#e0a955"); }
    if (skill.slowPct) { const isStun = skill.slowPct >= 100; const drf = drFactor(b, "enemy", isStun ? "stun" : "slow"); if (drf <= 0) { log(`🛡️ ${b.enemy.name} is immune to more ${isStun ? "stuns" : "slows"}`, "#8ec5ff"); } else { const ccSec = (skill.slowDur + talentCcDur(c)) * drf; const ccMs = ccSec * 1000; b.enemyEffects = b.enemyEffects.filter((e) => !(e.kind === "slow" && e.name === skill.name)); b.enemyEffects.push({ kind: "slow", name: skill.name, icon: isStun ? "💫" : "🐌", pct: isStun ? 100 : Math.round(skill.slowPct * drf), expires: now + ccMs, dur: ccMs }); log(`${skill.icon} ${skill.name}: target ${isStun ? "stunned" : "slowed"} ${ccSec.toFixed(1)}s`, "#c08bff"); } }
    if (skill.hastePct) { b.playerEffects = b.playerEffects.filter((e) => e.kind !== "haste"); b.playerEffects.push({ kind: "haste", icon: "⚡", pct: skill.hastePct, expires: now + skill.hasteDur * 1000 * (1 + tm.buffDur) }); log(`${skill.icon} +${skill.hastePct}% attack speed`, "#7CFC9E"); }
    if (skill.dodgePct) { b.playerEffects = b.playerEffects.filter((e) => e.kind !== "dodge"); b.playerEffects.push({ kind: "dodge", icon: "🌀", pct: skill.dodgePct, expires: now + skill.dodgeDur * 1000 * (1 + tm.buffDur) }); log(`${skill.icon} ${skill.dodgePct}% dodge ${skill.dodgeDur}s`, "#7CFC9E"); }
    if (skill.healPct) {
      const healPct = skill.healPct + (spent > 0 && skill.spendHeal ? spent * skill.spendHeal : 0); // combo-point heal finisher
      const hr = critHeal(c, maxHp * healPct / 100);
      b.hp = Math.min(maxHp, b.hp + hr.amount);
      log(`${skill.icon} Healed ${hr.amount}${hr.crit ? " ⚡" : ""}`, hr.crit ? "#FFD700" : "#7CFC9E");
    }
    if (skill.hotPct) { const per = Math.max(1, Math.floor((maxHp * skill.hotPct / 100) / skill.hotDur)); b.playerEffects = b.playerEffects.filter((e) => e.kind !== "hot"); b.playerEffects.push({ kind: "hot", icon: "➕", healPerTick: per, nextTick: now + 1000, expires: now + skill.hotDur * 1000 }); log(`${skill.icon} Healing ${per}/s for ${skill.hotDur}s`, "#7CFC9E"); }
    if (skill.empowerPct) { const d = skill.empowerDur + (spent > 0 && skill.spendDur ? spent * skill.spendDur : 0); b.playerEffects = b.playerEffects.filter((e) => e.kind !== "empower"); b.playerEffects.push({ kind: "empower", icon: "💥", pct: skill.empowerPct, expires: now + d * 1000 * (1 + tm.buffDur) }); log(`${skill.icon} +${skill.empowerPct}% damage ${d.toFixed(0)}s`, "#7CFC9E"); }
    if (skill.wardPct) { const d = skill.wardDur + (spent > 0 && skill.spendDur ? spent * skill.spendDur : 0); b.playerEffects = b.playerEffects.filter((e) => e.kind !== "ward"); b.playerEffects.push({ kind: "ward", icon: "🛡️", pct: skill.wardPct, expires: now + d * 1000 * (1 + tm.buffDur) }); log(`${skill.icon} −${skill.wardPct}% damage taken ${d.toFixed(0)}s`, "#7CFC9E"); }
    if (skill.cleanse) { const n = b.playerEffects.filter(isPlayerDebuff).length; b.playerEffects = b.playerEffects.filter((e) => !isPlayerDebuff(e)); log(n ? `${skill.icon} ${skill.name} clears ${n} debuff${n > 1 ? "s" : ""}!` : `${skill.icon} ${skill.name}: nothing to cleanse`, "#7CFC9E"); }
    return { battle: b, died: b.enemy.hp <= 0 };
}
// Group-encounter balance.
//   estCal  scales boss HEALTH (boss hp = grpEstDps * dur). The ~60s calibration pushed this
//           to 24, which produced health pools that read as absurd in play — parked back at 1.
//   dmg     boss outgoing damage, i.e. how fast the PARTY dies. Left at the calibrated 0.28:
//           bots are now built at the encounter's own item level rather than as fixed epic
//           60s, and at the original 1.9 that party is killed on every piece of content
//           before it can finish anything. This is time-to-die, not time-to-kill.
//   healCoeff  healer throughput, kept above 1 because the only real heal in the game
//           (Mending Touch) is on a 90s cooldown, so sustain is otherwise almost nil.
const GRP = { estCal: 1, gcd: 1300, enemyAuto: 1500, threatTank: 2.6, threatDps: 1.0, threatHeal: 0.5, healCoeff: 1.6, resKick: 0, dmg: 0.28 };
const healPowerOf = (char) => Math.round(maxHpFor(char) * GRP.healCoeff);
// The skill fields the GROUP engine reads. Inert in solo play except their `mult` damage:
//   heal: <frac>        single-target ally heal, fraction of the caster's healing power
//   healAoe: <frac>     heals the whole party
//   hot / hotDur        heal-over-time
//   offheal: <frac>     minor party heal (support)
//   threatMult: <x>     multiplies threat generated by this cast (tank threat)
//   taunt: true         forces enemies to target the caster
//   interrupt: true     cancels an enemy's active cast
//   partyHastePct/Dur, partyWardPct/Dur, partyEmpowerPct/Dur   raid-wide buffs
//
// Group-combat role predicates. Skills come in TWO shapes and both are real:
//   class skills  use percentages — healPct: 50, hotPct: 28 (total across hotDur)
//   spec skills   use fractions   — heal: 0.55, offheal, healAoe, hot: 0.1 (PER SECOND)
// An earlier pass keyed only on the percentage forms, because the spec skills lived in
// App.jsx and were missing from the core's table entirely. Now that both are here, these
// must accept both or a Paladin's Holy Light and Beacon of Light stop working.
const skHealFrac = (s) => !s ? 0 : (s.heal || 0) + (s.offheal || 0) + (s.healPct || 0) / 100;
const skHotPerSec = (s) => !s ? 0 : (s.hot || 0) + ((s.hotPct || 0) / 100) / (s.hotDur || 12);
const skIsHeal = (s) => skHealFrac(s) > 0;
const skIsHot = (s) => skHotPerSec(s) > 0;
const skIsCleanse = (s) => !!s && !!s.cleanse;
const skIsAoeHeal = (s) => !!s && !!s.healAoe;
const skIsTaunt = (s) => !!s && !!s.taunt;                 // Challenging Shout, Hand of Authority
const skIsInterrupt = (s) => !!s && !!s.interrupt;         // Counterspell, Disrupting Shot
const skIsDef = (s) => !!s && !!s.wardPct;
// Genuine PARTY buffs only. empowerPct / hastePct are self-buffs on ordinary class skills and
// are applied by applySkillCore; treating them as raid cooldowns would hand 30-odd skills a
// party-wide effect they were never written to have.
const skIsPartyBuff = (s) => !!s && !!(s.partyHastePct || s.partyWardPct || s.partyEmpowerPct);
const skThreatMult = (s) => (s && s.threatMult) || 1;
const roleThreatBase = (role) => role === "tank" ? GRP.threatTank : role === "healer" ? GRP.threatHeal : role === "support" ? 0.7 : GRP.threatDps;
const grpSkills = (ally) => (ally.char.selectedSkills || []).map((n) => skillByName(ally.char, n)).filter(Boolean);
const grpReady = (ally, s, now) => s && (ally.bw.cooldowns[s.name] || 0) <= now && botCanAfford(ally.char, ally.bw, s);
const grpInjured = (allies) => allies.filter((a) => !a.down).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || null;
const grpPrimaryEnemy = (st) => st.enemies.filter((e) => e.hp > 0).sort((a, b) => (b.isBoss ? 1 : 0) - (a.isBoss ? 1 : 0) || b.maxHp - a.maxHp)[0] || null;
const grpTopThreat = (st, en) => { let best = null, bv = -1; for (const a of st.allies) { if (a.down) continue; const t = en.threat[a.id] || 0; if (t > bv) { bv = t; best = a.id; } } return best || (st.allies.find((a) => !a.down) || {}).id || null; };
const grpAddThreat = (en, allyId, amt) => { en.threat[allyId] = (en.threat[allyId] || 0) + Math.max(0, amt); };
// Boss HP is grpEstDps * dur, so this estimate IS the difficulty dial. offlinePlayerDps
// is an idle-throughput figure and badly under-counts a party actually using its rotation
// through applySkillCore, which is why encounters were resolving in a sixth of their target
// duration. estCal corrects the estimate to observed in-combat damage.
const grpEstDps = (allies) => GRP.estCal * allies.reduce((s, a) => s + Math.round(offlinePlayerDps(a.char)) * (a.role === "dps" ? 1 : a.role === "support" ? 0.55 : a.role === "tank" ? 0.5 : 0.2), 0);
const mkAlly = (char, role, tier, isHuman, id) => ({ id, name: char.name, char, role, tier: tier || BOT_TIERS.experienced, isHuman: !!isHuman, hp: maxHpFor(char), maxHp: maxHpFor(char), down: false, nextGcd: 0, hots: [], debuffs: [], bw: { enemy: { hp: 0, maxHp: 0, level: char.level }, hp: maxHpFor(char), maxHp: maxHpFor(char), playerEffects: [], enemyEffects: [], cooldowns: {}, res: 0, resQ: [], shardTicks: 0 } });
const ADD_ABILITIES = [{ kind: "auto", everyMs: 1600, dmgMult: 0.8 }];
const BOSS_DEFS = {
  ashen: { id: "ashen", name: "The Ashen Warden", level: 62, dur: 70, desc: "A teaching fight: interrupt its Cataclysm, mitigate the tank-buster, heal through Cinders — miss one and it's a wipe.", abilities: [
    { kind: "auto", everyMs: 1500, dmgMult: 1.1 },
    { kind: "tankbuster", name: "Crushing Blow", everyMs: 15000, first: 9000, dmgMult: 9.0 },
    { kind: "raidcast", name: "Cataclysm", everyMs: 13000, first: 12000, castMs: 2400, dmgMult: 9.5 },
    { kind: "raidtick", name: "Cinders", everyMs: 7000, first: 6500, dmgMult: 1.3 },
  ] },
  molten: { id: "molten", name: "Molten Colossus", level: 63, dur: 44, desc: "Adds pour in and it enrages — a threat & DPS check. Tank must pick up Lava Spawns or they cut down the party.", abilities: [
    { kind: "auto", everyMs: 1400, dmgMult: 1.15 },
    { kind: "tankbuster", name: "Magma Fist", everyMs: 14000, first: 8000, dmgMult: 9.0 },
    { kind: "summon", name: "Lava Spawn", everyMs: 21000, first: 15000, count: 1 },
    { kind: "raidtick", name: "Heat Wave", everyMs: 8000, first: 7000, dmgMult: 1.4 },
    { kind: "enrage", name: "Overheat", first: 82000 },
  ] },
  harbinger: { id: "harbinger", name: "The Harbinger", level: 64, dur: 82, desc: "Void Nova must be interrupted, Curse of Shadow cleansed, Shadow Bolts spot-healed — a hard mechanic check.", abilities: [
    { kind: "auto", everyMs: 1500, dmgMult: 1.1 },
    { kind: "raidcast", name: "Void Nova", everyMs: 11000, first: 9000, castMs: 2200, dmgMult: 9.5 },
    { kind: "spike", name: "Shadow Bolt", everyMs: 5000, first: 5000, dmgMult: 5.0 },
    { kind: "debuff", name: "Curse of Shadow", icon: "🌑", everyMs: 14000, first: 10000, tickMult: 0.8, dur: 10 },
    { kind: "tankbuster", name: "Rend", everyMs: 16000, first: 12000, dmgMult: 8.5 },
    { kind: "enrage", name: "Collapse", first: 76000 },
  ] },
};
const mkEncEnemy = (def, allies, id, isAdd) => {
  const lvl = def.level || 62; const base = Math.round(enemyDamageForLevel(lvl) * GRP.dmg); const dur = def.dur || 70;
  const hp = isAdd ? Math.max(1200, Math.round(grpEstDps(allies) * 10)) : Math.max(4000, Math.round(grpEstDps(allies) * dur));
  const abilities = (def.abilities || ADD_ABILITIES).map((ab) => ({ ...ab, nextAt: ab.first != null ? ab.first : (ab.everyMs || 3000) }));
  return { id, name: def.name || (isAdd ? "Add" : "Boss"), level: lvl, base, hp, maxHp: hp, isBoss: !isAdd, isAdd: !!isAdd, threat: {}, targetId: null, castBar: null, abilities, enraged: false, enrageStart: 0, enrageMult: 1 };
};
const allyById = (st, id) => st.allies.find((a) => a.id === id && !a.down);
const grpAdds = (st) => st.enemies.filter((e) => e.hp > 0 && e.isAdd);
const grpIncoming = (st, now) => { let raidSoon = false, busterSoon = false; for (const en of st.enemies) { if (en.hp <= 0) continue; if (en.castBar && en.castBar.interruptible && en.castBar.endsAt - now < 1600) raidSoon = true; for (const ab of en.abilities || []) { if (ab.kind === "raidtick" && ab.nextAt - now < 1200) raidSoon = true; if (ab.kind === "tankbuster" && ab.nextAt - now < 2200) busterSoon = true; } } return { raidSoon, busterSoon }; };
// ---------- character + loot construction (Stage 5 extraction) ----------
const HUNTER_WEAPONS = ["Longbow", "Recurve Bow", "Hunting Bow", "Heavy Crossbow"];
const specSkillNames = (id) => SPEC_SKILLS[id] || [];
const specClassOf = (id) => { for (const cid in TALENT_L60) if ((TALENT_L60[cid] || []).some((x) => x.id === id)) return cid; return null; };
const SPEC_MIGRATIONS = { p_king: "p_prot" };
const TRINITY_FILL = { tank: ["warrior", "w_prot"], healer: ["paladin", "p_holy"], support: ["mage", "m_support"], dps: ["rogue", "r_ambush"] };
// Generation (bot tiers, item stats, affixes) now draws from the seeded rng() rather than
// Math.random. rng() falls back to Math.random outside withRng, so ordinary play is unchanged
// byte for byte; inside a seeded scope it makes bot and loot construction reproducible, which
// is what lets the determinism harness build the same party every run.
const botTier = (rating) => {
  const r = rating || 1500;
  const weights = r < 1400 ? [["new", 0.45], ["experienced", 0.45], ["expert", 0.10]]
    : r < 1900 ? [["new", 0.15], ["experienced", 0.60], ["expert", 0.25]]
    : [["new", 0.05], ["experienced", 0.35], ["expert", 0.60]];
  let x = rng(), acc = 0;
  for (const [k, w] of weights) { acc += w; if (x <= acc) return BOT_TIERS[k]; }
  return BOT_TIERS.experienced;
};
const buildBotChar = (cls, spec, level, ilvl) => {
  const bc = createCharacter("BotRef", cls, "human");
  bc.level = level || 60;
  if (spec) {
    bc.spec = spec;
    // Say outright that a bot runs its spec's kit. createCharacter seeds selectedSkills with a
    // single basic skill, and normalizeChar rightly treats whatever is there as a deliberate
    // choice — so without this a bot spent slot 1 on that starter skill and lost its fifth
    // signature ability, which for a tank is Shield Wall and for a healer is Aegis of Light.
    bc.selectedSkills = [...specSkillNames(spec)];
  }
  const eq = { ...emptyEquipment() };
  for (const s of LOOT_SLOTS) eq[s.id] = generateItem(Math.max(1, ilvl || 60), rarityById("epic"), s.id, cls);
  bc.equipment = eq;
  return normalizeChar(bc);
};
const mainStatsOf = (item) => { const st = (item && item.stats) || {}; return MAIN_KEYS.filter((k) => (st[k] || 0) > 0); };
const migrateItem = (it) => {
  if (!it || !it.slotId) return it;
  if (it.slotId === "relic" || it.relicId) return it; // relics have no ilvl/armor to back-fill
  const ri = Math.max(0, RARITIES.findIndex((r) => r.id === it.rarity));
  // Bring older gear onto the naming contract: suffix + mains always match the real stats.
  const mains = mainStatsOf(it);
  const renamed = { ...it, mains, name: nameWithSuffix(it.name, mains) };
  if (it.slotId === "weapon") return { ...renamed, wdmg: weaponRangeFor(it.ilvl, ri) }; // recompute so weapon-damage tuning applies to existing weapons
  const ba = baseArmorFor(it.ilvl, ri, it.slotId);
  return ((renamed.stats && renamed.stats.armor) || 0) >= ba ? renamed : { ...renamed, stats: { ...renamed.stats, armor: ba } };
};
const padSelectedSkills = (char, list) => {
  const cap = unlockedSlotCount(char.level);
  const out = [];
  for (const n of (list || [])) { if (out.length >= cap) break; if (skillByName(char, n) && !out.includes(n)) out.push(n); } // keep valid, de-duplicated, in order
  for (const sk of (SKILLS[char.cls] || [])) { if (out.length >= cap) break; if (sk.spec && char.spec !== sk.spec) continue; if (!out.includes(sk.name)) out.push(sk.name); }
  return out;
};
const SPEC_SKILLS = {
  // Warrior
  w_berserk:  ["Frenzied Onslaught", "Bloodletting Roar", "Reckless Abandon"],
  w_champion: ["Cataclysm Slam", "Warbringer", "Unbreakable Momentum"],
  w_antimage: ["Spell Reflection", "Runic Cleave", "Bulwark Vengeance"],
  // Mage
  m_wild:  ["Arcane Surge", "Mana Rupture", "Overcharged Nova"],
  m_trick: ["Glacial Chains", "Frozen Orb", "Winter's Bite"],
  m_sword: ["Runeblade Strike", "Blade Cadence", "Arcane Riposte"],
  // Rogue
  r_ambush: ["Cold Open", "Killing Intent", "Throat Slit"],
  r_corr:   ["Virulent Blades", "Festering Wounds", "Toxic Bloom"],
  r_wild:   ["Relentless Flurry", "Fleetblade", "Twin Daggers"],
  // Paladin
  p_just:  ["Verdict of Flame", "Sanctified Zeal", "Judgment Beam"],
  p_king:  ["Aegis Overflow", "Consecrated Ground", "Retribution Wall"],
  p_exile: ["Zealot's Flurry", "Righteous Momentum", "Executioner's Verdict"],
  // Hunter
  h_snipe: ["Steady Aim", "Piercing Focus", "Deadeye Shot"],
  h_trap:  ["Savage Companion", "Snake Trap", "Venomous Companion"],
  h_range: ["Rapid Volley", "Hunter's Rhythm", "Twin Shot"],
  // Warlock
  l_scorch: ["Chaos Bolt", "Immolation Burst", "Cataclysm"],
  l_hex:    ["Unstable Affliction", "Corruption Spread", "Soul Harvest", "Soul Detonation"],
  l_demon:  ["Summon Fiend", "Demonic Empowerment", "Soul Link"],
  // ---- Group-role specs (Phase 1) ----
  w_prot:     ["Shield Slam", "Challenging Shout", "Thunder Clap", "Last Stand", "Shield Wall"],       // Warrior · Tank
  p_holy:     ["Holy Light", "Divine Radiance", "Beacon of Light", "Cleanse", "Aegis of Light"], // Paladin · Healer (Holy Smite available to swap in)
  p_prot:     ["Shield of the Righteous", "Hand of Authority", "Consecration", "Guardian's Bulwark", "Ardent Defender"], // Paladin · Tank
  m_support:  ["Counterspell", "Temporal Surge", "Arcane Ward", "Arcane Barrage", "Dampen Magic"],   // Mage · Support
  h_support:  ["Disrupting Shot", "Rallying Anthem", "Mending Volley", "Aimed Shot", "Warding Cry"], // Hunter · Support
};
const ALL_SPEC_SKILL_NAMES = new Set(Object.values(SPEC_SKILLS).flat());
const migrateSpec = (id) => (id && SPEC_MIGRATIONS[id]) || id;
const STARTER_WEAPON = {
  warrior: "Rusty Shortsword", paladin: "Dented Mace", rogue: "Worn Dagger",
  hunter: "Frayed Shortbow", mage: "Cracked Wand", warlock: "Gnarled Wand",
};
const mkStarter = (slotId, name, stats) => ({ id: uid(), name, slotId, icon: slotById(slotId).icon, rarity: "poor", ilvl: 1, stats: { str: 0, agi: 0, int: 0, sta: 0, armor: 0, dmg: 0, ...stats }, value: 1, enchant: null });
const starterGear = (clsId) => {
  const m = CLASSES.find((c) => c.id === clsId).main; // main combat stat
  const caster = clsId === "mage" || clsId === "warlock";
  const armorName = {
    head: caster ? "Tattered Hood" : "Battered Helm",
    shoulder: caster ? "Frayed Shoulderpads" : "Worn Pauldrons",
    chest: caster ? "Frayed Robe" : "Worn Tunic",
    hands: caster ? "Tattered Gloves" : "Worn Gauntlets",
    legs: caster ? "Frayed Leggings" : "Worn Legguards",
    feet: caster ? "Tattered Sandals" : "Worn Boots",
  };
  const gear = {
    weapon: mkStarter("weapon", STARTER_WEAPON[clsId] || "Worn Weapon", { dmg: 2, [m]: 1 }),
    offhand: mkStarter("offhand", caster ? "Cracked Tome" : "Splintered Buckler", caster ? { [m]: 1, sta: 1 } : { armor: 2, sta: 1 }),
    ring: mkStarter("ring", "Tarnished Band", { [m]: 1, sta: 1 }),
    trinket: mkStarter("trinket", "Cracked Bauble", { [m]: 1, sta: 1 }),
  };
  ["head", "shoulder", "chest", "hands", "legs", "feet"].forEach((slot) => {
    gear[slot] = mkStarter(slot, armorName[slot], { armor: slot === "chest" || slot === "legs" ? 2 : 1, sta: 1 });
  });
  return gear;
};
const PROFESSIONS = [
  { id: "mining", name: "Mining", icon: "⛏️", type: "gathering", color: "#8B7355", desc: "Gather Ore; richer ranks find Rich Ore." },
  { id: "herbalism", name: "Herbalism", icon: "🌿", type: "gathering", color: "#4a7c3f", desc: "Gather Herbs, plus Healing Herbs." },
  { id: "salvage", name: "Salvage", icon: "♻️", type: "gathering", color: "#7d8aa0", desc: "Break down downgrade gear (green+) into Dust." },
  { id: "armorsmith", name: "Armorsmith", icon: "🔨", type: "crafting", color: "#888", desc: "Forge gear from Ore; Rich Ore raises rarity." },
  { id: "alchemy", name: "Alchemy", icon: "⚗️", type: "crafting", color: "#9482C9", desc: "Brew tiered potions Brew Healing Potions from herbs. scrolls from herbs." },
  { id: "enchanting", name: "Enchanting", icon: "✨", type: "crafting", color: "#69CCF0", desc: "Enchant equipped gear with an extra stat (uses Dust)." },
];
const emptyProfessions = () => PROFESSIONS.reduce((m, p) => { m[p.id] = { level: 1, xp: 0, active: false }; return m; }, {});
const SOCKETABLE_SLOTS = ["ring", "trinket"];
const socketCountFor = (rarityId, slotId) => {
  if (rarityId === "artifact") return 3;
  if (!SOCKETABLE_SLOTS.includes(slotId)) return 0;
  return rarityId === "legendary" ? 2 : rarityId === "epic" ? 1 : 0;
};
const emptySockets = (n) => Array.from({ length: n }, () => null);
const uid = () => Math.random().toString(36).slice(2, 10);
const mainKeyOf = (mains) => [...new Set(mains || [])].filter((k) => MAIN_KEYS.includes(k)).sort().join("+");
const suffixByMains = (mains) => MAIN_SUFFIXES.find((x) => mainKeyOf(x.stats) === mainKeyOf(mains)) || null;
const MAIN_SUFFIXES = [
  { stats: ["str"],        name: "of Power",      desc: "+Strength" },
  { stats: ["agi"],        name: "of the Falcon", desc: "+Agility" },
  { stats: ["int"],        name: "of the Owl",    desc: "+Intellect" },
  { stats: ["str", "agi"], name: "of the Wolf",   desc: "+Strength +Agility" },
  { stats: ["str", "int"], name: "of the Dragon", desc: "+Strength +Intellect" },
  { stats: ["agi", "int"], name: "of the Tiger",  desc: "+Agility +Intellect" },
];
const ALL_SUFFIX_NAMES = MAIN_SUFFIXES.map((x) => x.name).concat(["of Power", "of the Tiger", "of the Owl", "of the Bear", "of Slaying", "of the Boar"]);
const POWER_AFFIX_MIN_ILVL = 60;   // focused gear only earns Power at endgame
const POWER_PER_STAT = 1.4;        // damage converts at statVal * 1.4, so this = one extra main stat
// A piece's Power is CONDITIONAL: it only applies while the item still carries exactly one main
// stat once enchants and socketed gems are counted. Stacking MORE of the same stat keeps it active;
// adding a second main stat trades the Power away for breadth. That is the focused-vs-flexible choice.





// Would adding `stat` to this item put its Power dormant? (used to warn before enchant/socket)
const nameWithSuffix = (rawName, mains) => {
  let base = String(rawName || "").trim();
  for (const suf of ALL_SUFFIX_NAMES) { if (base.endsWith(" " + suf)) { base = base.slice(0, -(suf.length + 1)).trim(); break; } }
  const suf = suffixByMains(mains);
  return suf ? `${base} ${suf.name}` : base;
};
const PREFIXES = ["Worn", "Sturdy", "Gleaming", "Burnished", "Fortified", "Runed", "Savage", "Glacial", "Resplendent", "Doomforged", "Ancient", "Bloodforged"];
const ARMOR_BASE_MULT = 2.2;

const WEAPON_DMG_MULT = 5.1; // nerfed 15% from 6
const weaponRangeFor = (ilvl, rarityIdx) => { const avg = gearStatBase(ilvl, rarityIdx) * WEAPON_DMG_MULT; return { min: Math.max(1, Math.round(avg * 0.85)), max: Math.max(2, Math.round(avg * 1.15)) }; };
const ARMOR_SLOT_WEIGHT = { chest: 1.0, legs: 0.9, offhand: 0.9, head: 0.8, shoulder: 0.7, hands: 0.6, feet: 0.6, ring: 0.3, trinket: 0.3 };

// ---------- SLOT IDENTITY ----------
// Which secondaries each slot leans toward. Before this, main stats and secondaries rolled
// identically on every slot and ARMOR_SLOT_WEIGHT was the ONLY thing separating a helm from a
// chest — measured spread across non-weapon slots was x1.03 in damage, i.e. noise. Two favoured
// stats per slot gives each piece a recognisable character.
//
// Every secondary has at least two homes so nothing becomes unfindable, and stamina keeps a floor
// everywhere: confining it to its four favoured slots quietly cost ~7% of a full set's effective
// HP, which is a balance change hiding inside a flavour change.
//
// Shared by BOTH the drop generator and the reroll shop — if only drops used it, a player could
// reroll a chest into pure crit damage and launder the identity straight back out.
const SECONDARY_POOL = ["sta", "leech", "vers", "resil", "cdr", "csd", "crit", "haste"];
// Redistributed once crit and haste joined the pool: eight stats over ten slots, two favoured
// each, so every stat has at least two homes and no slot repeats another's pair.
const SLOT_SECONDARY = {
  head:     ["crit",  "cdr"],    // Precision — land more crits, act more often
  shoulder: ["sta",   "vers"],   // Bulwark-lite
  chest:    ["sta",   "resil"],  // Bulwark — the tankiest plate
  hands:    ["haste", "crit"],   // Aggression — the pure throughput piece
  legs:     ["sta",   "leech"],  // Endurance
  feet:     ["haste", "cdr"],    // Uptime
  weapon:   ["csd",   "crit"],   // Lethality — crit damage wants crit chance beside it
  offhand:  ["resil", "sta"],    // Guard
  ring:     ["csd",   "haste"],  // Attunement
  trinket:  ["leech", "vers"],   // Esoteric
};
const SEC_FAV_WEIGHT = 5;    // a favoured stat is this many times as likely as an ordinary one
const SEC_STA_WEIGHT = 2;    // stamina's floor on slots that do not favour it

// How large one line of a stat rolls, relative to the ilvl/rarity budget. Stamina rolls big
// because it is now favoured on only four slots instead of being biased on all ten: a full set
// carries roughly a third fewer stamina lines than it used to, and without a bigger roll behind
// each one that reads as a silent ~5% EHP cut to every existing character. Measured against a
// full epic set: 1.3 lands within 1% of the old effective health (2313 hp vs 2332), and the
// per-line rounding is coarse enough that 1.35 already overshoots by +1.4%.
// One table, exported — the drop generator and the temper shop both read it. Two copies drifting
// apart is the failure this project keeps having.
const SEC_SIZE = { sta: 1.3, leech: 0.5, vers: 0.5, resil: 0.5, cdr: 0.5, csd: 0.5, crit: 0.5, haste: 0.5 };

const secondaryWeight = (slotId, stat) => {
  const fav = SLOT_SECONDARY[slotId];
  if (fav && fav.includes(stat)) return SEC_FAV_WEIGHT;
  return stat === "sta" ? SEC_STA_WEIGHT : 1;
};

// Weighted pick for one secondary line on a slot. `exclude` keeps a single roll from repeating a
// stat the caller has already placed. Returns null only if everything is excluded.
const pickSlotSecondary = (slotId, exclude = []) => {
  const avail = SECONDARY_POOL.filter((k) => !exclude.includes(k));
  if (!avail.length) return null;
  const w = avail.map((k) => secondaryWeight(slotId, k));
  let r = rng() * w.reduce((a, b) => a + b, 0), i = 0;
  while (r >= w[i] && i < w.length - 1) { r -= w[i]; i++; }
  return avail[i];
};
// ---------- THE ILVL POWER CURVE ----------
// Item power was linear in ilvl: (1 + ilvl * 0.05). That form has a hard ceiling nobody can tune
// around — across ilvl 63 to 70 the ratio is 4.50/4.15 = x1.08, and as the slope goes to infinity
// it only approaches 70/63 = x1.11. So NO linear curve can make the hard-mode climb worth more
// than 11%, however steep it is. Measured: an item gained 54 -> 58 raw stat points across the
// whole ilvl 63-70 arc, an arc that costs 1,250 -> 5,000 kills per zone.
//
// The fix is a geometric term that only exists above the levelling cap, so ilvl 1-60 is bit-for-bit
// unchanged and the climb compounds instead of creeping.
// 1.08 is measured, not chosen by taste. Swept in game-core/ilvl-curve-sim.cjs against the content
// the climb actually gates — a hard zone champion, with the auto-potion a real player carries:
//
//   1.00 (today)  every bracket kills the player.            Hard mode is unplayable solo.
//   1.06          only the last bracket clears.              The climb still buys almost nothing.
//   1.08          dies at ilvl 64-65, clears 66-69.          An arc: hard at the gate, soloable once out-geared.
//   1.10          clears from the entry bracket onward.      No challenge left anywhere.
//
// 1.08 is the only rate that produces a progression arc rather than a wall or a walkover.
const ENDGAME_ILVL_FLOOR = 60;    // levelling gear is untouched
const ENDGAME_ILVL_GROWTH = 1.08; // compounding power per ilvl above the floor
const endgameClimb = (ilvl) =>
  Math.pow(ENDGAME_ILVL_GROWTH, Math.max(0, Math.floor(ilvl || 1) - ENDGAME_ILVL_FLOOR));
const gearStatBase = (ilvl, rarityIdx) =>
  (1 + ilvl * 0.05) * (RARITY_STAT_MULT[rarityIdx] || 1) * endgameClimb(ilvl);
const baseArmorFor = (ilvl, rarityIdx, slotId) => (slotId === "weapon" ? 0 : Math.max(1, Math.round(gearStatBase(ilvl, rarityIdx) * (ARMOR_SLOT_WEIGHT[slotId] || 0.5) * ARMOR_BASE_MULT)));
const RARITY_STAT_MULT = [0.5, 0.8, 1.2, 1.8, 2.6, 3.8, 3.8];
const ITEM_BASES = {
  head: ["Helm", "Coif", "Crown", "Hood", "Greathelm", "Circlet"],
  shoulder: ["Pauldrons", "Mantle", "Spaulders", "Shoulderguards"],
  chest: ["Breastplate", "Tunic", "Robe", "Chestguard", "Hauberk"],
  hands: ["Gauntlets", "Gloves", "Grips", "Handwraps"],
  legs: ["Legplates", "Leggings", "Greaves", "Kilt"],
  feet: ["Boots", "Sabatons", "Treads", "Striders"],
  weapon: ["Blade", "Axe", "Warhammer", "Dagger", "Staff", "Mace", "Greatsword", "Longbow"],
  offhand: ["Shield", "Tome", "Orb", "Bulwark", "Idol"],
  ring: ["Band", "Ring", "Loop", "Seal", "Signet"],
  trinket: ["Charm", "Idol", "Talisman", "Insignia", "Figurine"],
};
const slotById = (id) => GEAR_SLOTS.find((s) => s.id === id);
// Lifted from App.jsx so the SERVER can build bots itself. Bot-fill previously reused a
// fixed reference character, which meant level-60 epic gear in a level-17 dungeon; with
// these here the server rolls a bot's gear at the encounter's own item level.
const RARITIES = [
  { id: "poor", name: "Poor", color: "#9d9d9d", power: 1, valueMult: 0.4, weight: 26 },
  { id: "common", name: "Common", color: "#ffffff", power: 2, valueMult: 1.0, weight: 40 },
  { id: "uncommon", name: "Uncommon", color: "#1eff00", power: 4, valueMult: 3.0, weight: 22 },
  { id: "rare", name: "Rare", color: "#0070dd", power: 7, valueMult: 8.0, weight: 9 },
  { id: "epic", name: "Epic", color: "#a335ee", power: 15, valueMult: 22.0, weight: 2.5 },
  { id: "legendary", name: "Legendary", color: "#ff8000", power: 24, valueMult: 60.0, weight: 0.5 },
  { id: "artifact", name: "Artifact", color: "#c8102e", power: 24, valueMult: 60.0, weight: 0 }, // deep red; never drops — purchased with Ven
];
const rarityById = (id) => RARITIES.find((r) => r.id === id) || RARITIES[1];
const GEAR_SLOTS = [
  { id: "head", name: "Head", icon: "🪖" },
  { id: "shoulder", name: "Shoulder", icon: "🧣" },
  { id: "chest", name: "Chest", icon: "👕" },
  { id: "hands", name: "Hands", icon: "🧤" },
  { id: "legs", name: "Legs", icon: "👖" },
  { id: "feet", name: "Feet", icon: "🥾" },
  { id: "weapon", name: "Weapon", icon: "⚔️" },
  { id: "offhand", name: "Off-hand", icon: "🛡️" },
  { id: "ring", name: "Ring", icon: "💍" },
  { id: "trinket", name: "Trinket", icon: "🔮" },
  { id: "relic", name: "Relic", icon: "🔱" },
];
const LOOT_SLOTS = GEAR_SLOTS.filter((s) => s.id !== "relic");

// How often each slot is the one that drops. Every drop site used to pick uniformly, so a weapon
// — measured at 3.7x the damage value of any armour piece, because it is the only slot carrying a
// damage range rather than a stat spread — was exactly as common as a pair of boots. The slot a
// player actually wants was never the slot they had to chase.
//
// Weights are inverse to how much a slot is worth, softened: pricing weapons at a strict 1/3.7
// would put them under 3% of drops and turn the whole game into waiting for one item. Boots and
// gloves are the filler that keeps a bad session from feeling empty.
const SLOT_DROP_WEIGHT = {
  weapon: 0.4,                                    // ~4% of drops — the chase item
  trinket: 0.7, ring: 0.8,                        // no armour, pure secondaries
  offhand: 1.0,
  head: 1.1, chest: 1.1, legs: 1.1,               // the big armour pieces
  shoulder: 1.2, hands: 1.2, feet: 1.2,           // filler
};
// Zone-scaled drop rate. Gear used to drop at one flat rate everywhere — the level-10 starter
// wood and the level-60 endgame zone both paid out ~18 items per 100 kills — so a solo player's
// gear never got harder to come by, only higher in ilvl. Levelling should stay generous (the
// drops are what makes those zones readable); the endgame is where gear is supposed to be worth
// chasing, so that is where the tap closes.
//
// Linear from the first zone to the last. The raid is deliberately exempt at its own 0.85: it is
// the designed bridge from normal mode to hard mode, and starving it would close the only route
// out of normal mode rather than making the route feel earned.
const ZONE_DROP_MIN = 0.4;      // level-60 zones pay 40% of a level-10 zone's rate
const ZONE_DROP_FLOOR_LEVEL = 10, ZONE_DROP_CAP_LEVEL = 60;
const zoneDropScale = (level) => {
  const t = (Math.max(1, level || 1) - ZONE_DROP_FLOOR_LEVEL) / (ZONE_DROP_CAP_LEVEL - ZONE_DROP_FLOOR_LEVEL);
  return clamp(1 - clamp(t, 0, 1) * (1 - ZONE_DROP_MIN), ZONE_DROP_MIN, 1);
};

// One weighted picker for every drop site. `pick(LOOT_SLOTS)` was repeated at eight call sites
// across the client and the core, which is eight places to forget when scarcity changes.
const pickLootSlot = () => {
  const w = LOOT_SLOTS.map((s) => SLOT_DROP_WEIGHT[s.id] ?? 1);
  let r = rng() * w.reduce((a, b) => a + b, 0), i = 0;
  while (r >= w[i] && i < w.length - 1) { r -= w[i]; i++; }
  return LOOT_SLOTS[i].id;
};
const emptyEquipment = () => GEAR_SLOTS.reduce((acc, s) => { acc[s.id] = null; return acc; }, {});
function generateItem(ilvl, rarity, slotId, clsId) {
  ilvl = Math.max(1, Math.floor(ilvl));
  // Rarity floors: Epic requires ilvl 60+, Legendary requires ilvl 64+ (applies to drops, crafting, and the Auction House)
  if (rarity.id === "legendary" && ilvl < 64) rarity = rarityById(ilvl >= 60 ? "epic" : "rare");
  if (rarity.id === "epic" && ilvl < 60) rarity = rarityById("rare");
  const slot = slotById(slotId);
  let base = pick(ITEM_BASES[slotId] || ["Trinket"]);
  if (slotId === "weapon" && clsId === "hunter") base = pick(HUNTER_WEAPONS);
  const isWeapon = slotId === "weapon";

  const rarityIdx = RARITIES.findIndex((r) => r.id === rarity.id);
  // Dramatically squished values: small numbers, gentle rarity curve. World-zone gear gives
  // modest boosts; notable upgrades come from the higher rarities dropped by dungeons & raids.
  // gearStatBase, not a second copy of it: this line used to restate the ilvl curve inline, so
  // armor and weapon damage moved with the curve and the stats on the item did not.
  const perStat = Math.max(1, Math.round(gearStatBase(ilvl, rarityIdx)));
  const secBase = Math.max(1, Math.round(perStat * 0.7));
  const stats = { str: 0, agi: 0, int: 0, sta: 0, armor: 0, dmg: 0, leech: 0, resil: 0, vers: 0, cdr: 0, csd: 0, crit: 0, haste: 0, ap: 0, sp: 0 };

  // ----- MAIN stats (str/agi/int) -----
  // Always 1 main stat. Purple & Gold have a 50% chance to roll a SECOND main stat, which
  // replaces one secondary slot (rather than being guaranteed). The class scaling is unchanged.
  const BASE_STATS = ["str", "agi", "int"];
  // Any primary stat can drop on any gear — classes no longer gate the main stat.
  const firstMain = pick(BASE_STATS);
  const mainStats = [firstMain];

  // ----- SECONDARY stats (armor is now inherent base Armor; weapon damage is a range) -----
  // White 1, Green 2, Blue 3, Purple 3, Gold 4 (Poor 0) — Purple & Gold each dropped one line.
  let secondaryCount = [0, 1, 2, 3, 3, 4, 4][rarityIdx] ?? 1; // artifact matches legendary

  // Purple & Gold: 50% chance for a 2nd random main stat, replacing one secondary slot
  if (rarityIdx >= 4 && rng() < 0.5) {
    mainStats.push(pick(BASE_STATS.filter((k) => k !== firstMain)));
    secondaryCount = Math.max(0, secondaryCount - 1);
  }
  mainStats.forEach((k) => { stats[k] += perStat; });

  // Secondaries follow the SLOT's identity rather than one flat stamina-favoured roll shared by
  // every slot. Before this, a helm and a chest of the same ilvl were the same item with a
  // different name — nothing about the slot changed what could roll on it. Excluding what is
  // already placed keeps a single piece from stacking the same stat on two lines.
  const chosen = [];
  for (let i = 0; i < secondaryCount; i++) {
    const k = pickSlotSecondary(slotId, chosen);
    if (!k) break;
    chosen.push(k);
  }
  chosen.forEach((k) => { stats[k] += Math.max(1, Math.round(secBase * (SEC_SIZE[k] || 0.5))); });

  // inherent Armor on all non-weapon gear; weapons instead carry a damage range
  if (!isWeapon) stats.armor += baseArmorFor(ilvl, rarityIdx, slotId);
  const wdmg = isWeapon ? weaponRangeFor(ilvl, rarityIdx) : null;

  // ----- POWER AFFIX: focused (single main stat) endgame gear carries flat damage -----
  // Worth exactly one extra main stat (damage converts at statVal * 1.4), so a focused piece is
  // the equal of a dual-stat piece for a build that only uses one stat.
  const mains = MAIN_KEYS.filter((k) => stats[k] > 0);
  let powerKind = null;
  if (mains.length === 1 && ilvl >= POWER_AFFIX_MIN_ILVL) {
    powerKind = mains[0] === "int" ? "sp" : "ap"; // Str/Agi → Attack Power, Int → Spell Power
    stats[powerKind] += Math.max(1, Math.round(perStat * POWER_PER_STAT));
  }

  // ----- name states the main stats outright (see MAIN_SUFFIXES); the prefix flags the Power type -----
  const prefix = powerKind ? (powerKind === "ap" ? "Brutal" : "Arcane") : PREFIXES[clamp(rarityIdx * 2 + Math.floor(rng() * 2), 0, PREFIXES.length - 1)];
  const name = nameWithSuffix(`${prefix} ${base}`, mains);
  const value = Math.max(1, Math.round(ilvl * rarity.valueMult * (0.8 + rng() * 0.4)));

  return { id: uid(), name, slotId, icon: slot.icon, rarity: rarity.id, ilvl, stats, value, enchant: null, wdmg, mains, sockets: emptySockets(socketCountFor(rarity.id, slotId)) };
}
const createCharacter = (name, cls, race) => {
  const c = {
    id: uid(),
    name, cls, race,
    level: 1, xp: 0, gold: 150, kills: 0, bossKills: 0, dungeonClears: 0,
    honor: 0, honorXp: 0, attrPoints: 0, allocated: { str: 0, agi: 0, int: 0, sta: 0 },
    currentZoneId: "elwynn",
    offlineZoneId: null,
    lastActive: Date.now(),
    professions: emptyProfessions(),
    gatherTier: {},
    unlockedSkills: [SKILLS[cls][0].name],
    spec: null,
    talents: {},
    talentChanges: 0,
    skillMods: {},
    specLoadouts: {},
    skillModRefunds: 0,
    hardKills: {}, hardBossKills: {}, hardZoneDone: {}, hardDungeonDone: {},
    gambits: { owned: {}, shards: {}, rules: {}, slots: {}, general: [], generalSlots: 2 },
    gems: {},
    talentTutorialDone: false,
    selectedSkills: [SKILLS[cls][0].name],
    stats: { ...CLASSES.find((c) => c.id === cls).stats },
    equipment: { ...emptyEquipment(), ...starterGear(cls) },
    inventory: [generateItem(3, RARITIES.find((r) => r.id === "common"), "head", cls)], // a white upgrade for the tutorial
    materials: {},
    autoEquip: true,
    autoSellDowngrades: false,
    upgrades: { autoPotion: false },
    autoSkills: {},
    autoSkillsOwned: {},
    redeemed: {},
    dungeonRuns: {},
    raidCooldowns: {},
    guildDungeonRuns: {}, guildRaidCooldowns: {}, trialCooldowns: {}, // Guild lockouts, independent of solo
    ahRefreshes: [],
    ahListings: [],
    ahMeta: { lastSweep: 0 },
    mail: [],
    failStacks: 0,
    consumables: {},
    supplies: {},
    drops: {},
    killsByType: {},
    town: { buildings: {}, build: null },
    ven: 0,
    mp: { ladderBest: null, rated: { wins: 0, losses: 0, start: Date.now() }, lifetime: { wins: 0, losses: 0 } },
    arenaTokens: 0,
    tickets: { dungeonReset: 0, arenaChallenge: 0 },
    auras: { xp: 0, gold: 0 },
    quests: { board: [] },
    tutorial: { step: 0, done: false },
    buffs: {},
    hp: 0,
    createdAt: Date.now(),
    lastSaved: Date.now(),
  };
  c.hp = maxHpFor(c);
  return c;
};
// Gambit rules and slot purchases used to be keyed by SKILL NAME. They are now keyed by BAR
// SLOT ("1".."5") so a rule survives swapping which ability sits in that slot, and so slot
// order can drive priority. Existing saves are remapped on load: a skill-name key becomes the
// position that skill currently occupies, and anything no longer on the bar is dropped —
// exactly what the old loadout filter did with unslotted skills.
// ---------- GDKP: loot rolling and reserve pricing ----------
// These live in the core because an online clear must produce the SAME lot for everyone. Rolled
// client-side, four players in one run each generated their own item and bid against themselves.
//
// Every lot opens at a reserve scaled to its rarity and item level, so a Legendary never goes for
// pocket change. Epic: 1,000g at ilvl 64, +500g per ilvl above. Legendary: 10,000g, +5,000g.
const GDKP_RESERVE = { legendary: { base: 10000, step: 5000 }, epic: { base: 1000, step: 500 }, rare: { base: 300, step: 150 }, uncommon: { base: 100, step: 50 }, common: { base: 25, step: 10 } };
const gdkpReserve = (item) => {
  const r = (item && item.rarity) || "epic";
  const cfg = GDKP_RESERVE[r] || GDKP_RESERVE.epic;
  const over = Math.max(0, ((item && item.ilvl) || 64) - 64); // ilvl 64 is the baseline
  return cfg.base + over * cfg.step;
};
// Rival ceilings scale off the reserve, so high-value lots actually draw competition. Uses rng()
// rather than Math.random so the server can roll a room's rivals reproducibly.
const gdkpBotCeiling = (reserve, power) => Math.round(reserve * (0.75 + rng() * 1.35) * (0.9 + Math.min(0.35, (power || 3000) / 15000)));

// The drops for a cleared piece of Guild content. Deterministic given the seed, so the server
// and every client in the room derive an identical lot list.
//   ilvl        item level to roll at
//   count       how many lots (raids drop two)
//   clsIds      party classes — each lot is rolled for one of them, so loot is party-relevant
//   legendaryChance  per-lot chance of a legendary instead of an epic (Trials only)
const rollGuildLoot = ({ ilvl, count = 1, clsIds = [], legendaryChance = 0, seed }) => {
  const body = () => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const leg = legendaryChance > 0 && rng() < legendaryChance;
      const cls = clsIds.length ? rngPick(clsIds) : "warrior";
      out.push(generateItem(ilvl, rarityById(leg ? "legendary" : "epic"), pickLootSlot(), cls));
    }
    return out;
  };
  return Number.isFinite(seed) ? withRng(makeRng(seed >>> 0), body) : body();
};

const migrateGambitKeys = (map, selectedSkills) => {
  const out = {};
  for (const k in (map || {})) {
    if (/^[1-9]$/.test(k)) { out[k] = map[k]; continue; }          // already a slot key
    const idx = (selectedSkills || []).indexOf(k);
    if (idx >= 0) out[String(idx + 1)] = map[k];                   // name -> slot position
  }
  return out;
};

// One-time refund for the classes whose physical damage moved from Strength to Agility. A rogue
// or hunter who spent attribute points on Strength was buying their damage stat at the time; the
// scaling change made those points inert, so they come back as unspent rather than dying quietly.
//
// Self-terminating rather than version-flagged: once the refund runs, allocated.str is 0, so the
// condition cannot match again. A player who deliberately re-spends points into Strength keeps
// them — the refund only ever fires on the first load after the change.
const refundStrayScalingPoints = (c) => {
  const allocated = { str: 0, agi: 0, int: 0, sta: 0, ...(c.allocated || {}) };
  const attrPoints = c.attrPoints || 0;
  if (physScalingStat(c.cls) !== "agi" || !(allocated.str > 0)) return { attrPoints, allocated };
  return { attrPoints: attrPoints + allocated.str, allocated: { ...allocated, str: 0 } };
};
const normalizeChar = (c) => ({
  ...c,
  gold: c.gold || 0, kills: c.kills || 0, bossKills: c.bossKills || 0, dungeonClears: c.dungeonClears || 0,
  honor: c.honor || 0, honorXp: c.honorXp || 0,
  ...refundStrayScalingPoints(c),
  professions: { ...emptyProfessions(), ...(c.professions || {}) },
  gatherTier: c.gatherTier || {},
  offlineZoneId: c.offlineZoneId ?? null,
  lastActive: c.lastActive || Date.now(),
  // Skills are purely level-gated, so derive the known list from level. This also
  // migrates saves made before skills were renamed (old names no longer match).
  unlockedSkills: (SKILLS[c.cls] || []).filter((s) => s.unlockLevel <= (c.level || 1)).map((s) => s.name),
  secondaryClass: undefined, // dual-classing retired → drop the stale field on next save
  spec: (() => {
    const cs = migrateSpec(c.spec);
    if (cs && specById(cs) && specClassOf(cs) === c.cls) return cs;
    const old60 = c.talents && c.talents[60]; // migrate a pre-existing level-60 talent pick into the Specialization
    if (old60 && specById(migrateSpec(old60)) && specClassOf(migrateSpec(old60)) === c.cls) return migrateSpec(old60);
    return null;
  })(),
  talents: (c.talents && typeof c.talents === "object") ? c.talents : {},
  talentChanges: c.talentChanges || 0,
  skillMods: (c.skillMods && typeof c.skillMods === "object") ? c.skillMods : {},
  specLoadouts: (c.specLoadouts && typeof c.specLoadouts === "object") ? c.specLoadouts : {}, // per-Specialization saved templates
  skillModRefunds: c.skillModRefunds || 0,
  equipment: Object.fromEntries(Object.entries(c.equipment || {}).map(([k, it]) => [k, it && !Array.isArray(it.sockets) ? { ...it, sockets: emptySockets(socketCountFor(it.rarity, it.slotId)) } : it])),
  inventory: (c.inventory || []).map((it) => (it && !Array.isArray(it.sockets) ? { ...it, sockets: emptySockets(socketCountFor(it.rarity, it.slotId)) } : it)),
  gems: (c.gems && typeof c.gems === "object") ? c.gems : {},
  tomes: undefined, learnedSkills: undefined, // retired: every skill now unlocks by level
  gambits: (c.gambits && typeof c.gambits === "object") ? { owned: c.gambits.owned || {}, shards: c.gambits.shards || {}, rules: migrateGambitKeys(c.gambits.rules, c.selectedSkills), slots: migrateGambitKeys(c.gambits.slots, c.selectedSkills), general: Array.isArray(c.gambits.general) ? c.gambits.general : [], generalSlots: c.gambits.generalSlots || 2 } : { owned: {}, shards: {}, rules: {}, slots: {}, general: [], generalSlots: 2 },
  hardKills: (c.hardKills && typeof c.hardKills === "object") ? c.hardKills : {},
  hardBossKills: (c.hardBossKills && typeof c.hardBossKills === "object") ? c.hardBossKills : {},
  hardZoneDone: (c.hardZoneDone && typeof c.hardZoneDone === "object") ? c.hardZoneDone : {},
  hardDungeonDone: (c.hardDungeonDone && typeof c.hardDungeonDone === "object") ? c.hardDungeonDone : {},
  talentTutorialDone: !!c.talentTutorialDone,
  selectedSkills: (() => {
    let spec = (migrateSpec(c.spec) && specById(migrateSpec(c.spec)) && specClassOf(migrateSpec(c.spec)) === c.cls) ? migrateSpec(c.spec) : null;
    if (!spec) { const old60 = c.talents && c.talents[60]; if (old60 && specById(migrateSpec(old60)) && specClassOf(migrateSpec(old60)) === c.cls) spec = migrateSpec(old60); }
    const sig = spec ? specSkillNames(spec) : [];
    const base = (c.selectedSkills || c.unlockedSkills || []).filter((n) => !ALL_SPEC_SKILL_NAMES.has(n) || sig.includes(n)); // drop signature skills from other specs
    // The player's own bar comes FIRST; signature skills only fill what is left. This ran the other
    // way round and re-applied on EVERY load, so padSelectedSkills truncated to the slot count and
    // evicted real choices: a level-60 warrior with five non-signature skills kept two of them after
    // a single save-and-reload, silently and permanently.
    //
    // Signature skills are still granted where that is the point — switchSpecCore puts them first
    // when you actively choose a spec, and the UI says so. applyLoadout already used this ordering
    // for restoring a saved template; normalizeChar was the one place that did not.
    return padSelectedSkills({ cls: c.cls, level: c.level || 1, spec }, [...base, ...sig]);
  })(),
  equipment: (() => { const eq = { ...emptyEquipment(), ...(c.equipment || {}) }; for (const k in eq) eq[k] = migrateItem(eq[k]); return eq; })(),
  inventory: (c.inventory || []).map(migrateItem),
  materials: (() => { const m = { ...(c.materials || {}) }; delete m.poisonHerb; if (m.ore) { m.copper = (m.copper || 0) + m.ore; delete m.ore; } if (m.richOre) { m.iron = (m.iron || 0) + m.richOre; delete m.richOre; } if (m.herb) { m.bluepetal = (m.bluepetal || 0) + m.herb; delete m.herb; } if (m.healingHerb) { m.sunblossom = (m.sunblossom || 0) + m.healingHerb; delete m.healingHerb; } return m; })(),
  autoEquip: c.autoEquip !== undefined ? c.autoEquip : true,
  autoSellDowngrades: c.autoSellDowngrades || false,
  upgrades: { autoPotion: false, ...(c.upgrades || {}) },
  autoSkills: Object.fromEntries(Object.entries(c.autoSkills || {}).filter(([k]) => (SKILLS[c.cls] || []).some((s) => s.name === k))),
  autoSkillsOwned: Object.fromEntries(Object.entries(c.autoSkillsOwned || {}).filter(([k]) => (SKILLS[c.cls] || []).some((s) => s.name === k))),
  redeemed: c.redeemed || {},
  dungeonRuns: c.dungeonRuns || {},
  raidCooldowns: c.raidCooldowns || {},
  guildDungeonRuns: c.guildDungeonRuns || {},
  guildRaidCooldowns: c.guildRaidCooldowns || {},
  trialCooldowns: c.trialCooldowns || {},
  ahRefreshes: c.ahRefreshes || [],
  ahListings: Array.isArray(c.ahListings) ? c.ahListings : [],
  ahMeta: (c.ahMeta && typeof c.ahMeta === "object") ? { lastSweep: c.ahMeta.lastSweep || 0 } : { lastSweep: 0 },
  mail: Array.isArray(c.mail) ? c.mail : [],
  failStacks: typeof c.failStacks === "number" ? c.failStacks : 0,
  supplies: c.supplies || {},
  drops: c.drops || {},
  kills: typeof c.kills === "number" ? c.kills : 0,
  killsByType: c.killsByType || (c.kills && typeof c.kills === "object" ? c.kills : {}),
  town: (c.town && typeof c.town === "object") ? { buildings: c.town.buildings || {}, build: c.town.build || null } : { buildings: {}, build: null },
  ven: c.ven || 0,
  mp: { ladderBest: (c.mp && c.mp.ladderBest) || null, rated: { wins: (c.mp && c.mp.rated && c.mp.rated.wins) || 0, losses: (c.mp && c.mp.rated && c.mp.rated.losses) || 0, start: (c.mp && c.mp.rated && c.mp.rated.start) || Date.now() }, lifetime: { wins: (c.mp && c.mp.lifetime && c.mp.lifetime.wins) || 0, losses: (c.mp && c.mp.lifetime && c.mp.lifetime.losses) || 0 } },
  arenaTokens: c.arenaTokens || 0,
  tickets: { dungeonReset: (c.tickets && c.tickets.dungeonReset) || 0, arenaChallenge: (c.tickets && c.tickets.arenaChallenge) || 0 },
  auras: { xp: (c.auras && c.auras.xp) || 0, gold: (c.auras && c.auras.gold) || 0 },
  quests: { board: (c.quests && c.quests.board) || [] },
  tutorial: c.tutorial || { step: 0, done: (c.level || 1) > 1 || (c.kills || 0) > 0 },
  consumables: (() => { const src = c.consumables || {}; const out = {}; const t = Math.min(6, Math.max(0, Math.floor((c.level || 1) / 10))); for (const k in src) { const v = src[k]; if (!v) continue; if (k.includes("@")) out[k] = (out[k] || 0) + v; else out[k + "@" + t] = (out[k + "@" + t] || 0) + v; } return out; })(),
  buffs: c.buffs || {},
  hp: typeof c.hp === "number" ? c.hp : maxHpFor(c),
});

// Builds a boss definition for a piece of group content. Lives in the core so the server
// generates byte-identical encounters from the same catalogue entry — passing `boss` as an
// object is already supported by createEncounter.
const guildBossDef = (content, kind, level) => {
  const raid = (kind || "").includes("raid"), hard = (kind || "").startsWith("hard");
  const m = hard ? 1.25 : 1;
  const abilities = [
    { kind: "auto", everyMs: raid ? 1400 : 1500, dmgMult: 1.1 * m },
    { kind: "tankbuster", name: hard ? "Brutal Crush" : "Crushing Blow", everyMs: 15000, first: 9000, dmgMult: 9.0 * m },
    { kind: "raidcast", name: raid ? "Cataclysm" : "Dark Surge", everyMs: 12000, first: 11000, castMs: 2300, dmgMult: 9.5 * m },
    { kind: "raidtick", name: "Lingering Wounds", everyMs: 7000, first: 6500, dmgMult: 1.3 * m },
  ];
  if (raid) {
    abilities.push({ kind: "summon", name: (content.enemies && content.enemies[0]) || "Adds", everyMs: 22000, first: 16000, count: 1 });
    abilities.push({ kind: "enrage", name: "Fury", first: 80000 });
  }
  if (hard) abilities.push({ kind: "spike", name: "Searing Lash", everyMs: 6000, first: 6000, dmgMult: 5.0 * m });
  // dur = target fight length in "estimated party DPS seconds" (actual clears land ~55-60% of it)
  return { id: "guild_" + content.id, name: content.boss || content.name, level: level || ((content.minLevel || 60) + 2),
    dur: Math.round((raid ? 115 : 70) * (hard ? 1.15 : 1)), raid, desc: content.desc || `${content.name} — defeat ${content.boss || "the boss"}.`, abilities };
};

const createEncounter = ({ party, boss, seed, potionCap }) => {
  const allies = party.map((p, i) => mkAlly(p.char, p.role || roleOf(p.char), p.tier, p.isHuman, "a" + i));
  const bdef = (typeof boss === "string" ? BOSS_DEFS[boss] : (boss && boss.abilities ? boss : null)) || BOSS_DEFS.ashen;
  const enemies = [mkEncEnemy(bdef, allies, "e0", false)];
  return { seed: (seed || 1) >>> 0, tick: 0, elapsed: 0, allies, enemies, nextEnemyId: 1, bossName: bdef.name, potionsUsed: 0, potionCap: potionCap || (bdef.raid ? 2 : 1), reses: bdef.raid ? 3 : 2, wiped: false, cleared: false, log: [] };
};
// Pick the enemy/ally a skill should land on, given an optional explicit selection.
// Shared by the client's tap handler and the server's intent resolver so both agree.
const grpResolveTarget = (enc, sk, sel) => {
  const out = {};
  if (sk.mult || sk.hits || sk.dotMult || sk.interrupt || sk.taunt) {
    if (sel && sel.type === "enemy") { const e = enc.enemies.find((x) => x.id === sel.id && x.hp > 0); if (e) out.targetEnemyId = e.id; }
    if (out.targetEnemyId == null) { const e = sk.interrupt ? (enc.enemies.find((x) => x.hp > 0 && x.castBar && x.castBar.interruptible) || grpPrimaryEnemy(enc)) : grpPrimaryEnemy(enc); if (e) out.targetEnemyId = e.id; }
  }
  if (sk.heal || sk.offheal) {
    if (sel && sel.type === "ally") { const a = enc.allies.find((x) => x.id === sel.id && !x.down); if (a) out.targetAllyId = a.id; }
    if (out.targetAllyId == null) { const w = grpInjured(enc.allies); if (w) out.targetAllyId = w.id; }
  }
  if (out.targetEnemyId == null && out.targetAllyId == null) { const p = grpPrimaryEnemy(enc); if (p) out.targetEnemyId = p.id; } // pure utility → route cd on the boss
  return out;
};

// Turn an untrusted intent into a legal action, or null.
//
// THE TRUST BOUNDARY. An intent names a skill; it never carries one. The skill object is
// looked up in the ally's OWN loadout, so a client cannot invent a skill or inflate an
// existing one — the worst a forged intent can do is name something the character doesn't
// have or can't afford yet, and get dropped. Cooldown and resource checks are applied here
// too, so the same rules bind humans and bots.
//
// intent: { skillName, target?: { type:"enemy"|"ally", id } }
const resolveIntent = (st, ally, intent, now) => {
  if (!ally || ally.down || !intent || typeof intent.skillName !== "string") return null;
  const sk = grpSkills(ally).find((s) => s.name === intent.skillName); // own loadout only
  if (!sk || !grpReady(ally, sk, now)) return null;                    // unknown, on cooldown, or unaffordable
  const sel = intent.target && (intent.target.type === "enemy" || intent.target.type === "ally") ? intent.target : null;
  return { skill: sk, ...grpResolveTarget(st, sk, sel) };
};

// How much of your health a combat potion restores, and how long a notice stays on screen.
const POTION_HEAL_FRAC = 0.5;

// WHY an intent produced nothing. resolveIntent collapses every failure to null, which is
// correct for a trust boundary but leaves the player staring at a button that did nothing —
// the commonest complaint being a spender tapped with an empty resource bar. This explains it
// so the caller can tell that one player, without leaking anything they don't already know
// about their own character.
//
// Returns null when the intent is fine (or when it is a potion, which has its own gate).
const intentRejection = (ally, intent, now) => {
  if (!ally || !intent || intent.potion) return null;
  if (ally.down) return { code: "down", text: "You're down — wait for a resurrect" };
  if (typeof intent.skillName !== "string") return null;
  // A SERVER SNAPSHOT ally has no `char` — fullSnapshot strips it, since the client already holds
  // its own. Reading through it threw and killed the caller's tap handler. This is advisory
  // feedback and the server re-checks every intent anyway, so with nothing to judge by, fail OPEN
  // and let the authoritative side answer rather than blocking the player.
  if (!ally.char) return null;
  const sk = grpSkills(ally).find((s) => s.name === intent.skillName);
  if (!sk) return { code: "unknown", text: `${intent.skillName} isn't on your bar` };
  const until = ally.bw.cooldowns[sk.name] || 0;
  if (until > now) return { code: "cooldown", text: `${sk.name} — ${Math.ceil((until - now) / 1000)}s left`, skillName: sk.name };
  if (!botCanAfford(ally.char, ally.bw, sk)) {
    const ri = classResource(ally.char.cls);
    const need = sk.spend === "all" ? 1 : (typeof sk.spend === "number" ? sk.spend : (typeof sk.cost === "number" ? sk.cost : 0));
    return { code: "resource", skillName: sk.name,
             text: `Not enough ${ri.name} for ${sk.name} (${Math.floor(resTotal(ally.bw))}/${need})` };
  }
  return null;
};

// Whether a potion can be drunk right now. The cap lives on the encounter, so this is the
// server's answer and a client cannot talk its way past it.
const potionRejection = (st, ally) => {
  if (!ally) return { code: "noally", text: "No combatant" };
  if (ally.down) return { code: "down", text: "You're down — wait for a resurrect" };
  if ((st.potionsUsed || 0) >= st.potionCap) return { code: "nopotions", text: "No potions left this fight" };
  if (ally.hp >= ally.maxHp) return { code: "fullhp", text: "Already at full health" };
  return null;
};

const chooseAllyAction = (st, ally, now) => {
  if (ally.isHuman) { const pa = ally.pendingAction; ally.pendingAction = null; return pa || null; } // humans act on their own taps
  const usable = grpSkills(ally).filter((s) => grpReady(ally, s, now));
  if (!usable.length) return null;
  const primary = grpPrimaryEnemy(st); const primEid = primary ? primary.id : null;
  const adds = grpAdds(st); const inc = grpIncoming(st, now);
  const dmgSkills = usable.filter((s) => (s.mult || s.hits || s.dotMult) && !skIsHeal(s) && !skIsAoeHeal(s) && !skIsHot(s) && !skIsCleanse(s) && !skIsInterrupt(s) && !skIsTaunt(s) && !skIsPartyBuff(s) && !skIsDef(s) && !s.aoeThreat); // reserve utility for its role
  const bestDmg = dmgSkills.sort((a, b) => ((b.mult || 0) * (b.hits || 1) + (b.dotMult || 0)) - ((a.mult || 0) * (a.hits || 1) + (a.dotMult || 0)))[0];
  if (ally.role === "healer") {
    const worst = grpInjured(st.allies);
    const hurt = st.allies.filter((a) => !a.down && a.hp < a.maxHp * 0.9);
    const tank = st.allies.find((a) => a.role === "tank" && !a.down) || st.allies.find((a) => !a.down);
    const aoe = usable.find(skIsAoeHeal);
    const big = usable.filter(skIsHeal).sort((a, b) => ((b.heal || b.offheal || 0) - (a.heal || a.offheal || 0)))[0];
    const hot = usable.find(skIsHot), cleanse = usable.find(skIsCleanse), raidCd = usable.find((s) => s.partyWardPct);
    const debuffed = st.allies.find((a) => !a.down && (a.debuffs || []).length);
    if (big && worst && worst.hp < worst.maxHp * 0.35) return { skill: big, targetAllyId: worst.id, targetEnemyId: primEid };   // emergency
    if (cleanse && debuffed) return { skill: cleanse, targetAllyId: debuffed.id, targetEnemyId: primEid };                      // dispel harmful effects
    if (raidCd && inc.raidSoon) return { skill: raidCd, targetEnemyId: primEid };                                               // Aegis of Light pre-raid
    if (aoe && (inc.raidSoon || hurt.length >= 2)) return { skill: aoe, targetEnemyId: primEid };                              // AoE for raid damage
    if (big && inc.busterSoon && tank && tank.hp < tank.maxHp * 0.85) return { skill: big, targetAllyId: tank.id, targetEnemyId: primEid };
    if (big && worst && worst.hp < worst.maxHp * 0.6) return { skill: big, targetAllyId: worst.id, targetEnemyId: primEid };
    if (hot && tank && !(tank.hots || []).length) return { skill: hot, targetAllyId: tank.id, targetEnemyId: primEid };         // keep a HoT rolling on the tank
    if (bestDmg) return { skill: bestDmg, targetEnemyId: primEid };                                                            // smite filler if slotted
    if (big && worst && worst.hp < worst.maxHp) return { skill: big, targetAllyId: worst.id, targetEnemyId: primEid };
    return null;
  }
  if (ally.role === "tank") {
    const defs = usable.filter(skIsDef).sort((a, b) => (b.wardPct || 0) - (a.wardPct || 0));
    const majorCd = defs[0]; const shortCd = defs.filter((d) => (d.cd || 99) <= 40).sort((a, b) => (a.cd || 0) - (b.cd || 0))[0];
    if (majorCd && ally.hp < ally.maxHp * 0.30) return { skill: majorCd, targetEnemyId: primEid };                             // panic button
    if (shortCd && (inc.busterSoon || ally.hp < ally.maxHp * 0.5)) return { skill: shortCd, targetEnemyId: primEid };          // pre-mitigate the buster
    const aoeT = usable.find((s) => s.aoeThreat);
    if (aoeT && st.enemies.filter((e) => e.hp > 0).length >= 2) return { skill: aoeT, targetEnemyId: primEid };                // grab all the adds
    const taunt = usable.find(skIsTaunt);
    const looseAdd = adds.find((en) => { const t = grpTopThreat(st, en); const ta = st.allies.find((a) => a.id === t); return ta && ta.role !== "tank"; });
    const notHolding = primary && grpTopThreat(st, primary) !== ally.id;
    if (taunt && (looseAdd || notHolding)) return { skill: taunt, targetEnemyId: looseAdd ? looseAdd.id : primEid };
    const threatSkill = usable.filter((s) => (s.mult || s.hits) && !skIsTaunt(s) && !skIsDef(s) && !s.aoeThreat).sort((a, b) => (skThreatMult(b) - skThreatMult(a)) || ((b.mult || 0) - (a.mult || 0)))[0];
    return threatSkill ? { skill: threatSkill, targetEnemyId: (looseAdd ? looseAdd.id : primEid) } : null;
  }
  if (ally.role === "support") {
    const casting = st.enemies.find((e) => e.hp > 0 && e.castBar && e.castBar.interruptible);
    const kick = usable.find(skIsInterrupt);
    if (casting && kick) return { skill: kick, targetEnemyId: casting.id };                                                    // interrupt is top priority
    const ward = usable.filter((s) => s.partyWardPct).sort((a, b) => (b.partyWardPct || 0) - (a.partyWardPct || 0))[0];
    if (ward && inc.raidSoon) return { skill: ward, targetEnemyId: primEid };                                                  // biggest party ward before raid damage
    const buff = usable.find((s) => skIsPartyBuff(s) && !s.partyWardPct);                                                      // haste/empower — keep rolling
    if (buff) return { skill: buff, targetEnemyId: primEid };
    const worst = grpInjured(st.allies); const off = usable.find((s) => s.offheal);
    if (off && worst && worst.hp < worst.maxHp * 0.7) return { skill: off, targetAllyId: worst.id, targetEnemyId: primEid };
    return bestDmg ? { skill: bestDmg, targetEnemyId: (adds[0] ? adds[0].id : primEid) } : null;
  }
  // dps — real rotation; focus adds first (kill priority), else the boss
  const focus = adds.length ? adds.slice().sort((a, b) => a.hp - b.hp)[0] : primary;
  const sk = chooseBotSkill(ally.char, ally.bw, now, ally.tier);
  return sk ? { skill: sk, targetEnemyId: focus ? focus.id : primEid } : (bestDmg ? { skill: bestDmg, targetEnemyId: focus ? focus.id : primEid } : null);
};
const applyAllyAction = (st, ally, act, now) => {
  const sk = act.skill; if (!sk) return;
  const focus = st.enemies.find((e) => e.id === act.targetEnemyId && e.hp > 0) || grpPrimaryEnemy(st);
  // route through the REAL skill engine for cooldown/resource/damage against the focus enemy
  if (focus) {
    ally.bw.enemy.hp = focus.hp; ally.bw.enemy.maxHp = focus.maxHp; ally.bw.enemy.level = focus.level;
    const before = ally.bw.enemy.hp;
    const r = applySkillCore(sk, ally.char, ally.bw, now, () => {}); ally.bw = r.battle;
    const dmg = Math.max(0, before - ally.bw.enemy.hp);
    if (dmg > 0) { focus.hp = Math.max(0, focus.hp - dmg); const th = dmg * roleThreatBase(ally.role) * skThreatMult(sk); grpAddThreat(focus, ally.id, th); if (sk.aoeThreat) { for (const en of st.enemies) if (en.hp > 0 && en.id !== focus.id) grpAddThreat(en, ally.id, th); }
      // Damage is the bulk of what happens in a fight, and none of it was ever logged — which
      // is why the combat log read as broken. This is the line that makes it a combat log.
      st.log.push(`${sk.icon || "⚔️"} ${ally.isHuman ? "You" : ally.name} — ${sk.name}: ${dmg}`);
      if (focus.hp <= 0) st.log.push(`☠️ ${focus.name} dies!`);
    }
  } else { ally.bw = applySkillCore(sk, ally.char, ally.bw, now, () => {}).battle; }
  // role effects (interpreted by the engine)
  if (skIsHeal(sk)) { const _hc = critHeal(ally.char, skHealFrac(sk) * healPowerOf(ally.char)); const amt = _hc.amount; const tgt = st.allies.find((a) => a.id === act.targetAllyId && !a.down) || grpInjured(st.allies); if (tgt) { const before = tgt.hp; tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt); st.log.push(`💚 ${ally.name} heals ${tgt.isHuman ? "you" : tgt.name} for ${Math.round(tgt.hp - before)}`); for (const en of st.enemies) if (en.hp > 0) grpAddThreat(en, ally.id, amt * GRP.threatHeal / Math.max(1, st.enemies.filter((e) => e.hp > 0).length)); } }
  if (skIsHot(sk)) { const tgt = st.allies.find((a) => a.id === act.targetAllyId && !a.down) || grpInjured(st.allies); if (tgt) { const dur = sk.hotDur || 12; const per = critHeal(ally.char, skHotPerSec(sk) * healPowerOf(ally.char)).amount; tgt.hots = [...(tgt.hots || []).filter((h) => h.src !== sk.name), { src: sk.name, healPerTick: per, nextTick: now + 1000, expires: now + dur * 1000 }]; st.log.push(`🕯️ ${ally.name} puts ${sk.name} on ${tgt.isHuman ? "you" : tgt.name}`); } }
  if (sk.cleanse) { const tgt = st.allies.find((a) => a.id === act.targetAllyId && !a.down && (a.debuffs || []).length) || st.allies.find((a) => !a.down && (a.debuffs || []).length); if (tgt) { st.log.push(`💧 ${ally.name} cleanses ${tgt.isHuman ? "you" : tgt.name}`); tgt.debuffs = []; } }
  if (sk.healAoe) { const amt = critHeal(ally.char, sk.healAoe * healPowerOf(ally.char)).amount; for (const a of st.allies) if (!a.down) a.hp = Math.min(a.maxHp, a.hp + amt); for (const en of st.enemies) if (en.hp > 0) grpAddThreat(en, ally.id, amt * GRP.threatHeal); }
  if (sk.taunt) { for (const en of st.enemies) if (en.hp > 0) { const top = Math.max(0, ...Object.values(en.threat), 0); en.threat[ally.id] = top * 1.3 + 100; en.targetId = ally.id; } st.log.push(`🛡️ ${ally.name} taunts!`); }
  if (sk.interrupt) { const en = st.enemies.find((e) => e.id === act.targetEnemyId && e.castBar && e.castBar.interruptible) || st.enemies.find((e) => e.castBar && e.castBar.interruptible); if (en) { st.log.push(`🚫 ${ally.name} interrupted ${en.name}'s ${en.castBar.name}!`); en.castBar = null; en.nextCastAt = now + 11000; } }
  if (skIsPartyBuff(sk)) { const dur = ((sk.partyHasteDur || sk.partyWardDur || sk.partyEmpowerDur) || 10) * 1000; for (const a of st.allies) if (!a.down) { if (sk.partyHastePct) a.bw.playerEffects.push({ kind: "haste", pct: sk.partyHastePct, expires: now + dur }); if (sk.partyWardPct) a.bw.playerEffects.push({ kind: "ward", pct: sk.partyWardPct, expires: now + dur }); if (sk.partyEmpowerPct) a.bw.playerEffects.push({ kind: "empower", pct: sk.partyEmpowerPct, expires: now + dur }); } st.log.push(`✨ ${ally.name} casts ${sk.name} — ${sk.partyWardPct ? "the party is shielded" : sk.partyHastePct ? "the party hastens" : "the party is empowered"}!`); }
  // Defensives were silent too; a mitigation cooldown is exactly the thing a party wants to see.
  if (skIsDef(sk)) st.log.push(`🛡️ ${ally.name} braces with ${sk.name}`);
};
const grpWardOf = (ally) => ally.bw.playerEffects.filter((e) => e.kind === "ward").reduce((m, e) => m + e.pct, 0) / 100;
const grpHitAlly = (ally, raw) => { const mit = mitigation(effectiveStats(ally.char).armor || 0, ally.char.level); const dmg = Math.max(1, Math.round(raw * (1 - mit) * (1 - grpWardOf(ally)))); ally.hp = Math.max(0, ally.hp - dmg); return dmg; };
const grpRaidDamage = (st, raw) => { for (const a of st.allies) if (!a.down) grpHitAlly(a, raw); };
// stepEncounter(state, dt, inputs) — pure. `inputs` maps an ally id to that player's intent
// for THIS tick: { [allyId]: { skillName, target? } }. Intents are resolved through
// resolveIntent (own loadout, cooldown- and resource-checked) and queued as that ally's
// pendingAction, exactly as a local tap does.
//
// Determinism is unaffected: inputs simply join (state, seed) in the reproducible tuple, so
// a replay that feeds the same intents at the same ticks reproduces the fight byte for byte.
// Omitting the argument leaves behaviour identical to before.
const stepEncounter = (state, dt, inputs) => withRng(makeRng((state.seed ^ (state.tick * 2654435761)) >>> 0), () => {
  if (state.wiped || state.cleared) return state;
  // functional clone (purity → reproducible & replayable)
  // `notices` is per-tick feedback addressed to ONE player (why their tap did nothing). It is
  // rebuilt every tick so a stale message can never be re-delivered from a later snapshot.
  const s = { ...state, log: state.log.slice(-40), notices: [],
    allies: state.allies.map((a) => ({ ...a, hots: (a.hots || []).map((h) => ({ ...h })), debuffs: (a.debuffs || []).map((d) => ({ ...d })), bw: { ...a.bw, enemy: { ...a.bw.enemy }, playerEffects: a.bw.playerEffects.map((e) => ({ ...e })), enemyEffects: a.bw.enemyEffects.map((e) => ({ ...e })), cooldowns: { ...a.bw.cooldowns }, resQ: a.bw.resQ.map((q) => ({ ...q })) } })),
    enemies: state.enemies.map((e) => ({ ...e, threat: { ...e.threat }, castBar: e.castBar ? { ...e.castBar } : null, abilities: (e.abilities || []).map((ab) => ({ ...ab })) })) };
  const now = state.elapsed + dt;
  // 0) queue this tick's player intents. An intent that arrives mid-GCD stays queued on the
  // ally until its turn opens, which is what a local tap already does.
  if (inputs) {
    for (const id of Object.keys(inputs)) {
      const ally = s.allies.find((a) => a.id === id);
      if (!ally || !ally.isHuman) continue;              // only a human's own combatant is drivable
      const intent = inputs[id];
      // A potion is authoritative state (it spends a shared per-fight charge), so it travels as
      // an intent like everything else rather than being applied client-side.
      if (intent && intent.potion) {
        const rej = potionRejection(s, ally);
        if (rej) { s.notices.push({ allyId: id, ...rej }); continue; }
        const healed = Math.min(ally.maxHp, ally.hp + Math.round(ally.maxHp * POTION_HEAL_FRAC));
        s.potionsUsed = (s.potionsUsed || 0) + 1;
        s.log = [...s.log, `🧪 ${ally.name} drinks a potion (+${healed - ally.hp} HP)`].slice(-40);
        ally.hp = healed;
        continue;
      }
      const act = resolveIntent(s, ally, intent, now);
      if (act) ally.pendingAction = act;                 // illegal intents are simply dropped
      else { const rej = intentRejection(ally, intent, now); if (rej) s.notices.push({ allyId: id, ...rej }); }
    }
  }
  // 1) allies act on their GCD
  for (const ally of s.allies) {
    if (ally.down) continue;
    ally.bw.hp = ally.hp;
    ally.bw.playerEffects = ally.bw.playerEffects.filter((e) => !e.expires || e.expires > now);
    resExpire(ally.bw, now);
    // heal-over-time ticks
    ally.hots = (ally.hots || []).filter((h) => h.expires > now);
    for (const h of ally.hots) { let g = 0; while (now >= h.nextTick && g++ < 6) { ally.hp = Math.min(ally.maxHp, ally.hp + h.healPerTick); h.nextTick += 1000; } }
    // harmful debuff ticks (damage) — Cleanse removes these
    ally.debuffs = (ally.debuffs || []).filter((d) => d.expires > now);
    for (const d of ally.debuffs) { let g = 0; while (now >= d.nextTick && g++ < 6) { ally.hp = Math.max(0, ally.hp - d.dmgPerTick); d.nextTick += 1000; } }
    if (now >= (ally.nextGcd || 0)) {
      const act = chooseAllyAction(s, ally, now);
      // Haste shortens the global cooldown in group play — this is where the stat earns its
      // keep online, since group allies never auto-attack and all damage is on the GCD.
      const mult = (ally.tier.key === "new" ? 1.3 : ally.tier.key === "expert" ? 0.9 : 1) / (1 + hasteOf(ally.char));
      if (act) { applyAllyAction(s, ally, act, now); ally.nextGcd = now + GRP.gcd * mult; }
      else if (!ally.isHuman) { ally.nextGcd = now + GRP.gcd * mult; } // humans keep their turn open until they tap
    }
  }
  // 2) enemies act — data-driven ability timelines
  for (const en of s.enemies) {
    if (en.hp <= 0) continue;
    en.targetId = grpTopThreat(s, en);
    if (en.enraged) en.enrageMult = 1 + Math.max(0, (now - en.enrageStart) / 1000) * 0.035;
    // resolve an active interruptible cast
    if (en.castBar) { if (now >= en.castBar.endsAt) { grpRaidDamage(s, Math.round(en.castBar.dmg * en.enrageMult)); s.log.push(`💥 ${en.name}'s ${en.castBar.name} hits the party!`); en.castBar = null; } }
    for (const ab of en.abilities) {
      if (now < ab.nextAt) continue;
      const dmg = Math.round(en.base * (ab.dmgMult || 1) * en.enrageMult);
      if (ab.kind === "auto") { const t = allyById(s, en.targetId) || grpInjured(s.allies); if (t) grpHitAlly(t, dmg); }
      else if (ab.kind === "tankbuster") { const t = allyById(s, en.targetId) || grpInjured(s.allies); if (t) { grpHitAlly(t, dmg); s.log.push(`🔨 ${en.name}'s ${ab.name} smashes ${t.isHuman ? "YOU" : t.name}`); } }
      else if (ab.kind === "spike") { const alive = s.allies.filter((a) => !a.down); const t = alive.length ? pick(alive) : null; if (t) { grpHitAlly(t, dmg); s.log.push(`🌑 ${ab.name} strikes ${t.isHuman ? "YOU" : t.name}`); } }
      else if (ab.kind === "debuff") { const alive = s.allies.filter((a) => !a.down); const t = alive.length ? pick(alive) : null; if (t) { t.debuffs = [...(t.debuffs || []), { name: ab.name || "Curse", icon: ab.icon || "☠️", dmgPerTick: Math.round(en.base * (ab.tickMult || 0.5) * en.enrageMult), nextTick: now + 1000, expires: now + (ab.dur || 10) * 1000 }]; s.log.push(`${ab.icon || "☠️"} ${ab.name} afflicts ${t.isHuman ? "YOU" : t.name} — cleanse it!`); } }
      else if (ab.kind === "raidtick") { grpRaidDamage(s, dmg); }
      else if (ab.kind === "raidcast") { if (!en.castBar) { en.castBar = { name: ab.name, endsAt: now + (ab.castMs || 2400), interruptible: true, dmg: Math.round(en.base * (ab.dmgMult || 1)) }; s.log.push(`⏳ ${en.name} casts ${ab.name} — interrupt it!`); } }
      else if (ab.kind === "summon") { if (grpAdds(s).length < 3) { for (let k = 0; k < (ab.count || 1); k++) s.enemies.push(mkEncEnemy({ name: ab.name || "Add", level: Math.max(1, en.level - 2) }, s.allies, "e" + (s.nextEnemyId++), true)); s.log.push(`➕ ${en.name} summons ${ab.name}!`); } }
      else if (ab.kind === "enrage") { if (!en.enraged) { en.enraged = true; en.enrageStart = now; s.log.push(`🔥 ${en.name} ENRAGES — burn it down!`); } }
      ab.nextAt = ab.everyMs ? now + ab.everyMs : Infinity;
    }
  }
  // 3) deaths, battle-res, wipe/clear
  for (const a of s.allies) { if (!a.down && a.hp <= 0) { if (s.reses > 0 && s.allies.some((x) => !x.down && x.id !== a.id)) { s.reses -= 1; a.hp = Math.round(a.maxHp * 0.35); s.log.push(`✚ ${a.name} is battle-resurrected (${s.reses} left)`); } else { a.down = true; a.hp = 0; s.log.push(`☠️ ${a.name} has fallen`); } } }
  s.elapsed = now; s.tick = state.tick + 1;
  if (s.enemies.every((e) => e.hp <= 0)) { s.cleared = true; s.log.push("🏆 Encounter cleared!"); }
  else if (s.allies.every((a) => a.down)) { s.wiped = true; s.log.push("💀 The party has wiped."); }
  return s;
});

export {
  migrateGambitKeys,
  GDKP_RESERVE,
  gdkpReserve,
  gdkpBotCeiling,
  rollGuildLoot,
  HUNTER_WEAPONS,
  executeThreshold,
  gambitCondMet,
  EXECUTE_DEFAULT,
  SPEC_SKILL_DEFS,
  weaponRangeFor,
  POWER_PER_STAT,
  CLASSES,
  RACES,
  GEMS,
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
  slotById,
  ITEM_BASES,
  RARITY_STAT_MULT,
  baseArmorFor,
  gearStatBase,
  endgameClimb,
  ENDGAME_ILVL_FLOOR,
  ENDGAME_ILVL_GROWTH,
  ARMOR_SLOT_WEIGHT,
  SLOT_SECONDARY,
  SECONDARY_POOL,
  secondaryWeight,
  pickSlotSecondary,
  SEC_SIZE,
  SLOT_DROP_WEIGHT,
  pickLootSlot,
  ZONE_DROP_MIN,
  zoneDropScale,
  physScalingStat,
  STAT_DMG_RATE,
  enemyCastable,
  enemyPrefersMagic,
  enemyUsableSkills,
  refundStrayScalingPoints,
  CRIT_ROGUE_BONUS,
  CRIT_BASE,
  hasteOf,
  critHeal,
  secPct,
  secEffectiveRating,
  SEC_CAP,
  SEC_RATE,
  CRIT_SOFT_CAP,
  ARMOR_BASE_MULT,
  PREFIXES,
  nameWithSuffix,
  POWER_AFFIX_MIN_ILVL,
  ALL_SUFFIX_NAMES,
  MAIN_SUFFIXES,
  suffixByMains,
  mainKeyOf,
  uid,
  emptySockets,
  socketCountFor,
  SOCKETABLE_SLOTS,
  emptyProfessions,
  PROFESSIONS,
  starterGear,
  mkStarter,
  STARTER_WEAPON,
  migrateSpec,
  ALL_SPEC_SKILL_NAMES,
  SPEC_SKILLS,
  padSelectedSkills,
  migrateItem,
  mainStatsOf,
  buildBotChar,
  botTier,
  TRINITY_FILL,
  SPEC_MIGRATIONS,
  specClassOf,
  specSkillNames,
  RARITIES,
  rarityById,
  GEAR_SLOTS,
  LOOT_SLOTS,
  emptyEquipment,
  generateItem,
  createCharacter,
  normalizeChar,
  createEncounter,
  guildBossDef,
  chooseAllyAction,
  applyAllyAction,
  grpResolveTarget,
  resolveIntent,
  intentRejection,
  potionRejection,
  POTION_HEAL_FRAC,
  grpWardOf,
  grpHitAlly,
  grpRaidDamage,
  stepEncounter
};
