"use client";
import { useId } from "react";
import { derivedNodeStatus, lessonPlan, lessonPlanStatuses, type LessonSession } from "@/src/core";
import { PlanDiagram, GRAPH_PAD, TEXT_CAP_SCALE } from "./plan-block";

export function LessonPlan({ session, onOpen }: { session: LessonSession; onOpen: () => void }) {
	const markerId = useId().replace(/[^a-zA-Z0-9-]/g, "");
	const tree = lessonPlan(session);
	const statuses = lessonPlanStatuses(session);
	if (!tree.nodes.length) return null;
	return <button type="button" onClick={onOpen} aria-label="Open graphical lesson plan" className="block w-full cursor-zoom-in py-4 text-left">
		<PlanDiagram nodes={tree.nodes} edges={tree.edges} statusOf={(id) => derivedNodeStatus(statuses, id)} glowId={statuses.current} markerId={markerId} pad={GRAPH_PAD + 16} textCapScale={TEXT_CAP_SCALE} />
	</button>;
}
