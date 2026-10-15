import type { LegalCatalog } from '../types';

/**
 * Legal texts — ENGLISH. Provisional version (status `draft`, see registry.ts).
 * Text in brackets "[TO BE COMPLETED — …]" is information the project does not
 * have yet: it must NEVER be made up. Sources and open points: docs/JURIDIQUE.md.
 * Same structure as fr.ts (checked by src/legal/__tests__/legal.test.ts).
 */
export const legalEn: LegalCatalog = {
  'legal-notice': {
    title: 'Legal notice',
    summary: 'Who publishes SIREN, who hosts it and how to reach us.',
    sections: [
      {
        heading: 'Publisher',
        paragraphs: [
          'The SIREN app is published by [TO BE COMPLETED — LEGAL NAME], [TO BE COMPLETED — LEGAL FORM], with a share capital of [TO BE COMPLETED — SHARE CAPITAL].',
          'Registered office: [TO BE COMPLETED — REGISTERED ADDRESS].',
          'Registration: [TO BE COMPLETED — RCCM NUMBER]. Tax ID: [TO BE COMPLETED — NIU].',
          'Publication director: [TO BE COMPLETED — NAME AND ROLE].',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'Email: [TO BE COMPLETED — CONTACT ADDRESS]. Phone: [TO BE COMPLETED — CONTACT NUMBER].',
          'Personal data protection: [TO BE COMPLETED — DATA PROTECTION CONTACT / OFFICER].',
        ],
      },
      {
        heading: 'Hosting',
        paragraphs: [
          'Servers: [TO BE COMPLETED — NAME, ADDRESS AND COUNTRY OF THE CHOSEN HOST].',
          "Push notifications: Google's Firebase Cloud Messaging, used only to deliver alerts to your phone.",
        ],
      },
      {
        heading: 'Emergencies',
        paragraphs: [
          "SIREN is a tool that helps you stay alert. It does not replace an adult's supervision or public emergency services. If there is danger, call the police (117) or the relevant emergency number.",
        ],
      },
      {
        heading: 'Intellectual property',
        paragraphs: [
          'The SIREN name, logo, app and content are protected. Any unauthorised reproduction is forbidden. Map backgrounds come from OpenStreetMap (© OpenStreetMap contributors), available under the ODbL licence.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    summary: 'What data SIREN processes, why, for how long, and your rights.',
    sections: [
      {
        heading: 'Data controller',
        paragraphs: [
          '[TO BE COMPLETED — LEGAL NAME AND ADDRESS] is responsible for the processing described below. Contact: [TO BE COMPLETED — DATA PROTECTION CONTACT].',
          'This policy is written with regard to Cameroon Law No. 2024/017 of 23 December 2024 on the protection of personal data.',
        ],
      },
      {
        heading: 'Data we process',
        paragraphs: [
          'Your account: name, email, phone number (optional), language, password (stored only in irreversibly encrypted form), preferences.',
          "The protected child: first name, date of birth, photo (optional), usual places and schedules you declare, emergency contacts.",
          'Device data: locations, speed, movements, battery level, connection status, and the risk scores computed from this data.',
          'Trusted contacts: the identity of the people you invite, the rights you grant them and the log of what they viewed.',
          'Technical: your phone’s notification token, security logs (sign-ins, verification codes sent), without the content of your exchanges.',
        ],
      },
      {
        heading: 'Why',
        paragraphs: [
          'To protect the child: show their location, detect an unusual situation, alert you and help you react in an emergency.',
          'To run your account: sign-in, security (two-step verification, security alerts), sharing with your trusted contacts.',
          "To improve detection: the model learns each child's routine for that child only. A child's trips are never sold or used for advertising.",
        ],
      },
      {
        heading: 'Legal basis and consent',
        paragraphs: [
          "Processing is based on the consent you give when you sign up and on providing the service you request. You confirm that you are the child's parent or legal guardian, or that you act with their agreement.",
          'You can withdraw your consent at any time by deleting your account (Settings → Delete my account).',
        ],
      },
      {
        heading: 'Who can access it',
        paragraphs: [
          'You, as the primary parent; the trusted contacts you invite, strictly within the rights you grant them (all off by default); authorised members of the SIREN team for maintenance and security.',
          'Technical providers: hosting ([TO BE COMPLETED — HOST]), notification delivery (Google Firebase), email delivery ([TO BE COMPLETED — EMAIL PROVIDER]), map backgrounds (OpenFreeMap / OpenStreetMap, which receive the phone’s IP address and the area displayed).',
          'Authorities: only on a lawful request, or when you choose to share the search sheet yourself.',
        ],
      },
      {
        heading: 'Transfers outside Cameroon',
        paragraphs: [
          'Some data may be hosted or pass outside Cameroon (servers, notifications, emails). [TO BE COMPLETED — COUNTRIES CONCERNED AND FORMALITIES COMPLETED WITH THE DATA PROTECTION AUTHORITY].',
        ],
      },
      {
        heading: 'Retention periods',
        paragraphs: [
          "Child locations: 90 days, then deleted automatically (server setting, period to be confirmed).",
          'Verification codes: valid for a few minutes, then deleted.',
          'Account: as long as you use it. When you delete it, access is cut off immediately (sessions, sharing, notifications); remaining data is erased according to the purge policy [TO BE COMPLETED — FINAL DELETION PERIOD].',
          'Trusted contacts’ access log: [TO BE COMPLETED — PERIOD].',
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'Encrypted connections (HTTPS), session tokens kept in the phone’s secure storage, passwords and codes stored irreversibly, rights checked on the server, app hidden in the task switcher, optional biometric lock.',
          'If a data breach is likely to affect you, we will inform you and the competent authority, as required by law.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You have, in particular, the right to access, correct, object to, erase and port your data, and to withdraw your consent. To exercise them: [TO BE COMPLETED — DATA PROTECTION CONTACT].',
          'You can also contact the personal data protection authority established by Law No. 2024/017.',
        ],
      },
      {
        heading: 'Notifications',
        paragraphs: [
          "Alerts (emergency, pre-alert, information) are sent in your account language. A notification only contains the child's first name and the type of alert: never a location. You can adjust notifications in Settings and in your phone settings.",
        ],
      },
      {
        heading: 'Audio listening',
        paragraphs: [
          'Supervised listening is turned off. It will only be enabled once its legal framework has been validated; this policy will then be updated.',
        ],
      },
    ],
  },

  terms: {
    title: 'Terms of use',
    summary: 'The rules of the agreement between you and SIREN.',
    sections: [
      {
        heading: 'Purpose',
        paragraphs: [
          'These terms govern the use of the SIREN app and of the service linked to the device worn by the child. By creating an account, you accept them.',
        ],
      },
      {
        heading: 'Account',
        paragraphs: [
          "You must be an adult and the parent or legal guardian of the monitored child, or act with their permission. You are responsible for keeping your password confidential. We recommend turning on two-step verification.",
        ],
      },
      {
        heading: 'What SIREN does — and does not do',
        paragraphs: [
          'SIREN helps detect unusual situations from the device data. Detection depends on the network, battery, GPS and the quality of the information you provide: it can be delayed or miss a situation.',
          "SIREN does not guarantee the child's safety and does not replace an adult's vigilance or emergency services. If there is danger, contact the authorities immediately (police: 117).",
        ],
      },
      {
        heading: 'Trusted contacts',
        paragraphs: [
          'You can share access with up to three trusted contacts per child, with rights you choose and can withdraw at any time. You remain responsible for the people you invite.',
        ],
      },
      {
        heading: 'Paid features',
        paragraphs: [
          'Some features may use credits bought by the parent. Prices will be shown before any purchase. An ongoing emergency is never interrupted for lack of credits. [TO BE COMPLETED — COMMERCIAL TERMS, PAYMENT METHODS AND REFUNDS, WHEN CREDITS LAUNCH].',
        ],
      },
      {
        heading: 'Prohibited use',
        paragraphs: [
          'You must not use SIREN to track someone without their knowledge or without the right to do so, bypass the service’s protections, or post false reports. See the usage rules.',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: ['[TO BE COMPLETED — LIABILITY CLAUSES, TO BE DRAFTED WITH A LAWYER UNDER CAMEROONIAN CONSUMER LAW].'],
      },
      {
        heading: 'Termination',
        paragraphs: [
          'You can delete your account at any time from Settings. We may suspend an account that breaches these terms, after notice except in an emergency.',
        ],
      },
      {
        heading: 'Governing law',
        paragraphs: ['[TO BE COMPLETED — GOVERNING LAW AND COMPETENT COURT].'],
      },
    ],
  },

  rules: {
    title: 'Usage rules',
    summary: 'Good practice for SIREN, sharing and reports.',
    sections: [
      {
        heading: "Monitor only in the child's interest",
        paragraphs: [
          'SIREN is meant to protect the child wearing the device. Do not use it to monitor an adult, a partner or anyone else.',
        ],
      },
      {
        heading: 'Share carefully',
        paragraphs: [
          'Only invite people you trust and grant the fewest rights needed. Every time a trusted contact views information, it is recorded in the access log you can check.',
        ],
      },
      {
        heading: 'Community reports',
        paragraphs: [
          "Only post facts you observed, with no names, no photos of other people and no accusations. Reports are moderated before publication. False reports may lead to account suspension.",
        ],
      },
      {
        heading: 'In an emergency',
        paragraphs: [
          'If SIREN reports an emergency, check the situation and contact the child and your trusted contacts. If the danger is real, call the police (117) right away. Only share the search sheet if the child is actually missing.',
        ],
      },
    ],
  },

  'children-data': {
    title: "Children's data",
    summary: "How we protect the child's data, and how to delete it.",
    sections: [
      {
        heading: 'Principles',
        paragraphs: [
          'The child has no account and does not use the app. Their data is entrusted by their parent or legal guardian, who stays in control of it.',
          'We only collect what is needed to protect them. No advertising targets a child; their trips are never sold.',
        ],
      },
      {
        heading: 'Sensitive data',
        paragraphs: [
          "A child's locations are especially sensitive: only you and the trusted contacts you explicitly allow can see them. They never appear in notifications or technical logs.",
          'The relay mode between SIREN devices, if enabled by the device, is only used to carry data to the server; other families cannot access it. [TO BE COMPLETED — TO BE CONFIRMED WITH THE DEVICE TEAM].',
        ],
      },
      {
        heading: 'Deleting the data',
        paragraphs: [
          'Removing a child from the account or deleting your account immediately cuts off all access, including trusted contacts’ access. Final erasure follows the retention period stated in the privacy policy.',
        ],
      },
    ],
  },
};
