"use client";

import { useState } from "react";
import type { NoteBlock } from "@/src/core";
import { Button } from "./ui/button";
import { MessageResponse } from "./ai-elements/message";

export function NoteBlocks({blocks, body}:{blocks?:NoteBlock[];body:string}) {
 if(!blocks?.length) return <MessageResponse>{body}</MessageResponse>;
 return <div className="space-y-5">{blocks.map((block,index)=>{
  switch(block.type){
   case "heading": return block.level==="2" ? <h3 key={index} className="pt-3 text-xl font-semibold">{block.text}</h3> : <h4 key={index} className="pt-2 font-semibold">{block.text}</h4>;
   case "prose":return <MessageResponse key={index}>{block.text}</MessageResponse>;
   case "code":return <NoteCode key={index} code={block.code} language={block.language} />;
   case "callout":return <aside key={index} className="rounded-lg border-l-4 border-primary bg-muted/40 p-4"><p className="mb-2 text-sm font-medium">{block.title}</p><MessageResponse>{block.text}</MessageResponse></aside>;
   case "disclosure":return <details key={index} className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">{block.title}</summary><div className="pt-4"><MessageResponse>{block.text}</MessageResponse></div></details>;
   case "question":return <section key={index} className="rounded-lg border bg-muted/20 p-4"><p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Check your understanding</p><MessageResponse>{block.question}</MessageResponse><details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Reveal answer</summary><div className="pt-3"><MessageResponse>{block.answer}</MessageResponse></div></details></section>;
  }
 })}</div>;
}
function NoteCode({code,language}:{code:string;language:string}){
 const [status,setStatus]=useState("");
 return <section className="overflow-hidden rounded-lg border"><div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2"><span className="text-xs text-muted-foreground">{language || "Code"}</span><Button size="xs" variant="ghost" onClick={async()=>{try{await navigator.clipboard.writeText(code);setStatus("Copied");}catch{setStatus("Could not copy");}}}>{status || "Copy code"}</Button></div><pre className="overflow-auto p-4 text-[13px] leading-relaxed"><code>{code}</code></pre><span className="sr-only" role="status">{status}</span></section>;
}
