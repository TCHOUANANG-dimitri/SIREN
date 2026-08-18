"""
Service de notifications push (FCM / APNs).
"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.push_token import PushToken
from app.models.alert import Alert
from app.core.config import settings


async def send_push_notification(
    db: AsyncSession,
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    result = await db.execute(
        select(PushToken).where(PushToken.user_id == user_id)
    )
    tokens = result.scalars().all()

    for token in tokens:
        try:
            if token.platform == "fcm":
                await _send_fcm(token.token, title, body, data)
            elif token.platform == "apns":
                await _send_apns(token.token, title, body, data)
        except Exception as e:
            print(f"Push failed for token {token.id}: {e}")


async def send_alert_push(db: AsyncSession, alert: Alert, child_name: str) -> None:
    from app.crud.child import crud_child
    child = await crud_child.get(db, alert.child_id)
    if not child:
        return

    title = f"SIREN - {child_name}"
    body = f"Alerte {alert.level} - Score: {alert.score}"
    data = {
        "alert_id": alert.id,
        "child_id": alert.child_id,
        "level": alert.level,
        "score": str(alert.score),
    }

    await send_push_notification(db, child.parent_id, title, body, data)

    from app.crud.sharing import crud_share
    shares = await crud_share.list_by_child(db, child.id)
    for share in shares:
        if share.status == "actif":
            await send_push_notification(db, share.user_id, title, body, data)


async def _send_fcm(token: str, title: str, body: str, data: Optional[dict] = None) -> None:
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging

        if not firebase_admin._apps.get("siren"):
            cred = credentials.Certificate(settings.FCM_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred, name="siren")

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=data,
            token=token,
        )
        messaging.send(message, app=firebase_admin.get_app("siren"))
    except Exception as e:
        print(f"FCM send error: {e}")


async def _send_apns(token: str, title: str, body: str, data: Optional[dict] = None) -> None:
    pass
