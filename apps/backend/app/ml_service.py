from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import fabs, isfinite
from statistics import mean
import json
import os
from typing import Any
from urllib.parse import urlencode

from sqlalchemy import select

from app.models import (
    EventDaily,
    ForecastPoint,
    ModelRun,
    Sale,
    Site,
    StaffingDaily,
    TrafficDaily,
    WeatherDaily,
)
from app.weather_backfill import geocode_site_address, http_get_json


OPEN_METEO_FORECAST_URL = os.getenv(
    "OPEN_METEO_FORECAST_URL",
    "https://api.open-meteo.com/v1/forecast",
)

FEATURE_NAMES = [
    "dow",
    "month",
    "is_weekend",
    "lag_1",
    "lag_7",
    "rolling7",
    "temp_c",
    "rain_mm",
    "temp_delta_7d",
    "rain_delta_7d",
    "traffic_index",
    "staff_count",
    "event_intensity",
    "surface_m2",
    "is_flagship",
]


@dataclass
class FeatureRow:
    day: date
    y: float
    x: list[float]


def _safe(v: float | None, fallback: float) -> float:
    return fallback if v is None else float(v)


def _site_flagship(category: str | None) -> float:
    if not category:
        return 0.0
    return 1.0 if category.lower() in {"flagship", "premium"} else 0.0


def _historical_weather_baseline(
    weather: dict[date, tuple[float | None, float | None]],
    target_day: date,
) -> tuple[float, float]:
    same_month_rows = [
        row
        for day_key, row in weather.items()
        if day_key < target_day and day_key.month == target_day.month
    ]

    source_rows = same_month_rows
    if not source_rows:
        source_rows = [row for day_key, row in weather.items() if day_key < target_day]

    temp_values = [float(temp) for temp, _ in source_rows if temp is not None]
    rain_values = [float(rain) for _, rain in source_rows if rain is not None]

    temp_c = mean(temp_values) if temp_values else 15.0
    rain_mm = mean(rain_values) if rain_values else 0.0
    return float(temp_c), float(rain_mm)


def _resolve_weather_for_day(
    day: date,
    weather: dict[date, tuple[float | None, float | None]],
) -> tuple[float, float]:
    current = weather.get(day)
    if current is not None:
        return _safe(current[0], 15.0), _safe(current[1], 0.0)
    return _historical_weather_baseline(weather, day)


def _build_feature_vector(
    day: date,
    sales_hist: dict[date, float],
    weather: dict[date, tuple[float | None, float | None]],
    traffic: dict[date, float],
    staffing: dict[date, int],
    events: dict[date, float],
    surface_m2: int | None,
    category: str | None,
) -> list[float]:
    l1 = sales_hist.get(day - timedelta(days=1), 0.0)
    l7 = sales_hist.get(day - timedelta(days=7), l1)
    rolling_vals = [sales_hist.get(day - timedelta(days=i), l1) for i in range(1, 8)]
    rolling7 = mean(rolling_vals) if rolling_vals else l1

    temp_c, rain_mm = _resolve_weather_for_day(day, weather)
    temp_prev_7, rain_prev_7 = _resolve_weather_for_day(day - timedelta(days=7), weather)

    return [
        float(day.weekday()),
        float(day.month),
        1.0 if day.weekday() >= 5 else 0.0,
        float(l1),
        float(l7),
        float(rolling7),
        float(temp_c),
        float(rain_mm),
        float(temp_c - temp_prev_7),
        float(rain_mm - rain_prev_7),
        float(traffic.get(day, 100.0)),
        float(staffing.get(day, 4)),
        float(events.get(day, 0.0)),
        float(surface_m2 or 0),
        _site_flagship(category),
    ]


