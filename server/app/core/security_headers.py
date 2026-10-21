"""
En-têtes de sécurité HTTP posés par l'API elle-même (défense en profondeur :
Caddy les pose aussi, mais l'API peut être servie sans lui, ex. o2switch).
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

# L'API ne sert que du JSON : rien ne doit être chargé ni encadré.
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# Documentation interactive (développement uniquement) : scripts/styles du CDN de Swagger UI.
DOCS_CSP = (
    "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; frame-ancestors 'none'"
)


def security_headers(path: str) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Content-Security-Policy": DOCS_CSP if path.startswith(("/docs", "/redoc")) else API_CSP,
    }
    if path.startswith("/api/"):
        # Données personnelles : jamais en cache intermédiaire.
        headers["Cache-Control"] = "no-store"
    if settings.ENVIRONMENT != "development":
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for name, value in security_headers(request.url.path).items():
            response.headers.setdefault(name, value)
        return response
