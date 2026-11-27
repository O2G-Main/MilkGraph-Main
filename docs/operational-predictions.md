# Operational fulfillment and production-flow presentation

The verified behavior and remaining BE requirements are documented in [Backend production visualization](backend-production-visualization.md).

Produksi focuses on dated volume predictions and read-only topology. Penjadwalan owns batch creation/scheduling; Alat owns configuration. Prediction counts use the latest assessment per batch, show coverage and keep whole-day assessments separate. Numeric targets are deduplicated per production line and never substituted for missing facts.

The manual prediction action posts the documented payload, requires `plan.decide`, and reads results back. Risk or shortage links preserve the selected date and batch and show only candidate types tied to the exact prediction. No equipment adjustment is executed from this page.

A stock/supply-versus-demand chart explains the BE input values. It does not reserve stock or evaluate capacity, speed, production time, or simultaneous allocation between batches. Limits and compatibility panels are read-only configuration references. Prediction status and actual output remain separate concepts.

Production AI comparison is unavailable because the current assistant handler supplies a fixed traceability context. The earlier generic-chat comparison integration was removed after source inspection. No demo response is substituted for production analysis.

The plant-flow presentation reuses illustrated cards, stage headings, compact layout, green configured routes and 3D rendering. IDs, routes and recorded statuses come from the BE. Missing states remain missing; geometry does not imply actual flow.
