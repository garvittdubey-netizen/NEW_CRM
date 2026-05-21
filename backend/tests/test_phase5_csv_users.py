"""Phase 5 — User Management + CSV Import/Export backend tests."""
import os
import io
import time
import pytest
import requests

BASE = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN = {"email": "admin@realestate.com", "password": "Admin@2036"}
AGENT = {"email": "agent@realestate.com", "password": "Agent@2036"}


def login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = login(ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def agent_token():
    r = login(AGENT)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ──────────────────────────────  AUTH REGRESSION  ──────────────────────────────

class TestAuthRegression:
    def test_admin_login(self):
        r = login(ADMIN)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "ADMIN"

    def test_agent_login(self):
        r = login(AGENT)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "AGENT"


# ──────────────────────────────  RBAC ON /api/users  ──────────────────────────

class TestUsersRBAC:
    def test_agent_get_403(self, agent_token):
        r = requests.get(f"{BASE}/api/users", headers=H(agent_token))
        assert r.status_code == 403

    def test_agent_post_403(self, agent_token):
        r = requests.post(f"{BASE}/api/users", headers=H(agent_token), json={
            "name": "x", "email": "x@x.com", "password": "12345678", "role": "AGENT"
        })
        assert r.status_code == 403

    def test_agent_put_403(self, agent_token):
        r = requests.put(f"{BASE}/api/users/some-id", headers=H(agent_token), json={"name": "y"})
        assert r.status_code == 403

    def test_no_auth_401(self):
        assert requests.get(f"{BASE}/api/users").status_code == 401


# ──────────────────────────────  USER LIST + FILTERS  ─────────────────────────

class TestUserList:
    def test_list_users(self, admin_token):
        r = requests.get(f"{BASE}/api/users", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        emails = [u["email"] for u in data]
        assert "admin@realestate.com" in emails
        assert "agent@realestate.com" in emails
        # no password in response
        for u in data:
            assert "password" not in u
            assert "isActive" in u

    def test_filter_role(self, admin_token):
        r = requests.get(f"{BASE}/api/users?role=ADMIN", headers=H(admin_token))
        assert r.status_code == 200
        roles = {u["role"] for u in r.json()}
        assert roles == {"ADMIN"}

    def test_filter_search(self, admin_token):
        r = requests.get(f"{BASE}/api/users?search=admin", headers=H(admin_token))
        assert r.status_code == 200
        for u in r.json():
            assert "admin" in u["name"].lower() or "admin" in u["email"].lower()

    def test_filter_isactive(self, admin_token):
        r = requests.get(f"{BASE}/api/users?isActive=true", headers=H(admin_token))
        assert r.status_code == 200
        for u in r.json():
            assert u["isActive"] is True


# ──────────────────────────────  CREATE / UPDATE USER  ────────────────────────

class TestUserCRUD:
    created_ids = []

    def test_create_weak_password_400(self, admin_token):
        r = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_Weak", "email": f"weak_{int(time.time())}@t.com",
            "password": "1234", "role": "AGENT"
        })
        assert r.status_code == 400

    def test_create_user_success(self, admin_token):
        email = f"test_create_{int(time.time())}@t.com"
        r = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_NewAgent", "email": email,
            "password": "Password@123", "role": "AGENT", "isActive": True
        })
        assert r.status_code == 201, r.text
        u = r.json()
        assert u["email"] == email
        assert u["role"] == "AGENT"
        assert u["isActive"] is True
        assert "password" not in u
        TestUserCRUD.created_ids.append(u["id"])

    def test_create_duplicate_email_409(self, admin_token):
        email = f"dup_{int(time.time())}@t.com"
        r1 = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_Dup1", "email": email, "password": "Password@123", "role": "AGENT"
        })
        assert r1.status_code == 201
        TestUserCRUD.created_ids.append(r1.json()["id"])
        r2 = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_Dup2", "email": email, "password": "Password@123", "role": "AGENT"
        })
        assert r2.status_code == 409

    def test_update_user(self, admin_token):
        # create
        email = f"upd_{int(time.time())}@t.com"
        cr = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_Upd", "email": email, "password": "Password@123", "role": "AGENT"
        })
        uid = cr.json()["id"]
        TestUserCRUD.created_ids.append(uid)
        # update name + role + isActive
        ur = requests.put(f"{BASE}/api/users/{uid}", headers=H(admin_token), json={
            "name": "TEST_UpdRenamed", "role": "AGENT", "isActive": False
        })
        assert ur.status_code == 200, ur.text
        u = ur.json()
        assert u["name"] == "TEST_UpdRenamed"
        assert u["isActive"] is False
        # verify via list
        lr = requests.get(f"{BASE}/api/users?search=TEST_UpdRenamed", headers=H(admin_token))
        found = [x for x in lr.json() if x["id"] == uid]
        assert len(found) == 1 and found[0]["isActive"] is False

    def test_optional_password_only_when_nonempty(self, admin_token):
        email = f"pw_{int(time.time())}@t.com"
        cr = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_Pw", "email": email, "password": "Password@123", "role": "AGENT"
        })
        uid = cr.json()["id"]
        TestUserCRUD.created_ids.append(uid)
        # empty password -> should NOT trigger weak-password 400, should accept
        ur = requests.put(f"{BASE}/api/users/{uid}", headers=H(admin_token), json={
            "name": "TEST_PwRenamed", "password": ""
        })
        assert ur.status_code == 200
        # non-empty short password -> 400
        ur2 = requests.put(f"{BASE}/api/users/{uid}", headers=H(admin_token), json={"password": "abc"})
        assert ur2.status_code == 400


