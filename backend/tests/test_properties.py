"""
Backend tests for the Properties module (Phase 8).
Covers: CRUD, RBAC (ADMIN vs AGENT), filters, pagination, matching-leads,
cloudinary signature, and end-to-end direct Cloudinary upload.
"""
import os
import io
import time
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def agent_token():
    r = requests.post(f"{API}/auth/login", json=AGENT, timeout=30)
    assert r.status_code == 200, f"agent login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_user(admin_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def agent_user(agent_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Shared state for created properties (cleaned up in test_zzz_cleanup)
CREATED = []


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- POST validation ----------
class TestPropertyCreate:
    def test_post_requires_title(self, admin_token):
        r = requests.post(f"{API}/properties", json={
            "propertyType": "Apartment", "location": "Bandra", "city": "Mumbai",
            "price": 1000000, "area": 1200,
        }, headers=h(admin_token), timeout=15)
        assert r.status_code == 400
        assert "Title" in r.json().get("error", "")

    def test_post_price_must_be_positive(self, admin_token):
        r = requests.post(f"{API}/properties", json={
            "title": "TEST_bad", "propertyType": "Apartment", "location": "Bandra",
            "city": "Mumbai", "price": 0, "area": 1200,
        }, headers=h(admin_token), timeout=15)
        assert r.status_code == 400
        assert "Price" in r.json().get("error", "")

    def test_post_area_must_be_positive(self, admin_token):
        r = requests.post(f"{API}/properties", json={
            "title": "TEST_bad2", "propertyType": "Apartment", "location": "Bandra",
            "city": "Mumbai", "price": 1000000, "area": 0,
        }, headers=h(admin_token), timeout=15)
        assert r.status_code == 400
        assert "Area" in r.json().get("error", "")

    def test_admin_create_with_default_owner(self, admin_token, admin_user):
        payload = {
            "title": "TEST_AdminProp Bandra Sea View",
            "propertyType": "Apartment",
            "location": "Bandra West",
            "city": "Mumbai",
            "price": 25000000,
            "area": 1450,
            "areaUnit": "SQFT",
            "bedrooms": 3,
            "bathrooms": 3,
            "status": "AVAILABLE",
            "description": "TEST seeded property near sea",
        }
        r = requests.post(f"{API}/properties", json=payload, headers=h(admin_token), timeout=15)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["title"] == payload["title"]
        assert body["price"] == payload["price"]
        assert body["areaUnit"] == "SQFT"
        assert body["ownerAgentId"] == admin_user["id"]
        assert body.get("ownerAgent", {}).get("id") == admin_user["id"]
        CREATED.append(("admin", body["id"]))

    def test_agent_create_ignores_ownerAgentId(self, agent_token, agent_user, admin_user):
        # Try to spoof ownership — backend must overwrite to self.
        payload = {
            "title": "TEST_AgentProp Andheri",
            "propertyType": "Villa",
            "location": "Andheri East",
            "city": "Mumbai",
            "price": 18000000,
            "area": 2000,
            "areaUnit": "SQFT",
            "bedrooms": 4,
            "bathrooms": 4,
            "status": "AVAILABLE",
            "ownerAgentId": admin_user["id"],  # should be ignored
        }
        r = requests.post(f"{API}/properties", json=payload, headers=h(agent_token), timeout=15)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["ownerAgentId"] == agent_user["id"], "AGENT must always own its own creations"
        CREATED.append(("agent", body["id"]))


