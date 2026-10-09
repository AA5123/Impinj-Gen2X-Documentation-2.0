#!/usr/bin/env node
/**
 * THE RENDERED SITE MUST AGREE WITH `SECTIONS_BY_SIDEBAR`, checked on the built HTML.
 *
 * For every section declared in src/components/siteSections.ts, on that section's own landing
 * page:
 *   1. the sidebar panel title is the section's `title`; and
 *   2. the breadcrumb trail is exactly `Home` followed by the section's ancestor chain; and
 *   3. nothing visible in the trail is left unaccounted for by those crumbs.
 *
 * WHY THIS IS WORTH A GATE. That agreement is the entire reason the map exists. It has two
 * readers — the sidebar panel header (src/theme/DocSidebar/Desktop/Content) and the breadcrumb
 * trail (src/theme/DocBreadcrumbs) — and they render within a few hundred pixels of each other,
 * so a disagreement between them is visible to any reader and attributable to nobody. The type
 * system cannot reach this: both readers typecheck perfectly while rendering different strings,
 * because the failure would be in the DOM they produce, not in the data they read.
 *
 * EXPECTATIONS ARE DERIVED, NOT LISTED. The map is read out of siteSections.ts and the ancestor
 * chain is recomputed from its `parent` edges — the same walk `sectionTrail` performs. So this
 * gate needs no upkeep when a section is added, renamed or re-parented, and it is not a fourth
 * restatement of the same five names.
 *
 * THE MAP IS PARSED, NOT REGEXED — rewritten 2026-09-07 after an adversarial audit. The first
 * version located the literal by counting braces, stripped comments with a regex, and matched
 * rows with a pattern whose object body was `[^{}]*`. Reproduced consequences, every one a
 * silent pass over a section that was never checked:
 *   - a row behind a block comment was unreachable, so `apiIndex` vanished from the map and
 *     every `parent: 'apiIndex'` pointed at a section the walk did not know. The chains came
 *     out a crumb short and the gate reported THE SITE as broken when the site was right. That
 *     was fixed once by stripping comments — a patch to the symptom.
 *   - a double-quoted or backtick row was dropped entirely.
 *   - a template-literal `href` contains braces, so `[^{}]*` dropped that row too; a nested
 *     object in a row invented a phantom section.
 * `./lib/ts-source.mjs` reads the literal with the TypeScript parser instead, which understands
 * quoting, comments and nesting by construction rather than by rule.
 *
 * A ROW IT CANNOT READ IS A FAILURE, NOT A SKIP — the property all three of those defects
 * lacked. `objectLiteralRows` returns everything it could not model in `unparsed`, and this gate
 * treats a non-empty `unparsed` as a hard finding. "I could not read this row" must never be
 * reported as "this row is fine", because a gate that silently checks four sections out of five
 * still exits 0.
 *
 * ON A LANDING PAGE THE SECTION'S OWN CRUMB IS THE ACTIVE ONE, and Docusaurus renders the
 * active crumb as `<span class=breadcrumbs__link aria-current=page>` rather than an `<a>`.
 * Matching only anchors silently drops it and makes every landing page look one crumb short —
 * measured, after a first version of this check did exactly that.
 *
 * THE HTML IS STILL READ WITH PATTERNS, AND CHECK 3 IS WHY THAT IS SAFE. There is no HTML
 * parser in this project's dependencies, and adding one for two selectors is not worth it — but
 * a non-greedy match to a closing tag can close at the WRONG tag when a same-named element is
 * nested inside, which truncates a label and passes. So the extraction is not trusted on its
 * own: the whole visible text of the breadcrumb nav is stripped independently, and the crumbs
 * must ACCOUNT FOR ALL OF IT. A truncated label leaves text over, and leftover text is a
 * finding. That converts an unverifiable regex into a checkable one.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {objectLiteralRows} from './lib/ts-source.mjs';

const SECTIONS_SRC = 'src/components/siteSections.ts';
const BUILD = 'build';
const HOME_CRUMB = 'Home';

const EXIT_OK = 0;
const EXIT_FINDINGS = 2;
const EXIT_CANNOT_RUN = 3;

const log = (...a) => console.log('[lint-section-rendering]', ...a);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripTags = (s) => norm(s.replace(/<[^>]+>/g, ' '));

/** The chain of sections a page sits under, root first — mirrors `sectionTrail`, cycle-safe. */
function trailFor(rows, key) {
  const out = [];
  const walked = new Set();
  let k = key;
  while (k !== undefined && !walked.has(k)) {
    const row = rows[k];
    if (!row) break;
    walked.add(k);
    out.unshift(row);
    k = row.fields.parent;
  }
  return out;
}

