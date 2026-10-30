'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const SETTINGS_VERSION=1;
const unavailable=()=>Error('The output folder is no longer available. Change output folder and try again.');

async function canonicalOutputDirectory(folder){
 if(typeof folder!=='string'||!folder||!path.isAbsolute(folder)||/[\x00-\x1f]/u.test(folder))throw Error('Choose a normal output folder.');
 try{
  const stat=await fs.lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw unavailable();
  const canonical=await fs.realpath(folder),real=await fs.stat(canonical);if(!real.isDirectory())throw unavailable();return canonical;
 }catch(error){if(error.message?.includes('Change output folder'))throw error;throw unavailable();}
}

async function loadOutputFolder(settingsFile){
 try{
  const stat=await fs.lstat(settingsFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)return null;
  const data=JSON.parse(await fs.readFile(settingsFile,'utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data)||data.schemaVersion!==SETTINGS_VERSION||data.selection!=='folder-picker'||Object.keys(data).some(k=>!['schemaVersion','selection','folder'].includes(k)))return null;
  return await canonicalOutputDirectory(data.folder);
 }catch{return null;}
}

async function rememberOutputFolder(settingsFile,folder){
 const canonical=await canonicalOutputDirectory(folder);
 if(typeof settingsFile!=='string'||!path.isAbsolute(settingsFile))throw Error('The folder preference location is unavailable.');
 const directory=path.dirname(settingsFile),temporary=path.join(directory,'.output-settings-'+crypto.randomUUID()+'.tmp');let handle;
 try{
  await fs.mkdir(directory,{recursive:true});
  try{const old=await fs.lstat(settingsFile);if(!old.isFile()||old.isSymbolicLink())throw Error('The saved output-folder preference is not a normal file.');}catch(error){if(error.code!=='ENOENT')throw error;}
  handle=await fs.open(temporary,'wx',0o600);
  await handle.writeFile(JSON.stringify({schemaVersion:SETTINGS_VERSION,selection:'folder-picker',folder:canonical},null,2)+'\n','utf8');await handle.sync();await handle.close();handle=null;
  await fs.rename(temporary,settingsFile);return canonical;
 }catch(error){throw Error('The output folder could not be remembered. Check access to the application settings folder.',{cause:error});}
 finally{await handle?.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});}
}

function createOutputFolderStore({settingsFile,authorizedFolders=new Set()}={}){
 let tail=Promise.resolve();
 const file=()=>typeof settingsFile==='function'?settingsFile():settingsFile;
 const serialize=operation=>{const result=tail.then(operation);tail=result.catch(()=>{});return result;};
 const authorize=folder=>{authorizedFolders.clear();if(folder)authorizedFolders.add(folder);return folder;};
 return Object.freeze({
  get:()=>serialize(async()=>authorize(await loadOutputFolder(file()))),
  remember:folder=>serialize(async()=>authorize(await rememberOutputFolder(file(),folder))),
 });
}
module.exports={SETTINGS_VERSION,canonicalOutputDirectory,loadOutputFolder,rememberOutputFolder,createOutputFolderStore};
