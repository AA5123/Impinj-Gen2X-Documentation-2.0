#!/usr/bin/env node
/**
 * FOUR CHECKS OVER THE WIRING between docusaurus.config.ts, sidebars/*.ts and
 * src/components/siteSections.ts. It asks the TypeScript parser and type checker for its facts;
 * it does not match source text.
 *
 *   1. Every sidebar name declared by a file the config LOADS is a member of `SidebarName`, and
 *      `SidebarName` contains nothing else.
 *   2. `keyof typeof sidebars` is a union of string LITERALS in every loaded sidebar file.
 *   3. `SECTIONS_BY_SIDEBAR` has exactly one row per `SidebarName` member.
 *   4. Every `docsPluginId` names a docs plugin instance the config declares.
 *
 * WHY IT EXISTS. `SidebarName` is derived from the sidebar files themselves, and
 * `Record<SidebarName, SiteSection>` is exhaustive over it, so renaming, adding or removing a
 * sidebar NAME is already a build error. What `tsc` cannot see is the set of FILES that union
 * reads — those are three `import` paths written by hand, and no type can ask the config which
 * files it loads. Add a fourth docs plugin instance with its own `sidebarPath` and everything
 * compiles: the new file's sidebars are absent from `SidebarName`, the map needs no rows for
 * them, and every page in that sidebar renders with no panel header and no section ancestors,
 * because `sectionFor()` returns `undefined` for a name it has never heard of.
 *
 * REWRITTEN 2026-09-07 AFTER AN ADVERSARIAL AUDIT FOUND IT COULD BE DEFEATED TWELVE WAYS, all
 * reproduced, all of them a green run over a genuinely broken tree — the precise failure it was
 * written to prevent. The first version read its inputs with regexes:
 *   - `sidebarPath` was recognised in ONE spelling. A double-quoted value, a template literal,
 *     a missing `./`, a subdirectory, a `.js`/`.mjs`/`.json` file, `require.resolve(...)`,
 *     `path.join(__dirname, ...)`, a comment between the colon and the value, a space before the
 *     colon, or a quoted key each made a whole instance invisible to ALL of its checks.
 *   - a `sidebarPath` or a union branch that had been commented out still counted as present.
 *   - the plugin-id check took the first `id:` within 4000 characters of each
 *     `plugin-content-docs` marker, which could belong to a different plugin or to nothing.
 *   - the guard check matched the guard's TEXT, and lost to a block comment around the guard
 *     line, a type-alias-only form, `= true as any`, a `@ts-ignore`, a locally redefined
 *     `LiteralSidebarKeys`, and the guard applied to a different const.
 * None of that is fixable by matching more patterns, because regexes cannot be taught quoting,
 * comments or nesting, and because guard PRESENCE was only ever a proxy for the property.
 *
 * SO CHECK 2 NO LONGER LOOKS FOR THE GUARD AT ALL. It asks the compiler what
 * `keyof typeof sidebars` actually is. `@ts-ignore` cannot lie to that — it suppresses
 * diagnostics, it does not change types — a redefined helper type is irrelevant to it, and no
 * arrangement of comments affects it. The guard in `sidebars/literal-keys-guard.ts` stays,
 * because it is what tells an AUTHOR what they broke, in their editor, on the line they broke
 * it, with the fix in the error text. This gate is the independent proof; the guard is the
 * ergonomics. Neither substitutes for the other.
 *
 * PARSING IS NOT EXECUTING, which is why the previous version's refusal to import these modules
 * was right about the hazard and wrong about the remedy. `docusaurus.config.ts` reads YAML at
 * module scope and `siteSections.ts` is client code, so IMPORTING them from here would be
 * wrong; building a syntax tree and a type checker over them runs none of their code. See
 * ./lib/ts-source.mjs and ./lib/ts-types.mjs.
 *
 * ANYTHING IT CANNOT READ IS A FINDING, NEVER A SKIP. A `sidebarPath` whose value is genuinely
 * dynamic, or a map row this reader cannot model, is REPORTED. The regexes could not tell
 * "absent" from "present in a shape I do not read", and silently checking less than everything
 * reads as a pass — which is how the audit's twelve bypasses all worked.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  objectLiteralRows,
  pluginInstanceIds,
  sidebarPaths,
  stringPropertyValues,
} from './lib/ts-source.mjs';
import {keyofVariable, openProgram, typeAliasMembers} from './lib/ts-types.mjs';

const CONFIG = 'docusaurus.config.ts';
const SECTIONS = 'src/components/siteSections.ts';
const DOCS_PLUGIN = '@docusaurus/plugin-content-docs';
/* The preset's own docs instance declares no `id`, so Docusaurus names it `default`. It is a
   legitimate `docsPluginId` and is not discoverable from a plugin entry, hence the constant. */
