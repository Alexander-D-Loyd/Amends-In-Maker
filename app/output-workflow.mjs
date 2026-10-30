import {buildPdfMarks} from './pdf-markup.mjs';

const text = value => typeof value === 'string' ? value : value?.message || value?.reason || value?.code || 'This amendment needs review.';
export function prepareOutput(group, {allowPartial = true} = {}) {
  const issues = [...(group.issues || [])];
  const rows = group.plan?.amendments || [];
  const result = {exportable:false, partial:false, markedCount:0, totalCount:rows.length, unmarkedCount:rows.length, marks:null, issues};
  if (!group.previous || !group.instructions || !group.outputFilename || !rows.length) return result;
  // File identity, dates, reading integrity and duplicate numbering affect the
  // complete instruction set. Only individually located failures may be omitted.
  if (issues.some(i => !i?.number || /AMENDMENT_NUMBER_/.test(i.code || '')) || !allowPartial && !group.plan.ready) return result;
  const accepted = [];
  for (const amendment of rows) {
    if (!amendment.ready) continue;
    const marks = buildPdfMarks({previous:group.previous, plan:{ready:true, issues:[], amendments:[amendment]}});
    if (marks.ready) accepted.push(amendment);
    else for (const error of marks.issues) issues.push({code:'PDF_MARKING_FAILED', number:String(amendment.number), source:'instructions', message:text(error)});
  }
  if (!accepted.length || !allowPartial && accepted.length !== rows.length) return result;
  const marks = buildPdfMarks({previous:group.previous, plan:{ready:true, issues:[], amendments:accepted}});
  if (!marks.ready) {
    for (const error of marks.issues) for (const amendment of accepted) issues.push({code:'COMBINED_MARKING_FAILED', number:String(amendment.number), source:'instructions', message:text(error)});
    return result;
  }
  return {...result, exportable:true, partial:accepted.length !== rows.length, markedCount:accepted.length, unmarkedCount:rows.length-accepted.length, marks};
}

export function outputAttemptKey(group, folder) {
  return JSON.stringify([folder,group.id,group.outputFilename,group.assignment,
    (group.entries || []).map(e => [e.id,e.revision || 0,e.manualMetadata || null]),
    group.output?.marks?.amendments.map(a => String(a.number))]);
}
