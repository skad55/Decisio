from datetime import datetime, timezone, date
import csv
import io
from decimal import Decimal

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from prometheus_client import CollectorRegistry, Gauge, generate_latest

from app.config import settings
from app.db import SessionLocal
from app.models import User, Site, Organisation, ImportBatch, ImportError, Sale
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


@app.post("/api/import/ca")
def import_ca(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
    """
    CSV attendu:
    date,site,ca
    - date = YYYY-MM-DD
    - site = nom exact du site (déjà créé)
    - ca = nombre (virgule ou point accepté)
    """
    filename = file.filename or "upload.csv"

    batch = ImportBatch(
        org_id=u.org_id,
        type="sales_ca",
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

    content = file.file.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))

    site_by_name = {
        s.name.strip().lower(): s
        for s in db.execute(select(Site).where(Site.org_id == u.org_id)).scalars().all()
    }

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
            ca_s2 = ca_s.replace(",", ".")
            revenue = Decimal(ca_s2)

            sale = Sale(
                org_id=u.org_id,
                site_id=site_by_name[site_key].id,
                day=day,
                revenue_eur=revenue,
                source_batch_id=batch.id,
            )
            db.add(sale)

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
        "filename": filename,
        "status": batch.status,
        "rows_total": total,
        "rows_ok": ok,
        "rows_duplicated": dup,
        "rows_failed": failed,
        "errors_preview": [{"row": rn, "error": msg} for rn, msg in errors[:10]],
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


@app.get("/api/kpis")
def kpis(u=Depends(current_user), db=Depends(get_db)):
    org = db.execute(select(Organisation).where(Organisation.id == u.org_id)).scalar_one()

    ca_real = db.execute(
        select(func.coalesce(func.sum(Sale.revenue_eur), 0)).where(Sale.org_id == u.org_id)
    ).scalar_one()

    # étape 1: pas encore de prédictions => baseline
    ca_pred = float(ca_real)
    mape = 0.0
    mae = 0.0

    return {
        "org": {"id": org.id, "name": org.name},
        "kpis": {
            "ca_real_eur": float(ca_real),
            "ca_pred_eur": float(ca_pred),
            "mape": float(mape),
            "mae": float(mae),
        },
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }