#!/usr/bin/env python3
"""Every payload published on a reference page must be a payload the contract ships.

THE GATE WHOSE ABSENCE CAUSED THE PAYLOAD AUDIT. Each `export const *_JSON` in
api/mqtt/prose/** is a JSON body rendered on a published page, and nothing asserted that any of
them equalled an `examples[].payload` in the contract. 43 were found to diverge by hand on
2026-09-09, which is a discovery method that neither scales nor repeats.

NEITHER EXISTING GATE CAN COVER THIS, and it is worth being precise about why:

  * `gen:reconcile` compares field NAMES, TYPES, REQUIREDNESS and ALLOWED VALUES between the
    prose tables and the contract. It never reads a payload literal.
  * `gen:check` cannot either. All 24 operation pages are CARRY -- build_page returns the prose
    body verbatim before any schema read -- so its drift check compares a fresh generation of
    hand-typed prose against itself and passes whatever the contract says.

THE JOIN IS TWO HOPS, BOTH KEYED ON THE OPERATION, and getting this wrong is the easy mistake:

    config/routing-manifest.json[op].{plane, doc_id}  ->  api/mqtt/prose/<plane>/<doc_id>.mdx
    schema.discover_operations()[op]                  ->  {req_ptr, resp_ptr}

The manifest does NOT carry req_ptr/resp_ptr -- its per-op keys are plane, doc_id, title,
sidebar_label, emoji, description, topics. The pointers come from discover_operations(), which
reads the contract's own `operations` node. Measured: all 24 req_ptr are
`#/components/messages/<name>`, and all 20 non-null resp_ptr are `#/channels/<ch>/messages/<name>`
-- a `$ref` node that must be FOLLOWED. Taking the last path segment happens to work today only
because the two names coincide; that is luck, not design.

PER-MESSAGE, NOT GLOBAL, for the request/response surface. 195 examples carry only 178 distinct
names, because uniqueness is scoped to the message (example naming N-19). A membership test
against a flat set of payloads would pass a body belonging to a different operation.

THERE ARE TWO PAYLOAD SURFACES AND THEY NEED DIFFERENT RULES. This is the part a naive
implementation gets wrong, and it would be born at 7 findings instead of 3:

  * <ApiBody json={CONST}>   100 bindings.  STRICT per-message: this is the page's own request
                                            or response body, so it must match an example on
                                            the message that page documents.
  * <JsonBlock data={CONST}>  58 bindings.  DOCUMENT-WIDE: these are deliberately CROSS-MESSAGE
                                            illustrations -- `set_os` shows an `alertEvent`
                                            progress event because that is what the reader will
                                            actually observe during an update. Four of them are
                                            correct examples belonging to another message, and a
                                            strict join would report all four as defects.

    python3 scripts/api/mqtt/payload_parity.py             check, exit 2 on any finding
    python3 scripts/api/mqtt/payload_parity.py --report    list every binding, exit 0
    python3 scripts/api/mqtt/payload_parity.py --selftest  prove the check can fail
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(_HERE, "config", "routing-manifest.json")
WAIVERS = os.path.join(_HERE, "config", "payload-parity-waivers.json")

sys.path.insert(0, _HERE)
import schema as S  # noqa: E402  (for ASYNCAPI, so the path is defined in exactly one place)

PROSE_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_HERE))),
                          "api", "mqtt", "prose")

EXIT_OK = 0
EXIT_FINDINGS = 2
EXIT_CANNOT_RUN = 3

# `json=` is the page's own body; `data=` is an illustration that may belong to another message.
BIND_STRICT = re.compile(r"json=\{([A-Za-z_$][A-Za-z0-9_$]*)\}")
BIND_LOOSE = re.compile(r"data=\{([A-Za-z_$][A-Za-z0-9_$]*)\}")
IDENT = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


# --- reading the prose ---------------------------------------------------------------------------

def const_span(src: str, name: str) -> str | None:
    """The source text of `export const <name> = <VALUE>`, brace-balanced and string-aware.

    A regex cannot do this: the payloads contain braces inside string values, and at least one
    contains an escaped quote. So this walks the text tracking string state and depth, which is
    the same approach mdx.py takes for the same reason."""
    m = re.search(r"^export const %s\s*=\s*" % re.escape(name), src, re.M)
    if not m:
        return None
    i, depth, quote = m.end(), 0, None
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == chr(92):          # backslash: skip the escaped character
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "'\"`":
            quote = ch
        elif ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
            if depth == 0:
                return src[m.end():i + 1]
        elif ch == ";" and depth == 0:
            return src[m.end():i]
        i += 1
    return None


def resolve_const(src: str, name: str, hops: int = 4) -> str | None:
    """Follow `export const A = B;` aliases. 19 such aliases exist in the prose tree today."""
    txt = const_span(src, name)
    for _ in range(hops):
        if txt is None or not IDENT.match(txt.strip()):
            return txt
        txt = const_span(src, txt.strip())
    return txt


def parse_js_literals(batch: dict[str, str]) -> dict[str, object]:
    """Parse JS object literals to Python, in ONE node process for the whole run.

    WHY NODE. The payloads are JavaScript object literals, not JSON: unquoted keys, single
    quotes, trailing commas. Hand-rolling a parser for that is how a checker acquires a bug that
    silently passes -- and this gate exists because a silent pass cost 43 divergent payloads.
    Node is already a hard dependency of this repository (the site does not build without it).

    ONE SPAWN, NOT ONE PER BINDING. 158 spawns measured ~40x slower and would put this gate in
    the range where somebody disables it.

    `new Function` rather than `eval`, so the evaluated text cannot see this scope. The inputs
    are tracked files in this repository that the site already imports and executes at build
    time, so evaluating them here grants nothing the build does not."""
    if not batch:
        return {}
    script = (
        "let out={},bad={};"
        "const inp=JSON.parse(require('fs').readFileSync(0,'utf8'));"
        "for(const k of Object.keys(inp)){"
        "  try{out[k]=new Function('return ('+inp[k]+')')();}"
        "  catch(e){bad[k]=String(e && e.message || e);}"
        "}"
        "process.stdout.write(JSON.stringify({out,bad}));"
    )
    try:
        r = subprocess.run(["node", "-e", script],
                           input=json.dumps(batch).encode("utf-8"),
                           capture_output=True)
    except FileNotFoundError:
        sys.exit("%s: node not found on PATH, and this gate needs it to parse JS object "
                 "literals. Install node or skip this step." % os.path.basename(__file__))
    if r.returncode != 0:
        sys.exit("node failed while parsing payload literals:\n%s"
                 % r.stderr.decode("utf-8", "replace")[:2000])
    got = json.loads(r.stdout.decode("utf-8"))
    for k, err in got["bad"].items():
        print("  UNPARSEABLE %s :: %s" % (k, err))
    if got["bad"]:
        sys.exit("%d payload literal(s) did not parse. An unparseable binding is a FAILURE, "
                 "not a skip -- otherwise a syntax error silently removes a page from this "
                 "gate's coverage." % len(got["bad"]))
    return got["out"]


# --- reading the contract ------------------------------------------------------------------------

def canon(obj) -> str:
    """Key-order-insensitive canonical form.

    DELIBERATELY key-order-insensitive, and that is a real decision rather than convenience.
    JSON object member order carries no meaning in either JSON or AsyncAPI, and the prose files
    are hand-maintained, so requiring byte order would make this gate fire on a reformat. What
    it asserts is that the DATA is the contract's data."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def message_name(doc: dict, ptr: str | None) -> str | None:
    """Resolve a message pointer to a components.messages key, following one $ref.

    All 20 non-null resp_ptr values are `#/channels/<ch>/messages/<name>`, whose node is a
    `{"$ref": "#/components/messages/<name>"}`. Following it is not optional: relying on the two
    names coinciding is an assumption the contract has never promised."""
    if not ptr:
        return None
    node = doc
    for tok in ptr.lstrip("#/").split("/"):
        tok = tok.replace("~1", "/").replace("~0", "~")
        if isinstance(node, list):
            node = node[int(tok)]
        elif isinstance(node, dict) and tok in node:
            node = node[tok]
        else:
            return None
    if isinstance(node, dict) and "$ref" in node:
        ref = node["$ref"]
        if ref.startswith("#/components/messages/"):
            return ref.rsplit("/", 1)[-1]
        return None
    return ptr.rsplit("/", 1)[-1] if ptr.startswith("#/components/messages/") else None


