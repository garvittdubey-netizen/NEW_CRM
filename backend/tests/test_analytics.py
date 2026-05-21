"""Backend tests for Dashboard Analytics module (/api/analytics/*)."""
import os
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")

ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}

EXPECTED_STATUSES = {"NEW", "CONTACTED", "QUALIFIED", "NEGOTIATING", "WON", "LOST"}
EXPECTED_SOURCES = {"FACEBOOK", "WHATSAPP", "WEBSITE", "REFERRAL", "MANUAL", "PROPERTY_PORTAL", "OTHER"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("accessToken") or body.get("data", {}).get("token")
    assert token, f"no token in login response: {body}"
    return token, body


@pytest.fixture(scope="session")
def admin_token():
    tok, _ = _login(ADMIN)
    return tok


@pytest.fixture(scope="session")
def agent_token():
    tok, _ = _login(AGENT)
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ── Auth regression ────────────────────────────────────────────────────────
class TestAuthRegression:
    def test_admin_login(self):
        tok, body = _login(ADMIN)
        assert tok
        u = body.get("user") or body.get("data", {}).get("user") or {}
        assert (u.get("role") or "").upper() == "ADMIN"

    def test_agent_login(self):
        tok, body = _login(AGENT)
        assert tok
        u = body.get("user") or body.get("data", {}).get("user") or {}
        assert (u.get("role") or "").upper() == "AGENT"


# ── Auth enforcement on analytics endpoints ────────────────────────────────
class TestAnalyticsAuth:
    ENDPOINTS = [
        "/api/analytics/overview",
        "/api/analytics/leads-by-status",
        "/api/analytics/leads-by-source",
        "/api/analytics/followups",
        "/api/analytics/agents",
        "/api/analytics/communications",
    ]

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_requires_jwt(self, path):
        r = requests.get(f"{BASE_URL}{path}", timeout=30)
        assert r.status_code == 401, f"{path} should require auth, got {r.status_code}"


# ── Overview ───────────────────────────────────────────────────────────────
class TestOverview:
    def test_overview_default_range_30d(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/overview", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("totalLeads", "wonLeads", "lostLeads", "conversionRate", "range"):
            assert k in d, f"missing {k}: {d}"
        assert d["range"]["label"] == "30d"
        assert isinstance(d["totalLeads"], int)
        assert isinstance(d["conversionRate"], (int, float))
        assert 0 <= d["conversionRate"] <= 100

    @pytest.mark.parametrize("rng", ["today", "7d", "30d"])
    def test_overview_named_ranges(self, admin_token, rng):
        r = requests.get(f"{BASE_URL}/api/analytics/overview?range={rng}", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["range"]["label"] == rng

    def test_overview_custom_range(self, admin_token):
        to = datetime.utcnow().date()
        frm = to - timedelta(days=14)
        url = f"{BASE_URL}/api/analytics/overview?range=custom&from={frm.isoformat()}&to={to.isoformat()}"
        r = requests.get(url, headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["range"]["label"] == "custom"
        assert d["range"]["from"].startswith(frm.isoformat())
        assert d["range"]["to"].startswith(to.isoformat())

    def test_overview_conversion_math(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/overview?range=30d", headers=_h(admin_token), timeout=30).json()
        if r["totalLeads"] > 0:
            expected = round(r["wonLeads"] / r["totalLeads"] * 100, 2)
            assert abs(r["conversionRate"] - expected) < 0.05


# ── Leads by status / source ──────────────────────────────────────────────
class TestLeadBuckets:
    def test_leads_by_status_all_buckets(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/leads-by-status", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        statuses = {row["status"] for row in data}
        assert statuses == EXPECTED_STATUSES, f"got {statuses}"
        for row in data:
            assert isinstance(row["count"], int) and row["count"] >= 0

    def test_leads_by_source_all_buckets(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/leads-by-source", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        sources = {row["source"] for row in data}
        assert sources == EXPECTED_SOURCES, f"got {sources}"
        for row in data:
            assert isinstance(row["count"], int) and row["count"] >= 0


# ── Follow-ups ────────────────────────────────────────────────────────────
class TestFollowUps:
    def test_followups_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/followups", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("byStatus", "total", "completed", "completionRate"):
            assert k in d
        statuses = {row["status"] for row in d["byStatus"]}
        assert {"PENDING", "COMPLETED", "MISSED"}.issubset(statuses)
        assert d["total"] == sum(row["count"] for row in d["byStatus"])
        if d["total"] > 0:
            expected = round(d["completed"] / d["total"] * 100, 2)
            assert abs(d["completionRate"] - expected) < 0.05
        else:
            assert d["completionRate"] == 0


# ── Agents (RBAC) ─────────────────────────────────────────────────────────
class TestAgentPerformance:
    def test_admin_sees_all_agents(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/agents", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert isinstance(data, list)
        # At minimum the seeded Test Agent should be present
        emails = [row.get("agentEmail") or "" for row in data]
        assert any("agent@realestate.com" in e for e in emails), f"agent missing: {emails}"
        for row in data:
            for k in ("agentId", "agentName", "assignedLeads", "contactedLeads", "wonLeads", "lostLeads", "conversionRate"):
                assert k in row, f"missing {k} in {row}"

    def test_agent_sees_only_self(self, agent_token):
        r = requests.get(f"{BASE_URL}/api/analytics/agents", headers=_h(agent_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert len(data) == 1, f"agent should see exactly one row, got {len(data)}: {data}"
        assert "agent@realestate.com" in (data[0].get("agentEmail") or "")


# ── Communications ────────────────────────────────────────────────────────
class TestCommunicationStats:
    def test_communications_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/communications", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("messagesSent", "messagesReceived", "callsLogged", "total"):
            assert k in d and isinstance(d[k], int)
        assert d["total"] == d["messagesSent"] + d["messagesReceived"] + d["callsLogged"]


# ── RBAC totals scoping (agent <= admin) ──────────────────────────────────
class TestRBACScoping:
    def test_agent_totals_le_admin(self, admin_token, agent_token):
        rng = "?range=30d"
        admin_ov = requests.get(f"{BASE_URL}/api/analytics/overview{rng}", headers=_h(admin_token), timeout=30).json()
        agent_ov = requests.get(f"{BASE_URL}/api/analytics/overview{rng}", headers=_h(agent_token), timeout=30).json()
        assert agent_ov["totalLeads"] <= admin_ov["totalLeads"]
        assert agent_ov["wonLeads"] <= admin_ov["wonLeads"]
        assert agent_ov["lostLeads"] <= admin_ov["lostLeads"]

        admin_fu = requests.get(f"{BASE_URL}/api/analytics/followups{rng}", headers=_h(admin_token), timeout=30).json()
        agent_fu = requests.get(f"{BASE_URL}/api/analytics/followups{rng}", headers=_h(agent_token), timeout=30).json()
        assert agent_fu["total"] <= admin_fu["total"]

        admin_co = requests.get(f"{BASE_URL}/api/analytics/communications{rng}", headers=_h(admin_token), timeout=30).json()
        agent_co = requests.get(f"{BASE_URL}/api/analytics/communications{rng}", headers=_h(agent_token), timeout=30).json()
        assert agent_co["total"] <= admin_co["total"]


# ── Lead.source persistence ───────────────────────────────────────────────
class TestLeadSourceField:
    def test_lead_create_with_source_persists(self, admin_token):
        # Use a random phone to avoid collisions
        ts = int(datetime.utcnow().timestamp())
        payload = {
            "fullName": f"TEST_AnalyticsLead_{ts}",
            "phone": f"+9199{ts % 100000000:08d}",
            "source": "FACEBOOK",
        }
        r = requests.post(f"{BASE_URL}/api/leads", headers=_h(admin_token), json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        lead = body.get("data") or body
        assert lead.get("source") == "FACEBOOK", f"expected source=FACEBOOK in response: {lead}"
        lead_id = lead.get("id")
        assert lead_id

        # GET back to verify persistence
        g = requests.get(f"{BASE_URL}/api/leads/{lead_id}", headers=_h(admin_token), timeout=30)
        assert g.status_code == 200, g.text
        gb = g.json()
        glead = gb.get("data") or gb
        assert glead.get("source") == "FACEBOOK"

    def test_lead_create_without_source_defaults_manual(self, admin_token):
        ts = int(datetime.utcnow().timestamp()) + 1
        payload = {
            "fullName": f"TEST_AnalyticsLead_default_{ts}",
            "phone": f"+9198{ts % 100000000:08d}",
        }
        r = requests.post(f"{BASE_URL}/api/leads", headers=_h(admin_token), json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        lead = body.get("data") or body
        assert lead.get("source") == "MANUAL", f"expected default MANUAL: {lead}"

    def test_existing_demo_lead_has_source(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/leads?search=Demo", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        body = r.json()
        leads = body.get("data") or body.get("leads") or body
        if isinstance(leads, dict):
            leads = leads.get("data") or []
        # All migrated leads should have a non-null source
        for lead in leads[:5]:
            assert lead.get("source"), f"lead missing source post-migration: {lead}"


# ── No-regression smoke for existing list endpoints ───────────────────────
class TestNoRegression:
    @pytest.mark.parametrize("path", ["/api/leads", "/api/followups", "/api/communications", "/api/activities"])
    def test_lists_still_load(self, admin_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
