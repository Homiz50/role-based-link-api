from fastapi import APIRouter, Depends
from .database import users_collection, links_collection, records_collection
from .schema import UserCreate, Login, LinkCreate
from .models import hash_password, verify_password, create_token
from .auth import get_current_user, main_only
from bson import ObjectId
import uuid
from datetime import datetime
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends, HTTPException
import pandas as pd
from fastapi import UploadFile, File
from datetime import datetime
from pymongo.errors import DuplicateKeyError

router = APIRouter()


@router.post("/auth/register-main")
def register_main(user: UserCreate):
    hashed = hash_password(user.password)

    doc = {
        "user_id": str(uuid.uuid4()),
        "name": user.name,
        "email": user.email,
        "password_hash": hashed,
        "role_id": "main",
        "created_at": datetime.utcnow(),
    }

    try:
        users_collection.insert_one(doc)
    except DuplicateKeyError:
        return {"error": "This email is already registered"}

    return {"message": "Main user registered successfully"}


@router.post("/auth/create-subuser")
def create_subuser(user: UserCreate, current=Depends(main_only)):
    hashed = hash_password(user.password)

    doc = {
        "user_id": str(uuid.uuid4()),
        "name": user.name,
        "email": user.email,
        "password_hash": hashed,
        "role_id": "sub",
        "created_at": datetime.utcnow(),
    }

    try:
        users_collection.insert_one(doc)
    except DuplicateKeyError:
        return {"error": "This email is already registered"}

    return {"message": "Sub user created successfully"}


from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm


@router.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_collection.find_one({"email": form_data.username})

    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    now = datetime.utcnow()

    # ✅ ✅ ✅ 1. CHECK IF ACCOUNT IS BLOCKED
    if user.get("blocked_until") and now < user["blocked_until"]:
        remaining = user["blocked_until"] - now
        hours_left = round(remaining.total_seconds() / 3600, 2)

        raise HTTPException(
            status_code=403,
            detail=f"Account locked due to multiple failed attempts. Try again in {hours_left} hours.",
        )

    # ✅ ✅ ✅ 2. VERIFY PASSWORD
    if not verify_password(form_data.password, user["password_hash"]):

        last_attempt = user.get("last_failed_attempt")
        failed_attempts = user.get("failed_attempts", 0)

        # ✅ Reset if it's a new day
        if last_attempt and last_attempt.date() != now.date():
            failed_attempts = 0

        failed_attempts += 1

        update_data = {"failed_attempts": failed_attempts, "last_failed_attempt": now}

        # ✅ ✅ ✅ 3. BLOCK USER AFTER 5 FAILED ATTEMPTS
        if failed_attempts >= 5:
            update_data["blocked_until"] = now + timedelta(hours=24)
            update_data["failed_attempts"] = 0  # reset after blocking

            users_collection.update_one({"_id": user["_id"]}, {"$set": update_data})

            raise HTTPException(
                status_code=403,
                detail="Too many login attempts. Account locked for 24 hours.",
            )

        users_collection.update_one({"_id": user["_id"]}, {"$set": update_data})

        raise HTTPException(
            status_code=400,
            detail=f"Invalid credentials. Attempts remaining: {5 - failed_attempts}",
        )

    # ✅ ✅ ✅ 4. SUCCESSFUL LOGIN → RESET ALL SECURITY FIELDS
    users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "failed_attempts": 0,
                "last_failed_attempt": None,
                "blocked_until": None,
            }
        },
    )

    token = create_token({"user_id": user["user_id"], "role_id": user["role_id"]})

    return {"access_token": token, "role": user["role_id"]}


