/* Who is allowed to call what.
 *
 * This project's schema has been carrying a false statement since 0001:
 *
 *   revoke all on function _wallet_add_gold(uuid,bigint) from public;  -- internal only
 *
 * Supabase grants EXECUTE to `anon` and `authenticated` DIRECTLY, not through PUBLIC, so revoking
 * PUBLIC removes nothing. `_wallet_add_gold` takes a user id and an amount, performs no auth check,
 * and was reachable over /rest/v1/rpc/_wallet_add_gold WITHOUT SIGNING IN — anyone could mint gold
 * into any wallet. 0018 closes it, and 0016 closed the same mistake in 0015.
 *
 * So the rule being pinned here is: NEVER trust a revoke from PUBLIC. Every closure must name the
 * role. And the allowlist that decides what stays open must match what the client actually calls —
 * an RPC added to the client without being added to 0018 is denied at runtime for every player,
 * which is a failure mode no unit test elsewhere can see, because it lives in the grant table.
 *
 *   node game-core/grants.test.cjs
 *
 * Reads files only — no transpile, no database.
 */
const fs = require('fs');
const path = require('path');

const MIG = path.join(__dirname, '..', 'supabase', 'migrations');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
const read = (f) => fs.readFileSync(path.join(MIG, f), 'utf8');
const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const allSql = files.map(read).join('\n');

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };
const section = (t) => console.log('\n' + t);

