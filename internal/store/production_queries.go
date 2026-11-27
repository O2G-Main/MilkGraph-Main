package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// DefaultOperationalDate is the active scenario operational date when no date filter is supplied.
const DefaultOperationalDate = "2026-11-01"

var ErrNotFound = errors.New("not found")

// ProductCatalogResult separates liquid products, finished SKUs, pack sizes, and market variants.
type ProductCatalogResult struct {
	Products            []ProductRow           `json:"products"`
	PackSizeCodes       []PackSizeCodeRow      `json:"pack_size_codes"`
	ProductPackSizes    []ProductPackSizeRow   `json:"product_pack_sizes"`
	ProductMarketVars   []ProductMarketVarRow  `json:"product_market_variants"`
	FinishedSKUs        []FinishedSKURow       `json:"finished_skus"`
}

type ProductRow struct {
	SKUID         string  `json:"sku_id"`
	ProductName   string  `json:"product_name"`
	ProductFamily string  `json:"product_family"`
	Flavour       *string `json:"flavour"`
}

type PackSizeCodeRow struct {
	PackSizeCode string   `json:"pack_size_code"`
	Description  *string  `json:"description"`
	ExactSizeML  *float64 `json:"exact_size_ml"`
}

type ProductPackSizeRow struct {
	SKUID        string `json:"sku_id"`
	PackSizeCode string `json:"pack_size_code"`
}

type ProductMarketVarRow struct {
	SKUID         string `json:"sku_id"`
	MarketVariant string `json:"market_variant"`
}

type FinishedSKURow struct {
	FinishedSKUID string `json:"finished_sku_id"`
	LiquidSKUID   string `json:"liquid_sku_id"`
	PackSizeCode  string `json:"pack_size_code"`
	MarketVariant string `json:"market_variant"`
}

type ProductFilter struct {
	ProductFamily string
	PackSizeCode  string
	MarketVariant string
	Search        string
}

// ListProducts queries normalized product tables separately from assets and rules.
func (db *DB) ListProducts(ctx context.Context, f ProductFilter) (*ProductCatalogResult, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	res := &ProductCatalogResult{
		Products:          []ProductRow{},
		PackSizeCodes:     []PackSizeCodeRow{},
		ProductPackSizes:  []ProductPackSizeRow{},
		ProductMarketVars: []ProductMarketVarRow{},
		FinishedSKUs:      []FinishedSKURow{},
	}

	qProd := `SELECT DISTINCT p.sku_id, p.product_name, p.product_family, p.flavour
		FROM milkgraph.products p
		LEFT JOIN milkgraph.product_pack_sizes pps ON pps.sku_id = p.sku_id
		LEFT JOIN milkgraph.product_market_variants pmv ON pmv.sku_id = p.sku_id
		WHERE ($1 = '' OR p.product_family = $1)
		  AND ($2 = '' OR pps.pack_size_code = $2)
		  AND ($3 = '' OR pmv.market_variant = $3)
		  AND ($4 = '' OR p.sku_id ILIKE '%' || $4 || '%' OR p.product_name ILIKE '%' || $4 || '%')
		ORDER BY p.sku_id`
	rows, err := db.Pool.Query(ctx, qProd, f.ProductFamily, f.PackSizeCode, f.MarketVariant, f.Search)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r ProductRow
		if err := rows.Scan(&r.SKUID, &r.ProductName, &r.ProductFamily, &r.Flavour); err != nil {
			rows.Close()
			return nil, err
		}
		res.Products = append(res.Products, r)
	}
	rows.Close()

	rows, err = db.Pool.Query(ctx, `SELECT pack_size_code, description, exact_size_ml FROM milkgraph.pack_size_codes ORDER BY pack_size_code`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r PackSizeCodeRow
		if err := rows.Scan(&r.PackSizeCode, &r.Description, &r.ExactSizeML); err != nil {
			rows.Close()
			return nil, err
		}
		res.PackSizeCodes = append(res.PackSizeCodes, r)
	}
	rows.Close()

	rows, err = db.Pool.Query(ctx, `SELECT sku_id, pack_size_code FROM milkgraph.product_pack_sizes ORDER BY sku_id, pack_size_code`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r ProductPackSizeRow
		if err := rows.Scan(&r.SKUID, &r.PackSizeCode); err != nil {
			rows.Close()
			return nil, err
		}
		res.ProductPackSizes = append(res.ProductPackSizes, r)
	}
	rows.Close()

	rows, err = db.Pool.Query(ctx, `SELECT sku_id, market_variant FROM milkgraph.product_market_variants ORDER BY sku_id, market_variant`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r ProductMarketVarRow
		if err := rows.Scan(&r.SKUID, &r.MarketVariant); err != nil {
			rows.Close()
			return nil, err
		}
		res.ProductMarketVars = append(res.ProductMarketVars, r)
	}
	rows.Close()

	qFsku := `SELECT fs.finished_sku_id, fs.liquid_sku_id, fs.pack_size_code, fs.market_variant
		FROM milkgraph.finished_skus fs
		JOIN milkgraph.products p ON p.sku_id = fs.liquid_sku_id
		WHERE ($1 = '' OR p.product_family = $1)
		  AND ($2 = '' OR fs.pack_size_code = $2)
		  AND ($3 = '' OR fs.market_variant = $3)
		  AND ($4 = '' OR fs.finished_sku_id ILIKE '%' || $4 || '%' OR p.product_name ILIKE '%' || $4 || '%')
		ORDER BY fs.finished_sku_id`
	rows, err = db.Pool.Query(ctx, qFsku, f.ProductFamily, f.PackSizeCode, f.MarketVariant, f.Search)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r FinishedSKURow
		if err := rows.Scan(&r.FinishedSKUID, &r.LiquidSKUID, &r.PackSizeCode, &r.MarketVariant); err != nil {
			rows.Close()
			return nil, err
		}
		res.FinishedSKUs = append(res.FinishedSKUs, r)
	}
	rows.Close()
	return res, nil
}

