from app.db import engine, Base, SessionLocal
from app.models import Organisation, User
from app.security import hash_password
from sqlalchemy import select

def main():
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        org = s.execute(select(Organisation).where(Organisation.name=="Demo Org")).scalar_one_or_none()
        if not org:
            org = Organisation(name="Demo Org")
            s.add(org)
            s.flush()
        u = s.execute(select(User).where(User.org_id==org.id, User.email=="admin@local")).scalar_one_or_none()
        if not u:
            s.add(User(org_id=org.id, email="admin@local", password_hash=hash_password("Admin123!"), role="admin"))
        s.commit()

if __name__ == "__main__":
    main()