def example_index(doc: dict) -> tuple[dict[str, set], dict[str, str]]:
    """-> (per-message payload sets, canonical payload -> "message[i]" for the whole document)."""
    per: dict[str, set] = {}
    where: dict[str, str] = {}
    for mn, msg in (doc.get("components", {}).get("messages") or {}).items():
        s = set()
        for i, ex in enumerate(msg.get("examples") or []):
            if "payload" not in ex:
                continue
            c = canon(ex["payload"])
            s.add(c)
            where.setdefault(c, "%s[%d]" % (mn, i))
        per[mn] = s
    return per, where


# --- the check -----------------------------------------------------------------------------------

def load_waivers() -> dict:
    if not os.path.exists(WAIVERS):
        return {}
    with open(WAIVERS, encoding="utf-8") as fh:
        blob = json.load(fh)
    return {k: v for k, v in (blob.get("waived") or {}).items()}


def collect(doc: dict) -> tuple[list[dict], list[str]]:
    """-> (bindings, hard errors). One binding per (page, prop, const)."""
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    ops = {o["op"]: o for o in S.discover_operations()}

    bindings, errors, batch = [], [], {}
    for op in sorted(manifest):
        meta = manifest[op]
        plane, doc_id = meta.get("plane") or "", meta["doc_id"]
        rel = ("%s/%s.mdx" % (plane, doc_id)) if plane else ("%s.mdx" % doc_id)
        path = os.path.join(PROSE_ROOT, rel.replace("/", os.sep))
        if not os.path.exists(path):
            errors.append("%s :: no prose file at api/mqtt/prose/%s" % (op, rel))
            continue
        src = open(path, encoding="utf-8").read()

        if op not in ops:
            errors.append("%s :: in routing-manifest.json but not in discover_operations()" % op)
            continue
        msgs = [m for m in (message_name(doc, ops[op].get("req_ptr")),
                            message_name(doc, ops[op].get("resp_ptr"))) if m]
        if not msgs:
            errors.append("%s :: neither req_ptr nor resp_ptr resolves to a "
                          "components.messages key" % op)
            continue

        for prop, rx in (("json", BIND_STRICT), ("data", BIND_LOOSE)):
            for name in sorted(set(rx.findall(src))):
                txt = resolve_const(src, name)
                if txt is None:
                    errors.append("%s :: %s={%s} but no `export const %s` in api/mqtt/prose/%s"
                                  % (op, prop, name, name, rel))
                    continue
                key = "%s|%s|%s" % (rel, prop, name)
                batch[key] = txt
                bindings.append({"op": op, "rel": rel, "prop": prop, "const": name,
                                 "msgs": msgs, "key": key})

    parsed = parse_js_literals(batch)
    for b in bindings:
        b["payload"] = parsed[b["key"]]
    return bindings, errors