def _normalize(rows: list[FeatureRow]) -> tuple[list[list[float]], list[float], list[float]]:
    if not rows:
        return [], [], []
    n_features = len(rows[0].x)
    means = [mean([r.x[j] for r in rows]) for j in range(n_features)]
    stds = []
    for j in range(n_features):
        var = mean([(r.x[j] - means[j]) ** 2 for r in rows])
        std = var ** 0.5
        stds.append(std if std > 1e-9 else 1.0)
    xs = [[(r.x[j] - means[j]) / stds[j] for j in range(n_features)] for r in rows]
    return xs, means, stds


def _gradient_descent(
    xs: list[list[float]], ys: list[float], lr: float = 0.01, epochs: int = 1500
) -> tuple[float, list[float]]:
    if not xs:
        return 0.0, [0.0] * len(FEATURE_NAMES)

    n_features = len(xs[0])
    w = [0.0] * n_features
    b = mean(ys)
    n = float(len(xs))

    for _ in range(epochs):
        grad_w = [0.0] * n_features
        grad_b = 0.0
        for x, y in zip(xs, ys):
            pred = b + sum(w[j] * x[j] for j in range(n_features))
            err = pred - y
            grad_b += err
            for j in range(n_features):
                grad_w[j] += err * x[j]

        b -= lr * (grad_b / n)
        for j in range(n_features):
            w[j] -= lr * (grad_w[j] / n)

        if not isfinite(b) or any(not isfinite(v) for v in w):
            return mean(ys), [0.0] * n_features

    return b, w


def _predict(
    b: float, w: list[float], x_raw: list[float], means: list[float], stds: list[float]
) -> float:
    x = [(x_raw[j] - means[j]) / stds[j] for j in range(len(w))]
    return b + sum(w[j] * x[j] for j in range(len(w)))


def _metrics(
    rows: list[FeatureRow], b: float, w: list[float], means: list[float], stds: list[float]
) -> tuple[float, float]:
    if not rows:
        return 0.0, 0.0
    preds = [_predict(b, w, r.x, means, stds) for r in rows]
    ys = [r.y for r in rows]
    mae = sum(fabs(y - p) for y, p in zip(ys, preds)) / len(ys)
    denom = [max(fabs(y), 1.0) for y in ys]
    mape = sum(fabs(y - p) / d for y, p, d in zip(ys, preds, denom)) / len(ys)
    return float(mae), float(mape)


def _load_context(db, org_id: str, site_id: str):
    site = db.execute(
        select(Site).where(Site.org_id == org_id, Site.id == site_id)
    ).scalar_one_or_none()
    if not site:
        raise ValueError("unknown site")

    sales_rows = db.execute(
        select(Sale)
        .where(Sale.org_id == org_id, Sale.site_id == site_id)
        .order_by(Sale.day.asc())
    ).scalars().all()
    weather_rows = db.execute(
        select(WeatherDaily).where(WeatherDaily.org_id == org_id, WeatherDaily.site_id == site_id)
    ).scalars().all()
    traffic_rows = db.execute(
        select(TrafficDaily).where(TrafficDaily.org_id == org_id, TrafficDaily.site_id == site_id)
    ).scalars().all()
    staffing_rows = db.execute(
        select(StaffingDaily).where(StaffingDaily.org_id == org_id, StaffingDaily.site_id == site_id)
    ).scalars().all()
    event_rows = db.execute(
        select(EventDaily)
        .where(EventDaily.org_id == org_id)
        .where((EventDaily.site_id == site_id) | (EventDaily.site_id.is_(None)))
    ).scalars().all()

    sales_hist = {r.day: float(r.revenue_eur) for r in sales_rows}
    weather = {r.day: (r.temp_c, r.rain_mm) for r in weather_rows}
    traffic = {r.day: float(r.traffic_index) for r in traffic_rows}
    staffing = {r.day: int(r.staff_count) for r in staffing_rows}
    events: dict[date, float] = {}
    for r in event_rows:
        events[r.day] = events.get(r.day, 0.0) + float(r.intensity)

    return site, sales_rows, sales_hist, weather, traffic, staffing, events


