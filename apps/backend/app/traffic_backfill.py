import argparse
import os
from datetime import date, timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import ImportBatch, ImportError as ImportErrorRow, Sale, Site, TrafficDaily
from app.weather_backfill import geocode_site_address, http_get_json


OPEN_METEO_ARCHIVE_URL = os.getenv(
    "OPEN_METEO_ARCHIVE_URL",
    "https://archive-api.open-meteo.com/v1/archive",
)
TRAFFIC_BACKFILL_DEFAULT_YEARS = int(os.getenv("TRAFFIC_BACKFILL_DEFAULT_YEARS", "3"))

TRAFFIC_FALLBACK_LAT = float(os.getenv("TRAFFIC_FALLBACK_LAT", "48.8566"))
TRAFFIC_FALLBACK_LON = float(os.getenv("TRAFFIC_FALLBACK_LON", "2.3522"))
TRAFFIC_FALLBACK_LABEL = os.getenv("TRAFFIC_FALLBACK_LABEL", "Paris fallback")


def compute_target_range(db, org_id: str, site_id: str, years_back: int) -> tuple[date, date] | None:
    min_day, max_day = db.execute(
        select(func.min(Sale.day), func.max(Sale.day)).where(
            Sale.org_id == org_id,
            Sale.site_id == site_id,
        )
    ).one()

    today = date.today()
    hard_start = today - timedelta(days=365 * years_back)
    hard_end = today - timedelta(days=1)

    if min_day is None and max_day is None:
        return hard_start, hard_end

    start_day = max(min_day, hard_start)
    end_day = min(max_day, hard_end)

    if end_day < start_day:
        return None

    return start_day, end_day


def create_batch(db, org_id: str, site_name: str) -> ImportBatch:
    batch = ImportBatch(
        org_id=org_id,
        type="traffic_api_backfill",
        filename=f"traffic-proxy:{site_name}",
        status="failed",
        rows_total=0,
        rows_ok=0,
        rows_duplicated=0,
        rows_failed=0,
    )
    db.add(batch)
    db.flush()
    return batch


def save_batch_error(db, batch_id: str, message: str) -> None:
    db.add(
        ImportErrorRow(
            batch_id=batch_id,
            row_number=0,
            message=message[:5000],
        )
    )


def resolve_site_coordinates(site: Site) -> tuple[float, float, str]:
    raw_address = (getattr(site, "address", None) or "").strip()

    if raw_address and raw_address.lower() not in {"adresse", "address", "n/a", "na", "unknown"}:
        try:
            latitude, longitude, resolved_name = geocode_site_address(raw_address)
            return latitude, longitude, resolved_name
        except Exception:
            pass

    return TRAFFIC_FALLBACK_LAT, TRAFFIC_FALLBACK_LON, TRAFFIC_FALLBACK_LABEL


def fetch_proxy_traffic_rows(
    latitude: float,
    longitude: float,
    start_day: date,
    end_day: date,
) -> list[dict]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_day.isoformat(),
        "end_date": end_day.isoformat(),
        "daily": "temperature_2m_mean,precipitation_sum",
        "timezone": "UTC",
    }

    payload = http_get_json(OPEN_METEO_ARCHIVE_URL, params)
    daily = payload.get("daily") or {}

    times = daily.get("time") or []
    temps = daily.get("temperature_2m_mean") or []
    rains = daily.get("precipitation_sum") or []

    if not (len(times) == len(temps) == len(rains)):
        raise RuntimeError("Unexpected traffic proxy payload shape")

    rows: list[dict] = []

    for i in range(len(times)):
        day_value = date.fromisoformat(times[i])
        temp_c = None if temps[i] is None else float(temps[i])
        rain_mm = None if rains[i] is None else float(rains[i])

        traffic_index = build_daily_traffic_proxy(
            day_value=day_value,
            temp_c=temp_c,
            rain_mm=rain_mm,
        )

        rows.append(
            {
                "day": day_value,
                "traffic_index": traffic_index,
            }
        )

    return rows


