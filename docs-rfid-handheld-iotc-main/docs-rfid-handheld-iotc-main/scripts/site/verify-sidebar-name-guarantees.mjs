#!/usr/bin/env node
/**
 * MUTATION PROOF FOR THE SIDEBAR-NAME GUARANTEES. A developer tool, deliberately NOT a CI gate.
 *
 * Introduces eight specific mistakes, one at a time, and requires `tsc` to reject each. A case
 * that COMPILES is a guarantee the comments in src/components/siteSections.ts,
 * sidebars/literal-keys-guard.ts and docusaurus.config.ts claim, and that the compiler does not
 * actually deliver.
 *
 * WHY IT IS NOT WIRED INTO validate.yml. Seven of the eight are enforced by `npm run typecheck`
 * on every push already — that is the whole point of moving them into the type system — so
 * running them again as eight separate `tsc` invocations would add roughly two minutes to every
 * pull request to re-derive what the typecheck step has just proven. Its value is at DESIGN
 * time: run it after touching this wiring, or when a comment here claims something you want to
 * confirm. The per-commit half of this job belongs to `lint:sidebar-sources`, which checks the
 * things `tsc` structurally cannot see.
 *
 * WHY IT EXISTS AT ALL, given that. Every one of these guarantees was verified exactly once, by
 * hand, in a scratch directory that is gitignored — so the strongest evidence that any of them
 * held was not reproducible by anyone else and would have vanished with one working copy. Three
 * of the eight cases below were SILENT before 2026-09-07, and case 6 is a regression that
 * degrades everything else while leaving the build green; a claim like that should not rest on
 * someone's memory of having checked it.
 *
 * IT MUTATES TRACKED FILES, AND EVERY RECOVERY PATH IS OFF-DISK RATHER THAN OFF GIT.
 *
 * Do not reach for `git checkout` to recover from this tool. Its whole purpose is to be run
 * "after touching this wiring" — i.e. precisely when your work is NOT yet committed — so
 * discarding to HEAD is as likely to destroy the change under test as to rescue it. An earlier
 * version of this note said both things in consecutive sentences ("`git checkout` would
 * silently revert the work under test" and "the content is one `git checkout` away"), which is
 * worse than saying neither: the reader acts on the second.
 *
 * WHAT IT GUARANTEES INSTEAD, in the order the protections fire:
 *   1. Before touching anything it copies all four files to a timestamped directory under the
 *      system temp dir and PRINTS THE PATH. That is the recovery instruction: copy them back.
 *      It is correct whether or not your work is committed, which `git checkout` is not.
 *   2. It takes an exclusive lock (`O_EXCL`) so a second run cannot start. Without one, the
 *      second run reads the first's deliberate mistake as its own pristine baseline and writes
 *      that back at the end — permanently corrupting a tracked file, with a plausible-looking
 *      exit 0. The lock file doubles as a crashed-run marker.
 *   3. It installs handlers for SIGINT/SIGTERM/SIGHUP/SIGBREAK and for an uncaught exception,
 *      each restoring before exit. `finally` alone is not enough: Node's default signal
 *      disposition terminates the process without unwinding, so Ctrl-C during any of the nine
 *      `tsc` runs — several minutes, in which the tool used to print nothing at all — left a
 *      tracked source file mutated with no message saying which.
 *   4. It names each file on stdout before mutating it, so even a `kill -9` leaves a record of
 *      what was in flight.
 * All three of those were audit findings against this file on 2026-09-07, not hypotheticals.
 *
 * `--check-anchors` IS THE CHEAP MODE, AND IT IS WHY THIS TOOL DOES NOT ROT. The anchors below
 * are hand-copied source snippets, so they go stale as the files they point into are edited,
 * and nothing runs the full tool in CI (deliberately — see above). `--check-anchors` asserts
 * every anchor still matches exactly once and exits in milliseconds without mutating anything
 * or invoking `tsc`, so validate.yml can run it on every push. Anchor rot therefore surfaces as
 * a named CI failure rather than as a surprise the next time someone runs the real thing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SECTIONS = 'src/components/siteSections.ts';
const CONFIG = 'docusaurus.config.ts';
const GUIDES = 'sidebars/guides.ts';
const MQTT = 'sidebars/api-mqtt.ts';
const PROBE = 'src/components/__verify_leak_probe.ts';

const log = (...a) => console.log('[verify-sidebar-names]', ...a);

const FILES = [SECTIONS, CONFIG, GUIDES, MQTT];
const backup = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const LOCK = '.verify-sidebar-names.lock';

/* Everything below only arms when the tool is actually going to mutate. `--check-anchors` runs
   none of it, which is what keeps that mode safe to put in CI. */
