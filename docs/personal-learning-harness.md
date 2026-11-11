# Personal learning harness — approved implementation

Branch: `feat/personal-learning-harness`.

## Agreed behavior

- Learn, Sources and independent Notes navigation; compact 14px prose/UI and 13px code.
- Lesson workspace: outline, central explanation/grill, resizable code/output panel and accessible follow-up conversation.
- Skippable diagnostic capped at three questions. Outline first, then complete explanation per section, learner-triggered grill, consolidated gap review and retesting. Grills have no fixed maximum.
- Mixed code/reasoning assessment, occasional multiple choice. Explicit objective evidence determines mastery. Guided or strict mode chosen per lesson. Standalone Start Grill supported.
- Sources grouped by learning goal: pasted text/code, Markdown/text/PDF, URLs and source files. Extract on arrival; Generate roadmap on request. Explicit permanent source/roadmap lock before learning. Cite passages and label additions.
- Notes accepts pasted text only. Automatically synthesize topic pages, skip duplicates, merge additions/improvements and preserve conflicting claims. Rewriting code/prose is permitted but not mandatory. Retain originals, history and undo. Separate topic/concept graph. No automatic connection to lessons or Sources.
- SQLite for new structured state; retain provider/conversation infrastructure and model preferences. CodeMirror editor. One editable code file, stdin/output/tests. Java 21, Go, Python 3, JavaScript and TypeScript; standard libraries only.
- Docker execution with pinned images, no network, non-root user, dropped capabilities, isolated exercise directory, one CPU, 1 GiB memory, 256 processes, 30-second compilation timeout, 10-second runtime timeout and 1 MiB output cap. Run and Submit are separate. No host fallback.
- Disposable dev learning data may be cleared, preserving credentials/settings. Installed AppImage data is outside this reset.

## Implementation status

Implemented:

- Explicit phase/action reducer, diagnostic cap, objective evidence, assisted-answer retesting and guided/strict advancement.
- Transactional SQLite lesson/event persistence, topic metadata and optimistic revision checks.
- Validated lesson create/list/read/action APIs; browser requests cannot write assessments. Active responses block learner phase changes.
- New lesson creation links to existing chat records and retains configured model/thinking preferences.
- Lesson-specific agent instructions and state tools, integrated into the existing authenticated streaming handler. Legacy sessions retain their original agents.
- `/learn` entry point, mode selection, lesson list and sidebar Learn entry.
- Persistent lesson controls in chat: phase, section outline, skip diagnostic, start explanation, Start Grill and guided continuation with gaps.
- Default reading size reduced to 14px; explicit user settings still win.
- Focused state, API, persistence and agent-tool tests.

Remaining work:

1. Finish lesson workspace layout, explicit phase history, standalone Start Grill and complete compact sizing.
2. Add CodeMirror and Docker runners, reference-test validation, cancellation, cleanup and runtime setup.
3. Implement source ingestion, passage storage/citations, goal/roadmap generation and permanent lock enforcement.
4. Notes implementation is complete; see the Notes section below.
5. Reset only authorized dev learning records after replacement storage is ready. Keep credentials and provider settings.
6. Complete integrated tests, lint/typecheck/build and browser walkthroughs of Java mastery, source-based roadmap and Notes merging/conflicts.

Existing learning data has not been deleted. Sources and Notes now have independent workspaces; see the implementation updates below. The code workspace and isolated execution are now implemented; automated exercise test suites remain pending. The lesson UI currently uses the existing transcript with new controls; the approved three-panel workspace is still pending.

Live QA so far: `/learn` and `/api/lessons` respond successfully. Created a strict Java lesson through the browser using the configured GPT-6-Luna model; it asked one diagnostic, and Skip quick check persisted the outline phase. Full mastery-cycle testing remains pending.

Verification update: nine focused tests pass. The broader 151-test run had one old font-default assertion; that assertion was updated and its 35-test suite passes. TypeScript, targeted lint and production build pass (build reports four tracing warnings in existing headless/graph code). Browser QA found stale historical phase results confusing the tutor; added a current-state read tool and authoritative phase guidance. The corrected live lesson started streaming its section explanation. Browser QA is provisional 3/5: entry, diagnostic skip and outline controls work, but full grill/mastery verification and the remaining workspace features are unfinished.

## Lesson-experience correction

User explicitly paused further feature work to fix the current learning experience. Confirmed: branching prerequisite lesson maps, with the current section highlighted, using the previous graphical plan presentation rather than a top outline dropdown.

Implemented: persisted prerequisite edges validated as a DAG and ordered before their dependents; graphical plan in the transcript; existing pan/zoom Plan popup driven by explicit lesson state; top outline dropdown removed. Teaching session filter is now Lessons. The legacy teaching draft route and keyboard launch lead to Learn; the original graph-home Learn composer carries its topic/selected concepts into Learn instead of creating another legacy teaching session.

Old saved lessons without authored prerequisites render their sections without invented edges. New agent-authored outlines must explicitly supply prerequisite edges.

Verification: 12 focused learning/graph tests pass; targeted lint passes. Browser confirms no outline dropdown, a graphical plan with one highlighted current section, working expand/zoom controls, and `/chat/new` redirecting to `/learn` with mode selection. Graph-rendering QA: 4/5; live generation of a fresh branching plan has not yet been exercised. Pending user choice: replace old Practice with Start Grill in Learn, or remove its entry until later. Sources, Notes and code execution remain paused.

