"""Backend integration tests for the Follow-up & Communication module.

Covers CRUD, dashboard stats, filters (window, status, leadId, agent),
ownership rules (admin vs agent), and cascade-on-lead-delete.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

ADMIN_EMAIL = "admin@realestate.com"
ADMIN_PASSWORD = "Admin@2036"


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()


def _register_agent() -> dict:
    email = f"TEST_fu_agent_{uuid.uuid4().hex[:8]}@example.com"
    password = "AgentPass@123"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"name": "FU Agent", "email": email, "password": password}, timeout=15)
    assert r.status_code in (200, 201)
    body = r.json()
    return {"email": email, "password": password, "token": body["token"], "user": body["user"]}


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin():
    data = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return data


@pytest.fixture(scope="module")
def admin_headers(admin):
    return {"Authorization": f"Bearer {admin['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_a():
    return _register_agent()


@pytest.fixture(scope="module")
def agent_b():
    return _register_agent()


@pytest.fixture(scope="module")
def agent_a_headers(agent_a):
    return {"Authorization": f"Bearer {agent_a['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_b_headers(agent_b):
    return {"Authorization": f"Bearer {agent_b['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def lead_for_agent_a(admin_headers, agent_a):
    """A lead assigned to agent A — created and torn down by admin."""
    r = requests.post(
        f"{BASE_URL}/api/leads",
        headers=admin_headers,
        json={"fullName": f"TEST_FU_LeadA_{uuid.uuid4().hex[:6]}",
              "assignedAgentId": agent_a["user"]["id"]},
        timeout=10,
    )
    assert r.status_code in (200, 201)
    lid = r.json()["id"]
    yield lid
    requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=admin_headers, timeout=10)


@pytest.fixture(scope="module")
def unassigned_lead(admin_headers):
    r = requests.post(f"{BASE_URL}/api/leads", headers=admin_headers,
                      json={"fullName": f"TEST_FU_Unassigned_{uuid.uuid4().hex[:6]}"}, timeout=10)
    lid = r.json()["id"]
    yield lid
    requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=admin_headers, timeout=10)


# ---------- CRUD ----------

def test_create_followup_requires_fields(admin_headers):
    r = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers,
                      json={"leadId": "x"}, timeout=10)
    assert r.status_code == 400


def test_admin_can_create_and_fetch_followup(admin_headers, lead_for_agent_a, agent_a):
    body = {
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
        "notes": "Confirm site visit",
    }
    r = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json=body, timeout=10)
    assert r.status_code == 201, r.text
    fu = r.json()
    assert fu["leadId"] == lead_for_agent_a
    assert fu["assignedAgentId"] == agent_a["user"]["id"]
    assert fu["status"] == "PENDING"
    assert fu["lead"]["fullName"]
    assert fu["assignedAgent"]["name"]

    # GET by id
    r = requests.get(f"{BASE_URL}/api/followups/{fu['id']}", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    assert r.json()["id"] == fu["id"]


def test_complete_and_edit_flow(admin_headers, lead_for_agent_a, agent_a):
    fu = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=2)),
    }, timeout=10).json()

    # Edit notes
    r = requests.put(f"{BASE_URL}/api/followups/{fu['id']}", headers=admin_headers,
                     json={"notes": "Updated"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["notes"] == "Updated"

    # Complete
    r = requests.patch(f"{BASE_URL}/api/followups/{fu['id']}/complete",
                       headers=admin_headers, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "COMPLETED"


# ---------- Filters ----------

def test_list_filters_by_window(admin_headers, lead_for_agent_a, agent_a):
    now = datetime.now(timezone.utc)
    # Create one in past (overdue), one today, one in future
    created = []
    for offset in [-2, 0, 5]:
        r = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
            "leadId": lead_for_agent_a,
            "assignedAgentId": agent_a["user"]["id"],
            "followUpDate": _iso(now + timedelta(days=offset)),
            "notes": f"offset={offset}",
        }, timeout=10).json()
        created.append(r["id"])

    upcoming = requests.get(f"{BASE_URL}/api/followups?window=upcoming",
                            headers=admin_headers, timeout=10).json()
    overdue = requests.get(f"{BASE_URL}/api/followups?window=overdue",
                           headers=admin_headers, timeout=10).json()

    assert any(f["notes"] == "offset=5" for f in upcoming["followUps"])
    assert any(f["notes"] == "offset=-2" for f in overdue["followUps"])
    # overdue list must not contain the future one
    assert not any(f["notes"] == "offset=5" for f in overdue["followUps"])


def test_filter_by_lead_and_status(admin_headers, lead_for_agent_a, agent_a):
    r = requests.get(f"{BASE_URL}/api/followups?leadId={lead_for_agent_a}",
                     headers=admin_headers, timeout=10)
    assert r.status_code == 200
    assert all(f["leadId"] == lead_for_agent_a for f in r.json()["followUps"])

    r = requests.get(f"{BASE_URL}/api/followups?status=COMPLETED",
                     headers=admin_headers, timeout=10)
    assert all(f["status"] == "COMPLETED" for f in r.json()["followUps"])


# ---------- Ownership / role rules ----------

def test_agent_cannot_create_followup_for_others(agent_a_headers, agent_b, lead_for_agent_a):
    """Agent A tries to assign a follow-up to Agent B — must be 403."""
    r = requests.post(f"{BASE_URL}/api/followups", headers=agent_a_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_b["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
    }, timeout=10)
    assert r.status_code == 403


def test_agent_cannot_create_followup_on_unassigned_lead(agent_a_headers, agent_a, unassigned_lead):
    r = requests.post(f"{BASE_URL}/api/followups", headers=agent_a_headers, json={
        "leadId": unassigned_lead,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
    }, timeout=10)
    assert r.status_code == 403


def test_agent_can_create_followup_on_own_lead(agent_a_headers, agent_a, lead_for_agent_a):
    r = requests.post(f"{BASE_URL}/api/followups", headers=agent_a_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
        "notes": "From agent A",
    }, timeout=10)
    assert r.status_code == 201


def test_agent_cannot_view_others_followup(admin_headers, agent_b_headers,
                                            lead_for_agent_a, agent_a):
    fu = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
    }, timeout=10).json()

    r = requests.get(f"{BASE_URL}/api/followups/{fu['id']}", headers=agent_b_headers, timeout=10)
    assert r.status_code == 403


def test_agent_cannot_edit_others_followup(admin_headers, agent_b_headers,
                                            lead_for_agent_a, agent_a):
    fu = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
    }, timeout=10).json()

    r = requests.put(f"{BASE_URL}/api/followups/{fu['id']}", headers=agent_b_headers,
                     json={"notes": "hijack"}, timeout=10)
    assert r.status_code == 403


def test_agent_list_only_returns_own(admin_headers, agent_a_headers,
                                      lead_for_agent_a, agent_a):
    requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=3)),
    }, timeout=10)

    r = requests.get(f"{BASE_URL}/api/followups", headers=agent_a_headers, timeout=10)
    assert r.status_code == 200
    assert all(f["assignedAgentId"] == agent_a["user"]["id"] for f in r.json()["followUps"])


def test_delete_followup_admin_only(admin_headers, agent_a_headers, lead_for_agent_a, agent_a):
    fu = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
        "leadId": lead_for_agent_a,
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
    }, timeout=10).json()

    # Agent cannot delete
    r = requests.delete(f"{BASE_URL}/api/followups/{fu['id']}", headers=agent_a_headers, timeout=10)
    assert r.status_code == 403

    # Admin can delete
    r = requests.delete(f"{BASE_URL}/api/followups/{fu['id']}", headers=admin_headers, timeout=10)
    assert r.status_code == 204


# ---------- Dashboard stats ----------

def test_dashboard_stats_shape_and_scope(admin_headers, agent_a_headers):
    r = requests.get(f"{BASE_URL}/api/followups/stats", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert {"today", "overdue", "upcoming"}.issubset(body.keys())
    assert all(isinstance(body[k], int) for k in ("today", "overdue", "upcoming"))

    r2 = requests.get(f"{BASE_URL}/api/followups/stats", headers=agent_a_headers, timeout=10)
    assert r2.status_code == 200


# ---------- Cascade-on-lead-delete ----------

def test_deleting_lead_cascades_to_followups(admin_headers, agent_a):
    lead = requests.post(f"{BASE_URL}/api/leads", headers=admin_headers, json={
        "fullName": f"TEST_FU_Cascade_{uuid.uuid4().hex[:6]}",
        "assignedAgentId": agent_a["user"]["id"],
    }, timeout=10).json()
    fu = requests.post(f"{BASE_URL}/api/followups", headers=admin_headers, json={
        "leadId": lead["id"],
        "assignedAgentId": agent_a["user"]["id"],
        "followUpDate": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
    }, timeout=10).json()

    r = requests.delete(f"{BASE_URL}/api/leads/{lead['id']}", headers=admin_headers, timeout=10)
    assert r.status_code == 204

    # Follow-up should be gone
    r = requests.get(f"{BASE_URL}/api/followups/{fu['id']}", headers=admin_headers, timeout=10)
    assert r.status_code == 404
