#!/usr/bin/env node
/**
 * TWO CHECKS OVER `static/`, because `static/` is copied verbatim into the published
 * site and everything in it serves at a public URL:
 *
 *   1. Every TRACKED file under `static/` must be referenced by at least one tracked
 *      file outside `static/`.
 *   2. Every GENERATED diagram directory under `static/d2/docs/` must still have a
 *      source doc. Check 1 cannot see these — they are gitignored. See CHECK 2 below.
 *
 * WHY THIS EXISTS, and it is the only check restored after the 2026-08-14 linter
 * removal. `static/` is copied verbatim into the published site, so anything left in it
 * SHIPS and serves at a public URL. Nothing enumerated it. Three empty
 * third-party-branded placeholder files (two 71-byte 1x1 transparent PNGs and a
 * 117-byte fully transparent SVG) sat in `static/assets/` and served HTTP 200 from the
 * live site until a person read the directory by hand.
 *
 * CodeQL could not do this job, which is part of why it is gone: it has no extractor
 * for .png/.svg/.txt and no unreferenced-asset query, so a CodeQL run over this tree
 * extracted zero files from `static/` whether or not it was in paths-ignore.
 * The check is a text search, which is why it is eight lines rather than a query.
 *
 * MATCHING IS BY BASENAME, DELIBERATELY. Assets are referenced in many forms —
 * `img/x.png` from config, `/img/x.png` from MDX, `@site/static/img/x.png` from TS,
 * `url(../../static/img/x.png)` from SCSS. Anchoring on the full path would produce
 * false orphans; the basename is the one token every form shares. The cost is that two
 * files with the same basename in different directories cannot be told apart, so a
 * collision is reported rather than resolved.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
/* -z, because `git ls-files` QUOTES any path containing an emoji or a space and a
 * line-split then mis-parses it. That trap has already produced one wrong published
 * figure in this repository. */
const lsFiles = (...a) => git('ls-files', '-z', ...a).split('\0').filter(Boolean);

const EXEMPT = new Set([
  /* Served at a fixed URL by crawlers, never referenced from the source tree. */
  'robots.txt',
]);

/* --------------------------------------------------------------------------
 * CHECK 2: STALE GENERATED DIAGRAM OUTPUT.
 *
 * WHY THE CHECK ABOVE CANNOT SEE THIS. It enumerates `git ls-files static`, and
 * `static/d2/` is gitignored (.gitignore:23) because remark-d2 rebuilds it. So the
 * one subtree in `static/` that changes without a human touching it is the one
 * subtree the guard was blind to — 32 tracked files checked, 166 on disk.
 *
 * WHAT THAT COST, 2026-08-15. remark-d2 writes each diagram to a path derived from
 * its SOURCE DOC's path, and it never deletes. The IA restructure moved 100 docs, so
 * the 67 SVGs rendered from their old paths stayed behind — and `static/` is copied
 * verbatim into `build/`, so all 67 shipped at public URLs. Two of them still
 * rendered "Diagnose & Recover" after that label was renamed everywhere else, which
 * is how a repo-wide grep of the SOURCE can report zero while the SITE serves two.
 *
 * THE CHECK. Every `static/d2/<docs-relative-dir>/` must correspond to a doc source
 * file that still exists. This is precise rather than reference-based on purpose: a
 * d2 SVG is referenced by an <img> the MDX pipeline synthesises from a ```d2``` fence,
 * so its filename appears in NO source file and a basename search would call all 134
 * orphans.
 * ----------------------------------------------------------------------- */
const D2_ROOT = 'static/d2/docs';

function staleD2() {
  if (!fs.existsSync(D2_ROOT)) return [];
  const stale = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (!e.isDirectory()) continue;
      const rel = path.relative(D2_ROOT, p);
      /* A leaf holding SVGs is one doc's diagram set; its source is docs/<rel>.md|mdx */
      const holdsSvg = fs.readdirSync(p).some((f) => f.endsWith('.svg'));
      if (holdsSvg) {
        const hit = ['.md', '.mdx'].some((x) => fs.existsSync(path.join('docs', rel + x)));
        if (!hit) stale.push({ dir: p, rel });
      }
      walk(p);
    }
  };
  walk(D2_ROOT);
  return stale;
}

