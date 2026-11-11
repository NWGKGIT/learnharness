import { z } from "zod";

const text = z.string().trim().min(1).max(100_000);
const id = z.string().trim().min(1).max(200);
const section = z.object({
	id, title: text,
	objectives: z.array(z.object({ id, description: text }).strict()).min(1),
}).strict();
export const lessonActionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ask-diagnostic") }).strict(),
	z.object({ type: z.literal("finish-diagnostic") }).strict(),
	z.object({ type: z.literal("set-outline"), sections: z.array(section).min(1), edges: z.array(z.object({ from: id, to: id }).strict()).optional() }).strict(),
	z.object({ type: z.literal("start-explanation") }).strict(),
	z.object({ type: z.literal("start-grill") }).strict(),
	z.object({ type: z.literal("assess"), evidence: z.object({
		id, objectiveId: id, taskId: id, verdict: z.enum(["demonstrated", "gap"]), reason: text, assisted: z.boolean(),
	}).strict() }).strict(),
	z.object({ type: z.literal("finish-grill") }).strict(),
	z.object({ type: z.literal("continue-with-gaps") }).strict(),
]);

/** The browser cannot write grades, pose diagnostic questions or author agent transitions. */
export const learnerLessonActionSchema = z.object({
	revision: z.number().int().nonnegative(),
	action: z.discriminatedUnion("type", [
		z.object({ type: z.literal("finish-diagnostic") }).strict(),
		z.object({ type: z.literal("start-explanation") }).strict(),
		z.object({ type: z.literal("start-grill") }).strict(),
		z.object({ type: z.literal("continue-with-gaps") }).strict(),
	]),
}).strict();

export const newLessonSchema = z.object({ topic: z.string().trim().min(1).max(2000), mode: z.enum(["guided", "strict"]), entryPoint: z.enum(["lesson", "grill"]).default("lesson") }).strict();
