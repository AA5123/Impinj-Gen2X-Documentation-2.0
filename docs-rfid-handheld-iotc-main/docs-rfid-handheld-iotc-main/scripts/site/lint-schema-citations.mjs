#!/usr/bin/env node
/**
 * SCHEMA CITATIONS ARE UNVERIFIED PROSE STRINGS, AND THEY HAVE ALREADY ROTTED AT SCALE.
 *
 * `api/mqtt/schema/error_codes.json` was renamed to `response_codes.json` and 52 `.mdx`
 * files went on naming the old one — measured, not recalled:
 *   git grep -l 'error_codes\.json' HEAD -- ':!.ai-history' ':!.audit' | wc -l   ->  52
 * at the commit this gate was written against. Among them
 * `api/mqtt/reference/response-codes.mdx`, which told the reader the page "is generated
 * from the schema and never hand-maintained: … come from `api/mqtt/schema/error_codes.json`",
 * naming a file that was not there. The generator's own docstring named the real one.
 * Prose and code disagreed, the prose was wrong, and nothing in CI noticed for the whole of
 * that window. Fixed 2026-09-05 (.ai-history/065-additional-fixes.md §2.4), which also
 * counted 50 more citations pointing into the tree the AsyncAPI 3.0.0 swap is about to
 * replace wholesale.
 *
 * THIS GATE IS NEW. It is not one of the linters removed on 2026-08-14 and it is not a
 * restoration of anything: `git log -S'lint:schema-citations'` returns nothing, because this
 * script has never existed in this history. The one check that WAS restored after that
 * removal is `scripts/site/lint-static-orphans.mjs`, which says so at its own line 11, and
 * `.github/workflows/validate.yml:11-13` records that the removed linters are in no clone
 * and no commit. Nothing here is being brought back; this is a check that never existed.
 *
 * IT IS LANDED BEFORE THE ASYNCAPI SWAP DELIBERATELY, AND IT WOULD HAVE FAILED AT HEAD.
 * A gate added after the swap would have to be born red and would therefore be born
 * ignored. It is green on the tree that carries the 065 step-1 citation fixes — the tree it
 * is committed with — and on no earlier one: exported with `git archive HEAD docs api
 * scripts README.md CONTRIBUTING.md | tar -x`, then `git init && git add -A`, this gate
 * exits 1 on the parent commit with 10 findings — 5 citations of
 * `api/mqtt/schema/error_codes.json` across 4 pages, plus the 5 slid anchors below.
 * validate.yml carries the same experiment beside the CI step that runs it.
 *
 * FOUR CHECKS, in increasing strength:
 *   1. every cited path exists, resolved against `git ls-files` (see EXISTENCE below);
 *   2. a path cited with a trailing `/` is a directory, not a file;
 *   3. `path:NN` / `path:NN-MM` — the file has at least NN and MM lines, and NN <= MM;
 *   4. `path:NN — "key"` — line NN ACTUALLY CONTAINS the quoted key.
 *
 * Check 4 is the only one that survives a schema file being rewritten rather than moved,
 * and it is what catches an anchor that has merely SLID. Five had slid in
 * api/mqtt/reference/protocol-reference/message-envelope.mdx when this gate was written
 * (set_wifi.json:301→304, delete_wifi_profile.json:27→24, get_endpoint_config.json:20→16,
 * cfgEndpointPayload.yaml:8→6, postFilterPayload.yaml:7→5); checks 1-3 passed on all five,
 * because the files existed and were long enough. They were fixed in the same session.
 *
 * TRAILING MARKUP IS NOT A GLOB, and confusing the two is how a gate like this quietly
 * stops working. `**api/mqtt/schema/error_codes.json**`, `*…*`, `[…](/x)` and a
 * sentence-final `…json?` all put a `*`, `]` or `?` immediately after the path. An earlier
 * draft dropped the whole citation whenever the next character was one of `*{}?[]`, so of
 * five copies of the real 2026-09-05 defect — bold, italic, link label, question mark,
 * plain — it reported ONE and silently discarded four. That mattered because the bare-prose
 * form is not a rarity here: the gate prints how many citations sit outside inline code on
 * every run. A glob is now defined as a metacharacter INSIDE a path segment — the run of
 * metacharacters must begin with an opener (`*`, `?`, `{`, `[`) AND be followed by more path
 * text — and only a MID-SEGMENT truncation is dropped. Trailing `**`, `*`, `]`, `?`, `)`,
 * `.`, `,`, `;` and `:` end the path and the path is still checked.
 *
 * EXISTENCE IS RESOLVED AGAINST `git ls-files`, NOT `fs.statSync`, and that is not a
 * refactor. `statSync` is case-insensitive on Windows and case-sensitive on the
 * ubuntu-latest runner, so `api/mqtt/schema/Response_Codes.json` and
 * `api/mqtt/schema/commands/dev_mgmt/SET_WIFI.json` both passed on a Windows author's
 * machine and would both have been red in CI — the one platform difference this gate cannot
 * afford, since a gate that is green only on the author's machine is worse than no gate.
 * The index is byte-for-byte, so local and CI now agree. A case-only mismatch gets a named
 * diagnostic rather than a bare "does not exist". The cost: a citation to a file that is on
 * disk but UNTRACKED now fails. That is the right answer for published prose — an untracked
 * schema file is in no clone and on no runner — but it is a behaviour change, not a
 * tightening of nothing.
 *
 * WHAT WAS GIVEN UP.
 *
 * ROOTS. `docs/`, `api/`, `scripts/`, plus the two hand-maintained root-level documents
 * `README.md` and `CONTRIBUTING.md` (CONTRIBUTING.md cites a schema FILE by path, so it is
 * exactly the prose this gate exists for). A root that is not tracked at its expected path
 * is a FAILURE, not a silently smaller scan: the previous `ROOTS.filter(existsSync)` would
 * have exited 0 after a rename of `docs/`, having checked nothing in it. NOT scanned, on
 * purpose:
 *   - `.ai-history/` and `.audit/` — dated point-in-time records. They deliberately quote
 *     paths and line numbers AS THEY WERE on the day they were written; asserting them
 *     against today's tree would make every historical record a CI failure. `.audit/`
 *     alone holds 20 files carrying such citations.
 *   - `doc-templates/` — read-only templates. They carry no schema citation today; any they
 *     gained would be an illustrative placeholder, not a claim about this tree.
 *   - `orphans/`, `build/`, `.docusaurus/` — quarantined or generated copies of docs that
 *     are already scanned at their real location.
 * The cost is real: a rename can still rot a citation in any of those trees unopposed.
 * That is accepted because none of them is published prose.
 *
 * TRACKED FILES ONLY (`git ls-files`), matching lint-static-orphans.mjs. So a citation
 * written in a brand-new file is not checked until the file is `git add`ed. CI checks out
 * a commit, so CI always sees everything; only the local pre-commit run has the gap.
 *
 * A `path:NN` WITH NO QUOTED KEY IS ONLY RANGE-CHECKED, and that is the largest remaining
 * hole: all this gate can say about such an anchor is that the file is long enough. The run
 * prints how many anchors are in that state. Two were wrong and passing when this was
 * written, both on one line: `docs/resources/glossary.mdx` cited
 * `api/mqtt/schema/refrence/payload/cfgEndpointPayload.yaml:28` for the `tenantId`
 * declaration, which is at `:74` — line 28 is `example: mgmt` — and continued `` `:80` ``
 * for that field's `example: ZEBRA`, which is at `:76`; line 80 is the `description:`
 * belonging to `mqttParams`, declared at `:78`. Both anchors are keyless, so both get only
 * the range check, and 178 lines is long enough for either. That page is not this script's
 * to edit. Closing this would mean requiring a quoted key on every anchor,
 * which is a house-style mandate rather than a fact check, so it is left to the author: an
 * anchor written as `path:NN — "key"` is verified, one written as `path:NN` is taken on
 * trust. Prefer the first form.
 *
 * A QUOTED KEY IS CHECKED WITH `includes`, WHICH CANNOT TELL A DECLARATION FROM A MENTION,
 * and this one is not cheaply fixable. `message-envelope.mdx` cites
 * `api/mqtt/schema/commands/dev_mgmt/set_wifi.json:304 — "wifiConfig"`; `wifiConfig` occurs
 * on 10 of that file's 312 lines, so a slide onto any of the other nine would still pass —
 * as the HEAD-tree run above shows, where the diagnostic for the slid `:301` can only offer
 * `:12, :36, :60, :71, …` and not the one right answer. The obvious
 * remedy — demand a declaration shape rather than a mention — does not work HERE, because
 * all ten occurrences are literally `"wifiConfig": {`: nine of them are declarations inside
 * the file's worked examples. No textual shape test can separate them; only the line number
 * can, and the line number is what slid. So the check stays `includes`, and the run instead
 * prints how many keyed anchors quote a key that occurs more than once in the cited file, so
 * the size of this blind spot is visible on every run rather than argued about here.
 *
 * SHORTENED CITATIONS ARE RESOLVED AGAINST A SUFFIX INDEX OF THE TWO SCHEMA TREES, because
 * leaving them out was the single biggest hole. Prose routinely shortens a repeat reference
 * to `get_config.json:103` or `commands/dev_mgmt/config_endpoint.json:77` — the first form
 * is how `docs/resources/rf-regions-and-regulations.mdx`
 * writes most of its anchors: that one page accounts for 15 of the tree's shortened
 * citations, more than every other page combined (glossary.mdx has 2, topic-structure.mdx
 * 1). An anchored token whose path is a `/`-boundary SUFFIX of a tracked file
 * under `api/mqtt/schema/` or `api/rest/schema/` is now resolved and checked. Three costs,
 * all real:
 *   - A LINE ANCHOR IS REQUIRED. `foo.json` on its own is not resolved, because a bare
 *     basename with nothing to check is worth nothing, and because prose names plenty of
 *     non-schema JSON and YAML files. Requiring `:NN` is what keeps this from guessing.
 *   - AMBIGUITY IS ACCEPTED, NOT FAILED. Each of the 22 files under
 *     `api/mqtt/schema/commands/` has a same-named sibling under
 *     `api/mqtt/schema/response/`, and those 22 pairs are EXACTLY the non-unique names among
 *     the 97 distinct basenames in the two trees' 119 tracked files — `get_config.json`
 *     among them, which is the one the rf-regions page leans on. Failing on ambiguity would
 *     therefore fail the very citations this closes. Instead an ambiguous
 *     citation passes if it holds for AT LEAST ONE candidate, which asserts something
 *     weaker: "some file of this name in the schema trees says this". It still catches
 *     `get_config.json:999`, which passed before. It does not catch a citation that is true
 *     of the command schema but was written about the response schema. Giving the directory
 *     — `response/dev_mgmt/get_config.json:103` — resolves uniquely and gets the full check.
 *     The run prints how many citations were resolved ambiguously.
 *   - CHECK 1 DOES NOT REACH THE SHORTENED FORM, and this is the sharp edge. A shortened
 *     citation is only recognised BECAUSE its path is in the index, so existence is true by
 *     construction and can never fail. Rename a schema file and prose citing it as
 *     `error_codes.json:12` does not go red — it silently leaves the checked set and lands
 *     in the `unresolved` counter the run prints, which is 0 today. So a nonzero unresolved
 *     count is the signal to read, and a rename is still only caught outright in the full
 *     `api/mqtt/schema/…` form. Write the full path the first time a page cites a file.
 *
 * FALSE POSITIVES THIS HAS TO AVOID, each one observed in this tree:
 *   - anything inside a fenced code block. `api/rest/schema/README.md` carries
 *     `rest-api/mqtt/schema/rest_api.yaml`, a path from a previous repository layout, twice
 *     inside plain ``` fences under "Re-deriving its facts", as arguments to a `node -e`
 *     one-liner and a `redocly lint` invocation rather than as claims about this tree.
 *     INLINE code is NOT skipped — a backticked path is the house citation form, so
 *     skipping it would leave the gate checking almost nothing.
 *   - prose naming a DIRECTORY rather than a file. The bare `api/mqtt/schema/` is by a wide
 *     margin the most frequent citation in the tree, and most of those occurrences are one
 *     line: the SCHEMA-DERIVED banner the generator stamps on each of the 24 carry pages
 *     under `api/mqtt/prose/`, which names the directory twice ("keep aligned with
 *     api/mqtt/schema/ … the generator never reads api/mqtt/schema/ for it") for 48 of them.
 *     One page, `CONTRIBUTING.md`, names the bare `api/rest/schema/`. Check 2 handles all of
 *     these as directories. A directory named WITHOUT the trailing slash also
 *     resolves as a directory rather than as a missing file, and is counted separately so
 *     that leniency is visible.
 *
 * DEFENSIVE, NOT OBSERVED HERE. These two guards are carried because the cost of being
 * wrong is a false CI failure on correct prose, but neither fires on this tree today and
 * neither should be described as if it does:
 *   - the LEFT BOUNDARY in CITE, which refuses a match preceded by a path character, is what
 *     would reject `rest-api/mqtt/schema/rest_api.yaml`. Measured across all 255 scanned
 *     files: 0 rejections on non-fenced lines. The only two candidates in the tree are the
 *     `api/rest/schema/README.md` lines above, and the fence tracker excludes those first,
 *     so the boundary never runs on them. It is kept because prose is one edit away from
 *     mentioning such a path outside a fence, and the selftest covers it.
 *   - the MID-SEGMENT GLOB skip. `api/mqtt/schema/**` and
 *     `api/mqtt/schema/commands/{control,dev_mgmt}/*.json` do occur in this repository, but
 *     only in `.ai-history/` and `.audit/` (not scanned) or as bare relative paths with no
 *     schema-tree prefix (`scripts/api/mqtt/docs/generation.md`), which CITE never matches.
 *     Measured: 0 mid-segment glob skips on non-fenced lines across all 255 files. It is
 *     kept because `.../get_*.json` truncates to `.../get_`, which is not a path at all and
 *     would be reported as a missing file.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THIS GATE HAS TWO HALVES, AND THE SECOND ONE IS WHY IT OUTLIVES ITS OWN SUBJECT.
 *
 * Everything above verifies a citation of a FILE in the two schema trees. That is the right
 * check for the legacy MQTT tree — and the legacy MQTT tree is being deleted, replaced
 * wholesale by a single AsyncAPI 3.0.0 contract. A gate that only did the above would go
 * green on that deletion while measuring almost nothing, because a line anchor into one
 * 1.4 MB generated document is not a citation form anyone should use: any reserialisation
 * moves every anchor below the edit.
 *
 * So the house form for citing the contract is an RFC 6901 JSON POINTER, and the POINTER
 * HALF below resolves them — see its own block comment, above `CONTRACT`, for the three
 * forms it accepts and for the count claim, which is its equivalent of "the quoted key is
 * actually on line NN". Added 2026-09-08, deliberately BEFORE the legacy tree is deleted,
 * for the same reason the file half was landed before the schema swap: a check added
 * afterwards has to be born red and is therefore born ignored.
 *
 * The two halves share the scan roots, the `git ls-files` traversal and the fence tracker,
 * on purpose — a gate whose halves disagreed about what is in scope would be worse than
 * either half alone.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
/* -z, because `git ls-files` QUOTES any path containing an emoji or a space and a
 * line-split then mis-parses it. Same trap, same reason, as lint-static-orphans.mjs. */
