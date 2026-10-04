-- Google authorization is limited to the active 10-minute session.
-- Remove any previously stored refresh tokens so Drive access cannot be renewed later.
alter table public.drive_connections drop column if exists encrypted_refresh_token;
