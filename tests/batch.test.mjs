import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from '../app/core.mjs';
import {analyzeBatch,classifyEntry,outputFilename,validDate} from '../app/batch.mjs';
const make=(id,name,text,metadata={})=>({id,name,doc:makeDocument([text],name),metadata});
const text='line 1 The period is 30 days.';
const instruction='Amendment 1\nOn page 1, in line 1, strike out “30 days” and insert:\n45 days';
const bill=(id,number,date,body=text)=>make(id,number+' '+id+'.pdf',body,{billId:number,kind:'bill',date});
const amends=(id,number,date,body=instruction)=>make(id,number+' AMENDS '+id+'.pdf',body,{billId:number,kind:'amendments',date});

test('output names omit the year while source dates remain complete and valid',()=>{
 assert.equal(outputFilename('AB 1982','2026-03-25'),'AB 1982 March 25 Amends In.pdf');assert.equal(outputFilename('SB879','2024-02-29'),'SB 879 February 29 Amends In.pdf');
 for(const date of ['2026-02-29','2026-04-31','2026-00-01','2026-01-00','26-03-25','2026-3-25','not a date']){assert.equal(validDate(date),false,date);assert.equal(outputFilename('AB 1982',date),'',date);}assert.equal(outputFilename('../AB 1','2026-03-25'),'');
});

test('filename and source headings must identify one bill unless explicitly confirmed by a human',()=>{
 const entry=make('x','AB 1982 v99.pdf','ASSEMBLY BILL No. 1983\nFebruary 1, 2026\nAn act relating to reporting.');const m=classifyEntry(entry);assert.equal(m.billId,'AB 1982');assert.ok(m.issues.some(i=>i.code==='BILL_ID_CONFLICT'));const group=analyzeBatch([entry,amends('a','AB 1982','2026-03-25')])[0];assert.equal(group.ready,false);assert.ok(group.issues.some(i=>i.code==='BILL_ID_CONFLICT'));
 entry.manualMetadata={billId:'AB 1982',kind:'bill',date:'2026-02-01'};const fixed=classifyEntry(entry);assert.equal(fixed.billId,'AB 1982');assert.equal(fixed.date,'2026-02-01');assert.ok(!fixed.issues.length);
});

test('administrative header word-spacing losses never hide a conflicting bill identity',()=>{
 for(const heading of ['AMENDMENTS TO ASSEMBLYBILL NO. 1983','AMENDMENTSTOASSEMBLYBILLNO.1983']){const entry=make('x','AB 1982 AMENDS.pdf',heading+'\n'+instruction),m=classifyEntry(entry);assert.equal(m.billId,'AB 1982',heading);assert.ok(m.issues.some(i=>i.code==='BILL_ID_CONFLICT'),heading);}
});

test('batch grouping handles multiple bills and inverse-looking filename counters using dated content',()=>{
 const entries=[bill('v99','AB 1982','2026-03-01'),bill('v98','AB 1982','2026-03-25','line 1 The period is 45 days.'),amends('a','AB 1982','2026-03-25'),bill('s-v99','SB 879','2026-03-02'),bill('s-v98','SB 879','2026-03-26','line 1 The period is 45 days.'),amends('s-a','SB 879','2026-03-26')];
 const before=JSON.stringify(entries),groups=analyzeBatch(entries);assert.equal(groups.length,2);assert.ok(groups.every(g=>g.ready));assert.equal(groups[0].previous.id,'v99');assert.ok(groups.every(g=>g.current===null&&!Object.hasOwn(g.assignment,'currentId')));assert.equal(groups[1].previous.id,'s-v99');assert.equal(groups[0].outputFilename,'AB 1982 March 25 Amends In.pdf');assert.equal(JSON.stringify(entries),before);
});

