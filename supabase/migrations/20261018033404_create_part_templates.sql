/*
# Create part_templates table (multi-user, owner-scoped)

1. Plain-English summary
   This gives each signed-in user a private cloud library for the part
   templates they trace in the canvas (e.g. firearm parts, slides, lowers).
   A template stores its name, real-world size, the traced outline points,
   trace styling, the preview image, and the full saved setup so a part can
   be re-placed on the bed exactly.

2. New Tables
   - `part_templates`
     - `id` (uuid, primary key, auto-generated)
     - `user_id` (uuid, not null, defaults to the authenticated user, references auth.users)
     - `name` (text, not null) - template name shown in the library
     - `width` (double precision, not null) - real-world width in `unit`
     - `height` (double precision, not null) - real-world height in `unit`
     - `unit` (text, not null, check 'in' or 'mm')
     - `mask_data_url` (text, not null) - traced outline preview image
     - `trace_points` (jsonb, nullable) - outline point list
     - `trace_closed` (boolean, nullable)
     - `trace_style` (jsonb, nullable) - stroke/fill styling
     - `setup` (jsonb, nullable) - saved design/mask/part-copies setup
     - `source` (text, nullable) - pen-trace or outline-tracer
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())

3. Security
   - Enable RLS on `part_templates`.
   - Four owner-scoped policies (SELECT / INSERT / UPDATE / DELETE), all
     restricted to authenticated users with `auth.uid() = user_id`.
   - Index on `user_id` for fast per-user listing.

4. Important notes
   - `user_id` defaults to `auth.uid()` so inserts that omit it still satisfy
     the INSERT policy.
   - The app keeps a localStorage mirror for offline desktop use.
*/

CREATE TABLE IF NOT EXISTS part_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  width double precision NOT NULL,
  height double precision NOT NULL,
  unit text NOT NULL CHECK (unit IN ('in', 'mm')),
  mask_data_url text NOT NULL,
  trace_points jsonb,
  trace_closed boolean,
  trace_style jsonb,
  setup jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_templates_user_id ON part_templates (user_id);

ALTER TABLE part_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_part_templates" ON part_templates;
CREATE POLICY "select_own_part_templates" ON part_templates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_part_templates" ON part_templates;
CREATE POLICY "insert_own_part_templates" ON part_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_part_templates" ON part_templates;
CREATE POLICY "update_own_part_templates" ON part_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_part_templates" ON part_templates;
CREATE POLICY "delete_own_part_templates" ON part_templates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
