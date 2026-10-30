import test from 'node:test';import assert from 'node:assert/strict';
import {jrBoxDetails,jrBoxPageNotices,jrBoxMetadata,jrBoxRectangles,markJrBoxGeometry} from '../app/amendment-jr-box.mjs';
import {parseAmendments,amendmentDisplays,verifyAmendments} from '../app/amendments.mjs';
import {makeDocument} from '../app/core.mjs';
const notice='All matter deleted in this version of the bill appears in the bill as amended in the Assembly, April 21, 2025.';
test('AB76 JR annotation is identified independently of amendment text and its original geometry retained',()=>{
 const annotation={subtype:'FreeText',contentsObj:{str:notice},rect:[313.1,510.434,593.927,575.244]},before=JSON.stringify(annotation),notices=jrBoxPageNotices({text:'Amendment 2\nOn page 2, strike out lines 1 to 30\n- 0 -',annotations:[annotation],page:11});
 assert.equal(notices.length,1);assert.equal(notices[0].source,'annotation');assert.equal(notices[0].date,'April 21, 2025');assert.deepEqual(notices[0].rect,annotation.rect);assert.equal(JSON.stringify(annotation),before);
 assert.equal(jrBoxMetadata(notices),' · JR Box noted on page 11 · excluded from amendments');
});
test('substantially similar dated administrative wording supports wraps and both chambers',()=>{
 for(const text of [notice,notice.replace('Assembly, April 21, 2025.','Senate July 9, 2025'),notice.replace(/ /g,'\n'),notice.replace('matter deleted in this version of the bill appears','text deleted from this bill is contained')])assert.ok(jrBoxDetails(text),text);
 for(const text of ['All matter deleted in this bill appears in another bill.',notice.replace('April 21, 2025','last session'),'The phrase “'+notice+'” is inserted.',notice+' Extra legislative text.'])assert.equal(jrBoxDetails(text),null,text);
 assert.equal(jrBoxPageNotices({annotations:[{subtype:'Highlight',contents:notice}],page:1}).length,0);
});
test('flattened post-marker JR text stays out of parsing/display and has a visible separate notice',()=>{
 const text='Amendment 2\nOn page 2, strike out lines 1 to 30\n- 0 -\n'+notice+'\n24719 RN 25 19472 PAGE 11\nSubstantive';
 const doc=makeDocument([text],'instructions'),notices=jrBoxPageNotices({text,page:11});
 assert.equal(notices.length,1);assert.equal(notices[0].source,'flattened');assert.equal(parseAmendments(text).length,1);assert.doesNotMatch(parseAmendments(text)[0].source,/All matter/);assert.doesNotMatch(amendmentDisplays(doc)[0].directive.text,/All matter/);
 assert.equal(doc.text,text);
});
test('administrative-looking words inside legitimate insertion and quoted source remain untouched',()=>{
 const text='Amendment 1\nOn page 1, after “Existing law” insert:\n'+notice+'\n- 0 -',notices=jrBoxPageNotices({text,page:1});
 assert.equal(notices.length,0);assert.equal(parseAmendments(text)[0].insertText,notice);assert.equal(amendmentDisplays(makeDocument([text],'instructions'))[0].payload.text,notice);
 assert.equal(jrBoxMetadata([]),'');
});
const billNotice=notice.replace('deleted','omitted')+' (JR11)';
const bill=text=>makeDocument(['ASSEMBLY BILL No. 76\nline 1 Existing law.\n'+text],'bill');
test('dated JR bill tail retains physical rows but excludes its words from amendments and language tokens',()=>{
 const d=bill('line 2 '+billNotice+'\nline 3\nO');assert.equal(d.jrBoxes.length,1);assert.equal(d.jrBoxes[0].code,'JR11');assert.match(d.text,/All matter omitted/);assert.equal(d.blocks.find(b=>b.jrBox).ignored,true);
 assert.equal(d.effectiveTokens.some(t=>t.value==='omitted'||t.value==='JR11'),false);assert.equal(d.blocks.at(-1).ignored,true);
 assert.ok(d.excluded.every((r,i)=>!i||r.start>=d.excluded[i-1].end),'Administrative exclusions do not duplicate/overlap printed margins');
 const previous=bill('line 2 Old law.\nO');
 assert.equal(verifyAmendments('On page 1, strike out line 2',previous,d)[0].status,'implemented');
});
test('wrapped JR code is identified together with the whole dated notice',()=>{
 for(const tail of [notice+'\nline 3 (JR11)',notice+'\nline 3 (JR\nline 4 11)']){
  const d=bill('line 2 '+tail+'\nO');assert.equal(d.jrBoxes?.[0].code,'JR11');assert.equal(d.effectiveTokens.some(t=>t.value==='JR'),false);
 }
});
test('similar legitimate wording, incomplete references, intermediate notes and unproven boxes remain substantive',()=>{
 for(const text of [
   'line 2 '+notice+'\nO',
   'line 2 “'+billNotice+'”\nO',
   'line 2 '+billNotice+'\nline 3 Additional law.\nO',
   'line 2 '+billNotice.replace('April 21, 2025.','last session.')+'\nO',
   'line 2 '+billNotice
 ]){const d=bill(text);assert.equal(d.jrBoxes,undefined,text);assert.ok(d.effectiveTokens.some(t=>t.value==='matter'),text);}
 const multi=makeDocument(['ASSEMBLY BILL No. 76\nline 1 '+billNotice+'\nO','line 1 Later law.\nO'],'bill');assert.equal(multi.jrBoxes,undefined);
});
test('four matching thin painted edges establish a physical box independently of the JR code',()=>{
 const OPS={constructPath:1,fill:2,eoFill:3},edge=b=>[OPS.fill,[],b],ops={fnArray:[1,1,1,1],argsArray:[edge([86,502,354,503]),edge([86,568,354,569]),edge([86,502,87,569]),edge([353,502,354,569])]};
 const [box]=jrBoxRectangles(ops,OPS);assert.deepEqual(box,{left:86,right:354,bottom:502,top:569});assert.equal(jrBoxRectangles({...ops,fnArray:[1,1,1],argsArray:ops.argsArray.slice(0,3)},OPS).length,0);
 const text='ASSEMBLY BILL No. 76\nline 1 Existing law.\nline 2 '+notice+'\nO',formats=[null,null,{x:100,right:340,height:12,baseline:540,runs:[],pageWidth:612},null];
 markJrBoxGeometry({lines:formats},ops,OPS);const d=makeDocument([text],'bill',[],[formats]);assert.equal(d.jrBoxes.length,1);assert.equal(d.jrBoxes[0].code,undefined);assert.equal(d.effectiveTokens.some(t=>t.value==='matter'),false);
});
test('numbered JR body anchors to its original text column rather than the hidden line label',()=>{
 const prefix='ASSEMBLY BILL No. 76\nline 1 Existing law.',body=notice.replace('deleted','omitted')+' (JR11)',text=prefix+'\nline 14 '+body+'\nO';
 const format=(x,right,runs)=>({x,right,runs,pageWidth:612,height:12,bodyHeight:12,leading:13,headerGaps:[]});
 const bodyStart='line 14 '.length,sourceRuns=[{start:0,end:4,x:21,width:18,space:false},{start:5,end:7,x:48,width:12,space:false},{start:7,end:8,x:60,width:40,space:true},{start:bodyStart,end:bodyStart+body.length,x:100,width:240,space:false,bold:true,font:'sans-serif'}];
 const formats=[null,format(48,384,[{start:7,end:20,x:48,width:336,space:false}]),format(100,340,sourceRuns),null],savedRuns=structuredClone(sourceRuns),d=makeDocument([text],'Current',[],[formats]),block=d.blocks.find(b=>b.jrBox),part=block.formatting.headerParts[0];
 assert.equal(block.margin,'line 14 ');assert.equal(block.text.slice(block.margin.length),body);assert.equal(d.text,text);
 assert.equal(part.start,block.margin.length);assert.equal(part.end,block.text.length);assert.equal(part.anchor,'left');assert.equal(part.position,(100-48)/(384-48));
 assert.ok(part.position>=0,'JR body cannot be positioned left of its source body column');assert.deepEqual(block.formatting.runs,savedRuns);
 assert.equal(block.ignored,true);assert.equal(d.effectiveTokens.some(t=>t.value==='JR11'),false);
});