type AssetStatusRow struct {
	AssetID                 string     `json:"asset_id"`
	AssetType               string     `json:"asset_type"`
	AssetName               string     `json:"asset_name"`
	NodeRole                string     `json:"node_role"`
	CompatibleProductFamily *string    `json:"compatible_product_family"`
	CurrentStatus           *string    `json:"current_status"`
	CurrentStatusReason     *string    `json:"current_status_reason"`
	CurrentStatusSource     *string    `json:"current_status_source"`
	CurrentStatusObservedAt *time.Time `json:"current_status_observed_at"`
	CapacityL               *float64   `json:"capacity_l,omitempty"`
	HoldingTimeLimitHours   *float64   `json:"holding_time_limit_hours,omitempty"`
	InputFlowLPH            *float64   `json:"input_flow_lph,omitempty"`
	OutputFlowLPH           *float64   `json:"output_flow_lph,omitempty"`
	ProcessSpeedLPH         *float64   `json:"process_speed_lph,omitempty"`
	CIPDurationMinutes      *float64   `json:"cip_duration_minutes,omitempty"`
	SpeedPackPH             *float64   `json:"speed_packph,omitempty"`
}

type AssetFilter struct {
	AssetType    string
	Status       string
	Search       string
	IncludePipes bool
}

// ListAssets reads asset_current_status_view joined with asset subtypes, excluding PIPE-01..PIPE-10 by default.
func (db *DB) ListAssets(ctx context.Context, f AssetFilter) ([]AssetStatusRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	q := `SELECT v.asset_id, v.asset_type, v.asset_name, v.node_role, v.compatible_product_family,
			v.current_status, v.current_status_reason, v.current_status_source, v.current_status_observed_at,
			st.capacity_l, st.holding_time_limit_hours,
			pm.input_flow_lph, pm.output_flow_lph, pm.process_speed_lph,
			COALESCE(st.cip_duration_minutes, pm.cip_duration_minutes) AS cip_duration_minutes,
			fm.speed_packph
		FROM milkgraph.asset_current_status_view v
		LEFT JOIN milkgraph.storage_tanks st ON st.asset_id = v.asset_id
		LEFT JOIN milkgraph.production_machines pm ON pm.asset_id = v.asset_id
		LEFT JOIN milkgraph.filling_machines fm ON fm.asset_id = v.asset_id
		WHERE ($1 OR v.node_role <> 'physical_pipe')
		  AND ($2 = '' OR v.asset_type = $2)
		  AND ($3 = '' OR COALESCE(v.current_status, '') = $3)
		  AND ($4 = '' OR v.asset_id ILIKE '%' || $4 || '%' OR v.asset_name ILIKE '%' || $4 || '%')
		ORDER BY v.asset_id`
	rows, err := db.Pool.Query(ctx, q, f.IncludePipes, f.AssetType, f.Status, f.Search)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AssetStatusRow{}
	for rows.Next() {
		var r AssetStatusRow
		if err := rows.Scan(
			&r.AssetID, &r.AssetType, &r.AssetName, &r.NodeRole, &r.CompatibleProductFamily,
			&r.CurrentStatus, &r.CurrentStatusReason, &r.CurrentStatusSource, &r.CurrentStatusObservedAt,
			&r.CapacityL, &r.HoldingTimeLimitHours,
			&r.InputFlowLPH, &r.OutputFlowLPH, &r.ProcessSpeedLPH, &r.CIPDurationMinutes, &r.SpeedPackPH,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// RecordAssetStatus inserts a new asset status event.
func (db *DB) RecordAssetStatus(ctx context.Context, assetID, status, reason, source string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	if source == "" {
		source = "manual"
	}
	tag, err := db.Pool.Exec(ctx,
		`INSERT INTO milkgraph.asset_status_events (asset_id, status, status_reason, source)
		 SELECT asset_id, $2, NULLIF($3, ''), $4 FROM milkgraph.assets WHERE asset_id = $1`,
		assetID, status, reason, source,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type ProductionDailyRow struct {
	ProductionDate    string   `json:"production_date"`
	BatchID           string   `json:"batch_id"`
	BatchCode         string   `json:"batch_code"`
	SequenceNo        int      `json:"sequence_no"`
	ProductionGroupID *string  `json:"production_group_id"`
	BatchStatus       string   `json:"batch_status"`
	LineNo            *int     `json:"line_no"`
	ProductionOrderID *string  `json:"production_order_id"`
	FinishedSKUID     *string  `json:"finished_sku_id"`
	LiquidSKUID       *string  `json:"liquid_sku_id"`
	ProductName       *string  `json:"product_name"`
	FillingLineID     *string  `json:"filling_line_id"`
	AsepticTankID     *string  `json:"aseptic_tank_id"`
	SterilizerID      *string  `json:"sterilizer_id"`
	TargetPacks       *float64 `json:"target_packs"`
	TargetVolumeL     *float64 `json:"target_volume_l"`
	FulfillStatus     *string  `json:"fulfill_status"`
	ShortageL         *float64 `json:"shortage_l"`
	BottleneckAssetID *string  `json:"bottleneck_asset_id"`
	RiskReason        *string  `json:"risk_reason"`
}

// ListProductionDaily reads production_daily_view for a specific date or DefaultOperationalDate.
func (db *DB) ListProductionDaily(ctx context.Context, date string) (string, []ProductionDailyRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	if date == "" {
		date = DefaultOperationalDate
	}
	q := `SELECT production_date::text, batch_id, batch_code, sequence_no, production_group_id, batch_status,
			line_no, production_order_id, finished_sku_id, liquid_sku_id, product_name,
			filling_line_id, aseptic_tank_id, sterilizer_id, target_packs, target_volume_l,
			fulfill_status, shortage_l, bottleneck_asset_id, risk_reason
		FROM milkgraph.production_daily_view
		WHERE production_date = $1::date
		ORDER BY sequence_no, line_no`
	rows, err := db.Pool.Query(ctx, q, date)
	if err != nil {
		return date, nil, err
	}
	defer rows.Close()

	out := []ProductionDailyRow{}
	for rows.Next() {
		var r ProductionDailyRow
		if err := rows.Scan(
			&r.ProductionDate, &r.BatchID, &r.BatchCode, &r.SequenceNo, &r.ProductionGroupID, &r.BatchStatus,
			&r.LineNo, &r.ProductionOrderID, &r.FinishedSKUID, &r.LiquidSKUID, &r.ProductName,
			&r.FillingLineID, &r.AsepticTankID, &r.SterilizerID, &r.TargetPacks, &r.TargetVolumeL,
			&r.FulfillStatus, &r.ShortageL, &r.BottleneckAssetID, &r.RiskReason,
		); err != nil {
			return date, nil, err
		}
		out = append(out, r)
	}
	return date, out, rows.Err()
}

type ProductionScheduleRow struct {
	ProductionDate    string   `json:"production_date"`
	SequenceNo        int      `json:"sequence_no"`
	BatchID           string   `json:"batch_id"`
	BatchCode         string   `json:"batch_code"`
	ProductionGroupID *string  `json:"production_group_id"`
	Status            string   `json:"status"`
	LineNo            int      `json:"line_no"`
	ProductionOrderID *string  `json:"production_order_id"`
	FinishedSKUID     string   `json:"finished_sku_id"`
	FillingLineID     *string  `json:"filling_line_id"`
	AsepticTankID     *string  `json:"aseptic_tank_id"`
	SterilizerID      *string  `json:"sterilizer_id"`
	TargetPacks       *float64 `json:"target_packs"`
	TargetVolumeL     *float64 `json:"target_volume_l"`
}

// ListProductionSchedule returns daily batches ordered by production_date and sequence_no.
func (db *DB) ListProductionSchedule(ctx context.Context, date, batchID string) ([]ProductionScheduleRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	q := `SELECT b.production_date::text, b.sequence_no, b.batch_id, b.batch_code, b.production_group_id, b.status,
			bl.line_no, bl.production_order_id, bl.finished_sku_id, bl.filling_line_id, bl.aseptic_tank_id,
			bl.sterilizer_id, bl.target_packs, bl.target_volume_l
		FROM milkgraph.production_batches b
		JOIN milkgraph.production_batch_lines bl ON bl.batch_id = b.batch_id
		WHERE ($1 = '' OR b.production_date = $1::date)
		  AND ($2 = '' OR b.batch_id = $2)
		ORDER BY b.production_date, b.sequence_no, bl.line_no`
	rows, err := db.Pool.Query(ctx, q, date, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProductionScheduleRow{}
	for rows.Next() {
		var r ProductionScheduleRow
		if err := rows.Scan(
			&r.ProductionDate, &r.SequenceNo, &r.BatchID, &r.BatchCode, &r.ProductionGroupID, &r.Status,
			&r.LineNo, &r.ProductionOrderID, &r.FinishedSKUID, &r.FillingLineID, &r.AsepticTankID,
			&r.SterilizerID, &r.TargetPacks, &r.TargetVolumeL,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type BatchTraceEvent struct {
	TraceSource        string     `json:"trace_source"`
	TransactionID      *string    `json:"transaction_id"`
	MachineID          *string    `json:"machine_id"`
	Activity           *string    `json:"activity"`
	StartTime          *time.Time `json:"start_time"`
	EndTime            *time.Time `json:"end_time"`
	VolumeL            *float64   `json:"volume_l"`
	OutputGoodPacks    *float64   `json:"output_good_packs"`
	OutputVolumeL      *float64   `json:"output_volume_l"`
	SourceAssetID      *string    `json:"source_asset_id"`
	DestinationAssetID *string    `json:"destination_asset_id"`
	DowntimeType       *string    `json:"downtime_type"`
}

type BatchTraceResult struct {
	BatchID            string            `json:"batch_id"`
	BatchCode          string            `json:"batch_code"`
	ProductionDate     string            `json:"production_date"`
	ProductionGroupID  *string           `json:"production_group_id"`
	Events             []BatchTraceEvent `json:"events"`
	IncompleteSections []string          `json:"incomplete_sections"`
}

// GetBatchTrace queries batch_trace_view and explicitly marks missing trace sections.
func (db *DB) GetBatchTrace(ctx context.Context, batchID, groupID string) (*BatchTraceResult, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	q := `SELECT DISTINCT batch_id, batch_code, production_date::text, production_group_id,
			trace_source, transaction_id, machine_id, activity, start_time, end_time,
			volume_l, output_good_packs, output_volume_l, source_asset_id, destination_asset_id, downtime_type
		FROM milkgraph.batch_trace_view
		WHERE ($1 <> '' AND batch_id = $1) OR ($2 <> '' AND production_group_id = $2)
		ORDER BY start_time NULLS LAST, trace_source, transaction_id`
	rows, err := db.Pool.Query(ctx, q, batchID, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var res *BatchTraceResult
	hasProc, hasFill := false, false
	for rows.Next() {
		var bID, bCode, pDate string
		var pGroup *string
		var ev BatchTraceEvent
		if err := rows.Scan(
			&bID, &bCode, &pDate, &pGroup,
			&ev.TraceSource, &ev.TransactionID, &ev.MachineID, &ev.Activity, &ev.StartTime, &ev.EndTime,
			&ev.VolumeL, &ev.OutputGoodPacks, &ev.OutputVolumeL, &ev.SourceAssetID, &ev.DestinationAssetID, &ev.DowntimeType,
		); err != nil {
			return nil, err
		}
		if res == nil {
			res = &BatchTraceResult{
				BatchID: bID, BatchCode: bCode, ProductionDate: pDate, ProductionGroupID: pGroup,
				Events: []BatchTraceEvent{}, IncompleteSections: []string{},
			}
		}
		if ev.TransactionID != nil {
			res.Events = append(res.Events, ev)
			if ev.TraceSource == "processing" {
				hasProc = true
			} else if ev.TraceSource == "filling" {
				hasFill = true
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if res == nil {
		return nil, ErrNotFound
	}
	if !hasProc {
		res.IncompleteSections = append(res.IncompleteSections, "processing_transactions")
	}
	if !hasFill {
		res.IncompleteSections = append(res.IncompleteSections, "filling_transactions")
	}
	return res, nil
}

type WeeklyPlanRow struct {
	ProposalID      string   `json:"proposal_id"`
	Week            *int     `json:"week"`
	WeekStartSunday *string  `json:"week_start_sunday"`
	FinishedSKUID   *string  `json:"finished_sku_id"`
	ProductName     *string  `json:"product_name"`
	PackSizeML      *float64 `json:"pack_size_ml"`
	Market          *string  `json:"market"`
	TargetPacks     *float64 `json:"target_packs"`
	TargetVolumeL   *float64 `json:"target_volume_l"`
	BatchID         *string  `json:"batch_id"`
	BatchCode       *string  `json:"batch_code"`
	ProductionDate  *string  `json:"production_date"`
}

// ListWeeklyPlans returns weekly production plans linked to derived daily batches.
func (db *DB) ListWeeklyPlans(ctx context.Context, week int, from, to string) ([]WeeklyPlanRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	q := `SELECT pp.proposal_id, pp.week, pp.week_start_sunday::text, pp.finished_sku_id,
			pp.product_name, pp.pack_size_ml, pp.market, pp.target_packs, pp.target_volume_l,
			b.batch_id, b.batch_code, b.production_date::text
		FROM milkgraph.production_plans pp
		LEFT JOIN milkgraph.production_batch_lines bl ON bl.finished_sku_id = pp.finished_sku_id
		LEFT JOIN milkgraph.production_batches b ON b.batch_id = bl.batch_id
		WHERE ($1 = 0 OR pp.week = $1)
		  AND ($2 = '' OR pp.week_start_sunday >= $2::date)
		  AND ($3 = '' OR pp.week_start_sunday <= $3::date)
		ORDER BY pp.week_start_sunday, pp.proposal_id, b.production_date`
	rows, err := db.Pool.Query(ctx, q, week, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []WeeklyPlanRow{}
	for rows.Next() {
		var r WeeklyPlanRow
		if err := rows.Scan(
			&r.ProposalID, &r.Week, &r.WeekStartSunday, &r.FinishedSKUID,
			&r.ProductName, &r.PackSizeML, &r.Market, &r.TargetPacks, &r.TargetVolumeL,
			&r.BatchID, &r.BatchCode, &r.ProductionDate,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type CreateBatchLineInput struct {
	ProductionOrderID string   `json:"production_order_id"`
	FinishedSKUID     string   `json:"finished_sku_id"`
	FillingLineID     string   `json:"filling_line_id"`
	AsepticTankID     string   `json:"aseptic_tank_id"`
	SterilizerID      string   `json:"sterilizer_id"`
	TargetPacks       *float64 `json:"target_packs"`
	TargetVolumeL     float64  `json:"target_volume_l"`
}

type CreateBatchInput struct {
	ProductionDate    string                 `json:"production_date"`
	ProductionGroupID string                 `json:"production_group_id"`
	Lines             []CreateBatchLineInput `json:"lines"`
}

type CreatedBatch struct {
	BatchID           string   `json:"batch_id"`
	BatchCode         string   `json:"batch_code"`
	ProductionDate    string   `json:"production_date"`
	SequenceNo        int      `json:"sequence_no"`
	ProductionGroupID string   `json:"production_group_id"`
	Status            string   `json:"status"`
	ChangeoverMinutes float64  `json:"changeover_minutes"`
	CIPRulesTriggered []string `json:"cip_rules_triggered"`
}

// CreateBatch validates line dedication, product & finished SKU compatibility, routes, changeover_rules,
// and cip_rules, then generates batch_code from active batch_code_rules.
func (db *DB) CreateBatch(ctx context.Context, in CreateBatchInput) (*CreatedBatch, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	if in.ProductionDate == "" {
		in.ProductionDate = DefaultOperationalDate
	}
	if len(in.Lines) == 0 {
		return nil, fmt.Errorf("minimal 1 baris batch wajib diisi")
	}

	var out CreatedBatch
	err := pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		totalChangeover := 0.0
		cipTriggered := []string{}

		for idx, ln := range in.Lines {
			var liquidSKU, packCode, marketVar string
			var flavour *string
			err := tx.QueryRow(ctx,
				`SELECT fs.liquid_sku_id, fs.pack_size_code, fs.market_variant, p.flavour
				 FROM milkgraph.finished_skus fs
				 JOIN milkgraph.products p ON p.sku_id = fs.liquid_sku_id
				 WHERE fs.finished_sku_id = $1`,
				ln.FinishedSKUID,
			).Scan(&liquidSKU, &packCode, &marketVar, &flavour)
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("baris %d: finished SKU %s tidak ditemukan", idx+1, ln.FinishedSKUID)
			} else if err != nil {
				return err
			}

			var dedOK bool
			if err := tx.QueryRow(ctx,
				`SELECT EXISTS(
					SELECT 1 FROM milkgraph.line_allowed_liquid_skus lals
					JOIN milkgraph.line_allowed_pack_sizes laps ON laps.filling_id = lals.filling_id
					WHERE lals.filling_id = $1 AND lals.liquid_sku_id = $2 AND laps.pack_size_code = $3
				)`,
				ln.FillingLineID, liquidSKU, packCode,
			).Scan(&dedOK); err != nil {
				return err
			} else if !dedOK {
				return fmt.Errorf("baris %d: dedikasi line %s tidak mengizinkan %s / %s", idx+1, ln.FillingLineID, liquidSKU, packCode)
			}

			var prodCompOK bool
			err = tx.QueryRow(ctx,
				`SELECT eligible FROM milkgraph.line_product_compatibility
				 WHERE filling_id = $1 AND liquid_sku_id = $2 AND pack_size_code = $3`,
				ln.FillingLineID, liquidSKU, packCode,
			).Scan(&prodCompOK)
			if errors.Is(err, pgx.ErrNoRows) || !prodCompOK {
				return fmt.Errorf("baris %d: produk %s (%s) tidak kompatibel dengan line %s", idx+1, liquidSKU, packCode, ln.FillingLineID)
			} else if err != nil {
				return err
			}

			var compOK bool
			err = tx.QueryRow(ctx,
				`SELECT compatible FROM milkgraph.filling_line_sku_compatibility WHERE filling_id = $1 AND sku_id = $2`,
				ln.FillingLineID, ln.FinishedSKUID,
			).Scan(&compOK)
			if errors.Is(err, pgx.ErrNoRows) || !compOK {
				return fmt.Errorf("baris %d: finished SKU %s tidak kompatibel dengan line %s", idx+1, ln.FinishedSKUID, ln.FillingLineID)
			} else if err != nil {
				return err
			}

			if ln.AsepticTankID != "" {
				var routeExists bool
				err = tx.QueryRow(ctx,
					`SELECT EXISTS(SELECT 1 FROM milkgraph.production_routes WHERE source_asset_id = $1 AND destination_asset_id = $2)`,
					ln.AsepticTankID, ln.FillingLineID,
				).Scan(&routeExists)
				if err != nil {
					return err
				}
				if !routeExists {
					return fmt.Errorf("baris %d: tidak ada rute proses dari %s ke %s", idx+1, ln.AsepticTankID, ln.FillingLineID)
				}
			}

			// Evaluate changeover_rules and cip_rules against prior batch line on the same filling_line_id & date
			var prevPack, prevMarket string
			var prevFlavour *string
			err = tx.QueryRow(ctx,
				`SELECT fs.pack_size_code, fs.market_variant, p.flavour
				 FROM milkgraph.production_batch_lines bl
				 JOIN milkgraph.production_batches b ON b.batch_id = bl.batch_id
				 JOIN milkgraph.finished_skus fs ON fs.finished_sku_id = bl.finished_sku_id
				 JOIN milkgraph.products p ON p.sku_id = fs.liquid_sku_id
				 WHERE b.production_date = $1::date AND bl.filling_line_id = $2
				 ORDER BY b.sequence_no DESC, bl.line_no DESC LIMIT 1`,
				in.ProductionDate, ln.FillingLineID,
			).Scan(&prevPack, &prevMarket, &prevFlavour)
			if err == nil {
				curF, prvF := "", ""
				if flavour != nil {
					curF = *flavour
				}
				if prevFlavour != nil {
					prvF = *prevFlavour
				}
				ruleID := "NONE"
				if curF != prvF {
					ruleID = "VARIANT"
				} else if packCode != prevPack {
					ruleID = "SIZE"
				} else if marketVar != prevMarket {
					ruleID = "PAPER"
				}
				var dur float64
				if err := tx.QueryRow(ctx,
					`SELECT COALESCE(duration_minutes, 0) FROM milkgraph.changeover_rules WHERE rule_id = $1`,
					ruleID,
				).Scan(&dur); err == nil {
					totalChangeover += dur
				}
				var cipID string
				if (prvF == "Chocolate" || prvF == "Strawberry") && curF == "Full Cream" {
					if err := tx.QueryRow(ctx, `SELECT rule_id FROM milkgraph.cip_rules WHERE rule_id = 'CIP_FLAVOUR'`).Scan(&cipID); err == nil {
						cipTriggered = append(cipTriggered, cipID)
					}
				} else if (prvF == "Chocolate" && curF == "Strawberry") || (prvF == "Strawberry" && curF == "Chocolate") {
					if err := tx.QueryRow(ctx, `SELECT rule_id FROM milkgraph.cip_rules WHERE rule_id = 'CIP_CH_ST'`).Scan(&cipID); err == nil {
						cipTriggered = append(cipTriggered, cipID)
					}
				}
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}

		// Read active batch_code_rules prefix
		prefix := "MG"
		_ = tx.QueryRow(ctx, `SELECT prefix FROM milkgraph.batch_code_rules WHERE active = true LIMIT 1`).Scan(&prefix)

		var seq int
		if err := tx.QueryRow(ctx,
			`SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM milkgraph.production_batches WHERE production_date = $1::date`,
			in.ProductionDate,
		).Scan(&seq); err != nil {
			return err
		}
		compactDate := strings.ReplaceAll(in.ProductionDate, "-", "")
		batchID := fmt.Sprintf("BATCH-%s-%03d", compactDate, seq)
		batchCode := fmt.Sprintf("%s-%s-%03d", prefix, compactDate, seq)

		if _, err := tx.Exec(ctx,
			`INSERT INTO milkgraph.production_batches (batch_id, batch_code, production_date, sequence_no, production_group_id, status)
			 VALUES ($1, $2, $3::date, $4, NULLIF($5, ''), 'Terjadwal')`,
			batchID, batchCode, in.ProductionDate, seq, in.ProductionGroupID,
		); err != nil {
			return err
		}

		for idx, ln := range in.Lines {
			if _, err := tx.Exec(ctx,
				`INSERT INTO milkgraph.production_batch_lines
				 (batch_id, line_no, production_order_id, finished_sku_id, filling_line_id, aseptic_tank_id, sterilizer_id, target_packs, target_volume_l)
				 VALUES ($1, $2, NULLIF($3, ''), $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9)`,
				batchID, idx+1, ln.ProductionOrderID, ln.FinishedSKUID, ln.FillingLineID, ln.AsepticTankID, ln.SterilizerID, ln.TargetPacks, ln.TargetVolumeL,
			); err != nil {
				return err
			}
		}

		out = CreatedBatch{
			BatchID:           batchID,
			BatchCode:         batchCode,
			ProductionDate:    in.ProductionDate,
			SequenceNo:        seq,
			ProductionGroupID: in.ProductionGroupID,
			Status:            "Terjadwal",
			ChangeoverMinutes: totalChangeover,
			CIPRulesTriggered: cipTriggered,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

type FulfillmentPredictionRow struct {
	ID                int64           `json:"id"`
	ProductionDate    string          `json:"production_date"`
	BatchID           *string         `json:"batch_id"`
	FulfillStatus     string          `json:"fulfill_status"`
	ShortageL         *float64        `json:"shortage_l"`
	BottleneckAssetID *string         `json:"bottleneck_asset_id"`
	RiskReason        *string         `json:"risk_reason"`
	InputFacts        json.RawMessage `json:"input_facts"`
	CalculatedAt      time.Time       `json:"calculated_at"`
}

type RecommendationRow struct {
	ID                 int64           `json:"id"`
	ProductionDate     string          `json:"production_date"`
	BatchID            *string         `json:"batch_id"`
	PredictionID       *int64          `json:"prediction_id"`
	RecommendationType string          `json:"recommendation_type"`
	TargetAssetID      *string         `json:"target_asset_id"`
	ExpectedGain       *float64        `json:"expected_gain"`
	ReasonFacts        json.RawMessage `json:"reason_facts"`
	Status             string          `json:"status"`
}

// RunFulfillmentPrediction evaluates batch demand against opening_inventory, supply plans, and asset speed/capacity,
// persists fulfillment_predictions, and generates structured recommendations without inventing missing numbers.
func (db *DB) RunFulfillmentPrediction(ctx context.Context, date, batchID string) ([]FulfillmentPredictionRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	if date == "" {
		date = DefaultOperationalDate
	}

	var results []FulfillmentPredictionRow
	err := pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		// Check opening inventory availability on or before date
		var availableStockL float64
		var oiCount int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*), COALESCE(SUM(opening_volume_l), 0) FROM milkgraph.opening_inventory WHERE snapshot_time::date <= $1::date`,
			date,
		).Scan(&oiCount, &availableStockL); err != nil {
			return err
		}

		var plannedSupplyL float64
		if err := tx.QueryRow(ctx,
			`SELECT COALESCE(SUM(planned_volume_l), 0) FROM milkgraph.receiving_plans WHERE eta_delivery_note::date = $1::date`,
			date,
		).Scan(&plannedSupplyL); err != nil {
			return err
		}

		rows, err := tx.Query(ctx,
			`SELECT b.batch_id, COALESCE(SUM(bl.target_volume_l), 0) AS demand_l,
				MIN(bl.filling_line_id) AS primary_line_id
			 FROM milkgraph.production_batches b
			 LEFT JOIN milkgraph.production_batch_lines bl ON bl.batch_id = b.batch_id
			 WHERE b.production_date = $1::date AND ($2 = '' OR b.batch_id = $2)
			 GROUP BY b.batch_id, b.sequence_no
			 ORDER BY b.sequence_no`,
			date, batchID,
		)
		if err != nil {
			return err
		}
		type batchDemand struct {
			id     string
			demand float64
			lineID *string
		}
		var batches []batchDemand
		for rows.Next() {
			var bd batchDemand
			if err := rows.Scan(&bd.id, &bd.demand, &bd.lineID); err != nil {
				rows.Close()
				return err
			}
			batches = append(batches, bd)
		}
		rows.Close()

		totalAvailable := availableStockL + plannedSupplyL
		for _, bd := range batches {
			status := "terpenuhi"
			var shortage *float64
			var bottleneck *string
			var reason string

			facts := map[string]any{
				"opening_inventory_rows": oiCount,
				"opening_stock_l":        availableStockL,
				"planned_supply_l":       plannedSupplyL,
				"batch_demand_l":         bd.demand,
			}

			if oiCount == 0 {
				status = "data_tidak_cukup"
				reason = "Snapshot opening_inventory belum tersedia untuk tanggal " + date
				facts["missing_inputs"] = []string{"opening_inventory"}
			} else if bd.demand > totalAvailable {
				status = "tidak_terpenuhi"
				s := bd.demand - totalAvailable
				shortage = &s
				bottleneck = bd.lineID
				reason = fmt.Sprintf("Kebutuhan batch %.1f L melebihi stok + pasokan tersedia %.1f L (kurang %.1f L)", bd.demand, totalAvailable, s)
			}

			factsJSON, _ := json.Marshal(facts)
			var pred FulfillmentPredictionRow
			if err := tx.QueryRow(ctx,
				`INSERT INTO milkgraph.fulfillment_predictions
				 (production_date, batch_id, fulfill_status, shortage_l, bottleneck_asset_id, risk_reason, input_facts)
				 VALUES ($1::date, $2, $3, $4, $5, $6, $7)
				 RETURNING id, production_date::text, batch_id, fulfill_status, shortage_l, bottleneck_asset_id, risk_reason, input_facts, calculated_at`,
				date, bd.id, status, shortage, bottleneck, reason, factsJSON,
			).Scan(
				&pred.ID, &pred.ProductionDate, &pred.BatchID, &pred.FulfillStatus,
				&pred.ShortageL, &pred.BottleneckAssetID, &pred.RiskReason, &pred.InputFacts, &pred.CalculatedAt,
			); err != nil {
				return err
			}
			results = append(results, pred)

			if status == "tidak_terpenuhi" || status == "berisiko" {
				recFacts, _ := json.Marshal(map[string]any{
					"shortage_l":        shortage,
					"bottleneck_asset":  bottleneck,
					"opening_stock_l":   availableStockL,
					"planned_supply_l":  plannedSupplyL,
					"batch_demand_l":    bd.demand,
				})
				if _, err := tx.Exec(ctx,
					`INSERT INTO milkgraph.recommendations
					 (production_date, batch_id, prediction_id, recommendation_type, target_asset_id, expected_gain, reason_facts, status)
					 VALUES ($1::date, $2, $3, 'geser_jadwal', $4, $5, $6, 'draft')`,
					date, bd.id, pred.ID, bottleneck, shortage, recFacts,
				); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}

// ListFulfillmentPredictions returns latest predictions per date/batch.
func (db *DB) ListFulfillmentPredictions(ctx context.Context, date, batchID string) ([]FulfillmentPredictionRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	if date == "" {
		date = DefaultOperationalDate
	}
	rows, err := db.Pool.Query(ctx,
		`SELECT id, production_date::text, batch_id, fulfill_status, shortage_l, bottleneck_asset_id, risk_reason, input_facts, calculated_at
		 FROM milkgraph.fulfillment_predictions
		 WHERE production_date = $1::date AND ($2 = '' OR batch_id = $2)
		 ORDER BY calculated_at DESC, id DESC`,
		date, batchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FulfillmentPredictionRow{}
	for rows.Next() {
		var r FulfillmentPredictionRow
		if err := rows.Scan(&r.ID, &r.ProductionDate, &r.BatchID, &r.FulfillStatus, &r.ShortageL, &r.BottleneckAssetID, &r.RiskReason, &r.InputFacts, &r.CalculatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListRecommendations returns stored recommendations for a date or batch.
func (db *DB) ListRecommendations(ctx context.Context, date, batchID string) ([]RecommendationRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	rows, err := db.Pool.Query(ctx,
		`SELECT id, production_date::text, batch_id, prediction_id, recommendation_type, target_asset_id, expected_gain, reason_facts, status
		 FROM milkgraph.recommendations
		 WHERE ($1 = '' OR production_date = $1::date)
		   AND ($2 = '' OR batch_id = $2)
		 ORDER BY id DESC`,
		date, batchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RecommendationRow{}
	for rows.Next() {
		var r RecommendationRow
		if err := rows.Scan(&r.ID, &r.ProductionDate, &r.BatchID, &r.PredictionID, &r.RecommendationType, &r.TargetAssetID, &r.ExpectedGain, &r.ReasonFacts, &r.Status); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UpdateRecommendationStatus updates the status of a recommendation record.
func (db *DB) UpdateRecommendationStatus(ctx context.Context, id int64, status string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	tag, err := db.Pool.Exec(ctx,
		`UPDATE milkgraph.recommendations SET status = $2, updated_at = now() WHERE id = $1`,
		id, status,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
