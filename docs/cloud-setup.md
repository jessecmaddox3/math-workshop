# Optional cloud saves

> **TL;DR:** Both games work without an account. A host can add cloud saves using a new Supabase project, the supplied ownership schema and adult email-code sign-in. No shared backend or account is included.

## Host setup

1. Create a new Supabase project for your hosted copy. Apply [cloud/schema.sql](../cloud/schema.sql) together, including its RLS policies, composite ownership key and revision triggers. Do not export or reuse a household’s original database.
2. Enable email authentication and account creation, and disable anonymous sign-in. Set the Auth site URL to your app’s HTTPS address.
3. Put `{{ .Token }}` in the new-account confirmation and returning-user sign-in email templates. The Magic Link template can send a code; the app verifies that code with type `email`. [Official email OTP instructions](https://supabase.com/docs/guides/auth/auth-email-passwordless).
4. Configure an SMTP sender for real users. The default Supabase sender is restricted and is not a general public email-delivery service. [Official SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
5. Copy `public/cloud-config.example.json` to `public/cloud-config.local.json`. Set `enabled` to `true`, a short host label, the project’s HTTPS origin and its `sb_publishable_…` key. Keep this local file out of Git. It is served to your users, so it must contain only public client configuration. Never use a secret or service-role key. [Official key types](https://supabase.com/docs/guides/getting-started/api-keys).
6. Run `npm run build` and host `public/` over HTTPS. Keep the configuration beside the root menu’s `index.html`, not inside either game folder. Repository-subpath hosting is supported.

The app validates configuration before initializing the SDK. Owner authorization comes from the adult’s signed-in session and the database policies; a publishable key alone grants no learner-table access. A bad or absent configuration does not stop local play.

## Player flow

Open a game, then **Learners and backups → Explore cloud saves**. The destination is shown before sign-in. Enter an adult email, request a code and type it on the same page. This creates an account if needed. Authentication stays in page memory; reloads and other game pages require fresh sign-in.

Save the current local learner as a new cloud learner, or preview an existing cloud learner. Matching nicknames never merge records. Each game has separate local progress and cloud records. Once attached and connected, local commits upload automatically. Restore or version-choice actions update the active game in place and cancel the old question’s timers.

Two devices editing the same save produce an explicit choice. Keeping a device version or accepting a cloud version retains the other snapshot in recovery. **Export recovery copies** downloads a collection of backup objects, with their dates and reasons. To restore one, save that entry’s `backup` object as its own JSON file and import it into the matching game. Standard imports create a new unbound learner, never a signed-in account.

Disconnect ends the current connection and keeps local progress, including pending work bound to its original owner and backend. It does not delete cloud data or immediately revoke an already issued server token. **Remove this account’s downloaded learners** affects this game on this browser only. Operators manage cloud retention/deletion through their own project administration.

## Verification

The source includes synthetic SDK/transport and IndexedDB tests, actual PostgreSQL ownership/concurrency checks, and a disposable Supabase Auth/PostgREST/Mailpit integration workflow. The integration harness accepts loopback endpoints only, captures mail locally, and does not link a cloud project or use real accounts. See [verification](verification.md) for the current release evidence and limits.

Before opening your own host to other people, verify two invented adult accounts: A can save and restore A’s learner; B cannot read or change it; anonymous users cannot access either account’s rows. Test concurrent writes and a lost upload response. These are deployment checks, not proof that any original private backend had a particular permission setup.

The standalone HTML files do not load cloud configuration or initialize the SDK. Hosted startup also makes no cloud request until the adult explicitly explores that option.
