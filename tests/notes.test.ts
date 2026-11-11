import { test } from "node:test";
import assert from "node:assert/strict";
import { NotesStore } from "../src/store/notes.ts";
import { notesGraph, notesReconciliationDue, cosineSimilarity, type NoteProposal } from "../src/core/notes.ts";

const content = { title: "Java concurrency", body: "Volatile provides visibility, not atomic increments.", concepts: ["Visibility", "Atomicity"], links: [{ from: "Visibility", to: "Atomicity" }], conflicts: [] as string[] };
const proposal = (body = content.body): NoteProposal => ({ duplicate: false, summary: "Organized concurrency", pages: [{ ...content, body, id: null, reason: "New topic" }] });

test("notes merge preserves originals, conflicts and undoable revisions", () => {
	const store = new NotesStore(":memory:");
	try {
		const first = store.addSnippet(content.body);
		store.apply(first.id, proposal(), 0, new Set());
		const before = store.pages()[0]!;
		const second = store.addSnippet("Conflicting claim: volatile increments are atomic.");
		const merge = proposal(`${content.body}\nConflicting claim: volatile increments are atomic.`);
		merge.pages[0]!.id = before.id;
		merge.pages[0]!.conflicts = ["Contradictory claims about volatile increments"];
		store.apply(second.id, merge, 1, new Set([before.id]));
		assert.deepEqual(store.pages()[0]!.origins, [first.id, second.id]);
		assert.equal(store.pages()[0]!.conflicts.length, 1);
		assert.equal(store.snippet(first.id)!.text, content.body);
		store.undo(store.history()[0]!.id, 2);
		assert.equal(store.pages()[0]!.body, before.body);
		assert.equal(store.history().length, 3);
	} finally { store.close(); }
});

test("duplicate leaves pages untouched and stale proposals cannot overwrite edits", () => {
	const store = new NotesStore(":memory:");
	try {
		store.apply(store.addSnippet("first").id, proposal(), 0, new Set());
		const before = store.pages();
		store.apply(store.addSnippet("same meaning").id, { duplicate: true, summary: "Already covered", pages: [] }, 1, new Set());
		assert.deepEqual(store.pages(), before);
		assert.throws(() => store.apply(store.addSnippet("stale").id, proposal(), 1, new Set()), /Notes changed/);
		assert.deepEqual(store.pages(), before);
	} finally { store.close(); }
});

test("invalid graph or unseen page edits roll back every proposed change", () => {
	const store = new NotesStore(":memory:");
	try {
		const invalid = proposal();
		invalid.pages.push({ ...content, id: "unseen", reason: "bad destination" });
		assert.throws(() => store.apply(store.addSnippet("bad").id, invalid, 0, new Set()), /Invalid/);
		assert.equal(store.pages().length, 0);
		assert.equal(store.history().length, 0);
		const badLink = proposal(); badLink.pages[0]!.links = [{ from: "Missing", to: "Atomicity" }];
		assert.throws(() => store.apply(store.addSnippet("bad link").id, badLink, 0, new Set()), /distinct concepts/);
	} finally { store.close(); }
});

test("delete and restore keep history; undoing an absent creation gives a clear error", () => {
	const store = new NotesStore(":memory:");
	try {
		store.apply(store.addSnippet("first").id, proposal(), 0, new Set());
		const creation = store.history()[0]!;
		store.edit(store.pages()[0]!.id, null, 1);
		assert.equal(store.pages().length, 0);
		assert.throws(() => store.undo(creation.id, 2), /already absent/);
		store.undo(store.history()[0]!.id, 2);
		assert.equal(store.pages()[0]!.body, content.body);
	} finally { store.close(); }
});

test("notes graph has topic groups and connects shared concepts independently of learning IDs", () => {
	const pages = ["a", "b"].map((id) => ({ ...content, id, revision: 1, updatedAt: "", origins: [] }));
	const graph = notesGraph(pages);
	assert.equal(graph.clusters.length, 2);
	assert.equal(graph.nodes.length, 4);
	assert.ok(graph.edges.some((edge) => edge.from === "a:0" && edge.to === "b:0"));
	assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
	assert.equal(cosineSimilarity([1], [1, 0]), 0);
});

test("cosmetic duplicate concepts normalize on write, exact notes merge with all origins and undo together", () => {
 const store=new NotesStore(":memory:");
 try {
  const a=store.addSnippet("original a");store.apply(a.id,proposal(),0,new Set());
  const first=store.pages()[0]!;
  const b=store.addSnippet("original b");
  const duplicate=proposal();duplicate.pages[0]!.concepts=["Visibility"," visibility ","Atomicity"];duplicate.pages[0]!.links=[{from:" visibility ",to:"Atomicity"}];
  store.apply(b.id,duplicate,store.revision(),new Set());
  assert.equal(store.pages().length,1);
  assert.deepEqual(new Set(store.pages()[0]!.origins),new Set([a.id,b.id]));
  assert.deepEqual(store.pages()[0]!.concepts,["Visibility","Atomicity"]);
  const merge=store.history().find(h=>h.reason==="Merged exact duplicate notes")!;
  store.undo(merge.id,store.revision());
  assert.equal(store.pages().length,2);
  assert.ok(store.page(first.id));assert.equal(store.snippet(a.id)!.text,"original a");
 } finally {store.close();}
});

test("reconciliation preserves conflicts, rejects stale work, and manual edits invalidate rendered blocks",()=>{
 const store=new NotesStore(":memory:");
 try {
  const initial=proposal();initial.pages[0]!.blocks=[{type:"prose",text:content.body}];
  initial.pages[0]!.conflicts=[{id:"claim",summary:"Conflicting claims",options:[{id:"a",claim:"Atomic"},{id:"b",claim:"Not atomic"}],recommendedOptionId:"b",recommendation:"Compound increments include multiple operations."}];
  store.apply(store.addSnippet("first").id,initial,0,new Set());
  store.apply(store.addSnippet("second").id,proposal("More details about visibility."),store.revision(),new Set());
  const pages=store.pages();
  assert.throws(()=>store.reconcile({merges:[{pageIds:pages.map(p=>p.id),content,reason:"merge"}],aliases:[],reviews:[]},store.revision()),/unresolved conflicts/);
  assert.equal(store.pages().length,2);
  assert.throws(()=>store.reconcile({merges:[],aliases:[],reviews:[]},0),/Notes changed/);
  const page=pages.find(p=>p.blocks)!;
  store.edit(page.id,{...content,body:"Edited Markdown",conflicts:page.conflicts},store.revision());
  assert.equal(store.page(page.id)!.blocks,undefined);
  const revision=store.revision();store.normalizeExact(revision);assert.equal(store.revision(),revision);
 }finally{store.close();}
});

test("reconciliation runs after five imports or a dirty day, and backs off failures",()=>{
 const hour=60*60*1000;const now=100*hour;
 const state={checkedRevision:4,imports:4,lastRun:now-hour,status:"idle"};
 assert.equal(notesReconciliationDue(state,5,now),false);
 assert.equal(notesReconciliationDue({...state,imports:5},5,now),true);
 assert.equal(notesReconciliationDue({...state,lastRun:now-24*hour},5,now),true);
 assert.equal(notesReconciliationDue({...state,imports:5},4,now),false);
 assert.equal(notesReconciliationDue({...state,imports:5,status:"failed",lastRun:now},5,now),false);
});
