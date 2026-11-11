import { randomUUID } from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { LearningSource, SourcePassage } from "../core/source-library.ts";

const LIMIT = 20 * 1024 * 1024;
export async function ingestSource(input: { text?: string; name?: string; url?: string; file?: File }): Promise<{ source: LearningSource; raw: Uint8Array }> {
	const id = randomUUID();
	let raw: Uint8Array; let name = input.name?.trim() || "Pasted material"; let kind: LearningSource["kind"] = "text";
	let chunks: Array<{ text: string; location: string }> = [];
	if (input.file) {
		if (input.file.size > LIMIT) throw new Error("Files must be 20 MB or smaller.");
		raw = new Uint8Array(await input.file.arrayBuffer()); name = input.file.name; kind = "file";
		if (/\.pdf$/i.test(name) || input.file.type === "application/pdf") {
			const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
			const task = pdfjs.getDocument({ data: raw.slice(), useSystemFonts: true });
			const document = await task.promise;
			try { for (let n = 1; n <= document.numPages; n++) {
				const page = await document.getPage(n); const content = await page.getTextContent();
				chunks.push({ location: `Page ${n}`, text: content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") });
			} } finally { await task.destroy(); }
		} else {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
			if (text.includes("\0")) throw new Error("Use text/code files, Markdown, or a text-based PDF.");
			chunks = [{ location: name, text }];
		}
	} else if (input.url) {
		const url = new URL(input.url); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS webpage URL without credentials.");
		const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { Accept: "text/html,text/plain" } });
		if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
		const reader = response.body?.getReader(); if (!reader) throw new Error("Source returned no content");
		const parts: Uint8Array[] = []; let size = 0;
		try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > LIMIT) throw new Error("Webpage exceeds 20 MB"); parts.push(part.value); } } finally { await reader.cancel(); }
		raw = new Uint8Array(size); let offset = 0; for (const part of parts) { raw.set(part, offset); offset += part.length; }
		const html = new TextDecoder().decode(raw); kind = "url"; name = input.name?.trim() || url.hostname;
		if (response.headers.get("content-type")?.includes("text/plain")) chunks = [{ text: html, location: input.url }];
		else {
			const { document } = parseHTML(html); const article = new Readability(document as unknown as Document).parse();
			if (!article?.content) throw new Error("No readable article found. Paste the text instead.");
			name = input.name?.trim() || article.title || name;
			chunks = [{ text: new TurndownService({ codeBlockStyle: "fenced" }).turndown(article.content), location: input.url }];
		}
	} else { raw = new TextEncoder().encode(input.text ?? ""); chunks = [{ text: input.text ?? "", location: "Pasted text" }]; }
	const passages: SourcePassage[] = [];
	for (const chunk of chunks) for (let offset = 0; offset < chunk.text.length; offset += 2400) {
		const text = chunk.text.slice(offset, offset + 2400); if (text.trim()) passages.push({ id: `${id}:${passages.length + 1}`, text, location: `${chunk.location} · characters ${offset + 1}–${Math.min(offset + 2400, chunk.text.length)}` });
	}
	if (!passages.length) throw new Error("No text was extracted. Scanned PDFs need OCR before importing.");
	return { source: { id, name, kind, url: input.url, passages, createdAt: new Date().toISOString() }, raw };
}
