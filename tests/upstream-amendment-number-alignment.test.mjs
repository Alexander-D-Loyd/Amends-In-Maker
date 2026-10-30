import test from 'node:test';import assert from 'node:assert/strict';
import {comparisonTokens,makeDocument} from '../app/core.mjs';import {amendmentWordDiff} from '../app/amendment-word-diff.mjs';import {amendmentDiscrepancies} from '../app/amendment-discrepancies.mjs';import {verifyAmendments} from '../app/amendments.mjs';
const tokens=t=>comparisonTokens(t),values=t=>tokens(t).map(t=>t.value);
test('changed budget amounts remain whole replacements with exact original token positions',()=>{
 const expected='Senate 196,942,000; Assembly 259,495,000; salaries (7,045,000).',actual='Senate 206,258,000; Assembly 275,757,000; salaries (7,361,000).';
 const diff=amendmentWordDiff(values(expected),values(actual)),issues=amendmentDiscrepancies(diff,tokens(actual),0);
 assert.deepEqual(issues.map(i=>[i.expectedText.replaceAll(' ',''),i.actualText.replaceAll(' ','')]),[['196,942,000','206,258,000'],['259,495,000','275,757,000'],['7,045,000','7,361,000']]);
 for(const i of issues)assert.equal(actual.slice(i.currentStart,i.currentEnd),i.actualText.replaceAll(' ',''));
 assert.deepEqual(diff.filter(c=>!c.added).flatMap(c=>c.value),values(expected));assert.deepEqual(diff.filter(c=>!c.removed).flatMap(c=>c.value),values(actual));
});
test('actual absent amounts retain a missing marker even beside another number',()=>{
 const instruction='On page 1, in line 1, strike out "Old law." and insert:\nAllocate 123 456 dollars.',previous=makeDocument(['line 1 Old law.'],'Previous'),current=makeDocument(['line 1 Allocate 456 dollars.'],'Current');
 const r=verifyAmendments(instruction,previous,current)[0];assert.equal(r.status,'incorrect');assert.deepEqual(r.evidence[0].missingPoints.map(p=>p.text),['123']);assert.ok(r.evidence[0].discrepancies.some(i=>i.expectedText==='123'&&!i.actualText));
});
test('decimal differences and genuine removed wording remain independently navigable',()=>{
 const expected='Provide 12.50 dollars and retain the notice.',actual='Provide 13.50 dollars and retain notice.',issues=amendmentDiscrepancies(amendmentWordDiff(values(expected),values(actual)),tokens(actual),0);
 assert.deepEqual(issues.map(i=>[i.expectedText.replaceAll(' ',''),i.actualText.replaceAll(' ','')]),[['12.50','13.50'],['the','']]);
});
test('commas in short numeral series and identifier punctuation retain token fidelity',()=>{
 for(const [a,b] of [['Items 1, 2, 3.','Items 1, 4, 3.'],['SEC. 2.00. Code 0110-001-0001.','SEC. 3.00. Code 0110-001-0002.'],['Supply 1,234 items.','Supply 1234 items.'],['Amount 1234,567 is malformed.','Amount 1234,568 is malformed.']]){
  const diff=amendmentWordDiff(values(a),values(b));assert.deepEqual(diff.filter(c=>!c.added).flatMap(c=>c.value),values(a));assert.deepEqual(diff.filter(c=>!c.removed).flatMap(c=>c.value),values(b));
 }
 const list=amendmentDiscrepancies(amendmentWordDiff(values('Items 1, 2, 3.'),values('Items 1, 4, 3.')),tokens('Items 1, 4, 3.'),0);assert.deepEqual(list.map(i=>[i.expectedText,i.actualText]),[['2','4']]);
});
test('multi-page numeric replacements show real differences without invented gaps',()=>{
 const p=makeDocument(['line 1 Old law.'],'Previous'),c=makeDocument(['line 1 Allocate 206,258,000 dollars.','line 1 Provide 7,361,000 dollars for salaries.'],'Current');
 const r=verifyAmendments('On page 1, in line 1, strike out "Old law." and insert:\nAllocate 196,942,000 dollars.\nProvide 7,045,000 dollars for salaries.',p,c)[0];
 assert.equal(r.status,'incorrect');assert.equal(r.evidence[0].missingPoints.length,0);assert.equal(r.evidence[0].discrepancies.length,2);assert.deepEqual(r.evidence[0].differenceRanges.map(i=>c.text.slice(i.start,i.end)),['206,258,000','7,361,000']);
});
