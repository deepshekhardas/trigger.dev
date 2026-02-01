---
"@trigger.dev/webapp": patch
---

fix: Allow replaying runs with string payloads

When replaying a run that has a plain string payload (not JSON object/array), the payload was becoming empty and the dashboard incorrectly labeled it as a "large payload".

This fix:
- Adds `text/plain` to the list of editable payload types in the Replay modal
- Shows the "large payloads" tooltip only for actual offloaded payloads (`application/store`)

Fixes #2813
