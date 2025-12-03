import bcrypt
from jose import jwt
from datetime import datetime, timedelta
import os

SECRET = os.getenv("JWT_SECRET")

# ✅ SAFE PASSWORD HASHING (bcrypt only)
def hash_password(password: str) -> str:
    password = password.encode("utf-8")[:72]   # ✅ Avoid bcrypt 72-byte crash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password, salt)
    return hashed.decode("utf-8")

# ✅ SAFE PASSWORD VERIFICATION
def verify_password(password: str, hashed: str) -> bool:
    password = password.encode("utf-8")[:72]
    return bcrypt.checkpw(
        password,
        hashed.encode("utf-8")
    )

# ✅ JWT TOKEN CREATION
def create_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=1)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET, algorithm="HS256")

