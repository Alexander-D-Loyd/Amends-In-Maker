'use strict';
const RUNTIME='Application Files',DOCUMENTATION='Documents';
const MANIFEST=DOCUMENTATION+'/PACKAGE-MANIFEST.json',START_HERE=DOCUMENTATION+'/START HERE.txt';
function groupedVersion(version){const [major,minor,patch]=version.split('.').map(Number);return major>1||major===1&&(minor>0||patch>=7);}
function manifestPath(manifest){return manifest.manifestVersion===2?MANIFEST:'PACKAGE-MANIFEST.json';}
function startHerePath(manifest){return manifest.manifestVersion===2?START_HERE:'START HERE.txt';}
module.exports={RUNTIME,DOCUMENTATION,MANIFEST,START_HERE,groupedVersion,manifestPath,startHerePath};
