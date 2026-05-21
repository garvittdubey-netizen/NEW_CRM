"""
Backend regression tests for the Deals module (Phase 10.0).

Covers:
  - CRUD (POST/GET list/GET id/PUT/DELETE) end-to-end
  - RBAC for ADMIN + AGENT scopes (own only, no reassign)
  - Search across title/notes/property.title/property.city/client.fullName/client.phone
  - Status filter + assignedAgentId filter
  - Pagination/sort response shape
  - Embedded property/client/agent relations
  - onDelete=Restrict on Property + Client when referenced by a Deal
  - Foreign-key violation → 400 'Invalid property, client or agent reference'
"""
import os
import uuid
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
    j = r.json()
    token = j.get("token") or j.get("accessToken")
    assert token
    return token, j.get("user", {})


@pytest.fixture(scope="session")
def admin_ctx():
    token, user = _login(ADMIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s, user


@pytest.fixture(scope="session")
def agent_ctx():
    token, user = _login(AGENT)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s, user


# ----------------------------- seed helpers -----------------------------
@pytest.fixture(scope="session")
def seed_property(admin_ctx):
    s, _ = admin_ctx
    payload = {
        "title": f"TEST_DealProp_{uuid.uuid4().hex[:6]}",
        "description": "Deal test property",
        "propertyType": "Apartment",
        "price": 5000000,
        "city": "Mumbai",
        "location": "Bandra",
        "bedrooms": 2,
        "bathrooms": 2,
        "area": 1100,
        "status": "AVAILABLE",
        "images": [],
    }
    r = s.post(f"{API}/properties", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    yield pid
    s.delete(f"{API}/properties/{pid}", timeout=15)


@pytest.fixture(scope="session")
def seed_client(admin_ctx):
    s, _ = admin_ctx
    payload = {
        "fullName": f"TEST_DealClient_{uuid.uuid4().hex[:6]}",
        "phone": "+919000000077",
        "email": f"test_dealclient_{uuid.uuid4().hex[:5]}@example.com",
        "preferredLocation": "Bandra",
        "budget": 5000000,
    }
    r = s.post(f"{API}/clients", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    yield cid
    s.delete(f"{API}/clients/{cid}", timeout=15)


@pytest.fixture
def agent_user(admin_ctx):
    s, _ = admin_ctx
    r = s.get(f"{API}/users", timeout=15)
    assert r.status_code == 200, r.text
    users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
    agent = next(u for u in users if u["email"] == AGENT["email"])
    return agent


# ----------------------------- tests -----------------------------
class TestDealCRUDAdmin:
    def test_list_shape(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/deals", timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("deals", "total", "page", "limit", "pages"):
            assert k in j, f"missing key {k}"
        assert isinstance(j["deals"], list)

    def test_create_requires_title(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        r = s.post(f"{API}/deals", json={
            "propertyId": seed_property, "clientId": seed_client, "amount": 100,
        }, timeout=15)
        assert r.status_code == 400
        assert "title" in r.json().get("error", "").lower()

    def test_create_requires_positive_amount(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        r = s.post(f"{API}/deals", json={
            "title": "TEST_BadAmount", "propertyId": seed_property,
            "clientId": seed_client, "amount": 0,
        }, timeout=15)
        assert r.status_code == 400
        assert "amount" in r.json().get("error", "").lower()

    def test_create_invalid_fk(self, admin_ctx, seed_client):
        s, _ = admin_ctx
        r = s.post(f"{API}/deals", json={
            "title": "TEST_BadFK",
            "propertyId": "00000000-0000-0000-0000-000000000000",
            "clientId": seed_client,
            "amount": 100000,
        }, timeout=15)
        assert r.status_code == 400, r.text
        assert "invalid" in r.json().get("error", "").lower()

    def test_admin_create_and_embed(self, admin_ctx, seed_property, seed_client):
        s, admin = admin_ctx
        title = f"TEST_AdminDeal_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/deals", json={
            "title": title,
            "propertyId": seed_property,
            "clientId": seed_client,
            "amount": 9500000,
            "status": "NEGOTIATION",
            "notes": "phase10 admin deal",
        }, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["title"] == title
        assert d["amount"] == 9500000
        assert d["status"] == "NEGOTIATION"
        assert d["assignedAgentId"] == admin["id"]  # default to admin
        assert d["property"]["id"] == seed_property
        assert d["client"]["id"] == seed_client
        assert d["assignedAgent"]["id"] == admin["id"]
        # cleanup
        s.delete(f"{API}/deals/{d['id']}", timeout=15)

    def test_admin_create_with_agent_assignment(self, admin_ctx, seed_property, seed_client, agent_user):
        s, _ = admin_ctx
        r = s.post(f"{API}/deals", json={
            "title": f"TEST_AdminAssignAgent_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property,
            "clientId": seed_client,
            "amount": 4200000,
            "assignedAgentId": agent_user["id"],
            "status": "NEW",
        }, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["assignedAgentId"] == agent_user["id"]
        s.delete(f"{API}/deals/{d['id']}", timeout=15)

    def test_get_by_id_404(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/deals/00000000-0000-0000-0000-000000000000", timeout=15)
        assert r.status_code == 404

    def test_search_filter_status(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        marker = uuid.uuid4().hex[:8]
        title = f"TEST_SrchDeal_{marker}"
        cr = s.post(f"{API}/deals", json={
            "title": title, "propertyId": seed_property, "clientId": seed_client,
            "amount": 123456, "status": "DOCUMENTATION",
        }, timeout=15)
        assert cr.status_code == 201, cr.text
        did = cr.json()["id"]
        try:
            r = s.get(f"{API}/deals", params={"search": marker}, timeout=15)
            assert r.status_code == 200
            assert any(d["id"] == did for d in r.json()["deals"])

            r = s.get(f"{API}/deals", params={"status": "DOCUMENTATION", "search": marker}, timeout=15)
            assert r.status_code == 200
            for d in r.json()["deals"]:
                assert d["status"] == "DOCUMENTATION"
            assert any(d["id"] == did for d in r.json()["deals"])

            r = s.get(f"{API}/deals", params={"status": "WON", "search": marker}, timeout=15)
            assert r.status_code == 200
            assert all(d["id"] != did for d in r.json()["deals"])
        finally:
            s.delete(f"{API}/deals/{did}", timeout=15)

    def test_update_admin(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        cr = s.post(f"{API}/deals", json={
            "title": f"TEST_UpdAdmin_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 100000,
        }, timeout=15)
        did = cr.json()["id"]
        try:
            r = s.put(f"{API}/deals/{did}", json={"amount": 250000, "status": "WON"}, timeout=15)
            assert r.status_code == 200, r.text
            assert r.json()["amount"] == 250000
            assert r.json()["status"] == "WON"
            # GET verify persistence
            g = s.get(f"{API}/deals/{did}", timeout=15)
            assert g.json()["amount"] == 250000
            assert g.json()["status"] == "WON"
        finally:
            s.delete(f"{API}/deals/{did}", timeout=15)

    def test_delete_admin_204_and_404_after(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        cr = s.post(f"{API}/deals", json={
            "title": f"TEST_DelAdmin_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 999,
        }, timeout=15)
        did = cr.json()["id"]
        dr = s.delete(f"{API}/deals/{did}", timeout=15)
        assert dr.status_code == 204
        g = s.get(f"{API}/deals/{did}", timeout=15)
        assert g.status_code == 404


class TestDealRBACAgent:
    def test_agent_create_self_owned_only(self, agent_ctx, admin_ctx, seed_property, seed_client, agent_user):
        s_agent, agent = agent_ctx
        s_admin, admin = admin_ctx
        # Agent tries to assign to admin → must be coerced back to agent
        r = s_agent.post(f"{API}/deals", json={
            "title": f"TEST_AgentSelfCoerce_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property,
            "clientId": seed_client,
            "amount": 500000,
            "assignedAgentId": admin["id"],
        }, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["assignedAgentId"] == agent_user["id"]
        s_admin.delete(f"{API}/deals/{d['id']}", timeout=15)

    def test_agent_scope_list(self, agent_ctx, admin_ctx, seed_property, seed_client):
        s_admin, admin = admin_ctx
        # admin creates a deal owned by admin (not the agent)
        cr = s_admin.post(f"{API}/deals", json={
            "title": f"TEST_AdminOnly_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 1000,
        }, timeout=15)
        did = cr.json()["id"]
        try:
            s_agent, _ = agent_ctx
            r = s_agent.get(f"{API}/deals", timeout=15)
            assert r.status_code == 200
            assert all(d["id"] != did for d in r.json()["deals"]), \
                "AGENT scope should hide admin-owned deal"
            # GET by id → 403
            g = s_agent.get(f"{API}/deals/{did}", timeout=15)
            assert g.status_code == 403
        finally:
            s_admin.delete(f"{API}/deals/{did}", timeout=15)

    def test_agent_cannot_edit_others(self, agent_ctx, admin_ctx, seed_property, seed_client):
        s_admin, _ = admin_ctx
        cr = s_admin.post(f"{API}/deals", json={
            "title": f"TEST_NotAgent_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 1234,
        }, timeout=15)
        did = cr.json()["id"]
        try:
            s_agent, _ = agent_ctx
            r = s_agent.put(f"{API}/deals/{did}", json={"amount": 4321}, timeout=15)
            assert r.status_code == 403
            r = s_agent.delete(f"{API}/deals/{did}", timeout=15)
            assert r.status_code == 403
        finally:
            s_admin.delete(f"{API}/deals/{did}", timeout=15)

    def test_agent_cannot_reassign_via_put(self, agent_ctx, admin_ctx, seed_property, seed_client, agent_user):
        s_admin, admin = admin_ctx
        # admin creates a deal owned by AGENT
        cr = s_admin.post(f"{API}/deals", json={
            "title": f"TEST_AgentOwned_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 7777,
            "assignedAgentId": agent_user["id"],
        }, timeout=15)
        did = cr.json()["id"]
        try:
            s_agent, _ = agent_ctx
            # Agent can edit other fields on own deal
            r = s_agent.put(f"{API}/deals/{did}", json={"notes": "agent updated"}, timeout=15)
            assert r.status_code == 200, r.text
            # But cannot reassign to admin
            r = s_agent.put(f"{API}/deals/{did}", json={"assignedAgentId": admin["id"]}, timeout=15)
            assert r.status_code == 403
        finally:
            s_admin.delete(f"{API}/deals/{did}", timeout=15)


class TestRestrictOnDeleteRelations:
    """Verify Property/Client cannot be deleted while a Deal references them."""

    def test_property_delete_restricted_when_referenced(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        cr = s.post(f"{API}/deals", json={
            "title": f"TEST_RestrictProp_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 1,
        }, timeout=15)
        assert cr.status_code == 201
        did = cr.json()["id"]
        try:
            r = s.delete(f"{API}/properties/{seed_property}", timeout=15)
            assert r.status_code in (400, 409), (
                f"Expected restrict error, got {r.status_code}: {r.text}"
            )
            # The deal should still exist
            g = s.get(f"{API}/deals/{did}", timeout=15)
            assert g.status_code == 200
        finally:
            s.delete(f"{API}/deals/{did}", timeout=15)

    def test_client_delete_restricted_when_referenced(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        cr = s.post(f"{API}/deals", json={
            "title": f"TEST_RestrictClient_{uuid.uuid4().hex[:6]}",
            "propertyId": seed_property, "clientId": seed_client, "amount": 1,
        }, timeout=15)
        assert cr.status_code == 201
        did = cr.json()["id"]
        try:
            r = s.delete(f"{API}/clients/{seed_client}", timeout=15)
            assert r.status_code in (400, 409), (
                f"Expected restrict error, got {r.status_code}: {r.text}"
            )
            g = s.get(f"{API}/deals/{did}", timeout=15)
            assert g.status_code == 200
        finally:
            s.delete(f"{API}/deals/{did}", timeout=15)


class TestRegression:
    """Quick smoke for prior modules — must remain 200."""

    @pytest.mark.parametrize("path", [
        "/health", "/leads", "/properties", "/clients",
        "/followups", "/communications", "/analytics/overview", "/users",
    ])
    def test_module_endpoints_200(self, admin_ctx, path):
        s, _ = admin_ctx
        r = s.get(f"{API}{path}", timeout=15)
        assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