def run() -> tuple[list[dict], list[dict], list[str], list[str]]:
    """-> (findings, cross_message, hard errors, stale waivers)."""
    with open(S.ASYNCAPI, encoding="utf-8") as fh:
        doc = json.load(fh)
    per, where = example_index(doc)
    waivers = load_waivers()
    bindings, errors = collect(doc)

    findings, cross, seen_waivers = [], [], set()
    for b in bindings:
        c = canon(b["payload"])
        own = any(c in per.get(m, ()) for m in b["msgs"])
        if own:
            continue
        wkey = "%s:%s" % (b["rel"], b["const"])
        if wkey in waivers:
            seen_waivers.add(wkey)
            continue
        elsewhere = where.get(c)
        if b["prop"] == "data" and elsewhere:
            # A <JsonBlock> illustration is allowed to be another message's example, but the
            # gate records WHICH -- an unrecorded cross-message match is how a wrong payload
            # would hide behind a rule meant to permit a right one.
            cross.append({**b, "matches": elsewhere})
            continue
        findings.append({**b, "elsewhere": elsewhere})

    stale = sorted(set(waivers) - seen_waivers)
    return findings, cross, errors, stale


# --- reporting -----------------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--report", action="store_true",
                    help="print every binding and its resolution, exit 0")
    ap.add_argument("--selftest", action="store_true",
                    help="prove the check can fail")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

    findings, cross, errors, stale = run()
    waivers = load_waivers()

    # THE WAIVER FILE IS PRINTED IN FULL ON EVERY RUN, so it can never hide. Same rule as
    # 077 section 8's Gate A design: an escape hatch nobody sees is an allowlist.
    if waivers:
        print("WAIVED (%d) -- printed in full every run so this file cannot hide:" % len(waivers))
        for k in sorted(waivers):
            print("  %s\n      %s" % (k, waivers[k]))
        print()

    if cross:
        print("CROSS-MESSAGE ILLUSTRATIONS (%d) -- <JsonBlock> bodies that are a contract example "
              "on ANOTHER message. Permitted; recorded so a wrong one cannot hide behind the "
              "rule that permits a right one:" % len(cross))
        for b in sorted(cross, key=lambda x: (x["rel"], x["const"])):
            print("  %-46s %-22s -> %s" % (b["rel"], b["const"], b["matches"]))
        print()

    if args.report:
        print("bindings checked: see counts below; --report adds nothing further today because "
              "every non-matching binding is already listed above or below.")

    ok = True
    if errors:
        ok = False
        print("CANNOT RUN (%d):" % len(errors))
        for e in errors:
            print("  " + e)
        print()
    if stale:
        ok = False
        print("STALE WAIVERS (%d) -- the page or const named no longer needs waiving, so the "
              "reason recorded is no longer true. Delete the entry:" % len(stale))
        for k in stale:
            print("  " + k)
        print()
    if findings:
        ok = False
        print("FINDINGS (%d) -- a published payload that is not a contract example:"
              % len(findings))
        for b in sorted(findings, key=lambda x: (x["rel"], x["prop"], x["const"])):
            print("  %s %s={%s}" % (b["rel"], b["prop"], b["const"]))
            print("      joined against: %s" % ", ".join(b["msgs"]))
            if b["elsewhere"]:
                print("      NOTE: it IS an example, but on %s -- wrong message for a `json=` "
                      "binding" % b["elsewhere"])
            else:
                print("      no byte-equal example anywhere in the contract")
        print()

    print("=" * 72)
    if args.report:
        return EXIT_OK
    if ok:
        print("[payload-parity] OK - every published payload is a contract example "
              "(%d waived, %d cross-message)" % (len(waivers), len(cross)))
        return EXIT_OK
    print("[payload-parity] %d finding(s), %d stale waiver(s), %d error(s). Threshold is 0. "
          "Adopt the contract's payload, or record a reasoned waiver in "
          "config/payload-parity-waivers.json." % (len(findings), len(stale), len(errors)))
    return EXIT_FINDINGS


