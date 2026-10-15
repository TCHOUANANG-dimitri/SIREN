"""
Emails transactionnels SIREN — catalogue centralisé, versionné et bilingue.

Chaque modèle existe en FR et en EN avec les MÊMES variables (vérifié par
tests/test_emails.py). La langue est celle du compte destinataire
(`users.langue`), jamais celle de l'expéditeur.

Règles :
- aucun secret inutile : un email ne contient ni mot de passe, ni jeton de
  session, ni position d'enfant ; seul le code à usage unique figure dans les
  emails de code, avec sa durée de validité ;
- chaque email de sécurité dit quoi faire si l'action n'est pas de vous ;
- terminologie alignée sur l'application (docs/I18N.md, glossaire).
"""
from dataclasses import dataclass
from html import escape
from string import Formatter

TEMPLATE_VERSION = "2026-09-30"

# Chaque entrée : sujet, préheader (aperçu dans la boîte de réception), titre,
# paragraphes, bloc mis en avant (code), note de sécurité.
CATALOG: dict[str, dict[str, dict[str, object]]] = {
    "signup_verify": {
        "fr": {
            "subject": "Votre code de confirmation SIREN : {code}",
            "preheader": "Confirmez votre adresse email pour finaliser votre compte.",
            "heading": "Confirmez votre adresse email",
            "paragraphs": [
                "Bonjour {name},",
                "Saisissez ce code dans l'application SIREN pour confirmer votre adresse email.",
            ],
            "highlight": "{code}",
            "note": "Ce code expire dans {minutes} minutes et ne peut servir qu'une fois. "
            "Si vous n'avez pas créé de compte SIREN, ignorez cet email.",
        },
        "en": {
            "subject": "Your SIREN confirmation code: {code}",
            "preheader": "Confirm your email address to finish setting up your account.",
            "heading": "Confirm your email address",
            "paragraphs": [
                "Hello {name},",
                "Enter this code in the SIREN app to confirm your email address.",
            ],
            "highlight": "{code}",
            "note": "This code expires in {minutes} minutes and can only be used once. "
            "If you did not create a SIREN account, you can ignore this email.",
        },
    },
    "login_2fa": {
        "fr": {
            "subject": "Code de connexion SIREN : {code}",
            "preheader": "Une connexion à votre compte demande une vérification.",
            "heading": "Code de connexion",
            "paragraphs": [
                "Bonjour {name},",
                "Une connexion à votre compte SIREN est en cours. Saisissez ce code pour la valider.",
            ],
            "highlight": "{code}",
            "note": "Ce code expire dans {minutes} minutes. Si vous n'êtes pas à l'origine de cette "
            "connexion, ne communiquez ce code à personne et changez votre mot de passe.",
        },
        "en": {
            "subject": "SIREN sign-in code: {code}",
            "preheader": "A sign-in to your account needs to be verified.",
            "heading": "Sign-in code",
            "paragraphs": [
                "Hello {name},",
                "Someone is signing in to your SIREN account. Enter this code to confirm it.",
            ],
            "highlight": "{code}",
            "note": "This code expires in {minutes} minutes. If this wasn't you, don't share this "
            "code with anyone and change your password.",
        },
    },
    "password_reset": {
        "fr": {
            "subject": "Réinitialisation de votre mot de passe SIREN",
            "preheader": "Votre code pour choisir un nouveau mot de passe.",
            "heading": "Réinitialiser votre mot de passe",
            "paragraphs": [
                "Bonjour {name},",
                "Vous avez demandé à réinitialiser votre mot de passe. Saisissez ce code dans "
                "l'application SIREN, puis choisissez un nouveau mot de passe.",
            ],
            "highlight": "{code}",
            "note": "Ce code expire dans {minutes} minutes. Si vous n'avez rien demandé, ignorez cet "
            "email : votre mot de passe actuel reste valable.",
        },
        "en": {
            "subject": "Reset your SIREN password",
            "preheader": "Your code to choose a new password.",
            "heading": "Reset your password",
            "paragraphs": [
                "Hello {name},",
                "You asked to reset your password. Enter this code in the SIREN app, then choose "
                "a new password.",
            ],
            "highlight": "{code}",
            "note": "This code expires in {minutes} minutes. If you didn't ask for this, ignore this "
            "email: your current password still works.",
        },
    },
    "share_granted": {
        "fr": {
            "subject": "{inviter} partage avec vous le suivi de {child} sur SIREN",
            "preheader": "Ouvrez l'application SIREN pour accepter.",
            "heading": "Nouvel accès partagé",
            "paragraphs": [
                "Bonjour {name},",
                "{inviter} vous a ajouté comme proche de confiance pour {child} sur SIREN.",
                "Ouvrez l'application SIREN, onglet Partage, pour accepter ou refuser. "
                "Vous ne verrez que les informations que {inviter} a choisi de partager.",
            ],
            "highlight": "",
            "note": "Si vous ne connaissez pas {inviter}, n'acceptez pas l'invitation.",
        },
        "en": {
            "subject": "{inviter} is sharing {child}'s monitoring with you on SIREN",
            "preheader": "Open the SIREN app to accept.",
            "heading": "New shared access",
            "paragraphs": [
                "Hello {name},",
                "{inviter} added you as a trusted contact for {child} on SIREN.",
                "Open the SIREN app, Sharing tab, to accept or decline. You will only see "
                "the information {inviter} chose to share.",
            ],
            "highlight": "",
            "note": "If you don't know {inviter}, don't accept the invitation.",
        },
    },
    "password_changed": {
        "fr": {
            "subject": "Votre mot de passe SIREN a été modifié",
            "preheader": "Alerte de sécurité sur votre compte.",
            "heading": "Mot de passe modifié",
            "paragraphs": [
                "Bonjour {name},",
                "Le mot de passe de votre compte SIREN vient d'être modifié. "
                "Toutes vos autres sessions ont été déconnectées.",
            ],
            "highlight": "",
            "note": "Si vous n'êtes pas à l'origine de ce changement, utilisez immédiatement "
            "« Mot de passe oublié » dans l'application.",
        },
        "en": {
            "subject": "Your SIREN password was changed",
            "preheader": "Security alert for your account.",
            "heading": "Password changed",
            "paragraphs": [
                "Hello {name},",
                "The password of your SIREN account has just been changed. "
                "All your other sessions have been signed out.",
            ],
            "highlight": "",
            "note": "If you didn't make this change, use \"Forgot password\" in the app right away.",
        },
    },
    "twofa_changed": {
        "fr": {
            "subject": "Vérification en deux étapes {state} sur SIREN",
            "preheader": "Alerte de sécurité sur votre compte.",
            "heading": "Vérification en deux étapes {state}",
            "paragraphs": [
                "Bonjour {name},",
                "La vérification en deux étapes de votre compte SIREN vient d'être {state}.",
            ],
            "highlight": "",
            "note": "Si vous n'êtes pas à l'origine de ce changement, changez votre mot de passe.",
        },
        "en": {
            "subject": "Two-step verification {state} on SIREN",
            "preheader": "Security alert for your account.",
            "heading": "Two-step verification {state}",
            "paragraphs": [
                "Hello {name},",
                "Two-step verification on your SIREN account has just been {state}.",
            ],
            "highlight": "",
            "note": "If you didn't make this change, change your password.",
        },
    },
}

