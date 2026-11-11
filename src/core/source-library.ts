import { z } from "zod";
import { createTree } from "./plan-tree.ts";

export interface SourcePassage { id: string; text: string; location: string }
export interface LearningSource { id: string; name: string; kind: "text" | "file" | "url"; url?: string; passages: SourcePassage[]; createdAt: string }
const text = z.string().trim().min(1).max(4000);
export const sourceRoadmapSchema = z.object({
	lessons: z.array(z.object({ id: z.string().min(1).max(100), title: text, summary: text, objectives: z.array(text).min(1).max(20), passageIds: z.array(z.string()).min(1).max(40) }).strict()).min(1).max(100),
	edges: z.array(z.object({ from: z.string(), to: z.string() }).strict()).max(300),
}).strict();
export type SourceRoadmap = z.infer<typeof sourceRoadmapSchema>;
export interface SourceGoal { id: string; title: string; revision: number; sources: LearningSource[]; roadmap: SourceRoadmap | null; lockedAt: string | null; status: "ready" | "generating" | "failed"; message: string; lessonIds: Record<string, string> }
export interface LessonMaterial { goalId: string; goal: string; lesson: SourceRoadmap["lessons"][number]; passages: Array<SourcePassage & { source: string }> }
export function validateSourceRoadmap(roadmap: SourceRoadmap, sources: LearningSource[]) {
	sourceRoadmapSchema.parse(roadmap);
	createTree(roadmap.lessons, roadmap.edges);
	const ids = new Set(sources.flatMap((source) => source.passages.map((p) => p.id)));
	for (const lesson of roadmap.lessons) for (const id of lesson.passageIds) if (!ids.has(id)) throw new Error(`Unknown source passage: ${id}`);
}
