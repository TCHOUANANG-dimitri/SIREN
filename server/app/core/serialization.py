"""
Utilitaires de conversion snake_case ↔ camelCase pour les réponses API.
Le frontend utilise camelCase, la DB utilise snake_case.
"""

import re
from typing import Any


def to_camel_case(s: str) -> str:
    parts = re.split(r'_+', s)
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])


def to_snake_case(s: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '_', s).lower()


def camelize(obj: Any) -> Any:
    """Convertit récursivement toutes les clés d'un dict de snake_case vers camelCase."""
    if isinstance(obj, dict):
        return {to_camel_case(k): camelize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [camelize(i) for i in obj]
    return obj


def camelize_keys(**kwargs) -> dict:
    """Convertit les clés du dict nommé de snake_case vers camelCase."""
    return camelize(kwargs)
