'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {canonicalOutputDirectory}=require('./output-settings.cjs');
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const filenamePattern=new RegExp('^(AB|SB) ([1-9]\\d*) ('+MONTHS.join('|')+') ([1-9]|[12]\\d|3[01]) AMENDS IN\\.pdf$','u');
// A filename omits the year, so February 29 remains a valid month/day.
function validMonthDay(month,day){const date=new Date(Date.UTC(2000,month,day));return date.getUTCMonth()===month&&date.getUTCDate()===day;}
function safeName(name){if(typeof name!=='string'||name.length>180||/[<>:"/\\|?*\x00-\x1f\x7f]/u.test(name)||path.basename(name)!==name)return false;const match=filenamePattern.exec(name);return !!match&&validMonthDay(MONTHS.indexOf(match[3]),Number(match[4]));}
async function savePdfBatch({folder,files},{authorizedFolders=new Set()}={}){
 if(typeof folder!=='string'||!Array.isArray(files)||files.length<1||files.length>200)throw Error('Choose an output folder and 1 to 200 marked PDFs.');
 const canonical=await canonicalOutputDirectory(folder);if(!authorizedFolders.has(canonical))throw Error('Choose the output folder in this application before saving.');
 const names=new Set(),prepared=files.map(file=>{if(!safeName(file?.name))throw Error('Invalid output filename.');const key=file.name.toLowerCase();if(names.has(key))throw Error('Two outputs have the same filename. Resolve their dates before saving.');names.add(key);const bytes=Buffer.from(file.bytes||[]);if(bytes.length<8||bytes.length>100*1024*1024||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Output must be a generated PDF smaller than 100 MB.');return {name:file.name,bytes};});
 const saved=[],skipped=[],errors=[];
 for(const file of prepared){const target=path.join(canonical,file.name);if(path.dirname(target)!==canonical)throw Error('Output escapes the chosen directory.');let handle;try{handle=await fs.open(target,'wx');await handle.writeFile(file.bytes);await handle.sync();saved.push({name:file.name,path:target,bytes:file.bytes.length,sha256:crypto.createHash('sha256').update(file.bytes).digest('hex')});}catch(e){if(e.code==='EEXIST')skipped.push({name:file.name,reason:'A file with this name already exists; it was not overwritten.'});else errors.push({name:file.name,message:e.message});}finally{await handle?.close();}}
 return {saved,skipped,errors};
}
module.exports={safeName,savePdfBatch};
