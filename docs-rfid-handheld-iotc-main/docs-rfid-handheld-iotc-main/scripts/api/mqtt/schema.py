"""
schema.py — schema loading, $ref resolution, error-code binding, and the
resolved-schema -> SchemaRow[] derivation for the API-reference generator.

Lifts the proven core of (UNTRACKED: held outside this repository)
_meta/knowledge-base/.../scripts/generate_openapi_tags_md.py
(resolve_refs, extract_schema, extract_examples, strip_inline_response_code_tables)
and points it at the vendored api/mqtt/schema/ tree, then adds:
  * contract_response_codes — each operation's own
    x-iotc-response-codes.{universal,scoped}, read from the contract. It replaced
    load_response_codes (deleted 2026-09-08), which merged the global ('*') codes
    with op-specific ones out of response_codes.json. That merge fixed two upstream
    bugs — dropped 101, and ops with zero op-specific codes getting none — and the
    contract now states the same thing directly, per operation, so the rule no
    longer has to be reimplemented here.
  * schema_to_rows    — the net-new resolved-schema -> SchemaRow[] adapter the
    MDX components need ({field,type,required,enumUnits,example,desc,children}),
    incl. anyOf/oneOf/allOf composition handling.
  * resolve_refs      — extended past the upstream's relative-file-only handling
    with an RFC 6901 JSON-Pointer branch ('#/components/schemas/X' and the
    compound 'a.yaml#/components/schemas/X'), resolved against an optional `root`
    document that extract_schema also accepts. A $ref is a URI-reference, so both
    components are percent-decoded: fragment tokens per RFC 6901 §6, and the path
    per RFC 3986. Unreachable on today's tree (0 of 191 $refs carry '#' or '%');
    see the function docstrings for why it is here anyway.
  * OPTIONAL_INPUTS   — the one input whose absence is a warning rather than a
    traceback. Everything else in this module stays fail-loud.

The API reference is a pure function of this schema tree (the FINAL source of
truth); nothing here is hand-patched.
"""

from __future__ import annotations
import json
import os
import re
import sys
from collections import OrderedDict
from urllib.parse import unquote

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "PyYAML is required (pip install -r scripts/api/mqtt/requirements.txt): " + str(exc)
    )

# --- paths (relative to the vendored, upstream-synced schema tree) ---------
ROOT = os.environ.get("API_SCHEMA_DIR", os.path.join("api", "mqtt", "schema"))

# DELETED 2026-09-08 — COMMANDS_DIR, RESPONSE_DIR, EVENTS_DIR, RESPONSE_CODES,
# RESPONSE_YAML and EXAMPLE_DESC, the six per-file paths into the pre-AsyncAPI tree.
#
# Every one had zero live references by the time it went. Measured repo-wide across
# *.py, *.mjs, *.ts and *.json, excluding each constant's own definition and the
# comments about it: COMMANDS_DIR, RESPONSE_DIR, EVENTS_DIR and RESPONSE_YAML had none
# at all; RESPONSE_CODES had exactly one, from load_response_codes(), which itself had
# no callers; EXAMPLE_DESC lost its last reader when extract_examples started taking
# labels from the contract's own examples[].name. No dynamic access either — there is
# no getattr() or __dict__ lookup into this module anywhere in the repository.
#
# DELETED RATHER THAN LEFT, on the same reasoning recorded for load_response_code_table
# further down this file: a name with no caller is worse than no name, because the next
# reader cannot tell whether it is a live second source or dead weight. These six were
# specifically the addresses of the tree the contract replaced, so keeping them would
# preserve a route back to the world the migration removed — and they would have gone on
# pointing at files that no longer exist the moment that tree is deleted.
#
# ROOT SURVIVES, and is not legacy. It is what ASYNCAPI is built from, what --check
# prints as "schema root:", and what _write_text refuses to write inside — the guard
# that makes the contract structurally unwritable from this generator.

# The AsyncAPI 3.0.0 contract — the STATEMENT OF TRUTH. It is now the ONLY input
# under ROOT: every other path constant that lived here has gone, and where this
# document and a legacy file disagree, this document wins. It is also the first
# input here that was never a per-operation file — one document carries all
# 6 channels, 26 operations, 44 messages and 44 schemas.
ASYNCAPI = os.path.join(ROOT, "iotc-rfd40-90-mqtt.asyncapi.json")

# exceptionEVT is absent from EVENT_PAGE_IDS because firmware does not emit it.

# marker for the giant inline "Response codes:" table baked into response.yaml's code.description
RESPONSE_CODE_MARKER = "Response codes:"


# --------------------------------------------------------------------------- #
# file loading
# --------------------------------------------------------------------------- #
# Inputs the pipeline can do without. A file listed here loads as an EMPTY mapping
# when it does not exist, after one warning on stderr. THE LIST IS EMPTY TODAY — see
# OPTIONAL_INPUTS below for why that is a statement rather than an oversight.
#
# Membership is by FILE IDENTITY, not by spelling: _is_optional_input compares
# normcase(realpath(...)) on both sides, so a relative path and its abspath are one
# input and both get the guard. That mattered because two spellings of one input did
# coexist here — cmd_check abspaths S.ROOT to print it, while the loader was handed a
# relative path — and a guard keyed on the path STRING would protect one spelling and
# hand the other a FileNotFoundError. Two things this deliberately does NOT do: a file
# that is not listed still raises FileNotFoundError, and a LISTED file that exists but
# does not parse still raises. Missing != malformed — a corrupt file is a real defect,
# and swallowing it would be the actual bug.
#
# SUPERSEDED 2026-09-08, AND NOW REDUNDANT RATHER THAN MERELY OPTIONAL. This file only
# ever supplied the LABELS for a schema's examples[], and the contract carries better ones
# inline: `#/components/messages/<X>/examples[]` gives 195 entries of which 195 carry a
# `name`, none blank and none duplicated, each attached to the payload beside it.
# extract_examples now reads that shape, and payload_ptr resolves a MESSAGE pointer so it
# reaches it — 177 labelled examples across the 24 operations, with no overlay. Proven
# inert twice over: regenerating with this file present and with it absent both produce
# byte-identical pages. It can go with the rest of the legacy tree; it does not need
# relocating.
#   THE LESSON IS KEPT AND THE WALKTHROUGH IS NOT. The original entry traced, call site
# by call site, why that overlay could not move a single emitted byte. Every landmark it
# named — RESPONSE_YAML, EXAMPLE_DESC, the file-based payload() call in the singleton —
# has since been deleted, so the walkthrough now cites nothing that exists. What survives
# it is worth more than the trace was:
#
#   A FILE CAN LOOK INERT FOR REASONS THAT ARE INCIDENTAL, NOT STRUCTURAL. That overlay
# appeared unreachable because all 24 pages were CARRY and the one caller that got as far
# as the label code passed a hard-coded empty mapping. Both were configuration, not
# design. Its data was NOT inert: the same function, given a real operation, returned
# ['example1', 'example2'] without the file and ['Start inventory', 'Stop inventory']
# with it. So "no page moves without it" was true and "it cannot reach output" was false,
# and only the first was measured. Establish inertness by measurement — run it both ways
# and diff — never by reading the call graph and concluding.
#
#   AND THE LIST EXISTS BECAUSE ITS ABSENCE WAS EXPENSIVE. Before it, a missing copy of
# that overlay aborted `--check` inside this very function with a bare traceback, BEFORE
# the "schema root:" line printed — so CI's first evidence of trouble was a stack trace
# about a data file no emitted page consulted.
#
# AND THE PREDICTION IN THAT PARAGRAPH WAS WRONG, WHICH IS WHY THE LIST IS NOW EMPTY.
# It said the migration "deliberately does NOT repoint EXAMPLE_DESC — messages[].examples
# is an array, structurally unlike this file's title -> {label: text} map." The array
# turned out to be the BETTER source, not merely a different one: every one of the
# contract's 195 message examples carries a `name` beside its `payload`, so the label is
# attached to the body it describes instead of being matched to it by position. The
# overlay could only ever be positional, and a positional label list is one inserted
# example away from sliding onto the wrong payload. extract_examples reads the named
# shape as of 2026-09-08, nothing loads this file any more, and it is deleted with the
# rest of the legacy tree.
#
# THE REGISTRY IS KEPT AND DELIBERATELY EMPTY. An empty frozenset here is a statement,
# not an oversight: there is no optional input today. The machinery below stays because
# what it exists to prevent is still real — before it, a missing copy of that data file
# aborted `--check` with a bare traceback BEFORE the "schema root:" line printed, so the
# first evidence of trouble was a stack trace about a file no emitted page consulted.
# The next input that may legitimately be absent should be added here rather than
# re-deriving that lesson.
OPTIONAL_INPUTS = frozenset()

