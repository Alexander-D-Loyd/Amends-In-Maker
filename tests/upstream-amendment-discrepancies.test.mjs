import test from 'node:test';import assert from 'node:assert/strict';
import {amendmentDiscrepancies} from '../app/amendment-discrepancies.mjs';
import {sequenceDiff} from '../app/sequence-diff.mjs';
const tokens=values=>values.map((value,i)=>({value,start:i*10,end:i*10+value.length}));
test('Replacement, deletion and insertion retain separate exact navigation positions',()=>{
 const previous=['The','old','rule','shall','retain','text','and','apply','.'],actual=['The','new','rule','shall','text','and','also','apply','.'];
 const issues=amendmentDiscrepancies(sequenceDiff(previous,actual),tokens(actual),0);
 assert.deepEqual(issues.map(i=>[i.expectedText,i.actualText]),[['old','new'],['retain',''],['','also']]);
 assert.deepEqual(issues.map(i=>[i.currentStart,i.currentEnd]),[[10,13],[40,40],[60,64]]);
 assert.deepEqual(issues.map(i=>[i.expectedStart,i.expectedEnd]),[[1,2],[4,5],[7,7]]);
});
test('End deletion uses the end of the actual last token; unchanged text has no issues',()=>{
 const current=tokens(['prefix','A']);
 assert.deepEqual(amendmentDiscrepancies(sequenceDiff(['A','B'],['A']),current,1).map(i=>[i.currentStart,i.currentEnd]),[[11,11]]);
 assert.deepEqual(amendmentDiscrepancies(sequenceDiff(['A'],['A']),current,1),[]);
});
