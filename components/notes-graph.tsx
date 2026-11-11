"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRightIcon, BookOpenIcon, GitMergeIcon, MaximizeIcon, MinimizeIcon, PlusIcon, MinusIcon, ScanIcon } from "lucide-react";
import { noteIdentity, type notesGraph } from "@/src/core";
import { Button } from "./ui/button";

type Graph = ReturnType<typeof notesGraph>;

/** A bipartite map: note cards connect to the concepts they share.
 * Private concepts live on the cards, so a large note never becomes a cloud of dots. */
export function NotesGraph({ graph, onSelect }: { graph: Graph; onSelect: (id: string) => void }) {
	const container = useRef<HTMLElement>(null);
 const viewport = useRef<HTMLDivElement>(null);
 const [fullscreen, setFullscreen] = useState(false);
 const [viewError, setViewError] = useState("");
 const [camera, setCamera] = useState({x: 20, y: 20, scale: 0.8});
 const pointers = useRef(new Map<number, {x:number; y:number}>());
 const [hoveredConcept, setHoveredConcept] = useState<string | null>(null);
 const [focusedConcept, setFocusedConcept] = useState<string | null>(null);
	const [hoveredPage, setHoveredPage] = useState<string | null>(null);
	const { notes, shared } = useMemo(() => {
		const concepts = new Map<string, { key: string; label: string; pages: Set<string> }>();
		const byPage = new Map<string, string[]>();
		for (const node of graph.nodes) {
			const key = noteIdentity(node.label);
			const concept = concepts.get(key) ?? { key, label: node.label, pages: new Set<string>() };
			concept.pages.add(node.pageId);
			concepts.set(key, concept);
			const labels = byPage.get(node.pageId) ?? [];
			if (!labels.some(label => noteIdentity(label) === key)) labels.push(node.label);
			byPage.set(node.pageId, labels);
		}
		return {
			notes: graph.clusters.map((cluster) => ({ ...cluster, concepts: byPage.get(cluster.id) ?? [] })),
			shared: [...concepts.values()].filter((concept) => concept.pages.size > 1).sort((a, b) => b.pages.size - a.pages.size || a.label.localeCompare(b.label)),
		};
	}, [graph]);
	const activeConcept = shared.find((concept) => concept.key === (hoveredConcept ?? focusedConcept));
 const zoomSpeed = 0.0015 / Math.max(1, Math.sqrt(graph.nodes.length / 20));
 const zoomAt = (factor: number, x: number, y: number) => setCamera(current => {
  const scale = Math.min(2.5, Math.max(0.05, current.scale * factor));
  const ratio = scale/current.scale;
  return {scale, x:x-(x-current.x)*ratio, y:y-(y-current.y)*ratio};
 });
 const zoomCenter = (direction:number) => { const rect=viewport.current?.getBoundingClientRect(); if(rect) zoomAt(Math.exp(direction*120*zoomSpeed),rect.width/2,rect.height/2); };
 useEffect(() => {
  const stage = viewport.current; if (!stage) return;
  const wheel = (event: WheelEvent) => {
   event.preventDefault(); const rect=stage.getBoundingClientRect();
   const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
   zoomAt(Math.exp(-Math.max(-240,Math.min(240,delta))*zoomSpeed),event.clientX-rect.left,event.clientY-rect.top);
  };
  stage.addEventListener("wheel",wheel,{passive:false});
  return () => stage.removeEventListener("wheel",wheel);
 }, [zoomSpeed, graph.clusters.length]);
 useEffect(() => {
  const changed = () => setFullscreen(document.fullscreenElement === container.current);
  document.addEventListener("fullscreenchange",changed);
  return () => document.removeEventListener("fullscreenchange",changed);
 }, []);
 const toggleFullscreen = async () => {
  try { setViewError(""); if(document.fullscreenElement === container.current) await document.exitFullscreen(); else await container.current?.requestFullscreen(); }
  catch { setViewError("Fullscreen is unavailable in this browser."); }
 };
 const selectPage = (id:string) => {
  if(document.fullscreenElement === container.current) void document.exitFullscreen();
  onSelect(id);
 };
	const height = Math.max(notes.length * 168, shared.length * 76, 320);
	const noteY = (index: number) => 24 + index * 168;
	const conceptY = (index: number) => index * 76 + 24;

	if (!notes.length) return <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center"><GitMergeIcon className="mb-4 size-8 text-muted-foreground/50" aria-hidden="true" /><h2 className="font-medium">Ideas connect here</h2><p className="mt-2 max-w-xs text-sm text-muted-foreground">Add notes to start your map. Shared concepts will connect related pages.</p></div>;

	return <section ref={container} aria-label="Notes topic map" className="flex h-full min-h-96 flex-col overflow-hidden rounded-xl border bg-background">
		<div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
			<div><h2 className="text-sm font-medium">Follow an idea</h2><p className="mt-1 text-xs text-muted-foreground">Hover to trace connections. Click to pin. Drag to pan; scroll or pinch to zoom.</p></div>
			<div className="flex flex-wrap items-center gap-1" aria-label="Map controls">
   <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => zoomCenter(-1)}><MinusIcon className="size-4" /></Button>
   <span className="min-w-12 text-center text-xs tabular-nums" aria-label="Zoom level">{Math.round(camera.scale*100)}%</span>
   <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => zoomCenter(1)}><PlusIcon className="size-4" /></Button>
   <Button size="icon-sm" variant="ghost" aria-label="Fit map" onClick={() => { const stage=viewport.current; if(!stage) return; const scale=Math.max(0.05,Math.min(1,(stage.clientWidth-40)/1000,(stage.clientHeight-40)/(height+60))); setCamera({scale,x:(stage.clientWidth-1000*scale)/2,y:20}); }}><ScanIcon className="size-4" /></Button>
   <Button size="icon-sm" variant="ghost" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={() => void toggleFullscreen()}>{fullscreen ? <MinimizeIcon className="size-4" /> : <MaximizeIcon className="size-4" />}</Button>
   {focusedConcept && <Button size="sm" variant="outline" onClick={() => setFocusedConcept(null)}>Clear selection</Button>}
   </div>
		</div>
		{viewError && <p role="status" className="px-5 py-2 text-xs">{viewError}</p>}
  <div ref={viewport} className="relative min-h-80 flex-1 touch-none overflow-hidden bg-muted/10" tabIndex={0} aria-label="Zoomable topic map"
   onKeyDown={event => { if(event.target!==event.currentTarget) return; if(event.key === "+" || event.key === "=") {event.preventDefault();zoomCenter(1);} if(event.key === "-") {event.preventDefault();zoomCenter(-1);} const steps:Record<string,number[]>={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]}; const step=steps[event.key];if(step){event.preventDefault();setCamera(c=>({...c,x:c.x+step[0]!,y:c.y+step[1]!}));} }}
   onPointerDown={event => { if((event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY}); }}
   onPointerMove={event => {
    const previous=pointers.current.get(event.pointerId);if(!previous) return;
    const other=[...pointers.current.entries()].find(([id])=>id!==event.pointerId)?.[1];
    if(other){const before=Math.hypot(previous.x-other.x,previous.y-other.y);const after=Math.hypot(event.clientX-other.x,event.clientY-other.y);const rect=event.currentTarget.getBoundingClientRect();if(before>1)zoomAt(after/before,(event.clientX+other.x)/2-rect.left,(event.clientY+other.y)/2-rect.top);}
    else setCamera(c=>({...c,x:c.x+event.clientX-previous.x,y:c.y+event.clientY-previous.y}));
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
   }} onPointerUp={event=>pointers.current.delete(event.pointerId)} onPointerCancel={event=>pointers.current.delete(event.pointerId)} onLostPointerCapture={event=>pointers.current.delete(event.pointerId)}>
   <div className="absolute left-0 top-0 w-[1000px] px-6 pt-5" style={{transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,transformOrigin:"0 0"}}>
				<div className="flex justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"><span className="w-[42%]">Your notes · {notes.length}</span><span className="w-[32%]">Shared concepts · {shared.length}</span></div>
				<div className="relative mt-2" style={{ height }}>
					<svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none">
						{shared.flatMap((concept, index) => notes.flatMap((note, noteIndex) => {
							if (!concept.pages.has(note.id)) return [];
							const relevant = (!activeConcept || activeConcept.key === concept.key) && (!hoveredPage || hoveredPage === note.id);
							const highlighted = relevant && (!!activeConcept || !!hoveredPage);
							return <path key={`${note.id}:${concept.key}`} d={`M 420 ${noteY(noteIndex) + 66} C 550 ${noteY(noteIndex) + 66}, 550 ${conceptY(index) + 24}, 680 ${conceptY(index) + 24}`} fill="none" className={highlighted ? "stroke-primary" : "stroke-foreground/20"} strokeWidth={highlighted ? 2 : 1} vectorEffect="non-scaling-stroke" style={{ opacity: relevant ? 1 : 0.12, transition: "opacity 150ms" }} />;
						}))}
					</svg>
					{notes.map((note, index) => {
						const connected = !activeConcept || activeConcept.pages.has(note.id);
						return <button key={note.id} onClick={() => selectPage(note.id)} onMouseEnter={() => setHoveredPage(note.id)} onMouseLeave={() => setHoveredPage(null)} onFocus={() => setHoveredPage(note.id)} onBlur={() => setHoveredPage(null)} style={{ top: noteY(index), opacity: connected ? 1 : 0.35 }} className="absolute left-0 flex h-[132px] w-[42%] flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-[opacity,box-shadow,border-color] hover:border-primary/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
							<div className="mb-2 flex w-full items-start gap-2"><BookOpenIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="line-clamp-2 flex-1 text-sm font-medium leading-snug">{note.label}</span><ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /></div>
							<div className="mt-auto flex max-h-10 flex-wrap gap-1 overflow-hidden">{note.concepts.slice(0, 3).map((concept, i) => <span key={i} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{concept}</span>)}{note.concepts.length > 3 && <span className="text-[10px] text-muted-foreground">+{note.concepts.length - 3}</span>}</div>
						</button>;
					})}
					{shared.map((concept, index) => <button key={concept.key} aria-pressed={focusedConcept === concept.key} onMouseEnter={() => setHoveredConcept(concept.key)} onMouseLeave={() => setHoveredConcept(null)} onFocus={() => setHoveredConcept(concept.key)} onBlur={() => setHoveredConcept(null)} onClick={() => setFocusedConcept(focusedConcept === concept.key ? null : concept.key)} style={{ top: conceptY(index), opacity: (!activeConcept || activeConcept.key === concept.key) && (!hoveredPage || concept.pages.has(hoveredPage)) ? 1 : 0.35 }} className={`absolute right-0 flex min-h-12 w-[32%] items-center gap-3 rounded-full border px-4 py-2 text-left transition-opacity focus-visible:outline-2 focus-visible:outline-ring ${activeConcept?.key === concept.key ? "border-primary/50 bg-primary/10" : "border-border bg-muted/80 hover:border-primary/40"}`}><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary/60" /><span className="min-w-0 flex-1 truncate text-xs" title={concept.label}>{concept.label}</span><span className="shrink-0 text-[10px] text-muted-foreground">{concept.pages.size} notes</span></button>)}
					{!shared.length && <div className="absolute right-0 top-10 w-[32%] border-l border-dashed pl-5"><GitMergeIcon aria-hidden="true" className="mb-3 size-5 text-muted-foreground/50" /><p className="text-sm font-medium">Room for connections</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">As the same concept appears in different notes, a bridge will appear here.</p></div>}
				</div>
			</div>
		</div>
	</section>;
}