test('version counters or changed wording never select a bill by cross-checking another version',()=>{
 const same=make('v99','AB 1982 v99.pdf',text),same2=make('v98','AB 1982 v98.pdf',text),i=amends('a','AB 1982','2026-03-25');let [g]=analyzeBatch([same,same2,i]);assert.equal(g.ready,false);assert.ok(g.issues.some(i=>i.code==='VERSION_ASSIGNMENT_REQUIRED'));
 const changed=make('v98','AB 1982 v98.pdf','line 1 The period is 45 days.');[g]=analyzeBatch([changed,same,i]);assert.equal(g.ready,false);assert.equal(g.previous,null);assert.ok(g.issues.some(i=>i.code==='VERSION_ASSIGNMENT_REQUIRED'));[g]=analyzeBatch([changed,same,i],{'amendments:a':{previousId:'v99'}});assert.equal(g.ready,true,JSON.stringify(g.issues));assert.equal(g.previous.id,'v99');assert.equal(g.current,null);
});

test('one undated bill plus instructions automatically identifies the bill to mark from filenames',()=>{
 for(const name of ['AB 1982 v99.pdf','AB_1982.pdf','AB1982 Bill.pdf']){const previous=make('p',name,text),i=amends('a','AB 1982','2026-03-25');const [auto]=analyzeBatch([previous,i]);assert.equal(auto.ready,true,JSON.stringify(auto.issues));assert.equal(auto.previous.id,'p');assert.equal(auto.current,null);}
});

test('different instruction dates remain separate outputs while identical filenames are blocked',()=>{
 const previous=bill('p','AB 1982','2026-03-01'),a=amends('a','AB 1982','2026-03-25'),b=amends('b','AB 1982','2026-03-26');let groups=analyzeBatch([previous,a,b]);assert.equal(groups.length,2);assert.ok(groups.every(g=>g.ready));assert.notEqual(groups[0].outputFilename,groups[1].outputFilename);
 b.metadata.date='2026-03-25';groups=analyzeBatch([previous,a,b]);assert.ok(groups.every(g=>!g.ready&&g.issues.some(i=>i.code==='OUTPUT_FILENAME_COLLISION')));
});

test('same bill month and day in different years explicitly blocks colliding filenames without losing source dates',()=>{
 const older=bill('p25','AB 1982','2025-03-01'),newer=bill('p26','AB 1982','2026-03-01'),a=amends('a25','AB 1982','2025-03-25'),b=amends('a26','AB 1982','2026-03-25');
 for(const [previous,instructions]of [[older,a],[newer,b]]){const [group]=analyzeBatch([previous,instructions]);assert.equal(group.ready,true,JSON.stringify(group.issues));assert.equal(group.previous.id,previous.id);}
 const groups=analyzeBatch([older,newer,a,b],{'amendments:a25':{previousId:'p25'},'amendments:a26':{previousId:'p26'}});
 assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.date),['2025-03-25','2026-03-25']);assert.deepEqual(groups.map(g=>g.dateLabel),['March 25, 2025','March 25, 2026']);assert.deepEqual(groups.map(g=>g.previous.id),['p25','p26']);
 for(const group of groups){assert.equal(group.outputFilename,'AB 1982 March 25 Amends In.pdf');assert.equal(group.ready,false);assert.equal(group.status,'needs-review');assert.deepEqual(group.issues.map(i=>i.code),['OUTPUT_FILENAME_COLLISION']);}
});

test('insertion payload dates cannot silently become an amendment-set date',()=>{
 const entry=make('a','AB 1982 AMENDS.pdf','Amendment 1\nOn page 1, in line 1, after “period” insert:\nThis section becomes operative on January 1, 2027.');const m=classifyEntry(entry);assert.equal(m.date,null);assert.ok(m.issues.some(i=>i.code==='AMENDMENT_DATE_REQUIRED'));
});

