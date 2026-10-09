#!/usr/bin/env python3
"""
generate_reference.py — schema-driven API-reference generator (entrypoint).

Modes:
  --generate [OP|all]   render api/mqtt/reference/<plane>/<doc-id>.mdx for op(s)
  --scaffold [OP|all]   RE-SEED api/mqtt/prose/<plane>/<doc-id>.mdx from that
                        op's CURRENT generated page (migration tool — it overwrites
                        the authoring file; it preserves the @authoring-guidance
                        header and strips the @generated banner, but any prose that
                        is not already in the generated page is lost)
  --check               coverage + op-count + page-vs-prose drift + singleton drift +
                        orphan scan + H2 SPINE (six gates, fail-closed). See the caveat.
  --selftest            exercise the spine machinery against the real config/spines.json
                        (14 cases). The ONLY verification of that file — see cmd_selftest.
  --out-dir DIR         write generated pages under DIR instead of api/mqtt/reference
                        (used to diff without clobbering)

Never hand-edit generated pages — edit the authoring file and regenerate.

TWO MODES, AND THE CAVEAT THAT MATTERS
  @slot  — the authoring file carries `<!-- @slot ... -->` markers. The page is
           assembled from api/mqtt/schema/ + config + the authored slots. Today exactly
           one page works this way: the response-codes singleton.
  CARRY  — no slot markers. build_page returns early and the page IS the authoring
           file's body verbatim under a generated frontmatter + banner. All 24
           operation pages are CARRY.

  For a CARRY page the generator NEVER READS api/mqtt/schema/. Its field tables are
  hand-typed prose, so --check's drift comparison is a tautology with respect to
  the schema: a field added, removed or retyped upstream moves nothing here, and
  regenerating will not propagate it either. Verified by mutating the schema five
  ways — --check exited 0 every time. Only the singleton genuinely drifts on a
  schema change. Keeping the 24 CARRY pages true to api/mqtt/schema/ is a MANUAL
  responsibility that no gate in this repo discharges. See generation.md.
"""

from __future__ import annotations
import argparse
import os
import re
import sys
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema as S
import classify
import mdx
import posthog_client


def _read_text(path):
    """Read a whole UTF-8 text file, closing the handle (CodeQL py/file-not-closed)."""
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _write_text(path, data):
    """Write a whole UTF-8 text file with LF endings, closing the handle
    (CodeQL py/file-not-closed).

    newline="\\n" pins the output byte-for-byte across platforms. Without it,
    Windows text mode rewrote every \\n as \\r\\n, so the same inputs produced
    different bytes on Windows and Linux. _read_text uses universal newlines, so
    --check's "byte-match" quietly normalised the difference and reported OK for
    two byte-different files. It also had a real consequence AT THE TIME: the
    then-existing scripts/lint-sections.mjs tested `lines[0] === '---'` after
    split('\\n'), which a CRLF page never satisfies, so its frontmatter rule
    silently skipped every locally generated page while still printing a pass.
    THAT SCRIPT NO LONGER EXISTS. The anecdote stays because the newline pinning
    below is still load-bearing, but do not read it as describing a live gate.
    A GENERATED PAGE'S H2s ARE NOW CHECKED, as of 2026-09-08 — cmd_check's sixth
    gate, over config/spines.json. Frontmatter still is not.

    Do NOT mirror newline="\\n" onto _read_text — that reader is shared with the
    hand-authored prose, where universal newlines are what keeps a CRLF-saved
    authoring file from carrying \\r into the emitted body.

    THE SCHEMA TREE IS UNWRITABLE FROM HERE, BY CONSTRUCTION. Every write in this
    generator goes through this one function, so the assertion below is total: it
    is not possible to add a new write path that reaches api/mqtt/schema/ without
    deleting this check. That tree holds the AsyncAPI contract, which is the
    statement of truth and the single source of truth, and it must never be
    modified by anything in this repository. Previously the guarantee rested on
    every call site happening to pass a DOCS_ROOT or PROSE_ROOT path -- true, but
    a property of the callers rather than of the writer."""
    resolved = os.path.abspath(path)
    schema_root = os.path.abspath(S.ROOT)
    if resolved == schema_root or resolved.startswith(schema_root + os.sep):
        raise SystemExit(
            "REFUSED: the generator tried to write inside the schema tree.\n"
            f"  target      : {resolved}\n"
            f"  schema root : {schema_root}\n"
            "api/mqtt/schema/ is read-only from this repository, and the AsyncAPI\n"
            "contract in it is the single source of truth. This is a bug in the\n"
            "caller, not a condition to override.")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(data)


PROSE_ROOT = os.path.join("api", "mqtt", "prose")
DOCS_ROOT = os.path.join("api", "mqtt", "reference")
# Non-op generated pages (surface-wide reference data that belongs to no single
# operation). Kept OUT of routing-manifest.json / discover_operations() so the
# hard 24-op coverage gate is never perturbed.
SINGLETONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "singletons.json")
SLOT_RE = re.compile(r"<!--\s*@slot\s+(.+?)\s*-->")
META_RE = re.compile(r"<!--\s*@meta\s+(.+?)\s*-->")
# The authoring-guidance header: stripped before emission by read_authoring, and
# PRESERVED across a --scaffold refresh by cmd_scaffold. One definition, used by
# both — a strip that no longer matched the preserve would silently drop the block.
GUIDANCE_RE = re.compile(
    r"\{/\*\s*@authoring-guidance.*?@end-authoring-guidance\s*\*/\}\n*", re.S)
# The generated banner, anchored to the head of a stripped page body. --scaffold
# reads a GENERATED page, whose body begins with this line; carrying it into the
# authoring file would put the "edit the authoring file, not this one" marker
# INSIDE the authoring file, and build_page would then prepend a second one.
# Matches BOTH the current banner ("scripts/api/mqtt") and the pre-2026-08-15 one
# ("scripts/apigen"), deliberately: narrowing it to the new form would stop a page written
# before the rename being recognised as generated, and build_page would then prepend a
# SECOND banner rather than replacing the first.
BANNER_HEAD_RE = re.compile(r"^\s*\{/\*\s*@generated by scripts/(?:apigen|api/mqtt).*?\*/\}\n*", re.S)


# --------------------------------------------------------------------------- #
# authoring-file (prose) read
# --------------------------------------------------------------------------- #
def authoring_path(entry):
    return os.path.join(PROSE_ROOT, entry["plane"], entry["doc_id"] + ".mdx")


def read_authoring(entry):
    path = authoring_path(entry)
    if not os.path.exists(path):
        return {"_meta": {}, "_slots": {}, "_carry": None}
    text = _read_text(path)
    # A migrated authoring file with no @slot markers is a verbatim CARRY of the
    # audited page body (imports + ESM + body) — emitted as-is under a generated
    # frontmatter, so no authored content is ever lost. New-op authoring files
    # use @slot markers and drive the schema-skeleton path instead.
    #
    # Mode is decided by an ACTUAL slot marker (a line that SLOT_RE matches), not
    # by the bare 7-character token appearing anywhere in the file. A prose
    # mention of the token — a pasted snippet, or the word in an authoring-guidance
    # header — used to flip a CARRY file to the slot path, where the slot parser
    # then found nothing and emitted a page of "_pending._" stubs: silent,
    # exit 0, and green on the next --check because the stub became the new
    # committed page. Same predicate as the parse loop below, so the mode test and
    # the parse can never disagree.
    if not any(SLOT_RE.match(line.strip()) for line in text.splitlines()):
        # Strip the authoring-guidance header (MANUAL-vs-schema guide) so it never
        # leaks into the generated page; the rest is the carried body.
        carry = GUIDANCE_RE.sub("", text, count=1)
        return {"_meta": {}, "_slots": {}, "_carry": carry}
    meta = {}
    mm = META_RE.search(text)
    if mm:
        for pair in mm.group(1).split("|"):
            if ":" in pair:
                k, v = pair.split(":", 1)
                meta[k.strip()] = v.strip()
    slots, cur, buf = {}, None, []
    for line in text.splitlines():
        m = SLOT_RE.match(line.strip())
        if m:
            if cur is not None:
                slots[cur] = "\n".join(buf).strip()
            cur, buf = m.group(1), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        slots[cur] = "\n".join(buf).strip()
    # Defence in depth: SLOT_RE selected this path, so the same regex must have
    # captured at least one slot. If it ever does not, the page would emit as
    # "_pending._" stubs — fail loudly instead of quietly publishing a husk.
    if not slots:
        sys.exit(f"AUTHORING: {path} took the @slot path but yielded no slots — "
                 "a slot marker must be a whole line of the form "
                 "'<!-- @slot <Section Name> -->'")
    return {"_meta": meta, "_slots": slots, "_carry": None}


