"""
Erreurs métier structurées (contrat v1, docs/contrats/api-app-serveur-v1.md §Erreurs).

    HTTP 4xx  {"detail": {"code": "<motif>", "message": "<texte FR de diagnostic>", "params": {...}}}

`code` est stable et documenté : l'application affiche SA traduction du motif
(FR/EN) et n'affiche jamais `message`, destiné aux journaux et aux développeurs.
"""
from typing import Any, Optional

from fastapi import HTTPException


def api_error(status_code: int, code: str, message: str, params: Optional[dict[str, Any]] = None) -> HTTPException:
    detail: dict[str, Any] = {"code": code, "message": message}
    if params:
        detail["params"] = params
    return HTTPException(status_code=status_code, detail=detail)
