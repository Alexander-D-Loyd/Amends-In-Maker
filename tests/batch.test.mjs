import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {analyzeBatch,classifyEntry,outputFilename,validDate} from '../app/batch.mjs';
const make=(id,name,text,metadata={})=>({id,name,doc:makeDocument([text],name),metadata});
const text='line 1 The period is 30 days.';
const instruction='Amendment 1\nOn page 1, in line 1, strike out “30 days” and insert:\n45 days';
const bill=(id,number,date,body=text)=>make(id,number+' '+id+'.pdf',body,{billId:number,kind:'bill',date});
const amends=(id,number,date,body=instruction)=>make(id,number+' AMENDS '+id+'.pdf',body,{billId:number,kind:'amendments',date});

test('dates and output names preserve the instruction-set date and reject unsafe or nonexistent values',()=>{
 assert.equal(outputFilename('AB 1982','2026-03-25'),'Amends In AB 1982 March 25, 2026.pdf');assert.equal(outputFilename('SB879','2024-02-29'),'Amends In SB 879 February 29, 2024.pdf');
 for(const date of ['2026-02-29','2026-04-31','2026-00-01','2026-01-00','26-03-25','2026-3-25','not a date'])assert.equal(validDate(date),false,date);assert.equal(outputFilename('../AB 1','2026-03-25'),'');
});

test('filename and source headings must identify one bill unless explicitly confirmed by a human',()=>{
 const entry=make('x','AB 1982 v99.pdf','ASSEMBLY BILL No. 1983\nFebruary 1, 2026\nAn act relating to reporting.');const m=classifyEntry(entry);assert.equal(m.billId,null);assert.ok(m.issues.some(i=>i.code==='BILL_ID_CONFLICT'));
 entry.manualMetadata={billId:'AB 1982',kind:'bill',date:'2026-02-01'};const fixed=classifyEntry(entry);assert.equal(fixed.billId,'AB 1982');assert.equal(fixed.date,'2026-02-01');assert.ok(!fixed.issues.length);
});

test('administrative header word-spacing losses never hide a conflicting bill identity',()=>{
 for(const heading of ['AMENDMENTS TO ASSEMBLYBILL NO. 1983','AMENDMENTSTOASSEMBLYBILLNO.1983']){const entry=make('x','AB 1982 AMENDS.pdf',heading+'\n'+instruction),m=classifyEntry(entry);assert.equal(m.billId,null,heading);assert.ok(m.issues.some(i=>i.code==='BILL_ID_CONFLICT'),heading);}
});

test('batch grouping handles multiple bills and inverse-looking filename counters using dated content',()=>{
 const entries=[bill('v99','AB 1982','2026-03-01'),bill('v98','AB 1982','2026-03-25','line 1 The period is 45 days.'),amends('a','AB 1982','2026-03-25'),bill('s-v99','SB 879','2026-03-02'),bill('s-v98','SB 879','2026-03-26','line 1 The period is 45 days.'),amends('s-a','SB 879','2026-03-26')];
 const before=JSON.stringify(entries),groups=analyzeBatch(entries);assert.equal(groups.length,2);assert.ok(groups.every(g=>g.ready));assert.equal(groups[0].previous.id,'v99');assert.equal(groups[0].current.id,'v98');assert.equal(groups[1].previous.id,'s-v99');assert.equal(groups[0].outputFilename,'Amends In AB 1982 March 25, 2026.pdf');assert.equal(JSON.stringify(entries),before);
});

test('version counters alone never determine chronology, but unique full current verification can prove it',()=>{
 const same=make('v99','AB 1982 v99.pdf',text),same2=make('v98','AB 1982 v98.pdf',text),i=amends('a','AB 1982','2026-03-25');let [g]=analyzeBatch([same,same2,i]);assert.equal(g.ready,false);assert.ok(g.issues.some(i=>i.code==='VERSION_ASSIGNMENT_REQUIRED'));
 const changed=make('v98','AB 1982 v98.pdf','line 1 The period is 45 days.');[g]=analyzeBatch([changed,same,i]);assert.equal(g.ready,true,JSON.stringify(g.issues));assert.equal(g.previous.id,'v99');assert.equal(g.current.id,'v98');assert.equal(g.orientationProof,'all-amendments-verified');
});

test('a single undated bill requires confirmation and explicit role assignment can produce a safe output',()=>{
 const previous=make('p','AB 1982 v99.pdf',text),i=amends('a','AB 1982','2026-03-25');const [auto]=analyzeBatch([previous,i]);assert.equal(auto.ready,false);const [manual]=analyzeBatch([previous,i],{[auto.id]:{previousId:'p',currentId:''}});assert.equal(manual.ready,true,JSON.stringify(manual.issues));
});

