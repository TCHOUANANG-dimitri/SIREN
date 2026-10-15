"""
Service de notifications push (FCM / APNs), multilingue.

Le texte est rédigé ICI, dans la langue du DESTINATAIRE (`users.langue`) : une
notification reçue application fermée est affichée par le système, l'app ne
peut pas la traduire. Le payload `data` porte en plus une description
structurée (type, clés de traduction, variables, lien) pour que l'app puisse
router et, si besoin, ré-afficher le message dans sa langue courante.

Catalogue : NOTIFICATIONS ci-dessous ; les mêmes textes existent côté app dans
src/i18n/locales/*/notifications.json (`notifications.push.*`), utilisés par le
backend simulé et pour l'affichage au premier plan. Un test vérifie que les
deux catalogues ont les mêmes types et les mêmes variables.
"""

import json
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.alert import Alert
from app.models.push_token import PushToken

logger = logging.getLogger("siren.push")

PAYLOAD_VERSION = "1"

# type → canal Android (créés par l'app, src/utils/notifications.ts) et priorité.
CHANNELS = {
    "urgence": "siren-urgence",
    "prealerte": "siren-prealerte",
    "low_battery": "siren-information",
    "share_invite": "siren-information",
}

NOTIFICATIONS: dict[str, dict[str, dict[str, str]]] = {
    "urgence": {
        "fr": {"title": "Urgence — {child}", "body": "Situation anormale détectée. Ouvrez SIREN immédiatement."},
        "en": {"title": "Emergency — {child}", "body": "Abnormal situation detected. Open SIREN now."},
    },
    "prealerte": {
        "fr": {"title": "Pré-alerte — {child}", "body": "Comportement inhabituel détecté. Vérifiez la situation."},
        "en": {"title": "Pre-alert — {child}", "body": "Unusual behaviour detected. Please check the situation."},
    },
    "low_battery": {
        "fr": {"title": "Batterie faible — {child}", "body": "Le dispositif de {child} doit être rechargé bientôt."},
        "en": {"title": "Low battery — {child}", "body": "{child}'s device needs charging soon."},
    },
    "share_invite": {
        "fr": {"title": "Nouvel accès partagé", "body": "{inviter} partage avec vous le suivi de {child}. Ouvrez SIREN pour répondre."},
        "en": {"title": "New shared access", "body": "{inviter} is sharing {child}'s monitoring with you. Open SIREN to respond."},
    },
}

# Droit nécessaire à un proche (secondaire) pour recevoir chaque type (matrice RBAC, CDC App §4.5).
# None = réservé au parent principal.
SECONDARY_PERMISSION = {"urgence": "alertes_urgence", "prealerte": "alertes_prealerte", "low_battery": None}


def build_notification(kind: str, language: Optional[str], variables: dict[str, str], extra: Optional[dict] = None) -> dict:
    """Titre, corps et payload data d'une notification, dans la langue demandée (fr par défaut)."""
    lang = language if language in ("fr", "en") else "fr"
    texts = NOTIFICATIONS[kind][lang]
    title = texts["title"].format(**variables)
    body = texts["body"].format(**variables)
    data = {
        "v": PAYLOAD_VERSION,
        "type": kind,
        "titleKey": f"notifications.push.{kind}.title",
        "bodyKey": f"notifications.push.{kind}.body",
        "vars": json.dumps(variables, ensure_ascii=False),
        "lang": lang,
        **{k: str(v) for k, v in (extra or {}).items() if v is not None},
    }
    return {"title": title, "body": body, "data": data, "channel": CHANNELS[kind]}


async def _tokens_for(db: AsyncSession, user_id: str) -> list[PushToken]:
    result = await db.execute(select(PushToken).where(PushToken.user_id == user_id))
    return list(result.scalars().all())


async def send_localized_push(db: AsyncSession, user, kind: str, variables: dict[str, str], extra: Optional[dict] = None) -> int:
    """Envoie une notification à tous les téléphones d'un utilisateur ; renvoie le nombre d'envois réussis."""
    message = build_notification(kind, getattr(user, "langue", None), variables, extra)
    sent = 0
    for token in await _tokens_for(db, user.id):
        try:
            if token.platform == "fcm":
                await _send_fcm(db, token, message)
                sent += 1
            elif token.platform == "apns":
                # APNs : non implémenté (pas de compte Apple, CDC App §10).
                logger.info("Push APNs non implémenté (jeton %s)", token.id)
        except Exception as e:
            logger.warning("Échec push %s (jeton %s) : %s", kind, token.id, type(e).__name__)
    return sent


async def _recipients(db: AsyncSession, child, kind: str) -> list:
    from app.crud.sharing import crud_share
    from app.crud.user import crud_user

    recipients = []
    parent = await crud_user.get(db, child.parent_id)
    if parent and parent.deleted_at is None:
        recipients.append(parent)
    permission = SECONDARY_PERMISSION.get(kind)
    if permission is None:
        return recipients
    for share in await crud_share.list_by_child(db, child.id):
        status = getattr(share.status, "value", share.status)
        if status == "actif" and permission in (share.permissions or []):
            user = await crud_user.get(db, share.user_id)
            if user and user.deleted_at is None:
                recipients.append(user)
    return recipients


async def send_alert_push(db: AsyncSession, alert: Alert, child_name: str) -> None:
    from app.crud.child import crud_child

    child = await crud_child.get(db, alert.child_id)
    if not child:
        return
    level = getattr(alert.level, "value", alert.level)
    kind = "urgence" if level == "urgence" else "prealerte"
    # Clés snake_case (v1) ET camelCase : l'app accepte les deux (parseNotificationData).
    extra = {
        "alert_id": alert.id,
        "child_id": alert.child_id,
        "alertId": alert.id,
        "childId": alert.child_id,
        "level": level,
        "score": str(alert.score),
    }
    for user in await _recipients(db, child, kind):
        await send_localized_push(db, user, kind, {"child": child_name}, extra)


async def send_low_battery_push(db: AsyncSession, child) -> None:
    for user in await _recipients(db, child, "low_battery"):
        await send_localized_push(db, user, "low_battery", {"child": child.prenom}, {"childId": child.id, "child_id": child.id})


async def _send_fcm(db: AsyncSession, token: PushToken, message: dict) -> None:
    import firebase_admin
    from firebase_admin import credentials, exceptions, messaging

    if not firebase_admin._apps.get("siren"):
        cred = credentials.Certificate(settings.FCM_CREDENTIALS_PATH)
        firebase_admin.initialize_app(cred, name="siren")

    urgent = message["channel"] == "siren-urgence"
    fcm_message = messaging.Message(
        notification=messaging.Notification(title=message["title"], body=message["body"]),
        data=message["data"],
        token=token.token,
        android=messaging.AndroidConfig(
            priority="high" if message["channel"] != "siren-information" else "normal",
            notification=messaging.AndroidNotification(
                channel_id=message["channel"],
                sound="default",
                # Regroupe les notifications d'un même enfant/type au lieu de les empiler.
                tag=f'{message["data"].get("type")}-{message["data"].get("childId", "")}',
                priority="max" if urgent else "default",
            ),
        ),
    )
    try:
        messaging.send(fcm_message, app=firebase_admin.get_app("siren"))
    except messaging.UnregisteredError:
        # Jeton expiré / application désinstallée : on le supprime pour ne plus l'utiliser.
        await db.delete(token)
        logger.info("Jeton push %s expiré, supprimé", token.id)
    except exceptions.FirebaseError as e:
        logger.warning("Erreur FCM : %s", type(e).__name__)
        raise