@router.post("/links/add")
def add_link(data: LinkCreate, current=Depends(main_only)):

    # ✅ PREVENT DUPLICATE LINK BEFORE INSERT
    existing = links_collection.find_one({"link_url": data.link})
    if existing:
        return {"error": "This link already exists", "generatedId": existing["link_id"]}

    # ✅ FIND LAST GENERATED PRB ID
    last_link = links_collection.find_one(
        {"link_id": {"$regex": "^PRB"}}, sort=[("created_at", -1)]
    )

    if last_link and "link_id" in last_link:
        last_number = int(last_link["link_id"].replace("PRB", ""))
        new_number = last_number + 1
    else:
        new_number = 1011

    new_generated_id = f"PRB{new_number}"

    link_doc = {
        "link_id": new_generated_id,
        "link_url": data.link,
        "user_id": current["user_id"],
        "created_at": datetime.utcnow(),
    }

    try:
        links_collection.insert_one(link_doc)

    except DuplicateKeyError:
        return {"error": "This link already exists"}

    return {"message": "Link Added Successfully", "generatedId": new_generated_id}


# ✅ UPDATE LINK (MAIN ONLY) — USING PRB ID
@router.put("/links/update/{prb_id}")
def update_link(prb_id: str, data: LinkCreate, current=Depends(main_only)):

    result = links_collection.update_one(
        {"link_id": prb_id},  # ✅ CORRECT FIELD
        {"$set": {"link_url": data.link}},  # ✅ CORRECT FIELD
    )

    if result.matched_count == 0:
        return {"error": "Link not found"}

    return {
        "message": "Link Updated Successfully",
        "link_id": prb_id,
        "new_link": data.link,
    }


# ✅ DELETE LINK (MAIN ONLY) — USING PRB ID
@router.delete("/links/delete/{prb_id}")
def delete_link(prb_id: str, current=Depends(main_only)):

    result = links_collection.delete_one({"link_id": prb_id})  # ✅ CORRECT FIELD

    if result.deleted_count == 0:
        return {"error": "Link not found"}

    return {"message": "Link Deleted Successfully", "link_id": prb_id}


from datetime import datetime
from fastapi import Depends


def normalize_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        return "https://" + url
    return url


@router.post("/fetch/by-links-bulk")
def fetch_or_create_ids_by_links_bulk(data: dict, current=Depends(get_current_user)):

    links = data.get("links")

    # ✅ Parse input
    if isinstance(links, list):
        cleaned_links = links
    elif isinstance(links, str):
        cleaned = links.replace("{", "").replace("}", "").replace("\n", "").strip()
        cleaned_links = [i.strip() for i in cleaned.split(",") if i.strip()]
    else:
        return {"error": "Invalid input format"}

    results = []

    for link in cleaned_links:

        # ✅✅✅ THIS IS THE CRITICAL FIX
        link = normalize_url(link)

        record = links_collection.find_one({"link_url": link})

        if record:
            existing_id = record.get("link_id") or record.get("generatedId")

            # ✅ If already PRB, just return it
            if isinstance(existing_id, str) and existing_id.startswith("PRB"):
                results.append(
                    {"link": link, "generatedId": existing_id, "status": "existing"}
                )
            else:
                # ✅ If UUID or wrong format → convert to PRB
                last_link = links_collection.find_one(
                    {"link_id": {"$regex": "^PRB"}}, sort=[("created_at", -1)]
                )

                if last_link:
                    last_number = int(last_link["link_id"].replace("PRB", ""))
                    new_number = last_number + 1
                else:
                    new_number = 1011

                new_prb_id = f"PRB{new_number}"

                # ✅ UPDATE OLD RECORD IN DATABASE
                links_collection.update_one(
                    {"_id": record["_id"]}, {"$set": {"link_id": new_prb_id}}
                )

                results.append(
                    {
                        "link": link,
                        "generatedId": new_prb_id,
                        "status": "updated_to_PRB",
                    }
                )

            continue

        last_link = links_collection.find_one(
            {"link_id": {"$regex": "^PRB"}}, sort=[("created_at", -1)]
        )

        if last_link:
            last_number = int(last_link["link_id"].replace("PRB", ""))
            new_number = last_number + 1
        else:
            new_number = 1011

        new_generated_id = f"PRB{new_number}"

        # ✅✅✅ MUST MATCH MONGODB VALIDATOR
        new_doc = {
            "link_id": new_generated_id,
            "link_url": link,
            "user_id": current["user_id"],
            "created_at": datetime.utcnow(),
        }

        links_collection.insert_one(new_doc)

        results.append(
            {"link": link, "generatedId": new_generated_id, "status": "created"}
        )

    return {"count": len(results), "results": results}


