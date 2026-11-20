import { createHash } from "node:crypto";
import { z, type OpenAPIHono } from "@hono/zod-openapi";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Variables } from "../auth/middleware.js";
import { env } from "../env.js";
import { receiptIdentity } from "../receiptIdentity.js";
import { requestR2 } from "../storage/r2.js";
import {
  createConsignmentDocumentPdf,
  type ConsignmentDocumentInput,
} from "../receipts/consignmentDocument.js";

type Document = {
  _id: string;
  snapshot: ConsignmentDocumentInput;
  identity?: typeof receiptIdentity;
  objectKey?: string;
  sha256?: string;
  filename?: string;
};
const service = new ConvexHttpClient(env.CONVEX_URL);
const call = <T>(operation: string, payload: Record<string, unknown>) =>
  service.action(makeFunctionReference<"action">("authService:execute"), {
    secret: env.CONVEX_AUTH_SECRET,
    operation,
    payload,
  }) as Promise<T>;
const statement = z.object({
  operationId: z.string().uuid(),
  sellerId: z.string().min(1),
});
const returnDraft = z.object({
  operationId: z.string().uuid(),
  consignmentId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1).max(200),
  occurredAt: z
    .number()
    .int()
    .refine((n) => Number.isFinite(new Date(n).getTime())),
  conditionNotes: z.string().trim().min(1).max(5000),
});
export function registerConsignmentDocumentRoutes(
  app: OpenAPIHono<{ Variables: Variables }>,
) {
  app.post("/consignments/documents/statement", async (c) => {
    const input = statement.safeParse(await c.req.json());
    if (!input.success) return c.json({ error: "INVALID_DOCUMENT" }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get("accessToken"));
    const id = await client.mutation(
      makeFunctionReference<"mutation">("consignmentDocuments:createStatement"),
      input.data as never,
    );
    return c.json({ id }, 201);
  });
  app.get("/consignments/documents", async (c) => {
    const sellerId = c.req.query("sellerId");
    if (!sellerId) return c.json({ error: "SELLER_REQUIRED" }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get("accessToken"));
    return c.json(
      await client.query(
        makeFunctionReference<"query">("consignmentDocuments:list"),
        { sellerId },
      ),
    );
  });
  app.get("/consignments/documents/:id/pdf", async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get("accessToken"));
    let row = (await client.query(
      makeFunctionReference<"query">("consignmentDocuments:get"),
      { id: c.req.param("id") },
    )) as Document;
    row = await call<Document>("consignmentDocumentIdentity", {
      id: row._id,
      identity: receiptIdentity,
    });
    if (!row.objectKey) {
      const bytes = Buffer.from(
        createConsignmentDocumentPdf(
          row.snapshot,
          row.identity!.logo,
          row.identity!,
        ),
        "ascii",
      );
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const objectKey = `consignment-documents/${row._id}/${sha256}.pdf`,
        filename = `${row.snapshot.reference.replace(/[^a-z0-9-]/gi, "-")}.pdf`;
      const response = await requestR2(
        "PUT",
        objectKey,
        bytes,
        "application/pdf",
      );
      if (!response.ok) return c.json({ error: "ARCHIVE_UNAVAILABLE" }, 503);
      await call("consignmentDocumentArchive", {
        id: row._id,
        objectKey,
        sha256,
        filename,
      });
      row = { ...row, objectKey, sha256, filename };
    }
    const response = await requestR2("GET", row.objectKey!);
    if (!response.ok) return c.json({ error: "ARCHIVE_UNAVAILABLE" }, 503);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== row.sha256)
      return c.json({ error: "ARCHIVE_INTEGRITY_ERROR" }, 503);
    c.header("Cache-Control", "private, no-store");
    return c.json({
      pdfBase64: bytes.toString("base64"),
      filename: row.filename,
    });
  });
  app.post("/consignments/returns/prepare", async (c) => {
    const input = returnDraft.safeParse(await c.req.json());
    if (!input.success) return c.json({ error: "INVALID_RETURN" }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get("accessToken"));
    const id = await client.mutation(
      makeFunctionReference<"mutation">("consignmentDocuments:prepareReturn"),
      input.data as never,
    );
    return c.json({ id }, 201);
  });
  app.get("/consignments/returns", async (c) => {
    const consignmentId = c.req.query("consignmentId");
    if (!consignmentId) return c.json({ error: "CONSIGNMENT_REQUIRED" }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get("accessToken"));
    return c.json(
      await client.query(
        makeFunctionReference<"query">("consignmentDocuments:returns"),
        { consignmentId },
      ),
    );
  });
}
