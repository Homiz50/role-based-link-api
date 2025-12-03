from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
import os
from .database import users_collection

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

SECRET = os.getenv("JWT_SECRET")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])

        user_id = payload.get("user_id")   # ✅ READ FROM TOKEN
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid Token")

        user = users_collection.find_one({"user_id": user_id})  # ✅ MATCH DB FIELD
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return user

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid Token")

def main_only(user=Depends(get_current_user)):
    if user["role_id"] != "main":
        raise HTTPException(status_code=403, detail="Main User Only")
    return user
