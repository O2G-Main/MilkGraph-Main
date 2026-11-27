-- Dynamic Lab/QC Results & User Directory tables

CREATE TABLE IF NOT EXISTS milkgraph.lab_results (
    id text PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('penerimaan', 'batch', 'qc-fg')),
    subject text NOT NULL,
    detail text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('dalam-uji', 'uji-ulang', 'hasil-siap', 'lulus', 'positif')),
    params jsonb NOT NULL DEFAULT '[]'::jsonb,
    decision jsonb,
    eta text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_results_kind ON milkgraph.lab_results (kind, id);

CREATE TABLE IF NOT EXISTS milkgraph.users (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    role_id text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    assets jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON milkgraph.users (role_id, active);

INSERT INTO milkgraph.users (id, name, email, role_id, active, assets) VALUES
    ('USR-01', 'Bagas Wicaksono', 'superadmin@milkgraph.id', 'superadmin', true, '[]'::jsonb),
    ('USR-02', 'Rino Akbar Hanif', 'rino.akbar@milkgraph.id', 'planner', true, '[]'::jsonb),
    ('USR-03', 'Dimas Prasetyo', 'dimas.prasetyo@milkgraph.id', 'receiving', true, '[]'::jsonb),
    ('USR-04', 'Hendra Kusuma', 'hendra.kusuma@milkgraph.id', 'operator', true, '["FM-1", "FM-2"]'::jsonb),
    ('USR-05', 'Ratna Maharani', 'ratna.maharani@milkgraph.id', 'qa', true, '[]'::jsonb),
    ('USR-06', 'Wahyu Pratama', 'wahyu.pratama@milkgraph.id', 'manager', true, '[]'::jsonb),
    ('USR-07', 'Sri Lestari', 'sri.lestari@milkgraph.id', 'lab', true, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
