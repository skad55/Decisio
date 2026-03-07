import sqlite3
import uuid
from passlib.hash import pbkdf2_sha256

conn = sqlite3.connect("decisio.db")
cur = conn.cursor()

email = "admin@local"
password = "63231212"

cur.execute("DELETE FROM users WHERE email=?", (email,))

password_hash = pbkdf2_sha256.hash(password)

cur.execute(
    "INSERT INTO users (id, org_id, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
    (str(uuid.uuid4()), "local", email, password_hash, "admin", 1),
)

conn.commit()

print("USER CREATED")
print("email:", email)
print("password:", password)

conn.close()