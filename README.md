# Amends In Maker

Standalone, offline Windows application for creating amendment-marked copies of California legislative bill PDFs. Drop several bills, versions and amendment sets into one batch, review the source matches, and save one marked PDF per bill and amendment date.

The previous-version PDF remains the document base. Its words, layout and pagination are preserved. Amends In Maker draws the requested marks onto a new copy; it does not rewrite the bill or change the uploaded files.

## Marking conventions

- Highlight affected printed margin line numbers in yellow and place a small circled amendment number beside them.
- **Insert after:** draw a small blue arrow at the exact insertion point.
- **Insert between lines:** draw a small blue arrow between the two margin numbers and highlight both numbers.
- **Strike:** draw a red line through the entire requested strikeout, including all wrapped lines.
- **Strike and insert:** draw a blue line through the complete strikeout, ending with a blue arrow at the insertion endpoint.

Inserted payload text is not placed in large comment boxes. The numbered mark links the location to the original amendment instruction.

## Use the Windows application

Extract the complete `Amends-In-Maker-Windows-1.0.0.zip`, then open `Amends In Maker/Amends In Maker.exe`. Keep the executable, locales and resources together. No Python, Java or separate Node installation is needed to run the app. Processing stays on the computer.

1. Drop multiple bill/version/amendment PDFs together, or use **Choose PDFs**.
2. Review the automatically grouped bill batches. Open **Review file labels** or the bill/date/file-pairing controls when a source is ambiguous.
3. Inspect the previous-version PDF with its marks. You can also view the uploaded originals and any supplied Current version.
4. Confirm uncertain OCR readings against the original source when requested. An ambiguous location or incomplete source blocks that batch.
5. Choose an output folder and create the checked, ready PDFs.

Output names follow the amendment set's confirmed date:

`Amends In AB 1982 March 25, 2026.pdf`

The program never treats file modification time as the amendment date and never infers chronology solely from `v99`/`v98` filenames. Known drafting timestamps and “AS AMENDED IN” prior-version dates are not silently used as the output date. A supplied Current version helps identify and cross-check the versions; its discrepancies are shown separately from the requested source markings.

Existing output files are skipped, not overwritten. Duplicate input files are detected. Canceling a batch stops remaining reads while retaining files already loaded.

## Review limits

The app marks only amendment operations with complete, unambiguous previous-version locations. Missing reference material, unresolved OCR differences, overlapping targets, unsupported instructions and unavailable glyph positions remain visible for review. It does not guess text, missing page/line numbers or the order of conflicting edits.

- The four marking styles above are supported, including multi-line and repeated targets.
- Original unnumbered heading/title targets may receive a small amendment-number mark without an invented line-number highlight.
- Between-line arrows require both real, consecutive printed line numbers. A missing lower line number needs review.
- Rotated target pages and partially selected OCR word boxes need an upright/readable source copy.
- OCR confirmations retain the original PDF. The first version supports unchanged confirmations and corrections with the same character count; larger corrections need a readable replacement source.
- A replacement Digest or instruction requiring missing supplemental drafting material remains held for review when its marking cannot be established safely.
- Each PDF is limited to 50 MB and 1,500 pages. Very large batches depend on available memory.

This application does not perform spelling, grammar, LCB or GPO style review and does not certify legal accuracy. It makes the requested amendment locations easier for a human reader to review.

## Development

Dependencies are pinned in `package.json` and `pnpm-lock.yaml`. Install Node.js 24 and pnpm 11.25.0, then:

```text
pnpm install --ignore-scripts
node node_modules/electron/install.js
node scripts/setup-assets.cjs
pnpm test
pnpm start
```

Asset setup restores pinned PDF.js fonts/maps/WASM, PDF-lib and local Tesseract OCR. The English OCR trained data is checked against its fixed commit, byte count and SHA-256. Initial dependency setup needs a connection; uploaded-document processing stays offline. The curated `vendor/diff` modules, OCR-only Typo adapter and affix-expanded word-spacing dictionary are committed with their licenses.

`scripts/package-windows.cjs` stages and verifies a complete portable Windows folder and a deterministic ZIP, with a per-file manifest and SHA-256 sidecar. Native Windows verification precedes publication. The GitHub workflow publishes only a reconstruction matching the recorded tested manifest and archive checksum.

## Source and validation

The amendment parser, document model and selected PDF/OCR helpers were extracted from [Document Compare](https://github.com/Alexander-D-Loyd/Document-Compare) at commit `0cdcc7051fdeed406f4295abb45f9bf1f75b007e`. `upstream-provenance.json` records the original helper hashes. The standalone batch UI, exact PDF-coordinate mapping, marking/export pipeline and save bridge are separate components.

Validation covers source tests, actual desktop workflows and rendered output. Original AB 1967 and AB 2266 tests locate all 18 instructional amendments. All 14 output pages preserve every pixel outside the bounded annotation regions; all seven original inputs keep their hashes. Only the three previously reviewed, unchanged AB 2266 readings were confirmed in that test. Controlled two-bill batches exercise all four marking styles, exact output names, ready-only exports, original-PDF viewing, duplicate detection, no-overwrite saves, OCR confirmation and stale-form rejection. The automated folder chooser is a deterministic test double; the actual trusted IPC and file writes are exercised. These are processing checks, not a measured human precision/recall benchmark.

Private test PDFs, reader models, app profiles and screenshots are excluded from the public source and Windows package. Third-party notices are in `THIRD_PARTY_NOTICES.md`.