let lockFd;
let backupDir;
let restored = false;

function armSafety() {
  try {
    lockFd = fs.openSync(LOCK, 'wx');
    fs.writeSync(lockFd, `pid ${process.pid}\n`);
  } catch (e) {
    if (e.code === 'EEXIST') {
      console.error(
        `[verify-sidebar-names] REFUSING TO START — ${LOCK} exists, so another run holds the ` +
          `lock or a previous run died. Two concurrent runs permanently corrupt a tracked file: ` +
          `the second reads the first's deliberate mistake as its baseline and writes it back. ` +
          `If no other run is active, check \`git diff\` and delete ${LOCK}.`,
      );
      process.exit(2);
    }
    throw e;
  }

  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sidebar-names-backup-'));
  for (const f of FILES) fs.writeFileSync(path.join(backupDir, path.basename(f)), backup[f]);
  log(`backups written to ${backupDir}`);
  log('if this run is interrupted and does not restore, copy those files back over:');
  for (const f of FILES) log(`    ${f}`);

  /* `finally` does NOT run when the process is signalled — Node's default disposition
     terminates without unwinding. These handlers are the only thing standing between a Ctrl-C
     and a mutated tracked file. */
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => {
      console.log('');
      log(`${sig} received — restoring before exit.`);
      restore();
      process.exit(130);
    });
  }
  process.on('uncaughtException', (e) => {
    log(`uncaught ${e && e.message} — restoring before exit.`);
    restore();
    throw e;
  });
}

function tsc() {
  const r = spawnSync('npx', ['tsc', '--noEmit'], {encoding: 'utf8', shell: true});
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const first = out.split('\n').find((l) => l.includes('error TS')) ?? '(no TS error line)';
  return {code: r.status, line: first.trim()};
}

/* Idempotent, because it can be reached from a signal handler, from `finally`, and from the
   uncaught-exception handler in the same run. */
function restore() {
  if (restored) return;
  restored = true;
  for (const [f, s] of Object.entries(backup)) fs.writeFileSync(f, s);
  if (fs.existsSync(PROBE)) fs.rmSync(PROBE);
  if (lockFd !== undefined) {
    try {
      fs.closeSync(lockFd);
      fs.rmSync(LOCK, {force: true});
    } catch {
      /* the lock is advisory; failing to clear it must not mask the restore */
    }
  }
}

/**
 * Anchors below are written with `\n`; these files are CRLF in the working copy.
 *
 * Node's `readFileSync(f, 'utf8')` preserves `\r\n` verbatim, unlike Python's `read_text`,
 * which normalises it — so a direct port of this tool matched ZERO multi-line anchors on
 * Windows and would have reported "0 of 8 caught" if the anchor-count assertion below had not
 * turned that into a hard error first. Converting the anchor to the file's own EOL keeps the
 * cases readable AND leaves the file's line endings untouched, which matters because
 * .gitattributes normalisation means a rewritten EOL would show up as a whole-file diff.
 */
const toFileEol = (text, src) => (src.includes('\r\n') ? text.split('\n').join('\r\n') : text);

