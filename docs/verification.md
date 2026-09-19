# Verification

> **TL;DR:** The complete games are tested with fictional inputs, disposable browser storage and blocked external network access. Provider tests use synthetic HTTP or a new loopback-only database. Physical-device behavior and a host’s real SMTP delivery are separate checks.

The release preserves the 17 original arithmetic/puzzle tests with deterministic random generation. Additional tests cover bounded saved-state normalization and backup version/game binding. The reused storage/transport tests exercise atomic creation, profile limits, competing tabs and recovery, durable inflight requests, interrupted acknowledgements, account/backend isolation, explicit conflict choices and unknown data formats.

`python3 scripts/test-browser.py` runs the real source controllers with a synthetic no-network save contract and fixed cards. It reproduces and guards wrong-attempt counters, duplicate-route credit, hint cancellation, keyboard focus, narrow controls, blank Area input and visible area givens. Source interception controls fixtures only; production builds contain no test-only hooks.

`python3 scripts/test-saves-browser.py` runs the generated games with actual browser IndexedDB. It checks solving, reload persistence, actual JSON download/import, learner switching, game isolation, temporary storage, unavailable sessionStorage, nested hosting and the exact offline file. Layout checks use 320, 390, 768 and 1440 pixels. Every nonlocal request is blocked.

`scripts/test-cloud-schema.py` starts a new PostgreSQL17 cluster bound only to a private Unix socket. It checks real RLS, forbidden owner reassignment, cross-owner foreign keys, bounded snapshots, concurrent revision checks and isolated deletion. PostgreSQL17.10 passed locally. It does not claim to exercise REST/Auth/email.

`scripts/test-supabase.py` exercises the actual pinned Supabase CLI2.117.0 stack in a disposable Ubuntu CI runner, with Auth, PostgREST, Kong and Mailpit. It tests email-code login, two-owner isolation, initial attachment, concurrent updates, conflict choice, lost-response reconciliation, restore, and account/profile switching. Release is gated on this workflow passing; see the repository’s Checks run for the exact commit.

The automated browser is Chromium. These checks do not establish educational efficacy, all phone/browser combinations, production email delivery, or the policies of someone else’s cloud deployment. The public app never connects to the original personal backend, and no normal-browser learner state is used in tests.
