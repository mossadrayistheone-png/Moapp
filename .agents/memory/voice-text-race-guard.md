---
name: Cross-pipeline reply masking requires cancelling, not just clearing
description: When two async pipelines share one displayed-result fallback, switching between them must abort the other's in-flight request, not just clear its displayed value — and why sequential-turn tests can't catch the gap.
---

## The lesson

When a UI shows `resultA || resultB` from two independent async pipelines,
clearing the stale pipeline's *displayed* value when the other starts is not
enough on its own. If the stale pipeline still has a request in flight, its
success handler can fire later and unconditionally set its result again,
silently reintroducing the stale value and masking the new one — even though
the display was correctly cleared moments earlier.

**Why:** tests that only start pipeline B after fully awaiting pipeline A's
completion can never exercise this, because nothing is still in flight when B
starts. Reproducing it needs a request that stays pending past the point
where the other pipeline starts, then resolves late.

**How to apply:** any "switch pipelines/contexts" guard must, in order: (1)
abort the stale side's in-flight request so its success handler can never
fire late, then (2) clear its displayed state — and do step (2)
unconditionally on every switch, not only when a request is currently in
flight. A request that already **completed** before the switch (state back to
idle, result already populated) is just as dangerous as one still racing,
because nothing about "idle" implies "cleared" — the stale value keeps
winning a `||`-style fallback until something explicitly clears it. This
generalizes beyond a two-pipeline switch to any N-way shared-state switch
(e.g. switching between more than two personas/contexts that all render
through one shared result).

**Abort ≠ guaranteed-not-committed — verify the ownership check runs in the
right place.** `AbortController.abort()` only rejects the underlying
fetch/read promise if it hasn't settled yet. If the response already fully
arrived (fetch() resolved, body already parsed) by the time abort() is
called, nothing rejects — the `.then()`/continuation that commits state
(setState calls, "on complete" callbacks) still runs normally unless it
explicitly checks `controller.signal.aborted` (or an equivalent
still-current-turn token) itself, synchronously, before mutating anything. A
check on an *outer* promise or a flag only inspected *after* awaiting a
`Promise.all` that already resolved is too late — the inner `.then()` may
have already committed. Put the check inside the exact continuation that is
about to mutate state, before it does so.

**Test both race shapes, not just one:** (a) cancel while the request promise
is still pending (delayed-promise mock, reject on abort-signal) — the
easy/obvious case; and (b) cancel while the request has already resolved but
its own body-parsing continuation is still pending (a mock whose `json()`
stays pending independent of the abort signal, resolved manually after the
cancel fires) — the case that only an in-continuation ownership check catches.
Sequential mocked turns (fully await A before starting B) can't reach either
race and give false confidence.
