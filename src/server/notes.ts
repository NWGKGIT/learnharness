import path from "node:path";
import { z } from "zod";
import { PATHS } from "../../config.ts";
import { NotesStore } from "../store/notes.ts";
import { noteContentSchema, notesGraph, noteIdentity, notesReconciliationDue } from "../core/notes.ts";
import { noteCandidates, NOTES_EMBEDDING_MODEL } from "./notes-embeddings.ts";
import { prepareNote, resolveNoteConflict, reconcileNotes } from "../agent/notes-maintenance.ts";
import { organizeNote } from "../agent/notes-organizer.ts";
import { piEngineForSpec } from "../agent/models.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { stores } from "./stores.ts";
import { providerKeyPresent } from "./keys.ts";
import { isSubscriptionProvider } from "../agent/subscription-connections.ts";
import { refreshConnectionCatalog } from "./model-catalog.ts";

let instance: NotesStore | undefined;
export const notesStore = () => instance ??= new NotesStore(path.join(PATHS.data, "notes.sqlite"));
const globalState = globalThis as typeof globalThis & { notesQueue?: { tail: Promise<void>; active: Set<string>; maintenanceActive?: boolean } };
const queue = globalState.notesQueue ??= { tail: Promise.resolve(), active: new Set() };

function enqueue(id: string) {
	if (queue.active.has(id)) return;
	queue.active.add(id);
	queue.tail = queue.tail.catch(() => {}).then(async () => {
		const store = notesStore(); const snippet = store.snippet(id); if (!snippet) return;
		try {
			store.saveSnippet({ ...snippet, status: "processing", message: "Finding related notes" });
			const existing = store.snippets().find((item) => item.id !== id && item.status === "completed" && store.pages().some((page) => page.origins.includes(item.id)) && item.text.trim() === snippet.text.trim());
			if (existing) { store.saveSnippet({ ...snippet, status: "duplicate", message: "This exact snippet was already organized." }); return; }
			const revision = store.revision();
			const candidates = await noteCandidates(store, snippet.text);
			const spec = resolveRoleSpec("extractor", stores.settingsStore.readSettings());
			if (!spec) throw new Error("Configure the organizer’s model in Settings. Your snippet is saved.");
			if (isSubscriptionProvider(spec.provider)) await refreshConnectionCatalog(spec.provider);
			if (!providerKeyPresent(spec.provider)) throw new Error("The organizer’s provider is not connected. Your snippet is saved.");
			store.saveSnippet({ ...snippet, status: "processing", message: [candidates.notice, "Organizing into topic pages"].filter(Boolean).join(" ") });
			const proposal = await organizeNote(snippet.text, candidates.pages, store.pages().map(({ id, title, concepts }) => ({ id, title, concepts })), piEngineForSpec(spec, false));
			if (candidates.notice) proposal.summary += ` ${candidates.notice}`;
			store.apply(id, proposal, revision, new Set(candidates.pages.map((page) => page.id)));
   scheduleReconciliation();
		} catch (error) { store.saveSnippet({ ...snippet, status: "failed", message: error instanceof Error ? error.message : "Organization failed; your snippet is saved." }); }
	}).finally(() => queue.active.delete(id));
}

export function notesSnapshot() {
	const store = notesStore();
	for (const snippet of store.snippets()) if (["pending", "processing"].includes(snippet.status) && !queue.active.has(snippet.id)) store.saveSnippet({ ...snippet, status: "failed", message: "Organization was interrupted. Retry when ready; the original is preserved." });
	const pages = store.pages();
	return Response.json({ revision: store.revision(), pages, snippets: store.snippets(), history: store.history(), originals: Object.fromEntries([...new Set(pages.flatMap((page) => page.origins))].map((id) => [id, store.snippet(id)])), graph: notesGraph(pages), embeddingModel: NOTES_EMBEDDING_MODEL, maintenance:store.maintenance() });
}

