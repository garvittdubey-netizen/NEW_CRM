"""
Backend integration tests for the Communications & Activity module.

Covers spec items 1–9 from the review request:
  1. GET /api/communications (RBAC + pagination shape)
  2. GET /api/communications/conversations
  3. POST /api/communications/calls (CALL row + CALL_LOGGED activity)
  4. POST /api/communications/whatsapp/send (expired token surface)
  5. GET /api/communications/templates (expired token surface)
  6. GET /api/webhooks/whatsapp (verify token handshake)
  7. POST /api/webhooks/whatsapp (HMAC signature)
  8. GET /api/activities (RBAC scoping)
  9. AGENT cannot log a call against another agent's lead
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://super-admin-roles-1.preview.your-domain.com"
).rstrip("/")

ADMIN_EMAIL = "admin@realestate.com"
ADMIN_PASSWORD = "Admin@2036"
AGENT_EMAIL = "agent@realestate.com"
AGENT_PASSWORD = "Agent@2036"
APP_SECRET = "79eda8c2568d4b5005a2729b26698445"
VERIFY_TOKEN = "4a2b9f83c1e57d6a8b9c0e1f2a3b4c5d"


# ---------- shared fixtures ----------
@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def agent_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": AGENT_EMAIL, "password": AGENT_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"agent login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def agent_lead(admin_token: str, agent_token: str) -> dict:
    """Return the demo lead assigned to the agent (the seeded 'Demo Lead')."""
    r = requests.get(f"{BASE_URL}/api/leads?limit=200", headers=_h(agent_token), timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("leads") or r.json().get("items") or r.json().get("data") or []
    assert items, f"agent has no visible leads — response was {r.json()}"
    # Prefer Demo Lead if present
    for it in items:
        if (it.get("name") or "").lower() == "demo lead":
            return it
    return items[0]


@pytest.fixture(scope="session")
def admin_only_lead(admin_token: str, agent_token: str) -> dict | None:
    """Find a lead NOT assigned to the agent — used for negative RBAC tests."""
    a = requests.get(f"{BASE_URL}/api/leads?limit=200", headers=_h(admin_token), timeout=15).json()
    g = requests.get(f"{BASE_URL}/api/leads?limit=200", headers=_h(agent_token), timeout=15).json()
    admin_items = a.get("leads") or a.get("items") or a.get("data") or []
    agent_items = g.get("leads") or g.get("items") or g.get("data") or []
    agent_ids = {it["id"] for it in agent_items}
    for it in admin_items:
        if it["id"] not in agent_ids:
            return it
    # If admin sees no non-agent lead, create one
    payload = {
        "name": f"TEST_unassigned_{uuid.uuid4().hex[:6]}",
        "phone": f"+9112345{int(time.time()) % 100000:05d}",
        "source": "WEBSITE",
        "status": "NEW",
    }
    r = requests.post(f"{BASE_URL}/api/leads", headers=_h(admin_token), json=payload, timeout=15)
    if r.status_code in (200, 201):
        return r.json().get("lead") or r.json()
    return None


# ---------- #1 GET /api/communications ----------
class TestListCommunications:
    def test_admin_list_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/communications?page=1&limit=10", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("communications", "total", "page", "limit", "pages"):
            assert k in data, f"missing key {k} in response: {data}"
        assert isinstance(data["communications"], list)
        assert isinstance(data["total"], int)
        assert data["page"] == 1
        assert data["limit"] == 10

    def test_agent_only_sees_own_assigned(self, admin_token, agent_token):
        admin_r = requests.get(f"{BASE_URL}/api/communications?limit=200", headers=_h(admin_token), timeout=15)
        agent_r = requests.get(f"{BASE_URL}/api/communications?limit=200", headers=_h(agent_token), timeout=15)
        assert admin_r.status_code == 200
        assert agent_r.status_code == 200
        agent_total = agent_r.json()["total"]
        admin_total = admin_r.json()["total"]
        # Agent must NOT see more than admin
        assert agent_total <= admin_total

        # Cross-check: every communication agent sees must belong to a lead
        # that agent can see.
        leads = requests.get(f"{BASE_URL}/api/leads?limit=200", headers=_h(agent_token), timeout=15).json()
        items = leads.get("leads") or leads.get("items") or leads.get("data") or []
        agent_lead_ids = {it["id"] for it in items}
        for c in agent_r.json()["communications"]:
            assert c.get("leadId") in agent_lead_ids, f"agent saw foreign lead comm: {c}"


# ---------- #2 conversations ----------
class TestConversations:
    def test_admin_conversations(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/communications/conversations", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "conversations" in body and isinstance(body["conversations"], list)
        if body["conversations"]:
            sample = body["conversations"][0]
            # last-message preview key may be lastMessage / lastMessagePreview / preview
            keys = set(sample.keys())
            assert keys & {"lastMessage", "lastMessagePreview", "preview", "lastMessageText"}, (
                f"no last-message-preview field on conversation: {sample}"
            )


# ---------- #3 log call ----------
class TestLogCall:
    def test_log_call_creates_row_and_activity(self, agent_token, agent_lead):
        payload = {
            "leadId": agent_lead["id"],
            "callOutcome": "INTERESTED",
            "durationSec": 90,
            "notes": "TEST_pytest call log",
        }
        r = requests.post(
            f"{BASE_URL}/api/communications/calls",
            headers=_h(agent_token),
            json=payload,
            timeout=20,
        )
        assert r.status_code in (200, 201), f"log call failed: {r.status_code} {r.text}"
        body = r.json()
        comm = body.get("communication") or body
        assert (comm.get("channel") or comm.get("type")) in ("CALL", "call")
        assert comm.get("leadId") == agent_lead["id"]

        # Verify activity was emitted
        time.sleep(1)
        acts = requests.get(
            f"{BASE_URL}/api/activities?leadId={agent_lead['id']}&limit=20",
            headers=_h(agent_token),
            timeout=15,
        )
        assert acts.status_code == 200
        items = acts.json().get("activities") or acts.json().get("items") or []
        assert any((a.get("action") == "CALL_LOGGED") for a in items), (
            f"no CALL_LOGGED activity found in {items}"
        )

    def test_log_call_missing_required(self, agent_token, agent_lead):
        # missing callOutcome
        r = requests.post(
            f"{BASE_URL}/api/communications/calls",
            headers=_h(agent_token),
            json={"leadId": agent_lead["id"]},
            timeout=15,
        )
        assert r.status_code in (400, 422), r.text


# ---------- #4 send whatsapp with expired token ----------
class TestWhatsAppSend:
    def test_expired_token_surfaces_code_190(self, agent_token, agent_lead):
        # Capture comm count before to ensure no row is created
        before = requests.get(
            f"{BASE_URL}/api/communications?limit=1", headers=_h(agent_token), timeout=15
        ).json().get("total", 0)

        r = requests.post(
            f"{BASE_URL}/api/communications/whatsapp/send",
            headers=_h(agent_token),
            json={"leadId": agent_lead["id"], "message": "TEST_pytest probe — expired-token check"},
            timeout=30,
        )
        # After the upstream-401→502 remap, must be 502 (NOT 401) so the
        # frontend's global 401 interceptor does not log the user out.
        assert r.status_code == 502, f"expected 502, got {r.status_code}: {r.text}"
        body_text = r.text
        try:
            body_json = r.json()
            blob = json.dumps(body_json)
        except Exception:
            blob = body_text
        assert "190" in blob, f"Meta error code 190 not surfaced in body: {blob}"
        # Defense-in-depth: explicit assertion that the body carries code: 190
        try:
            body_json = r.json()
            # code may be at body.code or body.error.code depending on wrapper
            code_val = body_json.get("code") or (body_json.get("error") or {}).get("code")
            assert code_val == 190, f"expected code 190 in body, got: {body_json}"
        except (ValueError, AssertionError) as e:
            if isinstance(e, AssertionError):
                raise

        # No new communication row
        after = requests.get(
            f"{BASE_URL}/api/communications?limit=1", headers=_h(agent_token), timeout=15
        ).json().get("total", 0)
        assert after == before, f"a Communication row was persisted on failed send ({before} -> {after})"


# ---------- #5 list templates ----------
class TestTemplates:
    def test_templates_surface_meta_error(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/communications/templates", headers=_h(admin_token), timeout=30)
        # After upstream-401→502 remap, expired token must be 502 (NOT 401).
        assert r.status_code == 502, f"expected 502, got {r.status_code}: {r.text}"
        blob = r.text
        assert "190" in blob or "access token" in blob.lower(), (
            f"templates error did not surface 190 / access token: {blob}"
        )
        try:
            body_json = r.json()
            code_val = body_json.get("code") or (body_json.get("error") or {}).get("code")
            assert code_val == 190, f"expected code 190 in body, got: {body_json}"
        except ValueError:
            pass


# ---------- #6 webhook verification ----------
class TestWebhookVerify:
    def test_correct_token_echoes_challenge(self):
        r = requests.get(
            f"{BASE_URL}/api/webhooks/whatsapp",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": VERIFY_TOKEN,
                "hub.challenge": "pingpong",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.text.strip() == "pingpong"

    def test_wrong_token_403(self):
        r = requests.get(
            f"{BASE_URL}/api/webhooks/whatsapp",
            params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "x"},
            timeout=10,
        )
        assert r.status_code == 403


# ---------- #7 webhook HMAC ----------
class TestWebhookHMAC:
    PAYLOAD = {
        "object": "whatsapp_business_account",
        "entry": [{"changes": [{"field": "messages", "value": {}}]}],
    }

    def _body(self) -> bytes:
        return json.dumps(self.PAYLOAD).encode()

    def test_missing_signature_401(self):
        r = requests.post(
            f"{BASE_URL}/api/webhooks/whatsapp",
            data=self._body(),
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        assert r.status_code == 401, r.text

    def test_invalid_signature_401(self):
        r = requests.post(
            f"{BASE_URL}/api/webhooks/whatsapp",
            data=self._body(),
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=" + "00" * 32,
            },
            timeout=10,
        )
        assert r.status_code == 401, r.text

    def test_valid_signature_200(self):
        body = self._body()
        sig = hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/webhooks/whatsapp",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": f"sha256={sig}",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("received") is True


# ---------- #8 activities RBAC ----------
class TestActivities:
    def test_admin_can_list(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/activities?limit=20", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("activities") or body.get("items") or []
        assert isinstance(items, list)

    def test_agent_scoping(self, admin_token, agent_token):
        admin_r = requests.get(f"{BASE_URL}/api/activities?limit=500", headers=_h(admin_token), timeout=15).json()
        agent_r = requests.get(f"{BASE_URL}/api/activities?limit=500", headers=_h(agent_token), timeout=15).json()
        admin_items = admin_r.get("activities") or admin_r.get("items") or []
        agent_items = agent_r.get("activities") or agent_r.get("items") or []
        assert len(agent_items) <= len(admin_items)

        # Get agent's visible lead ids and own user id (decode from /api/auth/me-ish or login)
        leads = requests.get(f"{BASE_URL}/api/leads?limit=200", headers=_h(agent_token), timeout=15).json()
        items_l = leads.get("leads") or leads.get("items") or leads.get("data") or []
        agent_lead_ids = {it["id"] for it in items_l}

        for a in agent_items:
            user_match = (a.get("userId") and a.get("user", {}).get("email") == AGENT_EMAIL) or (
                a.get("user") and a["user"].get("email") == AGENT_EMAIL
            )
            lead_match = a.get("leadId") in agent_lead_ids
            assert user_match or lead_match or a.get("leadId") is None, (
                f"agent saw foreign activity: {a}"
            )


# ---------- #9 cross-agent call RBAC ----------
class TestCrossAgentCallForbidden:
    def test_agent_cannot_call_unassigned_lead(self, agent_token, admin_only_lead):
        if not admin_only_lead:
            pytest.skip("no admin-only lead available")
        r = requests.post(
            f"{BASE_URL}/api/communications/calls",
            headers=_h(agent_token),
            json={
                "leadId": admin_only_lead["id"],
                "callOutcome": "NO_ANSWER",
                "notes": "TEST_pytest_should_be_blocked",
            },
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        assert "assigned to you" in r.text.lower() or "forbidden" in r.text.lower() or "only communicate" in r.text.lower()
