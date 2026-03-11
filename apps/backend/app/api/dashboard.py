from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db import get_db
from app.models import Sale, ForecastPoint, ModelRun

router = APIRouter()


@router.get("/api/sites/{site_id}/dashboard")
def get_dashboard(site_id: str, db: Session = Depends(get_db)):

    sales = (
        db.query(Sale.day, Sale.revenue_eur)
        .filter(Sale.site_id == site_id)
        .order_by(Sale.day)
        .all()
    )

    forecast = (
        db.query(ForecastPoint.day, ForecastPoint.predicted_revenue_eur)
        .filter(ForecastPoint.site_id == site_id)
        .order_by(ForecastPoint.day)
        .all()
    )

    return {
        "historical": [
            {"day": s.day.isoformat(), "revenue": float(s.revenue_eur)}
            for s in sales
        ],
        "forecast": [
            {"day": f.day.isoformat(), "prediction": float(f.predicted_revenue_eur)}
            for f in forecast
        ],
    }


@router.get("/api/dashboard/forecast")
def dashboard_forecast(site_id: str, db: Session = Depends(get_db)):

    run = (
        db.query(ModelRun)
        .filter(ModelRun.site_id == site_id)
        .order_by(ModelRun.id.desc())
        .first()
    )

    forecast_rows = (
        db.query(ForecastPoint.day, ForecastPoint.predicted_revenue_eur)
        .filter(ForecastPoint.site_id == site_id)
        .order_by(ForecastPoint.day)
        .limit(7)
        .all()
    )

    today_prediction = None
    if forecast_rows:
        today_prediction = float(forecast_rows[0].predicted_revenue_eur)

    week_sum = sum(float(f.predicted_revenue_eur) for f in forecast_rows)

    return {
        "site_id": site_id,
        "model": run.model_name if run else None,
        "mae": run.mae if run else None,
        "mape": run.mape if run else None,
        "today_prediction": today_prediction,
        "week_prediction": week_sum,
        "forecast_7_days": [
            {
                "day": f.day.isoformat(),
                "prediction": float(f.predicted_revenue_eur),
            }
            for f in forecast_rows
        ],
    }