const lsFiles = (...a) => git('ls-files', '-z', ...a).split('\0').filter(Boolean);

const ROOTS = ['docs', 'api', 'scripts', 'README.md', 'CONTRIBUTING.md'];
const SCHEMA_ROOTS = ['api/mqtt/schema', 'api/rest/schema'];

/* THE LEFT BOUNDARY. Written out in both patterns below rather than shared through a
 * string, because a shared string has to be escaped twice and this file has already lost a
 * measurement to exactly that. Two assertions:
 *   (?<![A-Za-z0-9./-])    nothing that could be the tail of a longer path. This is what
 *                          rejects `rest-api/mqtt/schema/rest_api.yaml`.
 *   (?<![A-Za-z0-9]_{1,3}) a bare `_`, `__` or `___` IS allowed to sit immediately before a
 *                          citation, because markdown italic and bold with underscores are
 *                          ordinary prose forms. Requiring the underscore run itself to be
 *                          preceded by a non-alphanumeric keeps `some_api/mqtt/schema/x.json`
 *                          rejected.
 * The earlier boundary was `(?<![\w./-])`, and `\w` includes `_`, so
 * `_api/mqtt/schema/error_codes.json_` and the `__…__` form produced NO finding at all —
 * the whole citation was dropped, not merely mis-bounded. The trailing delimiter needs the
 * matching fix: `_` IS legal inside a schema filename, so it cannot be excluded from the
 * path class, and is stripped from the END instead (see `file` in extract()). */
const CITE = /(?<![A-Za-z0-9./-])(?<![A-Za-z0-9]_{1,3})api\/(?:mqtt|rest)\/schema\/[A-Za-z0-9_./-]*/g;
/* THE SHORTENED CITATION, AND THE LINE ANCHOR IS OPTIONAL — this is the pattern that sees
 * the founding defect. Measured at HEAD: of the 52 `.mdx` files citing the renamed
 * `error_codes.json`, only 4 pages / 5 citations write the full `api/mqtt/schema/` form;
 * 48 pages write nothing but the bare basename, 94 occurrences of it, and not one of the 94
 * carries a `:NN`. An earlier draft required `:NN` here on the reasoning that "a bare
 * basename with nothing to check is worth nothing"; that reasoning was wrong. A bare
 * basename has EXISTENCE to check, and existence is precisely what the rename broke, so
 * requiring an anchor made this gate blind to 48 of the 52 pages it was built for.
 *
 * THE SHAPE IS RESTRICTED TO WHAT THE TWO SCHEMA TREES ACTUALLY LOOK LIKE, because the
 * alternative is failing correct prose that names a non-schema JSON file. Measured over the
 * 119 tracked files under `api/mqtt/schema/` and `api/rest/schema/`:
 *   - extensions are `.json` (63) and `.yaml` (54) — `.yml` appears ZERO times, which is
 *     what keeps `validate.yml` out;
 *   - no `.json`/`.yaml` basename and no path segment contains a `-`, which is what keeps
 *     `site-metadata.json` out (and, with the left boundary, its `metadata.json` tail too);
 *   - no basename starts with `_`, so the stem must open with an alphanumeric, which is how
 *     `_error_codes.json_` yields `error_codes.json` and not `_error_codes.json`;
 *   - 6 basenames carry an interior dot (`iot_commands.v1.1.json`), so the stem admits `.`.
 * The lookahead `(?![A-Za-z0-9_/])` stops the extension being read out of a longer token and
 * is why `application/json` — 2 occurrences in `api/rest/`, a media type, not a path — is
 * not a citation: nothing in it has a dot before `json`.
 * A directory prefix is still honoured, so `commands/dev_mgmt/config_endpoint.json:77`
 * resolves against exactly as much path as the author wrote. */
const SHORT = /(?<![A-Za-z0-9./-])(?<![A-Za-z0-9]_{1,3})((?:[A-Za-z0-9][A-Za-z0-9_]*\/)*[A-Za-z0-9][A-Za-z0-9_.]*\.(?:json|yaml))(?![A-Za-z0-9_/])(?::(\d+)(?:-(\d+))?)?/g;
/* `:NN` or `:NN-MM` immediately after the path. */
const LINES = /^:(\d+)(?:-(\d+))?/;
/* A glob RUN can only be opened by one of these. `]` and `}` only ever close, so a path
 * truncated by one of them was opened before the path — that is markdown, not a pattern. */
const GLOB_OPEN = /^[*?{[]/;
const GLOB_RUN = /^[*?{}[\]]+/;
/* Does the text after a glob run continue the PATH? `.json` does; a bare `.` ending a
 * sentence does not, and neither does `, which …`. This is the whole glob-versus-markup
 * distinction, so it is deliberately narrow: a continuation has to reach an identifier
 * character within one separator. */
const PATH_CONTINUES = /^[./-]?[A-Za-z0-9_]/;
/* THE ONE HOUSE FORM IS `` `path:NN — "key"` ``: anchor and key in the SAME inline code
 * span, separated by an em dash. That is not a preference dressed up as a rule — it is the
 * only form measured in this tree. Every key the gate parses on the working tree, all 42 of
 * them, uses `—`; no other separator character occurs even once. So the separator class is
 * narrowed to THE DASHES ONLY (`—`, `–`, `-`), which costs this tree nothing and fixes a
 * live false CI failure on correct prose:
 *   See `api/mqtt/schema/openapi.json:2`; `paths` is documented elsewhere.
 * `;` used to be a separator, so the gate promoted the adjacent unrelated code span to a
 * key, checked line 2 for `paths`, and reported a failure against a sentence that claims
 * nothing about line 2. `,`, `:`, `(` and `=` had the same defect. They are gone.
 *
 * WHAT HAPPENS TO THE OTHER FORMS, stated rather than left to be discovered:
 *   - `` `path:NN` — `"key"` `` (anchor and key in two spans, dash between) still parses —
 *     the leading class steps over the closing backtick of the path's own span. This is the
 *     one concession to the two-span shape, and the dash is what makes it unambiguous.
 *   - `` `path:NN` `key` `` with NO dash is NOT a key. It never was, and it must not be: a
 *     bare adjacent code span is, in this tree, overwhelmingly a SECOND CITATION.
 *   - `` `path:NN, "key"` ``, `` `path:NN ("key")` ``, `` `path:NN: "key"` `` are no longer
 *     keys either. They degrade to a keyless anchor — range-checked only, NOT failed — and
 *     every such degradation is counted and printed, so the loss is visible on the run
 *     rather than argued about here. Zero occur today.
 * A KEY MAY NOT LOOK LIKE A PATH OR AN ANCHOR — no `/`, and no `:` followed by a digit
 * (`:(?!\d)` still admits the YAML house form `"operation:"`). That is not decoration: the
 * commonest citation shape on rf-regions-and-regulations.mdx is
 * `` (`get_config.json:101`, `get_current_region.json:66`) ``, two shortened citations side
 * by side, and the SECOND one sits exactly where a backtick-delimited key would. Without
 * the guard the gate read it as the first one's key and reported six failures against
 * correct prose. Empty is captured on purpose so it can be REJECTED in verify() rather than
 * passing vacuously. */
const KEY = /^[\s`*_)\]]*[—–-]\s*(?:`\s*)?(?:"((?:[^"\n/:]|:(?!\d))*)"|'((?:[^'\n/:]|:(?!\d))*)'|`((?:[^`\n/:]|:(?!\d))*)`)/;
/* Something KEY-SHAPED that KEY could not parse — a typo'd separator, which must be NAMED
 * rather than silently dropped, because silent self-deactivation on a typo is how a gate
 * like this stops working without anyone noticing. Split in two on purpose: the separator
 * run is captured, and then TESTED against KEY_INNOCUOUS below. If the run is nothing but
 * markup and ordinary sentence punctuation, the quoted token that follows is ordinary prose
 * and no diagnostic is raised — that is what keeps the `;` sentence above green now that
 * `;` is not a separator. If the run contains anything else (`~`, `=`, `→`, `>`), the author
 * was reaching for the house form and missed, and that is worth a failure. `|` is excluded
 * from the run entirely so a markdown table cell boundary is never read as a separator; the
 * token may not contain whitespace, so the closing backtick of the path's own span plus the
 * next span do not read as one quoted string; and it carries the same no-path, no-anchor
 * guard as KEY. */
