from datetime import datetime, timezone, date
import csv
import io
import json
from decimal import Decimal

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from prometheus_client import CollectorRegistry, Gauge, generate_latest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    EventDaily,
    ForecastPoint,
    ImportBatch,
    ImportError,
    ModelRun,
    Organisation,
    Sale,
    Site,
    StaffingDaily,
    TrafficDaily,
    User,
    WeatherDaily,
)
from app.ml_service import forecast_site, train_site_model, backtest_site
from app.security import verify_password, create_access, decode


app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SiteIn(BaseModel):
    name: str
    address: str
    surface_m2: int | None = None
    category: str | None = None
    hours_json: str | None = None


class TrainIn(BaseModel):
    site_id: str


class SimulationIn(BaseModel):
    traffic_delta_pct: float = 0.0
    staff_delta: float = 0.0
    event_intensity_delta: float = 0.0
    rain_delta_mm: float = 0.0


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(token: str = Depends(oauth2), db=Depends(get_db)) -> User:
    try:
        payload = decode(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = (
        db.execute(
            select(User).where(
                User.id == payload["sub"],
                User.org_id == payload["org_id"],
                User.is_active == True,
            )
        )
        .scalar_one_or_none()
    )

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@app.get("/health")
def health():
    return {"ok": True, "env": settings.APP_ENV}


_registry = CollectorRegistry()
g_up = Gauge("app_up", "App health", registry=_registry)
g_up.set(1)


@app.get("/metrics")
def metrics():
    return Response(
        generate_latest(_registry),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db=Depends(get_db)):
    ident = payload.email.strip().lower()

    user = (
        db.execute(
            select(User).where(User.email == ident, User.is_active == True)
        )
        .scalar_one_or_none()
    )

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenOut(access_token=create_access(user.id, user.org_id, user.role))


@app.get("/api/sites")
def list_sites(u=Depends(current_user), db=Depends(get_db)):
    rows = db.execute(select(Site).where(Site.org_id == u.org_id)).scalars().all()

    return [
        {
            "id": s.id,
            "name": s.name,
            "address": s.address,
            "surface_m2": s.surface_m2,
            "category": s.category,
            "hours_json": s.hours_json,
        }
        for s in rows
    ]


@app.post("/api/sites")
def create_site(payload: SiteIn, u=Depends(current_user), db=Depends(get_db)):
    site = Site(
        org_id=u.org_id,
        name=payload.name,
        address=payload.address,
        surface_m2=payload.surface_m2,
        category=payload.category,
        hours_json=payload.hours_json,
    )

    db.add(site)
    db.commit()
    db.refresh(site)

    return site


def _parse_iso_date(x: str) -> date:
    y, m, d = x.split("-")
    return date(int(y), int(m), int(d))


def _site_map(db, org_id: str):
    return {
        s.name.strip().lower(): s
        for s in db.execute(select(Site).where(Site.org_id == org_id)).scalars().all()
    }


@app.post("/api/model/train")
def train_model(payload: TrainIn, u=Depends(current_user), db=Depends(get_db)):
    try:
        run = train_site_model(db, u.org_id, payload.site_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "model_run_id": run.id,
        "site_id": run.site_id,
        "model_name": run.model_name,
        "train_rows": run.train_rows,
        "mae": run.mae,
        "mape": run.mape,
    }


@app.get("/api/forecast")
def api_forecast(
    site_id: str = Query(...),
    horizon_days: int = Query(7),
    model_run_id: str | None = Query(None),
    u=Depends(current_user),
    db=Depends(get_db),
):
    try:
        return forecast_site(
            db,
            u.org_id,
            site_id,
            horizon_days,
            model_run_id=model_run_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/backtest")
def api_backtest(
    site_id: str = Query(...),
    horizon_days: int = Query(7),
    model_run_id: str | None = Query(None),
    u=Depends(current_user),
    db=Depends(get_db),
):
    try:
        return backtest_site(
            db,
            u.org_id,
            site_id,
            horizon_days,
            model_run_id=model_run_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/sites/{site_id}/dashboard")
def dashboard(site_id: str, u=Depends(current_user), db=Depends(get_db)):
    sales_rows = (
        db.execute(
            select(Sale.day, Sale.revenue_eur)
            .where(Sale.org_id == u.org_id, Sale.site_id == site_id)
            .order_by(Sale.day)
        )
        .all()
    )

    forecast_rows = (
        db.execute(
            select(ForecastPoint.day, ForecastPoint.predicted_revenue_eur)
            .where(ForecastPoint.org_id == u.org_id, ForecastPoint.site_id == site_id)
            .order_by(ForecastPoint.day)
        )
        .all()
    )

    return {
        "historical": [
            {"day": d.isoformat(), "revenue": float(v)}
            for d, v in sales_rows
        ],
        "forecast": [
            {"day": d.isoformat(), "prediction": float(v)}
            for d, v in forecast_rows
        ],
    }


@app.post("/api/sites/{site_id}/simulate")
def simulate(site_id: str, payload: SimulationIn, u=Depends(current_user), db=Depends(get_db)):
    latest_forecast = (
        db.execute(
            select(ForecastPoint.predicted_revenue_eur)
            .where(ForecastPoint.org_id == u.org_id, ForecastPoint.site_id == site_id)
            .order_by(ForecastPoint.day.desc())
        )
        .scalar_one_or_none()
    )

    if latest_forecast is None:
        raise HTTPException(status_code=404, detail="No forecast found")

    latest_model = (
        db.execute(
            select(ModelRun.weights_json, ModelRun.features_json)
            .where(ModelRun.org_id == u.org_id, ModelRun.site_id == site_id)
            .order_by(ModelRun.id.desc())
        )
        .first()
    )

    if not latest_model:
        raise HTTPException(status_code=404, detail="No model run found")

    base_forecast = float(latest_forecast)

    weights = json.loads(latest_model[0] or "{}")
    features = json.loads(latest_model[1] or "[]")

    def resolve_weight(names, default=0.0):
        if isinstance(weights, dict):
            for n in names:
                if n in weights:
                    return float(weights[n])

        if isinstance(weights, list):
            for i, f in enumerate(features):
                if f in names and i < len(weights):
                    return float(weights[i])

        return default

    traffic_weight = resolve_weight(["traffic", "traffic_index"], 0.002)
    staff_weight = resolve_weight(["staff", "staff_count"], 0.03)
    rain_weight = resolve_weight(["rain", "rain_mm"], -0.01)
    events_weight = resolve_weight(["events", "event_intensity"], 0.05)

    impact = (
        traffic_weight * (payload.traffic_delta_pct / 100)
        + staff_weight * payload.staff_delta
        + events_weight * payload.event_intensity_delta
        + rain_weight * payload.rain_delta_mm
    )

    simulated = base_forecast * (1 + impact)

    return {
        "base_forecast": round(base_forecast, 2),
        "simulated_revenue": round(simulated, 2),
        "delta_value": round(simulated - base_forecast, 2),
        "delta_pct": round(((simulated - base_forecast) / base_forecast) * 100, 2),
    }


@app.get("/api/sites/{site_id}/summary")
def site_summary(site_id: str, u=Depends(current_user), db=Depends(get_db)):
    sales_rows = (
        db.execute(
            select(Sale.day, Sale.revenue_eur)
            .where(
                Sale.org_id == u.org_id,
                Sale.site_id == site_id,
            )
            .order_by(Sale.day.desc())
            .limit(7)
        )
        .all()
    )

    forecast_rows = (
        db.execute(
            select(ForecastPoint.day, ForecastPoint.predicted_revenue_eur)
            .where(
                ForecastPoint.org_id == u.org_id,
                ForecastPoint.site_id == site_id,
            )
            .order_by(ForecastPoint.day.asc())
            .limit(7)
        )
        .all()
    )

    latest_forecast_run_id = (
        db.execute(
            select(ForecastPoint.model_run_id)
            .where(
                ForecastPoint.org_id == u.org_id,
                ForecastPoint.site_id == site_id,
            )
            .order_by(ForecastPoint.day.desc())
            .limit(1)
        )
        .scalar_one_or_none()
    )

    latest_run = None
    if latest_forecast_run_id:
        latest_run = (
            db.execute(
                select(ModelRun).where(
                    ModelRun.id == latest_forecast_run_id,
                    ModelRun.org_id == u.org_id,
                    ModelRun.site_id == site_id,
                )
            )
            .scalars()
            .first()
        )

    historical_7d = [
        {"day": day.isoformat(), "revenue": float(revenue)}
        for day, revenue in reversed(sales_rows)
    ]

    forecast_7d = [
        {"day": day.isoformat(), "prediction": float(prediction)}
        for day, prediction in forecast_rows
    ]

    historical_sum = float(sum(float(revenue) for _, revenue in sales_rows))
    forecast_sum = float(sum(float(prediction) for _, prediction in forecast_rows))

    return {
        "site_id": site_id,
        "historical_7d_sum": historical_sum,
        "forecast_7d_sum": forecast_sum,
        "delta_value": forecast_sum - historical_sum,
        "delta_pct": 0.0 if historical_sum == 0 else ((forecast_sum - historical_sum) / historical_sum) * 100.0,
        "mape": float(latest_run.mape) if latest_run else None,
        "mae": float(latest_run.mae) if latest_run else None,
        "historical_7d": historical_7d,
        "forecast_7d": forecast_7d,
    }


@app.get("/api/sites/{site_id}/drivers")
def site_drivers(site_id: str, u=Depends(current_user), db=Depends(get_db)):
    latest_forecast_run_id = (
        db.execute(
            select(ForecastPoint.model_run_id)
            .where(
                ForecastPoint.org_id == u.org_id,
                ForecastPoint.site_id == site_id,
            )
            .order_by(ForecastPoint.day.desc())
            .limit(1)
        )
        .scalar_one_or_none()
    )

    if not latest_forecast_run_id:
        raise HTTPException(status_code=404, detail="No forecast found for this site")

    run = (
        db.execute(
            select(ModelRun).where(
                ModelRun.id == latest_forecast_run_id,
                ModelRun.org_id == u.org_id,
                ModelRun.site_id == site_id,
            )
        )
        .scalars()
        .first()
    )

    if not run:
        raise HTTPException(status_code=404, detail="No model run found for this site")

    weights = [float(x) for x in json.loads(run.weights_json)]
    payload = json.loads(run.features_json)
    names = payload.get("names", [])

    drivers = [
        {"feature": name, "weight": weight}
        for name, weight in zip(names, weights)
    ]
    drivers.sort(key=lambda x: abs(x["weight"]), reverse=True)

    return {
        "site_id": site_id,
        "model_run_id": run.id,
        "model_name": run.model_name,
        "drivers": drivers,
    }


@app.get("/api/sites/{site_id}/copilot")
def site_copilot(site_id: str, u=Depends(current_user), db=Depends(get_db)):
    sales_rows = (
        db.execute(
            select(Sale.day, Sale.revenue_eur)
            .where(
                Sale.org_id == u.org_id,
                Sale.site_id == site_id,
            )
            .order_by(Sale.day.desc())
            .limit(7)
        )
        .all()
    )

    forecast_rows = (
        db.execute(
            select(ForecastPoint.day, ForecastPoint.predicted_revenue_eur, ForecastPoint.model_run_id)
            .where(
                ForecastPoint.org_id == u.org_id,
                ForecastPoint.site_id == site_id,
            )
            .order_by(ForecastPoint.day.asc())
            .limit(7)
        )
        .all()
    )

    if not forecast_rows:
        raise HTTPException(status_code=404, detail="No forecast found for this site")

    model_run_id = forecast_rows[0][2]

    run = (
        db.execute(
            select(ModelRun).where(
                ModelRun.id == model_run_id,
                ModelRun.org_id == u.org_id,
                ModelRun.site_id == site_id,
            )
        )
        .scalars()
        .first()
    )

    if not run:
        raise HTTPException(status_code=404, detail="No model run found for this site")

    weights = [float(x) for x in json.loads(run.weights_json)]
    payload = json.loads(run.features_json)
    names = payload.get("names", [])

    drivers = [
        {"feature": name, "weight": weight}
        for name, weight in zip(names, weights)
    ]
    drivers.sort(key=lambda x: abs(x["weight"]), reverse=True)

    historical_7d = [
        {"day": day.isoformat(), "revenue": float(revenue)}
        for day, revenue in reversed(sales_rows)
    ]

    forecast_7d = [
        {"day": day.isoformat(), "prediction": float(prediction)}
        for day, prediction, _ in forecast_rows
    ]

    historical_sum = float(sum(float(revenue) for _, revenue in sales_rows))
    forecast_sum = float(sum(float(prediction) for _, prediction, _ in forecast_rows))

    trend_word = "up" if forecast_sum >= historical_sum else "down"
    top_driver = drivers[0]["feature"] if drivers else None

    if historical_sum != 0:
        delta_val = abs(forecast_sum - historical_sum)
        delta_pct_abs = abs(((forecast_sum - historical_sum) / historical_sum) * 100.0)
        insight = f"7-day forecast {trend_word} by {delta_val:.2f} EUR ({delta_pct_abs:.2f}%)"
    else:
        insight = "No historical baseline available"

    if top_driver:
        insight += f". Top detected driver: {top_driver}."

    return {
        "insight": insight,
        "site_id": site_id,
        "model_run_id": run.id,
        "model_name": run.model_name,
        "mae": float(run.mae),
        "mape": float(run.mape),
        "historical_7d_sum": historical_sum,
        "forecast_7d_sum": forecast_sum,
        "delta_value": forecast_sum - historical_sum,
        "delta_pct": 0.0 if historical_sum == 0 else ((forecast_sum - historical_sum) / historical_sum) * 100.0,
        "historical_7d": historical_7d,
        "forecast_7d": forecast_7d,
        "top_drivers": drivers[:8],
    }


@app.get("/api/kpis")
def kpis(u=Depends(current_user), db=Depends(get_db)):

    total_sites = db.execute(
        select(func.count()).select_from(Site).where(Site.org_id == u.org_id)
    ).scalar() or 0

    total_sales = db.execute(
        select(func.coalesce(func.sum(Sale.revenue_eur), 0)).where(Sale.org_id == u.org_id)
    ).scalar() or 0

    last_sale_day = db.execute(
        select(func.max(Sale.day)).where(Sale.org_id == u.org_id)
    ).scalar()

    return {
        "sites": int(total_sites),
        "total_revenue": float(total_sales),
        "last_sale_day": last_sale_day.isoformat() if last_sale_day else None,
    }


@app.get("/api/imports")
def list_imports(u=Depends(current_user), db=Depends(get_db)):

    rows = (
        db.execute(
            select(ImportBatch)
            .where(ImportBatch.org_id == u.org_id)
            .order_by(ImportBatch.id.desc())
        )
        .scalars()
        .all()
    )

    return [
        {
            "id": r.id,
            "filename": r.filename,
            "type": r.type,
            "status": r.status,
            "rows_total": r.rows_total,
            "rows_ok": r.rows_ok,
            "rows_duplicated": r.rows_duplicated,
            "rows_failed": r.rows_failed,
        }
        for r in rows
    ]


@app.post("/api/import/ca")
async def import_ca(
    file: UploadFile = File(...),
    u=Depends(current_user),
    db=Depends(get_db),
):

    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    batch = ImportBatch(
        org_id=u.org_id,
        filename=file.filename,
        import_type="sales_ca",
        rows_total=0,
        rows_ok=0,
        status="processing",
    )

    db.add(batch)
    db.commit()
    db.refresh(batch)

    rows_ok = 0
    rows_total = 0

    for row in reader:
        rows_total += 1

        try:
            site_id = row.get("site_id")
            day = _parse_iso_date(row.get("day"))
            revenue = Decimal(row.get("revenue_eur"))

            sale = Sale(
                org_id=u.org_id,
                site_id=site_id,
                day=day,
                revenue_eur=revenue,
                source_batch_id=batch.id,
            )

            db.add(sale)
            rows_ok += 1

        except Exception as e:
            db.add(
                ImportError(
                    batch_id=batch.id,
                    row_number=rows_total,
                    message=str(e),
                )
            )

    batch.rows_total = rows_total
    batch.rows_ok = rows_ok
    batch.status = "success"

    db.commit()

    return {
        "batch_id": batch.id,
        "rows_total": rows_total,
        "rows_ok": rows_ok,
    }


@app.post("/api/import/weather")
async def import_weather(
    file: UploadFile = File(...),
    u=Depends(current_user),
    db=Depends(get_db),
):

    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    rows_ok = 0
    rows_total = 0

    for row in reader:
        rows_total += 1

        try:
            w = WeatherDaily(
                org_id=u.org_id,
                site_id=row.get("site_id"),
                day=_parse_iso_date(row.get("day")),
                temp_c=float(row.get("temp_c")),
                rain_mm=float(row.get("rain_mm")),
            )

            db.add(w)
            rows_ok += 1

        except Exception:
            pass

    db.commit()

    return {
        "rows_total": rows_total,
        "rows_ok": rows_ok,
    }