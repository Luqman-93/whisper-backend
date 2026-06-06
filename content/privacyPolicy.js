// Privacy Policy Content
module.exports = {
  title: "Privacy Policy",
  lastUpdated: "June 6, 2026",
  content: `
## 1. Introduction

Whisper ("we," "our," or "us") is an anonymous expert consultation platform designed to protect your identity while connecting you with qualified professionals. This Privacy Policy describes what information we collect, how we use it, and your rights with respect to that data.

By using Whisper, you acknowledge that you have read and understood this Policy.

---

## 2. Who This Policy Applies To

This Policy applies to all users of the Whisper mobile application, including:

- **Anonymous Users** — individuals who submit questions anonymously
- **Expert Users** — verified professionals who respond to questions
- **Admin Users** — platform administrators responsible for moderation

---

## 3. Information We Collect

### 3.1 Anonymous Users

| Data Type | Details |
|-----------|---------|
| Anonymous Identifier | A one-way cryptographic hash derived from your email and password. We never store your plain-text email or password. |
| Questions & Attachments | Content and files you submit through the app |
| Device Information | Basic device data required for app functionality |
| Session Tokens | Short-lived JWT tokens (24-hour expiry) for authentication |

### 3.2 Expert Users

| Data Type | Details |
|-----------|---------|
| Account Details | Name, email address, and bcrypt-hashed password |
| Professional Credentials | Documents uploaded for identity and expertise verification |
| Expertise Category | Your declared area of professional expertise |
| Payment Records | Subscription screenshots reviewed only by admins |
| Activity Data | Questions answered, response times, and user ratings |

### 3.3 Admin Users

Admins provide an email address, a hashed password, and an additional security code for elevated authentication.

---

## 4. How We Use Your Information

We process your information strictly for the following purposes:

- **Service Delivery** — Matching questions to relevant experts and facilitating communication
- **Identity Protection** — Maintaining anonymous identifiers to protect user privacy
- **Platform Safety** — AI-powered content moderation to detect harmful or unsafe content
- **Expert Verification** — Reviewing credentials and subscription payments before account activation
- **Quality Improvement** — Aggregated, anonymized analytics to improve platform performance
- **Legal Compliance** — Responding to lawful requests from regulatory or law enforcement authorities

We do **not** use your data for advertising, profiling, or sale to third parties.

---

## 5. Sharing and Disclosure

### 5.1 What We Share

- **Questions → Experts:** Your anonymous question is shared with the matched expert. Your real identity is never revealed.
- **Expert Profiles → Users:** Expert names and categories are visible to users for transparency.
- **Aggregated Analytics:** Non-identifiable usage statistics for internal reporting only.

### 5.2 What We Never Share

- Anonymous user identities or personally identifiable information
- Payment details beyond administrative review
- Private message content beyond the direct participants

### 5.3 Legal Disclosure

We may disclose information if required by a valid court order, subpoena, or applicable law, or to prevent imminent harm to a person's safety.

---

## 6. AI and Automated Processing

### 6.1 How We Use AI

Whisper uses Google Gemini AI for the following purposes:

- **Content Moderation** — Screening submissions for hate speech, violence, self-harm, illegal content, and other violations
- **Question Categorization** — Automatically routing questions to the most relevant expert category
- **Expert Assistance** — Generating suggested response prompts to help experts formulate answers
- **Session Summaries** — Producing concise professional summaries at the end of consultations

### 6.2 Human Oversight

- All AI-generated content is reviewed by the expert before delivery to the user
- Experts may modify or discard any AI suggestion at their discretion
- Moderation decisions can be escalated to a human administrator

### 6.3 Limits of AI

AI analysis is a tool, not a final decision-maker. All significant moderation actions involve human review.

---

## 7. Data Security

We apply industry-standard security controls to protect your information:

- **Password Hashing** — All passwords are hashed using bcrypt (cost factor 10)
- **Anonymous Identifiers** — User identity is protected using SHA-256 cryptographic hashing
- **Transport Security** — All data transmitted over HTTPS/TLS
- **Access Controls** — Role-based permissions restrict data access to authorized parties only
- **Content Screening** — Every submission is scanned by AI before reaching a human expert

No system is 100% secure. We will notify affected users promptly if a data breach occurs.

---

## 8. Data Retention

| Data Category | Retention Period |
|---------------|-----------------|
| Anonymous User Data | Until account deletion |
| Expert Account Data | Active subscription + 1 year post-termination |
| Questions & Responses | Until the associated account is deleted |
| Flagged Content | Retained indefinitely for safety and moderation purposes |
| Session Tokens | 24 hours from issuance |

---

## 9. Your Rights

You have the following rights with respect to your personal data:

- **Access** — Request a summary of the data we hold about you
- **Correction** — Update inaccurate information in your account
- **Deletion** — Delete your account and associated data at any time from within the app
- **Portability** — Request your data in a structured, machine-readable format
- **Objection** — Opt out of specific data processing (note: this may limit app functionality)

To exercise any of these rights, contact us at **privacy@whisperapp.com**.

---

## 10. Third-Party Services

Whisper integrates the following third-party services. Each is governed by its own privacy policy:

| Service | Purpose | Policy |
|---------|---------|--------|
| Google Gemini AI | Content moderation & expert assistance | [Google Privacy Policy](https://policies.google.com/privacy) |
| Cloud Storage | Secure file storage for credentials and attachments | Provider-specific |
| Nodemailer / Email Provider | OTP verification and notification emails | Provider-specific |
| Railway | Backend hosting and infrastructure | [Railway Privacy Policy](https://railway.app/legal/privacy) |

---

## 11. Children's Privacy

Whisper is intended for users **18 years of age and older**. We do not knowingly collect personal information from minors. If you believe a child has created an account, please contact us immediately at **privacy@whisperapp.com** and we will delete the account.

---

## 12. International Data Transfers

Your data may be processed in countries other than your own. When transferring data internationally, we apply appropriate safeguards to ensure your data is protected in accordance with this Policy.

---

## 13. Changes to This Policy

We may update this Privacy Policy periodically. When we do:

- The "Last Updated" date at the top of this document will be revised
- Material changes will trigger an in-app notification
- Continued use of Whisper after changes constitutes acceptance of the updated Policy

---

## 14. Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy, please contact us:

**Privacy Inquiries:** privacy@whisperapp.com  
**General Support:** support@whisperapp.com

---

> **Emergency Notice:** Whisper is not a crisis service. If you or someone you know is in immediate danger, please contact your local emergency services (e.g., 115, 1122, or 911).

---

*Last Updated: June 6, 2026*
`
};