## Practice, Grill and draft-screen alignment

Confirmed from the original code: lesson graphics reuse the existing plan renderer and pan/zoom overlay; the separate knowledge graph remains intact. Practice is retrieval training without the new mastery/remediation loop, so the user authorized keeping Practice and adding a separate Grill entry. `/grill` prepares objectives without diagnostics or an initial explanation, then uses the same mastery and gap-repair machinery.

User requested `/learn` and `/grill` match `/chat/new?mode=practice`. Both now reuse `DraftShell` directly, with the same composer, dock, model/thinking controls, dictation and spacing. The only added control is the already-approved per-session guided/strict choice. Opening prompts use the existing session-storage handoff rather than long URLs. Browser checks confirmed identical composer bounds on all three pages.

Code workspace: CodeMirror with Java/Go/Python/JavaScript/TypeScript, saved local drafts, stdin, output, separate Run and Submit actions, cancellation and SQLite run records. Immutable Docker image IDs are stored in the dev data folder. Real execution tests pass for all five languages, compilation failure, networking denial, timeout and cancellation. Go's standard-library cache is prepared in its image to keep exercise compilation within 30 seconds. Browser Java execution printed 42 and editor content survived closing/reopening. Runtime setup instructions are in `scripts/runners/README.md`.

Validation: 13 focused learning/graph tests, 28 draft/Practice tests and 7 runner tests pass; TypeScript and targeted lint pass. Layout/browser QA: 4/5, with the existing model-availability error intentionally excluded as requested. Still pending: generated exercise tests and reference-solution validation, Sources, Notes, final full workspace polish and final end-to-end release verification.


## Independent Notes workspace

Implemented `/notes` and sidebar navigation, paste inbox, synthesized topic pages, search, manual editing, original snippets, conflict flags, revision history and restore. Notes has its own SQLite database and no automatic connection to lesson knowledge. The graph reuses the home canvas renderer with topic regions, concept nodes and plain undirected lines. Its camera and positions are separate from the learning graph.

Ollama `qwen3-embedding:0.6b` is installed locally and returns 1024-dimensional vectors. Cached embeddings rank related pages; the configured extractor model decides synthesis and semantic duplicates. Missing embeddings fall back to explicit text matching with a visible notice. No separate vector database is needed for this local library. Start Ollama with `ollama serve` if it is not running. Originals survive organizer failures and can be retried. Concurrent edits reject stale updates rather than overwrite them.

Observed live: a Java concurrency snippet produced a topic page, a synchronized addition merged into it, and a paraphrased duplicate was skipped. Typecheck, five focused Notes tests, and the prior Notes-stage production build passed. Further browser testing was stopped at the user's request; no claim of exhaustive validation.

## Source-based learning

Implemented `/sources` and sidebar navigation; learning goals; paste/file/webpage ingestion; extracted passages with stable references; original bytes retained separately; graphical prerequisite roadmaps; explicit permanent source/roadmap lock; and guided/strict lesson launch. Imports support text/code/Markdown and text PDFs (scans require prior OCR), up to 20 MB per file/webpage. Source additions/removals invalidate the draft roadmap. Locked material cannot be edited or regenerated. New goals allow a different material set.

Roadmap generation indexes all passages in batches for larger materials, then produces source-grounded lessons and dependency edges. Source-backed lesson agents receive immutable material and objective snapshots, cite passage links to `/sources`, and are instructed to label supplemental explanations as Additional context. Notes remain independent. Existing provider/model choices are preserved.

Remaining: generated exercise test suites/reference-solution validation, final lesson-workspace polish and complete release verification. Sources received implementation and a compiler check, not an extended browser/model walkthrough, following the user's request to stop excessive testing.


## Coding tasks and lesson workspace (2026-11-08)

Implemented tutor-authored single-file coding exercises with starter code, objective/task IDs, visible examples and hidden cases. The learner chose to reveal hidden cases after submission. Every reference solution is executed against all cases before publishing. Run executes examples; Submit executes the complete suite and sends the solution/run ID to the tutor. Cases show expected/actual output and errors. Reference code and hidden cases are not rendered in the exercise preparation card. The tutor can retrieve server-recorded results rather than trust pasted output claims.

Hidden-case reveal is persisted when a submission begins, including interrupted submissions. Later attempts are automatically marked assisted in assessment state. Fresh task IDs are required for reassessment. Passing tests alone does not confer mastery. Existing sandbox, cancellation, language support and draft persistence remain in use.

The lesson has a persistent graphical map/objective panel on wide screens, central explanation/follow-up conversation and a resizable code panel. Compact screens retain the expandable Plan view. Current phase descriptions distinguish the optional quick check, explanation, grill and gap review; the map panel shows persistent phase history and objective evidence. Legacy Teaching dividers are suppressed for these explicit-state lessons, and the dock links to the same lesson map.

Verification kept narrow at the user's request: compiler check and two focused regression tests passed (assisted retry enforcement and output comparison). No new full browser or provider walkthrough. Remaining work is release-level integration verification and any user-requested refinements; no existing dev learning records were deleted.
