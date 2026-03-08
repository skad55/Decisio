from datetime import datetime, timezone, date
import csv
import io
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
from app.ml_service import forecast_site, train_site_model
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(token: str = Depends(oauth2), db=Depends(get_db)) -> User:
    try:
        p = decode(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    u = (
        db.execute(
            select(User).where(
                User.id == p["sub"],
                User.org_id == p["org_id"],
                User.is_active == True,
            )
        )
        .scalar_one_or_none()
    )
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    return u


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
    ident = (payload.email or "").strip().lower()

    u = (
        db.execute(select(User).where(User.email == ident, User.is_active == True))
        .scalar_one_or_none()
    )
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenOut(access_token=create_access(u.id, u.org_id, u.role))


@app.get("/api/sites")
def list_sites(u=Depends(current_user), db=Depends(get_db)):
    rows = db.execute(select(Site).where(Site.org_id == u.org_id)).scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "address": s.address,
            "surface_m2": getattr(s, "surface_m2", None),
            "category": getattr(s, "category", None),
            "hours_json": getattr(s, "hours_json", None),
        }
        for s in rows
    ]


@app.post("/api/sites")
def create_site(payload: SiteIn, u=Depends(current_user), db=Depends(get_db)):
    s = Site(
        org_id=u.org_id,
        name=payload.name,
        address=payload.address,
        surface_m2=payload.surface_m2,
        category=payload.category,
        hours_json=payload.hours_json,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {
        "id": s.id,
        "name": s.name,
        "address": s.address,
        "surface_m2": s.surface_m2,
        "category": s.category,
        "hours_json": s.hours_json,
    }


def _parse_iso_date(x: str) -> date:
    y, m, d = x.split("-")
    return date(int(y), int(m), int(d))


def _create_batch(db, org_id: str, batch_type: str, filename: str):
    batch = ImportBatch(
        org_id=org_id,
        type=batch_type,
        filename=filename,
        status="failed",
        rows_total=0,
        rows_ok=0,
        rows_duplicated=0,
        rows_failed=0,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _finalize_batch(db, batch: ImportBatch, total: int, ok: int, dup: int, failed: int, errors: list[tuple[int, str]]):
    batch.rows_total = total
    batch.rows_ok = ok
    batch.rows_duplicated = dup
    batch.rows_failed = failed
    batch.status = "success" if failed == 0 else "failed"
    db.add(batch)
    db.commit()

    for rownum, msg in errors[:200]:
        db.add(ImportError(batch_id=batch.id, row_number=rownum, message=msg))
    db.commit()

    return {
        "batch_id": batch.id,
        "filename": batch.filename,
        "type": batch.type,
        "status": batch.status,
        "rows_total": total,
        "rows_ok": ok,
        "rows_duplicated": dup,
        "rows_failed": failed,
        "errors_preview": [{"row": rn, "error": msg} for rn, msg in errors[:10]],
    }


def _site_map(db, org_id: str):
    return {
        s.name.strip().lower(): s
        for s in db.execute(select(Site).where(Site.org_id == org_id)).scalars().all()
    }


@app.post("/api/import/ca")
def import_ca(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
    filename = file.filename or "upload.csv"
    batch = _create_batch(db, u.org_id, "sales_ca", filename)

    content = file.file.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    site_by_name = _site_map(db, u.org_id)

    errors: list[tuple[int, str]] = []
    ok = dup = failed = total = 0

    for idx, r in enumerate(reader, start=2):
        total += 1
        try:
            day_s = (r.get("date") or "").strip()
            site_raw = (r.get("site") or "").strip()
            site_key = site_raw.lower()
            ca_s = (r.get("ca") or "").strip()

            if not day_s or not site_key or not ca_s:
                raise ValueError("missing required columns date/site/ca")
            if site_key not in site_by_name:
                raise ValueError(f"unknown site '{site_raw}' (create the site first)")

            day = _parse_iso_date(day_s)
            revenue = Decimal(ca_s.replace(",", "."))

            db.add(
                Sale(
                    org_id=u.org_id,
                    site_id=site_by_name[site_key].id,
                    day=day,
                    revenue_eur=revenue,
                    source_batch_id=batch.id,
                )
            )
            try:
                db.commit()
                ok += 1
            except IntegrityError:
                db.rollback()
                dup += 1

        except Exception as e:
            db.rollback()
            failed += 1
            errors.append((idx, str(e)))

    return _finalize_batch(db, batch, total, ok, dup, failed, errors)


def _import_variable_rows(db, u: User, file: UploadFile, batch_type: str, handler):
    filename = file.filename or "upload.csv"
    batch = _create_batch(db, u.org_id, batch_type, filename)
    content = file.file.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    site_by_name = _site_map(db, u.org_id)

    errors: list[tuple[int, str]] = []
    ok = dup = failed = total = 0

    for idx, r in enumerate(reader, start=2):
        total += 1
        try:
            day = _parse_iso_date((r.get("date") or "").strip())
            site_raw = (r.get("site") or "").strip()
            if not site_raw:
                raise ValueError("missing site")
            site = site_by_name.get(site_raw.lower())
            if not site:
                raise ValueError(f"unknown site '{site_raw}'")

            obj = handler(r, day, site.id, batch.id)
            db.add(obj)
            try:
                db.commit()
                ok += 1
            except IntegrityError:
                db.rollback()
                dup += 1
        except Exception as e:
            db.rollback()
            failed += 1
            errors.append((idx, str(e)))

    return _finalize_batch(db, batch, total, ok, dup, failed, errors)


@app.post("/api/import/weather")
def import_weather(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
    return _import_variable_rows(
        db,
        u,
        file,
        "weather",
        lambda r, day, site_id, batch_id: WeatherDaily(
            org_id=u.org_id,
            site_id=site_id,
            day=day,
            temp_c=float((r.get("temp_c") or "15").replace(",", ".")),
            rain_mm=float((r.get("rain_mm") or "0").replace(",", ".")),
            source_batch_id=batch_id,
        ),
    )


@app.post("/api/import/traffic")
def import_traffic(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
    return _import_variable_rows(
        db,
        u,
        file,
        "traffic",
        lambda r, day, site_id, batch_id: TrafficDaily(
            org_id=u.org_id,
            site_id=site_id,
            day=day,
            traffic_index=float((r.get("traffic_index") or "100").replace(",", ".")),
            source_batch_id=batch_id,
        ),
    )


@app.post("/api/import/staffing")
def import_staffing(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
    return _import_variable_rows(
        db,
        u,
        file,
        "staffing",
        lambda r, day, site_id, batch_id: StaffingDaily(
            org_id=u.org_id,
            site_id=site_id,
            day=day,
            staff_count=int(r.get("staff_count") or "0"),
            source_batch_id=batch_id,
        ),
    )


@app.post("/api/import/events")
def import_events(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
    filename = file.filename or "upload.csv"
    batch = _create_batch(db, u.org_id, "events", filename)

    content = file.file.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    site_by_name = _site_map(db, u.org_id)
    errors: list[tuple[int, str]] = []
    ok = dup = failed = total = 0

    for idx, r in enumerate(reader, start=2):
        total += 1
        try:
            day = _parse_iso_date((r.get("date") or "").strip())
            site_raw = (r.get("site") or "").strip()
            site_id = None
            if site_raw:
                site = site_by_name.get(site_raw.lower())
                if not site:
                    raise ValueError(f"unknown site '{site_raw}'")
                site_id = site.id

            db.add(
                EventDaily(
                    org_id=u.org_id,
                    site_id=site_id,
                    day=day,
                    event_type=(r.get("event_type") or "event").strip() or "event",
                    label=(r.get("label") or "").strip() or None,
                    intensity=float((r.get("intensity") or "1").replace(",", ".")),
                    source_batch_id=batch.id,
                )
            )
            db.commit()
            ok += 1
        except Exception as e:
            db.rollback()
            failed += 1
            errors.append((idx, str(e)))

    return _finalize_batch(db, batch, total, ok, dup, failed, errors)


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
            "id": b.id,
            "type": b.type,
            "filename": b.filename,
            "status": b.status,
            "rows_total": b.rows_total,
            "rows_ok": b.rows_ok,
            "rows_duplicated": b.rows_duplicated,
            "rows_failed": b.rows_failed,
        }
        for b in rows
    ]


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
        return forecast_site(db, u.org_id, site_id, horizon_days, model_run_id=model_run_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/kpis")
def kpis(u=Depends(current_user), db=Depends(get_db)):
    org = db.execute(select(Organisation).where(Organisation.id == u.org_id)).scalar_one()

    ca_real = db.execute(
        select(func.coalesce(func.sum(Sale.revenue_eur), 0)).where(Sale.org_id == u.org_id)
    ).scalar_one()

    return {
        "org": {"id": org.id, "name": org.name},
        "kpis": {
            "ca_real_eur": float(ca_real),
            "ca_pred_eur": float(ca_real),
            "mape": 0.0,
            "mae": 0.0,
        },
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/sites/{site_id}/dashboard")
def dashboard(site_id: str, u=Depends(current_user), db=Depends(get_db)):
    sales_rows = (
        db.execute(
            select(Sale.day, Sale.revenue_eur)
            .where(
                Sale.org_id == u.org_id,
                Sale.site_id == site_id,
            )
            .order_by(Sale.day)
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
            .order_by(ForecastPoint.day)
        )
        .all()
    )

    return {
        "historical": [
            {"day": day.isoformat(), "revenue": float(revenue)}
            for day, revenue in sales_rows
        ],
        "forecast": [
            {"day": day.isoformat(), "prediction": float(prediction)}
            for day, prediction in forecast_rows
        ],
    }
class SimulationIn(BaseModel):
    traffic_delta_pct: float = 0.0
    staff_delta: float = 0.0
    event_intensity_delta: float = 0.0
    rain_delta_mm: float = 0.0


@app.post("/api/sites/{site_id}/simulate")
def simulate(site_id: str, payload: SimulationIn, u=Depends(current_user), db=Depends(get_db)):
    latest_forecast_row = (
        db.execute(
            select(ForecastPoint.predicted_revenue_eur)
            .where(
                ForecastPoint.org_id == u.org_id,
                ForecastPoint.site_id == site_id,
            )
            .order_by(ForecastPoint.day.desc())
        )
        .first()
    )

    if not latest_forecast_row:
        raise HTTPException(status_code=404, detail="No forecast found for this site")

    latest_model_run_row = (
        db.execute(
            select(ModelRun.weights_json, ModelRun.features_json)
            .where(
                ModelRun.org_id == u.org_id,
                ModelRun.site_id == site_id,
            )
            .order_by(ModelRun.id.desc())
        )
        .first()
    )

    if not latest_model_run_row:
        raise HTTPException(status_code=404, detail="No model run found for this site")

    base_forecast = float(latest_forecast_row[0])

    import json

    weights_json = latest_model_run_row[0]
    features_json = latest_model_run_row[1]

    try:
        weights = json.loads(weights_json) if weights_json else {}
    except Exception:
        weights = {}

    try:
        features = json.loads(features_json) if features_json else []
    except Exception:
        features = []

    def resolve_weight(names: list[str], default: float = 0.0) -> float:
        if isinstance(weights, dict):
            for name in names:
                if name in weights:
                    try:
                        return float(weights[name])
                    except Exception:
                        pass

        if isinstance(weights, list) and isinstance(features, list):
            for idx, feat in enumerate(features):
                if feat in names and idx < len(weights):
                    try:
                        return float(weights[idx])
                    except Exception:
                        pass

        return default

    traffic_weight = resolve_weight(["traffic", "traffic_index"], 0.002)
    staff_weight = resolve_weight(["staff", "staff_count"], 0.03)
    rain_weight = resolve_weight(["rain", "rain_mm"], -0.01)
    events_weight = resolve_weight(["events", "event_intensity", "intensity"], 0.05)

    impact = (
        traffic_weight * (payload.traffic_delta_pct / 100.0)
        + staff_weight * payload.staff_delta
        + events_weight * payload.event_intensity_delta
        + rain_weight * payload.rain_delta_mm
    )

    simulated_revenue = base_forecast * (1 + impact)
    delta_value = simulated_revenue - base_forecast
    delta_pct = 0.0 if base_forecast == 0 else (delta_value / base_forecast) * 100.0

    return {
        "base_forecast": round(base_forecast, 2),
        "simulated_revenue": round(simulated_revenue, 2),
        "delta_value": round(delta_value, 2),
        "delta_pct": round(delta_pct, 2),
    }