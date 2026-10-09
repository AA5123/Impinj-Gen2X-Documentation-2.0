#!/usr/bin/env python3
"""Reconcile every hand-typed field row in api/mqtt/prose/ against the AsyncAPI contract.

THE CONTRACT IS THE STATEMENT OF TRUTH, and until this existed nothing checked the prose
against it. The 24 operation pages are CARRY: `build_page` returns their body verbatim
before any schema read, so `--check`'s drift comparison is a tautology with respect to the
contract -- a field added, removed or retyped in the contract moves nothing on any page, and
regenerating will not propagate it. This module is the missing comparison.

WHAT IT REPORTS is a CONTRADICTION, not a difference. Prose that adds something the contract
does not model is editorial and stays; prose that states something the contract states
differently is a defect. Four classes:

    FIELD-ABSENT   a published field name the contract declares nowhere
    TYPE           a published type the contract contradicts
    REQUIRED       a published requiredness the contract contradicts
    ENUM           a published allowed-value the contract's enum excludes
    ENUM-ORDER     a published allowed-value LIST whose order the contract's enum contradicts

ENUM-ORDER WAS ADDED 2026-09-09, AND IT CLOSES A RULE THAT WAS ALREADY WRITTEN DOWN.
`docs/prose-vs-schema-audit.md:90` says of `enumUnits` that "Order and membership both matter",
and until now this module tested membership only -- so ten `enumUnits` arrays were corrected by
hand on 2026-09-09 against a gate that could not see the difference, and the next reorder of any
of them would have passed green.

IT ASSERTS A SUBSEQUENCE, NOT EQUALITY, and that choice is what makes it worth having:

  * A page may legitimately publish a SUBSET of an enum -- documenting three of six alert
    categories on the page where those three apply. Equality would have to skip those rows, and
    measured on this tree that is 78 of 294 multi-value arrays left unchecked.
  * Subsequence is the natural extension of the membership test already here: that test asks
    whether every published value is IN the contract's enum, and this asks whether they appear
    in the ORDER the contract lists them. A subset in the right relative order passes; the same
    subset shuffled does not.
  * Measured on the tree it lands with: 294 multi-value arrays, 288 contained by some contract
    enum, 288 of those a subsequence, 0 findings. Under an equality rule the coverage would have
    been 216.

The 6 arrays contained by NO contract enum are skipped, not reported. They are unit-word lists
and format hints that render in the same cell -- blind spot 3 below -- and reporting them would
have made this class born red on six correct rows.

WHY IT MUST RUN BEFORE ANY PAGE IS CONVERTED TO @slot. Converting a page hands its field
table to the generator, which overwrites the hand-typed rows -- and with them the evidence
of which side was wrong. Once that is gone you cannot tell a hand-typing error from a
contract error, and both exist here. Its first run found 141 contradictions AND five bugs in
the generator's own row model, every one of which would have silently DELETED real fields
from published pages had a page been converted first.

FOUR DELIBERATE BLIND SPOTS, named because a checker that hides its limits is worse than one
that has none:

 1. Rows are matched by LEAF field name, so a name declared on several branches of one
    payload has several candidates. A dimension is reported only when NO candidate agrees.
    That under-reports; the alternative over-reported against correct prose, which is how a
    gate gets ignored.
 2. Conditional requirement (`if`/`then`) is collected by name and excuses a page saying
    "required" where the contract's unconditional set does not. It is ONE-DIRECTIONAL: no
    conditional branch can excuse a page calling an unconditionally-required member optional.
 3. `enumUnits` also carries format hints (`date-time`) and unit strings (`0 / 1 / 2`), which
    render in the same cell as an enum but assert nothing an enum could contradict. Only
    list-valued cells are compared.
 4. `desc` is not compared at all. It is editorial by design, and the contract's own field
    descriptions are not a substitute for the site's cross-references and glosses.

Read-only with respect to the repository. `--json PATH` writes a machine-readable copy.
"""
import argparse
import io
import json
import os
import re
import sys
from collections import Counter, OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema as S  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "config", "routing-manifest.json")
PROSE = os.path.join("api", "mqtt", "prose")

def is_subsequence(small, big):
    """Does `small` appear inside `big` in the same relative order?

    Not a set test and not an equality test. `['A', 'C']` is a subsequence of
    `['A', 'B', 'C']`; `['C', 'A']` is not. Duplicates in `small` consume successive matches in
    `big`, which is correct: a row publishing a value twice is a row that must say so twice."""
    it = iter(big)
    return all(any(x == y for y in it) for x in small)


