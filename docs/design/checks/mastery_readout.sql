\echo '=== as of now(), through skill_state_current ==='
SELECT r.first_name AS who, c.attempts, c.correct,
       round(c.correct::numeric/c.attempts,2) AS raw_pct,
       s.mastery_estimate AS at_last_evidence,
       c.mastery_estimate AS today,
       c.mastery_peak, c.confidence, c.band,
       (now()::date - c.last_seen::date) AS days_since
FROM skill_state_current c
JOIN skill_state s USING (roster_entry_id, skill_id)
JOIN roster_entry r ON r.id = c.roster_entry_id ORDER BY r.first_name;