# --------------------------------------------------------------------------- #
# schema payload -> (rows, examples)
# --------------------------------------------------------------------------- #
def payload(path, exdesc):
    raw = S.load_structured_file(path)
    title = raw.get("title", os.path.basename(path)[:-5])
    resolved = S.extract_schema(raw, path)
    resolved = S.strip_inline_response_code_tables(resolved)
    rows = S.schema_to_rows(resolved)
    examples = S.extract_examples(raw, title, exdesc)
    return rows, examples, title


def payload_ptr(pointer, exdesc):
    """payload(), but reading a SUBTREE of the AsyncAPI contract by JSON Pointer.

    The contract is one document, so there is no per-schema file to hand to
    payload(). extract_schema already accepts the `root` this needs -- its docstring
    anticipated exactly this case -- so a bare '#/...' $ref inside the subtree
    resolves against the whole contract rather than against the fragment.

    ACCEPTS A MESSAGE POINTER AS WELL AS A SCHEMA POINTER, because the two carry different
    halves of what a page needs. A message's `payload` carries the shape; its `examples[]`
    carries the NAMES, one per payload. A schema node has the shape and unnamed examples.
    Handed a message, this reads the shape from `payload` and the labelled examples from the
    message -- which is what makes example_description.json redundant rather than merely
    optional. Handed a schema, it behaves as before.

    A CHANNEL ENTRY IS ITSELF A BARE $ref. `#/channels/response/messages/getStatusResponse`
    resolves to `{"$ref": "#/components/messages/getStatusResponse"}`, so the 20 response
    pointers discover_operations() hands out need one more hop before anything is reachable.
    Following it here rather than at each call site is the difference between one place that
    knows and twenty that must remember.

    `exdesc` is optional and only reaches the unnamed schema-level path."""
    doc = S.load_asyncapi()
    # Callers spell pointers the way the contract's own $refs do, with the '#'
    # fragment marker. resolve_json_pointer implements RFC 6901, where a pointer is
    # the part AFTER the '#' and must start with '/', so strip it here rather than
    # making every call site remember the difference.
    raw = S.resolve_json_pointer(doc, pointer.lstrip("#"), label=pointer)
    if isinstance(raw, dict) and "$ref" in raw and "payload" not in raw:
        ref = raw["$ref"]
        raw = S.resolve_json_pointer(doc, ref.lstrip("#"), label=ref)
    if not isinstance(raw, dict):
        raise SystemExit(
            f"AsyncAPI: {pointer} does not resolve to a schema object "
            f"(got {type(raw).__name__}).")

    is_message = "payload" in raw
    shape = raw["payload"] if is_message else raw
    if not isinstance(shape, dict):
        raise SystemExit(
            f"AsyncAPI: {pointer} is a message whose payload is a "
            f"{type(shape).__name__}, not a schema object.")
    title = (raw.get("name") if is_message else None) or shape.get("title") \
        or raw.get("title") or pointer.rstrip("/").split("/")[-1]
    resolved = S.extract_schema(shape, S.ASYNCAPI, root=doc)
    rows = S.schema_to_rows(resolved)
    # From the MESSAGE when there is one: that is where the names live.
    examples = S.extract_examples(raw if is_message else shape, title, exdesc)
    return rows, examples, title


def synth_default_json(rows):
    """Build one default request/response JSON from per-field examples when the
    schema carries no top-level examples[] (getters)."""
    def val(r):
        if r.get("children"):
            return OrderedDict((c["field"], val(c)) for c in r["children"])
        ex = r.get("example")
        return ex if ex is not None else (r["field"])
    return OrderedDict((r["field"], val(r)) for r in rows)


# --------------------------------------------------------------------------- #
# page assembly
# --------------------------------------------------------------------------- #
_H2_LINE_RE = re.compile(r"^##\s+(.+?)\s*$")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")


def page_h2s(text):
    """The page's ordered H2 lines, fenced code blocks excluded.

    HAND-ROLLED AND FENCE-AWARE, DELIBERATELY, and this is the one place the house
    "parse, don't regex" rule is not followed. The obvious mdast pipeline for `.mdx`
    is remark-parse + remark-mdx, and REMARK-MDX THROWS ON 24 OF THE 26 IN-SCOPE
    PAGES: acorn cannot parse `{#notes--caveats}`, the pinned anchor this very gate
    exists to protect. Docusaurus only gets away with it by running
    escapeMarkdownHeadingIds() first. A JS gate would also have been this
    repository's first import of an undeclared transitive dependency — remark-parse,
    remark-frontmatter, unified and github-slugger are all present in node_modules
    but declared nowhere in package.json.

    So the check lives here, in Python, where the caller already knows every page it
    emits and its kind, and the spine data has exactly one reader in exactly one
    language. That removes the two-language single-source problem rather than
    solving it.

    The fence tracking is the part a bare `^## ` grep gets wrong: a `##` inside a
    fenced block is sample output, not a slot. Verified equivalent to an mdast
    depth-2 walk across all 25 pages."""
    out = []
    in_fence = False
    for line in text.splitlines():
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = _H2_LINE_RE.match(line)
        if m:
            out.append(m.group(1).strip())
    return out


# Per-kind labels for the payload slot and the Examples block title. A KEYED LOOKUP,
# not a `command`/else ternary, and that is the whole point. Until 2026-09-08 these were
# three separate ternaries — `if kind == "command" ... else "Event Payload"`, `else
# "Event"` — so ANY kind that was not "command" silently took the event branch. A third
# kind was not a failure, it was an event: dataEVT would have published `## Event Payload`
# and a JSON block titled "Event" under `type: telemetry`. The unreachable count gate in
# build_singleton_api_directory was documented as the tripwire for exactly this, and it
# cannot fire (see the note there), so nothing would have caught it.
#
# A missing kind raises here rather than defaulting, for the same reason slots_for does.
_KIND_LABELS = {
    "command":   {"payload": "Response Payload",  "example": "Request"},
    "event":     {"payload": "Event Payload",     "example": "Event"},
    "telemetry": {"payload": "Telemetry Payload", "example": "Telemetry"},
}


def kind_labels(kind):
    """The payload-slot label and Examples title for `kind`. Raises on an unknown kind."""
    try:
        return _KIND_LABELS[kind]
    except KeyError:
        raise KeyError(
            f"no payload/example labels for page kind {kind!r}. Known kinds are "
            f"{sorted(_KIND_LABELS)}. A kind declared in config/spines.json must also be "
            "given its labels here, or its payload section would be emitted under another "
            "kind's heading."
        ) from None


def _h2(s):
    """The `## Heading` line for one spine row, carrying its PINNED ANCHOR if it declares one.

    Added 2026-09-08. Before this, all seven heading-emit sites in the @slot path were a bare
    `body.append(f"## {h2}\\n")`, and `grep -rn '{#' scripts/api/mqtt/*.py` returned NOTHING:
    the generator had no way to emit an explicit heading id at all.

    THAT ABSENCE WAS THE REAL DEFECT BEHIND THE `Notes & Caveats` AMPERSAND, and the direction
    of the hazard is the opposite of what it looks like. `## Notes & Caveats` slugs to
    `notes--caveats` — the `&` drops and leaves a double dash — which is EXACTLY the anchor the
    24 CARRY pages pin by hand. So the ampersand form was harmless by arithmetic coincidence.
    The dangerous edit was the obvious repair: renaming the slot to `Notes and Caveats` with no
    way to pin an anchor slugs it to `notes-and-caveats` and silently breaks every inbound link,
    under `onBrokenAnchors: 'throw'`. Measured at the time: 17 link occurrences across 15 routed
    files. So the rename could not land until a producer existed, and this is that producer.

    ONE HELPER FOR ALL SEVEN SITES, DELIBERATELY. Pinning only the site that needed it today
    (the prose-only branch) would leave `anchor` silently inert on the other six, so a future
    spine row declaring one would be ignored with no error — a fresh instance of the fail-open
    class this whole series exists to close.

    An anchor is a COMPATIBILITY SHIM FOR A RENAME, never decoration. Declare one only where a
    slug is load-bearing, and change the heading text and the anchor in the SAME edit."""
    anchor = s.get("anchor")
    return f"## {s['h2']} {{#{anchor}}}\n" if anchor else f"## {s['h2']}\n"


# The reference banner as it is still written in the 24 CARRY authoring files under
# api/mqtt/prose/. Matched here so build_page can lift it into front matter; see the note in
# that function's carry branch. `rest` is everything after the type word, which is where the
# `**Label:** value` pairs live.
CARRY_BANNER_RE = re.compile(
    r"^> [^\n]*?\*\*(?:EXPLANATION|HOW-TO|REFERENCE|TUTORIAL)\*\*(?P<rest>[^\n]*)\n+", re.M)
