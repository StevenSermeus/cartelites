import { test } from "node:test";
import assert from "node:assert/strict";
import { dateFilters } from "../src/data/dateFilters";

test("date filters never send partial, impossible or reversed dates to the API", () => {
  for (const [from, to] of [
    ["2026-1", ""],
    ["2026-02-30", ""],
    ["2026-11-20", "2026-11-19"],
  ]) {
    const result = dateFilters(from, to);
    assert.ok(result.error);
    assert.equal(result.from, undefined);
    assert.equal(result.to, undefined);
  }
});
test("date bounds include the full local day and may be omitted", () => {
  assert.deepEqual(dateFilters("", ""), {
    from: undefined,
    to: undefined,
    error: "",
  });
  const bounds = dateFilters("2024-02-29", "2024-02-29");
  assert.equal(bounds.error, "");
  assert.equal(bounds.to! - bounds.from!, 86_399_999);
  assert.equal(dateFilters("", "2026-11-20").from, undefined);
});
