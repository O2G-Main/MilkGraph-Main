package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"milkgraph/internal/store"
)

// UserRecord represents a user account persisted in milkgraph.users.
type UserRecord struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Email  string   `json:"email"`
	RoleID string   `json:"role_id"`
	Active bool     `json:"active"`
	Assets []string `json:"assets"`
}

var defaultUsersSeed = []UserRecord{
	{ID: "USR-01", Name: "Bagas Wicaksono", Email: "superadmin@milkgraph.id", RoleID: "superadmin", Active: true, Assets: []string{}},
	{ID: "USR-02", Name: "Rino Akbar Hanif", Email: "rino.akbar@milkgraph.id", RoleID: "planner", Active: true, Assets: []string{}},
	{ID: "USR-03", Name: "Dimas Prasetyo", Email: "dimas.prasetyo@milkgraph.id", RoleID: "receiving", Active: true, Assets: []string{}},
	{ID: "USR-04", Name: "Hendra Kusuma", Email: "hendra.kusuma@milkgraph.id", RoleID: "operator", Active: true, Assets: []string{"FM-1", "FM-2"}},
	{ID: "USR-05", Name: "Ratna Maharani", Email: "ratna.maharani@milkgraph.id", RoleID: "qa", Active: true, Assets: []string{}},
	{ID: "USR-06", Name: "Wahyu Pratama", Email: "wahyu.pratama@milkgraph.id", RoleID: "manager", Active: true, Assets: []string{}},
	{ID: "USR-07", Name: "Sri Lestari", Email: "sri.lestari@milkgraph.id", RoleID: "lab", Active: true, Assets: []string{}},
}

func defaultEmailFor(name, roleID string) string {
	if roleID == "superadmin" {
		return "superadmin@milkgraph.id"
	}
	parts := strings.Fields(strings.ToLower(strings.TrimSpace(name)))
	if len(parts) >= 2 {
		return parts[0] + "." + parts[1] + "@milkgraph.id"
	}
	if len(parts) == 1 {
		return parts[0] + "@milkgraph.id"
	}
	return "user@milkgraph.id"
}

