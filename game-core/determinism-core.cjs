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
js += `
;(function(){
  // Post-cutover the combat symbols arrive as an import namespace rather than bare locals,
  // so pull them from the module the app itself imports. buildBotChar / botTier are still
  // App.jsx-local, which keeps this an integration test of the app's real code path.
  const __core = require(${JSON.stringify(path.join(__dirname, 'combat.mjs').replace(/\\/g, '/'))});
  const createEncounter = __core.createEncounter, stepEncounter = __core.stepEncounter;
  const party=[
    {char:buildBotChar("warrior","",60,60), role:"tank",   tier:botTier(1800)},
    {char:buildBotChar("paladin","",60,60), role:"healer", tier:botTier(1800)},
    {char:buildBotChar("mage","",60,60),    role:"dps",    tier:botTier(1800)},
    {char:buildBotChar("rogue","",60,60),   role:"dps",    tier:botTier(1800)},
  ];
  const sum=(s)=>JSON.stringify({tick:s.tick,elapsed:s.elapsed,cleared:s.cleared,wiped:s.wiped,
    allies:s.allies.map(a=>[a.id,a.hp|0,a.down?1:0]),enemies:s.enemies.map(e=>[e.id,e.hp|0]),logLen:s.log.length});
  const play=(s0)=>{let s=s0,n=0;while(!s.cleared&&!s.wiped&&n<6000){s=stepEncounter(s,120);n++;}return{steps:n,sum:sum(s)};};
  const st0=createEncounter({party,boss:"ashen",seed:777});
  const r1=play(st0), r2=play(st0);
  const det=r1.sum===r2.sum&&r1.steps===r2.steps;
  const A=play(createEncounter({party,boss:"ashen",seed:111})).sum;
  const B=play(createEncounter({party,boss:"ashen",seed:222})).sum;
  console.log("steps:",r1.steps,"| DETERMINISTIC:",det,"| SEED MATTERS:",A!==B);
  process.exit(det && A!==B ? 0 : 1);
})();`;
const run = path.join(dir, 'harness.cjs'); fs.writeFileSync(run, js);
require(run);
