-- Make floor-plans bucket public so <img src> tags can load the images
UPDATE storage.buckets SET public = true WHERE id = 'floor-plans';

-- Also make floor-3d-models bucket public for consistency (already has public SELECT policy)
UPDATE storage.buckets SET public = true WHERE id = 'floor-3d-models';