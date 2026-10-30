# Amends In Maker

An offline Windows app that marks amendment locations on copies of California legislative bill PDFs.

## Use the app

Extract the complete Windows release ZIP and open `Amends In Maker/Amends In Maker.exe`. Keep the whole application folder together. No separate installation of Python, Java or Node is needed.

1. Open the app to its file-drop homepage.
2. Drop bill PDFs and their amendment-instruction PDFs together. Several bills can be processed at once. Only the previous bill to mark and its amendments are needed.
3. Choose an output folder the first time. It is remembered across restarts and can be changed on the homepage. Marked PDFs are saved automatically after the files finish loading.
4. Review any missing-file or amendment errors in the batch results. Click an issue to open the original amendment PDF with that instruction highlighted in yellow. Multi-page instructions remain highlighted on each relevant page.

Example inputs:

```text
AB 1982 v99.pdf
AB 1982 March 25, 2026 AMENDS.pdf
SB 879 previous.pdf
SB 879 March 26, 2026 AMENDS.pdf
```

Example output:

`AB 1982 Amends In March 25, 2026.pdf`

Bill numbers and document roles are matched from filenames, with source conflicts reported for review. A single matching bill is automatically the PDF to mark. Multiple versions require a clear previous-version filename, an instruction heading identifying the prior edition, a unique dated prior bill, or a manual selection. Version counters alone do not establish chronology.

An incomplete amendment date can use a unique evidenced year from the same bill's source dates. Conflicting or unavailable dates require confirmation under **Adjust bill, amendment date or source file**. File download/modification times are never used.

Existing output files are skipped, never overwritten. Duplicate uploads are detected. Changing folders saves pending outputs there; repeated processing does not silently rewrite completed files.

## PDF marks

- Affected printed margin line numbers are highlighted yellow, with a small circled amendment number beside them.
- **Insert after:** a small blue arrow at the exact insertion point.
- **Insert between lines:** a blue arrow between the two printed margin numbers, highlighting both numbers.
- **Strike:** a red line through the complete strikeout, including wrapped lines.
- **Strike and insert:** a blue line through the complete strikeout, ending with a blue arrow.

The previous PDF's original words, pages, layout and existing marks are preserved. Inserted payload text is not placed in comment boxes. The numbered markers connect the location to the original amendment instruction. The popup's broad yellow instruction highlight is for review only and is not added to the output bill.

## Errors and review

Missing bills, missing amendments, uncertain file labels, unresolved dates, unreadable sources and failed locations stay visible. The app never guesses a source anchor or substitutes an invented line number.

When individual amendments fail, independently located marks can be saved and the PDF is clearly labeled in the app as having unmarked amendments. The result lists every omitted amendment and opens its original instruction for review. Whole-file identity/date/reading-integrity problems and duplicate numbering hold that bill's output. Both sides of overlapping targets remain unmarked. If a partly marked output already exists after a correction, it is still skipped: choose another output folder or remove the old output before retrying.

Use **Review files** to correct a filename's labels or remove a file before supplying a replacement. Confirm an uncertain OCR reading against its original PDF when prompted. Same-character-count corrections preserve exact source coordinates; larger corrections need a readable replacement PDF.

Additional limits:

- Missing supplemental drafting material or a replacement Digest may prevent marking an instruction.
- Between-line arrows need both real consecutive printed numbers.
- Rotated target pages, missing glyph positions and partial OCR-word selections need a readable upright source.
- An unnumbered heading/title may receive a numbered marker without an invented margin highlight.
- Each PDF is limited to 50 MB and 1,500 pages. Large batches depend on available memory.

This app locates and marks amendment instructions. It does not perform spelling, grammar, LCB or GPO review, and it does not certify legal accuracy. All document processing stays on the computer.

## Development and verification

Dependencies are pinned. With Node 24 and pnpm 11.25.0 installed:

```text
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
node scripts/setup-assets.cjs
pnpm test
pnpm start
```

Asset setup restores pinned PDF.js/PDF-lib and local OCR assets. The OCR trained data is checked against a fixed commit, size and SHA-256. Initial setup requires a connection; document processing stays offline.

`scripts/package-windows.cjs` stages a portable Windows app and deterministic ZIP with a complete file manifest and SHA-256 sidecar. The release workflow reconstructs the exact native-tested package before publication. Git preserves source bytes, including mixed line endings. Published versions and validation records are in `RELEASES.md` and `.github/release-receipts/`.

The parser, document model and selected PDF/OCR helpers originate in [Document Compare](https://github.com/Alexander-D-Loyd/Document-Compare) commit `0cdcc7051fdeed406f4295abb45f9bf1f75b007e`; `upstream-provenance.json` records the original hashes. The standalone batch flow, PDF coordinate mapping, markup/export and save bridge are separate components. OCR-only dictionaries repair word spacing; there is no style-review interface.

Private test PDFs, reader models, app profiles and screenshots are excluded from public source and Windows packages. Third-party notices are in `THIRD_PARTY_NOTICES.md`.
