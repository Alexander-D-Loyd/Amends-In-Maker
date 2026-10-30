// Directive punctuation names are instructions, not literal payload text.
// Quoted source anchors keep their existing independent matching behavior.
export function periodInsertionAnchor(directive){
 const plain=directive.replace(/“[^”]*”|"[^"]*"|‘[^’]*’|'[^']*'/gu,m=>' '.repeat(m.length));
 const found=/\bafter\s+(?:(?:the|a)\s+)?(?:(first|second|third|fourth|fifth|last|final)\s+)?period\b/iu.exec(plain);
 const finalSentence=/\bafter\s+(?:the\s+)?(?:last|final)\s+sentence\s+(?:in|of)\s+(?:the\s+)?bill\b/iu.test(plain);
 if(!found&&!finalSentence)return null;
 const atEnd=finalSentence||/\bperiod\s+at\s+(?:the\s+)?end\b/iu.test(plain);
 const billFinal=finalSentence||/\b(?:end\s+of\s+(?:the\s+)?bill|(?:last|final)\s+(?:sentence|period)\s+(?:in|of)\s+(?:the\s+)?bill)\b/iu.test(plain);
 const ordinal=found?.[1]?.toLowerCase();
 return {occurrence:atEnd||ordinal==='last'||ordinal==='final'?-1:({first:1,second:2,third:3,fourth:4,fifth:5}[ordinal]??null),billFinal,ambiguous:[...plain.matchAll(/\bafter\s+(?:(?:the|a)\s+)?(?:(?:first|second|third|fourth|fifth|last|final)\s+)?period\b/giu)].length>1};
}