func (s *Server) listUsers(ctx context.Context) ([]UserRecord, error) {
	if s.DB == nil {
		out := make([]UserRecord, len(defaultUsersSeed))
		copy(out, defaultUsersSeed)
		return out, nil
	}
	rows, err := s.DB.Pool.Query(ctx, `SELECT id, name, email, role_id, active, assets FROM milkgraph.users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserRecord{}
	for rows.Next() {
		var u UserRecord
		var assetsRaw []byte
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.RoleID, &u.Active, &assetsRaw); err != nil {
			return nil, err
		}
		u.Assets = []string{}
		if len(assetsRaw) > 0 {
			_ = json.Unmarshal(assetsRaw, &u.Assets)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Server) registerUsers(register func(string, string, endpoint)) {
	register("GET /api/v1/users", "", func(r *http.Request) (any, error) {
		return s.listUsers(r.Context())
	})

	register("POST /api/v1/users", "role.manage", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var b struct {
			Name   string   `json:"name"`
			Email  string   `json:"email"`
			RoleID string   `json:"role_id"`
			Assets []string `json:"assets"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		name := strings.TrimSpace(b.Name)
		if name == "" {
			return nil, invalid("Nama pengguna wajib diisi.", "name")
		}
		roleID := strings.TrimSpace(b.RoleID)
		roles, err := s.roleRegistry(r.Context())
		if err != nil {
			return nil, err
		}
		foundRole := false
		for _, rl := range roles {
			if rl.RoleID == roleID {
				foundRole = true
				break
			}
		}
		if !foundRole {
			return nil, invalid("Role tidak ditemukan.", "role_id")
		}
		email := strings.ToLower(strings.TrimSpace(b.Email))
		if email == "" {
			email = defaultEmailFor(name, roleID)
		}
		assets := b.Assets
		if assets == nil {
			assets = []string{}
		}
		assetsJSON, _ := json.Marshal(assets)
		id := fmt.Sprintf("USR-%d", time.Now().UnixMilli()%1000000)

		var exists bool
		if err := s.DB.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM milkgraph.users WHERE email = $1)`, email).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			email = fmt.Sprintf("%s-%d@milkgraph.id", strings.Split(email, "@")[0], time.Now().Unix()%1000)
		}

		_, err = s.DB.Pool.Exec(r.Context(),
			`INSERT INTO milkgraph.users (id, name, email, role_id, active, assets) VALUES ($1, $2, $3, $4, true, $5)`,
			id, name, email, roleID, assetsJSON)
		if err != nil {
			return nil, err
		}
		a, _ := s.authenticate(r)
		u := UserRecord{ID: id, Name: name, Email: email, RoleID: roleID, Active: true, Assets: assets}
		_, _ = s.change(r.Context(), "users-event", "latest", func(_ *store.Tx, _ json.RawMessage) (store.Change, error) {
			return store.Change{Value: u, Log: auditEntry(a, "akses", "Pengguna ditambahkan", name+" ("+roleID+")", "", "ok"), Event: "user.created"}, nil
		})
		return u, nil
	})

	register("PUT /api/v1/users/{id}", "role.manage", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		id := r.PathValue("id")
		var b struct {
			Name   *string  `json:"name"`
			RoleID *string  `json:"role_id"`
			Active *bool    `json:"active"`
			Assets []string `json:"assets"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		var cur UserRecord
		var assetsRaw []byte
		err := s.DB.Pool.QueryRow(r.Context(), `SELECT id, name, email, role_id, active, assets FROM milkgraph.users WHERE id = $1`, id).
			Scan(&cur.ID, &cur.Name, &cur.Email, &cur.RoleID, &cur.Active, &assetsRaw)
		if err != nil {
			return nil, missing()
		}
		cur.Assets = []string{}
		if len(assetsRaw) > 0 {
			_ = json.Unmarshal(assetsRaw, &cur.Assets)
		}
		if b.Name != nil && strings.TrimSpace(*b.Name) != "" {
			cur.Name = strings.TrimSpace(*b.Name)
		}
		if b.RoleID != nil && strings.TrimSpace(*b.RoleID) != "" {
			if cur.ID == "USR-01" && *b.RoleID != "superadmin" {
				return nil, invalid("Role Superadmin bawaan tidak dapat diubah.", "role_id")
			}
			cur.RoleID = strings.TrimSpace(*b.RoleID)
		}
		if b.Active != nil {
			if cur.ID == "USR-01" && !*b.Active {
				return nil, invalid("Akun Superadmin bawaan tidak dapat dinonaktifkan.", "active")
			}
			cur.Active = *b.Active
		}
		if b.Assets != nil {
			cur.Assets = b.Assets
		}
		assetsJSON, _ := json.Marshal(cur.Assets)
		_, err = s.DB.Pool.Exec(r.Context(),
			`UPDATE milkgraph.users SET name = $2, role_id = $3, active = $4, assets = $5, updated_at = now() WHERE id = $1`,
			cur.ID, cur.Name, cur.RoleID, cur.Active, assetsJSON)
		if err != nil {
			return nil, err
		}
		a, _ := s.authenticate(r)
		_, _ = s.change(r.Context(), "users-event", "latest", func(_ *store.Tx, _ json.RawMessage) (store.Change, error) {
			return store.Change{Value: cur, Log: auditEntry(a, "akses", "Pengguna diperbarui", cur.Name+" ("+cur.RoleID+")", "", "neutral"), Event: "user.updated"}, nil
		})
		return cur, nil
	})

	register("DELETE /api/v1/users/{id}", "role.manage", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		id := r.PathValue("id")
		if id == "USR-01" {
			return nil, invalid("Akun Superadmin bawaan tidak dapat dihapus.", "id")
		}
		tag, err := s.DB.Pool.Exec(r.Context(), `DELETE FROM milkgraph.users WHERE id = $1`, id)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, missing()
		}
		a, _ := s.authenticate(r)
		delPayload := map[string]any{"id": id}
		_, _ = s.change(r.Context(), "users-event", "latest", func(_ *store.Tx, _ json.RawMessage) (store.Change, error) {
			return store.Change{Value: delPayload, Log: auditEntry(a, "akses", "Pengguna dihapus", id, "", "warn"), Event: "user.deleted"}, nil
		})
		return map[string]any{"deleted": id}, nil
	})
}
