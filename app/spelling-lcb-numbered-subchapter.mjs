import {styleContext} from './style-context.mjs';
import {styleEvidenceGuard,originalBodyStyleContext} from './style-evidence.mjs';
import {spellingSourceBoundaryGuard} from './spelling-source-boundaries.mjs';

// LCB20 lists Subchapter with a number in Cal. Code Regs./federal usage.
// This accepts its spelling only inside a complete selected numbered citation;
// capitalization and legal reference meaning stay with the style checker.
const division='(?:[-\\u00ad\\u2010][ \\t]*\\n\\s{0,4096})?';
const physicalWord=word=>[...word].join(division);
const term='[Ss]'+division+physicalWord('ubchapter');
const code=['California Code of Regulations','Code of Federal Regulations'].map(s=>s.split(' ').map(physicalWord).join('\\s+')).join('|');
const pattern=new RegExp('(?<![\\p{L}\\p{N}\\p{M}_])(?<term>'+term+')\\s+(?:[1-9]\\d*(?:\\.\\d+)*|[IVXLCDM]+)(?![\\p{L}\\p{N}\\p{M}_])\\s+of\\s+(?:the\\s+)?(?:'+code+')(?![\\p{L}\\p{N}\\p{M}_])(?=$|[.,;:!?)”\u0022’\u0027]|\\s+(?:shall|must|may|applies|governs|provides|is|are)\\b)','gu');
export function numberedSubchapterSpellingRanges(doc){
 // Cheap negative prefilter; only the full pattern below supplies evidence.
 if(!/(?:[Ss]ubc|[Ss]ub[-\u00ad\u2010]|[Ss]u[-\u00ad\u2010]|[Ss][-\u00ad\u2010])/u.test(doc.text))return [];
 const ctx=styleContext(doc),original=originalBodyStyleContext(doc)?.source||ctx.source,boundary=spellingSourceBoundaryGuard(doc,original),blocked=styleEvidenceGuard(doc,{...ctx,literalAt:()=>false,tableAt:()=>false}),ranges=[];
 for(const m of ctx.source.matchAll(pattern)){
  const start=m.index,end=start+m.groups.term.length,evidenceEnd=start+m[0].length;
  if(blocked(start,evidenceEnd)||boundary(start,evidenceEnd))continue;
  ranges.push({start,end,evidenceStart:start,evidenceEnd,sourcePage:20});
 }
 return ranges;
}
