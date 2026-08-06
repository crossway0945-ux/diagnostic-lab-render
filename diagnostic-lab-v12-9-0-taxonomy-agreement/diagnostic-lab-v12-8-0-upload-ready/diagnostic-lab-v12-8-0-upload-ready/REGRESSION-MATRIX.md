# Regression Matrix

## Global prompt coverage

All prompts below are synthetic and contain vocabulary absent from the Eva, Evin and Sun fixtures.

| Family or visual | Expected control | Result |
| --- | --- | --- |
| Opinion | stance required | PASS |
| Discuss Both Views | both views plus opinion | PASS |
| Problem and Solution | problem and measure obligations; no implicit opinion | PASS |
| Causes and Solutions | cause and solution obligations | PASS |
| Advantages and Disadvantages | two-sided obligations without forced judgement | PASS |
| Outweigh | public A&D family, outweigh subtype and explicit direction | PASS |
| Two-Part Question | two semantic obligations from one punctuation group | PASS |
| Positive/Negative Development | explicit judgement obligation | PASS |
| Direct Question variant | two coordinated interrogative obligations | PASS |
| Hybrid cause plus outweigh | two obligations, stance and comparison preserved | PASS |
| Opposite outweigh polarity | advantages direction retained | PASS |
| Compound object guard | `advantages and disadvantages` is not split | PASS |
| Task 1 line, bar, pie, table | correct public visual type | PASS |
| Task 1 mixed/combination | correct mixed type | PASS |
| Task 1 map, process/diagram | correct visual type | PASS |
| Task 1 multiple periods | chart family retained | PASS |

## End-to-end synthetic hybrid

- Canonical prompt obligations: 2 — PASS
- Stance required: true — PASS
- Second/comparison route adequately developed — PASS
- Missing requirements: 0 — PASS
- Paragraph map: 4 paragraphs — PASS
- Student View internal-ID scan — PASS

## Golden and protected corpus

- Eva: exact four-paragraph map, 6.0, SAR Mixed, conclusion separation, score trace — PASS
- Evin: 6.5, disadvantages-outweigh route preserved — PASS
- Sun: Problem & Solution route preserved — PASS
- Task 1 chart/map/process/mixed: no Task 2 SAR leakage; no conclusion requirement — PASS
- Source check: 106 modules — PASS
- Complete suite: 46 test files — PASS
