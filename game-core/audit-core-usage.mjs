// Guards the client/core boundary. Two failure modes have bitten us, both invisible to the
// Vite build (an undefined global is not a build error, and a mutation is perfectly legal JS):
//
//  1. A symbol moved into the core but never imported back — App.jsx references it and throws
//     at runtime, but only on the code path that uses it. This took the live site down:
//     "ReferenceError: specSkillNames is not defined".
//
//  2. App.jsx WRITING to an imported table. The server imports the same module but never runs
//     App.jsx, so its copy is missing the data. This is why signature skills like "Cold Open"
//     could never fire online: App.jsx merged SPEC_SKILL_DEFS into SKILLS at module load, and
//     the server's SKILLS simply did not contain them.
//
//  3. server/ drifting from game-core/. The server deploys standalone with its own copies, and
//     nothing forced them to stay current — an edit to one side alone means client and
//     authoritative server disagree about the rules of the fight.
//
//  4. App.jsx defining its OWN copy of a symbol the core also exports. A local definition wins
//     over an import, so the client quietly runs different code from the server and nothing
//     complains. This is how normalizeChar lost the gambit slot migration: the core copy was
//     updated, App.jsx's was not, and every existing player's gambits would have gone silent.
//
// Run: node game-core/audit-core-usage.mjs
import { readFileSync } from "fs";
import { drifted, SYNCED } from "./sync-core.mjs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const core = await import("./combat.mjs");

const impBlock = app.slice(app.indexOf("import {"), app.indexOf('} from "../game-core/combat.mjs";'));
const imported = new Set([...impBlock.matchAll(/^\s{2}(\w+),$/gm)].map((m) => m[1]));
for (const n of ["rng", "makeRng", "withRng", "pick", "rngPick", "rngInt", "makeClock"]) imported.add(n);
const localDef = new Set([...app.matchAll(/^(?:const|let|var|function|class)\s+(\w+)/gm)].map((m) => m[1]));

let failures = 0;

// --- 1) referenced but resolved by neither import nor local definition -------------------
const unresolved = Object.keys(core).filter((n) =>
  !imported.has(n) && !localDef.has(n) &&
  new RegExp(`(?<![\\w.$])${n}\\s*[(,).;\\[\\]]`).test(app));
if (unresolved.length) { failures++; console.log("✗ referenced but never imported:", unresolved.join(", ")); }
else console.log("✓ every core symbol App.jsx references is imported or locally defined");

// --- 2) writes to an imported symbol ------------------------------------------------------
const MUT = ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "add", "delete", "set", "clear"];
const writes = [];
for (const name of imported) {
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pats = [
    [new RegExp(`(?<![\\w.$])${e}\\s*\\[[^\\]]*\\]\\s*=(?!=)`), "index assignment"],
    [new RegExp(`(?<![\\w.$])${e}\\.(${MUT.join("|")})\\s*\\(`), "mutating method"],
    [new RegExp(`(?<![\\w.$])${e}\\.\\w+\\s*=(?!=)`), "property assignment"],
    [new RegExp(`Object\\.assign\\(\\s*${e}\\b`), "Object.assign target"],
    [new RegExp(`delete\\s+${e}\\s*\\[`), "delete"],
  ];
  app.split("\n").forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, "");
    for (const [re, kind] of pats) if (re.test(code)) { writes.push(`line ${i + 1}: ${name} — ${kind}`); break; }
  });
}
if (writes.length) { failures++; console.log("✗ App.jsx writes to imported core state (the server will not see it):"); writes.forEach((w) => console.log("   " + w)); }
else console.log("✓ App.jsx never writes to an imported core table");

// --- 4) App.jsx re-defines something the core exports ---------------------------------------
// Allowed only when the name is genuinely a different thing; add such cases here with a reason.
const ALLOWED_SHADOW = new Set();
const shadowed = Object.keys(core).filter((n) => localDef.has(n) && !ALLOWED_SHADOW.has(n));
if (shadowed.length) {
  failures++;
  console.log("✗ App.jsx defines its own copy of a core export (the local one wins, silently):");
  for (const n of shadowed) {
    const line = app.slice(0, new RegExp(`^(?:const|let|var|function|class)\\s+${n}\\b`, "m").exec(app).index).split("\n").length;
    console.log(`   App.jsx:${line}  ${n}`);
  }
  console.log("   fix: delete the local definition and add the name to the core import block.");
} else console.log("✓ App.jsx defines no local copy of a core export");

// --- 3) server/ copies drifted from the canonical core -------------------------------------
const stale = drifted();
if (stale.length) {
  failures++;
  console.log(`✗ server/ has drifted from game-core/: ${stale.join(", ")}`);
  console.log("   the client and the authoritative server would resolve fights differently.");
  console.log("   fix: npm run sync-core   (edit game-core/ — it is the canonical side)");
} else console.log(`✓ server/ copies match the core (${SYNCED.join(", ")})`);

// --- 5) App.jsx keeps its OWN secondary-stat table under a different name --------------------
// Check 4 is name-based, so it only catches a local copy that reuses the core's name. It missed
// makeArtifact's `const SIZE = { sta: 1.0, leech: 0.5, ... }` — a stale duplicate of SEC_SIZE that
// left artifacts unable to roll crit or haste at all, with stamina lines 21% under everything
// else. This catches the shape instead of the name.
//
// A genuine stat BAG lists the main stats too ({ str: 0, agi: 0, int: 0, sta: 0, armor: 0, ... });
// a secondary table does not. That is the tell used to separate them.
const SECONDARIES = core.SECONDARY_POOL;
const MAINS = ["str", "agi", "int", "armor"];
const suspects = [];
for (const m of app.matchAll(/\{[^{}]{10,400}\}/g)) {
  const body = m[0];
  const secs = SECONDARIES.filter((k) => new RegExp(`[{,\\s]${k}\\s*:`).test(body));
  if (secs.length < 4) continue;
  if (MAINS.some((k) => new RegExp(`[{,\\s]${k}\\s*:`).test(body))) continue; // a full stat bag, fine
  suspects.push({ line: app.slice(0, m.index).split("\n").length, secs: secs.length, body: body.replace(/\s+/g, " ").slice(0, 70) });
}
if (suspects.length) {
  failures++;
  console.log("✗ App.jsx defines its own secondary-stat table (the core owns these):");
  for (const s of suspects) console.log(`   App.jsx:${s.line}  ${s.secs} secondaries — ${s.body}…`);
  console.log("   fix: import SEC_SIZE / SEC_CAP / SEC_RATE from the core instead of restating them.");
} else console.log("✓ App.jsx keeps no private secondary-stat table");

console.log(failures ? "\n❌ client/core boundary audit FAILED" : "\n✅ client/core boundary is clean");
process.exit(failures ? 1 : 0);
