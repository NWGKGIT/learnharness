"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, BookOpenIcon, HistoryIcon, NetworkIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { notesGraph, type NotePage, type NoteSnippet, type NoteHistory } from "@/src/core";
import { SidebarToggle } from "./sidebar";
import { Button } from "./ui/button";
import { MessageResponse } from "./ai-elements/message";
import { NoteBlocks } from "./note-blocks";
import { NoteConflictChoice } from "./note-conflicts";
import { NotesGraph } from "./notes-graph";

interface Snapshot { revision: number; pages: NotePage[]; snippets: NoteSnippet[]; history: NoteHistory[]; embeddingModel: string; maintenance?: {status:string;message:string;reviews:Array<{pageIds:string[];reason:string}>}; originals: Record<string, NoteSnippet | null> }
const field = "w-full rounded-md border bg-background p-2 text-sm";

export function NotesWorkspace({ activityPage = false }: { activityPage?: boolean }) {
	const router = useRouter();
	const [data, setData] = useState<Snapshot | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [text, setText] = useState("");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [view, setView] = useState<"notes" | "graph">("notes");
	const [panel, setPanel] = useState<"add" | "activity" | "history" | null>(activityPage ? "activity" : null);
	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/notes", { cache: "no-store" });
			if (!response.ok) throw new Error("Could not load notes");
			setData(await response.json());
			setError("");
		} catch (e) { setError(e instanceof Error ? e.message : "Could not load notes"); }
	}, []);
	useEffect(() => {
  let cancelled=false;
  void fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"maintain"})}).then(async response=>{
   if(!response.ok) throw new Error("Could not check library maintenance");
   const next=await response.json();if(!cancelled)setData(next);
  }).catch(()=>{if(!cancelled)void refresh();});
  return ()=>{cancelled=true;};
 }, [refresh]);
	const processingCount = data?.snippets.filter((snippet) => ["pending", "processing"].includes(snippet.status)).length ?? 0;
	useEffect(() => {
		if (!processingCount && !["queued","running"].includes(data?.maintenance?.status ?? "")) return;
		const timer = setInterval(() => void refresh(), 2000);
		return () => clearInterval(timer);
	}, [processingCount, data?.maintenance?.status, refresh]);
	async function act(action: Record<string, unknown>): Promise<boolean> {
		setBusy(true); setError("");
		try {
			const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
			const next = await response.json();
			if (!response.ok) throw new Error(next.error ?? "Could not update notes");
			setData(next); return true;
		} catch (e) { await refresh(); setError(e instanceof Error ? e.message : "Could not update notes"); return false; }
		finally { setBusy(false); }
	}
	const graph = useMemo(() => notesGraph(data?.pages ?? []), [data?.pages]);
	const page = data?.pages.find((item) => item.id === selected);
	const pages = data?.pages.filter((item) => `${item.title} ${item.concepts.join(" ")} ${item.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
	const openPage = (id: string) => { setSelected(id); setView("notes"); setPanel(null); };
	const togglePanel = (next: NonNullable<typeof panel>) => setPanel(panel === next ? null : next);

	return <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
		<header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6">
			<SidebarToggle />
			<h1 className="mr-auto text-lg font-medium">{activityPage ? "Activity & History" : "Notes"}</h1>
			{activityPage ? <Button asChild variant="outline" size="sm"><Link href="/notes"><ArrowLeftIcon className="size-3.5" />Back to notes</Link></Button> : <>
			<div role="group" aria-label="Library view" className="flex rounded-lg border bg-muted/40 p-1">
				<Button size="sm" variant={view === "notes" ? "default" : "ghost"} aria-pressed={view === "notes"} onClick={() => setView("notes")}><BookOpenIcon className="size-3.5" />Notes</Button>
				<Button size="sm" variant={view === "graph" ? "default" : "ghost"} aria-pressed={view === "graph"} onClick={() => setView("graph")}><NetworkIcon className="size-3.5" />Graph</Button>
			</div>
			<Button size="sm" onClick={() => togglePanel("add")} aria-expanded={panel === "add"} aria-controls="notes-tools"><PlusIcon className="size-3.5" />Add notes</Button>
			</>}
		</header>
		{error && <div role="alert" className="flex items-center gap-3 border-b px-6 py-3 text-sm text-destructive"><span className="mr-auto">{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}>Reload notes</Button></div>}
		<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-xs text-muted-foreground sm:px-6">
			<span>{data ? `${data.pages.length} ${data.pages.length === 1 ? "note" : "notes"}` : "Loading notes…"}</span>
			{activityPage ? <div role="group" aria-label="Activity view" className="flex gap-1 rounded-lg border bg-muted/40 p-1">
				<Button variant={panel === "activity" ? "default" : "ghost"} size="sm" aria-pressed={panel === "activity"} onClick={() => setPanel("activity")}>Activity{processingCount > 0 && <span role="status" className="text-xs">{processingCount} processing</span>}</Button>
				<Button variant={panel === "history" ? "default" : "ghost"} size="sm" aria-pressed={panel === "history"} onClick={() => setPanel("history")}><HistoryIcon className="size-3.5" />History</Button>
			</div> : <Button asChild variant="ghost" size="sm"><Link href="/notes/activity"><HistoryIcon className="size-3.5" />Activity & History{processingCount > 0 && <span role="status" className="rounded bg-muted px-1.5 text-xs">{processingCount} processing</span>}</Link></Button>}
		</div>
		<div className="flex min-h-0 flex-1 flex-col overflow-auto">
			{panel && <section id="notes-tools" aria-label={panel === "add" ? "Add notes" : panel === "activity" ? "Note activity" : "Revision history"} className="shrink-0 border-b bg-muted/15 px-4 py-5 sm:px-6">
				<div className="mx-auto max-w-4xl">
					<div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-medium">{panel === "add" ? "Add notes" : panel === "activity" ? "Activity" : "Revision history"}</h2>{!activityPage && <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={() => setPanel(null)}><XIcon className="size-4" /></Button>}</div>
					{panel === "add" && <form onSubmit={async (event) => { event.preventDefault(); if (await act({ action: "paste", text })) { setText(""); setPanel(null); router.push("/notes/activity"); } }} className="space-y-3">
						<label htmlFor="note-snippet" className="sr-only">Note content</label>
						<textarea id="note-snippet" autoFocus className={`${field} min-h-36 resize-y`} value={text} onChange={(event) => setText(event.target.value)} maxLength={30000} placeholder="Paste an idea, explanation, or code snippet…" />
						<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Organized into topic pages. Originals are preserved.</p><Button type="submit" size="sm" disabled={busy || !data || !text.trim()}>{busy ? "Adding…" : "Organize notes"}</Button></div>
					</form>}
					{panel === "activity" && <div className="space-y-2">
      {data?.maintenance?.message && <div className="rounded-md border p-3 text-sm"><p role="status">{data.maintenance.message}</p>{data.maintenance.reviews.map((review,i)=><div key={i} className="mt-3 border-t pt-3"><p className="text-xs font-medium">Possible duplicates — review needed</p><p className="my-1 text-xs text-muted-foreground">{review.reason}</p>{review.pageIds.map(id=><p key={id} className="text-sm">{data.pages.find(p=>p.id===id)?.title ?? "Archived note"}</p>)}</div>)}</div>}
						{!data?.snippets.length && <p className="text-sm text-muted-foreground">{data ? "No activity yet. Add notes to get started." : "Loading activity…"}</p>}
						{data?.snippets.map((snippet) => <details key={snippet.id} className="rounded-md border bg-background p-3 text-sm"><summary className="cursor-pointer"><span className="mr-3 text-xs capitalize text-muted-foreground">{snippet.status}</span>{snippet.text.slice(0, 90)}</summary><p className="my-3 text-xs text-muted-foreground" role="status">{snippet.message}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t pt-3 text-xs">{snippet.text}</pre>{snippet.status === "failed" && <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "retry", id: snippet.id })}>Retry organization</Button>}</details>)}
					</div>}
					{panel === "history" && <div className="space-y-3">
						{!data?.history.length && <p className="text-sm text-muted-foreground">{data ? "No revisions yet." : "Loading history…"}</p>}
						{data?.history.map((entry) => <details key={entry.id} className="rounded-md border bg-background p-3 text-sm"><summary className="cursor-pointer">{entry.after?.title ?? entry.before?.title} · {entry.reason}</summary><p className="my-2 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p><div className="grid gap-3 md:grid-cols-2"><div><h3 className="text-xs font-medium">Before</h3><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{entry.before?.body ?? "Page did not exist"}</pre></div><div><h3 className="text-xs font-medium">After</h3><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{entry.after?.body ?? "Page deleted"}</pre></div></div><Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "restore", historyId: entry.id, revision: data.revision })}>Restore before this change</Button></details>)}
					</div>}
				</div>
			</section>}
			{!activityPage && (view === "graph" ? <div className="min-h-96 flex-1 p-4 sm:p-6"><NotesGraph graph={graph} onSelect={openPage} /></div> : <div className="flex min-h-0 flex-1">
				<aside aria-label="Notes library" className={`${page ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r md:w-72 xl:w-80`}>
					<div className="p-4"><div className="relative"><SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><input className={`${field} h-10 pl-9`} aria-label="Search notes" placeholder="Search your library" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
					<div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
						{!data ? <p className="px-3 py-6 text-sm text-muted-foreground">Loading notes…</p> : pages.length === 0 ? <div className="px-3 py-6 text-sm text-muted-foreground"><p>{query.trim() ? "No notes match your search." : "Your library is empty. Add notes to start building it."}</p>{query.trim() && <Button className="mt-3" variant="outline" size="sm" onClick={() => setQuery("")}>Clear search</Button>}</div> : pages.map((item) => <button key={item.id} aria-current={page?.id === item.id ? "true" : undefined} onClick={() => openPage(item.id)} className={`mb-1 block w-full rounded-lg p-3 text-left transition-colors hover:bg-accent focus-visible:outline-ring ${page?.id === item.id ? "bg-accent" : ""}`}>
							<span className="block text-sm font-medium">{item.title}</span>
							<span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.body.replace(/[#*_`>]/g, "").slice(0, 180)}</span>
							<span className="mt-2 block text-[11px] text-muted-foreground">Updated {new Date(item.updatedAt).toLocaleDateString()}{item.conflicts.length > 0 && ` · ${item.conflicts.length} unresolved`}</span>
						</button>)}
					</div>
				</aside>
				<div className={`${page ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-auto`}>
					{page && data ? <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-10 sm:py-8"><NoteDetail key={page.id} page={page} originals={data.originals} revision={data.revision} busy={busy} onClose={() => setSelected(null)} onPrepare={() => act({action:"prepare",id:page.id,revision:data.revision})} onResolve={(conflictId,optionId) => act({action:"resolve",id:page.id,revision:data.revision,conflictId,optionId})} onSave={(title, body, revision) => act({ action: "edit", id: page.id, revision, content: { title, body, concepts: page.concepts, links: page.links, conflicts: page.conflicts } })} onDelete={async () => { if (await act({ action: "delete", id: page.id, revision: data.revision })) setSelected(null); }} /></div> : <div className="m-auto max-w-sm p-8 text-center"><BookOpenIcon aria-hidden="true" className="mx-auto mb-4 size-8 text-muted-foreground/50" /><h2 className="text-lg font-medium">{!data ? "Loading your library" : data.pages.length ? "A place for what you know" : "Build your knowledge library"}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{data?.pages.length ? "Select a note to read, edit, and revisit your ideas." : "Add your first notes. They’ll be organized into pages you can browse and search."}</p></div>}
				</div>
			</div>)}
		</div>
	</main>;
}

