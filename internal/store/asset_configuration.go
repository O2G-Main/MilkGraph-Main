package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrConfigurationConflict = errors.New("asset configuration changed")

type ConfigurationValidation struct {
	Field   string
	Message string
}

func (e *ConfigurationValidation) Error() string { return e.Message }

type ConfigurationField struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	Unit     string  `json:"unit"`
	Min      float64 `json:"min"`
	Max      float64 `json:"max"`
	Step     float64 `json:"step"`
	Nullable bool    `json:"nullable"`
	table    string
}
type AssetConfiguration struct {
	AssetID   string               `json:"asset_id"`
	AssetName string               `json:"asset_name"`
	AssetType string               `json:"asset_type"`
	Version   int64                `json:"version"`
	UpdatedAt *time.Time           `json:"updated_at"`
	Fields    []ConfigurationField `json:"fields"`
	Values    map[string]*float64  `json:"values"`
}
type AssetConfigurationPatch struct {
	Version int64               `json:"version"`
	Changes map[string]*float64 `json:"changes"`
}

func configurationFields(tank, machine, filling bool) []ConfigurationField {
	fields := []ConfigurationField{}
	add := func(key, label, unit, table string, min, step float64) {
		fields = append(fields, ConfigurationField{key, label, unit, min, 1e9, step, true, table})
	}
	if tank {
		add("capacity_l", "Kapasitas", "L", "storage_tanks", 0.01, 0.01)
		add("holding_time_limit_hours", "Batas holding time", "jam", "storage_tanks", 0.01, 0.01)
	}
	if machine {
		for _, v := range [][2]string{{"input_flow_lph", "Laju aliran masuk"}, {"output_flow_lph", "Laju aliran keluar"}, {"process_speed_lph", "Kecepatan proses"}} {
			add(v[0], v[1], "L/jam", "production_machines", 0.01, 0.01)
		}
	}
	if tank {
		add("cip_duration_minutes", "Durasi CIP", "menit", "storage_tanks", 0, 1)
	} else if machine {
		add("cip_duration_minutes", "Durasi CIP", "menit", "production_machines", 0, 1)
	}
	if filling {
		add("speed_packph", "Kecepatan kemasan", "pak/jam", "filling_machines", 1, 1)
	}
	return fields
}
func ValidateConfigurationPatch(config AssetConfiguration, patch AssetConfigurationPatch) error {
	if patch.Version < 1 {
		return &ConfigurationValidation{"version", "Versi konfigurasi wajib diisi."}
	}
	if len(patch.Changes) == 0 {
		return &ConfigurationValidation{"changes", "Minimal satu parameter harus diubah."}
	}
	known := map[string]ConfigurationField{}
	for _, f := range config.Fields {
		known[f.Key] = f
	}
	for key, value := range patch.Changes {
		f, ok := known[key]
		if !ok {
			return &ConfigurationValidation{key, "Parameter tidak berlaku untuk jenis alat ini."}
		}
		if value == nil {
			continue
		}
		v := *value
		if math.IsNaN(v) || math.IsInf(v, 0) || v < f.Min || v > f.Max || math.Abs(v/f.Step-math.Round(v/f.Step)) > 0.00001 {
			return &ConfigurationValidation{key, fmt.Sprintf("%s harus antara %g dan %g %s, kelipatan %g.", f.Label, f.Min, f.Max, f.Unit, f.Step)}
		}
	}
	return nil
}

type configurationReader interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func readAssetConfigurations(ctx context.Context, reader configurationReader, id string) ([]AssetConfiguration, error) {
	rows, err := reader.Query(ctx, `SELECT a.asset_id,a.asset_name,a.asset_type,a.configuration_version,a.configuration_updated_at,
 st.asset_id IS NOT NULL,pm.asset_id IS NOT NULL,fm.asset_id IS NOT NULL,
 st.capacity_l,st.holding_time_limit_hours,pm.input_flow_lph,pm.output_flow_lph,pm.process_speed_lph,
 COALESCE(st.cip_duration_minutes,pm.cip_duration_minutes),fm.speed_packph
 FROM milkgraph.assets a LEFT JOIN milkgraph.storage_tanks st USING(asset_id)
 LEFT JOIN milkgraph.production_machines pm USING(asset_id) LEFT JOIN milkgraph.filling_machines fm USING(asset_id)
 WHERE ($1='' OR a.asset_id=$1) ORDER BY a.asset_id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AssetConfiguration{}
	for rows.Next() {
		var c AssetConfiguration
		var tank, machine, filling bool
		var capacity, holding, input, output, speed, cip, packs *float64
		if err = rows.Scan(&c.AssetID, &c.AssetName, &c.AssetType, &c.Version, &c.UpdatedAt, &tank, &machine, &filling, &capacity, &holding, &input, &output, &speed, &cip, &packs); err != nil {
			return nil, err
		}
		c.Fields = configurationFields(tank, machine, filling)
		c.Values = map[string]*float64{}
		values := map[string]*float64{"capacity_l": capacity, "holding_time_limit_hours": holding, "input_flow_lph": input, "output_flow_lph": output, "process_speed_lph": speed, "cip_duration_minutes": cip, "speed_packph": packs}
		for _, f := range c.Fields {
			c.Values[f.Key] = values[f.Key]
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func (db *DB) AssetConfigurations(ctx context.Context, id string) ([]AssetConfiguration, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	return readAssetConfigurations(ctx, db.Pool, id)
}
func (db *DB) PatchAssetConfiguration(ctx context.Context, id string, patch AssetConfigurationPatch, log map[string]any) (AssetConfiguration, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	var result AssetConfiguration
	err := pgx.BeginTxFunc(ctx, db.Pool, pgx.TxOptions{}, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock_shared($1)", resetLock); err != nil {
			return err
		}
		var version int64
		if err := tx.QueryRow(ctx, "SELECT configuration_version FROM milkgraph.assets WHERE asset_id=$1 FOR UPDATE", id).Scan(&version); errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if version != patch.Version {
			return ErrConfigurationConflict
		}
		rows, err := readAssetConfigurations(ctx, tx, id)
		if err != nil {
			return err
		}
		before := rows[0]
		if err = ValidateConfigurationPatch(before, patch); err != nil {
			return err
		}
		fields := map[string]ConfigurationField{}
		for _, f := range before.Fields {
			fields[f.Key] = f
		}
		keys := []string{}
		for k := range patch.Changes {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, key := range keys {
			// Table and column identifiers come exclusively from the server-owned schema.
			f := fields[key]
			if _, err = tx.Exec(ctx, "UPDATE milkgraph."+f.table+" SET "+f.Key+"=$2 WHERE asset_id=$1", id, patch.Changes[key]); err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, "UPDATE milkgraph.assets SET configuration_version=configuration_version+1,configuration_updated_at=clock_timestamp() WHERE asset_id=$1", id); err != nil {
			return err
		}
		rows, err = readAssetConfigurations(ctx, tx, id)
		if err != nil {
			return err
		}
		result = rows[0]
		diff, _ := json.Marshal(map[string]any{"asset_id": id, "before": before.Values, "after": result.Values, "version": result.Version})
		if log != nil {
			log["detail"] = string(diff)
			if _, err = appendAudit(ctx, tx, log); err != nil {
				return err
			}
		}
		_, err = appendEvent(ctx, tx, "asset.configuration.updated", map[string]any{"asset_id": id, "version": result.Version})
		return err
	})
	return result, err
}
