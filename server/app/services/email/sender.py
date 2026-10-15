"""
Envoi des emails transactionnels.

Aucun prestataire n'est imposé (choix d'équipe, CDC App §10) : l'envoi passe
par SMTP, que proposent aussi bien la messagerie o2switch que Resend, Mailgun,
Brevo… Le choix se fait par configuration (EMAIL_BACKEND + SMTP_*), sans code.

- `disabled` (défaut) : aucun envoi ; les fonctions qui dépendent d'un email
  répondent 503 `email_unavailable` — jamais de faux « email envoyé ».
- `console`  : développement uniquement ; l'email est écrit dans le journal
  (seul moyen de lire un code sans boîte mail). Refusé hors développement.
- `smtp`     : envoi réel.
"""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import settings
from app.services.email.templates import RenderedEmail

logger = logging.getLogger("siren.email")


class EmailUnavailable(Exception):
    """Aucun canal email configuré."""


class EmailDeliveryFailed(Exception):
    """Le serveur SMTP a refusé ou n'a pas répondu."""


def mask_email(address: str) -> str:
    local, _, domain = address.partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


def email_backend() -> str:
    backend = settings.EMAIL_BACKEND
    if backend == "console" and settings.ENVIRONMENT != "development":
        return "disabled"
    if backend == "smtp" and not (settings.SMTP_HOST and settings.EMAIL_FROM):
        return "disabled"
    return backend if backend in ("console", "smtp") else "disabled"


def email_available() -> bool:
    return email_backend() != "disabled"


def _build_message(to: str, email: RenderedEmail) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = email.subject
    message["From"] = formataddr((settings.EMAIL_FROM_NAME, settings.EMAIL_FROM))
    message["To"] = to
    message["Message-ID"] = make_msgid(domain=settings.EMAIL_FROM.partition("@")[2] or None)
    if settings.EMAIL_REPLY_TO:
        message["Reply-To"] = settings.EMAIL_REPLY_TO
    message["X-SIREN-Template"] = f"{email.template}@{email.version}/{email.language}"
    message.set_content(email.text)
    message.add_alternative(email.html, subtype="html")
    return message


def _send_smtp(message: EmailMessage) -> None:
    context = ssl.create_default_context()
    if settings.SMTP_USE_SSL:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_S, context=context)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_S)
    with server:
        if not settings.SMTP_USE_SSL and settings.SMTP_STARTTLS:
            server.starttls(context=context)
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)


async def send_email(to: str, email: RenderedEmail) -> None:
    """Envoie ou lève EmailUnavailable / EmailDeliveryFailed. Ne journalise jamais le contenu en production."""
    backend = email_backend()
    if backend == "disabled":
        raise EmailUnavailable()
    if backend == "console":
        logger.info("[EMAIL DEV] à %s — %s\n%s", mask_email(to), email.subject, email.text)
        return
    message = _build_message(to, email)
    try:
        await asyncio.to_thread(_send_smtp, message)
    except (smtplib.SMTPException, OSError) as error:
        logger.warning("Échec d'envoi %s à %s : %s", email.template, mask_email(to), type(error).__name__)
        raise EmailDeliveryFailed() from error
    logger.info("Email %s envoyé à %s", email.template, mask_email(to))
