# PRD 9 — Auth & sharing v2 (anonymous-first)

Real consumer accounts with zero-friction onboarding, then sharing surface.

## Implementation evidence
- **Anonymous-first**: first page load silently runs `POST auth/v1/signup` +
  `INSERT student (email 'anon_<uuid>@anonymous.turbolearn.ai',
  is_email_verified: true)` — you can upload and generate before any signup.
- **Google OAuth**: GoTrue `auth/v1/authorize?provider=google` (PKCE
  `code_challenge`), callback `auth/v1/callback` → client redirect
  `turbo.ai/auth/callback`. First Google login *links into* the anonymous row
  (keeps all content); a genuinely-conflicting identity errors
  `identity_already_exists` (observed live).
- **Sharing**: `is_public`, `is_public_view`, `is_public_edit` on content;
  `acl (object_id, object_type, student_id, role)` for per-user grants;
  `invitations (invited_email, accepted)` for email invites.
- Funnel fields on `student`: `referral_source, signup_platform,
  onboarding_data` — instrumentation from day one.

## Inkwell build
1. **Anonymous sessions**: on first visit create Supabase anonymous user;
   everything keys off it. On Google/email sign-in, use Supabase identity
   linking to merge into the same user id (no data migration).
2. We already have: `user_id` scoping, SignInPage, share links.
3. Share links v2: add `is_public_view`/`is_public_edit` split (we have
   read-only `/s/<token>` today — keep, add the edit flag later only if asked).
4. Add `referral_source` + `signup_platform` columns and set them at signup
   (UTM/link source) — one-time write, cheap, do it with auth work.
5. ponytail: skip `acl` grants + invitations table until a user asks for
   per-person sharing; public links cover the viral loop (Turbo roadmap Phase 1).

## Acceptance criteria
- Fresh visitor uploads + generates with zero signup; linking Google keeps
  their content; `referral_source` visible in DB for a referred signup.

**Effort:** 3-4 days. **Skipped:** ACL grants, email invitations, orgs — add when asked.
