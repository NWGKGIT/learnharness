import { cosineSimilarity, type NotePage } from "../core/notes.ts";
import { createHash } from "node:crypto";
import type { NotesStore } from "../store/notes.ts";

export const NOTES_EMBEDDING_MODEL = "qwen3-embedding:0.6b";
async function embed(text: string): Promise<number[]> {
	// Embed every chunk; never silently truncate a long note.
	const chunks = text.match(/[\s\S]{1,6000}/g) ?? [text];
	const response = await fetch("http://127.0.0.1:11434/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: NOTES_EMBEDDING_MODEL, input: chunks, truncate: false }), signal: AbortSignal.timeout(90_000) });
	if (!response.ok) throw new Error("Local embeddings are unavailable. Start Ollama and pull qwen3-embedding:0.6b.");
	const data = await response.json() as { embeddings?: number[][] };
	const vectors = data.embeddings;
	if (!vectors?.length || vectors.length !== chunks.length || !vectors[0]?.length || vectors.some((v) => v.length !== vectors[0]!.length || v.some((n) => !Number.isFinite(n)))) throw new Error("Invalid local embedding response");
	return vectors[0].map((_, i) => vectors.reduce((sum, vector) => sum + vector[i]!, 0) / vectors.length);
}

export async function noteCandidates(store: NotesStore, snippet: string): Promise<{ pages: NotePage[]; notice: string }> {
	const pages = store.pages();
	if (!pages.length) return { pages: [], notice: "" };
	try {
		const query = await embed(snippet);
		const ranked = [];
		for (const page of pages) {
			const text = `${page.title}\n${page.concepts.join(" ")}\n${page.body}`;
			const fingerprint = createHash("sha256").update(text).digest("hex");
			let vector = store.embedding(page.id, fingerprint, NOTES_EMBEDDING_MODEL);
			if (!vector) { vector = await embed(text); store.saveEmbedding(page.id, fingerprint, NOTES_EMBEDDING_MODEL, vector); }
			ranked.push({ page, score: cosineSimilarity(query, vector) });
		}
		return { pages: ranked.sort((a, b) => b.score - a.score).slice(0, 12).map((item) => item.page), notice: "" };
	} catch {
		const words = new Set(snippet.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
		const score = (page: NotePage) => [...words].reduce((sum, word) => sum + (`${page.title} ${page.body} ${page.concepts.join(" ")}`.toLocaleLowerCase().includes(word) ? 1 : 0), 0);
		return { pages: pages.sort((a, b) => score(b) - score(a)).slice(0, 12), notice: "Local embeddings unavailable; used text matching to find related notes." };
	}
}