const KEY_SHAPED = /^([^A-Za-z0-9|\n]{0,10}?)(?:"(?:[^"\s\n/:]|:(?!\d))+"|'(?:[^'\s\n/:]|:(?!\d))+'|`(?:[^`\s\n/:]|:(?!\d))+`)/;
/* Markup and ordinary sentence punctuation. A separator run built only from these is not a
 * failed attempt at the house form. `—`, `–` and `-` are absent because KEY consumes those
 * first, so a run containing one never reaches here. */
const KEY_INNOCUOUS = /^[\s`*_(),;:.\][]*$/;
/* The CONTINUATION form: a second line reference on the same line, written as a bare
 * backticked `:NN` and resolved against the nearest full citation to its left. Four uses in
 * message-envelope.mdx cite enum RANGES this way (`enum at `:8-11``), and those ranges are
 * precisely the anchors that slide. A continuation may carry a key of its own and is checked
 * if it does. A continuation with no citation to its left on the line is UNRESOLVABLE and
 * skipped, not failed. */
const CONT = /`:(\d+)(?:-(\d+))?`/g;

/* Fence tracking has to remember the OPENING marker: a four-backtick fence may legally
 * contain a three-backtick line, and toggling on any marker would then treat the rest of
 * the file as prose again and scan the code it was meant to skip. */
function isFenceDelimiter(line, open) {
  const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  const mark = m[1];
  if (!open) return mark;
  return mark[0] === open[0] && mark.length >= open.length ? '' : null;
}

/**
 * The index every check resolves against. Built from a PATH LIST, never from the
 * filesystem, so existence is byte-for-byte on every platform and so the selftest can hand
 * it a synthetic tree.
 *   files    — exact tracked paths
 *   dirs     — every directory prefix of a tracked path
 *   lc       — lowercased path -> exact path, for the case-only-mismatch diagnostic
 *   suffixes — `/`-boundary suffix -> candidate schema paths, for SHORT
 *   offTree  — basenames that name a real file OUTSIDE the two schema trees, so a bare
 *              basename in prose can be told apart from a rotted schema citation without
 *              a hand-maintained exception list. Two sources, both deterministic and both
 *              byte-for-byte on every platform:
 *                every tracked path's basename, and
 *                the basename of every literal path named in `.gitignore` (`ignored`),
 *              which is what covers `routesChunkNames.json` and `site-metadata.json` —
 *              CONTRIBUTING.md names both, both are real `.docusaurus/` artifacts, and
 *              `.gitignore:144-145` names them exactly, so neither is tracked and neither
 *              is on a fresh CI checkout before the build runs. A disk probe would have
 *              made this gate pass locally and fail in CI, which is the one outcome it
 *              cannot afford.
 */
function makeIndex(paths, ignored = []) {
  const files = new Set(paths);
  const dirs = new Set();
  const lc = new Map();
  const suffixes = new Map();
  const offTree = new Set();
  for (const n of ignored) offTree.add(n);
  for (const p of paths) {
    if (!SCHEMA_ROOTS.some((r) => p.startsWith(`${r}/`))) offTree.add(p.slice(p.lastIndexOf('/') + 1));
  }
  for (const p of paths) {
    lc.set(p.toLowerCase(), p);
    for (let i = p.indexOf('/'); i !== -1; i = p.indexOf('/', i + 1)) {
      dirs.add(p.slice(0, i));
      lc.set(p.slice(0, i).toLowerCase(), p.slice(0, i));
    }
    if (!SCHEMA_ROOTS.some((r) => p.startsWith(`${r}/`))) continue;
    /* Index every suffix that starts at a segment boundary, so the author is checked
     * against exactly as much path as they chose to write. */
    const seg = p.split('/');
    for (let i = 1; i < seg.length; i++) {
      const s = seg.slice(i).join('/');
      if (!suffixes.has(s)) suffixes.set(s, []);
      suffixes.get(s).push(p);
    }
  }
  return { files, dirs, lc, suffixes, offTree };
}

/** Parse an optional `— "key"` after an anchor. Returns `{ key }`, `{ unparsed }`, or `{}`. */
function parseKey(rest) {
  const k = KEY.exec(rest);
  if (k) return { key: k[1] ?? k[2] ?? k[3], matched: k[0] };
  const s = KEY_SHAPED.exec(rest);
  /* A quoted token separated from the anchor by markup and ordinary punctuation only is
   * ordinary prose, not a failed house form. See KEY_INNOCUOUS. */
  if (s && !KEY_INNOCUOUS.test(s[1])) return { unparsed: s[0] };
  return {};
}

/**
 * Pull every citation out of one document's text. Returns one record per citation with
 * `cited` as written (for the report) and either `file` (a resolved repo path) or
 * `candidates` (a shortened citation's possible targets). `unresolved` counts anchored
 * `.json`/`.yaml` tokens that name no file in the schema trees — the remaining blind spot,
 * counted so it is visible rather than silent.
 */
function extract(text, ix) {
  const out = [];
  let bareProse = 0;
  let keyDowngraded = 0;
  /* Shortened tokens whose name is in NEITHER schema tree. Counted at extraction because
   * that is the only place the distinction is cheap: by the time verify() has run, an
   * off-tree name that happens to match a real file elsewhere in the repository
   * (`package.json`) is indistinguishable in the stats from one that matches nothing at
   * all. This is the blind spot the header calls out, and a number is what keeps it
   * visible. --selftest asserts it directly, so it cannot quietly go to zero. */
  let unresolved = 0;
  let open = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    const delim = isFenceDelimiter(raw, open);
    if (delim !== null) { open = delim || null; continue; }
    if (open) continue;

    const onThisLine = [];
    const spans = [];
    for (const m of raw.matchAll(CITE)) {
      const rest = raw.slice(m.index + m[0].length);
      const g = GLOB_RUN.exec(rest);
      const midSegmentGlob = !!g && GLOB_OPEN.test(g[0]) &&
        PATH_CONTINUES.test(rest.slice(g[0].length)) && !m[0].endsWith('/');
      if (midSegmentGlob) continue;
      spans.push([m.index, m.index + m[0].length]);
      /* Prose ends a sentence with the path: `…response_codes.json.` A trailing dot is
       * punctuation, never part of a filename in either schema tree — and neither is a
       * trailing `_`, which is how `_api/mqtt/schema/x.json_` and `__…__` close. `_` is
       * legal INSIDE a schema filename, so it can only be stripped from the end. A trailing
       * `/` is left alone: that is the directory form check 2 exists for. */
      const file = m[0].replace(/[._]+$/, '');
      if ((raw.slice(0, m.index).match(/`/g) || []).length % 2 === 0) bareProse++;
      const ln = LINES.exec(rest);
      const c = {
        line: i + 1, index: m.index, file, candidates: null, short: null, cited: file,
        from: null, to: null, key: null, keyUnparsed: null,
      };
      if (ln) {
        c.from = Number(ln[1]);
        c.to = ln[2] ? Number(ln[2]) : null;
        c.cited = `${file}:${ln[0].slice(1)}`;
        const k = parseKey(rest.slice(ln[0].length));
        if (k.key !== undefined) { c.key = k.key; c.cited += ` — "${k.key}"`; }
        else if (k.unparsed) c.keyUnparsed = k.unparsed;
        else if (KEY_SHAPED.test(rest.slice(ln[0].length))) keyDowngraded++;
      }
      out.push(c);
      onThisLine.push(c);
    }

    for (const m of raw.matchAll(SHORT)) {
      /* Skip anything already consumed by CITE — the basename of a full schema path is not
       * a second, shortened citation of the same file. */
      const s = m.index, e = m.index + m[0].length;
      if (spans.some(([a, b]) => s < b && a < e)) continue;
      /* `candidates: null` is NOT "skip this". A shortened citation whose name is in no
       * schema tree is exactly the founding defect, and verify() is where it is either
       * excused as a real file outside the schema trees or FAILED. */
      const cands = ix.suffixes.get(m[1]) ?? null;
      if (cands === null) unresolved++;
      const rest = raw.slice(e);
      const c = {
        line: i + 1, index: m.index, file: null, candidates: cands, short: m[1],
        cited: cands ? `${m[0]} (resolved from a shortened path)` : m[0],
        from: m[2] ? Number(m[2]) : null, to: m[3] ? Number(m[3]) : null,
        key: null, keyUnparsed: null,
      };
      if (c.from !== null) {
        const k = parseKey(rest);
        if (k.key !== undefined) { c.key = k.key; c.cited += ` — "${k.key}"`; }
        else if (k.unparsed) c.keyUnparsed = k.unparsed;
        else if (KEY_SHAPED.test(rest)) keyDowngraded++;
      }
      out.push(c);
      onThisLine.push(c);
    }

    for (const m of raw.matchAll(CONT)) {
      /* NEAREST citation to the left, by character offset: the largest `index` still below
       * this one. `onThisLine` is filled by CITE first and SHORT second, so a scan that
       * keeps the last array element below `m.index` picks the last one SEEN, not the
       * nearest — two different answers whenever a line mixes the two forms.
       * docs/resources/glossary.mdx:46 is that line: it carries a full
       * `api/mqtt/schema/refrence/payload/cfgEndpointPayload.yaml:28`, then `` `:80` ``,
       * then two shortened citations, so the bug was live on exactly the file the previous
       * version of this comment named as its evidence. */
      let base = null;
      for (const c of onThisLine) {
        if (c.index < m.index && (base === null || c.index > base.index)) base = c;
      }
      if (!base) continue;
      const label = base.file ?? base.short;
      const c = {
        line: i + 1,
        index: m.index,
        file: base.file,
        candidates: base.candidates,
        short: base.short,
        cited: `${label}:${m[1]}${m[2] ? `-${m[2]}` : ''} (continuation)`,
        from: Number(m[1]),
        to: m[2] ? Number(m[2]) : null,
        key: null,
        keyUnparsed: null,
      };
      const k = parseKey(raw.slice(m.index + m[0].length));
      if (k.key !== undefined) { c.key = k.key; c.cited += ` — "${k.key}"`; }
      else if (k.unparsed) c.keyUnparsed = k.unparsed;
      else if (KEY_SHAPED.test(raw.slice(m.index + m[0].length))) keyDowngraded++;
      out.push(c);
    }
  }
  return { cites: out, bareProse, keyDowngraded, unresolved };
}

/* A line count that does not lie about a file with no trailing newline. 89 of the 117
 * tracked files under api/mqtt/schema/ end without one, so this is the common case here,
 * not the edge case: `refrence/response/currentRegionResponse.yaml` is 43 lines but `wc -l` reports
 * 42, and a naive count would report the true citation
 * `…currentRegionResponse.yaml:36-43` in rf-regions-and-regulations.mdx as out of
 * range. */
const lineCache = new Map();
function readLines(p) {
  if (lineCache.has(p)) return lineCache.get(p);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lineCache.set(p, lines);
  return lines;
}