def enum_contradiction(name, prose_enum, cands):
    """The ENUM and ENUM-ORDER comparison, pure so both classes can be self-tested.

    `cands` is [(pointer, contract_node)] for every contract node whose LEAF NAME matches this
    row -- blind spot 1. Returns (kind, msg) or None.

    A CANDIDATE THAT DECLARES NO ENUM MAKES THE CONTRACT SILENT about that node's allowed
    values, and silence cannot be contradicted. `status` is the live case: the page's row is the
    INTERFACE-level status, for which `wifiConfigResponse.interfaceDetails.status` declares no
    enum, while the sibling `accessPoint.status` association state does -- so comparing against
    the sibling called correct prose wrong four times. `DISABLED` is in fact contract-declared,
    at `ethConfigResponse.interfaceDetails.status`."""
    with_enum = [(p, c) for p, c in cands
                 if isinstance(c.get("enumUnits"), list) and c["enumUnits"]]
    if not with_enum or len(with_enum) < len(cands):
        return None

    containing = [(p, c) for p, c in with_enum
                  if not [v for v in prose_enum if v not in c["enumUnits"]]]

    if not containing:
        # MEMBERSHIP. Report the least-bad candidate, so a row with several branches is judged
        # against the one it most nearly agrees with rather than an arbitrary one.
        worst, extra = None, None
        for p, c in with_enum:
            missing = [v for v in prose_enum if v not in c["enumUnits"]]
            if extra is None or len(missing) < len(extra):
                worst, extra = (p, c), missing
        p, c = worst
        return ("ENUM", f"`{name}` publishes {extra} — absent from the "
                        f"contract's enum at {p}: {c['enumUnits']}")

    # ORDER. Only once membership passes, and only where order can exist at all.
    if len(prose_enum) > 1 and not any(is_subsequence(prose_enum, c["enumUnits"])
                                       for _p, c in containing):
        p, c = containing[0]
        return ("ENUM-ORDER", f"`{name}` publishes {prose_enum} — not in the order the "
                              f"contract's enum lists them at {p}: {c['enumUnits']}. "
                              f"prose-vs-schema-audit.md:90 — order and membership both matter.")
    return None


# One hand-typed row: `{ field: 'topic', type: 'string', required: true, ... }`
ROW = re.compile(r"\{\s*field:\s*'((?:[^'\\]|\\.)*)'(.*?)\}", re.S)
ROW_TYPE = re.compile(r"\btype:\s*'((?:[^'\\]|\\.)*)'")
ROW_REQ = re.compile(r"\brequired:\s*(true|false)")
ROW_ENUM = re.compile(r"\benumUnits:\s*(\[[^\]]*\]|'(?:[^'\\]|\\.)*')")
STR_MEMBER = re.compile(r"'((?:[^'\\]|\\.)*)'")

# Page vocabulary and contract vocabulary, reduced to one. Applied to BOTH operands --
# normalising a single side reports "published as `enum`, contract says `enum`", because
# `_row` also emits the literal "enum" for a string carrying one.
TYPE_ALIASES = {"enum": "string", "int": "integer", "bool": "boolean", "any": None, "": None}


def norm_type(t):
    return TYPE_ALIASES.get(t.strip(), t.strip()) if isinstance(t, str) else None


def walk(node, path="#"):
    yield path, node
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}/{i}")


def conditionally_required(doc):
    """Field names the contract requires only inside an `if`/`then`."""
    out = set()
    for path, node in walk(doc):
        if not (isinstance(node, dict) and path.endswith("/then")):
            continue
        for sub, val in walk(node):
            if sub.endswith("/required") and isinstance(val, list):
                out.update(x for x in val if isinstance(x, str))
    return out


def contract_rows(doc, pointer):
    """Rows for a message pointer, following the channel-level `$ref` hop when present.

    A channel entry is itself a bare `$ref` -- `#/channels/response/messages/getStatusResponse`
    resolves to `{"$ref": "#/components/messages/getStatusResponse"}` -- so a reader that
    assumes it can reach `/payload` directly raises on all 20 response pointers.
    """
    node = S.resolve_json_pointer(doc, pointer.lstrip("#"), label=pointer)
    if isinstance(node, dict) and "$ref" in node and "payload" not in node:
        node = S.resolve_json_pointer(doc, node["$ref"].lstrip("#"), label=node["$ref"])
    if not isinstance(node, dict) or "payload" not in node:
        return None
    return S.schema_to_rows(S.extract_schema(node["payload"], S.ASYNCAPI, root=doc))


def flatten(rows, prefix="", out=None):
    if out is None:
        out = OrderedDict()
    for r in rows or []:
        p = f"{prefix}{r['field']}"
        out[p] = r
        if r.get("children"):
            flatten(r["children"], p + ".", out)
    return out


