"use client";
import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, StreamLanguage } from "@codemirror/language";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { go } from "@codemirror/legacy-modes/mode/go";
import type { ExerciseLanguage, ExerciseRun, PublicCodingExercise } from "@/src/core";

function CodeEditor({ source, language, onChange }: { source: string; language: ExerciseLanguage; onChange: (value: string) => void }) {
	const host = useRef<HTMLDivElement>(null);
	const editor = useRef<EditorView | null>(null);
	const change = useRef(onChange); change.current = onChange;
	const latest = useRef(source); latest.current = source;
	useEffect(() => {
		if (!host.current) return;
		const syntax = language === "java" ? java() : language === "python" ? python() : language === "go" ? StreamLanguage.define(go) : javascript({ typescript: language === "typescript" });
		const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: latest.current, extensions: [lineNumbers(), highlightActiveLine(), history(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), syntax, syntaxHighlighting(defaultHighlightStyle), EditorView.contentAttributes.of({ "aria-label": "Exercise source code" }), EditorView.theme({ "&": { height: "100%", fontSize: "13px" }, ".cm-scroller": { overflow: "auto" }, ".cm-content": { minHeight: "240px" } }, { dark: true }), EditorView.updateListener.of((update) => { if (update.docChanged) change.current(update.state.doc.toString()); })] }) });
		editor.current = view;
		return () => { view.destroy(); editor.current = null; };
	}, [language]);
	useEffect(() => { const view = editor.current; if (view && view.state.doc.toString() !== source) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } }); }, [source]);
	return <div ref={host} className="min-h-60 flex-1 overflow-hidden rounded border" />;
}

