---
name: API server port conflict after task-agent merges
description: Task-agent merges can restart the API server workflow, causing EADDRINUSE if the old process is still alive — the workflow shows FINISHED but PID is still on 8080.
---

## Rule
After any task-agent merge that touches the API server, check that the `artifacts/api-server: API Server` workflow is running and healthy before declaring the pipeline working.

**Why:** Task agents restart workflows as part of their merge/test cycle. If the old process hasn't fully exited when the new one starts, the new instance crashes with `EADDRINUSE: address already in use 0.0.0.0:8080`. The workflow status shows FINISHED but the old PID keeps serving. On the next restart the ports clear and both instances die, leaving the API server completely down.

**How to apply:** After merging any task that touches `artifacts/api-server/`, run `RefreshAllLogs` and look for `EADDRINUSE` in the API Server workflow log. If present, call `WorkflowsRestart` for `artifacts/api-server: API Server`. Also check that the APK's `EXPO_PUBLIC_DOMAIN` domain is still reachable at `/api/mo/voice` before concluding a voice-pipeline issue is client-side.
