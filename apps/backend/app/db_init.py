import os

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import Organisation, User
from app.security import hash_password


DEFAULT_ORG_NAME = os.getenv("DEFAULT_ORG_NAME", "Demo Org")
DEFAULT_ADMIN_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@local")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "Admin123!")
DEFAULT_ADMIN_ROLE = os.getenv("DEFAULT_ADMIN_ROLE", "admin")


def main() -> None:
    Base.metadata.create_all(engine)

    with SessionLocal() as s:
        org = s.execute(
            select(Organisation).where(Organisation.name == DEFAULT_ORG_NAME)
        ).scalar_one_or_none()

        if not org:
            org = Organisation(name=DEFAULT_ORG_NAME)
            s.add(org)
            s.flush()

        admin = s.execute(
            select(User).where(
                User.org_id == org.id,
                User.email == DEFAULT_ADMIN_EMAIL,
            )
        ).scalar_one_or_none()

        admin_password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)

        if not admin:
            s.add(
                User(
                    org_id=org.id,
                    email=DEFAULT_ADMIN_EMAIL,
                    password_hash=admin_password_hash,
                    role=DEFAULT_ADMIN_ROLE,
                    is_active=True,
                )
            )
        else:
            admin.password_hash = admin_password_hash
            admin.role = DEFAULT_ADMIN_ROLE
            admin.is_active = True

        s.commit()


if __name__ == "__main__":
    main()