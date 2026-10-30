import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOutput,outputAttemptKey} from '../app/output-workflow.mjs';

function fixture(){
 const text='line 1 The old wording applies.\nline 2 Keep the second row.',lines=[];let offset=0;
 for(const [i,value]of text.split('\n').entries()){
  const prefix='line '+(i+1)+' ',glyphs=[];for(let j=prefix.length;j<value.length;j++)glyphs.push({start:offset+j,end:offset+j+1,x:76+(j-prefix.length)*5,y:698-i*20,width:5,height:10});
  lines.push({start:offset,end:offset+value.length,baseline:700-i*20,height:10,left:76,right:76+(value.length-prefix.length)*5,margin:{x:42,y:698-i*20,width:5,height:10,number:i+1,start:offset,end:offset+prefix.length},glyphs});offset+=value.length+1;
 }
 const start=text.indexOf('old wording'),a={number:'1',ready:true,action:'delete',sourceRanges:[{start,end:start+11}]},bad={number:'2',ready:false,action:'insert',issues:[{number:'2',code:'SOURCE_LOCATION_UNRESOLVED',message:'Quoted wording was not found.'}]};
 return {id:'amends:a',entries:[{id:'p',revision:0},{id:'a',revision:0}],assignment:{previousId:'p'},outputFilename:'AB 1 March 25 Amends In.pdf',previous:{doc:{text},pages:[{page:1,view:[0,0,612,792],lines}]},instructions:{id:'a'},plan:{ready:false,amendments:[a,bad]},issues:bad.issues};
}
test('a failed amendment is omitted while the complete independently verified mark is exportable',()=>{
 const group=fixture(),before=JSON.stringify(group),out=prepareOutput(group);assert.equal(out.exportable,true);assert.equal(out.partial,true);assert.equal(out.markedCount,1);assert.equal(out.unmarkedCount,1);assert.deepEqual(out.marks.amendments.map(a=>a.number),['1']);assert.equal(out.issues[0].number,'2');assert.equal(JSON.stringify(group),before);
});
test('file identity, dates, source reading integrity and duplicate numbers hold the entire PDF',()=>{
 for(const error of [{code:'DATE_INVALID'},{code:'BILL_ID_CONFLICT'},{code:'PDF_READING_UNCERTAIN'},{code:'AMENDMENT_NUMBER_DUPLICATE',number:'1'}]){const g=fixture();g.issues.push(error);assert.equal(prepareOutput(g).exportable,false,error.code);}
 const g=fixture();g.previous=null;assert.equal(prepareOutput(g).exportable,false);
});
test('a target with unavailable glyph positions is reported by amendment number and never exported',()=>{
 const g=fixture();g.previous.pages[0].lines[0].glyphs=[];const out=prepareOutput(g);assert.equal(out.exportable,false);assert.ok(out.issues.some(i=>i.code==='PDF_MARKING_FAILED'&&i.number==='1'));assert.equal(out.markedCount,0);
});
test('holding a mixed result is supported without changing the strict planner contract',()=>{
 const g=fixture();assert.equal(prepareOutput(g,{allowPartial:false}).exportable,false);assert.equal(g.plan.ready,false);
});
test('combined label collisions hold the PDF and preserve a jumpable issue for every omitted amendment',()=>{
 const g=fixture(),text=g.previous.doc.text;g.issues=[];g.plan={ready:true,amendments:[]};
 const positions=[...text.slice(7,text.indexOf('\n')).matchAll(/\S/g)].slice(0,9).map(m=>7+m.index);
 g.plan.amendments=positions.map((start,i)=>({number:String(i+1),ready:true,action:'delete',sourceRanges:[{start,end:start+1}]}));
 const out=prepareOutput(g);assert.equal(out.exportable,false);assert.ok(out.issues.length);assert.deepEqual([...new Set(out.issues.map(i=>i.number))],g.plan.amendments.map(a=>a.number));assert.ok(out.issues.every(i=>i.code==='COMBINED_MARKING_FAILED'&&i.source==='instructions'));
});
test('repeated automatic passes keep one attempt identity until a folder, source or pairing changes',()=>{
 const g=fixture();g.output=prepareOutput(g);const original=outputAttemptKey(g,'folder-A');assert.equal(outputAttemptKey(structuredClone(g),'folder-A'),original);assert.notEqual(outputAttemptKey(g,'folder-B'),original);g.entries[0].revision++;assert.notEqual(outputAttemptKey(g,'folder-A'),original);g.entries[0].revision--;g.assignment.previousId='replacement';assert.notEqual(outputAttemptKey(g,'folder-A'),original);
});
