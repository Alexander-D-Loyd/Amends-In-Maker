import {activeText} from './core.mjs';
import {instructionsEnd} from './amendments.mjs';

const documentOf=value=>value?.doc||value;
const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
function reviewLineRect(line,page){
 const view=page.view;if(!Array.isArray(view)||view.length!==4||!view.every(Number.isFinite)||view[2]<=view[0]||view[3]<=view[1])return null;
 if(![line.left,line.right,line.baseline,line.height].every(Number.isFinite)||line.right<=line.left||line.height<=0)return null;
 const rect={page:page.page,x:line.left,y:line.baseline-line.height*.22,width:line.right-line.left,height:line.height};
 return rect.x>=view[0]&&rect.y>=view[1]&&rect.x+rect.width<=view[2]&&rect.y+rect.height<=view[3]?rect:null;
}

// Keep original PDF offsets. OCR directive repairs can add characters, so a
// location must never be obtained from the repaired instruction string.
export function instructionSourceText(entry){
 const doc=documentOf(entry);if(typeof doc?.text!=='string')return '';
 let visible=activeText(doc);
 for(const range of [...(doc.excluded||[]),...(doc.blocks||[]).filter(b=>b.ignored)]){
  const start=Math.max(0,range.start),end=Math.min(visible.length,range.end);
  if(Number.isInteger(start)&&Number.isInteger(end)&&end>start)visible=visible.slice(0,start)+visible.slice(start,end).replace(/[^\n]/g,' ')+visible.slice(end);
 }
 return visible;
}

export function instructionLocations(entry){
 const doc=documentOf(entry);if(typeof doc?.text!=='string')return [];
 const visible=instructionSourceText(entry);
 const endings=[instructionsEnd(visible),instructionsEnd(activeText(doc))].filter(at=>at>=0),limit=endings.length?Math.min(...endings):visible.length;
 const headings=[...visible.slice(0,limit).matchAll(/(?:^|\n)\s*Amendment\s*(\d+)\s*(?=\n|$)/gi)].map(m=>({number:m[1],start:m.index+m[0].search(/\S/)}));
 if(!headings.length){
  const directives=[...visible.slice(0,limit).matchAll(/(?:^|\n)[ \t]*(?:On\s*page\s*\d+\b|In\s+the\s+(?:title|heading)\b)/gi)];
  if(directives.length===1){const match=directives[0];headings.push({number:'1',start:match.index+match[0].search(/\S/)});}
 }
 return headings.map((heading,index)=>{
  const start=heading.start,rawEnd=headings[index+1]?.start??limit,end=rawEnd-doc.text.slice(start,rawEnd).match(/\s*$/)[0].length;
  const blocks=(doc.blocks||[]).filter(b=>!b.ignored&&overlaps(b,{start,end})),pages=[...new Set(blocks.map(b=>b.page))],rects=[];
  for(const page of Array.isArray(entry?.pages)?entry.pages:[])for(const line of page.lines||[]){
   if(!overlaps(line,{start,end})||!blocks.some(b=>b.page===page.page&&overlaps(b,line)))continue;
   // Review highlights may cover a validated physical row when individual PDF
   // glyphs are unavailable. Exported amendment marks retain stricter geometry.
   const wholeLine=reviewLineRect(line,page);if(wholeLine){rects.push(wholeLine);continue;}
   const glyphs=(line.glyphs||[]).filter(g=>overlaps(g,{start,end})&&[g.x,g.y,g.width,g.height].every(Number.isFinite)&&g.width>0&&g.height>0);
   if(glyphs.length){const x=Math.min(...glyphs.map(g=>g.x)),y=Math.min(...glyphs.map(g=>g.y)),right=Math.max(...glyphs.map(g=>g.x+g.width)),top=Math.max(...glyphs.map(g=>g.y+g.height));rects.push({page:page.page,x,y,width:right-x,height:top-y});}
  }
  const page=blocks.find(b=>b.start<=start&&b.end>start)?.page??pages[0]??null;
  return {number:heading.number,start,end,page,pages,rects};
 });
}

export function instructionLocation(entry,number){
 const matches=instructionLocations(entry).filter(row=>row.number===String(number));
 return matches.length===1?matches[0]:null;
}

export function instructionIssueContext(entry,number){
 const location=instructionLocation(entry,number);
 return {source:'instructions',...(entry?.id?{entryId:entry.id}:{}),...(number===undefined?{}:{number:String(number)}),...(location?{instructionStart:location.start,instructionEnd:location.end,instructionPage:location.page,instructionPages:location.pages}:{})};
}
