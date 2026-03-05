import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import (
    String,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    Integer,
    Text,
    Date,
    Numeric,
)
from app.db import Base


def _id() -> str:
    return str(uuid.uuid4())


class Organisation(Base):
    __tablename__ = "organisations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    org_id: Mapped[str] = mapped_column(String, ForeignKey("organisations.id"), index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="admin")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("org_id", "email", name="uq_user_org_email"),)


class Site(Base):
    __tablename__ = "sites"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    org_id: Mapped[str] = mapped_column(String, ForeignKey("organisations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(400))

    # champs optionnels (préparés pour V1)
    surface_m2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    hours_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    org_id: Mapped[str] = mapped_column(String, ForeignKey("organisations.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))  # ex: "sales_ca"
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20))  # "success"|"failed"

    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_ok: Mapped[int] = mapped_column(Integer, default=0)
    rows_duplicated: Mapped[int] = mapped_column(Integer, default=0)
    rows_failed: Mapped[int] = mapped_column(Integer, default=0)


class ImportError(Base):
    __tablename__ = "import_errors"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    batch_id: Mapped[str] = mapped_column(String, ForeignKey("import_batches.id"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)
    message: Mapped[str] = mapped_column(Text)


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    org_id: Mapped[str] = mapped_column(String, ForeignKey("organisations.id"), index=True)
    site_id: Mapped[str] = mapped_column(String, ForeignKey("sites.id"), index=True)

    day: Mapped[Date] = mapped_column(Date)
    revenue_eur: Mapped[float] = mapped_column(Numeric(14, 2))

    source_batch_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("import_batches.id"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("org_id", "site_id", "day", name="uq_sales_org_site_day"),
    )
