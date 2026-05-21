"""Backend integration tests for the Lead Management module.

Covers: CRUD, search/filter, pagination, role-based access (ADMIN vs AGENT),
agent assignment, and /api/users dropdown.
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

ADMIN_EMAIL = "admin@realestate.com"
ADMIN_PASSWORD = "Admin@2036"


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def agent_creds():
    """Register a fresh AGENT user (open /api/auth/register endpoint)."""
    email = f"TEST_agent_{uuid.uuid4().hex[:8]}@example.com"
    password = "AgentPass@123"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"name": "Test Agent", "email": email, "password": password},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Agent registration not supported: {r.status_code} {r.text}")
    return {"email": email, "password": password, "user": r.json().get("user", {}), "token": r.json().get("token")}


@pytest.fixture(scope="session")
def agent_headers(agent_creds):
    token = agent_creds["token"]
    if not token:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": agent_creds["email"], "password": agent_creds["password"]},
        )
        token = r.json().get("token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def created_lead_ids():
    ids = []
    yield ids
    # Teardown: delete all created leads as admin
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10,
        )
        token = r.json().get("token")
        if token:
            for lid in ids:
                requests.delete(
                    f"{BASE_URL}/api/leads/{lid}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10,
                )
    except Exception:
        pass


# ---------- Auth ----------

class TestAuth:
    def test_admin_login_returns_user_and_token(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 0
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "ADMIN"


# ---------- /api/users ----------

class TestUsersEndpoint:
    def test_list_users_for_dropdown(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert len(users) >= 1
        u = users[0]
        for key in ("id", "name", "email", "role"):
            assert key in u, f"Missing key {key} in user object"


# ---------- Leads CRUD ----------

class TestLeadsCRUD:
    def test_create_lead_minimal(self, admin_headers, created_lead_ids):
        payload = {"fullName": "TEST_Priya Sharma"}
        r = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=admin_headers)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["fullName"] == "TEST_Priya Sharma"
        assert data["status"] == "NEW"
        assert "id" in data
        created_lead_ids.append(data["id"])

    def test_create_lead_full_payload(self, admin_headers, created_lead_ids):
        payload = {
            "fullName": "TEST_Rohan Mehta",
            "phone": "+91 98765 43210",
            "email": "rohan@example.com",
            "budget": 8500000,
            "preferredLocation": "Bandra, Mumbai",
            "bhk": "3BHK",
            "propertyType": "Apartment",
            "status": "CONTACTED",
            "tags": ["hot", "investor"],
            "notes": "Looking for sea-facing 3BHK",
        }
        r = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=admin_headers)
        assert r.status_code == 201, r.text
        data = r.json()
        created_lead_ids.append(data["id"])
        assert data["fullName"] == payload["fullName"]
        assert data["phone"] == payload["phone"]
        assert data["email"] == payload["email"]
        assert float(data["budget"]) == 8500000.0
        assert data["propertyType"] == "Apartment"
        assert data["bhk"] == "3BHK"
        assert data["status"] == "CONTACTED"
        assert set(data["tags"]) == {"hot", "investor"}
        assert data["notes"] == "Looking for sea-facing 3BHK"

        # Verify GET returns persisted data
        g = requests.get(f"{BASE_URL}/api/leads/{data['id']}", headers=admin_headers)
        assert g.status_code == 200
        fetched = g.json()
        assert fetched["fullName"] == payload["fullName"]
        assert float(fetched["budget"]) == 8500000.0
        assert fetched["assignedAgent"] is None

    def test_create_lead_missing_fullname(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/leads", json={"phone": "123"}, headers=admin_headers)
        assert r.status_code == 400
        assert "error" in r.json()

    def test_create_lead_blank_fullname(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/leads", json={"fullName": "   "}, headers=admin_headers)
        assert r.status_code == 400

    def test_get_lead_by_id_with_agent(self, admin_headers, created_lead_ids):
        # Get an admin user id to assign as agent
        users = requests.get(f"{BASE_URL}/api/users", headers=admin_headers).json()
        agent_id = users[0]["id"]

        r = requests.post(
            f"{BASE_URL}/api/leads",
            json={"fullName": "TEST_AssignTest", "assignedAgentId": agent_id},
            headers=admin_headers,
        )
        assert r.status_code == 201
        lead = r.json()
        created_lead_ids.append(lead["id"])

        g = requests.get(f"{BASE_URL}/api/leads/{lead['id']}", headers=admin_headers)
        assert g.status_code == 200
        fetched = g.json()
        assert fetched["assignedAgent"] is not None
        assert fetched["assignedAgent"]["id"] == agent_id
        assert "name" in fetched["assignedAgent"]
        assert "email" in fetched["assignedAgent"]

    def test_get_lead_not_found(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/leads/nonexistent-id-xxxx", headers=admin_headers)
        assert r.status_code == 404

    def test_update_lead_partial(self, admin_headers, created_lead_ids):
        r = requests.post(
            f"{BASE_URL}/api/leads",
            json={"fullName": "TEST_UpdateMe", "status": "NEW", "budget": 1000000},
            headers=admin_headers,
        )
        lead_id = r.json()["id"]
        created_lead_ids.append(lead_id)

        u = requests.put(
            f"{BASE_URL}/api/leads/{lead_id}",
            json={"status": "QUALIFIED", "notes": "Updated note", "tags": ["urgent"]},
            headers=admin_headers,
        )
        assert u.status_code == 200, u.text
        updated = u.json()
        assert updated["status"] == "QUALIFIED"
        assert updated["notes"] == "Updated note"
        assert updated["tags"] == ["urgent"]

        # Confirm via GET
        g = requests.get(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers).json()
        assert g["status"] == "QUALIFIED"
        assert g["notes"] == "Updated note"
        assert float(g["budget"]) == 1000000.0  # untouched

    def test_delete_lead_admin(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/leads", json={"fullName": "TEST_DeleteMe"}, headers=admin_headers
        )
        lead_id = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
        assert d.status_code in (200, 204)
        g = requests.get(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
        assert g.status_code == 404


# ---------- Search, Filter, Pagination ----------

class TestLeadsListing:
    def test_list_returns_pagination_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/leads", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for key in ("leads", "total", "page", "limit", "pages"):
            assert key in data
        assert isinstance(data["leads"], list)
        assert isinstance(data["total"], int)
        assert data["page"] == 1

    def test_search_by_name(self, admin_headers, created_lead_ids):
        unique = f"ZebraQ{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/leads", json={"fullName": f"TEST_{unique}"}, headers=admin_headers
        )
        created_lead_ids.append(r.json()["id"])

        s = requests.get(f"{BASE_URL}/api/leads", params={"search": unique}, headers=admin_headers)
        assert s.status_code == 200
        data = s.json()
        assert data["total"] >= 1
        assert any(unique in l["fullName"] for l in data["leads"])

    def test_filter_by_status_and_property_type(self, admin_headers, created_lead_ids):
        r = requests.post(
            f"{BASE_URL}/api/leads",
            json={
                "fullName": "TEST_FilterMe",
                "status": "WON",
                "propertyType": "Villa",
            },
            headers=admin_headers,
        )
        created_lead_ids.append(r.json()["id"])

        f = requests.get(
            f"{BASE_URL}/api/leads",
            params={"status": "WON", "propertyType": "Villa"},
            headers=admin_headers,
        )
        assert f.status_code == 200
        data = f.json()
        assert data["total"] >= 1
        for lead in data["leads"]:
            assert lead["status"] == "WON"
            assert lead["propertyType"] == "Villa"

    def test_pagination_math(self, admin_headers, created_lead_ids):
        # Create 6 leads so we can test 2 pages w/ limit=5
        for i in range(6):
            r = requests.post(
                f"{BASE_URL}/api/leads",
                json={"fullName": f"TEST_PagItem_{uuid.uuid4().hex[:6]}_{i}"},
                headers=admin_headers,
            )
            created_lead_ids.append(r.json()["id"])

        p1 = requests.get(
            f"{BASE_URL}/api/leads", params={"page": 1, "limit": 5}, headers=admin_headers
        ).json()
        assert p1["page"] == 1
        assert p1["limit"] == 5
        assert len(p1["leads"]) == 5
        assert p1["pages"] == max(1, (p1["total"] + 4) // 5)

        p2 = requests.get(
            f"{BASE_URL}/api/leads", params={"page": 2, "limit": 5}, headers=admin_headers
        ).json()
        assert p2["page"] == 2
        # No duplicate IDs between pages
        ids1 = {l["id"] for l in p1["leads"]}
        ids2 = {l["id"] for l in p2["leads"]}
        assert ids1.isdisjoint(ids2)


# ---------- Assign + Role-based access ----------

class TestAssignAndRoles:
    def test_assign_admin_only(self, admin_headers, agent_headers, agent_creds, created_lead_ids):
        # Create a lead as admin
        r = requests.post(
            f"{BASE_URL}/api/leads", json={"fullName": "TEST_AssignRBAC"}, headers=admin_headers
        )
        lead_id = r.json()["id"]
        created_lead_ids.append(lead_id)

        agent_user = agent_creds["user"]
        if not agent_user or "id" not in agent_user:
            # fetch the agent's id via /api/users
            users = requests.get(f"{BASE_URL}/api/users", headers=admin_headers).json()
            match = [u for u in users if u["email"] == agent_creds["email"]]
            assert match, "Newly registered agent not found"
            agent_user = match[0]

        # Non-admin should be 403
        a = requests.patch(
            f"{BASE_URL}/api/leads/{lead_id}/assign",
            json={"agentId": agent_user["id"]},
            headers=agent_headers,
        )
        assert a.status_code == 403

        # Admin succeeds
        ok = requests.patch(
            f"{BASE_URL}/api/leads/{lead_id}/assign",
            json={"agentId": agent_user["id"]},
            headers=admin_headers,
        )
        assert ok.status_code == 200
        assert ok.json()["assignedAgentId"] == agent_user["id"]

    def test_delete_admin_only(self, admin_headers, agent_headers):
        r = requests.post(
            f"{BASE_URL}/api/leads", json={"fullName": "TEST_DeleteRBAC"}, headers=admin_headers
        )
        lead_id = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=agent_headers)
        assert d.status_code == 403
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)

    def test_agent_sees_only_assigned_leads(self, admin_headers, agent_headers, agent_creds, created_lead_ids):
        # Get the agent user id (prefer id from register response, fallback to /api/users)
        agent_id = agent_creds.get("user", {}).get("id")
        if not agent_id:
            users = requests.get(f"{BASE_URL}/api/users", headers=admin_headers).json()
            match = [u for u in users if u["email"] == agent_creds["email"]]
            assert match, f"Agent {agent_creds['email']} not found in /api/users"
            agent_id = match[0]["id"]

        # Create one assigned to agent + one unassigned
        a1 = requests.post(
            f"{BASE_URL}/api/leads",
            json={"fullName": "TEST_AgentVisible", "assignedAgentId": agent_id},
            headers=admin_headers,
        ).json()
        a2 = requests.post(
            f"{BASE_URL}/api/leads",
            json={"fullName": "TEST_AgentHidden"},
            headers=admin_headers,
        ).json()
        created_lead_ids.extend([a1["id"], a2["id"]])

        # Agent list
        listing = requests.get(f"{BASE_URL}/api/leads?limit=100", headers=agent_headers)
        assert listing.status_code == 200
        data = listing.json()
        ids = {l["id"] for l in data["leads"]}
        assert a1["id"] in ids
        assert a2["id"] not in ids
        # Every visible lead must be assigned to this agent
        for l in data["leads"]:
            assert l["assignedAgentId"] == agent_id
