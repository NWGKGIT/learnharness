import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeNoteContent, noteContentSchema, noteIdentity, type NoteReconciliation, type NotePage, type NoteSnippet, type NoteHistory, type NoteProposal, type NoteContent } from "../core/notes.ts";

export class NotesStore {
	private db: DatabaseSync;
	constructor(filename: string) {
		if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
		this.db = new DatabaseSync(filename);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
		CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
		INSERT OR IGNORE INTO metadata VALUES (1,0);
		CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, body TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS snippets (id TEXT PRIMARY KEY, body TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, page_id TEXT NOT NULL, before_body TEXT, after_body TEXT, snippet_id TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS note_maintenance (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS note_merge_undo (history_id INTEGER PRIMARY KEY, before_json TEXT NOT NULL, after_json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS embeddings (page_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, model TEXT NOT NULL, vector TEXT NOT NULL);`);
	}
	close() { this.db.close(); }
	revision(): number { return Number(this.db.prepare("SELECT revision FROM metadata WHERE id=1").get()!.revision); }
	pages(): NotePage[] { return this.db.prepare("SELECT body FROM pages ORDER BY id").all().map((row) => JSON.parse(String(row.body))); }
	page(id: string): NotePage | null { const row = this.db.prepare("SELECT body FROM pages WHERE id=?").get(id); return row ? JSON.parse(String(row.body)) : null; }
	snippets(): NoteSnippet[] { return this.db.prepare("SELECT body FROM snippets ORDER BY rowid DESC LIMIT 100").all().map((row) => JSON.parse(String(row.body))); }
	snippet(id: string): NoteSnippet | null { const row = this.db.prepare("SELECT body FROM snippets WHERE id=?").get(id); return row ? JSON.parse(String(row.body)) : null; }
	saveSnippet(snippet: NoteSnippet) { this.db.prepare("INSERT INTO snippets VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(snippet.id, JSON.stringify(snippet)); }
	addSnippet(text: string): NoteSnippet {
		const snippet: NoteSnippet = { id: randomUUID(), text, status: "pending", message: "Waiting to organize", createdAt: new Date().toISOString() };
		this.saveSnippet(snippet); return snippet;
	}
	private write(before: NotePage | null, after: NotePage | null, snippetId: string | null, reason: string) {
		if (after) this.db.prepare("INSERT INTO pages VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(after.id, JSON.stringify(after));
		else if (before) this.db.prepare("DELETE FROM pages WHERE id=?").run(before.id);
		return Number(this.db.prepare("INSERT INTO history(page_id,before_body,after_body,snippet_id,reason,created_at) VALUES (?,?,?,?,?,?)").run((after ?? before)!.id, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, snippetId, reason, new Date().toISOString()).lastInsertRowid);
	}
	private transaction<T>(expected: number, work: () => T): T {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			if (this.revision() !== expected) throw new Error("Notes changed while this operation was being prepared. Retry with the current notes.");
			const result = work();
			this.db.exec("UPDATE metadata SET revision=revision+1 WHERE id=1; COMMIT");
			return result;
		} catch (error) { this.db.exec("ROLLBACK"); throw error; }
	}
	apply(snippetId: string, proposal: NoteProposal, expected: number, allowedIds: Set<string>) {
		return this.transaction(expected, () => {
			const snippet = this.snippet(snippetId);
			if (!snippet || ["completed", "duplicate"].includes(snippet.status)) throw new Error("Snippet is missing or already organized");
			if (proposal.duplicate === (proposal.pages.length > 0)) throw new Error("Duplicates must have no edits; new information must have at least one page");
			const seen = new Set<string>();
			for (const raw of proposal.pages) {
    const change = {...raw, ...normalizeNoteContent(raw)};
				if (change.id && (!allowedIds.has(change.id) || seen.has(change.id))) throw new Error("Invalid or repeated destination note");
				if (change.id) seen.add(change.id);
				const before = change.id ? this.page(change.id) : null;
				if (change.id && !before) throw new Error("Destination note no longer exists");
				const after: NotePage = { id: before?.id ?? randomUUID(), title: change.title, body: change.body, concepts: change.concepts, links: change.links, conflicts: change.conflicts, ...(change.blocks ? {blocks:change.blocks} : {}), revision: (before?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), origins: [...new Set([...(before?.origins ?? []), snippetId])] };
				this.write(before, after, snippetId, change.reason);
			}
			this.normalizeExactPages();
   if (!proposal.duplicate) this.saveMaintenance({...this.maintenance(), imports:this.maintenance().imports+1});
   this.saveSnippet({ ...snippet, status: proposal.duplicate ? "duplicate" : "completed", message: proposal.summary });
		});
	}
	edit(id: string, content: NoteContent | null, expected: number, reason = "Manual edit") {
		this.transaction(expected, () => {
			const before = this.page(id); if (!before) throw new Error("Note not found");
			if (content) content = normalizeNoteContent(content);
			this.write(before, content ? { ...before, ...content, blocks:content.blocks, revision: before.revision + 1, updatedAt: new Date().toISOString() } : null, null, content ? reason : "Deleted by you");
   this.normalizeExactPages();
		});
	}
	history(): NoteHistory[] {
		return this.db.prepare("SELECT * FROM history ORDER BY id DESC LIMIT 100").all().map((row) => ({ id: Number(row.id), pageId: String(row.page_id), before: row.before_body ? JSON.parse(String(row.before_body)) : null, after: row.after_body ? JSON.parse(String(row.after_body)) : null, snippetId: row.snippet_id ? String(row.snippet_id) : null, reason: String(row.reason), createdAt: String(row.created_at) }));
	}
	undo(historyId: number, expected: number) {
		this.transaction(expected, () => {
			const group = this.db.prepare("SELECT before_json, after_json FROM note_merge_undo WHERE history_id=?").get(historyId);
   if (group) {
    const before = JSON.parse(String(group.before_json)) as NotePage[];
    const after = JSON.parse(String(group.after_json)) as NotePage[];
    const ids = new Set([...before,...after].map(p=>p.id));
    for (const id of ids) if (snapshotIdentity(this.page(id)) !== snapshotIdentity(after.find(p=>p.id===id) ?? null)) throw new Error("A merged note changed. Restore its newer edits before undoing this merge.");
    for (const id of ids) {
     const current=this.page(id); const prior=before.find(p=>p.id===id);
     this.write(current, prior ? {...prior, revision:Math.max(prior.revision,current?.revision ?? 0)+1,updatedAt:new Date().toISOString()} : null,null,"Restored entire note merge");
    }
    return;
   }
   const row = this.db.prepare("SELECT * FROM history WHERE id=?").get(historyId);
			if (!row) throw new Error("Revision not found");
			const current = this.page(String(row.page_id));
			const prior: NotePage | null = row.before_body ? JSON.parse(String(row.before_body)) : null;
			if (!current && !prior) throw new Error("This note is already absent");
			this.write(current, prior ? { ...prior, revision: (current?.revision ?? 0) + 1, updatedAt: new Date().toISOString() } : null, null, `Restored state before change ${historyId}`);
		});
	}
 normalizeExact(expected:number) {
  this.db.exec("BEGIN IMMEDIATE");
  try {
   if(this.revision()!==expected) throw new Error("Notes changed during normalization");
   const before=JSON.stringify(this.pages());
   this.normalizeExactPages();
   if(before!==JSON.stringify(this.pages())) this.db.exec("UPDATE metadata SET revision=revision+1 WHERE id=1");
   this.db.exec("COMMIT");
  } catch(error) {this.db.exec("ROLLBACK");throw error;}
 }

 maintenance(): NoteMaintenance {
  const row=this.db.prepare("SELECT body FROM note_maintenance WHERE id=1").get();
  return row ? {...defaultMaintenance(), ...JSON.parse(String(row.body))} : defaultMaintenance();
 }
 saveMaintenance(value: NoteMaintenance) { this.db.prepare("INSERT INTO note_maintenance VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(value)); }
 private mergePages(before: NotePage[], content: NoteContent, reason: string) {
  const first=before[0]!;
  const after:NotePage={...first,...normalizeNoteContent(content),blocks:content.blocks,origins:[...new Set(before.flatMap(p=>p.origins))],revision:first.revision+1,updatedAt:new Date().toISOString()};
  const historyIds=[this.write(first,after,null,reason)];
  for(const page of before.slice(1)) historyIds.push(this.write(page,null,null,reason));
  for(const id of historyIds) this.db.prepare("INSERT INTO note_merge_undo VALUES (?,?,?)").run(id,JSON.stringify(before),JSON.stringify([after]));
 }
 private normalizeExactPages() {
  const groups=new Map<string,NotePage[]>();
  for(const original of this.pages()) {
   const {id,revision,origins,updatedAt,...content}=original;
   const normalized=normalizeNoteContent(content);
   const changed=JSON.stringify(noteContentSchema.parse(content))!==JSON.stringify(noteContentSchema.parse(normalized));
   const page={...original,...normalized,...(changed ? {revision:original.revision+1,updatedAt:new Date().toISOString()} : {})};
   if(changed) this.write(original,page,null,"Normalized concept names");
   const key=JSON.stringify([noteIdentity(page.title),page.body.trim(),page.conflicts,page.blocks ?? null]);
   const group=groups.get(key) ?? [];group.push(page);groups.set(key,group);
  }
  for(const group of groups.values()) if(group.length>1) {
   const first=group[0]!;
   this.mergePages(group,{...first,concepts:group.flatMap(p=>p.concepts),links:group.flatMap(p=>p.links)},"Merged exact duplicate notes");
  }
 }
 reconcile(proposal: NoteReconciliation, expected:number) {
  this.transaction(expected,()=>{
   const seen=new Set<string>();
   for(const merge of proposal.merges) {
    const pages=merge.pageIds.map(id=>{
     if(seen.has(id)) throw new Error("A note can belong to only one merge"); seen.add(id);
     const page=this.page(id);if(!page) throw new Error("Missing reconciliation note"); return page;
    });
    // Conflict decisions belong to the human, even when pages are combined.
    const conflicts=pages.flatMap(p=>p.conflicts);
    for(const c of conflicts) if(!merge.content.conflicts.some(next=>JSON.stringify(next)===JSON.stringify(c))) throw new Error("A merge cannot drop or change unresolved conflicts");
    this.mergePages(pages,merge.content,merge.reason);
   }
   const aliases=new Map(proposal.aliases.map(a=>[noteIdentity(a.from),a.to]));
   for(const page of this.pages()) {
    const rename=(name:string)=>aliases.get(noteIdentity(name)) ?? name;
    const next={...page,...normalizeNoteContent({...page,concepts:page.concepts.map(rename),links:page.links.map(l=>({from:rename(l.from),to:rename(l.to)}))})};
    if(JSON.stringify(next)!==JSON.stringify(page)) this.write(page,{...next,revision:page.revision+1,updatedAt:new Date().toISOString()},null,"Reconciled equivalent concept names");
   }
   this.normalizeExactPages();
  });
 }

	embedding(id: string, fingerprint: string, model: string): number[] | null {
		const row = this.db.prepare("SELECT vector FROM embeddings WHERE page_id=? AND fingerprint=? AND model=?").get(id, fingerprint, model);
		return row ? JSON.parse(String(row.vector)) : null;
	}
	saveEmbedding(id: string, fingerprint: string, model: string, vector: number[]) {
		this.db.prepare("INSERT INTO embeddings VALUES (?,?,?,?) ON CONFLICT(page_id) DO UPDATE SET fingerprint=excluded.fingerprint,model=excluded.model,vector=excluded.vector").run(id, fingerprint, model, JSON.stringify(vector));
	}
}

export interface NoteMaintenance {
 imports:number; checkedRevision:number; lastRun:number; status:"idle"|"queued"|"running"|"failed";
 message:string; reviews:Array<{pageIds:string[]; reason:string}>;
}
function defaultMaintenance():NoteMaintenance {return {imports:0,checkedRevision:0,lastRun:0,status:"idle",message:"",reviews:[]};}

function snapshotIdentity(page:NotePage | null):string {
 if(!page) return "null";
 const {revision,updatedAt,...content}=page;
 return JSON.stringify(content);
}
