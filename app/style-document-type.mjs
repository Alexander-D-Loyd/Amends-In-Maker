// Explicit, per-document review choice. Never infer an opinion from bill text.
export const STYLE_DOCUMENT_TYPES=Object.freeze(['bill','opinion','cover-letter']);
export function normalizeStyleDocumentType(value){return STYLE_DOCUMENT_TYPES.includes(value)?value:'bill';}
export function styleDocumentType(doc){return normalizeStyleDocumentType(doc?.styleDocumentType);}
export function isOpinionStyleDocument(doc){return styleDocumentType(doc)!=='bill';}
export function styleDocumentTypeLabel(doc){return ({bill:'Bill / Digest',opinion:'Opinion','cover-letter':'Cover letter'})[styleDocumentType(doc)];}
