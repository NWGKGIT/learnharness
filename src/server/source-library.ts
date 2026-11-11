import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { PATHS } from "../../config.ts";
import { SourceLibraryStore } from "../store/source-library.ts";
import { ingestSource } from "./source-ingestion.ts";
import { generateSourceRoadmap } from "../agent/source-roadmap.ts";
import { piEngineForSpec } from "../agent/models.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { stores } from "./stores.ts";
import { providerKeyPresent } from "./keys.ts";
import { isSubscriptionProvider } from "../agent/subscription-connections.ts";
import { refreshConnectionCatalog } from "./model-catalog.ts";
import { createLessonSession } from "../core/learning-session.ts";
import { learningWorkspace } from "./learning-workspace.ts";
import type { LessonMaterial } from "../core/source-library.ts";

const filename = path.join(PATHS.data, "source-library.sqlite");
let instance: SourceLibraryStore | undefined;
const library = () => instance ??= new SourceLibraryStore(filename);
const globalState = globalThis as typeof globalThis & { sourceRoadmapJobs?: Set<string> };
const jobs = globalState.sourceRoadmapJobs ??= new Set<string>();
export function lessonSourceMaterial(id: string) { return instance || existsSync(filename) ? library().material(id) : undefined; }
export function sourceLibrarySnapshot() {
	const store = library();
	for (const goal of store.list()) if (goal.status === "generating" && !jobs.has(goal.id)) store.save({ ...goal, status: "failed", message: "Generation was interrupted. Generate the roadmap again." }, goal.revision);
	return Response.json({ goals: store.list() });
}
const actionSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(2000) }),
	z.object({ action: z.literal("add"), id: z.string(), revision: z.number().int(), name: z.string().max(500).optional(), text: z.string().max(1000000).optional(), url: z.string().url().optional() }),
	z.object({ action: z.literal("remove"), id: z.string(), revision: z.number().int(), sourceId: z.string() }),
	z.object({ action: z.literal("generate"), id: z.string(), revision: z.number().int() }),
	z.object({ action: z.literal("lock"), id: z.string(), revision: z.number().int() }),
	z.object({ action: z.literal("start"), id: z.string(), revision: z.number().int(), lessonId: z.string(), mode: z.enum(["guided", "strict"]) }),
]);
export async function sourceLibraryAction(request: Request) {
	try {
		let file: File | undefined; let raw: unknown;
		if (request.headers.get("content-type")?.includes("multipart/form-data")) {
			const form = await request.formData(); const upload = form.get("file"); if (!(upload instanceof File)) throw new Error("Choose a file"); file = upload;
			raw = { action: "add", id: form.get("id"), revision: Number(form.get("revision")) };
		} else raw = await request.json();
		const input = actionSchema.parse(raw); const store = library();
		if (input.action === "create") { const goal = store.create(input.title); return Response.json({ goals: store.list(), selected: goal.id }); }
		let goal = store.get(input.id);
		if (goal.revision !== input.revision) throw new Error("Goal changed. Reload before trying again.");
		if (input.action === "start") {
			if (!goal.lockedAt || !goal.roadmap) throw new Error("Lock the sources and roadmap before starting a lesson.");
			const existing = goal.lessonIds[input.lessonId]; if (existing) return Response.json({ chatId: existing, prompt: stores.chatStore.getChat(existing)?.messages.length ? undefined : `Teach me the locked roadmap lesson ${input.lessonId} for ${goal.title}.` });
			const item = goal.roadmap.lessons.find((lesson) => lesson.id === input.lessonId); if (!item) throw new Error("Roadmap lesson not found");
			const material: LessonMaterial = { goalId: goal.id, goal: goal.title, lesson: item, passages: goal.sources.flatMap((source) => source.passages.filter((p) => item.passageIds.includes(p.id)).map((p) => ({ ...p, source: source.name }))) };
			const chat = stores.chatStore.createChat(item.title);
			const strong = stores.settingsStore.readSettings()?.models?.strong;
			if (strong?.model) stores.chatStore.saveSettings(chat.id, { model: strong.model, thinkingLevel: strong.thinkingLevel });
			store.saveMaterial(chat.id, material);
			learningWorkspace().create(createLessonSession(chat.id, input.mode), item.title);
			store.save({ ...goal, lessonIds: { ...goal.lessonIds, [item.id]: chat.id } }, goal.revision);
			return Response.json({ chatId: chat.id, prompt: `Teach me ${item.title} using the locked source material and objectives for ${goal.title}.` });
		}
		if (goal.lockedAt) throw new Error("This goal’s sources and roadmap are permanently locked. Create a new goal for different material.");
		if (goal.status === "generating") throw new Error("Wait for roadmap generation to finish.");
		if (input.action === "add") {
			const result = await ingestSource({ file, ...input });
			store.saveOriginal(result.source.id, result.raw);
			store.save({ ...goal, sources: [...goal.sources, result.source], roadmap: null, status: "ready", message: "Material extracted. Generate a roadmap when ready." }, goal.revision);
		} else if (input.action === "remove") store.save({ ...goal, sources: goal.sources.filter((source) => source.id !== input.sourceId), roadmap: null, status: "ready", message: "Material changed. Generate a new roadmap." }, goal.revision);
		else if (input.action === "lock") {
			if (!goal.roadmap) throw new Error("Generate and review a roadmap first.");
			store.save({ ...goal, lockedAt: new Date().toISOString(), message: "Sources and roadmap locked. Lessons are ready." }, goal.revision);
		} else {
			if (!goal.sources.length) throw new Error("Add source material first.");
			goal = store.save({ ...goal, status: "generating", message: "Reading material and building the roadmap…" }, goal.revision);
			jobs.add(goal.id);
			void (async () => {
				try {
					const spec = resolveRoleSpec("teacher", stores.settingsStore.readSettings());
					if (!spec) throw new Error("Choose a teaching model in Settings.");
					if (isSubscriptionProvider(spec.provider)) await refreshConnectionCatalog(spec.provider);
					if (!providerKeyPresent(spec.provider)) throw new Error("Connect the selected provider in Settings.");
					const roadmap = await generateSourceRoadmap(goal, piEngineForSpec(spec, false));
					store.save({ ...goal, roadmap, status: "ready", message: "Review the roadmap and sources, then lock them to begin." }, goal.revision);
				} catch (error) { store.save({ ...goal, status: "failed", message: error instanceof Error ? error.message : "Roadmap generation failed" }, goal.revision); }
				finally { jobs.delete(goal.id); }
			})();
		}
		return sourceLibrarySnapshot();
	} catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update sources" }, { status: 400 }); }
}
