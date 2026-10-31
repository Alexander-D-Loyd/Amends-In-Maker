import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import builder from '../scripts/package-windows.cjs';
const {isAppFileAllowed,outputPaths,readOptions,digest,verifyStagedPackage,documentationPath,ZIP_SCRIPT}=builder;
function temporary(t){const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'amends-package-test-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(base));assert.ok(path.basename(dir).startsWith('amends-package-test-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function fixture(t){const root=temporary(t),folder=path.join(root,'stage'),source=path.join(root,'source');fs.mkdirSync(folder);fs.mkdirSync(source);const pairs=[['main.cjs','code'],['output-settings.cjs','folder preference code'],['README.md','documentation']],files=[],rows=[];for(const [name,text]of pairs){const input=path.join(source,name),relative='resources/app/'+name,dest=path.join(folder,...relative.split('/'));fs.writeFileSync(input,text);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);files.push({relative,source:input});rows.push({path:relative,bytes:Buffer.byteLength(text),sha256:digest(text)});}const text='Start';fs.writeFileSync(path.join(folder,'START HERE.txt'),text);rows.push({path:'START HERE.txt',bytes:5,sha256:digest(text)});const manifest={format:'amends-in-maker.windows-package',manifestVersion:1,applicationVersion:'1.0.0',electronVersion:'44.5.1',files:rows};fs.writeFileSync(path.join(folder,'PACKAGE-MANIFEST.json'),JSON.stringify(manifest));return {root,folder,source,manifest,plan:{pkg:{version:'1.0.0',devDependencies:{electron:'44.5.1'}},files,outputs:{folder}}};}

test('package allowlist admits standalone assets and excludes uploads profiles Java engines and unrelated old libraries',()=>{
 for(const p of ['app.mjs','pdf-intake.mjs','data/lcb-spelling-words.json','vendor/pdf.mjs','vendor/pdf.worker.mjs','vendor/pdf-lib.esm.js','vendor/diff/diff/array.js','vendor/diff-LICENSE','vendor/typo-ocr.mjs','vendor/typo-LICENSE','vendor/en_US/index.aff','vendor/en_US/index.dic','vendor/en_US/license','vendor/ocr/eng.traineddata','vendor/cmaps/78-EUC-H.bcmap','vendor/wasm/openjpeg.wasm'])assert.equal(isAppFileAllowed(p),true,p);
 for(const p of ['../secret.json','data/uploaded-bill.pdf','data/gpo-stylemanual-2016.pdf','vendor/source.pdf','qa-output/model.json','profiles/state.json','vendor/profile/private.json','vendor/node_modules/package.json','vendor/__pycache__/a.pyc','vendor/java/a.class','vendor/en_US/readme.md','vendor/en_US/private.txt','vendor/typo.js','vendor/diff.min.js','assets/uploaded.pdf'])assert.equal(isAppFileAllowed(p),false,p);
});
test('output-folder persistence code is a required packaged root file',()=>{assert.ok(builder.ROOT_FILES.includes('output-settings.cjs'));assert.equal(documentationPath('resources/app/output-settings.cjs'),false);});

test('the shared PDF byte reader is an explicitly required runtime asset',()=>{assert.ok(builder.REQUIRED_APP.includes('pdf-file-bytes.mjs'));assert.equal(isAppFileAllowed('pdf-file-bytes.mjs'),true);});

test('jsdiff packaging includes only the proven array-diff runtime closure and its module declaration',()=>{
 for(const file of ['vendor/diff/diff/array.js','vendor/diff/diff/base.js','vendor/diff/package.json','vendor/diff-LICENSE'])assert.equal(isAppFileAllowed(file),true,file);
 for(const file of ['vendor/diff/index.js','vendor/diff/types.js','vendor/diff/diff/word.js','vendor/diff/diff/array.d.ts','vendor/diff/diff/array.d.ts.map','vendor/diff/patch/apply.js','vendor/diff/private.json'])assert.equal(isAppFileAllowed(file),false,file);
});

