// Editorial headers and footers are excluded from amendment interpretation.
// Keep the same definition for payload parsing, display and OCR review.
export const isAmendmentMetadataLine=line=>/^\s*(?:[-–—]\s*0\s*[-–—]|\d{2}\/\d{2}\/\d{2}\s+\d.*|\d+\s+RN\s+.*|RN\s*\d.*|Substantive)\s*$/i.test(line);
