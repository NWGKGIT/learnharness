import { z } from "zod";

export const noteBlockSchema = z.discriminatedUnion("type", [
 z.object({ type: z.literal("heading"), text: z.string().min(1).max(500), level: z.enum(["2", "3"]) }).strict(),
 z.object({ type: z.literal("prose"), text: z.string().min(1).max(20000) }).strict(),
 z.object({ type: z.literal("code"), code: z.string().min(1).max(20000), language: z.string().max(50) }).strict(),
 z.object({ type: z.literal("callout"), title: z.string().max(300), text: z.string().min(1).max(10000) }).strict(),
 z.object({ type: z.literal("disclosure"), title: z.string().min(1).max(300), text: z.string().min(1).max(20000) }).strict(),
 z.object({ type: z.literal("question"), question: z.string().min(1).max(4000), answer: z.string().min(1).max(10000) }).strict(),
]);
export const noteConflictSchema = z.object({
 id: z.string().min(1).max(100), summary: z.string().min(1).max(4000),
 options: z.array(z.object({ id: z.string().min(1).max(100), claim: z.string().min(1).max(4000) }).strict()).min(2).max(6),
 recommendedOptionId: z.string().nullable(), recommendation: z.string().max(4000),
}).strict();
export type NoteBlock = z.infer<typeof noteBlockSchema>;
export type NoteConflict = z.infer<typeof noteConflictSchema>;

export const noteContentSchema = z.object({
	title: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(80_000),
	concepts: z.array(z.string().trim().min(1).max(120)).min(1).max(60),
	links: z.array(z.object({ from: z.string(), to: z.string() }).strict()).max(150),
	conflicts: z.array(z.union([z.string().min(1).max(4000), noteConflictSchema])).max(30),
 blocks: z.array(noteBlockSchema).min(1).max(150).optional(),
}).strict();
export type NoteContent = z.infer<typeof noteContentSchema>;
export type NotePage = NoteContent & { id: string; revision: number; updatedAt: string; origins: string[] };
export interface NoteSnippet { id: string; text: string; status: "pending" | "processing" | "completed" | "duplicate" | "failed"; message: string; createdAt: string }
export interface NoteHistory { id: number; pageId: string; before: NotePage | null; after: NotePage | null; snippetId: string | null; reason: string; createdAt: string }
export const noteProposalSchema = z.object({
	summary: z.string().min(1).max(4000),
	duplicate: z.boolean(),
	pages: z.array(noteContentSchema.extend({ id: z.string().nullable(), reason: z.string().min(1).max(4000) })).max(20),
}).strict();
export type NoteProposal = z.infer<typeof noteProposalSchema>;

export function validateNoteContent(content: NoteContent): void {
	noteContentSchema.parse(content);
	const ids = new Set<string>();
 for (const conflict of content.conflicts) {
  if (typeof conflict === "string") continue;
  if (ids.has(conflict.id)) throw new Error("Conflict IDs must be unique");
  ids.add(conflict.id);
  const options = new Set(conflict.options.map(option => option.id));
  if (options.size !== conflict.options.length || (conflict.recommendedOptionId !== null && !options.has(conflict.recommendedOptionId))) throw new Error("Invalid conflict options or recommendation");
 }
 const concepts = new Set(content.concepts);
	if (concepts.size !== content.concepts.length) throw new Error("Concept names must be unique within a page");
	for (const link of content.links) if (!concepts.has(link.from) || !concepts.has(link.to) || link.from === link.to) throw new Error("Note links must connect distinct concepts on their page");
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (!a.length || a.length !== b.length) return 0;
	let dot = 0, aa = 0, bb = 0;
	for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; aa += a[i]! ** 2; bb += b[i]! ** 2; }
	return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

/** Notes-specific identities: never expose learning graph IDs or stores. */
export function notesGraph(pages: NotePage[]) {
	const nodes = pages.flatMap((page) => page.concepts.map((label, index) => ({ id: `${page.id}:${index}`, label, pageId: page.id })));
	const edges: Array<{ from: string; to: string }> = [];
	for (const page of pages) for (const link of page.links) edges.push({ from: `${page.id}:${page.concepts.indexOf(link.from)}`, to: `${page.id}:${page.concepts.indexOf(link.to)}` });
	const byLabel = new Map<string, string>();
	for (const node of nodes) {
		const key = node.label.toLocaleLowerCase();
		const existing = byLabel.get(key);
		if (existing) edges.push({ from: existing, to: node.id });
		else byLabel.set(key, node.id);
	}
	return { nodes, edges, clusters: pages.map((page) => ({ id: page.id, label: page.title, members: nodes.filter((node) => node.pageId === page.id).map((node) => node.id) })) };
}

/** Stable identity for cosmetic differences; never equates different technical claims. */
export function noteIdentity(value: string): string {
 return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
export function normalizeNoteContent(content: NoteContent): NoteContent {
 const names = new Map<string, string>();
 for (const name of content.concepts) if (!names.has(noteIdentity(name))) names.set(noteIdentity(name), name.trim());
 const links = new Map<string, {from: string; to: string}>();
 for (const link of content.links) {
  const from = names.get(noteIdentity(link.from)); const to = names.get(noteIdentity(link.to));
  if (!from || !to) throw new Error("Note links must connect distinct concepts on their page");
  if (from !== to) links.set([from,to].sort().join("\0"), {from,to});
 }
 const result:NoteContent = {title:content.title.trim(), body:content.body, conflicts:content.conflicts, ...(content.blocks ? {blocks:content.blocks} : {}), concepts:[...names.values()], links:[...links.values()]};
 validateNoteContent(result); return result;
}
export const reconciliationSchema = z.object({
 merges: z.array(z.object({ pageIds: z.array(z.string()).min(2).max(12), content: noteContentSchema, reason: z.string().min(1).max(4000) }).strict()).max(12),
 aliases: z.array(z.object({ from:z.string().min(1), to:z.string().min(1) }).strict()).max(100),
 reviews: z.array(z.object({ pageIds:z.array(z.string()).min(2), reason:z.string().min(1).max(4000) }).strict()).max(30),
}).strict();
export type NoteReconciliation = z.infer<typeof reconciliationSchema>;

export function notesReconciliationDue(state: {checkedRevision:number; imports:number; lastRun:number; status:string}, revision:number, now=Date.now()):boolean {
 if (revision===state.checkedRevision) return false;
 if (state.status==="failed" && now-state.lastRun<60*60*1000) return false;
 return state.imports>=5 || now-state.lastRun>=24*60*60*1000;
}