test('safe output paths preserve all existing archives and staged folders',t=>{
 const root=temporary(t);for(const v of ['../1.0.0','v1.0.0','1.0.0/other','1.0.0:stream','1.0.0-beta',''])assert.throws(()=>outputPaths(root,v));const p=outputPaths(root,'1.0.0');assert.equal(p.folder,path.join(root,'dist','Amends-In-Maker-Windows-1.0.0','AiM'));fs.mkdirSync(p.dist);fs.writeFileSync(p.zip,'keep');assert.throws(()=>outputPaths(root,'1.0.0'),/already exists/);assert.equal(fs.readFileSync(p.zip,'utf8'),'keep');
});
test('build options reject ambiguous modes and missing values',()=>{
 assert.deepEqual(readOptions(['--stage-only','--python','python']),{stageOnly:true,python:'python'});for(const a of [['--stage-only','--archive-existing'],['--refresh-docs'],['--python'],['--electron-base','--check'],['--unknown']])assert.throws(()=>readOptions(a));
});
test('native-verified staged bytes cannot be changed and docs refresh never refreshes application code',t=>{
 const f=fixture(t);assert.equal(verifyStagedPackage(f.plan,f.manifest).size,4);fs.writeFileSync(path.join(f.source,'README.md'),'new documentation');assert.throws(()=>verifyStagedPackage(f.plan,f.manifest),/Source changed/);assert.equal(verifyStagedPackage(f.plan,f.manifest,{refreshDocs:true}).size,4);fs.writeFileSync(path.join(f.source,'main.cjs'),'new code');assert.throws(()=>verifyStagedPackage(f.plan,f.manifest,{refreshDocs:true}),/Source changed/);
 assert.equal(documentationPath('resources/app/README.md'),true);assert.equal(documentationPath('resources/app/LICENSE.md'),true);assert.equal(documentationPath('resources/app/main.cjs'),false);assert.equal(documentationPath('resources/app/app/README.md'),false);
});
test('unexpected staged files and changed staged documents are rejected even during docs refresh',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.folder,'uploaded.pdf'),'private');assert.throws(()=>verifyStagedPackage(f.plan,f.manifest,{refreshDocs:true}),/unexpected files/);fs.unlinkSync(path.join(f.folder,'uploaded.pdf'));fs.writeFileSync(path.join(f.folder,'resources/app/README.md'),'tampered');assert.throws(()=>verifyStagedPackage(f.plan,f.manifest,{refreshDocs:true}),/Staged file changed/);
});
test('ZIP bytes are deterministic across file timestamps and every original staged entry is verified',t=>{
 const f=fixture(t),configured=process.env.AMENDS_IN_TEST_PYTHON,bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'),python=configured||(fs.existsSync(bundled)?bundled:process.platform==='win32'?null:'python3');if(!python){t.skip('Set AMENDS_IN_TEST_PYTHON to the build Python executable.');return;}
 const first=path.join(f.root,'first.zip'),second=path.join(f.root,'second.zip'),run=dest=>{const r=spawnSync(python,['-B','-c',ZIP_SCRIPT,f.folder,dest],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);};assert.deepEqual(run(first),{archiveEntriesVerified:5,manifestFilesVerified:4});fs.utimesSync(path.join(f.folder,'START HERE.txt'),new Date(0),new Date(0));run(second);assert.deepEqual(fs.readFileSync(first),fs.readFileSync(second));fs.writeFileSync(path.join(f.folder,'START HERE.txt'),'changed');const failed=spawnSync(python,['-B','-c',ZIP_SCRIPT,f.folder,path.join(f.root,'tampered.zip')],{encoding:'utf8',windowsHide:true});assert.notEqual(failed.status,0);assert.match(failed.stderr,/integrity mismatch/);
});

