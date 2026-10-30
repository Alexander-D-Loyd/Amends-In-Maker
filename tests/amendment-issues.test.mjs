import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {instructionLocation,instructionLocations,instructionSourceText} from '../app/amendment-issues.mjs';
import {planAmendments} from '../app/amendment-planner.mjs';

function entry(rawPages,strikes=[]){
 const doc=makeDocument(rawPages,'instructions.pdf',strikes);
 return {id:'instructions',doc,pages:rawPages.map((_,index)=>({page:index+1,lines:doc.blocks.filter(b=>b.page===index+1).map((b,row)=>({start:b.start,end:b.end,glyphs:Array.from(b.text,(text,i)=>({start:b.start+i,end:b.start+i+1,x:50+i*5,y:700-row*15,width:5,height:10,text}))}))}))};
}

test('wrapped multi-page instruction bounds use its printed number and exact original rows',()=>{
 const pages=['Instructions\nAmendment 5\nOn page 1, in line 2,\nstrike out “missing', 'wording”.\nAmendment 17\nOn page 1, in line 1, strike out “other”.'],e=entry(pages),location=instructionLocation(e,'5');
 assert.equal(location.start,e.doc.text.indexOf('Amendment 5'));assert.equal(location.end,e.doc.text.indexOf('\nAmendment 17'));assert.equal(location.page,1);assert.deepEqual(location.pages,[1,2]);assert.equal(e.doc.text.slice(location.start,location.end),'Amendment 5\nOn page 1, in line 2,\nstrike out “missing\nwording”.');assert.deepEqual(location.rects.map(r=>r.page),[1,1,1,2]);assert.ok(location.rects.every(r=>r.x===50&&r.height===10&&r.width>0));
 const next=instructionLocation(e,17);assert.equal(next.page,2);assert.equal(next.start,e.doc.text.indexOf('Amendment 17'));assert.deepEqual(next.pages,[2]);
});

test('OCR spacing repairs never shift instruction issue offsets into another original row',()=>{
 const raw='Amendment 3\nOnpage1, inline1, strike out “missing”.\nAmendment 14\nOnpage1, inline2, strike out “absent”.',e=entry([raw]);e.doc.ocr=true;
 const plan=planAmendments({previous:makeDocument(['line 1 Existing wording.\nline 2 Existing text.'],'bill'),instructions:e});assert.equal(plan.ready,false);assert.notEqual(plan.instructionText,raw);
 assert.deepEqual(plan.amendments.map(a=>a.number),['3','14']);for(const row of plan.amendments){const location=instructionLocation(e,row.number);assert.equal(row.instructionStart,location.start);assert.equal(row.instructionEnd,location.end);assert.equal(row.issues[0].instructionStart,location.start);assert.equal(raw.slice(row.instructionStart,row.instructionEnd).startsWith('Amendment '+row.number),true);}
 assert.equal(plan.amendments[1].instructionStart,raw.indexOf('Amendment 14'));
});

test('struck and ignored headings do not become popup targets, and appendix text is excluded',()=>{
 const raw='Amendment 2\nDiscarded instruction.\nAmendment 8\nOn page 1, in line 1, strike out “word”.\n- 0 -\nAmendment 90\nAppendix text.',end=raw.indexOf('\nAmendment 8'),e=entry([raw],[[{start:0,end}]]);
 assert.equal(instructionLocation(e,2),null);assert.equal(instructionLocation(e,90),null);assert.deepEqual(instructionLocations(e).map(r=>r.number),['8']);assert.equal(raw.slice(instructionLocation(e,8).start,instructionLocation(e,8).end),'Amendment 8\nOn page 1, in line 1, strike out “word”.');
 e.doc.blocks.find(b=>b.text==='Amendment 8').ignored=true;assert.equal(instructionLocation(e,8),null);assert.equal(instructionSourceText(e).length,raw.length);
});

test('duplicate printed numbers, plain notes, and multiple unheaded directives have no guessed popup location',()=>{
 const duplicate=entry(['Amendment 1\nFirst.\nAmendment 1\nSecond.']);assert.equal(instructionLocation(duplicate,1),null);assert.equal(instructionLocations(duplicate).length,2);
 for(const raw of ['Notes for the bill.\nReview this text.','On page 1, in line 1, strike out “word”.\nOn page 1, in line 2, strike out “other”.']){const unnamed=entry([raw]);assert.equal(instructionLocation(unnamed,1),null);assert.deepEqual(instructionLocations(unnamed),[]);}
});

test('one wrapped unheaded directive binds synthetic amendment one to exact original source text',()=>{
 const raw='Drafting notes\nOn page 1,\nin line 2, strike out\n“missing”.\n- 0 -\nAppendix.',e=entry([raw]),location=instructionLocation(e,'1');assert.equal(location.start,raw.indexOf('On page'));assert.equal(location.end,raw.indexOf('\n- 0 -'));assert.equal(location.page,1);assert.equal(location.rects.length,3);assert.equal(raw.slice(location.start,location.end),'On page 1,\nin line 2, strike out\n“missing”.');const plan=planAmendments({previous:makeDocument(['line 1 Existing wording.\nline 2 Existing text.'],'bill'),instructions:e});assert.equal(plan.ready,false);assert.equal(plan.amendments[0].number,'1');assert.equal(plan.issues[0].instructionStart,location.start);assert.equal(plan.issues[0].instructionEnd,location.end);
 for(const directive of ['In the title, strike out “missing”.','In the heading,\nstrike out “missing”.']){const value=entry(['Notes.\n'+directive]);assert.equal(instructionLocation(value,1).start,7);}
});

test('a page-two reading uncertainty binds to that page’s original amendment using page-local warning offsets',()=>{
 const rawPages=['Amendment 1\nOn page 1, in line 1, after “word” insert:\nnew', 'Amendment 6\nOn page 1, in line 2, strike out “unclear”.'],e=entry(rawPages),start=rawPages[1].indexOf('unclear');e.doc.scanQuality=[{page:2,uncertain:[{start,end:start+7,text:'unclear'}]}];
 const plan=planAmendments({previous:makeDocument(['line 1 The word applies.\nline 2 Unclear wording.'],'bill'),instructions:e}),error=plan.issues[0];assert.equal(plan.ready,false);assert.deepEqual(plan.amendments,[]);assert.equal(error.number,'6');assert.equal(error.instructionPage,2);assert.equal(error.instructionStart,rawPages[0].length+1);assert.equal(error.readingStart,rawPages[0].length+1+start);assert.equal(error.entryId,e.id);assert.equal(error.source,'instructions');
});

test('review highlights cover validated original physical rows even when PDF glyph mapping is unavailable',()=>{
 const e=entry(['Amendment 4\nOn page 1, in line 1, strike out “missing”.']);e.pages[0].view=[0,0,612,792];for(const [index,line]of e.pages[0].lines.entries())Object.assign(line,{glyphs:[],left:44,right:300,baseline:700-index*15,height:12});const location=instructionLocation(e,4);assert.equal(location.rects.length,2);assert.deepEqual(location.rects[1],{page:1,x:44,y:685-12*.22,width:256,height:12});
 e.pages[0].lines[1].right=700;assert.equal(instructionLocation(e,4).rects.length,1);e.pages[0].view=[0,0,0,0];assert.deepEqual(instructionLocation(e,4).rects,[]);
});
