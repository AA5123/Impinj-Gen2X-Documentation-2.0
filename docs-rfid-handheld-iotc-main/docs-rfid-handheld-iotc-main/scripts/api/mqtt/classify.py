"""
classify.py — page-spine loading, routing-manifest loading, and the Phase-1
coverage gate.

config/spines.json IS the only definition of the page templates, and slots_for is
the only way to read one. The definition used to be a Python list here called
`GRID`, described as mirroring scripts/lint-sections.mjs "so generated pages pass
the section linter by construction" -- but THAT FILE DOES NOT EXIST, and neither
does scripts/lint-admonitions.mjs, which mdx.py cited for the callout budget.

THE TEMPLATES ARE NOW ENFORCED. Until 2026-09-08 they were enforced by nothing: a
page could drop a mandatory slot, reorder the grid or retitle a heading and every
gate stayed green, because nothing in the repository read a page's H2 sequence.
spine_findings below is the assertion, and cmd_check runs it as its sixth gate
over the generator's own expected set. It was installed while conformance was
25/25 -- born green, so nothing had to be grandfathered.

WHAT IT DOES NOT CHECK, on purpose: anything at H3 or below. See spine_findings.

THERE ARE NO TEMPLATE FILES, AND THERE NEVER HAVE BEEN. This docstring used to
say that `template_for()` was "retained for reference only: _templates/ holds
legacy hand-authoring exemplars that no code reads (see _templates/README.md)".
Every artifact in that sentence is fictional. `_templates/`,
`_templates/COMMAND_TEMPLATE.mdx`, `_templates/EVENT_TEMPLATE.mdx` and
`_templates/README.md` have never existed in this repository's history --
`git log --all --pretty=format: --name-only --diff-filter=A | grep _templates`
returns nothing. `template_for()` returned two of those paths and had zero
callers, so it was deleted on 2026-09-08 rather than left naming files a reader
would go looking for. This is the same defect as the two absent linters above,
which is why both corrections are in one paragraph now: A FUNCTION OR COMMENT
THAT NAMES A NONEXISTENT ARTIFACT MAKES THE SYSTEM LOOK MORE BUILT THAN IT IS.

The templates are config/spines.json and nothing else.
"""

from __future__ import annotations
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(_HERE, "config", "routing-manifest.json")
OPERATION_ORDER = os.path.join(_HERE, "config", "operation-order.json")

SPINES = os.path.join(_HERE, "config", "spines.json")

_KNOWN_SLOT_KEYS = {"auto", "anchor"}
_KNOWN_KIND_KEYS = {"slot", "required", "mech"}


def _load_spines():
    """Load and VALIDATE config/spines.json. Raises on anything unexpected.

    FAIL-CLOSED BY CONSTRUCTION, which is the point of the file. This replaced a
    Python `GRID` list plus a `slots_for` that filtered it with
    `if s["kind"] == "both" or s["kind"] == kind` -- an OPEN vocabulary that returned
    the 7 shared rows for ANY unrecognised string. Measured before the change:
    slots_for('telemetry'), (''), (None), ('COMMAND'), ('reference') and ('stub') each
    returned 7 slots and no error. A page built that way would carry headings and NO
    payload section at all, silently. A dict lookup raises instead, with no guard for a
    future maintainer to remember.

    There is deliberately NO os.path.exists check and NO .get(..., default) anywhere in
    this function: a missing or malformed spine file must stop the run, not shrink it."""
    with open(SPINES, encoding="utf-8") as fh:
        doc = json.load(fh)

    slots, kinds = doc.get("slots"), doc.get("kinds")
    if not isinstance(slots, dict) or not slots:
        raise ValueError(f"{SPINES}: `slots` must be a non-empty object")
    if not isinstance(kinds, dict) or not kinds:
        raise ValueError(f"{SPINES}: `kinds` must be a non-empty object")

    for label, meta in slots.items():
        if not isinstance(meta, dict):
            raise ValueError(f"{SPINES}: slot {label!r} must be an object")
        unknown = set(meta) - _KNOWN_SLOT_KEYS
        if unknown:
            raise ValueError(
                f"{SPINES}: slot {label!r} carries unknown key(s) {sorted(unknown)}. "
                f"Known keys are {sorted(_KNOWN_SLOT_KEYS)} -- a typo here would "
                "otherwise be silently ignored, which is how `anchor` could go inert.")

    out = {}
    for kind, rows in kinds.items():
        if not isinstance(rows, list) or not rows:
            raise ValueError(f"{SPINES}: kind {kind!r} must be a non-empty ordered list")
        spine = []
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValueError(f"{SPINES}: {kind}[{i}] must be an object")
            unknown = set(row) - _KNOWN_KIND_KEYS
            if unknown:
                raise ValueError(
                    f"{SPINES}: {kind}[{i}] carries unknown key(s) {sorted(unknown)}. "
                    f"Known keys are {sorted(_KNOWN_KIND_KEYS)}.")
            label = row.get("slot")
            if label not in slots:
                raise ValueError(
                    f"{SPINES}: {kind}[{i}] references slot {label!r}, which `slots` does "
                    "not declare. Every position must name a declared slot, so a rename "
                    "cannot leave a kind pointing at nothing.")
            if not isinstance(row.get("required"), bool):
                raise ValueError(
                    f"{SPINES}: {kind}[{i}] ({label!r}) must state `required` as a boolean. "
                    "It is MEASURED from the published pages, not defaulted -- see the "
                    "presence counts in the file's own $comment.")
            merged = dict(slots[label])          # auto, anchor
            merged["h2"] = label
            merged["required"] = row["required"]
            if row.get("mech"):
                merged["mech"] = True
            spine.append(merged)
        seen = [s["h2"] for s in spine]
        if len(seen) != len(set(seen)):
            raise ValueError(f"{SPINES}: kind {kind!r} repeats a slot: {seen}")
        out[kind] = spine
    return out


