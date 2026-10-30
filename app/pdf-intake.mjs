import * as pdfjs from './vendor/pdf.mjs';
import {makeDocument} from './core.mjs';
import {extractPageLayout,hasVisiblePdfContent} from './pdf-strikes.mjs';
import {pdfFontStyle} from './pdf-font-style.mjs';
import {printedAmendmentItems} from './amendment-markings.mjs';
import {isProposedAmendmentsPage,instructionsEnd} from './amendments.mjs';
import {createOfflineOcr} from './offline-ocr.mjs';
import {readScannedInstructions} from './read-scanned-instructions.mjs';
import {pageReadingProblems,largeRasterCoverage} from './pdf-page-quality.mjs';
import {labelScannedBillMargins} from './bill-ocr-policy.mjs';
import {markJrBoxGeometry,jrBoxPageNotices} from './amendment-jr-box.mjs';
import {isOcrStyle,repairOcrSpacing} from './ocr-text.mjs';
import {loadOcrWordList} from './ocr-word-list.mjs';
import {correctPdfReading} from './correct-pdf-reading.mjs';
import {nativePdfGlyphs,mapLayoutGeometry} from './pdf-glyph-geometry.mjs';

pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
const options=()=>({fontExtraProperties:true,useSystemFonts:false,cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/wasm/',import.meta.url).href,isEvalSupported:false});
const check=signal=>{if(signal?.aborted)throw new DOMException('Reading cancelled.','AbortError');};
const ocrWords=loadOcrWordList;
const isInstruction=(text,name,hint)=>hint==='amendments'||hint!=='bill'&&(/\bAMENDS?\b|amendments?/i.test(name)||/^\s*Amendment\s+\d+\s*$/im.test(text)&&/\bOn\s+page\s+\d+/i.test(text));
export async function readPdfFile(file,{onProgress=()=>{},signal,kindHint}={}){
 if(!file||typeof file.arrayBuffer!=='function'||!/^.*\.pdf$/i.test(file.name||''))throw Error('Choose a PDF file.');
 if(file.size>50*1024*1024)throw Error('This PDF exceeds the 50 MB limit.');
 check(signal);const bytes=new Uint8Array(await file.arrayBuffer());check(signal);
 const task=pdfjs.getDocument({data:bytes.slice(),...options()}),pages=[],rawPages=[],strikes=[],formatting=[],scanQuality=[],readingProblems=[],jrBoxes=[],marginState={columns:[]};let pdf,ocr=null,pageOffset=0,instruction=false,ignoredFromPage=null,endMarkerPage=null,hasOcr=false;
 try{
  pdf=await task.promise;if(pdf.numPages>1500)throw Error('This PDF exceeds the 1,500-page limit.');
  for(let n=1;n<=pdf.numPages;n++){
   check(signal);onProgress({page:n,total:pdf.numPages,message:'Reading page '+n+' of '+pdf.numPages});const page=await pdf.getPage(n),content=await page.getTextContent(),operators=await page.getOperatorList(),fontStyles={...content.styles};
   for(const name of Object.keys(fontStyles))try{fontStyles[name]=pdfFontStyle(fontStyles[name],page.commonObjs.get(name));}catch{}
   if(n===1)instruction=isInstruction(content.items.map(i=>i.str||'').join('\n'),file.name,kindHint);
   let items=instruction?printedAmendmentItems(content.items,fontStyles,page.view[2]-page.view[0],page.view[3]-page.view[1]):labelScannedBillMargins(content.items,page.view[2]-page.view[0],marginState);
   if(instruction&&Object.values(fontStyles).some(isOcrStyle)){const words=await ocrWords();check(signal);items=items.map(item=>typeof item.str==='string'&&isOcrStyle(fontStyles[item.fontName])?{...item,str:repairOcrSpacing(item.str,words)}:item);}
   let layout=extractPageLayout(items,operators,pdfjs.OPS,fontStyles,page.view[2]-page.view[0]);markJrBoxGeometry(layout,operators,pdfjs.OPS);
   const scanned=Object.values(fontStyles).some(isOcrStyle)||!layout.text.trim()&&hasVisiblePdfContent(operators,pdfjs.OPS)||largeRasterCoverage(operators,pdfjs.OPS,page.view[2]-page.view[0],page.view[3]-page.view[1],page.view)>=.35&&(instruction?layout.text.replace(/\s/gu,'').length<300:true);
   let wasOcr=false,pixelMarker=null;
   if(scanned){hasOcr=true;wasOcr=true;ocr??=await createOfflineOcr();check(signal);const scan=await readScannedInstructions(page,ocr,pdfjs.OPS,()=>check(signal),message=>onProgress({page:n,total:pdf.numPages,message}),layout,{bill:!instruction});layout=scan.layout;pixelMarker=scan.marker;scanQuality.push({page:n,...scan.quality});}
   if(instruction){
    jrBoxes.push(...jrBoxPageNotices({text:layout.text,annotations:await page.getAnnotations(),page:n}));
    if(isProposedAmendmentsPage(layout.text)){ignoredFromPage=n;page.cleanup();break;}
   }
   let end=instruction?instructionsEnd(layout.text):-1;
   if(instruction&&end<0&&pixelMarker){const height=page.view[3]-page.view[1],sourceLines=layout.text.split('\n'),next=layout.lines.findIndex(line=>height-line.baseline>pixelMarker.bottom+2);end=next<0?layout.text.length:sourceLines.slice(0,next).reduce((total,line)=>total+line.length+1,0);}
   if(end>=0){layout.text=layout.text.slice(0,end);endMarkerPage=n;const count=layout.text.split('\n').length;layout.lines=layout.lines.slice(0,count);layout.strikes=layout.strikes.filter(r=>r.start<end).map(r=>({...r,end:Math.min(r.end,end)}));}
   const problems=pageReadingProblems(layout,operators,pdfjs.OPS,page.view[2]-page.view[0],page.view[3]-page.view[1],{ocr:wasOcr,view:page.view});
   if(problems.length)readingProblems.push({page:n,reasons:problems,message:'Page '+n+': '+problems.join('; ')});
   const geometry=mapLayoutGeometry(layout,n,pageOffset,page.view,wasOcr?[]:nativePdfGlyphs(operators,pdfjs.OPS),{ocr:wasOcr});geometry.rotation=page.rotate;pages.push(geometry);
   rawPages.push(layout.text);strikes.push(layout.strikes);formatting.push(layout.lines);pageOffset+=layout.text.length+1;if(pageOffset>10_000_000)throw Error('This PDF contains too much text. Split it into smaller documents.');page.cleanup();
   if(endMarkerPage)break;
  }
  if(!rawPages.some(p=>p.trim()))throw Error('No readable text was found in this PDF.');
  const words=await ocrWords();check(signal);const doc=makeDocument(rawPages,file.name,strikes,formatting,words);Object.assign(doc,{ocr:hasOcr,scanQuality,readingProblems,sourcePages:pdf.numPages,ignoredFromPage,endMarkerPage,jrBoxes:[...(doc.jrBoxes||[]),...jrBoxes]});
  for(const page of pages)for(const line of page.lines){const block=doc.blocks.find(b=>b.page===page.page&&b.start===line.start);if(block)line.ignored=!!block.ignored;}
  return {id:crypto.randomUUID(),name:file.name,bytes,doc,pages,metadata:{kindHint:instruction?'amendments':kindHint,firstPageText:rawPages[0],sourcePageCount:pdf.numPages},revision:0};
 }catch(e){if(/password/i.test(e.message))throw Error('Unlock this PDF before adding it.');throw e;}
 finally{if(ocr)await ocr.terminate().catch(()=>{});await task.destroy().catch(()=>{});}
}

export function readingWarnings(entry){return (entry?.doc?.scanQuality||[]).flatMap(q=>(q.uncertain||[]).map(r=>({...r,page:q.page,entryId:entry.id,revision:entry.revision||0})));}
export function confirmPdfReading(entry,reading,replacement){
 if(reading.entryId!==undefined&&reading.entryId!==entry.id||reading.revision!==undefined&&reading.revision!==(entry.revision||0))throw Error('This upload has changed. Reopen reading review.');
 if(typeof replacement!=='string'||replacement.length!==reading.text.length)throw Error('Corrections must keep the same character count to preserve the exact PDF positions. For a larger correction, supply a readable source PDF.');
 const doc=correctPdfReading(entry.doc,reading,replacement),pages=structuredClone(entry.pages);doc.readingProblems=structuredClone(entry.doc.readingProblems||[]);
 for(const page of pages)for(const line of page.lines){line.text=doc.text.slice(line.start,line.end);for(const g of line.glyphs)g.text=doc.text.slice(g.start,g.end);}
 return {...entry,doc,pages,revision:(entry.revision||0)+1};
}

export async function renderPdfPage(entry,pageNumber,canvas,{scale=1.3}={}){
 const task=pdfjs.getDocument({data:entry.bytes.slice(),...options()});try{const pdf=await task.promise;if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pdf.numPages)throw Error('Choose an available PDF page.');const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:Math.max(.3,Math.min(3,scale))});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const context=canvas.getContext('2d',{alpha:false});await page.render({canvasContext:context,viewport,background:'rgb(255,255,255)',annotationMode:0}).promise;return {pages:pdf.numPages,width:viewport.width,height:viewport.height,transform:Array.from(viewport.transform)};}finally{await task.destroy().catch(()=>{});}
}
