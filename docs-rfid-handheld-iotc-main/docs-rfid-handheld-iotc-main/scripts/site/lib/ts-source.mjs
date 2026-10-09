/**
 * READ FACTS OUT OF THIS PROJECT'S TypeScript BY PARSING IT, NOT BY MATCHING TEXT.
 *
 * A library, not a gate — `scripts/site/lint-sidebar-sources.mjs` and
 * `scripts/site/lint-section-rendering.mjs` both consume it. It is the only file under
 * `scripts/site/` that is not runnable, which is why it sits in `lib/`.
 *
 * WHY IT EXISTS, and it is a correction rather than a refinement. Both gates originally read
 * their inputs with regexes, and an adversarial audit on 2026-09-07 reproduced twelve ways to
 * defeat them — every one a green build over a genuinely broken tree, which is the exact
 * failure those gates were written to prevent:
 *   - `sidebarPath` was recognised in ONE spelling. A double-quoted value, a template literal,
 *     a missing `./`, a subdirectory, a `.js`/`.mjs`/`.json` file, `require.resolve(...)`,
 *     `path.join(__dirname, ...)`, a comment between the colon and the value, a space before
 *     the colon, or a quoted key each made a whole docs plugin instance invisible — so its
 *     sidebars were absent from `SidebarName`, its pages rendered with no panel header and no
 *     section ancestors, and all three checks reported OK.
 *   - a `sidebarPath` or a union branch that had been COMMENTED OUT still counted as present.
 *   - the plugin-id check found each `plugin-content-docs` marker and then took the first
 *     `id:` within the next 4000 characters, which could belong to a different plugin, a
 *     navbar item, or nothing at all.
 *   - the section map's rows were matched with a body pattern that forbids braces, so a
 *     template-literal href dropped a row silently and a nested object invented a phantom one.
 * Regexes cannot be made to understand quoting, comments, or nesting. This can.
 *
 * PARSING IS NOT EXECUTING, which is the whole reason this is safe here. `ts.createSourceFile`
 * builds a syntax tree and runs nothing: `docusaurus.config.ts` reads YAML off disk and calls
 * `require.resolve` at module scope, and `src/components/siteSections.ts` is client code — so
 * IMPORTING either from a Node script is what the gates' original notes rightly refused. Those
 * notes were correct about the hazard and wrong about the remedy being text matching.
 * `typescript` is already a devDependency (~5.6.3) and other scripts in this directory already
 * import from node_modules, so this adds no dependency.
 *
 * EVERY READER RETURNS ITS FAILURES ALONGSIDE ITS RESULTS. `unresolved` is never empty-by-
 * omission: an initializer this module cannot evaluate is returned for the caller to REPORT,
 * never dropped. That is the property the regexes lacked — they could not tell "absent" from
 * "present in a shape I do not read", and a checker that silently checks less than everything
 * is worse than no checker, because it reads as a pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Parse a file into a syntax tree. No type checking, no module resolution, no execution. */
export function parse(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

/** The text of a property/element name, whether or not it was quoted in source. */
function nameOf(node) {
  const n = node.name;
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n) && ts.isStringLiteral(n.expression)) return n.expression.text;
  return undefined;
}

/**
 * Statically evaluate an expression to a string, or return undefined.
 *
 * Deliberately handles the four shapes a `sidebarPath` is realistically written in — and only
 * those, because guessing further would be inventing meaning the source does not carry:
 *   'x' / "x"                     string literal, either quote
 *   `x`                           template literal WITHOUT substitutions
 *   'a' + 'b'                     concatenation of things this function can evaluate
 *   require.resolve('x')          the historical Docusaurus idiom
 *   path.join|resolve(a, b, ...)  with `__dirname` treated as `dirOf`
 * `require.resolve` and `path.join(__dirname, …)` are folded in rather than reported, because
 * they are the MOST likely real spellings — refusing them would trade the audit's false pass
 * for a false failure on the shape most likely to appear.
 */
export function evalString(expr, dirOf) {
  if (!expr) return undefined;

  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;

  if (ts.isParenthesizedExpression(expr)) return evalString(expr.expression, dirOf);

  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = evalString(expr.left, dirOf);
    const r = evalString(expr.right, dirOf);
    return l === undefined || r === undefined ? undefined : l + r;
  }

  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    const text = callee.getText ? safeText(callee) : '';
    const args = expr.arguments.map((a) =>
      a.kind === ts.SyntaxKind.Identifier && a.text === '__dirname' ? dirOf : evalString(a, dirOf),
    );
    if (args.some((a) => a === undefined)) return undefined;

    if (text === 'require.resolve') return args[0];
    if (text === 'path.join' || text === 'path.resolve' || text === 'join' || text === 'resolve') {
      return text.endsWith('resolve') ? path.resolve(...args) : path.join(...args);
    }
    return undefined;
  }

  return undefined;
}

function safeText(node) {
  try {
    return node.getText();
  } catch {
    return '';
  }
}

/**
 * Every `sidebarPath` the config assigns, resolved to an absolute path.
 *
 * COMMENTS AND STRINGS ARE EXCLUDED BY CONSTRUCTION — a commented-out `sidebarPath` is not a
 * PropertyAssignment, and one inside a string literal is not one either. That is two of the
 * audit's reproduced bypasses closed by the choice of instrument rather than by a rule.
 */