def prose_rows(path):
    text = open(path, encoding="utf-8").read()
    out = []
    for m in ROW.finditer(text):
        body = m.group(2)
        t = ROW_TYPE.search(body)
        rq = ROW_REQ.search(body)
        en = ROW_ENUM.search(body)
        enum = None
        if en:
            raw = en.group(1)
            # Only a LIST is an allowed-value set. A bare string in this cell is a unit or a
            # format hint and is not comparable against an enum.
            enum = STR_MEMBER.findall(raw) if raw.startswith("[") else None
        out.append({
            "field": m.group(1),
            "type": t.group(1) if t else None,
            "required": (rq.group(1) == "true") if rq else None,
            "enum": enum,
            "line": text[: m.start()].count("\n") + 1,
        })
    return out


def reconcile():
    doc = S.load_asyncapi()
    cond_req = conditionally_required(doc)
    ops = {o["op"]: o for o in S.discover_operations()}
    manifest = json.load(open(MANIFEST, encoding="utf-8"))

    findings, covered = [], 0
    for op, entry in manifest.items():
        if op.startswith("_") or op not in ops:
            continue
        meta = ops[op]
        page = os.path.join(PROSE, entry["plane"], entry["doc_id"].split("/")[-1] + ".mdx")
        if not os.path.exists(page):
            continue
        covered += 1
        rel = page.replace(os.sep, "/")

        contract = OrderedDict()
        for which in ("req_ptr", "resp_ptr"):
            ptr = meta.get(which)
            if not ptr:
                continue
            try:
                rows = contract_rows(doc, ptr)
            except Exception as exc:                       # noqa: BLE001
                findings.append({"op": op, "path": rel, "line": 0, "kind": "TOOL",
                                 "msg": f"{which}: {exc}"})
                continue
            if rows:
                flatten(rows, "", contract)

        if not contract:
            findings.append({"op": op, "path": rel, "line": 0, "kind": "TOOL",
                             "msg": "the contract yielded no rows for this operation"})
            continue

        by_name = {}
        for p, row in contract.items():
            by_name.setdefault(p.split(".")[-1], []).append((p, row))

        for pr in prose_rows(page):
            name = pr["field"]
            if name.startswith("<") or name in ("", "..."):
                continue                                    # a placeholder row, not a field
            cands = by_name.get(name)
            if not cands:
                findings.append({"op": op, "path": rel, "line": pr["line"],
                                 "kind": "FIELD-ABSENT",
                                 "msg": f"`{name}` is published but the contract declares no "
                                        "such property"})
                continue

            want = norm_type(pr["type"])
            if want is not None and not any(
                    norm_type(c.get("type")) in (None, want) for _, c in cands):
                seen = sorted({norm_type(c.get("type")) or "any" for _, c in cands})
                findings.append({"op": op, "path": rel, "line": pr["line"], "kind": "TYPE",
                                 "msg": f"`{name}` published as `{pr['type']}`; contract "
                                        f"declares {'/'.join(seen)} at "
                                        + ", ".join(p for p, _ in cands)})

            excused = name in cond_req and pr["required"] is True
            if pr["required"] is not None and not excused and not any(
                    bool(c.get("required")) == pr["required"] for _, c in cands):
                findings.append({"op": op, "path": rel, "line": pr["line"], "kind": "REQUIRED",
                                 "msg": f"`{name}` published required="
                                        f"{str(pr['required']).lower()}; contract says "
                                        f"{str(not pr['required']).lower()} at "
                                        + ", ".join(p for p, _ in cands)})

            if pr["enum"]:
                hit = enum_contradiction(name, pr["enum"], cands)
                if hit:
                    findings.append({"op": op, "path": rel, "line": pr["line"],
                                     "kind": hit[0], "msg": hit[1]})
    return covered, findings


# --- self-test ---------------------------------------------------------------------------------
#
# SCOPED TO THE ENUM CLASSES, and the scope is honest rather than modest: this module had no
# self-test at all before 2026-09-09, and building one for the whole file walk is a larger job
# than the class it would have guarded. Extracting `enum_contradiction` as a pure function is
# what made these cases possible, and it is the half where a subtle rule lives -- the other
# three classes are direct comparisons.
#
# HALF OF THESE CASES MUST PRODUCE A FINDING. A gate with no failing case proves nothing, and
# that is the reason ENUM-ORDER exists: the membership class it sits beside was green on ten
# arrays whose order was wrong.

def _node(enum):
    return {"enumUnits": list(enum)} if enum is not None else {}


