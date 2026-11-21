# Genuine team contribution plan

Do not backdate commits, spoof authors, split generated code into fabricated student histories, or describe cosmetic edits as component ownership. Each student should implement and explain substantive work, write meaningful tests and make their own real commits under their own identity. Disclose tool assistance according to course policy.

Suggested work allocation (assign actual names as a team):

| Owner to assign | Coherent component | Substantive follow-up tasks and evidence |
| --- | --- | --- |
| Library owner | Library workflow and catalog integration | Improve concurrent editing with version checks; verify catalog/manual-entry flows; supply regression tests and explain persistence decisions |
| Journal owner | Notes and highlights | Add note editing with ownership enforcement; solve delete-versus-note-creation races; test cross-user access and workflow errors |
| Insights owner | Statistics, next-up and public lists | Add date-range insights and zero-count months; test boundary dates and sharing races; verify the linked UI |
| Shared review | Deployment, identity and security | Each member reviews another component, runs the two-account AWS smoke test and records actual results |

These are proposed tasks, not claims of completed student work. Adapt the split to the real team size and assignment. Record evidence only after doing the work:

| Student | Component | Real commit/PR links | Tests personally added/run | Design decisions explained |
| --- | --- | --- | --- | --- |
| To be completed by team | | | | |

A valid demo should follow one integrated journey: authenticated catalog search → saved book → reading status → journal entry → completion/rating → statistics → optional shortlist sharing. Every member should understand shared authentication, ownership enforcement and how their component interacts with the others.