export function panelTitle(html) {
  const m = html.match(/<a[^>]*class="[^"]*sidebar-header-title[^"]*"[^>]*>([\s\S]*?)<\/a>/);
  if (!m) throw new Error('no `sidebar-header-title` anchor in this page');
  return stripTags(m[1]);
}

/** The breadcrumb nav's markup, so its total visible text can be compared against the crumbs. */
export function breadcrumbNav(html) {
  const start = html.search(/<nav[^>]*class=(?:"[^"]*theme-doc-breadcrumbs|theme-doc-breadcrumbs)/);
  if (start === -1) throw new Error('no `theme-doc-breadcrumbs` nav in this page');
  const end = html.indexOf('</nav>', start);
  if (end === -1) throw new Error('unterminated `theme-doc-breadcrumbs` nav');
  return html.slice(start, end);
}

export function crumbLabels(navHtml) {
  const re =
    /<(a|span)[^>]*\bclass=(?:"[^"]*breadcrumbs__link[^"]*"|breadcrumbs__link)[^>]*>([\s\S]*?)<\/\1>/g;
  const out = [...navHtml.matchAll(re)].map((m) => stripTags(m[2])).filter(Boolean);
  if (out.length === 0) throw new Error('no `breadcrumbs__link` elements in this page');
  return out;
}

/**
 * Text visible in the trail that the extracted crumbs do not account for.
 *
 * This is the guard on the extraction itself. Comparing as multisets of words rather than by
 * string equality keeps it robust to the separator markup and to whitespace, while still
 * catching the case that matters: a label truncated at a wrongly-matched closing tag leaves its
 * tail in the nav's text and out of the crumbs.
 */
export function unaccountedTrailText(navHtml, labels) {
  const words = (s) => norm(s).split(' ').filter(Boolean);
  const left = words(stripTags(navHtml));
  for (const w of labels.flatMap(words)) {
    const i = left.indexOf(w);
    if (i !== -1) left.splice(i, 1);
  }
  return left;
}

/* THERE IS NO STALENESS CHECK, AND THAT IS REASONED RATHER THAN OMITTED.
 *
 * The audit raised "can this gate pass against a build/ produced before the last source change"
 * as a possible false pass. It cannot, and the reason is what this gate compares: rendered
 * output against the map, not one timestamp against another.
 *   - a title changed in the map -> the stale HTML still says the old one -> FINDINGS
 *   - a `parent` changed        -> the stale trail is wrong               -> FINDINGS
 *   - a section added           -> no built page at its href             -> FINDINGS
 *   - a section removed         -> the gate iterates map rows, so the orphaned page is simply
 *                                  not checked, which is harmless
 * So a stale build cannot make this gate agree; it can only make it DISAGREE for a reason that
 * is not a site defect. The risk is a confusing failure, not a silent pass — the opposite of
 * what a staleness gate would protect against.
 *   A FIRST VERSION DID GATE ON mtime AND HAD TO BE REMOVED. Restoring a file byte-identically
 * (a mutation test cleaning up, a `git checkout`, an editor save with no edit) bumps its mtime,
 * so the gate refused to run on a tree that was in fact perfectly fresh. A gate that cries wolf
 * gets routed around, which is the failure mode validate.yml's own header warns about at
 * length. Content hashing would fix the false alarm but needs the build to record what it was
 * built from, which is a build-pipeline change to defend against a risk that does not exist.
 *   What the findings output does instead is name the possibility, so a developer reading a
 * disagreement is told the cheapest explanation first. See the hint below.
 */

