from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import fabs, isfinite
from statistics import mean
import json

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

FEATURE_NAMES = [
    "dow",
    "month",
    "is_weekend",
    "lag_1",
    "lag_7",
    "rolling7",
    "temp_c",
    "rain_mm",
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

    temp_c, rain_mm = weather.get(day, (None, None))

    return [
        float(day.weekday()),
        float(day.month),
        1.0 if day.weekday() >= 5 else 0.0,
        float(l1),
        float(l7),
        float(rolling7),
        _safe(temp_c, 15.0),
        _safe(rain_mm, 0.0),
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
        model_name="linear_gd_v1",
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
    preds = []

    db.query(ForecastPoint).filter(
        ForecastPoint.org_id == org_id,
        ForecastPoint.site_id == site_id,
        ForecastPoint.model_run_id == run.id,
    ).delete()
    db.commit()

    for i in range(1, horizon_days + 1):
        day = anchor_day + timedelta(days=i)
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
        preds.append({"day": day.isoformat(), "predicted_revenue_eur": pred})

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