_WARNED_MISSING = set()   # one line per FILE per process, not one per call/spelling


def _file_key(path):
    """Identity of the FILE a path names, so two spellings of one input compare equal.
    realpath collapses the relative/absolute split, '..' and symlinks; normcase folds
    case and separator on Windows. Both sides are resolved at CALL time, so a changed
    CWD moves the OPTIONAL_INPUTS entry and the caller's path together instead of
    freezing one of them at import."""
    return os.path.normcase(os.path.realpath(path))


def _is_optional_input(path):
    key = _file_key(path)
    return any(key == _file_key(entry) for entry in OPTIONAL_INPUTS)


def load_structured_file(path):
    if not os.path.exists(path) and _is_optional_input(path):
        key = _file_key(path)
        if key not in _WARNED_MISSING:
            _WARNED_MISSING.add(key)
            # Deliberately ASCII, unlike the em-dashed messages elsewhere in this
            # pipeline: this is the ONLY evidence a reader gets, and stderr on a
            # Windows console/pipe renders an em dash as a replacement character.
            # Deliberately generic now that OPTIONAL_INPUTS is empty. The previous text
            # described example_description.json specifically and outlived it by one
            # change: it still promised that labels would fall back to example1,
            # example2, ... which stopped being true the moment extract_examples started
            # reading the contract's own examples[].name. A message that explains a
            # consequence that no longer follows is worse than a short one.
            print(f"WARNING: optional input {path} is missing; continuing without it. "
                  "It is registered in schema.py's OPTIONAL_INPUTS, which means its "
                  "absence is expected to be survivable -- see the note beside that list "
                  "for what the caller does instead.",
                  file=sys.stderr)
        return OrderedDict()
    with open(path, encoding="utf-8") as fh:
        if path.endswith((".yaml", ".yml")):
            return yaml.safe_load(fh)
        return json.load(fh, object_pairs_hook=OrderedDict)


# --------------------------------------------------------------------------- #
# ref resolution + schema extraction  (lifted from the technical-writer core)
# --------------------------------------------------------------------------- #
def replace_const_with_enum(obj):
    if isinstance(obj, dict):
        obj = OrderedDict(obj)
        if "const" in obj:
            obj["enum"] = [obj.pop("const")]
        for k, v in obj.items():
            obj[k] = replace_const_with_enum(v)
        return obj
    if isinstance(obj, list):
        return [replace_const_with_enum(i) for i in obj]
    return obj


def remove_examples(obj):
    """Drop `examples` arrays, keeping the first value as the node's `example`.

    The API definition writes one `example` per field (OpenAPI 3.0). The AsyncAPI
    contract carries the same value as JSON Schema `examples: [value]`, so dropping
    the array outright would blank every Example cell, and would make
    synth_default_json fall back to field NAMES for a message with no published
    example (`{"command": "command"}`). A node that already has `example` keeps it."""
    if isinstance(obj, dict):
        out = OrderedDict()
        for k, v in obj.items():
            if k == "examples":
                if "example" not in obj and isinstance(v, list) and v:
                    out["example"] = v[0]
                continue
            out[k] = v
        for k, v in out.items():
            out[k] = remove_examples(v)
        return out
    if isinstance(obj, list):
        return [remove_examples(i) for i in obj]
    return obj


def _unescape_pointer_token(token):
    """RFC 6901 §4 unescaping. '~1' MUST be decoded before '~0', or '~01' decodes to
    '/' instead of to the literal '~1' the author wrote."""
    return token.replace("~1", "/").replace("~0", "~")


def _escape_pointer_token(token):
    """Inverse of _unescape_pointer_token, for rendering a member name back INTO a
    pointer. '~' MUST be escaped before '/', mirroring the decode order: escape '/'
    first and the '~1' it just produced would then be re-escaped to '~01'."""
    return token.replace("~", "~0").replace("/", "~1")


def _decode_pointer_token(raw_token):
    """One raw reference token of a $ref fragment -> the member name it denotes.

    Two operations happen here, percent-decode then '~'-unescape; the split that
    produced the token happened in the caller. The ORDER of all three is load-bearing:

    0. the CALLER has already split the fragment on '/'. The pointer's own separators
       are legal in a URI fragment (RFC 3986 fragment allows '/'), so a conformant
       producer never percent-encodes them; splitting first therefore keeps a '%2F'
       that appears INSIDE a token as a literal '/' in the member name instead of
       silently promoting it to another level of nesting.
    1. percent-decode (RFC 6901 §6: a $ref is a URI-reference, so its fragment
       carries the pointer percent-encoded). This is not hypothetical for AsyncAPI: a
       parameterised channel address contains '{' and '}', which RFC 3986 disallows in
       a fragment, so they MUST arrive as '%7B'/'%7D'.
    2. THEN undo '~1'/'~0'. Last, necessarily: '~' is unreserved but a producer may
       percent-encode it anyway, so the '~1' in 'a%7E1b' only becomes visible after
       step 1. Unescaping first would leave a literal '~1' exactly where the author
       meant '/'."""
    return _unescape_pointer_token(unquote(raw_token))


def _describe_members(node, token):
    """What a node offers, for the 'found: ...' half of an unresolvable-pointer error.

    Every key goes through str() first: yaml.safe_load produces int, bool and None
    KEYS routinely ('200:', 'true:', 'null:' in YAML are not strings), and ', '.join
    over those raises TypeError while FORMATTING this message — replacing the
    ValueError this module promises with a traceback thrown by the error path itself."""
    if not isinstance(node, dict):
        return f"a {type(node).__name__}, which has no members"
    keys = list(node)
    shown = ", ".join(str(k) for k in keys[:8])
    if len(keys) > 8:
        shown += f", ... ({len(keys)} in total)"
    unnameable = next(
        (k for k in keys if not isinstance(k, str) and str(k) == token), None)
    if unnameable is not None:
        shown += (f"; the member {unnameable!r} there has type "
                  f"{type(unnameable).__name__}, not str, and JSON member names are "
                  "always strings, so no pointer can reach it")
    return shown


