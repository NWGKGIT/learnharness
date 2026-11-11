"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftShell } from "./new-session";
import { SetupDialog } from "./setup-dialog";
import { useModelSetup, ZeroKeysPill, selectedModelUnavailable, openModelPicker } from "./setup-cta";
import { stashOpeningPrompt } from "./opening-prompt";

export function LearningHome({ initialTopic = "", entryPoint = "lesson", initialConfigured = false }: { initialTopic?: string; entryPoint?: "lesson" | "grill"; initialConfigured?: boolean }) {
	const router = useRouter();
	const [topic, setTopic] = useState(initialTopic);
	const topicRef = useRef(initialTopic);
	const [mode, setMode] = useState("");
	const [busy, setBusy] = useState(false);
	const starting = useRef(false);
	const created = useRef<{ identity: string; id: string } | null>(null);
	const [error, setError] = useState("");
	const [setupOpen, setSetupOpen] = useState(false);
	const { catalog, configured, zeroKeys } = useModelSetup(initialConfigured);
	async function start() {
		const text = topicRef.current.trim();
		if (!text || !mode || starting.current) return;
		if (!configured || zeroKeys) { setSetupOpen(true); return; }
		const strong = catalog?.slots.strong?.model;
		if (selectedModelUnavailable(catalog, strong ? `${strong.provider}:${strong.id}` : undefined)) { openModelPicker(); return; }
		starting.current = true; setBusy(true); setError("");
		try {
			const identity = JSON.stringify([text, mode, entryPoint, catalog?.slots.strong]);
			if (created.current?.identity !== identity) {
				const response = await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: text, mode, entryPoint }) });
				const data = await response.json();
				if (!response.ok) throw new Error(data.error);
				created.current = { identity, id: data.session.id };
			}
			const prompt = entryPoint === "grill" ? `Grill me on ${text}. Prepare a graphical topic outline and assessable objectives, then wait for me to start. Skip the diagnostic and initial explanation.` : `I want to learn ${text}. Begin with a brief diagnostic, then a comprehensive lesson.`;
			if (!stashOpeningPrompt(created.current.id, prompt)) throw new Error("Could not save the opening prompt. Your draft is preserved; please retry.");
			router.push(`/chat/${created.current.id}`);
		} catch (e) { setError(e instanceof Error ? e.message : "Could not start session"); starting.current = false; setBusy(false); }
	}
	return <>
		<DraftShell busy={busy} text={topic} onChange={(value) => { topicRef.current = value; setTopic(value); }} onSend={() => void start()}
			title={entryPoint === "grill" ? "New grill session" : "New lesson"}
			description={entryPoint === "grill" ? "Test your understanding, then work through the gaps with targeted explanations." : "A brief opening check, complete explanations, and a grill when you’re ready."}
			placeholder={entryPoint === "grill" ? "What do you want to be grilled on?" : "What do you want to learn?"}
			sendEnabled={!!mode}
			beforeComposer={<>
				<label className="flex items-center gap-2 text-xs text-muted-foreground">Advancement
					<select aria-label="Advancement" disabled={busy} value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground">
						<option value="">Choose for this session</option><option value="guided">Guided — allow continuing with gaps</option><option value="strict">Strict mastery — demonstrate every objective</option>
					</select>
				</label>
				{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
			</>}
			setupCta={zeroKeys ? <ZeroKeysPill inline onOpen={() => setSetupOpen(true)} /> : !configured ? <button type="button" onClick={() => setSetupOpen(true)} className="rounded border px-3 py-1.5 text-xs">Set up your models</button> : undefined}
		/>
		<SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} onDone={() => setSetupOpen(false)} />
	</>;
}
