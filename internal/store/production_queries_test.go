package store

import (
	"context"
	"testing"
)

func TestProductionQueriesIntegration(t *testing.T) {
	dsn := isolatedMigrationDB(t)
	ctx := context.Background()
	db, err := Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// 1. Verify Products (8), PackSizeCodes (5), FinishedSKUs (44)
	prods, err := db.ListProducts(ctx, ProductFilter{})
	if err != nil {
		t.Fatalf("ListProducts: %v", err)
	}
	if len(prods.Products) != 8 {
		t.Errorf("products = %d, want 8", len(prods.Products))
	}
	if len(prods.PackSizeCodes) != 5 {
		t.Errorf("pack_size_codes = %d, want 5", len(prods.PackSizeCodes))
	}
	if len(prods.FinishedSKUs) != 44 {
		t.Errorf("finished_skus = %d, want 44", len(prods.FinishedSKUs))
	}

	// 2. Verify Operational Assets (63, excluding PIPE-01..PIPE-10)
	assets, err := db.ListAssets(ctx, AssetFilter{})
	if err != nil {
		t.Fatalf("ListAssets: %v", err)
	}
	if len(assets) != 63 {
		t.Errorf("operational assets = %d, want 63", len(assets))
	}

	// 3. Verify Production Daily (default active date)
	resolvedDate, daily, err := db.ListProductionDaily(ctx, "")
	if err != nil {
		t.Fatalf("ListProductionDaily: %v", err)
	}
	if resolvedDate != DefaultOperationalDate || len(daily) == 0 {
		t.Errorf("daily date=%s count=%d", resolvedDate, len(daily))
	}

	// 4. Verify Production Schedule
	sched, err := db.ListProductionSchedule(ctx, DefaultOperationalDate, "")
	if err != nil {
		t.Fatalf("ListProductionSchedule: %v", err)
	}
	if len(sched) == 0 {
		t.Errorf("expected non-empty production schedule")
	}

	// 5. Verify Batch Trace via production_group_id
	trace, err := db.GetBatchTrace(ctx, "", "CAM-003664")
	if err != nil {
		t.Fatalf("GetBatchTrace: %v", err)
	}
	if len(trace.Events) == 0 {
		t.Errorf("expected trace events for CAM-003664")
	}

	// 6. Verify Weekly Plans
	plans, err := db.ListWeeklyPlans(ctx, 1, "", "")
	if err != nil {
		t.Fatalf("ListWeeklyPlans: %v", err)
	}
	if len(plans) == 0 {
		t.Errorf("expected weekly plans")
	}

	// 7. Verify CreateBatch with dedication, compatibility, route, changeover, and CIP checks
	created, err := db.CreateBatch(ctx, CreateBatchInput{
		ProductionDate: "2026-11-02",
		Lines: []CreateBatchLineInput{{
			FinishedSKUID: "ESL-FC-1000-LOCAL",
			FillingLineID: "FL-01",
			AsepticTankID: "AT-01",
			SterilizerID:  "ST-01",
			TargetVolumeL: 12000,
		}},
	})
	if err != nil {
		t.Fatalf("CreateBatch: %v", err)
	}
	if created.BatchCode == "" {
		t.Errorf("expected generated batch_code")
	}

	// 8. Verify Fulfillment Prediction & Recommendations
	preds, err := db.RunFulfillmentPrediction(ctx, DefaultOperationalDate, "")
	if err != nil {
		t.Fatalf("RunFulfillmentPrediction: %v", err)
	}
	if len(preds) == 0 {
		t.Errorf("expected predictions")
	}
}
