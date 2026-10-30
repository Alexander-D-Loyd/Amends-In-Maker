import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {planAmendments} from '../app/amendment-planner.mjs';
const make=(text,name='source')=>makeDocument(Array.isArray(text)?text:[text],name);
const instructions=text=>make(text,'instructions');

test('the four requested amendment forms bind exact source ranges and insertion boundaries',()=>{
 const previous=make('line 1 The report, upon request, is available.\nline 2 Before the insertion.\nline 3 After the insertion.\nline 4 The obsolete wording applies.\nline 5 The period is 30 days.');
 const text='Amendment 1\nOn page 1, in line 1, after the first comma insert:\nin writing,\nAmendment 2\nOn page 1, between lines 2 and 3, insert:\nAdditional text.\nAmendment 3\nOn page 1, in line 4, strike out “obsolete wording”.\nAmendment 4\nOn page 1, in line 5, strike out “30 days” and insert:\n45 days';
 const before=JSON.stringify(previous),plan=planAmendments({previous,instructions:instructions(text)});assert.equal(plan.ready,true,JSON.stringify(plan.issues));assert.deepEqual(plan.amendments.map(a=>a.action),['insert','insert','delete','replace']);
 assert.equal(previous.text[plan.amendments[0].insertion.offset-1],',');assert.deepEqual(plan.amendments[1].between,{page:1,above:2,below:3});assert.equal(plan.amendments[2].sourceRanges.map(r=>r.text).join(''),'obsolete wording');assert.equal(plan.amendments[3].sourceRanges.map(r=>r.text).join(''),'30 days');assert.equal(plan.amendments[3].insertion.offset,plan.amendments[3].sourceRanges.at(-1).end);assert.equal(JSON.stringify(previous),before);
});

test('multi-line strike ranges cover every physical body row but never printed margin labels',()=>{
 const previous=make('line 1 The annual report shall summarize\nline 2 every regional submission.\nline 3 Retain this text.');
 const plan=planAmendments({previous,instructions:instructions('Amendment 1\nOn page 1, strike out lines 1 through 2.')});assert.equal(plan.ready,true);assert.equal(plan.amendments[0].sourceRanges.length,2);assert.deepEqual(plan.amendments[0].sourceRanges.map(r=>r.text),['The annual report shall summarize','every regional submission.']);assert.ok(plan.amendments[0].sourceRanges.every(r=>!r.text.includes('line ')));
});

test('repeated all-occurrence replacement preserves every separate insertion endpoint',()=>{
 const previous=make('line 1 The obsolete clause and obsolete clause apply.');
 const plan=planAmendments({previous,instructions:instructions('Amendment 1\nOn page 1, in line 1, strike out all occurrences of “obsolete” and insert:\ncurrent')});assert.equal(plan.ready,true,JSON.stringify(plan.issues));assert.equal(plan.amendments[0].patches.length,2);assert.equal(plan.amendments[0].insertions.length,2);assert.equal(plan.amendments[0].insertion,null);assert.deepEqual(plan.amendments[0].insertions.map(i=>i.offset),plan.amendments[0].sourceRanges.map(r=>r.end));
});

test('missing ambiguous and overlapping targets block the whole output without silently losing rules',()=>{
 const previous=make('line 1 The word and word apply.\nline 2 Retain this.');
 for(const text of ['Amendment 1\nOn page 1, in line 1, after “word” insert:\nnew','Amendment 1\nOn page 1, in line 9, strike out “missing”.','Amendment 1\nOn page 1, in line 1, strike out “word and word”.\nAmendment 2\nOn page 1, in line 1, strike out “and”.']){const plan=planAmendments({previous,instructions:instructions(text)});assert.equal(plan.ready,false,text);assert.ok(plan.issues.length);assert.ok(plan.amendments.some(a=>a.ready===false));}
});

test('all source reading disputes, duplicate numbers and missing external drafting materials block export',()=>{
 const previous=make('line 1 The word applies.');const ordinary=instructions('Amendment 1\nOn page 1, in line 1, after “word” insert:\nnew');
 for(const source of ['previous','instructions']){const p=structuredClone(previous),i=structuredClone(ordinary);(source==='previous'?p:i).scanQuality=[{page:1,uncertain:[{start:1,end:2,text:'c'}]}];assert.equal(planAmendments({previous:p,instructions:i}).ready,false,source);}
 for(const text of ['Amendment 1\nOn page 1, in line 1, after “word” insert:\nx\nAmendment 1\nOn page 1, in line 1, after “applies” insert:\ny','Amendment 1\nOn page 1, in line 1, after “word” insert:\n[insert body of SB 879 and additional attached RN materials]'])assert.equal(planAmendments({previous,instructions:instructions(text)}).ready,false,text);
 assert.equal(planAmendments({previous,instructions:ordinary,digest:make('Replacement digest')}).ready,false);
});

