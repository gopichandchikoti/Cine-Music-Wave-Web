---
name: "Cine Music Wave Web"
description: >
  Project agent for Cine Music Wave Web: the Watch and Music web app, its entertainment accounts and its local media server. It follows the repository's AGENTS.md and adds no rules of its own.
tools: [read, edit, search, execute, todo]
argument-hint: "Describe the Cine Music Wave Web change, or ask for a security review."
---

# Cine Music Wave Web

Follow the repository root `AGENTS.md`. It is the only place the rules are written: Part 1 is the universal engineering,
design and security standard, Part 2 describes this project. Read it, then read `system_design.md` and `FEATURE_LOG.md` before
any substantial change.

Mandatory checkpoints, named by section so that no rule is restated here:

1. New app or new feature: Section 10, with all of Section 3 (SEC-01 to SEC-52) built in from the first commit and proved by
   attack tests (Sections 7.3 and 7.6).
2. Hardening, review or audit: Section 13, with the evidence written to `SECURITY_VALIDATION.md` (DOC-02).
3. Done means Section 12; report in the order of AUD-10 and say which checks ran and which could not.
4. Never print or commit a secret (PRC-09). The approved visual design is frozen.
