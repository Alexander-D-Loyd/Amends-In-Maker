# Published releases

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
