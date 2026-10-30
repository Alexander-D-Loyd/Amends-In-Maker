import test from 'node:test';
import assert from 'node:assert/strict';
import {readPdfBytes,pdfFileBytes} from '../app/pdf-file-bytes.mjs';

function fixture(){const original=Uint8Array.from([37,80,68,70,45,49,46,55,10]),file={name:'AB 1.pdf',size:original.length,calls:0,async arrayBuffer(){this.calls++;return original.slice().buffer;}};return {original,file};}

test('validated PDF bytes are read once and reused for the same exact file without changing source data',async()=>{
 const {original,file}=fixture(),before=original.slice(),bytes=await readPdfBytes(file);assert.equal(file.calls,1);assert.deepEqual(bytes,before);assert.equal(await pdfFileBytes(file,{preparedBytes:bytes}),bytes);assert.equal(file.calls,1);assert.deepEqual(original,before);assert.deepEqual(bytes,before);
 const plain=fixture();assert.deepEqual(await pdfFileBytes(plain.file),plain.original);assert.equal(plain.file.calls,1);
});

test('prepared bytes cannot be substituted, rebound to another file or reused after file identity changes',async()=>{
 const {file}=fixture(),bytes=await readPdfBytes(file);for(const candidate of [bytes.slice(),bytes.buffer,{},null])await assert.rejects(pdfFileBytes(file,{preparedBytes:candidate}),/do not belong/);
 await assert.rejects(pdfFileBytes(fixture().file,{preparedBytes:bytes}),/do not belong/);file.name='SB 2.pdf';await assert.rejects(pdfFileBytes(file,{preparedBytes:bytes}),/unchanged file/);assert.equal(file.calls,1);
});

test('both declared and actual source sizes enforce the 50 MB cap before PDF parsing',async()=>{
 const {file}=fixture();file.size=50*1024*1024+1;await assert.rejects(readPdfBytes(file),/50 MB/);assert.equal(file.calls,0);
 const oversized={name:'too-large.pdf',size:1,async arrayBuffer(){return new ArrayBuffer(50*1024*1024+1);}};await assert.rejects(readPdfBytes(oversized),/50 MB/);
 for(const size of [-1,NaN,Infinity,1.5])await assert.rejects(readPdfBytes({...fixture().file,size}),/file size is invalid/);
});

test('cancelled reads stop before I/O or immediately after pending file bytes arrive',async()=>{
 const {file}=fixture(),before=new AbortController();before.abort();await assert.rejects(readPdfBytes(file,{signal:before.signal}),{name:'AbortError'});assert.equal(file.calls,0);
 const during=new AbortController(),pending={name:'pending.pdf',size:8,async arrayBuffer(){during.abort();return new ArrayBuffer(8);}};await assert.rejects(readPdfBytes(pending,{signal:during.signal}),{name:'AbortError'});
 const bytes=await readPdfBytes(file);await assert.rejects(pdfFileBytes(file,{preparedBytes:bytes,signal:before.signal}),{name:'AbortError'});assert.equal(file.calls,1);
});

test('invalid file input and unreadable byte results are rejected before preparing a source',async()=>{
 for(const file of [null,{}, {...fixture().file,name:'not-a-pdf.txt'}])await assert.rejects(readPdfBytes(file),/Choose a PDF file/);
 await assert.rejects(readPdfBytes({...fixture().file,async arrayBuffer(){return new Uint8Array(8);}}),/could not be read as bytes/);
 const {file}=fixture(),bytes=await readPdfBytes(file);structuredClone(bytes.buffer,{transfer:[bytes.buffer]});await assert.rejects(pdfFileBytes(file,{preparedBytes:bytes}),/unchanged file/);
});