# Valeurs traduites des variables d'état (twofa_changed).
STATE_WORDS = {
    "fr": {"enabled": "activée", "disabled": "désactivée"},
    "en": {"enabled": "turned on", "disabled": "turned off"},
}

FOOTER = {
    "fr": "Email automatique envoyé par SIREN. Merci de ne pas y répondre.",
    "en": "Automatic email sent by SIREN. Please do not reply.",
}


@dataclass(frozen=True)
class RenderedEmail:
    template: str
    version: str
    language: str
    subject: str
    text: str
    html: str


def _fields(value: str) -> set[str]:
    return {name for _, name, _, _ in Formatter().parse(value) if name}


def template_fields(template: str, language: str) -> set[str]:
    entry = CATALOG[template][language]
    fields: set[str] = set()
    for key in ("subject", "preheader", "heading", "highlight", "note"):
        fields |= _fields(str(entry[key]))
    for paragraph in entry["paragraphs"]:  # type: ignore[union-attr]
        fields |= _fields(paragraph)
    return fields


def render(template: str, language: str, variables: dict[str, object]) -> RenderedEmail:
    lang = language if language in ("fr", "en") else "fr"
    entry = CATALOG[template][lang]
    values = {k: str(v) for k, v in variables.items()}
    if "state" in values:
        values["state"] = STATE_WORDS[lang].get(values["state"], values["state"])
    missing = template_fields(template, lang) - values.keys()
    if missing:
        raise KeyError(f"Variables manquantes pour {template}/{lang} : {sorted(missing)}")

    def fmt(value: object) -> str:
        return str(value).format(**values)

    subject = fmt(entry["subject"])
    heading = fmt(entry["heading"])
    paragraphs = [fmt(p) for p in entry["paragraphs"]]  # type: ignore[union-attr]
    highlight = fmt(entry["highlight"])
    note = fmt(entry["note"])

    text_parts = [heading, "", *paragraphs]
    if highlight:
        text_parts += ["", highlight]
    text_parts += ["", note, "", "—", FOOTER[lang]]
    text = "\n".join(text_parts)

    esc = {k: escape(v) for k, v in values.items()}

    def efmt(value: object) -> str:
        return str(value).format(**esc)

    body = "".join(f'<p style="margin:0 0 12px">{efmt(p)}</p>' for p in entry["paragraphs"])  # type: ignore[union-attr]
    code_block = (
        f'<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;color:#1B1B1B">{efmt(entry["highlight"])}</p>'
        if highlight
        else ""
    )
    html = (
        f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        '<body style="margin:0;background:#FBFAF8;font-family:Arial,Helvetica,sans-serif;color:#1B1B1B">'
        f'<span style="display:none;max-height:0;overflow:hidden">{efmt(entry["preheader"])}</span>'
        '<div style="max-width:520px;margin:0 auto;padding:24px 16px">'
        '<p style="font-weight:700;color:#D32F2E;letter-spacing:2px;margin:0 0 16px">SIREN</p>'
        f'<h1 style="font-size:20px;margin:0 0 16px">{efmt(entry["heading"])}</h1>'
        f"{body}{code_block}"
        f'<p style="font-size:13px;color:#6F6C65;margin:16px 0">{efmt(entry["note"])}</p>'
        f'<p style="font-size:12px;color:#6F6C65;border-top:1px solid #D9D4CC;padding-top:12px">{escape(FOOTER[lang])}</p>'
        "</div></body></html>"
    )
    return RenderedEmail(template=template, version=TEMPLATE_VERSION, language=lang, subject=subject, text=text, html=html)