_SPINES = _load_spines()
KNOWN_KINDS = frozenset(_SPINES)


def slots_for(kind):
    """The ordered H2 spine for `kind`. KeyError on an unknown kind, by design.

    Each row is {h2, auto, required, anchor?, mech?}. See _load_spines for why this is a
    lookup and not a filter."""
    try:
        return _SPINES[kind]
    except KeyError:
        raise KeyError(
            f"unknown page kind {kind!r}. Known kinds are {sorted(KNOWN_KINDS)}, declared in "
            f"{SPINES}. Add the kind there -- with its own ordered spine -- rather than "
            "letting a page fall through to a partial one."
        ) from None


def h2_text(s):
    """The literal H2 line body a spine row publishes, pinned anchor included.

    The gate compares against this rather than against `h2` alone, so a heading and its
    anchor can only ever be asserted TOGETHER. Asserting either half on its own is what
    would let the `notes--caveats` slug drift away from its heading unnoticed."""
    return f"{s['h2']} {{#{s['anchor']}}}" if s.get("anchor") else s["h2"]


def spine_findings(kind, h2s):
    """Compare one page's ordered H2 list against `kind`'s spine. Returns findings[].

    A PURE FUNCTION over already-extracted headings: no filesystem, no page objects. That
    is what lets the self-test exercise it on hand-built heading lists as well as on all
    25 real pages, with no temp tree.

    THREE ASSERTIONS, and the first is deliberately weaker than equality:

      1. ORDERED SUBSEQUENCE, not equality. No command page carries all 13 slots --
         measured, 16 carry 11 and 4 carry 12 -- because Request Semantics (12/20),
         Response Semantics (9/20) and Lifecycle (3/20) are conditional on operation
         character. Requiring equality would fail 20 of 20 pages.
      2. Every `required: true` slot is present.
      3. No H2 outside the spine.

    IT ASSERTS H2 ONLY, AND DELIBERATELY ASSERTS NOTHING AT DEPTH 3 OR BELOW. That is not
    an omission, it is the safety margin. 6 of the 26 in-scope pages carry H3s, and
    install-certificate, set-os and reboot each use them to say something the 13-slot
    command spine has no position for. H3 is the escape valve that keeps this gate from
    making the documentation worse: a writer who needs a section the spine lacks can add
    one at depth 3 without touching the spine or the gate. DO NOT "tighten" this to H3.

    Anchors are compared as part of the heading text (see h2_text), never separately."""
    spine = slots_for(kind)
    expected = [h2_text(s) for s in spine]
    known = set(expected)
    findings = []

    off = [h for h in h2s if h not in known]
    for h in off:
        findings.append(
            f"H2 `## {h}` is not in the `{kind}` spine. If the section belongs on this page, "
            f"declare it in {os.path.relpath(SPINES)} at its position in the grid; if it does "
            "not, remove it from the authoring file."
        )

    present = [h for h in h2s if h in known]
    it = iter(expected)
    if not all(any(e == h for e in it) for h in present):
        findings.append(
            f"H2 order does not follow the `{kind}` spine. Published: {present}. "
            f"Spine order: {expected}."
        )

    for s in spine:
        if s["required"] and h2_text(s) not in h2s:
            want = h2_text(s)
            findings.append(
                f"mandatory slot `## {want}` is missing. It is required on every `{kind}` page."
                + (" The pinned anchor is part of the heading and must be written with it."
                   if s.get("anchor") else "")
            )
    return findings


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as fh:
        return json.load(fh)


def load_operation_order():
    """The published order of the MQTT API reference pages, as a list of doc ids
    ("mgmt/get-version"), projected from sidebars/api-mqtt.ts.

    Replaced config/tag_config.json on 2026-09-08. That file also carried
    `tag_groups` and an `operation_tags` map, and its `operation_order` was keyed by
    SUBCATEGORY -- a taxonomy that exists for the sidebar rail alone and that the
    AsyncAPI contract has no concept of. Only the flat order survives here."""
    with open(OPERATION_ORDER, encoding="utf-8") as fh:
        return json.load(fh).get("order", [])


def coverage_gate(op_names):
    """Phase-1 gate: every discovered (non-SKIP) op must be routed AND ordered.

    Two assertions, and they check different things:
      1. routing-manifest covers EXACTLY the discovered op set, both directions. An
         op with no manifest entry has no route, title or emoji; a manifest entry
         with no op is a page nothing emits.
      2. every routed page appears in the published order. The order file is allowed
         to carry MORE than the manifest because the published rail can contain
         hand-authored pages. Those extras are reported for visibility, never as a
         failure: the order file describes the rail, not just generated pages.

    Returns (ok, problems[])."""
    manifest = load_manifest()
    order = load_operation_order()
    ops = set(op_names)
    problems = []

    missing = ops - set(manifest)
    extra = set(manifest) - ops
    if missing:
        problems.append(f"routing-manifest missing ops: {sorted(missing)}")
    if extra:
        problems.append(f"routing-manifest has ops not in schema: {sorted(extra)}")

    ordered = set(order)
    unordered = sorted(
        "%s/%s" % (e.get("plane") or "", e["doc_id"])
        for op, e in manifest.items() if op in ops
        and "%s/%s" % (e.get("plane") or "", e["doc_id"]) not in ordered)
    if unordered:
        problems.append(
            "operation-order.json is missing routed page(s), so their published "
            f"position is undefined: {unordered}")
    return (not problems), problems
