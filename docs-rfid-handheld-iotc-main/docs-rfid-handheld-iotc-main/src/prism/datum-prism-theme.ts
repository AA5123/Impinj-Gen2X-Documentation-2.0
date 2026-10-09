/**
 * THE CODE-BLOCK SYNTAX THEME, BUILT FROM THE DESIGN SYSTEM.
 *
 * Replaces `prismThemes.github` (light) and `prismThemes.palenight` (dark), which were
 * two off-the-shelf schemes belonging to neither this site's palette nor datum's.
 *
 * ── WHY THEY SURVIVED THE PALETTE MIGRATION ─────────────────────────────────
 *
 * prism-react-renderer does not style tokens with classes. It reads a theme object and
 * writes the colour into an INLINE STYLE ATTRIBUTE on every token span, and on the <pre>
 * itself:
 *
 *     <pre style="color: rgb(57,58,52); background-color: rgb(246,248,250)">
 *       <span class="token parameter variable" style="color: rgb(54,172,170)">-h</span>
 *
 * An inline style cannot be reached by a stylesheet without `!important`, and no grep of
 * src/ finds a colour that is never written there. So when the site moved onto the
 * Accessible Web palette, the largest single body of machine-generated text on it — every
 * fenced code block — silently kept a third-party colour scheme. The one previous patch
 * (`.token.comment` in custom.scss) needed `!important` for exactly this reason, and it
 * fixed one token out of twenty-nine.
 *
 * ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────
 *
 * Measured on the running site, light mode, against github's own #f6f8fa block fill:
 *
 *     number, parameter.variable   #36acaa   2.58:1   FAILS WCAG 1.4.3 (needs 4.5:1)
 *     string                       #e3116c   4.32:1   FAILS
 *     plain                        #393a34  10.79:1   passes
 *
 * A CLI flag and every numeric literal — port numbers, timeouts, tag counts — rendered at
 * 2.58:1. That is the "dull" report, and it was a real accessibility failure rather than a
 * matter of taste. In dark mode palenight passed its own contrast checks but painted its
 * #292d3e purple-navy block into #111 pages: a foreign colour island, and a second palette
 * to keep in step with the first.
 *
 * ── THE FIX, AND WHY IT IS ONE THEME AND NOT TWO ────────────────────────────
 *
 * An inline style resolves `var()` at computed-value time exactly like any other
 * declaration. So every colour below is a var() into datum's semantic layer, and the SAME
 * object serves both colour modes — the custom properties do the switching. That removes
 * the whole class of defect rather than re-fixing it in a second theme: there is no dark
 * palette here that can drift from the light one, because there is no second palette.
 *
 * ── THE MAPPING IS DATUM'S, NOT INVENTED HERE ───────────────────────────────
 *
 * datum resolved this exact question for its JSON Block component
 * (datum/05-components/json-block/json-block.md section 4) and measured the result. This
 * file reuses that decision rather than making a parallel one:
 *
 *     the code itself, and every NAME   --technical-code                (gray-12)
 *     string literal                    --technical-syntax-string       (tip-12)
 *     number literal                    --technical-syntax-number       (primary-12)
 *     boolean and reserved words        --technical-syntax-boolean      (warning-12)
 *     structural chrome                 --technical-syntax-punctuation  (gray-11, NEUTRAL)
 *     comment                           --text-secondary                (gray-11, NEUTRAL)
 *
 * ── ONE CONTRAST TIER, AND IT IS THE WHOLE POINT ────────────────────────────
 *
 * Contrast on --surface-subtle, the block's fill, light / dark:
 *
 *     --technical-code                 15.59  /  15.16
 *     --technical-syntax-number        12.44  /  13.36
 *     --technical-syntax-string        11.71  /  13.78
 *     --technical-syntax-boolean       10.63  /  14.56
 *     --technical-syntax-punctuation    5.62  /   8.50   (deliberately quietest)
 *
 * Three of these roles were step 11 until 2026-08-30 and measured 4.72-5.62:1 while
 * the plain ink beside them measured 15.59:1 — a 3.3x spread INSIDE ONE BLOCK. Step 11
 * is datum's LOW-CONTRAST text rung, designed for an accent: a callout icon, a status
 * label. A code block is not an accent. Every token in it is content the reader is
 * parsing, so the eye calibrates on the plain text and anything three times below it
 * reads as washed out rather than as hierarchy. That was the "muted" report, and no
 * amount of underline, weight or size would have fixed it.
 *
 * Punctuation stays quiet on purpose but is NEUTRAL now, not a saturated wine. A
 * low-contrast neutral reads as hierarchy; a low-contrast colour reads as faded. That
 * distinction is the difference between the two versions of this file.
 *
 * ── THE TWO EXTENSIONS BEYOND DATUM'S SIX, BOTH STATED ──────────────────────
 *
 * Prism emits 29 token types; datum names six roles. Rather than invent colours for the
 * difference — `08-ai/ai-rules.md` rule 5, "never introduce a colour" — every remaining
 * type is grouped onto a role that already exists, and only two groupings are a judgment
 * call rather than an obvious synonym:
 *
 *   1. RESERVED WORDS take the boolean role. `keyword`, `constant`, `atrule`, `symbol`
 *      and `important` sit with `boolean`, because a boolean literal IS a reserved word
 *      and datum's own description for that token is "JSON/code boolean literal". They
 *      are the same class of thing in a grammar.
 *
 *   2. COMMENTS take --text-secondary, italic. datum names no comment role. A comment is
 *      prose inside code and deliberately subordinate to it, which is what text-secondary
 *      already means everywhere else on the site — 5.62:1 light, 8.50:1 dark, so
 *      subordinate without being faint.
 *
 * Anything Prism emits that is not listed below inherits `plain`, which is
 * --technical-code at 15.59:1. The fallback is the SAFEST value rather than the quietest,
 * deliberately: an unmapped token type should be too loud and get noticed, not too faint
 * and get shipped.
 */
