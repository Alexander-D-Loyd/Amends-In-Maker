import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import builder from '../scripts/package-windows.cjs';
import publisher from '../scripts/publish-release.cjs';
import layout from '../scripts/windows-layout.cjs';

function temporary(t){const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'aim-grouped-test-'));t.after(()=>{assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('aim-grouped-test-'));fs.rmSync(root,{recursive:true,force:true});});return root;}
function fixture(t){
 const root=temporary(t),files=[],rows=[],content=new Map();
 const add=(name,text)=>{const bytes=Buffer.from(text);rows.push({path:name,bytes:bytes.length,sha256:builder.digest(bytes)});content.set(name,bytes);if(name!==layout.START_HERE){const file=path.join(root,'inputs',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);files.push({source:file,relative:name});}};
 add('AiM.exe','launcher');for(const name of [...builder.ELECTRON_FILES,'AiM.exe','locales/en-US.pak',...builder.ROOT_FILES.map(p=>'resources/app/'+p),'resources/app/app/index.html','resources/app/app/pdf-markup.mjs','resources/app/app/assets/aim-icon.ico'])add(layout.RUNTIME+'/'+name,name);
 for(const name of builder.DOCUMENTS)add(layout.DOCUMENTATION+'/'+name,name);add(layout.START_HERE,'Start');
 const row=p=>rows.find(r=>r.path===p),manifest={format:'amends-in-maker.windows-package',manifestVersion:2,applicationVersion:'1.0.7',electronVersion:'44.5.1',electronExecutableSHA256:row(layout.RUNTIME+'/AiM.exe').sha256,launcher:{format:'aim.windows-launcher',version:'1.0.0',target:layout.RUNTIME+'/AiM.exe',binarySHA256:row('AiM.exe').sha256,sourceSHA256:builder.digest('source'),iconSHA256:row(layout.RUNTIME+'/resources/app/app/assets/aim-icon.ico').sha256},files:rows};
 const manifestBytes=Buffer.from(JSON.stringify(manifest)),receipt={format:'amends-in-maker.verified-release',repository:publisher.REPOSITORY,version:'1.0.7',sourceCommit:'a'.repeat(40),tag:'v1.0.7',branch:'main',manifestPath:'.github/release-receipts/1.0.7.package-manifest.json',manifestSHA256:builder.digest(manifestBytes),archiveName:'Amends-In-Maker-Windows-1.0.7.zip',archiveSHA256:builder.digest('archive'),archiveBytes:7,startHere:'Start',title:'AiM 1.0.7',notes:'Verified grouped package.'};
 return {root,files,manifest,manifestBytes,receipt};
}
test('grouped packages bind launcher, chosen icon and complete Electron runtime independently',t=>{
 const f=fixture(t);assert.equal(publisher.validateReceipt(f.receipt,f.manifestBytes).manifestVersion,2);
 for(const change of [m=>m.launcher.binarySHA256='0'.repeat(64),m=>m.launcher.iconSHA256='0'.repeat(64),m=>m.electronExecutableSHA256='0'.repeat(64),m=>m.files.push({path:'ffmpeg.dll',bytes:1,sha256:builder.digest('x')}),m=>m.files=m.files.filter(r=>r.path!=='Documents/LICENSE.md')]){const m=structuredClone(f.manifest);change(m);const b=Buffer.from(JSON.stringify(m));assert.throws(()=>publisher.validateReceipt({...f.receipt,manifestSHA256:builder.digest(b)},b));}
});
test('reconstruction leaves only launcher and two folders at top level and preserves every verified byte',t=>{
 const f=fixture(t),folder=path.join(f.root,'output'),data={receipt:f.receipt,manifest:f.manifest,manifestBytes:f.manifestBytes};publisher.reconstruct(data,{files:f.files},folder);
 assert.deepEqual(fs.readdirSync(folder).sort(),['AiM.exe','Application Files','Documents']);assert.ok(fs.existsSync(path.join(folder,layout.MANIFEST)));assert.ok(!fs.existsSync(path.join(folder,'PACKAGE-MANIFEST.json')));publisher.verifyFolder(folder,f.manifest,f.manifestBytes);
 fs.writeFileSync(path.join(folder,'Application Files/ffmpeg.dll'),'changed');assert.throws(()=>publisher.verifyFolder(folder,f.manifest,f.manifestBytes),/integrity mismatch/);
});
test('grouped ZIP verifies documents manifest and rejects a changed runtime byte independently',t=>{
 const f=fixture(t),folder=path.join(f.root,'output'),python=process.env.AMENDS_IN_TEST_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');if(!fs.existsSync(python)&&!process.env.AMENDS_IN_TEST_PYTHON){t.skip('Build Python is not available');return;}
 publisher.reconstruct({receipt:f.receipt,manifest:f.manifest,manifestBytes:f.manifestBytes},{files:f.files},folder);const checked=builder.archiveVerifiedFolder(folder,path.join(f.root,'archive.zip'),{python});assert.equal(checked.archiveEntriesVerified,f.manifest.files.length+1);
 fs.writeFileSync(path.join(folder,'AiM.exe'),'wrong launcher');assert.throws(()=>builder.archiveVerifiedFolder(folder,path.join(f.root,'changed.zip'),{python}),/integrity mismatch/);
});
