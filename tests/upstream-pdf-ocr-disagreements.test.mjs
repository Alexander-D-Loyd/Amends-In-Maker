import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedOcrReadingWarnings as warnings,embeddedOcrDisagreements,rereadDisagreement} from '../app/ocr-embedded-agreement.mjs';
import {readScannedInstructions} from '../app/read-scanned-instructions.mjs';
import {extractPageLayout} from '../app/pdf-strikes.mjs';

function checked(embedded,ocr,options){
 const before=JSON.stringify([embedded,ocr]),result=warnings(embedded,ocr,options),a=typeof embedded==='string'?embedded:embedded.text,b=typeof ocr==='string'?ocr:ocr.text;
 for(const w of result){
  assert.ok(Number.isInteger(w.start)&&Number.isInteger(w.end)&&w.start>=0&&w.end>w.start&&w.end<=b.length);
  assert.equal(b.slice(w.start,w.end),w.text);assert.doesNotMatch(w.text,/[\r\n]/u);
  assert.ok(w.text.length<=200);
  assert.equal(a.slice(w.sourceWitness.start,w.sourceWitness.end),w.sourceWitness.text);
  assert.equal(b.slice(w.ocrWitness.start,w.ocrWitness.end),w.ocrWitness.text);
  assert.equal(w.confidence,null);assert.match(w.disagreement,/original PDF/);assert.equal(w.suggestion,undefined);
 }
 assert.equal(JSON.stringify([embedded,ocr]),before);return result;
}
test('same-page c/e clause swaps remain located conflicts even when every token occurs elsewhere',()=>{
 const source='Section 1. (c) Alpha.\nSection 2. (e) Beta.',ocr='Section 1. (e) Alpha.\nSection 2. (c) Beta.',found=checked(source,ocr);
 assert.deepEqual(found.map(w=>[w.sourceWitness.text,w.text]),[['c','e'],['e','c']]);
 assert.deepEqual(found.map(w=>w.start),[12,34]);
 assert.deepEqual(embeddedOcrDisagreements(source,ocr),['c','e']);
});
test('OCR-only negation, omitted wording, punctuation, number and Roman substitutions stay explicit',()=>{
 const examples=[['The board shall adopt.','The board shall not adopt.','ocr-insertion','not'],['The board shall not adopt.','The board shall adopt.','ocr-omission','adopt'],['Keep: one.','Keep; one.','reading-substitution',';'],['Retain 30 records.','Retain 3 records.','reading-substitution','3'],['Article XIII B applies.','Article XII B applies.','reading-substitution','XII']];
 for(const [source,ocr,kind,text]of examples){const found=checked(source,ocr);assert.equal(found.length,1);assert.equal(found[0].kind,kind);assert.equal(found[0].text,text);}
});
test('physical line margins, wraps, typographic quotes and Unicode normalization preserve original witnesses',()=>{
 assert.deepEqual(checked('line 1 The li-\nline 2 cense is required.','The license is required.'),[]);
 assert.deepEqual(checked('“Counsel’s oﬃce” retains a cafe\u0301.','"Counsel\'s office"\nretains a café.'),[]);
 const source='line 1 The li-\nline 2 cense is required.',ocr='line 1 The li-\nline 2 ccnse is required.',found=checked(source,ocr);
 assert.equal(found.length,2);assert.equal(found[0].sourceWitness.text,'li-\nline 2 cense');assert.equal(found[0].ocrWitness.text,'li-\nline 2 ccnse');
 assert.deepEqual(found.map(w=>w.text),['li-','line 2 ccnse']);
});
test('ordered matching preserves repetitions and text order rather than a token inventory',()=>{
 for(const [source,ocr]of [['Alpha Beta Gamma.','Beta Alpha Gamma.'],['office office retains records.','office retains records.'],['Keep the report.','Keep the report report.']])assert.ok(checked(source,ocr).length);
 assert.deepEqual(checked('Alpha Beta.','Alpha Beta.'),[]);
});
test('strikeout roles cannot exchange identical word occurrences when both layers provide formatting',()=>{
 const text='old new old new.',source={text,strikes:[{start:0,end:3}]},ocr={text,strikes:[{start:8,end:11}]};
 assert.ok(checked(source,ocr).length);
 assert.deepEqual(checked(source,{text,strikes:[]}),[],'A plain glyphless text layer does not assert stroke metadata.');
 assert.deepEqual(checked(source,structuredClone(source)),[]);
});
test('missing tokens at either edge anchor to actual output without inventing text',()=>{
 for(const [source,ocr,missing]of [['not adopt','adopt','not'],['adopt not','adopt','not']]){const [w]=checked(source,ocr);assert.equal(w.kind,'ocr-omission');assert.equal(w.text,'adopt');assert.equal(w.sourceWitness.text,missing);assert.equal(w.ocrWitness.start,w.ocrWitness.end);}
});
test('radically different long readings stay bounded and keep all unresolved text visible',()=>{
 const source='start '+Array(4000).fill('source').join(' ')+' finish',ocr='start '+Array(4000).fill('pixel').join(' ')+' finish';
 const found=checked(source,ocr);assert.equal(found.length,Math.ceil(ocr.slice(6,-7).length/200));assert.equal(found[0].sourceWitness.text,source.slice(6,-7));assert.equal(found.map(w=>w.text).join(''),ocr.slice(6,-7));
});
test('long physical-line disputes remain confirmable without cutting Unicode characters',()=>{
 const source='A'.repeat(199)+'😀'+'B'.repeat(250),ocr='C'.repeat(199)+'😃'+'D'.repeat(250),found=checked(source,ocr);
 assert.equal(found.map(w=>w.text).join(''),ocr);for(const w of found)assert.doesNotMatch(w.text,/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
});
test('reread confidence or a repeated word elsewhere cannot erase conflicting original-pixel readings',()=>{
 assert.equal(rereadDisagreement('(e)','(c)'),'(e) / (c)');
 assert.equal(rereadDisagreement('cat','cat','eat / cat'),'eat / cat');
 assert.equal(rereadDisagreement('eat','cat','e / c'),'e / c; eat / cat');
 assert.equal(rereadDisagreement('Counsel’s','Counsel\'s'),undefined);
 assert.equal(rereadDisagreement('underthis','under this'),undefined);
});

// Test the real extraction/reread orchestration with deterministic recognizer
// responses. Original-file rendering and OCR quality are separately exercised
// by native regressions; a fake recognizer makes an uncommon high-score error
// and every subsequent independent pass reproducible here.
function recognized(rows,confidence=99){
 return {blocks:[{paragraphs:[{lines:rows.map((row,k)=>{
  let x=90;const y=450+k*60,words=row.split(' ').map(text=>{
   const left=x;x+=text.length*15+15;
   return {text,confidence,bbox:{x0:left,x1:x-15,y0:y-30,y1:y},symbols:[...text].map((text,i)=>({text,bbox:{x0:left+i*15,x1:left+(i+1)*15,y0:y-30,y1:y}}))};
  });
  return {text:row,words,baseline:{x0:90,x1:x,y0:y,y1:y},bbox:{x0:90,x1:x,y0:y-30,y1:y}};
 })}]}]};
}
const emptyOps={fnArray:[],argsArray:[]};
function embeddedLayout(rows){
 const data=recognized(rows),items=data.blocks[0].paragraphs[0].lines.flatMap(line=>line.words.map(w=>({str:w.text,fontName:'native',width:(w.bbox.x1-w.bbox.x0)/3,height:10,transform:[10,0,0,10,w.bbox.x0/3,400-line.baseline.y0/3],spaceBefore:true})));
 return extractPageLayout(items,emptyOps,{}, {},300);
}
async function scanned(rows,embedded,{bill=false,responses}={}){
 const previous=globalThis.document;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {getImageData(){return {data:new Uint8ClampedArray(900*1200*4).fill(255),width:900,height:1200};},putImageData(){},fillRect(){},translate(){},transform(){},drawImage(){}};}};}};
 let calls=0;const worker={setParameters:async()=>{},recognize:async()=>({data:structuredClone(responses?.[calls++]||recognized(rows))})};
 const page={rotate:0,view:[0,0,300,400],getViewport:({scale})=>({width:300*scale,height:400*scale}),render:()=>({promise:Promise.resolve()})};
 try{return await readScannedInstructions(page,worker,{},()=>{},()=>{},embedded,{bill});}finally{globalThis.document=previous;}
}
test('instruction and bill extraction retain high-score same-source c/e disagreements with exact offsets',async()=>{
 const source=['Amendment1','Insert (c) here.'],ocr=['Amendment1','Insert (e) here.'];
 for(const bill of [false,true]){
  const result=await scanned(ocr,embeddedLayout(source),{bill});
  const w=result.quality.uncertain.find(w=>w.sourceWitness?.text==='c');
  assert.ok(w);assert.equal(w.text,'e');assert.equal(result.layout.text.slice(w.start,w.end),'e');assert.equal(result.quality.lineChecks,0);assert.equal(result.quality.wordChecks,0);
 }
});
test('an invalid or unreadable embedded layer cannot become an authoritative OCR witness',async()=>{
 const rows=['Amendment1','Insert (c) here.'];
 for(const problem of [{preservedCharacters:false},{invalidGeometry:true},{unsupportedCharacters:[{start:0,end:1}]}]){
  const embedded=embeddedLayout(['Amendment1','Insert (e) here.']);Object.assign(embedded.readingQuality,problem);
  const result=await scanned(rows,embedded);assert.deepEqual(result.quality.embeddedDisagreements,[]);
 }
});
test('a higher-scoring row reread records changed wording before a later pass can certify it',async()=>{
 const whole=recognized(['Amendment1','A cat.']);whole.blocks[0].paragraphs[0].lines[1].words[1].confidence=70;
 const row=recognized(['A eat.']);
 // Single-line crop starts six pixels left and 33 pixels above baseline;
 // recognizer coordinates are relative to that crop rather than the page.
 for(const line of row.blocks[0].paragraphs[0].lines){
  const move=b=>({x0:b.x0-84,x1:b.x1-84,y0:b.y0-477,y1:b.y1-477});
  for(const word of line.words){word.bbox=move({...word.bbox,y0:480,y1:510});for(const s of word.symbols)s.bbox=move({...s.bbox,y0:480,y1:510});}
 }
 const result=await scanned([],null,{responses:[whole,row]});
 const w=result.quality.uncertain.find(w=>w.disagreement?.includes('cat. / eat.'));
 assert.ok(w);assert.equal(w.confidence,99);assert.equal(w.text,'eat.');assert.equal(result.layout.text.slice(w.start,w.end),'eat.');
});
test('a fused low-confidence OCR word over 200 characters remains completely confirmable',async()=>{
 const word='Abc'.repeat(160),response=recognized(['Amendment1',word],70);
 const result=await scanned([],null,{responses:[response,response]});
 const found=result.quality.uncertain.filter(w=>w.ocrWitness?.text===word);
 assert.equal(found.map(w=>w.text).join(''),word);assert.ok(found.length>1);
 for(const w of found){assert.ok(w.text.length<=200);assert.equal(result.layout.text.slice(w.start,w.end),w.text);assert.equal(w.confidence,70);assert.equal(w.ocrWitness.text,word);}
});
test('only structural instruction Onpage receives a virtual boundary and its original offsets stay exact',()=>{
 for(const heading of ['Amendment1','Amendment 9','Amendment1 AUG 21 2026']){
  const source=heading+'\nOnpage3, insert:\n(c) Text.',ocr=heading+'\nOn page3, insert:\n(c) Text.';
  assert.deepEqual(checked(source,ocr,{instructions:true}),[]);
  assert.ok(checked(source,ocr).length,'Bill/source-default mode does not normalize directive words.');
  const changed=ocr.replace('(c)','(e)'),found=checked(source,changed,{instructions:true});assert.equal(found.length,1);assert.equal(found[0].text,'e');assert.equal(found[0].start,changed.indexOf('(e)')+1);
 }
 for(const [source,ocr]of [['Onpage3, insert:','On page3, insert:'],['Amendment1\nOn page3, strike out “Onpage” and insert:\nword.','Amendment1\nOn page3, strike out “On page” and insert:\nword.'],['Amendment1\nOn page3, insert:\nOnpage3 is a literal.','Amendment1\nOn page3, insert:\nOn page3 is a literal.'],['Amendment1\nOnpage3, insert:\nunderthis.','Amendment1\nOn page3, insert:\nunder this.']])assert.ok(checked(source,ocr,{instructions:true}).length,source);
});
test('real instruction extraction applies Onpage equivalence without changing native text or pixel output',async()=>{
 const source=['Amendment1','Onpage3, insert:','(c) Text.'],ocr=['Amendment1','On page3, insert:','(c) Text.'],embedded=embeddedLayout(source),before=JSON.stringify(embedded);
 const result=await scanned(ocr,embedded);assert.deepEqual(result.quality.embeddedDisagreements,[]);assert.ok(result.layout.text.includes('On page3'));assert.equal(JSON.stringify(embedded),before);
});
test('a multiline quoted amendment heading cannot authorize Onpage normalization inside literal deletion or payload',()=>{
 for(const [open,close]of [['“','”'],['"','"'],['‘','’'],["'","'"]])for(const prefix of ['strike out '+open,'insert:\n'+open]){
  const source='Amendment1\nOn page1, '+prefix+'\nAmendment2\nOnpage3'+close+' and insert:\nnew',ocr=source.replace('Onpage3','On page3');
  const found=checked(source,ocr,{instructions:true});assert.ok(found.length);assert.ok(found.some(w=>w.sourceWitness.text==='Onpage'));
 }
});
