# PDF preservation evidence

Verified the supplied source archive ZIP integrity and SHA-256 `173603010a6e34761d1037b9ee81ace6a2ceddaae62cc5b4db54a443e004e32e` against its adjacent checksum file. Canonical/API renderers, signatures, identity and logo inputs remain unchanged. `pdf-source-checks.json` includes a changed domain index (schema/export changes); that file is not a renderer. No generator dependency was upgraded.

Reproduce from repository root:

```
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/verify-pdf-preservation.mts /Users/mew/Backups/cartelites/2026-11-23T08-35-10Z/pdf-creation-code.zip
```

The script loads baseline code into a temporary directory, invokes baseline/current renderers with identical fixed inputs, compares PDF bytes, Poppler extracted text and every rendered page PNG. Six fixtures cover short/medium/long buybacks, signed revised consignment, signed return and mixed-payment sale ticket. All bytes/text/render checks pass. Rendered representative pages were visually inspected. These generators emit deterministic bytes for the selected fixed input timestamps; no metadata was stripped or ignored.

The supplied Convex snapshot has 12 receipt records, six referencing archived PDF originals. Six original files were copied from the local R2 backup into `/tmp/cartelites-rehearsal/restored`, parsed with `pdfinfo` and checked against the SHA-256 stored in Convex. All six match. Original backup files were read only and never regenerated. Five attachment images decode successfully (PNG/JPEG/WebP), but lack historical hashes and are explicitly not cryptographically authenticated against source.

See `backup-reconciliation.json` for sanitized local-copy evidence and `pdf-evidence/results.json` for generated-output comparisons. Additional real local API3002/Convex3220 verification now downloads all six archived originals through the canonical document routes and signed-S3 fixture, comparing both recorded SHA-256 and exact backup bytes. Six newly generated document types also pass actual upload/download/replay checks and rendered visual inspection. See `canonical-document-checks.json`. The fixture is local; cloud R2 delivery remains unverified. Raw account/customer rows and original signed PDFs are kept outside the repository.