test('different instruction dates remain separate outputs while identical filenames are blocked',()=>{
 const previous=bill('p','AB 1982','2026-03-01'),a=amends('a','AB 1982','2026-03-25'),b=amends('b','AB 1982','2026-03-26');let groups=analyzeBatch([previous,a,b]);assert.equal(groups.length,2);assert.ok(groups.every(g=>g.ready));assert.notEqual(groups[0].outputFilename,groups[1].outputFilename);
 b.metadata.date='2026-03-25';groups=analyzeBatch([previous,a,b]);assert.ok(groups.every(g=>!g.ready&&g.issues.some(i=>i.code==='OUTPUT_FILENAME_COLLISION')));
});

test('insertion payload dates cannot silently become an amendment-set date',()=>{
 const entry=make('a','AB 1982 AMENDS.pdf','Amendment 1\nOn page 1, in line 1, after “period” insert:\nThis section becomes operative on January 1, 2027.');const m=classifyEntry(entry);assert.equal(m.date,null);assert.ok(m.issues.some(i=>i.code==='AMENDMENT_DATE_REQUIRED'));
});

test('a short month/day date requires a matching complete same-bill cover date, never file modification time',()=>{
 const a=make('a','AB 1982 March 25 AMENDS.pdf',instruction);a.lastModified=Date.UTC(2040,2,25);const [missing]=analyzeBatch([bill('p','AB 1982','2026-03-01'),a]);assert.equal(missing.date,null);assert.equal(missing.ready,false);
 const [matched]=analyzeBatch([bill('p','AB 1982','2026-03-01'),bill('c','AB 1982','2026-03-25','line 1 The period is 45 days.'),a]);assert.equal(matched.date,'2026-03-25');assert.equal(matched.ready,true,JSON.stringify(matched.issues));
});

test('compatible short source/filename dates are corroborated, while conflicting month/day or two-digit year remains unresolved',()=>{
 const files=[bill('p','AB 1982','2026-03-01'),bill('c','AB 1982','2026-03-25','line 1 The period is 45 days.')];
 const a=make('a','AB 1982 March 25 AMENDS.pdf','03/25/26 04:30 PM\n'+instruction);let [g]=analyzeBatch([...files,a]);assert.equal(g.ready,true,JSON.stringify(g.issues));assert.equal(g.date,'2026-03-25');
 a.doc=makeDocument(['03/25/25 04:30 PM\n'+instruction],a.name);[g]=analyzeBatch([...files,a]);assert.equal(g.ready,false);assert.equal(g.date,null);
 const wrong=make('x','AB 1982 March 26 AMENDS.pdf','March 25, 2026\n'+instruction);assert.ok(classifyEntry(wrong).issues.some(i=>i.code==='DATE_CONFLICT'));
});

test('prior-bill edition and drafting timestamps are not misused as the adopted amendment date',()=>{
 const old=bill('p','AB 1982','2026-03-01'),current=bill('c','AB 1982','2026-03-25','line 1 The period is 45 days.'),a=make('a','AB 1982 March 25 AMENDS.pdf','03/24/26 04:30 PM\nAMENDMENTS TO ASSEMBLY BILL NO. 1982\nAS AMENDED IN ASSEMBLY MARCH 1, 2026\n'+instruction);
 const m=classifyEntry(a);assert.equal(m.date,null);assert.equal(m.sourceVersionDate,'2026-03-01');assert.deepEqual(m.dateParts,{month:3,day:25});const [g]=analyzeBatch([old,current,a]);assert.equal(g.date,'2026-03-25');assert.equal(g.ready,true,JSON.stringify(g.issues));
});

test('unknown files and replacement Digests remain visible instead of being silently omitted',()=>{
 const entries=[bill('p','AB 1982','2026-03-01'),amends('a','AB 1982','2026-03-25'),make('u','notes.pdf','Unrecognized source.'),make('d','AB 1982 Digest.pdf','Replacement digest')],groups=analyzeBatch(entries);assert.equal(groups.length,3);assert.ok(groups.find(g=>g.id==='amendments:a').ready);assert.ok(groups.some(g=>g.issues.some(i=>i.code==='DOCUMENT_KIND_REQUIRED')));assert.ok(groups.some(g=>g.issues.some(i=>i.code==='DIGEST_NOT_INSTRUCTION_SET')));
});

test('cross-bill assignments and one file used as both versions cannot certify a group',()=>{
 const entries=[bill('p','AB 1982','2026-03-01'),bill('c','AB 1982','2026-03-25'),bill('other','SB 879','2026-03-01'),amends('a','AB 1982','2026-03-25')];
 for(const assignment of [{previousId:'other',currentId:'c'},{previousId:'p',currentId:'p'}]){const group=analyzeBatch(entries,{'amendments:a':assignment}).find(g=>g.id==='amendments:a');assert.equal(group.ready,false);assert.ok(group.issues.length);}
});
