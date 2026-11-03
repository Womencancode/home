-- Where a submission happened, to the city, and the creator's social handles. lat and lon are set only when the city is one we know.
ALTER TABLE submissions ADD COLUMN city TEXT;
ALTER TABLE submissions ADD COLUMN lat REAL;
ALTER TABLE submissions ADD COLUMN lon REAL;
ALTER TABLE submissions ADD COLUMN instagram TEXT;
ALTER TABLE submissions ADD COLUMN x_handle TEXT;
ALTER TABLE submissions ADD COLUMN tiktok TEXT;
ALTER TABLE submissions ADD COLUMN youtube TEXT;
