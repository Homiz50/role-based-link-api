from pydantic import BaseModel
from typing import List
from datetime import datetime


# ✅ EXISTING SCHEMAS
class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class Login(BaseModel):
    email: str
    password: str


class LinkCreate(BaseModel):
    link: str


# ✅ ✅ ✅ NEW RECORD SCHEMAS

class ContactFetchRequest(BaseModel):
    contact_numbers: List[str]


class RecordResponse(BaseModel):
    record_id: int
    contact_number: str
    source_name: str
    created_at: datetime


class RecordFetchResponse(BaseModel):
    count: int
    results: List[RecordResponse]
