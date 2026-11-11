import { randomUUID } from "node:crypto";
import { z } from "zod";
import { learningWorkspace } from "./learning-workspace.ts";
import { executeExerciseCases } from "./coding-exercises.ts";
import { executeExercise } from "./exercise-runner.ts";
import type { ExerciseRun } from "../core/exercises.ts";

const globals = globalThis as typeof globalThis & { exerciseControllers?: Map<string, { lessonId: string; controller: AbortController }> };
const active = globals.exerciseControllers ??= new Map();
const input = z.object({ lessonId: z.string().min(1).max(200), language: z.enum(["java", "go", "python", "javascript", "typescript"]), source: z.string().min(1).max(100_000), stdin: z.string().max(65_536).default(""), exerciseId: z.string().optional(), purpose: z.enum(["examples", "submission"]).optional() }).strict();

export async function startExercise(request: Request): Promise<Response> {
	const parsed = input.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "Invalid exercise. Supply a supported language and one source file (maximum 100,000 characters)." }, { status: 400 });
	const store = learningWorkspace();
	if (!store.get(parsed.data.lessonId)) return Response.json({ error: "Lesson not found" }, { status: 404 });
	if ([...active.values()].some((entry) => entry.lessonId === parsed.data.lessonId)) return Response.json({ error: "Stop the current run first" }, { status: 409 });
	const exercise = parsed.data.exerciseId ? store.exercise(parsed.data.exerciseId) : null;
	if (parsed.data.exerciseId && (!exercise || exercise.lessonId !== parsed.data.lessonId || exercise.language !== parsed.data.language || store.currentExercise(parsed.data.lessonId)?.id !== exercise.id)) return Response.json({ error: "This task is no longer current, or its language does not match." }, { status: 409 });
	if (exercise && !parsed.data.purpose) return Response.json({ error: "Choose examples or submission" }, { status: 400 });
	const run: ExerciseRun = { ...parsed.data, previouslyRevealed: exercise?.revealed, id: randomUUID(), status: "running", stage: "compile", stdout: "", stderr: "", exitCode: null, createdAt: new Date().toISOString() };
	store.saveRun(run);
	if (exercise && run.purpose === "submission") store.saveExercise({ ...exercise, revealed: true });
	const controller = new AbortController(); active.set(run.id, { lessonId: run.lessonId, controller });
	void (exercise ? executeExerciseCases(run, exercise, controller.signal, (next) => store.saveRun(next)) : executeExercise(run, controller.signal, (next) => store.saveRun(next))).catch((error) => {
		store.saveRun({ ...run, status: "failed", stderr: error instanceof Error ? error.message : "Run failed" });
	}).finally(() => active.delete(run.id));
	return Response.json({ run }, { status: 202 });
}

export function exerciseStatus(id: string): Response {
	const store = learningWorkspace();
	const run = store.getRun(id);
	if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
	if (run.status === "running" && !active.has(id)) {
		run.status = "cancelled"; run.stderr += "\nExecution was interrupted by a server restart. Run again when ready."; store.saveRun(run);
	}
	return Response.json({ run });
}

export function cancelExercise(id: string): Response {
	active.get(id)?.controller.abort();
	return exerciseStatus(id);
}