async function notesEngine(background = false) {
 const spec=resolveRoleSpec("extractor",stores.settingsStore.readSettings());
 if(!spec) throw new Error("Configure the notes organizer model in Settings.");
 if(isSubscriptionProvider(spec.provider)) await refreshConnectionCatalog(spec.provider);
 if(!providerKeyPresent(spec.provider)) throw new Error("The notes organizer provider is not connected.");
 return piEngineForSpec(spec,background);
}
function scheduleReconciliation() {
 const store=notesStore(); const state=store.maintenance();
 if(queue.maintenanceActive || !notesReconciliationDue(state,store.revision())) return;
 queue.maintenanceActive=true;
 store.saveMaintenance({...state,status:"queued",message:"Library reconciliation queued"});
 queue.tail=queue.tail.catch(()=>{}).then(async()=>{
  const start=store.maintenance();
  store.saveMaintenance({...start,status:"running",message:"Checking duplicate notes and equivalent concepts"});
  try {
   const engine=await notesEngine(true);
   // Put similar titles together; bounded batches keep large libraries within model context.
   const remaining=store.pages().sort((a,b)=>noteIdentity(a.title).localeCompare(noteIdentity(b.title))).map(p=>p.id);
   const reviews:Array<{pageIds:string[];reason:string}>=[];
   while(remaining.length) {
    const ids:string[]=[];let size=0;
    while(remaining.length && ids.length<12){const id=remaining[0]!;const page=store.page(id);const length=JSON.stringify(page).length;if(ids.length && size+length>180000)break;remaining.shift();if(page){ids.push(id);size+=length;}}
    const pages=ids.map(id=>store.page(id)!).filter(Boolean);if(pages.length<2)continue;
    const revision=store.revision();
    const result=await reconcileNotes(pages,engine,store.pages());
    store.reconcile(result,revision);reviews.push(...result.reviews);
   }
   const latest=store.maintenance();
   store.saveMaintenance({...latest,status:"idle",message:"Library reconciled. Originals and revision history preserved.",checkedRevision:store.revision(),imports:Math.max(0,latest.imports-start.imports),lastRun:Date.now(),reviews});
  } catch(error) {
   store.saveMaintenance({...store.maintenance(),status:"failed",message:error instanceof Error?error.message:"Reconciliation failed",lastRun:Date.now()});
  }
 }).finally(()=>{queue.maintenanceActive=false;});
}

const actionSchema = z.discriminatedUnion("action", [
	z.object({action:z.literal("maintain")}).strict(),
 z.object({action:z.literal("prepare"),id:z.string(),revision:z.number().int()}).strict(),
 z.object({action:z.literal("resolve"),id:z.string(),revision:z.number().int(),conflictId:z.string(),optionId:z.string()}).strict(),
 z.object({ action: z.literal("paste"), text: z.string().trim().min(1).max(30_000) }).strict(),
	z.object({ action: z.literal("retry"), id: z.string() }).strict(),
	z.object({ action: z.literal("edit"), id: z.string(), revision: z.number().int(), content: noteContentSchema }).strict(),
	z.object({ action: z.literal("delete"), id: z.string(), revision: z.number().int() }).strict(),
	z.object({ action: z.literal("restore"), historyId: z.number().int(), revision: z.number().int() }).strict(),
]);
export async function notesAction(request: Request) {
	const result = actionSchema.safeParse(await request.json().catch(() => null));
	if (!result.success) return Response.json({ error: "Invalid note action. Pasted snippets must contain 1–30,000 characters." }, { status: 400 });
	const input = result.data; const store = notesStore();
	try {
		if (input.action === "maintain") { store.normalizeExact(store.revision()); scheduleReconciliation(); }
  else if(input.action === "prepare" || input.action === "resolve") {
   const page=store.page(input.id);if(!page) throw new Error("Note not found");
   if(store.revision()!==input.revision) throw new Error("Notes changed. Reload before trying again.");
   const content=input.action === "prepare" ? await prepareNote(page,await notesEngine()) : await resolveNoteConflict(page,input.conflictId,input.optionId,await notesEngine());
   store.edit(input.id,content,input.revision,input.action === "resolve" ? "Accepted conflict choice" : "Prepared interactive note and conflict choices");
  }
  else if (input.action === "paste") { const snippet = store.addSnippet(input.text); enqueue(snippet.id); }
		else if (input.action === "retry") { const snippet = store.snippet(input.id); if (!snippet || snippet.status !== "failed") throw new Error("Only failed snippets can be retried"); store.saveSnippet({ ...snippet, status: "pending", message: "Waiting to retry" }); enqueue(input.id); }
		else if (input.action === "restore") store.undo(input.historyId, input.revision);
		else store.edit(input.id, input.action === "edit" ? input.content : null, input.revision);
		return notesSnapshot();
	} catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update notes" }, { status: 409 }); }
}
