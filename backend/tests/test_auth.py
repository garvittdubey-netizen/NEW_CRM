"""Backend Auth API Tests - Real Estate CRM"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestHealth:
    """Health check endpoint"""

    def test_health_check(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'ok' or 'ok' in str(data).lower()
        print(f"Health check passed: {data}")


class TestAuthLogin:
    """Auth login tests"""

    def test_login_success(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@realestate.com",
            "password": "Admin@2036"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@realestate.com"
        assert data["user"]["role"] == "ADMIN"
        assert isinstance(data["token"], str) and len(data["token"]) > 0
        print(f"Login success: user={data['user']['name']}, role={data['user']['role']}")

    def test_login_wrong_password(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@realestate.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "error" in data
        print(f"Wrong password returns 401: {data}")

    def test_login_wrong_email(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "notexist@realestate.com",
            "password": "Admin@2036"
        })
        assert response.status_code == 401
        print("Wrong email returns 401")

    def test_login_missing_fields(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={})
        assert response.status_code == 400
        print("Missing fields returns 400")


class TestAuthMe:
    """Auth /me endpoint tests"""

    def get_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@realestate.com",
            "password": "Admin@2036"
        })
        assert response.status_code == 200
        return response.json()["token"]

    def test_me_with_valid_token(self):
        token = self.get_token()
        response = requests.get(f"{BASE_URL}/api/auth/me",
                                headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@realestate.com"
        assert data["role"] == "ADMIN"
        print(f"GET /me passed: {data}")

    def test_me_without_token(self):
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("No token returns 401")

    def test_me_with_invalid_token(self):
        response = requests.get(f"{BASE_URL}/api/auth/me",
                                headers={"Authorization": "Bearer invalidtoken123"})
        assert response.status_code == 401
        print("Invalid token returns 401")
