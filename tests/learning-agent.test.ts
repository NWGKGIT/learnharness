import { test } from "node:test";
import assert from "node:assert/strict";
import { createLearningTools, learningInstructions } from "../src/agent/learning-agent.ts";
import { createLessonSession, transitionLesson } from "../src/core/learning-session.ts";

test("agent cannot perform learner-only transitions or exceed the diagnostic budget", async () => {
	let session = createLessonSession("test", "strict");
	const tools = createLearningTools({ read: () => session, apply: (_revision, action) => session = transitionLesson(session, action) });
	const call = (action: unknown) => tools.lesson_update!.execute("call", { action });
	for (const type of ["start-grill", "start-explanation", "continue-with-gaps"]) {
		assert.equal((await call({ type })).isError, true);
	}
	for (let i = 0; i < 3; i++) assert.notEqual((await call({ type: "ask-diagnostic" })).isError, true);
	assert.equal((await call({ type: "ask-diagnostic" })).isError, true);
	assert.equal(session.diagnosticCount, 3);
	session = transitionLesson(session, { type: "finish-diagnostic" });
	const refreshed = await tools.lesson_state!.execute("read", {});
	assert.match(JSON.stringify(refreshed.content), /outline/);
	assert.equal((await call({ type: "assess", evidence: { verdict: "invented" } })).isError, true);
	assert.match(learningInstructions(session), /Do not quiz after individual facts/);
});
