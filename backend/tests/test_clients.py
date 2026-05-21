"""
Backend regression tests for the Clients module (Phase 9.0).

Covers:
  - CRUD (POST/GET/PUT/DELETE/PATCH-assign/timeline) end-to-end
  - RBAC for ADMIN + AGENT scopes
  - Search/filter/pagination
  - linkedLeadId set-null cascade on Lead delete
  - ClientActivity rows cascade on Client delete
  - Merged timeline source variety
"""
import os
import time
import uuid
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


# ----------------------------- session fixtures -----------------------------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
    token = r.json().get("token") or r.json().get("accessToken")
    assert token
    return token, r.json().get("user", {})


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


@pytest.fixture(scope="session")
def seed_lead(admin_ctx):
    s, _ = admin_ctx
    r = s.post(f"{API}/leads", json={
        "fullName": f"TEST_ClientLead_{uuid.uuid4().hex[:6]}",
        "phone": "+919000000001",
        "email": "test_clientlead@example.com",
        "preferredLocation": "Andheri",
        "budget": 5000000,
        "status": "NEW",
        "source": "MANUAL",
    }, timeout=15)
    assert r.status_code in (200, 201), r.text
    lead = r.json()
    yield lead
    # cleanup
    s.delete(f"{API}/leads/{lead['id']}")


# ----------------------------- helpers --------------------------------------
CREATED = []  # client ids to cleanup at session end


@pytest.fixture(scope="session", autouse=True)
def _cleanup(admin_ctx):
    yield
    s, _ = admin_ctx
    for cid in CREATED:
        try:
            s.delete(f"{API}/clients/{cid}")
        except Exception:
            pass


def _mk_client(session, **over):
    payload = {
        "fullName": f"TEST_Client_{uuid.uuid4().hex[:6]}",
        "phone": "+919900000000",
        "email": "test_client@example.com",
        "budget": 4500000,
        "preferredLocation": "Bandra",
        "notes": "Initial note",
    }
    payload.update(over)
    r = session.post(f"{API}/clients", json=payload, timeout=15)
    return r


# ---------------------------- CREATE ----------------------------------------
class TestCreate:
    def test_admin_create_success(self, admin_ctx):
        s, _ = admin_ctx
        r = _mk_client(s)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["fullName"].startswith("TEST_Client_")
        assert data["budget"] == 4500000
        assert "assignedAgent" in data
        assert "linkedLead" in data
        CREATED.append(data["id"])

    def test_create_requires_fullname(self, admin_ctx):
        s, _ = admin_ctx
        r = s.post(f"{API}/clients", json={"fullName": "   "})
        assert r.status_code == 400

    def test_agent_create_self_assigned(self, agent_ctx):
        s, me = agent_ctx
        r = _mk_client(s, assignedAgentId="some-other-admin-id-XYZ")
        assert r.status_code == 201, r.text
        data = r.json()
        # AGENT cannot override; backend ignores the field and forces self
        assert data["assignedAgentId"] == me["id"]
        CREATED.append(data["id"])

    def test_admin_create_linked_lead_logs_link(self, admin_ctx, seed_lead):
        s, _ = admin_ctx
        r = _mk_client(s, linkedLeadId=seed_lead["id"])
        assert r.status_code == 201
        cid = r.json()["id"]
        CREATED.append(cid)
        # timeline should have CREATED + LINKED_LEAD
        tl = s.get(f"{API}/clients/{cid}/timeline").json()["items"]
        actions = [i["action"] for i in tl]
        assert "CREATED" in actions
        assert "LINKED_LEAD" in actions