function NoteDetail({ page, originals, revision, busy, onClose, onPrepare, onResolve, onSave, onDelete }: { page: NotePage; originals: Record<string, NoteSnippet | null>; revision: number; busy: boolean; onClose: () => void; onPrepare: () => Promise<boolean>; onResolve:(conflictId:string,optionId:string)=>Promise<boolean>; onSave: (title: string, body: string, revision: number) => Promise<boolean>; onDelete: () => Promise<void> }) {
	const [editing, setEditing] = useState(false);
	const [editRevision, setEditRevision] = useState(revision);
	const [title, setTitle] = useState(page.title);
	const [body, setBody] = useState(page.body);
 const [prepared,setPrepared]=useState(false);
 useEffect(()=>{
  if(prepared || !page.conflicts.some(c=>typeof c==="string")) return;
  setPrepared(true);void onPrepare();
 },[page.conflicts,prepared,onPrepare]);
	return <article>
		<Button size="sm" variant="ghost" className="mb-5 -ml-3 md:hidden" onClick={onClose}><ArrowLeftIcon className="size-4" />All notes</Button>
		<div className="mb-6 flex flex-wrap items-start gap-2"><h2 className="mr-auto min-w-0 flex-1 break-words text-2xl font-semibold tracking-tight">{page.title}</h2><Button size="sm" variant="ghost" onClick={() => { setTitle(page.title); setBody(page.body); setEditRevision(revision); setEditing(!editing); }}>{editing ? "Cancel edit" : "Edit"}</Button>{!editing && !page.blocks?.length && <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void onPrepare()}>Make interactive</Button>}</div>
		{page.conflicts.length > 0 && <div className="mb-6 space-y-4">{page.conflicts.map((conflict,i)=>typeof conflict === "string" ? <div key={i} className="rounded-lg border border-warning/40 p-4 text-sm"><p>{conflict}</p><Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={()=>void onPrepare()}>{busy ? "Preparing choices…" : "Prepare conflict choices"}</Button></div> : <NoteConflictChoice key={conflict.id+JSON.stringify(conflict)} conflict={conflict} busy={busy} onAccept={optionId=>onResolve(conflict.id,optionId)} />)}</div>}
		{editing ? <form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); if (await onSave(title, body, editRevision)) setEditing(false); }}><input aria-label="Note title" className={field} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /><textarea aria-label="Note body" className={`${field} min-h-72 font-mono text-[13px]`} value={body} maxLength={80000} onChange={(event) => setBody(event.target.value)} /><p className="text-xs text-muted-foreground">Manual edits keep the current graph concepts. Paste additional material to reorganize concepts.</p><Button size="sm" disabled={busy || !title.trim() || !body.trim()}>Save changes</Button></form> : <NoteBlocks blocks={page.blocks} body={page.body} />}
		<details className="mt-5 border-t pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Page details</summary><p className="my-2">{page.concepts.join(" · ")}</p>{page.origins.map((id) => <details key={id} className="my-2"><summary className="cursor-pointer">Original snippet · {originals[id]?.createdAt ? new Date(originals[id]!.createdAt).toLocaleString() : id}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap py-2">{originals[id]?.text ?? "Original unavailable"}</pre></details>)}<p>Revision {page.revision} · {page.origins.length} original snippets preserved</p><Button variant="ghost" size="sm" disabled={busy} onClick={() => void onDelete()}>Delete page (recoverable in history)</Button></details>
	</article>;
}
