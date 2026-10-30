// Named punctuation belongs to the directive. A quoted comma remains an
// ordinary quoted source anchor and is handled by the existing resolver.
export function commaInsertionAnchor(directive){
 const plain=directive.replace(/“[^”]*”|"[^"]*"|‘[^’]*’|'[^']*'/gu,m=>' '.repeat(m.length));
 const matches=[...plain.matchAll(/\b(after|before)\s+(?:(?:the|a)\s+)?(?:(first|second|third|fourth|fifth|last|final)\s+)?comma\b/giu)];
 if(!matches.length)return null;
 const m=matches[0],ordinal=m[2]?.toLowerCase();
 const locations=[...plain.matchAll(/\b(?:after|before)\s+(?:(?:the|a)\s+)?(?:(?:first|second|third|fourth|fifth|last|final)\s+)?(?:comma|period|semicolon|colon|question mark|exclamation point)\b/giu)];
 return {position:m[1].toLowerCase(),occurrence:ordinal==='last'||ordinal==='final'?-1:({first:1,second:2,third:3,fourth:4,fifth:5}[ordinal]??null),ambiguous:matches.length!==1||locations.length!==1};
}