test('planning does not request or cross-check another bill version',()=>{
 const previous=make('line 1 The period is 30 days.'),current=make('line 1 The period is 31 days.'),inst=instructions('Amendment 1\nOn page 1, in line 1, strike out “30 days” and insert:\n45 days');
 current.scanQuality=[{page:1,uncertain:[{start:1,end:2,text:'x'}]}];const direct=planAmendments({previous,instructions:inst}),checked=planAmendments({previous,instructions:inst,current});assert.equal(checked.ready,true);assert.deepEqual(checked,direct);assert.deepEqual(checked.warnings,[]);assert.deepEqual(checked.verification,[]);
});

test('every overlapping amendment is unready while independent source targets keep their own readiness',()=>{
 const previous=make('line 1 The obsolete phrase applies.\nline 2 Keep this word.'),entry={id:'instructions-file',doc:instructions('Amendment 7\nOn page 1, in line 1, strike out “obsolete phrase”.\nAmendment 9\nOn page 1, in line 1, strike out “phrase”.\nAmendment 12\nOn page 1, in line 2, after “word” insert:\nnew')};
 const plan=planAmendments({previous,instructions:entry});assert.equal(plan.ready,false);assert.deepEqual(plan.amendments.map(a=>[a.number,a.ready]),[['7',false],['9',false],['12',true]]);assert.deepEqual(plan.issues.map(i=>i.number),['7','9']);for(const row of plan.amendments){assert.equal(row.source,'instructions');assert.equal(row.entryId,'instructions-file');assert.equal(entry.doc.text.slice(row.instructionStart,row.instructionEnd).startsWith('Amendment '+row.number),true);assert.equal(row.instructionPage,1);}for(const error of plan.issues){const row=plan.amendments.find(a=>a.number===error.number);assert.equal(error.instructionStart,row.instructionStart);assert.equal(error.instructionEnd,row.instructionEnd);}
});

test('a disputed instruction reading holds the whole bill and links to its original printed amendment',()=>{
 const previous=make('line 1 The word applies.'),raw='Amendment 4\nOn page 1, in line 1, after “word” insert:\nnew',doc=instructions(raw),start=raw.indexOf('word');doc.scanQuality=[{page:1,uncertain:[{start,end:start+4,text:'word'}]}];const plan=planAmendments({previous,instructions:{id:'i',doc}});assert.equal(plan.ready,false);assert.deepEqual(plan.amendments,[]);assert.equal(plan.issues[0].number,'4');assert.equal(plan.issues[0].source,'instructions');assert.equal(plan.issues[0].entryId,'i');assert.equal(plan.issues[0].instructionStart,0);assert.equal(plan.issues[0].readingStart,start);
});

test('struck instruction wording cannot become an active requested target',()=>{
 const previous=make('line 1 The word applies.'),raw='Amendment 1\nOn page 1, in line 1, after “word” insert:\nobsolete new',start=raw.indexOf('obsolete');
 const inst=makeDocument([raw],'instructions',[[{start,end:start+8}]]),plan=planAmendments({previous,instructions:inst});assert.equal(plan.ready,true);assert.ok(!plan.amendments[0].insertText.includes('obsolete'));assert.ok(plan.amendments[0].insertText.includes('new'));
});

test('instruction PDFs with no active amendments produce an explicit global issue',()=>{
 const previous=make('line 1 The word applies.');for(const inst of [instructions('  \n  '),makeDocument(['Amendment 1\nOn page 1, strike out line 1.'],'instructions',[[{start:0,end:42}]])]){const plan=planAmendments({previous,instructions:inst});assert.equal(plan.ready,false);assert.deepEqual(plan.amendments,[]);assert.ok(plan.issues.some(i=>i.code==='NO_AMENDMENTS_FOUND'&&!i.number),JSON.stringify(plan.issues));}
});
