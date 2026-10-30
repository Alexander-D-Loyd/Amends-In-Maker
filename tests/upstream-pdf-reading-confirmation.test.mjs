import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument,activeText} from '../app/core.mjs';
import {correctPdfReading} from '../app/correct-pdf-reading.mjs';
const scanned=(pages,readings,formatting=[])=>Object.assign(makeDocument(pages,'original.pdf',[],formatting),{ocr:true,scanQuality:readings});

test('a confirmed reading cannot be resubmitted even when its text was unchanged',()=>{
 const text='line 1 (c) The county shall report.',reading={page:1,start:7,end:10,text:'(c)',confidence:97,disagreement:'Original pixel readings differ: (e) / (c)'};
 const doc=scanned([text],[{page:1,uncertain:[reading]}]),before=structuredClone(doc);
 const updated=correctPdfReading(doc,reading,reading.text);
 assert.equal(updated.text,text);assert.equal(updated.scanQuality[0].uncertain.length,0);
 assert.deepEqual(doc,before);assert.throws(()=>correctPdfReading(updated,reading,reading.text),/changed/);
});

test('confirmation rejects unbound, fractional, multiline and out-of-page ranges',()=>{
 const text='(c) First.\n(e) Second.',reading={page:1,start:0,end:3,text:'(c)'};
 const doc=scanned([text],[{page:1,uncertain:[reading]}]);
 for(const invalid of [{...reading,page:0},{...reading,page:1.5},{...reading,start:.5},{...reading,end:0},{...reading,start:-1},{...reading,end:100},{page:1,start:11,end:14,text:'(e)'},{page:1,start:0,end:14,text:text.slice(0,14)}])assert.throws(()=>correctPdfReading(doc,invalid,'(c)'),/changed/);
});

test('correction preserves original physical font evidence, source deletions and recognized wrapped words',()=>{
 const first='line 1 (e) The li-\nline 2 cense is required.',second='line 1 Later text.';
 const fontEvidence={italic:true,italicKnown:true,fontStyleConflict:false,fontStyleProvenance:{version:1,sourceFace:'Times-Italic',faceItalic:true,italicFlag:true,missingFile:false,isType3Font:false,isInvalidPDFjsFont:false}};
 const formatting=[first.split('\n').map(text=>({height:12,x:50,right:400,pageWidth:612,runs:[{start:0,end:text.length,x:50,width:350,...fontEvidence}]})),[]];
 const reading={page:1,start:7,end:10,text:'(e)'},doc=scanned([first,second],[{page:1,uncertain:[reading]},{page:2,uncertain:[{start:7,end:12,text:'Later'}]}],formatting),before=structuredClone(doc);
 const updated=correctPdfReading(doc,reading,'(c)',new Set(['license']));
 assert.ok(updated.effectiveTokens.some(t=>t.value==='license'));
 assert.equal(updated.blocks[0].formatting.runs[0].italicKnown,true);
 assert.deepEqual(updated.blocks[0].formatting.runs[0].fontStyleProvenance,fontEvidence.fontStyleProvenance);
 assert.equal(updated.rawPages[1],second);assert.deepEqual(updated.scanQuality[1],doc.scanQuality[1]);
 assert.deepEqual(doc,before);assert.ok(activeText(updated).includes('(c)'));
});

test('longer correction moves later warnings to the same physical source text on its page',()=>{
 const text='(c) The office shall report.',reading={page:1,start:0,end:3,text:'(c)'},start=text.indexOf('office');
 const doc=scanned([text],[{page:1,uncertain:[reading,{start,end:start+6,text:'office',disagreement:'office / oflice'}]}]);
 const updated=correctPdfReading(doc,reading,'(ccc)'),remaining=updated.scanQuality[0].uncertain[0];
 assert.equal(remaining.start,start+2);assert.equal(updated.rawPages[0].slice(remaining.start,remaining.end),remaining.text);assert.equal(remaining.text,'office');
});

test('confirmation retains original annotation and ignored-page JR notices without stale bill offsets',()=>{
 const text='ASSEMBLY BILL No. 1\nline 1 (e) The office shall report.\nline 2 All matter deleted in this bill appears in the bill as amended in the Assembly, January 1, 2026. (JR 24)\nline 3 0';
 const start=text.indexOf('(e)'),reading={page:1,start,end:start+3,text:'(e)'},doc=scanned([text],[{page:1,uncertain:[reading]}]);
 const billNotice=structuredClone(doc.jrBoxes[0]);
 const notices=[{source:'annotation',page:1,text:'Original annotation notice',rect:[10,20,30,40]},{source:'flattened',page:2,text:'Notice beyond ignored end marker'}];
 doc.jrBoxes.push(...structuredClone(notices));const before=structuredClone(doc);
 for(const replacement of ['(e)','(ccc)']){
  const updated=correctPdfReading(doc,reading,replacement),retained=updated.jrBoxes.filter(n=>n.source!=='bill'),fresh=updated.jrBoxes.find(n=>n.source==='bill');
  assert.deepEqual(retained,notices);assert.equal(fresh.ranges[0].start,billNotice.ranges[0].start+replacement.length-3);
  retained[0].rect[0]=500;assert.deepEqual(doc,before);
 }
});