// ---- the client's RPC surface, read from the client -------------------------------------------
// Everything the client can reach. If this list and 0018's allowlist disagree, one of them is wrong.
const clientRpcs = [...fs.readFileSync(SRC, 'utf8').matchAll(/\.rpc\(\s*["']([a-z0-9_]+)["']/g)]
  .map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort();

// ---- the allowlist, read from the LAST migration that declares one -----------------------------
// Deliberately not pinned to a filename. 0018 was the authority until 0020 superseded it, and a
// test that keeps reading the superseded file describes a state the database is no longer in.
const lockFile = files.filter((f) => /keep\s+text\[\]/.test(read(f))).pop();
const lockSql = lockFile ? read(lockFile) : '';
const keepBlock = /keep\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(lockSql);
const keep = keepBlock ? [...keepBlock[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort() : [];

section('The allowlist and the client agree');
ok(keep.length > 0, `the keep[] array parses out of the operative lock (${lockFile})`);
ok(clientRpcs.length > 0, 'the client calls at least one RPC — the scan is not silently empty');
for (const r of clientRpcs) {
  ok(keep.includes(r), `the client calls ${r}(), and the lock keeps it open to authenticated`);
}
// The reverse direction matters just as much: an allowlist that quietly grows is an allowlist that
// has stopped meaning anything. daily_history is the one deliberate extra — it is the calendar's
// history read, it filters on auth.uid(), and it is there for the client to adopt.
const extras = keep.filter((k) => !clientRpcs.includes(k));
ok(extras.length === 1 && extras[0] === 'daily_history',
   `nothing is open that the client does not call, except daily_history (found: ${extras.join(', ') || 'none'})`);

section('anon cannot execute anything, and the sweep is unconditional');
ok(/revoke execute on function %s from anon/.test(lockSql),
   'anon is revoked by a loop over pg_proc, not by a hand-written list that can fall behind');
ok(/where n\.nspname = 'public' and p\.prosecdef/.test(lockSql),
   '…and that loop covers EVERY security definer function in public, present and future-at-apply-time');
// THE CHECK 0018 NEEDED AND DID NOT HAVE. Postgres grants EXECUTE on a new function to PUBLIC by
// default, and anon is a member of PUBLIC — so revoking anon by name while leaving PUBLIC standing
// changes the ACL and changes nothing about who can call the function. Thirteen definer functions
// were reachable anonymously for a day because of exactly this, including ah_purchase and
// mail_claim. Revoking PUBLIC is the load-bearing line; the other two are tidiness.
ok(/revoke execute on function %s from public/.test(lockSql),
   'PUBLIC is revoked too — without it, revoking anon by name is cosmetic');
ok(/grant execute on function %s to authenticated/.test(lockSql),
   'the allowlist is granted back EXPLICITLY, so the game never depends on an inherited default');
ok(/has_function_privilege\('anon'/.test(lockSql),
   'the migration verifies itself with has_function_privilege, which follows role membership…');
ok(/raise exception/.test(lockSql) && /the client calls these/.test(lockSql),
   '…and refuses to finish if anon still has access or the client has lost it');
// The specific hole. Worth naming, because a loop is easy to read past.
ok(/_wallet_add_gold/.test(lockSql),
   '_wallet_add_gold is named in the migration that closes it, so the record says what was open');

section('No closure relies on revoking PUBLIC alone');
// Every `revoke ... from public` in the schema is a door someone believed they had shut. Each one
// must ALSO be closed against anon — either by name, or by 0018's sweep, which only covers a
// function if that function is actually declared SECURITY DEFINER. A definer-less helper that
// revoked PUBLIC and nothing else would still be wide open, and the sweep would never see it.
{
  const definer = new Set(
    [...allSql.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\$\$/gi)]
      .filter((m) => /security\s+definer/i.test(m[2])).map((m) => m[1]));
  ok(definer.size > 5, `the definer scan found ${definer.size} functions — it is not silently empty`);
  for (const f of files) {
    for (const m of read(f).matchAll(/revoke\s+(?:all|execute)\s+on\s+function\s+([a-z0-9_]+)\s*\([^)]*\)\s*from\s+public/gi)) {
      const fn = m[1];
      const byName = new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s*from\\s+anon`, 'i').test(allSql);
      const bySweep = definer.has(fn) && /revoke execute on function %s from anon/.test(lockSql);
      ok(byName || bySweep,
         `${f}: ${fn}() revokes PUBLIC — and anon is closed too, ${byName ? 'by name' : "by 0018's definer sweep"}`);
    }
  }
}

section('The auction-house pricing weights are not writable by the API roles');
// 0014 shipped ah_stat_weight with RLS off and anon=arwdDxtm. ah_gear_base_value reads it to price
// every listing and to build the band a posted price must fall in, so a writable weights table is a
// licence to list junk for millions. The 0014 tests checked the weights MATCHED the client's, which
// says nothing about who may change them.
const lockWeights = read('0017_lock_ah_stat_weight.sql');
ok(/alter table ah_stat_weight enable row level security/.test(lockWeights), 'RLS is on');
ok(/revoke all on table ah_stat_weight from anon, authenticated/.test(lockWeights),
   '…and both API roles lose the table outright — nothing in the client reads it');
ok(!/from\s+["']?ah_stat_weight/.test(fs.readFileSync(SRC, 'utf8')),
   'the client really does not select from it, so closing it breaks nothing');

section('Player-owned rows are scoped to signed-in callers');
const scoped = read('0019_scope_policies_to_authenticated.sql');
for (const t of ['daily_claim', 'item', 'ledger', 'mail', 'material', 'wallet', 'saves', 'pvp_snapshot']) {
  ok(new RegExp(`on ${t}\\b[\\s\\S]{0,80}to authenticated`).test(scoped), `${t}'s policies name the authenticated role`);
}
{
  const created = [...scoped.matchAll(/create policy[^;]*;/g)].map((m) => m[0]);
  ok(created.length === (scoped.match(/drop policy if exists/g) || []).length,
     'every policy recreated is one that was dropped — none is invented, none is left behind');
  const unscoped = created.filter((c) => !/\bto authenticated\b/.test(c));
  ok(created.length > 8 && unscoped.length === 0,
     `all ${created.length} policies are recreated \`to authenticated\` rather than \`to public\`` +
     (unscoped.length ? ` — missing on: ${unscoped.map((u) => /on (\w+)/.exec(u)[1]).join(', ')}` : ''));
}
{
  // A policy recreated without its WITH CHECK would let a player write another player's row while
  // still reading only their own — the failure would be silent and one-directional.
  const writes = [...scoped.matchAll(/create policy[^;]*for (insert|update)[^;]*/g)].map((m) => m[0]);
  ok(writes.length > 0, 'the migration touches write policies at all');
  ok(writes.every((w) => /with check \(auth\.uid\(\) = user_id\)/.test(w)),
     'every INSERT and UPDATE policy still carries its WITH CHECK');
}

section('What stays public is stated, not forgotten');
ok(/ah_config[\s\S]{0,400}public by design/i.test(scoped) || /deliberately left public/i.test(scoped),
   '0019 names the reads that stay open to anonymous callers and says why');

console.log(fail ? `\n❌ ${fail} grant check(s) failed`
                 : '\n✅ grants: anon is shut out, the allowlist matches the client, and no closure trusts a PUBLIC revoke');
process.exit(fail ? 1 : 0);
