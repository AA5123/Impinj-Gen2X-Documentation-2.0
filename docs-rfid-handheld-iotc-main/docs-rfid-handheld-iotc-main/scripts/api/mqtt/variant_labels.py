#!/usr/bin/env python3
"""Every variant dropdown label must be a contract example name, and every order must be declared.

TWO ASSERTIONS, ONE GATE, because they are the two halves of the same artifact and each is
useless without the other:

  LABELS.  For each `<VariantSelect groupId>` in api/mqtt/prose/**, resolve the message that page
           documents and require every child `<Variant label>` to equal some `examples[].name`
           ON THAT MESSAGE. This is the check whose absence let 20 labels sit unnormalised since
           the initial commit -- `Delete wifi ca cert`, `WPA2 Personal connection`,
           `Network alert for ethernet` -- while the contract carried the correct strings all
           along.

  ORDER.   Require each control's `value` sequence to equal config/variant-order.json, so that an
           UNINTENDED reorder fails loudly instead of shipping.

  CONTRACT ORDER (owner decision, 2026-09-22). Require each control's labels, in published order,
           to be EXACTLY its message's examples[].name list in the contract's order -- every
           example, none missing, none reordered. The contract takes that order from the API
           definition's example_description.json, so a dropdown now reads in the order the API
           owners publish. This supersedes the docs-owned orders of 2026-09-09.

THREE PROPERTIES MAKE THE LABEL HALF CORRECT RATHER THAN MERELY PRESENT:

  1. PER-MESSAGE, NOT GLOBAL. The contract has 195 examples but only 178 distinct names, because
     uniqueness is scoped to the message (example naming N-19). A membership test against a flat
     set would happily pass a label belonging to a different operation.
  2. `VariantView` CHILDREN ARE EXCLUDED, BUT REPORTED. A VariantView is a follower sharing a
     groupId; it renders no `<select>`, so its children's `label` props never reach a reader.
     Counting them makes the gate report 22 findings where 20 are real. Ignoring them silently
     lets an authored-but-dead string rot forever. So they are excluded from the verdict and
     printed every run.
  3. AN UNRESOLVABLE TAG IS A FAILURE, NOT A SKIP. If a page's message cannot be resolved, or a
     groupId is missing, or a control is absent from the order file, that is reported -- because
     a checker that silently skips what it cannot parse reports zero on a tree it never read.
     This is the property lint-section-rendering.mjs documents at length for the same reason.

NO BASELINE. THRESHOLD 0. The distinction from gen:contract-lint is the whole design and not a
compromise: that gate is baselined because the contract cannot be edited from this repository, so
a zero threshold would sit permanently red on findings nobody here may fix -- a gate born red is a
gate born ignored. Every finding THIS gate reports is fixable here, in prose. Measured 0 on the
tree it lands with.

WHAT IT CANNOT CATCH, stated so nobody assumes otherwise: any Tier-2 rewording (forbidden anyway
-- example-naming T-1 permits case repair on an inherited name and forbids rewording it);
anything outside api/mqtt; `exampleCaption`, `title=`, `desc:`, headings and frontmatter; a class
the contract itself gets wrong; and the case where the docs and the contract are both wrong.

    python3 scripts/api/mqtt/variant_labels.py             check, exit 2 on any finding
    python3 scripts/api/mqtt/variant_labels.py --report    print every control and label, exit 0
    python3 scripts/api/mqtt/variant_labels.py --selftest  prove the check can fail
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(_HERE, "config", "routing-manifest.json")
ORDER_FILE = os.path.join(_HERE, "config", "variant-order.json")
WAIVERS = os.path.join(_HERE, "config", "variant-label-waivers.json")

sys.path.insert(0, _HERE)
import schema as S  # noqa: E402  (for ASYNCAPI, so the path is defined in exactly one place)

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(_HERE)))
PROSE_ROOT = os.path.join(_REPO, "api", "mqtt", "prose")

EXIT_OK = 0
EXIT_FINDINGS = 2

# `\1` closes whichever tag opened, so a VariantSelect and a VariantView cannot be conflated.
GROUP = re.compile(r"<(VariantSelect|VariantView)\b([^>]*)>(.*?)</\1>", re.S)
VARIANT = re.compile(r"<Variant\b([^>]*?)/?>")
ATTR = re.compile(r'(\w+)="([^"]*)"')


# --- resolution ----------------------------------------------------------------------------------

def message_name(doc: dict, ptr: str | None) -> str | None:
    """A message pointer -> a components.messages key, following one $ref.

    All 24 req_ptr values are `#/components/messages/<name>`; all 20 non-null resp_ptr values are
    `#/channels/<ch>/messages/<name>`, whose node is a $ref into components. Following it is not
    optional: relying on the two names coinciding is an assumption the contract never made."""
    if not ptr:
        return None
    node = doc
    for tok in ptr.lstrip("#/").split("/"):
        tok = tok.replace("~1", "/").replace("~0", "~")
        if isinstance(node, list):
            try:
                node = node[int(tok)]
            except (ValueError, IndexError):
                return None
        elif isinstance(node, dict) and tok in node:
            node = node[tok]
        else:
            return None
    if isinstance(node, dict) and "$ref" in node:
        ref = node["$ref"]
        return ref.rsplit("/", 1)[-1] if ref.startswith("#/components/messages/") else None
    return ptr.rsplit("/", 1)[-1] if ptr.startswith("#/components/messages/") else None


def example_lists(doc: dict) -> dict[str, list[str]]:
    """message -> its examples[].name values, in the contract's order."""
    return {mn: [e["name"] for e in (msg.get("examples") or []) if e.get("name")]
            for mn, msg in (doc.get("components", {}).get("messages") or {}).items()}


