"use client";
import { useEffect, useState } from "react";
import type { LessonSession } from "@/src/core";
import { LessonPlan } from "./lesson-plan";

const phases: Record<LessonSession["phase"], string> = { "quick-check": "Quick check", outline: "Plan", explanation: "Explanation", grill: "Grill", "review-gaps": "Review gaps", complete: "Complete" };
interface PhaseEntry { revision: number; phase: LessonSession["phase"]; section: string }
export function LessonNavigation({ session, onOpen }: { session: LessonSession; onOpen: () => void }) {
	const [history, setHistory] = useState<PhaseEntry[]>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		let active = true;
		void fetch(`/api/lessons/${session.id}`).then(async (response) => { if (!response.ok) throw new Error("Phase history unavailable"); const data = await response.json(); if (active) { setHistory(data.phaseHistory ?? []); setError(""); } }).catch(() => { if (active) setError("Phase history unavailable"); });
		return () => { active = false; };
	}, [session.id, session.revision]);
	const section = session.sections[session.sectionIndex];
	return <aside aria-label="Lesson map and objectives" className="hidden h-dvh w-60 shrink-0 space-y-5 overflow-y-auto border-r p-3 text-sm xl:block">
		<section><h2 className="text-xs uppercase tracking-wider text-muted-foreground">Lesson map</h2>{session.sections.length ? <LessonPlan session={session} onOpen={onOpen} /> : <p className="mt-3 text-xs text-muted-foreground">Your map appears after the quick check. You can skip the check.</p>}</section>
		{section && <section><h2 className="mb-2 font-medium">{section.title}</h2><ul className="space-y-3">{section.objectives.map((objective) => {
			const evidence = session.evidence.findLast((item) => item.objectiveId === objective.id);
			const label = !evidence ? "Not assessed" : evidence.assisted ? "Retest needed" : evidence.verdict === "demonstrated" ? "Demonstrated" : "Needs review";
			return <li key={objective.id}><p>{objective.description}</p><span className={`text-xs ${label === "Demonstrated" ? "text-emerald-500" : "text-muted-foreground"}`}>{label}</span></li>;
		})}</ul></section>}
		<section className="border-t pt-3"><h2 className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Phase history</h2>{error && <p className="text-xs text-muted-foreground">{error}</p>}<ol className="space-y-3 border-l pl-3">{history.map((entry, index) => <li key={entry.revision} className={index === history.length - 1 ? "text-foreground" : "text-muted-foreground"}><span className="block text-xs">{phases[entry.phase]}{index === history.length - 1 ? " · now" : ""}</span><span className="text-xs">{entry.section}</span></li>)}</ol></section>
	</aside>;
}
