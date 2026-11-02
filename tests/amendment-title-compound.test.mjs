import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {planAmendments} from '../app/amendment-planner.mjs';
import {amendmentPlan} from '../app/amendments.mjs';
const lines=['An act to amend Sections 100,','200, 300, and 400 of the Civil Code,','and Sections 23570 and 23571 of,','and to amend Sections 23572, 23573,','and 23575.7 of, the Revenue and Taxation Code.'];
const directive='In the title, in line 1, strike out “amend Sections 100,”, strike out lines 2 to 4, inclusive, in line 5, strike out “and 23575.7 of,” and insert:';
const source=(numbered=false)=>makeDocument(['ASSEMBLY BILL No. 1234\nIntroduced by Assembly Member Example\nJanuary 1, 2026\n'+lines.map((line,i)=>(numbered?'line '+(i+1)+' ':'')+line).join('\n')+'\nLEGISLATIVE COUNSEL’S DIGEST\nThe title words amend Sections 100, occur again here.\nThe people of the State of California do enact as follows:\nline 1 and 23575.7 of, is retained in the body.'],'previous.pdf');
const instructions=text=>makeDocument(['Amendment 7\n'+text+'\namend Section 101 of'],'AMENDS.pdf');
test('a title compound joins a partial first line, whole middle lines and partial last line into one replacement',()=>{
 for(const numbered of [false,true]){const previous=source(numbered),before=JSON.stringify(previous),result=planAmendments({previous,instructions:instructions(directive)});assert.equal(result.ready,true,JSON.stringify(result.issues));const row=result.amendments[0];assert.equal(row.action,'replace');assert.equal(row.patches.length,1);assert.equal(row.insertions.length,1);assert.deepEqual(row.sourceRanges.map(r=>r.text),['amend Sections 100,',...lines.slice(1,4),'and 23575.7 of,']);assert.ok(row.sourceRanges.every(r=>!r.text.startsWith('line ')));assert.equal(previous.text.slice(0,row.sourceRanges[0].start).endsWith('An act to '),true);assert.equal(previous.text.slice(row.sourceRanges.at(-1).end).startsWith(' the Revenue'),true);assert.equal(row.insertion.offset,row.sourceRanges.at(-1).end);assert.equal(JSON.stringify(previous),before);
 const full=amendmentPlan(instructions(directive).text,previous,previous);assert.equal(full.patches.length,1);assert.deepEqual(full.patches[0].replacement,['amend','Section','101','of']);}
});
test('an unresolved compound clause holds the entire amendment without keeping earlier partial strikeouts',()=>{
 for(const text of [directive.replace('and 23575.7 of,','missing wording'),directive.replace('in line 5, ',' '),directive.replace('lines 2 to 4','lines 2 to 9'),directive.replace('lines 2 to 4','lines 4 to 2'),directive.replace('strike out lines 2 to 4','remove lines 2 to 4'),directive.replace('in line 5,','retain this clause, in line 5,'),directive.replace('strike out lines 2 to 4','strike out page 1')]){const result=planAmendments({previous:source(),instructions:instructions(text)});assert.equal(result.ready,false,text);assert.equal(result.amendments[0].ready,false);assert.deepEqual(result.amendments[0].sourceRanges,[]);assert.deepEqual(result.amendments[0].patches,[]);}
});
test('compound title quotes remain bound to their row, page and unique occurrence',()=>{
 const previous=source();for(const text of [directive.replace('in line 1','in line 2'), 'On page 2, '+directive,directive.replace('In the title','In the title, in the heading')])assert.equal(planAmendments({previous,instructions:instructions(text)}).ready,false,text);
 const duplicate=makeDocument([previous.text.replace(lines[0],lines[0]+' amend Sections 100,')],'duplicate.pdf');assert.equal(planAmendments({previous:duplicate,instructions:instructions(directive)}).ready,false);
});
test('instruction-like words inside quoted targets cannot create additional deletion or page events',()=>{
 const first='amend the words on page 9, strike out lines 8 to 10,',previous=makeDocument(['An act to '+first+'\n'+lines.slice(1).join('\n')+'\nLEGISLATIVE COUNSEL’S DIGEST\nDigest text.'],'previous.pdf'),text=directive.replace('amend Sections 100,',first),result=planAmendments({previous,instructions:instructions(text)});assert.equal(result.ready,true,JSON.stringify(result.issues));assert.equal(result.amendments[0].sourceRanges[0].text,first);assert.equal(result.amendments[0].sourceRanges.length,5);
});
test('missing middle printed lines cannot be silently included in a compound body deletion',()=>{
 const previous=makeDocument(['line 1 Begin old words.\nline 2 Full second line.\nline 4 Full fourth line.\nline 5 old ending remains.'],'previous.pdf'),text='On page 1, in line 1, strike out “old words.”, strike out lines 2 to 4, inclusive, in line 5, strike out “old ending” and insert:';assert.equal(planAmendments({previous,instructions:instructions(text)}).ready,false);
});
test('compound title deletions without insertion keep all five strikeout rows and no insertion point',()=>{
 const text=directive.replace(' and insert:', '.'),result=planAmendments({previous:source(),instructions:makeDocument(['Amendment 7\n'+text],'AMENDS.pdf')});assert.equal(result.ready,true,JSON.stringify(result.issues));const row=result.amendments[0];assert.equal(row.action,'delete');assert.equal(row.sourceRanges.length,5);assert.equal(row.patches.length,1);assert.deepEqual(row.insertions,[]);assert.deepEqual(row.patches[0].replacement,[]);
});
test('ordinal and all-occurrence words inside quotes do not choose an unrequested occurrence',()=>{
 for(const target of ['first clause','all occurrences']){const previous=makeDocument(['An act to '+target+' and '+target+'\n'+lines.slice(1).join('\n')+'\nLEGISLATIVE COUNSEL’S DIGEST\nDigest.'],'previous.pdf'),text=directive.replace('amend Sections 100,',target);assert.equal(planAmendments({previous,instructions:instructions(text)}).ready,false,target);}
 const previous=makeDocument(['An act to first clause and first clause\n'+lines.slice(1).join('\n')+'\nLEGISLATIVE COUNSEL’S DIGEST\nDigest.'],'previous.pdf'),text=directive.replace('strike out “amend Sections 100,”','strike out the second “first clause”'),result=planAmendments({previous,instructions:instructions(text)});assert.equal(result.ready,true,JSON.stringify(result.issues));assert.equal(result.amendments[0].sourceRanges[0].start,previous.text.indexOf('first clause',previous.text.indexOf('first clause')+1));
});
