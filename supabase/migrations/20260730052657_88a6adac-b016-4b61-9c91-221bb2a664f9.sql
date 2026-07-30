-- Stagger cron schedules to avoid worker/connection storms at the same minute
SELECT cron.alter_job(31,  schedule => '* * * * *');        -- automation scheduler (unchanged, 1min)

-- every 2 min -> two phases
SELECT cron.alter_job(55,  schedule => '0-59/2 * * * *');
SELECT cron.alter_job(32,  schedule => '1-59/2 * * * *');
SELECT cron.alter_job(54,  schedule => '0-59/2 * * * *');
SELECT cron.alter_job(56,  schedule => '1-59/2 * * * *');

-- every 5 min -> five phases
SELECT cron.alter_job(69,  schedule => '0-59/5 * * * *');
SELECT cron.alter_job(30,  schedule => '1-59/5 * * * *');
SELECT cron.alter_job(33,  schedule => '2-59/5 * * * *');
SELECT cron.alter_job(82,  schedule => '3-59/5 * * * *');
SELECT cron.alter_job(83,  schedule => '4-59/5 * * * *');
SELECT cron.alter_job(58,  schedule => '2-59/5 * * * *');
SELECT cron.alter_job(97,  schedule => '3-59/5 * * * *');
SELECT cron.alter_job(22,  schedule => '4-59/5 * * * *');

-- every 10 min
SELECT cron.alter_job(104, schedule => '5-59/10 * * * *');
SELECT cron.alter_job(59,  schedule => '8-59/10 * * * *');
SELECT cron.alter_job(105, schedule => '3-59/10 * * * *');

-- every 15 min -> spread over distinct minutes
SELECT cron.alter_job(84,  schedule => '6-59/15 * * * *');
SELECT cron.alter_job(88,  schedule => '7-59/15 * * * *');
SELECT cron.alter_job(18,  schedule => '9-59/15 * * * *');
SELECT cron.alter_job(79,  schedule => '11-59/15 * * * *');
SELECT cron.alter_job(81,  schedule => '13-59/15 * * * *');

-- every 30 min
SELECT cron.alter_job(85,  schedule => '14,44 * * * *');
