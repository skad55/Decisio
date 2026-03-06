"""variables and ml

Revision ID: 0002_variables_and_ml
Revises: 0001_init
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_variables_and_ml"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "weather_daily",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("temp_c", sa.Float(), nullable=True),
        sa.Column("rain_mm", sa.Float(), nullable=True),
        sa.Column("source_batch_id", sa.String(), sa.ForeignKey("import_batches.id"), nullable=True),
        sa.UniqueConstraint("org_id", "site_id", "day", name="uq_weather_org_site_day"),
    )

    op.create_table(
        "traffic_daily",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("traffic_index", sa.Float(), nullable=False),
        sa.Column("source_batch_id", sa.String(), sa.ForeignKey("import_batches.id"), nullable=True),
        sa.UniqueConstraint("org_id", "site_id", "day", name="uq_traffic_org_site_day"),
    )

    op.create_table(
        "staffing_daily",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("staff_count", sa.Integer(), nullable=False),
        sa.Column("source_batch_id", sa.String(), sa.ForeignKey("import_batches.id"), nullable=True),
        sa.UniqueConstraint("org_id", "site_id", "day", name="uq_staffing_org_site_day"),
    )

    op.create_table(
        "events_daily",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("intensity", sa.Float(), nullable=False),
        sa.Column("source_batch_id", sa.String(), sa.ForeignKey("import_batches.id"), nullable=True),
    )

    op.create_table(
        "model_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("model_name", sa.String(60), nullable=False),
        sa.Column("train_rows", sa.Integer(), nullable=False),
        sa.Column("mae", sa.Float(), nullable=False),
        sa.Column("mape", sa.Float(), nullable=False),
        sa.Column("intercept", sa.Float(), nullable=False),
        sa.Column("weights_json", sa.Text(), nullable=False),
        sa.Column("features_json", sa.Text(), nullable=False),
    )

    op.create_table(
        "forecast_points",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("model_run_id", sa.String(), sa.ForeignKey("model_runs.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("horizon_days", sa.Integer(), nullable=False),
        sa.Column("predicted_revenue_eur", sa.Float(), nullable=False),
        sa.UniqueConstraint("org_id", "site_id", "model_run_id", "day", name="uq_forecast_point"),
    )


def downgrade():
    op.drop_table("forecast_points")
    op.drop_table("model_runs")
    op.drop_table("events_daily")
    op.drop_table("staffing_daily")
    op.drop_table("traffic_daily")
    op.drop_table("weather_daily")