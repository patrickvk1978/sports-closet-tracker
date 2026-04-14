-- Allow 'generate_reports' as a valid narrative_config config_type
ALTER TABLE public.narrative_config
  DROP CONSTRAINT narrative_config_config_type_check;

ALTER TABLE public.narrative_config
  ADD CONSTRAINT narrative_config_config_type_check
  CHECK (config_type IN ('persona_override', 'instruction', 'setting', 'trigger', 'generate_reports'));