def resolve_json_pointer(doc, pointer, label=None):
    """Walk an RFC 6901 JSON Pointer — the part of a $ref AFTER the '#' — through doc.

    '' (a bare '#') returns doc itself; numeric tokens index into arrays; every token
    is percent-decoded and then '~'-unescaped (_decode_pointer_token). A token that
    does not resolve raises ValueError naming the pointer, the prefix that DID resolve
    — re-escaped, so the location it reports is itself a pasteable pointer — and what
    was actually available there. It does NOT return None: an unresolved ref handed on
    to schema_to_rows produces a field table that is silently empty, and a reference
    page that prints no fields at all is worse than a generator that stops. Every
    message on this path is ASCII, for the same reason as the loader warning above."""
    label = label if label is not None else "#" + pointer
    if pointer == "":
        return doc
    if not pointer.startswith("/"):
        raise ValueError(
            f"invalid JSON Pointer in $ref '{label}': a non-empty pointer must start "
            "with '/' (RFC 6901 section 3)")
    node = doc
    walked = []
    for raw_token in pointer.split("/")[1:]:
        token = _decode_pointer_token(raw_token)
        # Re-escaped, because `walked` holds DECODED member names: a member literally
        # called '/tag/data' has to be reported as '/paths/~1tag~1data', not as
        # '/paths//tag/data', which reads as three levels and is a different location.
        where = ("/" + "/".join(_escape_pointer_token(t) for t in walked)
                 if walked else "the document root")
        if isinstance(node, dict) and token in node:
            node = node[token]
        elif isinstance(node, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", token) or int(token) >= len(node):
                raise ValueError(
                    f"unresolvable JSON Pointer in $ref '{label}': '{token}' is not a "
                    f"usable index into the {len(node)}-element array at {where}")
            node = node[int(token)]
        else:
            raise ValueError(
                f"unresolvable JSON Pointer in $ref '{label}': no '{token}' at "
                f"{where} (found: {_describe_members(node, token)})")
        walked.append(token)
    return node


def _decode_ref_path(file_part):
    """Percent-decode the PATH component of a $ref.

    Acting on the same premise this module already applies to the fragment: a $ref is
    a URI-reference (RFC 3986), so its path arrives percent-encoded too, and a schema
    filed as 'response codes.yaml' has to travel as 'response%20codes.yaml'. Until this
    existed, _parse_ref handed file_part straight to os.path.join, so
    'a%20b.yaml#/x' looked for a file literally named 'a%20b.yaml' — decoding the
    fragment while leaving the path encoded, on a premise that covers both.

    One divergence, stated rather than papered over: '%2F' inside a segment denotes a
    literal '/' in a NAME, and decoding it yields a separator that os.path.join and the
    OS then honour, so that ref resolves somewhere other than where the URI points.
    There is no string-level fix — splitting on '/' before decoding and rejoining
    produces the identical string, since split('/') and join('/') are inverses — and no
    filesystem this runs on can name a file containing '/', so the encoded form is
    unrepresentable regardless. Decoding at least fails visibly, as ENOENT on a path
    the reader recognises, rather than hunting for a file whose name contains '%2F'.

    Provably inert on today's tree, so it moves no byte: 0 of the 191 $refs under
    api/mqtt/schema/ contain '%', and unquote returns its argument unchanged when
    there is no '%' escape in it."""
    return unquote(file_part)


def _parse_ref(ref, base_dir, root):
    """Classify a $ref into (file_path, pointer, guard_key) WITHOUT opening anything.

        'a/b.yaml'                -> (normpath(base_dir/a/b.yaml), None, that path)
        '#/components/schemas/X'  -> (None, '/components/schemas/X', root-keyed)
        'a.yaml#/components/x'    -> (normpath(...), '/components/x', path + '#' + ptr)

    Both file forms percent-decode the path before joining (_decode_ref_path); the
    guard key is built from the DECODED path, so 'a%20b.yaml' and 'a b.yaml' name one
    file and share one cycle-guard entry instead of two.

    Kept free of I/O so resolve_refs can still consult `seen` BEFORE it opens a file,
    exactly as it did when the first form was the only form."""
    if isinstance(ref, str) and "#" in ref:
        file_part, _, pointer = ref.partition("#")
        if file_part:
            path = os.path.normpath(os.path.join(base_dir, _decode_ref_path(file_part)))
            return path, pointer, path + "#" + pointer
        # A bare fragment is internal to the document being resolved, and that
        # document may have been handed in already parsed — there is no filename to
        # key the cycle guard on. id(root) serves instead: the caller holds root
        # alive for the whole resolution, so the value cannot be recycled onto a
        # different object mid-walk.
        return None, pointer, f"<root {id(root):x}>#{pointer}"
    path = os.path.normpath(os.path.join(base_dir, _decode_ref_path(ref)))
    return path, None, path


def resolve_refs(obj, base_dir, seen=None, root=None):
    """Resolve $refs in a schema. Two forms, of which only the first is exercised by
    api/mqtt/schema/ today:

    RELATIVE FILE — '../../refrence/*.yaml', resolved as
    os.path.normpath(os.path.join(base_dir, _decode_ref_path(ref))). Every one of the
    191 $refs under api/mqtt/schema/ takes this form: 0 are absolute, 0 carry a '#'
    and 0 carry a '%' — so the decode is the identity on all 191 — including all 50 in
    openapi.json, which this pipeline never opens: spying on builtins.open through a
    --check run records 0 opens of it, and only 3 distinct files under api/mqtt/schema/
    opened at all (response_codes.json, example_description.json,
    refrence/response/response.yaml), which is what the 24 CARRY pages imply.

    Do not read that as "nothing reads openapi.json". It has TWO readers elsewhere in
    the repo, and an earlier draft of this docstring claimed one. First,
    docusaurus.config.ts:367 takes info.version from it for the sidebar header
    (specVersion, docusaurus.config.ts:27-35). Second, scripts/site/lint-schema-
    citations.mjs reads it in readLines() to range-check the line anchors that
    docs/resources/rf-regions-and-regulations.mdx cites
    into it (4 citations, at ':1369' and ':1894'). Measured, not inferred: wrapping
    fs.readFileSync around `npm run lint:schema-citations` records one read of
    api/mqtt/schema/openapi.json. That second reader is cited by FUNCTION rather than
    by line on purpose — it is an untracked, actively-edited file, and a line anchor
    into it was already stale by the time this paragraph was finished.

    What was given up here is a sentence, not a behaviour. From the initial commit
    (461393da, then the since-renamed scripts/apigen/schema.py:93) until this rewrite, THIS docstring
    read: "openapi.json's absolute /home/runner refs are never traversed by this
    pipeline." Its second half is true only because its premise is not: openapi.json
    has no such refs to traverse. `grep -c home/runner api/mqtt/schema/openapi.json`
    -> 0, all 50 of its $refs are repo-relative ('commands/control/x.json'), and
    `git log --all -S"home/runner" -- api-schema/openapi.json api/mqtt/schema/openapi.json`
    -> 0 commits, so no tracked revision of that file ever held the string. The place
    the string DID live for that whole span is this file — inside that very sentence
    (`git log -S"home/runner" --follow -- scripts/api/mqtt/schema.py` -> one commit,
    the initial one) — so "grep and you find nothing" has to name openapi.json to be
    true; said of "this file" it was false until the sentence itself was deleted.
    Recorded rather than silently dropped because three other documents still point at
    it and none of them can now be corroborated from here:
    .ai-history/065-additional-fixes.md §2.3 rests "the generator does not read
    openapi.json" on "a comment at scripts/api/mqtt/schema.py:93"; §2.7 step 11 plans
    to "drop its mention at schema.py:93"; and
    .audit/2026-08-16_codebase-cleanup/2026-08-16_codebase-audit-findings.md:2250
    quotes the sentence while asserting `grep -c '/home/runner/work'
    api/mqtt/schema/openapi.json` -> 50, which measures 0 on this tree and on every
    tracked revision. All three cite line 93, which no longer holds it.

    JSON POINTER — '#/components/schemas/X', or the compound
    'a.yaml#/components/schemas/X', where the part before '#' names a file to load and
    the part after points into it. `grep -rn '#/' api/mqtt/schema/` returns 0, so this
    branch is unreachable on today's tree and cannot move --check's output by a byte.
    It is here because an AsyncAPI 3.0.0 single document reuses schemas as internal
    pointers BY CONSTRUCTION (.ai-history/065-additional-fixes.md §2.7 step 3), and until now
    os.path.join(base_dir, '#/components/schemas/X') produced a path that does not
    exist and raised FileNotFoundError several frames away from its cause. A $ref is a
    URI-reference, so BOTH of its components are percent-decoded: each fragment token
    before it is '~'-unescaped (_decode_pointer_token owns that order), and the path
    before it is joined to base_dir (_decode_ref_path, which records the one place
    URI and filesystem semantics genuinely part company).

    `root` is the document a bare '#/...' is resolved against. It defaults to `obj`
    itself — the outermost object handed in — and is re-based to the LOADED document
    whenever a ref crosses into another file, so a '#/...' inside b.yaml points into
    b.yaml and not into whichever document referenced it (RFC 3986 fragment
    semantics). A caller that holds only a SUBTREE of the document its pointers are
    written against — an AsyncAPI 3.0.0 message payload whose '#/components/schemas/X'
    names the DOCUMENT root — must pass that document explicitly; extract_schema
    exposes the same optional parameter and forwards it. What was given up: nothing
    for existing callers — the parameter is optional, defaults to the old implicit
    behaviour, and the relative-file path is byte-for-byte the old one — but `seen`
    now carries two kinds of key, a file path and a root-identity + pointer pair,
    because a bare fragment has no filename to guard on. Read a guard entry as
    opaque, not as a path."""
    if seen is None:
        seen = set()
    if root is None:
        root = obj
    if isinstance(obj, dict):
        ref = obj.get("$ref")
        if ref:
            file_path, pointer, guard = _parse_ref(ref, base_dir, root)
            if guard in seen:
                return OrderedDict([("description", f"Circular reference: {ref}")])
            if file_path is None:
                doc, child_dir = root, base_dir
            else:
                doc, child_dir = load_structured_file(file_path), os.path.dirname(file_path)
            target = doc if pointer is None else resolve_json_pointer(doc, pointer, ref)
            # A ref target arrives AS AUTHORED: extract_schema runs
            # replace_const_with_enum over its own tree before calling in here, but
            # not over a file this loads or a document a '#/...' points into. So
            # {'$ref': '#/defs/C'} onto {'const': 'x'} used to publish an EMPTY
            # allowed-values cell — _enum_units reads node["enum"] and nothing else —
            # where an identical INLINE {'const': 'x'} publishes 'x'. The `command`
            # fields on this API are exactly the const-shaped ones, so that is the
            # field most likely to hit it. Normalised on the spliced-in target only,
            # never on `doc`: pointers are written against the document as authored,
            # and rewriting it would move '#/defs/C/const' to '#/defs/C/enum/0'
            # underneath them. Cannot move today's output — 0 'const' in the tree.
            target = replace_const_with_enum(target)
            merged = resolve_refs(target, child_dir, seen | {guard}, doc)
            siblings = OrderedDict((k, v) for k, v in obj.items() if k != "$ref")
            if siblings:
                if not isinstance(merged, dict):
                    # A pointer can land on an array or a scalar
                    # ('#/components/schemas/Region/enum'), and a non-dict has nowhere
                    # to carry the keys written beside the $ref. Dropping them was
                    # silent, and a dropped sibling `description` is a field
                    # description that vanishes from the generated table with no
                    # warning — so stop rather than publish the blank. Latent for file
                    # refs before this, newly REACHABLE through pointers; cannot fire
                    # on today's tree, where every $ref is a whole-file ref and every
                    # file under api/mqtt/schema/ parses to a mapping.
                    raise ValueError(
                        f"$ref '{ref}' resolves to a {type(merged).__name__}, which "
                        "cannot carry the key(s) "
                        + ", ".join(repr(k) for k in siblings)
                        + " written alongside it; point the $ref at an object, or "
                        "move those keys into the target")
                merged = OrderedDict(merged)
                for k, v in siblings.items():
                    merged[k] = resolve_refs(v, base_dir, seen | {guard}, root)
            return merged
        out = OrderedDict()
        for k, v in obj.items():
            out[k] = resolve_refs(v, base_dir, seen, root)
        return out
    if isinstance(obj, list):
        return [resolve_refs(i, base_dir, seen, root) for i in obj]
    return obj


def extract_schema(raw_schema, source_path, root=None):
    """Strip the annotation keys, normalise const, resolve $refs, drop examples.

    `root` is the document any bare '#/...' $ref inside raw_schema is resolved
    against. It defaults to raw_schema itself, which is what every caller in this repo
    wants today: generate_reference.py:162 hands in a whole parsed schema file, so the
    file IS the document. Pass it explicitly when raw_schema is a SUBTREE of the
    document its pointers name — an AsyncAPI 3.0.0 single document, where
    extract_schema(doc["components"]["messages"][m]["payload"], p, root=doc) is the
    call, and where leaving root implicit means '#/components/schemas/X' looks for
    'components' inside the payload and (correctly, but uselessly) raises."""
    skip = {"title", "x-stoplight", "x-tag", "examples", "description"}
    schema = OrderedDict((k, v) for k, v in raw_schema.items() if k not in skip)
    schema.setdefault("type", "object")
    schema = replace_const_with_enum(schema)
    # The default root is raw_schema, not `schema`: a '#/...' pointer is written
    # against the file as authored, and `schema` has already had
    # title/description/examples/x-* stripped above, so a pointer into any of them
    # would fail on a document that is fine. No-op today — 0 '#/' refs in the tree.
    schema = resolve_refs(schema, os.path.dirname(source_path),
                          root=raw_schema if root is None else root)
    schema = remove_examples(schema)
    return schema


def extract_examples(raw_schema, title, example_data=None):
    """Return an ordered {label: value} map from an `examples[]` array.

    TWO ENTRY SHAPES, and the first one supersedes the overlay this function was written
    around.

    AsyncAPI MESSAGE example -- `{name, summary, payload}`. The label travels WITH its
    payload, so it cannot be misattached. Measured on the contract: 195 of 195 message
    examples carry a name, none is blank, none is duplicated within its message, and every
    one carries `payload`. This is the shape to prefer wherever it is available.

    BARE VALUE -- a raw payload with no label, which is what a *schema*-level `examples[]`
    holds (347 entries in the contract, 6 of them named). Only this shape needs
    example_description.json, and only positionally: `label = list(keys)[idx]`.

    WHY POSITIONAL LABELLING HAD TO GO. It is correct only while the count and order of a
    payload's examples exactly match the overlay's key order, and nothing enforced either.
    Insert one example into a payload and every label after it silently slides onto the wrong
    body -- the same class of defect as a line anchor that has drifted, which this repository
    has already paid for. The overlay was also incomplete on both sides: it labels 28 titles
    where the contract names 195 examples, and for `get_wifi` and `get_eth` it holds MORE
    labels than there are payloads, so those extra labels named nothing at all.

    `example_data` is now optional. Passing None is the normal case for contract reads.
    """
    examples = raw_schema.get("examples")
    if not isinstance(examples, list) or not examples:
        return OrderedDict()
    result = OrderedDict()
    descriptions = (example_data or {}).get(title, {}) or {}
    desc_keys = list(descriptions.keys())
    for idx, entry in enumerate(examples):
        if isinstance(entry, dict) and "payload" in entry:
            label = entry.get("name") or entry.get("summary") or f"example{idx + 1}"
            value = entry["payload"]
        else:
            label = desc_keys[idx] if idx < len(desc_keys) else f"example{idx + 1}"
            value = entry
        # An OrderedDict would DROP a colliding label rather than report it, and an example
        # that vanishes from a page is exactly the silent loss this module keeps finding.
        # No collision exists on today's contract; this is here so that adding one is
        # visible in the output instead of costing a worked example.
        if label in result:
            n = 2
            while f"{label} ({n})" in result:
                n += 1
            label = f"{label} ({n})"
        result[label] = value
    return result


def strip_inline_response_code_tables(obj):
    if isinstance(obj, dict):
        code_node = obj.get("code")
        if isinstance(code_node, dict):
            desc = code_node.get("description")
            if isinstance(desc, str) and RESPONSE_CODE_MARKER in desc:
                code_node["description"] = (
                    "Command response status code — see Response Codes."
                )
        for k, v in obj.items():
            obj[k] = strip_inline_response_code_tables(v)
        return obj
    if isinstance(obj, list):
        return [strip_inline_response_code_tables(i) for i in obj]
    return obj


# --------------------------------------------------------------------------- #
# error codes  (adapted: every command op seeded with ALL global '*' codes)
# --------------------------------------------------------------------------- #
_ASYNCAPI_CACHE = {}


def load_asyncapi():
    """The AsyncAPI contract, parsed once per process.

    1.4 MB, so it is cached: the response-codes singleton reads it three times
    (catalog, closed-set assertion, per-command matrix) and re-parsing would
    dominate the generator's runtime."""
    if "doc" not in _ASYNCAPI_CACHE:
        _ASYNCAPI_CACHE["doc"] = load_structured_file(ASYNCAPI)
    return _ASYNCAPI_CACHE["doc"]


def load_status_codes():
    """Return (rows, closed_enum) for the response-code catalog, from the AsyncAPI.

    rows  — the ordered catalog at
            #/components/schemas/statusCode/x-iotc-response-codes/codes, each row
            carrying code, constant, description, cause, recommendedAction,
            commands[], universal, reachable, terminal, retryable, and
            unreachableReason where the code is scoped to no published command.
    closed_enum — #/components/schemas/statusCode/enum, the CLOSED set of valid
            values. This replaces the legacy pair's `minimum: 0` / `maximum: 101`,
            which admitted 64 further values that mean nothing.

    Two conventions this normalises so no caller has to interpret them:
      * a `commands` value of ["*"] in the legacy catalogue is carried here as
        `universal: true` with an empty commands list;
      * `constant` is null for code 101, which has no firmware constant.

    Fails closed and loudly if the document's own two copies of the code set
    disagree — that is a real defect in the contract, not a condition to paper
    over, and it is the only assertion this function makes."""
    doc = load_asyncapi()
    # TWO CONTRACT SHAPES ARE READ, and which one is present decides the source.
    #   * Up to 1.26.0 as first published: #/components/schemas/statusCode carried the
    #     closed `enum` and the catalogue under x-iotc-response-codes.
    #   * From the 2026-09-21 rebuild, the payload schemas are the API definition's own
    #     (openapi.json), where `response.code` is `minimum: 0` / `maximum: 101` and no
    #     `statusCode` schema exists. The catalogue moved to #/info/x-iotc-response-codes
    #     and IS the closed set: its codes[] lists every defined value exactly once.
    sc = ((doc.get("components") or {}).get("schemas") or {}).get("statusCode")
    if isinstance(sc, dict):
        rows = ((sc.get("x-iotc-response-codes") or {}).get("codes")) or []
        closed = sc.get("enum") or []
        where = "#/components/schemas/statusCode/x-iotc-response-codes/codes"
    else:
        rows = (((doc.get("info") or {}).get("x-iotc-response-codes") or {}).get("codes")) or []
        closed = [r.get("code") for r in rows]
        where = "#/info/x-iotc-response-codes/codes"
        if len(set(closed)) != len(closed):
            raise SystemExit(f"AsyncAPI: {where} lists a code more than once: {sorted(closed)}")
    if not rows:
        raise SystemExit(
            f"AsyncAPI: {where} is empty or absent — the response-code catalog has no "
            f"source, refusing to emit a partial catalog. Checked {os.path.abspath(ASYNCAPI)}")
    row_codes = {r.get("code") for r in rows}
    if row_codes != set(closed):
        raise SystemExit(
            "AsyncAPI: statusCode.enum and x-iotc-response-codes.codes[] disagree. "
            f"enum={sorted(set(closed))} codes[]={sorted(row_codes)} "
            f"only-in-enum={sorted(set(closed) - row_codes)} "
            f"only-in-codes={sorted(row_codes - set(closed))}")
    return rows, closed


def contract_response_codes():
    """Per-operation response codes, FROM THE CONTRACT.

    Returns for_op(page_id) -> [{code, description}, ...] in ascending code order
    with 101 last, matching what mdx.render_response_codes consumes.

    Replaces load_response_codes, which read api/mqtt/schema/response_codes.json.
    The contract carries the same scoping pre-inverted at
    operations.<key>.x-iotc-response-codes.{universal,scoped} on 20 of 26 operations
    -- exactly the 22 command operations -- so no inversion of codes[].commands[] is
    needed here and the two cannot disagree.

    Keyed by PAGE ID (`reboot`), not by contract operation key (`receive_reboot`),
    because every caller holds the page id. The map is built from the same
    `command` const discover_operations keys on, so the two cannot drift."""
    doc = load_asyncapi()
    rows, _ = load_status_codes()
    desc_of = {r.get("code"): (r.get("description") or "") for r in rows}
    scoping = {}
    for key, op in (doc.get("operations") or {}).items():
        if op.get("action") != "receive":
            continue
        msgs = [m.get("$ref", "").split("/")[-1] for m in (op.get("messages") or [])]
        if not msgs:
            continue
        page_id = command_name(doc, key, op)
        if not page_id:
            continue
        rc = op.get("x-iotc-response-codes") or {}
        codes = sorted(set(rc.get("universal") or []) | set(rc.get("scoped") or []),
                       key=lambda c: (c == 101, c))
        scoping[page_id] = codes

    def for_op(page_id):
        return [{"code": c, "description": desc_of.get(c, "")}
                for c in scoping.get(page_id, [])]
    return for_op


# DELETED 2026-09-08 — load_response_codes, and RESPONSE_CODES with it.
#
# It read response_codes.json and returned a per-operation closure that merged the
# global `*` codes with the operation-specific ones. contract_response_codes above
# replaces it, reading each operation's own x-iotc-response-codes.{universal,scoped}
# from the contract — which is both narrower in scope and richer per row, carrying
# cause, recommendedAction, retryable, terminal, reachable and universal.
#
# It had NO CALLERS when it went: grep across the repository found only its own
# definition and two mentions in prose, one of them this module's docstring. So it was
# not a fallback anyone could reach — it was a second implementation of a rule the
# generator no longer consults, keyed to the 35-code world the contract corrected to 38.
# Same reasoning as the entry below it: an unreachable merge rule is worse than none,
# because the next reader has to establish which of the two is authoritative before
# they can trust either.


# DELETED 2026-09-08 — load_response_code_table and its _CODE_ROW_RE.
#
# They parsed a markdown Code|Meaning table out of response.yaml's
# code.description, which was the "DIRECT/named source of truth" for the
# response-code set and the 0..101 bounds. That role now belongs to the AsyncAPI
# contract: load_status_codes reads statusCode.enum for the closed set and
# x-iotc-response-codes.codes[] for the rows, which carry cause,
# recommendedAction, retryable, terminal, reachable and universal besides.
#
# Deleted rather than left in place because a parser with no caller is worse than
# no parser: the next reader cannot tell whether it is a live second source or
# dead weight, and this one specifically encoded the 35-code world -- keeping it
# would preserve a way to reintroduce the drift the migration removed.


# --------------------------------------------------------------------------- #
# discovery + classification helpers
# --------------------------------------------------------------------------- #
# Contract message key -> the page id this repo publishes that event under.
#
# NOT DERIVABLE, and that is why it is a constant rather than a rule. The contract
# names its unsolicited messages alertEvent / heartBeatEvent / epConnectionEvent /
# dataEvent; this site publishes them as alerts / heartBeatEVT / mqttConnEVT /
# dataEVT, which is an owner decision to retain (2026-09-08). Three of the four are
# corroborated by the contract's own example names -- "dataEVT -- enriched (...)",
# "heartBeatEVT -- minimal (...)", "mqttConnEVT -- CONNECTED on the CTRL endpoint"
# -- so these are the contract's display vocabulary, not a legacy artefact. The
# fourth, alerts, has no such prefix and is purely this repo's choice.
#
# Commands need no such map: their page id IS the `command` const the contract
# pins in <x>Command/allOf/1/properties/command/const, present 22 of 22.
EVENT_PAGE_IDS = OrderedDict([
    ("mqttConnEVT", "epConnectionEvent"),
    ("heartBeatEVT", "heartBeatEvent"),
    ("alerts", "alertEvent"),
    ("dataEVT", "dataEvent"),
])
# The closed page-kind vocabulary, READ FROM THE SPINES so there is exactly one list.
# Duplicating it here as a literal would let discover_operations accept a kind that has
# no template — which is the same fail-open shape as the old slots_for filter, just moved
# one step upstream. classify imports nothing from this module, so there is no cycle.
#
# THE ASYMMETRY IS DELIBERATE: this guards the kinds that are DERIVED from the contract's
# tags (the event/telemetry pages below). The command branch above still writes the
# literal "command", because a command's identity is established twice over by the
# contract independently of its tag — `action: receive` plus the `command` const that
# _command_const pins, which is the join key for the whole surface.
from classify import KNOWN_KINDS as KNOWN_PAGE_KINDS  # noqa: E402  (after the constants it documents)


def _command_const(doc, message_key):
    """The `command` literal a command message pins, or None.

    It sits in a LATER allOf branch than the envelope, so this scans every branch
    rather than trusting position: 22 of 22 command messages carry it, and it is the
    canonical join key between the contract, commandName.enum, the response-code
    scoping and this repo's page ids."""
    msg = (doc.get("components", {}).get("messages", {}) or {}).get(message_key) or {}
    ref = (msg.get("payload") or {}).get("$ref") or ""
    schema = (doc.get("components", {}).get("schemas", {}) or {}).get(ref.split("/")[-1]) or {}
    for branch in [schema] + list(schema.get("allOf") or []):
        node = branch
        if "$ref" in node:
            node = (doc.get("components", {}).get("schemas", {}) or {}).get(
                node["$ref"].split("/")[-1]) or {}
        const = ((node.get("properties") or {}).get("command") or {}).get("const")
        if const:
            return const
    return None


def command_name(doc, op_key, op):
    """The command a `receive` operation consumes -- the page id and the join key.

    Read in order of strength, and every source that speaks must agree:
      1. the `command` const the payload pins (the contract as first published);
      2. a single-value `command` enum (the API definition's own form for
         control_operation, get_operating_mode and set_operating_mode);
      3. the operation key, `receive_<command>`, which every command operation uses.
    The `command` value of each of the message's examples is checked against the
    result, so a key renamed without its payload cannot pass silently. Returns None
    when nothing names a command."""
    msgs = [m.get("$ref", "").split("/")[-1] for m in (op.get("messages") or [])]
    if not msgs:
        return None
    name = _command_const(doc, msgs[0])
    schemas = (doc.get("components", {}) or {}).get("schemas", {}) or {}
    msg = (doc.get("components", {}).get("messages", {}) or {}).get(msgs[0]) or {}
    payload = schemas.get(((msg.get("payload") or {}).get("$ref") or "").split("/")[-1]) or {}
    enum = ((payload.get("properties") or {}).get("command") or {}).get("enum") or []
    if not name and len(enum) == 1:
        name = enum[0]
    if not name and op_key.startswith("receive_") and len(op_key) > len("receive_"):
        name = op_key[len("receive_"):]
    for ex in (msg.get("examples") or []):
        sent = (ex.get("payload") or {}).get("command")
        if name and sent is not None and sent != name:
            raise SystemExit(
                f"AsyncAPI: operation {op_key} resolves to command {name!r} but example "
                f"{ex.get('name')!r} of {msgs[0]} sends command {sent!r}.")
    return name


def discover_operations():
    """Discover the documented operation set FROM THE ASYNCAPI CONTRACT.

    Returns [{op, kind, req_ptr, resp_ptr, req_path, resp_path}].

    Until 2026-09-08 this walked commands/{control,dev_mgmt}/ and events/ with
    os.listdir, so THE PAGE SET ITSELF was defined by which files happened to sit in
    the legacy tree -- the tree the migration deletes. Deleting commands/ did not
    corrupt a page; it made the generator believe the API had no operations, and the
    coverage gate then reported all 20 commands as "ops not in schema". Discovery is
    a question about the contract, so it is now asked of the contract.

    `kind` stays the two-valued command|event that config/spines.json declares (plus
    `reference`, which only singletons take). The
    contract tags dataEvent `telemetry`, and a third page kind is a template change
    with its own frontmatter, slot list and gate -- deliberately not smuggled in
    here, because this function must reproduce the previous 24-op set exactly.

    `req_path`/`resp_path` are None. They were per-operation file paths, and no such
    files exist in the contract. Nothing reads them today: every operation page is
    CARRY, so build_page returns before payload() is called. They are kept as keys,
    set to None, so the @slot path fails loudly on a missing reader rather than
    silently reading a stale legacy file. `req_ptr`/`resp_ptr` carry the JSON
    Pointers that replace them."""
    doc = load_asyncapi()
    ops_node = doc.get("operations") or {}
    out = []

    for key, op in ops_node.items():
        if op.get("action") != "receive":
            continue
        msgs = [m.get("$ref", "").split("/")[-1] for m in (op.get("messages") or [])]
        if not msgs:
            continue
        name = command_name(doc, key, op)
        if not name:
            raise SystemExit(
                f"AsyncAPI: operation {key} carries no `command` const, no single-value "
                "`command` enum and no receive_<command> key, so its page id cannot be "
                "determined.")
        reply = op.get("reply") or {}
        reply_msgs = [m.get("$ref", "") for m in (reply.get("messages") or [])]
        out.append({
            "op": name, "kind": "command",
            "req_ptr": "#/components/messages/%s" % msgs[0],
            "resp_ptr": reply_msgs[0] if reply_msgs else None,
            "req_path": None, "resp_path": None,
        })

    # message key -> the tag its send operation(s) carry. THE KIND IS ASKED OF THE
    # CONTRACT, NOT HARDCODED HERE. This block used to append `"kind": "event"` as a
    # literal for all four pages, which is how dataEVT — tagged `telemetry` by the
    # contract on all three of its operations — was published as an event.
    #
    # The contract carries a complete three-valued vocabulary and it is the statement
    # of truth: tags[0].name over the 26 operations is `command` on 20, `event` on 3
    # and `telemetry` on 3. Deriving from it means a future fourth kind, or a
    # reclassification upstream, arrives here on its own rather than waiting for
    # someone to notice a literal.
    #
    # AMBIGUITY IS AN ERROR, NOT A VOTE. A message can be carried by several send
    # operations — dataEvent has three, one per channel binding (data1, data2, shared)
    # — so the tags are collected as a SET and a disagreement raises. Measured at the
    # commit that introduced this: all five sent messages resolve to exactly one tag
    # each, so the set is a size-1 assertion today and a tripwire tomorrow.
    sent = {}
    for key, op in ops_node.items():
        if op.get("action") != "send":
            continue
        tags = op.get("tags") or []
        tag = tags[0].get("name") if tags and isinstance(tags[0], dict) else None
        for m in (op.get("messages") or []):
            sent.setdefault(m.get("$ref", "").split("/")[-1], set()).add(tag)
    for page_id, message_key in EVENT_PAGE_IDS.items():
        if message_key not in sent:
            raise SystemExit(
                f"AsyncAPI: message {message_key} is mapped to page id {page_id} by "
                "EVENT_PAGE_IDS but no send operation carries it. Either the contract "
                "dropped the event or the map is stale.")
        kinds = sent[message_key]
        if len(kinds) != 1:
            raise SystemExit(
                f"AsyncAPI: message {message_key} (page {page_id}) is tagged "
                f"{sorted(k for k in kinds if k)} by different send operations, so its page "
                "kind is undecidable. One message must have one kind — fix the contract's "
                "tags rather than picking a winner here.")
        kind = next(iter(kinds))
        if kind not in KNOWN_PAGE_KINDS:
            raise SystemExit(
                f"AsyncAPI: message {message_key} (page {page_id}) carries tag {kind!r}, which "
                f"is not a known page kind. Known kinds are {sorted(KNOWN_PAGE_KINDS)}, each "
                "declared with its own ordered spine in scripts/api/mqtt/config/spines.json. "
                "Add the kind there — with a spine — before the contract starts using it, or "
                "the page would be built against a template that does not exist.")
        out.append({
            "op": page_id, "kind": kind,
            "req_ptr": "#/components/messages/%s" % message_key,
            "resp_ptr": None,
            "req_path": None, "resp_path": None,
        })
    return out


# --------------------------------------------------------------------------- #
# resolved schema -> SchemaRow[]  (the net-new adapter the components consume)
# SchemaRow = {field, type, required, enumUnits, example, desc, children}
# --------------------------------------------------------------------------- #
_COMPOSITION_KEYS = ("allOf", "oneOf", "anyOf")


def _coerce_example_cell(val):
    """SchemaTable Example column is string-typed; booleans render blank in React.
    Coerce booleans (and non-primitive scalars) to a display string; leave
    numbers/strings for the caller to str() as needed. Returns str or None."""
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, str):
        return val
    return None  # objects/arrays: no scalar example cell


