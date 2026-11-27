# Operational fulfillment and production-flow presentation

Produksi in API mode now focuses on dated fulfillment predictions and read-only plant topology. Batch creation and scheduling remain on Penjadwalan; settings and line configuration remain on Alat.

The prediction panel reads `/production/predictions`, `/production/recommendations`, `/production/daily` and `/session`. Only the newest assessment per batch on the selected date contributes to the summary. Predictions remain estimates rather than actual filling output. A risk, predicted failure or positive shortage offers a recommendation link carrying the selected date and batch through the existing shared PlanningProvider. Candidate labels require the exact prediction ID, date and batch, excluding rejected decisions. Users without recommendation-page access are directed to a planner.

The documented `/production/predictions/run` action is manual and gated by session permissions. Its results are read back through existing planning helpers. No batch, asset adjustment or recommendation decision is automatically written from Operasional.

On recommendations, users can request analysis from the existing `/assistant/chat` endpoint with the candidate IDs and date/batch context. The server response and source labels are displayed; failed or absent AI responses are not replaced by demo answers. This is advisory analysis, not a structured ranking or a validation result. The API does not provide comparable expected-gain units, a ranking contract, or a transactional equipment-adjustment endpoint.

The rules panel reads `/limits`, `/limits/schema`, and the existing read-only `/master/lines` UI. Server ranges and line compatibility remain authoritative for their documented fields. Nominal asset specifications are not treated as permitted upgrade maxima. Backend execution must validate speed/capacity bounds, compatibility, route, tank source and related constraints before applying changes. The current recommendation status endpoint records a decision only.

The API topology now reuses the previous flow presentation: illustrated asset cards, stage headings, compact automatic layout, green connectors and the existing 3D renderer. All IDs, connections and displayed statuses still come from the backend. Connection geometry does not imply actual milk flow; missing statuses stay missing. Unknown equipment types retain a generic icon. The route list and keyboard-accessible inspector remain available.

Verification: typecheck, ESLint, 186 Node tests, production build; fixture-driven browser coverage for prediction-only operation, permission gates, exact prediction/run payload, recommendation context, AI success/failure, rules, empty predictions, illustrated 2D nodes, keyboard inspector, 3D/routes and 320/768/1024/1440 px layouts. Test POSTs were intercepted; no live AI call, asset change or production write was used for verification.