test('a short filename date uses a unique source year, never file modification time',()=>{
 const a=make('a','AB 1982 March 25 AMENDS.pdf',instruction);a.lastModified=Date.UTC(2040,2,25);const [missing]=analyzeBatch([make('p','AB 1982.pdf',text),a]);assert.equal(missing.date,null);assert.equal(missing.ready,false);const [sourceYear]=analyzeBatch([bill('p','AB 1982','2026-03-01'),a]);assert.equal(sourceYear.date,'2026-03-25');assert.equal(sourceYear.ready,true,JSON.stringify(sourceYear.issues));
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

test('cross-bill assignments are rejected and unused currentId inputs have no effect',()=>{
 const entries=[bill('p','AB 1982','2026-03-01'),bill('c','AB 1982','2026-03-25'),bill('other','SB 879','2026-03-01'),amends('a','AB 1982','2026-03-25')];
 const invalid=analyzeBatch(entries,{'amendments:a':{previousId:'other'}}).find(g=>g.id==='amendments:a');assert.equal(invalid.ready,false);assert.ok(invalid.issues.some(i=>i.code==='PREVIOUS_REQUIRED'));const valid=analyzeBatch(entries,{'amendments:a':{previousId:'p',currentId:'other'}}).find(g=>g.id==='amendments:a');assert.equal(valid.ready,true,JSON.stringify(valid.issues));assert.equal(valid.current,null);
});

test('a prior-edition instruction heading or explicit previous filename resolves multiple bills without a current file',()=>{
 const prior=bill('p','AB 1982','2026-03-01'),older=bill('o','AB 1982','2026-02-01'),undated=make('u','AB 1982 v98.pdf','line 1 The period is 45 days.'),a=amends('a','AB 1982','2026-03-25','AMENDMENTS TO ASSEMBLY BILL NO. 1982\nAS AMENDED IN ASSEMBLY MARCH 1, 2026\n'+instruction);let [g]=analyzeBatch([undated,prior,older,a]);assert.equal(g.previous.id,'p');assert.equal(g.ready,true,JSON.stringify(g.issues));
 const named=make('p','AB 1982 previous.pdf',text),other=make('u','AB 1982 v98.pdf','line 1 The period is 45 days.');[g]=analyzeBatch([other,named,amends('a','AB 1982','2026-03-25')]);assert.equal(g.previous.id,'p');assert.equal(g.ready,true,JSON.stringify(g.issues));
});

test('explicit date and role conflicts remain visible instead of silently picking another bill',()=>{
 for(const previous of [bill('p','AB 1982','2026-03-26'),make('p','AB 1982 current.pdf',text)]){const [g]=analyzeBatch([previous,amends('a','AB 1982','2026-03-25')]);assert.equal(g.ready,false);assert.ok(g.issues.some(i=>/PREVIOUS_.*CONFLICT/.test(i.code)));}
 const a=amends('a','AB 1982','2026-03-25','AMENDMENTS TO ASSEMBLY BILL NO. 1982\nAS AMENDED IN ASSEMBLY MARCH 1, 2026\n'+instruction),[g]=analyzeBatch([bill('p','AB 1982','2026-03-02'),a]);assert.equal(g.ready,false);assert.ok(g.issues.some(i=>i.code==='PREVIOUS_EDITION_CONFLICT'));
 const bad=make('a','AB 1982 AMENDS.pdf','ASSEMBLY BILL NO. 1982\nMarch 25, 2026\nAn act relating to reporting.');assert.ok(classifyEntry(bad).issues.some(i=>i.code==='DOCUMENT_KIND_CONFLICT'));
});

test('a source prior-version year completes a filename month/day even when its drafting day differs',()=>{
 const a=make('a','AB 1982 March 25 AMENDS.pdf','03/18/26 04:30 PM\nAMENDMENTS TO ASSEMBLY BILL NO. 1982\nAS AMENDED IN ASSEMBLY MARCH 1, 2026\n'+instruction),[g]=analyzeBatch([make('p','AB 1982 v99.pdf',text),a]);assert.equal(g.date,'2026-03-25');assert.equal(g.ready,true,JSON.stringify(g.issues));
 const ambiguous=analyzeBatch([bill('p','AB 1982','2025-03-01'),bill('o','AB 1982','2026-03-01'),make('a','AB 1982 March 25 AMENDS.pdf',instruction)])[0];assert.equal(ambiguous.date,null);assert.ok(ambiguous.issues.some(i=>i.code==='AMENDMENT_DATE_REQUIRED'));
});