export function ExerciseWorkspace({ lessonId, busy, onSubmit, onClose }: { lessonId: string; busy: boolean; onSubmit: (answer: string) => void; onClose: () => void }) {
	const [exercise, setExercise] = useState<PublicCodingExercise | null>(null);
	const [loadedExerciseId, setLoadedExerciseId] = useState<string | null>(null);
	const pendingSubmission = useRef<{ id: string; source: string; language: ExerciseLanguage; taskId?: string } | null>(null);
	useEffect(() => {
		let active = true;
		const refresh = () => { void fetch(`/api/lessons/${lessonId}/exercise`).then((response) => response.json()).then((data) => { if (active) setExercise(data.exercise ?? null); }).catch(() => {}); };
		refresh(); const timer = busy ? setInterval(refresh, 1500) : undefined;
		return () => { active = false; clearInterval(timer); };
	}, [lessonId, busy]);
	const [source, setSource] = useState("");
	const [language, setLanguage] = useState<ExerciseLanguage>("java");
	const [stdin, setStdin] = useState("");
	const [run, setRun] = useState<ExerciseRun | null>(null);
	const [error, setError] = useState("");
	const [starting, setStarting] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const key = `lh-exercise-${lessonId}`;
	useEffect(() => {
		try { const draft = JSON.parse(localStorage.getItem(key) ?? "null"); if (draft) { if (typeof draft.source === "string") setSource(draft.source); if (typeof draft.stdin === "string") setStdin(draft.stdin); if (["java", "go", "python", "javascript", "typescript"].includes(draft.language)) setLanguage(draft.language); if (typeof draft.exerciseId === "string") setLoadedExerciseId(draft.exerciseId); if (draft.runId) void fetch(`/api/exercises/${draft.runId}`).then((r) => r.json()).then((data) => { if (data.run) setRun(data.run); }).catch(() => setError("Could not restore the previous run.")); } } catch { /* Start an empty editor when the local draft is unavailable. */ }
		setLoaded(true);
	}, [key]);
	useEffect(() => { if (loaded) { try { localStorage.setItem(key, JSON.stringify({ source, language, stdin, runId: run?.id, exerciseId: loadedExerciseId })); } catch { setError("This browser could not save the draft. Copy your code before leaving."); } } }, [key, loaded, source, language, stdin, run?.id, loadedExerciseId]);
	useEffect(() => {
		if (run?.status !== "running") return;
		let active = true;
		const timer = setInterval(() => { void fetch(`/api/exercises/${run.id}`).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (active) setRun(data.run); }).catch((e) => { if (active) setError(String(e)); }); }, 600);
		return () => { active = false; clearInterval(timer); };
	}, [run?.id, run?.status]);
	useEffect(() => {
		const pending = pendingSubmission.current;
		if (!pending || run?.id !== pending.id || run.status === "running" || busy) return;
		pendingSubmission.current = null;
		void fetch(`/api/lessons/${lessonId}/exercise`).then((response) => response.json()).then((data) => setExercise(data.exercise ?? null)).catch(() => setError("Could not refresh revealed tests. Reopen the code workspace to retry."));
		if (run.status === "cancelled" || run.status === "unavailable") { setError("Submission was not sent. Your code is preserved; retry when execution is available."); return; }
		onSubmit(`My solution for coding task ${pending.taskId ?? "scratch code"}:

\`\`\`${pending.language}
${pending.source}
\`\`\`
Run ${run.id}: ${run.status}. Hidden tests were ${run.previouslyRevealed ? "already revealed before this attempt; treat it as assisted" : "not revealed before this attempt"}.
Results: ${JSON.stringify(run.results ?? { stdout: run.stdout, stderr: run.stderr, exitCode: run.exitCode })}
Passing tests alone does not establish conceptual mastery.`);
	}, [run, busy, lessonId, onSubmit]);
	async function execute(submission = false) {
		setStarting(true); setError("");
		try { const response = await fetch("/api/exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, language, source, stdin, ...(exercise && loadedExerciseId === exercise.id ? { exerciseId: exercise.id, purpose: submission ? "submission" : "examples" } : {}) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (submission) pendingSubmission.current = { id: data.run.id, source, language, taskId: exercise?.taskId }; setRun(data.run); } catch (e) { setError(String(e)); } finally { setStarting(false); }
	}
	const running = starting || run?.status === "running";
	return <aside aria-label="Code workspace" className="flex h-dvh w-[26rem] min-w-72 max-w-[90vw] md:max-w-[60vw] shrink-0 resize-x flex-col gap-3 overflow-auto border-l border-border bg-background p-3 text-sm">
		<header className="flex items-center justify-between"><strong>Code workspace</strong><button disabled={running && !!pendingSubmission.current} aria-label="Close code workspace" onClick={onClose}>Close</button></header>
		{exercise && <section className="space-y-2 rounded border p-2"><strong>{exercise.title}</strong><p className="whitespace-pre-wrap">{exercise.instructions}</p><p className="text-xs text-muted-foreground">Examples are visible. Hidden cases are revealed after submission. Outputs must match apart from line endings and a final newline.</p>{loadedExerciseId !== exercise.id && <button disabled={running} className="rounded border px-2 py-1" onClick={() => { setSource(exercise.starter); setLanguage(exercise.language); setStdin(""); setLoadedExerciseId(exercise.id); setRun(null); }}>Load task starter (replaces editor)</button>}{exercise.tests.map((test) => <details key={test.id} className="text-xs"><summary>{test.hidden ? "Revealed test" : "Example"}: {test.label}</summary><p>Input</p><pre className="whitespace-pre-wrap">{test.stdin || "(empty)"}</pre><p>Expected output</p><pre className="whitespace-pre-wrap">{test.expected || "(empty)"}</pre></details>)}</section>}
		<label>Language <select disabled={running || !!exercise && loadedExerciseId === exercise.id} value={language} onChange={(e) => setLanguage(e.target.value as ExerciseLanguage)} className="rounded border bg-background p-1">{["java", "go", "python", "javascript", "typescript"].map((value) => <option key={value}>{value}</option>)}</select></label>
		<p className="text-xs text-muted-foreground">One source file · standard library · {language === "java" ? "Main.java with public static void main" : language === "go" ? "main.go with package main" : language === "typescript" ? "main.ts" : language === "python" ? "main.py" : "main.js"}</p>
		<CodeEditor source={source} language={language} onChange={setSource} />
		{!(exercise && loadedExerciseId === exercise.id) && <label>Standard input<textarea aria-label="Standard input" value={stdin} onChange={(e) => setStdin(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2 font-mono text-[13px]" /></label>}
		<div className="flex gap-2"><button disabled={running || !source.trim()} onClick={() => void execute()} className="rounded border px-3 py-1 disabled:opacity-40">Run</button>
			{run?.status === "running" && <button onClick={() => { void fetch(`/api/exercises/${run.id}`, { method: "DELETE" }).catch((e) => setError(String(e))); }} className="rounded border px-3 py-1">Stop</button>}
			<button disabled={busy || running || !source.trim() || !!exercise && loadedExerciseId !== exercise.id} onClick={() => void execute(true)} className="rounded border px-3 py-1 disabled:opacity-40">Submit answer</button>
		</div>
		{error && <p role="alert" className="text-destructive">{error}</p>}
		{run && <section aria-label="Execution result"><p aria-live="polite">{run.status === "passed" ? run.results ? "Tests passed" : "Ran successfully" : run.status} · {run.stage}</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap text-[13px]">{run.stdout}{run.stderr}</pre>{run.results?.map((result) => <details key={result.id} className="mt-2 rounded border p-2 text-xs"><summary>{result.passed ? "Passed" : "Failed"}: {result.label}</summary><p>Input</p><pre className="whitespace-pre-wrap">{result.stdin}</pre><p>Expected</p><pre className="whitespace-pre-wrap">{result.expected}</pre><p>Actual</p><pre className="whitespace-pre-wrap">{result.actual}{result.stderr}</pre></details>)}</section>}
	</aside>;
}
