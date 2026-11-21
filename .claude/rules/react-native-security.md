---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/AndroidManifest.xml"
  - "**/Info.plist"
---

# React Native / Expo Security

> This file extends [common-security.mdc](common-security.mdc) with React Native / Expo specific content.
> The mandatory pre-commit checklist and Security Response Protocol from common-security.mdc still apply.

## The Bundle Is Public

Treat everything shipped in the app as readable by an attacker. A mobile binary can be unpacked.

- NEVER ship real secrets (private API keys, service-role keys, signing secrets) in the JS bundle or `app.config`.
- Public/anon keys (e.g. Supabase anon key, Firebase config) are acceptable ONLY when protected by server-side rules (RLS, security rules). Enforce authorization on the backend, never in the client.
- Keep privileged operations behind your own server / edge functions.

## Secret & Token Storage

- Store auth tokens and sensitive values in `expo-secure-store` (Keychain / Keystore) — never in `AsyncStorage` or plain MMKV.
- Do not persist secrets in Redux/Zustand state that may be serialized to disk.

## Configuration

- Read environment via `expo-constants` / `app.config.ts` `extra`, and `EXPO_PUBLIC_*` only for genuinely public values.
- Keep build secrets in EAS secrets, not in the repo.

## Network & Data

- HTTPS only; reject cleartext. Consider certificate pinning for high-risk apps.
- Configure Android `network_security_config.xml` to block cleartext traffic.
- Set request timeouts on all HTTP clients — never leave defaults.
- Validate ALL external data (API responses, deep-link params, push payloads) with Zod before use.
- Validate and sanitize deep links and universal links — never route or grant access based on unvalidated params.

## Permissions & Privacy

- Request the minimum device permissions, at the moment they are needed, with clear rationale.
- Declare data collection accurately for App Store / Play Store privacy disclosures.

## Native Manifests (AndroidManifest.xml / Info.plist)

Expo prebuild generates these files; the hardening below applies to them.
Ported from the cut `dart-security` rule in fix #28 (audit #77-A1) — the
guidance is framework-neutral native hardening, not Flutter-specific.
(DARTSEC_F28)

- Declare only required permissions in `AndroidManifest.xml`.
- Export Android components (`Activity`, `Service`, `BroadcastReceiver`)
  only when necessary; add `android:exported="false"` where not needed.
- Review intent filters — exported components with implicit intent filters
  are accessible by any app.
- Use `FLAG_SECURE` for screens displaying sensitive data (prevents
  screenshots).
- Declare only required usage descriptions in `Info.plist`
  (`NSCameraUsageDescription`, etc.).
- Set `NSAppTransportSecurity` in `Info.plist` to disallow arbitrary loads.
- Enable data protection entitlement for sensitive files.

## Dependencies

- Run `expo-doctor` regularly; keep the Expo SDK and native deps current. (`npm audit` is END-ONLY — end of project or on explicit ask, see hackathon-mode §3)
- Use the `security-review` skill (END-ONLY — end of project or on explicit ask) on the agent configuration itself.
