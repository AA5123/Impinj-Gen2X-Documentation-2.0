#!/usr/bin/env python3
"""
contract_lint.py — mechanical self-consistency checks over the AsyncAPI contract.

WHY THIS EXISTS. api/mqtt/schema/iotc-rfd40-90-mqtt.asyncapi.json is the statement of truth
for the whole MQTT surface, and until now it was THE ONLY UNGUARDED ARTIFACT IN THE CHAIN.
The reference that documents it has six gates in `--check`, a reconciler at threshold 0, a
spine gate and 21 self-test cases. The contract itself had nothing. 21 defects were filed
against it by hand across 2026-09-08/09 (see schema-issues-2026-09-08.md), and **12 of those
were found only because five new documentation sections had to make positive claims about the
data plane** — which is a discovery method that does not scale and does not repeat.

WHY IT IS BASELINED RATHER THAN ZERO-THRESHOLD, and this is the load-bearing design decision.
THE CONTRACT MUST NOT BE EDITED FROM THIS REPOSITORY. So a gate that failed on the defects it
finds would be a gate nobody here is permitted to fix — exactly the failure mode
.github/workflows/validate.yml records as the reason a previous gate was deactivated ("the
gate checks a thing nobody is permitted to fix"). A gate born red is a gate born ignored.

So the job here is NOT "the contract is clean". It is: **the next contract drop introduces no
NEW defect of a class we can already detect.** Each check reports a count; the counts are
recorded in config/contract-baseline.json; and the gate fails when a count MOVES.

IT FAILS IN BOTH DIRECTIONS, ON PURPOSE.
  * A count that went UP is a regression in the incoming drop. Report it upstream.
  * A count that went DOWN is good news and still a failure, because the baseline is now a
    false claim about the contract. Lower it in the same commit that observes the fix.
There is deliberately NO per-finding suppression. An escape hatch on a threshold gate is how
the threshold dies: whatever silences one finding will eventually silence a real one, and the
silencing looks identical in review.

WHAT IT DOES NOT DO. It is not an AsyncAPI spec validator and does not replace one. Testing
settled that question: `npx @asyncapi/cli validate` returns 0 errors and 0 warnings on this
document and finds NONE of the 21 filed defects, because they are not spec violations — they
are a narrative statement disagreeing with a keyword in the same file. That is the class this
checks.

Usage:
  python3 scripts/api/mqtt/contract_lint.py              # check against the baseline
  python3 scripts/api/mqtt/contract_lint.py --report     # list every finding, exit 0
  python3 scripts/api/mqtt/contract_lint.py --selftest   # prove each check can fire
"""

from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
BASELINE = os.path.join(_HERE, "config", "contract-baseline.json")

sys.path.insert(0, _HERE)
import schema as S  # noqa: E402  (for ASYNCAPI, so the path is defined in exactly one place)

EXIT_OK = 0
EXIT_FINDINGS = 2
EXIT_CANNOT_RUN = 3

# A description that asserts a constraint the node does not declare. Narrow on purpose: only
# the three keywords whose absence is checkable without interpreting prose.
_ASSERTS = re.compile(r"`?(maxLength|maxItems|minItems)`?\s*(?:of|:|=|is)?\s*`?(\d+)`?", re.I)


