import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { stores } from "./stores.ts";
import { isTurnRunning } from "./turn-liveness.ts";
import { PATHS } from "../../config.ts";
import { LearningWorkspaceStore } from "../store/learning-workspace.ts";
import { createLessonSession } from "../core/learning-session.ts";
import { learnerLessonActionSchema, newLessonSchema } from "../core/learning-validation.ts";

let workspace: LearningWorkspaceStore | undefined;
export function learningWorkspace(): LearningWorkspaceStore {
	return workspace ??= new LearningWorkspaceStore(path.join(PATHS.data, "learning-workspace.sqlite"));
}
export function existingLearningSession(id: string) {
	if (!workspace && !existsSync(path.join(PATHS.data, "learning-workspace.sqlite"))) return null;
	return learningWorkspace().get(id);
}

export async function createLearningLesson(request: Request) {
	return lessonHttp(learningWorkspace(), (topic) => {
		const chat = stores.chatStore.createChat(topic);
		const strong = stores.settingsStore.readSettings()?.models?.strong;
		if (strong?.model) stores.chatStore.saveSettings(chat.id, { model: strong.model, thinkingLevel: strong.thinkingLevel });
		return chat.id;
	}, (id) => { stores.chatStore.deleteChat(id); }).create(request);
}

/** Injected store keeps the transport testable without touching a user's profile. */
export function lessonHttp(store: LearningWorkspaceStore, createChat?: (topic: string) => string, rollbackChat?: (id: string) => void) {
	return {
		list: () => Response.json({ lessons: store.list() }),
		get: (id: string) => {
			const session = store.get(id);
			return session ? Response.json({ session, phaseHistory: store.phaseHistory(id) }) : Response.json({ error: "Lesson not found" }, { status: 404 });
		},
		create: async (request: Request) => {
			const parsed = newLessonSchema.safeParse(await request.json().catch(() => null));
			if (!parsed.success) return Response.json({ error: "Provide a topic and choose guided or strict mastery" }, { status: 400 });
			const session = createLessonSession(createChat?.(parsed.data.topic) ?? randomUUID(), parsed.data.mode, parsed.data.entryPoint);
			try { store.create(session, parsed.data.topic); }
			catch (error) { rollbackChat?.(session.id); throw error; }
			return Response.json({ session, topic: parsed.data.topic }, { status: 201 });
		},
		action: async (id: string, request: Request) => {
			if (isTurnRunning(id)) return Response.json({ error: "Wait for the current response before changing lesson phase" }, { status: 409 });
			const parsed = learnerLessonActionSchema.safeParse(await request.json().catch(() => null));
			if (!parsed.success) return Response.json({ error: "Invalid learner action" }, { status: 400 });
			if (!store.get(id)) return Response.json({ error: "Lesson not found" }, { status: 404 });
			try {
				return Response.json({ session: store.apply(id, parsed.data.revision, parsed.data.action) });
			} catch (error) {
				return Response.json({ error: error instanceof Error ? error.message : "Could not update lesson" }, { status: 409 });
			}
		},
	};
}