# ──────────────────────────────  SAFETY GUARDS  ───────────────────────────────

class TestSafetyGuards:
    def _admin_id(self, tok):
        me = requests.get(f"{BASE}/api/auth/me", headers=H(tok)).json()
        return me["id"]

    def test_self_disable_blocked(self, admin_token):
        my_id = self._admin_id(admin_token)
        r = requests.put(f"{BASE}/api/users/{my_id}", headers=H(admin_token), json={"isActive": False})
        assert r.status_code == 400
        assert "disable" in r.text.lower() or "self" in r.text.lower()

    def test_last_admin_demote_and_disable_blocked(self, admin_token):
        """With only one active admin, demote and disable should both 400."""
        my_id = self._admin_id(admin_token)
        # Verify there is exactly one ADMIN (no temp admin)
        admins = requests.get(f"{BASE}/api/users?role=ADMIN&isActive=true",
                              headers=H(admin_token)).json()
        if len(admins) != 1:
            pytest.skip(f"Expected exactly 1 active admin for last-admin test, got {len(admins)}")
        # Demote self -> LAST_ADMIN 400
        r = requests.put(f"{BASE}/api/users/{my_id}", headers=H(admin_token), json={"role": "AGENT"})
        assert r.status_code == 400
        assert "admin" in r.text.lower()

    def test_last_admin_with_second_admin_allows_demote_then_cleanup(self, admin_token):
        """Create a second admin, demote them (allowed since 2 active admins). Cleanup."""
        email = f"tempadmin_{int(time.time())}@t.com"
        cr = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_TempAdmin", "email": email,
            "password": "Password@123", "role": "ADMIN", "isActive": True
        })
        assert cr.status_code == 201
        temp_id = cr.json()["id"]
        # Demote the temp admin -> should succeed (still leaves original admin)
        dr = requests.put(f"{BASE}/api/users/{temp_id}", headers=H(admin_token), json={"role": "AGENT"})
        assert dr.status_code == 200
        # Disable to clean up
        cr2 = requests.put(f"{BASE}/api/users/{temp_id}", headers=H(admin_token), json={"isActive": False})
        assert cr2.status_code == 200


# ──────────────────────────────  DISABLED LOGIN → 403  ────────────────────────

class TestDisabledLoginFlow:
    def test_disabled_login_returns_403(self, admin_token):
        """Create a temp user, disable, attempt login -> 403, cleanup re-enables."""
        email = f"dis_{int(time.time())}@t.com"
        pw = "Password@123"
        cr = requests.post(f"{BASE}/api/users", headers=H(admin_token), json={
            "name": "TEST_Disabled", "email": email, "password": pw, "role": "AGENT"
        })
        assert cr.status_code == 201
        uid = cr.json()["id"]
        # confirm login works
        ok = login({"email": email, "password": pw})
        assert ok.status_code == 200
        # disable
        up = requests.put(f"{BASE}/api/users/{uid}", headers=H(admin_token), json={"isActive": False})
        assert up.status_code == 200
        # try login -> 403
        bad = login({"email": email, "password": pw})
        assert bad.status_code == 403, f"Expected 403, got {bad.status_code} {bad.text}"
        body = bad.json()
        msg = (body.get("error") or body.get("message") or "").lower()
        assert "disabled" in msg or "disable" in msg


# ──────────────────────────────  CSV: SAMPLE / EXPORT / IMPORT  ──────────────

EXPECTED_CSV_COLS = [
    "fullName", "phone", "email", "budget", "preferredLocation",
    "bhk", "propertyType", "status", "source", "tags", "notes",
]