def build_daily_traffic_proxy(
    day_value: date,
    temp_c: float | None,
    rain_mm: float | None,
) -> float:
    index = 100.0

    if day_value.weekday() <= 4:
        index += 10.0
    else:
        index -= 12.0

    if temp_c is not None:
        if temp_c < 0:
            index -= 8.0
        elif temp_c < 5:
            index -= 5.0
        elif 12 <= temp_c <= 24:
            index += 4.0
        elif temp_c > 30:
            index -= 3.0

    if rain_mm is not None:
        if rain_mm >= 20:
            index -= 12.0
        elif rain_mm >= 10:
            index -= 8.0
        elif rain_mm >= 3:
            index -= 4.0

    return round(max(20.0, index), 2)


def upsert_traffic_rows(db, org_id: str, site_id: str, batch_id: str, rows: list[dict]) -> int:
    ok = 0

    for row in rows:
        existing = db.execute(
            select(TrafficDaily).where(
                TrafficDaily.org_id == org_id,
                TrafficDaily.site_id == site_id,
                TrafficDaily.day == row["day"],
            )
        ).scalar_one_or_none()

        if existing:
            existing.traffic_index = row["traffic_index"]
            existing.source_batch_id = batch_id
        else:
            db.add(
                TrafficDaily(
                    org_id=org_id,
                    site_id=site_id,
                    day=row["day"],
                    traffic_index=row["traffic_index"],
                    source_batch_id=batch_id,
                )
            )
        ok += 1

    return ok


def run_backfill(site_id: str | None, years_back: int) -> int:
    processed_sites = 0

    with SessionLocal() as db:
        query = select(Site)
        if site_id:
            query = query.where(Site.id == site_id)

        sites = db.execute(query.order_by(Site.name.asc())).scalars().all()

        if not sites:
            print("No site found.")
            return 1

        for site in sites:
            batch = create_batch(db, site.org_id, site.name)

            try:
                target_range = compute_target_range(db, site.org_id, site.id, years_back)
                if target_range is None:
                    batch.status = "completed"
                    batch.rows_total = 0
                    batch.rows_ok = 0
                    db.commit()
                    print(f"[SKIP] {site.name}: no eligible sales range")
                    continue

                start_day, end_day = target_range

                latitude, longitude, resolved_name = resolve_site_coordinates(site)
                proxy_rows = fetch_proxy_traffic_rows(
                    latitude=latitude,
                    longitude=longitude,
                    start_day=start_day,
                    end_day=end_day,
                )

                ok = upsert_traffic_rows(
                    db=db,
                    org_id=site.org_id,
                    site_id=site.id,
                    batch_id=batch.id,
                    rows=proxy_rows,
                )

                batch.status = "completed"
                batch.rows_total = len(proxy_rows)
                batch.rows_ok = ok
                batch.rows_failed = 0

                db.commit()
                processed_sites += 1

                print(
                    f"[OK] site={site.name} "
                    f"resolved={resolved_name} "
                    f"range={start_day.isoformat()}..{end_day.isoformat()} "
                    f"rows={ok}"
                )

            except Exception as exc:
                batch.status = "failed"
                batch.rows_failed = 1
                save_batch_error(db, batch.id, str(exc))
                db.commit()
                print(f"[ERROR] site={site.name} error={exc}")

    return 0 if processed_sites >= 0 else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill traffic proxy history into traffic_daily using Open-Meteo historical data."
    )
    parser.add_argument(
        "--site-id",
        dest="site_id",
        default=None,
        help="Optional site UUID to process only one site.",
    )
    parser.add_argument(
        "--years",
        dest="years",
        type=int,
        default=TRAFFIC_BACKFILL_DEFAULT_YEARS,
        help="Number of years to backfill, default taken from env.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    years_back = max(1, int(args.years))
    return run_backfill(site_id=args.site_id, years_back=years_back)


if __name__ == "__main__":
    raise SystemExit(main())