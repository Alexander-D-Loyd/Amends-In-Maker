// Images and ink annotations never enter PDF text extraction. These checks
// remove recognizable administrative text and isolated OCR signature blocks.
// Apply only to the instructional PDF, never to the two bill versions.
import {isOcrStyle} from './ocr-text.mjs';
export function printedAmendmentItems(items,styles={},pageWidth=612,pageHeight=792){
 const textItems=items.filter(i=>typeof i.str==='string'&&i.str.trim());
 const heights=textItems.filter(i=>i.height>=8&&i.height<=16).map(i=>i.height).sort((a,b)=>a-b);
 const bodyHeight=heights[Math.floor(heights.length/2)]||12;
 const rows=[];
 for(const item of textItems){
  const y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<=2);
  if(!row){row={y,items:[]};rows.push(row);}row.items.push(item);
 }
 rows.sort((a,b)=>b.y-a.y);
 const excluded=new Set();
 for(const [index,row] of rows.entries()){
  const ordered=row.items.sort((a,b)=>a.transform[4]-b.transform[4]);
  const cells=[];
  for(const item of ordered){
   let cell=cells.at(-1),last=cell?.at(-1);
   if(!last||item.transform[4]-last.transform[4]-last.width>Math.max(20,bodyHeight*2)){cell=[];cells.push(cell);}
   cell.push(item);
  }
  const ocr=ordered.every(i=>{
   const style=styles[i.fontName]||{};
   // PDF.js exposes OCR font metrics even when its internal font name is hidden.
   return isOcrStyle(style);
  });
  const signatureFooter=ocr&&row.y<pageHeight*.11&&cells.length>1&&
   (rows[index-1]?.y-row.y>bodyHeight*2.5)&&
   ordered.some(i=>i.height>bodyHeight*1.18);
  for(const cell of cells){
   const value=cell.map(i=>i.str).join(' ').replace(/\s+/g,'').toUpperCase();
   const right=cell[0].transform[4]>pageWidth*.65,upper=row.y>pageHeight*.6;
   const stamp=right&&upper&&/^(?:ADOPTED|APPROVED|RECEIVED|FILED|SECRETARYOFSENATE|CHIEFCLERK(?:OFTHEASSEMBLY)?|(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{1,2}\d{4})$/.test(value);
   if(stamp||signatureFooter)cell.forEach(i=>excluded.add(i));
  }
  for(const item of ordered){
   const font=styles[item.fontName]?.name||'';
   const rotated=Math.abs(item.transform[1])>Math.abs(item.transform[0])*.1;
   if(/(?:Handwriting|Handwritten|Signature|BrushScript|SegoeScript|SegoePrint)/i.test(font)||
     (/^RN\s*\d[\d\s]*$/i.test(item.str.trim())&&(rotated||item.transform[4]>pageWidth*.88)))excluded.add(item);
   // OCR of vertical administrative barcodes can appear as a huge horizontal
   // word, even extending beyond the page. Do not treat it as amendment prose.
   if(ocr&&item.transform[5]<pageHeight*.16&&item.transform[4]>pageWidth*.88&&item.height>bodyHeight*2)excluded.add(item);
  }
 }
 return items.filter(i=>!excluded.has(i));
}