const IMPLICIT_INSTANCE_ID = 'default';

const log = (...a) => console.log('[lint-sidebar-sources]', ...a);

const rel = (p) => path.relative('.', p).split(path.sep).join('/');
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function main({configPath = CONFIG, sectionsPath = SECTIONS, tsconfig = 'tsconfig.json'} = {}) {
  const findings = [];
  const note = (s) => findings.push(s);

  // ---- what the config LOADS -------------------------------------------------------------
  const loaded = sidebarPaths(configPath);

  for (const u of loaded.unresolved) {
    note(
      `${rel(configPath)}:${u.line} — \`sidebarPath\` is not a statically readable string: ` +
        `\`${u.text}\`. This gate cannot tell which file that loads, so it cannot check that ` +
        `src/components/siteSections.ts reads it. Use a string literal, \`require.resolve()\`, ` +
        `or \`path.join(__dirname, …)\`, all of which are understood.`,
    );
  }
  if (loaded.resolved.length === 0 && loaded.unresolved.length === 0) {
    note(
      `no \`sidebarPath\` found in ${rel(configPath)}. Either the config changed shape or this ` +
        `gate is looking in the wrong file — it must never pass by finding nothing.`,
    );
  }

  const missingFiles = loaded.resolved.filter((r) => !fs.existsSync(r.abs));
  for (const m of missingFiles) {
    note(`${rel(configPath)}:${m.line} — loads \`${m.raw}\`, which does not exist on disk.`);
  }

  const files = loaded.resolved.filter((r) => fs.existsSync(r.abs)).map((r) => rel(r.abs));
  const uniqueFiles = [...new Set(files)];

  // ---- the type-level facts --------------------------------------------------------------
  let declaredNames = [];
  let unionMembers = null;

  if (uniqueFiles.length && fs.existsSync(sectionsPath)) {
    const program = openProgram([...uniqueFiles, sectionsPath], {tsconfig});

    for (const f of uniqueFiles) {
      let keys;
      try {
        keys = keyofVariable(program, f, 'sidebars');
      } catch (e) {
        note(
          `${f} — ${e.message}. Every file the config loads as a \`sidebarPath\` must declare ` +
            `\`const sidebars = { … }\`, because that is what \`SidebarName\` is derived from.`,
        );
        continue;
      }
      // CHECK 2 — no widening.
      if (!keys.allLiteral) {
        note(
          `${f} — \`keyof typeof sidebars\` is \`${keys.text}\`, not a union of string ` +
            `literals. The sidebar names have WIDENED, which silently degrades ` +
            `\`Record<SidebarName, SiteSection>\` to \`Record<string, SiteSection>\` and turns a ` +
            `renamed sidebar from a build error back into a missing sidebar header. The usual ` +
            `cause is a \`: SidebarsConfig\` annotation on the const — close the object with ` +
            `\`} satisfies SidebarsConfig\` instead. See sidebars/literal-keys-guard.ts.`,
        );
      }
      declaredNames.push(...keys.names);
    }

    // CHECK 1 — the union covers exactly what the config loads.
    try {
      unionMembers = typeAliasMembers(program, sectionsPath, 'SidebarName');
    } catch (e) {
      note(`${rel(sectionsPath)} — ${e.message}`);
    }

    if (unionMembers) {
      if (!unionMembers.allLiteral) {
        note(
          `${rel(sectionsPath)} — \`SidebarName\` resolves to \`${unionMembers.text}\`, not a ` +
            `union of string literals. One widened sidebar file absorbs the whole union; fix ` +
            `the file reported above first.`,
        );
      }
      const declared = [...new Set(declaredNames)].sort();
      const inUnion = unionMembers.names;

      for (const n of declared.filter((x) => !inUnion.includes(x))) {
        note(
          `sidebar \`${n}\` is declared by a file the config loads, but is NOT a member of ` +
            `\`SidebarName\` (${rel(sectionsPath)}). Pages in that sidebar get no panel header ` +
            `and no section ancestors, silently. Add the file to the union there and give the ` +
            `sidebar a row in \`SECTIONS_BY_SIDEBAR\`.`,
        );
      }
      for (const n of inUnion.filter((x) => !declared.includes(x))) {
        note(
          `\`SidebarName\` includes \`${n}\`, which no file the config loads declares. Either ` +
            `the sidebar was removed — drop it from the union and the map — or its file is no ` +
            `longer wired to a \`sidebarPath\`.`,
        );
      }

      // CHECK 3 — one map row per name. `tsc` enforces this via the exhaustive Record; asserted
      // here so a failure names the row rather than surfacing as a type error 200 lines away.
      try {
        const {rows, unparsed} = objectLiteralRows(sectionsPath, 'SECTIONS_BY_SIDEBAR');
        for (const u of unparsed) {
          note(
            `${rel(sectionsPath)}:${u.line} — this gate cannot read that row of ` +
              `\`SECTIONS_BY_SIDEBAR\` (${u.reason}): \`${u.text}\`. Reported rather than ` +
              `skipped, because a row nobody can read is not a row anybody has checked.`,
          );
        }
        const keys = Object.keys(rows).sort();
        if (!same(keys, inUnion)) {
          const extra = keys.filter((k) => !inUnion.includes(k));
          const missing = inUnion.filter((k) => !keys.includes(k));
          note(
            `\`SECTIONS_BY_SIDEBAR\` keys do not match \`SidebarName\`` +
              (missing.length ? ` — missing: ${missing.join(', ')}` : '') +
              (extra.length ? ` — unexpected: ${extra.join(', ')}` : '') +
              `.`,
          );
        }
      } catch (e) {
        note(`${rel(sectionsPath)} — ${e.message}`);
      }
    }
  }

  // ---- CHECK 4 — docsPluginId names a declared instance ----------------------------------
  const declaredIds = [
    IMPLICIT_INSTANCE_ID,
    ...pluginInstanceIds(configPath, DOCS_PLUGIN).map((x) => x.id),
  ];
  for (const use of stringPropertyValues(configPath, 'docsPluginId')) {
    if (use.value === undefined) {
      note(
        `${rel(configPath)}:${use.line} — \`docsPluginId\` is not a statically readable ` +
          `string: \`${use.text}\`.`,
      );
      continue;
    }
    if (!declaredIds.includes(use.value)) {
      note(
        `${rel(configPath)}:${use.line} — \`docsPluginId: '${use.value}'\` names no declared ` +
          `docs plugin instance. Declared: ${declaredIds.map((d) => `'${d}'`).join(', ')}. This ` +
          `is a PLUGIN INSTANCE id, a different namespace from the sidebar name beside it — ` +
          `'fxr' is deliberately not 'api-rest'.`,
      );
    }
  }

  if (findings.length) {
    log(`FAIL — ${findings.length} finding(s):`);
    for (const f of findings) console.log(`\n  - ${f}`);
    console.log('');
    return 2;
  }

  log(`OK — ${uniqueFiles.length} sidebar file(s) loaded: ${uniqueFiles.join(', ')}`);
  log(
    `OK — \`SidebarName\` is exactly the ${unionMembers ? unionMembers.names.length : 0} name(s) ` +
      `those files declare: ${unionMembers ? unionMembers.names.join(', ') : '—'}`,
  );
  log('OK — every loaded sidebar file keeps literal keys (no widening)');
  log(`OK — every docsPluginId names a declared instance (declared: ${declaredIds.join(', ')})`);
  return 0;
}

