"""Phase 14.2 — Client reactivation workflow tests.

Tests POST /api/clients/:id/reactivate covering:
- RESTORE path (linked lead exists -> lead.status flips back to NEW; linkedLeadId preserved)
- CREATE path (no linked lead -> new lead created from client snapshot, attached)
- Validation (reason required, max 500 chars)
- RBAC (SUPER_ADMIN/ADMIN can reactivate any; AGENT only own; cross-agent 403)
- 404 for non-existent client
- Timeline contains CLIENT_REVERTED entries (CLIENT + ACTIVITY sources)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get('REACT_APP_BACKEND_URL')
    or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].splitlines()[0]
).rstrip('/')

SUPER_ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
ADMIN = {"email": "manager@realestate.com", "password": "Manager@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def super_admin_ctx():
    token, user = _login(SUPER_ADMIN)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def admin_ctx():
    token, user = _login(ADMIN)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def agent_ctx():
    token, user = _login(AGENT)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def other_agent_ctx(super_admin_ctx):
    """Create a secondary AGENT to test cross-agent 403."""
    suffix = int(time.time())
    email = f"TEST_agent_{suffix}@realestate.com"
    payload = {
        "name": f"TEST Agent {suffix}",
        "email": email,
        "password": "TestPass@2036",
        "role": "AGENT",
    }
    r = requests.post(
        f"{BASE_URL}/api/users", json=payload, headers=super_admin_ctx["h"], timeout=20
    )
    assert r.status_code in (200, 201), f"Create agent failed: {r.status_code} {r.text}"
    created = r.json()
    # login as new agent
    token, user = _login({"email": email, "password": "TestPass@2036"})
    yield {
        "token": token,
        "user": user,
        "h": {"Authorization": f"Bearer {token}"},
        "id": created.get("id") or user["id"],
    }
    # Cleanup — disable
    try:
        requests.put(
            f"{BASE_URL}/api/users/{user['id']}",
            json={"isActive": False},
            headers=super_admin_ctx["h"],
            timeout=15,
        )
    except Exception:
        pass


def _create_lead(headers, full_name, **extra):
    body = {
        "fullName": full_name,
        "phone": f"+9199{int(time.time()*1000) % 10**8:08d}",
        "email": f"{uuid.uuid4().hex[:10]}@test.com",
        "source": "MANUAL",
        "status": "NEW",
        **extra,
    }
    r = requests.post(f"{BASE_URL}/api/leads", json=body, headers=headers, timeout=20)
    assert r.status_code in (200, 201), f"Lead create failed: {r.status_code} {r.text}"
    return r.json()


def _create_client(headers, full_name, **extra):
    body = {
        "fullName": full_name,
        "phone": f"+9198{int(time.time()*1000) % 10**8:08d}",
        "email": f"{uuid.uuid4().hex[:10]}@test.com",
        "budget": 5000000,
        "preferredLocation": "Mumbai",
        "notes": "Reactivation test client",
        **extra,
    }
    r = requests.post(f"{BASE_URL}/api/clients", json=body, headers=headers, timeout=20)
    assert r.status_code in (200, 201), f"Client create failed: {r.status_code} {r.text}"
    return r.json()


def _set_lead_status(headers, lead_id, status):
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}", json={"status": status}, headers=headers, timeout=20
    )
    assert r.status_code in (200, 204), f"Lead status update failed: {r.status_code} {r.text}"


# Tracking for cleanup
_created_clients = []
_created_leads = []


def _cleanup_client(headers, client_id):
    try:
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=headers, timeout=15)
    except Exception:
        pass


def _cleanup_lead(headers, lead_id):
    try:
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=headers, timeout=15)
    except Exception:
        pass


# ---------------- RESTORE path ----------------
class TestReactivateRestore:
    def test_restore_flips_lost_lead_to_new_preserves_linked_lead_id(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        lead = _create_lead(h, f"TEST_LeadRestore_{int(time.time())}")
        _created_leads.append(lead["id"])
        # Convert to client with linkedLeadId
        client = _create_client(h, lead["fullName"], linkedLeadId=lead["id"])
        _created_clients.append(client["id"])
        # Set lead to LOST
        _set_lead_status(h, lead["id"], "LOST")

        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "Budget issue — buyer ready again"},
            headers=h,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mode"] == "RESTORED"
        assert body["lead"]["id"] == lead["id"]
        assert body["lead"]["status"] == "NEW"
        # linkedLeadId UNCHANGED
        assert body["client"]["linkedLeadId"] == lead["id"]

        # Re-fetch and verify persistence
        verify = requests.get(
            f"{BASE_URL}/api/leads/{lead['id']}", headers=h, timeout=15
        )
        assert verify.status_code == 200
        assert verify.json()["status"] == "NEW"


# ---------------- CREATE path ----------------
class TestReactivateCreate:
    def test_create_synthesises_new_lead_when_no_link(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        agent_id = super_admin_ctx["user"]["id"]
        client = _create_client(
            h,
            f"TEST_ClientCreate_{int(time.time())}",
            assignedAgentId=agent_id,
        )
        _created_clients.append(client["id"])
        assert client.get("linkedLeadId") in (None, "")

        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "Lost contact"},
            headers=h,
            timeout=25,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mode"] == "CREATED"
        new_lead_id = body["lead"]["id"]
        _created_leads.append(new_lead_id)
        assert body["lead"]["status"] == "NEW"
        assert body["client"]["linkedLeadId"] == new_lead_id

        # Verify the lead row has the expected snapshot
        lr = requests.get(f"{BASE_URL}/api/leads/{new_lead_id}", headers=h, timeout=15)
        assert lr.status_code == 200
        lead = lr.json()
        assert lead["fullName"] == client["fullName"]
        assert lead["phone"] == client["phone"]
        assert lead["email"] == client["email"]
        assert lead["source"] == "MANUAL"
        assert lead["status"] == "NEW"
        # budget may come back as number or string
        assert float(lead.get("budget") or 0) == float(client.get("budget") or 0)
        assert lead.get("preferredLocation") == client.get("preferredLocation")
        assert lead.get("notes") == client.get("notes")
        assert lead.get("assignedAgentId") == client.get("assignedAgentId")
        tags = lead.get("tags") or []
        assert "reactivated" in tags, f"Expected 'reactivated' tag, got {tags}"


# ---------------- Validation ----------------
class TestReactivateValidation:
    def test_missing_reason_400(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        client = _create_client(h, f"TEST_ValMissing_{int(time.time())}")
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400
        assert "reason" in r.json().get("error", "").lower()

    def test_empty_reason_400(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        client = _create_client(h, f"TEST_ValEmpty_{int(time.time())}")
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "   "},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400

    def test_reason_too_long_400(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        client = _create_client(h, f"TEST_ValLong_{int(time.time())}")
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "x" * 501},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400


# ---------------- 404 ----------------
class TestReactivate404:
    def test_nonexistent_client_404(self, super_admin_ctx):
        r = requests.post(
            f"{BASE_URL}/api/clients/00000000-0000-0000-0000-000000000000/reactivate",
            json={"reason": "test"},
            headers=super_admin_ctx["h"],
            timeout=15,
        )
        assert r.status_code == 404
        assert "not found" in r.json().get("error", "").lower()


# ---------------- RBAC ----------------
class TestReactivateRBAC:
    def test_admin_can_reactivate_any_client(self, admin_ctx, super_admin_ctx):
        # Client owned by super_admin user
        client = _create_client(
            super_admin_ctx["h"],
            f"TEST_RBAC_Admin_{int(time.time())}",
            assignedAgentId=super_admin_ctx["user"]["id"],
        )
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "ADMIN reactivation test"},
            headers=admin_ctx["h"],
            timeout=20,
        )
        assert r.status_code == 200, r.text
        _created_leads.append(r.json()["lead"]["id"])

    def test_super_admin_can_reactivate_any_client(self, super_admin_ctx, agent_ctx):
        client = _create_client(
            super_admin_ctx["h"],
            f"TEST_RBAC_SA_{int(time.time())}",
            assignedAgentId=agent_ctx["user"]["id"],
        )
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "SUPER_ADMIN reactivation test"},
            headers=super_admin_ctx["h"],
            timeout=20,
        )
        assert r.status_code == 200, r.text
        _created_leads.append(r.json()["lead"]["id"])

    def test_agent_can_reactivate_own_client(self, super_admin_ctx, agent_ctx):
        client = _create_client(
            super_admin_ctx["h"],
            f"TEST_RBAC_OwnAgent_{int(time.time())}",
            assignedAgentId=agent_ctx["user"]["id"],
        )
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "AGENT own-client reactivation"},
            headers=agent_ctx["h"],
            timeout=20,
        )
        assert r.status_code == 200, r.text
        _created_leads.append(r.json()["lead"]["id"])

    def test_agent_cannot_reactivate_others_client(
        self, super_admin_ctx, agent_ctx, other_agent_ctx
    ):
        # Client assigned to other_agent — primary agent should get 403
        client = _create_client(
            super_admin_ctx["h"],
            f"TEST_RBAC_OtherAgent_{int(time.time())}",
            assignedAgentId=other_agent_ctx["user"]["id"],
        )
        _created_clients.append(client["id"])
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": "should fail"},
            headers=agent_ctx["h"],
            timeout=15,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------------- Timeline ----------------
class TestReactivateTimeline:
    def test_timeline_contains_client_reverted_entries(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        lead = _create_lead(h, f"TEST_TimelineLead_{int(time.time())}")
        _created_leads.append(lead["id"])
        client = _create_client(h, lead["fullName"], linkedLeadId=lead["id"])
        _created_clients.append(client["id"])
        _set_lead_status(h, lead["id"], "LOST")
        reason_text = "Property unavailable for selected date"
        r = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/reactivate",
            json={"reason": reason_text},
            headers=h,
            timeout=20,
        )
        assert r.status_code == 200, r.text

        tl = requests.get(
            f"{BASE_URL}/api/clients/{client['id']}/timeline", headers=h, timeout=15
        )
        assert tl.status_code == 200
        items = tl.json().get("items", [])
        reverted = [i for i in items if i.get("action") == "CLIENT_REVERTED"]
        assert len(reverted) >= 2, f"Expected >=2 CLIENT_REVERTED entries (CLIENT + ACTIVITY), got {len(reverted)}: {reverted}"
        sources = {i.get("source") for i in reverted}
        assert "CLIENT" in sources, f"Missing CLIENT-source revert entry; sources={sources}"
        assert "ACTIVITY" in sources, f"Missing ACTIVITY-source revert entry; sources={sources}"
        # Reason in description/metadata
        joined = " ".join((i.get("description") or "") for i in reverted)
        assert reason_text in joined or any(
            reason_text in str((i.get("metadata") or {}).get("reason", "")) for i in reverted
        ), f"Reason text not surfaced in timeline entries: {reverted}"


# ---------------- Cleanup ----------------
class TestZZCleanup:
    def test_cleanup_all_test_data(self, super_admin_ctx):
        h = super_admin_ctx["h"]
        # Delete clients first (FK), then leads
        for cid in _created_clients:
            _cleanup_client(h, cid)
        for lid in _created_leads:
            _cleanup_lead(h, lid)
