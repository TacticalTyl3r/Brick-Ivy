-- Allow a historical published homepage snapshot to be restored to the private draft.
-- Publishing remains a separate explicit Owner action.
alter table public.brickivy_homepage_audit
  drop constraint if exists brickivy_homepage_audit_action_check;
alter table public.brickivy_homepage_audit
  add constraint brickivy_homepage_audit_action_check
  check (action in ('save_draft','publish','reset_draft','restore_draft'));