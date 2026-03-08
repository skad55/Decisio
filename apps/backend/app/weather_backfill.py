import argparse
import json
import os
from datetime import date, datetime, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import ImportBatch, ImportError as ImportErrorRow, Sale, Site, WeatherDaily


OPEN_METEO_GEOCODING_URL = os.getenv(
    "OPEN_METEO_GEOCODING_URL",
    "https://geocoding-api.open-meteo.com/v1/search",
)
OPEN_METEO_ARCHIVE_URL = os.getenv(
    "OPEN_METEO_ARCHIVE_URL",
    "https://archive-api.open-meteo.com/v1/archive",
)
OPEN_METEO_COUNTRY_CODE = os.getenv("OPEN_METEO_COUNTRY_CODE", "FR").strip().upper()
WEATHER_BACKFILL_DEFAULT_YEARS = int(os.getenv("WEATHER_BACKFILL_DEFAULT_YEARS", "3"))
HTTP_TIMEOUT_SECONDS = int(os.getenv("WEATHER_BACKFILL_TIMEOUT_SECONDS", "30"))

WEATHER_FALLBACK_LAT = float(os.getenv("WEATHER_FALLBACK_LAT", "48.8566"))
WEATHER_FALLBACK_LON = float(os.getenv("WEATHER_FALLBACK_LON", "2.3522"))
WEATHER_FALLBACK_LABEL = os.getenv("WEATHER_FALLBACK_LABEL", "Paris fallback")


def http_get_json(base_url: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urlencode(params)
    url = f"{base_url}?{query}"
    request = Request(
        url,
        headers={
            "User-Agent": "Decisio/0.2 weather-backfill",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} on {base_url}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error on {base_url}: {exc}") from exc


def geocode_site_address(address: str) -> tuple[float, float, str]:
    params: dict[str, Any] = {
        "name": address,
        "count": 1,
        "language": "fr",
        "format": "json",
    }
    if OPEN_METEO_COUNTRY_CODE:
        params["countryCode"] = OPEN_METEO_COUNTRY_CODE

    data = http_get_json(OPEN_METEO_GEOCODING_URL, params)
    results = data.get("results") or []

    if not results:
        raise RuntimeError(f"No geocoding result for address: {address}")

    first = results[0]
    latitude = first.get("latitude")
    longitude = first.get("longitude")
    name = first.get("name") or address

    if latitude is None or longitude is None:
        raise RuntimeError(f"Incomplete geocoding result for address: {address}")

    return float(latitude), float(longitude), str(name)


def resolve_site_coordinates(site: Site) -> tuple[float, float, str]:
    raw_address = (getattr(site, "address", None) or "").strip()

    candidates = []
    if raw_address:
      candidates.append(raw_address)
      if ", France" in raw_address:
          candidates.append(raw_address.replace(", France", "").strip())
      parts = [p.strip() for p in raw_address.split(",") if p.strip()]
      if len(parts) >= 2:
          candidates.append(", ".join(parts[-2:]))
      if len(parts) >= 1:
          candidates.append(parts[-1])

    for candidate in candidates:
        try:
            return geocode_site_address(candidate)
        except Exception:
            pass

    return WEATHER_FALLBACK_LAT, WEATHER_FALLBACK_LON, WEATHER_FALLBACK_LABEL


def fetch_weather_archive(
    latitude: float,
    longitude: float,
    start_day: date,
    end_day: date,
) -> list[dict[str, Any]]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_day.isoformat(),
        "end_date": end_day.isoformat(),
        "daily": "temperature_2m_mean,precipitation_sum",
        "timezone": "UTC",
    }

    data = http_get_json(OPEN_METEO_ARCHIVE_URL, params)
    daily = data.get("daily") or {}

    times = daily.get("time") or []
    temps = daily.get("temperature_2m_mean") or []
    rains = daily.get("precipitation_sum") or []

    if not (len(times) == len(temps) == len(rains)):
        raise RuntimeError("Unexpected weather archive payload shape")

    rows: list[dict[str, Any]] = []
    for i in range(len(times)):
        rows.append(
            {
                "day": datetime.strptime(times[i], "%Y-%m-%d").date(),
                "temp_c": None if temps[i] is None else float(temps[i]),
                "rain_mm": None if rains[i] is None else float(rains[i]),
            }
        )

    return rows


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


def upsert_weather_rows(db, org_id: str, site_id: str, batch_id: str, rows: list[dict[str, Any]]) -> int:
    ok = 0

    for row in rows:
        existing = db.execute(
            select(WeatherDaily).where(
                WeatherDaily.org_id == org_id,
                WeatherDaily.site_id == site_id,
                WeatherDaily.day == row["day"],
            )
        ).scalar_one_or_none()

        if existing:
            existing.temp_c = row["temp_c"]
            existing.rain_mm = row["rain_mm"]
            existing.source_batch_id = batch_id
        else:
            db.add(
                WeatherDaily(
                    org_id=org_id,
                    site_id=site_id,
                    day=row["day"],
                    temp_c=row["temp_c"],
                    rain_mm=row["rain_mm"],
                    source_batch_id=batch_id,
                )
            )
        ok += 1

    return ok


def create_batch(db, org_id: str, site_name: str) -> ImportBatch:
    batch = ImportBatch(
        org_id=org_id,
        type="weather_api_backfill",
        filename=f"open-meteo:{site_name}",
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
                archive_rows = fetch_weather_archive(
                    latitude=latitude,
                    longitude=longitude,
                    start_day=start_day,
                    end_day=end_day,
                )

                ok = upsert_weather_rows(
                    db=db,
                    org_id=site.org_id,
                    site_id=site.id,
                    batch_id=batch.id,
                    rows=archive_rows,
                )

                batch.status = "completed"
                batch.rows_total = len(archive_rows)
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

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill historical weather into weather_daily using Open-Meteo."
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
        default=WEATHER_BACKFILL_DEFAULT_YEARS,
        help="Number of years to backfill, default taken from env.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    years_back = max(1, int(args.years))
    return run_backfill(site_id=args.site_id, years_back=years_back)


if __name__ == "__main__":
    raise SystemExit(main())