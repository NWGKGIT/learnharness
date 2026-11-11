import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLessonSession, transitionLesson, type LessonAction, type LessonSession } from "../core/learning-session.ts";
import { lessonActionSchema } from "../core/learning-validation.ts";
import type { ExerciseRun, CodingExercise } from "../core/exercises.ts";

/** Separate from legacy chat storage; callers supply the active profile path. */
export class LearningWorkspaceStore {
	private db: DatabaseSync;
	constructor(filename: string) {
		if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
		this.db = new DatabaseSync(filename);
		this.db.exec(`PRAGMA journal_mode=WAL;
			PRAGMA busy_timeout=5000;
			CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS lesson_topics (lesson_id TEXT PRIMARY KEY, topic TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS exercise_runs (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS coding_exercises (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, body TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS lesson_events (lesson_id TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, PRIMARY KEY(lesson_id, revision));`);
	}
	close(): void { this.db.close(); }
	saveExercise(exercise: CodingExercise): void {
		this.db.prepare("INSERT INTO coding_exercises VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(exercise.id, exercise.lessonId, JSON.stringify(exercise));
	}
	exercise(id: string): CodingExercise | null {
		const row = this.db.prepare("SELECT body FROM coding_exercises WHERE id=?").get(id);
		return row ? JSON.parse(String(row.body)) : null;
	}
	exerciseTask(lessonId: string, taskId: string): CodingExercise | undefined {
		return this.db.prepare("SELECT body FROM coding_exercises WHERE lesson_id=?").all(lessonId).map((row) => JSON.parse(String(row.body)) as CodingExercise).find((exercise) => exercise.taskId === taskId);
	}
	currentExercise(lessonId: string): CodingExercise | null {
		const session = this.get(lessonId);
		const section = session?.sections[session.sectionIndex]?.id;
		const rows = this.db.prepare("SELECT body FROM coding_exercises WHERE lesson_id=? ORDER BY rowid DESC").all(lessonId);
		return rows.map((row) => JSON.parse(String(row.body)) as CodingExercise).find((exercise) => exercise.sectionId === section) ?? null;
	}
	saveRun(run: ExerciseRun): void {
		this.db.prepare("INSERT INTO exercise_runs VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(run.id, run.lessonId, run.createdAt, JSON.stringify(run));
	}
	getRun(id: string): ExerciseRun | null {
		const row = this.db.prepare("SELECT body FROM exercise_runs WHERE id=?").get(id);
		return row ? JSON.parse(String(row.body)) as ExerciseRun : null;
	}
	create(session: LessonSession, topic = "Untitled lesson"): void {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			this.db.prepare("INSERT INTO lessons VALUES (?, ?, ?)").run(session.id, session.revision, JSON.stringify(session));
			this.db.prepare("INSERT INTO lesson_topics VALUES (?, ?, ?)").run(session.id, topic, new Date().toISOString());
			this.db.exec("COMMIT");
		} catch (error) { this.db.exec("ROLLBACK"); throw error; }
	}
	list(): Array<{ session: LessonSession; topic: string; createdAt: string }> {
		return this.db.prepare("SELECT l.body, t.topic, t.created_at FROM lessons l JOIN lesson_topics t ON l.id=t.lesson_id ORDER BY t.created_at DESC, l.id").all()
			.map((row) => ({ session: JSON.parse(String(row.body)) as LessonSession, topic: String(row.topic), createdAt: String(row.created_at) }));
	}
	get(id: string): LessonSession | null {
		const row = this.db.prepare("SELECT body FROM lessons WHERE id=?").get(id);
		return row ? JSON.parse(String(row.body)) as LessonSession : null;
	}
	phaseHistory(id: string): Array<{ revision: number; phase: LessonSession["phase"]; section: string }> {
		const current = this.get(id); if (!current) return [];
		let state = createLessonSession(id, current.mode, current.entryPoint);
		const history = [{ revision: 0, phase: state.phase, section: "" }];
		const events = this.db.prepare("SELECT action, revision FROM lesson_events WHERE lesson_id=? ORDER BY revision").all(id);
		if (!events.length || Number(events[0]!.revision) !== 1) return [{ revision: current.revision, phase: current.phase, section: current.sections[current.sectionIndex]?.title ?? "" }];
		for (const event of events) {
			const next = transitionLesson(state, lessonActionSchema.parse(JSON.parse(String(event.action))));
			if (next.phase !== state.phase || next.sectionIndex !== state.sectionIndex || next.sections.length !== state.sections.length) history.push({ revision: next.revision, phase: next.phase, section: next.sections[next.sectionIndex]?.title ?? "" });
			state = next;
		}
		return history;
	}
	apply(id: string, expectedRevision: number, action: LessonAction): LessonSession {
		const validated = lessonActionSchema.parse(action);
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const current = this.get(id);
			if (!current) throw new Error("Lesson not found");
			if (current.revision !== expectedRevision) throw new Error("Lesson changed; reload before retrying");
			if (validated.type === "assess") {
				const runs = this.db.prepare("SELECT body FROM exercise_runs WHERE lesson_id=? ORDER BY rowid DESC").all(id).map((row) => JSON.parse(String(row.body)) as ExerciseRun);
				const exercise = this.exerciseTask(id, validated.evidence.taskId);
				const submission = exercise && runs.find((run) => run.exerciseId === exercise.id && run.purpose === "submission" && run.status !== "running");
				if (submission?.previouslyRevealed) validated.evidence.assisted = true;
			}
			const next = transitionLesson(current, validated);
			this.db.prepare("UPDATE lessons SET revision=?, body=? WHERE id=?").run(next.revision, JSON.stringify(next), id);
			this.db.prepare("INSERT INTO lesson_events VALUES (?, ?, ?)").run(id, next.revision, JSON.stringify(validated));
			this.db.exec("COMMIT");
			return next;
		} catch (error) { this.db.exec("ROLLBACK"); throw error; }
	}
}