def _walk(node, path=""):
    """Every (path, key, value) in the document, paths as RFC 6901 pointers."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield path, k, v
            yield from _walk(v, path + "/" + k.replace("~", "~0").replace("/", "~1"))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, path + "/" + str(i))


def _resolve(doc, ptr):
    cur = doc
    for tok in ptr.lstrip("#/").split("/"):
        tok = tok.replace("~1", "/").replace("~0", "~")
        if isinstance(cur, list):
            try:
                cur = cur[int(tok)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            if tok not in cur:
                return None
            cur = cur[tok]
        else:
            return None
    return cur


def _tracked_basenames():
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True)
    return {os.path.basename(f) for f in out.stdout.split()}


# --------------------------------------------------------------------------- #
# the checks. each returns a list of "pointer :: detail" strings.
# --------------------------------------------------------------------------- #
def check_unresolvable_refs(doc, _tracked):
    """An internal $ref pointing at a node that is not there.

    Expected to stay at zero: this is the one class that is a hard defect rather than a
    disagreement, and the document is currently clean."""
    out = []
    for path, key, val in _walk(doc):
        if key == "$ref" and isinstance(val, str) and val.startswith("#/"):
            if _resolve(doc, val) is None:
                out.append(f"{path}/$ref :: {val} does not resolve")
    return out


# WHERE A DANGLING FILE CITATION CAN HIDE. Widened 2026-09-09.
#
# This started as `x-iotc-provenance` alone, and that was the wrong scope by a factor of two.
# The provenance layer is a MACHINE field: nothing publishes it, so a dangling name there is
# hygiene. The same dead filenames also appear in `description` and `summary`, which the
# generator CAN put in front of a reader — so the citations that actually reach a page were the
# ones this check could not see. Measured: 230 findings before, 530 after.
#
# `name` and `title` are deliberately NOT in this tuple. Both are short display strings; neither
# carries a file citation anywhere in this document, and including them would only add a way for
# a future filename-shaped label to be reported as a citation.
CITATION_KEYS = ("x-iotc-provenance", "description", "summary")


def check_provenance_dangling(doc, tracked):
    """A schema file named anywhere in the contract that is not in this repository.

    The whole provenance layer points at the pre-AsyncAPI schema tree, deleted at c4d7de7c.
    They are unusable as citations, and anything that publishes one adds a reference to a file
    that does not exist — which scripts/site/lint-schema-citations.mjs would then flag on the
    page rather than on the contract.

    THE NAME IS NOW SLIGHTLY NARROWER THAN THE CHECK, and that is deliberate: renaming the key
    would move a baseline entry, and a baseline whose keys shift cannot be compared across
    drops. The key stays `provenance_dangling`; read it as "dangling schema-file citation"."""
    out = []
    for path, key, val in _walk(doc):
        if key not in CITATION_KEYS:
            continue
        vals = val if isinstance(val, list) else [val]
        for v in vals:
            if not isinstance(v, str):
                continue
            for m in re.finditer(r"([\w.-]+\.(?:ya?ml|json))", v):
                if m.group(1) not in tracked:
                    out.append(f"{path} :: names {m.group(1)}, which is not in the repository")
    return out


# THE KEY TUPLE AND THE MARKER SET WERE BOTH TOO NARROW, and they had to be widened together
# or the widening proves nothing. Widened 2026-09-09.
#
#   THE KEY. This read `key == "description"`. But the largest instance of the defect it names
# lives in `summary`: 86 example summaries carry `Also published as "<doc label>"` and 81 are
# nothing but a citation of the API reference site generated FROM this contract, hard-coding 24
# techdocs.zebra.com routes. `summary` is published — it is the text under an example — so those
# were the findings most worth having and the check could not reach them.
#
#   THE MARKER. Widening the key alone would still have missed them, because none of the 86
# contains "IS CLOSED", "UNRESOLVED" or "the API reference states". Two markers are added for
# the self-citation shape, which is the same defect this check already names in its docstring:
# the statement of truth deferring to its own generated output.
EDITORIAL_KEYS = ("description", "summary")
_EDITORIAL_MARKERS = re.compile(
    r"IS CLOSED|PREMISE WAS WRONG|API reference states|"
    r"Also published as|Published on the API reference page|"
    r"\bDECISION\b|\bUNRESOLVED\b|\bTODO\b|\bFIXME\b", re.I)


def check_review_state_in_description(doc, _tracked):
    """Review, decision or self-citation state inside a published field gloss.

    A description or an example summary is published text: the generator can put it in front of
    a reader. Text like "IS CLOSED, AND ITS PREMISE WAS WRONG", a sentence quoting what "the API
    reference states", or a back-link naming the label the reference site publishes, all invert
    the direction of authority — the statement of truth deferring to its own generated output —
    and none of them is usable as a gloss."""
    out = []
    for path, key, val in _walk(doc):
        if key in EDITORIAL_KEYS and isinstance(val, str):
            m = _EDITORIAL_MARKERS.search(val)
            if m:
                out.append(f"{path}/{key} :: carries editorial marker {m.group(0)!r}")
    return out


def check_constraint_only_in_prose(doc, _tracked):
    """A numeric constraint that exists only in a description — the node declares no keyword.

    NAMED CAREFULLY, because the first draft of this check called it "asserted_constraint_absent"
    and that was wrong about its own findings. Inspecting all 11 showed three shapes, and they
    are all the same defect from a consumer's point of view:

      * the description ASSERTS a limit the node never declares (`selectPayload.tagPattern`
        cites maxLength 64; `commandName` cites 256);
      * the description RETIRES one (`dataEventPayload.tagData` explains that an earlier
        revision asserted `maxItems: 40` and that it is withdrawn);
      * the description records it as DECLARED-BUT-UNENFORCED (`subscribeTopics`, which
        schema-issues-2026-09-08.md §4.6 already carries as a deliberate hold).

    In every one of the three, THE CONSTRAINT IS IN PROSE AND NOT IN A KEYWORD, so no consumer
    can enforce it and no validator can see it. That is the class worth counting, and it is why
    the check does not try to tell the three apart — distinguishing "asserts" from "retires"
    would mean reading prose, which is how a checker starts being wrong.

    Only fires when a description names one of three keywords WITH a number and the node lacks
    that keyword."""
    out = []
    for path, key, val in _walk(doc):
        if key != "description" or not isinstance(val, str):
            continue
        node = _resolve(doc, "#" + path) if path else None
        if not isinstance(node, dict):
            continue
        for m in _ASSERTS.finditer(val):
            kw = m.group(1)
            if kw not in node:
                out.append(f"{path}/description :: asserts {kw} {m.group(2)}, "
                           f"but the node declares no {kw}")
    return out


CHECKS = {
    "unresolvable_refs": check_unresolvable_refs,
    "provenance_dangling": check_provenance_dangling,
    "review_state_in_description": check_review_state_in_description,
    "constraint_only_in_prose": check_constraint_only_in_prose,
}


def run_checks():
    with open(S.ASYNCAPI, encoding="utf-8") as fh:
        doc = json.load(fh)
    tracked = _tracked_basenames()
    return {name: fn(doc, tracked) for name, fn in CHECKS.items()}


def cmd_check(report_only=False):
    if not os.path.exists(S.ASYNCAPI):
        print(f"[contract-lint] CANNOT RUN — contract not found at {S.ASYNCAPI}")
        sys.exit(EXIT_CANNOT_RUN)
    results = run_checks()

    if report_only:
        for name, findings in results.items():
            print(f"\n[contract-lint] {name}: {len(findings)}")
            for f in findings:
                print("  " + f)
        sys.exit(EXIT_OK)

    with open(BASELINE, encoding="utf-8") as fh:
        base = json.load(fh)
    expected = base["counts"]

    problems = []
    for name in sorted(CHECKS):
        got, want = len(results[name]), expected.get(name)
        if want is None:
            problems.append(f"{name}: no baseline recorded. Add it to {os.path.relpath(BASELINE)}.")
            continue
        if got > want:
            problems.append(
                f"{name}: {got} findings, baseline {want} — {got - want} NEW. The incoming "
                "contract introduced a defect of a class already known. Report it upstream "
                "and do NOT raise the baseline to hide it.")
            for f in results[name][:5]:
                problems.append("    " + f)
        elif got < want:
            problems.append(
                f"{name}: {got} findings, baseline {want} — {want - got} FIXED upstream. Good "
                f"news, and still a failure: the baseline in {os.path.relpath(BASELINE)} is now "
                "a false claim about the contract. Lower it to " + str(got) + ".")
        print(f"  {name}: {got} (baseline {want}) {'OK' if got == want else 'MOVED'}")

    if problems:
        print("\n[contract-lint] FINDINGS")
        for p in problems:
            print("  " + p)
        print(f"\n[contract-lint] {len(problems)} problem(s). The contract is READ-ONLY from this "
              "repository — a moved count is a message to its owner, not a file to edit here.")
        sys.exit(EXIT_FINDINGS)
    print(f"\n[contract-lint] OK — {len(CHECKS)} check(s) match the recorded baseline")
    sys.exit(EXIT_OK)


def cmd_selftest():
    """Prove every check can fire, on synthetic documents. Uses the REAL check functions."""
    fails = []
    cases = 0

    def ok(label, cond):
        nonlocal cases
        cases += 1
        print(f"  {'OK  ' if cond else 'FAIL'} {label}")
        if not cond:
            fails.append(label)

    tracked = {"real.yaml"}

    ok("unresolvable_refs fires on a dangling internal $ref",
       len(check_unresolvable_refs({"a": {"$ref": "#/nope/missing"}}, tracked)) == 1)
    ok("unresolvable_refs stays silent on a resolvable one",
       check_unresolvable_refs({"t": {"x": 1}, "a": {"$ref": "#/t/x"}}, tracked) == [])
    ok("provenance_dangling fires on a file not in the repo",
       len(check_provenance_dangling({"x-iotc-provenance": ["(gone.yaml:1)"]}, tracked)) == 1)
    ok("provenance_dangling accepts a tracked file",
       check_provenance_dangling({"x-iotc-provenance": ["(real.yaml:1)"]}, tracked) == [])
    ok("provenance_dangling reads a LIST value (the shape the contract uses)",
       len(check_provenance_dangling(
           {"x-iotc-provenance": ["(a.yaml:1)", "(b.yaml:2)"]}, tracked)) == 2)
    ok("review_state_in_description fires on review commentary",
       len(check_review_state_in_description({"description": "This IS CLOSED, and wrong."}, tracked)) == 1)
    ok("review_state_in_description leaves an ordinary gloss alone",
       check_review_state_in_description({"description": "The tag identifier."}, tracked) == [])
    ok("constraint_only_in_prose fires when the node lacks the keyword its description cites",
       len(check_constraint_only_in_prose(
           {"p": {"description": "A maxLength of 48 applies."}}, tracked)) == 1)
    ok("constraint_only_in_prose stays silent when the node declares it",
       check_constraint_only_in_prose(
           {"p": {"maxLength": 48, "description": "A maxLength of 48 applies."}}, tracked) == [])
    ok("constraint_only_in_prose also counts a RETIRED keyword (it is still prose-only)",
       len(check_constraint_only_in_prose(
           {"p": {"description": "An earlier revision asserted maxItems 40; it is withdrawn."}},
           tracked)) == 1)

    # the baseline must name exactly the checks that exist — a check with no baseline is
    # unenforced, and a baseline with no check is a claim nothing measures
    with open(BASELINE, encoding="utf-8") as fh:
        base = json.load(fh)
    ok("every check has a baseline and every baseline has a check",
       set(base["counts"]) == set(CHECKS))

    print(f"\n[contract-lint] SELFTEST {'OK' if not fails else 'FAILED'} — "
          f"{len(fails)} failure(s) of {cases} cases")
    sys.exit(EXIT_OK if not fails else EXIT_FINDINGS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--report", action="store_true",
                    help="list every finding and exit 0 (for raising them upstream)")
    a = ap.parse_args()
    if a.selftest:
        cmd_selftest()
    else:
        cmd_check(report_only=a.report)


if __name__ == "__main__":
    main()
