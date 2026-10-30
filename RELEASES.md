# Published releases

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
