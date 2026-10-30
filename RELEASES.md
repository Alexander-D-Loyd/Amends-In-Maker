# Published releases

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
