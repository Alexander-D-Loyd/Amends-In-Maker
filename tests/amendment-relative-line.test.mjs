import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {parseAmendments,amendmentPlan,verifyAmendments} from '../app/amendments.mjs';
import {planAmendments} from '../app/amendment-planner.mjs';

const make=text=>makeDocument(Array.isArray(text)?text:[text],'fixture.pdf');
const instruction=directive=>'Amendment 7\n'+directive+'\nInserted wording.';
const plan=(previous,directive)=>planAmendments({previous,instructions:make(instruction(directive))});

test('below the final printed line inserts at that row end without requiring a following numbered line',()=>{
 const previous=make('Unnumbered bill heading.\nline 1 Retain the first line.\nline 2 Final legislative text.'),result=plan(previous,'On page 1, below line 2, insert:');assert.equal(result.ready,true,JSON.stringify(result.issues));const row=result.amendments[0],target=previous.blocks.at(-1);assert.equal(row.insertion.offset,target.end);assert.equal(row.insertion.finalInsertion,true);assert.deepEqual(row.lineInsertion,{page:1,line:2,position:'below'});assert.deepEqual(row.insertion.lineInsertion,row.lineInsertion);assert.equal(row.insertion.page,1);assert.equal(row.insertion.kind,'line-below');assert.equal(row.between,null);
 const compiled=amendmentPlan(instruction('On page 1, below line 2, insert:'),previous,previous).compiled[0];assert.deepEqual(compiled.patches[0].lineInsertion,row.lineInsertion);assert.equal(compiled.patches[0].start,previous.effectiveTokens.length);
 const current=make(previous.rawPages[0]+'\nInserted wording.');assert.equal(verifyAmendments(instruction('On page 1, below line 2, insert:'),previous,current)[0].status,'implemented');
});

test('above the first printed line anchors after its margin label and after the unnumbered heading',()=>{
 const previous=make('Bill title and heading.\nline 1 First legislative text.\nline 2 Retained text.'),result=plan(previous,'On page 1, above line 1, insert:');assert.equal(result.ready,true,JSON.stringify(result.issues));const row=result.amendments[0],target=previous.blocks.find(b=>b.margin==='line 1 ');assert.equal(row.insertion.offset,target.start+target.margin.length);assert.equal(row.insertion.offset,previous.text.indexOf('First legislative'));assert.deepEqual(row.lineInsertion,{page:1,line:1,position:'above'});assert.equal(row.insertion.kind,'line-above');assert.equal(row.insertion.finalInsertion,false);
});

test('internal above/below and before/after synonyms retain their distinct physical row edges',()=>{
 const previous=make(['line 1 First page body.','Page two heading.\nline 1 First row.\nline 2 Middle row.\nline 3 Last row.']);
 for(const [word,position]of [['above','above'],['before','above'],['below','below'],['after','below']]){const result=plan(previous,`On page 2, ${word} line 2, insert:`);assert.equal(result.ready,true,word+JSON.stringify(result.issues));const row=result.amendments[0],target=previous.blocks.find(b=>b.page===2&&b.margin==='line 2 ');assert.deepEqual(row.lineInsertion,{page:2,line:2,position});assert.equal(row.insertion.offset,position==='above'?target.start+target.margin.length:target.end);assert.equal(row.insertion.finalInsertion,false);}
});

test('blank numbered rows remain usable physical insertion targets',()=>{
 const previous=make('line 1 Retained first row.\nline 2\nline 3 Retained last row.'),target=previous.blocks.find(b=>b.margin==='line 2');
 for(const word of ['above','below']){const result=plan(previous,`On page 1, ${word} line 2, insert:`);assert.equal(result.ready,true,JSON.stringify(result.issues));assert.equal(result.amendments[0].insertion.offset,target.end);assert.deepEqual(result.amendments[0].lineInsertion,{page:1,line:2,position:word});}
});

