import { randomUUID } from "node:crypto";
import { codingExerciseSchema, exerciseOutputMatches, type CodingExerciseInput } from "../core/exercise-validation.ts";
import type { CodingExercise, ExerciseRun, PublicCodingExercise } from "../core/exercises.ts";
import { learningWorkspace } from "./learning-workspace.ts";
import { executeExercise } from "./exercise-runner.ts";

export function publicExercise(exercise: CodingExercise): PublicCodingExercise {
	const { reference: _reference, ...visible } = exercise;
	return { ...visible, tests: exercise.tests.filter((test) => exercise.revealed || !test.hidden) };
}
export function currentCodingExercise(lessonId: string) {
	const exercise = learningWorkspace().currentExercise(lessonId);
	return Response.json({ exercise: exercise ? publicExercise(exercise) : null });
}
export async function publishCodingExercise(lessonId: string, input: CodingExerciseInput, signal?: AbortSignal) {
	const draft = codingExerciseSchema.parse(input);
	const store = learningWorkspace(); const session = store.get(lessonId);
	const section = session?.sections[session.sectionIndex];
	if (store.exerciseTask(lessonId, draft.taskId)) throw new Error("This task ID has already been used. Use a fresh task and ID for reassessment.");
	if (!section || session?.phase !== "grill") throw new Error("Coding exercises can only be assigned during the current section’s grill.");
	if (draft.objectiveIds.some((id) => !section.objectives.some((objective) => objective.id === id))) throw new Error("Use current section objective IDs.");
	if (!draft.tests.some((test) => test.hidden) || !draft.tests.some((test) => !test.hidden)) throw new Error("Include both examples and hidden cases.");
	if (new Set(draft.tests.map((test) => test.id)).size !== draft.tests.length) throw new Error("Test IDs must be unique.");
	const exercise: CodingExercise = { ...draft, id: randomUUID(), lessonId, sectionId: section.id, revealed: false };
	for (const test of exercise.tests) {
		const run: ExerciseRun = { id: randomUUID(), lessonId, language: exercise.language, source: exercise.reference, stdin: test.stdin, status: "running", stage: "compile", stdout: "", stderr: "", exitCode: null, createdAt: new Date().toISOString() };
		const result = await executeExercise(run, signal ?? AbortSignal.timeout(360000), () => {});
		if (result.status !== "passed" || !exerciseOutputMatches(result.stdout, test.expected)) throw new Error(`Reference solution failed case ${test.label}: ${result.status}; expected ${JSON.stringify(test.expected)}, got ${JSON.stringify(result.stdout)}. ${result.stderr}`);
	}
	if (signal?.aborted) throw new Error("Exercise validation cancelled");
	if (store.get(lessonId)?.revision !== session.revision) throw new Error("Lesson changed while validating the exercise. Prepare a task for its current state.");
	store.saveExercise(exercise);
	return publicExercise(exercise);
}

export async function executeExerciseCases(run: ExerciseRun, exercise: CodingExercise, signal: AbortSignal, update: (run: ExerciseRun) => void) {
	const cases = exercise.tests.filter((test) => run.purpose === "submission" || !test.hidden);
	run.results = [];
	for (const test of cases) {
		if (signal.aborted) { run.status = "cancelled"; break; }
		const result = await executeExercise({ ...run, results: undefined, stdin: test.stdin, status: "running", stdout: "", stderr: "", exitCode: null }, signal, (next) => { run.stage = next.stage; update({ ...run }); });
		run.results.push({ id: test.id, label: test.label, stdin: test.stdin, expected: test.expected, actual: result.stdout, passed: result.status === "passed" && exerciseOutputMatches(result.stdout, test.expected), stderr: result.stderr });
		run.exitCode = result.exitCode;
		if (["cancelled", "timeout", "unavailable"].includes(result.status) || result.stage === "compile" && result.status !== "passed") { run.status = result.status; run.stderr = result.stderr; break; }
		update({ ...run });
	}
	if (run.status === "running") run.status = run.results.length === cases.length && run.results.every((result) => result.passed) ? "passed" : "failed";
	update({ ...run }); return run;
}
