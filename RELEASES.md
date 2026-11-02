# Published releases

## 1.0.8 — November 2, 2026

[Download AiM for Windows](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.8).

Compound title amendments can now strike a quoted portion of the first line, complete intervening lines, and a quoted portion of the final line before inserting replacement language. Both printed-number and unnumbered title rows are supported. Replacement strokes remain plain blue lines without arrowheads. Every clause must resolve safely; an unresolved clause holds that entire amendment for review.

The issue popup now provides continuous scrolling through the original PDF, with a Page field and Go button; Enter also jumps to the typed page. Original amendment highlights remain aligned. The viewer can reach original pages after the `-0-` marker without treating them as amendment instructions. Nearby pages render on demand, with at most five resident page canvases; closing the popup or clearing the cache releases them.

All 192 source tests passed locally and on GitHub. The actual packaged Windows app passed the full batch/folder/cancel/retry/cache/error/preview/OCR regression. Two controlled compound-title PDFs verified partial/full/partial markings across five physical rows with zero changed body pixels outside the requested strikeouts. An eight-page source PDF verified scroll, mouse wheel, typed jumps, Enter, invalid-page rejection, highlighting, rapid reopening and cleanup, including an 800-by-680 window. All six previous output PDFs matched their approved bytes exactly; original inputs and all 356 packaged files stayed unchanged. Folder-choice responses were controlled during QA; trusted IPC and real file writes were exercised. These checks are not a measured human precision/recall benchmark.

Published from main by [the successful workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41502992888). Tag `v1.0.8` targets tested source `410c769a58b37851f5ea6bb26ae7e94989988cb4`. The tested ZIP was reconstructed with zero normalized files; both published asset sizes and SHA-256 digests, the latest release and the tag target were verified.

ZIP: `Amends-In-Maker-Windows-1.0.8.zip` (170,912,240 bytes). Keep `AiM.exe`, `Application Files` and `Documents` together and open `AiM/AiM.exe`.

SHA-256: `f43d4d496e8c8cd8edb2b31a3f704d78785d8ca0ce4e330cb578d5e4e99d5276`.

## 1.0.7 — October 30, 2026

[Download the cleaner AiM Windows package](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.7).

The extracted AiM folder now contains only `AiM.exe`, `Application Files` and `Documents`. The top-level launcher embeds the approved AiM icon for File Explorer. Electron and its required files remain together in Application Files. Instructions, README, license notices and the package manifest are in Documents.

The launcher forwards arguments without a shell, starts the runtime from its own directory, and closes its child processes when it exits. Its committed binary is bound to the source and approved icon by hashes. Windows' existing .NET Framework runs the launcher; no developer SDK is needed. Package manifest format 2 records the separate launcher and original Electron executable. Original flat-release receipts remain supported.

All 185 source tests passed locally and on GitHub. The actual Windows package passed the complete batch/folder/cancel/retry/cache/error/preview/OCR regression through the top-level launcher. All six output PDFs matched the previous approved bytes exactly; original inputs and all 355 packaged files stayed unchanged. All seven embedded 16–256 pixel icon images matched the approved ICO bytes exactly. Argument forwarding was exercised with spaces and Unicode in the profile path. The reorganized downloaded copy also passed a two-PDF export at its original launch location, and its original 354 files were preserved in a local backup with no deletion.

Published from main by [the successful workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41156297810). Tag `v1.0.7` targets tested source `78a1682232c703a28f8f6c64bc4a72dcf244fe3d`. The tested ZIP was reconstructed with zero normalized files; both published assets and the tag target were verified. Folder-choice responses were controlled during QA; trusted IPC and real file writes were exercised. These checks are not a measured human precision/recall benchmark.

ZIP: `Amends-In-Maker-Windows-1.0.7.zip` (170,908,007 bytes). Keep the three top-level items together and open `AiM/AiM.exe`.

SHA-256: `1d19693f4a1e76a2fbbde6c9a638b9fe42e1238d63dc1ed0bc53cfbcd6021cb0`.

## 1.0.6 — October 30, 2026

[Download AiM for Windows](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.6).

The selected Folio layout now uses Workbench's Segoe UI typography. Warm graphite and plum surfaces place file intake and the remembered output folder on the left, with a compact numbered created-files list on the right. The app title, header, menu and executable use `AiM`, without punctuation, with matching SVG, PNG and multi-size Windows icon assets.

Batch matching, automatic saving, independent successful marks, original-instruction error review, retry, Clear Cache and PDF markings retain their existing behavior. The prior settings location and saved-folder format remain compatible across the name change.

All 182 source tests passed locally and on GitHub. The actual packaged Windows app passed the complete batch/folder/cancel/retry/cache/error/preview/OCR regression. Six output PDFs matched the previous approved bytes exactly. Original inputs and all 354 packaged files stayed unchanged. The selected layout, loaded icon and file-review controls were verified at 1280, 1024, 760 and 320 pixels with no horizontal overflow or renderer exceptions. Startup path checks and a packaged-app upgrade fixture verified the previous settings location, explicit profile overrides and remembered-folder format. Folder-choice responses were controlled during QA; trusted IPC and real file writes were exercised.

