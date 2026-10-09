"""
posthog_client.py — shared PostHog analytics helper for apigen scripts.

Initializes a Posthog instance from environment variables and provides a
thin capture wrapper that no-ops gracefully when the token is absent.
"""

from __future__ import annotations
import atexit
import os
import socket

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv is an optional dev convenience; running without it is fine.
    pass

try:
    from posthog import Posthog
    _token = os.getenv("POSTHOG_PROJECT_TOKEN", "")
    if _token:
        posthog_client = Posthog(
            _token,
            host=os.getenv("POSTHOG_HOST", "https://us.i.posthog.com"),
            # OFF deliberately. Autocapture POSTs an unhandled traceback with each
            # frame's absolute `abs_path` plus surrounding source lines, keyed on
            # hostname_username — so setting one environment variable would turn a
            # read-only docs gate into a path/source disclosure channel from a
            # public repo with public CI logs. The explicit capture() calls below
            # send only the counts the generator means to send.
            enable_exception_autocapture=False,
        )
        atexit.register(posthog_client.shutdown)
    else:
        posthog_client = None
except ImportError:
    posthog_client = None


def _distinct_id() -> str:
    """Stable per-machine identifier: hostname + OS username.

    NOT anonymous, and an earlier docstring claiming "(no PII)" was wrong. Hostname plus
    OS username identifies a machine and a person, and on a maintainer's workstation
    %USERNAME% is exactly the account name this repository's disclosure guard existed to
    keep out of tracked files. Nothing egresses today because POSTHOG_PROJECT_TOKEN is set
    in no workflow, so capture() no-ops on every CI run -- but setting one environment
    variable would turn a docs generator into an account-name egress to a US processor.
    If this telemetry is ever wanted, return a constant such as "apigen" instead.
    """
    user = os.getenv("USER") or os.getenv("USERNAME") or "unknown"
    return f"{socket.gethostname()}_{user}"


def capture(event: str, properties: dict | None = None) -> None:
    if posthog_client is None:
        return
    posthog_client.capture(
        distinct_id=_distinct_id(),
        event=event,
        properties=properties or {},
    )