CARRY_PAIR_RE = re.compile(r"\*\*([A-Z][A-Za-z ]*?):\*\*\s*(.+?)\s*(?=$|·)")


def build_page(entry, op_meta, exdesc, for_op):
    kind = op_meta["kind"]
    auth = read_authoring(entry)
    # Migrated (carry) op: generated frontmatter + @generated banner + the
    # audited body verbatim (edit the authoring file, not the generated page).
    if auth.get("_carry"):
        # M1, 2026-09-10 — THE CARRIED BODY'S REFERENCE BANNER IS LIFTED INTO FRONT MATTER.
        # A carry page has no `@meta` line to read an audience/use from (read_authoring returns
        # `_meta: {}` for this path by construction), so the one place those two facts exist is
        # the blockquote the author wrote at the top of the prose file. Rather than change what
        # 24 authoring files have to look like, the generator reads that line, emits it as
        # `doc_type` + `page_meta`, and drops it from the body — so the prose stays the source,
        # the generated page carries no blockquote, and <PageMeta> draws the line the way it
        # does on the other 186 routes. A carry file with no banner simply gets no meta keys.
        carry = auth["_carry"]
        page_meta = None
        bm = CARRY_BANNER_RE.search(carry)
        if bm:
            pairs = dict(CARRY_PAIR_RE.findall(bm.group("rest")))
            page_meta = mdx.page_meta_lines(
                pairs.get("Audience", "API consumer"), pairs.get("Use", ""))
            carry = CARRY_BANNER_RE.sub("", carry, count=1)
        fm = mdx.render_frontmatter(entry, kind, page_meta)
        banner = mdx.GENERATED.replace("{plane}", entry["plane"]).replace("{doc}", entry["doc_id"])
        return fm + "\n" + banner + "\n\n" + carry.lstrip("\n")
    slots = auth["_slots"]
    meta = auth["_meta"]

    # Commands and events both take their primary body from req_path (an event's
    # body IS its req_path file); only the response side differs by kind.
    req_rows, req_ex, _ = payload(op_meta["req_path"], exdesc)
    resp_rows = resp_ex = None
    # UNREACHABLE TODAY, and the `kind` test is the sound half of it. resp_path is None for
    # every operation since discovery moved to the contract (there are no per-op files to
    # point at), so this branch never runs and resp_rows stays None for all 24 pages —
    # which is why `--check` is green with it dead. Unlike the label ternaries above, this
    # one is NOT fail-open for a third kind: only a command has a reply, so False is the
    # right answer for `event` and `telemetry` rather than an accident. Left as-is because
    # restructuring dead code is how a live bug gets introduced; when the @slot path is
    # revived it should key on `op_meta["resp_ptr"]`, which is the contract-era field.
    if kind == "command" and op_meta["resp_path"] and os.path.exists(op_meta["resp_path"]):
        resp_rows, resp_ex, _ = payload(op_meta["resp_path"], exdesc)

    # single-variant vs multi
    req_json_default = list(req_ex.values())[0] if req_ex else synth_default_json(req_rows)
    n_req = max(1, len(req_ex))
    needs_variant = n_req > 1 or (resp_ex and len(resp_ex) > 1)

    esm = []
    esm.append(mdx.render_row_const("REQUEST_ROWS", req_rows))
    esm.append(mdx.render_json_const("REQUEST_JSON", req_json_default))
    if resp_rows is not None:
        resp_json_default = list(resp_ex.values())[0] if resp_ex else synth_default_json(resp_rows)
        esm.append(mdx.render_row_const("RESPONSE_ROWS", resp_rows))
        esm.append(mdx.render_json_const("RESPONSE_JSON", resp_json_default))

    body = []
    imports = mdx.render_imports(needs_variant, needs_jsonblock=True)

    def slot(name):
        return slots.get(name, "").strip()

    # M1's page-meta pair, into the FRONT MATTER — see mdx.PAGE_META for why it is no longer a
    # blockquote at the top of the body.
    audience = meta.get("audience", "API consumer")
    use = meta.get("use", "")
    fm = mdx.render_frontmatter(entry, kind, mdx.page_meta_lines(audience, use))

    # assemble slots in canonical order
    labels = kind_labels(kind)
    payload_label = labels["payload"]
    # Every kind's payload label, so a slot belonging to ANOTHER kind is skipped rather
    # than emitted. Per-kind spines make this near-unreachable now — each kind's list
    # carries only its own payload slot — but it is kept as the guard it always was.
    other_payloads = {v["payload"] for v in _KIND_LABELS.values()}
    for s in classify.slots_for(kind):
        h2 = s["h2"]
        if h2 in other_payloads and h2 != payload_label:
            continue
        prose = slot(h2)
        if h2 == "Request Payload":
            body.append(_h2(s))
            if prose:
                body.append(prose + "\n")
            body.append("<ApiBody rows={REQUEST_ROWS} json={REQUEST_JSON} title=\"Request payload\" />")
        elif h2 == "Response Payload" and resp_rows is not None:
            body.append(_h2(s))
            if prose:
                body.append(prose + "\n")
            body.append("<ApiBody rows={RESPONSE_ROWS} json={RESPONSE_JSON} title=\"Response payload\" />")
        elif h2 == payload_label and h2 != "Response Payload" and req_rows:
            # An event has no response side, so resp_rows is always None for one.
            # This branch previously shared the command's `resp_rows is not None`
            # guard, which no event can satisfy — so an event's payload section was
            # dropped entirely, silently. The event body lives in REQUEST_ROWS
            # (loaded from req_path above), which is what it must render.
            body.append(_h2(s))
            if prose:
                body.append(prose + "\n")
            body.append(f"<ApiBody rows={{REQUEST_ROWS}} json={{REQUEST_JSON}} title=\"{h2.capitalize()}\" />")
        elif h2 == "Response Codes":
            body.append(_h2(s))
            if prose:
                body.append(prose + "\n")
            body.append(mdx.render_response_codes(for_op(op_meta["op"])))
        elif h2 == "Topic Mapping":
            body.append(_h2(s))
            tbl = mdx.render_topic_table(entry.get("topics") or [])
            if tbl:
                # Manifest is the single source for the table; any prose is
                # trailing commentary ONLY — never a second, hand-authored table
                # (that was the latent double-emit).
                body.append(tbl)
                if prose:
                    body.append("\n" + prose)
            else:
                # No manifest rows: the op authors the whole section in prose
                # (the 24 CARRY pages take the early-return path and never reach here;
                #  this covers a future @slot op that has not populated topics[]).
                body.append(_require_slot(prose, "Topic Mapping", authoring_path(entry)))
        elif h2 == "Examples":
            body.append(_h2(s))
            if prose:
                body.append(prose + "\n")
            # REQUEST_JSON holds the event body on an event page, so label it by
            # kind rather than calling an event payload a "Request".
            ex_title = labels["example"]
            body.append(f"<JsonBlock title=\"{ex_title}\" data={{REQUEST_JSON}} />")
        else:
            # prose-only slots (Overview, Details, When to Use, Key Fields,
            # *Semantics, Lifecycle, Notes and Caveats). Emit only if authored
            # (optional mechanism slots gate out when empty).
            if not prose:
                if s.get("mech"):
                    continue  # optional mechanism slots (Semantics/Lifecycle) omit when empty
                # A MANDATORY slot with no prose used to emit `_<Heading> pending._`.
                # That is the broadest placeholder in the generator -- it synthesised
                # one for ANY unauthored required slot, on every @slot page, and it
                # published: into the HTML, the PDF and the search index, looking
                # deliberate enough that no gate and no reviewer flagged it. An
                # unauthored mandatory section is a build failure, not a page.
                prose = _require_slot(prose, h2, authoring_path(entry))
            body.append(_h2(s))
            body.append(prose)

    related = slot("Related") or "**Related:**"
    gen = mdx.GENERATED.replace("{plane}", entry["plane"]).replace("{doc}", entry["doc_id"])
    parts = [fm, gen, "", imports, "", "\n\n".join(esm), "",
             "\n\n".join(body), "", related, ""]
    return "\n".join(parts).rstrip() + "\n"


