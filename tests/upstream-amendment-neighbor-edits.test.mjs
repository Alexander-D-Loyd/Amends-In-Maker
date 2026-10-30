import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {verifyAmendments,nonAmendmentEdits} from '../app/amendments.mjs';
const previous=makeDocument(['line 1 Before old anchor.\nline 2 Last unchanged.'],'previous');
const instruction='Amendment 1\nOn page 1, in line 1, after “old” insert:\nnew text';
test('a neighboring non-amendment edit does not make an exactly anchored insertion fail',()=>{
 for(const text of ['Before older new text anchor.','Before old new text altered.']){
  const current=makeDocument(['line 1 '+text+'\nline 2 Last unchanged.'],'current');
  const results=verifyAmendments(instruction,previous,current),e=results[0].evidence[0];
  assert.equal(results[0].status,'implemented');assert.equal(e.expected,'new text');assert.equal(e.actual,'new text');
  assert.equal(current.text.slice(e.currentOffset,e.currentEndOffset),'new text');
  const edits=nonAmendmentEdits(instruction,previous,current,results);
  assert.ok(edits.ranges[1].some(r=>['older','altered'].includes(current.text.slice(r.start,r.end))));
 }
});
test('missing, duplicated or changed insertion text still fails and remote identical wording is not borrowed',()=>{
 for(const text of ['Before old new text text anchor.','Before old new altered anchor.','Before old anchor.','Before old anchor.\nline 2 Elsewhere new text.']){
  const current=makeDocument(['line 1 '+text+'\nline 3 Last unchanged.'],'current');
  assert.notEqual(verifyAmendments(instruction,previous,current)[0].status,'implemented');
 }
});
