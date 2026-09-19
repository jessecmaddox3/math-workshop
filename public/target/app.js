(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key2 of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key2) && key2 !== except)
          __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // public/target/solver.js
  var gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  function frac(n, d = 1) {
    if (d === 0) return null;
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1;
    return [n / g, d / g];
  }
  var add = (a, b) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  var sub = (a, b) => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
  var mul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
  var div = (a, b) => b[0] === 0 ? null : frac(a[0] * b[1], a[1] * b[0]);
  var OPS = [
    { sym: "+", fn: add, commutative: true },
    { sym: "\xD7", fn: mul, commutative: true },
    { sym: "\u2212", fn: sub, commutative: false },
    { sym: "\xF7", fn: div, commutative: false }
  ];
  function reachable(items) {
    if (items.length === 1) return /* @__PURE__ */ new Map([[key(items[0].v), items[0].e]]);
    const out = /* @__PURE__ */ new Map();
    for (let i = 0; i < items.length; i += 1) {
      for (let j = 0; j < items.length; j += 1) {
        if (i === j) continue;
        const rest = items.filter((_, k) => k !== i && k !== j);
        for (const op of OPS) {
          if (op.commutative && j < i) continue;
          const v = op.fn(items[i].v, items[j].v);
          if (!v) continue;
          const e = `(${items[i].e} ${op.sym} ${items[j].e})`;
          for (const [k, expr] of reachable([...rest, { v, e }])) {
            if (!out.has(k)) out.set(k, expr);
          }
        }
      }
    }
    return out;
  }
  var key = (v) => `${v[0]}/${v[1]}`;
  function solve(numbers, target, limit = 6) {
    const items = numbers.map((n) => ({ v: frac(n), e: String(n) }));
    const all = reachable(items);
    const want = key(frac(target));
    const hit = all.get(want);
    return hit ? [hit].slice(0, limit) : [];
  }
  function evaluate(node) {
    if (typeof node === "number") return frac(node);
    const a = evaluate(node.a);
    const b = evaluate(node.b);
    if (!a || !b) return null;
    const op = OPS.find((o) => o.sym === node.op);
    return op ? op.fn(a, b) : null;
  }
  function equals(value, target) {
    if (!value) return false;
    const t = frac(target);
    return value[0] === t[0] && value[1] === t[1];
  }
  function pretty(value) {
    if (!value) return "?";
    return value[1] === 1 ? String(value[0]) : `${value[0]}/${value[1]}`;
  }
  function makeCard(tier, rng = Math.random) {
    const pick = (n) => 1 + Math.floor(rng() * n);
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const count2 = tier >= 3 ? 4 : tier === 2 ? 4 : 3;
      const max = tier >= 3 ? 12 : tier === 2 ? 9 : 6;
      const numbers = Array.from({ length: count2 }, () => pick(max));
      const targets = tier >= 3 ? [24, 36, 48, 60] : tier === 2 ? [12, 18, 20, 24] : [6, 8, 10, 12];
      const target = targets[Math.floor(rng() * targets.length)];
      const solutions = solve(numbers, target);
      if (solutions.length) return { numbers, target, solution: solutions[0] };
    }
    return { numbers: [2, 3, 4], target: 24, solution: "((2 \xD7 3) \xD7 4)" };
  }

  // public/shared/progress-store.js
  var MAX_PROFILES = 8;
  var MAX_SNAPSHOT_BYTES = 1048576;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var clone = (value) => structuredClone(value);
  var sameBinding = (a, b) => !!a && !!b && a.backend === b.backend && a.ownerId === b.ownerId && a.profileId === b.profileId;
  function validateBinding(value) {
    if (!value || !UUID.test(value.ownerId) || !UUID.test(value.profileId)) throw new TypeError("Invalid cloud profile.");
    const url = new URL(value.backend);
    if (url.protocol !== "https:" || url.origin !== value.backend || url.username || url.password) throw new TypeError("Invalid cloud destination.");
    return { backend: url.origin, ownerId: value.ownerId, profileId: value.profileId };
  }
  async function openProgressStore({ indexedDB = globalThis.indexedDB, dbName = "color-learning-v1", gameId, curriculumId, normalize }) {
    if (!indexedDB) throw new Error("This browser cannot save progress on this device.");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const next = request.result;
        next.createObjectStore("profiles", { keyPath: "id" });
        next.createObjectStore("records", { keyPath: "key" });
        const recovery = next.createObjectStore("recovery", { keyPath: "id" });
        recovery.createIndex("profileId", "profileId");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close older tabs before updating saved progress."));
      request.onsuccess = () => resolve(request.result);
    });
    db.onversionchange = () => db.close();
    const keyFor = (id) => JSON.stringify([id, gameId, curriculumId]);
    const clean = (value) => {
      const next = normalize(clone(value));
      if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_SNAPSHOT_BYTES) throw new Error("Progress is too large to save.");
      return next;
    };
    const remoteValue = (remote) => {
      if (remote === null) return null;
      if (!remote || !remote.snapshot || typeof remote.snapshot !== "object" || Array.isArray(remote.snapshot) || !Number.isSafeInteger(remote.revision) || remote.revision < 1 || !UUID.test(remote.writeId)) throw new TypeError("Invalid cloud progress.");
      return { snapshot: clean(remote.snapshot), revision: remote.revision, writeId: remote.writeId };
    };
    function transaction(names, mode, run) {
      return new Promise((resolve, reject) => {
        let tx, result, failure;
        try {
          tx = db.transaction(names, mode);
        } catch (error) {
          reject(error);
          return;
        }
        const fail = (error) => {
          failure = error;
          try {
            tx.abort();
          } catch {
          }
        };
        const guard = (fn) => (...args) => {
          try {
            fn(...args);
          } catch (error) {
            fail(error);
          }
        };
        const get = (name, id, then) => {
          const req = id === void 0 ? tx.objectStore(name).getAll() : tx.objectStore(name).get(id);
          req.onsuccess = guard(() => then(req.result));
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(failure ?? tx.error ?? new Error("Progress was not saved."));
        tx.onerror = () => {
        };
        guard(run)({ tx, get, done: (value) => {
          result = value;
        }, guard });
      });
    }
    function preserve(tx, record2, snapshot, reason) {
      tx.objectStore("recovery").put({
        id: crypto.randomUUID(),
        profileId: record2.profileId,
        gameId,
        curriculumId,
        snapshot: clone(snapshot),
        reason,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    function change(profileId, run) {
      return transaction(["records", "recovery"], "readwrite", ({ tx, get, done }) => {
        get("records", keyFor(profileId), (record2) => run(record2 ?? null, tx, done));
      });
    }
    const write = (tx, record2, done, status2 = "saved") => {
      tx.objectStore("records").put(record2);
      done({ status: status2, record: clone(record2) });
    };
    const requireRecord = (record2) => {
      if (!record2) throw new Error("This local profile no longer exists.");
    };
    function choose(record2, tx, remote, choice) {
      if (!["cloud", "device"].includes(choice)) throw new Error("Choose this device or cloud progress.");
      if (choice === "cloud") {
        if (!remote) throw new Error("There is no cloud progress to restore.");
        preserve(tx, record2, record2.snapshot, "Before restoring cloud progress");
        record2.snapshot = remote.snapshot;
      } else if (remote) preserve(tx, record2, remote.snapshot, "Cloud progress before keeping this device");
      record2.localRevision++;
      record2.remoteRevision = remote?.revision ?? 0;
      record2.inflight = null;
      record2.conflict = null;
      record2.needsUpload = choice === "device";
    }
    const api = {
      close: () => db.close(),
      listProfiles: () => transaction(["profiles"], "readonly", ({ get, done }) => get("profiles", void 0, (rows) => done(rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))))),
      async createProfile(label, initialSnapshot) {
        if (typeof label !== "string" || !label.trim() || label.trim().length > 60) throw new TypeError("Use a nickname of 1 to 60 characters.");
        const snapshot = clean(initialSnapshot);
        return transaction(["profiles", "records"], "readwrite", ({ tx, get, done }) => {
          get("profiles", void 0, (profiles) => {
            if (profiles.length >= MAX_PROFILES) throw new Error("This device has eight profiles. Export and remove one before adding another.");
            const profile2 = { id: crypto.randomUUID(), label: label.trim(), createdAt: (/* @__PURE__ */ new Date()).toISOString() };
            tx.objectStore("profiles").put(profile2);
            tx.objectStore("records").put({ key: keyFor(profile2.id), profileId: profile2.id, gameId, curriculumId, snapshot, localRevision: 1, binding: null, remoteRevision: 0, inflight: null, conflict: null, needsUpload: false });
            done(profile2);
          });
        });
      },
      load: (profileId) => transaction(["records"], "readonly", ({ get, done }) => get("records", keyFor(profileId), (record2) => done(record2 ?? null))),
      save(profileId, snapshot, expectedRevision) {
        const value = clean(snapshot);
        return change(profileId, (record2, tx, done) => {
          requireRecord(record2);
          if (record2.localRevision !== expectedRevision) {
            preserve(tx, record2, value, "Another tab saved first");
            done({ status: "local-conflict", record: record2 });
            return;
          }
          record2.snapshot = value;
          record2.localRevision++;
          record2.needsUpload = !!record2.binding;
          write(tx, record2, done);
        });
      },
      attach(profileId, binding, expectedRevision, remote, choice) {
        const safeBinding = validateBinding(binding);
        const safeRemote = remoteValue(remote);
        return change(profileId, (record2, tx, done) => {
          requireRecord(record2);
          if (record2.localRevision !== expectedRevision) {
            done({ status: "local-conflict", record: record2 });
            return;
          }
          choose(record2, tx, safeRemote, choice);
          record2.binding = safeBinding;
          write(tx, record2, done);
        });
      },
      beginFlush(profileId, binding) {
        return change(profileId, (record2, tx, done) => {
          if (!record2 || !sameBinding(record2.binding, binding) || record2.conflict || !record2.inflight && !record2.needsUpload) {
            done(null);
            return;
          }
          if (!record2.inflight) record2.inflight = {
            writeId: crypto.randomUUID(),
            localRevision: record2.localRevision,
            expectedRemoteRevision: record2.remoteRevision,
            snapshot: clone(record2.snapshot)
          };
          tx.objectStore("records").put(record2);
          done(clone(record2));
        });
      },
      acknowledge(profileId, binding, writeId, remoteRevision) {
        if (!Number.isSafeInteger(remoteRevision) || remoteRevision < 1) throw new TypeError("Invalid saved revision.");
        return change(profileId, (record2, tx, done) => {
          if (!record2 || !sameBinding(record2.binding, binding) || record2.inflight?.writeId !== writeId) {
            done({ status: "stale" });
            return;
          }
          if (remoteRevision !== record2.inflight.expectedRemoteRevision + 1) throw new Error("Unexpected cloud revision. Progress remains queued.");
          record2.remoteRevision = remoteRevision;
          record2.needsUpload = record2.localRevision !== record2.inflight.localRevision;
          record2.inflight = null;
          record2.conflict = null;
          write(tx, record2, done);
        });
      },
      markConflict(profileId, binding, writeId, remote) {
        const safeRemote = remoteValue(remote);
        return change(profileId, (record2, tx, done) => {
          if (!record2 || !sameBinding(record2.binding, binding) || record2.inflight?.writeId !== writeId) {
            done({ status: "stale" });
            return;
          }
          if (safeRemote && record2.conflict?.remote && safeRemote.revision < record2.conflict.remote.revision) {
            done({ status: "stale" });
            return;
          }
          if (JSON.stringify(record2.conflict?.remote) === JSON.stringify(safeRemote)) {
            done({ status: "cloud-conflict", record: record2 });
            return;
          }
          record2.conflict = { id: crypto.randomUUID(), remote: safeRemote };
          write(tx, record2, done, "cloud-conflict");
        });
      },
      resolveConflict(profileId, binding, expectedRevision, choice, expectedConflictId) {
        return change(profileId, (record2, tx, done) => {
          requireRecord(record2);
          if (!sameBinding(record2.binding, binding) || !record2.conflict) {
            done({ status: "stale" });
            return;
          }
          if (record2.localRevision !== expectedRevision) {
            done({ status: "local-conflict", record: record2 });
            return;
          }
          if (!expectedConflictId || record2.conflict.id !== expectedConflictId) {
            done({ status: "stale", record: record2 });
            return;
          }
          choose(record2, tx, record2.conflict.remote, choice);
          write(tx, record2, done);
        });
      },
      listRecovery: (profileId) => transaction(["recovery"], "readonly", ({ tx, done, guard }) => {
        const request = tx.objectStore("recovery").index("profileId").getAll(profileId);
        request.onsuccess = guard(() => done(request.result.filter((row) => row.gameId === gameId && row.curriculumId === curriculumId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
      }),
      removeProfile: (profileId) => transaction(["profiles", "records", "recovery"], "readwrite", ({ tx, get, done }) => {
        tx.objectStore("profiles").delete(profileId);
        get("records", void 0, (rows) => {
          for (const row of rows) if (row.profileId === profileId) tx.objectStore("records").delete(row.key);
        });
        get("recovery", void 0, (rows) => {
          for (const row of rows) if (row.profileId === profileId) tx.objectStore("recovery").delete(row.id);
        });
        done(void 0);
      })
    };
    return api;
  }

  // public/shared/memory-store.js
  function createMemoryStore(normalize) {
    const profiles = /* @__PURE__ */ new Map(), records = /* @__PURE__ */ new Map();
    return {
      close() {
      },
      async listProfiles() {
        return [...profiles.values()].map((value) => structuredClone(value));
      },
      async createProfile(label, snapshot) {
        if (profiles.size >= 8) throw new Error("There are already eight profiles in this session.");
        if (typeof label !== "string" || !label.trim() || label.trim().length > 60) throw new Error("Use a nickname of 1 to 60 characters.");
        const value = normalize(snapshot);
        const profile2 = { id: crypto.randomUUID(), label: label.trim(), createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        profiles.set(profile2.id, profile2);
        records.set(profile2.id, { profileId: profile2.id, snapshot: value, localRevision: 1, binding: null, needsUpload: false, conflict: null });
        return structuredClone(profile2);
      },
      async load(id) {
        return structuredClone(records.get(id) ?? null);
      },
      async save(id, snapshot, expectedRevision) {
        const record2 = records.get(id);
        if (!record2) throw new Error("This local profile no longer exists.");
        if (record2.localRevision !== expectedRevision) return { status: "local-conflict", record: structuredClone(record2) };
        record2.snapshot = normalize(snapshot);
        record2.localRevision++;
        return { status: "saved", record: structuredClone(record2) };
      },
      async listRecovery() {
        return [];
      },
      async removeProfile(id) {
        profiles.delete(id);
        records.delete(id);
      }
    };
  }

  // public/shared/cloud-config.js
  var CloudError = class extends Error {
    constructor(code, message2) {
      super(message2);
      this.name = "CloudError";
      this.code = code;
    }
  };
  function parseCloudConfig(raw) {
    if (!raw || raw.enabled !== true) return null;
    let url;
    try {
      url = new URL(raw.url);
    } catch {
      throw new CloudError("configuration", "Cloud saves need a valid HTTPS address in the host configuration.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new CloudError("configuration", "Cloud saves need an HTTPS origin without a path, password or query.");
    }
    if (typeof raw.publishableKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(raw.publishableKey)) {
      throw new CloudError("configuration", "Cloud saves need a Supabase publishable key. Secret keys and legacy keys are not accepted.");
    }
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 60) : "This host\u2019s cloud saves";
    return Object.freeze({ backend: url.origin, publishableKey: raw.publishableKey, label });
  }

  // public/shared/cloud-transport.js
  var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PROFILE_FIELDS = "owner_id,id,label";
  var SAVE_FIELDS = "owner_id,profile_id,game_id,curriculum_id,format_version,snapshot,revision,write_id";
  var stale = () => new CloudError("disconnected", "Cloud saves are disconnected. Your device progress stays here.");
  function safeError(error) {
    if (error instanceof CloudError) return error;
    if (error?.code === "otp_expired") return new CloudError("invalid-code", "That code is incorrect or expired. Check it or request a new code.");
    if (Number(error?.status) === 429) return new CloudError("rate-limit", "Too many sign-in attempts. Wait a little before trying again.");
    if ([401, 403].includes(Number(error?.status))) return new CloudError("auth-required", "Sign in again to finish saving. Your device progress is safe.");
    return new CloudError("unavailable", "Cloud saves are unavailable. Your device progress is still saved here; try again later.");
  }
  function createCloudConnection(config, {
    gameId,
    curriculumId,
    normalize,
    loadSDK = () => import("../vendor/supabase.js"),
    nativeFetch = globalThis.fetch.bind(globalThis),
    onStatus = () => {
    }
  } = {}) {
    config = parseCloudConfig({ enabled: true, url: config?.backend, publishableKey: config?.publishableKey, label: config?.label });
    let active = true, client = null, subscription = null, ownerId = null, email = null;
    let loginBusy = false, resendAfter = 0, authLost = false;
    const lifetime = new AbortController();
    const assertActive = () => {
      if (!active) throw stale();
    };
    const publishStatus = (status2) => {
      if (active) {
        try {
          onStatus(status2);
        } catch {
        }
      }
    };
    const dispose = () => {
      subscription?.unsubscribe();
      client?.auth.dispose();
    };
    const disconnect = () => {
      if (!active) return;
      active = false;
      lifetime.abort();
      ownerId = null;
      email = null;
      dispose();
    };
    const guardedFetch = async (input, init = {}) => {
      assertActive();
      const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (target.origin !== config.backend || !/^\/(auth|rest)\/v1\//.test(target.pathname)) {
        throw new CloudError("configuration", "Cloud request destination was rejected.");
      }
      const signals = [lifetime.signal, init.signal, typeof input === "object" ? input.signal : null].filter(Boolean);
      const response = await nativeFetch(input, { ...init, signal: AbortSignal.any(signals), credentials: "omit", redirect: "error" });
      assertActive();
      return response;
    };
    const ready = (async () => {
      try {
        const { createClient } = await loadSDK();
        assertActive();
        client = createClient(config.backend, config.publishableKey, {
          auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false, debug: false, storageKey: `learning-cloud-${crypto.randomUUID()}` },
          db: { retry: false },
          global: { fetch: guardedFetch }
        });
        const result = await client.auth.initialize();
        assertActive();
        if (result.error) throw result.error;
        await client.auth.stopAutoRefresh();
        assertActive();
        subscription = client.auth.onAuthStateChange((_event, session) => {
          if (!active || !ownerId) return;
          if (session && session.user.id !== ownerId) {
            disconnect();
            return;
          }
          if (!session) {
            authLost = true;
            publishStatus("auth-required");
          }
        }).data.subscription;
      } catch (error) {
        if (!active) {
          dispose();
          throw stale();
        }
        disconnect();
        throw safeError(error);
      }
    })();
    ready.catch(() => {
    });
    async function call(operation, requiresOwner = true) {
      try {
        await ready;
        assertActive();
        if (requiresOwner && (!ownerId || authLost)) throw new CloudError("auth-required", "Sign in to use cloud saves.");
        const result = await operation(client);
        assertActive();
        if (result?.error) throw result.error;
        return result?.data;
      } catch (error) {
        if (!active) throw stale();
        throw safeError(error);
      }
    }
    const owned = (binding) => {
      const value = validateBinding(binding);
      assertActive();
      if (value.backend !== config.backend || value.ownerId !== ownerId || authLost) throw new CloudError("auth-required", "Sign in to the original account and cloud destination for this profile.");
      return value;
    };
    const profileValue = (row) => {
      if (!row || row.owner_id !== ownerId || !UUID2.test(row.id) || typeof row.label !== "string" || !row.label.trim() || row.label.length > 60) throw new CloudError("invalid", "The cloud returned an invalid learner profile.");
      return { id: row.id, label: row.label };
    };
    const cleanSnapshot = (snapshot) => {
      let clean;
      try {
        clean = normalize(structuredClone(snapshot));
      } catch {
        throw new CloudError("invalid", "This cloud progress needs a different app version or a recovery export.");
      }
      if (new TextEncoder().encode(JSON.stringify(clean)).length > 1048576) throw new CloudError("invalid", "Cloud progress is too large to load safely.");
      return clean;
    };
    function remoteValue(row, binding) {
      if (row === null) return null;
      if (!row || !row.snapshot || typeof row.snapshot !== "object" || Array.isArray(row.snapshot) || !Number.isInteger(row.format_version) || row.owner_id !== binding.ownerId || row.profile_id !== binding.profileId || row.game_id !== gameId || row.curriculum_id !== curriculumId || !Number.isSafeInteger(row.revision) || row.revision < 1 || !UUID2.test(row.write_id) || row.format_version !== row.snapshot.formatVersion) throw new CloudError("invalid", "The cloud returned an unexpected learning record.");
      return { snapshot: cleanSnapshot(row.snapshot), revision: row.revision, writeId: row.write_id };
    }
    const filtered = (query, binding) => query.eq("owner_id", binding.ownerId).eq("profile_id", binding.profileId).eq("game_id", gameId).eq("curriculum_id", curriculumId);
    async function read(binding) {
      owned(binding);
      const data = await call((sdk) => filtered(sdk.from("learning_saves").select(SAVE_FIELDS), binding).maybeSingle());
      owned(binding);
      return remoteValue(data, binding);
    }
    function reconcile(remote, inflight) {
      if (remote?.writeId === inflight.writeId) {
        if (remote.revision !== inflight.expectedRemoteRevision + 1 || JSON.stringify(remote.snapshot) !== JSON.stringify(inflight.snapshot)) throw new CloudError("invalid", "The cloud acknowledgement does not match this saved attempt.");
        return { status: "saved", remote };
      }
      if ((remote?.revision ?? 0) !== inflight.expectedRemoteRevision) return { status: "conflict", remote };
      return null;
    }
    return {
      ready,
      disconnect,
      get active() {
        return active;
      },
      get ownerId() {
        return ownerId;
      },
      get backend() {
        return config.backend;
      },
      owns: (binding) => active && !authLost && !!ownerId && binding?.backend === config.backend && binding.ownerId === ownerId,
      async sendCode(address) {
        if (loginBusy) throw new CloudError("busy", "Please wait for the current sign-in request.");
        if (typeof address !== "string" || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())) throw new CloudError("invalid", "Enter an adult email address.");
        const next = address.trim();
        if (email && email !== next) throw new CloudError("new-connection", "Cancel this sign-in before changing the email address.");
        if (ownerId) throw new CloudError("new-connection", "Disconnect before signing in to another account.");
        if (Date.now() < resendAfter) throw new CloudError("cooldown", "Wait one minute before requesting another code.");
        loginBusy = true;
        email = next;
        try {
          await call((sdk) => sdk.auth.signInWithOtp({ email: next, options: { shouldCreateUser: true } }), false);
          resendAfter = Date.now() + 6e4;
        } finally {
          loginBusy = false;
        }
      },
      async verifyCode(code) {
        if (loginBusy) throw new CloudError("busy", "Please wait for the current sign-in request.");
        if (!email || !/^\d{6,10}$/.test(code)) throw new CloudError("invalid", "Enter the code from your email.");
        loginBusy = true;
        const sentTo = email;
        try {
          const data = await call((sdk) => sdk.auth.verifyOtp({ email: sentTo, token: code, type: "email" }), false);
          if (!data?.session || !UUID2.test(data.user?.id) || data.session.user?.id !== data.user.id) throw new CloudError("invalid", "Sign-in did not return a valid account.");
          ownerId = data.user.id;
          authLost = false;
          email = null;
          return ownerId;
        } finally {
          loginBusy = false;
        }
      },
      async listProfiles() {
        const data = await call((sdk) => sdk.from("learning_profiles").select(PROFILE_FIELDS).eq("owner_id", ownerId).order("created_at"));
        if (!Array.isArray(data)) throw new CloudError("invalid", "The cloud returned an invalid learner list.");
        return data.map(profileValue);
      },
      async createProfile(label) {
        if (typeof label !== "string" || !label.trim() || label.trim().length > 60) throw new CloudError("invalid", "Use a nickname of 1 to 60 characters.");
        const data = await call((sdk) => sdk.from("learning_profiles").insert({ owner_id: ownerId, label: label.trim() }).select(PROFILE_FIELDS).single());
        return profileValue(data);
      },
      read,
      async write(binding, inflight) {
        owned(binding);
        if (!inflight || !UUID2.test(inflight.writeId) || !Number.isSafeInteger(inflight.expectedRemoteRevision) || inflight.expectedRemoteRevision < 0) throw new CloudError("invalid", "Invalid pending cloud save.");
        const snapshot = cleanSnapshot(inflight.snapshot);
        const attempt = { ...inflight, snapshot };
        const existing = await read(binding);
        const recovered = reconcile(existing, attempt);
        if (recovered) return recovered;
        const payload = { snapshot, format_version: snapshot.formatVersion, write_id: attempt.writeId };
        const outcome = await call(async (sdk) => {
          const result2 = attempt.expectedRemoteRevision === 0 ? await sdk.from("learning_saves").insert({ ...payload, owner_id: binding.ownerId, profile_id: binding.profileId, game_id: gameId, curriculum_id: curriculumId }).select(SAVE_FIELDS) : await filtered(sdk.from("learning_saves").update(payload), binding).eq("revision", attempt.expectedRemoteRevision).select(SAVE_FIELDS);
          if (result2.error?.code === "23505") return { data: [] };
          return result2;
        });
        owned(binding);
        if (!Array.isArray(outcome) || outcome.length > 1) throw new CloudError("invalid", "The cloud returned an unexpected save response.");
        const remote = outcome.length === 1 ? remoteValue(outcome[0], binding) : await read(binding);
        const result = reconcile(remote, attempt);
        if (result) return result;
        throw new CloudError("unavailable", "This save was not acknowledged. It stays queued on this device.");
      }
    };
  }
  async function flushOne(store2, profileId, connection) {
    const record2 = await store2.load(profileId);
    if (!record2 || !connection.owns(record2.binding)) return { status: "disconnected" };
    const pending2 = await store2.beginFlush(profileId, record2.binding);
    if (!pending2) return { status: record2.conflict ? "cloud-conflict" : "idle" };
    if (!connection.owns(pending2.binding)) return { status: "disconnected" };
    const result = await connection.write(pending2.binding, pending2.inflight);
    if (!connection.owns(pending2.binding)) return { status: "disconnected" };
    if (result.status === "saved") return store2.acknowledge(profileId, pending2.binding, pending2.inflight.writeId, result.remote.revision);
    return store2.markConflict(profileId, pending2.binding, pending2.inflight.writeId, result.remote);
  }

  // public/shared/cloud-panel.js
  function createCloudPanel(root, options) {
    const { store: store2, durable: durable2, normalize, curriculumId, gameId, configURL, helpURL, getProfile, isBusy, onChange, onRestore, onProfilesCleared, onMessage, describe } = options;
    let config = null, connection = null, generation = 0, view = 0, timer = null, failures = 0, running = null;
    const status2 = document.createElement("p");
    status2.setAttribute("role", "status");
    status2.className = "cloud-status";
    const content = document.createElement("div");
    root.append(content, status2);
    const say2 = (text) => {
      status2.textContent = text;
    };
    const paragraph = (text) => {
      const p = document.createElement("p");
      p.textContent = text;
      content.append(p);
      return p;
    };
    function button2(label, action, parent = content) {
      const button3 = document.createElement("button");
      button3.type = "button";
      button3.textContent = label;
      button3.addEventListener("click", async () => {
        if (button3.disabled) return;
        button3.disabled = true;
        try {
          await action();
        } catch (error) {
          if (error.code !== "disconnected") say2(error.message || "That action could not be completed. Your progress is still here.");
        } finally {
          button3.disabled = false;
        }
      });
      parent.append(button3);
      return button3;
    }
    function retire2() {
      generation++;
      view++;
      clearTimeout(timer);
      timer = null;
      failures = 0;
      running = null;
      connection?.disconnect();
      connection = null;
    }
    const alive = (original, token) => connection === original && generation === token && original.active;
    function localActionsAllowed() {
      if (isBusy()) {
        say2("Finish the current answer or export unsaved progress before changing cloud profiles.");
        return false;
      }
      return true;
    }
    async function flush() {
      const selected = getProfile(), original = connection, token = generation;
      if (!selected || !original?.ownerId) return;
      if (running?.token === token) {
        running.again = true;
        return;
      }
      const work = { token };
      running = work;
      try {
        for (let i = 0; i < 8 && alive(original, token); i++) {
          const result = await flushOne(store2, selected.id, original);
          if (!alive(original, token)) return;
          if (result.status !== "saved") break;
        }
        if (!alive(original, token)) return;
        failures = 0;
        await onChange();
        const record2 = await store2.load(selected.id);
        if (!alive(original, token)) return;
        if (record2?.conflict) say2("Another device changed this learner. Choose which progress to keep below.");
        else if (record2 && original.owns(record2.binding) && !record2.needsUpload) say2("Cloud saved. Your copy also stays on this device.");
        if (root.closest("dialog")?.open) await renderConnected();
        if (record2?.needsUpload && !record2.conflict && original.owns(record2.binding)) queue(1e3);
      } catch (error) {
        if (!alive(original, token)) return;
        say2(error.message);
        await onChange();
        if (error.code === "unavailable" && failures < 5) {
          failures++;
          queue(Math.min(6e4, 2e3 * 2 ** failures) + Math.floor(Math.random() * 500));
        }
      } finally {
        if (running === work) {
          running = null;
          if (work.again && alive(original, token)) queue();
        }
      }
    }
    function queue(delay = 0) {
      if (!connection?.ownerId) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delay);
    }
    function initial() {
      content.replaceChildren();
      paragraph("Cloud saves are optional. Play and save on this device without an account.");
      if (!durable2) {
        paragraph("Cloud saves need working browser storage. This session can be exported instead.");
        return;
      }
      if (location.protocol === "file:") {
        paragraph("This downloaded copy works offline. To save across devices, use a hosted copy whose owner has set up cloud saves. You can also move progress with Export and Import.");
        return;
      }
      button2("Explore cloud saves", async () => {
        const token = ++view;
        say2("Checking this host\u2019s cloud configuration\u2026");
        try {
          const response = await fetch(configURL, { credentials: "omit", redirect: "error", cache: "no-store" });
          if (token !== view) return;
          if (!response.ok) {
            say2("This host has not enabled cloud saves. Device saves and exports still work.");
            return;
          }
          const text = await response.text();
          if (text.length > 16384) throw new Error("This host\u2019s cloud configuration is too large.");
          config = parseCloudConfig(JSON.parse(text));
          if (token !== view) return;
          if (!config) {
            say2("This host has not enabled cloud saves. Device saves and exports still work.");
            return;
          }
          renderLogin();
        } catch (error) {
          say2(error.code === "configuration" ? error.message : "This host\u2019s cloud configuration could not be loaded. Device saves still work.");
        }
      });
      const help = document.createElement("a");
      help.href = helpURL;
      help.textContent = "Cloud setup instructions for the host";
      content.append(help);
    }
    function renderLogin() {
      content.replaceChildren();
      view++;
      paragraph(`${config.label}: ${config.backend}`);
      paragraph("An adult can sign in by email code. Continuing creates an account if needed. Only learner nicknames and learning progress you choose are uploaded. Your email goes to this cloud provider for sign-in.");
      const form = document.createElement("form");
      form.className = "settings-form";
      const label = document.createElement("label");
      label.textContent = "Adult email";
      label.htmlFor = "cloud-email";
      const input = document.createElement("input");
      input.id = "cloud-email";
      input.type = "email";
      input.required = true;
      input.maxLength = 254;
      input.autocomplete = "email";
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Email me a code";
      form.append(label, input, submit);
      content.append(form);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submit.disabled) return;
        submit.disabled = true;
        retire2();
        const token = generation;
        const original = createCloudConnection(config, { gameId, curriculumId, normalize, onStatus: (value) => {
          if (value === "auth-required") say2("Sign in again to finish saving.");
        } });
        connection = original;
        const address = input.value.trim();
        try {
          await original.sendCode(address);
          if (alive(original, token)) renderCode(original, token, address);
        } catch (error) {
          if (alive(original, token)) say2(error.message);
        } finally {
          submit.disabled = false;
        }
      });
      button2("Cancel cloud sign-in", () => {
        retire2();
        config = null;
        initial();
        say2("Cloud sign-in cancelled. Local progress stays on this device.");
      });
      say2("No cloud account is needed to play locally.");
    }
    function renderCode(original, token, address) {
      content.replaceChildren();
      view++;
      paragraph("Check the adult email inbox for a sign-in code. Leave this page open while you check.");
      const form = document.createElement("form");
      form.className = "settings-form";
      const label = document.createElement("label");
      label.textContent = "Email code";
      label.htmlFor = "cloud-code";
      const input = document.createElement("input");
      input.id = "cloud-code";
      input.required = true;
      input.inputMode = "numeric";
      input.autocomplete = "one-time-code";
      input.pattern = "[0-9]{6,10}";
      input.maxLength = 10;
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Sign in";
      form.append(label, input, submit);
      content.append(form);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submit.disabled || !alive(original, token)) return;
        submit.disabled = true;
        try {
          await original.verifyCode(input.value.trim());
          if (alive(original, token)) {
            input.value = "";
            await renderConnected();
            queue();
          }
        } catch (error) {
          if (alive(original, token)) say2(error.message);
        } finally {
          submit.disabled = false;
        }
      });
      button2("Send a new code", async () => {
        await original.sendCode(address);
        if (alive(original, token)) say2("A new code was requested. Check your email.");
      });
      button2("Cancel or change email", () => {
        retire2();
        renderLogin();
      });
      say2("Codes may take a moment to arrive. You can request another after one minute.");
      input.focus();
    }
    async function renderConnected() {
      if (!connection?.ownerId) return;
      const original = connection, token = generation, rendering = ++view;
      content.replaceChildren();
      paragraph(`Connected to ${config.label} (${config.backend}).`);
      paragraph("Disconnect ends this browser connection. Downloaded progress stays on this device until you remove it. Sign in again when you want to resume cloud saving.");
      button2("Disconnect cloud saves", () => {
        retire2();
        initial();
        say2("Disconnected. Downloaded progress and waiting saves remain on this device.");
      });
      button2("Retry cloud saving", async () => {
        failures = 0;
        queue();
      });
      button2("Remove this account\u2019s downloaded learners", async () => {
        if (!localActionsAllowed() || !confirm("Remove this account\u2019s downloaded learners and recovery copies from this device? Cloud copies will remain. Export any backups first.")) return;
        const profiles = await store2.listProfiles();
        for (const profile2 of profiles) {
          const record2 = await store2.load(profile2.id);
          if (!alive(original, token)) return;
          if (original.owns(record2?.binding)) await store2.removeProfile(profile2.id);
        }
        if (!alive(original, token)) return;
        await onProfilesCleared();
        await renderConnected();
        say2("Downloaded learners for this account were removed from this device. Cloud copies remain.");
      });
      const selected = getProfile();
      if (selected) {
        const local = await store2.load(selected.id);
        if (!alive(original, token) || rendering !== view) return;
        paragraph(`Current local learner: ${selected.label}. ${describe(local.snapshot)}.`);
        if (local.conflict && original.owns(local.binding)) {
          const remote = local.conflict.remote;
          paragraph(remote ? `Another device saved: ${describe(remote.snapshot)}. No versions have been merged.` : "The cloud copy is missing. Your device copy remains available.");
          for (const choice of remote ? ["device", "cloud"] : ["device"]) {
            button2(choice === "device" ? "Keep this device\u2019s progress" : "Use the cloud progress shown above", async () => {
              if (!localActionsAllowed()) return;
              const result = await store2.resolveConflict(selected.id, local.binding, local.localRevision, choice, local.conflict.id);
              if (!alive(original, token)) return;
              await onChange({ source: "cloud-action" });
              await renderConnected();
              if (result.status === "saved") {
                say2("Your choice was saved. A recovery copy keeps the other version.");
                queue();
              } else say2("Progress changed while this choice was open. Review the latest versions before choosing again.");
            });
          }
        }
        button2(`Save ${selected.label} as a new cloud learner`, async () => {
          if (!localActionsAllowed()) return;
          const current = await store2.load(selected.id);
          if (!alive(original, token)) return;
          const remoteProfile = await original.createProfile(selected.label);
          if (!alive(original, token)) return;
          const result = await store2.attach(selected.id, { backend: config.backend, ownerId: original.ownerId, profileId: remoteProfile.id }, current.localRevision, null, "device");
          if (!alive(original, token)) return;
          await onChange({ source: "cloud-action" });
          await renderConnected();
          if (result.status === "saved") queue();
          else say2("The local learner changed during setup. Select the new cloud learner below to review and attach it.");
        });
      }
      try {
        const profiles = await original.listProfiles();
        if (!alive(original, token) || rendering !== view) return;
        paragraph(profiles.length ? "Choose an existing cloud learner to preview or restore. Matching nicknames do not merge learners." : "This account has no cloud learners yet. Choose a local learner, then save it to cloud.");
        for (const remoteProfile of profiles) button2(`Preview ${remoteProfile.label}`, () => preview(original, token, remoteProfile));
      } catch (error) {
        if (alive(original, token)) say2(error.message);
      }
    }
    async function preview(original, token, remoteProfile) {
      const rendering = ++view;
      const binding = { backend: config.backend, ownerId: original.ownerId, profileId: remoteProfile.id };
      const remote = await original.read(binding);
      if (!alive(original, token) || rendering !== view) return;
      content.replaceChildren();
      paragraph(`Cloud learner: ${remoteProfile.label}.`);
      paragraph(remote ? `${describe(remote.snapshot)}. Local progress is replaced only if you choose that below.` : "This cloud learner has no saved progress yet.");
      if (remote) button2("Restore as a new local learner", async () => {
        if (!localActionsAllowed()) return;
        const learner = await store2.createProfile(remoteProfile.label, remote.snapshot);
        if (!alive(original, token)) {
          await store2.removeProfile(learner.id);
          return;
        }
        await store2.attach(learner.id, binding, 1, remote, "cloud");
        if (!alive(original, token)) return;
        await onRestore(learner);
        say2("Cloud progress restored. A copy now lives on this device too.");
      });
      const selected = getProfile();
      if (selected) {
        const local = await store2.load(selected.id);
        if (!alive(original, token) || rendering !== view) return;
        paragraph(`Local learner: ${selected.label}. ${describe(local.snapshot)}.`);
        for (const choice of remote ? ["cloud", "device"] : ["device"]) {
          button2(choice === "cloud" ? `Use cloud progress for ${selected.label}` : `Use ${selected.label}\u2019s progress for this cloud learner`, async () => {
            if (!localActionsAllowed()) return;
            const result = await store2.attach(selected.id, binding, local.localRevision, remote, choice);
            if (!alive(original, token)) return;
            await onChange({ source: "cloud-action" });
            await renderConnected();
            if (result.status === "saved") {
              say2("Your choice was saved. The other version is available in a recovery export.");
              queue();
            } else say2("The local learner changed. Preview again before choosing a version.");
          });
        }
      }
      button2("Back to cloud learners", renderConnected);
      button2("Disconnect cloud saves", () => {
        retire2();
        initial();
        say2("Disconnected. Local copies remain on this device.");
      });
    }
    initial();
    window.addEventListener("online", () => {
      failures = 0;
      queue();
    });
    return { queue, renderConnected, disconnect: () => {
      retire2();
      initial();
    } };
  }

  // public/areamaze/puzzles.js
  var PUZZLES = [
    {
      id: "a1",
      tier: 1,
      layout: "row",
      cells: [
        { w: 4, h: 5, a: 20 },
        { w: 3, h: 5, a: 15 }
      ],
      given: ["0.a", "0.w", "1.a"],
      ask: "1.w",
      idea: "Both rectangles are the same height. Find that height from the first one."
    },
    {
      id: "a2",
      tier: 1,
      layout: "row",
      cells: [
        { w: 6, h: 3, a: 18 },
        { w: 5, h: 3, a: 15 }
      ],
      given: ["0.w", "0.a", "1.w"],
      ask: "1.a",
      idea: "Same height again. Get it once and the second area follows."
    },
    {
      id: "a3",
      tier: 1,
      layout: "col",
      cells: [
        { w: 7, h: 2, a: 14 },
        { w: 7, h: 6, a: 42 }
      ],
      given: ["0.a", "0.h", "1.h"],
      ask: "1.a",
      idea: "Stacked rectangles share a width."
    },
    {
      id: "a4",
      tier: 1,
      layout: "row",
      cells: [
        { w: 8, h: 4, a: 32 },
        { w: 2, h: 4, a: 8 }
      ],
      given: ["0.a", "0.w", "1.a"],
      ask: "1.w",
      idea: "Find the shared height first."
    },
    {
      id: "a5",
      tier: 1,
      layout: "col",
      cells: [
        { w: 5, h: 9, a: 45 },
        { w: 5, h: 4, a: 20 }
      ],
      given: ["0.a", "0.h", "1.a"],
      ask: "1.h",
      idea: "Shared width, worked out from the top piece."
    },
    {
      id: "b1",
      tier: 2,
      layout: "row",
      cells: [
        { w: 3, h: 8, a: 24 },
        { w: 6, h: 8, a: 48 },
        { w: 2, h: 8, a: 16 }
      ],
      given: ["0.a", "0.w", "1.a", "2.w"],
      ask: "2.a",
      idea: "Three rectangles, one shared height. Find it once and use it twice."
    },
    {
      id: "b2",
      tier: 2,
      layout: "row",
      cells: [
        { w: 4, h: 7, a: 28 },
        { w: 8, h: 7, a: 56 }
      ],
      given: ["0.a", "1.a", "0.w"],
      ask: "1.w",
      idea: "You are told both areas. Twice the area on the same height means twice the width."
    },
    {
      id: "b3",
      tier: 2,
      layout: "col",
      cells: [
        { w: 9, h: 3, a: 27 },
        { w: 9, h: 5, a: 45 },
        { w: 9, h: 2, a: 18 }
      ],
      given: ["0.a", "0.h", "1.h", "2.h"],
      ask: "2.a",
      idea: "One width serves all three."
    },
    {
      id: "b4",
      tier: 2,
      layout: "row",
      cells: [
        { w: 5, h: 12, a: 60 },
        { w: 3, h: 12, a: 36 }
      ],
      given: ["0.a", "1.a", "1.w"],
      ask: "0.w",
      idea: "Work from the rectangle where you know both the area and a side."
    },
    {
      id: "b5",
      tier: 2,
      layout: "col",
      cells: [
        { w: 6, h: 7, a: 42 },
        { w: 6, h: 4, a: 24 },
        { w: 6, h: 9, a: 54 }
      ],
      given: ["1.a", "1.h", "0.h", "2.h"],
      ask: "2.a",
      idea: "The middle rectangle is the one that gives you the shared width."
    },
    {
      id: "b6",
      tier: 2,
      layout: "row",
      cells: [
        { w: 7, h: 6, a: 42 },
        { w: 4, h: 6, a: 24 }
      ],
      given: ["0.a", "0.w", "1.w"],
      ask: "1.a",
      idea: "The left rectangle tells you the height both of them stand on."
    },
    {
      id: "c1",
      tier: 3,
      layout: "row",
      cells: [
        { w: 3, h: 10, a: 30 },
        { w: 9, h: 10, a: 90 }
      ],
      given: ["0.a", "1.a", "0.w"],
      ask: "1.w",
      idea: "Three times the area on the same height means three times the width. You never need the height itself."
    },
    {
      id: "c2",
      tier: 3,
      layout: "col",
      cells: [
        { w: 8, h: 5, a: 40 },
        { w: 8, h: 15, a: 120 }
      ],
      given: ["0.a", "1.a", "0.h"],
      ask: "1.h",
      idea: "Compare the two areas before you try to divide anything."
    },
    {
      id: "c3",
      tier: 3,
      layout: "row",
      cells: [
        { w: 6, h: 11, a: 66 },
        { w: 12, h: 11, a: 132 },
        { w: 3, h: 11, a: 33 }
      ],
      given: ["0.a", "1.a", "2.a", "0.w"],
      ask: "2.w",
      idea: "All three share a height, so the areas are in the same ratio as the widths."
    },
    {
      id: "c4",
      tier: 3,
      layout: "row",
      cells: [
        { w: 5, h: 13, a: 65 },
        { w: 10, h: 13, a: 130 }
      ],
      given: ["0.a", "1.a", "0.w"],
      ask: "1.w",
      idea: "Twice the area at the same height means twice the width."
    },
    {
      id: "c5",
      tier: 3,
      layout: "col",
      cells: [
        { w: 7, h: 4, a: 28 },
        { w: 7, h: 12, a: 84 },
        { w: 7, h: 3, a: 21 }
      ],
      given: ["0.a", "1.a", "2.a", "0.h"],
      ask: "2.h",
      idea: "Three areas, one shared width. Ratios again."
    },
    {
      id: "c6",
      tier: 3,
      layout: "row",
      cells: [
        { w: 9, h: 14, a: 126 },
        { w: 3, h: 14, a: 42 }
      ],
      given: ["0.a", "1.a", "1.w"],
      ask: "0.w",
      idea: "Which is bigger, and by how many times?"
    }
  ];

  // public/shared/snapshot.js
  var CURRICULA = Object.freeze({ target: "target-rational-v1", areamaze: "area-original-17-v1" });
  var TARGETS = new Set([6, 8, 10, 12, 18, 20, 24, 36, 48, 60].map((n) => `t${n}`));
  var AREAS = new Set(PUZZLES.map((p) => p.id));
  var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var count = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1e6 ? v : 0;
  function cleanProgress(game2, value) {
    if (!CURRICULA[game2]) throw new TypeError("Unknown game.");
    const raw = object(value) ? value : {};
    const items = {};
    const allowed = game2 === "target" ? TARGETS : AREAS;
    for (const [id, row] of Object.entries(object(raw.items) ? raw.items : {})) {
      if (!allowed.has(id) || !object(row)) continue;
      const attempts = count(row.attempts), correct = Math.min(count(row.correct), attempts), streak = Math.min(count(row.streak), correct);
      items[id] = { attempts, correct, streak, mastered: game2 === "target" ? streak >= 2 : row.mastered === true && correct > 0 };
    }
    return {
      formatVersion: 1,
      tier: [1, 2, 3].includes(raw.tier) ? raw.tier : 1,
      solved: count(raw.solved),
      extras: game2 === "target" ? count(raw.extras) : 0,
      done: game2 === "areamaze" && Array.isArray(raw.done) ? [...new Set(raw.done.filter((id) => AREAS.has(id)))] : [],
      items,
      autoAdvance: raw.autoAdvance !== false
    };
  }
  function normalizeSnapshot(game2, value) {
    if (!object(value) || value.formatVersion !== 1) throw new TypeError("This saved progress needs a different app version. Keep a recovery export.");
    return cleanProgress(game2, value);
  }
  function exportSnapshot(game2, label, snapshot) {
    return { app: "math-workshop", game: game2, curriculum: CURRICULA[game2], version: 1, label, snapshot: normalizeSnapshot(game2, snapshot) };
  }
  function importSnapshot(game2, value) {
    if (!object(value) || value.app !== "math-workshop" || value.game !== game2 || value.curriculum !== CURRICULA[game2] || value.version !== 1) throw new TypeError("That backup belongs to another game or app version.");
    if (typeof value.label !== "string" || !value.label.trim() || value.label.trim().length > 60) throw new TypeError("A backup needs a nickname of 1 to 60 characters.");
    return { label: value.label.trim(), snapshot: normalizeSnapshot(game2, value.snapshot) };
  }

  // public/shared/progress.js
  var game;
  var store;
  var profile;
  var record;
  var live;
  var cloud;
  var durable = true;
  var pending = 0;
  var retired = false;
  var saveTail = Promise.resolve();
  var message;
  var dialog;
  var profileList;
  var loading = false;
  var selectionEpoch = 0;
  var importEpoch = 0;
  var recoveryMode = false;
  var recoveryRaw = null;
  var exportButton;
  var modalMessage;
  var lastMessage = "";
  var title = { target: "Target Number", areamaze: "Area Mazes" };
  var el = (tag, text) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    return n;
  };
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const a = el("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function retire(text) {
    retired = true;
    cloud?.disconnect();
    document.querySelector("#gameplay").inert = true;
    document.dispatchEvent(new Event("progress-retired"));
    say(text);
  }
  function remember(id) {
    try {
      sessionStorage.setItem(`math-workshop-${game}-profile`, id);
    } catch {
    }
  }
  function remembered() {
    try {
      return sessionStorage.getItem(`math-workshop-${game}-profile`);
    } catch {
      return null;
    }
  }
  function say(text) {
    lastMessage = text;
    if (dialog?.open) {
      message.textContent = "";
      modalMessage.textContent = text;
    } else {
      message.textContent = text;
      if (modalMessage) modalMessage.textContent = "";
    }
  }
  function status() {
    if (recoveryMode) {
      say("This learner\u2019s saved version cannot be opened here. Export the unreadable data or choose another learner; the original save is unchanged.");
      return;
    }
    if (!retired) say(pending ? "Saving on this device\u2026" : durable ? `${title[game]} learner: ${profile.label}. Saved on this device.` : "Temporary session: browser storage is unavailable. Export progress before leaving.");
  }
  function button(parent, text, action, { needsIdle = true } = {}) {
    const b = el("button", text);
    b.type = "button";
    b.className = "ghost";
    b.addEventListener("click", async () => {
      if (b.disabled) return;
      if (needsIdle && (pending || loading || retired)) {
        say("Export unsaved progress or reload before changing learners.");
        return;
      }
      b.disabled = true;
      try {
        await action();
      } catch (error) {
        say(error.message || "That action could not be completed.");
      } finally {
        b.disabled = false;
      }
    });
    parent.append(b);
    return b;
  }
  async function showProfiles() {
    profileList.replaceChildren();
    for (const p of await store.listProfiles()) button(profileList, `Play as ${p.label}`, () => selectProfile(p));
  }
  async function selectProfile(next) {
    if (pending || loading || retired) return;
    loading = true;
    importEpoch++;
    const epoch = ++selectionEpoch;
    document.dispatchEvent(new Event("progress-retired"));
    document.querySelector("#gameplay").inert = true;
    try {
      const loaded = await store.load(next.id);
      if (epoch !== selectionEpoch) return;
      if (!loaded) throw new Error("That learner was removed in another tab. Choose another one.");
      let snapshot;
      try {
        snapshot = normalizeSnapshot(game, loaded.snapshot);
        recoveryMode = false;
        recoveryRaw = null;
      } catch {
        snapshot = cleanProgress(game, {});
        recoveryMode = true;
        recoveryRaw = structuredClone(loaded.snapshot);
      }
      profile = next;
      record = loaded;
      live = snapshot;
      remember(profile.id);
      exportButton.textContent = recoveryMode ? "Export unreadable saved data" : "Export this learner\u2019s progress";
      document.querySelector("#gameplay").hidden = recoveryMode;
      document.dispatchEvent(new Event("progress-loaded"));
      document.querySelector("#gameplay").inert = false;
      await showProfiles();
      dialog.close();
      cloud?.queue();
      void cloud?.renderConnected().catch((error) => say(error.message));
      status();
    } catch (error) {
      retire(`${error.message} Export this tab\u2019s copy if needed, then reload.`);
    } finally {
      if (epoch === selectionEpoch) loading = false;
    }
  }
  async function refreshActive({ source } = {}) {
    if (pending || loading || retired || recoveryMode || !profile) return;
    const expected = record.localRevision, id = profile.id, epoch = selectionEpoch, loaded = await store.load(id);
    if (pending || loading || retired || profile.id !== id || selectionEpoch !== epoch || record.localRevision !== expected) return;
    if (!loaded) {
      retire("This learner was removed in another tab. Export this tab\u2019s older copy if needed, then reload.");
      return;
    }
    if (loaded.localRevision !== record.localRevision && source === "cloud-action") {
      const changed = JSON.stringify(loaded.snapshot) !== JSON.stringify(record.snapshot);
      record = loaded;
      live = normalizeSnapshot(game, loaded.snapshot);
      if (changed) {
        document.dispatchEvent(new Event("progress-retired"));
        document.dispatchEvent(new Event("progress-loaded"));
      }
      status();
      return;
    }
    if (loaded.localRevision !== record.localRevision) {
      retire("Saved progress changed in another tab or cloud action. Export this tab\u2019s copy if needed, then reload to use the current save.");
      return;
    }
    record = loaded;
  }
  async function initProgress(which) {
    game = which;
    const normalize = (value) => normalizeSnapshot(game, value);
    const controls = el("section");
    controls.className = "progress-controls";
    controls.setAttribute("aria-label", "Learners and saved progress");
    message = el("p", "Opening saved progress\u2026");
    message.setAttribute("role", "status");
    controls.append(message);
    document.querySelector(".wrap").append(controls);
    try {
      store = await openProgressStore({ dbName: `math-workshop-${game}-v1`, gameId: game, curriculumId: CURRICULA[game], normalize });
    } catch {
      durable = false;
      store = createMemoryStore(normalize);
    }
    let profiles;
    try {
      profiles = await store.listProfiles();
    } catch {
      throw new Error("Saved learner records could not be opened. Keep this browser\u2019s data for recovery.");
    }
    if (!profiles.length) profiles = [await store.createProfile("Player 1", cleanProgress(game, {}))];
    profile = profiles.find((p) => p.id === remembered()) || profiles[0];
    record = await store.load(profile.id);
    if (!record) throw new Error("The selected learner was removed. Reload to choose another learner.");
    try {
      live = normalize(record.snapshot);
    } catch {
      recoveryMode = true;
      recoveryRaw = structuredClone(record.snapshot);
      live = cleanProgress(game, {});
    }
    document.querySelector("#gameplay").hidden = recoveryMode;
    remember(profile.id);
    dialog = el("dialog");
    dialog.className = "settings";
    dialog.setAttribute("aria-labelledby", "settings-title");
    const heading = el("h2", `${title[game]}: learners and backups`);
    heading.id = "settings-title";
    modalMessage = el("p");
    modalMessage.setAttribute("role", "status");
    dialog.append(heading, modalMessage);
    dialog.addEventListener("close", () => say(lastMessage));
    dialog.append(el("p", "Each game has its own learners and progress. Nicknames are labels, not accounts. Anyone using this browser can see local learners and exports."));
    button(controls, "Learners and backups", () => {
      dialog.showModal();
      say(lastMessage);
    }, { needsIdle: false });
    button(dialog, "Close", () => dialog.close(), { needsIdle: false });
    profileList = el("div");
    profileList.className = "learner-list";
    dialog.append(profileList);
    await showProfiles();
    const form = el("form");
    const label = el("label", "New learner nickname");
    label.htmlFor = "new-learner";
    const input = el("input");
    input.id = "new-learner";
    input.required = true;
    input.maxLength = 60;
    const add2 = el("button", "Add learner");
    add2.type = "submit";
    form.append(label, input, add2);
    dialog.append(form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (pending || loading || retired || add2.disabled) return;
      add2.disabled = true;
      const epoch = selectionEpoch;
      try {
        const next = await store.createProfile(input.value, cleanProgress(game, {}));
        if (epoch === selectionEpoch) await selectProfile(next);
        else await showProfiles();
      } catch (error) {
        say(error.message);
      } finally {
        add2.disabled = false;
      }
    });
    const backups = el("section");
    backups.append(el("h3", "Backups for this game"), el("p", "Export saves the current learner\u2019s progress and nickname in readable JSON. Keep it private. Import creates a new, separate learner and does not replace an existing one or connect a cloud account."));
    exportButton = button(backups, recoveryMode ? "Export unreadable saved data" : "Export this learner\u2019s progress", () => download(recoveryMode ? { app: "math-workshop-raw-recovery", game, label: profile.label, snapshot: recoveryRaw } : exportSnapshot(game, profile.label, live), `math-workshop-${game}-${recoveryMode ? "raw-recovery" : "backup"}.json`), { needsIdle: false });
    const importLabel = el("label", "Import a backup for this game");
    const upload = el("input");
    upload.type = "file";
    upload.accept = ".json,application/json";
    importLabel.append(upload);
    backups.append(importLabel);
    upload.addEventListener("change", async () => {
      const file = upload.files[0];
      const epoch = ++importEpoch;
      upload.value = "";
      if (!file) return;
      if (pending || loading || retired) {
        say("Export unsaved progress or reload before importing.");
        return;
      }
      try {
        if (file.size > 1048576) throw new Error("Choose a backup smaller than 1 MB.");
        const value = importSnapshot(game, JSON.parse(await file.text()));
        if (epoch !== importEpoch) return;
        if (pending || loading || retired) throw new Error("Progress changed while reading the file. Try again.");
        const p = await store.createProfile(value.label, value.snapshot);
        if (epoch === importEpoch) await selectProfile(p);
        else await showProfiles();
      } catch (error) {
        say(`Import failed: ${error.message}`);
      }
    });
    button(backups, "Export recovery copies", async () => {
      const copies = await store.listRecovery(profile.id);
      download({ app: "math-workshop-recovery", game, curriculum: CURRICULA[game], version: 1, copies: copies.map((c) => ({ reason: c.reason, createdAt: c.createdAt, backup: exportSnapshot(game, profile.label, c.snapshot) })) }, `math-workshop-${game}-recovery.json`);
    }, { needsIdle: false });
    button(backups, "Remove this learner from this game", async () => {
      if (!confirm("Remove this learner and recovery copies from this game on this device? Other games and cloud copies remain. Export a backup first if needed.")) return;
      await store.removeProfile(profile.id);
      cloud.disconnect();
      const remaining = await store.listProfiles();
      await selectProfile(remaining[0] || await store.createProfile("Player 1", cleanProgress(game, {})));
      cloud.renderConnected();
    });
    dialog.append(backups);
    const cloudRoot = el("section");
    cloudRoot.append(el("h3", "Optional cloud saves for this game"));
    dialog.append(cloudRoot);
    cloud = createCloudPanel(cloudRoot, {
      store,
      durable,
      normalize,
      gameId: game,
      curriculumId: CURRICULA[game],
      configURL: new URL("../cloud-config.local.json", document.baseURI),
      helpURL: "https://github.com/jessecmaddox3/math-workshop/blob/main/docs/cloud-setup.md",
      getProfile: () => profile,
      isBusy: () => pending > 0 || loading || retired || recoveryMode,
      onChange: refreshActive,
      onRestore: selectProfile,
      onProfilesCleared: async () => {
        const remaining = await store.listProfiles();
        await selectProfile(remaining.find((p) => p.id === profile.id) || remaining[0] || await store.createProfile("Player 1", cleanProgress(game, {})));
      },
      onMessage: say,
      describe: (s) => `${s.solved} solved; level ${s.tier}`
    });
    document.body.append(dialog);
    button(controls, "Reload saved progress", () => {
      if ((pending || retired) && !confirm("Reload the saved copy? Export this tab\u2019s unsaved progress first if you need it.")) return;
      location.reload();
    }, { needsIdle: false });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refreshActive().catch(() => retire("Saved progress could not be checked. Export a copy before reloading."));
    });
    window.addEventListener("beforeunload", (e) => {
      if (pending || retired) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    window.addEventListener("pagehide", () => cloud.disconnect());
    status();
  }
  var readName = () => profile?.label || "";
  var readLocal = () => structuredClone(live);
  function writeLocal(which, value) {
    if (which !== game) throw new TypeError("Wrong game save.");
    if (retired || recoveryMode) return;
    live = cleanProgress(game, { ...value, autoAdvance: live.autoAdvance });
    const snapshot = structuredClone(live), id = profile.id;
    pending++;
    status();
    saveTail = saveTail.then(async () => {
      if (retired || profile.id !== id) return;
      try {
        const result = await store.save(id, snapshot, record.localRevision);
        if (result.status !== "saved") {
          retire("Another tab saved first. Your attempted save is in recovery. Export this tab\u2019s latest progress if needed, then reload.");
          return;
        }
        record = result.record;
        cloud.queue();
      } catch {
        retire("This change could not be saved. Export this learner\u2019s progress before reloading.");
      }
    }).finally(() => {
      pending--;
      status();
    });
  }
  var sync = () => {
  };
  var getAutoAdvance = () => live.autoAdvance;
  var setAutoAdvance = (value) => {
    live.autoAdvance = !!value;
    writeLocal(game, live);
  };

  // public/target/target.js
  async function main() {
    await initProgress("target");
    const GAME = "target";
    const HINT_DELAY_MS = 45e3;
    const ADVANCE_MS = 2600;
    const el2 = (id) => document.getElementById(id);
    const saved = readLocal(GAME);
    const state = {
      tier: saved.tier ?? 1,
      solved: saved.solved ?? 0,
      extras: saved.extras ?? 0,
      streak: 0,
      items: new Map(Object.entries(saved.items ?? {}))
    };
    let card = null;
    let chips = [];
    let selected = [];
    let op = null;
    let history = [];
    let steps = [];
    let solutionsFound = [];
    let hintTimer = null;
    let advanceTimer = null;
    let nextId = 0;
    let attemptFinished = false;
    const OPS2 = ["+", "\u2212", "\xD7", "\xF7"];
    function save() {
      writeLocal(GAME, {
        tier: state.tier,
        solved: state.solved,
        extras: state.extras,
        items: Object.fromEntries(state.items)
      });
      sync(GAME, readName(), state.items);
    }
    function newCard(sameCard = false) {
      clearTimeout(hintTimer);
      clearTimeout(advanceTimer);
      if (!sameCard) {
        card = makeCard(state.tier);
        solutionsFound = [];
      }
      attemptFinished = false;
      chips = card.numbers.map((n) => ({ id: nextId++, node: n, label: String(n) }));
      selected = [];
      op = null;
      history = [];
      steps = [];
      el2("target").textContent = String(card.target);
      el2("start-nums").textContent = card.numbers.join("  \xB7  ");
      el2("feedback").hidden = true;
      el2("feedback").className = "feedback";
      el2("hint").hidden = true;
      el2("found").innerHTML = "";
      render();
      hintTimer = setTimeout(showHint, HINT_DELAY_MS);
    }
    function render() {
      const focus = document.activeElement;
      const focusedChip = focus?.dataset?.id;
      const focusedOp = focus?.dataset?.op;
      el2("nums").innerHTML = chips.map((c) => {
        const value = pretty(evaluate(c.node));
        const made = c.label !== value ? `<small>${c.label}</small>` : "";
        return `<button class="num${selected.includes(c.id) ? " sel" : ""}${made ? " fused" : ""}"
                    type="button" aria-pressed="${selected.includes(c.id)}" data-id="${c.id}">${value}${made}</button>`;
      }).join("");
      el2("nums").querySelectorAll(".num").forEach((b) => {
        b.addEventListener("click", () => tapChip(Number(b.dataset.id)));
      });
      el2("ops").innerHTML = OPS2.map((o) => `<button class="op${op === o ? " sel" : ""}" type="button" aria-pressed="${op === o}" aria-label="${{ "+": "Add", "\u2212": "Subtract", "\xD7": "Multiply", "\xF7": "Divide" }[o]}" data-op="${o}">${o}</button>`).join("");
      el2("ops").querySelectorAll(".op").forEach((b) => {
        b.addEventListener("click", () => {
          op = b.dataset.op;
          tryCombine();
          render();
        });
      });
      el2("steps").innerHTML = steps.length ? `<p class="steps-label">Your work</p><ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>` : "";
      el2("helper").innerHTML = helperText();
      el2("solved").textContent = String(state.solved);
      el2("extras").textContent = String(state.extras);
      if (focusedChip !== void 0) (el2("nums").querySelector(`[data-id="${focusedChip}"]`) || el2("nums").lastElementChild)?.focus();
      else if (focusedOp !== void 0) el2("ops").querySelector(`[data-op="${focusedOp}"]`)?.focus();
    }
    function helperText() {
      if (chips.length === 1) return "";
      const left = chips.length;
      const joins = left - 1;
      if (selected.length === 0) {
        return `Tap two numbers and a sign to join them into one. <b>${joins} more join${joins === 1 ? "" : "s"}</b> to go, then you are down to a single number.`;
      }
      if (selected.length === 1) return "Now tap the second number.";
      return op ? "" : "Now pick a sign. You can use the same sign as many times as you like.";
    }
    function tapChip(id) {
      if (selected.includes(id)) selected = selected.filter((s) => s !== id);
      else if (selected.length < 2) selected.push(id);
      else selected = [selected[1], id];
      tryCombine();
      render();
    }
    function bracket(chip) {
      return chip.label === pretty(evaluate(chip.node)) ? chip.label : `(${chip.label})`;
    }
    function tryCombine() {
      if (selected.length !== 2 || !op) return;
      const [aId, bId] = selected;
      const a = chips.find((c) => c.id === aId);
      const b = chips.find((c) => c.id === bId);
      const node = { op, a: a.node, b: b.node };
      const value = evaluate(node);
      if (!value) {
        flash("nudge", "You cannot divide by zero. Try a different pair.");
        selected = [];
        op = null;
        return;
      }
      const label = `${bracket(a)} ${op} ${bracket(b)}`;
      history.push({ chips: [...chips], steps: [...steps] });
      steps.push(`${label} = <b>${pretty(value)}</b>`);
      chips = chips.filter((c) => c.id !== aId && c.id !== bId);
      chips.push({ id: nextId++, node, label });
      selected = [];
      op = null;
      if (chips.length === 1) finishAttempt();
    }
    function finishAttempt() {
      if (attemptFinished) return;
      attemptFinished = true;
      const only = chips[0];
      const value = evaluate(only.node);
      clearTimeout(hintTimer);
      const key2 = `t${card.target}`;
      const prev = state.items.get(key2) ?? { streak: 0, attempts: 0, correct: 0, mastered: false };
      if (equals(value, card.target)) {
        const expr = only.label;
        const isNew = !solutionsFound.includes(expr);
        if (isNew) {
          solutionsFound.push(expr);
          prev.attempts += 1;
          prev.correct += 1;
          prev.streak += 1;
          prev.mastered = prev.streak >= 2;
          state.items.set(key2, prev);
          if (solutionsFound.length === 1) {
            state.solved += 1;
            state.streak += 1;
            if (state.streak >= 3 && state.tier < 3) {
              state.tier += 1;
              state.streak = 0;
            }
          } else state.extras += 1;
          save();
        }
        const verdict = !isNew ? "Same route as before." : solutionsFound.length === 1 ? `Exactly ${card.target}.` : "Another route.";
        flash("good", `<span class="verdict">${verdict}</span> <code>${expr}</code>`);
        queueAdvance();
      } else {
        prev.attempts += 1;
        prev.streak = 0;
        prev.mastered = false;
        state.items.set(key2, prev);
        state.streak = 0;
        save();
        flash("bad", `<span class="verdict">That makes ${pretty(value)}, not ${card.target}.</span> <span class="gloss">Undo a step and try a different pairing.</span>`);
      }
      render();
    }
    function queueAdvance() {
      clearTimeout(advanceTimer);
      if (autoAdvance.checked) el2("feedback").classList.add("advancing");
      el2("found").innerHTML = `<button class="ghost" type="button" id="again">Find another way</button><button class="primary" type="button" id="next-card">Next card \u2192</button>`;
      el2("next-card").addEventListener("click", () => newCard());
      el2("again").addEventListener("click", () => {
        clearTimeout(advanceTimer);
        el2("feedback").classList.remove("advancing");
        newCard(true);
      });
      if (autoAdvance.checked) advanceTimer = setTimeout(() => newCard(), ADVANCE_MS);
    }
    function flash(kind, html) {
      const fb = el2("feedback");
      fb.className = `feedback ${kind}`;
      fb.innerHTML = html;
      fb.hidden = false;
    }
    function showHint() {
      const [first] = solve(card.numbers, card.target);
      if (!first) return;
      const inner = first.match(/\(([^()]+)\)/);
      el2("hint").innerHTML = inner ? `From the original numbers, try making <b>${evaluateSnippet(inner[1])}</b> first. Use Undo or Start over if your current chips have taken a different route.` : `From the original numbers, think about which pair gets you closest to a factor of ${card.target}. Use Undo or Start over to try it.`;
      el2("hint").hidden = false;
    }
    function evaluateSnippet(snippet) {
      const m = snippet.match(/^(\d+) (.) (\d+)$/);
      if (!m) return snippet;
      const node = { op: m[2], a: Number(m[1]), b: Number(m[3]) };
      return pretty(evaluate(node));
    }
    el2("undo").addEventListener("click", () => {
      if (!history.length) return;
      clearTimeout(advanceTimer);
      attemptFinished = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(showHint, HINT_DELAY_MS);
      el2("hint").hidden = true;
      const back = history.pop();
      chips = back.chips;
      steps = back.steps;
      selected = [];
      op = null;
      el2("feedback").hidden = true;
      el2("feedback").className = "feedback";
      el2("found").innerHTML = "";
      render();
    });
    el2("reset").addEventListener("click", () => newCard(true));
    el2("skip").addEventListener("click", () => newCard());
    const autoAdvance = el2("auto-advance");
    autoAdvance.checked = getAutoAdvance();
    autoAdvance.addEventListener("change", () => {
      setAutoAdvance(autoAdvance.checked);
      clearTimeout(advanceTimer);
      el2("feedback").classList.remove("advancing");
      if (attemptFinished && equals(evaluate(chips[0].node), card.target)) queueAdvance();
    });
    document.addEventListener("progress-loaded", () => {
      const fresh = readLocal(GAME);
      state.tier = fresh.tier;
      state.solved = fresh.solved;
      state.extras = fresh.extras;
      state.streak = 0;
      state.items = new Map(Object.entries(fresh.items));
      autoAdvance.checked = getAutoAdvance();
      newCard();
    });
    document.addEventListener("progress-retired", () => {
      clearTimeout(hintTimer);
      clearTimeout(advanceTimer);
    });
    window.addEventListener("pagehide", () => {
      clearTimeout(hintTimer);
      clearTimeout(advanceTimer);
    });
    newCard();
  }
  main().catch((error) => {
    const p = document.createElement("p");
    p.setAttribute("role", "alert");
    p.textContent = error.message;
    document.querySelector(".wrap").prepend(p);
  });
})();