# --------------------------------------------------------------------------- #
# singletons — non-op generated pages, built from their OWN data dependencies
# --------------------------------------------------------------------------- #
def _yaml_q(v):
    """Double-quote a frontmatter scalar. Unquoted, a title or description holding
    a YAML indicator (`:`, a leading `#`, `&`) breaks the page — see the note in
    mdx.render_frontmatter."""
    return '"' + str(v).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _require_slot(value, slot_name, prose_path):
    """Return an authored slot body, or REFUSE to emit the page.

    Mandatory slots used to fall back to a placeholder literal -- "_Pending._",
    "_Overview pending._", "_Topic mapping pending._". Those strings PUBLISH: they
    reach the built HTML, the PDF and the search index, and they look deliberate
    enough that nothing flags them. That is the same defect class as the 37
    placeholder pages in this tree, except invisible, because a reader cannot tell
    an intentional "not yet documented" note from a slot the author never filled.

    An unauthored mandatory section is a build failure, not a page. The message
    names the exact file and slot to fix, because the person who hits this is
    editing prose, not reading Python."""
    body = (value or "").strip()
    if body:
        return body
    raise SystemExit(
        "REFUSED: mandatory slot is empty, so the page would publish a placeholder.\n"
        f"  slot        : {slot_name}\n"
        f"  authored in : {prose_path}\n"
        "Write the section, or remove the slot from the page's grid. The generator\n"
        "will not emit an unauthored mandatory section.")


def _code_range_label(codes):
    """"0-36 and 101" from a closed code set: the contiguous run, then the outliers.

    Derived, never typed. Two places need this label and both went stale when it was
    a literal: singletons.json advertised "0-33 and 101" in the page description
    while the catalog carried 38 codes, and the envelope table advertised an open
    "0-101" range that the closed enum exists to retire."""
    codes = sorted(codes)
    run = [c for c in codes if c == 0 or c - 1 in codes]
    rest = [c for c in codes if c not in run]
    label = "%d-%d" % (min(run), max(run)) if run else ""
    if rest:
        label = (label + " and " if label else "") + ", ".join(str(c) for c in rest)
    return label


def _singleton_frontmatter(entry, page_meta=None):
    """Frontmatter for a singleton page. Shared by every singleton builder so the
    non-op pages cannot drift into two different frontmatter shapes; `type` is
    fixed to `reference` because a singleton documents no single operation and so
    has no command/event kind to inherit.

    `{code_range}` in a singleton's description is SUBSTITUTED from the contract.
    It used to be a hand-typed literal, and it went stale invisibly: the string
    said "codes 0-33 and 101" while the page's own catalog carried 38 codes, and
    because a description ships as <meta name=description> and
    <meta property=og:description> the wrong number was what search engines and
    link previews saw. A page whose body and whose metadata disagree about the
    same fact is worse than either being wrong alone. Templating it makes that
    class of staleness structurally impossible rather than fixed once."""
    title = entry["title"]
    desc = entry.get("description") or ""
    if "{code_range}" in desc:
        desc = desc.replace("{code_range}",
                            _code_range_label(S.load_status_codes()[1]))
    # The RESOLVED description, so the card cannot print a {code_range} placeholder.
    _card = mdx.card_summary(entry, desc)
    return "\n".join([
        "---",
        f"id: {entry['doc_id']}",
        f"title: {_yaml_q(title)}",
        f"sidebar_label: {_yaml_q(entry.get('sidebar_label') or title)}",
        f"description: {_yaml_q(desc)}",
        "sidebar_custom_props: { emoji: " + _yaml_q(entry.get("emoji", ""))
            + (", card: " + _yaml_q(_card) if _card else "")
            + " }",
        "type: reference",
        *([page_meta] if page_meta else []),
        "---",
    ])


def _singleton_generated_banner(entry):
    """The @generated banner for a flat singleton (plane == ""), whose authoring
    file sits at api/mqtt/prose/<doc-id>.mdx — hence the `prose//` collapse."""
    return (mdx.GENERATED.replace("{plane}", entry["plane"]).replace("{doc}", entry["doc_id"])
            .replace("prose//", "prose/"))


def _response_object_pointer():
    """Where the contract declares the `response` object every reply carries.

    The contract as first published had one shared definition, `responseStatus`. The
    2026-09-21 rebuild writes each reply payload out in full from the API definition,
    so the object sits at `<reply>/properties/response` in every reply schema instead.
    All copies come from the same source file (refrence/response/response.yaml), and
    that is asserted rather than assumed: the first copy is used only if every reply
    that carries a `response` carries an identical one. The object's own top-level
    `description` is left out of the comparison -- `get_current_region` overrides it
    with a $ref sibling in the API definition -- because the page renders the object's
    members, never that sentence."""
    doc = S.load_asyncapi()
    schemas = (doc.get("components") or {}).get("schemas") or {}
    if "responseStatus" in schemas:
        return "#/components/schemas/responseStatus"
    copies = OrderedDict()
    for o in S.discover_operations():
        if o["kind"] != "command" or not o.get("resp_ptr"):
            continue
        entry = S.resolve_json_pointer(doc, o["resp_ptr"].lstrip("#"), label=o["resp_ptr"])
        msg = S.resolve_json_pointer(doc, entry["$ref"].lstrip("#"), label=entry["$ref"]) \
            if "$ref" in entry and "payload" not in entry else entry
        name = ((msg.get("payload") or {}).get("$ref") or "").split("/")[-1]
        node = ((schemas.get(name) or {}).get("properties") or {}).get("response")
        if isinstance(node, dict):
            copies["#/components/schemas/%s/properties/response" % name] = node
    if not copies:
        raise SystemExit("AsyncAPI: no reply schema carries a `response` object.")
    def members(n):
        return OrderedDict((k, v) for k, v in n.items() if k != "description")
    first = members(next(iter(copies.values())))
    differ = [p for p, n in copies.items() if members(n) != first]
    if differ:
        raise SystemExit("AsyncAPI: the reply `response` objects are not identical: %s" % differ)
    return next(iter(copies))


