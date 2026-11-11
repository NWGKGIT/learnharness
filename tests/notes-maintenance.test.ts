import { test } from "node:test";
import assert from "node:assert/strict";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { prepareNote, resolveNoteConflict, reconcileNotes } from "../src/agent/notes-maintenance.ts";
import type { NoteContent, NotePage } from "../src/core/notes.ts";

const conflict={id:"increment",summary:"Is volatile increment atomic?",options:[{id:"yes",claim:"Volatile makes count++ atomic."},{id:"no",claim:"Volatile does not make count++ atomic."}],recommendedOptionId:"no",recommendation:"The increment is a read-modify-write operation."};
const content:NoteContent={title:"Volatile increments",body:"Volatile provides visibility. The increment is not atomic.",concepts:["visibility","atomicity"],links:[],conflicts:[conflict],blocks:[{type:"prose",text:"Volatile provides visibility. The increment is not atomic."},{type:"question",question:"Is count++ atomic on a volatile int?",answer:"No."}]};
const page:NotePage={...content,id:"note",revision:1,origins:["original"],updatedAt:""};
function engine(tool:string,value:unknown){
 const faux=createFauxCore({});
 faux.setResponses([fauxAssistantMessage([fauxToolCall(tool,value as Parameters<typeof fauxToolCall>[1],{id:"submit"})],{stopReason:"toolUse"})]);
 return {model:faux.getModel(),streamFn:faux.streamSimple};
}
test("legacy conflict preparation and explicit choices pass through the model tool schema",async()=>{
 const prepared=await prepareNote({...page,conflicts:["Conflicting claims about volatile increments"]},engine("update_note",content));
 assert.deepEqual(prepared.conflicts,[conflict]);assert.ok(prepared.blocks?.length);
 const resolved={...content,conflicts:[]};
 const result=await resolveNoteConflict(page,"increment","no",engine("update_note",resolved));
 assert.deepEqual(result.conflicts,[]);
 await assert.rejects(()=>resolveNoteConflict(page,"increment","missing",engine("update_note",resolved)),/Unknown conflict/);
});
test("preparing and resolving notes cannot discard unrelated unresolved claims",async()=>{
 await assert.rejects(()=>prepareNote(page,engine("update_note",{...content,conflicts:[]})),/cannot change existing conflict/);
 const other={...conflict,id:"other"};
 await assert.rejects(()=>resolveNoteConflict({...page,conflicts:[conflict,other]},"increment","no",engine("update_note",{...content,conflicts:[]})),/unrelated conflict/);
});
test("an uncertain reconciliation returns review candidates without merging them",async()=>{
 const proposal={merges:[],aliases:[],reviews:[{pageIds:["note","second"],reason:"Same title but different contexts."}]};
 const result=await reconcileNotes([page,{...page,id:"second"}],engine("reconcile_notes",proposal));
 assert.equal(result.merges.length,0);assert.equal(result.reviews.length,1);
});
