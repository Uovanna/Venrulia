# Game-core extraction manifest (Phase 0)
The deterministic combat core is the transitive module-scope closure of the roots `applySkillCore`, `stepEncounter`, `createEncounter`, `chooseAllyAction`, `applyAllyAction`.

**155 symbols** to lift out of `App.jsx` into `game-core/` — all pure, all React-free, all already deterministic (seeded `rng()` + injected `now`/`dt`). Listed in source order (dependencies first).

## Data / config tables (31)

`CLASSES`, `RACES`, `GEMS`, `MAIN_KEYS`, `SKILLS`, `PHYSICAL_SKILLS`, `CLASS_RESOURCES`, `RES_DECAY_MS`, `MARK_DMG_PER_STACK`, `SKILL_SLOT_LEVELS`, `SKILL_MOD_POWER`, `SKILL_MOD_EFFECTS`, `POTION_PRICE_KINDS`, `PLAYER_BASE_INTERVAL`, `BUFF_META`, `TALENT_TIERS`, `TALENT_L60`, `SPEC_TREES`, `POWER_GEMS`, `ALL_GEMS`, `HEX_MAX_STACKS`, `AGI_SPEED_CAP`, `LEECH_MULT`, `PET`, `BOT_TIERS`, `PVP_TOUGHNESS`, `PVP_SKILL_CUT`, `PVP_SKILL_MULT`, `PVP_GCD`, `GRP`, `ADD_ABILITIES`

## Functions & consts (124)

`socketsOf`, `itemMainTotals`, `itemMainCount`, `itemPowerRaw`, `itemHasPower`, `itemPowerActive`, `wouldDormantPower`, `skillType`, `isMagicSkill`, `classResource`, `resTotal`, `resSync`, `resExpire`, `drFactor`, `resAdd`, `resTake`, `unlockedSlotCount`, `classSkills`, `specVisible`, `skillPool`, `skillByName`, `skillClassOf`, `skillModPts`, `skillModSpent`, `skillModPotency`, `skillModEffectList`, `hasSkillModEffect`, `padSelectedSkills`, `_rng`, `rng`, `makeRng`, `withRng`, `pick`, `clamp`, `activeBuffs`, `effectiveStats`, `tierForLevel`, `tierMidLevel`, `tierBuffPct`, `tierScrollAmount`, `conKey`, `wardPct`, `consumablePrice`, `empowerMultOf`, `physBuffMultOf`, `isPlayerDebuff`, `_gU`, `_gS1`, `_gO`, `_gS2`, `_off`, `specById`, `gemById`, `socketedGems`, `gemFlatCd`, `talentRows`, `selectedTalents`, `skillIsSpender`, `skillIsBuilder`, `skillIsDot`, `skillIsNuke`, `condHpOk`, `condMatchesSkill`, `talentSkillMult`, `talentFlag`, `talentDotDur`, `talentCcDur`, `talentMods`, `maxHpFor`, `weaponAvgDmg`, `townLvl`, `townBonuses`, `hexStackMult`, `classDmgMod`, `computeDamage`, `playerBaseDamage`, `agiAtkSpeed`, `critChanceFor`, `mitigation`, `enemyDamageForLevel`, `secondaryPcts`, `critMultFor`, `cdrPerCdOf`, `petMaxHp`, `petHitDamage`, `petDps`, `cdrPerDebuffOf`, `enemyDebuffCount`, `skillsOnCd`, `cdrFracFor`, `offlinePlayerDps`, `botCanAfford`, `chooseBotSkill`, `applySkillCore`, `healPowerOf`, `skIsHeal`, `skIsHot`, `skIsCleanse`, `skIsAoeHeal`, `skIsTaunt`, `skIsInterrupt`, `skIsDef`, `skIsPartyBuff`, `skThreatMult`, `roleThreatBase`, `grpSkills`, `grpReady`, `grpInjured`, `grpPrimaryEnemy`, `grpTopThreat`, `grpAddThreat`, `grpEstDps`, `mkAlly`, `mkEncEnemy`, `allyById`, `grpAdds`, `grpIncoming`, `createEncounter`, `chooseAllyAction`, `applyAllyAction`, `grpWardOf`, `grpHitAlly`, `grpRaidDamage`, `stepEncounter`

## Notes
- `rng`/`makeRng`/`withRng`/`pick`/`makeClock` are already extracted to `game-core/rng.mjs`.
- Party construction (`buildBotChar`) and loot (`generateItem`) are NOT in this closure — they're inputs to `createEncounter`, not part of the step. The server builds combatants from published snapshots and feeds them in.
- Roots span App.jsx lines ~11–8737; extraction moves them to `game-core/combat.mjs` and replaces the in-file definitions with an import.
