"""
Lecture des géométries PostGIS de type POINT, sans dépendance native.

`shapely` n'est pas installé sur o2switch mutualisé (requirements-o2switch.txt) :
ce module décode directement l'EWKB (renvoyé par la base) ou le WKT (objet
créé dans la requête courante), en évitant un aller-retour SQL par objet.
"""

import re
import struct
from typing import Optional, Tuple

_WKT_POINT = re.compile(r"POINT\s*\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)", re.IGNORECASE)
_SRID_FLAG = 0x20000000
_WKB_POINT = 1


def _from_wkb(raw: bytes) -> Optional[Tuple[float, float]]:
    if len(raw) < 21:
        return None
    endian = "<" if raw[0] == 1 else ">"
    (geom_type,) = struct.unpack(endian + "I", raw[1:5])
    offset = 5
    if geom_type & _SRID_FLAG:
        offset += 4
    if (geom_type & 0xFF) != _WKB_POINT or len(raw) < offset + 16:
        return None
    x, y = struct.unpack(endian + "dd", raw[offset : offset + 16])
    return y, x


def point_lat_lon(geom) -> Optional[Tuple[float, float]]:
    """(lat, lon) d'un POINT ; None si absent ou illisible."""
    if geom is None:
        return None
    data = getattr(geom, "data", geom)
    try:
        if isinstance(data, memoryview):
            data = data.tobytes()
        if isinstance(data, (bytes, bytearray)):
            return _from_wkb(bytes(data))
        if isinstance(data, str):
            text = data.split(";", 1)[-1]  # EWKT « SRID=4326;POINT(...) »
            match = _WKT_POINT.search(text)
            if match:
                lon, lat = float(match.group(1)), float(match.group(2))
                return lat, lon
            return _from_wkb(bytes.fromhex(text))
    except (ValueError, struct.error):
        return None
    return None