test('body relative-line instructions reject missing pages, conflicting locators and invalid printed numbers',()=>{
 const previous=make('line 1 Retain this word, and phrase.\nline 2 Retain the final row.');
 for(const directive of ['Below line 2, insert:','Above line 1, insert:','After line 2, insert:','On page 1, below line 0, insert:','On page 1, below line 9, insert:','On page 9, above line 1, insert:','On page 1, below line 2 and above line 1, insert:','On page 1, below line 1, before line 2, insert:','On page 1, in line 1, below line 2, insert:','On page 1, below lines 1 through 2, insert:','On page 1, below line 1 and 2, insert:','On page 1, below line 1, after “word” insert:','On page 1, below line 1, after the comma insert:','On page 1, below line 1, after the period insert:','On page 1, below line 2, at the end of the bill, insert:','On page 1 and page 2, below line 2, insert:','On page 1, after the last line 1, insert:']){const result=plan(previous,directive);assert.equal(result.ready,false,directive);assert.equal(result.amendments[0]?.ready,false,directive);assert.ok(result.issues.length,directive);}
 for(const doc of [make('line 1 First duplicate.\nline 1 Second duplicate.'),make('No printed line number.')]){const result=plan(doc,'On page 1, above line 1, insert:');assert.equal(result.ready,false);assert.ok(result.issues.length);}
});

test('a legacy unscoped before-line insertion is allowed only when its printed number is unique across the bill',()=>{
 const previous=make(['Unnumbered first page.','Heading.\nline 1 Second-page body.']),result=plan(previous,'Before line 1, insert:');assert.equal(result.ready,true,JSON.stringify(result.issues));assert.deepEqual(result.amendments[0].lineInsertion,{page:2,line:1,position:'above'});assert.equal(result.amendments[0].insertion.page,2);
 const ambiguous=make(['line 1 First-page body.','line 1 Second-page body.']);assert.equal(plan(ambiguous,'Before line 1, insert:').ready,false);assert.equal(plan(ambiguous,'On page 2, before line 1, insert:').ready,true);
});

test('heading/title relative lines continue to count their physical rows, without body margin metadata',()=>{
 const previous=make('Introduced by Assembly Member Example\nSecond heading row.\nJanuary 1, 2026\nAn act relating to reports.\nA second title row.\nLEGISLATIVE COUNSEL\nline 1 Legislative text.\nline 2 Retained legislative text.');
 for(const [scope,word,targetText]of [['heading','above','Second heading row.'],['title','below','A second title row.']]){const result=plan(previous,`In the ${scope}, ${word} line 2, insert:`);assert.equal(result.ready,true,JSON.stringify(result.issues));const row=result.amendments[0],target=previous.blocks.find(b=>b.text===targetText);assert.equal(row.insertion.offset,word==='above'?target.start:target.end);assert.equal(row.lineInsertion,null);}
});

test('bill-end and final between-lines fallback expose only the last existing printed line',()=>{
 const previous=make('line 1 First row.\nline 2 Final text.');
 for(const directive of ['At the end of the bill, insert:','On page 1, between lines 2 and 3, insert:']){const result=plan(previous,directive);assert.equal(result.ready,true,JSON.stringify(result.issues));assert.deepEqual(result.amendments[0].lineInsertion,{page:1,line:2,position:'below'});assert.equal(result.amendments[0].insertion.offset,previous.blocks.at(-1).end);}
});

test('the printed -0- cutoff continues to exclude trailing mockup amendments and payload',()=>{
 const previous=make('line 1 First row.\nline 2 Final text.'),text=instruction('On page 1, below line 2, insert:')+'\n- 0 -\nAmendment 99\nOn page 1, above line 1, insert:\nNot an instruction.';const parsed=parseAmendments(text);assert.deepEqual(parsed.map(r=>r.number),['7']);assert.equal(parsed[0].insertText,'Inserted wording.');const result=planAmendments({previous,instructions:make(text)});assert.equal(result.ready,true,JSON.stringify(result.issues));assert.equal(result.amendments.length,1);assert.equal(result.amendments[0].insertText,'Inserted wording.');
});