def _fetch_live_future_weather(site: Site) -> dict[date, tuple[float | None, float | None]]:
    if not getattr(site, "address", None):
        return {}

    try:
        latitude, longitude, _ = geocode_site_address(site.address)
    except Exception:
        return {}

    params: dict[str, Any] = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "UTC",
        "forecast_days": 16,
        "daily": "temperature_2m_mean,precipitation_sum",
    }

    try:
        payload = http_get_json(OPEN_METEO_FORECAST_URL, params)
    except Exception:
        return {}

    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    temps = daily.get("temperature_2m_mean") or []
    rains = daily.get("precipitation_sum") or []

    if not (len(times) == len(temps) == len(rains)):
        return {}

    rows: dict[date, tuple[float | None, float | None]] = {}
    for i in range(len(times)):
        try:
            day_value = date.fromisoformat(times[i])
        except Exception:
            continue

        temp_value = None if temps[i] is None else float(temps[i])
        rain_value = None if rains[i] is None else float(rains[i])
        rows[day_value] = (temp_value, rain_value)

    return rows


def train_site_model(db, org_id: str, site_id: str) -> ModelRun:
    site, sales_rows, sales_hist, weather, traffic, staffing, events = _load_context(
        db, org_id, site_id
    )
    if len(sales_rows) < 14:
        raise ValueError("need at least 14 sales rows to train")

    rows = [
        FeatureRow(
            day=s.day,
            y=float(s.revenue_eur),
            x=_build_feature_vector(
                s.day,
                sales_hist,
                weather,
                traffic,
                staffing,
                events,
                site.surface_m2,
                site.category,
            ),
        )
        for s in sales_rows
    ]

    split = max(2, int(len(rows) * 0.8))
    train_rows = rows[:split]
    eval_rows = rows[split:] if split < len(rows) else rows[-2:]

    xs_train, means, stds = _normalize(train_rows)
    ys_train = [r.y for r in train_rows]

    b, w = _gradient_descent(xs_train, ys_train)
    mae, mape = _metrics(eval_rows, b, w, means, stds)

    payload = {"names": FEATURE_NAMES, "means": means, "stds": stds}
    run = ModelRun(
        org_id=org_id,
        site_id=site_id,
        model_name="linear_gd_weather_v2",
        train_rows=len(train_rows),
        mae=mae,
        mape=mape,
        intercept=b,
        weights_json=json.dumps(w),
        features_json=json.dumps(payload),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def forecast_site(db, org_id: str, site_id: str, horizon_days: int, model_run_id: str | None = None):
    if horizon_days not in (7, 30):
        raise ValueError("horizon_days must be 7 or 30")

    site, sales_rows, sales_hist, weather, traffic, staffing, events = _load_context(
        db, org_id, site_id
    )
    if not sales_rows:
        raise ValueError("no sales history")

    if model_run_id:
        run = db.execute(
            select(ModelRun).where(ModelRun.id == model_run_id, ModelRun.org_id == org_id)
        ).scalar_one_or_none()
    else:
        run = db.execute(
            select(ModelRun)
            .where(ModelRun.org_id == org_id, ModelRun.site_id == site_id)
            .order_by(ModelRun.id.desc())
        ).scalars().first()

    if not run:
        run = train_site_model(db, org_id, site_id)

    weights = [float(v) for v in json.loads(run.weights_json)]
    feature_payload = json.loads(run.features_json)
    means = [float(v) for v in feature_payload.get("means", [0.0] * len(weights))]
    stds = [float(v) for v in feature_payload.get("stds", [1.0] * len(weights))]
    intercept = float(run.intercept)

    anchor_day = max(s.day for s in sales_rows)
    today_utc = date.today()
    future_weather_live = _fetch_live_future_weather(site)
    preds = []

    db.query(ForecastPoint).filter(
        ForecastPoint.org_id == org_id,
        ForecastPoint.site_id == site_id,
        ForecastPoint.model_run_id == run.id,
    ).delete()
    db.commit()

    for i in range(1, horizon_days + 1):
        day = anchor_day + timedelta(days=i)

        if day not in weather:
            if day in future_weather_live and day >= today_utc:
                weather[day] = future_weather_live[day]
            else:
                baseline_temp, baseline_rain = _historical_weather_baseline(weather, day)
                weather[day] = (baseline_temp, baseline_rain)

        x_raw = _build_feature_vector(
            day,
            sales_hist,
            weather,
            traffic,
            staffing,
            events,
            site.surface_m2,
            site.category,
        )
        pred = max(0.0, float(_predict(intercept, weights, x_raw, means, stds)))
        sales_hist[day] = pred

        db.add(
            ForecastPoint(
                org_id=org_id,
                site_id=site_id,
                model_run_id=run.id,
                day=day,
                horizon_days=horizon_days,
                predicted_revenue_eur=pred,
            )
        )
        preds.append(
            {
                "day": day.isoformat(),
                "predicted_revenue_eur": pred,
                "weather": {
                    "temp_c": float(weather[day][0]) if weather[day][0] is not None else None,
                    "rain_mm": float(weather[day][1]) if weather[day][1] is not None else None,
                    "source": "live_forecast"
                    if day in future_weather_live and day >= today_utc
                    else "historical_baseline",
                },
            }
        )

    db.commit()

    return {
        "site_id": site_id,
        "site_name": site.name,
        "horizon_days": horizon_days,
        "model_run": {
            "id": run.id,
            "model_name": run.model_name,
            "train_rows": run.train_rows,
            "mae": run.mae,
            "mape": run.mape,
            "features": feature_payload.get("names", FEATURE_NAMES),
        },
        "forecast": preds,
        "sum_predicted_eur": float(sum(p["predicted_revenue_eur"] for p in preds)),
    }
def backtest_site(
    db,
    org_id: str,
    site_id: str,
    horizon_days: int = 7,
    model_run_id: str | None = None,
):
    site, sales_rows, sales_hist, weather, traffic, staffing, events = _load_context(
        db, org_id, site_id
    )

    if len(sales_rows) < 30:
        raise ValueError("not enough history for backtest")

    if model_run_id:
        run = db.execute(
            select(ModelRun).where(
                ModelRun.id == model_run_id,
                ModelRun.org_id == org_id,
                ModelRun.site_id == site_id,
            )
        ).scalar_one_or_none()
    else:
        run = db.execute(
            select(ModelRun)
            .where(ModelRun.org_id == org_id, ModelRun.site_id == site_id)
            .order_by(ModelRun.id.desc())
        ).scalars().first()

    if not run:
        run = train_site_model(db, org_id, site_id)

    weights = [float(v) for v in json.loads(run.weights_json)]
    payload = json.loads(run.features_json)

    means = payload.get("means")
    stds = payload.get("stds")
    intercept = float(run.intercept)

    errors = []
    rows = []

    for s in sales_rows[:-horizon_days]:
        target_day = s.day + timedelta(days=horizon_days)

        if target_day not in sales_hist:
            continue

        x_raw = _build_feature_vector(
            target_day,
            sales_hist,
            weather,
            traffic,
            staffing,
            events,
            site.surface_m2,
            site.category,
        )

        pred = max(0.0, _predict(intercept, weights, x_raw, means, stds))
        real = sales_hist[target_day]

        err = real - pred
        errors.append(abs(err))

        rows.append(
            {
                "day": target_day.isoformat(),
                "real": float(real),
                "pred": float(pred),
                "error": float(err),
            }
        )

    mae = sum(errors) / len(errors) if errors else 0.0
    mape = (
        sum(abs(r["real"] - r["pred"]) / max(r["real"], 1.0) for r in rows) / len(rows)
        if rows
        else 0.0
    )

    return {
        "site_id": site_id,
        "horizon_days": horizon_days,
        "model_run_id": run.id,
        "model_name": run.model_name,
        "mae": float(mae),
        "mape": float(mape),
        "rows": rows[-30:],
    }