def selftest():
    fails, total = [], []

    def check(label, cond):
        total.append(label)
        print("  %-4s %s" % ("OK" if cond else "FAIL", label))
        if not cond:
            fails.append(label)

    ABC = ["A", "B", "C", "D"]

    # --- is_subsequence, the rule the class turns on ---------------------------------------
    check("subsequence: identical lists match", is_subsequence(ABC, ABC))
    check("subsequence: a gapped subset in order matches",
          is_subsequence(["A", "C"], ABC))
    check("subsequence: a shuffled subset does NOT",
          not is_subsequence(["C", "A"], ABC))
    check("subsequence: a swapped adjacent pair does NOT",
          not is_subsequence(["B", "A"], ABC))
    check("subsequence: a value absent from the parent does NOT",
          not is_subsequence(["A", "Z"], ABC))
    check("subsequence: duplicates consume successive matches",
          is_subsequence(["A", "A"], ["A", "A", "B"]) and
          not is_subsequence(["A", "A"], ABC))
    check("subsequence: a single value always matches", is_subsequence(["C"], ABC))

    # --- ENUM: membership, behaviour preserved from before the refactor --------------------
    hit = enum_contradiction("f", ["A", "Z"], [("/p", _node(ABC))])
    check("ENUM fires on a value the contract's enum excludes",
          hit is not None and hit[0] == "ENUM" and "'Z'" in hit[1])
    check("ENUM stays silent when every value is in the enum",
          enum_contradiction("f", ["A", "B"], [("/p", _node(ABC))]) is None)
    # least-bad candidate selection
    hit = enum_contradiction("f", ["A", "Y", "Z"],
                             [("/near", _node(["A", "Y"])), ("/far", _node(["Q"]))])
    check("ENUM reports the LEAST-BAD candidate, not an arbitrary one",
          hit is not None and "/near" in hit[1])

    # --- the silence guard ------------------------------------------------------------------
    check("a candidate declaring NO enum silences both classes -- silence cannot be "
          "contradicted",
          enum_contradiction("f", ["C", "A"], [("/p", _node(ABC)), ("/q", _node(None))]) is None)
    check("no candidate declares an enum -> silent",
          enum_contradiction("f", ["C", "A"], [("/q", _node(None))]) is None)

    # --- ENUM-ORDER: the new class ----------------------------------------------------------
    hit = enum_contradiction("f", ["C", "A"], [("/p", _node(ABC))])
    check("ENUM-ORDER fires on a shuffled but fully-contained list",
          hit is not None and hit[0] == "ENUM-ORDER")
    check("ENUM-ORDER cites the written rule it enforces",
          hit is not None and "prose-vs-schema-audit.md:90" in hit[1])
    check("ENUM-ORDER stays silent on a gapped subset in the right order",
          enum_contradiction("f", ["A", "C"], [("/p", _node(ABC))]) is None)
    check("ENUM-ORDER cannot fire on a single value -- there is no order",
          enum_contradiction("f", ["C"], [("/p", _node(ABC))]) is None)
    check("ENUM-ORDER passes when ANY containing candidate admits the order",
          enum_contradiction("f", ["C", "A"],
                             [("/p", _node(ABC)), ("/q", _node(["C", "A", "B", "D"]))]) is None)
    check("membership outranks order -- a list that is both wrong reports ENUM",
          (enum_contradiction("f", ["C", "A", "Z"], [("/p", _node(ABC))]) or ("", ""))[0]
          == "ENUM")

    # --- the real tree -----------------------------------------------------------------------
    covered, findings = reconcile()
    kinds = Counter(f["kind"] for f in findings)
    check("real tree -- 24 operation pages compared", covered == 24)
    check("real tree -- 0 ENUM findings", not kinds.get("ENUM"))
    check("real tree -- 0 ENUM-ORDER findings", not kinds.get("ENUM-ORDER"))
    check("real tree -- 0 findings of any kind", not findings)

    print()
    if fails:
        print("[reconcile] SELFTEST FAILED - %d of %d case(s)" % (len(fails), len(total)))
        return 1
    print("[reconcile] SELFTEST OK - 0 failure(s) of %d case(s)" % len(total))
    return 0


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", metavar="PATH", help="also write the findings as JSON")
    ap.add_argument("--max", type=int, default=0,
                    help="exit 1 when the finding count exceeds this (default 0)")
    ap.add_argument("--selftest", action="store_true",
                    help="prove the enum classes can fire, against fixtures")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    covered, findings = reconcile()
    print(f"reconcile — {covered} operation page(s) compared against "
          f"{S.ASYNCAPI.replace(os.sep, '/')}")
    print(f"  {len(findings)} contradiction(s): {dict(Counter(f['kind'] for f in findings))}")

    cur = None
    for f in sorted(findings, key=lambda x: (x["op"], x["line"])):
        if f["op"] != cur:
            print(f"\n  {f['op']}  ({f['path']})")
            cur = f["op"]
        print(f"    {f['kind']:<13} :{f['line']:<5} {f['msg']}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(findings, fh, indent=1)
        print(f"\n  findings written to {args.json}")

    if len(findings) > args.max:
        print(f"\nFAIL — {len(findings)} contradiction(s), threshold {args.max}. The contract "
              "is the statement of truth: fix the prose, never the contract.")
        return 1
    print("\n  OK — every published field name, type, requiredness and allowed-value list "
          "either agrees with the contract or is something the contract does not model.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
