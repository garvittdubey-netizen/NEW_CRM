"""
RBAC SUPER_ADMIN role hierarchy tests.
Tests the new SUPER_ADMIN > ADMIN > AGENT hierarchy and safety guards.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")

SUPER_ADMIN_EMAIL = "admin@realestate.com"
SUPER_ADMIN_PASS = "Admin@2036"
ADMIN_EMAIL = "manager@realestate.com"
ADMIN_PASS = "Manager@2036"
AGENT_EMAIL = "agent@realestate.com"
AGENT_PASS = "Agent@2036"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("accessToken") or (data.get("data") or {}).get("token")
    assert token, f"No token in login response: {data}"
    return token, data


@pytest.fixture(scope="module")
def super_admin_token():
    t, _ = _login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASS)
    return t


@pytest.fixture(scope="module")
def admin_token():
    t, _ = _login(ADMIN_EMAIL, ADMIN_PASS)
    return t


@pytest.fixture(scope="module")
def agent_token():
    t, _ = _login(AGENT_EMAIL, AGENT_PASS)
    return t


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _ts():
    return str(int(time.time() * 1000))


CREATED_USER_IDS = []


# ----------------- /api/auth/me role check -----------------
def test_root_user_is_super_admin(super_admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    user = data.get("user") or data.get("data") or data
    assert user.get("role") == "SUPER_ADMIN", f"Expected SUPER_ADMIN, got {user.get('role')}"
    assert user.get("email") == SUPER_ADMIN_EMAIL


def test_admin_role_unchanged(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    user = r.json().get("user") or r.json().get("data") or r.json()
    assert user.get("role") == "ADMIN"


def test_agent_role_unchanged(agent_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(agent_token), timeout=15)
    assert r.status_code == 200
    user = r.json().get("user") or r.json().get("data") or r.json()
    assert user.get("role") == "AGENT"


# ----------------- POST /api/users : SUPER_ADMIN can create any -----------------
def test_super_admin_creates_agent(super_admin_token):
    ts = _ts()
    payload = {"name": "TEST SA AGENT", "email": f"test_sa_agent_{ts}@example.com", "password": "Pass@1234", "role": "AGENT"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(super_admin_token), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    uid = user.get("id")
    assert uid
    CREATED_USER_IDS.append(uid)
    assert user.get("role") == "AGENT"


def test_super_admin_creates_admin(super_admin_token):
    ts = _ts()
    payload = {"name": "TEST SA ADMIN", "email": f"test_sa_admin_{ts}@example.com", "password": "Pass@1234", "role": "ADMIN"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(super_admin_token), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    CREATED_USER_IDS.append(user.get("id"))
    assert user.get("role") == "ADMIN"


def test_super_admin_creates_super_admin(super_admin_token):
    ts = _ts()
    payload = {"name": "TEST SA SUPER", "email": f"test_sa_super_{ts}@example.com", "password": "Pass@1234", "role": "SUPER_ADMIN"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(super_admin_token), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    CREATED_USER_IDS.append(user.get("id"))
    assert user.get("role") == "SUPER_ADMIN"


# ----------------- POST /api/users : ADMIN restrictions -----------------
def test_admin_creates_agent_ok(admin_token):
    ts = _ts()
    payload = {"name": "TEST ADM AGENT", "email": f"test_adm_agent_{ts}@example.com", "password": "Pass@1234", "role": "AGENT"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(admin_token), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    CREATED_USER_IDS.append(user.get("id"))


def test_admin_cannot_create_admin(admin_token):
    ts = _ts()
    payload = {"name": "TEST ADM->ADM", "email": f"test_adm_adm_{ts}@example.com", "password": "Pass@1234", "role": "ADMIN"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(admin_token), json=payload, timeout=15)
    assert r.status_code == 403, r.text
    body = r.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "FORBIDDEN_ROLE_ASSIGNMENT", f"Expected FORBIDDEN_ROLE_ASSIGNMENT, got {body}"


def test_admin_cannot_create_super_admin(admin_token):
    ts = _ts()
    payload = {"name": "TEST ADM->SA", "email": f"test_adm_sa_{ts}@example.com", "password": "Pass@1234", "role": "SUPER_ADMIN"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(admin_token), json=payload, timeout=15)
    assert r.status_code == 403, r.text
    body = r.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "FORBIDDEN_ROLE_ASSIGNMENT", f"Expected FORBIDDEN_ROLE_ASSIGNMENT, got {body}"


# ----------------- POST /api/users : AGENT blocked entirely -----------------
def test_agent_cannot_create_users(agent_token):
    ts = _ts()
    payload = {"name": "X", "email": f"test_agent_x_{ts}@example.com", "password": "Pass@1234", "role": "AGENT"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(agent_token), json=payload, timeout=15)
    assert r.status_code == 403, f"Expected 403 for AGENT POST /api/users, got {r.status_code} {r.text}"


# ----------------- Invalid role -----------------
def test_invalid_role_returns_400(super_admin_token):
    ts = _ts()
    payload = {"name": "TEST INVALID", "email": f"test_invalid_{ts}@example.com", "password": "Pass@1234", "role": "FOO"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(super_admin_token), json=payload, timeout=15)
    assert r.status_code == 400, r.text
    body_text = r.text
    assert "SUPER_ADMIN" in body_text and "ADMIN" in body_text and "AGENT" in body_text


# ----------------- GET /api/users?role=SUPER_ADMIN -----------------
def _extract_users(body):
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        u = body.get("users") or body.get("data") or body.get("items")
        if isinstance(u, list):
            return u
        if isinstance(u, dict):
            return u.get("users") or u.get("items") or []
    return []


def test_filter_users_by_super_admin_role(super_admin_token):
    r = requests.get(f"{BASE_URL}/api/users?role=SUPER_ADMIN", headers=_h(super_admin_token), timeout=15)
    assert r.status_code == 200, r.text
    users = _extract_users(r.json())
    assert isinstance(users, list)
    assert len(users) >= 1
    for u in users:
        assert u.get("role") == "SUPER_ADMIN"


# ----------------- PUT /api/users/:id : ADMIN target restrictions -----------------
@pytest.fixture(scope="module")
def admin_target_user(super_admin_token):
    """An ADMIN user used as a forbidden target for ADMIN actor edits."""
    ts = _ts()
    payload = {"name": "TEST TARGET ADM", "email": f"test_target_adm_{ts}@example.com", "password": "Pass@1234", "role": "ADMIN"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(super_admin_token), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    uid = user.get("id")
    CREATED_USER_IDS.append(uid)
    return uid


@pytest.fixture(scope="module")
def super_admin_target_user(super_admin_token):
    ts = _ts()
    payload = {"name": "TEST TARGET SA", "email": f"test_target_sa_{ts}@example.com", "password": "Pass@1234", "role": "SUPER_ADMIN"}
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(super_admin_token), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    uid = user.get("id")
    CREATED_USER_IDS.append(uid)
    return uid


def test_admin_cannot_edit_another_admin(admin_token, admin_target_user):
    r = requests.put(f"{BASE_URL}/api/users/{admin_target_user}", headers=_h(admin_token), json={"name": "Hacked"}, timeout=15)
    assert r.status_code == 403, r.text
    body = r.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "FORBIDDEN_TARGET", f"Expected FORBIDDEN_TARGET, got {body}"


def test_admin_cannot_edit_super_admin(admin_token, super_admin_target_user):
    r = requests.put(f"{BASE_URL}/api/users/{super_admin_target_user}", headers=_h(admin_token), json={"name": "Hacked"}, timeout=15)
    assert r.status_code == 403, r.text
    body = r.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "FORBIDDEN_TARGET", f"Expected FORBIDDEN_TARGET, got {body}"


# ----------------- PUT /api/users/:id : SUPER_ADMIN promote/demote -----------------
def test_super_admin_promotes_admin_to_super_admin(super_admin_token, admin_target_user):
    r = requests.put(f"{BASE_URL}/api/users/{admin_target_user}", headers=_h(super_admin_token), json={"role": "SUPER_ADMIN"}, timeout=15)
    assert r.status_code == 200, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    assert user.get("role") == "SUPER_ADMIN"


def test_super_admin_demotes_other_super_admin(super_admin_token, super_admin_target_user):
    # promote a fresh one to ensure >1 SA exists, then demote it
    r = requests.put(f"{BASE_URL}/api/users/{super_admin_target_user}", headers=_h(super_admin_token), json={"role": "ADMIN"}, timeout=15)
    assert r.status_code == 200, r.text
    user = r.json().get("user") or r.json().get("data") or r.json()
    assert user.get("role") == "ADMIN"


# ----------------- Safety guards on self -----------------
def test_super_admin_cannot_disable_self(super_admin_token):
    # Find self id
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_admin_token), timeout=15)
    user = r.json().get("user") or r.json().get("data") or r.json()
    self_id = user.get("id")
    r2 = requests.put(f"{BASE_URL}/api/users/{self_id}", headers=_h(super_admin_token), json={"isActive": False}, timeout=15)
    assert r2.status_code == 400, r2.text
    body = r2.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "CANNOT_DISABLE_SELF", f"Expected CANNOT_DISABLE_SELF, got {body}"


def test_cannot_demote_last_super_admin(super_admin_token):
    """Demote all other SUPER_ADMINs to ADMIN first, then attempt to demote the root SA."""
    # List all SUPER_ADMIN users
    r = requests.get(f"{BASE_URL}/api/users?role=SUPER_ADMIN", headers=_h(super_admin_token), timeout=15)
    users = _extract_users(r.json())
    # Find root SA
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_admin_token), timeout=15).json()
    me_user = me.get("user") or me.get("data") or me
    root_id = me_user.get("id")
    # Demote all others
    for u in users:
        if u.get("id") != root_id:
            requests.put(f"{BASE_URL}/api/users/{u['id']}", headers=_h(super_admin_token), json={"role": "ADMIN"}, timeout=15)
    # Now attempt self-demote
    r3 = requests.put(f"{BASE_URL}/api/users/{root_id}", headers=_h(super_admin_token), json={"role": "ADMIN"}, timeout=15)
    assert r3.status_code == 400, r3.text
    body = r3.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "LAST_SUPER_ADMIN", f"Expected LAST_SUPER_ADMIN, got {body}"


def test_cannot_disable_last_super_admin(super_admin_token):
    # Root SA is already the only SA at this point (from previous test)
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_admin_token), timeout=15).json()
    me_user = me.get("user") or me.get("data") or me
    root_id = me_user.get("id")
    # Self-disable hits CANNOT_DISABLE_SELF first per typical order, accept either guard
    r = requests.put(f"{BASE_URL}/api/users/{root_id}", headers=_h(super_admin_token), json={"isActive": False}, timeout=15)
    assert r.status_code == 400, r.text
    body = r.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code in ("CANNOT_DISABLE_SELF", "LAST_SUPER_ADMIN"), f"Expected guard code, got {body}"


# ----------------- ADMIN-gated endpoints accept SUPER_ADMIN -----------------
@pytest.mark.parametrize("path", [
    "/api/reports/leads",
    "/api/system/status",
    "/api/settings/tenant",
    "/api/leads/sample-template",
])
def test_admin_endpoints_accept_super_admin(super_admin_token, path):
    r = requests.get(f"{BASE_URL}{path}", headers=_h(super_admin_token), timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:300]}"


# ----------------- Regression: AGENT scoping on leads -----------------
def test_agent_sees_only_own_leads(agent_token):
    r = requests.get(f"{BASE_URL}/api/leads", headers=_h(agent_token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    leads = body.get("leads") or body.get("data") or body
    if isinstance(leads, dict):
        leads = leads.get("leads") or leads.get("items") or []
    # Fetch agent id
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(agent_token), timeout=15).json()
    me_user = me.get("user") or me.get("data") or me
    aid = me_user.get("id")
    for lead in leads:
        owner = lead.get("assignedAgentId") or lead.get("assignedToId") or lead.get("assignedTo") or lead.get("ownerId")
        if isinstance(owner, dict):
            owner = owner.get("id")
        assert owner == aid or lead.get("createdById") == aid, f"Lead {lead.get('id')} not owned by agent: {lead}"


# ----------------- Legacy guard: last ADMIN -----------------
def test_cannot_demote_or_disable_last_admin(super_admin_token):
    # Get all ADMIN users
    r = requests.get(f"{BASE_URL}/api/users?role=ADMIN", headers=_h(super_admin_token), timeout=15)
    users = _extract_users(r.json())
    active_admins = [u for u in users if u.get("isActive", True)]
    if len(active_admins) != 1:
        pytest.skip(f"Expected exactly 1 active ADMIN, found {len(active_admins)}; skipping last-ADMIN guard test")
    last_admin = active_admins[0]
    r2 = requests.put(f"{BASE_URL}/api/users/{last_admin['id']}", headers=_h(super_admin_token), json={"role": "AGENT"}, timeout=15)
    assert r2.status_code == 400, r2.text
    body = r2.json()
    code = body.get("code") or (body.get("error") or {}).get("code")
    assert code == "LAST_ADMIN", f"Expected LAST_ADMIN, got {body}"


# ----------------- Cleanup -----------------
def test_zz_cleanup(super_admin_token):
    """Disable all TEST_ users created during this run."""
    for uid in CREATED_USER_IDS:
        try:
            requests.put(f"{BASE_URL}/api/users/{uid}", headers=_h(super_admin_token), json={"isActive": False}, timeout=10)
        except Exception:
            pass