export function sidebarPaths(configPath) {
  const src = parse(configPath);
  const siteDir = path.dirname(path.resolve(configPath));
  const resolved = [];
  const unresolved = [];

  walk(src, (node) => {
    if (!ts.isPropertyAssignment(node) || nameOf(node) !== 'sidebarPath') return;
    const value = evalString(node.initializer, siteDir);
    const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
    if (value === undefined) {
      unresolved.push({line, text: safeText(node.initializer).slice(0, 120)});
      return;
    }
    resolved.push({line, raw: value, abs: path.resolve(siteDir, value)});
  });

  return {resolved, unresolved, siteDir};
}

/**
 * The module specifiers of every `typeof import('…')` in a file — how `siteSections.ts` names
 * the sidebar files its `SidebarName` union is derived from.
 */
export function importTypeSpecifiers(filePath) {
  const src = parse(filePath);
  const out = [];
  walk(src, (node) => {
    if (!ts.isImportTypeNode(node)) return;
    const arg = node.argument;
    if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal)) {
      out.push({
        specifier: arg.literal.text,
        line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1,
      });
    }
  });
  return out;
}

/** Every `id:` declared in the options object of a named plugin, keyed by plugin. */
export function pluginInstanceIds(configPath, pluginName) {
  const src = parse(configPath);
  const ids = [];
  walk(src, (node) => {
    // A plugin entry is `[<name>, {...}]` — an array literal whose first element names it.
    if (!ts.isArrayLiteralExpression(node) || node.elements.length < 2) return;
    const [first, second] = node.elements;
    if (!ts.isStringLiteral(first) || first.text !== pluginName) return;
    if (!ts.isObjectLiteralExpression(second)) return;
    for (const prop of second.properties) {
      if (ts.isPropertyAssignment(prop) && nameOf(prop) === 'id') {
        const v = evalString(prop.initializer, path.dirname(path.resolve(configPath)));
        if (v !== undefined) {
          ids.push({id: v, line: src.getLineAndCharacterOfPosition(prop.getStart(src)).line + 1});
        }
      }
    }
  });
  return ids;
}

/** Every string assigned to `propName` anywhere in the file — e.g. `docsPluginId`. */
export function stringPropertyValues(filePath, propName) {
  const src = parse(filePath);
  const dir = path.dirname(path.resolve(filePath));
  const out = [];
  walk(src, (node) => {
    if (!ts.isPropertyAssignment(node) || nameOf(node) !== propName) return;
    const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
    const v = evalString(node.initializer, dir);
    if (v === undefined) {
      out.push({line, value: undefined, text: safeText(node.initializer).slice(0, 120)});
    } else {
      out.push({line, value: v});
    }
  });
  return out;
}

/**
 * A top-level object literal read as rows of string fields.
 *
 * ROWS IT CANNOT READ ARE RETURNED, NOT SKIPPED. `unparsed` is the whole point: the regex this
 * replaces dropped any row it failed to match, which is how the section-rendering gate once
 * reported the SITE as broken (it had lost the one row sitting behind a block comment) and how
 * it would silently check four sections out of five. A caller must treat a non-empty `unparsed`
 * as a hard failure — "I could not read this row" is never the same as "this row is fine".
 */
export function objectLiteralRows(filePath, varName) {
  const src = parse(filePath);
  let obj;
  walk(src, (node) => {
    if (obj) return;
    if (ts.isVariableDeclaration(node) && nameOf(node) === varName && node.initializer) {
      let init = node.initializer;
      // Unwrap `{...} as const`, `{...} satisfies X`, `({...})`.
      while (
        ts.isAsExpression(init) ||
        ts.isSatisfiesExpression?.(init) ||
        ts.isParenthesizedExpression(init)
      ) {
        init = init.expression;
      }
      if (ts.isObjectLiteralExpression(init)) obj = init;
    }
  });
  if (!obj) throw new Error(`${varName} not found as an object literal in ${filePath}`);

  const rows = {};
  const unparsed = [];
  const dir = path.dirname(path.resolve(filePath));

  for (const prop of obj.properties) {
    const line = src.getLineAndCharacterOfPosition(prop.getStart(src)).line + 1;
    if (!ts.isPropertyAssignment(prop)) {
      // A spread, a shorthand, a method — real syntax this reader does not model.
      unparsed.push({line, reason: ts.SyntaxKind[prop.kind], text: safeText(prop).slice(0, 100)});
      continue;
    }
    const key = nameOf(prop);
    if (!key) {
      unparsed.push({line, reason: 'unreadable key', text: safeText(prop).slice(0, 100)});
      continue;
    }
    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      unparsed.push({line, reason: 'value is not an object literal', text: safeText(prop).slice(0, 100)});
      continue;
    }
    const fields = {};
    for (const f of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(f)) continue;
      const fname = nameOf(f);
      if (!fname) continue;
      const v = evalString(f.initializer, dir);
      if (v !== undefined) fields[fname] = v;
    }
    rows[key] = {fields, line};
  }

  return {rows, unparsed};
}
