import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearningWorkspaceStore } from "../src/store/learning-workspace.ts";
import { lessonHttp } from "../src/server/learning-workspace.ts";

const request = (body: unknown) => new Request("http://localhost/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("lesson HTTP requires an explicit mode and excludes assessment writes", async () => {
	const store = new LearningWorkspaceStore(":memory:");
	try {
		const api = lessonHttp(store);
		assert.equal((await api.create(request({ topic: "Java" }))).status, 400);
		assert.equal((await api.create(request({ topic: "   ", mode: "guided" }))).status, 400);
		const created = await api.create(request({ topic: "Java races", mode: "strict" }));
		assert.equal(created.status, 201);
		const { session } = await created.json();
		assert.equal((await api.action(session.id, request({ revision: 0, action: { type: "assess", evidence: {} } }))).status, 400);
		assert.equal((await api.action(session.id, request({ revision: 0, action: { type: "ask-diagnostic" } }))).status, 400);
		assert.equal((await api.action(session.id, request({ revision: 0, action: { type: "start-grill" } }))).status, 409);
		assert.equal((await api.action(session.id, request({ revision: 0, action: { type: "finish-diagnostic" } }))).status, 200);
		assert.equal((await api.action(session.id, request({ revision: 0, action: { type: "finish-diagnostic" } }))).status, 409);
		assert.equal(api.get("missing").status, 404);
		assert.equal((await api.list().json()).lessons[0].topic, "Java races");
	} finally { store.close(); }
});

test("lesson state survives reopening SQLite and rejects concurrent stale updates", () => {
	const directory = mkdtempSync(join(tmpdir(), "learning-workspace-"));
	let first: LearningWorkspaceStore | undefined;
	let second: LearningWorkspaceStore | undefined;
	try {
		const filename = join(directory, "workspace.sqlite");
		first = new LearningWorkspaceStore(filename);
		first.create({ id: "resume", mode: "strict", phase: "quick-check", diagnosticCount: 0, sections: [], sectionIndex: 0, evidence: [], revision: 0 }, "Java");
		first.apply("resume", 0, { type: "ask-diagnostic" });
		first.close(); first = new LearningWorkspaceStore(filename);
		assert.equal(first.get("resume")?.diagnosticCount, 1);
		second = new LearningWorkspaceStore(filename);
		first.apply("resume", 1, { type: "finish-diagnostic" });
		assert.throws(() => second!.apply("resume", 1, { type: "ask-diagnostic" }), /changed/);
		assert.equal(second.get("resume")?.phase, "outline");
	} finally {
		first?.close(); second?.close(); rmSync(directory, { recursive: true, force: true });
	}
});