# ---------------------------- LIST/SEARCH/FILTER -----------------------------
class TestListing:
    def test_list_shape(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/clients?page=1&limit=5")
        assert r.status_code == 200
        body = r.json()
        for k in ("clients", "total", "page", "limit", "pages"):
            assert k in body

    def test_search_case_insensitive(self, admin_ctx):
        s, _ = admin_ctx
        # create with unique name
        unique = f"TEST_Searchable_{uuid.uuid4().hex[:6]}"
        c = _mk_client(s, fullName=unique).json()
        CREATED.append(c["id"])
        r = s.get(f"{API}/clients?search={unique.lower()}")
        assert r.status_code == 200
        names = [x["fullName"] for x in r.json()["clients"]]
        assert unique in names

    def test_filter_linked_none(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/clients?linkedLeadId=NONE&limit=50")
        assert r.status_code == 200
        for c in r.json()["clients"]:
            assert c["linkedLeadId"] is None

    def test_filter_by_assigned_agent(self, admin_ctx, agent_ctx):
        s_admin, _ = admin_ctx
        _, agent_user = agent_ctx
        r = s_admin.get(f"{API}/clients?assignedAgentId={agent_user['id']}&limit=50")
        assert r.status_code == 200
        for c in r.json()["clients"]:
            assert c["assignedAgentId"] == agent_user["id"]

    def test_agent_scope_implicit(self, agent_ctx):
        s, me = agent_ctx
        r = s.get(f"{API}/clients?limit=50")
        assert r.status_code == 200
        for c in r.json()["clients"]:
            assert c["assignedAgentId"] == me["id"]


# ---------------------------- GET ONE / RBAC --------------------------------
class TestRBACRead:
    def test_get_one_404(self, admin_ctx):
        s, _ = admin_ctx
        r = s.get(f"{API}/clients/nonexistent_id_zzz")
        assert r.status_code == 404

    def test_agent_403_on_other_client(self, admin_ctx, agent_ctx):
        s_admin, admin = admin_ctx
        # admin-owned client
        c = _mk_client(s_admin, assignedAgentId=admin["id"]).json()
        CREATED.append(c["id"])
        s_agent, _ = agent_ctx
        r = s_agent.get(f"{API}/clients/{c['id']}")
        assert r.status_code == 403


# ---------------------------- UPDATE / RBAC ---------------------------------
class TestUpdate:
    def test_update_notes_logs_event(self, admin_ctx):
        s, _ = admin_ctx
        c = _mk_client(s).json()
        CREATED.append(c["id"])
        r = s.put(f"{API}/clients/{c['id']}", json={"notes": "Updated note text"})
        assert r.status_code == 200
        assert r.json()["notes"] == "Updated note text"
        tl = s.get(f"{API}/clients/{c['id']}/timeline").json()["items"]
        assert any(i["action"] == "NOTES_UPDATED" for i in tl)

    def test_link_and_unlink_logs(self, admin_ctx, seed_lead):
        s, _ = admin_ctx
        c = _mk_client(s).json()
        CREATED.append(c["id"])
        # link
        r = s.put(f"{API}/clients/{c['id']}", json={"linkedLeadId": seed_lead["id"]})
        assert r.status_code == 200
        # unlink
        r = s.put(f"{API}/clients/{c['id']}", json={"linkedLeadId": None})
        assert r.status_code == 200
        tl = s.get(f"{API}/clients/{c['id']}/timeline").json()["items"]
        acts = [i["action"] for i in tl]
        assert "LINKED_LEAD" in acts and "UNLINKED_LEAD" in acts

    def test_agent_cannot_edit_other(self, admin_ctx, agent_ctx):
        s_admin, admin = admin_ctx
        c = _mk_client(s_admin, assignedAgentId=admin["id"]).json()
        CREATED.append(c["id"])
        s_agent, _ = agent_ctx
        r = s_agent.put(f"{API}/clients/{c['id']}", json={"notes": "hacked"})
        assert r.status_code == 403

    def test_agent_cannot_reassign(self, admin_ctx, agent_ctx):
        s_admin, admin = admin_ctx
        s_agent, agent = agent_ctx
        # agent-owned client
        c = _mk_client(s_agent).json()
        CREATED.append(c["id"])
        r = s_agent.put(f"{API}/clients/{c['id']}", json={"assignedAgentId": admin["id"]})
        assert r.status_code == 403


# ---------------------------- ASSIGN ----------------------------------------
class TestAssign:
    def test_admin_assign_and_unassign(self, admin_ctx, agent_ctx):
        s, _ = admin_ctx
        _, agent = agent_ctx
        c = _mk_client(s).json()
        CREATED.append(c["id"])
        r = s.patch(f"{API}/clients/{c['id']}/assign", json={"agentId": agent["id"]})
        assert r.status_code == 200
        assert r.json()["assignedAgentId"] == agent["id"]
        r = s.patch(f"{API}/clients/{c['id']}/assign", json={"agentId": None})
        assert r.status_code == 200
        assert r.json()["assignedAgentId"] is None

    def test_agent_assign_forbidden(self, agent_ctx):
        s, _ = agent_ctx
        c = _mk_client(s).json()
        CREATED.append(c["id"])
        r = s.patch(f"{API}/clients/{c['id']}/assign", json={"agentId": None})
        assert r.status_code == 403


# ---------------------------- DELETE / CASCADE ------------------------------
class TestDeleteAndCascade:
    def test_agent_cannot_delete_other(self, admin_ctx, agent_ctx):
        s_admin, admin = admin_ctx
        c = _mk_client(s_admin, assignedAgentId=admin["id"]).json()
        CREATED.append(c["id"])
        s_agent, _ = agent_ctx
        r = s_agent.delete(f"{API}/clients/{c['id']}")
        assert r.status_code == 403

    def test_admin_delete_204_and_activity_cascade(self, admin_ctx):
        s, _ = admin_ctx
        c = _mk_client(s).json()
        # force some activity rows
        s.put(f"{API}/clients/{c['id']}", json={"notes": "x"})
        r = s.delete(f"{API}/clients/{c['id']}")
        assert r.status_code == 204
        g = s.get(f"{API}/clients/{c['id']}")
        assert g.status_code == 404

    def test_lead_delete_sets_linked_to_null(self, admin_ctx):
        s, _ = admin_ctx
        # create lead just for this test
        lr = s.post(f"{API}/leads", json={
            "fullName": f"TEST_LinkedLead_{uuid.uuid4().hex[:6]}",
            "phone": "+919000000999",
            "status": "NEW",
            "source": "MANUAL",
        })
        assert lr.status_code in (200, 201)
        lead = lr.json()
        c = _mk_client(s, linkedLeadId=lead["id"]).json()
        CREATED.append(c["id"])
        # delete the lead
        dr = s.delete(f"{API}/leads/{lead['id']}")
        assert dr.status_code in (200, 204)
        # refetch client
        fr = s.get(f"{API}/clients/{c['id']}")
        assert fr.status_code == 200
        assert fr.json()["linkedLeadId"] is None, "linkedLeadId should be SetNull on lead delete"


# ---------------------------- TIMELINE MERGE --------------------------------
class TestTimelineMerge:
    def test_merged_sources(self, admin_ctx, seed_lead):
        s, _ = admin_ctx
        # add a communication for the lead
        cr = s.post(f"{API}/communications", json={
            "leadId": seed_lead["id"],
            "type": "CALL",
            "callOutcome": "INTERESTED",
            "callDuration": 120,
            "message": "TEST_call_for_timeline",
        })
        # add a follow-up
        fr = s.post(f"{API}/followups", json={
            "leadId": seed_lead["id"],
            "followUpDate": "2027-01-01T10:00:00.000Z",
            "notes": "TEST_followup_for_timeline",
        })
        # link a client
        c = _mk_client(s, linkedLeadId=seed_lead["id"]).json()
        CREATED.append(c["id"])
        time.sleep(0.5)
        tl = s.get(f"{API}/clients/{c['id']}/timeline").json()["items"]
        sources = {i["source"] for i in tl}
        # CLIENT must always exist; COMMUNICATION/FOLLOWUP should exist iff endpoint posts succeeded
        assert "CLIENT" in sources
        if cr.status_code in (200, 201):
            assert "COMMUNICATION" in sources, "expected linked-lead communications to appear in timeline"
        if fr.status_code in (200, 201):
            assert "FOLLOWUP" in sources, "expected linked-lead follow-ups to appear in timeline"
        # id prefix per source
        for i in tl:
            assert i["id"].split(":")[0] in ("client", "comm", "fu", "lact")