# ✅ BULK FETCH: MULTIPLE PRB IDs → LINKS
@router.post("/fetch/by-ids-bulk")
def fetch_by_id_bulk(data: dict, current=Depends(get_current_user)):

    prb_ids = data.get("prb_ids")

    # ✅ Handle multiline input
    if isinstance(prb_ids, str):
        prb_ids = [i.strip() for i in prb_ids.split("\n") if i.strip()]

    # ✅ Proper validation
    if not prb_ids or not isinstance(prb_ids, list):
        return {"error": "prb_ids must be a list or multiline string"}

    results = []

    for prb_id in prb_ids:
        # ✅ ✅ ✅ FIXED FIELD NAME
        record = links_collection.find_one({"link_id": prb_id})

        if record:
            results.append(
                {
                    "generatedId": prb_id,
                    # ✅ ✅ ✅ FIXED FIELD NAME
                    "link": record["link_url"],
                }
            )
        else:
            results.append({"generatedId": prb_id, "link": None, "error": "Not found"})

    return {"count": len(results), "results": results}


@router.post("/records/fetch-by-contacts")
def fetch_by_contacts(data: dict, current=Depends(main_only)):

    contact_numbers = data.get("contact_numbers")

    if isinstance(contact_numbers, str):
        contact_numbers = [i.strip() for i in contact_numbers.split("\n") if i.strip()]

    if not isinstance(contact_numbers, list):
        return {"error": "contact_numbers must be list or multiline string"}

    results = []

    for number in contact_numbers:
        record = records_collection.find_one({"contact_number": number})

        if record:
            results.append(
                {
                    "record_id": record["record_id"],
                    "contact_number": record["contact_number"],
                    "source_name": record["source_name"],
                    "created_at": record["created_at"],
                }
            )
        else:
            results.append({"contact_number": number, "error": "Not found"})

    return {"count": len(results), "results": results}


from pymongo.errors import DuplicateKeyError
from datetime import datetime
from fastapi import HTTPException, Depends


@router.post("/records/upload-mapped")
def upload_mapped_records(data: dict, current=Depends(main_only)):

    records = data.get("records")
    if not records:
        raise HTTPException(status_code=400, detail="No records provided")

    # 🚀 Get last record ID once instead of querying for each record
    last = records_collection.find_one(sort=[("record_id", -1)])
    last_id = last["record_id"] if last else 0

    # 🚀 Prepare all documents in memory before bulk insert
    documents_to_insert = []
    current_time = datetime.utcnow()

    for r in records:
        last_id += 1
        record_doc = {
            "record_id": last_id,
            "contact_number": str(r["contact_number"]).strip(),
            "source_name": r["source_name"],
            "user_id": current["user_id"],
            "role_id": current["role_id"],
            "created_at": current_time,
        }
        documents_to_insert.append(record_doc)

    # 🚀 Bulk insert all at once (much faster than individual inserts)
    try:
        result = records_collection.insert_many(documents_to_insert, ordered=False)
        inserted = len(result.inserted_ids)
        skipped = len(records) - inserted
    except Exception as e:
        # If bulk insert fails, count how many were actually inserted
        inserted = records_collection.count_documents(
            {"user_id": current["user_id"], "created_at": current_time}
        )
        skipped = len(records) - inserted

    # ✅ MESSAGE FIX
    if inserted == 0:
        return {
            "message": "All records were already inserted",
            "inserted": 0,
            "skipped": skipped,
        }

    return {
        "message": "Upload completed safely",
        "inserted": inserted,
        "skipped": skipped,
    }
