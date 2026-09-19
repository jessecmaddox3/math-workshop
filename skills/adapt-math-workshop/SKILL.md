---
name: adapt-math-workshop
description: Customize the open-source Math Workshop games while preserving exact arithmetic, area-puzzle validity, local learner isolation and optional authenticated cloud saves.
---
# Adapt Math Workshop

Read README.md and docs/design.md before editing. Keep Target Number’s full expression-building design, rational arithmetic, visible work, undo/reset, optional alternate routes and automatic-next preference. Keep all original Area Mazes unless explicitly changing the curriculum.

For a new area puzzle, define consistent positive integer widths/heights/areas, share the correct row/column dimension, expose enough givens to derive the answer, and provide a structural hint. A screen drawing must not disclose the answer by scale. Run test/games.test.mjs and render the actual diagram at a phone width.

Use only invented learner fixtures. Keep real names, exports, addresses, backend URLs and credentials out of source, tests, screenshots and histories. Do not copy another project’s data or rewrite real records with substituted names.

For progression changes, update the appropriate curriculum/version boundary and test malformed state, future versions, repeated input, learner switching and stale callbacks. Serialize local writes; never retry a stale tab’s snapshot against a newly loaded revision without an explicit user choice. Preserve recovery/export paths.

Cloud stays optional and disabled in standalone files. Use a host-owned backend with authenticated owner RLS; names are labels, never authorization. Reuse the adapter’s binding, write-ID and revision checks. Test with invented owners and loopback services, never a real household’s backend.

Build with npm run build. Run the relevant existing tests and inspect the generated offline and hosted games. Keep beginner README instructions and third-party notices accurate. General changes belong in the public engine; private installations pin a verified release and keep their configuration outside it.
