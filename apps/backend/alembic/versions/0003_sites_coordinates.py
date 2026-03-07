"""add latitude and longitude to sites

Revision ID: 0003_sites_coordinates
Revises: 0002_variables_and_ml
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_sites_coordinates"
down_revision = "0002_variables_and_ml"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("sites") as batch_op:
        batch_op.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("longitude", sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table("sites") as batch_op:
        batch_op.drop_column("longitude")
        batch_op.drop_column("latitude")
