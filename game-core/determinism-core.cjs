/* Integration gate: proves the REAL combat core in App.jsx is deterministic.
   Transpiles the app to CommonJS, stubs React (components never run), builds one
   encounter, and plays it twice from the same start state — the results must be
   byte-identical. Also confirms different seeds diverge.
   Run:  node game-core/determinism-core.cjs [path/to/App.jsx]
   Requires `tsc` on PATH.                                                        */
const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = process.argv[2] || path.join(__dirname, '..', 'src', 'App.jsx');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roe-core-'));
execSync(`tsc "${SRC}" --jsx react --target es2020 --module commonjs --outDir "${dir}" --allowJs --checkJs false --noResolve`, { stdio: 'inherit' });
const outName = fs.readdirSync(dir).find(f => f.endsWith('.js'));
let js = fs.readFileSync(path.join(dir, outName), 'utf8');
const stub = '({default:{Component:function(){},createElement:function(){return{}},Fragment:"F"},useState:0,useEffect:0,useRef:0,useCallback:0,createElement:function(){return{}},Component:function(){},Fragment:"F"})';
js = js.replace('__importStar(require("react"))', stub);
// Post-cutover App.jsx imports the core by relative path. The transpiled harness runs from a
// temp dir, so those have to be re-pointed at the real modules. Node 22 can require() ESM.
js = js.replace(/require\("\.\.\/game-core\//g, `require("${path.join(__dirname).replace(/\\/g, '/')}/`);
// Vite's `import.meta.env` (build-time config, e.g. the game-server URL) is a syntax error in
// CommonJS. Nothing this harness exercises reads it, so neutralise it rather than run a bundler.
js = js.replace(/import\.meta\.env/g, '({})');
// App.jsx now imports its icon set. These harnesses compile App.jsx into a temp dir, so a
// relative require would resolve against that dir and blow up. The icons are pure rendering
// and no test asserts on them, so they are stubbed rather than compiled.
js = js.replace(/require\("\.\/icons\.jsx"\)/g, '({IconSprite:function(){return null},Icon:function(){return null},EmojiIcon:function(){return null},withIcons:function(t){return t}})');
js = js.replace(/require\("\.\/chronicle\.jsx"\)/g, '({ChronicleStyles:function(){return null},Chronicle:function(){return null},loadTheme:function(){return "auto"},saveTheme:function(){},themeClass:function(){return "theme-day"}})');
js += `
;(function(){
  // Post-cutover the combat symbols arrive as an import namespace rather than bare locals,
  // so pull them from the module the app itself imports. buildBotChar / botTier are still
  // App.jsx-local, which keeps this an integration test of the app's real code path.
  const __core = require(${JSON.stringify(path.join(__dirname, 'combat.mjs').replace(/\\/g, '/'))});
  const createEncounter = __core.createEncounter, stepEncounter = __core.stepEncounter;
  // buildBotChar / botTier moved into the core too (Stage 5), so they are no longer App.jsx locals.
  const buildBotChar = __core.buildBotChar, botTier = __core.botTier;
  const __rng = require(${JSON.stringify(path.join(__dirname, 'rng.mjs').replace(/\\/g, '/'))});   // withRng/makeRng live in rng.mjs
  // Build the party under a FIXED seed. buildBotChar rolls gear through the ambient rng, which
  // defaults to Math.random, so an unseeded party differed every run and the step count drifted
  // (364 / 436 / 406 …) even when nothing had changed. Each run was still internally
  // deterministic, but the number was useless as a regression signal. Seeding it makes the step
  // count meaningful again: if it moves, combat actually changed.
  const party=__rng.withRng(__rng.makeRng(7), () => [
    {char:buildBotChar("warrior","",60,60), role:"tank",   tier:botTier(1800)},
    {char:buildBotChar("paladin","",60,60), role:"healer", tier:botTier(1800)},
    {char:buildBotChar("mage","",60,60),    role:"dps",    tier:botTier(1800)},
    {char:buildBotChar("rogue","",60,60),   role:"dps",    tier:botTier(1800)},
  ]);
  const sum=(s)=>JSON.stringify({tick:s.tick,elapsed:s.elapsed,cleared:s.cleared,wiped:s.wiped,
    allies:s.allies.map(a=>[a.id,a.hp|0,a.down?1:0]),enemies:s.enemies.map(e=>[e.id,e.hp|0]),logLen:s.log.length});
  const play=(s0)=>{let s=s0,n=0;while(!s.cleared&&!s.wiped&&n<6000){s=stepEncounter(s,120);n++;}return{steps:n,sum:sum(s)};};
  const st0=createEncounter({party,boss:"ashen",seed:777});
  const r1=play(st0), r2=play(st0);
  const det=r1.sum===r2.sum&&r1.steps===r2.steps;
  // Compare several seeds rather than a single pair. Whether a given seed changes the outcome
  // is party-dependent — some parties resolve identically under different seeds — so one
  // unlucky pair used to be able to fail this even though seeding works fine.
  const sums=[111,222,333,444].map((sd)=>play(createEncounter({party,boss:"ashen",seed:sd})).sum);
  const seedMatters=new Set(sums).size>1;
  console.log("steps:",r1.steps,"| DETERMINISTIC:",det,"| SEED MATTERS:",seedMatters);
  process.exit(det && seedMatters ? 0 : 1);
})();`;
const run = path.join(dir, 'harness.cjs'); fs.writeFileSync(run, js);
require(run);
