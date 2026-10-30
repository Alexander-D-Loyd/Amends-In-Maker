import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmendments,amendmentDisplays,verifyAmendments,isProposedAmendmentsPage} from '../app/amendments.mjs';
import {makeDocument} from '../app/core.mjs';
test('instruction appendix is not inserted and nested quotes and ordinal anchors compile correctly',()=>{
 const text='Amendment 1\nOn page 1, in line 1, strike out ““Chancellor”” and insert:\n“Chancellor’s office”\nAmendment 2\nOn page 1, in line 1, after the first “the” insert:\noffice of the\nPROPOSED AMENDMENTS RN 26 11865 07\nPROPOSED AMENDMENTS TO ASSEMBLY BILL NO. 1636\nAn entire appended bill.';
 const rules=parseAmendments(text);assert.equal(rules[1].insertText,'office of the');assert.equal(rules[1].anchor,'the');assert.equal(rules[1].occurrence,1);assert.deepEqual(rules[0].deleteText,['“Chancellor”']);
 assert.equal(amendmentDisplays({text,struck:[]})[1].payload.text,'office of the');
 const prev=makeDocument(['line 1 “Chancellor” means the Chancellor.'],'Previous'),current=makeDocument(['line 1 “Chancellor’s office” means the office of the Chancellor.'],'Current');
 assert.ok(verifyAmendments(text,prev,current).every(r=>r.status==='implemented'));
});
test('standalone proposed heading identifies mockup pages, but ordinary prose does not',()=>{
 for(const heading of ['PROPOSED AMENDMENTS','  PROPOSED AMENDMENTS  ','Proposed Amendments','PROPOSED AMENDMENTS TO ASSEMBLY BILL NO. 1636','PROPOSED AMENDMENTS RN 26 11865 07']){
  assert.equal(isProposedAmendmentsPage('Header metadata\n'+heading+'\nMockup contents'),true);
  const text='Amendment 1\nOn page 1, after “A” insert:\nB\n'+heading+'\nAmendment 99\nMockup text';
  assert.equal(parseAmendments(text).length,1);assert.equal(parseAmendments(text)[0].insertText,'B');
 }
 assert.equal(isProposedAmendmentsPage('The proposed amendments change the bill.'),false);
 assert.equal(isProposedAmendmentsPage('Proposed amendments shall be submitted.'),false);
});
