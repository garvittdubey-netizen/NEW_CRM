"""
Backend tests for Phase 10.2 — Reports + Notifications.

Covers:
  - RBAC: every /api/reports/* is admin-200, agent-403
  - Shape validation for each of the 5 report JSON endpoints
  - Date-range filter on /leads and /deals (subset/equal vs unfiltered)
  - CSV exports: headers (text/csv, BOM, Content-Disposition), parseable
  - /api/notifications shape, sort order, RBAC scoping
"""
import csv
import io
import os
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://super-admin-roles-1.preview.your-domain.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
    j = r.json()
    token = j.get("token") or j.get("accessToken")
    assert token
    return token, j.get("user", {})


@pytest.fixture(scope="session")
def admin_session():
    token, user = _login(ADMIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, user


@pytest.fixture(scope="session")
def agent_session():
    token, user = _login(AGENT)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, user


REPORT_PATHS = [
    "/reports/leads", "/reports/leads/export",
    "/reports/properties", "/reports/properties/export",
    "/reports/clients", "/reports/clients/export",
    "/reports/deals", "/reports/deals/export",
    "/reports/agents", "/reports/agents/export",
]


# -------------------- RBAC --------------------
class TestReportsRBAC:
    @pytest.mark.parametrize("path", REPORT_PATHS)
    def test_admin_200(self, admin_session, path):
        s, _ = admin_session
        r = s.get(f"{API}{path}", timeout=20)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("path", REPORT_PATHS)
    def test_agent_403(self, agent_session, path):
        s, _ = agent_session
        r = s.get(f"{API}{path}", timeout=20)
        assert r.status_code == 403, f"{path}: {r.status_code} {r.text[:200]}"
        j = r.json()
        # Spec says { error: 'Insufficient permissions' }
        assert "error" in j or "message" in j


# -------------------- JSON shape --------------------
LEAD_STATUS_ORDER = ["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATING", "WON", "LOST"]
LEAD_SOURCE_ORDER = ["FACEBOOK", "WHATSAPP", "WEBSITE", "REFERRAL", "MANUAL",
                     "PROPERTY_PORTAL", "OTHER"]
PROPERTY_STATUS_ORDER = ["AVAILABLE", "RESERVED", "SOLD"]
DEAL_STATUS_ORDER = ["NEW", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_PENDING",
                     "WON", "LOST"]


class TestLeadReportShape:
    def test_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/reports/leads", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert set(j.keys()) >= {"total", "byStatus", "bySource", "won", "conversionRate"}
        assert isinstance(j["total"], int)
        assert [b["status"] for b in j["byStatus"]] == LEAD_STATUS_ORDER
        assert [b["source"] for b in j["bySource"]] == LEAD_SOURCE_ORDER
        # conversionRate calculation
        if j["total"] > 0:
            expected = round((j["won"] / j["total"]) * 100, 2)
            assert abs(j["conversionRate"] - expected) < 0.01
        else:
            assert j["conversionRate"] == 0
        assert 0 <= j["conversionRate"] <= 100


class TestPropertyReportShape:
    def test_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/reports/properties", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert set(j.keys()) >= {"total", "byStatus", "available", "sold"}
        assert [b["status"] for b in j["byStatus"]] == PROPERTY_STATUS_ORDER
        # consistency
        counts = {b["status"]: b["count"] for b in j["byStatus"]}
        assert counts["AVAILABLE"] == j["available"]
        assert counts["SOLD"] == j["sold"]


class TestClientReportShape:
    def test_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/reports/clients", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert set(j.keys()) >= {"total", "linked", "unlinked"}
        assert j["linked"] + j["unlinked"] == j["total"]


class TestDealReportShape:
    def test_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/reports/deals", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert set(j.keys()) >= {"total", "byStatus", "totalValue", "wonCount",
                                 "lostCount", "revenueTrend"}
        assert [b["status"] for b in j["byStatus"]] == DEAL_STATUS_ORDER
        for b in j["byStatus"]:
            assert "count" in b and "value" in b
        # revenueTrend month format YYYY-MM
        for t in j["revenueTrend"]:
            assert len(t["month"]) == 7 and t["month"][4] == "-"
            assert isinstance(t["revenue"], (int, float))
            assert isinstance(t["count"], int)


class TestAgentReportShape:
    def test_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/reports/agents", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "data" in j and isinstance(j["data"], list)
        if j["data"]:
            row = j["data"][0]
            for k in ("agentId", "agentName", "agentEmail", "dealsCount",
                      "wonDealsCount", "leadsCount", "leadConversion",
                      "followUpDone", "followUpTotal", "followUpRate"):
                assert k in row, f"missing {k}"


# -------------------- Date range filter --------------------
class TestDateRangeFilter:
    def test_leads_filter_subset(self, admin_session):
        s, _ = admin_session
        all_r = s.get(f"{API}/reports/leads", timeout=20).json()
        filt = s.get(f"{API}/reports/leads",
                     params={"from": "2026-05-01", "to": "2026-05-20"},
                     timeout=20).json()
        assert filt["total"] <= all_r["total"]

    def test_deals_filter_subset(self, admin_session):
        s, _ = admin_session
        all_r = s.get(f"{API}/reports/deals", timeout=20).json()
        filt = s.get(f"{API}/reports/deals",
                     params={"from": "2026-05-01", "to": "2026-05-20"},
                     timeout=20).json()
        assert filt["total"] <= all_r["total"]


# -------------------- CSV exports --------------------
CSV_PATHS = [
    "/reports/leads/export",
    "/reports/properties/export",
    "/reports/clients/export",
    "/reports/deals/export",
    "/reports/agents/export",
]


class TestCSVExports:
    @pytest.mark.parametrize("path", CSV_PATHS)
    def test_csv_headers_and_parse(self, admin_session, path):
        s, _ = admin_session
        r = s.get(f"{API}{path}", timeout=20)
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("Content-Type", "")
        assert "text/csv" in ct.lower(), f"bad Content-Type: {ct}"
        assert "charset=utf-8" in ct.lower()
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower(), f"bad Content-Disposition: {cd}"
        # UTF-8 BOM
        body = r.content
        assert body[:3] == b"\xef\xbb\xbf", "missing UTF-8 BOM"
        # Parse CSV (skip BOM)
        text = body.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) >= 2, f"expected header + data, got {len(rows)} rows"


# -------------------- Notifications --------------------
class TestNotifications:
    def test_admin_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/notifications", timeout=20)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)
        valid_kinds = {"FOLLOWUP", "DEAL_ACTIVITY", "LEAD_ASSIGNMENT"}
        for it in j["items"]:
            for k in ("id", "kind", "title", "description", "href", "createdAt"):
                assert k in it
            assert it["kind"] in valid_kinds
        # sorted newest first
        times = [it["createdAt"] for it in j["items"]]
        assert times == sorted(times, reverse=True)

    def test_agent_shape(self, agent_session):
        s, _ = agent_session
        r = s.get(f"{API}/notifications", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j

    def test_agent_scoped_subset(self, admin_session, agent_session):
        s_a, _ = admin_session
        s_g, _ = agent_session
        admin_items = s_a.get(f"{API}/notifications", timeout=20).json()["items"]
        agent_items = s_g.get(f"{API}/notifications", timeout=20).json()["items"]
        # Agent feed should not exceed admin feed in size for the same tenant
        # (admin sees everything; agent only own scope).
        assert len(agent_items) <= len(admin_items) + 1  # +1 tolerance, both capped per-kind

    def test_no_auth_401(self):
        r = requests.get(f"{API}/notifications", timeout=20)
        assert r.status_code in (401, 403)
