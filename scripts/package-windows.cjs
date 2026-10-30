'use strict';
// Offline Windows folder/ZIP packaging. Existing outputs are never replaced.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),APP_NAME='Amends In Maker';
const ELECTRON_FILES=['chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','ffmpeg.dll','icudtl.dat','LICENSE','LICENSES.chromium.html','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','version','vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll'];
const ROOT_FILES=['package.json','main.cjs','preload.cjs','save-batch.cjs','output-settings.cjs','ocr-assets.json','upstream-provenance.json'];
const DOCUMENTS=['README.md','LICENSE.md','THIRD_PARTY_NOTICES.md'];
const REQUIRED_APP=['index.html','app.mjs','styles.css','batch.mjs','amendment-planner.mjs','amendment-issues.mjs','output-workflow.mjs','pdf-markup.mjs','pdf-intake.mjs','ocr-word-list.mjs','vendor/pdf.mjs','vendor/pdf.worker.mjs','vendor/LICENSE','vendor/pdf-lib.esm.js','vendor/pdf-lib-LICENSE.md','vendor/ocr/MANIFEST.json','vendor/diff/diff/array.js','vendor/diff-LICENSE','vendor/typo-ocr.mjs','vendor/typo-LICENSE','vendor/en_US/index.dic','vendor/en_US/index.aff','vendor/en_US/license'];
const slashes=s=>s.split(path.sep).join('/');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fileHash(file){const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
function requireFile(file){if(!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Missing or linked packaging input: '+path.basename(file));}
function requireDir(dir){if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())throw Error('Missing or linked packaging directory: '+path.basename(dir));}
function walk(dir){const result=[];for(const row of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,row.name);if(row.isSymbolicLink())throw Error('Linked packaging inputs are forbidden.');if(row.isDirectory())result.push(...walk(file));else if(row.isFile())result.push(file);else throw Error('Unsupported packaging input.');}return result;}
function isAppFileAllowed(relative){
 const parts=relative.replaceAll('\\','/').split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||/^(?:\.git|node_modules|tests?|qa-output|profiles?|userData|uploads?|attachments|__pycache__)$/i.test(p)))return false;
 if(parts.length===1)return /\.(?:mjs|cjs|js|css|html|json)$/.test(parts[0]);
 if(parts[0]==='data')return parts.length===2&&/\.(?:mjs|json)$/.test(parts[1]);
 if(parts[0]==='assets')return parts.length===2&&/\.(?:svg|png|ico)$/.test(parts[1]);
 if(parts[0]!=='vendor')return false;
 if(parts[1]==='en_US')return parts.length===3&&['index.dic','index.aff','license'].includes(parts[2]);
 if(['diff','cmaps','standard_fonts','wasm','ocr'].includes(parts[1]))return parts.length>=3&&!/\.pdf$/i.test(parts.at(-1));
 return parts.length===2&&['pdf.mjs','pdf.worker.mjs','LICENSE','pdf-lib.esm.js','pdf-lib-LICENSE.md','diff-LICENSE','typo-ocr.mjs','typo-LICENSE'].includes(parts[1]);
}
function outputPaths(root,version,existing=false,readOnly=false){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('A safe semantic package version is required.');
 const dist=path.resolve(root,'dist'),name='Amends-In-Maker-Windows-'+version,stage=path.join(dist,name),folder=path.join(stage,APP_NAME),zip=path.join(dist,name+'.zip');
 if(path.dirname(stage)!==dist)throw Error('Build output escaped dist.');
 if(fs.existsSync(dist)&&(fs.lstatSync(dist).isSymbolicLink()||path.relative(fs.realpathSync(root),fs.realpathSync(dist))!=='dist'))throw Error('Build output cannot be linked or redirected.');
 for(const dir of [stage,folder])if(fs.existsSync(dir)&&(fs.lstatSync(dir).isSymbolicLink()||path.relative(fs.realpathSync(root),fs.realpathSync(dir))!==path.relative(root,dir)))throw Error('Staged output cannot be linked or redirected.');
 if(!readOnly)for(const file of [...(existing?[]:[stage]),zip,zip+'.sha256'])if(fs.existsSync(file))throw Error('Packaging output already exists; preserve it or choose a new version.');
 return {dist,name,stage,folder,zip};
}
function readOptions(args){const o={};for(let n=0;n<args.length;n++){const key=args[n];if(key==='--stage-only')o.stageOnly=true;else if(key==='--archive-existing')o.archiveExisting=true;else if(key==='--refresh-docs')o.refreshDocs=true;else if(key==='--check')o.check=true;else if(key==='--electron-base'||key==='--python'){if(!args[n+1]||args[n+1].startsWith('--'))throw Error('Missing '+key+' value.');o[key==='--python'?'python':'electronBase']=args[++n];}else if(key==='--help')o.help=true;else throw Error('Unknown packaging option: '+key);}if(o.stageOnly&&o.archiveExisting)throw Error('Choose stage-only or archive-existing.');if(o.refreshDocs&&!o.archiveExisting)throw Error('refresh-docs requires archive-existing.');return o;}
function createPlan(options={}){
 const root=path.resolve(options.root||ROOT),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),outputs=outputPaths(root,pkg.version,!!options.archiveExisting,!!options.readOnly),base=path.resolve(root,options.electronBase||'node_modules/electron/dist');
 requireDir(base);if(pkg.productName!==APP_NAME||pkg.name!=='amends-in-maker'||!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.electron||''))throw Error('Unexpected application identity or unpinned Electron.');
 requireFile(path.join(base,'version'));if(fs.readFileSync(path.join(base,'version'),'utf8').trim()!==pkg.devDependencies.electron)throw Error('Electron version does not match package.json.');
 for(const file of [...ELECTRON_FILES,'electron.exe'])requireFile(path.join(base,file));requireDir(path.join(base,'locales'));
 for(const file of [...ROOT_FILES,...DOCUMENTS])requireFile(path.join(root,file));requireDir(path.join(root,'app'));for(const file of REQUIRED_APP)requireFile(path.join(root,'app',file));
 for(const dir of ['cmaps','standard_fonts','wasm']){const p=path.join(root,'app/vendor',dir);requireDir(p);if(!walk(p).length)throw Error('Generated PDF assets are empty: '+dir);}
 const ocr=JSON.parse(fs.readFileSync(path.join(root,'ocr-assets.json'),'utf8')),copied=fs.readFileSync(path.join(root,'app/vendor/ocr/MANIFEST.json'));
 if(!copied.equals(fs.readFileSync(path.join(root,'ocr-assets.json'))))throw Error('OCR manifest differs from its pinned source.');
 for(const [name,row]of Object.entries(ocr.files)){if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe OCR asset path.');const p=path.join(root,'app/vendor/ocr',name);requireFile(p);if(fs.statSync(p).size!==row.bytes||fileHash(p)!==row.sha256)throw Error('Pinned OCR asset mismatch: '+name);}
 const files=[],add=(source,relative)=>{requireFile(source);files.push({source,relative});};
 for(const file of ELECTRON_FILES)add(path.join(base,file),file);add(path.join(base,'electron.exe'),APP_NAME+'.exe');for(const file of walk(path.join(base,'locales')))add(file,slashes(path.relative(base,file)));
 for(const file of [...ROOT_FILES,...DOCUMENTS])add(path.join(root,file),'resources/app/'+file);
 for(const file of walk(path.join(root,'app'))){const rel=slashes(path.relative(path.join(root,'app'),file));if(isAppFileAllowed(rel))add(file,'resources/app/app/'+rel);}
 const seen=new Set();for(const f of files){const key=f.relative.toLowerCase();if(seen.has(key)||f.relative.startsWith('/')||f.relative.includes('\\')||f.relative.split('/').includes('..'))throw Error('Unsafe or duplicate package path.');seen.add(key);}files.sort((a,b)=>a.relative<b.relative?-1:a.relative>b.relative?1:0);
 return {root,pkg,outputs,base,files};
}
function manifestForPlan(plan,rows){return {format:'amends-in-maker.windows-package',manifestVersion:1,applicationVersion:plan.pkg.version,electronVersion:plan.pkg.devDependencies.electron,electronExecutableSHA256:fileHash(path.join(plan.base,'electron.exe')),scope:'Complete standalone Windows application. No uploaded bills, user profiles, QA artifacts, development dependencies, Python/Java engines or style manuals are included. Manifest excludes itself.',files:rows};}
function startHere(version){return 'Amends In Maker '+version+"\r\n\r\nOpen Amends In Maker.exe and keep this whole folder together.\r\nDrop bill PDFs and their amendment instructions on the homepage.\r\nThe bill version to mark and its amendments are the only required files.\r\nChoose an output folder once; it is remembered and remains changeable.\r\nMarked PDFs are saved automatically when the files finish loading.\r\nOutput: AB [Bill Number] Amends In [Date].pdf (SB is also supported).\r\nClick an issue to open its original amendment PDF and highlighted instruction.\r\nSuccessful marks may be saved with unresolved amendments clearly reported.\r\nYellow margin numbers and circled numbers identify amendment locations.\r\nBlue arrows mark insertions; red lines mark strikes; plain blue lines mark\r\nstrike-and-insert instructions without arrowheads. Original PDFs stay unchanged.\r\nExisting outputs are skipped. PDF reading, OCR and markup run locally.\r\nPACKAGE-MANIFEST.json records every packaged file except itself.\r\nSee resources/app/README.md and THIRD_PARTY_NOTICES.md for scope and notices.\r\n";}
function summary(plan){return {version:plan.pkg.version,electronVersion:plan.pkg.devDependencies.electron,inputFiles:plan.files.length,folder:slashes(path.relative(plan.root,plan.outputs.folder)),archive:slashes(path.relative(plan.root,plan.outputs.zip))};}
function pythonFor(options){const p=options.python||process.env.AMENDS_IN_PYTHON||'python',r=spawnSync(p,['-B','-c','import zipfile,hashlib;print("ready")'],{encoding:'utf8',windowsHide:true});if(r.error||r.status!==0||r.stdout.trim()!=='ready')throw Error('Python with zipfile is required for the build only; pass --python EXECUTABLE.');return p;}
function copyVerified(from,to,replace=false){const before=fileHash(from);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,replace?0:fs.constants.COPYFILE_EXCL);if(fileHash(from)!==before||fileHash(to)!==before)throw Error('Input changed during packaging.');return before;}
function stagePackage(options={}){
 const plan=createPlan(options),s=summary(plan);if(options.check)return {...s,checkedOnly:true};pythonFor(options);fs.mkdirSync(plan.outputs.dist,{recursive:true});fs.mkdirSync(plan.outputs.stage);fs.mkdirSync(plan.outputs.folder);
 const rows=plan.files.map(f=>({path:f.relative,bytes:fs.statSync(f.source).size,sha256:copyVerified(f.source,path.join(plan.outputs.folder,...f.relative.split('/')))}));
 const text=startHere(plan.pkg.version);fs.writeFileSync(path.join(plan.outputs.folder,'START HERE.txt'),text,{flag:'wx'});rows.push({path:'START HERE.txt',bytes:Buffer.byteLength(text),sha256:digest(text)});rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 fs.writeFileSync(path.join(plan.outputs.folder,'PACKAGE-MANIFEST.json'),JSON.stringify(manifestForPlan(plan,rows),null,2)+'\n',{flag:'wx'});return {...s,stagedOnly:true,packagedFiles:rows.length+1};
}
function documentationPath(relative){return DOCUMENTS.some(p=>relative==='resources/app/'+p);}
function verifyStagedPackage(plan,manifest,{refreshDocs=false}={}){
 if(manifest.format!=='amends-in-maker.windows-package'||manifest.manifestVersion!==1||manifest.applicationVersion!==plan.pkg.version||manifest.electronVersion!==plan.pkg.devDependencies.electron||!Array.isArray(manifest.files))throw Error('Staged manifest identity differs.');
 const wanted=new Set([...plan.files.map(f=>f.relative),'START HERE.txt']),rows=new Map();for(const r of manifest.files){if(!wanted.has(r.path)||rows.has(r.path)||!Number.isSafeInteger(r.bytes)||r.bytes<0||!/^[a-f0-9]{64}$/.test(r.sha256||''))throw Error('Unexpected staged manifest entry.');rows.set(r.path,r);}if(rows.size!==wanted.size)throw Error('Source file set changed after staging; restage and repeat native verification.');
 const actual=walk(plan.outputs.folder).map(f=>slashes(path.relative(plan.outputs.folder,f)));if(actual.length!==rows.size+1||actual.some(p=>p!=='PACKAGE-MANIFEST.json'&&!rows.has(p)))throw Error('Staged folder has unexpected files.');
 for(const r of rows.values()){const f=path.join(plan.outputs.folder,...r.path.split('/'));if(fs.statSync(f).size!==r.bytes||fileHash(f)!==r.sha256)throw Error('Staged file changed after native verification: '+r.path);}
 for(const f of plan.files){const row=rows.get(f.relative);if(!(refreshDocs&&documentationPath(f.relative))&&(fs.statSync(f.source).size!==row.bytes||fileHash(f.source)!==row.sha256))throw Error('Source changed after staging: '+f.relative);}
 return rows;
}
// STORED avoids dependence on the local/CI zlib build while retaining an exact
// portable ZIP with fixed metadata. Every entry is read back and SHA-verified.
const ZIP_SCRIPT=String.raw`
import sys,json,hashlib,zipfile,shutil
from pathlib import Path
folder=Path(sys.argv[1]).resolve();archive=Path(sys.argv[2]).resolve()
manifest=json.loads((folder/'PACKAGE-MANIFEST.json').read_text(encoding='utf-8'))
expected={r['path']:r for r in manifest['files']}
files=sorted((p for p in folder.rglob('*') if p.is_file()),key=lambda p:p.relative_to(folder).as_posix())
if set(p.relative_to(folder).as_posix() for p in files)!=set(expected)|{'PACKAGE-MANIFEST.json'}:raise ValueError('Staged file set changed')
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
 for p in files:
  relative=p.relative_to(folder).as_posix();info=zipfile.ZipInfo('Amends In Maker/'+relative,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED;info.create_system=3;info.external_attr=0o100644<<16
  with p.open('rb') as source,z.open(info,'w',force_zip64=True) as target:shutil.copyfileobj(source,target,1024*1024)
with zipfile.ZipFile(archive) as z:
 names=z.namelist()
 if len(names)!=len(files) or len(set(n.lower() for n in names))!=len(names):raise ValueError('Unexpected duplicate archive entries')
 for entry in z.infolist():
  prefix='Amends In Maker/'
  if not entry.filename.startswith(prefix):raise ValueError('Unsafe archive root')
  relative=entry.filename[len(prefix):]
  if relative.startswith('/') or '..' in relative.split('/'):raise ValueError('Unsafe archive entry')
  h=hashlib.sha256()
  with z.open(entry) as f:
   while True:
    chunk=f.read(1024*1024)
    if not chunk:break
    h.update(chunk)
  if relative=='PACKAGE-MANIFEST.json':
   if h.hexdigest()!=hashlib.sha256((folder/relative).read_bytes()).hexdigest():raise ValueError('Archive manifest differs')
  elif entry.file_size!=expected[relative]['bytes'] or h.hexdigest()!=expected[relative]['sha256']:raise ValueError('Archive file integrity mismatch: '+relative)
print(json.dumps({'archiveEntriesVerified':len(files),'manifestFilesVerified':len(expected)}))
`;
function archivePackage(options={}){
 const plan=createPlan({...options,archiveExisting:true});requireDir(plan.outputs.folder);const mf=path.join(plan.outputs.folder,'PACKAGE-MANIFEST.json');requireFile(mf);let manifest=JSON.parse(fs.readFileSync(mf,'utf8'));const rows=verifyStagedPackage(plan,manifest,options);if(options.check)return {...summary(plan),checkedOnly:true,stagedFilesVerified:rows.size};
 if(options.refreshDocs){for(const f of plan.files.filter(f=>documentationPath(f.relative))){const sha256=copyVerified(f.source,path.join(plan.outputs.folder,...f.relative.split('/')),true);rows.set(f.relative,{path:f.relative,bytes:fs.statSync(f.source).size,sha256});}manifest=manifestForPlan(plan,[...rows.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0));fs.writeFileSync(mf,JSON.stringify(manifest,null,2)+'\n');verifyStagedPackage(plan,manifest);}
 const python=pythonFor(options),z=spawnSync(python,['-B','-c',ZIP_SCRIPT,plan.outputs.folder,plan.outputs.zip],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});if(z.error||z.status!==0)throw Error('Archive failed; staged folder retained: '+(z.error?.message||z.stderr.trim()));const archiveSHA256=fileHash(plan.outputs.zip);fs.writeFileSync(plan.outputs.zip+'.sha256',archiveSHA256+'  '+path.basename(plan.outputs.zip)+'\n',{flag:'wx'});
 return {...summary(plan),packagedFiles:rows.size+1,archiveBytes:fs.statSync(plan.outputs.zip).size,archiveSHA256,...JSON.parse(z.stdout.trim())};
}
function buildPackage(options={}){if(options.archiveExisting)return archivePackage(options);const staged=stagePackage(options);return options.check||options.stageOnly?staged:archivePackage(options);}
if(require.main===module){try{const o=readOptions(process.argv.slice(2));if(o.help)console.log('node scripts/package-windows.cjs [--check] [--stage-only | --archive-existing [--refresh-docs]] [--electron-base PATH] [--python EXECUTABLE]');else console.log(JSON.stringify(buildPackage(o),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={ROOT,APP_NAME,ELECTRON_FILES,ROOT_FILES,DOCUMENTS,REQUIRED_APP,digest,fileHash,walk,isAppFileAllowed,outputPaths,readOptions,createPlan,manifestForPlan,startHere,documentationPath,verifyStagedPackage,stagePackage,archivePackage,buildPackage,ZIP_SCRIPT};
