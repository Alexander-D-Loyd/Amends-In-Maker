'use strict';
// The tested launcher is committed with its source and hashes. Release CI copies
// the exact binary rather than substituting a different compiler's output.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'launcher/AiM.cs'),icon=path.join(root,'app/assets/aim-icon.ico'),binary=path.join(root,'launcher/AiM.exe');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const compiler=process.env.AIM_CSC||path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
if(process.platform!=='win32')throw Error('Rebuild the launcher on Windows, then verify and commit its exact bytes.');
const result=spawnSync(compiler,['/nologo','/target:winexe','/platform:x64','/optimize+','/debug-','/win32icon:'+icon,'/out:'+binary,source],{encoding:'utf8',windowsHide:true});
if(result.error||result.status!==0)throw Error('Launcher build failed: '+(result.error?.message||result.stderr||result.stdout));
const manifest={format:'aim.windows-launcher',version:'1.0.0',target:'Application Files/AiM.exe',binarySHA256:hash(binary),sourceSHA256:hash(source),iconSHA256:hash(icon)};
fs.writeFileSync(path.join(root,'launcher/manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
