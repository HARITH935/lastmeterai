# Risk Band Reference

- **LOW** (risk_score 0–30): safe to attempt, no review needed.
- **MEDIUM** (risk_score 31–60): proceed with caution — agent should double-check package and address details.
- **HIGH** (risk_score 61–100): likely NO-GO — requires either a reschedule or an explicit manager override to attempt.

`risk_score = round((1 - success_probability) * 100)`. The seven factors feeding this score are: `weather_risk`, `customer_history_score`, `traffic_impact`, `agent_profit_score`, `distance_score`, `time_of_day_score`, and `package_size_score`, each normalized 0.0–1.0.