function main() {
  const stale = staleD2();
  if (stale.length) {
    const bytes = stale.reduce((n, s) => n + fs.readdirSync(s.dir)
      .reduce((m, f) => m + fs.statSync(path.join(s.dir, f)).size, 0), 0);
    console.error(`FAIL — ${stale.length} generated-diagram director(ies) under ${D2_ROOT}/ ` +
      `have no source doc, and ship at a public URL (${bytes} B):\n`);
    for (const s of stale) console.error(`  ${s.dir}  (docs/${s.rel}.md is gone)`);
    console.error('\nThese are remark-d2 output for docs that moved or were deleted. ' +
      'remark-d2 never deletes, so:\n  rm -rf static/d2 && npm run build\n');
    return 1;
  }
  console.log(`lint-static-orphans — no stale diagram output under ${D2_ROOT}/`);

  const assets = lsFiles('static').filter((p) => !EXEMPT.has(path.basename(p)));
  const others = lsFiles().filter((p) => !p.startsWith('static/'));

  /* One pass over the haystack, not one per asset: 34 x 645 file reads is slower and
   * the whole point is that this runs in CI on every push. */
  let hay = '';
  for (const f of others) {
    if (/\.(png|jpe?g|gif|webp|ico|eps|pdf|xlsx|docx|woff2?)$/i.test(f)) continue;
    try {
      hay += fs.readFileSync(f, 'utf8');
    } catch {
      /* unreadable is not a finding here; the reference check is one-directional */
    }
  }

  const collisions = new Map();
  for (const a of assets) {
    const b = path.basename(a);
    collisions.set(b, (collisions.get(b) ?? 0) + 1);
  }

  const orphans = assets.filter((a) => !hay.includes(path.basename(a)));
  const ambiguous = [...collisions].filter(([, n]) => n > 1).map(([b]) => b);

  console.log(`lint-static-orphans — ${assets.length} tracked files under static/ ` +
    `(${EXEMPT.size} exempt), checked against ${others.length} files outside it`);

  if (ambiguous.length) {
    console.log(`  note: ${ambiguous.length} duplicated basename(s), reported not resolved: ` +
      ambiguous.join(', '));
  }

  if (!orphans.length) {
    console.log('  OK — every asset is referenced at least once outside static/');
    return 0;
  }

  console.error(`\nFAIL — ${orphans.length} tracked asset(s) under static/ are referenced ` +
    'by nothing and therefore ship to a public URL for no reason:\n');
  for (const o of orphans) {
    /* statSync, not statSync-and-hope: a path can be TRACKED but absent from the
     * worktree, and an unguarded stat then throws ENOENT and kills the run
     * mid-report — so the operator sees a Node stack trace and a truncated orphan
     * list instead of the finding. Observed with
     * static/img/home/rfd40-premium-with-tc22-mobile-computer.avif, which hid two
     * further orphans behind it. A missing tracked file is itself worth naming. */
    let size;
    try {
      size = `${fs.statSync(o).size} B`;
    } catch {
      size = 'MISSING FROM WORKTREE — tracked but not on disk; git rm it or restore it';
    }
    console.error(`  ${o}  (${size})`);
  }
  console.error('\nEither reference it, or relocate it out of static/. An asset in static/ ' +
    'is published whether or not anything links to it.');
  return 1;
}

/* --selftest proves the detector can FAIL, which is the property a checker that only
 * ever passes does not have. It asserts on a synthetic haystack, touching no real file. */
if (process.argv.includes('--selftest')) {
  const hay = 'a reference to img/used.png and nothing else';
  const cases = [
    ['used.png', true],
    ['unused.png', false],
    ['robots.txt', false],
  ];
  let bad = 0;
  for (const [name, want] of cases) {
    const got = hay.includes(name);
    if (got !== want) { console.error(`SELFTEST FAIL ${name}: got ${got}, want ${want}`); bad++; }
  }

  /* Check 2 is exercised against a REAL temporary tree rather than a synthetic string,
   * because the thing it gets wrong is filesystem walking, not matching. Two cases: a
   * diagram directory whose source doc exists (must pass) and one whose source doc does
   * not (must fail). Without the second, the check could return [] unconditionally and
   * still look green — which is exactly the failure that let 67 stale files ship. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-selftest-'));
  const prev = process.cwd();
  try {
    fs.mkdirSync(path.join(tmp, 'docs/guides/kept'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs/guides/kept/page.md'), '# kept');
    fs.mkdirSync(path.join(tmp, D2_ROOT, 'guides/kept/page'), { recursive: true });
    fs.writeFileSync(path.join(tmp, D2_ROOT, 'guides/kept/page/0.svg'), '<svg/>');
    fs.mkdirSync(path.join(tmp, D2_ROOT, 'guides/moved/page'), { recursive: true });
    fs.writeFileSync(path.join(tmp, D2_ROOT, 'guides/moved/page/0.svg'), '<svg/>');
    process.chdir(tmp);
    const found = staleD2().map((s) => s.rel);
    if (found.length !== 1 || found[0] !== path.join('guides', 'moved', 'page')) {
      console.error(`SELFTEST FAIL staleD2: got ${JSON.stringify(found)}, want ["guides/moved/page"]`);
      bad++;
    }
  } finally {
    process.chdir(prev);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(bad ? 'SELFTEST FAILED'
    : 'SELFTEST OK — 5 cases (3 basename, 2 stale-diagram), 3 deliberate non-matches');
  process.exit(bad ? 2 : 0);
}

process.exit(main());
