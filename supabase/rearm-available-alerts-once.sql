-- OPTIONAL, ONE-TIME ONLY.
-- Use this only after the new email-alert code is deployed and the Test Alert succeeds,
-- but you want every product that is CURRENTLY marked available to send one fresh alert
-- on the next cron run.
--
-- It does NOT change product availability. It only clears the "already alerted" stamp.

update public.monitor_alert_state
set last_alerted_at = null
where available = true;