def build_singleton_response_codes(entry):
    """Generate api/mqtt/reference/response-codes.mdx from its two data dependencies:
      DIRECT   — api/mqtt/schema/refrence/response/response.yaml (code SET + 0..101
                 bounds + each code's canonical Meaning), and
      INDIRECT — api/mqtt/schema/response_codes.json (iot_status_code, cause,
                 recommended_action, commands[]).
    Command links use the routing manifest; code anchors are stable numeric ids."""
    # SOURCED FROM THE AsyncAPI CONTRACT, not the legacy pair.
    #
    # Until 2026-09-08 this read the code SET and each Meaning from
    # refrence/response/response.yaml and the rest from response_codes.json, and
    # asserted both against a THIRD copy hardcoded here as
    # `set(range(0, 34)) | {101}`. Three copies of one fact is two too many, and
    # they had drifted: response.yaml and the literal carried 35 codes while
    # response_codes.json had grown to 38, so `gen:check` exited 1 at this line
    # and — because it is step 5 of ~20 in a single CI job with no
    # continue-on-error — typecheck, the build, section-rendering and the PDF
    # step never ran at all.
    #
    # The AsyncAPI document ends that class of failure rather than realigning it:
    # its `statusCode.enum` IS the closed set, so the only assertion left is
    # internal to one document (see S.load_status_codes), and there is no third
    # copy to drift. It also carries what the legacy pair could not — `retryable`,
    # `terminal`, `reachable`, `universal` and a stated derivation rule — and it
    # corrects two defects in the catalogue: `get_installed_certificate`
    # (singular; no such command) and codes 6/7 scoped to the withdrawn
    # `cloud_connect`.
    rows, _closed = S.load_status_codes()
    command_links = {
        op: f"/api-reference/mqtt/{meta['plane']}/{meta['doc_id']}"
        for op, meta in classify.load_manifest().items()
    }

    kind_of = {0: "Success", 1: "Accepted (async)", 101: "Catch-all"}
    catalog = []
    for r in sorted(rows, key=lambda x: (x.get("code") == 101, x.get("code"))):
        # `universal: true` is the document's normalisation of the legacy `["*"]`
        # wildcard; render_code_catalog still speaks the wildcard, so convert back.
        applies = ["*"] if r.get("universal") else list(r.get("commands") or [])
        catalog.append({
            "code": r.get("code"),
            "kind": kind_of.get(r.get("code"), "Error"),
            "meaning": (r.get("description") or "").strip(),
            "iot": (r.get("constant") or "").strip(),
            "cause": (r.get("cause") or "").strip(),
            "action": (r.get("recommendedAction") or "").strip(),
            "applies": applies,
        })

    # By-command matrix — command ops only (events carry no response.code).
    #
    # The ‡ OVERLAY IS RETIRED, and the guard that used to stand here is what told
    # us so. mdx.EXAMPLE_SOURCED_CODES asserted "response_codes.json does not list
    # code 1 for reboot", which was true of the old catalogue and is false now: the
    # AsyncAPI scopes code 1 to set_os, reboot AND install_certificate. The guard
    # fired correctly, and the honest response is to delete the overlay rather than
    # to keep marking a code the statement of truth now carries.
    universal = sorted(r["code"] for r in rows if r.get("universal"))
    scoped = {}
    for r in rows:
        if r.get("universal"):
            continue
        for cmd in (r.get("commands") or []):
            scoped.setdefault(cmd, set()).add(r["code"])
    cmd_ops = [o["op"] for o in S.discover_operations() if o["kind"] == "command"]

    matrix = []
    for op in cmd_ops:
        codes = sorted(set(universal) | scoped.get(op, set()),
                       key=lambda c: (c == 101, c))
        matrix.append((op, codes))

    # Response-object shape (code, description), FROM THE CONTRACT.
    # This used to read the legacy response envelope by file path -- the SECOND reader
    # of that file, and the one a deletion plan misses, because the first (the code
    # table) is the obvious one. That is the whole reason this note exists: the risky
    # reader of a doomed file is the unobvious one. responseStatus is the contract's
    # own envelope for the same two fields and is stricter -- it declares
    # required ["description"] with an if/then that adds `code`, which the file it
    # replaced could not express. The constant that named that file is gone as of
    # 2026-09-08, so it is described here rather than named.
    ro_rows, _, _ = payload_ptr(_response_object_pointer(), None)
    # COMPACT the code enum for THIS table only. responseStatus.code resolves to the
    # closed 38-value enum, and rendering all 38 in one cell -- immediately above the
    # catalog that lists every one of them with its meaning, cause and recommended
    # action -- is duplication, not information. The contract's own description for
    # this member says "See `statusCode` for the full generated catalogue", so the
    # label points there. The value is derived from the enum, so it cannot go stale
    # the way the hand-typed "0-101" it replaces did.
    for _r in ro_rows:
        if _r.get("field") == "code" and isinstance(_r.get("enumUnits"), list):
            _r["enumUnits"] = _code_range_label(_r["enumUnits"])
    ro_json = OrderedDict([("code", 0), ("description", "Success")])

    auth = read_authoring(entry)
    slots, meta = auth["_slots"], auth["_meta"]

    def slot(name, fallback="", required=False):
        """`required=True` refuses to emit rather than publishing a placeholder.
        See _require_slot for why a placeholder literal is worse than a failure."""
        body = (slots.get(name) or "").strip()
        if required:
            return _require_slot(body, name, authoring_path(entry))
        return body or fallback

    gen = _singleton_generated_banner(entry)
    imports = ("import ApiBody from '@site/src/components/ApiBody';\n"
               "import Link from '@docusaurus/Link';\n"
               "import ResponseCodeRow from '@site/src/components/ResponseCodeRow';")
    esm = "\n\n".join([
        mdx.render_row_const("RESPONSE_OBJECT_ROWS", ro_rows),
        mdx.render_json_const("RESPONSE_OBJECT_JSON", ro_json),
    ])
    fm = _singleton_frontmatter(entry, mdx.page_meta_lines(
        meta.get("audience", "MQTT API integrators"),
        meta.get("use", "look up any command response.code")))

    def wrap(tbl):
        return '<div className="response-code-catalog">\n\n' + tbl + '\n\n</div>'

    cat_intro = slot("Response Code Catalog")
    mat_intro = slot("Codes by Command")
    body = [
        "## Overview\n\n" + slot("Overview", required=True),
        '## The Response Object\n\n'
        '<ApiBody rows={RESPONSE_OBJECT_ROWS} json={RESPONSE_OBJECT_JSON} title="Response object" />',
        "## How to Read a Code\n\n" + slot("How to Read a Code", required=True),
        "## Response Code Catalog\n\n" + (cat_intro + "\n\n" if cat_intro else "")
        + wrap(mdx.render_code_catalog(catalog, command_links)),
        "## Codes by Command\n\n" + (mat_intro + "\n\n" if mat_intro else "")
        + wrap(mdx.render_codes_by_command(matrix, command_links)),
        # The pinned anchor holds the pre-rename slug, exactly as the spines.json slot does for
        # the 24 operation pages. This singleton hardcodes its own headings rather than
        # walking the spine, so it does not go through _h2() and needs the pin inline.
        # The heading text and the slot() key are the SAME STRING and must move together
        # with the marker at api/mqtt/prose/response-codes.mdx:50 — changing the key
        # alone raises SystemExit from _require_slot.
        "## Notes and Caveats {#notes--caveats}\n\n" + slot("Notes and Caveats", required=True),
    ]
    parts = [fm, gen, "", imports, "", esm, "", "\n\n".join(body), ""]
    return "\n".join(parts).rstrip() + "\n"


# plane -> (H2 heading, default section intro). Also the ORDER the sections appear
# in on the API Directory page. A manifest plane that is missing from this map is a
# hard error, never a skipped row: the directory's whole claim is that it lists
# every operation, and grouping by a fixed list would drop the new plane's rows
# silently — the exact drift the page was generated to prevent.
# The intros restate the plane's scope only; every operation-specific fact on the
# page comes from that operation's manifest entry.
DIRECTORY_PLANES = OrderedDict([
    ("mgmt", ("Management",
              "Device identity, network setup, MQTT endpoints, certificates, system "
              "operations, and event reporting, over the management endpoint.")),
    ("ctrl", ("Control",
              "The RFID radio: operating mode, tag filtering, and inventory start/stop, "
              "over the control (CTRL) endpoint.")),
    ("events", ("Events",
                "The reader's asynchronous management-event surface. The command that "
                "configures it, `config_events`, is a management command and is listed "
                "under [Management](#management).")),
    ("data", ("Data",
              "Tag-read events emitted during an active inventory, on the DATA endpoint.")),
])

DIRECTORY_RELATED = (
    "**Related:** 📕 [Response Codes](/api-reference/mqtt/response-codes) · "
    "📕 [Topic Structure](/api-reference/mqtt/protocol-reference/topic-structure) · "
    "📕 [Correlation and Request/Response Pairing](/api-reference/mqtt/protocol-reference/message-envelope#correlation-and-request-response-pairing)")


def _directory_summary(op, description):
    """One directory row's Description cell, from that op's manifest description.

    Every routing-manifest description opens with the SEO lead-in
    "MQTT reference for <op>:" (events: "MQTT reference for the <op> event:").
    That belongs in a <meta> description and is pure noise repeated down 24 table
    rows, so it is dropped here and the remainder is sentence-cased. The pattern is
    built per-op, so it can only ever match that op's own name; a description
    written in any other shape is used verbatim rather than being mangled."""
    lead = re.compile(r"^MQTT reference for (?:the )?" + re.escape(op) + r"(?: event)?:\s*")
    m = lead.match(description)
    if not m:
        return description
    text = description[m.end():]
    return text[0].upper() + text[1:] if text[:1].islower() else text


def _gfm_cell(v):
    """Escape a value for a GFM table cell: collapse newlines, escape pipes."""
    return str(v).replace("\r", " ").replace("\n", " ").replace("|", "\\|").strip()


