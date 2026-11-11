import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.ts';
import { NotesStore } from '../src/store/notes.ts';
import { LearningWorkspaceStore } from '../src/store/learning-workspace.ts';
import { SourceLibraryStore } from '../src/store/source-library.ts';
import { createLessonSession } from '../src/core/learning-session.ts';
import { validateSourceRoadmap } from '../src/core/source-library.ts';
import { chatStore } from '../src/store/chats.ts';
import { graphStore } from '../src/store/graph.ts';

const rows = JSON.parse(fs.readFileSync(new URL('./seed/java-curriculum.json', import.meta.url)));
const manifestFile = path.join(PATHS.data, 'java-curriculum-seed.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile)) : { version: 1, topics: {}, noteIds: [], sourceIds: [] };
const persist = () => fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
const notes = new NotesStore(path.join(PATHS.data, 'notes.sqlite'));
const learning = new LearningWorkspaceStore(path.join(PATHS.data, 'learning-workspace.sqlite'));
const sources = new SourceLibraryStore(path.join(PATHS.data, 'source-library.sqlite'));
const now = new Date().toISOString();
const contents = rows.map(([title,a,b,statement,explanation,code,expected]) => ({title, concepts:[a,b], conflicts:[], links:[{from:a,to:b}], body:`> Authored example material for a Java-focused introductory CS library. This is not a record of your learning progress.\n\n## Core idea\n${statement}\n\n## Reasoning\n${explanation}\n\n## Java example\n\n\`\`\`java\npublic class Main {\n  public static void main(String[] args) {\n    ${code}\n  }\n}\n\`\`\`\n\nExpected output:\n\n\`\`\`text\n${expected}\n\`\`\`\n\n## Check your understanding\n1. Explain the result before running the example.\n2. Identify the relevant invariant or contract.\n3. Change one input and predict how the output changes.\n4. Describe a boundary case and how you would test it.`}));

if (!manifest.noteIds.length) {
 const prior = new Set(notes.pages().map(p=>p.id));
 const snippet = notes.addSnippet('Java CS curriculum — authored seed batch\n\n'+contents.map(c=>c.title+'\n'+c.body).join('\n\n'));
 notes.apply(snippet.id,{duplicate:false,summary:'Imported 28 authored Java curriculum examples in one batch.',pages:contents.map(c=>({...c,id:null,reason:'Authored curriculum seed'}))},notes.revision(),new Set());
 manifest.noteIds=notes.pages().filter(p=>!prior.has(p.id)).map(p=>p.id); persist();
}

const assistant = (id,text) => ({ id,role:'assistant',content:[{type:'text',text}],api:'openai-completions',provider:'authored-example',model:'curriculum-seed',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now() });
for (const [index,row] of rows.entries()) {
 if(manifest.topics[index]) continue;
 const [title,a,b,statement,explanation,code,expected]=row;
 const sectionId=`java-${index}-core`, objectiveId=`java-${index}-explain`;
 const section={id:sectionId,title,objectives:[{id:objectiveId,description:`Explain ${title.toLowerCase()} and predict the Java example's behavior.`}]};
 const record={};
 for (const entryPoint of ['lesson','grill']) {
  const chat=chatStore.createChat(`[Example ${entryPoint}] ${title}`);
  learning.create(createLessonSession(chat.id,index%2?'strict':'guided',entryPoint),`[Example] ${title}`);
  let state=learning.get(chat.id);
  if(entryPoint==='lesson') state=learning.apply(chat.id,state.revision,{type:'finish-diagnostic'});
  state=learning.apply(chat.id,state.revision,{type:'set-outline',sections:[section],edges:[]});
  state=learning.apply(chat.id,state.revision,{type:entryPoint==='lesson'?'start-explanation':'start-grill'});
  chatStore.saveMessages(chat.id,[{id:`seed-${index}-${entryPoint}-prompt`,role:'user',content:`[Authored example study prompt]\nHelp me study ${title}.`,timestamp:Date.now()},assistant(`seed-${index}-${entryPoint}-material`,entryPoint==='lesson'?contents[index].body:`## Example grill: ${title}\n\nPredict the output and justify your answer without running the code.\n\n\`\`\`java\n${code}\n\`\`\`\n\nThen explain how ${a} relates to ${b}. Name one boundary case.\n\nThis is an authored example; no assessment has been recorded.`)]);
  const reference=`public class Main { public static void main(String[] args) { ${code} } }`;
  learning.saveExercise({id:`seed-java-${index}-${entryPoint}`,lessonId:chat.id,sectionId,taskId:`seed-java-${index}-task`,objectiveIds:[objectiveId],language:'java',title:`Java trace: ${title}`,instructions:`Implement the operations below in Main.main and produce their result. Do not hard-code the expected output.\n\n${code}\n\nExplain why the result follows from the relevant contract. This small trace exercise uses no input.`,starter:'public class Main {\n  public static void main(String[] args) {\n    // TODO: implement the described operations\n  }\n}\n',reference,tests:[{id:'example',label:'Trace result',stdin:'',expected:expected+'\n',hidden:false}],revealed:false});
  record[entryPoint]=chat.id;
 }
 const practice=chatStore.createChat(`[Example practice] ${title}`,'practice');
 chatStore.saveMessages(practice.id,[{id:`seed-practice-${index}`,role:'user',content:`[Authored practice prompt]\n${title}: ${explanation}\n\nPredict and explain this code, then propose a boundary test:\n\n${code}`,timestamp:Date.now()}]);
 record.practice=practice.id;
 graphStore.appendNode({id:`seed-java-${index}`,name:title,statement,aliases:[title],createdAt:now,provenance:[{chatId:record.lesson,messageId:`seed-${index}-lesson-material`}]});
 // Each proposition is intentionally unassessed; no fabricated learner verdicts.
 manifest.topics[index]=record;persist();
}
// Add explicit worked-example derivations, without claiming learner understanding.
if (!manifest.workedExamples) {
 const existing = new Set(graphStore.readNodes().map(n=>n.id));
 const chains = new Set(graphStore.readChains().map(c=>c.id));
 for (const [index,row] of rows.entries()) {
  const [title,,, , ,code,expected] = row;
  const provenance = [{chatId:manifest.topics[index].lesson,messageId:`seed-${index}-lesson-material`}];
  const input = {id:`seed-java-code-${index}`,name:`${title}: worked program`,statement:`In a Java main method, execute: ${code}`,aliases:[],createdAt:now,provenance};
  const output = {id:`seed-java-output-${index}`,name:`${title}: expected result`,statement:`The worked program for ${title} prints ${JSON.stringify(expected)} followed by a newline.`,aliases:[],createdAt:now,provenance};
  for (const node of [input,output]) if(!existing.has(node.id)) graphStore.appendNode(node);
  const chain={id:`seed-java-derivation-${index}`,premises:[input.id,`seed-java-${index}`],conclusion:output.id,createdAt:now,provenance};
  if(!chains.has(chain.id)) graphStore.appendChain(chain);
 }
 manifest.workedExamples=true;persist();
}
if (!manifest.sourceIds.length) {
 const groups=[['Java object model',0,10],['Algorithms and collections',10,18],['Trees, sorting, graphs, and testing',18,28]];
 for(const [title,start,end] of groups){
  const goal=sources.create(`[Example curriculum] ${title}`);
  const sourceId=`seed-source-${start}`;
  const passages=contents.slice(start,end).map((c,i)=>({id:`seed-passage-${start+i}`,text:c.body,location:`Chapter ${start+i+1}: ${c.title}`}));
  const source={id:sourceId,name:`Authored Java study guide — ${title}`,kind:'text',passages,createdAt:now};
  const lessons=contents.slice(start,end).map((c,i)=>({id:`seed-roadmap-${start+i}`,title:c.title,summary:rows[start+i][3],objectives:[`Explain ${c.title.toLowerCase()}.`],passageIds:[`seed-passage-${start+i}`]}));
  const roadmap={lessons,edges:[]};validateSourceRoadmap(roadmap,[source]);
  const lessonIds=Object.fromEntries(lessons.map((l,i)=>[l.id,manifest.topics[start+i].lesson]));
  sources.save({...goal,sources:[source],roadmap,lessonIds,message:'Authored example curriculum imported in a batch.'},goal.revision);
  for(const [i,l] of lessons.entries()) sources.saveMaterial(lessonIds[l.id],{goalId:goal.id,goal:goal.title,lesson:l,passages:[{...passages[i],source:source.name}]});
  manifest.sourceIds.push(goal.id);persist();
 }
}
notes.close();learning.close();
console.log(JSON.stringify({notes:manifest.noteIds.length,topics:Object.keys(manifest.topics).length,lessons:Object.keys(manifest.topics).length,grills:Object.keys(manifest.topics).length,practiceChats:Object.keys(manifest.topics).length,exercises:Object.keys(manifest.topics).length*2,sourceGoals:manifest.sourceIds.length,graphPropositions:Object.keys(manifest.topics).length*3,graphDerivations:Object.keys(manifest.topics).length,dataDirectory:PATHS.data}));
