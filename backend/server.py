"""
FastAPI reverse proxy that forwards all requests to the Node.js Express backend.
The Node.js backend runs on port 8002; this proxy runs on port 8001 (supervisor-managed).
"""
import asyncio
import httpx
from fastapi import FastAPI, Request, Response

app = FastAPI(title="Real Estate CRM Proxy", docs_url=None, redoc_url=None)

NODE_BACKEND = "http://localhost:8002/api"
RETRY_ATTEMPTS = 10
RETRY_DELAY = 1.5  # seconds between retries

SKIP_HEADERS = {"host", "content-length", "transfer-encoding"}


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
)
async def proxy(request: Request, path: str) -> Response:
    url = f"{NODE_BACKEND}/{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in SKIP_HEADERS}
    body = await request.body()

    for attempt in range(RETRY_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method=request.method,
                    url=url,
                    headers=headers,
                    content=body,
                    params=request.query_params,
                    follow_redirects=False,
                )
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    headers=dict(resp.headers),
                    media_type=resp.headers.get("content-type", "application/json"),
                )
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError):
            if attempt < RETRY_ATTEMPTS - 1:
                await asyncio.sleep(RETRY_DELAY)
            else:
                return Response(
                    content=b'{"error":"Backend service is starting up. Please retry."}',
                    status_code=503,
                    media_type="application/json",
                )
    return Response(content=b'{"error":"Unexpected proxy error"}', status_code=500)
