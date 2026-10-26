# Cine Music Wave Web workspace instructions

The rules for this repository are in the root [`AGENTS.md`](../AGENTS.md). Read it before any change and follow it: Part 1 is
the universal engineering, design and security standard, Part 2 describes this project. This file adds nothing to it and
restates no rule; it only names the checkpoints that are mandatory.

1. **Building something new or adding a feature:** follow Section 10 and build in all of Section 3 (SEC-01 to SEC-52) from the
   first commit, each control with its attack test and a mutation check (Sections 7.3 and 7.6).
2. **Asked to harden, review or audit:** follow Section 13 and record the evidence in `SECURITY_VALIDATION.md` (DOC-02).
3. **Calling work done:** meet Section 12 and report in the order of AUD-10, including what could not be verified.
4. **Always:** read `system_design.md` and `FEATURE_LOG.md` first, keep the approved design unchanged, never print or commit a
   secret (PRC-09), and run `audit:standards` and the tests that exist in this repository.
