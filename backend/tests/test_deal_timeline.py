"""
Phase 10.1 backend regression — Deal Timeline + Activity auto-logging.

Covers:
  - GET /api/deals/:id/timeline — admin can read any deal; agent can read only their own
  - 403 on a deal the agent does not own; 404 on a missing deal
  - Response shape: {items: [{id, source:'DEAL', eventType, notes, createdAt, actor:{id,name}|null}]}
  - Sort: newest first; cap 200
  - GET /api/deals/:id/activities is an alias of /timeline
  - POST /api/deals → exactly one CREATED entry (notes contain title/status/formatted amount); actor=caller
  - PUT /api/deals/:id → STATUS_CHANGED on status-only edit, AMOUNT_UPDATED on amount-only,
    AGENT_REASSIGNED on agent change (admin only), NOTES_UPDATED on notes-only,
    multi-field PUT (status + amount + notes) emits THREE events
  - Cosmetic-only PUT (title / propertyId / clientId / expectedClosingDate) emits zero events
"""
import os
import uuid
import pytest
import requests
from datetime import datetime

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.text}"
    j = r.json()
    return j.get("token") or j.get("accessToken"), j.get("user", {})


@pytest.fixture(scope="session")
def admin_ctx():
    tok, u = _login(ADMIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s, u


@pytest.fixture(scope="session")
def agent_ctx():
    tok, u = _login(AGENT)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s, u


@pytest.fixture(scope="session")
def agent_user(admin_ctx):
    s, _ = admin_ctx
    r = s.get(f"{API}/users", timeout=20)
    assert r.status_code == 200, r.text
    users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
    return next(u for u in users if u["email"] == AGENT["email"])


@pytest.fixture(scope="session")
def seed_property(admin_ctx):
    s, _ = admin_ctx
    r = s.post(f"{API}/properties", json={
        "title": f"TEST_TL_Prop_{uuid.uuid4().hex[:6]}",
        "description": "timeline prop",
        "propertyType": "Apartment",
        "price": 5000000,
        "city": "Mumbai",
        "location": "Bandra",
        "bedrooms": 2, "bathrooms": 2, "area": 1000,
        "status": "AVAILABLE", "images": [],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    yield pid
    s.delete(f"{API}/properties/{pid}", timeout=20)


@pytest.fixture(scope="session")
def seed_client(admin_ctx):
    s, _ = admin_ctx
    r = s.post(f"{API}/clients", json={
        "fullName": f"TEST_TL_Client_{uuid.uuid4().hex[:6]}",
        "phone": "+919000000088",
        "email": f"tl_{uuid.uuid4().hex[:5]}@example.com",
        "preferredLocation": "Bandra",
        "budget": 5000000,
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    yield cid
    s.delete(f"{API}/clients/{cid}", timeout=20)


def _create_deal(session, **overrides):
    payload = {
        "title": overrides.get("title", f"TEST_TL_Deal_{uuid.uuid4().hex[:6]}"),
        "propertyId": overrides["propertyId"],
        "clientId": overrides["clientId"],
        "amount": overrides.get("amount", 1000000),
        "status": overrides.get("status", "NEW"),
    }
    if "assignedAgentId" in overrides:
        payload["assignedAgentId"] = overrides["assignedAgentId"]
    if "notes" in overrides:
        payload["notes"] = overrides["notes"]
    r = session.post(f"{API}/deals", json=payload, timeout=20)
    assert r.status_code == 201, r.text
    return r.json()


# ============================================================================
# Section 1: Endpoint shape / RBAC / 404
# ============================================================================
class TestTimelineEndpoint:
    def test_timeline_shape_and_created_event(self, admin_ctx, seed_property, seed_client):
        s, admin = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client,
                         amount=2500000, status="NEGOTIATION", title="TEST_TL_Shape")
        try:
            r = s.get(f"{API}/deals/{d['id']}/timeline", timeout=20)
            assert r.status_code == 200, r.text
            body = r.json()
            assert "items" in body and isinstance(body["items"], list)
            assert len(body["items"]) >= 1
            assert len(body["items"]) <= 200  # cap

            first = body["items"][0]
            for key in ("id", "source", "eventType", "notes", "createdAt", "actor"):
                assert key in first, f"missing key {key} in item"
            assert first["source"] == "DEAL"
            # newest-first: first item should be the CREATED of this deal
            created_item = next((i for i in body["items"] if i["eventType"] == "CREATED"), None)
            assert created_item is not None, "no CREATED event found"
            assert "TEST_TL_Shape" in (created_item["notes"] or "")
            # formatted amount mention
            notes = created_item["notes"] or ""
            assert ("25" in notes) or ("2,500,000" in notes) or ("2500000" in notes), \
                f"formatted amount missing in CREATED notes: {notes}"
            # actor
            assert created_item["actor"] is not None
            assert created_item["actor"]["id"] == admin["id"]

            # sorted desc
            timestamps = [datetime.fromisoformat(i["createdAt"].replace("Z", "+00:00"))
                          for i in body["items"]]
            assert timestamps == sorted(timestamps, reverse=True), "items not newest-first"
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_activities_alias_matches_timeline(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client)
        try:
            t = s.get(f"{API}/deals/{d['id']}/timeline", timeout=20)
            a = s.get(f"{API}/deals/{d['id']}/activities", timeout=20)
            assert t.status_code == 200 and a.status_code == 200
            # Same set of item ids
            ids_t = [i["id"] for i in t.json()["items"]]
            ids_a = [i["id"] for i in a.json()["items"]]
            assert ids_t == ids_a, "timeline/activities alias must return same payload"
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_timeline_404_missing_deal(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/deals/00000000-0000-0000-0000-000000000000/timeline", timeout=20)
        assert r.status_code == 404, r.text

    def test_agent_can_read_own_timeline(self, admin_ctx, agent_ctx, seed_property, seed_client, agent_user):
        s_admin, _ = admin_ctx
        s_agent, _ = agent_ctx
        # admin creates a deal owned by agent
        d = _create_deal(s_admin, propertyId=seed_property, clientId=seed_client,
                         assignedAgentId=agent_user["id"])
        try:
            r = s_agent.get(f"{API}/deals/{d['id']}/timeline", timeout=20)
            assert r.status_code == 200, r.text
            assert any(i["eventType"] == "CREATED" for i in r.json()["items"])
        finally:
            s_admin.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_agent_403_on_non_owned_timeline(self, admin_ctx, agent_ctx, seed_property, seed_client):
        s_admin, _ = admin_ctx
        s_agent, _ = agent_ctx
        d = _create_deal(s_admin, propertyId=seed_property, clientId=seed_client)
        try:
            r = s_agent.get(f"{API}/deals/{d['id']}/timeline", timeout=20)
            assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
            r2 = s_agent.get(f"{API}/deals/{d['id']}/activities", timeout=20)
            assert r2.status_code == 403
        finally:
            s_admin.delete(f"{API}/deals/{d['id']}", timeout=20)


# ============================================================================
# Section 2: Auto-logging on create + update
# ============================================================================
def _events_after(session, deal_id, since_count=0):
    r = session.get(f"{API}/deals/{deal_id}/timeline", timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    # Count of NEW events at the top (descending)
    return items[: max(0, len(items) - since_count)]


def _types(items):
    return [i["eventType"] for i in items]


class TestAutoLogging:
    def test_create_emits_single_created_event(self, admin_ctx, seed_property, seed_client):
        s, admin = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client,
                         amount=1500000, status="NEW", title="TEST_TL_Create")
        try:
            items = s.get(f"{API}/deals/{d['id']}/timeline", timeout=20).json()["items"]
            assert len(items) == 1, f"expected exactly 1 event, got {len(items)}: {_types(items)}"
            assert items[0]["eventType"] == "CREATED"
            assert items[0]["actor"]["id"] == admin["id"]
            notes = items[0]["notes"] or ""
            assert "TEST_TL_Create" in notes
            assert "NEW" in notes
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_status_only_change_emits_status_changed(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client, status="NEW")
        try:
            before = len(s.get(f"{API}/deals/{d['id']}/timeline").json()["items"])
            r = s.put(f"{API}/deals/{d['id']}", json={"status": "NEGOTIATION"}, timeout=20)
            assert r.status_code == 200, r.text
            items = s.get(f"{API}/deals/{d['id']}/timeline").json()["items"]
            new = items[: len(items) - before]
            assert _types(new) == ["STATUS_CHANGED"], _types(new)
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_amount_only_change_emits_amount_updated(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client, amount=1000000)
        try:
            before = len(s.get(f"{API}/deals/{d['id']}/timeline").json()["items"])
            r = s.put(f"{API}/deals/{d['id']}", json={"amount": 2222222}, timeout=20)
            assert r.status_code == 200, r.text
            items = s.get(f"{API}/deals/{d['id']}/timeline").json()["items"]
            new = items[: len(items) - before]
            assert _types(new) == ["AMOUNT_UPDATED"], _types(new)
            notes = new[0]["notes"] or ""
            # from/to mention
            assert ("1000000" in notes or "1,000,000" in notes or "10" in notes), notes
            assert ("2222222" in notes or "2,222,222" in notes or "22" in notes), notes
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_agent_reassign_emits_event(self, admin_ctx, seed_property, seed_client, agent_user):
        s, admin = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client)
        try:
            before = len(s.get(f"{API}/deals/{d['id']}/timeline").json()["items"])
            r = s.put(f"{API}/deals/{d['id']}", json={"assignedAgentId": agent_user["id"]}, timeout=20)
            assert r.status_code == 200, r.text
            items = s.get(f"{API}/deals/{d['id']}/timeline").json()["items"]
            new = items[: len(items) - before]
            assert _types(new) == ["AGENT_REASSIGNED"], _types(new)
            notes = (new[0]["notes"] or "").lower()
            # from admin name to agent name should be present
            assert agent_user["name"].lower() in notes or "agent" in notes, notes
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_notes_only_change_emits_notes_updated(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client, notes="original")
        try:
            before = len(s.get(f"{API}/deals/{d['id']}/timeline").json()["items"])
            r = s.put(f"{API}/deals/{d['id']}", json={"notes": "phase 10.1 changed"}, timeout=20)
            assert r.status_code == 200, r.text
            items = s.get(f"{API}/deals/{d['id']}/timeline").json()["items"]
            new = items[: len(items) - before]
            assert _types(new) == ["NOTES_UPDATED"], _types(new)
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_multi_field_put_emits_three_events(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client,
                         amount=100000, status="NEW", notes="alpha")
        try:
            before = len(s.get(f"{API}/deals/{d['id']}/timeline").json()["items"])
            r = s.put(f"{API}/deals/{d['id']}", json={
                "status": "DOCUMENTATION", "amount": 200000, "notes": "beta",
            }, timeout=20)
            assert r.status_code == 200, r.text
            items = s.get(f"{API}/deals/{d['id']}/timeline").json()["items"]
            new = items[: len(items) - before]
            types = set(_types(new))
            assert {"STATUS_CHANGED", "AMOUNT_UPDATED", "NOTES_UPDATED"}.issubset(types), \
                f"missing events: {types}"
            assert len(new) == 3, f"expected exactly 3 new events, got {len(new)}: {_types(new)}"
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)

    def test_cosmetic_only_change_no_event(self, admin_ctx, seed_property, seed_client):
        s, _ = admin_ctx
        d = _create_deal(s, propertyId=seed_property, clientId=seed_client)
        try:
            before = len(s.get(f"{API}/deals/{d['id']}/timeline").json()["items"])
            r = s.put(f"{API}/deals/{d['id']}", json={
                "title": "TEST_TL_CosmeticRename",
                "expectedClosingDate": "2026-12-31",
            }, timeout=20)
            assert r.status_code == 200, r.text
            items = s.get(f"{API}/deals/{d['id']}/timeline").json()["items"]
            assert len(items) == before, \
                f"cosmetic edits must not emit events: {_types(items[: len(items) - before])}"
        finally:
            s.delete(f"{API}/deals/{d['id']}", timeout=20)


# ============================================================================
# Section 3: Phase-1 regression
# ============================================================================
class TestPhase1Regression:
    def test_deals_list_still_200(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/deals", timeout=20)
        assert r.status_code == 200
        body = r.json()
        for k in ("deals", "total", "page", "limit", "pages"):
            assert k in body
