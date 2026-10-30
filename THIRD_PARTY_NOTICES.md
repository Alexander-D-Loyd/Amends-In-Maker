# Third-party notices

Amends In Maker retains the original license files of its bundled components.

| Component | Purpose | Notice in the Windows folder |
| --- | --- | --- |
| Electron and Chromium | Desktop runtime | `LICENSE`, `LICENSES.chromium.html` |
| PDF.js | Original PDF reading, rendering, fonts, maps and WASM | `resources/app/app/vendor/LICENSE` and bundled asset notices |
| PDF-lib | Add vector marks to copies of original PDFs | `resources/app/app/vendor/pdf-lib-LICENSE.md` |
| Tesseract.js and its core | Local OCR | `resources/app/app/vendor/ocr/tesseract.js-LICENSE.txt`, `tesseract.js-core-LICENSE.txt` |
| Tesseract English trained data | Local printed-text recognition | `resources/app/app/vendor/ocr/tessdata-LICENSE.txt` |
| jsdiff | Amendment token alignment | `resources/app/app/vendor/diff-LICENSE` |
| Typo.js | Expand dictionary affixes for OCR word-spacing recognition only | `resources/app/app/vendor/typo-LICENSE` |
| SCOWL-derived en_US Hunspell word list | Recognizing joined OCR word boundaries only | `resources/app/app/vendor/en_US/license` |

The OCR word list is not a licensed Merriam-Webster export and is not used to provide stylistic or dictionary-preference findings. The app contains no spelling/grammar review interface.

Selected application helpers come from the user's Document Compare project. Their source commit and original hashes are recorded in `upstream-provenance.json`. No uploaded bill, test PDF, personal dictionary, profile or source-extraction model is included in the public distribution.
