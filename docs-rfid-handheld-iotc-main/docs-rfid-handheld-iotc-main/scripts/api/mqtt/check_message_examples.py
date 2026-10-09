#!/usr/bin/env python3
"""Check every AsyncAPI Message Example Object's `name` and position against the doctrine.

Implements, rule for rule, the example naming specification (N-1 .. N-27) and the example
ordering specification (A-1, A-2, T-2, T-3, C-1).

Self-contained: standard library only, NO repository imports. Point it at any AsyncAPI 3.0.0
document with `--contract PATH` and it works unchanged. That property is deliberate and worth
keeping: it is why a refactor of the generator beside it cannot break this checker, and why it
stays diffable against the upstream kit it came from.

ADOPTED FROM THE PORTABLE KIT, 2026-09-09, AS A CONFIGURED FORK. Exactly three constants differ
from upstream -- `MODE_NAMES` gained `WPA3-Personal`, `TAIL_CODE_EXCEPTIONS` gained
`deleteWifiProfileResponse`, and `INHERITED_NAMES` (2026-09-22) is `True` -- each marked
`CONFIGURED` below with its reason. `DEFAULT_CONTRACT`
is deliberately left `None`: the path is supplied by the npm alias, so this file keeps no
knowledge of the repository it sits in. Provenance and how to diff a future upstream version:
docs/example-doctrine-provenance.md.

Two things this checker deliberately does NOT do, because both would be wrong:

  * It does not assert payload equality across a `(reference site variant)` pair. The pair exists
    precisely because two publishers ship different bytes for one scenario (naming N-16).
  * It does not assert global name uniqueness. Uniqueness is scoped to the message; 178 distinct
    names over 195 examples is correct (naming N-19).

Severity follows naming-specification section 8. An inherited irregularity is a WARNING, never an
error: promoting it would demand rewording strings this repository does not own, which N-24 forbids.

    python check_message_examples.py --contract api.json            report everything
    python check_message_examples.py --contract api.json --check    exit 1 on any error
    python check_message_examples.py --selftest                     run the rule fixtures
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Portable edition: there is no default document. --contract is required.
DEFAULT_CONTRACT = None

# =================================================================================================
# CONFIGURE ME.  Everything in this block is project vocabulary, not doctrine.  The values shipped
# here are the reference project's; replace them with your own.  See README.md and naming spec S2.
# =================================================================================================

ACRONYMS = {
    'MQTT', 'CA', 'MDM', 'MGMT', 'TLS', 'TTLS', 'PEAP', 'EAP', 'AP', 'EPC', 'TID', 'HTTP',
    'HTTPS', 'URL', 'OS', 'IP', 'DHCP', 'QoS', 'RFID', 'WPA2', 'WPA3', 'IoTC', 'SSID',
    'API',   # C-1: an acronym that appears in prose but in no enum, so it is named here
}
MODE_NAMES = {'Wi-Fi', 'WPA2-Personal', 'WPA2-Enterprise', 'WPA3-Personal',
              'WPA3-Enterprise'}
# CONFIGURED: `WPA3-Personal` added 2026-09-09. It is absent upstream and absent from this
# contract -- measured 0 of 195 example names, against 8 each for the other three -- but the
# documentation publishes the mode (`WPA3Personal` appears 9x in api/mqtt/prose/mgmt/set-wifi.mdx
# and all four are named in the routing-manifest page description), so a drop that finally ships
# a WPA3-Personal example must not be reported as a defect for spelling it the Wi-Fi Alliance's
# way. Admitting an unused compound costs nothing: LEGAL_COMPOUNDS only ever WIDENS what N-6
# accepts, so this can produce no new finding and can suppress none that exists today.
ENUM_LITERALS = {
    'ADVANCED', 'CERTIFICATE', 'CONNECTED', 'DELETE', 'DIRECT', 'FIRMWARE_UPDATE',
    'SET', 'START', 'STOP',
}
# Identifiers that may legally open a name in their own case (N-8 outranks N-7).
EVENT_IDS = {'alerts', 'dataEVT', 'heartBeatEVT', 'mqttConnEVT'}
STRUCTURED_HEADS = {'Request', 'Response'} | EVENT_IDS

VARIANT_SUFFIX = ' (reference site variant)'
SEPARATOR = ' -- '
MIDDLE_DOT = '·'
ALLOWED_NON_ASCII = {MIDDLE_DOT}

ENVELOPE_GENERICS = {'Request payload', 'Response payload', 'Event payload'}

# N-6: hyphen-joined tokens that are legal without surrounding spaces.
LEGAL_COMPOUNDS = MODE_NAMES | {
    'Pre-installed', 'access-operation', 'Set-preferred', 'base64-encoded', 'WPA2-personal',
}

CODE_PAREN = re.compile(r'^\(code (\d+|omitted)(; [a-z][a-zA-Z]* abridged)?\)$')
SOFT_LEN, HARD_LEN = 56, 80

# Ordering spec S6: messages whose tail deliberately departs from ascending-code order.
# Add a message here only with a recorded reason in your ordering specification.
#
# CONFIGURED 2026-09-09. The reason is recorded in
# docs/example-ordering-specification.md section 6, "Recorded departures", as S6 requires
# -- "record the departure rather than smoothing it over" -- and is summarised here so the
# constant is not a bare string somebody later deletes as unexplained.
#
#   deleteWifiProfileResponse ships codes [0, 16, 15] over three examples, in the order the API
#   definition publishes them (openapi.json, labelled by example_description.json): "Successful
#   deletion", "Cannot delete active SSID", "SSID not found". Putting 15 before 16 requires
#   reordering a SHIPPED array, which ordering section 0 forbids outright because `examples[N]`
#   is a published address, and here the order is also the upstream publisher's. Until
#   2026-09-21 the tail was [0, 16, 16, 15, 15], each code with its `(reference site variant)`
#   twin; the rebuild dropped the twins and kept the departure. Nothing to fix; a departure to
#   record.
TAIL_CODE_EXCEPTIONS: set[str] = {'deleteWifiProfileResponse'}

# CONFIGURED 2026-09-22. Every example name in this contract is INHERITED VERBATIM: since the
# 2026-09-21 rebuild the contract takes each name, unchanged, from the IoT Connector API
# definition (openapi.json, which takes it from example_description.json), and the contract owner
# decided the names must match that source exactly. So the one N-9 correction the naming
# specification allows on an inherited name -- case and typography (track T-1) -- is not ours to
# make, and specification section 6 is explicit that an irregularity only the upstream publisher
# can correct is a WARNING: "Inherited irregularities must be warnings, not errors." With this
# True, the two N-9 spellings this fork reports as errors -- the Wi-Fi brand token and the
# unhyphenated Wi-Fi Alliance mode name -- are reported as warnings. Every other rule keeps its
# severity. The self-test runs its fixtures with this False, so the rule is still proven to fire,
# and proves the demotion separately.
INHERITED_NAMES = True


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.infos: list[str] = []

    def error(self, rule: str, where: str, msg: str) -> None:
        self.errors.append('%-6s %-52s %s' % (rule, where, msg))

    def warn(self, rule: str, where: str, msg: str) -> None:
        self.warnings.append('%-6s %-52s %s' % (rule, where, msg))

    def info(self, msg: str) -> None:
        self.infos.append(msg)


def tokens(name: str) -> list[str]:
    """Split a name into word tokens, dropping punctuation the spec allows."""
    return [t for t in re.split(r'[ ()/,;]+', name.replace(SEPARATOR, ' ')) if t]


def strip_variant(name: str) -> tuple[str, bool]:
    if name.endswith(VARIANT_SUFFIX):
        return name[:-len(VARIANT_SUFFIX)], True
    return name, False


# --- naming rules ------------------------------------------------------------------------------

def attested_tokens(doc: dict) -> set[str]:
    """Every all-caps token the contract itself attests: enum members, consts, object keys.

    Naming spec N-8 preserves verbatim identifiers. Deriving the set from the document beats a
    static list, because it cannot go stale: an example name may carry `CTRL` only for as long as
    `CTRL` is a declared value somewhere. `MAC` and `HOSTNAME` reach it as `tagDataRecord`
    property names, `CTRL` as an `epType` enum member.
    """
    out: set[str] = set()

    def walk(n) -> None:
        if isinstance(n, dict):
            for k, v in n.items():
                if k in ('enum', 'examples') and isinstance(v, list):
                    out.update(str(x) for x in v if isinstance(x, str))
                elif k == 'const' and isinstance(v, str):
                    out.add(v)
                elif k == 'properties' and isinstance(v, dict):
                    out.update(v.keys())
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(doc)
    return {t for t in out if t.isupper() and t.isalnum() and len(t) >= 2}


ATTESTED: set[str] = set()


def check_name(rep: Report, msg: str, idx: int, name: str, payload: dict, siblings: list[str],
               inherited: bool = INHERITED_NAMES) -> None:
    where = '%s[%d]' % (msg, idx)
    n9 = rep.warn if inherited else rep.error   # see INHERITED_NAMES

    # N-1 whitespace
    if name != name.strip() or '  ' in name:
        rep.error('N-1', where, 'leading, trailing or doubled whitespace: %r' % name)
    if any(c in name for c in '\t\n\r ​'):
        rep.error('N-1', where, 'contains tab, newline, NBSP or zero-width')

    # N-2 encoding
    exotic = {c for c in name if ord(c) > 0x7e}
    if exotic - ALLOWED_NON_ASCII:
        rep.error('N-2', where, 'disallowed non-ASCII %s' % sorted(hex(ord(c)) for c in exotic))

    # N-3 terminal punctuation
    if name[-1:] in '.!?,;:':
        rep.error('N-3', where, 'terminal punctuation %r' % name[-1])

    # N-4 dashes
    if '—' in name or '–' in name:
        rep.error('N-4', where, 'em or en dash')

    # N-5 separator
    if name.count(SEPARATOR) > 1:
        rep.error('N-5', where, 'more than one " -- " separator')
    if re.search(r'(?<! )--|--(?! )', name):
        rep.error('N-5', where, 'ill-spaced "--"')
    if re.search(r'\s-\s', name):
        rep.error('N-5', where, 'spaced single hyphen; use " -- "')

    # N-6 intra-token hyphens
    for tok in tokens(name):
        if '-' in tok and tok not in LEGAL_COMPOUNDS and not CODE_PAREN.match(tok):
            rep.warn('N-6', where, 'hyphen compound not in the closed set: %r' % tok)

    # N-7 / N-8 first character
    head = tokens(name)[0] if tokens(name) else ''
    if head not in EVENT_IDS and not name[:1].isupper():
        rep.error('N-7', where, 'must start uppercase (or a whitelisted identifier): %r' % name)

    # N-9 interior casing
    for tok in tokens(name)[1:]:
        if tok in ACRONYMS or tok in ENUM_LITERALS or tok in MODE_NAMES or tok in EVENT_IDS:
            continue
        if tok in ATTESTED:            # N-8: the contract declares this token verbatim
            continue
        if tok.lower() == tok or tok in ('Wi-Fi', 'Ethernet', 'Personal', 'Enterprise'):
            continue
        if re.match(r'^[a-z]+[A-Z]', tok) or '_' in tok:      # camelCase / snake_case identifier
            continue
        if tok in LEGAL_COMPOUNDS:
            continue
        rep.warn('N-9', where, 'unexpected interior capital: %r' % tok)

    # N-10 base64
    if re.search(r'\bBase64\b|\bBASE64\b', name):
        rep.error('N-10', where, '"base64" must be lowercase')

    # brand spelling
    if re.search(r'\b(wifi|WiFi|Wifi|wi-fi|WI-FI|Wi-fi)\b', name):
        n9('N-9', where, 'Wi-Fi brand token misspelt')

    # Option A: Wi-Fi Alliance mode names are hyphenated compounds with a capitalised second
    # element. The space-separated form is the pre-case-fix spelling and must not ship.
    m = re.search(r'\bWPA[23]\s+(personal|enterprise|Personal|Enterprise)\b', name)
    if m:
        n9('N-9', where,
           'unhyphenated Wi-Fi Alliance mode name %r; use the WPA2-Personal form'
           % m.group(0))

    # N-11 parentheticals
    if name.count('(') != name.count(')'):
        rep.error('N-11', where, 'unbalanced parentheses')
    npar = name.count('(')
    if npar > 2 or (npar == 2 and not name.endswith(VARIANT_SUFFIX)):
        rep.error('N-11', where, '%d parentheticals; a second is legal only as the variant suffix'
                  % npar)

    # N-14 / N-15 variant suffix
    base, is_variant = strip_variant(name)
    if VARIANT_SUFFIX in name and not name.endswith(VARIANT_SUFFIX):
        rep.error('N-14', where, 'variant suffix must be terminal')
    if is_variant and base not in siblings:
        rep.error('N-15', where, 'variant has no base sibling %r' % base)

    # N-17 / N-18 status codes
    for par in re.findall(r'\(([^()]*)\)', name):
        if par.startswith('code '):
            if not CODE_PAREN.match('(%s)' % par):
                rep.error('N-17', where, 'malformed code parenthetical: (%s)' % par)
                continue
            got = (payload.get('response') or {}).get('code')
            if par == 'code omitted' or par.startswith('code omitted;'):
                if got is not None:
                    rep.error('N-18', where, '"(code omitted)" but payload.response.code = %r' % got)
            else:
                want = int(par.split()[1])
                if got != want:
                    rep.error('N-18', where,
                              '"(code %d)" but payload.response.code = %r' % (want, got))

    # N-20 substring ambiguity
    for other in siblings:
        if other != name and name in other and other != name + VARIANT_SUFFIX:
            rep.warn('N-20', where, 'proper substring of sibling %r' % other)

    # N-21 length
    core = base if is_variant else name
    if len(core) > HARD_LEN:
        rep.error('N-21', where, '%d chars exceeds the hard ceiling %d' % (len(core), HARD_LEN))
    elif len(core) > SOFT_LEN:
        rep.warn('N-21', where, '%d chars exceeds the soft ceiling %d' % (len(core), SOFT_LEN))

    # N-22 structured head
    if SEPARATOR in name:
        h = name.split(SEPARATOR, 1)[0]
        if h not in STRUCTURED_HEADS:
            rep.error('N-22', where, 'structured head %r not in the closed set' % h)


# --- ordering rules ----------------------------------------------------------------------------

def check_order(rep: Report, msg: str, examples: list[dict]) -> None:
    names = [e['name'] for e in examples]

    # A-1 adjacency for the mechanical variant form
    for i, n in enumerate(names):
        base, is_variant = strip_variant(n)
        if is_variant and (i == 0 or names[i - 1] != base):
            rep.error('A-1', '%s[%d]' % (msg, i),
                      'variant not immediately after its base (previous is %r)'
                      % (names[i - 1] if i else None))

    # A-1 envelope generics attach to the primary scenario: index 1 when the message has >= 2
    for i, n in enumerate(names):
        if n in ENVELOPE_GENERICS and len(names) >= 2 and i != 1:
            rep.warn('A-1', '%s[%d]' % (msg, i),
                     '%r should sit at index 1, found %d of %d' % (n, i, len(names)))

    # T-3 tail codes ascend
    if msg not in TAIL_CODE_EXCEPTIONS:
        codes = [((e.get('payload') or {}).get('response') or {}).get('code')
                 for e in examples]
        seen = [c for c in codes if isinstance(c, int) and c not in (0, 1)]
        if seen != sorted(seen):
            rep.warn('T-3', msg, 'error codes not ascending: %s' % seen)


# --- driver ------------------------------------------------------------------------------------

def run(contract_path: str) -> Report:
    global ATTESTED
    doc = json.load(open(contract_path, encoding='utf-8'))
    ATTESTED = attested_tokens(doc)
    rep = Report()
    messages = doc['components']['messages']
    total = 0
    for msg, m in messages.items():
        examples = m.get('examples') or []
        names = [e['name'] for e in examples]
        if len(names) != len(set(names)):
            dupes = {n for n in names if names.count(n) > 1}
            rep.error('N-19', msg, 'duplicate name within the message: %s' % sorted(dupes))
        for i, e in enumerate(examples):
            total += 1
            check_name(rep, msg, i, e['name'], e.get('payload') or {}, names)
            if not (e.get('summary') or '').strip():
                rep.error('N-25', '%s[%d]' % (msg, i), 'summary is empty')
        check_order(rep, msg, examples)

    distinct = len({e['name'] for m in messages.values() for e in (m.get('examples') or [])})
    rep.info('%d messages, %d examples, %d distinct names' % (len(messages), total, distinct))
    variants = sum(1 for m in messages.values() for e in (m.get('examples') or [])
                   if e['name'].endswith(VARIANT_SUFFIX))
    aliases = sum(len(re.findall(r'"([^"]+)"', e.get('summary') or ''))
                  for m in messages.values() for e in (m.get('examples') or []))
    rep.info('%d variant names, %d quoted alias spans (N-25: build inputs)' % (variants, aliases))
    return rep


# --- self-test ---------------------------------------------------------------------------------

FIXTURES = [
    # (name, payload, siblings, expected_rule_or_None)
    ('Create WPA2-Personal', {}, ['Create WPA2-Personal'], None),
    ('Delete Wi-Fi CA cert', {}, ['Delete Wi-Fi CA cert'], None),
    ('alerts -- FIRMWARE_UPDATE in progress (SET) · from the API schema, not a capture',
     {}, [], None),  # the one legal non-ASCII name, verbatim from the contract
    ('Create WPA2 personal', {}, [], 'N-9'),                    # unhyphenated mode name
    ('Delete wifi ca cert', {}, [], 'N-9'),                     # brand token misspelt
    ('Response — error', {}, [], 'N-4'),                   # em dash
    ('Response - error', {}, [], 'N-5'),                        # spaced single hyphen
    ('Response payload.', {}, [], 'N-3'),                       # terminal punctuation
    ('  Padded name', {}, [], 'N-1'),                           # leading whitespace
    ('Create WPA2-Personal (reference site variant)', {}, ['Someone else'], 'N-15'),
    ('Response -- failed (code 16)', {'response': {'code': 15}}, [], 'N-18'),
    ('Response -- failed (code 15)', {'response': {'code': 15}}, [], None),
    ('Response -- ok (code omitted)', {'response': {'code': 0}}, [], 'N-18'),
    ('Result -- something', {}, [], 'N-22'),                    # head not in the closed set
    ('Install the Base64 bundle', {}, [], 'N-10'),
    ('X' * 90, {}, [], 'N-21'),
]


def selftest() -> int:
    bad = 0
    for name, payload, siblings, expect in FIXTURES:
        rep = Report()
        check_name(rep, 'M', 0, name, payload, siblings or [name], inherited=False)
        got = {ln.split()[0] for ln in rep.errors}
        if expect is None:
            if got:
                print('  FAIL  expected clean, got %s for %r' % (sorted(got), name[:56]))
                bad += 1
        elif expect not in got:
            print('  FAIL  expected %s, got %s for %r' % (expect, sorted(got) or 'clean', name[:56]))
            bad += 1
    # INHERITED_NAMES: the same two N-9 names are warnings, not errors, on an inherited corpus
    inherited_fixtures = [f for f in FIXTURES if f[3] == 'N-9']
    for name, payload, siblings, _ in inherited_fixtures:
        rep = Report()
        check_name(rep, 'M', 0, name, payload, siblings or [name], inherited=True)
        if any(ln.startswith('N-9') for ln in rep.errors) or \
                not any(ln.startswith('N-9') for ln in rep.warnings):
            print('  FAIL  inherited N-9 not demoted to a warning for %r' % name)
            bad += 1
    # adjacency fixture
    rep = Report()
    check_order(rep, 'M', [{'name': 'A'}, {'name': 'B'}, {'name': 'A' + VARIANT_SUFFIX}])
    if not any(ln.startswith('A-1') for ln in rep.errors):
        print('  FAIL  adjacency violation not detected')
        bad += 1
    print('self-test: %d fixture(s) failed' % bad if bad else
          'self-test: %d fixtures, all pass' % (len(FIXTURES) + len(inherited_fixtures) + 1))
    return 1 if bad else 0


def main(argv: list[str]) -> int:
    if '--selftest' in argv:
        return selftest()
    if selftest():
        print('ABORT: the checker fails its own fixtures')
        return 1

    contract = DEFAULT_CONTRACT
    if '--contract' in argv:
        contract = argv[argv.index('--contract') + 1]
    if not contract:
        print('usage: check_message_examples.py --contract PATH [--check]')
        return 2
    if not os.path.exists(contract):
        print('no such contract: %s' % contract)
        return 2
    print('contract: %s' % contract)

    rep = run(contract)
    print()
    for line in rep.infos:
        print('  %s' % line)
    print()
    if rep.errors:
        print('ERRORS (%d)' % len(rep.errors))
        for e in rep.errors:
            print('  ' + e)
    if rep.warnings:
        print('WARNINGS (%d)  -- inherited irregularities; see naming spec section 8'
              % len(rep.warnings))
        for w in rep.warnings:
            print('  ' + w)
    print()
    print('=' * 72)
    print('EXAMPLES OK - %d errors, %d warnings' % (len(rep.errors), len(rep.warnings)))
    return 1 if (rep.errors and '--check' in argv) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