Published from main by [the successful workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41151524642). Tag `v1.0.6` targets tested source `3684efc28572a77ce0262f0dc0c7f233f3a7bfc9`. The exact tested ZIP was reconstructed with zero normalized files; both remote assets and the tag target were verified. These checks are not a measured human precision/recall benchmark.

ZIP: `Amends-In-Maker-Windows-1.0.6.zip` (170,861,182 bytes). Extract the complete ZIP and open `AiM/AiM.exe`.

SHA-256: `6b7cef8c310bfdee3eb8f8265fe325b8f38681248f1e80eb26a8e2789f3662e8`.

## 1.0.5 — October 30, 2026

[Download the Windows release](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.5).

- Outputs now use `AB 1982 March 25 AMENDS IN.pdf`. Every amendment number is boxed.
- The compact numbered results list is labeled “Amends In Files Created”; controls use “Clear Cache” and “Review Files”. Clearing the cache preserves saved PDFs and the remembered output folder.
- Insertion arrows use a clear gutter beside printed digits when the vertical gap is tight. The generic warning about a bill dated after the amendments has been removed.
- Duplicate uploads skip repeated PDF/OCR processing. Unused modules, guide data and vendored diff files were removed, while required PDF/OCR resources were retained.
- Deterministic streamed compression reduces the download by 58.38% compared with 1.0.4. Installed runtime requirements remain unchanged.

All 181 source tests passed locally and on GitHub. The actual packaged Windows app passed batch upload, remembered-folder and retry recovery, duplicate/no-overwrite, cancellation, partial results, source-instruction popups, compact UI, boxed indicators, tight-gap arrows, first/last-line insertion, author strikes and original AB 1967/2266 checks. Original inputs and all 351 packaged files remained unchanged. Six ordinary output PDFs matched independently reconstructed approved references byte for byte; only the requested rectangular indicators and uppercase filename metadata differed from 1.0.4. Folder-choice responses were controlled during QA; trusted IPC and real file writes were exercised.

Published from main by [the verified workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41144468810). Tag `v1.0.5` targets tested source `bd036bd1aeb5d0f9174a0394def39528533e0525`. The exact tested ZIP was independently reconstructed and both published asset sizes and SHA-256 digests were verified. These checks are not a measured human precision/recall benchmark.

ZIP: `Amends-In-Maker-Windows-1.0.5.zip` (170,824,848 bytes).

SHA-256: `794499f6cd529821c747401e6a639ba3177b5a42c3f259a7961a2279f8cc2ab4`.

## 1.0.4 — October 30, 2026

[Download the Windows release](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.4).

- Above/below printed-line instructions now place arrows in the correct margin gap, including above the first and below the last numbered line. Only the actual referenced number is highlighted. Missing lines, unsafe digit overlap and insufficient badge space remain held.
- Red and blue strikeout lines are moderately thicker. Replacements remain plain blue lines.
- Exact author and wrapped coauthor deletions are marked in their heading. Narrow, unambiguous title-worded author-role deletions are also supported; no general name-only or body-text fallback is used.
- Filenames now follow `AB 1982 March 25 Amends In.pdf`, without a year. Full dates remain internal; identical month/day output names are reported as collisions.
- A native PDF's established margin column can identify a short later page with one to three matching numbered rows. This does not lower the default OCR threshold or invent blank margin numbers.

All 168 source tests passed locally and on GitHub. The actual packaged Windows app passed controlled first/last/internal arrow, three-line final page, thicker-strike, title/heading author, missing-line popup and new-filename checks. All six fixture PDF hashes and all 424 packaged file hashes stayed unchanged. Body/end-marker pixels outside requested strikeouts and preview/export pixels matched. The exact tested ZIP and both published asset digests were verified.

Published from main by [the verified workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41141526499). Tag `v1.0.4` targets source `c6d33f7e38e3b561bf3c42368862268fa8fc37cb`. This functional release was published before the cleanup audit resumed.

ZIP: `Amends-In-Maker-Windows-1.0.4.zip` (410,485,546 bytes).

SHA-256: `66c4c7e15d250a5d55d8c50d7f8f305f6dd6f51d6f4c44e9d5be7a9b01102b82`.

## 1.0.3 — October 30, 2026

[Download the Windows release](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.3).

Strike-and-insert marks are now plain blue lines, with no arrowheads. Insert-after and between-line insertion arrows use common length, head and stroke settings, fitted to available source space. Packaged instructions and README reflect these conventions.

All 136 source tests passed locally and on GitHub. The actual packaged Windows app produced replacement lines with no arrowheads and matching insertion-arrow extents at 288 dpi: 25 by 57 pixels for the upward arrow and 57 by 25 for the rightward arrow. Following-word pixels and original inputs were unchanged; preview and export pixels matched at the same zoom.

