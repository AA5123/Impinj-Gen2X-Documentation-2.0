/**
 * ASK THE TYPE CHECKER, rather than reading types out of source text.
 *
 * A library, not a gate. Companion to `./ts-source.mjs`, and the division between them is the
 * cost: `ts-source` builds a syntax tree per file and is effectively free; this one builds a
 * `ts.Program` and a type checker, which on this repository is ~2.4s for 474 source files.
 * Anything answerable from syntax belongs next door.
 *
 * WHY A CHECKER IS NEEDED AT ALL — i.e. why `ts-source` is not enough. The property the sidebar
 * wiring depends on is not a fact about text, it is a fact about a TYPE:
 *
 *     type SidebarName = keyof typeof import('@site/sidebars/guides').default | …
 *
 * only works while each sidebar object keeps LITERAL keys, and it widens to `string` the moment
 * a `: SidebarsConfig` annotation is restored. `sidebars/literal-keys-guard.ts` exists to make
 * that a build error, and `lint-sidebar-sources.mjs` used to check the guard was present by
 * MATCHING ITS TEXT. An adversarial audit on 2026-09-07 defeated that six ways — a block comment
 * around the guard line, a type-alias-only form, `= true as any`, a `@ts-ignore`, a locally
 * redefined `LiteralSidebarKeys`, and the guard applied to a different const — each leaving the
 * gate reporting "all 3 loaded sidebar file(s) carry a live literal-keys guard" while the
 * protection was gone.
 *   None of those is fixable by matching more patterns, because presence of the guard is a
 * PROXY for the property. This module drops the proxy and asks for the property: what IS
 * `keyof typeof sidebars` in this file, according to the compiler? `@ts-ignore` cannot lie to
 * that (it suppresses diagnostics, it does not change types), a redefined helper type is
 * irrelevant to it, and no arrangement of comments affects it. The guard stays in the sidebar
 * files, because it is what tells an AUTHOR what they broke, in their editor, on the line they
 * broke it. The gate no longer depends on it being there.
 */
import ts from 'typescript';

/**
 * A Program over `files` plus whatever they import, using the project's own compilerOptions.
 *
 * The tsconfig is read for its options only — its `include`/`exclude` are ignored, so the
 * Program is the transitive closure of `files` rather than the whole site. That is what keeps
 * this at seconds rather than a full `tsc` run.
 */
export function openProgram(files, {tsconfig = 'tsconfig.json'} = {}) {
  const cfg = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (cfg.error) {
    throw new Error(`could not read ${tsconfig}: ${ts.flattenDiagnosticMessageText(cfg.error.messageText, ' ')}`);
  }
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, '.');
  const program = ts.createProgram(files, {...parsed.options, noEmit: true});
  for (const f of files) {
    if (!program.getSourceFile(f)) {
      throw new Error(`${f} is not in the Program — check the path`);
    }
  }
  return program;
}

function find(sourceFile, predicate) {
  let hit;
  const walk = (n) => {
    if (hit) return;
    if (predicate(n)) {
      hit = n;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(sourceFile);
  return hit;
}

/**
 * Split a type into its constituents and report whether every one is a string literal.
 *
 * `allLiteral: false` is the degraded state this whole mechanism exists to catch: `string`
 * absorbs a literal union, so one widened file silently turns `SidebarName` into `string` and
 * `Record<SidebarName, SiteSection>` into `Record<string, …>`.
 */
function literalMembers(type) {
  const parts = type.isUnion() ? type.types : [type];
  return {
    allLiteral: parts.every((p) => p.isStringLiteral()),
    names: parts.filter((p) => p.isStringLiteral()).map((p) => p.value).sort(),
  };
}

/**
 * `keyof typeof <varName>` in `file`, as the compiler sees it.
 *
 * Returns `{names, allLiteral, text}`. `text` is the compiler's own rendering, which is what
 * makes a failure message readable — it prints `string` in the degraded case and
 * `"docs" | "resources" | "apiIndex"` when healthy.
 */
export function keyofVariable(program, file, varName) {
  const sf = program.getSourceFile(file);
  if (!sf) throw new Error(`${file} is not in the Program`);
  const decl = find(
    sf,
    (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === varName,
  );
  if (!decl) throw new Error(`no \`${varName}\` variable declaration in ${file}`);

  const checker = program.getTypeChecker();
  const keys = checker.getIndexType(checker.getTypeAtLocation(decl.name));
  return {...literalMembers(keys), text: checker.typeToString(keys)};
}

/** A type alias resolved to its constituents — e.g. `SidebarName`. */
export function typeAliasMembers(program, file, aliasName) {
  const sf = program.getSourceFile(file);
  if (!sf) throw new Error(`${file} is not in the Program`);
  const alias = find(
    sf,
    (n) => ts.isTypeAliasDeclaration(n) && n.name.text === aliasName,
  );
  if (!alias) throw new Error(`no \`type ${aliasName}\` in ${file}`);

  const checker = program.getTypeChecker();
  const type = checker.getTypeAtLocation(alias.name);
  return {...literalMembers(type), text: checker.typeToString(type)};
}
