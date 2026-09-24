-- Fleet Maintenance System — per-user Mechanic Queue access
--
-- The Mechanic Queue was previously gated on profiles.role = 'mechanic'
-- only (plus admins) -- there was no way to grant a dispatcher or other
-- role access to it without changing their role entirely, unlike Drivers
-- rights (can_edit_roster) and Void rights (can_void_work_orders), which
-- are both independent on/off flags any user can be granted regardless
-- of role. Adds the same kind of flag here so Mechanic Queue access can
-- be toggled per-user the same way.

alter table profiles add column can_use_mechanic_queue boolean not null default false;
