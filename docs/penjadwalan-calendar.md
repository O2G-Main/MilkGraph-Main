# Penjadwalan: calendar and daily batches

The API-mode entry screen shows a monthly calendar and the selected Sunday–Saturday production week. Hovering a date (mouse, after 200 ms), keyboard focus, or selecting a date previews that production week without entering daily detail. The visible month stays stable during hover, including adjacent-month dates. The explicitly labelled Detail rows open daily batches grouped by filling line. Returning to the calendar restores keyboard focus to the selected date. The initial production date uses Asia/Jakarta.

## Component source

`components/penjadwalan/production-calendar.tsx` adapts the single-date calendar, six-week grid, keyboard navigation and reduced-motion transition from **Wensity Calendar**, published on 21st.dev as `wensity/calendar`.

Pinned source: https://github.com/ksparth12/wensity-shadcn-registry/blob/37e75764e2326eeda9533a73bb7434edb7374e82/calendar.json

License: [MIT, Wensity Private Limited](licenses/wensity-calendar-LICENSE.txt). MilkGraph replaces the original styling with its own design tokens, uses UTC date-only arithmetic with WIB today, and adds production-condition indicators for all 42 visible dates.

## Backend mapping

- `/production/plans?from=<Sunday>&to=<Sunday>` supplies weekly proposals. Targets are counted once per proposal even when multiple batches are linked. Unlinked targets mean proposals with no linked batch; they do not mean remaining actual production.
- Seven `/production/schedule?date=...` reads supply the selected week's batches. Calendar condition icons use the daily view independently of the selected week. Selecting a date outside the week changes the weekly reads.
- `/production/daily?date=...` supplies batch status, fulfillment prediction, shortage and risk reason for each visible calendar date. Calendar cells own these reads; preview rows observe the same resource without refetching on mount. Daily detail loads its own selected date. A failed read or unknown value never becomes an empty or safe date.
- `/trace/history` supplies completed filling volume for the displayed week. This is historical output, not remaining target or available capacity.
- `/production/predictions?date=...&batch_id=...` supplies fulfillment and shortage in batch details.
- `/session` permissions gate batch creation and the existing PO tools. Batch creation posts the documented `/production/batches` payload. Backend validation remains authoritative.
- Existing PO import, generator, triggers and narration remain in the separate “PO & versi jadwal” dialog. The global generator does not claim to edit daily batch sequences.

No documented endpoint currently supports modifying saved batches, sequence changes, draft/apply versions or moving shortages to another day. These actions are not simulated in the UI. Real backend writes were not used for verification.

## Verification

- TypeScript typecheck, ESLint, 184 Node tests and production build passed.
- Browser checks at 320, 768, 1024 and 1440 pixels: calendar and daily detail have no page overflow.
- Keyboard date selection, hover preview, date-click preview, stable month at boundaries, daily navigation, return focus and batch detail verified.
- Intercepted API fixtures verified: default WIB date, weekly filters, partial read errors/retry, empty schedules, permissions, batch validation failure, successful creation/refetch and confirmation before discarding changes.
- Read-only live API checks verified the November 1, 2026 week (88 proposals) and daily batches.

## Calendar conditions

The most urgent known condition wins: explicit blocked/late/failed batch or `tidak_terpenuhi` prediction; an unfinished recognized batch on a past WIB production date; `berisiko` or positive predicted shortage; insufficient/unknown data; all batches completed; otherwise scheduled/running. Empty days, pending reads and failed reads are distinct.

Green **Selesai** confirms the backend batch lifecycle status only. The daily endpoint does not expose measured filling volume. Fulfillment and `shortage_l` remain forecasts; `terpenuhi` alone cannot turn a scheduled batch green. Multiple PO/line rows repeat batch predictions, so shortages are aggregated once per batch (maximum known value for that batch), with partial totals explicitly labelled “minimal”. Missing shortages stay unavailable.

No missing real-volume value is calculated as target minus output. No target movement is claimed: the preview explains that transfer status and the destination reference are not available from the backend. Material-volume `/trace/transfers` does not establish target rescheduling.

Browser regression checks cover all condition variants before week selection, mixed conditions, an 8,000 L repeated-batch forecast, failure/retry, keyboard preview and daily details, and all four required viewport widths.
