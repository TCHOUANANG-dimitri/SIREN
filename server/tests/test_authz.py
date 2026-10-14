from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.core.authz import (
    ALL_PERMISSIONS,
    MAX_SECONDARIES_PER_CHILD,
    check_secondary_quota,
    resolve_access,
    sanitize_permissions,
)

child = NS(id="c1", parent_id="parent", deleted_at=None)
parent = NS(id="parent")
stranger = NS(id="stranger")
helper = NS(id="helper")


def share(status="actif", permissions=("etat_zone",), id_="s1"):
    return NS(id=id_, status=status, permissions=list(permissions))


def test_parent_has_every_right():
    access = resolve_access(child, parent, None)
    assert access.is_principal and access.permissions == ALL_PERMISSIONS


def test_stranger_gets_404_not_403():
    # 404 : on ne confirme pas l'existence de l'enfant à un tiers.
    with pytest.raises(HTTPException) as exc:
        resolve_access(child, stranger, None)
    assert exc.value.status_code == 404


def test_secondary_limited_to_granted_rights():
    access = resolve_access(child, helper, share(permissions=["etat_zone", "admin"]))
    assert access.permissions == frozenset({"etat_zone"})
    assert access.has("etat_zone") and not access.has("position_precise")
    with pytest.raises(HTTPException) as exc:
        access.require("position_precise")
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        access.require_principal()


@pytest.mark.parametrize("status", ["invite", "revoque"])
def test_pending_or_revoked_share_grants_nothing(status):
    with pytest.raises(HTTPException) as exc:
        resolve_access(child, helper, share(status=status))
    assert exc.value.status_code == 404


def test_deleted_child_is_not_found_even_for_parent():
    with pytest.raises(HTTPException):
        resolve_access(NS(id="c1", parent_id="parent", deleted_at="2026-01-01"), parent, None)


def test_secondary_quota_is_three_non_revoked():
    shares = [share(id_=f"s{i}") for i in range(MAX_SECONDARIES_PER_CHILD - 1)] + [share(status="revoque", id_="r")]
    check_secondary_quota(shares)  # 2 actifs + 1 révoqué : place disponible
    shares.append(share(status="invite", id_="s9"))
    with pytest.raises(HTTPException) as exc:
        check_secondary_quota(shares)
    assert exc.value.status_code == 409


def test_reactivation_does_not_count_itself():
    shares = [share(id_="a"), share(id_="b"), share(id_="c", status="revoque")]
    check_secondary_quota(shares, exclude_id="c")


def test_unknown_permissions_are_dropped():
    assert sanitize_permissions(["historique", "root", "historique"]) == ["historique"]
