"""init

Revision ID: 0001_init
Revises:
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "organisations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("org_id", "email", name="uq_user_org_email"),
    )

    op.create_table(
        "sites",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(400), nullable=False),
        sa.Column("surface_m2", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("hours_json", sa.Text(), nullable=True),
    )

    op.create_table(
        "import_batches",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("rows_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_ok", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_duplicated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_failed", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "import_errors",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("batch_id", sa.String(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
    )

    op.create_table(
        "sales",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("site_id", sa.String(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("revenue_eur", sa.Numeric(14, 2), nullable=False),
        sa.Column("source_batch_id", sa.String(), sa.ForeignKey("import_batches.id"), nullable=True),
        sa.UniqueConstraint("org_id", "site_id", "day", name="uq_sales_org_site_day"),
    )


def downgrade():
    op.drop_table("sales")
    op.drop_table("import_errors")
    op.drop_table("import_batches")
    op.drop_table("sites")
    op.drop_table("users")
    op.drop_table("organisations")