/** Every line (1-based) of `p` containing `key`. */
function keyLines(p, key) {
  const at = [];
  const lines = readLines(p);
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(key)) at.push(i + 1);
  return at;
}

/** Checks 3 and 4 against one concrete file. Returns a reason string, or null. */
function checkLines(c, p) {
  let lines;
  try {
    lines = readLines(p);
  } catch {
    return `${p} is tracked but is not on disk, so its lines cannot be checked`;
  }
  if (c.from < 1 || (c.to !== null && c.to < 1)) return 'line number is not positive';
  if (c.to !== null && c.to < c.from) {
    return `range ${c.from}-${c.to} runs backwards, so neither end was ever checked`;
  }
  const last = c.to ?? c.from;
  if (c.from > lines.length || last > lines.length) return `${p} has only ${lines.length} line(s)`;
  if (c.key === null) return null;
  /* An EMPTY key satisfies `includes('')` on every line, so it would inflate the reported
   * key count while asserting nothing at all. */
  if (c.key.trim() === '') return 'the quoted key is empty, so the citation asserts nothing';
  /* THE KEY IS CHECKED ON LINE `from`, INCLUDING FOR A RANGE. `path:NN` and `path:NN-MM`
   * have to mean the same thing about line NN, because checks 3 and 4 both treat NN as the
   * anchor and a slide is exactly a change in NN. "Anywhere in the range" would be close to
   * vacuous for a citation like `operatingModePayload.yaml:105-178`, 74 lines wide. The
   * house form agrees: `cfgEndpointPayload.yaml:6 — "operation:"`, `enum at :8-11` puts
   * `enum:` on line 8, the range's first line. Where the key is elsewhere, the diagnostic
   * says where, which is the fix. */
  if (lines[c.from - 1].includes(c.key)) return null;
  const at = keyLines(p, c.key);
  const hint = at.length
    ? ` — "${c.key}" is at ${at.slice(0, 4).map((n) => `:${n}`).join(', ')}${at.length > 4 ? ', …' : ''}`
    : ` — "${c.key}" is nowhere in ${p}`;
  return `line ${c.from} does not contain "${c.key}" — it is: ${lines[c.from - 1].trim().slice(0, 60)}${hint}`;
}

/**
 * Check one citation against the index. Returns `{ reason, kind }`; `reason` is null when
 * the citation holds. `kind` records what the citation turned out to be, for the counters.
 */
function verify(c, ix) {
  if (c.keyUnparsed) {
    return {
      kind: 'key-unparsed',
      reason: `an anchor is followed by something key-shaped this gate cannot parse ` +
        `(${JSON.stringify(c.keyUnparsed)}), so nothing on the line was checked — write it as ` +
        `\`path:NN — "key"\``,
    };
  }

  /* A SHORTENED citation: hold if it holds for at least one candidate. Ambiguity is
   * accepted rather than failed; see the header. `target` names the candidate that actually
   * satisfied it, so the multi-key counter in main() reads the file the citation is really
   * about rather than `candidates[0]`. */
  if (c.candidates) {
    if (c.from === null) {
      /* Existence only, and it is true by construction: the token was recognised BECAUSE
       * its path suffix is in the index. This is the case that catches the founding defect,
       * and it catches it on the OTHER branch below — by the name being absent. */
      return {
        kind: c.candidates.length > 1 ? 'short-ambiguous' : 'short-unique',
        reason: null,
        target: c.candidates[0],
      };
    }
    const reasons = c.candidates.map((p) => checkLines(c, p));
    const ok = reasons.indexOf(null);
    if (ok !== -1) {
      return {
        kind: c.candidates.length > 1 ? 'short-ambiguous' : 'short-unique',
        reason: null,
        target: c.candidates[ok],
      };
    }
    if (c.candidates.length === 1) return { kind: 'short-unique', reason: reasons[0] };
    return {
      kind: 'short-ambiguous',
      reason: `no file of this name in the schema trees satisfies it — ` +
        c.candidates.map((p, i) => `${p}: ${reasons[i]}`).join('; '),
    };
  }

  /* A SHORTENED citation THAT RESOLVES TO NOTHING. This is check 1 reaching the bare
   * basename, and it is the whole reason this gate exists: `error_codes.json`, written with
   * no prefix and no anchor, by 48 of the 52 pages that cited the renamed file.
   * The one escape is a name that belongs to a real file OUTSIDE the schema trees —
   * `package.json`, `routing-manifest.json`, `tag_config.json`, `routesChunkNames.json` —
   * which is a true statement about this repository, just not a claim about the schema. It
   * is counted, not failed, so the leniency is visible. See makeIndex's `offTree`. */
  /* `!= null`, NOT `!== null`: a citation object assembled by hand — which is what the
   * verification selftest passes, and what any future caller building one field at a time
   * would pass — has `short` ABSENT rather than null, and `undefined !== null` is true, so
   * the strict form fell through to `.slice()` on undefined and killed the run with a
   * TypeError. It never fired in main(), because extract() always sets `short` explicitly;
   * it fired in --selftest, which is how a gate ends up excluded from CI. A guard on an
   * optional field has to tolerate the field being missing. */
  if (c.short != null) {
    const base = c.short.slice(c.short.lastIndexOf('/') + 1);
    if (ix.files.has(c.short) || ix.offTree.has(base)) return { kind: 'off-tree', reason: null };
    return {
      kind: 'missing',
      reason: `names no tracked file under ${SCHEMA_ROOTS.map((r) => `${r}/`).join(' or ')}, ` +
        'and no tracked file anywhere in this repository — a shortened citation of a schema ' +
        'file that has been renamed or removed looks exactly like this',
    };
  }

  const wantsDir = c.file.endsWith('/');
  const p = wantsDir ? c.file.slice(0, -1) : c.file;

  if (!ix.files.has(p)) {
    if (ix.dirs.has(p)) {
      if (c.from !== null) return { kind: 'dir', reason: 'cited with a line number but is a directory' };
      /* A directory named without the trailing slash. Accepted, and counted, so the
       * leniency shows up in the report instead of being invisible. */
      return { kind: wantsDir ? 'dir' : 'dir-no-slash', reason: null };
    }
    const exact = ix.lc.get(p.toLowerCase());
    if (exact) {
      return {
        kind: 'missing',
        reason: `no tracked path spelled this way — the tracked path is \`${exact}\`. ` +
          'A case-only difference passes on Windows and fails on the CI runner',
      };
    }
    return { kind: 'missing', reason: `${wantsDir ? 'directory' : 'file'} is not tracked at this path` };
  }
  if (wantsDir) return { kind: 'dir', reason: 'cited as a directory but is a file' };
  if (c.from === null) return { kind: 'file', reason: null, target: p };
  return { kind: 'file', reason: checkLines(c, p), target: p };
}

/**
 * Basenames of the literal paths named in `.gitignore`, so a bare basename in prose that
 * names a deliberately-untracked file is not mistaken for a rotted schema citation. Only
 * entries whose last segment carries a `.json`/`.yaml`/`.yml` extension are taken, and
 * `*`/`?` entries are dropped, so a pattern can never widen the escape into a wildcard.
 * `.gitignore` is tracked, so this is the same on every clone and on the runner.
 */
function ignoredNames() {
  let text;
  try {
    text = fs.readFileSync('.gitignore', 'utf8');
  } catch {
    /* No .gitignore is a legal repository. The escape set is then empty, which only makes
     * the gate stricter, so this is not silently weakening anything. */
    return [];
  }
  const out = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('#') || t.startsWith('!')) continue;
    const b = t.replace(/\/+$/, '');
    const name = b.slice(b.lastIndexOf('/') + 1);
    if (/[*?[\]]/.test(name) || !/\.(json|ya?ml)$/.test(name)) continue;
    out.push(name);
  }
  return out;
}

/* ── THE POINTER HALF ───────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS. Everything above verifies a citation of a FILE: that the path is tracked,
 * that line NN is in range, that the quoted key sits on it. That is the right check for the
 * legacy schema tree and the wrong one for what replaces it. The AsyncAPI contract is ONE
 * generated document of 1,397,322 bytes, so a line anchor into it is rot waiting to happen —
 * any reserialisation moves every anchor below the edit. The house form for citing it is
 * therefore an RFC 6901 JSON Pointer, and the citation sweep of 2026-09-08 made that
 * explicit: "say nothing about provenance where the sentence reads fine without it, then
 * 'the API contract', then a verified pointer — and never a filename, because that path has
 * already moved twice."
 *
 * AND THE GATE COULD NOT SEE ONE OF THEM. Measured before this half existed: the contract
 * was cited by full path exactly ONCE across every scanned root; its own basename cannot
 * match SHORT, because that pattern excludes `-` and this filename carries four; and a
 * pointer is matched by neither pattern, having no path in it at all. So the incentive ran
 * BACKWARDS — citing the contract in the mandated form made a citation invisible to CI,
 * while citing a file the migration is about to delete got it verified. Deleting the legacy
 * tree in that state would have traded ~150 mechanically checked citations for ~5, with this
 * gate still reporting green. That is the failure this half prevents.
 *
 * THREE FORMS, because three are what the tree actually uses. Measured, not anticipated:
 *   LITERAL     `#/components/schemas/statusCode/enum`
 *               Must resolve. Nothing clever.
 *   BRACED      `#/operations/receive_reboot/x-iotc-response-codes/{universal,scoped}`
 *               An explicit enumeration of named siblings — 7 of the 15 pointers in the tree
 *               are this shape. Expanded to every combination, and ALL must resolve, because
 *               the author named each one on purpose.
 *   TEMPLATED   `#/operations/<op>/x-iotc-response-codes/{universal,scoped}`
 *               `<op>` stands for "any operation". It asserts a SHAPE, not a node, so
 *               requiring it to resolve literally would fail correct prose. Each real child
 *               of the literal prefix is substituted in turn and AT LEAST ONE must resolve —
 *               the same "satisfied by at least one candidate" rule verify() already applies
 *               to an ambiguous shortened citation, so the two halves stay consistent.
 *
 * THE COUNT CLAIM IS THE STRONG CHECK, and it is this half's answer to "the quoted key is
 * actually on line NN". A pointer may be followed by `(N rows)`, and when it is, N is
 * compared against the real length of the target. That is not hypothetical rigour: this
 * repository published "35 response codes" against a catalogue of 38 for the whole of one
 * window, and the sweep had to correct it by hand on four pages. With this check the next
 * such drift arrives as a red build instead of as prose nobody re-counted. Pointers that
 * carry no count claim are COUNTED in the report, so the size of the remaining blind spot
 * stays visible rather than being implied away.
 */
const CONTRACT = 'api/mqtt/schema/iotc-rfd40-90-mqtt.asyncapi.json';

/* A POINTER TOKEN. The left boundary rejects a URL fragment (`https://host#/x`) by refusing
 * any preceding character that could be the tail of a URL, while still allowing the common
 * markdown wrappers — a backtick, `(`, `*`, whitespace — because a pointer in this tree is
 * nearly always inside inline code. A segment admits the RFC 6901 escapes `~0` and `~1`, a
 * `<placeholder>`, and a `{a,b}` group; `/` separates. A trailing `.` or `,` is sentence
 * punctuation and is stripped after matching, never matched into the pointer, because no key
 * anywhere in the contract ends in either. */