def _enum_units(node):
    """enumUnits precedence: enum -> list of values; else numeric min/max -> 'min-max';
    else array maxItems -> count string; else None."""
    if isinstance(node.get("enum"), list) and node["enum"]:
        return list(node["enum"])
    if node.get("type") in ("integer", "number"):
        lo, hi = node.get("minimum"), node.get("maximum")
        if lo is not None and hi is not None:
            return f"{lo}–{hi}"
    if node.get("type") == "array" and node.get("maxItems") is not None:
        return f"max {node['maxItems']}"
    return None


_SHAPE_KEYS = ("properties", "items", "$ref", "allOf", "anyOf", "oneOf", "enum", "type")

# What a scalar/array branch contributes to the node that aliases it. `items` is the one
# that matters and the one that was missing: the contract's commonest alias shape is
#   accessOperations: { allOf: [ { $ref: accessOperationList } ], description: ... }
# and `accessOperationList` is an ARRAY. Inheriting only `type` and `format` gave the
# merged node `type: 'array'` with no `items`, so `_children_rows` found nothing to
# descend into and every element field vanished — silently, because an array with no
# children renders as a perfectly plausible leaf row. Objects never hit this path
# (`obj_branches` claims them first), which is why it stayed hidden in the one shape that
# does. The rest are carried because dropping a declared bound is the same class of
# silent loss, even where nothing renders them today.
_INHERITED_KEYS = (
    "type", "format", "items",
    "minItems", "maxItems", "uniqueItems",
    "minLength", "maxLength", "pattern",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "default", "const",
)