import type { PrismTheme } from 'prism-react-renderer';

/* datum's semantic layer. Named here rather than inlined at each use so the mapping below
 * reads as roles, and so a re-point is one line. */
const CODE = 'var(--technical-code)';
const STRING = 'var(--technical-syntax-string)';
const NUMBER = 'var(--technical-syntax-number)';
const BOOLEAN = 'var(--technical-syntax-boolean)';
const PUNCTUATION = 'var(--technical-syntax-punctuation)';
const COMMENT = 'var(--text-secondary)';
/* `null` is a JSON TYPE with a badge of its own, and the badge's label colour is
 * --text-secondary. The JSON Block renders `.json-null` with that same token, so this
 * constant is what keeps a `null` in a fenced block and a `null` in a <JsonBlock> the same
 * colour. It happens to equal COMMENT; they are kept separate because they are separate
 * roles and only one of them tracks the null badge. */
const NULL_LITERAL = 'var(--text-secondary)';

const datumPrismTheme: PrismTheme = {
  /* The block's own fill and default ink. --surface-subtle is what the site already gives
   * inline code through --ifm-code-background, and what datum's JSON Block uses, so a
   * fenced block and a <JsonBlock> land on the same plane instead of two near-greys. */
  plain: {
    color: CODE,
    /* --surface-subtle, restored 2026-09-10 with .json-pre in src/css/api.scss — see the note
       there for the baseline diff that settled it, and for why these two must never diverge. */
    backgroundColor: 'var(--surface-subtle)',
  },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: COMMENT, fontStyle: 'italic' } },

    /* Structural chrome — braces, brackets, colons, commas, operators. */
    { types: ['punctuation', 'operator', 'entity'], style: { color: PUNCTUATION } },

    /* Literal values. */
    { types: ['string', 'char', 'attr-value', 'url', 'regex', 'inserted'], style: { color: STRING } },
    { types: ['number'], style: { color: NUMBER } },

    /* `null` IS A JSON TYPE WITH A BADGE, so it takes the badge's colour — and getting it
     * there needs a language-scoped entry rather than a plain one. The mechanics are worth
     * writing down, because the obvious fix does not work:
     *
     *   prism-json declares `null: { pattern: /\bnull\b/, alias: 'keyword' }`, so the token
     *   reaches the theme carrying `types: ['null', 'keyword']` — `normalizeTokens` appends
     *   the alias AFTER the type. prism-react-renderer then resolves a token with
     *   `Object.assign({}, ...types.map(t => dict[t]))`, so the LAST type wins. `keyword` is
     *   last, the reserved-word rule below claims it, and a `null` came out olive — the
     *   boolean colour — while the same `null` in a <JsonBlock> came out grey.
     *
     * Reordering this file cannot fix that: the theme's array order only decides how the
     * dictionary is BUILT, never which of a token's own types wins. What does fix it is the
     * `languages` field, which `themeToDict` honours by skipping entries whose language does
     * not match. In prism-json `keyword` is reachable ONLY as `null`'s alias — the grammar
     * has property, string, comment, number, punctuation, operator, boolean and null, and no
     * other keyword — so pinning `keyword` to the null colour inside JSON is exact, and every
     * other language's reserved words are untouched.
     *
     * The literal types now line up one-for-one with the schema table's type badges: string,
     * number, boolean and null each render the colour its own badge carries. */
    { types: ['null'], style: { color: NULL_LITERAL } },
    { types: ['keyword'], languages: ['json'], style: { color: NULL_LITERAL } },

    /* Reserved words — see extension 1 in the header. */
    { types: ['boolean', 'constant', 'keyword', 'atrule', 'symbol', 'important'], style: { color: BOOLEAN } },

    /* Names: what a value is called, rather than the value. THE CODE INK, not the
     * identifier role, corrected 2026-08-30. --technical-identifier resolves to
     * text-secondary (gray-11); with every literal now at step 12 that made a JSON
     * property name quieter than the value it labels, which is backwards for how a
     * payload is read. A name is structure, and structure is ink. */
    {
      types: ['property', 'tag', 'attr-name', 'selector', 'class-name', 'function', 'builtin', 'variable', 'parameter', 'deleted'],
      style: { color: CODE },
    },

    /* Prism's own emphasis conventions, carried through without colour. */
    { types: ['namespace'], style: { opacity: 0.75 } },
    { types: ['important', 'bold'], style: { fontWeight: 'bold' } },
    { types: ['italic'], style: { fontStyle: 'italic' } },
  ],
};

export default datumPrismTheme;
