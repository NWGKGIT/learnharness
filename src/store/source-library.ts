import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { SourceGoal, LessonMaterial } from "../core/source-library.ts";

export class SourceLibraryStore {
	private db: DatabaseSync;
	constructor(filename: string) {
		mkdirSync(dirname(filename), { recursive: true });
		this.db = new DatabaseSync(filename);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
		CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS originals(id TEXT PRIMARY KEY, data BLOB NOT NULL);
		CREATE TABLE IF NOT EXISTS lesson_material(lesson_id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
	}
	list(): SourceGoal[] { return this.db.prepare("SELECT body FROM goals ORDER BY rowid DESC").all().map((r) => JSON.parse(String(r.body))); }
	get(id: string): SourceGoal { const row = this.db.prepare("SELECT body FROM goals WHERE id=?").get(id); if (!row) throw new Error("Learning goal not found"); return JSON.parse(String(row.body)); }
	create(title: string): SourceGoal {
		const goal: SourceGoal = { id: randomUUID(), title, revision: 0, sources: [], roadmap: null, lockedAt: null, status: "ready", message: "", lessonIds: {} };
		this.db.prepare("INSERT INTO goals VALUES (?,?,?)").run(goal.id, 0, JSON.stringify(goal)); return goal;
	}
	save(goal: SourceGoal, revision: number) {
		const next = { ...goal, revision: revision + 1 };
		const result = this.db.prepare("UPDATE goals SET revision=?,body=? WHERE id=? AND revision=?").run(next.revision, JSON.stringify(next), goal.id, revision);
		if (!result.changes) throw new Error("This goal changed. Reload before trying again.");
		return next;
	}
	saveOriginal(id: string, data: Uint8Array) { this.db.prepare("INSERT INTO originals VALUES (?,?)").run(id, data); }
	saveMaterial(id: string, material: LessonMaterial) { this.db.prepare("INSERT INTO lesson_material VALUES (?,?)").run(id, JSON.stringify(material)); }
	material(id: string): LessonMaterial | undefined { const row = this.db.prepare("SELECT body FROM lesson_material WHERE lesson_id=?").get(id); return row ? JSON.parse(String(row.body)) : undefined; }
}
