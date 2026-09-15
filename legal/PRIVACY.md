<!-- INTERNAL NOTE — do not publish:
DRAFT — NOT LEGAL ADVICE. Prepared from the actual behaviour of the software, as
described in legal/README.md. The AI-provider statements below should be verified
against the current provider agreement before publishing.
-->

# Privacy Policy

**Engraving Prep Tool**

Effective: September 15, 2026

This policy explains what the Engraving Prep Tool (the "**Software**") collects,
where it goes, and what choices you have. It covers the desktop application, our
web application, and the account and licensing service behind them (together, the
"**Service**"). We are Petes Guns and Stuff LLC, a Texas limited liability company, doing business as
ForgeMark Industries ("**we**").

**The short version:** your artwork and shop details stay on your computer and are
not uploaded. We collect the account and licensing information needed to run the
Service, we count usage so plan limits work, and if you use an AI feature, the
content of that request is sent to our server and to a third-party AI provider.

## 1. Information you give us

**Account information.** To use the Service you create an account. We store your
email address, the display name you provide, a timestamped record of account
creation and updates, and a **hashed** password. Passwords are hashed with
PBKDF2-SHA256 (210,000 iterations with a per-account random salt). We never store
your password in a form we can read.

**Licence information.** If you buy a licence, we store the licence key, the
associated account, the plan, and the licence expiry date. A licence key issued
to you contains an identifier for your account (typically your email address)
inside the key itself.

**Payment information.** Payments are handled by our payment processor. We receive
confirmation of payment, the plan purchased, and limited billing details from the
processor (for example a billing name, the last four digits of a card, and a
transaction identifier). **We do not receive or store your full card number.**

**Support correspondence.** If you contact support, we keep the messages and any
files you choose to send, so we can resolve the issue and keep a record of it.

## 2. Information created when you use the Service

**Usage counts.** We record how many exports you have performed in the current
calendar month and how many AI requests you have made in the current day, keyed
to your account. These counters make plan limits work. They contain counts only —
not what you exported.

**Sign-in session.** When you sign in, our server sets a session cookie named
`pgs_session`. It is HttpOnly and SameSite=Lax, expires after 14 days, and
contains your account identifier, email, name, and issue/expiry timestamps,
signed by our server. It is used only to keep you signed in.

**Technical and security data.** Our servers and our hosting provider, Vercel,
process standard request information —
including IP address, timestamps, request paths, and user agent — as part of
serving the Service and protecting it from abuse. <!-- INTERNAL NOTE — do not publish:
Confirm with the hosting provider how long access logs are retained and whether
any platform-level analytics is enabled, then state it here.
-->

**Update checks.** The application checks a version manifest over the internet at
startup. That request tells us (and our hosting provider) your IP address and your
installed version. It does not include your artwork, your shop details, or your
usage counts.

## 3. What stays on your computer

The Software is local-first. The following are stored on your device and are
**not** sent to us:

| What                                                       | Where it is stored                               |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Your artwork, designs, imported SVGs, photographs of parts | On your device, in the application's own storage |
| Your shop profile (licensed name, city, state)             | Local storage on your device                     |
| Saved material presets and custom presets                  | Local storage on your device                     |
| Your export history flag and getting-started progress      | Local storage on your device                     |
| Your cached licence entitlement                            | Local storage on your device                     |

Uninstalling the desktop application does not automatically delete this local
data; it is kept so that reinstalling preserves your settings, and you can remove
it yourself (see section 9).

**Exports are produced on your device.** Export files are generated locally and
saved where you choose. We do not receive them.

## 4. AI features send content to third parties

The AI assistant and AI image features are **optional**. When you use them:

1. your request is sent from your device to **our server**;
2. our server forwards it to **OpenAI** using our own API credentials;
3. the model's response is returned to your device.

What is included in the request:

| Feature                                                              | What is transmitted                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AI assistant (chat)                                                  | The messages you type, plus a summary of your current editor settings (for example material size and units) |
| AI assistant, when a design or part photo is attached by the feature | The attached image data, in addition to the above                                                           |
| AI image composer                                                    | The prompt you type and any template or reference image you attach                                          |

Do not use AI features with content you are not permitted to share. In
particular, be careful with photographs of parts, serial numbers, customer
information, or anything confidential.

OpenAI processes these requests as our service provider. <!-- INTERNAL NOTE — do not publish:
VERIFY against the current provider agreement before publishing: that API inputs
and outputs are not used for training, and the retention period for abuse
monitoring. Correct the sentence below if the terms have changed.
--> We do not use your AI
requests to train our own models, and we do not sell them.

If you would rather not send content anywhere, do not use the AI features. The
rest of the Software works without them.

## 5. Why we use information, and our legal bases

