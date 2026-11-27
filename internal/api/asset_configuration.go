package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"milkgraph/internal/store"
	"milkgraph/seed/master"
)

func (s *Server) registerAssetConfiguration(register func(string, string, endpoint)) {
	register("GET /api/v1/production/assets/{id}/configuration", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		rows, err := s.DB.AssetConfigurations(r.Context(), r.PathValue("id"))
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			return nil, missing()
		}
		return rows[0], nil
	})
	register("PATCH /api/v1/production/assets/{id}/configuration", "constraint.edit", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var patch store.AssetConfigurationPatch
		if err := decode(r, &patch); err != nil {
			return nil, err
		}
		auth, err := s.authenticate(r)
		if err != nil {
			return nil, err
		}
		result, err := s.DB.PatchAssetConfiguration(r.Context(), r.PathValue("id"), patch, auditEntry(auth, "constraint", "Konfigurasi alat diubah", "", "", "neutral"))
		var validation *store.ConfigurationValidation
		if errors.As(err, &validation) {
			return nil, invalid(validation.Message, validation.Field)
		}
		if errors.Is(err, store.ErrNotFound) {
			return nil, missing()
		}
		if errors.Is(err, store.ErrConfigurationConflict) {
			return nil, &apiError{409, "CONFLICT", "Konfigurasi alat sudah berubah. Muat ulang sebelum menyimpan.", "version"}
		}
		return result, err
	})
}

// configuredCatalog overlays relational settings on a private copy. Scheduler and UI
// read the same values; no mutable catalog cache is shared between requests.
func (s *Server) configuredCatalog(ctx context.Context) (*master.Catalog, error) {
	base, err := s.katalogMaster()
	if err != nil {
		return nil, err
	}
	if s.DB == nil {
		return base, nil
	}
	catalog := clone(base)
	configs, err := s.DB.AssetConfigurations(ctx, "")
	if err != nil {
		return nil, err
	}
	byID := map[string]store.AssetConfiguration{}
	for _, c := range configs {
		byID[c.AssetID] = c
	}
	for _, a := range catalog.Assets() {
		if c, ok := byID[a["asset_id"]]; ok {
			for key, value := range c.Values {
				a[key] = ""
				if value != nil {
					a[key] = strings.ReplaceAll(strconv.FormatFloat(*value, 'f', -1, 64), ".", ",")
				}
			}
		}
	}
	for _, row := range catalog.Tables["line_dedication"] {
		if c, ok := byID[row["line_id"]]; ok {
			if value, exists := c.Values["speed_packph"]; exists {
				row["speed_packph"] = ""
				if value != nil {
					row["speed_packph"] = strings.ReplaceAll(strconv.FormatFloat(*value, 'f', -1, 64), ".", ",")
				}
			}
		}
	}
	return catalog, nil
}
func (s *Server) configuredMasterAssets(r *http.Request) ([]master.Row, error) {
	c, err := s.configuredCatalog(r.Context())
	if err != nil {
		return nil, err
	}
	return c.Assets(), nil
}
func (s *Server) configuredMasterLines(r *http.Request) (any, error) {
	c, err := s.configuredCatalog(r.Context())
	if err != nil {
		return nil, err
	}
	return c.Lines(), nil
}