export function main({sectionsPath = SECTIONS_SRC, buildDir = BUILD} = {}) {
  let parsed;
  try {
    parsed = objectLiteralRows(sectionsPath, 'SECTIONS_BY_SIDEBAR');
  } catch (e) {
    log(`CANNOT RUN — ${e.message}`);
    return EXIT_CANNOT_RUN;
  }
  const {rows, unparsed} = parsed;

  /* NOT-BUILT AND STALE-BUILD ARE SEPARATED FROM FINDINGS, deliberately. The first version
     reported a missing page as an ordinary finding, so a developer who ran this before building
     got five entries that read like site defects. They are not defects in the site, they are
     this gate being unable to answer — a different thing, and it deserves a different exit. */
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    log(`CANNOT RUN — no built site at ${buildDir}/. Run \`npm run build\` first.`);
    log('This gate reads the rendered HTML; it has nothing to check until the site exists.');
    return EXIT_CANNOT_RUN;
  }
  const findings = [];
  let checked = 0;

  for (const u of unparsed) {
    findings.push(
      `${sectionsPath}:${u.line} — cannot read this row of \`SECTIONS_BY_SIDEBAR\` ` +
        `(${u.reason}): \`${u.text}\`. Reported rather than skipped: a row nobody can read is ` +
        `not a row anybody has checked, and a gate that silently checks fewer sections than ` +
        `exist still exits 0.`,
    );
  }

  for (const [key, row] of Object.entries(rows)) {
    const {title, href} = row.fields;
    if (!title || !href) {
      findings.push(
        `${key}: row is missing ${!title ? '`title`' : '`href`'} — cannot check its rendering.`,
      );
      continue;
    }
    const page = path.join(buildDir, href.replace(/^\//, ''), 'index.html');
    if (!fs.existsSync(page)) {
      findings.push(
        `${key}: no built page at ${page}. \`href\` in the map does not correspond to a route.`,
      );
      continue;
    }

    const html = fs.readFileSync(page, 'utf8');
    let renderedTitle;
    let nav;
    let crumbs;
    try {
      renderedTitle = panelTitle(html);
      nav = breadcrumbNav(html);
      crumbs = crumbLabels(nav);
    } catch (e) {
      findings.push(`${key} (${page}): ${e.message}. Markup drift — see this file's header.`);
      continue;
    }
    checked += 1;

    if (renderedTitle !== title) {
      findings.push(
        `${key}: sidebar panel title is "${renderedTitle}" but the map declares "${title}".`,
      );
    }

    const want = [HOME_CRUMB, ...trailFor(rows, key).map((r) => r.fields.title)];
    if (crumbs.length !== want.length || crumbs.some((c, i) => c !== want[i])) {
      findings.push(
        `${key}: breadcrumb trail is [${crumbs.join(' > ')}] but the map's ancestor chain ` +
          `gives [${want.join(' > ')}].`,
      );
    }

    // CHECK 3 — the extraction accounted for everything visible in the trail.
    const leftover = unaccountedTrailText(nav, crumbs);
    if (leftover.length) {
      findings.push(
        `${key}: the trail renders text the extracted crumbs do not account for: ` +
          `${leftover.map((w) => `"${w}"`).join(', ')}. Either a crumb label was truncated by a ` +
          `nested element closing the match early, or the trail contains a crumb this gate did ` +
          `not see. Both are unchecked output, so both fail.`,
      );
    }

    const last = want[want.length - 1];
    if (renderedTitle === title && last !== title) {
      findings.push(
        `${key}: the last crumb is "${last}" while the panel one column left says "${title}". ` +
          `These are the two places a reader sees the section named at the same time.`,
      );
    }
  }

  if (findings.length) {
    log(`FAIL — ${findings.length} finding(s) across ${Object.keys(rows).length} section(s):`);
    for (const f of findings) console.log(`\n  - ${f}`);
    console.log('');
    log(
      'If you have edited src/components/siteSections.ts, a sidebar or a page since the last ' +
        '`npm run build`, rebuild and re-run before reading these as site defects — this gate ' +
        'compares the map against RENDERED output, so an out-of-date build/ disagrees for a ' +
        'reason that is not a defect.',
    );
    return EXIT_FINDINGS;
  }
  log(
    `OK — ${checked} section(s) render the title and ancestor chain their map row declares ` +
      `(${Object.values(rows).map((r) => r.fields.title).join(', ')})`,
  );
  log('OK — every crumb rendered in each trail was accounted for');
  return EXIT_OK;
}

/* --selftest drives the map reader and the HTML extractors with fixtures, so it needs no build
   and proves each can fail. The cases below are the audit's reproduced defects, kept as
   regressions: every one of them once passed. */
if (process.argv.includes('--selftest')) {
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'section-rendering-selftest-'));
  const cases = [];
  const add = (label, fn) => cases.push([label, fn]);

  const mapFile = (body) => {
    const f = path.join(tmp, `m${cases.length}.ts`);
    fs.writeFileSync(
      f,
      `type SidebarName = string;\ntype SiteSection = {title: string; href: string; parent?: SidebarName};\nconst SECTIONS_BY_SIDEBAR: Record<string, SiteSection> = {\n${body}\n};\nexport default SECTIONS_BY_SIDEBAR;\n`,
    );
    return f;
  };
  const readRows = (body) => objectLiteralRows(mapFile(body), 'SECTIONS_BY_SIDEBAR');

  add('reads a row that sits behind a block comment', () => {
    const {rows, unparsed} = readRows(
      `  'api-mqtt': {title: 'MQTT API', href: '/api-reference/mqtt', parent: 'apiIndex'},\n` +
        `  /* a multi-line note about\n     why this row carries no version */\n` +
        `  apiIndex: {title: 'API Reference', href: '/api-reference'},`,
    );
    return Object.keys(rows).length === 2 && rows.apiIndex.fields.title === 'API Reference' && !unparsed.length;
  });

  add('reads a DOUBLE-QUOTED row and its fields', () => {
    const {rows} = readRows(`  "docs": {title: "Guides", href: "/guides"},`);
    return rows.docs?.fields.title === 'Guides' && rows.docs?.fields.href === '/guides';
  });

  add('reads a backtick href', () => {
    const {rows} = readRows('  docs: {title: `Guides`, href: `/guides`},');
    return rows.docs?.fields.href === '/guides';
  });

  add('a row whose value contains a NESTED object is reported, not silently dropped', () => {
    const {rows, unparsed} = readRows(
      `  docs: {title: 'Guides', href: '/guides', badge: {kind: 'new'}},`,
    );
    // The row is still read; the nested field is simply not a string. What must NOT happen is
    // the row vanishing or a phantom section appearing.
    return Object.keys(rows).length === 1 && rows.docs.fields.title === 'Guides' && !unparsed.length;
  });

  add('a SPREAD row is reported in `unparsed` rather than ignored', () => {
    const {unparsed} = readRows(`  ...OTHER,\n  docs: {title: 'Guides', href: '/guides'},`);
    return unparsed.length === 1;
  });

  add('a // commented-out row is not counted', () => {
    const {rows} = readRows(
      `  docs: {title: 'Guides', href: '/guides'},\n  // retired: {title: 'R', href: '/r'},`,
    );
    return Object.keys(rows).length === 1 && rows.retired === undefined;
  });

  add('a field value containing a comma and an apostrophe survives', () => {
    const {rows} = readRows(`  docs: {title: "Guides, and more", href: '/guides'},`);
    return rows.docs?.fields.title === 'Guides, and more';
  });

  add('reads the active (span) crumb, not just anchors', () => {
    const nav =
      '<nav class=theme-doc-breadcrumbs><a class=breadcrumbs__link href=/><span>Home</span></a>' +
      '<a class=breadcrumbs__link href=/x><span>API Reference</span></a>' +
      '<span class=breadcrumbs__link aria-current=page>MQTT API</span></nav>';
    const got = crumbLabels(breadcrumbNav(nav));
    return got.length === 3 && got[2] === 'MQTT API';
  });

  add('a nested same-tag element truncating a label is CAUGHT as unaccounted text', () => {
    const nav =
      '<nav class=theme-doc-breadcrumbs>' +
      '<span class=breadcrumbs__link><span>MQTT</span> API Reference</span></nav>';
    const n = breadcrumbNav(nav);
    const labels = crumbLabels(n);
    // The non-greedy match closes at the inner </span>, so "API Reference" is lost from labels.
    return labels.join('|') === 'MQTT' && unaccountedTrailText(n, labels).join(' ') === 'API Reference';
  });

  add('a healthy trail leaves nothing unaccounted for', () => {
    const nav =
      '<nav class=theme-doc-breadcrumbs><a class=breadcrumbs__link href=/><span>Home</span></a>' +
      '<span class=breadcrumbs__link aria-current=page>Guides</span></nav>';
    const n = breadcrumbNav(nav);
    return unaccountedTrailText(n, crumbLabels(n)).length === 0;
  });

  add('throws on a page with no crumbs rather than passing vacuously', () => {
    try {
      crumbLabels('<div>nothing here</div>');
      return false;
    } catch {
      return true;
    }
  });

  add('throws on a page with no panel title', () => {
    try {
      panelTitle('<div>nothing here</div>');
      return false;
    } catch {
      return true;
    }
  });

  add('extracts the panel title from real-shaped markup', () => {
    return (
      panelTitle(
        '<div class="sidebar-header sidebarHeader_x"><a class="sidebar-header-title sidebarTitle_y" href=/z>MQTT API</a></div>',
      ) === 'MQTT API'
    );
  });

  add('missing build/ is CANNOT-RUN (3), not a list of site findings', () => {
    const f = mapFile(`  docs: {title: 'Guides', href: '/guides'},`);
    const realLog = console.log;
    console.log = () => {};
    try {
      return main({sectionsPath: f, buildDir: path.join(tmp, 'no-such-build')}) === EXIT_CANNOT_RUN;
    } finally {
      console.log = realLog;
    }
  });

  /* The staleness question, tested as the behaviour that actually matters: output built from
     an older map DISAGREES, so it fails rather than passing. That is why no mtime gate is
     needed — see the note above `main`. */
  add('output that disagrees with the map FAILS rather than passing', () => {
    const bdir = path.join(tmp, 'stalebuild');
    fs.mkdirSync(path.join(bdir, 'guides'), {recursive: true});
    fs.writeFileSync(path.join(bdir, 'index.html'), 'x');
    fs.writeFileSync(
      path.join(bdir, 'guides', 'index.html'),
      '<div class="sidebar-header x"><a class="sidebar-header-title y" href=/g>OLD TITLE</a></div>' +
        '<nav class=theme-doc-breadcrumbs><a class=breadcrumbs__link href=/><span>Home</span></a>' +
        '<span class=breadcrumbs__link aria-current=page>OLD TITLE</span></nav>',
    );
    const f = mapFile(`  docs: {title: 'Guides', href: '/guides'},`);
    const realLog = console.log;
    console.log = () => {};
    try {
      return main({sectionsPath: f, buildDir: bdir}) === EXIT_FINDINGS;
    } finally {
      console.log = realLog;
    }
  });

  let bad = false;
  for (const [label, fn] of cases) {
    let ok = false;
    let err = '';
    try {
      ok = fn() === true;
    } catch (e) {
      err = ` (${e.message})`;
    }
    bad = bad || !ok;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${err}`);
  }

  fs.rmSync(tmp, {recursive: true, force: true});
  console.log('');
  log(bad ? 'SELFTEST FAIL' : `SELFTEST OK — ${cases.length} cases`);
  process.exit(bad ? 2 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main());
}