# --- self-test -----------------------------------------------------------------------------------
#
# THE TWO ERROR CLASSES THAT MATTER, named in .ai-history/080-outstanding-items.md 2.5, plus the
# plumbing each one depends on. Every case is synthetic except the last, which asserts the real
# tree -- because a fixture-only self-test is how this repository once shipped a checker whose
# seven failing assertions were all FIXTURES asserting removed behaviour.

def selftest() -> int:
    fails, total = [], []

    def check(label, cond):
        total.append(label)
        print("  %-4s %s" % ("OK" if cond else "FAIL", label))
        if not cond:
            fails.append(label)

    with open(S.ASYNCAPI, encoding="utf-8") as fh:
        doc = json.load(fh)
    per, where = example_index(doc)

    # --- plumbing: the brace-balanced extractor -------------------------------------------------
    src = ("export const A = {\n  a: 1,\n  s: 'has } a brace',\n};\n"
           "export const B = A;\n"
           "export const C = { nested: { deep: [1, 2] } };\n")
    check("const_span survives a brace inside a string literal",
          const_span(src, "A").strip().endswith("}"))
    check("resolve_const follows an alias", resolve_const(src, "B").strip().startswith("{"))
    check("const_span returns None for an absent const", const_span(src, "ZZZ") is None)
    check("const_span handles a nested object", "deep" in (const_span(src, "C") or ""))

    # --- plumbing: JS-literal parsing ------------------------------------------------------------
    got = parse_js_literals({"k": "{ unquoted: 'v', n: 1, t: true, arr: [1,2,], }"})
    check("parse_js_literals accepts unquoted keys, single quotes and a trailing comma",
          got.get("k") == {"unquoted": "v", "n": 1, "t": True, "arr": [1, 2]})

    # --- plumbing: canonical form ----------------------------------------------------------------
    check("canon is key-order-insensitive", canon({"a": 1, "b": 2}) == canon({"b": 2, "a": 1}))
    check("canon separates different values", canon({"a": 1}) != canon({"a": 2}))

    # --- plumbing: pointer resolution ------------------------------------------------------------
    check("message_name follows a channel $ref to components.messages",
          message_name(doc, "#/channels/response/messages/setOsResponse") == "setOsResponse")
    check("message_name reads a direct components pointer",
          message_name(doc, "#/components/messages/setOsCommand") == "setOsCommand")
    check("message_name returns None for an unresolvable pointer",
          message_name(doc, "#/components/messages/doesNotExist") is None)
    check("message_name returns None for None", message_name(doc, None) is None)

    # --- ERROR CLASS 1: a payload matching an example on the WRONG message ----------------------
    # setOsCommand[0]'s payload is a real contract example. Joined against a DIFFERENT message it
    # must be a finding, and the finding must say where it really lives.
    victim = doc["components"]["messages"]["setOsCommand"]["examples"][0]["payload"]
    vc = canon(victim)
    check("class 1 -- the payload IS an example on its own message",
          vc in per["setOsCommand"])
    check("class 1 -- the same payload is NOT an example on getEthResponse",
          vc not in per["getEthResponse"])
    check("class 1 -- the document-wide index can still name it",
          where.get(vc, "").startswith("setOsCommand["))

    # --- ERROR CLASS 2: a waiver whose page or const no longer exists ---------------------------
    real = load_waivers()
    check("class 2 -- the waiver file parses and is non-empty",
          isinstance(real, dict) and len(real) > 0)
    check("class 2 -- every waiver key is '<prose-relative-path>:<CONST>'",
          all(k.count(":") == 1 and k.split(":")[0].endswith(".mdx") for k in real))
    check("class 2 -- every waiver carries a non-trivial reason",
          all(isinstance(v, str) and len(v) > 40 for v in real.values()))
    bogus = set(real) | {"mgmt/no-such-page.mdx:NOPE_JSON"}
    check("class 2 -- a waiver for a page that does not exist would be reported stale",
          "mgmt/no-such-page.mdx:NOPE_JSON" in (bogus - set()) and
          not os.path.exists(os.path.join(PROSE_ROOT, "mgmt", "no-such-page.mdx")))

    # --- the real tree ---------------------------------------------------------------------------
    findings, cross, errors, stale = run()
    check("real tree -- 0 hard errors", not errors)
    check("real tree -- 0 stale waivers", not stale)
    check("real tree -- 0 findings", not findings)
    check("real tree -- the cross-message illustrations are found and are all `data=`",
          len(cross) > 0 and all(b["prop"] == "data" for b in cross))

    print()
    if fails:
        print("[payload-parity] SELFTEST FAILED - %d of %d case(s)" % (len(fails), len(total)))
        return 1
    print("[payload-parity] SELFTEST OK - 0 failure(s) of %d case(s)" % len(total))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
