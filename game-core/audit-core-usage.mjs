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
// Run: node game-core/audit-core-usage.mjs
import { readFileSync } from "fs";

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

console.log(failures ? "\n❌ client/core boundary audit FAILED" : "\n✅ client/core boundary is clean");
process.exit(failures ? 1 : 0);