# ---------- GET list ----------
class TestPropertyList:
    def test_list_returns_paginated_shape(self, admin_token):
        r = requests.get(f"{API}/properties?limit=5&page=1", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        for key in ("properties", "total", "page", "limit", "pages"):
            assert key in body
        assert isinstance(body["properties"], list)
        assert body["page"] == 1
        assert body["limit"] == 5

    def test_admin_and_agent_see_all(self, admin_token, agent_token):
        a = requests.get(f"{API}/properties?limit=100", headers=h(admin_token), timeout=15).json()
        b = requests.get(f"{API}/properties?limit=100", headers=h(agent_token), timeout=15).json()
        assert a["total"] == b["total"], "Spec: both ADMIN and AGENT view ALL properties"

    def test_filter_by_city_case_insensitive(self, admin_token):
        r = requests.get(f"{API}/properties?city=mumbai&limit=50", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        for p in r.json()["properties"]:
            assert p["city"].lower() == "mumbai"

    def test_filter_by_status(self, admin_token):
        r = requests.get(f"{API}/properties?status=AVAILABLE&limit=50", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        for p in r.json()["properties"]:
            assert p["status"] == "AVAILABLE"

    def test_filter_by_propertyType(self, admin_token):
        r = requests.get(f"{API}/properties?propertyType=Apartment&limit=50", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        for p in r.json()["properties"]:
            assert p["propertyType"] == "Apartment"

    def test_filter_by_price_range(self, admin_token):
        r = requests.get(f"{API}/properties?minPrice=20000000&maxPrice=30000000&limit=50",
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        for p in r.json()["properties"]:
            assert 20000000 <= p["price"] <= 30000000

    def test_search_by_title(self, admin_token):
        r = requests.get(f"{API}/properties?search=AdminProp+Bandra", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        titles = [p["title"] for p in r.json()["properties"]]
        assert any("AdminProp" in t for t in titles)

    def test_sort_by_price_asc(self, admin_token):
        r = requests.get(f"{API}/properties?sortBy=price&sortOrder=asc&limit=50",
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        prices = [p["price"] for p in r.json()["properties"] if p.get("price") is not None]
        assert prices == sorted(prices)


# ---------- GET by id ----------
class TestPropertyGet:
    def test_get_by_id_includes_ownerAgent(self, admin_token):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.get(f"{API}/properties/{admin_prop_id}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == admin_prop_id
        assert "ownerAgent" in body and body["ownerAgent"]

    def test_get_404(self, admin_token):
        r = requests.get(f"{API}/properties/00000000-0000-0000-0000-000000000000",
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 404


# ---------- PUT / RBAC ----------
class TestPropertyUpdate:
    def test_admin_updates_any(self, admin_token):
        agent_prop_id = next(pid for who, pid in CREATED if who == "agent")
        r = requests.put(f"{API}/properties/{agent_prop_id}",
                         json={"description": "TEST admin-updated description"},
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["description"] == "TEST admin-updated description"

    def test_agent_cannot_update_other(self, agent_token):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.put(f"{API}/properties/{admin_prop_id}",
                         json={"description": "hacked"},
                         headers=h(agent_token), timeout=15)
        assert r.status_code == 403

    def test_agent_updates_own(self, agent_token):
        agent_prop_id = next(pid for who, pid in CREATED if who == "agent")
        r = requests.put(f"{API}/properties/{agent_prop_id}",
                         json={"status": "RESERVED"},
                         headers=h(agent_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "RESERVED"

    def test_agent_cannot_reassign_owner(self, agent_token, admin_user):
        agent_prop_id = next(pid for who, pid in CREATED if who == "agent")
        r = requests.put(f"{API}/properties/{agent_prop_id}",
                         json={"ownerAgentId": admin_user["id"]},
                         headers=h(agent_token), timeout=15)
        assert r.status_code == 403


# ---------- PATCH /:id/assign ----------
class TestPropertyAssign:
    def test_agent_cannot_assign(self, agent_token, agent_user):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.patch(f"{API}/properties/{admin_prop_id}/assign",
                           json={"agentId": agent_user["id"]},
                           headers=h(agent_token), timeout=15)
        assert r.status_code == 403

    def test_admin_can_assign_and_clear(self, admin_token, agent_user):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.patch(f"{API}/properties/{admin_prop_id}/assign",
                           json={"agentId": agent_user["id"]},
                           headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["ownerAgentId"] == agent_user["id"]

        r = requests.patch(f"{API}/properties/{admin_prop_id}/assign",
                           json={"agentId": None},
                           headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["ownerAgentId"] is None


# ---------- Matching leads ----------
class TestMatchingLeads:
    def test_matching_leads_admin(self, admin_token):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.get(f"{API}/properties/{admin_prop_id}/matching-leads",
                         headers=h(admin_token), timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "leads" in body
        assert isinstance(body["leads"], list)
        for lead in body["leads"]:
            assert lead["status"] not in ("WON", "LOST")
            assert "matchScore" in lead
            assert "nextFollowUp" in lead

    def test_matching_leads_agent_scoped(self, agent_token, agent_user):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.get(f"{API}/properties/{admin_prop_id}/matching-leads",
                         headers=h(agent_token), timeout=20)
        assert r.status_code == 200
        leads = r.json()["leads"]
        for lead in leads:
            assert lead["assignedAgent"] is None or lead["assignedAgent"]["id"] == agent_user["id"]


# ---------- Cloudinary signature ----------
class TestCloudinarySignature:
    def test_no_auth_returns_401(self):
        r = requests.get(f"{API}/uploads/cloudinary-signature?folder=properties", timeout=15)
        assert r.status_code == 401

    def test_signature_ok(self, admin_token):
        r = requests.get(f"{API}/uploads/cloudinary-signature?folder=properties",
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        for k in ("signature", "timestamp", "cloudName", "apiKey", "folder", "uploadUrl"):
            assert k in b
        assert b["cloudName"] == "dd61mc8me"
        assert b["folder"] == "properties"
        assert b["uploadUrl"] == "https://api.cloudinary.com/v1_1/dd61mc8me/image/upload"

    def test_reject_non_allowed_folder(self, admin_token):
        r = requests.get(f"{API}/uploads/cloudinary-signature?folder=users/",
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 400


# ---------- E2E Cloudinary upload ----------
# 1x1 transparent PNG
_PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
)


class TestEndToEndUpload:
    def test_e2e_upload_and_persist(self, admin_token):
        # 1) Get signature
        sig = requests.get(f"{API}/uploads/cloudinary-signature?folder=properties",
                           headers=h(admin_token), timeout=15).json()

        # 2) Multipart upload directly to Cloudinary
        files = {"file": ("test.png", io.BytesIO(_PNG_BYTES), "image/png")}
        data = {
            "api_key": sig["apiKey"],
            "timestamp": str(sig["timestamp"]),
            "signature": sig["signature"],
            "folder": sig["folder"],
        }
        up = requests.post(sig["uploadUrl"], data=data, files=files, timeout=60)
        assert up.status_code == 200, f"cloudinary upload failed: {up.status_code} {up.text}"
        secure_url = up.json().get("secure_url")
        assert secure_url and secure_url.startswith("https://res.cloudinary.com/dd61mc8me/")

        # 3) Attach to a property via PUT and confirm persistence
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.put(f"{API}/properties/{admin_prop_id}",
                         json={"images": [secure_url]},
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert secure_url in r.json()["images"]

        # 4) GET to confirm DB persistence
        r2 = requests.get(f"{API}/properties/{admin_prop_id}", headers=h(admin_token), timeout=15)
        assert r2.status_code == 200
        assert secure_url in r2.json()["images"]


# ---------- DELETE / Cleanup ----------
class TestPropertyDeleteAndCleanup:
    def test_agent_cannot_delete_other(self, agent_token):
        admin_prop_id = next(pid for who, pid in CREATED if who == "admin")
        r = requests.delete(f"{API}/properties/{admin_prop_id}", headers=h(agent_token), timeout=15)
        assert r.status_code == 403

    def test_zzz_cleanup(self, admin_token):
        # ADMIN deletes everything created in this run (204 expected)
        for _who, pid in CREATED:
            r = requests.delete(f"{API}/properties/{pid}", headers=h(admin_token), timeout=15)
            assert r.status_code in (204, 404)
        # Verify gone
        for _who, pid in CREATED:
            r = requests.get(f"{API}/properties/{pid}", headers=h(admin_token), timeout=15)
            assert r.status_code == 404


# ---------- Regression: ensure other modules still 200 ----------
class TestRegression:
    def test_leads(self, admin_token):
        r = requests.get(f"{API}/leads?limit=5", headers=h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_followups(self, admin_token):
        r = requests.get(f"{API}/followups?limit=5", headers=h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_communications(self, admin_token):
        r = requests.get(f"{API}/communications?limit=5", headers=h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_analytics(self, admin_token):
        r = requests.get(f"{API}/analytics/overview", headers=h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_users(self, admin_token):
        r = requests.get(f"{API}/users", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
