import { test } from "node:test";
import assert from "node:assert/strict";
import { createLessonSession, transitionLesson, weakObjectives, type LessonSession } from "../src/core/learning-session.ts";
import { LearningWorkspaceStore } from "../src/store/learning-workspace.ts";

function ready(mode: LessonSession["mode"] = "strict") {
	let s = transitionLesson(createLessonSession("lesson", mode), { type: "finish-diagnostic" });
	s = transitionLesson(s, { type: "set-outline", sections: [{ id: "race", title: "Race conditions", objectives: [{ id: "identify", description: "Identify a non-atomic read-modify-write" }] }] });
	return transitionLesson(s, { type: "start-explanation" });
}

test("opening diagnostic is skippable and cannot exceed three questions", () => {
	let s = createLessonSession("lesson", "guided");
	assert.equal(transitionLesson(s, { type: "finish-diagnostic" }).phase, "outline");
	for (let i = 0; i < 3; i++) s = transitionLesson(s, { type: "ask-diagnostic" });
	assert.throws(() => transitionLesson(s, { type: "ask-diagnostic" }), /three questions/);
});

test("explanation cannot record assessment before the learner starts grilling", () => {
	const s = ready();
	assert.throws(() => transitionLesson(s, { type: "assess", evidence: { id: "e", objectiveId: "identify", taskId: "t", verdict: "demonstrated", reason: "Correct trace", assisted: false } }), /unavailable/);
	assert.equal(s.phase, "explanation");
});

test("strict mastery repairs gaps; guided mode can continue without asserting mastery", () => {
	for (const mode of ["guided", "strict"] as const) {
		let s = transitionLesson(ready(mode), { type: "start-grill" });
		s = transitionLesson(s, { type: "assess", evidence: { id: "gap", taskId: "t", objectiveId: "identify", verdict: "gap", reason: "Missed interleaving", assisted: false } });
		s = transitionLesson(s, { type: "finish-grill" });
		assert.equal(s.phase, "review-gaps");
		assert.equal(weakObjectives(s).length, 1);
		if (mode === "strict") assert.throws(() => transitionLesson(s, { type: "continue-with-gaps" }), /Strict mastery/);
		else assert.equal(transitionLesson(s, { type: "continue-with-gaps" }).phase, "complete");
	}
});

test("assisted answers require fresh evidence before mastery", () => {
	let s = transitionLesson(ready(), { type: "start-grill" });
	const evidence = { id: "e1", objectiveId: "identify", taskId: "t1", verdict: "demonstrated" as const, reason: "Used a hint", assisted: true };
	s = transitionLesson(s, { type: "assess", evidence });
	assert.equal(weakObjectives(s).length, 1);
	assert.throws(() => transitionLesson(s, { type: "assess", evidence: { ...evidence, id: "e2", assisted: false } }), /fresh task/);
	s = transitionLesson(s, { type: "assess", evidence: { ...evidence, id: "e2", taskId: "t2", assisted: false } });
	assert.equal(transitionLesson(s, { type: "finish-grill" }).phase, "complete");
});

test("grill cannot finish before all objectives have evidence", () => {
	const s = transitionLesson(ready(), { type: "start-grill" });
	assert.throws(() => transitionLesson(s, { type: "finish-grill" }), /every section objective/);
});

test("standalone Grill prepares objectives then assesses without diagnostic or initial explanation", () => {
	let s = createLessonSession("grill", "strict", "grill");
	assert.equal(s.phase, "outline");
	assert.throws(() => transitionLesson(s, { type: "start-grill" }), /objectives/);
	s = transitionLesson(s, { type: "set-outline", sections: ["a", "b"].map((id) => ({ id, title: id, objectives: [{ id: `${id}-o`, description: id }] })), edges: [] });
	s = transitionLesson(s, { type: "start-grill" });
	s = transitionLesson(s, { type: "assess", evidence: { id: "e", objectiveId: "a-o", taskId: "task", verdict: "demonstrated", reason: "Correct unaided explanation", assisted: false } });
	s = transitionLesson(s, { type: "finish-grill" });
	assert.equal(s.sectionIndex, 1);
	assert.equal(s.phase, "grill");
	s = transitionLesson(s, { type: "assess", evidence: { id: "e2", objectiveId: "b-o", taskId: "task2", verdict: "gap", reason: "Missed the invariant", assisted: false } });
	s = transitionLesson(s, { type: "finish-grill" });
	assert.equal(s.phase, "review-gaps");
	assert.throws(() => transitionLesson(s, { type: "continue-with-gaps" }), /Strict/);
});

test("SQLite transitions reject stale writes and roll back invalid actions", () => {
	const store = new LearningWorkspaceStore(":memory:");
	try {
		store.create(createLessonSession("lesson", "strict"));
		store.apply("lesson", 0, { type: "ask-diagnostic" });
		assert.throws(() => store.apply("lesson", 0, { type: "finish-diagnostic" }), /changed/);
		assert.throws(() => store.apply("lesson", 1, { type: "start-grill" }), /unavailable/);
		assert.equal(store.get("lesson")?.revision, 1);
		assert.equal(store.apply("lesson", 1, { type: "finish-diagnostic" }).phase, "outline");
	} finally { store.close(); }
});
