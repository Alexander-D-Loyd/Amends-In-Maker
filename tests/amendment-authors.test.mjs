import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {planAmendments} from '../app/amendment-planner.mjs';

const author='Assembly Member Alex Smith',coauthors='Assembly Members Jordan Lee and Taylor Park';
const body='ASSEMBLY BILL No. 7103\nIntroduced by '+author+'\n(Coauthors: Assembly Members Jordan Lee and\nTaylor Park)\nFebruary 2, 2026\nAn act relating to reporting.\nLEGISLATIVE COUNSEL’S DIGEST\n'+author+' is mentioned in this digest.\nThe people of the State of California do enact as follows:\nline 1 '+author+' is mentioned in the body.\nline 2 Retain the remaining text.';
const make=(text=body,strikes=[])=>makeDocument([text],'bill.pdf',[strikes]);
const plan=(previous,target,scope='heading')=>planAmendments({previous,instructions:makeDocument(['Amendment 3\nIn the '+scope+', strike out “'+target+'”.'],'instructions.pdf')});

test('author removal in the heading binds only the exact original introduced-by source coordinates',()=>{
 const previous=make(),result=plan(previous,author);assert.equal(result.ready,true,JSON.stringify(result.issues));const row=result.amendments[0],start=body.indexOf(author);assert.equal(row.action,'delete');assert.deepEqual(row.sourceRanges.map(r=>({start:r.start,end:r.end,page:r.page,text:r.text})),[{start,end:start+author.length,page:1,text:author}]);assert.deepEqual(row.insertions,[]);assert.equal(row.lineInsertion,null);assert.equal(body.slice(row.sourceRanges[0].start,row.sourceRanges[0].end),author);assert.ok(row.sourceRanges[0].end<body.indexOf('An act'));
});

test('wrapped coauthor names retain every exact physical source row and exclude same names elsewhere',()=>{
 const previous=make(body+'\nline 3 '+coauthors+' are mentioned in the law.'),result=plan(previous,coauthors);assert.equal(result.ready,true,JSON.stringify(result.issues));const ranges=result.amendments[0].sourceRanges;assert.deepEqual(ranges.map(r=>r.text),['Assembly Members Jordan Lee and','Taylor Park']);assert.equal(ranges.length,2);assert.equal(ranges[0].start,body.indexOf('Assembly Members Jordan'));assert.equal(ranges[0].end,body.indexOf('\nTaylor Park'));assert.equal(ranges[1].start,body.indexOf('Taylor Park'));assert.equal(ranges[1].end,ranges[1].start+'Taylor Park'.length);assert.ok(ranges.every(r=>r.page===1&&r.end<body.indexOf('An act')));
});

test('missing or duplicate author targets in the heading are held for review without body or digest fallback',()=>{
 const onlyElsewhere=body.replace('Introduced by '+author,'Introduced by Assembly Member Other Person');let result=plan(make(onlyElsewhere),author);assert.equal(result.ready,false);assert.equal(result.amendments[0].ready,false);assert.deepEqual(result.amendments[0].sourceRanges,[]);
 const duplicate=body.replace('(Coauthors:','(Coauthor: '+author+')\n(Coauthors:');result=plan(make(duplicate),author);assert.equal(result.ready,false);assert.ok(result.issues.some(i=>/more than once/.test(i.message)));assert.deepEqual(result.amendments[0].sourceRanges,[]);
});

test('already struck author wording remains unmarked and cannot be borrowed from another bill section',()=>{
 const start=body.indexOf(author),previous=make(body,[{start,end:start+author.length}]),result=plan(previous,author);assert.equal(result.ready,false);assert.deepEqual(result.amendments[0].sourceRanges,[]);assert.ok(result.issues.some(i=>/not found/.test(i.message)));assert.deepEqual(previous.struck,[{start,end:start+author.length}]);
});

test('unqualified title-scoped author removal uses only the exact uniquely active author heading',()=>{
 for(const target of [author,coauthors]){const result=plan(make(),target,'title');assert.equal(result.ready,true,JSON.stringify(result.issues));const heading=plan(make(),target,'heading');assert.deepEqual(result.amendments[0].sourceRanges,heading.amendments[0].sourceRanges);assert.ok(result.amendments[0].sourceRanges.every(r=>r.end<body.indexOf('An act')));}
 const senate=body.replaceAll(author,'Senator Alex Smith');const result=plan(make(senate),'Senator Alex Smith','title');assert.equal(result.ready,true,JSON.stringify(result.issues));assert.equal(result.amendments[0].sourceRanges[0].start,senate.indexOf('Senator Alex Smith'));
 const plural=body.replace('Assembly Members Jordan Lee and','Senators Jordan Lee and'),wrapped=plan(make(plural),'Senators Jordan Lee and Taylor Park','title');assert.equal(wrapped.ready,true,JSON.stringify(wrapped.issues));assert.deepEqual(wrapped.amendments[0].sourceRanges.map(r=>r.text),['Senators Jordan Lee and','Taylor Park']);
});

test('ordinary title removals continue to target the An-act paragraph rather than the author heading',()=>{
 const result=plan(make(),'reporting','title');assert.equal(result.ready,true,JSON.stringify(result.issues));const range=result.amendments[0].sourceRanges[0];assert.equal(range.start,body.indexOf('reporting'));assert.equal(range.text,'reporting');assert.ok(range.start>body.indexOf('An act'));
});

test('an author-role phrase present only in the An-act title retains its actual title coordinates',()=>{
 const source=body.replace('An act relating to reporting.','An act relating to '+author+'.').replace('Introduced by '+author,'Introduced by Assembly Member Other Person'),result=plan(make(source),author,'title');assert.equal(result.ready,true,JSON.stringify(result.issues));assert.equal(result.amendments[0].sourceRanges[0].start,source.indexOf(author));assert.ok(result.amendments[0].sourceRanges[0].start>source.indexOf('An act'));
});

test('an exact author phrase in both author heading and An-act title is held as an ambiguous location',()=>{
 const source=body.replace('An act relating to reporting.','An act relating to '+author+'.'),result=plan(make(source),author,'title');assert.equal(result.ready,false);assert.deepEqual(result.amendments[0].sourceRanges,[]);assert.ok(result.issues.some(i=>/both the author heading and the An-act title/.test(i.message)));
});

test('title-author fallback rejects missing, duplicated and already struck names or nonunique author areas',()=>{
 const start=body.indexOf(author),sources=[make(body.replace('Introduced by '+author,'Introduced by Assembly Member Other Person')),make(body.replace('(Coauthors:','(Coauthor: '+author+')\n(Coauthors:')),make(body,[{start,end:start+author.length}]),make(body.replace('(Coauthors:','Introduced by Assembly Member Other Person\n(Coauthors:'))];
 for(const previous of sources){const result=plan(previous,author,'title');assert.equal(result.ready,false,JSON.stringify(result));assert.deepEqual(result.amendments[0].sourceRanges,[]);assert.ok(result.issues.length);}
});

test('title-author fallback does not interpret bare names or instructions with extra source locators',()=>{
 assert.equal(plan(make(),'Alex Smith','title').ready,false);
 for(const directive of ['On page 1, in the title, strike out “'+author+'”.','In the title, in line 1, strike out “'+author+'”.','In the title, strike out the first “'+author+'”.','In the title, strike out all occurrences of “'+author+'”.']){const result=planAmendments({previous:make(),instructions:makeDocument(['Amendment 3\n'+directive],'instructions.pdf')});assert.equal(result.ready,false,directive);assert.deepEqual(result.amendments[0].sourceRanges,[]);}
});
