"use client";

import { useState } from "react";
import type { NoteConflict } from "@/src/core";
import { Button } from "./ui/button";

export function NoteConflictChoice({conflict,busy,onAccept}:{conflict:NoteConflict;busy:boolean;onAccept:(optionId:string)=>Promise<boolean>}){
 const [selected,setSelected]=useState<string | null>(conflict.recommendedOptionId);
 return <fieldset disabled={busy} className="space-y-3 rounded-lg border border-warning/40 p-4"><legend className="px-1 text-sm font-medium">Resolve conflicting claims</legend><p className="text-sm">{conflict.summary}</p><div className="grid gap-2 sm:grid-cols-2">{conflict.options.map(option=><label key={option.id} className={`cursor-pointer rounded-lg border p-3 text-sm ${selected===option.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent"}`}><span className="mb-2 flex items-center gap-2"><input type="radio" name={`conflict-${conflict.id}`} checked={selected===option.id} onChange={()=>setSelected(option.id)} />{conflict.recommendedOptionId===option.id && <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Recommended</span>}</span><span>{option.claim}</span></label>)}</div>{conflict.recommendation && <p className="text-xs leading-relaxed text-muted-foreground">{conflict.recommendation}</p>}{!conflict.recommendedOptionId && <p className="text-xs text-muted-foreground">No recommendation: choose the claim you want to keep.</p>}<Button size="sm" disabled={!selected || busy} onClick={()=>{if(selected)void onAccept(selected);}}>{busy ? "Updating note…" : "Accept selected"}</Button></fieldset>;
}
