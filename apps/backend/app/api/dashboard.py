from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Sale, ForecastPoint

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
            {"day": f.day.isoformat(), "prediction": f.predicted_revenue_eur}
            for f in forecast
        ],
    }