/* --selftest proves each check can FAIL, which is the property the version this replaces did
   not have: its five cases all passed while twelve real bypasses were open, because every case
   exercised the ONE spelling its regexes understood.
     THE FIXTURES ARE REAL FILES AND A REAL PROGRAM, not strings. The checks are now semantic,
   so there is nothing to assert about a fixture that is not compiled. Fixtures deliberately do
   NOT import Docusaurus types — the detector under test is "did `keyof` widen", which a plain
   annotated object reproduces exactly, and keeping node_modules out of the fixture Program
   keeps the self-test at a fraction of a second. */
if (process.argv.includes('--selftest')) {
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sidebar-sources-selftest-'));
  const sdir = path.join(tmp, 'sidebars');
  fs.mkdirSync(sdir);
  const cfgPath = path.join(tmp, 'docusaurus.config.ts');
  const secPath = path.join(tmp, 'sections.ts');
  const tsconfigPath = path.join(tmp, 'tsconfig.json');
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify({compilerOptions: {target: 'es2022', module: 'esnext', moduleResolution: 'bundler', noEmit: true}}),
  );

  const sidebarFile = (name, {widen = false} = {}) =>
    widen
      ? `const sidebars: {[k: string]: unknown[]} = { '${name}': [] };\nexport default sidebars;\n`
      : `const sidebars = { '${name}': [] };\nexport default sidebars;\n`;

  const sectionsFile = (names, {mapKeys = null} = {}) => {
    const union = names.map((n) => `'${n}'`).join(' | ') || 'never';
    const keys = (mapKeys ?? names).map((n) => `  '${n}': {title: '${n}', href: '/${n}'},`).join('\n');
    return `export type SidebarName = ${union};\nexport type SiteSection = {title: string; href: string; parent?: SidebarName};\nconst SECTIONS_BY_SIDEBAR: Record<SidebarName, SiteSection> = {\n${keys}\n};\nexport function f() { return SECTIONS_BY_SIDEBAR; }\n`;
  };

  const write = (sidebarSpecs, cfgBody, sectionsSrc) => {
    for (const f of fs.readdirSync(sdir)) fs.rmSync(path.join(sdir, f));
    for (const [file, name, opts] of sidebarSpecs) {
      fs.writeFileSync(path.join(sdir, file), sidebarFile(name, opts));
    }
    fs.writeFileSync(cfgPath, cfgBody);
    fs.writeFileSync(secPath, sectionsSrc);
  };

  const run = () => {
    const realLog = console.log;
    console.log = () => {};
    try {
      return main({configPath: cfgPath, sectionsPath: secPath, tsconfig: tsconfigPath});
    } finally {
      console.log = realLog;
    }
  };

  // Each entry: [label, sidebar files, config body, sections source, expected exit]
  const canonical = `export default { presets: [], plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
], themeConfig: { navbar: { items: [{docsPluginId: 'a'}] } } };\n`;

  const CASES = [
    [
      'baseline (must PASS)',
      [['a.ts', 'a']],
      canonical,
      sectionsFile(['a']),
      0,
    ],
    // --- the twelve spellings the regex version could not see -------------------------------
    ...[
      ['double-quoted value', `"./sidebars/b.ts"`],
      ['template literal', '`./sidebars/b.ts`'],
      ['no leading ./', `'sidebars/b.ts'`],
      ['require.resolve', `require.resolve('./sidebars/b.ts')`],
      ['path.join(__dirname)', `path.join(__dirname, 'sidebars', 'b.ts')`],
      ['string concatenation', `'./sidebars/' + 'b.ts'`],
      ['comment before value', `/* c */ './sidebars/b.ts'`],
    ].map(([label, expr]) => [
      `a 2nd instance the union does not read — ${label}`,
      [['a.ts', 'a'], ['b.ts', 'b']],
      `export default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
  ['@docusaurus/plugin-content-docs', {id: 'b', sidebarPath: ${expr}}],
] };\n`,
      sectionsFile(['a']),
      2,
    ]),
    [
      'a commented-out sidebarPath must NOT count as loaded',
      [['a.ts', 'a']],
      `export default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
  // ['@docusaurus/plugin-content-docs', {id: 'b', sidebarPath: './sidebars/b.ts'}],
] };\n`,
      sectionsFile(['a']),
      0,
    ],
    [
      'a dynamic sidebarPath is reported, not ignored',
      [['a.ts', 'a']],
      `const p: string = process.env.X!;\nexport default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: p}],
] };\n`,
      sectionsFile(['a']),
      2,
    ],
    [
      'widened keys (the `: SidebarsConfig` regression) — caught semantically',
      [['a.ts', 'a', {widen: true}]],
      canonical,
      sectionsFile(['a']),
      2,
    ],
    [
      'union names a sidebar no loaded file declares',
      [['a.ts', 'a']],
      canonical,
      sectionsFile(['a', 'ghost']),
      2,
    ],
    [
      'map is missing a row for a union member',
      [['a.ts', 'a']],
      canonical,
      sectionsFile(['a'], {mapKeys: []}),
      2,
    ],
    [
      'docsPluginId naming an undeclared instance',
      [['a.ts', 'a']],
      `export default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
], themeConfig: { navbar: { items: [{docsPluginId: 'nope'}] } } };\n`,
      sectionsFile(['a']),
      2,
    ],
    [
      "docsPluginId 'default' (the preset instance) is legitimate",
      [['a.ts', 'a']],
      `export default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
], themeConfig: { navbar: { items: [{docsPluginId: 'default'}] } } };\n`,
      sectionsFile(['a']),
      0,
    ],
    [
      'an id belonging to a DIFFERENT plugin is not credited',
      [['a.ts', 'a']],
      `export default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
  ['docusaurus-plugin-other', {id: 'elsewhere'}],
], themeConfig: { navbar: { items: [{docsPluginId: 'elsewhere'}] } } };\n`,
      sectionsFile(['a']),
      2,
    ],
    [
      'a commented-out plugin instance is not credited',
      [['a.ts', 'a']],
      `export default { plugins: [
  ['@docusaurus/plugin-content-docs', {id: 'a', sidebarPath: './sidebars/a.ts'}],
  /* ['@docusaurus/plugin-content-docs', {id: 'parked', sidebarPath: './sidebars/a.ts'}], */
], themeConfig: { navbar: { items: [{docsPluginId: 'parked'}] } } };\n`,
      sectionsFile(['a']),
      2,
    ],
    [
      'no sidebarPath at all must FAIL, never pass by finding nothing',
      [['a.ts', 'a']],
      `export default { plugins: [] };\n`,
      sectionsFile([]),
      2,
    ],
  ];

  let bad = false;
  for (const [label, sidebarSpecs, cfgBody, sectionsSrc, want] of CASES) {
    write(sidebarSpecs, cfgBody, sectionsSrc);
    let got;
    try {
      got = run();
    } catch (e) {
      got = `threw: ${e.message}`;
    }
    const ok = got === want;
    bad = bad || !ok;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} exit=${got} want=${want}  ${label}`);
  }

  fs.rmSync(tmp, {recursive: true, force: true});
  console.log('');
  log(bad ? 'SELFTEST FAIL' : `SELFTEST OK — ${CASES.length} cases`);
  process.exit(bad ? 2 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main());
}
