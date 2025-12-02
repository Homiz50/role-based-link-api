from fastapi import APIRouter, Depends
from .database import users_collection, links_collection
from .schema import UserCreate, Login, LinkCreate
from .models import hash_password, verify_password, create_token
from .auth import get_current_user, main_only
from bson import ObjectId
import uuid
from datetime import datetime
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends, HTTPException

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
        "created_at": datetime.utcnow()
    }

    users_collection.insert_one(doc)
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
        "created_at": datetime.utcnow()
    }

    users_collection.insert_one(doc)
    return {"message": "Sub user created successfully"}

@router.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_collection.find_one({"email": form_data.username})

    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_token({
        "user_id": user["user_id"],
        "role_id": user["role_id"]
    })

    return {
        "access_token": token,
        "role": user["role_id"]
    }

@router.post("/links/add")
def add_link(data: LinkCreate, current=Depends(main_only)):

    # ✅ Find last inserted link (latest PRB number)
    last_link = links_collection.find_one(
        {"link_id": {"$regex": "^PRB"}},
        sort=[("created_at", -1)]
    )

    if last_link and "link_id" in last_link:
        last_number = int(last_link["link_id"].replace("PRB", ""))
        new_number = last_number + 1
    else:
        new_number = 1011

    new_generated_id = f"PRB{new_number}"

    links_collection.insert_one({
        "link_id": new_generated_id,
        "link_url": data.link,
        "user_id": current["user_id"],
        "created_at": datetime.utcnow()
    })

    return {
        "message": "Link Added Successfully",
        "generatedId": new_generated_id
    }


# ✅ UPDATE LINK (MAIN ONLY) — USING PRB ID
@router.put("/links/update/{prb_id}")
def update_link(prb_id: str, data: LinkCreate, current=Depends(main_only)):

    result = links_collection.update_one(
        {"link_id": prb_id},                    # ✅ CORRECT FIELD
        {"$set": {"link_url": data.link}}       # ✅ CORRECT FIELD
    )

    if result.matched_count == 0:
        return {"error": "Link not found"}

    return {
        "message": "Link Updated Successfully",
        "link_id": prb_id,
        "new_link": data.link
    }


# ✅ DELETE LINK (MAIN ONLY) — USING PRB ID
@router.delete("/links/delete/{prb_id}")
def delete_link(prb_id: str, current=Depends(main_only)):

    result = links_collection.delete_one({"link_id": prb_id})   # ✅ CORRECT FIELD

    if result.deleted_count == 0:
        return {"error": "Link not found"}

    return {
        "message": "Link Deleted Successfully",
        "link_id": prb_id
    }


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
        cleaned = (
            links.replace("{", "")
                 .replace("}", "")
                 .replace("\n", "")
                 .strip()
        )
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
                results.append({
                    "link": link,
                    "generatedId": existing_id,
                    "status": "existing"
                })
            else:
                # ✅ If UUID or wrong format → convert to PRB
                last_link = links_collection.find_one(
                    {"link_id": {"$regex": "^PRB"}},
                    sort=[("created_at", -1)]
                )

                if last_link:
                    last_number = int(last_link["link_id"].replace("PRB", ""))
                    new_number = last_number + 1
                else:
                    new_number = 1011

                new_prb_id = f"PRB{new_number}"

                # ✅ UPDATE OLD RECORD IN DATABASE
                links_collection.update_one(
                    {"_id": record["_id"]},
                    {"$set": {"link_id": new_prb_id}}
                )

                results.append({
                    "link": link,
                    "generatedId": new_prb_id,
                    "status": "updated_to_PRB"
                })

            continue

        last_link = links_collection.find_one(
            {"link_id": {"$regex": "^PRB"}},
            sort=[("created_at", -1)]
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
            "created_at": datetime.utcnow()
        }

        links_collection.insert_one(new_doc)

        results.append({
            "link": link,
            "generatedId": new_generated_id,
            "status": "created"
        })

    return {
        "count": len(results),
        "results": results
    }

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
            results.append({
                "generatedId": prb_id,
                # ✅ ✅ ✅ FIXED FIELD NAME
                "link": record["link_url"]
            })
        else:
            results.append({
                "generatedId": prb_id,
                "link": None,
                "error": "Not found"
            })

    return {
        "count": len(results),
        "results": results
    }