Published from main by [the verified workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41137388602). Tag `v1.0.3` targets source `ce1e31eb205347c9e757662f9d9210eda183e529`. The exact 424-entry tested package was reconstructed before publication and both remote assets were verified.

ZIP: `Amends-In-Maker-Windows-1.0.3.zip` (410,473,415 bytes).

SHA-256: `58a7e59f1561498a95502239e934df5fbb892ade4e759bdbdc3aa07308279691`.

## 1.0.2 — October 30, 2026

[Download the Windows release](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.2).

Blue replacement arrows now finish within the struck text, including their painted stroke, so they do not extend into the following word. Short targets keep their arrows within the selected span. Insertion arrows have larger heads and thicker strokes; stems grow where line spacing allows.

All 136 source tests passed locally and on GitHub. The actual packaged Windows app exported an italic `their own` case and a one-letter replacement: following-word pixels were identical to the original at 288 dpi. Insertion-arrow extents increased, original inputs remained unchanged, and preview/export pixels matched at the same zoom. The 424-entry package and both published assets matched the tested checksums.

Published from main by [the verified workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41136303117). Tag `v1.0.2` targets source `789bd4429d2e4f47e07104a938a35b0118abc8b0`.

ZIP: `Amends-In-Maker-Windows-1.0.2.zip` (410,474,717 bytes).

SHA-256: `069bc61c3e65a4ad4fa45452b467273a560ee8734c806c31e1f6411badf92ec3`.

## 1.0.1 — October 30, 2026

[Download the Windows release](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.1).

The app now opens on a drop-file homepage, pairs bills and amendments by filename without requesting a current version, and automatically saves to a remembered, changeable output folder. Names follow `AB 1982 Amends In March 25, 2026.pdf`. Missing files and unmarked amendments open the original instruction PDF with the affected amendment highlighted. Successful independent marks can be saved while failures remain clearly reported.

Published successfully by [the verified workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41134395401), from main. Tag `v1.0.1` targets source commit `69a030d3edc2cd3b910a7ff3328cf8820043423e`.

- All 135 source tests passed locally and on GitHub.
- The actual 1.0.1 Windows EXE passed batch auto-save, folder restart/change/cancellation, stale-folder handling, successful retry recovery, duplicate/no-overwrite protection, partial results, issue-page highlighting, rapid popup reopening and accurate skipped-preview status.
- Original AB 1967 and AB 2266 Previous+AMENDS pairs produced 8/8 and 10/10 marked amendments without another bill version or a manual date. Only three exact, previously reviewed AB 2266 OCR readings were confirmed after original-file hash checks.
- All 424 packaged file hashes and all original input hashes remained unchanged. Native preview and exported PDF pixels matched exactly. Folder-choice interaction used controlled QA responses; trusted IPC and real file writes were exercised.
- GitHub reconstructed the exact tested ZIP before publication; both published asset sizes and SHA-256 digests were verified.

ZIP: `Amends-In-Maker-Windows-1.0.1.zip` (410,474,227 bytes).

SHA-256: `899de95fa082b1524086f528ed9bbe86ac5c582e2824623447340faec21b33b9`.

The exact receipt and package manifest are in `.github/release-receipts/1.0.1.json` and its companion manifest. Human review is still required for uncertain readings and unavailable locations; these checks are not a measured precision/recall benchmark.

## 1.0.0 — October 30, 2026

[Download the Windows release](https://github.com/Alexander-D-Loyd/Amends-In-Maker/releases/tag/v1.0.0).

Published successfully from main by [the verified publishing workflow](https://github.com/Alexander-D-Loyd/Amends-In-Maker/actions/runs/41130783554). Tag `v1.0.0` targets tested source commit `f7d99b92ea9fdefb6e563d84bd37dc695164bd3b`.

- 107 source tests passed locally and on GitHub.
- The actual packaged Windows app passed batch intake, all four marking styles, identical preview/export, OCR confirmation, duplicate detection and no-overwrite checks.
- Original AB 1967 and AB 2266 checks located all 18 instructional amendments across 14 output pages. All seven original PDFs stayed unchanged; pixels outside annotation bounds stayed identical. Three previously reviewed unchanged OCR readings were confirmed.
- GitHub reconstructed the exact locally tested 421-entry Windows ZIP before publication. Both published assets were verified by their byte counts and SHA-256 digests.

ZIP: `Amends-In-Maker-Windows-1.0.0.zip` (410,468,716 bytes).

SHA-256: `8f431e1349757584d09f0533988b9b14f5d993f82cdbc7fe25e2fa9098e2686a`.

Exact publication inputs are recorded in `.github/release-receipts/1.0.0.json` and its package manifest. Git preserves the tested source bytes, including mixed line endings. The first publication attempt stopped safely because normalization could not reconstruct those bytes; the successful run preserved them without changing the tested app or package.

Ambiguous readings, unavailable locations and missing drafting references still require human review. See README.md for the supported instructions and limits. These checks are not a measured human precision/recall benchmark.