def _carries_more_schema(candidate, incumbent):
    """True when `candidate` describes a shape and `incumbent` only constrains one.

    A JSON Schema node can legitimately say nothing about a member's shape and only
    narrow it — `{"required": ["WPA2Personal"], "maxProperties": 1}` is a discriminator,
    not a definition. When two declarations of the same property collide, the one that
    names a type, an enum, a `$ref` or sub-properties is the one a field table needs;
    keeping the other publishes an empty row. Deliberately asymmetric: it only ever
    promotes a node with shape over a node with none, so two genuine definitions still
    fall to the first-declaration rule rather than to whichever happens to look bigger.
    """
    if not isinstance(candidate, dict) or not isinstance(incumbent, dict):
        return False
    return (any(k in candidate for k in _SHAPE_KEYS)
            and not any(k in incumbent for k in _SHAPE_KEYS))


def _merge_composition(node, _depth=0):
    """Collapse an anyOf/oneOf/allOf node. Object-branch compositions -> a synthetic
    object with merged properties (first branch wins on conflict); scalar/enum branches
    -> a union node carrying merged enum values. Returns (merged_node, note|None).

    THE MERGE IS BOTTOM-UP, and it has to be. A branch is classified as an "object
    branch" by carrying `type: object` or `properties` — but a branch whose own members
    arrive through ITS own composition keyword carries neither until it has been merged
    itself. In the AsyncAPI contract that is the common shape, not an edge case:
    `configEventsCommand.eventConfiguration` is `allOf: [ $ref cfgEventPayload ]`, and
    `cfgEventPayload` is itself `allOf: [ {16 inline flags}, $ref alertThresholds ]` with
    no top-level `properties`. Classifying without merging first sent that node down the
    SCALAR path, which produced a node with no properties at all, so `_row` fell through
    to `type: 'any'` and `_children_rows` returned nothing — 42 real fields silently
    absent from one page's row model. `extract_schema` cannot cover for this either: its
    `setdefault("type", "object")` applies only to the node it is handed, never to a
    nested one.

    `_depth` is a backstop, not a correctness device: `resolve_refs` already replaces a
    circular `$ref` with a description node, so the tree handed in here is finite.
    """
    if not isinstance(node, dict) or _depth > 16:
        return node, None
    for key in _COMPOSITION_KEYS:
        branches = node.get(key)
        if not isinstance(branches, list) or not branches:
            continue
        branches = [_merge_composition(b, _depth + 1)[0] if isinstance(b, dict) else b
                    for b in branches]
        obj_branches = [b for b in branches if isinstance(b, dict) and (
            b.get("type") == "object" or "properties" in b)]
        if obj_branches:
            # THE NODE'S OWN `properties` AND `required` ARE SEEDED FIRST, because they
            # apply unconditionally and the branches do not replace them. Overwriting
            # `out["properties"]` with only the branch union discarded them, and the
            # contract has that exact shape: `wifiSecurity` declares
            # `properties.securityDetails` as an `allOf` onto `wifiSecurityDetails` — the
            # rich definition, five credential objects deep — while each of its four
            # `oneOf` branches RE-declares `securityDetails` as a bare
            # `{required, maxProperties}` discriminator stub. Branch-only merging kept the
            # stub, so the whole credential subtree resolved to `type: 'any'` with no
            # children and 55 real fields vanished from one page's row model.
            merged = OrderedDict((k, v) for k, v in (node.get("properties") or {}).items())
            required = [r for r in (node.get("required") or [])]
            for b in obj_branches:
                for pname, pnode in (b.get("properties") or {}).items():
                    if pname not in merged:            # first declaration wins on conflict
                        merged[pname] = pnode
                    elif _carries_more_schema(pnode, merged[pname]):
                        # …unless the incumbent is a constraint-only stub and the
                        # newcomer actually describes a shape. "First wins" is the right
                        # tie-break between two real definitions and the wrong one
                        # between a definition and a discriminator.
                        merged[pname] = pnode
                # `required` unions ONLY for allOf, where every branch applies at
                # once. Under anyOf/oneOf the branches are ALTERNATIVES: a field
                # required inside branch B is required only when B is the branch
                # present, so unioning marks fields required that a valid payload
                # legitimately omits. heartBeatEVT.data is the live case — an
                # anyOf of inventoryStatus | batteryAlert, where unioning flagged
                # all three batteryAlert fields required on every heartbeat.
                if key == "allOf":
                    for r in (b.get("required") or []):
                        if r not in required:
                            required.append(r)
            out = OrderedDict(node)
            for k in _COMPOSITION_KEYS:
                out.pop(k, None)
            out["type"] = "object"
            out["properties"] = merged
            out["required"] = required
            if key == "allOf":
                return out, f"allOf of {len(obj_branches)} object variant(s), merged"
            # Name the variants so the reader knows the fields are alternatives and
            # that nothing here is unconditionally required.
            names = [b.get("title") for b in obj_branches if b.get("title")]
            shape = " | ".join(names) if len(names) == len(obj_branches) \
                else f"{len(obj_branches)} variants"
            return out, f"{key}: {shape} — fields shown together; each applies only to its own variant"
        # scalar/enum branches -> union in the type/enumUnits cell.
        #
        # `type` and `format` are INHERITED from the branches, first branch wins, on
        # the same rule the object half uses. Without that, the single-branch alias
        # the AsyncAPI contract uses constantly --
        #   code: { allOf: [ { $ref: '#/components/schemas/statusCode' } ],
        #           title: ..., description: ... }
        # -- lost its type: after $ref resolution the branch carries
        # type: 'integer', but the merged node kept only the parent's title and
        # description, so _row fell through to its "any" default. The contract
        # layers a per-use title and description over a shared scalar this way
        # throughout, so the alias is the common shape, not an edge case.
        vals = []
        inherited = OrderedDict()
        for b in branches:
            if not isinstance(b, dict):
                continue
            for v in (b.get("enum") or []):
                if v not in vals:
                    vals.append(v)
            for k in _INHERITED_KEYS:
                if k not in inherited and b.get(k) is not None:
                    inherited[k] = b[k]
        out = OrderedDict(node)
        for k in _COMPOSITION_KEYS:
            out.pop(k, None)
        for k, v in inherited.items():
            out.setdefault(k, v)          # an explicit parent value still wins
        if vals:
            out["enum"] = vals
        # A single-branch allOf is an ALIAS, not a union, and calling it one in the
        # description cell is noise on a table the reader is scanning for facts.
        if key == "allOf" and len(branches) == 1:
            return out, None
        return out, f"{key} union"
    return node, None


