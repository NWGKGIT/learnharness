import { test } from "node:test";
import assert from "node:assert/strict";
import { LearningWorkspaceStore } from "../src/store/learning-workspace.ts";
import { createLessonSession } from "../src/core/learning-session.ts";
import { exerciseOutputMatches } from "../src/core/exercise-validation.ts";

test("revealed coding cases force assisted evidence even if the tutor claims an unassisted answer", () => {
	const store = new LearningWorkspaceStore(":memory:");
	try {
		let session = createLessonSession("lesson", "strict", "grill"); store.create(session);
		session = store.apply(session.id, session.revision, { type: "set-outline", sections: [{ id: "section", title: "Atomicity", objectives: [{ id: "objective", description: "Implement an atomic operation" }] }], edges: [] });
		session = store.apply(session.id, session.revision, { type: "start-grill" });
		store.saveExercise({ id: "exercise", lessonId: session.id, sectionId: "section", taskId: "task", objectiveIds: ["objective"], language: "java", title: "Counter", instructions: "Implement", starter: "", reference: "reference", tests: [], revealed: true });
		store.saveRun({ id: "run", lessonId: session.id, exerciseId: "exercise", purpose: "submission", previouslyRevealed: true, language: "java", source: "solution", stdin: "", status: "passed", stage: "execute", stdout: "", stderr: "", exitCode: 0, createdAt: "" });
		session = store.apply(session.id, session.revision, { type: "assess", evidence: { id: "evidence", objectiveId: "objective", taskId: "task", verdict: "demonstrated", reason: "Tests passed", assisted: false } });
		assert.equal(session.evidence[0]!.assisted, true);
		session = store.apply(session.id, session.revision, { type: "finish-grill" });
		assert.equal(session.phase, "review-gaps");
		assert.equal(store.phaseHistory(session.id).at(-1)!.phase, "review-gaps");
	} finally { store.close(); }
});

test("output matching tolerates line endings but preserves meaningful whitespace", () => {
	assert.ok(exerciseOutputMatches("1\r\n2\r\n", "1\n2"));
	assert.equal(exerciseOutputMatches("1 2", "1\n2"), false);
	assert.equal(exerciseOutputMatches(" 1", "1"), false);
});
