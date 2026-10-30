// Explicit technical spellings are identifiers, not prose to restyle.
// This protects source text only; it does not open links, validate a domain,
// establish resource ownership, or exempt nearby ordinary wording.
const uri=/(?<![\p{L}\p{N}\p{M}_])(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s<>“”"]+/giu;
const email=/(?<![\p{L}\p{N}\p{M}_])[A-Za-z0-9][A-Za-z0-9._%+’'-]*@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}(?![\p{L}\p{N}\p{M}_])/gu;
const resource=/(?<![\p{L}\p{N}\p{M}_])(?:[A-Za-z0-9][A-Za-z0-9_’'-]*\.)+(?:com|org|net|edu|gov|mil|int|io|pdf|docx?|xlsx?|pptx?|txt|json|xml|csv|html?|exe|dll|ps1|mjs|cjs|js)(?:\/[^\s<>“”"]*)?(?![\p{L}\p{N}\p{M}_])/giu;
const serial=/(?<![\p{L}\p{N}\p{M}_])[A-Z]{2,10}(?:[\\/-][A-Z0-9]+)+(?![\p{L}\p{N}\p{M}_])(?=\s+(?:identifiers?|codes?|serials?)(?![\p{L}\p{N}\p{M}_]))/gu;
const serialLabel=/^\s+(?:identifiers?|codes?|serials?)(?![\p{L}\p{N}\p{M}_])/u;
export const TECHNICAL_LITERAL_SCOPE='Complete explicit http/https/ftp/mailto/www strings, conventional email addresses, selected dotted domains/file extensions and ASCII uppercase serial groups containing a digit with slash/backslash/hyphen separators and an intact following identifier/code/serial label are protected as source identifiers. Their own spelling does not establish prose preference, contraction or ordinary numeral evidence. This is a source-preservation safeguard, not a separately stated LCB URL rule or an official serial registry. Known text remains at its original offsets; nearby unquoted prose stays checkable. Bare serial-looking groups, malformed/wrapped identifiers, arbitrary extensions, link validity, ownership and every programming syntax remain manual.';
export function styleTechnicalLiteralRanges(source,originalSource=source){
 const candidates=[...source.matchAll(uri),...source.matchAll(email),...source.matchAll(resource),...[...source.matchAll(serial)].filter(m=>/\d/.test(m[0])&&originalSource.slice(m.index,m.index+m[0].length)===m[0]&&!/[\p{L}\p{N}\p{M}_]$/u.test(originalSource.slice(Math.max(0,m.index-2),m.index))&&serialLabel.test(originalSource.slice(m.index+m[0].length)))].map(m=>({start:m.index,end:m.index+m[0].length})).sort((a,b)=>a.start-b.start||b.end-a.end),ranges=[];
 for(const r of candidates){const last=ranges.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else ranges.push({...r});}return ranges;
}
