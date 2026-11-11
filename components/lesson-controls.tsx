"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { LessonSession, LessonAction } from "@/src/core";

const labels = { "quick-check": "Quick check", outline: "Lesson outline", explanation: "Explanation", grill: "Grill", "review-gaps": "Review gaps", complete: "Complete" };
export function LessonControls({ chatId, busy, onContinue, onSession }: { chatId: string; busy: boolean; onContinue: (text: string) => void; onSession: (session: LessonSession) => void }) {
	const [session, setSession] = useState<LessonSession | null>(null);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	useEffect(() => {
		let active = true;
		const refresh = async () => {
			try {
				const response = await fetch(`/api/lessons/${chatId}`);
				if (!response.ok) throw new Error("Could not load lesson progress");
				const data = await response.json();
				if (active) { setSession(data.session); onSession(data.session); }
			} catch (e) { if (active) setError(String(e)); }
		};
		void refresh();
		const timer = busy ? setInterval(() => void refresh(), 1500) : undefined;
		return () => { active = false; clearInterval(timer); };
	}, [chatId, busy, onSession]);
	async function act(action: LessonAction, text: string) {
		if (!session || saving || busy) return;
		setSaving(true); setError("");
		try {
			const response = await fetch(`/api/lessons/${chatId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: session.revision, action }) });
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setSession(data.session); onSession(data.session); onContinue(text);
		} catch (e) { setError(e instanceof Error ? e.message : "Could not update lesson"); }
		finally { setSaving(false); }
	}
	return <section aria-label="Lesson progress" className="border-b border-border px-4 py-3 text-sm">
		<div className="flex flex-wrap items-center gap-3"><Link href={session?.entryPoint === "grill" ? "/grill" : "/learn"} className="underline">{session?.entryPoint === "grill" ? "Grill" : "Learn"}</Link>
			<strong className="rounded-full bg-accent px-3 py-1 text-foreground" aria-live="polite">{session ? labels[session.phase] : "Loading lesson…"}</strong>
			{session && <span>{session.mode === "strict" ? "Strict mastery" : "Guided"} · {session.sections.length ? `Section ${session.sectionIndex + 1} of ${session.sections.length}` : "Preparing lesson"}</span>}
			{session?.phase === "quick-check" && <button disabled={busy || saving} onClick={() => void act({ type: "finish-diagnostic" }, "Skip the remaining opening check and prepare my lesson outline.")} className="rounded border px-3 py-1 disabled:opacity-40">Skip quick check</button>}
			{session?.phase === "outline" && !!session.sections.length && <button disabled={busy || saving} onClick={() => void act({ type: "start-explanation" }, "Explain the first section comprehensively.")} className="rounded border px-3 py-1 disabled:opacity-40">Start explanation</button>}
			{session && (["explanation", "review-gaps"].includes(session.phase) || (session.entryPoint === "grill" && session.phase === "outline" && session.sections.length > 0)) && <button disabled={busy || saving} onClick={() => void act({ type: "start-grill" }, "I am ready. Start the grill for this section, focusing on any remaining gaps.")} className="rounded border px-3 py-1 disabled:opacity-40">Start Grill</button>}
			{session?.phase === "review-gaps" && session.mode === "guided" && <button disabled={busy || saving} onClick={() => void act({ type: "continue-with-gaps" }, session.entryPoint === "grill" ? "Continue with these gaps recorded; grill the next section if there is one." : "Continue with these gaps recorded; explain the next section if there is one.")} className="rounded border px-3 py-1 disabled:opacity-40">Continue with gaps</button>}
		</div>
		{session && <p className="mt-2 text-xs text-muted-foreground">{{ "quick-check": "Brief opening check — optional, at most three questions.", outline: "Review the graphical plan, then start when ready.", explanation: "Learning mode — explanations and worked examples. Ask follow-ups freely.", grill: "Assessment mode — solve tasks; explanations of gaps follow the assessment.", "review-gaps": "Learning mode — revisit the gaps before a fresh retest.", complete: "Lesson finished — review your map and evidence." }[session.phase]}</p>}
		{error && <p role="alert" className="mt-2 text-error">{error}</p>}
	</section>;
}