def build_singleton_api_directory(entry):
    """Generate api/mqtt/reference/index.mdx — the MQTT API landing page, which is the
    index of every operation (017 rule 9 makes the landing page the directory),
    one row per op, from a single data dependency:
      DIRECT — scripts/api/mqtt/config/routing-manifest.json (plane, doc_id, title,
               description), the SAME entries cmd_generate routes the 24 operation
               pages from. A row's link is built from the entry that emits the page
               it points at, so a doc_id rename moves both together and the table
               cannot rot into a broken link.
    Parity with the schema is not re-checked here: classify.coverage_gate() has
    already asserted routing-manifest ⇔ tag_config ⇔ discovered ops in every path
    that reaches a builder (cmd_generate, and cmd_check's singleton loop, which runs
    only when the gate is clean). This page therefore lists exactly the documented
    24-op surface, by construction. Op KINDS come from api/mqtt/schema/ via
    discover_operations() so the command/event split in the Overview is counted, not
    asserted."""
    manifest = classify.load_manifest()
    kind_of = {o["op"]: o["kind"] for o in S.discover_operations()}

    groups = OrderedDict((plane, []) for plane in DIRECTORY_PLANES)
    for op in sorted(manifest, key=str.lower):
        route = manifest[op]
        plane, doc_id = route.get("plane") or "", route.get("doc_id") or ""
        description = (route.get("description") or "").strip()
        if plane not in groups:
            sys.exit(f"SINGLETON api-directory: op {op!r} has plane {plane!r}, which has no "
                     "section in DIRECTORY_PLANES — add the plane (heading + intro) there, "
                     "or its rows would be dropped from the directory.")
        if not doc_id or not description:
            sys.exit(f"SINGLETON api-directory: routing-manifest entry {op!r} is missing "
                     "doc_id or description — both are required to emit its row.")
        groups[plane].append((op, f"/api-reference/mqtt/{plane}/{doc_id}",
                              _directory_summary(op, description)))

    total = sum(len(rows) for rows in groups.values())
    # THIS WHOLE BUILDER IS UNREACHABLE, AND THE GATE BELOW HAS NEVER RUN. SINGLETON_BUILDERS
    # registers it under the key `index`, which config/singletons.json does not name (it holds
    # only `response-codes`), and both cmd_generate and cmd_check iterate load_singletons()
    # rather than SINGLETON_BUILDERS. So nothing calls this function.
    #
    # It is fixed here anyway, because it was WRONG in two ways and had been cited as the
    # tripwire that would catch a third page kind — which it could not, being unreachable:
    #
    #   1. THE ARITHMETIC ASSUMED TWO KINDS. It summed command + event and compared against
    #      the table total, so the moment the contract's third kind (`telemetry`, on dataEVT)
    #      was honoured, 20 + 3 != 24 and this would have exited on a CORRECT tree. Now it
    #      counts every known kind, so a new kind in config/spines.json is picked up rather
    #      than becoming a false failure.
    #   2. THE DIAGNOSTIC PRINTED AN EMPTY LIST. Its predicate was `op not in kind_of` —
    #      membership — while the failure it reports is a kind that is present but not one of
    #      the two it counted. Every op IS in kind_of, so the message named nothing. It now
    #      reports the actual per-kind tally and the ops whose kind went uncounted.
    per_kind = {}
    for op in manifest:
        k = kind_of.get(op)
        per_kind[k] = per_kind.get(k, 0) + 1
    counted = sum(n for k, n in per_kind.items() if k in classify.KNOWN_KINDS)
    if counted != total:
        stray = sorted(op for op in manifest if kind_of.get(op) not in classify.KNOWN_KINDS)
        sys.exit("SINGLETON api-directory: the per-kind tally does not add up to the table. "
                 f"table rows={total}, counted={counted}, tally={per_kind}, "
                 f"known kinds={sorted(classify.KNOWN_KINDS)}. Uncounted op(s): {stray or 'none'} "
                 "— the Overview's counts would disagree with the rows beneath them.")
    n_cmd = per_kind.get("command", 0)
    n_evt = per_kind.get("event", 0)
    n_tel = per_kind.get("telemetry", 0)

    auth = read_authoring(entry)
    slots, meta = auth["_slots"], auth["_meta"]

    def slot(name, fallback=""):
        return (slots.get(name) or "").strip() or fallback

    gen = _singleton_generated_banner(entry)
    fm = _singleton_frontmatter(entry, mdx.page_meta_lines(
        meta.get("audience", "MQTT API integrators"),
        meta.get("use", "find the reference page for any command or event")))

    overview = (
        f"Every operation the IOTC MQTT interface exposes, in one place: {n_cmd} commands, "
        f"{n_evt} events and {n_tel} telemetry stream"
        f"{'' if n_tel == 1 else 's'}, grouped by the endpoint plane that carries them. Each row "
        "links to that operation's reference page.\n\n"
        "This directory is generated from `scripts/api/mqtt/config/routing-manifest.json` — "
        "the same routing table that emits the operation pages — so it lists exactly the "
        "operations this reference documents and cannot fall out of step with them.")

    body = ["## Overview\n\n" + slot("Overview", overview)]
    for plane, (heading, intro) in DIRECTORY_PLANES.items():
        rows = groups[plane]
        if not rows:
            sys.exit(f"SINGLETON api-directory: plane {plane!r} has a section in "
                     "DIRECTORY_PLANES but no operation in routing-manifest — remove the "
                     "section or the page emits an empty table.")
        table = ["| Operation | Description |", "| --- | --- |"]
        table += [f"| [`{_gfm_cell(op)}`]({url}) | {_gfm_cell(desc)} |" for op, url, desc in rows]
        body.append(f"## {heading}\n\n" + slot(heading, intro) + "\n\n" + "\n".join(table))

    related = slot("Related", DIRECTORY_RELATED)
    parts = [fm, gen, "", "\n\n".join(body), "", related, ""]
    return "\n".join(parts).rstrip() + "\n"


# The builder for the operation directory is KEPT but is no longer wired to a singleton
# entry. .ai-history/019-ia-spec-final.md has no directory node, and
# .ai-history/020-documentation-url-architecture.md gives /api-reference/mqtt/ to the
# Overview page, so emitting the directory there would have two pages claiming one URL —
# and the next `npm run gen:reference` would silently overwrite the Overview. Restoring it
# is one line in config/singletons.json plus a node in the IA; the code below is intact.
SINGLETON_BUILDERS = {
    "response-codes": build_singleton_response_codes,
    "index": build_singleton_api_directory,
}


def load_singletons():
    if not os.path.exists(SINGLETONS):
        return OrderedDict()
    return S.load_structured_file(SINGLETONS)


# --------------------------------------------------------------------------- #
# modes
# --------------------------------------------------------------------------- #
def _load_common():
    """The three inputs every mode needs. `exdesc` is None on purpose.

    It used to load example_description.json, a title -> {label: text} map that supplied
    the display labels for a payload's examples[] POSITIONALLY. The contract carries
    better ones: all 195 of its message examples name themselves, beside the payload they
    describe, so a label cannot slide onto the wrong body. extract_examples reads that
    shape and takes `example_data=None` for it; the parameter is kept, and still threaded
    to payload()/payload_ptr(), because a bare schema-level examples[] has no names of its
    own and a future caller may legitimately want to supply some.

    Passing None rather than {} is the honest signal: there is no overlay, as against an
    overlay that happens to be empty.
    """
    ops = S.discover_operations()
    manifest = classify.load_manifest()
    exdesc = None
    for_op = S.contract_response_codes()
    return ops, manifest, exdesc, for_op


def cmd_generate(target, out_dir):
    ops, manifest, exdesc, for_op = _load_common()
    ok, problems = classify.coverage_gate([o["op"] for o in ops])
    if not ok:
        sys.exit("COVERAGE GATE FAILED:\n  " + "\n  ".join(problems))
    singles = load_singletons()
    sel = [o for o in ops if target in ("all", o["op"])]
    sel_singles = [sid for sid in singles if target in ("all", sid)]
    if not sel and not sel_singles:
        sys.exit(f"unknown op: {target}")
    root = out_dir or DOCS_ROOT
    pages_count = 0
    for o in sel:
        entry = dict(manifest[o["op"]])
        page = build_page(entry, o, exdesc, for_op)
        dest = os.path.join(root, entry["plane"], entry["doc_id"] + ".mdx")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        _write_text(dest, page)
        # getsize, not len(page): len counts characters of a str, and the file is
        # UTF-8 — a count standing in for the fact it is labelled with.
        print(f"generated {dest} ({os.path.getsize(dest)} bytes, kind={o['kind']})")
        pages_count += 1
    singleton_count = 0
    for sid in sel_singles:
        entry = dict(singles[sid]); entry.setdefault("doc_id", sid)
        builder = SINGLETON_BUILDERS.get(sid)
        if not builder:
            sys.exit(f"no builder registered for singleton: {sid}")
        page = builder(entry)
        dest = os.path.join(root, entry["plane"], entry["doc_id"] + ".mdx")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        _write_text(dest, page)
        print(f"generated {dest} ({os.path.getsize(dest)} bytes, singleton)")
        singleton_count += 1
    posthog_client.capture("reference_generated", {
        "target": target,
        "pages_count": pages_count,
        "singleton_count": singleton_count,
    })


def cmd_scaffold(target):
    ops, manifest, _, _ = _load_common()
    # Same gate cmd_generate/cmd_check run before indexing manifest[op]. Without
    # it an op present in api-schema but absent from routing-manifest raised a bare
    # KeyError partway through the loop — after the files before it had already
    # been overwritten.
    ok, problems = classify.coverage_gate([o["op"] for o in ops])
    if not ok:
        sys.exit("COVERAGE GATE FAILED:\n  " + "\n  ".join(problems))
    sel = [o for o in ops if target in ("all", o["op"])]
    if not sel:
        sys.exit(f"unknown op: {target}")
    files_count = 0
    for o in sel:
        entry = manifest[o["op"]]
        src = os.path.join(DOCS_ROOT, entry["plane"], entry["doc_id"] + ".mdx")
        dest = authoring_path(entry)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if not os.path.exists(src):
            print(f"  no current page for {o['op']} — skip (new op uses schema skeleton)")
            continue
        text = _read_text(src)
        m = re.match(r"^---\n.*?\n---\n", text, re.S)
        body = text[m.end():] if m else text     # strip frontmatter; carry the rest verbatim
        # Drop the generated banner so it cannot accumulate one per round trip.
        body = BANNER_HEAD_RE.sub("", body, count=1)
        # Preserve the existing @authoring-guidance header verbatim. It is stripped
        # before emission, so it is absent from the page being scaffolded FROM and
        # would otherwise be lost on every refresh. The 24 blocks are bespoke
        # per-op section lists — re-emitting a generic one would silently replace
        # them with wrong content, invisibly, because the block never reaches a
        # generated page for a gate to compare.
        if os.path.exists(dest):
            keep = GUIDANCE_RE.match(_read_text(dest))
            if keep:
                body = keep.group(0) + body.lstrip("\n")
        _write_text(dest, body)
        print(f"scaffolded (carry) {dest} ({os.path.getsize(dest)} bytes)")
        files_count += 1
    posthog_client.capture("reference_scaffolded", {
        "target": target,
        "files_count": files_count,
    })


