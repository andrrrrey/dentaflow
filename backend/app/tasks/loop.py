"""Shared async runner for Celery tasks.

Celery's prefork worker runs each task synchronously inside a worker process.
Our task bodies are async (SQLAlchemy async engine + asyncpg). The naive
pattern of ``asyncio.run(coro)`` (or ``get_event_loop().run_until_complete``)
creates and tears down a *new* event loop on potentially every call. asyncpg
binds its connection pool and the underlying ``Future`` objects to the loop
that created them, so once a fresh loop is used the next time, any reused
connection raises::

    RuntimeError: Task ... got Future ... attached to a different loop
    Exception terminating connection ...

That poisons the shared engine pool for the whole worker process and makes
unrelated tasks (daily_report, bot_reminders, segment recompute …) fail and
retry, starving the single worker.

The fix is to keep **one** event loop per worker process and reuse it for
every task. asyncpg connections then always belong to that one loop. This
module owns that loop; all task modules delegate to :func:`run_async`.
"""

from __future__ import annotations

import asyncio
import threading

# One persistent loop per process, created lazily and guarded so concurrent
# threads (Celery's prefork model is single-threaded per child, but be safe)
# don't race to create two loops.
_loop: asyncio.AbstractEventLoop | None = None
_lock = threading.Lock()


def _get_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is not None and not _loop.is_closed():
        return _loop
    with _lock:
        if _loop is None or _loop.is_closed():
            _loop = asyncio.new_event_loop()
            asyncio.set_event_loop(_loop)
        return _loop


def run_async(coro):
    """Run an async coroutine on this process's persistent event loop.

    Reusing a single loop keeps the asyncpg connection pool valid across
    successive Celery tasks in the same worker process.
    """
    loop = _get_loop()
    if loop.is_running():
        # We're already inside the loop (e.g. nested call) — run in a separate
        # thread with its own throwaway loop to avoid deadlocking.
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    return loop.run_until_complete(coro)
