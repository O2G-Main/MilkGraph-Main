-- Per-asset optimistic concurrency. Existing subtype values remain unchanged.
ALTER TABLE milkgraph.assets ADD COLUMN configuration_version bigint NOT NULL DEFAULT 1 CHECK (configuration_version > 0);
ALTER TABLE milkgraph.assets ADD COLUMN configuration_updated_at timestamptz;
