import test from 'node:test';import assert from 'node:assert/strict';import {makeDocument} from '../app/core.mjs';import {verifyAmendments} from '../app/amendments.mjs';
const run=(directive,old,now=old)=>verifyAmendments(directive+' insert:\nnew text',makeDocument([old],'previous'),makeDocument([now],'current'))[0];
test('named comma anchors preserve exact before/after offsets and quoted punctuation behavior',()=>{
 for(const [position,wanted]of [['after','line 2 The minor, new text applies.'],['before','line 2 The minor new text, applies.']]){const r=run('On page1, in line2, '+position+' the comma','line 2 The minor, applies.',wanted);assert.equal(r.status,'implemented');assert.equal(r.evidence[0].previousOffset,'line 2 The minor'.length+(position==='after'?1:0));}
 assert.equal(run('On page1, in line2, after “,”','line 2 The minor, applies.','line 2 The minor, new text applies.').status,'implemented');
});
test('a named comma must be unique in its exact active source scope or explicitly numbered',()=>{
 const old='line 1 First, words.\nline 2 Second, words, end.';
 assert.equal(run('On page1, in line2, after the comma',old).status,'needs-review');assert.equal(run('On page1, in line3, after the comma',old).status,'needs-review');assert.equal(run('On page2, in line1, after the comma',old).status,'needs-review');
 for(const ordinal of ['second','last','final'])assert.equal(run('On page1, in line2, after the '+ordinal+' comma',old,'line 1 First, words.\nline 2 Second, words, new text end.').status,'implemented');
 assert.equal(run('On page1, in line1, after the comma',old,'line 1 First, new text words.\nline 2 Second, words, end.').status,'implemented');
});
test('numeric, missing, removed and conflicting comma evidence cannot establish an insertion',()=>{
 for(const body of ['line 1 The amount is 1,000 dollars.','line 1 No punctuation here.'])assert.equal(run('On page1, in line1, after the comma',body).status,'needs-review');
 for(const clause of ['after the comma and before the semicolon','after the comma and after the period','after the comma and before “end”'])assert.equal(run('On page1, in line1, '+clause,'line 1 First, end.').status,'needs-review');
 const old=makeDocument(['line 1 First, end.'],'previous',[[{start:12,end:13}]]);assert.equal(old.text[12],',');assert.equal(verifyAmendments('On page1, in line1, after the comma insert:\nnew text',old,old)[0].status,'needs-review');
});
