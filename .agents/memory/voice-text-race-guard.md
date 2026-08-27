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

**How to apply:** any "switch pipelines" guard must, in order: (1) abort the
other pipeline's in-flight request so its success handler can never fire
late, then (2) clear its displayed state. Verify with a delayed-promise mock
(hold the response pending, reject on abort-signal) rather than only
sequential mocked turns — that is the cheapest way to reproduce a real
network-latency race without needing real hardware.
