import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonPlan } from "../components/lesson-plan.tsx";
import { createLessonSession, transitionLesson, lessonPlan, lessonPlanStatuses } from "../src/core/learning-session.ts";

const sections = ["basics", "locks", "atomics"].map((id) => ({ id, title: id, objectives: [{ id: `${id}-objective`, description: `Explain ${id}` }] }));
const edges = [{ from: "basics", to: "locks" }, { from: "basics", to: "atomics" }];
const outline = () => transitionLesson(createLessonSession("test", "strict"), { type: "finish-diagnostic" });

test("lesson plan stores real branching prerequisites and rejects invalid graphs", () => {
	const session = transitionLesson(outline(), { type: "set-outline", sections, edges });
	assert.deepEqual(lessonPlan(session).edges, edges);
	for (const invalid of [
		[{ from: "absent", to: "locks" }],
		[{ from: "basics", to: "basics" }],
		[...edges, { from: "locks", to: "basics" }],
		[edges[0]!, edges[0]!],
	]) assert.throws(() => transitionLesson(outline(), { type: "set-outline", sections, edges: invalid }));
});

test("graph highlights actual lesson position rather than the latest quiz", () => {
	let session = transitionLesson(outline(), { type: "set-outline", sections, edges });
	assert.equal(lessonPlanStatuses(session).current, null);
	session = transitionLesson(session, { type: "start-explanation" });
	assert.equal(lessonPlanStatuses(session).current, "basics");
	const html = renderToStaticMarkup(<LessonPlan session={session} onOpen={() => {}} />);
	assert.match(html, /Open graphical lesson plan/);
	assert.match(html, /data-testid="plan-node-basics" data-status="current"/);
	assert.match(html, /data-testid="plan-node-locks" data-status="upcoming"/);
	assert.equal(lessonPlanStatuses({ ...session, phase: "complete" }).current, null);
	assert.equal(lessonPlanStatuses({ ...session, phase: "complete" }).visited.size, 3);
});

test("old lessons without dependencies never gain invented prerequisite edges", () => {
	const session = transitionLesson(outline(), { type: "set-outline", sections });
	assert.deepEqual(lessonPlan(session).edges, []);
});
