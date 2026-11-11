/** Explicit lesson state. Assessment progress is independent of transcript rendering. */
import type { PlanTree, DerivedPlanStatuses } from "./contracts/plan.ts";
import { createTree } from "./plan-tree.ts";
export type LessonPhase = "quick-check" | "outline" | "explanation" | "grill" | "review-gaps" | "complete";
export type LearningObjective = { id: string; description: string };
export type LessonSection = { id: string; title: string; objectives: LearningObjective[] };
export type AssessmentEvidence = {
	id: string; objectiveId: string; taskId: string; verdict: "demonstrated" | "gap";
	reason: string; assisted: boolean;
};
export interface LessonSession {
	id: string;
	mode: "guided" | "strict";
	entryPoint?: "lesson" | "grill";
	phase: LessonPhase;
	diagnosticCount: number;
	sections: LessonSection[];
	/** Older lessons have no authored dependency map; do not invent edges for them. */
	edges?: Array<{ from: string; to: string }>;
	sectionIndex: number;
	evidence: AssessmentEvidence[];
	revision: number;
}
export type LessonAction =
	| { type: "ask-diagnostic" }
	| { type: "finish-diagnostic" }
	| { type: "set-outline"; sections: LessonSection[]; edges?: Array<{ from: string; to: string }> }
	| { type: "start-explanation" }
	| { type: "start-grill" }
	| { type: "assess"; evidence: AssessmentEvidence }
	| { type: "finish-grill" }
	| { type: "continue-with-gaps" };

export function createLessonSession(id: string, mode: LessonSession["mode"], entryPoint: "lesson" | "grill" = "lesson"): LessonSession {
	return { id, mode, entryPoint, phase: entryPoint === "grill" ? "outline" : "quick-check", diagnosticCount: 0, sections: [], sectionIndex: 0, evidence: [], revision: 0 };
}

export function weakObjectives(session: LessonSession): LearningObjective[] {
	return (session.sections[session.sectionIndex]?.objectives ?? []).filter((objective) => {
		const latest = session.evidence.findLast((entry) => entry.objectiveId === objective.id);
		return !latest || latest.verdict !== "demonstrated" || latest.assisted;
	});
}

export function transitionLesson(current: LessonSession, action: LessonAction): LessonSession {
	const next = structuredClone(current);
	const requirePhase = (...phases: LessonPhase[]) => {
		if (!phases.includes(next.phase)) throw new Error(`Action ${action.type} is unavailable during ${next.phase}`);
	};
	const advance = () => {
		if (next.sectionIndex + 1 === next.sections.length) next.phase = "complete";
		else { next.sectionIndex++; next.phase = next.entryPoint === "grill" ? "grill" : "explanation"; }
	};
	switch (action.type) {
		case "ask-diagnostic":
			requirePhase("quick-check");
			if (next.diagnosticCount >= 3) throw new Error("The opening check is limited to three questions");
			next.diagnosticCount++;
			break;
		case "finish-diagnostic": requirePhase("quick-check"); next.phase = "outline"; break;
		case "set-outline": {
			requirePhase("outline");
			const ids = new Set<string>();
			if (!action.sections.length) throw new Error("A lesson needs at least one section");
			for (const section of action.sections) {
				if (!section.id.trim() || ids.has(section.id) || !section.title.trim() || !section.objectives.length) throw new Error("Invalid lesson section");
				ids.add(section.id);
				for (const objective of section.objectives) {
					if (!objective.id.trim() || ids.has(objective.id) || !objective.description.trim()) throw new Error("Invalid learning objective");
					ids.add(objective.id);
				}
			}
			next.sections = structuredClone(action.sections);
			const edges = action.edges ?? [];
			createTree(action.sections.map(({ id, title }) => ({ id, title })), edges);
			const order = new Map(action.sections.map((section, index) => [section.id, index]));
			if (edges.some((edge) => order.get(edge.from)! >= order.get(edge.to)!)) throw new Error("Order sections so prerequisites come before dependent sections");
			next.edges = structuredClone(edges);
			break;
		}
		case "start-explanation":
			requirePhase("outline");
			if (!next.sections.length) throw new Error("Review a lesson outline first");
			next.phase = "explanation";
			break;
		case "start-grill":
			if (next.entryPoint === "grill" && next.phase === "outline") {
				if (!next.sections.length) throw new Error("Prepare the grill objectives first");
			} else requirePhase("explanation", "review-gaps");
			next.phase = "grill";
			break;
		case "assess": {
			requirePhase("grill");
			const entry = action.evidence;
			if (!next.sections[next.sectionIndex]?.objectives.some((o) => o.id === entry.objectiveId)) throw new Error("Objective does not belong to this section");
			if (!entry.id.trim() || !entry.taskId.trim() || !entry.reason.trim()) throw new Error("Assessment requires evidence and a reason");
			if (next.evidence.some((e) => e.id === entry.id)) throw new Error("Assessment already recorded");
			if (entry.verdict === "demonstrated" && !entry.assisted && next.evidence.some((e) => e.taskId === entry.taskId && e.assisted)) throw new Error("Use a fresh task after assistance");
			next.evidence.push(structuredClone(entry));
			break;
		}
		case "finish-grill":
			requirePhase("grill");
			if (next.sections[next.sectionIndex]?.objectives.some((objective) => !next.evidence.some((entry) => entry.objectiveId === objective.id))) {
				throw new Error("Assess every section objective before finishing the grill");
			}
			if (weakObjectives(next).length) next.phase = "review-gaps";
			else advance();
			break;
		case "continue-with-gaps":
			requirePhase("review-gaps");
			if (next.mode !== "guided") throw new Error("Strict mastery requires demonstrated objectives before advancing");
			advance();
			break;
		default: throw new Error("Unknown lesson action");
	}
	next.revision++;
	return next;
}

export function lessonPlan(session: LessonSession): PlanTree {
	return { nodes: session.sections.map((section) => ({ id: section.id, title: section.title, summary: section.objectives.map((o) => o.description).join("\n") })), edges: session.edges ?? [], version: session.revision };
}

export function lessonPlanStatuses(session: LessonSession): DerivedPlanStatuses {
	const completed = session.phase === "complete";
	return {
		current: completed || session.phase === "outline" || session.phase === "quick-check" ? null : session.sections[session.sectionIndex]?.id ?? null,
		visited: new Set(session.sections.slice(0, completed ? session.sections.length : session.sectionIndex).map((section) => section.id)),
	};
}
