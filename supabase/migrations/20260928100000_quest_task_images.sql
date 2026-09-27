-- Quest task thumbnails (NOT YET APPLIED).
-- Each task on the Quest detail page shows its own image, uploaded by the
-- business in the Quest wizard (stored in the existing proof-media bucket).
ALTER TABLE public.quest_tasks ADD COLUMN IF NOT EXISTS image_url text;
