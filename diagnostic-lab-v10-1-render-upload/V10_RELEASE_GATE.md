# V10 Release Gate

## Automated gates

| Gate | Result |
| --- | --- |
| Existing API/auth/quota/word-count tests | Pass |
| V7 Task 2 production calibration: 24 fixtures | Pass |
| V8 Task 2 matrix: 30 fixtures | Pass |
| V8 Task 1 matrix: 21 fixtures | Pass |
| Sun/Eva/Evin named Task 2 invariants | Pass |
| V8.2 Sun route/mismatch/invalidation/progress | Pass |
| Exact public dropdown taxonomy | Pass |
| Process vs structural/mechanism subtype | Pass |
| High-confidence Task 1 mismatch block | Pass |
| Task 2 public-to-internal obligation mapping | Pass |
| Exact duplicate returns identical saved report | Pass |
| Duplicate bypasses exhausted teacher daily limit | Pass |
| Duplicate creates no progress entry | Pass |
| Different student prevents cache reuse | Pass |
| Revised writing creates a new report | Pass |
| Engine upgrade preserves and links history | Pass |
| Same-version re-analysis returns existing report | Pass |
| Ten-run canonical stability | Pass |
| Permanent student deletion isolation | Pass |
| Invalid report exclusion | Pass |
| Root/preview file parity | Pass |

## Golden fixture matrix

| Fixture | Protected invariant | Result |
| --- | --- | --- |
| Sun Combination Graph | accepted Task 1 interpretation and ~6.5 direction | Pass — existing calibration unchanged |
| JJ Line Graph | Task 1 line-graph strategy and canonical serialization | Pass |
| Poon Bar Chart | Task 1 bar-chart strategy and underlength support | Pass |
| Langley Map | map objectivity and ownership/progress path | Pass |
| Process Diagram | public Diagram + internal `process` | Pass |
| Structural/Mechanism Diagram | public Diagram + internal `structural-mechanism` | Pass |
| Underlength Task 1 | analyzable; validator evaluates report integrity | Pass |
| Sun Opinion | strongly disagree; controlled concession; no false position cap | Pass |
| Eva Opinion | semantic position/route canonical path | Pass |
| Evin Problem & Solution | no agree/disagree route fields | Pass |
| Eva Problem & Solution | problem/solution obligations and arithmetic | Pass |
| Discuss Both Views | both views + opinion obligation when required | Pass |
| Advantages & Disadvantages | public type with internal two-sided route | Pass |
| Outweigh | public A&D + internal comparative judgement | Pass |
| Direct Question variants | internal question obligations retained | Pass |
| Underlength Task 2 | analyzable; no malformed-report acceptance | Pass |

## Manual post-deploy gates still required

- production root page and login
- provider-connected Task 1 and Task 2 analyses
- live exact duplicate/revised submission
- browser PDF open/save
- live invalidation/archive/restore/delete
- Render log inspection
- production domain smoke test

No production result is claimed before those live checks are performed.
