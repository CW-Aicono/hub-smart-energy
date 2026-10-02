-- One-shot has done its job (verified: last_vacuum is set, heap fetches = 0). Stop the every-minute run.
SELECT cron.unschedule('mdtm-vacuum-oneshot-v2');