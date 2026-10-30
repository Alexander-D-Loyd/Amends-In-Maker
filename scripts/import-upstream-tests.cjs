const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(process.argv[2]||path.resolve(__dirname,'../../..')),dest=path.resolve(__dirname,'../tests');
const names=fs.readdirSync(path.join(source,'tests')).filter(n=>/^(?:amendment|amendments|external-amendments|non-amendment-changes|pdf-reading-confirmation|pdf-ocr-disagreements).*\.test\.mjs$/.test(n));let copied=[];
for(const name of names){const text=fs.readFileSync(path.join(source,'tests',name),'utf8'),imports=[...text.matchAll(/(?:from\s*|import\s*\(|import\s*)['"](\.[^'"]+)['"]/g)].map(m=>m[1]);if(text.includes('../app/app.mjs')||imports.some(p=>!p.startsWith('../app/')||!fs.existsSync(path.resolve(dest,p))))continue;fs.writeFileSync(path.join(dest,'upstream-'+name),text);copied.push(name);}
console.log(JSON.stringify({upstreamRegressionFiles:copied}));