def cmd_check():
    ops, manifest, exdesc, for_op = _load_common()
    # Record which schema tree was actually validated: schema.ROOT is redirectable
    # via API_SCHEMA_DIR, and nothing in CI pins it, so the log should say.
    print(f"schema root: {os.path.abspath(S.ROOT)}")
    ok, problems = classify.coverage_gate([o["op"] for o in ops])
    print("coverage gate:", "OK" if ok else "FAIL")
    for p in problems:
        print("  " + p)
    # Its own labelled line: this is not a coverage-gate result, and reporting it
    # under that heading misattributed the failure.
    if len(ops) != 24:
        print(f"op-count gate: FAIL — {len(ops)} != 24")
        ok = False
    else:
        print("op-count gate: OK")
    # Fail-closed drift check: every committed page must byte-match its regenerated
    # form. Catches hand-edits to generated pages (edit the authoring file instead).
    #
    # NOTE — what this does NOT catch: for a CARRY page (all 24 op pages today)
    # build_page returns the authoring file's body verbatim, so this compares the
    # page against its own prose and is a tautology with respect to api/mqtt/schema/.
    # A field added, deleted or retyped in api-schema does not move any of the 24
    # op pages, and regenerating them will not propagate it either. Only the
    # response-codes singleton is genuinely schema-derived. See generation.md.
    #
    # Gated on coverage only — build_page indexes manifest[op], which an uncovered
    # op would KeyError on. An op-count failure does not have that problem, so the
    # drift check still runs and reports.
    drift = sdrift = orphans = spine = None
    if not problems:
        drift = 0
        for o in ops:
            entry = dict(manifest[o["op"]])
            dest = os.path.join(DOCS_ROOT, entry["plane"], entry["doc_id"] + ".mdx")
            regenerated = build_page(entry, o, exdesc, for_op)
            current = _read_text(dest) if os.path.exists(dest) else None
            if regenerated != current:
                print(f"  DRIFT: {dest} differs from regenerated output — run npm run gen:reference")
                drift += 1
        # Singletons (non-op generated pages) — separate loop; never touches the
        # 24-op assertion above.
        sdrift = 0
        for sid, meta in load_singletons().items():
            entry = dict(meta); entry.setdefault("doc_id", sid)
            builder = SINGLETON_BUILDERS.get(sid)
            if not builder:
                print(f"  no builder registered for singleton: {sid}")
                sdrift += 1
                continue
            dest = os.path.join(DOCS_ROOT, entry["plane"], entry["doc_id"] + ".mdx")
            regenerated = builder(entry)
            current = _read_text(dest) if os.path.exists(dest) else None
            if regenerated != current:
                print(f"  DRIFT (singleton): {dest} differs from regenerated output — run npm run gen:reference")
                sdrift += 1
        print(f"drift check: {'OK' if drift == 0 else str(drift) + ' page(s) drifted'}")
        print(f"singleton drift check: {'OK' if sdrift == 0 else str(sdrift) + ' singleton(s) drifted'}")

        # Orphan scan: a banner-carrying page under api/mqtt/reference that the
        # generator no longer emits. A doc_id rename moves the manifest entry and
        # the prose file, but nothing removes the old output — it keeps its own id,
        # so Docusaurus raises no duplicate and the stale page deploys, its banner
        # naming an authoring file that no longer exists. Keys on the banner text,
        # never on the path: api/mqtt/reference also holds 40 hand-authored pages
        # today (65 .mdx there, 25 of them banner-carrying).
        #
        # That 40 is a comment, not an assertion. Nothing gates it the way
        # len(ops) != 24 is gated above, and the scan itself never counts pages —
        # it tests each file for the banner one at a time. So the number buys a
        # reader orientation and nothing else, and it will go stale silently the
        # next time a hand-authored page lands. It read 13 until 2026-09-05.
        # Reads DOCS_ROOT deliberately, not --out-dir.
        # A DICT, page path -> (kind, prose path), not a set. The orphan scan only
        # needs the keys, but the spine gate below needs the kind to pick a spine and
        # the prose path to name in a finding — and deriving that set twice is how the
        # two would drift apart. `reference` is fixed for a singleton: it documents no
        # operation, so it has no command/event kind to inherit.
        expected = {}
        for o in ops:
            e = dict(manifest[o["op"]])
            expected[os.path.normpath(os.path.join(
                DOCS_ROOT, e["plane"], e["doc_id"] + ".mdx"))] = (o["kind"], authoring_path(e))
        for sid, meta in load_singletons().items():
            e = dict(meta); e.setdefault("doc_id", sid)
            expected[os.path.normpath(os.path.join(
                DOCS_ROOT, e["plane"], e["doc_id"] + ".mdx"))] = ("reference", authoring_path(e))
        banner_prefix = mdx.GENERATED.split("{plane}")[0]
        orphans = 0
        for root, _dirs, files in os.walk(DOCS_ROOT):
            for fn in files:
                if not fn.endswith((".mdx", ".md")):
                    continue
                p = os.path.normpath(os.path.join(root, fn))
                if p in expected:
                    continue
                if banner_prefix in _read_text(p):
                    print(f"  ORPHAN: {p} carries the @generated banner but no op or "
                          "singleton emits it — delete it or restore its manifest entry")
                    orphans += 1
        print(f"orphan scan: {'OK' if orphans == 0 else str(orphans) + ' orphaned page(s)'}")

        # SPINE GATE — the sixth gate, added 2026-09-08. Until it existed the page
        # templates were enforced by NOTHING: a page could drop a mandatory section,
        # reorder the grid or retitle a heading and every gate stayed green, because
        # nothing in this repository read a page's H2 sequence. That failure is silent
        # in the worst way — a command page missing its Response Codes section renders
        # perfectly and is simply missing an answer.
        #
        # INSTALLED WHILE CONFORMANCE WAS 25/25, on purpose. A gate adopted at 100% is
        # born green: nothing to remediate and nothing to grandfather. Waiting until it
        # broke would have meant paying for the repair AND the gate, plus an argument
        # about which pages get an exemption.
        #
        # Scoped to `expected` — the generator's own output set — rather than to a text
        # predicate. That is what keeps the hand-authored pages,
        # about-the-mqtt-api.mdx, the 24 landing placeholders and the orphans/ copy out
        # BY CONSTRUCTION instead of by an exclusion list somebody has to maintain. Note
        # the alternative that was rejected: scoping on the "@generated by
        # scripts/api/mqtt" banner text matches 28 files, two of which (SUPPORT.md and
        # docs-mqtt-migration-analysis.md) merely QUOTE the banner as backticked prose.
        spine = 0
        for page, (kind, prose_path) in sorted(expected.items()):
            if not os.path.exists(page):
                continue  # the drift check above already reports a missing page
            for finding in classify.spine_findings(kind, page_h2s(_read_text(page))):
                # Names the PROSE path, never the published one. Every generated page
                # carries a banner forbidding edits, and the fix for every spine
                # violation is in the authoring file followed by a regeneration. A
                # message naming api/mqtt/reference/... would send the maintainer to
                # hand-edit a generated file, which the drift check then fails and the
                # next generation silently reverts.
                print(f"  SPINE: {prose_path} — {finding}")
                spine += 1
        if spine:
            print(f"     fix the authoring file(s) above, then run: npm run gen:reference")
        print(f"spine gate: {'OK' if spine == 0 else str(spine) + ' finding(s)'}")

        if drift or sdrift or orphans or spine:
            ok = False
    if ok:
        posthog_client.capture("reference_check_passed", {"op_count": len(ops)})
    else:
        # Direct references, not locals(): these are pre-initialised to None above,
        # so "did not run" is reported as null rather than as a clean 0.
        posthog_client.capture("reference_check_failed", {
            "coverage_ok": not bool(problems),
            "drift_count": drift,
            "singleton_drift_count": sdrift,
            "orphan_count": orphans,
            "spine_finding_count": spine,
        })
    sys.exit(0 if ok else 1)


