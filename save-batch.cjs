'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function safeName(name){return typeof name==='string'&&name.length<=180&&/^Amends In (?:AB|SB) [1-9]\d* .+\.pdf$/u.test(name)&&!/[<>:"/\\|?*\x00-\x1f]/u.test(name)&&path.basename(name)===name;}
async function savePdfBatch({folder,files},{authorizedFolders=new Set()}={}){
 if(typeof folder!=='string'||!Array.isArray(files)||files.length<1||files.length>200)throw Error('Choose an output folder and 1 to 200 marked PDFs.');
 const canonical=await fs.realpath(folder);if(!authorizedFolders.has(canonical))throw Error('Choose the output folder in this application before saving.');
 const rootStat=await fs.lstat(folder);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('Choose a normal output directory.');
 const names=new Set(),prepared=files.map(file=>{if(!safeName(file?.name))throw Error('Invalid output filename.');const key=file.name.toLowerCase();if(names.has(key))throw Error('Two outputs have the same filename. Resolve their dates before saving.');names.add(key);const bytes=Buffer.from(file.bytes||[]);if(bytes.length<8||bytes.length>100*1024*1024||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Output must be a generated PDF smaller than 100 MB.');return {name:file.name,bytes};});
 const saved=[],skipped=[],errors=[];
 for(const file of prepared){const target=path.join(canonical,file.name);if(path.dirname(target)!==canonical)throw Error('Output escapes the chosen directory.');let handle;try{handle=await fs.open(target,'wx');await handle.writeFile(file.bytes);await handle.sync();saved.push({name:file.name,path:target,bytes:file.bytes.length,sha256:crypto.createHash('sha256').update(file.bytes).digest('hex')});}catch(e){if(e.code==='EEXIST')skipped.push({name:file.name,reason:'A file with this name already exists; it was not overwritten.'});else errors.push({name:file.name,message:e.message});}finally{await handle?.close();}}
 return {saved,skipped,errors};
}
module.exports={safeName,savePdfBatch};
