import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {amendmentPlan,verifyAmendments} from '../app/amendments.mjs';

const make=text=>makeDocument([text],'fixture.pdf');
function compare(text,previous,external={}){
 const full=amendmentPlan(text,previous,previous,external),lean=amendmentPlan(text,previous,previous,external,null,{buildExpected:false});
 assert.deepEqual(lean.compiled,full.compiled);assert.equal(lean.previous,full.previous);assert.equal(lean.current,full.current);assert.deepEqual(lean.patches,full.patches.map(({expectedStart,expectedEnd,...patch})=>patch));assert.deepEqual(lean.expectedTokens,[]);assert.deepEqual(lean.origins,[]);return {full,lean};
}

test('mark-only plans preserve every original patch across the four requested amendment forms',()=>{
 const previous=make('line 1 The report, upon request, is available.\nline 2 Before the insertion.\nline 3 After the insertion.\nline 4 The obsolete wording applies.\nline 5 The period is 30 days.'),text='Amendment 1\nOn page 1, in line 1, after the first comma insert:\nin writing,\nAmendment 2\nOn page 1, between lines 2 and 3, insert:\nAdditional text.\nAmendment 3\nOn page 1, in line 4, strike out “obsolete wording”.\nAmendment 4\nOn page 1, in line 5, strike out “30 days” and insert:\n45 days';
 const {full}=compare(text,previous);assert.equal(full.compiled.length,4);assert.ok(full.compiled.every(r=>!r.error));assert.ok(full.expectedTokens.length>0);assert.equal(full.origins.length,full.expectedTokens.length);
});

test('mark-only plans retain author, edge, overlap and ambiguous-target decisions',()=>{
 const previous=make('Introduced by Assembly Member Alex Smith\nFebruary 2, 2026\nAn act relating to reports.\nLEGISLATIVE COUNSEL’S DIGEST\nThe people of the State of California do enact as follows:\nline 1 The word and word apply.\nline 2 Final legislative text.');
 for(const text of ['Amendment 1\nIn the title, strike out “Assembly Member Alex Smith”.','Amendment 1\nOn page 1, above line 1, insert:\nAdditional beginning.','Amendment 1\nOn page 1, below line 2, insert:\nAdditional ending.','Amendment 1\nOn page 1, in line 1, after “word” insert:\nAmbiguous.','Amendment 1\nOn page 1, in line 1, strike out “word and word”.\nAmendment 2\nOn page 1, in line 1, strike out “and”.'])compare(text,previous);
});

test('mark-only plans preserve external-body resolution and missing-reference review errors',()=>{
 const previous=make('line 1 Existing text.'),text='Amendment 1\nOn page 1, before line 1, insert:\n[Insert contents of SB 879, as introduced on January 9, 2026]',external=make('SENATE BILL No. 879\nIntroduced by Senator Example\nAn act relating to funding.\nLEGISLATIVE COUNSEL’S DIGEST\nExisting law.\nThe people of the State of California do enact as follows:\nline 1 SECTION 1. New legislative body.');
 const missing=compare(text,previous);assert.ok(missing.lean.compiled[0].error);const resolved=compare(text,previous,{'SB 879':external});assert.equal(resolved.lean.compiled[0].error,'');assert.ok(resolved.lean.compiled[0].insertText.includes('New legislative body'));
});

test('the standalone path omits full-bill expected-token and origin allocations while verification defaults remain intact',()=>{
 const previous=make(Array.from({length:1600},(_,i)=>'line '+(i+1)+' Retained legislative wording.').join('\n')),text='Amendment 1\nOn page 1, below line 1, insert:\nNew wording.';const {full,lean}=compare(text,previous);assert.ok(full.origins.length>6000);assert.equal(lean.origins.length,0);assert.equal(lean.expectedTokens.length,0);
 const old=make('line 1 The period is 30 days.'),current=make('line 1 The period is 45 days.'),replacement='Amendment 1\nOn page 1, in line 1, strike out “30 days” and insert:\n45 days';assert.equal(verifyAmendments(replacement,old,current)[0].status,'implemented');
});
