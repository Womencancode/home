-- Women Can Code: each level of the 10-day build has its own certificate. `level` is 'level-1' or 'level-2'; rows from before
-- levels have NULL and read as Level 1.
ALTER TABLE credentials ADD COLUMN level TEXT;