/** [label, file, anchor, replacement] — anchors must match exactly once. */
const CASES = [
  [
    'a `parent` naming a section that does not exist',
    SECTIONS,
    "    parent: 'apiIndex',\n  },\n  'api-mqtt': {",
    "    parent: 'apiIndexx',\n  },\n  'api-mqtt': {",
  ],
  [
    'a row missing from the map',
    SECTIONS,
    "  resources: {title: 'Resources', href: '/resources'},\n",
    '',
  ],
  [
    'a misspelled key in the map',
    SECTIONS,
    "  docs: {title: 'Guides', href: '/guides'},",
    "  doc: {title: 'Guides', href: '/guides'},",
  ],
  // --- the three that were SILENT before 2026-09-07 ---
  ['RENAMING a sidebar in sidebars/guides.ts', GUIDES, '\n  docs: [', '\n  guides: ['],
  [
    'ADDING a sidebar in sidebars/api-mqtt.ts',
    MQTT,
    "const sidebars = {\n  'api-mqtt': [",
    "const sidebars = {\n  'api-mqtt-v2': [],\n  'api-mqtt': [",
  ],
  [
    're-adding `: SidebarsConfig` (degrades everything, otherwise silent)',
    MQTT,
    'const sidebars = {',
    'const sidebars: SidebarsConfig = {',
  ],
  /* RETIRED 2026-09-20, and the reason is that the subject no longer exists rather than that the
     guarantee stopped mattering. This case mutated the navbar's one remaining `sidebarId` — the
     REST item's — to prove a typo there fails `npm run typecheck`. The REST row was removed from
     the navbar that day (see docusaurus.config.ts), and the MQTT row has been a `type: 'doc'` link
     since IA v3, so the navbar now declares no `sidebarId` at all and there is nothing to mutate.
     The guarantee itself is untouched: `satisfies SidebarName` still types every sidebarId the
     project declares, and cases 1 to 6 still exercise it in sidebars/*.ts and siteSections.ts.
     Restore this case, anchored to the new row, if a navbar item ever carries a sidebarId again. */
];

/* THE CHEAP MODE. Asserts the anchors still address the files, without mutating anything and
   without invoking tsc, so it can run on every push and turn anchor rot into a named failure. */
if (process.argv.includes('--check-anchors')) {
  const problems = [];
  for (const [label, file, rawAnchor] of CASES) {
    const src = backup[file];
    const hits = src.split(toFileEol(rawAnchor, src)).length - 1;
    if (hits !== 1) problems.push(`${file}: anchor for "${label}" matches ${hits}x, want 1`);
  }
  if (problems.length) {
    log(`ANCHORS ROTTED — ${problems.length} of ${CASES.length}:`);
    for (const p of problems) console.log(`  - ${p}`);
    log('Re-anchor the affected cases; until then this tool cannot prove anything.');
    process.exit(2);
  }
  log(`ANCHORS OK — all ${CASES.length} address their file exactly once`);
  process.exit(0);
}

armSafety();

const results = [];
try {
  for (const [i, [label, file, rawAnchor, rawReplacement]] of CASES.entries()) {
    const src = backup[file];
    log(`case ${i + 1}/${CASES.length + 1} — mutating ${file} (${label})`);
    const anchor = toFileEol(rawAnchor, src);
    const replacement = toFileEol(rawReplacement, src);
    const hits = src.split(anchor).length - 1;
    if (hits !== 1) {
      throw new Error(
        `anchor for "${label}" matched ${hits}x in ${file} — the file moved under this tool, ` +
          `so its cases need re-anchoring before the result means anything.`,
      );
    }
    fs.writeFileSync(file, src.replace(anchor, replacement));
    results.push([label, ...Object.values(tsc())]);
    fs.writeFileSync(file, src);
  }

  // Case 8: the module boundary around SECTIONS_BY_SIDEBAR. `noImplicitAny` is unset in this
  // project, so `MAP[someString]` compiles and yields `any` — the narrowed key type cannot
  // enforce the guarded lookup. Module scope can, at every compiler setting.
  log(`case ${CASES.length + 1}/${CASES.length + 1} — creating ${PROBE}`);
  fs.writeFileSync(
    PROBE,
    "import {SECTIONS_BY_SIDEBAR} from '@site/src/components/siteSections';\n" +
      'export const probe = SECTIONS_BY_SIDEBAR;\n',
  );
  results.push(['reaching the map from another module', ...Object.values(tsc())]);
} finally {
  restore();
}

console.log('');
log(`Tree restored; backups left at ${backupDir} for this session.`);
console.log('');
let bad = false;
for (const [label, code, line] of results) {
  const caught = code !== 0;
  bad = bad || !caught;
  console.log(`  ${caught ? 'CAUGHT ' : 'MISSED  <-- GUARANTEE IS NOT REAL'} exit=${code}  ${label}`);
  console.log(`      ${line.slice(0, 200)}\n`);
}

const {code, line} = tsc();
console.log(`restored tree typechecks: ${code === 0 ? 'yes' : `NO -- ${line}`}`);
log(bad || code !== 0 ? 'VERIFY FAIL' : `VERIFY OK — ${results.length}/${results.length} caught`);
process.exit(bad || code !== 0 ? 2 : 0);
