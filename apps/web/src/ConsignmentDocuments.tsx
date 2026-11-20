import { useEffect, useRef, useState } from "react";
import { ReceiptSigning } from "./ReceiptSigning";
import type { Consignment } from "./ConsignmentsPage";
type Request = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Document = {
  id: string;
  kind: string;
  reference: string;
  createdAt: number;
  archived: boolean;
};
type Return = {
  _id: string;
  occurredAt: number;
  itemIds: string[];
  conditionNotes: string;
  completedAt?: number;
};
export function ConsignmentDocuments({
  deposit,
  request,
  onChanged,
}: {
  deposit: Consignment;
  request: Request;
  onChanged: () => void;
}) {
  const [documents, setDocuments] = useState<Document[]>([]),
    [returns, setReturns] = useState<Return[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pdf, setPdf] = useState("");
  const busyRef = useRef(false);
  const attempt = useRef({ key: "", id: crypto.randomUUID() });
  const load = () =>
    Promise.all([
      request<Document[]>(
        `/consignments/documents?sellerId=${encodeURIComponent(deposit.sellerId)}`,
      ).then(setDocuments),
      request<Return[]>(
        `/consignments/returns?consignmentId=${encodeURIComponent(deposit._id)}`,
      ).then(setReturns),
    ]);
  useEffect(() => {
    void load().catch((e) => setError(String(e.message ?? e)));
    return () => {
      setPdf((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    };
  }, [deposit._id]);
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    const d = await request<{ pdfBase64: string }>(
      `/consignments/documents/${id}/pdf`,
    );
    setPdf((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(
        new Blob([Uint8Array.from(atob(d.pdfBase64), (c) => c.charCodeAt(0))], {
          type: "application/pdf",
        }),
      );
    });
  };
  const prepareReturn = async () => {
    const occurredAt = new Date(`${date}T12:00:00`).getTime();
    if (
      !selected.length ||
      !notes.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(occurredAt) ||
      new Date(occurredAt).toLocaleDateString("en-CA") !== date
    )
      throw new Error(
        "Sélectionnez les articles, une date valide et leur état à la remise.",
      );
    const input = {
      consignmentId: deposit._id,
      itemIds: selected,
      occurredAt,
      conditionNotes: notes.trim(),
    };
    const key = JSON.stringify(input);
    if (attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    await request("/consignments/returns/prepare", {
      method: "POST",
      body: JSON.stringify({ ...input, operationId: attempt.current.id }),
    });
    setSelected([]);
    setNotes("");
  };
  return (
    <section className="panel" aria-label="Documents du dépôt">
      <h3>Documents et restitution</h3>
      <p>
        Décomptes et reversements : tous les dépôts de {deposit.sellerName}. Les
        documents sont figés à leur création.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const { id } = await request<{ id: string }>(
              "/consignments/documents/statement",
              {
                method: "POST",
                body: JSON.stringify({
                  operationId: crypto.randomUUID(),
                  sellerId: deposit.sellerId,
                }),
              },
            );
            await open(id);
          })
        }
      >
        Générer le décompte PDF
      </button>
      <ul>
        {documents.map((d) => (
          <li key={d.id}>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => open(d.id))}
            >
              {d.kind === "payment"
                ? "Justificatif de reversement"
                : "Décompte"}{" "}
              · {new Date(d.createdAt).toLocaleDateString("fr-BE")} ·{" "}
              {d.archived ? "Archivé" : "Ouvrir et archiver"}
            </button>
          </li>
        ))}
      </ul>
      <details>
        <summary>Restituer des articles au déposant</summary>
        <p>
          Sélectionnez uniquement les articles remis. Le bon signé enregistrera
          leur restitution une seule fois.
        </p>
        {deposit.items
          .filter((i) => i.status === "available")
          .map((i) => (
            <label key={i._id}>
              <input
                type="checkbox"
                checked={selected.includes(i._id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, i._id]
                      : ids.filter((id) => id !== i._id),
                  )
                }
              />
              {i.name}
            </label>
          ))}
        <label>
          Date de remise
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          État des articles à la remise
          <textarea
            value={notes}
            maxLength={5000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !selected.length || !notes.trim()}
          onClick={() => void run(prepareReturn)}
        >
          Préparer le bon à lire et signer
        </button>
      </details>
      {returns.map((r) => (
        <div key={r._id}>
          <p>
            Restitution du {new Date(r.occurredAt).toLocaleDateString("fr-BE")}{" "}
            · {r.itemIds.length} article(s) ·{" "}
            {r.completedAt ? "Signée" : "À signer — articles encore en dépôt"}
          </p>
          <ReceiptSigning
            kind="consignment_return"
            targetId={r._id}
            request={request}
          />
        </div>
      ))}
      {pdf && (
        <div role="dialog" aria-label="Document PDF">
          <div className="actions">
            <a href={pdf} download="document-depot.pdf">
              Télécharger le PDF
            </a>
            <button
              className="secondary"
              onClick={() => {
                URL.revokeObjectURL(pdf);
                setPdf("");
              }}
            >
              Fermer
            </button>
          </div>
          <iframe
            title="Document du dépôt"
            src={pdf}
            style={{ width: "100%", height: "75vh", border: 0 }}
          />
        </div>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            onChanged();
          })
        }
      >
        Actualiser les documents et le dossier
      </button>
    </section>
  );
}
