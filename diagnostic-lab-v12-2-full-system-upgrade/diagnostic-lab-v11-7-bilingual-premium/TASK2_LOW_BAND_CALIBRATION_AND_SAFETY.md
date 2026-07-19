# Task 2 Low-Band Calibration and Safety

## Scope

This production hotfix adds deterministic Task 2 completion, position-route, meaning-control, and compound-severity checks. It does not alter Task 1 scoring, authentication, sessions, quota accounting, duplicate caching, deployment settings, pricing, or the visual design.

## Trusted Evidence

The server calculates and saves:

- verified word count and shortfall from the student-answer field
- completion status and unfinished-ending evidence
- detected position and confidence
- body-route summary and route conflict
- meaning-changing and meaning-reversing evidence
- route, completion, and language integrity
- compound-severity summary

Provider output cannot override these deterministic fields. The saved report object remains the source of truth for the dashboard and browser-print/PDF report.

## Calibration Rule

Word count alone never creates a fixed band deduction. A complete response that is slightly below 250 words is treated differently from a response that is severely underlength, unfinished, route-conflicted, underdeveloped, and affected by meaning-control errors.

A critical low-band interaction requires aligned evidence across completion, route, development, and language. When that profile is present, the score report is reconciled conservatively so detailed critical diagnoses cannot coexist with an unjustifiably generous overall range.

Opposing body paragraphs are not automatically treated as conflict for Discuss Both Views, genuine partly-agree or conditional routes, Problem/Solution, Direct Question, or properly handled outweigh essays.

## Revision Safety

Every Task 2 feedback-card revision is labelled as one of:

- Minimal Correction
- Route-Preserving Revision
- Teacher-Guided Recommended Route
- Model Paragraph

When the student's position is unclear, contradictory, or unfinished, a revision that selects a position must be labelled Teacher-Guided Recommended Route. The explanation must state that the route is proposed, not silently attribute it to the student.

## Operational Safety

No production data reset is part of this hotfix. Existing saved reports remain unchanged. New checks apply to newly generated analyses only.
