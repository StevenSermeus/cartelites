import assert from "node:assert/strict";
import test from "node:test";
import {
  loadReceiptDocument,
  publishSignedArchive,
} from "../src/data/receiptDocument";

test("opening a signed dossier retrieves its latest immutable original, never an unsigned regeneration", async () => {
  const calls: string[] = [];
  const result = await loadReceiptDocument(
    async () => [
      { id: "old", signedAt: 10 },
      { id: "draft" },
      { id: "new", signedAt: 20 },
    ],
    async (id) => {
      calls.push(id);
      return { pdfBase64: "SIGNED-PDF-BYTES" };
    },
    async () => {
      throw new Error("Must not regenerate a signed document");
    },
  );
  assert.deepEqual(calls, ["new"]);
  assert.deepEqual(result, { pdf: "SIGNED-PDF-BYTES", archived: true });
});
test("unsigned dossier generates an actual preview and ignores preparation drafts", async () => {
  const result = await loadReceiptDocument(
    async () => [{ id: "draft" }],
    async () => {
      throw new Error("Not signed");
    },
    async () => "PREVIEW",
  );
  assert.deepEqual(result, { pdf: "PREVIEW", archived: false });
});
test("archive or listing failure is surfaced without substituting an unsigned PDF", async () => {
  let generated = false;
  const preview = async () => {
    generated = true;
    return "WRONG";
  };
  await assert.rejects(
    loadReceiptDocument(
      async () => [{ id: "signed", signedAt: 1 }],
      async () => {
        throw new Error("Archive unavailable");
      },
      preview,
    ),
    /Archive unavailable/,
  );
  await assert.rejects(
    loadReceiptDocument(
      async () => {
        throw new Error("Offline");
      },
      async () => ({ pdfBase64: "" }),
      preview,
    ),
    /Offline/,
  );
  assert.equal(generated, false);
});

test("successful signature clears unsigned preview even when archive download fails", async () => {
  let shown: string | null = "UNSIGNED";
  await assert.rejects(
    publishSignedArchive(
      () => {
        shown = null;
      },
      async () => {
        assert.equal(shown, null);
        throw new Error("Archive temporarily unavailable");
      },
      (pdf) => {
        shown = pdf;
      },
    ),
    /Archive temporarily unavailable/,
  );
  assert.equal(shown, null);
});

test("signed original is published only after unsigned preview has been invalidated", async () => {
  const events: string[] = [];
  await publishSignedArchive(
    () => {
      events.push("invalidate");
    },
    async () => {
      events.push("fetch");
      return "SIGNED";
    },
    (pdf) => {
      events.push(pdf);
    },
  );
  assert.deepEqual(events, ["invalidate", "fetch", "SIGNED"]);
});
