# admin@unwhelm.online — Email Setup

Inbound forwarding for Meta / business verification contact email on `unwhelm.online`.

## Done (inbound)

- **Registrar:** Namecheap
- **Mail Settings:** Email Forwarding (MX records are platform-managed; may not show in UI but are live)
- **Forwarder:** `admin` → destination inbox (Domain tab → Redirect Email)
- **SPF (current):** `v=spf1 include:spf.efwd.registrar-servers.com ~all`

Verified Jun 6, 2026: mail to `admin@unwhelm.online` forwards correctly via `eforward*.registrar-servers.com`.

### Meta / business verification (use now)

| Field | Value |
|-------|-------|
| Business name | Unwhelm LLC |
| Website | https://unwhelm.online |
| Contact email | admin@unwhelm.online |

Receiving Meta verification and policy mail only requires inbound forwarding — no outbound setup needed yet.

---

## Later — Outbound (send as admin@unwhelm.online)

Only needed when you must **reply** from `admin@unwhelm.online` (e.g. Meta asks you to confirm by email). Forwarding alone cannot send outbound mail.

### 1. Update SPF in Namecheap

**Advanced DNS** → edit the existing SPF TXT (do not add a second SPF record):

```
v=spf1 include:spf.efwd.registrar-servers.com include:_spf.google.com ~all
```

Wait 15–30 minutes for DNS propagation.

### 2. Gmail “Send mail as”

Using `edmund.landgraf@gmail.com` (or whichever Gmail account you use):

1. Gmail → **Settings** → **See all settings**
2. **Accounts and Import** → **Send mail as** → **Add another email address**
3. Name: `Unwhelm LLC` (or `Admin`)
4. Email: `admin@unwhelm.online`
5. SMTP: `smtp.gmail.com`, port **587**, TLS on
6. Username: your full Gmail address
7. Password: [Google App Password](https://myaccount.google.com/apppasswords) if 2FA is enabled
8. Complete verification via the link sent to `admin@unwhelm.online` (arrives in forwarded inbox)

### 3. Test outbound

1. Compose in Gmail
2. **From** → `admin@unwhelm.online`
3. Send to another address; confirm From header and inbox (not spam)

### Notes

- Do not add MX records manually while Email Forwarding is selected in Mail Settings.
- Merge SPF includes into one TXT record only.
- Test inbound from an address **other than** the forward-to destination.
