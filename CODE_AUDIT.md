# Cleanup and follow-up changes — 1.0.5

The functional 1.0.4 release was published and verified before this cleanup resumed. The baseline is source commit `c6d33f7e38e3b561bf3c42368862268fa8fc37cb`.

## Measured changes

| Measure | 1.0.4 | 1.0.5 |
| --- | ---: | ---: |
| Windows download ZIP | 410,485,546 bytes | 170,824,848 bytes |
| Packaged entries | 424 | 351 |
| Flat application modules | 52 | 41 |
| Flat module source | 297,957 bytes | 267,544 bytes |

The download is **58.38% smaller**, saving 239,660,698 bytes. Required Electron runtime, GPU fallbacks, locale packs, OCR cores/data and PDF fonts/maps/WASM remain included. Compression reduces the download; the installed app still contains those runtime files.

## Cleanup performed

- Removed 13 unused application/data files and 61 unused jsdiff source/declaration/map files; retained every required license. Removed the one-time upstream-test import script.
- Removed obsolete spelling/review-only exports and their otherwise-unused imports. The document-construction function is byte-identical to the baseline, and its OCR dictionaries remain intact.
- The standalone planner skips allocating a full expected revised bill and per-token origin arrays it never reads. Upstream verification keeps its original default behavior.
- Source bytes are read once and fingerprinted before parsing. Duplicate uploads now skip repeated PDF parsing and OCR; the native duplicate test fell from four reading-progress events to zero.
- The compact output list no longer repeatedly filters all issues for each row. Clearing the cache also releases hidden file-review forms and PDF preview references/buffers.
- ZIP creation uses exact build-only `fflate 0.8.2`, fixed entry order/metadata/chunks and independent Python readback. Two processes with different time zones produced the same whole-archive checksum. Existing manifest, path, tamper, overwrite and remote-asset checks remain enforced.

## Requested follow-up behavior

- A supplied bill's later date alone no longer holds the amendment set.
- Tight line spacing first tries the clear horizontal gutter beside the printed numbers. Arrows still cannot cross digits or bill text, and number labels cannot cover the arrows.
- All amendment-number indicators are rectangular boxes.
- Output names use `AB 1982 March 25 AMENDS IN.pdf`.
- **Amends In Files Created** is a compact numbered bill/date/**View PDF** list. **Review Files** retains file/pairing corrections; **Clear Cache** unloads the current documents and previews.

## Verification

All **181 source tests passed**. The actual packaged Windows app passed the full upload/save/folder/retry/cancellation/OCR-review/error-popup workflow and all requested follow-up behavior. Six ordinary PDFs match strict frozen-exporter references byte for byte, allowing only the requested boxed labels and uppercase title metadata. Additional controlled PDFs verify tight-margin placement and the removed date warning. Original AB 1967 and AB 2266 files still produce all 18 instructional marks; only the three exact previously reviewed OCR readings were confirmed.

All original input hashes and all 351 packaged file hashes remained unchanged. The independently verified compressed ZIP has SHA-256 `794499f6cd529821c747401e6a639ba3177b5a42c3f259a7961a2279f8cc2ab4`. Folder-picker interaction used controlled QA responses; actual trusted IPC and real file writes were exercised. These checks are not a measured human precision/recall benchmark.