def cmd_selftest():
    """Exercise the spine machinery directly. THE ONLY REAL VERIFICATION OF spines.json.

    WHY THIS EXISTS AT ALL, AND WHY --check IS NOT ENOUGH. `slots_for` is invoked ZERO
    times during a full `--check` and ZERO times during `--generate all`, because all 24
    operation pages are CARRY and build_page returns before the assembly loop. Measured
    with a counting spy. So the usual verification story for a refactor here — "output is
    byte-identical" — is VACUOUS for this file: it holds no matter how wrong spines.json
    is. Something has to run the lookup on purpose, and this is it.

    IT CONSUMES THE REAL config/spines.json, NEVER A FIXTURE, and that is deliberate.
    validate.yml records exactly this rot happening once already: seven schema-citation
    self-test assertions were fixtures demanding behaviour the implementation had
    deliberately removed, so they passed while asserting nothing true. A self-test with
    its own private spine would leave a typo in the shipped file — a restored ampersand,
    a reordered pair, a lost `mech` — invisible to the self-test AND to `--check`."""
    fails = []
    cases = 0

    def ok(label, cond):
        nonlocal cases
        cases += 1
        print(f"  {'OK  ' if cond else 'FAIL'} {label}")
        if not cond:
            fails.append(label)

    # 1. the shipped spines are exactly the measured shape
    cmd = [s["h2"] for s in classify.slots_for("command")]
    evt = [s["h2"] for s in classify.slots_for("event")]
    ok("command spine is the 13 measured slots, in order", cmd == [
        "Overview", "Details", "When to Use", "Topic Mapping", "Key Fields",
        "Request Payload", "Request Semantics", "Response Payload", "Response Semantics",
        "Lifecycle", "Response Codes", "Examples", "Notes and Caveats"])
    ok("event spine is the 9 measured slots, in order", evt == [
        "Overview", "Details", "When to Use", "Topic Mapping", "Key Fields",
        "Event Payload", "Event Semantics", "Examples", "Notes and Caveats"])

    # 2. required is NOT mech — the distinction the file exists to preserve
    ev_sem = [s for s in classify.slots_for("event") if s["h2"] == "Event Semantics"][0]
    ok("event `Event Semantics` is required AND mech (they are different questions)",
       ev_sem["required"] is True and ev_sem.get("mech") is True)
    ok("command's three mech slots are the three optional ones",
       sorted(s["h2"] for s in classify.slots_for("command") if not s["required"])
       == ["Lifecycle", "Request Semantics", "Response Semantics"])

    # 3. the anchor is single-sourced and reaches the heading text
    ok("the Notes anchor is pinned once and shared by all four kinds",
       all(classify.h2_text([s for s in classify.slots_for(k) if s["h2"] == "Notes and Caveats"][0])
           == "Notes and Caveats {#notes--caveats}"
           for k in ("command", "event", "telemetry", "reference")))

    # 3b. THE THIRD KIND. dataEVT is telemetry in the contract (tags[0].name on all three of
    # its send operations) and was published as an event until 2026-09-08.
    tel = [s["h2"] for s in classify.slots_for("telemetry")]
    ok("telemetry spine is 15 slots with the payload/semantics pair renamed",
       len(tel) == 15 and "Telemetry Payload" in tel and "Telemetry Semantics" in tel
       and "Event Payload" not in tel and "Event Semantics" not in tel)
    ok("telemetry reuses the event family's words for the three shared-vocabulary slots",
       {"Emission", "Shaping", "Field Support"} <= set(tel))
    ok("Telemetry Semantics pins the pre-rename slug `event-semantics`",
       classify.h2_text([s for s in classify.slots_for("telemetry")
                         if s["h2"] == "Telemetry Semantics"][0])
       == "Telemetry Semantics {#event-semantics}")
    # Was "the five new telemetry slots are OPTIONAL until their prose is written". They were
    # written on 2026-09-09 and flipped to required in the same commit as this assertion — the
    # two MUST move together, because this case is the only thing that notices the flip.
    ok("Lifecycle is the only optional telemetry slot now the five are written",
       sorted(s["h2"] for s in classify.slots_for("telemetry") if not s["required"])
       == ["Lifecycle"])
    ok("dataEVT is discovered as telemetry, not as an event",
       [o["kind"] for o in S.discover_operations() if o["op"] == "dataEVT"] == ["telemetry"])
    ok("every kind has payload/example labels, and telemetry's are its own",
       set(_KIND_LABELS) >= (classify.KNOWN_KINDS - {"reference"})
       and kind_labels("telemetry") == {"payload": "Telemetry Payload", "example": "Telemetry"})

    # 4. FAIL-CLOSED. This is the defect (a) regression test.
    raised = []
    for bad in ("", None, "COMMAND", "TELEMETRY", "both", "stub"):
        try:
            classify.slots_for(bad)
        except KeyError:
            raised.append(bad)
    ok("an unknown kind RAISES rather than returning a partial spine", len(raised) == 6)
    try:
        kind_labels("nope")
        labels_raise = False
    except KeyError:
        labels_raise = True
    ok("an unknown kind RAISES from kind_labels too", labels_raise)

    # 5. the checker finds real defects
    good_cmd = [classify.h2_text(s) for s in classify.slots_for("command")]
    ok("a conforming heading list yields no findings",
       classify.spine_findings("command", good_cmd) == [])
    ok("dropping a mandatory slot is reported",
       any("Response Codes" in f for f in classify.spine_findings(
           "command", [h for h in good_cmd if h != "Response Codes"])))
    ok("an off-spine H2 is reported",
       any("not in the `command` spine" in f for f in classify.spine_findings(
           "command", good_cmd + ["Invented Section"])))
    ok("a reordered pair is reported",
       any("does not follow" in f for f in classify.spine_findings(
           "command", [good_cmd[1], good_cmd[0]] + good_cmd[2:])))
    ok("omitting an OPTIONAL slot is NOT reported (subsequence, not equality)",
       classify.spine_findings("command", [h for h in good_cmd if h != "Lifecycle"]) == [])
    ok("the Notes heading without its pinned anchor is reported",
       any("Notes and Caveats" in f for f in classify.spine_findings(
           "command", [h.split(" {#")[0] if h.startswith("Notes") else h for h in good_cmd])))
    ok("a `##` inside a fenced code block is not read as a slot",
       page_h2s("## Real\n\n```\n## Not A Slot\n```\n\n## Also Real\n") == ["Real", "Also Real"])

    # 6. and it is green on every page the generator actually owns
    ops, manifest, _exdesc, _for_op = _load_common()
    pages = []
    for o in ops:
        e = dict(manifest[o["op"]])
        pages.append((os.path.join(DOCS_ROOT, e["plane"], e["doc_id"] + ".mdx"), o["kind"]))
    for sid, meta in load_singletons().items():
        e = dict(meta); e.setdefault("doc_id", sid)
        pages.append((os.path.join(DOCS_ROOT, e["plane"], e["doc_id"] + ".mdx"), "reference"))
    clean = sum(1 for p, k in pages
                if not classify.spine_findings(k, page_h2s(_read_text(p))))
    ok(f"all {len(pages)} generated pages conform ({clean}/{len(pages)})", clean == len(pages))

    # Stable deep links cover every contract code and every catalogue command.
    singleton = dict(load_singletons()["response-codes"])
    singleton.setdefault("doc_id", "response-codes")
    catalogue_page = build_singleton_response_codes(singleton)
    codes, _ = S.load_status_codes()
    ids = re.findall(r'<ResponseCodeRow id="code-(\d+)"', catalogue_page)
    ok("catalogue row ids exactly match the contract codes",
       sorted(map(int, ids)) == sorted(row["code"] for row in codes))
    routes = classify.load_manifest()
    names = {name for row in codes if not row.get("universal")
             for name in row.get("commands", [])
             if name in routes}
    ok("every published catalogue command links to its routed page",
       all(f'<Link to="/api-reference/mqtt/{routes[name]["plane"]}/{routes[name]["doc_id"]}"><code>{name}</code></Link>'
           in catalogue_page for name in names))

    print(f"\n[gen-selftest] {'OK' if not fails else 'FAILED'} — "
          f"{len(fails)} failure(s) of {cases} cases")
    sys.exit(0 if not fails else 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generate", metavar="OP")
    ap.add_argument("--scaffold", metavar="OP")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    if a.selftest:
        cmd_selftest()
    elif a.check:
        cmd_check()
    elif a.scaffold:
        cmd_scaffold(a.scaffold)
    elif a.generate:
        cmd_generate(a.generate, a.out_dir)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
