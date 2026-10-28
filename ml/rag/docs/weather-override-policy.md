# Weather Override Policy

`weather_risk` above 0.7 (heavy rain / thunderstorm / severe conditions on OpenWeatherMap) does not force a NO-GO by itself — it is one of seven weighted factors combined by the GO/NO-GO model.

Dispatchers may manually override an AI "GO" to "NO-GO" if local, on-the-ground conditions (flooding, road closure) are not yet reflected in the weather API data.

Dispatchers may **not** override an AI "NO-GO" to "GO" purely because the weather "looks fine outside" — the model already accounts for humidity and wind adjustments that are easy to miss by eye. Overriding a NO-GO requires manager approval (see Manager Override Authority).