def _row(field, node, parent_required):
    node, comp_note = _merge_composition(node) if isinstance(node, dict) else (node, None)
    node = node if isinstance(node, dict) else OrderedDict()
    typ = node.get("type") or ("object" if "properties" in node else "any")
    if typ == "string" and isinstance(node.get("enum"), list):
        typ = "enum"
    desc = node.get("description") or ""
    if comp_note:
        desc = (desc + f" ({comp_note})").strip()
    example = _coerce_example_cell(node.get("example"))
    row = OrderedDict([
        ("field", field),
        ("type", typ),
        ("required", field in (parent_required or [])),
        ("enumUnits", _enum_units(node)),
        ("example", example),
        ("desc", desc),
    ])
    children = _children_rows(node)
    if children:
        row["children"] = children
    return row


def _children_rows(node):
    if not isinstance(node, dict):
        return []
    if node.get("type") == "object" or "properties" in node:
        props = node.get("properties") or {}
        req = node.get("required") or []
        return [_row(name, sub, req) for name, sub in props.items()]
    if node.get("type") == "array":
        items = node.get("items")
        if isinstance(items, dict):
            items, _ = _merge_composition(items)
            if items.get("type") == "object" or "properties" in items:
                props = items.get("properties") or {}
                req = items.get("required") or []
                return [_row(name, sub, req) for name, sub in props.items()]
    return []


def schema_to_rows(resolved):
    """Top-level resolved object schema -> SchemaRow[] (one shared tree per payload).

    THE TOP-LEVEL NODE NEEDS THE COMPOSITION MERGE TOO, and for years it did not get it.
    `_children_rows` reads only `properties` (and `type: array`), so a node whose members
    arrive through `allOf` yields ZERO rows -- and that is not an edge case in the AsyncAPI
    contract, it is the norm: 48 of its 49 message payloads compose at the top level, and
    exactly one (`responseStatus`) declares `properties` directly. That one is the singleton
    this generator already emits, which is why the gap stayed invisible -- the only payload
    ever read was the only payload that did not need the merge.

    `_row` has always called `_merge_composition` on every node it descends into, so this
    restores symmetry rather than adding a special case: the top of the tree is now treated
    the same as every node below it. For a schema with no top-level composition keyword the
    merge is a no-op, so the singleton's output is unchanged byte for byte.
    """
    if isinstance(resolved, dict):
        resolved, _ = _merge_composition(resolved)
    return _children_rows(resolved)
