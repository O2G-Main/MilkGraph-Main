# Operasional — Status Pemenuhan

The Prediksi pemenuhan tab at `/produksi?tab=prediksi` under Operational provides date-scoped, backend-based fulfillment status. `/operasional/prediksi` redirects to this tab. Default date is today in WIB; optional `date` deep links are strictly validated. Production now groups factory conditions, process management and fulfillment prediction under Operational; Master contains equipment and products. The tabs share the selected date and retain batch context without duplicating the data model.

Each assessed batch displays its latest backend status, target, predicted shortage, reference asset, assessment time, and collapsible input comparison. Missing assessments appear separately as Belum dihitung after valid daily and prediction responses. Loading or failures do not become an empty/zero assessment. Status uses both text and colored icons. On mobile, cards stack.

Risk/unfulfilled results offer a recommendation button. Recommendations must match date, batch ID, and prediction ID exactly, and rejected results are excluded. Links retain date, batch, and prediction in `/rencana/upgrade` query parameters so refresh and direct navigation preserve the assessment. The destination filters to this assessment; the user can explicitly remove the prediction filter or select another date/batch. Recalculating removes the old prediction focus so newly generated recommendations are visible.

Choice provenance is shown from `reason_facts.sumber_pilihan`: jev = Dipilih AI; template = Dipilih aturan BE; missing/unknown = source not supplied. The FE does not call the generic traceability assistant, invent a ranking from expected_gain, or label rules as AI. The production BE already supplies a dedicated chooser and fallback. It chooses among upgrade_kapasitas, naikkan_speed, pindahkan_alat, and geser_jadwal according to its facts/candidates. A recommendation is a proposal for review, not proof of the action's feasibility or a guarantee of fulfillment.

The current BE prediction compares batch milk demand with stock and supply. It does not reserve stock across batches, simulate machine capacity/time, or prove that speed/upgrade resolves insufficient milk. The page states this scope. The AI choice does not automatically edit equipment, relocate physical equipment, or change schedules. Run/decision actions preserve existing backend permissions; roles without access to recommendations are directed to Planner.

Verification:
- typecheck, lint, 213 Node tests, production build.
- `node tests/operational-status-browser.mjs`: mocked GET-only scenarios, risk/fulfilled/unassessed status, explicit AI vs rules, stale recommendation exclusion, exact deep-link scope, keyboard navigation, refresh persistence, reset, error/empty, 320/768/1024/1440 px.
- Read-only live browser check of 1 November 2026 predictions: API currently returns fulfilled sample data with no recommendations. Adverse and AI/fallback cases use fixtures; production data is not modified to create these scenarios.
