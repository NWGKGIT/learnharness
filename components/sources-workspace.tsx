"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceGoal } from "@/src/core";
import { stashOpeningPrompt } from "./opening-prompt";
import { SidebarToggle } from "./sidebar";
import { Button } from "./ui/button";
import { PlanDiagram, GRAPH_PAD, TEXT_CAP_SCALE } from "./plan-block";

const field = "w-full rounded-md border bg-background p-2 text-sm";
export function SourcesWorkspace() {
	const router = useRouter();
	const marker = useId().replace(/[^a-zA-Z0-9-]/g, "");
	const [goals, setGoals] = useState<SourceGoal[]>([]);
	const [selected, setSelected] = useState("");
	const [title, setTitle] = useState("");
	const [text, setText] = useState("");
	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [lockConfirmed, setLockConfirmed] = useState(false);
	const [mode, setMode] = useState<"" | "guided" | "strict">("");
	const refresh = useCallback(async () => {
		try { const response = await fetch("/api/source-library", { cache: "no-store" }); if (!response.ok) throw new Error("Could not load sources"); const data = await response.json(); setGoals(data.goals); }
		catch (e) { setError(e instanceof Error ? e.message : "Could not load sources"); }
	}, []);
	useEffect(() => { setSelected(new URLSearchParams(window.location.search).get("goal") ?? ""); void refresh(); }, [refresh]);
	const generating = goals.some((goal) => goal.status === "generating");
	useEffect(() => { if (!generating) return; const timer = setInterval(() => void refresh(), 2500); return () => clearInterval(timer); }, [generating, refresh]);
	const goal = goals.find((item) => item.id === selected);
	useEffect(() => {
		if (!goal) return;
		const reveal = () => {
			if (!window.location.hash) return;
			let id: string; try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
			const element = document.getElementById(id);
			if (element) { const details = element.closest("details"); if (details) details.open = true; element.scrollIntoView({ block: "center" }); }
		};
		reveal(); window.addEventListener("hashchange", reveal);
		return () => window.removeEventListener("hashchange", reveal);
	}, [goal]);
	async function act(input: Record<string, unknown> | FormData) {
		setBusy(true); setError("");
		try {
			const response = await fetch("/api/source-library", input instanceof FormData ? { method: "POST", body: input } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
			const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not update sources");
			if (data.goals) setGoals(data.goals);
			if (data.selected) { setSelected(data.selected); setTitle(""); }
			if (data.chatId) { if (data.prompt && !stashOpeningPrompt(data.chatId, data.prompt)) throw new Error("Could not save the opening prompt. Retry Start lesson."); router.push(`/chat/${data.chatId}`); }
			setLockConfirmed(false); return true;
		} catch (e) { setError(e instanceof Error ? e.message : "Could not update sources"); await refresh(); return false; }
		finally { setBusy(false); }
	}
	const editable = goal && !goal.lockedAt && goal.status !== "generating" && !busy;
	return <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
		<header className="flex items-center gap-3 border-b px-5 py-3"><SidebarToggle /><h1 className="text-lg">Sources</h1><span className="text-xs text-muted-foreground">Material → roadmap → lessons</span></header>
		{error && <p role="alert" className="border-b p-3 text-sm text-destructive">{error}</p>}
		<div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[260px_minmax(0,1fr)]">
			<aside className="space-y-4 border-r p-4 lg:overflow-auto">
				<form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void act({ action: "create", title }); }}><label htmlFor="source-goal" className="text-sm">New learning goal</label><textarea id="source-goal" className={field} placeholder="What do you want to learn?" value={title} maxLength={2000} onChange={(event) => setTitle(event.target.value)} /><Button size="sm" disabled={busy || !title.trim()}>Create goal</Button></form>
				<nav aria-label="Source learning goals">{goals.map((item) => <button key={item.id} className={`mb-1 block w-full rounded p-2 text-left text-sm hover:bg-accent ${item.id === selected ? "bg-accent" : ""}`} onClick={() => { setSelected(item.id); setLockConfirmed(false); setText(""); setUrl(""); setName(""); }}><span className="block">{item.title}</span><span className="text-xs text-muted-foreground">{item.sources.length} sources · {item.lockedAt ? "Locked" : item.status === "generating" ? "Generating…" : "Draft"}</span></button>)}</nav>
			</aside>
			<div className="space-y-5 p-5 lg:overflow-auto">
				{!goal ? <p className="text-sm text-muted-foreground">Create or select a goal, then add the material you want to learn from.</p> : <>
					<div><h2 className="text-xl">{goal.title}</h2><p role="status" className="mt-1 text-sm text-muted-foreground">{goal.message || "Add your sources. Text is extracted as you add each one."}</p></div>
					{!goal.lockedAt && <section className="space-y-3 rounded-lg border p-4"><h3 className="text-sm font-medium">Add material</h3><input aria-label="Source name" className={field} placeholder="Source name (optional)" value={name} onChange={(event) => setName(event.target.value)} /><textarea aria-label="Source text" className={`${field} min-h-32 font-mono text-[13px]`} placeholder="Paste text, Markdown, or code…" value={text} maxLength={1000000} onChange={(event) => setText(event.target.value)} /><Button size="sm" disabled={!editable || !text.trim()} onClick={async () => { if (await act({ action: "add", id: goal.id, revision: goal.revision, name, text })) { setText(""); setName(""); } }}>Add text</Button><div className="flex gap-2"><input type="url" aria-label="Webpage URL" className={field} placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} /><Button size="sm" variant="outline" disabled={!editable || !url.trim()} onClick={async () => { if (await act({ action: "add", id: goal.id, revision: goal.revision, name, url })) setUrl(""); }}>Add webpage</Button></div><label className="block text-xs text-muted-foreground">Text, code, Markdown, or text PDF · up to 20 MB<input type="file" aria-label="Upload source file" className="mt-2 block w-full text-sm" disabled={!editable} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.set("id", goal.id); form.set("revision", String(goal.revision)); form.set("file", file); event.target.value = ""; await act(form); }} /></label></section>}
					<section className="space-y-2"><h3 className="text-sm font-medium">Source passages · {goal.sources.length} materials</h3>{goal.sources.map((source) => <details key={source.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{source.name} · {source.passages.length} passages</summary>{source.url && <a href={source.url} target="_blank" rel="noreferrer" className="my-2 block break-all text-xs underline">Original webpage</a>}{source.passages.map((passage) => <div key={passage.id} id={passage.id} className="my-3 scroll-m-5 rounded border p-3 target:border-primary"><p className="mb-2 text-xs text-muted-foreground">{passage.location}</p><pre className="whitespace-pre-wrap break-words font-mono text-[13px]">{passage.text}</pre></div>)}{!goal.lockedAt && <Button size="sm" variant="ghost" disabled={!editable} onClick={() => void act({ action: "remove", id: goal.id, revision: goal.revision, sourceId: source.id })}>Remove from goal</Button>}</details>)}</section>
					{!goal.lockedAt && <Button disabled={!editable || !goal.sources.length} onClick={() => void act({ action: "generate", id: goal.id, revision: goal.revision })}>{goal.status === "generating" ? "Generating roadmap…" : goal.roadmap ? "Regenerate roadmap" : "Generate roadmap"}</Button>}
					{goal.roadmap && <section className="space-y-4 rounded-lg border p-4"><h3>Learning roadmap</h3><div className="overflow-auto"><PlanDiagram nodes={goal.roadmap.lessons} edges={goal.roadmap.edges} statusOf={() => "upcoming"} glowId={null} markerId={marker} pad={GRAPH_PAD + 16} textCapScale={TEXT_CAP_SCALE} /></div>
						{!goal.lockedAt ? <div className="space-y-3 border-y py-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={lockConfirmed} onChange={(event) => setLockConfirmed(event.target.checked)} />I reviewed the material and roadmap. Permanently lock this goal’s sources and roadmap before learning.</label><Button size="sm" disabled={!editable || !lockConfirmed} onClick={() => void act({ action: "lock", id: goal.id, revision: goal.revision })}>Lock sources and roadmap</Button></div> : <label className="flex items-center gap-2 text-sm">Advancement<select aria-label="Lesson advancement" className="rounded border bg-background p-2" value={mode} onChange={(event) => setMode(event.target.value as "guided" | "strict")}><option value="">Choose for this session</option><option value="guided">Guided</option><option value="strict">Strict mastery</option></select></label>}
						{goal.roadmap.lessons.map((lesson) => <div key={lesson.id} className="rounded border p-3 text-sm"><h4 className="font-medium">{lesson.title}</h4><p className="my-2 text-muted-foreground">{lesson.summary}</p><ul className="mb-3 list-inside list-disc">{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul><div className="mb-3 flex flex-wrap gap-2 text-xs">{lesson.passageIds.map((id, index) => <a key={id} className="underline" href={`?goal=${goal.id}#${id}`}>Passage {index + 1}</a>)}</div><Button size="sm" disabled={!goal.lockedAt || busy || (!mode && !goal.lessonIds[lesson.id])} onClick={() => void act({ action: "start", id: goal.id, revision: goal.revision, lessonId: lesson.id, mode: mode || "guided" })}>{goal.lessonIds[lesson.id] ? "Continue lesson" : "Start lesson"}</Button></div>)}
					</section>}
				</>}
			</div>
		</div>
	</div>;
}