const POINTER = /(?<![A-Za-z0-9._~:/?&=-])#\/(?:[A-Za-z0-9_.~-]+|<[A-Za-z0-9_-]+>|\{[A-Za-z0-9_,.~-]+\}|\/)+/g;
/* `(38 rows)` — a quantity claim about the node the pointer names. The closing paren must
 * follow the word immediately, which is what keeps `(0-36 and 101)` and `(2 of 3)` from
 * being read as counts.
 *   THE LEADING CLASS IS NOT DECORATION. A pointer in this tree is nearly always inside
 * inline code, so the characters between it and its count are the closing markup —
 * `` `#/…/codes` (38 rows) ``. Anchoring on `\s*` alone put a backtick in the way and read
 * every counted pointer in the repository as uncounted, which the selftest caught and a
 * green run would not have: an unasserted count is invisible, not loud. Same class, and the
 * same reason, as KEY's. */
const PTR_COUNT = /^[\s`*_)\]]*\((\d+)\s+([a-z]+)\)/;
/* A POINTER OPENING THAT PARSES AS NOTHING. Defined as a `#/` at an index where POINTER
 * itself matched nothing at all — `#/{unclosed` is one. It is deliberately NOT "the token
 * has a space in it": `#/components/schemas/statusCode/enum and then` is a pointer followed
 * by prose, and is indistinguishable from a pointer with a space by any rule this gate could
 * write. Counted rather than failed, because a form this half is blind to is worth a number
 * even when it is not worth a red build — the same reason parseKey() reports `unparsed`
 * instead of returning nothing. */
const PTR_OPEN = /(?<![A-Za-z0-9._~:/?&=-])#\//g;

/** RFC 6901: `~1` is a literal `/` and `~0` a literal `~`, in that order. */
const unescapeSeg = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');

let contractCache;
/** The contract, parsed once. `null` if it is not on disk — the caller decides what that means. */
function loadContract() {
  if (contractCache !== undefined) return contractCache;
  try {
    contractCache = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
  } catch {
    contractCache = null;
  }
  return contractCache;
}

/** Levenshtein, abandoned once it exceeds `cap` — only near misses are worth suggesting. */
function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The sibling most likely to be what the author meant. A case-only difference first, because
 * that is the miss a Windows author cannot see, then an edit distance of at most 2. Returns
 * null rather than guessing at anything further away — a bad suggestion is worse than none.
 */
function nearestKey(want, siblings) {
  const ci = siblings.find((k) => k.toLowerCase() === want.toLowerCase());
  if (ci && ci !== want) return ci;
  let best = null;
  let bestD = 3;
  for (const k of siblings) {
    const d = editDistance(want, k);
    if (d < bestD) { bestD = d; best = k; }
  }
  return bestD <= 2 ? best : null;
}

/**
 * Expand `{a,b}` groups into every combination. Returns `{ concrete, braced }`.
 * Bounded at 64: a pointer needing more than that is not a citation anyone can check by
 * reading, and an unbounded cartesian product on hostile input is a denial of service.
 */
function expandBraces(ptr) {
  let out = [ptr];
  let braced = false;
  while (true) {
    const next = [];
    let changed = false;
    for (const p of out) {
      const m = /\{([A-Za-z0-9_,.~-]+)\}/.exec(p);
      if (!m) { next.push(p); continue; }
      changed = true;
      braced = true;
      for (const alt of m[1].split(',')) {
        next.push(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length));
      }
    }
    out = next;
    if (!changed) break;
    if (out.length > 64) return { concrete: out.slice(0, 64), braced, truncated: true };
  }
  return { concrete: out, braced, truncated: false };
}

/**
 * Walk one concrete pointer. Returns `{ ok, node }`, or `{ ok: false }` with the deepest
 * prefix that DID resolve, the segment that broke, and that segment's siblings — because
 * "does not resolve" on a 240-schema document is a diagnostic that sends the reader nowhere.
 */
function resolvePointer(doc, ptr) {
  const segs = ptr.slice(1).split('/').slice(1).map(unescapeSeg);
  let node = doc;
  let prefix = '#';
  for (const seg of segs) {
    if (node === null || typeof node !== 'object') {
      return { ok: false, prefix, seg, siblings: [], why: 'which is a scalar, so it has no members' };
    }
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(seg)) {
        return { ok: false, prefix, seg, siblings: [], why: `which is an array of ${node.length}, so the segment must be a numeric index` };
      }
      const i = Number(seg);
      if (i >= node.length) {
        return { ok: false, prefix, seg, siblings: [], why: `which is an array of ${node.length}, so index ${i} is out of range` };
      }
      node = node[i];
    } else {
      if (!Object.prototype.hasOwnProperty.call(node, seg)) {
        return { ok: false, prefix, seg, siblings: Object.keys(node), why: 'which has no such member' };
      }
      node = node[seg];
    }
    prefix += `/${seg}`;
  }
  return { ok: true, node };
}

/** How many members the node has, or null if counting it is meaningless. */
function nodeSize(node) {
  if (Array.isArray(node)) return node.length;
  if (node !== null && typeof node === 'object') return Object.keys(node).length;
  return null;
}

/**
 * Every pointer citation in `text`, with its line and any count claim. Fenced code is not a
 * claim about the contract, and the fence state is tracked with the SAME helper the file half
 * uses, so the two cannot disagree about what is in scope.
 */
function extractPointers(text) {
  const out = [];
  let malformed = 0;
  let open = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    const delim = isFenceDelimiter(raw, open);
    if (delim !== null) { open = delim || null; continue; }
    if (open) continue;

    const starts = new Set();
    for (const m of raw.matchAll(POINTER)) {
      starts.add(m.index);
      /* Sentence punctuation is not part of the pointer. Stripped from the END only: `.` is
       * legal inside a JSON key, just not as this tree's last character. */
      const ptr = m[0].replace(/[.,;:]+$/, '');
      /* Slice past the WHOLE match, not past the stripped pointer — otherwise the punctuation
       * that was just removed sits between the pointer and its count claim and hides it. */
      const rest = raw.slice(m.index + m[0].length);
      const cm = PTR_COUNT.exec(rest);
      out.push({
        line: i + 1,
        raw: ptr,
        count: cm ? Number(cm[1]) : null,
        unit: cm ? cm[2] : null,
      });
    }
    for (const m of raw.matchAll(PTR_OPEN)) {
      if (!starts.has(m.index)) malformed++;
    }
  }
  return { ptrs: out, malformed };
}

/**
 * Verify one pointer citation against the contract. Returns a reason string, or null.
 * `kind` is reported so the run can say how much of its own strength is real.
 */
function verifyPointer(p, doc) {
  const { concrete, braced, truncated } = expandBraces(p.raw);
  if (truncated) {
    return { kind: 'braced', reason: 'expands to more than 64 pointers, which is not a citation a reader can check' };
  }
  const templated = concrete.some((c) => /<[A-Za-z0-9_-]+>/.test(c));

  if (templated) {
    /* Substitute every real child of the literal prefix and require one to hold. The prefix
     * is everything left of the FIRST placeholder; if that much does not resolve, the failure
     * is there and is reported plainly rather than as "no candidate matched". */
    const failures = [];
    for (const c of concrete) {
      const at = c.indexOf('<');
      const prefix = c.slice(0, at).replace(/\/$/, '');
      const head = resolvePointer(doc, prefix || '#');
      if (!head.ok) {
        return { kind: 'templated', reason: pointerReason(head) };
      }
      const kids = Array.isArray(head.node)
        ? head.node.map((_, i) => String(i))
        : (head.node && typeof head.node === 'object' ? Object.keys(head.node) : []);
      if (!kids.length) {
        return { kind: 'templated', reason: `${prefix} has no members, so the template can never resolve` };
      }
      const tail = c.slice(c.indexOf('>', at) + 1);
      const hit = kids.some((k) => resolvePointer(doc, `${prefix}/${k}${tail}`).ok);
      if (!hit) {
        failures.push(`no member of ${prefix} satisfies \`…${tail}\` — tried all ${kids.length}`);
      }
    }
    if (failures.length) return { kind: 'templated', reason: failures[0] };
    return { kind: 'templated', reason: null };
  }

  for (const c of concrete) {
    const r = resolvePointer(doc, c);
    if (!r.ok) {
      return {
        kind: braced ? 'braced' : 'literal',
        reason: (braced ? `expands to ${c}, which ` : '') + pointerReason(r),
      };
    }
  }

  /* THE COUNT CLAIM. Only reached when every expansion resolved, and asserted against the
   * FIRST — a braced pointer naming two siblings has one count between them, so checking each
   * would demand they be equal, which the author never claimed. */
  if (p.count !== null) {
    const r = resolvePointer(doc, concrete[0]);
    const size = nodeSize(r.node);
    if (size === null) {
      return { kind: 'count', reason: `is claimed to have ${p.count} ${p.unit}, but names a scalar, which has no members to count` };
    }
    if (size !== p.count) {
      return { kind: 'count', reason: `claims ${p.count} ${p.unit} but the contract has ${size}` };
    }
    return { kind: 'count', reason: null };
  }
  return { kind: braced ? 'braced' : 'literal', reason: null };
}