| Purpose                                               | Data used                                    |
| ----------------------------------------------------- | -------------------------------------------- |
| Creating and securing your account, signing you in    | Email, name, hashed password, session cookie |
| Providing the Software and its updates                | Account, licence, usage counts, update check |
| Enforcing plan limits                                 | Usage counts                                 |
| Taking payment and handling refunds                   | Order and payment records                    |
| Answering support requests                            | Support correspondence                       |
| Debugging, preventing abuse, and securing the Service | Technical and security data                  |
| Meeting legal, tax, and accounting obligations        | Order and payment records                    |

**If you are in the EEA or UK**, our legal bases are: performance of our contract
with you (providing the Service), our legitimate interests in securing and
improving it, consent where we ask for it (for example optional AI features), and
compliance with legal obligations. You may withdraw consent at any time for
future processing.

## 6. What we do not do

We do not sell your personal information. We do not share it with advertisers. We
do not use your artwork or AI requests to train models. We do not use your data
for any purpose other than those described in this policy.

## 7. Who we share it with

We share personal information only with service providers that help us run the
Service, and only as needed:

| Provider                             | Purpose                                                 | Data involved                                  |
| ------------------------------------ | ------------------------------------------------------- | ---------------------------------------------- |
| Vercel                               | Hosting the web application and API                     | Account, session, usage counts, technical data |
| OpenAI                               | Powering optional AI features                           | AI request content, as described in section 4  |
| Our payment processor                | Payment processing                                      | Billing details you provide to them            |
| [EMAIL PROVIDER, if any]             | Transactional email such as receipts or password resets | Email address                                  |
| [ANALYTICS/ERROR MONITORING, if any] | Diagnosing faults                                       | Technical data                                 |

We may also disclose information if required by law, to respond to lawful
requests, to enforce our agreements, or to protect the rights, property, or safety
of our business, our customers, or others. If we sell the business or its assets,
customer information may be transferred as part of that transaction, subject to
this policy.

## 8. Where your information is processed

We are based in the United States, and our providers process data in the United
States. If you use the Service from outside the United States, your information
will be transferred to and processed in the United States, which may not provide
the same level of protection as your own jurisdiction. Where required, we rely on
appropriate safeguards such as standard contractual clauses.

## 9. How long we keep it

| Data                                             | Retention                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Account information (email, name, password hash) | While your account is open, then deleted within [30/90] days of a verified deletion request |
| Licence records                                  | For the licence term plus 4 years, for accounting and dispute purposes                      |
| Usage counts (exports, AI requests)              | Current period plus 12 months                                                               |
| Payment and tax records                          | 7 years, as required by tax and accounting practice                                         |
| Support correspondence                           | 2 years after the matter is closed                                                          |
| Technical and security logs                      | Per our hosting provider's retention policy for your plan                                   |
| Local application data on your device            | Until you delete it or uninstall and remove it                                              |

To remove local data yourself: sign out, then delete the application's data folder
on your device (typically `%APPDATA%\Engraving Prep Tool` on Windows)
or use the application's clearing controls. Uninstalling keeps this data by
default, so settings survive a reinstall.

## 10. Your choices and rights

Depending on where you live, you may have the right to:

- access the personal information we hold about you;
- correct information that is inaccurate;
- delete your account and associated information;
- receive a portable copy of information you provided;
- object to or restrict certain processing;
- withdraw consent where processing is based on consent;
- lodge a complaint with your local data protection authority.

**California residents:** you have rights under the CCPA/CPRA, including the right
to know, delete, correct, and to opt out of the "sale" or "sharing" of personal
information. **We do not sell or share personal information as those terms are
defined by the CPRA.**

To make a request, email support@forgemarkindustries.com from the address on your account. We will
verify your request and respond within the time required by applicable law. You
may use an authorised agent where the law allows.

## 11. Security

We use reasonable technical and organisational measures, including hashed
passwords, signed session cookies, TLS for data in transit, and access
restrictions on our systems. No method of transmission or storage is completely
secure, and we cannot guarantee absolute security. If we become aware of a breach
affecting your personal information, we will notify you and any regulator as
required by law.

## 12. Children

The Service is intended for business use by adults. It is not directed to
children, and we do not knowingly collect personal information from anyone under 18. If you believe a child has provided us information, contact us and we will
delete it.

## 13. Changes to this policy

We may update this policy. If we make a material change, we will post the new
policy with a new effective date and, where required, notify you. Continuing to
use the Service after an update means you accept the revised policy.

## 14. Contact

Privacy questions and requests (email is monitored daily):

ForgeMark Industries
(a d/b/a of Petes Guns and Stuff LLC)
support@forgemarkindustries.com
903-998-0262