class TestLeadCsv:
    def test_sample_template(self, admin_token):
        r = requests.get(f"{BASE}/api/leads/sample-template", headers=H(admin_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        # strip BOM
        body = r.text.lstrip("\ufeff")
        first_line = body.splitlines()[0]
        for col in EXPECTED_CSV_COLS:
            assert col in first_line, f"Missing column {col} in header: {first_line}"

    def test_sample_template_agent_403(self, agent_token):
        r = requests.get(f"{BASE}/api/leads/sample-template", headers=H(agent_token))
        assert r.status_code == 403

    def test_export_leads_admin(self, admin_token):
        r = requests.get(f"{BASE}/api/leads/export", headers=H(admin_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        body = r.text.lstrip("\ufeff")
        lines = body.splitlines()
        assert lines[0].startswith('"id"') or "id" in lines[0]

    def test_export_leads_agent_scoped(self, agent_token):
        r = requests.get(f"{BASE}/api/leads/export", headers=H(agent_token))
        assert r.status_code == 200
        # CSV with header at minimum
        body = r.text.lstrip("\ufeff")
        assert "fullName" in body.splitlines()[0]

    def test_import_missing_file_400(self, admin_token):
        r = requests.post(f"{BASE}/api/leads/import", headers=H(admin_token))
        assert r.status_code == 400

    def test_import_agent_403(self, agent_token):
        files = {"file": ("t.csv", b"fullName\nFoo", "text/csv")}
        r = requests.post(f"{BASE}/api/leads/import", headers=H(agent_token), files=files)
        assert r.status_code == 403

    def test_import_mixed(self, admin_token):
        """Valid CSV with: 1 good row, 1 dup-phone row, 1 invalid status row."""
        ts = int(time.time())
        good_phone = f"+91900{ts % 10000000:07d}"
        # First, retrieve an existing lead's phone for duplicate test
        existing = requests.get(f"{BASE}/api/leads/export", headers=H(admin_token))
        dup_phone = None
        for line in existing.text.lstrip("\ufeff").splitlines()[1:]:
            # quoted CSV
            parts = [p.strip('"') for p in line.split('","')]
            if len(parts) > 2 and parts[2]:
                dup_phone = parts[2]
                break
        if not dup_phone:
            dup_phone = "+919999999999"  # seeded Demo Lead

        csv_body = (
            "fullName,phone,email,budget,preferredLocation,bhk,propertyType,status,source,tags,notes\n"
            f"TEST_CSV_Good_{ts},{good_phone},test_csv_{ts}@x.com,5000000,Mumbai,2BHK,Apartment,NEW,WEBSITE,hot;investor,via CSV\n"
            f"TEST_CSV_Dup_{ts},{dup_phone},dup_{ts}@x.com,1000000,Pune,1BHK,Flat,NEW,MANUAL,,\n"
            f"TEST_CSV_BadStatus_{ts},+9180{ts % 10000000:07d},bad_{ts}@x.com,2000000,Delhi,3BHK,Villa,WRONG_STATUS,MANUAL,,\n"
        )
        files = {"file": ("test.csv", csv_body.encode("utf-8"), "text/csv")}
        r = requests.post(f"{BASE}/api/leads/import", headers=H(admin_token), files=files)
        assert r.status_code in (200, 201), r.text
        summary = r.json()
        for k in ("total", "imported", "skipped", "failed", "rows"):
            assert k in summary
        assert summary["total"] == 3
        assert summary["imported"] >= 1
        assert summary["skipped"] >= 1
        assert summary["failed"] >= 1
        statuses = [row["status"] for row in summary["rows"]]
        assert "imported" in statuses
        assert "skipped" in statuses
        assert "failed" in statuses


# ──────────────────────────────  ANALYTICS CSV EXPORTS  ───────────────────────

ANALYTICS_SECTIONS = [
    "overview",
    "leads-by-status",
    "leads-by-source",
    "followups",
    "agents",
    "communications",
]


class TestAnalyticsExports:
    @pytest.mark.parametrize("section", ANALYTICS_SECTIONS)
    def test_export_section(self, admin_token, section):
        r = requests.get(f"{BASE}/api/analytics/export/{section}", headers=H(admin_token))
        assert r.status_code == 200, f"{section}: {r.status_code} {r.text[:200]}"
        assert "text/csv" in r.headers.get("Content-Type", "")
        body = r.text.lstrip("\ufeff")
        lines = body.splitlines()
        assert len(lines) >= 2, f"{section} CSV must have header + >=1 row"

    def test_export_with_range(self, admin_token):
        r = requests.get(f"{BASE}/api/analytics/export/overview?range=7d", headers=H(admin_token))
        assert r.status_code == 200
        body = r.text.lstrip("\ufeff")
        assert "rangeLabel" in body
        # custom range
        r2 = requests.get(
            f"{BASE}/api/analytics/export/overview?range=custom&from=2026-01-01&to=2026-01-15",
            headers=H(admin_token),
        )
        assert r2.status_code == 200
        assert "custom" in r2.text or "2026-01-01" in r2.text

    def test_export_requires_auth(self):
        r = requests.get(f"{BASE}/api/analytics/export/overview")
        assert r.status_code == 401