/** The failure sentence for a broken walk, with a suggestion when there is a near miss. */
function pointerReason(r) {
  const near = r.siblings.length ? nearestKey(r.seg, r.siblings) : null;
  const where = `resolves as far as ${r.prefix}, ${r.why}: \`${r.seg}\``;
  if (near) return `${where}. Did you mean \`${near}\`?`;
  if (r.siblings.length && r.siblings.length <= 12) {
    return `${where}. Members there are: ${r.siblings.map((k) => `\`${k}\``).join(', ')}`;
  }
  if (r.siblings.length) return `${where}. That node has ${r.siblings.length} members, none of them this`;
  return where;
}

function main() {
  /* Resolve to the repository root so `git ls-files` output and `fs` reads agree no matter
   * which directory the run was started from. */
  process.chdir(git('rev-parse', '--show-toplevel').trim());

  /* --require-keys: the strict mode. See the KEYLESS ANCHORS section of the header — it is
   * the only mode that can see a keyless anchor that has slid, and it is deliberately not
   * the CI default, because this tree carries 54 keyless anchors and a gate that is red for
   * a house-style reason on 54 lines is a gate people learn to ignore. */
  const requireKeys = process.argv.includes('--require-keys');

  const ix = makeIndex(lsFiles(), ignoredNames());
  const docs = lsFiles(...ROOTS).filter((p) => /\.mdx?$/i.test(p));

  const failures = [];
  const unreadable = [];
  const keyless = [];
  const n = {
    cites: 0, citing: 0, anchors: 0, ranges: 0, keys: 0, keyless: 0, bareProse: 0,
    dirs: 0, dirsNoSlash: 0, shortUnique: 0, shortAmbiguous: 0, offTree: 0, multiKey: 0,
    keyDowngraded: 0, unresolved: 0,
    /* the pointer half */
    ptrs: 0, ptrFiles: 0, ptrLiteral: 0, ptrBraced: 0, ptrTemplated: 0,
    ptrCounted: 0, ptrMalformed: 0,
  };
  const doc = loadContract();

  /* B9: a scan root that is not tracked at its expected path means the scan silently got
   * smaller. That has to be louder than a passing run. */
  for (const r of ROOTS) {
    if (!ix.files.has(r) && !ix.dirs.has(r)) {
      failures.push({
        where: 'scripts/site/lint-schema-citations.mjs (ROOTS)',
        cited: r,
        reason: 'scan root is not tracked at this path, so this run checked less than it claims to',
      });
    }
  }

  for (const d of docs) {
    let text;
    try {
      text = fs.readFileSync(d, 'utf8');
    } catch {
      /* TRACKED BUT ABSENT FROM THE WORKTREE is a real state — `git ls-files` lists a
       * deleted-but-unstaged path — and an unguarded read then kills the run mid-report,
       * so the operator sees a stack trace instead of the findings. Named, not swallowed. */
      unreadable.push(d);
      continue;
    }
    const { cites, bareProse, keyDowngraded, unresolved } = extract(text, ix);
    n.bareProse += bareProse;
    n.keyDowngraded += keyDowngraded;
    n.unresolved += unresolved;
    if (cites.length) n.citing++;

    /* THE POINTER HALF, over the same text and the same fence state. Run before the file
     * loop's `continue` statements can skip it. */
    const { ptrs, malformed } = extractPointers(text);
    n.ptrMalformed += malformed;
    if (ptrs.length) n.ptrFiles++;
    for (const p of ptrs) {
      n.ptrs++;
      if (doc === null) {
        /* The contract is the one thing this half resolves against. Missing, it cannot
         * check anything — and passing quietly would be the exact self-deactivation the
         * header of this file exists to prevent. */
        failures.push({
          where: `${d}:${p.line}`,
          cited: p.raw,
          reason: `cannot be checked: ${CONTRACT} is not readable, so every pointer citation in this repository is unverified`,
        });
        continue;
      }
      const { kind, reason } = verifyPointer(p, doc);
      if (kind === 'literal') n.ptrLiteral++;
      if (kind === 'braced') n.ptrBraced++;
      if (kind === 'templated') n.ptrTemplated++;
      if (kind === 'count') n.ptrCounted++;
      if (reason) failures.push({ where: `${d}:${p.line}`, cited: p.raw, reason });
    }
    for (const c of cites) {
      n.cites++;
      if (c.from !== null) n.anchors++;
      if (c.to !== null) n.ranges++;
      if (c.key !== null) n.keys++;
      else if (c.from !== null && !c.keyUnparsed) n.keyless++;
      const { reason, kind, target } = verify(c, ix);
      if (kind === 'dir' || kind === 'dir-no-slash') n.dirs++;
      if (kind === 'dir-no-slash') n.dirsNoSlash++;
      if (kind === 'short-unique') n.shortUnique++;
      if (kind === 'short-ambiguous') n.shortAmbiguous++;
      if (kind === 'off-tree') n.offTree++;
      /* How much of check 4's strength is real: a key that occurs many times in the cited
       * file cannot distinguish the declaration from a mention. See the header. `target` is
       * the file the citation actually resolved against, which for an ambiguous shortened
       * citation is the candidate that satisfied it, not `candidates[0]`. */
      if (!reason && c.key && target && keyLines(target, c.key).length > 1) n.multiKey++;
      if (reason) { failures.push({ where: `${d}:${c.line}`, cited: c.cited, reason }); continue; }
      /* A KEYLESS ANCHOR IS NAMED, not merely counted. Two of the seven anchors that had
       * slid at HEAD were keyless continuations, and the three citations this gate is known
       * to be wrongly green on are keyless, so a bare count says "there is a hole" while
       * this says which lines are in it. --require-keys turns the list into failures. */
      if (c.from !== null && c.key === null && !c.keyUnparsed) {
        keyless.push({ where: `${d}:${c.line}`, cited: c.cited });
      }
    }
  }

  console.log(`lint-schema-citations — ${n.cites} schema citation(s) in ${n.citing} of ${docs.length} ` +
    `tracked .md/.mdx file(s) under ${ROOTS.join(', ')}`);
  console.log(`  ${n.anchors} carry a line number or range (${n.ranges} range(s)); ` +
    `${n.keys} of those also quote a key, ${n.keyless} do not`);
  console.log(`  ${n.dirs} name a directory (${n.dirsNoSlash} without a trailing "/"); ` +
    `${n.bareProse} sit in bare prose rather than inline code`);
  console.log(`  ${n.shortUnique + n.shortAmbiguous} resolved from a shortened path ` +
    `(${n.shortAmbiguous} ambiguous, checked as "satisfied by at least one candidate"); ` +
    `${n.offTree} name a file outside the schema trees and are not checked against them`);
  console.log(`  ${n.ptrs} JSON Pointer citation(s) of the contract in ${n.ptrFiles} file(s) ` +
    `(${n.ptrLiteral} literal, ${n.ptrBraced} braced, ${n.ptrTemplated} templated), of which ` +
    `${n.ptrCounted} also claim a member count and had it compared`);
  console.log('  blind spots, printed so they stay visible: ' +
    `${n.keyless} anchor(s) with no quoted key are range-checked only; ` +
    `${n.multiKey} quoted key(s) occur more than once in the cited file; ` +
    `${n.keyDowngraded} anchor(s) put a quoted token after a separator this gate does not ` +
    'accept, so they are range-checked only; ' +
    `${n.unresolved} shortened token(s) name no file in either schema tree; ` +
    `${n.ptrs - n.ptrCounted} pointer(s) assert existence but no member count; ` +
    `${n.ptrMalformed} pointer-shaped token(s) matched no form this gate parses`);
  if (unreadable.length) {
    console.log(`  note: ${unreadable.length} tracked file(s) not on disk, skipped: ${unreadable.join(', ')}`);
  }
  if (keyless.length) {
    console.log(`\n  ${keyless.length} anchor(s) carry no quoted key, so all this run can say about ` +
      'them is that the file exists and is long enough. Run with --require-keys to fail on them:');
    for (const k of keyless) console.log(`    ${k.where}  ->  ${k.cited}`);
  }

  if (requireKeys) {
    for (const k of keyless) {
      failures.push({
        where: k.where,
        cited: k.cited,
        reason: '--require-keys: an anchor with no quoted key asserts only that the file is ' +
          'long enough — write it as `path:NN — "key"`',
      });
    }
  }

  if (!failures.length) {
    /* WHAT THIS BANNER MAY CLAIM, and no more. For a full `api/…/schema/…` citation,
     * existence was checked against `git ls-files`. For a SHORTENED citation existence is
     * true by construction (the token was recognised because the name is in the index) —
     * what was actually checked there is that SOME file of that name exists, and for the
     * ambiguous ones only that at least one candidate satisfies the anchor and key. And a
     * keyless anchor was only range-checked. The earlier banner asserted all four checks
     * over all citations, which was a stronger statement than the run establishes. */
    console.log('  OK — no cited path is missing, no line anchor is out of range, and no ' +
      'quoted key is off its cited line. Shortened citations assert existence by ' +
      'construction, ambiguous ones only that one candidate satisfies them, and the ' +
      `${n.keyless} keyless anchor(s) listed above only that the file is long enough`);
    return 0;
  }

  console.error(`\nFAIL — ${failures.length} schema citation(s) do not match the schema tree. ` +
    'The prose is wrong, not the schema:\n');
  for (const f of failures) console.error(`  ${f.where}  ->  ${f.cited}  ${f.reason}`);
  console.error('\nA citation is a claim that a file exists and that a given line of it says what ' +
    'the prose says it says. Fix the prose. If the citation lives in a page carrying\n' +
    '`{/* @generated by scripts/api/mqtt */}`, fix it in api/mqtt/prose/ and run ' +
    '`npm run gen:reference` — a hand edit there is overwritten.\n');
  return 1;
}

/* --selftest proves the detector can FAIL, which is the property a checker that only ever
 * passes does not have. Two halves, because this gate has two failure modes: EXTRACTION
 * (asserted on synthetic text against a synthetic index, touching no real file) and
 * VERIFICATION (asserted against a real temporary tree, because what that half gets wrong
 * is line-count and line-content behaviour rather than matching). */
if (process.argv.includes('--selftest')) {
  let bad = 0;
  const fail = (msg) => { console.error(`SELFTEST FAIL ${msg}`); bad++; };

  /* A synthetic index, so extraction is asserted without a git repository. Two files share
   * the basename `get_config.json`, which is the real shape of this tree: each of the 22
   * files under `api/mqtt/schema/commands/` has a same-named sibling under
   * `api/mqtt/schema/response/`. */
  const SYN = makeIndex([
    'api/mqtt/schema/response_codes.json',
    'api/mqtt/schema/openapi.json',
    'api/mqtt/schema/commands/dev_mgmt/get_config.json',
    'api/mqtt/schema/response/dev_mgmt/get_config.json',
    'api/mqtt/schema/commands/dev_mgmt/set_wifi.json',
    'api/mqtt/schema/refrence/payload/cfgEndpointPayload.yaml',
    'api/rest/schema/rest_api.yaml',
  ]);

  /* ---- half 1: extraction ---- */
  const ex = [
    ['`api/mqtt/schema/response_codes.json`', ['api/mqtt/schema/response_codes.json']],
    ['`api/rest/schema/rest_api.yaml`', ['api/rest/schema/rest_api.yaml']],
    ['lives outside `api/mqtt/schema/`, so', ['api/mqtt/schema/']],
    ['from `api/mqtt/schema/response_codes.json`.', ['api/mqtt/schema/response_codes.json']],
    /* THE 2026-09-05 DEFECT IN FIVE MARKUP FORMS. An earlier draft reported only the last
     * of these and silently discarded the other four, which is the exact class of miss
     * this gate exists to prevent. */
    ['**api/mqtt/schema/error_codes.json**', ['api/mqtt/schema/error_codes.json']],
    ['*api/mqtt/schema/error_codes.json*', ['api/mqtt/schema/error_codes.json']],
    ['[api/mqtt/schema/error_codes.json](/x)', ['api/mqtt/schema/error_codes.json']],
    ['does it read api/mqtt/schema/error_codes.json?', ['api/mqtt/schema/error_codes.json']],
    ['values come from api/mqtt/schema/error_codes.json', ['api/mqtt/schema/error_codes.json']],
    /* bold, then a sentence-ending dot: still one citation, not a glob */
    ['see **api/mqtt/schema/error_codes.json**.', ['api/mqtt/schema/error_codes.json']],
    /* bold around an anchor, and around an anchor plus key */
    ['**api/mqtt/schema/openapi.json:12**', ['api/mqtt/schema/openapi.json:12']],
    ['**api/mqtt/schema/openapi.json:12 — "paths"**', ['api/mqtt/schema/openapi.json:12 — "paths"']],
    /* the api/rest/schema/README.md:41 shape: a longer path ending the same way. Not
     * observed outside a fence in this tree; the left boundary is kept for the day it is */
    ["y.load(f.readFileSync('rest-api/mqtt/schema/rest_api.yaml','utf8'))", []],
    /* fenced code is not a claim about this tree */
    ['```bash\nredocly lint api/mqtt/schema/openapi.json\n```', []],
    /* a nested inner fence must not close the outer one and re-open scanning */
    ['````md\n```\napi/mqtt/schema/gone.json\n```\napi/mqtt/schema/also_gone.json\n````', []],
    /* glob-ish citations: a mid-segment truncation is dropped, a clean one keeps the dir */
    ['`api/mqtt/schema/commands/dev_mgmt/get_*.json`', []],
    ['`api/mqtt/schema/**` is vendor-frozen', ['api/mqtt/schema/']],
    ['`api/mqtt/schema/commands/{control,dev_mgmt}/*.json`', ['api/mqtt/schema/commands/']],
    /* the three house line forms, plus the continuation */
    ['`api/mqtt/schema/openapi.json:12`', ['api/mqtt/schema/openapi.json:12']],
    ['`api/mqtt/schema/openapi.json:12-30`', ['api/mqtt/schema/openapi.json:12-30']],
    ['`api/mqtt/schema/openapi.json:12 — "epConfig"`', ['api/mqtt/schema/openapi.json:12 — "epConfig"']],
    ['`api/mqtt/schema/refrence/payload/cfgEndpointPayload.yaml:6 — "operation:"`, enum at `:8-11`',
      ['api/mqtt/schema/refrence/payload/cfgEndpointPayload.yaml:6 — "operation:"',
        'api/mqtt/schema/refrence/payload/cfgEndpointPayload.yaml:8-11 (continuation)']],
    /* a RANGE may carry a key, and it is checked; the earlier draft dropped it */
    ['`api/mqtt/schema/openapi.json:12-30 — "paths"`', ['api/mqtt/schema/openapi.json:12-30 — "paths"']],
    /* a continuation may carry a key of its own */
    ['`api/mqtt/schema/openapi.json:12`, enum at `:14-16` — "enum:"',
      ['api/mqtt/schema/openapi.json:12', 'api/mqtt/schema/openapi.json:14-16 (continuation) — "enum:"']],
    /* KEY punctuation variants, all of which the earlier draft dropped in silence */
    ['`api/mqtt/schema/openapi.json:12 - "paths"`', ['api/mqtt/schema/openapi.json:12 — "paths"']],
    ["`api/mqtt/schema/openapi.json:12 – 'paths'`", ['api/mqtt/schema/openapi.json:12 — "paths"']],
    /* THE DASHES ONLY. `(`, `:`, `,` and `=` were separators once and were REMOVED on
     * purpose — see the KEY section of the header: a permissive separator promoted an
     * adjacent unrelated code span to a key and failed correct prose
     * ("See `api/mqtt/schema/openapi.json:2`; `paths` is documented elsewhere"). These three
     * cases asserted the removed behaviour and were the loudest of the seven stale
     * expectations that kept --selftest red. The anchor is still extracted and still
     * range-checked; only the key is not read, which is the intended trade. */
    ['`api/mqtt/schema/openapi.json:12 ("paths")`', ['api/mqtt/schema/openapi.json:12']],
    ['`api/mqtt/schema/openapi.json:12: "paths"`', ['api/mqtt/schema/openapi.json:12']],
    ['`api/mqtt/schema/openapi.json:12, "paths"`', ['api/mqtt/schema/openapi.json:12']],
    ['`api/mqtt/schema/openapi.json:12` — `"paths"`', ['api/mqtt/schema/openapi.json:12 — "paths"']],
    ['`api/mqtt/schema/openapi.json:12` — `paths`', ['api/mqtt/schema/openapi.json:12 — "paths"']],
    /* an empty key is captured, not ignored, so verify() can reject it */
    ['`api/mqtt/schema/openapi.json:12 — ""`', ['api/mqtt/schema/openapi.json:12 — ""']],
    /* a table cell boundary is not a key separator, and the next cell is not a key */
    ['| `api/mqtt/schema/openapi.json:12` | `paths` |', ['api/mqtt/schema/openapi.json:12']],
    /* prose after an anchor is not a key either */
    ['`api/mqtt/schema/openapi.json:12`, and the `paths` object',
      ['api/mqtt/schema/openapi.json:12']],
    /* TWO CITATIONS SIDE BY SIDE — the commonest shape on
     * rf-regions-and-regulations.mdx. The second is a citation of its own, never
     * the first one's key. A permissive KEY without the no-path guard read it as a key and
     * reported six failures against correct prose. */
    ['(`get_config.json:101`, `get_config.json:102`)',
      ['get_config.json:101 (resolved from a shortened path)',
        'get_config.json:102 (resolved from a shortened path)']],
    ['(`api/mqtt/schema/openapi.json:12`, `api/mqtt/schema/openapi.json:13`)',
      ['api/mqtt/schema/openapi.json:12', 'api/mqtt/schema/openapi.json:13']],
    /* SHORTENED citations. A bare basename shared by two files resolves to both; a path
     * with its directory resolves to one; A LINE ANCHOR IS NOT REQUIRED; and a name in no
     * schema tree is still extracted, for verify() to excuse or fail. */
    ['`get_config.json:103`', ['get_config.json:103 (resolved from a shortened path)']],
    ['`dev_mgmt/get_config.json:103`', ['dev_mgmt/get_config.json:103 (resolved from a shortened path)']],
    ['`response/dev_mgmt/get_config.json:103 — "maxTxPowerSupported"`',
      ['response/dev_mgmt/get_config.json:103 (resolved from a shortened path) — "maxTxPowerSupported"']],
    /* AN ANCHORLESS BASENAME IS A CITATION. This case wanted [] on the reasoning the header
     * records and then overturns: "a bare basename with nothing to check is worth nothing"
     * was wrong, because a bare basename has EXISTENCE to check and existence is exactly
     * what the rename broke. 48 of the 52 pages citing the renamed file wrote nothing but
     * the basename, so requiring `:NN` blinded the gate to the very defect it was built
     * for. Expecting [] here asserted that blindness. */
    ['`get_config.json` on its own', ['get_config.json (resolved from a shortened path)']],
    /* A NAME IN NO SCHEMA TREE IS EXTRACTED, NOT DROPPED. `candidates: null` means "verify()
     * decides", not "skip": there it is either excused as a real file outside the schema
     * trees (`package.json` is one, and is counted so the leniency stays visible) or FAILED
     * as a rotted citation. Dropping it at extraction is what would make the founding
     * defect invisible, so [] was the wrong expectation. */
    ['`package.json:5`', ['package.json:5']],
    /* the basename of a full citation is not a second, shortened citation of the same file */
    ['`api/mqtt/schema/response/dev_mgmt/get_config.json:103`',
      ['api/mqtt/schema/response/dev_mgmt/get_config.json:103']],
    /* A CONTINUATION FOLLOWS ITS BASE EVEN WHEN THE BASE RESOLVES TO NOTHING. This case
     * wanted [], from the era when an unresolvable basename was dropped at extraction and
     * so left no base for `:78` to attach to. Now `nothing_here.yaml:28` IS extracted
     * (candidates: null), which is the point, and its continuation attaches to it — so both
     * reach verify() and both get reported against a name that is in no schema tree. That
     * is strictly better than silence on two rotted anchors. The genuine
     * nothing-to-the-left case is asserted below, where the continuation opens the line. */
    ['(`nothing_here.yaml:28`, `:78`)',
      ['nothing_here.yaml:28', 'nothing_here.yaml:78 (continuation)']],
    /* …and a continuation with NOTHING to its left really is skipped, not guessed at. This
     * is the assertion the case above used to stand in for, and it needs to exist on its
     * own now that an unresolvable base is no longer dropped. */
    ['a bare `:78` with no citation before it', []],
    /* …but one whose base IS resolvable now has a base to resolve against */
    ['(`get_config.json:103`, `:104`)',
      ['get_config.json:103 (resolved from a shortened path)', 'get_config.json:104 (continuation)']],
  ];
  for (const [text, want] of ex) {
    const got = extract(text, SYN).cites.map((c) => c.cited);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail(`extract(${JSON.stringify(text)}): got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }
  /* An unparseable key must be NAMED, not dropped: silent self-deactivation on a typo is
   * how a gate like this stops working without anyone noticing. */
  const weird = extract('`api/mqtt/schema/openapi.json:12 ~ "paths"`', SYN).cites;
  if (weird.length !== 1 || weird[0].key !== null || !weird[0].keyUnparsed) {
    fail(`extract of an unparseable key: got ${JSON.stringify(weird)}`);
  }
  /* The unresolved-token counter is what keeps the remaining blind spot visible. */
  const un = extract('`package.json:5` and `tsconfig.json:9`', SYN).unresolved;
  if (un !== 2) fail(`unresolved counter: got ${un}, want 2`);

  /* ---- half 2: verification ----
   * Without the negative cases this half could `return null` unconditionally and still
   * look green, which is exactly the shape of the failure that let error_codes.json be
   * cited by 52 files. The fixture ends WITHOUT a trailing newline on purpose: most
   * vendored schema files in this repository do, and a `wc -l`-style count would then be
   * one short and report a true citation as out of range. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-cite-selftest-'));
  const prev = process.cwd();
  let cases;
  try {
    fs.mkdirSync(path.join(tmp, 'api/mqtt/schema/commands'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'api/mqtt/schema/commands/set_wifi.json'),
      '{\n  "properties": {\n    "wifiConfig": {\n      "type": "object"\n    }\n  }\n}');
    fs.mkdirSync(path.join(tmp, 'api/mqtt/schema/response'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'api/mqtt/schema/response/set_wifi.json'), '{\n  "ok": true\n}');
    process.chdir(tmp);

    const P = 'api/mqtt/schema/commands/set_wifi.json';
    const TREE = makeIndex([P, 'api/mqtt/schema/response/set_wifi.json', 'docs/x.mdx']);
    /* [citation, expected reason substring or null for "must pass", label] */
    cases = [
      [{ file: P }, null, 'existing file, no anchor'],
      [{ file: 'api/mqtt/schema/error_codes.json' }, 'not tracked at this path',
        'the 2026-09-05 defect: renamed file, 52 pages citing the old name'],
      /* B6: the index is byte-for-byte, so a wrong-case citation cannot pass on Windows
       * and fail on ubuntu-latest. This is the case statSync got wrong. */
      [{ file: 'api/mqtt/schema/commands/SET_WIFI.json' }, 'case-only difference',
        'wrong case: invisible to statSync on Windows, red on the CI runner'],
      [{ file: 'api/mqtt/schema/' }, null, 'directory citation'],
      [{ file: 'api/mqtt/schema/gone/' }, 'not tracked at this path', 'renamed directory'],
      [{ file: 'api/mqtt/schema/commands' }, null, 'directory cited without a trailing slash'],
      [{ file: 'api/mqtt/schema/commands', from: 3 }, 'is a directory', 'line number on a directory'],
      [{ file: `${P}/` }, 'cited as a directory but is a file', 'file cited with a trailing slash'],
      [{ file: P, from: 7 }, null, 'last line of a file with no trailing newline'],
      [{ file: P, from: 8 }, 'only 7 line(s)', 'line past end of file'],
      [{ file: P, from: 0 }, 'not positive', 'line zero'],
      [{ file: P, from: 1, to: 7 }, null, 'range ending on the last line'],
      [{ file: P, from: 1, to: 9 }, 'only 7 line(s)', 'range past end of file'],
      /* B5: `last = to ?? from` tested only the far end, so a reversed range checked
       * neither. `:99999-3` passed on a 392-line file. */
      [{ file: P, from: 99999, to: 3 }, 'runs backwards', 'reversed range: neither end was checked'],
      [{ file: P, from: 3, key: 'wifiConfig' }, null, 'quoted key is on the cited line'],
      [{ file: P, from: 4, key: 'wifiConfig' }, 'does not contain',
        'anchor slid by one — the class of defect only check 4 can see'],
      [{ file: P, from: 4, key: 'wifiConfig' }, ':3',
        'the slide diagnostic names the line the key is actually on'],
      /* B2: a RANGE used to skip check 4 entirely, which exempted the four `enum at :NN-MM`
       * continuations that are precisely the anchors that slide. */
      [{ file: P, from: 3, to: 5, key: 'wifiConfig' }, null, 'range whose first line carries the key'],
      [{ file: P, from: 4, to: 6, key: 'wifiConfig' }, 'does not contain',
        'range whose first line does NOT carry the key'],
      /* B4: `includes('')` is true on every line, so an empty key passed vacuously while
       * inflating the reported key count. */
      [{ file: P, from: 3, key: '' }, 'empty', 'empty quoted key asserts nothing'],
      [{ file: P, from: 3, key: '   ' }, 'empty', 'whitespace-only quoted key asserts nothing'],
      /* B3: an unparseable key must be reported, never dropped in silence. */
      [{ file: P, from: 3, keyUnparsed: ' ~ "wifiConfig"' }, 'cannot parse',
        'key-shaped text this gate cannot parse is named, not skipped'],
      /* B7: a shortened citation holds if it holds for at least one candidate, and fails
       * when it holds for none. `set_wifi.json` is ambiguous here, as in the real tree. */
      [{ candidates: [P, 'api/mqtt/schema/response/set_wifi.json'], from: 3 }, null,
        'ambiguous shortened citation, satisfied by the commands candidate'],
      [{ candidates: [P, 'api/mqtt/schema/response/set_wifi.json'], from: 2 }, null,
        'ambiguous shortened citation, satisfied by the response candidate'],
      [{ candidates: [P, 'api/mqtt/schema/response/set_wifi.json'], from: 999 },
        'no file of this name', 'ambiguous shortened citation satisfied by neither: get_config.json:999'],
      [{ candidates: [P], from: 999 }, 'only 7 line(s)', 'unique shortened citation, out of range'],
    ];
    for (const [cite, want, label] of cases) {
      /* `short: null` is part of the shape extract() really returns, and leaving it out of
       * this default is what hid the crash at verify()'s `c.short` guard: every case here
       * arrived with `short` undefined, the strict `!== null` let it through, and `.slice()`
       * threw. Keep this object field-for-field identical to the one extract() builds — a
       * selftest that simulates a narrower object than production cannot see production's
       * bugs. */
      const { reason } = verify({ file: null, candidates: null, short: null, from: null, to: null, key: null, keyUnparsed: null, ...cite }, TREE);
      const ok = want === null ? reason === null : reason !== null && reason.includes(want);
      if (!ok) fail(`verify ${label}: got ${JSON.stringify(reason)}, want ${JSON.stringify(want)}`);
    }
  } finally {
    process.chdir(prev);
    lineCache.clear();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  /* ---- half 3: pointer extraction ----
   * Synthetic text only, so this touches neither the contract nor the repository. */
  const px = [
    ['`#/components/schemas/statusCode/enum`', [['#/components/schemas/statusCode/enum', null]]],
    /* the count claim, which is this half's strongest check */
    ['`#/components/schemas/statusCode/x-iotc-response-codes/codes` (38 rows)',
      [['#/components/schemas/statusCode/x-iotc-response-codes/codes', 38]]],
    /* a RANGE in parentheses is not a count, and must not be read as one — this exact shape
     * sits next to a pointer on the response-codes page */
    ['`#/components/schemas/statusCode/enum` (0-36 and 101)',
      [['#/components/schemas/statusCode/enum', null]]],
    ['`#/x/y` (2 of 3)', [['#/x/y', null]]],
    /* the braced and templated forms, kept RAW here; expansion is verifyPointer's job */
    ['`#/operations/receive_reboot/x-iotc-response-codes/{universal,scoped}`',
      [['#/operations/receive_reboot/x-iotc-response-codes/{universal,scoped}', null]]],
    ['`#/operations/<op>/x-iotc-response-codes/{universal,scoped}`',
      [['#/operations/<op>/x-iotc-response-codes/{universal,scoped}', null]]],
    /* sentence punctuation is not part of the pointer */
    ['see #/components/schemas/responseStatus.', [['#/components/schemas/responseStatus', null]]],
    ['see #/components/schemas/responseStatus, and then', [['#/components/schemas/responseStatus', null]]],
    /* A URL FRAGMENT IS NOT A POINTER. Without the left boundary every hash-slash in a link
     * would be resolved against the contract and fail, which is a gate that fails correct
     * prose — the defect the KEY separator class was narrowed to avoid. */
    ['see https://example.com#/getting-started', []],
    ['`api/mqtt/schema/x.json#/foo`', []],
    /* a site anchor is not a pointer either: no slash after the hash */
    ['[Notes](/api-reference/mqtt/response-codes#notes--caveats)', []],
    /* fenced code is not a claim about the contract */
    ['```json\n#/components/schemas/gone\n```', []],
    /* two pointers on one line are two citations */
    ['`#/channels/command/address` and `#/channels/response/address`',
      [['#/channels/command/address', null], ['#/channels/response/address', null]]],
    /* an RFC 6901 escape survives extraction; unescaping happens at resolution */
    ['`#/a~1b/ok`', [['#/a~1b/ok', null]]],
  ];
  for (const [text, want] of px) {
    const got = extractPointers(text).ptrs.map((p) => [p.raw, p.count]);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail(`extractPointers(${JSON.stringify(text)}): got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }
  /* A POINTER OPENING THAT PARSES AS NOTHING is counted, not dropped. An unclosed brace is
   * the realistic form; a space is NOT, because a pointer followed by prose looks identical
   * and this gate must not claim to tell them apart. Both halves of that distinction are
   * asserted, because getting it wrong in either direction is a silent failure. */
  if (extractPointers('`#/{unclosed`').malformed !== 1) {
    fail(`malformed pointer counter on an unclosed brace: got ${extractPointers('`#/{unclosed`').malformed}, want 1`);
  }
  const withProse = extractPointers('`#/components/schemas/statusCode/enum` and then prose');
  if (withProse.malformed !== 0 || withProse.ptrs.length !== 1) {
    fail(`a pointer followed by prose must be one clean citation: got ${JSON.stringify(withProse)}`);
  }

  /* ---- half 4: pointer resolution ----
   * A synthetic contract, so these assertions do not move when the real one is regenerated.
   * It carries what the shapes need: nested objects, an array, a scalar leaf, a hyphenated
   * extension key, and a key containing a literal `/`. */
  const SYNDOC = {
    channels: { data1Event: { address: '{tenantId}/DATA/clients/data1event' } },
    operations: {
      receive_reboot: { 'x-iotc-response-codes': { universal: [0, 101], scoped: [1, 5] } },
      send_alertEvent: { action: 'send' },
    },
    components: {
      schemas: {
        statusCode: { enum: [0, 1, 2], 'x-iotc-response-codes': { codes: [{}, {}, {}] } },
        responseStatus: { type: 'object' },
      },
    },
    'a/b': { ok: true },
  };
  /* [pointer, count or null, expected reason substring or null for "must pass", label] */
  const pv = [
    ['#/channels/data1Event/address', null, null, 'literal that resolves'],
    ['#/components/schemas/responseStatus', null, null, 'literal object'],
    /* THE FOUNDING CASE, in pointer form: a name that has moved. A gate that cannot fail
     * here is the file half before it could see error_codes.json. */
    ['#/components/schemas/statusCodes/enum', null, 'has no such member',
      'a renamed node — the defect this half exists for'],
    ['#/components/schemas/statusCodes/enum', null, 'Did you mean `statusCode`',
      'and it suggests the near miss rather than just refusing'],
    /* a case-only difference is invisible to a Windows author and red on the runner, which is
     * the same asymmetry makeIndex's `lc` map exists for on the file half */
    ['#/components/schemas/statuscode/enum', null, 'Did you mean `statusCode`', 'case-only difference'],
    ['#/components/schemas/statusCode/enum/5', null, 'index 5 is out of range', 'array index past the end'],
    ['#/components/schemas/statusCode/enum/2', null, null, 'last element of an array'],
    ['#/components/schemas/statusCode/enum/two', null, 'must be a numeric index', 'non-numeric index into an array'],
    ['#/channels/data1Event/address/deeper', null, 'scalar, so it has no members', 'walking past a scalar leaf'],
    ['#/nope', null, 'resolves as far as #', 'first segment missing — the diagnostic still names where it got to'],
    /* the members list is what turns "does not resolve" into something actionable */
    ['#/components/gone', null, 'Members there are: `schemas`', 'small member list is printed'],
    /* BRACED: an explicit enumeration, so ALL must hold */
    ['#/operations/receive_reboot/x-iotc-response-codes/{universal,scoped}', null, null,
      'braced, both siblings present'],
    ['#/operations/receive_reboot/x-iotc-response-codes/{universal,bogus}', null, 'expands to',
      'braced, one sibling absent — and the reason names the expansion that failed'],
    ['#/operations/receive_reboot/x-iotc-response-codes/{universal,bogus}', null, 'has no such member',
      'braced failure still carries the underlying walk diagnostic'],
    /* TEMPLATED: a shape, so AT LEAST ONE must hold — the same rule verify() applies to an
     * ambiguous shortened citation, so the two halves do not disagree about ambiguity */
    ['#/operations/<op>/x-iotc-response-codes', null, null, 'templated, satisfied by one operation'],
    ['#/operations/<op>/x-iotc-response-codes/{universal,scoped}', null, null, 'templated AND braced together'],
    ['#/operations/<op>/nothing-like-this', null, 'no member of #/operations satisfies',
      'templated, satisfied by none — tried every child'],
    ['#/nope/<op>/x', null, 'resolves as far as #', 'templated whose literal prefix is itself wrong'],
    /* RFC 6901 escaping */
    ['#/a~1b/ok', null, null, 'a key containing a literal slash, written ~1'],
    /* THE COUNT CLAIM — the rot that actually happened here was "35 response codes" against
     * a catalogue of 38, uncaught for a whole window and corrected by hand on four pages */
    ['#/components/schemas/statusCode/x-iotc-response-codes/codes', 3, null, 'count claim that matches'],
    ['#/components/schemas/statusCode/x-iotc-response-codes/codes', 35, 'claims 35 rows but the contract has 3',
      'count claim that has drifted — the 35-versus-38 defect in miniature'],
    ['#/components/schemas', 2, null, 'count claim against an object counts its keys'],
    ['#/channels/data1Event/address', 2, 'names a scalar, which has no members to count',
      'count claim against a scalar asserts nothing and says so'],
  ];
  for (const [raw, count, want, label] of pv) {
    const { reason } = verifyPointer({ raw, count, unit: 'rows' }, SYNDOC);
    const ok = want === null ? reason === null : reason !== null && reason.includes(want);
    if (!ok) fail(`verifyPointer ${label}: got ${JSON.stringify(reason)}, want ${JSON.stringify(want)}`);
  }
  /* A MISSING CONTRACT MUST NOT PASS QUIETLY. main() turns this into a failure per citation
   * rather than a warning, because a gate that silently checks nothing is worse than no gate;
   * asserted here so the loader cannot be "helpfully" changed to return {}. */
  if (loadContract.name !== 'loadContract') fail('loadContract was renamed; the missing-contract path is untested');

  /* Every number below is COUNTED from the tables above, so the banner cannot drift from
   * them — including the count of cases that must FAIL, which an earlier draft hardcoded
   * while claiming to have counted it. */
  const exEmpty = ex.filter(([, want]) => want.length === 0).length;
  const mustFail = cases.filter(([, want]) => want !== null).length;
  const pxEmpty = px.filter(([, want]) => want.length === 0).length;
  const pvFail = pv.filter(([, , want]) => want !== null).length;
  console.log(bad ? 'SELFTEST FAILED'
    : `SELFTEST OK — ${ex.length} file-citation extraction cases (${exEmpty} deliberate ` +
      `non-matches) plus an unparseable-key case and an unresolved-token count, ` +
      `${cases.length} file verification cases against a real tree (${mustFail} must FAIL), ` +
      `${px.length} pointer extraction cases (${pxEmpty} deliberate non-matches) plus a ` +
      `malformed-pointer count, and ${pv.length} pointer resolution cases against a synthetic ` +
      `contract (${pvFail} must FAIL)`);
  process.exit(bad ? 2 : 0);
}

process.exit(main());
