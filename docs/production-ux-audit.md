# Production UX audit

Scope: the Produksi prediction and plant-flow tabs, and the AI comparison entry reached through recommendations. Backend computation and permissions remain authoritative.

| Ambiguity | Change |
| --- | --- |
| Bare status count such as “1” | Every count includes “batch”, with assessed/total coverage and missing-batch information. |
| Daily aggregate counted as a batch | Whole-day predictions are labelled separately and excluded from batch totals. |
| Unsupported status silently omitted | Unknown statuses enter “Belum dapat dinilai”; inconsistent batch catalog coverage is called out. |
| Missing shortage described as not calculated | Missing, zero and invalid amounts are distinct; the UI does not infer why a field is absent. |
| Fulfilled prediction read as actual output | Copy identifies the forecast, dated calculation and separate production history. Positive-shortage/fulfilled contradictions are explicitly flagged. |
| No target context | Batch targets in liters are summed once per PO/line; incomplete targets remain unavailable. |
| Existing BE input facts hidden | Batch demand, opening stock and planned supply appear with liter units. Their snapshot nature and lack of guaranteed batch allocation are explicit. They are never summed across batches or used to invent a formula. |
| Readback vs recomputation | “Perbarui tampilan” reads stored results; “Hitung prediksi”/“Hitung ulang prediksi” runs computation. Empty production and absent forecasts have separate messages. |
| Unclear date scope/format | Indonesian DateField, WIB labels, dated result heading, and explicit separation from current plant configuration. |
| Recommendation link implies existing result | Candidate count and exact prediction linkage are shown; “Periksa rekomendasi” is used when no active candidate is confirmed. |
| Green flow edges imply actual milk movement | Persistent configuration explanation, filtered asset/route counts, route units and clarified missing fields. |
| AI action implies unsupported production context | Production AI comparison is marked unavailable after verifying the current assistant uses traceability facts. See the BE source audit. |

Verification: TypeScript, ESLint, production build, 192 Node tests, and browser scenarios at 320/768/1024/1440 px. Browser cases cover one-batch units, partial coverage, whole-day assessments, unsupported status, empty production, missing/malformed results, read failures/retry, prediction inputs including zero supply, accessible date selection, recommendation context, AI error handling, role gates, and 2D/3D flow navigation. Live verification uses GET requests only. Source prediction responses for the current production date confirm the input fact keys `batch_demand_l`, `opening_stock_l`, `planned_supply_l` and `opening_inventory_rows`.

Subsequent source verification and visualization scope: [Backend production visualization](backend-production-visualization.md).
