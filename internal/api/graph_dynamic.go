package api

import (
	"context"
	"fmt"
	"strings"
)

// dynamicGraph builds the live Context Graph from PostgreSQL state:
//   - Farms & RT Arrivals (s.rtArrivals)
//   - Lab & QC Results (s.labResults)
//   - Plant Assets & Connections (s.master)
//   - Live Transfers (s.transfers)
//   - Downtime / CIP Events (s.downtimeEvents)
//   - Holds (s.holds)
//   - Active Schedule Runs (schedule/current)
//
// When s.DB == nil (offline/unit test without DB), it falls back to s.graph.View().
func (s *Server) dynamicGraph(ctx context.Context) (map[string]any, error) {
	if s.DB == nil {
		return s.graph.View(), nil
	}

	nodes := []map[string]any{}
	edges := []map[string]any{}
	nodeSeen := map[string]bool{}
	edgeSeen := map[string]bool{}

	addNode := func(id, typ, label, source string, rank int) {
		if id == "" || nodeSeen[id] {
			return
		}
		nodeSeen[id] = true
		nodes = append(nodes, map[string]any{
			"id":     id,
			"type":   typ,
			"label":  label,
			"source": source,
			"rank":   rank,
		})
	}
	addEdge := func(id, src, tgt, label string, planned bool) {
		if id == "" || src == "" || tgt == "" || edgeSeen[id] || !nodeSeen[src] || !nodeSeen[tgt] {
			return
		}
		edgeSeen[id] = true
		edges = append(edges, map[string]any{
			"id":      id,
			"source":  src,
			"target":  tgt,
			"label":   label,
			"planned": planned,
		})
	}

	// 1. Farms & RT Arrivals
	arrivals, err := s.rtArrivals(ctx)
	if err == nil {
		for _, a := range arrivals {
			farmNodeID := strings.ToLower(a.FarmID)
			addNode(farmNodeID, "Farm", a.FarmName, "erp", 0)
			rtNodeID := strings.ToLower(a.RTID)
			addNode(rtNodeID, "RT", fmt.Sprintf("%s (%s · %.0f L)", a.RTID, a.Status, a.VolumeL), "scada", 1)
			addEdge("edge-"+farmNodeID+"-"+rtNodeID, farmNodeID, rtNodeID, "Pasok", a.Status != "Sudah Tiba")
		}
	}

	// 2. Plant Assets & Connections from Master Catalog
	assetType := func(kind, id string) string {
		upper := strings.ToUpper(id)
		switch {
		case strings.HasPrefix(upper, "BAY"):
			return "Bay"
		case strings.HasPrefix(upper, "RMT") || strings.HasPrefix(upper, "TANK"):
			return "Storage"
		case strings.HasPrefix(upper, "AT"):
			return "Aseptic"
		case strings.HasPrefix(upper, "FM"):
			return "Filling"
		case strings.Contains(strings.ToLower(kind), "pasteur") || strings.Contains(strings.ToLower(kind), "uht"):
			return "Sterilisasi"
		case strings.Contains(strings.ToLower(kind), "mix"):
			return "Mixing"
		default:
			return "Buffer"
		}
	}
	assetRank := func(typ string) int {
		switch typ {
		case "Bay":
			return 2
		case "Buffer", "Storage":
			return 3
		case "Mixing", "Sterilisasi":
			return 4
		case "Aseptic":
			return 5
		case "Filling":
			return 6
		default:
			return 4
		}
	}

	if s.master != nil {
		for _, a := range s.master.Assets() {
			id := a["asset_id"]
			typ := a["asset_type"]
			t := assetType(typ, id)
			addNode(strings.ToLower(id), t, id, "scada", assetRank(t))
		}
		for i, c := range s.master.Connections() {
			src := strings.ToLower(c["source_asset_id"])
			tgt := strings.ToLower(c["destination_asset_id"])
			addEdge(fmt.Sprintf("master-conn-%d", i+1), src, tgt, "Jalur", true)
		}
	}

	// 3. Live Transfers
	transfers, err := s.transfers(ctx, "")
	if err == nil {
		for _, tr := range transfers {
			src := strings.ToLower(tr.FromRef)
			tgt := strings.ToLower(tr.ToRef)
			if !nodeSeen[src] {
				addNode(src, assetType("", tr.FromRef), tr.FromRef, "scada", 2)
			}
			if !nodeSeen[tgt] {
				addNode(tgt, assetType("", tr.ToRef), tr.ToRef, "scada", 3)
			}
			addEdge("trf-"+tr.ID, src, tgt, fmt.Sprintf("%s %.0f L", tr.Step, tr.VolumeOutL), false)
		}
	}

	// 4. Lab & QC Results
	labs, err := s.labResults(ctx)
	if err == nil {
		for _, m := range labs {
			id := strings.ToLower(str(m["id"]))
			subj := str(m["subject"])
			status := str(m["status"])
			addNode(id, "LabResult", fmt.Sprintf("%s (%s)", subj, status), "lims", 2)
			subjID := strings.ToLower(subj)
			if nodeSeen[subjID] {
				addEdge("lab-"+id, subjID, id, "Uji Lab", false)
			}
		}
	}

	// 5. Downtime / CIP Events
	downs, err := s.downtimeEvents(ctx)
	if err == nil {
		for _, d := range downs {
			evID := strings.ToLower(d.EventID)
			addNode(evID, "CIPEvent", fmt.Sprintf("%s: %s", d.ResourceID, d.Type), "scada", 5)
			resID := strings.ToLower(d.ResourceID)
			if nodeSeen[resID] {
				addEdge("down-"+evID, resID, evID, d.Type, false)
			}
		}
	}

	// 6. Active Schedule Runs & Lots / Holds
	var sch Schedule
	if err := s.state(ctx, "schedule", "current", &sch); err == nil && sch.ScheduleID != "" {
		for _, run := range sch.Runs {
			lotID := strings.ToLower(run.POID)
			addNode(lotID, "Lot", fmt.Sprintf("%s · %s (%.0f L)", run.POID, run.SKU, run.QtyLiter), "mes", 7)
			fmID := strings.ToLower(run.FMID)
			if nodeSeen[fmID] {
				addEdge("run-"+run.RunID, fmID, lotID, "Produksi", true)
			}
		}
	}
	holds, err := s.holds(ctx)
	if err == nil {
		for _, h := range holds {
			for _, l := range h.Lots {
				lotID := strings.ToLower(l.ID)
				addNode(lotID, "Lot", fmt.Sprintf("%s (%s · %s)", l.ID, l.Product, h.Status), "lims", 7)
				trigID := strings.ToLower(h.Trigger)
				if nodeSeen[trigID] {
					addEdge("hold-"+h.ID+"-"+lotID, trigID, lotID, "Hold: "+h.Status, false)
				}
			}
		}
	}

	return map[string]any{
		"nodes": nodes,
		"edges": edges,
	}, nil
}