def contract_order_findings(controls: list[dict], lists: dict[str, list[str]]) -> list[dict]:
    """A control whose labels are not exactly its message's example names, in contract order."""
    out = []
    for c in controls:
        labels = [v.get("label") for v in c["variants"]]
        msg = next((m for m in c["msgs"] if set(labels) <= set(lists.get(m, []))), None)
        if msg is None:
            continue   # a label that is on no message is already a LABEL finding
        want = lists[msg]
        if labels != want:
            out.append({**c, "msg": msg, "have": labels, "want": want,
                        "missing": [n for n in want if n not in labels]})
    return out


def example_names(doc: dict) -> dict[str, set[str]]:
    out = {}
    for mn, msg in (doc.get("components", {}).get("messages") or {}).items():
        out[mn] = {e["name"] for e in (msg.get("examples") or []) if e.get("name")}
    return out


def load_json(path: str, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# --- collection ----------------------------------------------------------------------------------

def collect() -> tuple[list[dict], list[dict], list[str]]:
    """-> (rendered controls, inert VariantView groups, hard errors)."""
    with open(S.ASYNCAPI, encoding="utf-8") as fh:
        doc = json.load(fh)
    manifest = load_json(MANIFEST, {})
    ops = {o["op"]: o for o in S.discover_operations()}
    names = example_names(doc)

    controls, inert, errors = [], [], []
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
        pool = set()
        for m in msgs:
            pool |= names.get(m, set())

        for tag, attrs, body in GROUP.findall(src):
            a = dict(ATTR.findall(attrs))
            gid = a.get("groupId")
            variants = [dict(ATTR.findall(v)) for v in VARIANT.findall(body)]
            if not gid:
                # An unresolvable tag is a failure, not a skip.
                errors.append("api/mqtt/prose/%s :: a <%s> with %d child variant(s) carries no "
                              "groupId, so nothing can address it" % (rel, tag, len(variants)))
                continue
            rec = {"op": op, "rel": rel, "tag": tag, "gid": gid,
                   "control": a.get("label", ""), "msgs": msgs, "pool": pool,
                   "variants": variants}
            (inert if tag == "VariantView" else controls).append(rec)

        if not msgs and (op in {c["op"] for c in controls}):
            errors.append("%s :: neither req_ptr nor resp_ptr resolves to a components.messages "
                          "key, so its labels cannot be checked" % op)
    return controls, inert, errors


def run() -> dict:
    controls, inert, errors = collect()
    order_blob = load_json(ORDER_FILE, None)
    waivers = (load_json(WAIVERS, {}) or {}).get("waived") or {}

    if order_blob is None:
        errors.append("config/variant-order.json is missing. The order half of this gate cannot "
                      "run, and a silently half-running gate is worse than a failing one.")
        declared = {}
    else:
        declared = order_blob.get("controls") or {}

    label_findings, order_findings, seen_waivers, missing_no_label = [], [], set(), []

    for c in controls:
        for v in c["variants"]:
            lab, val = v.get("label"), v.get("value")
            if val is None:
                # `value` absent would make `label` the sync key (VariantSelect.tsx:129) --
                # a latent hazard, so it is a finding rather than a shrug.
                missing_no_label.append("api/mqtt/prose/%s :: <Variant> in %s has no value="
                                        % (c["rel"], c["gid"]))
                continue
            if lab is None:
                continue
            if lab in c["pool"]:
                continue
            wkey = "%s:%s:%s" % (c["rel"], c["gid"], val)
            if wkey in waivers:
                seen_waivers.add(wkey)
                continue
            label_findings.append({**c, "label": lab, "value": val})

    # --- order, exhaustive in both directions ---------------------------------------------------
    live = {c["gid"]: c for c in controls}
    for gid in sorted(set(live) | set(declared)):
        if gid not in declared:
            order_findings.append({"gid": gid, "rel": live[gid]["rel"], "kind": "undeclared",
                                   "have": [v.get("value") for v in live[gid]["variants"]],
                                   "want": None})
            continue
        if gid not in live:
            order_findings.append({"gid": gid, "rel": declared[gid].get("page", "?"),
                                   "kind": "declared-but-absent",
                                   "have": None, "want": declared[gid].get("order")})
            continue
        have = [v.get("value") for v in live[gid]["variants"]]
        want = declared[gid].get("order")
        if have != want:
            kind = "reordered" if sorted(map(str, have)) == sorted(map(str, want or [])) \
                else "membership-changed"
            order_findings.append({"gid": gid, "rel": live[gid]["rel"], "kind": kind,
                                   "have": have, "want": want})

    with open(S.ASYNCAPI, encoding="utf-8") as fh:
        lists = example_lists(json.load(fh))
    return {"controls": controls, "inert": inert, "errors": errors + missing_no_label,
            "labels": label_findings, "order": order_findings,
            "contract": contract_order_findings(controls, lists),
            "waivers": waivers, "stale": sorted(set(waivers) - seen_waivers)}


# --- reporting -----------------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--report", action="store_true", help="print every control and label, exit 0")
    ap.add_argument("--selftest", action="store_true", help="prove the check can fail")
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()

    r = run()
    n_lab = sum(len(c["variants"]) for c in r["controls"])

    if r["waivers"]:
        print("WAIVED (%d) -- printed in full every run so this file cannot hide:"
              % len(r["waivers"]))
        for k in sorted(r["waivers"]):
            print("  %s\n      %s" % (k, r["waivers"][k]))
        print()

    # Excluded from the verdict, printed anyway -- see property 2 in the module docstring.
    if r["inert"]:
        print("AUTHORED BUT NEVER RENDERED (%d group(s)) -- a <VariantView> is a follower with no "
              "<select>, so these `label` props reach no reader. Excluded from the verdict; "
              "printed so they cannot rot:" % len(r["inert"]))
        for c in r["inert"]:
            for v in c["variants"]:
                print("  %-40s %-28s %-22s %r"
                      % (c["rel"], c["gid"], v.get("value", "?"), v.get("label")))
        print()

    if args.report:
        for c in r["controls"]:
            print("%s  [%s] %r  <- %s" % (c["rel"], c["gid"], c["control"], ", ".join(c["msgs"])))
            for v in c["variants"]:
                mark = "ok " if v.get("label") in c["pool"] else "NO "
                print("    %s %-24s %r" % (mark, v.get("value"), v.get("label")))
        print()

    ok = True
    if r["errors"]:
        ok = False
        print("CANNOT RUN (%d) -- an unresolvable tag is a failure, not a skip:" % len(r["errors"]))
        for e in r["errors"]:
            print("  " + e)
        print()
    if r["stale"]:
        ok = False
        print("STALE WAIVERS (%d) -- the label named no longer needs waiving, so the reason "
              "recorded is no longer true. Delete the entry:" % len(r["stale"]))
        for k in r["stale"]:
            print("  " + k)
        print()
    if r["labels"]:
        ok = False
        print("LABEL FINDINGS (%d) -- a rendered label that is not an examples[].name on the "
              "message its page documents:" % len(r["labels"]))
        for f in r["labels"]:
            print("  %s  [%s]  value=%s" % (f["rel"], f["gid"], f["value"]))
            print("      label:    %r" % f["label"])
            print("      joined against: %s" % ", ".join(f["msgs"]))
        print()
    if r["order"]:
        ok = False
        print("ORDER FINDINGS (%d) -- the published order disagrees with "
              "config/variant-order.json:" % len(r["order"]))
        for f in r["order"]:
            print("  %s  [%s]  %s" % (f["rel"], f["gid"], f["kind"]))
            if f["have"] is not None:
                print("      published: %s" % ", ".join(map(str, f["have"])))
            if f["want"] is not None:
                print("      declared:  %s" % ", ".join(map(str, f["want"])))
        print()

    if r["contract"]:
        ok = False
        print("CONTRACT-ORDER FINDINGS (%d) -- a dropdown whose labels are not exactly its message's "
              "examples[].name list, in the contract's order:" % len(r["contract"]))
        for f in r["contract"]:
            print("  %s  [%s]  <- %s" % (f["rel"], f["gid"], f["msg"]))
            print("      published: %s" % " | ".join(map(str, f["have"])))
            print("      contract:  %s" % " | ".join(map(str, f["want"])))
            if f["missing"]:
                print("      missing:   %s" % " | ".join(f["missing"]))
        print()

    print("=" * 72)
    if args.report:
        return EXIT_OK
    if ok:
        print("[variant-labels] OK - %d label(s) across %d control(s) all match an examples[].name "
              "on their own message, in the contract's order; %d declared order(s) hold "
              "(%d waived, %d inert)"
              % (n_lab, len(r["controls"]), len(r["order"]) == 0 and len(r["controls"]) or 0,
                 len(r["waivers"]), sum(len(c["variants"]) for c in r["inert"])))
        return EXIT_OK
    print("[variant-labels] %d label finding(s), %d order finding(s), %d contract-order finding(s), "
          "%d stale waiver(s), %d error(s). Threshold is 0."
          % (len(r["labels"]), len(r["order"]), len(r["contract"]), len(r["stale"]), len(r["errors"])))
    return EXIT_FINDINGS


# --- self-test -----------------------------------------------------------------------------------

def selftest() -> int:
    fails, total = [], []

    def check(label, cond):
        total.append(label)
        print("  %-4s %s" % ("OK" if cond else "FAIL", label))
        if not cond:
            fails.append(label)

    with open(S.ASYNCAPI, encoding="utf-8") as fh:
        doc = json.load(fh)
    names = example_names(doc)

    # --- the property that makes it correct: per-message, not global ---------------------------
    flat = set()
    for s in names.values():
        flat |= s
    check("the contract has FEWER distinct names than examples, so a flat set is unsafe",
          sum(len(s) for s in names.values()) > len(flat))
    # A real name from one message must NOT be accepted on another.
    borrowed = next(iter(names["setWifiCommand"]))
    check("a real setWifiCommand name is not an examples[].name on getEthResponse",
          borrowed not in names["getEthResponse"])
    check("...but it IS in the flat set, which is exactly the mistake being avoided",
          borrowed in flat)

    # --- pointer resolution ---------------------------------------------------------------------
    check("message_name follows a channel $ref",
          message_name(doc, "#/channels/response/messages/setOsResponse") == "setOsResponse")
    check("message_name reads a direct components pointer",
          message_name(doc, "#/components/messages/setOsCommand") == "setOsCommand")
    check("message_name returns None for a dangling pointer",
          message_name(doc, "#/components/messages/nope") is None)
    check("message_name returns None for None", message_name(doc, None) is None)

    # --- tag parsing: the VariantView exclusion -------------------------------------------------
    sample = ('<VariantSelect label="L" groupId="g-a">\n'
              '<Variant value="x" label="X">body</Variant>\n'
              '</VariantSelect>\n'
              '<VariantView groupId="g-a">\n'
              '<Variant value="x" label="SHADOW">body</Variant>\n'
              '</VariantView>\n')
    got = GROUP.findall(sample)
    check("GROUP finds both a VariantSelect and a VariantView", len(got) == 2)
    check("GROUP does not conflate the two tags",
          {g[0] for g in got} == {"VariantSelect", "VariantView"})
    check("VARIANT finds the child of each group",
          all(len(VARIANT.findall(g[2])) == 1 for g in got))
    nested = '<VariantSelect groupId="g"><Variant value="a" label="A">{ "k": "}" }</Variant></VariantSelect>'
    check("a brace inside a child body does not break group matching",
          len(GROUP.findall(nested)) == 1)

    # --- the order half -------------------------------------------------------------------------
    blob = load_json(ORDER_FILE, None)
    check("variant-order.json exists and parses", isinstance(blob, dict))
    ctrls = (blob or {}).get("controls") or {}
    check("it is exhaustive over the live controls", len(ctrls) == 17)
    check("every entry carries page, control, order and note",
          all({"page", "control", "order", "note"} <= set(v) for v in ctrls.values()))
    check("every note is a real sentence, not a placeholder",
          all(len(v["note"]) > 40 for v in ctrls.values()))
    check("every order is a list of unique non-empty value slugs",
          all(v["order"] and len(set(v["order"])) == len(v["order"]) for v in ctrls.values()))
    check("every note records the contract-order rule",
          all(v["note"].startswith("CONTRACT ORDER") for v in ctrls.values()))

    # --- the contract-order half ----------------------------------------------------------------
    lists = example_lists(doc)
    fake = {"rel": "x.mdx", "gid": "g", "msgs": ["setPostFilterCommand"],
            "variants": [{"label": n} for n in lists["setPostFilterCommand"]]}
    check("contract order: the contract's own list, in its own order, is clean",
          not contract_order_findings([fake], lists))
    swapped = {**fake, "variants": list(reversed(fake["variants"]))}
    check("contract order: the same labels reversed are a finding",
          len(contract_order_findings([swapped], lists)) == 1)
    short = {**fake, "variants": fake["variants"][:-1]}
    f = contract_order_findings([short], lists)
    check("contract order: a missing example is a finding, and named",
          len(f) == 1 and f[0]["missing"] == lists["setPostFilterCommand"][-1:])

    # --- the real tree --------------------------------------------------------------------------
    r = run()
    check("real tree -- 0 hard errors", not r["errors"])
    check("real tree -- 0 label findings", not r["labels"])
    check("real tree -- 0 order findings", not r["order"])
    check("real tree -- 0 stale waivers", not r["stale"])
    check("real tree -- 0 contract-order findings", not r["contract"])
    # 76 since 2026-09-22: every contract example is a variant -- including Add data endpoint with
    # batching, the two base64 MQTT installs, Barcode data event and Delete post filter.
    check("real tree -- 17 rendered controls, 76 labels",
          len(r["controls"]) == 17 and sum(len(c["variants"]) for c in r["controls"]) == 76)
    check("real tree -- the 2 inert VariantView labels are found and excluded",
          sum(len(c["variants"]) for c in r["inert"]) == 2)

    print()
    if fails:
        print("[variant-labels] SELFTEST FAILED - %d of %d case(s)" % (len(fails), len(total)))
        return 1
    print("[variant-labels] SELFTEST OK - 0 failure(s) of %d case(s)" % len(total))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
