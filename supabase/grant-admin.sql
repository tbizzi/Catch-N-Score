-- Run by hand in the Supabase SQL editor, after signing up normally through
-- the app with the account you want as admin. Not part of schema.sql — this
-- is a one-off action, not something to re-run on every deploy.
--
-- is_admin has no client-reachable write path (see profiles_protect_is_admin()
-- in schema.sql); this works because the SQL editor runs as a role the
-- trigger treats as privileged, not because of anything client code can do.

update profiles set is_admin = true where username = 'REPLACE_WITH_YOUR_USERNAME';

-- Verify:
select id, username, is_admin from profiles where username = 'REPLACE_WITH_YOUR_USERNAME';
