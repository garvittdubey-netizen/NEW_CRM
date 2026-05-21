"""Permission/security regression tests for the Lead Management module.

Covers:
- GET /api/users restricted to ADMIN
- GET /api/agents available to any authenticated user, returns only AGENT users
  with the minimal { id, name, role } shape (no email, no admins)
- PUT /api/leads/:id ownership rules:
    * ADMIN can edit any lead
    * AGENT can edit only leads assigned to themselves
    * AGENT cannot edit unassigned leads
    * AGENT cannot edit leads assigned to a different agent
    * AGENT cannot reassign a lead via PUT
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


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _register_agent() -> dict:
    email = f"TEST_perm_agent_{uuid.uuid4().hex[:8]}@example.com"
    password = "AgentPass@123"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"name": "Perm Agent", "email": email, "password": password},
        timeout=15,
    )
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "email": email,
        "password": password,
        "token": data["token"],
        "user": data["user"],
    }


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_headers():
    token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_a():
    a = _register_agent()
    return a


@pytest.fixture(scope="module")
def agent_b():
    b = _register_agent()
    return b


@pytest.fixture(scope="module")
def agent_a_headers(agent_a):
    return {"Authorization": f"Bearer {agent_a['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_b_headers(agent_b):
    return {"Authorization": f"Bearer {agent_b['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cleanup_lead_ids(admin_headers):
    ids: list[str] = []
    yield ids
    for lead_id in ids:
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers, timeout=10)


def _create_lead(admin_headers, name: str, assigned_to: str | None = None) -> str:
    payload = {"fullName": name}
    if assigned_to is not None:
        payload["assignedAgentId"] = assigned_to
    r = requests.post(f"{BASE_URL}/api/leads", headers=admin_headers, json=payload, timeout=10)
    assert r.status_code in (200, 201), f"Create lead failed: {r.status_code} {r.text}"
    return r.json()["id"]


# ---------- /api/users restriction ----------

def test_users_endpoint_admin_can_list(admin_headers):
    r = requests.get(f"{BASE_URL}/api/users", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    # Admin response includes email + role + name + id
    if body:
        assert {"id", "name", "email", "role"}.issubset(body[0].keys())


def test_users_endpoint_agent_forbidden(agent_a_headers):
    r = requests.get(f"{BASE_URL}/api/users", headers=agent_a_headers, timeout=10)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------- /api/agents minimal directory ----------

def test_agents_endpoint_returns_only_agents(admin_headers, agent_a, agent_b):
    r = requests.get(f"{BASE_URL}/api/agents", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    # Every entry must be AGENT — never ADMIN
    assert all(u["role"] == "AGENT" for u in body), "/api/agents leaked non-agent roles"
    # Email must NOT be exposed
    assert all("email" not in u for u in body), "/api/agents leaked email"
    # Only { id, name, role } keys
    if body:
        assert set(body[0].keys()) == {"id", "name", "role"}
    # Our two registered agents should both be visible
    ids = {u["id"] for u in body}
    assert agent_a["user"]["id"] in ids
    assert agent_b["user"]["id"] in ids


def test_agents_endpoint_available_to_agent(agent_a_headers):
    r = requests.get(f"{BASE_URL}/api/agents", headers=agent_a_headers, timeout=10)
    assert r.status_code == 200
    assert all(u["role"] == "AGENT" for u in r.json())


# ---------- Lead edit ownership rules ----------

def test_admin_can_edit_any_lead(admin_headers, cleanup_lead_ids):
    lead_id = _create_lead(admin_headers, f"TEST_perm_admin_{uuid.uuid4().hex[:6]}")
    cleanup_lead_ids.append(lead_id)
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=admin_headers,
        json={"notes": "admin edited"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["notes"] == "admin edited"


def test_agent_cannot_edit_unassigned_lead(admin_headers, agent_a_headers, cleanup_lead_ids):
    lead_id = _create_lead(admin_headers, f"TEST_perm_unassigned_{uuid.uuid4().hex[:6]}")
    cleanup_lead_ids.append(lead_id)
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=agent_a_headers,
        json={"notes": "hack"},
        timeout=10,
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    assert "assigned" in r.json().get("error", "").lower()


def test_agent_cannot_edit_lead_assigned_to_another_agent(
    admin_headers, agent_a_headers, agent_b, cleanup_lead_ids
):
    lead_id = _create_lead(
        admin_headers,
        f"TEST_perm_cross_{uuid.uuid4().hex[:6]}",
        assigned_to=agent_b["user"]["id"],
    )
    cleanup_lead_ids.append(lead_id)
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=agent_a_headers,
        json={"notes": "cross-tenant hack"},
        timeout=10,
    )
    assert r.status_code == 403


def test_agent_can_edit_own_assigned_lead(
    admin_headers, agent_a_headers, agent_a, cleanup_lead_ids
):
    lead_id = _create_lead(
        admin_headers,
        f"TEST_perm_own_{uuid.uuid4().hex[:6]}",
        assigned_to=agent_a["user"]["id"],
    )
    cleanup_lead_ids.append(lead_id)
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=agent_a_headers,
        json={"notes": "my own note"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["notes"] == "my own note"


def test_agent_cannot_reassign_via_put(
    admin_headers, agent_a_headers, agent_a, agent_b, cleanup_lead_ids
):
    lead_id = _create_lead(
        admin_headers,
        f"TEST_perm_reassign_{uuid.uuid4().hex[:6]}",
        assigned_to=agent_a["user"]["id"],
    )
    cleanup_lead_ids.append(lead_id)

    # Reassign to another agent
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=agent_a_headers,
        json={"assignedAgentId": agent_b["user"]["id"]},
        timeout=10,
    )
    assert r.status_code == 403

    # Unassign self
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=agent_a_headers,
        json={"assignedAgentId": None},
        timeout=10,
    )
    assert r.status_code == 403


def test_agent_put_with_same_assignee_is_allowed(
    admin_headers, agent_a_headers, agent_a, cleanup_lead_ids
):
    """An agent sending assignedAgentId == own id should still succeed."""
    lead_id = _create_lead(
        admin_headers,
        f"TEST_perm_sameassign_{uuid.uuid4().hex[:6]}",
        assigned_to=agent_a["user"]["id"],
    )
    cleanup_lead_ids.append(lead_id)
    r = requests.put(
        f"{BASE_URL}/api/leads/{lead_id}",
        headers=agent_a_headers,
        json={"notes": "ok", "assignedAgentId": agent_a["user"]["id"]},
        timeout=10,
    )
    assert r.status_code == 200
