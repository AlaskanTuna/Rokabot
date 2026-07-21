# DECISIONS

> Persistent decision log. **One line per shipped task**, appended by the **PM** at Gate 2 (Approve path); read by **PL** before planning. This is not an ADR system — keep each entry to a single line, newest at the bottom.

Format (one line, no wrapping):

```
- YYYY-MM-DD — <task>: <decision> — <one-clause rationale>
```

Example:

```
- 2026-07-07 — auth session store: use signed cookies over JWT — simpler revocation, no token store to run
```

---
