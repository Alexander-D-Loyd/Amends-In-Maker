import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {externalBillReference,legislativeBody,resolveExternalPayload} from '../app/external-amendments.mjs';
import {verifyAmendments,nonAmendmentEdits} from '../app/amendments.mjs';
const ref=makeDocument(['SENATE BILL No. 879\nIntroduced by Senator Test\nAn act about funding.\nlegislative counsel’s digest\nThis bill funds programs.\nThe people of the State of California do enact as follows:\nline 1 SECTION 1.00. New law.\nline 2 More law.','SB 879 — 2 —\nline 1 Final law.\n99'],'SB 879 v99.pdf');
const previous=makeDocument(['The people of the State of California do enact as follows:\nline 1 Old law.'],'previous');
const body='SECTION 1.00. New law.\nMore law.\nFinal law.';
const instruction='Amendment 1\nOn page 1, before line 1, insert:\nSECTION 1. [Insert contents of SB 879, as introduced on January 9, 2026]';
test('referenced bill insertion uses only active legislative body and its section numbering',()=>{
 const reference=externalBillReference(instruction);assert.equal(reference.bill,'SB 879');assert.equal(reference.additional,false);
 assert.equal(legislativeBody(ref,'SB 879'),body);assert.equal(resolveExternalPayload(instruction.split('insert:\n')[1],reference,ref),body);
 const current=makeDocument(['The people of the State of California do enact as follows:\nline 1 '+body+'\nline 4 Old law.'],'current');
 const result=verifyAmendments(instruction,previous,current,{'SB 879':ref});assert.equal(result[0].status,'implemented');
 assert.ok(!result[0].insertText.includes('digest'));assert.equal(nonAmendmentEdits(instruction,previous,current,result,{'SB 879':ref}).ranges[1].length,0);
 const wrong=makeDocument(['The people of the State of California do enact as follows:\nline 1 SECTION 1.00. Missing law.\nline 2 More law.\nline 3 Final law.\nline 4 Old law.'],'wrong');assert.equal(verifyAmendments(instruction,previous,wrong,{'SB 879':ref})[0].status,'incorrect');
});
test('missing bill, wrong bill, unidentified body and missing additional attachments require review',()=>{
 assert.match(verifyAmendments(instruction,previous,previous)[0].message,/Upload SB 879/);
 assert.throws(()=>legislativeBody(ref,'AB 879'),/different bill/);
 assert.throws(()=>legislativeBody(makeDocument(['SENATE BILL No. 879\nNo body.'],'bad'),'SB 879'),/body could not/);
 const extra=instruction.replace('2026]','2026, plus additional attached LCB RNs]');
 const result=verifyAmendments(extra,previous,previous,{'SB 879':ref})[0];assert.equal(result.status,'incorrect');assert.match(result.message,/Additional attached/);assert.equal(result.insertText,body);assert.equal(result.evidence.length,1);assert.equal(nonAmendmentEdits(extra,previous,previous,[result],{'SB 879':ref}).uncertain,true);
});
test('large document strikeout intervals exclude overlapping and unsorted spans consistently',()=>{
 const text='Alpha Beta Gamma Delta';const doc=makeDocument([text],'large',[[{start:11,end:16},{start:6,end:10},{start:8,end:13}]]);
 assert.deepEqual(doc.effectiveTokens.map(t=>t.value),['Alpha','Delta']);
});
test('deletion beside unresolved external insertion requires review instead of a false mismatch',()=>{
 const instructions=instruction+'\nAmendment 2\nOn page 1, strike out line 1.';
 const results=verifyAmendments(instructions,previous,previous);
 assert.equal(results.length,2);assert.equal(results[1].status,'needs-review');assert.match(results[1].message,/unresolved referenced insertion/);
});

test('referenced body is displayed and checked even when additional drafting attachments are unresolved',()=>{
 const extra=instruction.replace('2026]','2026, plus additional attached LCB RNs]');
 const correct=makeDocument(['The people of the State of California do enact as follows:\nline 1 '+body+'\nline 4 Old law.'],'correct');
 const result=verifyAmendments(extra,previous,correct,{'SB 879':ref})[0];
 assert.equal(result.insertText,body);assert.equal(result.status,'needs-review');assert.equal(result.evidence[0].status,'implemented');
 const incorrect=makeDocument(['The people of the State of California do enact as follows:\nline 1 '+body.replace('New law.','Changed law.')+'\nline 4 Old law.'],'incorrect');
 const bad=verifyAmendments(extra,previous,incorrect,{'SB 879':ref})[0];assert.equal(bad.status,'incorrect');assert.ok(bad.evidence[0].expectedParts.some(p=>p.different&&p.text.includes('New')));
 const extras=makeDocument(['The people of the State of California do enact as follows:\nline 1 '+body+' Additional attached law.\nline 4 Old law.'],'extras');
 assert.equal(verifyAmendments(extra,previous,extras,{'SB 879':ref})[0].status,'needs-review');
});
