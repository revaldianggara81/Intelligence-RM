"""
Shared ASGI middleware for PAF compatibility with FastMCP's
streamable-http transport.
"""


class EnsureJSONContentTypeMiddleware:
    """Some MCP clients (e.g. PAF) POST JSON-RPC bodies without a
    Content-Type header, and/or without an Accept header that includes
    both application/json and text/event-stream. The streamable-http
    transport rejects those with 400 'Missing Content-Type header in
    POST request' / 406 'Not Acceptable'. Patch both headers when
    missing/incomplete so such clients can connect.

    PAF also sends an empty-body POST /mcp as a connectivity probe before
    the real MCP handshake. The streamable-http transport tries to parse
    that as JSON and fails with -32700 Parse error -> 400, which PAF
    treats as "disconnected". Short-circuit empty-body POSTs with a plain
    200 OK so the probe succeeds; real (non-empty) JSON-RPC requests pass
    through unchanged."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return

        headers = [(k, v) for k, v in scope.get("headers", [])
                   if k.lower() not in (b"content-type", b"accept")]
        orig_headers = dict(scope.get("headers", []))

        content_type = orig_headers.get(b"content-type") or b"application/json"
        headers.append((b"content-type", content_type))

        accept = orig_headers.get(b"accept", b"").decode()
        accept_types = [t.strip() for t in accept.split(",") if t.strip()]
        if "application/json" not in accept_types or "text/event-stream" not in accept_types:
            accept = "application/json, text/event-stream"
        headers.append((b"accept", accept.encode()))

        scope["headers"] = headers

        # Buffer the body to detect empty-body connectivity probes.
        body_chunks = []
        more_body = True
        while more_body:
            message = await receive()
            body_chunks.append(message.get("body", b""))
            more_body = message.get("more_body", False)
        body = b"".join(body_chunks)

        if not body:
            await send({"type": "http.response.start", "status": 200,
                         "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": b"{}"})
            return

        replayed = False

        async def receive_wrapper():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, receive_wrapper, send)
