import {embeddedOcrReadingWarnings,rereadDisagreement,readingWarningSpans}from './ocr-embedded-agreement.mjs';
import {readBillMarginColumn}from './bill-ocr-margins.mjs';
import {labelScannedBillMargins}from './bill-ocr-policy.mjs';
import {ocrPageItems,scannedStrokeGeometry,maskScannedStrikeouts,markDeletedOcrItems} from './scanned-amendments.mjs';
import {extractPageLayout} from './pdf-strikes.mjs';
import {printedAmendmentItems} from './amendment-markings.mjs';
import {scannedEndMarker} from './amendment-end-marker.mjs';
import {ambiguousClauseMarkers,corroboratedLowercaseL,originalMarkerGlyphBox} from './ocr-clause-markers.mjs';
const styles={offlineOcr:{name:'GlyphLessFont',fontFamily:'serif'}};
const emptyOperators={fnArray:[],argsArray:[]};
const isolatedWord=/^(?:\p{L}{2,30}|\(\p{L}\))$/u;
export async function readScannedInstructions(page,worker,OPS,checkCancelled=()=>{},progress=()=>{},embedded=null,{bill=false}={}){
 if(bill&&page.rotate%360)throw Error('Rotated scanned bill pages need an upright readable copy before comparison; text order could not be verified.');
 const box=bill?page.getViewport({scale:1}):null,pageWidth=box?.width||page.view[2]-page.view[0],pageHeight=box?.height||page.view[3]-page.view[1],scale=Math.min(3,Math.sqrt(6_000_000/(pageWidth*pageHeight)));
 const canvas=document.createElement('canvas'),viewport=page.getViewport({scale});
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const context=canvas.getContext('2d',{willReadFrequently:true});
 try{
  // Native instruction extraction reads page contents, excluding annotations.
  // Keep local OCR consistent, so administrative JR/ink annotations cannot
  // become insertion text when OCR fails to recognize the end marker.
  await page.render({canvasContext:context,viewport,background:'rgb(255,255,255)',...(!bill?{annotationMode:0}:{})}).promise;checkCancelled();
  const originalImage=context.getImageData(0,0,canvas.width,canvas.height);
  const marker=bill?null:scannedEndMarker(originalImage,scale);
  progress('Checking scanned text locally…');
  let data=(await worker.recognize(canvas,{}, {text:true,blocks:true})).data;checkCancelled();
  if(bill){data=await readBillMarginColumn(canvas,worker,data,scale,checkCancelled);if((data.blocks||[]).some(b=>(b.paragraphs||[]).some(p=>(p.lines||[]).some(l=>Math.abs(l.baseline.y1-l.baseline.y0)>Math.max(scale*2,Math.abs(l.baseline.x1-l.baseline.x0)*.15)))))throw Error('Scanned bill text orientation could not be verified. Supply an upright readable copy.');}
  const originalMarkerWords=ambiguousClauseMarkers(data).map(w=>structuredClone(w));
  let items=ocrPageItems(data,pageHeight,scale),layout=extractPageLayout(items,emptyOperators,OPS,styles,pageWidth);
  const strokes=scannedStrokeGeometry(layout,originalImage,pageHeight,scale);
  if(strokes.length){
   progress('Checking text beneath strikeouts…');maskScannedStrikeouts(context,strokes,pageHeight,scale);
   data=(await worker.recognize(canvas,{}, {text:true,blocks:true})).data;checkCancelled();
   if(bill)data=await readBillMarginColumn(canvas,worker,data,scale,checkCancelled);
  }
  // Recheck ambiguous active rows with single-line segmentation. This uses
  // pixels alone, never the Current Version as a transcription answer key.
  let lineChecks=0;
  for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
   const active=markDeletedOcrItems(ocrPageItems({blocks:[{paragraphs:[{lines:[line]}]}]},pageHeight,scale),strokes,scale);
   const embeddedIndex=embedded?.lines.findIndex(f=>Math.abs(f.baseline-(pageHeight-line.baseline.y0/scale))<2)??-1;
   const embeddedRow=embeddedIndex<0?'':embedded.text.split('\n')[embeddedIndex];
   const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
   const rowWords=(line.words||[]).map(w=>w.text).join(' ');
   const missingShortWord=embeddedRow&&normalize(embeddedRow)!==normalize(rowWords)&&[...embeddedRow.matchAll(/\b[\p{L}]{1,3}\b/gu)].some(m=>normalize(embeddedRow.slice(0,m.index)+embeddedRow.slice(m.index+m[0].length))===normalize(rowWords));
   if(lineChecks>=6&&(!missingShortWord||lineChecks>=8))continue;
   if((!missingShortWord&&!active.some(w=>w.confidence<85&&!w.ocrStruck))||line.baseline.y0/scale<110||line.baseline.y0/scale>pageHeight*.88)continue;
   lineChecks++;
   const left=Math.max(0,line.bbox.x0-6),top=Math.max(0,Math.floor(line.baseline.y0-11*scale)),right=Math.min(canvas.width,line.bbox.x1+6),bottom=Math.min(canvas.height,Math.ceil(line.baseline.y0+3*scale));
   const crop=document.createElement('canvas');crop.width=right-left;crop.height=bottom-top;
   // Recheck the original pixels too: stroke removal must not damage an
   // adjacent active glyph and become the sole basis for its transcription.
   crop.getContext('2d').putImageData(originalImage,-left,-top);
   await worker.setParameters({tessedit_pageseg_mode:'7'});
   let reread;try{reread=(await worker.recognize(crop,{}, {text:true,blocks:true})).data;}finally{await worker.setParameters({tessedit_pageseg_mode:'3'});crop.width=crop.height=0;}
   checkCancelled();
   const words=(reread.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
   if(words.length){
    const move=b=>({x0:b.x0+left,x1:b.x1+left,y0:b.y0+top,y1:b.y1+top});
    const candidates=words.map(w=>({...w,bbox:move(w.bbox),symbols:w.symbols.map(s=>({...s,bbox:move(s.bbox)}))}));
    if(missingShortWord&&!active.some(w=>w.ocrStruck)&&normalize(candidates.map(w=>w.text).join(' '))===normalize(embeddedRow)){
     // Two independent readings agree on a word missed by whole-page OCR.
     line.words=candidates;continue;
    }
    if(missingShortWord)for(const word of line.words)word.confidence=Math.min(word.confidence,84);
    // A better mean score must not overwrite a stable active word elsewhere
    // on the row. Re-read only the uncertain word at the same physical place.
    line.words=line.words.map(word=>{
     const stable=active.find(w=>Math.abs(w.transform[4]-word.bbox.x0/scale)<.5&&w.width>=(word.bbox.x1-word.bbox.x0)/scale*.9);
     if(stable?.confidence>=85&&!stable?.ocrStruck)return word;
     const group=candidates.filter(w=>(w.bbox.x0+w.bbox.x1)/2>=word.bbox.x0&&(w.bbox.x0+w.bbox.x1)/2<=word.bbox.x1&&Math.max(0,Math.min(w.bbox.x1,word.bbox.x1)-Math.max(w.bbox.x0,word.bbox.x0))>=Math.min(word.bbox.x1-word.bbox.x0,w.bbox.x1-w.bbox.x0)*.7);
     // A joined OCR word may become multiple words on the reread. Keep all
     // of them; accepting only the first candidate can silently lose text.
     const candidate=group.length===1?group[0]:group.length?{...group[0],text:group.map(w=>w.text).join(' '),confidence:Math.min(...group.map(w=>w.confidence)),bbox:{x0:Math.min(...group.map(w=>w.bbox.x0)),x1:Math.max(...group.map(w=>w.bbox.x1)),y0:Math.min(...group.map(w=>w.bbox.y0)),y1:Math.max(...group.map(w=>w.bbox.y1))},symbols:group.flatMap(w=>w.symbols)}:null;
     return candidate&&candidate.confidence>word.confidence?{...candidate,readingDisagreement:rereadDisagreement(word.text,candidate.text,word.readingDisagreement)}:word;
    });
   }
  }
  // A row reread can fuse an active word to adjacent crossed-out wording.
  // Re-read uncertain alphabetic words in isolation from original pixels,
  // so removing a stroke cannot turn an intact e into a c.
  let wordChecks=0;
  for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
   const active=markDeletedOcrItems(ocrPageItems({blocks:[{paragraphs:[{lines:[line]}]}]},pageHeight,scale),strokes,scale);
   for(const word of line.words||[]){
    if(wordChecks>=12||word.confidence>=85||!isolatedWord.test(word.text)||line.baseline.y0/scale<110||line.baseline.y0/scale>pageHeight*.88)continue;
    if(active.some(w=>w.ocrStruck&&Math.abs(w.transform[4]-word.bbox.x0/scale)<.5))continue;
    wordChecks++;
    const pad=Math.ceil(scale),left=Math.max(0,word.bbox.x0-pad),top=Math.max(0,word.bbox.y0-pad),right=Math.min(canvas.width,word.bbox.x1+pad),bottom=Math.min(canvas.height,word.bbox.y1+pad);
    const crop=document.createElement('canvas');crop.width=right-left;crop.height=bottom-top;crop.getContext('2d').putImageData(originalImage,-left,-top);
    await worker.setParameters({tessedit_pageseg_mode:'8'});
    let result;try{result=(await worker.recognize(crop,{}, {text:true,blocks:true})).data;}finally{await worker.setParameters({tessedit_pageseg_mode:'3'});crop.width=crop.height=0;}
    checkCancelled();
    const candidates=(result.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
    if(candidates.length!==1||!isolatedWord.test(candidates[0].text)||candidates[0].confidence<=word.confidence||word.text.startsWith('(')!==candidates[0].text.startsWith('('))continue;
    const candidate=candidates[0],move=b=>({x0:b.x0+left,x1:b.x1+left,y0:b.y0+top,y1:b.y1+top});
    // Recognition confidence alone cannot resolve differing valid words.
    // An uncorroborated change remains reviewable even at a high OCR score.
    const disagreement=rereadDisagreement(word.text,candidate.text,word.readingDisagreement);
    Object.assign(word,candidate,{bbox:move(candidate.bbox),symbols:candidate.symbols.map(s=>({...s,bbox:move(s.bbox)}))});
    word.readingDisagreement=disagreement;
   }
  }
  let markerChecks=0;const markerReadings=[];
  for(const word of ambiguousClauseMarkers(data).slice(0,4)){
   const sourceLine=data.blocks.flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).find(line=>line.words?.includes(word));
   const active=markDeletedOcrItems(ocrPageItems({blocks:[{paragraphs:[{lines:[{...sourceLine,words:[word]}]}]}]},pageHeight,scale),strokes,scale);
   if(active.some(w=>w.ocrStruck))continue;
   const glyph=(word.symbols||[]).find(s=>/^[JI1|]$/.test(s.text));if(!glyph)continue;
   markerChecks++;
   const box=originalMarkerGlyphBox(word,originalMarkerWords)||glyph.bbox;
   const pad=2,left=Math.max(0,box.x0-pad),top=Math.max(0,box.y0-pad),width=box.x1+pad-left,height=box.y1+pad-top;
   const original=document.createElement('canvas');original.width=canvas.width;original.height=canvas.height;original.getContext('2d').putImageData(originalImage,0,0);
   const readings=[];
   try{
    await worker.setParameters({tessedit_pageseg_mode:'10'});
    for(const zoom of [1.5,2]){
     const crop=document.createElement('canvas');crop.width=Math.ceil(width*zoom+height*.6+60);crop.height=Math.ceil(height*zoom+40);
     const ctx=crop.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);ctx.translate(30,20);ctx.transform(1,0,.2,1,0,0);ctx.drawImage(original,left,top,width,height,0,0,width*zoom,height*zoom);
     try{readings.push((await worker.recognize(crop,{}, {text:true,blocks:true})).data);checkCancelled();}finally{crop.width=crop.height=0;}
    }
   }finally{await worker.setParameters({tessedit_pageseg_mode:'3'});original.width=original.height=0;}
   markerReadings.push({source:word.text,box:{...box},readings:readings.map(r=>({text:r.text.trim(),confidence:r.confidence}))});
   if(corroboratedLowercaseL(readings)){
    word.text='(l)';glyph.text='l';word.confidence=Math.min(...readings.map(r=>r.confidence));word.readingDisagreement=undefined;word.markerCorroborated=true;
   }else{word.confidence=Math.min(word.confidence,84);word.readingDisagreement='Ambiguous clause marker '+word.text;}
  }
  items=markDeletedOcrItems(ocrPageItems(data,pageHeight,scale),strokes,scale);
  items=bill?labelScannedBillMargins(items,pageWidth):printedAmendmentItems(items,styles,pageWidth,pageHeight);
  layout=extractPageLayout(items,emptyOperators,OPS,styles,pageWidth);
  const offsets=[];let cursor=0;for(const line of layout.text.split('\n')){offsets.push(cursor);cursor+=line.length+1;}
  const uncertain=items.filter(w=>(bill||!w.ocrStruck)&&!w.structuralMargin&&(w.confidence<85||w.readingDisagreement)).flatMap(w=>{
   const index=layout.lines.findIndex(f=>Math.abs(f.baseline-w.transform[5])<=2),run=layout.lines[index]?.runs.find(r=>Math.abs(r.x-w.transform[4])<.5);
   if(!run)return [];
   const start=offsets[index]+run.start,end=offsets[index]+run.end,ocrWitness={start,end,text:layout.text.slice(start,end)};
   return readingWarningSpans(layout.text,start,end).map(span=>({...span,struck:!!w.ocrStruck,confidence:w.confidence,disagreement:w.readingDisagreement,ocrWitness}));
  });
  // Compare only an intact decoded layer of this same PDF. The instruction
  // layer needs this check too: a high-confidence c/e reading may still differ.
  // Damaged/partial native decoding is already handled by integrity checks.
  const quality=embedded?.readingQuality,reliableEmbedded=embedded?.text&&quality?.preservedCharacters&&!quality.invalidGeometry&&!quality.unsupportedCharacters.length;
  const embeddedWarnings=reliableEmbedded?embeddedOcrReadingWarnings(embedded,layout,{instructions:!bill}).filter(w=>bill||!layout.strikes.some(r=>r.start<=w.start&&r.end>=w.end)):[];
  const embeddedDisagreements=embeddedWarnings.map(w=>w.sourceWitness.text||w.ocrWitness.text);
  uncertain.push(...embeddedWarnings);
  return {layout,marker,quality:{engine:'local OCR',passes:strokes.length?2:1,lineChecks,wordChecks,markerChecks,markerReadings,embeddedDisagreements,uncertain}};
 }finally{canvas.width=canvas.height=0;}
}