test('pinned streaming compression is reproducible across timezones and independently verifies every original byte',t=>{
 const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'),python=process.env.AMENDS_IN_TEST_PYTHON||(fs.existsSync(bundled)?bundled:process.platform==='win32'?null:'python3');if(!python){t.skip('Set AMENDS_IN_TEST_PYTHON to the build Python executable.');return;}
 const f=fixture(t),relative='resources/app/repeated.js',bytes=Buffer.from('const text="Unchanged original application bytes.";\n'.repeat(10000)),file=path.join(f.folder,...relative.split('/'));
 fs.writeFileSync(file,bytes);f.manifest.files.push({path:relative,bytes:bytes.length,sha256:digest(bytes)});fs.writeFileSync(path.join(f.folder,'PACKAGE-MANIFEST.json'),JSON.stringify(f.manifest));
 const first=path.join(f.root,'compressed-first.zip'),second=path.join(f.root,'compressed-other-timezone.zip'),stored=path.join(f.root,'stored.zip');
 assert.deepEqual(builder.ZIP_COMPRESSION,{library:'fflate',version:'0.8.2',level:6,mem:8,chunkBytes:1048576});
 assert.deepEqual(builder.archiveVerifiedFolder(f.folder,first,{python}),{archiveEntriesVerified:6,manifestFilesVerified:5});
 const historical=spawnSync(python,['-B','-c',ZIP_SCRIPT,f.folder,stored],{encoding:'utf8',windowsHide:true});assert.equal(historical.status,0,historical.stderr);assert.ok(fs.statSync(first).size<fs.statSync(stored).size/4);
 for(const name of ['START HERE.txt',relative])fs.utimesSync(path.join(f.folder,...name.split('/')),new Date(0),new Date(0));
 const entry=path.resolve('scripts/package-windows.cjs'),script='const b=require(process.argv[1]);console.log(JSON.stringify(b.archiveVerifiedFolder(process.argv[2],process.argv[3],{python:process.argv[4]})))';
 const other=spawnSync(process.execPath,['-e',script,entry,f.folder,second,python],{encoding:'utf8',windowsHide:true,env:{...process.env,TZ:'Pacific/Auckland'}});assert.equal(other.status,0,other.stderr||other.error?.message);assert.deepEqual(JSON.parse(other.stdout),{archiveEntriesVerified:6,manifestFilesVerified:5});assert.deepEqual(fs.readFileSync(first),fs.readFileSync(second));
 const before=fs.readFileSync(first);assert.throws(()=>builder.writeCompressedZip(f.folder,first),/EEXIST/);assert.deepEqual(fs.readFileSync(first),before);assert.throws(()=>builder.writeCompressedZip(f.folder,path.join(f.folder,'nested.zip')),/inside its input folder/);if(process.platform==='win32')assert.throws(()=>builder.writeCompressedZip(f.folder,path.join(f.folder.toUpperCase(),'nested.zip')),/inside its input folder/);assert.equal(fs.existsSync(path.join(f.folder,'nested.zip')),false);
 fs.writeFileSync(file,'tampered');assert.throws(()=>builder.archiveVerifiedFolder(f.folder,path.join(f.root,'tampered.zip'),{python}),/integrity mismatch/);
 fs.writeFileSync(file,bytes);fs.writeFileSync(path.join(f.folder,'private.pdf'),'private');assert.throws(()=>builder.archiveVerifiedFolder(f.folder,path.join(f.root,'extra.zip'),{python}),/Staged file set changed/);
 const wrongMetadata=spawnSync(python,['-B','-c',builder.VERIFY_ZIP_SCRIPT,f.folder,stored],{encoding:'utf8',windowsHide:true});assert.notEqual(wrongMetadata.status,0);assert.match(wrongMetadata.stderr,/Staged file set changed/);
 fs.unlinkSync(path.join(f.folder,'private.pdf'));const uncompressed=spawnSync(python,['-B','-c',builder.VERIFY_ZIP_SCRIPT,f.folder,stored],{encoding:'utf8',windowsHide:true});assert.notEqual(uncompressed.status,0);assert.match(uncompressed.stderr,/Unexpected archive compression or metadata/);
});
