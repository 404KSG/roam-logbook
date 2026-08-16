var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/time.js
var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
var pad = (n) => String(n).padStart(2, "0");
function formatTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${DAY_NAMES[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatStamp(date) {
  return `[${formatTimestamp(date)}]`;
}
var isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());
function formatStarted(start, now = /* @__PURE__ */ new Date()) {
  const raw = isValidDate(start) ? formatStamp(start) : String(start ?? "");
  const candidate = isValidDate(start) ? start : parseTimestamp(raw.replace(/^\[|\]$/g, ""));
  if (!isValidDate(candidate)) {
    return { valid: false, raw, dateLabel: raw, timeLabel: "", datetime: null };
  }
  const sameDay = isValidDate(now) && candidate.getFullYear() === now.getFullYear() && candidate.getMonth() === now.getMonth() && candidate.getDate() === now.getDate();
  return {
    valid: true,
    raw,
    dateLabel: sameDay ? "Today" : `${MONTH_NAMES[candidate.getMonth()]} ${candidate.getDate()}`,
    timeLabel: `${pad(candidate.getHours())}:${pad(candidate.getMinutes())}`,
    datetime: `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}`
  };
}
var STAMP_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\S+))?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
function parseTimestamp(text) {
  if (typeof text !== "string")
    return null;
  const match = STAMP_RE.exec(text.trim());
  if (!match)
    return null;
  const [, yearText, monthText, dayText, , hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText || 0);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59 || hour < 0 || minute < 0 || second < 0) {
    return null;
  }
  const date = /* @__PURE__ */ new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, 0);
  const rolledOver = date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second;
  if (rolledOver)
    return null;
  return date;
}
function durationMinutes(startMs, endMs) {
  return Math.max(0, Math.floor((endMs - startMs) / 6e4));
}
function formatDurationMinutes(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${pad(safe % 60)}`;
}
function parseDurationMinutes(text) {
  if (typeof text !== "string")
    return null;
  const match = /^(\d+):([0-5]\d)$/.exec(text.trim());
  if (!match)
    return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
function formatMinutesHuman(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  if (hours === 0)
    return `${safe}m`;
  return `${hours}h ${pad(safe % 60)}m`;
}
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}
function startOfDaysAgo(date, days) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - days);
  return start;
}

// src/org.js
var DRAWER_LABEL = "LOGBOOK::";
var CLOCK_LABEL = "CLOCK::";
var DRAWER_RE = /^\s*:?LOGBOOK:{1,2}\s*$/i;
var CLOCK_RE = /^\s*:?CLOCK:{1,2}\s*\[([^\]]+)\](?:\s*--\s*\[([^\]]+)\])?(?:\s*=>\s*(\d+:\d+))?\s*$/i;
var CLOCK_LIKE_RE = /^\s*:?CLOCK:{1,2}(?:\s|$)/i;
var TODO_RE = /\{\{\[\[(TODO|DONE)\]\]\}\}|\{\{(TODO|DONE)\}\}/;
var BLOCK_REF_ONLY_RE = /^\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*$/;
var EMBED_ONLY_RE = /^\s*\{\{\[?\[?embed(?:-path|-children)?\]?\]?\s*:\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*\}\}\s*$/i;
function isDrawerBlock(string) {
  return typeof string === "string" && DRAWER_RE.test(string);
}
function isTaskBlock(string) {
  return typeof string === "string" && TODO_RE.test(string);
}
function taskStatus(string) {
  if (typeof string !== "string")
    return null;
  const match = TODO_RE.exec(string);
  if (!match)
    return null;
  return (match[1] || match[2]).toUpperCase();
}
function parseClockLineDetailed(string) {
  if (typeof string !== "string")
    return { ok: false, issue: null };
  const match = CLOCK_RE.exec(string);
  if (!match) {
    return CLOCK_LIKE_RE.test(string) ? {
      ok: false,
      issue: {
        code: "malformed-clock",
        message: "CLOCK record does not match the expected Org format."
      }
    } : { ok: false, issue: null };
  }
  const start = parseTimestamp(match[1]);
  if (!start) {
    return {
      ok: false,
      issue: {
        code: "invalid-timestamp",
        field: "start",
        raw: match[1],
        message: `Start timestamp is invalid: ${match[1]}`
      }
    };
  }
  const end = match[2] ? parseTimestamp(match[2]) : null;
  if (match[2] && !end) {
    return {
      ok: false,
      issue: {
        code: "invalid-timestamp",
        field: "end",
        raw: match[2],
        message: `End timestamp is invalid: ${match[2]}`
      }
    };
  }
  if (end && end.getTime() < start.getTime()) {
    return {
      ok: false,
      issue: {
        code: "negative-duration",
        message: "End timestamp is earlier than the start timestamp."
      }
    };
  }
  const declaredMinutes = match[3] ? parseDurationMinutes(match[3]) : null;
  if (match[3] && declaredMinutes === null) {
    return {
      ok: false,
      issue: {
        code: "invalid-declared-duration",
        raw: match[3],
        message: `Declared duration is invalid: ${match[3]}`
      }
    };
  }
  const computedMinutes = end ? durationMinutes(start.getTime(), end.getTime()) : null;
  const effectiveMinutes = end ? declaredMinutes ?? computedMinutes : null;
  const issue = end && declaredMinutes !== null && declaredMinutes !== computedMinutes ? {
    code: "declared-duration-mismatch",
    message: `Declared ${match[3]} differs from the ${formatDurationMinutes(computedMinutes)} computed from timestamps.`
  } : null;
  return {
    ok: true,
    value: {
      start,
      end,
      computedMinutes,
      declaredMinutes,
      effectiveMinutes,
      minutes: effectiveMinutes,
      running: !end,
      issue
    }
  };
}
function formatClockLine(start, end) {
  if (!end)
    return `${CLOCK_LABEL} ${formatStamp(start)}`;
  const minutes = durationMinutes(start.getTime(), end.getTime());
  return `${CLOCK_LABEL} ${formatStamp(start)}--${formatStamp(end)} => ${formatDurationMinutes(minutes)}`;
}
function referencedBlockUid(string) {
  if (typeof string !== "string")
    return null;
  const match = BLOCK_REF_ONLY_RE.exec(string) || EMBED_ONLY_RE.exec(string);
  return match ? match[1] : null;
}
function taskTitle(string, { maxLength = Infinity } = {}) {
  if (typeof string !== "string")
    return "(untitled)";
  const cleaned = string.replace(TODO_RE, "").replace(/\{\{\[\[?[^}]*\}\}/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/#\[\[([^\]]+)\]\]/g, "$1").replace(/\(\([a-zA-Z0-9_-]{6,}\)\)/g, "").replace(/\^\^|\*\*|__|~~/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned)
    return "(untitled)";
  return Number.isFinite(maxLength) && cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}\u2026` : cleaned;
}

// src/roam.js
var GraphReadError = class extends Error {
  constructor(message, { cause, issue } = {}) {
    super(message, { cause });
    this.name = "GraphReadError";
    this.issue = issue || {
      kind: "graph-read",
      source: "graph",
      message
    };
  }
};
function graphReadIssue({ source, message, affectedUid, affectedUids } = {}) {
  const issue = {
    kind: "graph-read",
    source: source || "graph",
    message: message || "The graph could not be read."
  };
  if (typeof affectedUid === "string" && affectedUid)
    issue.affectedUid = affectedUid;
  if (Array.isArray(affectedUids) && affectedUids.length > 0) {
    issue.affectedUids = [...new Set(affectedUids.filter((uid) => typeof uid === "string" && uid))];
  }
  return issue;
}
function withGraphReadIssue(error, details = {}) {
  const message = error?.message || details.message || "The graph could not be read.";
  return new GraphReadError(message, {
    cause: error,
    issue: graphReadIssue({ ...details, message })
  });
}
function getApi() {
  return typeof window !== "undefined" && window.roamAlphaAPI || null;
}
function generateUid() {
  const api = getApi();
  if (typeof api?.util?.generateUID === "function")
    return api.util.generateUID();
  return Math.random().toString(36).slice(2, 11);
}
function resolve(namespace, modernName, legacyName = modernName) {
  const api = getApi();
  if (!api)
    return null;
  const modernOwner = namespace ? api.data?.[namespace] : api.data;
  if (typeof modernOwner?.[modernName] === "function") {
    return modernOwner[modernName].bind(modernOwner);
  }
  if (typeof api[legacyName] === "function")
    return api[legacyName].bind(api);
  return null;
}
function queryResult(datalog, ...args) {
  const run = resolve(null, "q");
  if (!run) {
    return {
      ok: false,
      rows: null,
      error: new GraphReadError("roamAlphaAPI q unavailable")
    };
  }
  try {
    const rows = run(datalog, ...args);
    if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row))) {
      throw new GraphReadError("Graph query returned a non-array result", {
        cause: new TypeError("query rows must be an array of rows")
      });
    }
    return { ok: true, rows, error: null };
  } catch (error) {
    const graphError = error instanceof GraphReadError ? error : new GraphReadError(error?.message || "Graph query failed", { cause: error });
    return { ok: false, rows: null, error: graphError };
  }
}
function validateQueryRows(rows, label, predicate) {
  if (rows.some((row) => !predicate(row))) {
    throw new GraphReadError(`Graph query returned malformed ${label} rows`);
  }
  return rows;
}
function queryOrThrow(datalog, ...args) {
  const result = queryResult(datalog, ...args);
  if (!result.ok)
    throw result.error;
  return result.rows;
}
function query(datalog, ...args) {
  return queryOrThrow(datalog, ...args);
}
function getBlockString(uid) {
  if (!uid)
    return null;
  let rows;
  try {
    rows = validateQueryRows(
      queryOrThrow(
        "[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]",
        uid
      ),
      "block string",
      (row) => row.length >= 1 && typeof row[0] === "string"
    );
  } catch (error) {
    throw withGraphReadIssue(error, { source: "block-string", affectedUid: uid });
  }
  return rows[0]?.[0] ?? null;
}
function watchBlockString(uid, onChange) {
  const add = resolve(null, "addPullWatch");
  const remove = resolve(null, "removePullWatch");
  const pattern = "[:block/string]";
  const entity = `[:block/uid ${JSON.stringify(uid)}]`;
  let detached = false;
  const installationError = typeof uid !== "string" || uid.length === 0 ? new Error("Pull Watch requires a block UID") : typeof onChange !== "function" ? new Error("Pull Watch requires a change callback") : !add ? new Error("roamAlphaAPI addPullWatch unavailable") : null;
  if (installationError) {
    return {
      ok: false,
      uid,
      error: installationError,
      detach: () => ({ ok: false, detached: false, error: installationError })
    };
  }
  const handler = (before, after) => {
    try {
      onChange({ uid, before, after });
    } catch (error) {
      console.error("[roam-logbook] pull-watch callback failed", error);
    }
  };
  try {
    add(pattern, entity, handler);
  } catch (error) {
    return {
      ok: false,
      uid,
      error,
      detach: () => ({ ok: false, detached: false, error })
    };
  }
  return {
    ok: true,
    uid,
    detach: () => {
      if (detached)
        return { ok: true, detached: false };
      const remover = remove || resolve(null, "removePullWatch");
      if (!remover) {
        const error = new Error("roamAlphaAPI removePullWatch unavailable");
        return { ok: false, detached: false, error };
      }
      try {
        remover(pattern, entity, handler);
        detached = true;
        return { ok: true, detached: true };
      } catch (error) {
        detached = false;
        return { ok: false, detached: false, error };
      }
    }
  };
}
function resolveReferencedUid(uid) {
  const seen = /* @__PURE__ */ new Set();
  let current = uid;
  while (current && !seen.has(current)) {
    seen.add(current);
    const referenced = referencedBlockUid(getBlockString(current));
    if (!referenced)
      return current;
    current = referenced;
  }
  return current || uid;
}
function getChildren(uid) {
  if (!uid)
    return [];
  const rows = validateQueryRows(
    queryOrThrow(
      `[:find ?uid ?string ?order
          :in $ ?parent
          :where
          [?p :block/uid ?parent]
          [?p :block/children ?c]
          [?c :block/uid ?uid]
          [?c :block/string ?string]
          [?c :block/order ?order]]`,
      uid
    ),
    "children",
    (row) => row.length >= 3 && typeof row[0] === "string" && typeof row[1] === "string" && Number.isFinite(row[2])
  );
  return rows.map(([childUid, string, order]) => ({ uid: childUid, string, order })).sort((a, b) => a.order - b.order);
}
async function createBlock({ parentUid, order, string, uid }) {
  const create = resolve("block", "create", "createBlock");
  if (!create)
    throw new Error("roamAlphaAPI block.create unavailable");
  const blockUid = uid || generateUid();
  await create({
    location: { "parent-uid": parentUid, order },
    block: { string, uid: blockUid }
  });
  return blockUid;
}
async function updateBlock({ uid, string }) {
  const update = resolve("block", "update", "updateBlock");
  if (!update)
    throw new Error("roamAlphaAPI block.update unavailable");
  await update({ block: { uid, string } });
}
async function deleteBlock(uid) {
  const remove = resolve("block", "delete", "deleteBlock");
  if (!remove)
    throw new Error("roamAlphaAPI block.delete unavailable");
  await remove({ block: { uid } });
}
function getFocusedBlockUid() {
  const api = getApi();
  try {
    return api?.ui?.getFocusedBlock?.()?.["block-uid"] ?? null;
  } catch {
    return null;
  }
}
async function openBlock(uid) {
  const api = getApi();
  try {
    await api?.ui?.mainWindow?.openBlock?.({ block: { uid } });
  } catch (error) {
    console.error("[roam-logbook] could not open block", uid, error);
  }
}
var requestedSidebarBlocks = /* @__PURE__ */ new WeakMap();
async function openBlockInRightSidebar(uid) {
  if (typeof uid !== "string" || uid.length === 0) {
    return { ok: false, reason: "missing-uid", message: "This Task has no block UID." };
  }
  const sidebar = getApi()?.ui?.rightSidebar;
  if (typeof sidebar?.addWindow !== "function") {
    return {
      ok: false,
      reason: "unavailable",
      message: "Roam right-sidebar block windows are unavailable."
    };
  }
  try {
    await sidebar.open?.();
    if (typeof sidebar.getWindows === "function") {
      const windows = await sidebar.getWindows();
      if (Array.isArray(windows) && windows.some(
        (window2) => window2?.type === "block" && window2?.["block-uid"] === uid
      )) {
        return { ok: true, deduped: true };
      }
      await sidebar.addWindow({
        window: { type: "block", "block-uid": uid }
      });
      return { ok: true };
    }
    let requested = requestedSidebarBlocks.get(sidebar);
    if (!requested) {
      requested = /* @__PURE__ */ new Set();
      requestedSidebarBlocks.set(sidebar, requested);
    }
    if (requested.has(uid))
      return { ok: true, deduped: true };
    try {
      await sidebar.addWindow({
        window: { type: "block", "block-uid": uid }
      });
      requested.add(uid);
    } catch (error) {
      requested.delete(uid);
      throw error;
    }
    return { ok: true };
  } catch (error) {
    console.debug("[roam-logbook] could not open task in right sidebar", uid, error);
    return {
      ok: false,
      reason: "sidebar-open-failed",
      message: error?.message || "Roam could not open this Task in the right sidebar.",
      error
    };
  }
}

// src/entries.js
var entriesQuery = (predicate) => `[:find ?clock-uid ?clock-string ?drawer-string ?task-uid ?task-string ?page-title
  :where
  [?d :block/string ?drawer-string]
  [(clojure.string/${predicate} ?drawer-string "LOGBOOK:")]
  [?d :block/children ?c]
  [?c :block/uid ?clock-uid]
  [?c :block/string ?clock-string]
  [?t :block/children ?d]
  [?t :block/uid ?task-uid]
  [(get-else $ ?t :block/string "") ?task-string]
  [(get-else $ ?t :block/page "") ?p]
  [(get-else $ ?p :node/title "") ?page-title]]`;
function queryEntryRows() {
  try {
    return queryOrThrow(entriesQuery("includes?"));
  } catch (error) {
    console.warn("[roam-logbook] includes? unavailable, using starts-with?", error);
  }
  try {
    return queryOrThrow(entriesQuery("starts-with?"));
  } catch (error) {
    console.error("[roam-logbook] could not read logbook entries", error);
    throw withGraphReadIssue(error, { source: "entries" });
  }
}
function readAllEntries() {
  let rows;
  try {
    rows = validateQueryRows(
      queryEntryRows(),
      "logbook entry",
      (row) => row.length >= 6 && typeof row[0] === "string" && typeof row[1] === "string" && typeof row[2] === "string" && typeof row[3] === "string" && (typeof row[4] === "string" || row[4] === null || row[4] === void 0) && (typeof row[5] === "string" || row[5] === null || row[5] === void 0)
    );
  } catch (error) {
    throw withGraphReadIssue(error, { source: "entries" });
  }
  const entries = [];
  for (const [clockUid, clockString, drawerString, taskUid, taskString, pageTitle] of rows) {
    if (!isDrawerBlock(drawerString))
      continue;
    const parsed = parseClockLineDetailed(clockString);
    if (!parsed.issue && !parsed.ok)
      continue;
    const value = parsed.ok ? parsed.value : null;
    const issues = [];
    const timingIssue = parsed.ok ? parsed.value.issue : parsed.issue;
    if (typeof taskString !== "string" || taskString.trim() === "") {
      issues.push({
        code: "orphan-task",
        message: "Task metadata is missing; the Session is retained under Deleted task.",
        rawClock: clockString
      });
    }
    if (timingIssue)
      issues.push({ ...timingIssue, rawClock: clockString });
    const title = typeof taskString === "string" && taskString.trim() !== "" ? taskTitle(taskString) : `Deleted task \xB7 ${taskUid}`;
    entries.push({
      clockUid,
      taskUid,
      taskString: taskString ?? null,
      title,
      status: typeof taskString === "string" ? taskStatus(taskString) : null,
      pageTitle: pageTitle ?? null,
      rawClock: clockString,
      start: value?.start ?? null,
      end: value?.end ?? null,
      minutes: value?.effectiveMinutes ?? null,
      computedMinutes: value?.computedMinutes ?? null,
      declaredMinutes: value?.declaredMinutes ?? null,
      effectiveMinutes: value?.effectiveMinutes ?? null,
      issue: issues[0] ?? null,
      issues,
      running: value?.running ?? false
    });
  }
  entries.sort((a, b) => (b.start?.getTime() ?? -Infinity) - (a.start?.getTime() ?? -Infinity));
  return entries;
}
function readDashboardSnapshot() {
  const entries = readAllEntries();
  const hierarchy = readHierarchy([...new Set(entries.map((entry) => entry.taskUid))]);
  return { entries, hierarchy };
}
var MAX_ANCESTOR_DEPTH = 24;
var PARENTS_QUERY = `[:find ?uid ?parent-uid ?parent-string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?p :block/children ?b]
  [?p :block/uid ?parent-uid]
  [?p :block/string ?parent-string]]`;
var MIRRORS_QUERY = `[:find ?target-uid ?mirror-uid ?mirror-string
  :in $ [?target-uid ...]
  :where
  [?t :block/uid ?target-uid]
  [?m :block/refs ?t]
  [?m :block/uid ?mirror-uid]
  [?m :block/string ?mirror-string]]`;
var BLOCK_STRINGS_QUERY = `[:find ?uid ?string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;
var readBlockStrings = (uids) => {
  if (uids.length === 0)
    return {};
  const result = {};
  let rows;
  try {
    rows = validateQueryRows(
      queryOrThrow(BLOCK_STRINGS_QUERY, uids),
      "block string batch",
      (row) => row.length >= 2 && typeof row[0] === "string" && typeof row[1] === "string"
    );
  } catch (error) {
    throw withGraphReadIssue(error, { source: "block-string", affectedUids: uids });
  }
  for (const [uid, string] of rows)
    result[uid] = string;
  return result;
};
function readHierarchy(taskUids, { includeSeedStrings = false } = {}) {
  const parentOf = {};
  const stringOf = {};
  const mirrorsOf = {};
  const issues = [];
  const seeds = new Set(taskUids);
  if (seeds.size === 0)
    return { parentOf, stringOf, mirrorsOf, issues };
  if (includeSeedStrings)
    Object.assign(stringOf, readBlockStrings([...seeds]));
  let mirrorRows;
  try {
    mirrorRows = validateQueryRows(
      queryOrThrow(MIRRORS_QUERY, [...seeds]),
      "mirror",
      (row) => row.length >= 3 && row.every((value) => typeof value === "string")
    );
  } catch (error) {
    throw withGraphReadIssue(error, { source: "hierarchy", affectedUids: [...seeds] });
  }
  for (const [targetUid, mirrorUid, mirrorString] of mirrorRows) {
    if (referencedBlockUid(mirrorString) !== targetUid)
      continue;
    (mirrorsOf[targetUid] || (mirrorsOf[targetUid] = [])).push(mirrorUid);
    stringOf[mirrorUid] = mirrorString;
  }
  let frontier = [...seeds, ...Object.values(mirrorsOf).flat()];
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && frontier.length > 0; depth += 1) {
    const next = [];
    let parentRows;
    try {
      parentRows = validateQueryRows(
        query(PARENTS_QUERY, frontier),
        "parent",
        (row) => row.length >= 3 && row.every((value) => typeof value === "string")
      );
    } catch (error) {
      throw withGraphReadIssue(error, { source: "parent", affectedUids: frontier });
    }
    const referencedTargets = parentRows.map(([, , rawParentString]) => referencedBlockUid(rawParentString)).filter(Boolean);
    const referencedStrings = readBlockStrings([...new Set(referencedTargets)]);
    const parentChoices = /* @__PURE__ */ new Map();
    for (const [uid, rawParentUid] of parentRows) {
      const choices = parentChoices.get(uid) || /* @__PURE__ */ new Set();
      choices.add(rawParentUid);
      parentChoices.set(uid, choices);
    }
    for (const [uid, choices] of parentChoices) {
      if (choices.size > 1) {
        issues.push({
          code: "ambiguous-parent",
          taskUid: uid,
          parentUids: [...choices],
          title: `Ambiguous parent \xB7 ${uid}`,
          rawClock: "",
          message: `Task ${uid} has more than one confirmed parent; hierarchy roll-up was withheld.`
        });
      }
    }
    for (const [uid, rawParentUid, rawParentString] of parentRows) {
      const referenced = referencedBlockUid(rawParentString);
      const parentUid = referenced || rawParentUid;
      const parentString = referenced ? referencedStrings[parentUid] : rawParentString;
      parentOf[uid] = parentUid;
      if (referenced && typeof parentString !== "string") {
        issues.push({
          code: "unresolved-parent",
          taskUid: uid,
          parentUid,
          title: `Unresolved parent \xB7 ${parentUid}`,
          rawClock: "",
          message: `Parent Task ${parentUid} could not be resolved; the known hierarchy was retained.`
        });
        continue;
      }
      if (parentUid in stringOf)
        continue;
      stringOf[parentUid] = parentString;
      next.push(parentUid);
    }
    frontier = next;
  }
  if (frontier.length > 0) {
    const frontierUids = new Set(frontier);
    const affectedSeeds = [...seeds].filter((seed) => {
      const seen = /* @__PURE__ */ new Set();
      let current = seed;
      while (current && !frontierUids.has(current)) {
        if (seen.has(current))
          return true;
        seen.add(current);
        current = parentOf[current];
      }
      return frontierUids.has(current);
    });
    const affectedUids = [.../* @__PURE__ */ new Set([...frontier, ...affectedSeeds])];
    issues.push({
      code: "ancestor-depth-exceeded",
      kind: "hierarchy",
      source: "ancestor-depth",
      taskUid: affectedUids[0],
      affectedUids,
      seedUids: affectedSeeds,
      title: `Hierarchy depth exceeded \xB7 ${affectedUids[0]}`,
      rawClock: "",
      message: `The ancestor chain exceeded the safety depth of ${MAX_ANCESTOR_DEPTH}; cascade scope was withheld.`
    });
  }
  for (const uid of Object.keys(parentOf)) {
    const seen = /* @__PURE__ */ new Set();
    let current = uid;
    while (current && parentOf[current]) {
      if (seen.has(current)) {
        issues.push({
          code: "cyclic-parent",
          taskUid: uid,
          title: `Cyclic parent \xB7 ${uid}`,
          rawClock: "",
          message: `Task hierarchy for ${uid} contains a cycle; cascade scope was withheld.`
        });
        break;
      }
      seen.add(current);
      current = parentOf[current];
    }
  }
  return { parentOf, stringOf, mirrorsOf, issues };
}

// src/mutations.js
var tail = Promise.resolve();
var generation = 0;
var invalidatedMutationResult = () => ({
  action: "mutation-invalidated",
  ok: false,
  invalidated: true,
  uncertain: true,
  retryable: true,
  partial: false,
  completed: 0,
  count: 0,
  failed: 1,
  pending: 1,
  pendingTaskUids: [],
  pendingClockUids: [],
  retry: {
    action: "retry-mutation",
    reason: "extension-reload"
  },
  notice: "This action was interrupted by an extension reload before it could be applied. Retry.",
  error: new Error("Mutation was invalidated by an extension reload before it could be applied.")
});
function enqueueMutation(action) {
  const expectedGeneration = generation;
  const run = () => {
    if (expectedGeneration !== generation) {
      return invalidatedMutationResult();
    }
    return action();
  };
  const result = tail.then(run, run);
  tail = result.catch(() => void 0);
  return result;
}
function resetMutationQueue() {
  generation += 1;
}

// src/version.js
var PLUGIN_VERSION = "0.9.0-beta.21";
var STATE_FORMATS = Object.freeze({
  pauseBatch: 2,
  pomodoroTargets: 1,
  pomodoroCycle: 1,
  stateBackups: 1
});

// src/settings.js
var SETTING_TOPBAR = "showTopbarWidget";
var SETTING_MULTIPLE = "allowMultipleClocks";
var SETTING_TODO_ONLY = "todoBlocksOnly";
var SETTING_STALE_HOURS = "staleHours";
var SETTING_POMODORO_MINUTES = "pomodoroMinutes";
var SETTING_POMODORO_STATE = "pomodoroTargets";
var SETTING_POMODORO_CYCLE = "pomodoroCycle";
var SETTING_PAUSED_BATCH = "pausedBatch";
var SETTING_STATE_BACKUPS = "stateBackups";
var DEFAULTS = {
  [SETTING_TOPBAR]: true,
  [SETTING_MULTIPLE]: false,
  [SETTING_TODO_ONLY]: true,
  [SETTING_STALE_HOURS]: "8",
  [SETTING_POMODORO_MINUTES]: "30"
};
var extensionAPI = null;
function setExtensionAPI(api) {
  extensionAPI = api;
}
function read(key) {
  const value = extensionAPI?.settings?.get(key);
  return value === void 0 || value === null ? DEFAULTS[key] : value;
}
function booleanSetting(key) {
  const value = read(key);
  if (value === true || value === 1)
    return true;
  if (value === false || value === 0)
    return false;
  if (typeof value === "string") {
    const normalized2 = value.trim().toLowerCase();
    if (normalized2 === "true" || normalized2 === "1")
      return true;
    if (normalized2 === "false" || normalized2 === "0")
      return false;
  }
  return Boolean(DEFAULTS[key]);
}
function showTopbarWidget() {
  return booleanSetting(SETTING_TOPBAR);
}
function allowMultipleClocks() {
  return booleanSetting(SETTING_MULTIPLE);
}
function todoBlocksOnly() {
  return booleanSetting(SETTING_TODO_ONLY);
}
function staleHours() {
  const parsed = Number(read(SETTING_STALE_HOURS));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}
function pomodoroMinutes() {
  const parsed = Number(read(SETTING_POMODORO_MINUTES));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}
function readSetting(key) {
  return extensionAPI?.settings?.get(key) ?? null;
}
function writeSetting(key, value) {
  extensionAPI?.settings?.set(key, value);
}
function preserveStateBackup(key, raw) {
  try {
    const rawSignature = typeof raw === "string" ? raw : JSON.stringify(raw);
    let stored = readSetting(SETTING_STATE_BACKUPS);
    try {
      stored = stored ? typeof stored === "string" ? JSON.parse(stored) : stored : null;
    } catch {
      stored = null;
    }
    const data = stored?.version === 1 && stored.data && typeof stored.data === "object" ? stored.data : {};
    if (data[key]?.rawSignature === rawSignature)
      return false;
    data[key] = { rawSignature, raw };
    writeSetting(
      SETTING_STATE_BACKUPS,
      JSON.stringify({ version: STATE_FORMATS.stateBackups, data })
    );
    return true;
  } catch (error) {
    console.warn("[roam-logbook] could not preserve invalid state backup", error);
    return true;
  }
}
function normalizeChecked(event) {
  return typeof event === "boolean" ? event : Boolean(event?.target?.checked);
}
function normalizeSelected(event) {
  return typeof event === "string" ? event : String(event?.target?.value ?? "");
}
function normalizePositiveMinutes(event, fallback = pomodoroMinutes()) {
  const parsed = Number(normalizeSelected(event).trim());
  const candidate = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  const rounded = Number(candidate.toFixed(6));
  return String(rounded > 0 ? rounded : 30);
}

// src/clock.js
var running = [];
var lastRefreshStatus = { ok: true, error: null };
var notice = "";
var listeners = /* @__PURE__ */ new Set();
var actionListeners = /* @__PURE__ */ new Set();
var GRAPH_UNCERTAIN = "Graph state could not be confirmed; no further changes were made.";
async function withGraphGuard(action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof GraphReadError) {
      notice = GRAPH_UNCERTAIN;
      throw new Error(GRAPH_UNCERTAIN, { cause: error });
    }
    throw error;
  }
}
function subscribe(listener) {
  listeners.add(listener);
  listener(running, { reason: "initial" });
  return () => listeners.delete(listener);
}
function subscribeActions(listener) {
  actionListeners.add(listener);
  return () => actionListeners.delete(listener);
}
function publishAction(action) {
  for (const listener of actionListeners) {
    try {
      listener(action);
    } catch (error) {
      console.error("[roam-logbook] clock action listener failed", error);
    }
  }
}
function getRunning() {
  return running;
}
function getLastRefreshStatus() {
  return { ...lastRefreshStatus };
}
function getNotice() {
  return notice;
}
function notify(meta = { reason: "mutation" }) {
  for (const listener of listeners) {
    try {
      listener(running, meta);
    } catch (error) {
      console.error("[roam-logbook] listener failed", error);
    }
  }
}
var uncertainCloseResult = (error, entries = running, { preflight = false } = {}) => {
  const pendingClockUids = entries.filter((entry) => entry.running).map((entry) => entry.clockUid);
  return {
    action: "close-sessions",
    ok: false,
    item: "Session",
    completedVerb: "ended",
    entries,
    results: [],
    closed: 0,
    count: 0,
    completed: 0,
    failed: pendingClockUids.length,
    pending: pendingClockUids.length,
    pendingClockUids,
    uncertain: true,
    partial: false,
    retry: { action: "close", retryClockUids: pendingClockUids, writtenClockUids: [] },
    error,
    preflight
  };
};
var uncertainPauseResult = (error) => {
  const pendingClockUids = running.map((entry) => entry.clockUid);
  return {
    action: "pause-sessions",
    ok: false,
    item: "Session",
    completedVerb: "paused",
    entries: running,
    records: [],
    results: [],
    closed: 0,
    count: 0,
    completed: 0,
    failed: pendingClockUids.length,
    pending: pendingClockUids.length,
    pendingClockUids,
    pendingTaskUids: running.map((entry) => entry.taskUid),
    uncertain: true,
    partial: false,
    retry: { action: "pause", retryClockUids: pendingClockUids, retryTaskUids: running.map((entry) => entry.taskUid) },
    error,
    preflight: true
  };
};
function refresh({ entries, notify: shouldNotify = true } = {}) {
  let all;
  try {
    if (entries !== void 0 && !Array.isArray(entries)) {
      throw new GraphReadError("Clock refresh received an invalid entries snapshot");
    }
    all = entries ?? readAllEntries();
  } catch (error) {
    lastRefreshStatus = { ok: false, error };
    notice = GRAPH_UNCERTAIN;
    console.error("[roam-logbook] could not refresh clocks", error);
    return running;
  }
  const bankedByTask = /* @__PURE__ */ new Map();
  for (const entry of all) {
    if (entry.running)
      continue;
    bankedByTask.set(entry.taskUid, (bankedByTask.get(entry.taskUid) || 0) + (entry.minutes || 0));
  }
  running = all.filter((entry) => entry.running).map((entry) => ({ ...entry, priorMinutes: bankedByTask.get(entry.taskUid) || 0 }));
  lastRefreshStatus = { ok: true, error: null };
  notice = "";
  if (shouldNotify)
    notify({ reason: "refresh", explicit: true });
  return running;
}
function refreshResult({ entries, notify: shouldNotify = true } = {}) {
  const snapshot = refresh({ entries, notify: shouldNotify });
  if (!lastRefreshStatus.ok) {
    return {
      ok: false,
      uncertain: true,
      running: snapshot,
      error: lastRefreshStatus.error,
      notice: GRAPH_UNCERTAIN
    };
  }
  return { ok: true, uncertain: false, running: snapshot, error: null, notice: "" };
}
function reset() {
  running = [];
  lastRefreshStatus = { ok: true, error: null };
  notice = "";
  listeners.clear();
  actionListeners.clear();
  resetMutationQueue();
}
function resolveTaskUid(uid) {
  return resolveReferencedUid(uid);
}
function doneAncestorFor(taskUid) {
  const taskString = getBlockString(taskUid);
  if (taskStatus(taskString) === "DONE")
    return taskUid;
  const hierarchy = readHierarchy([taskUid]);
  if (hierarchy.issues.length > 0) {
    throw new GraphReadError("Task hierarchy could not be confirmed before Clock In", {
      issue: {
        kind: "hierarchy",
        source: "parent",
        message: "Task hierarchy could not be confirmed before Clock In",
        affectedUids: [taskUid]
      }
    });
  }
  const seen = /* @__PURE__ */ new Set();
  let current = taskUid;
  while (current && hierarchy.parentOf[current]) {
    if (seen.has(current)) {
      throw new GraphReadError("Task hierarchy contains a cycle before Clock In", {
        issue: {
          kind: "hierarchy",
          source: "parent",
          message: "Task hierarchy contains a cycle before Clock In",
          affectedUids: [taskUid]
        }
      });
    }
    seen.add(current);
    current = hierarchy.parentOf[current];
    if (taskStatus(hierarchy.stringOf[current]) === "DONE")
      return current;
  }
  return null;
}
async function ensureDrawer(taskUid) {
  const children = getChildren(taskUid);
  const existing = children.find((child) => isDrawerBlock(child.string));
  if (existing)
    return { uid: existing.uid, created: false };
  const uid = await createBlock({ parentUid: taskUid, order: 0, string: DRAWER_LABEL });
  const confirmation = refreshResult({ notify: false });
  return { uid, created: true, confirmation };
}
async function closeEntry(entry, end) {
  if (!entry?.running)
    return false;
  const string = formatClockLine(entry.start, end.getTime() < entry.start.getTime() ? entry.start : end);
  await updateBlock({ uid: entry.clockUid, string });
  return true;
}
async function closeEntriesNow(entries, clockUids, now, { publish = true } = {}) {
  const byUid = new Map(entries.filter((entry) => entry.running).map((entry) => [entry.clockUid, entry]));
  const ids = clockUids === null ? [...byUid.keys()] : [...new Set(clockUids)];
  const results = [];
  let uncertain = null;
  for (const clockUid of ids) {
    const entry = byUid.get(clockUid);
    if (!entry) {
      results.push({ clockUid, closed: false, reason: "not-running" });
      continue;
    }
    try {
      const closed2 = await closeEntry(entry, now);
      results.push({ clockUid, closed: closed2 });
      if (closed2) {
        const confirmation = refreshResult({ notify: false });
        if (!confirmation.ok) {
          uncertain = confirmation;
          break;
        }
      }
    } catch (error) {
      results.push({ clockUid, closed: false, error });
    }
  }
  const retryClockUids = ids.filter((clockUid) => {
    const result = results.find((item) => item.clockUid === clockUid);
    return !result || Boolean(result.error);
  });
  const closed = results.filter((result) => result.closed).length;
  const failed = results.filter((result) => result.error).length;
  const pending = retryClockUids.length;
  const incomplete = Boolean(uncertain) || failed > 0 || pending > 0;
  if (publish && (closed > 0 || uncertain))
    notify();
  return {
    action: "close-sessions",
    ok: !incomplete,
    item: "Session",
    completedVerb: "ended",
    results,
    closed,
    count: closed,
    completed: closed,
    failed,
    pending,
    pendingClockUids: retryClockUids,
    uncertain: Boolean(uncertain),
    partial: Boolean(incomplete && closed > 0),
    retry: incomplete ? {
      action: "close",
      retryClockUids,
      writtenClockUids: results.filter((result) => result.closed).map((result) => result.clockUid)
    } : null,
    refresh: uncertain,
    error: uncertain?.error || results.find((result) => result.error)?.error || null
  };
}
async function clockIn(blockUid, { now = /* @__PURE__ */ new Date(), source = "user" } = {}) {
  return enqueueMutation(
    () => withGraphGuard(async () => {
      const taskUid = resolveTaskUid(blockUid);
      if (!taskUid)
        throw new Error("No block to clock in");
      const entries = readAllEntries();
      const open = entries.filter((entry) => entry.running);
      const doneAncestorUid = doneAncestorFor(taskUid);
      if (doneAncestorUid) {
        const error = new Error(
          `Cannot Clock In under DONE Task ${doneAncestorUid}; reopen it first.`
        );
        error.code = "done-ancestor";
        error.taskUid = taskUid;
        error.doneAncestorUid = doneAncestorUid;
        throw error;
      }
      if (allowMultipleClocks()) {
        if (open.some((entry) => entry.taskUid === taskUid)) {
          refresh();
          throw new Error("This task already has a running clock");
        }
      } else {
        if (open.length > 0) {
          const outcome = await closeEntriesNow(entries, open.map((entry) => entry.clockUid), now, {
            publish: false
          });
          if (outcome.uncertain) {
            return {
              taskUid,
              uncertain: true,
              partial: outcome.partial,
              notice: GRAPH_UNCERTAIN,
              retry: outcome.retry
            };
          }
          if (outcome.failed > 0)
            throw outcome.results.find((result2) => result2.error).error;
        }
      }
      const drawer = await ensureDrawer(taskUid);
      if (drawer.confirmation && !drawer.confirmation.ok) {
        return {
          taskUid,
          drawerUid: drawer.uid,
          uncertain: true,
          partial: true,
          notice: GRAPH_UNCERTAIN,
          retry: { action: "clock-in", taskUid, drawerUid: drawer.uid }
        };
      }
      const order = getChildren(drawer.uid).length;
      const clockUid = await createBlock({
        parentUid: drawer.uid,
        order,
        string: formatClockLine(now)
      });
      const confirmation = refreshResult({ notify: false });
      if (!confirmation.ok) {
        return {
          clockUid,
          taskUid,
          uncertain: true,
          partial: true,
          notice: GRAPH_UNCERTAIN,
          retry: { action: "clock-in", taskUid, drawerUid: drawer.uid, clockUid }
        };
      }
      const result = { clockUid, taskUid };
      publishAction({
        type: "clock-in",
        source,
        clockUid,
        taskUid,
        newCycle: open.length === 0,
        cycleStartedAt: open.length === 0 ? now.getTime() : null
      });
      notify();
      return result;
    })
  );
}
async function clockOut(clockUid, { now = /* @__PURE__ */ new Date(), source = "user" } = {}) {
  return enqueueMutation(
    () => withGraphGuard(async () => {
      const entries = readAllEntries();
      const outcome = await closeEntriesNow(entries, [clockUid], now);
      const result = outcome.results[0];
      if (result?.error)
        throw result.error;
      if (outcome.uncertain) {
        return {
          closed: result?.closed === true,
          uncertain: true,
          partial: outcome.partial,
          notice: GRAPH_UNCERTAIN,
          retry: outcome.retry
        };
      }
      if (result?.closed === true) {
        const entry = entries.find((item) => item.clockUid === clockUid);
        publishAction({ type: "clock-out", source, clockUid, taskUid: entry?.taskUid });
      }
      return result?.closed === true;
    })
  );
}
async function clockOutEntries(clockUids = null, { now = /* @__PURE__ */ new Date(), source = "user", prepare = null } = {}) {
  return enqueueMutation(async () => {
    let entries = [];
    let readCompleted = false;
    let prepareStarted = false;
    try {
      return await withGraphGuard(async () => {
        entries = readAllEntries();
        readCompleted = true;
        if (prepare) {
          prepareStarted = true;
          await prepare(entries.map((entry) => ({ ...entry })));
        }
        const outcome = await closeEntriesNow(entries, clockUids, now);
        const result = { ...outcome, entries };
        if (!outcome.uncertain) {
          for (const closed of outcome.results.filter((item) => item.closed)) {
            const entry = entries.find((item) => item.clockUid === closed.clockUid);
            publishAction({
              type: "clock-out",
              source,
              clockUid: closed.clockUid,
              taskUid: entry?.taskUid
            });
          }
        }
        notify();
        return result;
      });
    } catch (error) {
      notice = GRAPH_UNCERTAIN;
      return uncertainCloseResult(error, readCompleted ? entries : running, { preflight: prepareStarted });
    }
  });
}
async function pauseEntries({ now = /* @__PURE__ */ new Date(), prepare, source = "pause" } = {}) {
  return enqueueMutation(async () => {
    try {
      return await withGraphGuard(async () => {
        const allEntries = readAllEntries();
        const entries = allEntries.filter((entry) => entry.running);
        if (entries.length === 0)
          refresh({ entries: allEntries, notify: false });
        const records = prepare ? await prepare(entries.map((entry) => ({ ...entry }))) : [];
        const outcome = await closeEntriesNow(
          entries,
          records.map((record) => record.clockUid),
          now,
          { publish: false }
        );
        const result = { entries, records, ...outcome };
        if (!outcome.uncertain) {
          for (const closed of outcome.results.filter((item) => item.closed)) {
            const entry = entries.find((item) => item.clockUid === closed.clockUid);
            publishAction({
              type: "clock-out",
              source,
              clockUid: closed.clockUid,
              taskUid: entry?.taskUid
            });
          }
        }
        notify();
        return result;
      });
    } catch (error) {
      notice = GRAPH_UNCERTAIN;
      return uncertainPauseResult(error);
    }
  });
}
async function clockOutBlock(blockUid, { now = /* @__PURE__ */ new Date(), source = "user" } = {}) {
  return enqueueMutation(
    () => withGraphGuard(async () => {
      const taskUid = resolveTaskUid(blockUid);
      const entries = readAllEntries();
      const entry = entries.find((item) => item.running && item.taskUid === taskUid);
      if (!entry)
        return false;
      const outcome = await closeEntriesNow(entries, [entry.clockUid], now);
      const result = outcome.results[0];
      if (result?.error)
        throw result.error;
      if (outcome.uncertain) {
        return {
          closed: result?.closed === true,
          uncertain: true,
          partial: outcome.partial,
          notice: GRAPH_UNCERTAIN,
          retry: outcome.retry
        };
      }
      if (result?.closed === true) {
        publishAction({
          type: "clock-out",
          source,
          clockUid: entry.clockUid,
          taskUid: entry.taskUid
        });
      }
      return result?.closed === true;
    })
  );
}
async function clockOutCompletedTask(taskUid, {
  now = /* @__PURE__ */ new Date(),
  source = "auto-complete",
  getPauseTaskUids = null,
  pruneCompleted: pruneCompleted2 = null,
  retryClockUids = null
} = {}) {
  return enqueueMutation(async () => {
    try {
      return await withGraphGuard(async () => {
        const entries = readAllEntries();
        const runningEntries = entries.filter((entry) => entry.running);
        const pauseTaskUids = getPauseTaskUids ? getPauseTaskUids() : [];
        if (!Array.isArray(pauseTaskUids)) {
          throw new GraphReadError("Paused Task scope could not be confirmed");
        }
        const taskUids = [
          ...new Set([
            taskUid,
            ...runningEntries.map((entry) => entry.taskUid),
            ...pauseTaskUids
          ].filter(Boolean))
        ];
        const hierarchy = readHierarchy(taskUids);
        const relevantHierarchyIssues = hierarchy.issues.filter(
          (issue) => hierarchyIssueAffectsTask(issue, taskUid, hierarchy.parentOf)
        );
        if (relevantHierarchyIssues.length > 0) {
          throw new GraphReadError("Task hierarchy could not be confirmed for automatic Clock Out", {
            issue: {
              kind: "hierarchy",
              source: "parent",
              message: "Task hierarchy could not be confirmed for automatic Clock Out",
              affectedUids: relevantHierarchyIssues.flatMap(
                (issue) => issue.affectedUids || [issue.taskUid, issue.parentUid]
              )
            }
          });
        }
        const stringOf = new Map([
          ...entries.map((entry) => [entry.taskUid, entry.taskString]),
          ...Object.entries(hierarchy.stringOf)
        ]);
        const taskString = stringOf.get(taskUid) ?? getBlockString(taskUid);
        if (taskStatus(taskString) !== "DONE") {
          return {
            action: "auto-clock-out",
            source,
            ok: true,
            skipped: true,
            reason: "task-not-done",
            triggerUid: taskUid,
            closed: 0,
            count: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            pendingClockUids: []
          };
        }
        const targetEntries = entries.filter(
          (entry) => entry.running && isTaskInConfirmedTree(entry.taskUid, taskUid, hierarchy.parentOf)
        );
        const affectedTaskUids = [
          taskUid,
          ...targetEntries.map((entry) => entry.taskUid),
          ...pauseTaskUids.filter(
            (candidate) => isTaskInConfirmedTree(candidate, taskUid, hierarchy.parentOf)
          )
        ];
        const targetClockUids = retryClockUids === null ? targetEntries.map((entry) => entry.clockUid) : targetEntries.filter((entry) => retryClockUids.includes(entry.clockUid)).map((entry) => entry.clockUid);
        const outcome = await closeEntriesNow(
          entries,
          targetClockUids,
          now,
          { publish: false }
        );
        for (const closed of outcome.results.filter((item) => item.closed)) {
          const entry = targetEntries.find((item) => item.clockUid === closed.clockUid);
          publishAction({
            type: "clock-out",
            source,
            clockUid: closed.clockUid,
            taskUid: entry?.taskUid
          });
        }
        const pauseResult = outcome.ok && pruneCompleted2 ? pruneCompleted2([...new Set(affectedTaskUids)]) : null;
        if (pauseResult && pauseResult.ok === false) {
          const result = {
            ...outcome,
            action: "auto-clock-out",
            source,
            triggerUid: taskUid,
            taskUids: [...new Set(affectedTaskUids)],
            pause: pauseResult,
            ok: false,
            uncertain: true,
            partial: Boolean(outcome.partial || outcome.closed > 0),
            retry: {
              ...outcome.retry || { action: "auto-clock-out" },
              action: "auto-clock-out",
              taskUid,
              retryClockUids: outcome.pendingClockUids
            },
            error: pauseResult.error
          };
          notify();
          return result;
        }
        notify();
        const retry = outcome.retry ? {
          ...outcome.retry,
          action: "auto-clock-out",
          taskUid,
          retryClockUids: outcome.pendingClockUids
        } : null;
        return {
          ...outcome,
          action: "auto-clock-out",
          source,
          triggerUid: taskUid,
          taskUids: [...new Set(affectedTaskUids)],
          pause: pauseResult,
          retry
        };
      });
    } catch (error) {
      notice = GRAPH_UNCERTAIN;
      const pendingClockUids = running.map((entry) => entry.clockUid);
      return {
        action: "auto-clock-out",
        source,
        ok: false,
        triggerUid: taskUid,
        closed: 0,
        count: 0,
        completed: 0,
        failed: pendingClockUids.length,
        pending: pendingClockUids.length,
        pendingClockUids,
        uncertain: true,
        partial: false,
        retry: { action: "auto-clock-out", taskUid, retryClockUids: pendingClockUids },
        error
      };
    }
  });
}
function confirmedTreeRelation(taskUid, rootUid, parentOf) {
  const seen = /* @__PURE__ */ new Set();
  let current = taskUid;
  while (current) {
    if (current === rootUid)
      return { matched: true, cyclic: false };
    if (seen.has(current)) {
      return { matched: false, cyclic: true };
    }
    seen.add(current);
    current = parentOf[current];
  }
  return { matched: false, cyclic: false };
}
function isTaskInConfirmedTree(taskUid, rootUid, parentOf) {
  return confirmedTreeRelation(taskUid, rootUid, parentOf).matched;
}
function hierarchyIssueAffectsTask(issue, rootUid, parentOf) {
  if (issue?.code === "ancestor-depth-exceeded" && !parentOf[rootUid])
    return true;
  if (issue?.code === "ambiguous-parent") {
    if (issue.taskUid === rootUid)
      return true;
    const taskToRoot = confirmedTreeRelation(issue.taskUid, rootUid, parentOf);
    const rootToTask = confirmedTreeRelation(rootUid, issue.taskUid, parentOf);
    if (taskToRoot.matched || rootToTask.matched)
      return true;
    return (issue.parentUids || []).some(
      (candidate) => confirmedTreeRelation(candidate, rootUid, parentOf).matched
    );
  }
  const affected = [
    issue?.taskUid,
    issue?.parentUid,
    ...Array.isArray(issue?.parentUids) ? issue.parentUids : [],
    ...Array.isArray(issue?.affectedUids) ? issue.affectedUids : []
  ].filter((uid) => typeof uid === "string" && uid);
  if (affected.length === 0)
    return true;
  const adjacent = /* @__PURE__ */ new Map();
  const connect = (left, right) => {
    if (!left || !right)
      return;
    (adjacent.get(left) || adjacent.set(left, /* @__PURE__ */ new Set()).get(left)).add(right);
    (adjacent.get(right) || adjacent.set(right, /* @__PURE__ */ new Set()).get(right)).add(left);
  };
  for (const [child, parent] of Object.entries(parentOf || {}))
    connect(child, parent);
  if (issue?.taskUid) {
    for (const parent of [issue.parentUid, ...issue.parentUids || []]) {
      connect(issue.taskUid, parent);
    }
  }
  const component = /* @__PURE__ */ new Set([rootUid]);
  const frontier = [rootUid];
  while (frontier.length > 0) {
    const current = frontier.pop();
    for (const neighbor of adjacent.get(current) || []) {
      if (component.has(neighbor))
        continue;
      component.add(neighbor);
      frontier.push(neighbor);
    }
  }
  return affected.some((uid) => {
    const down = confirmedTreeRelation(uid, rootUid, parentOf);
    const up = confirmedTreeRelation(rootUid, uid, parentOf);
    return down.matched || up.matched || down.cyclic || up.cyclic ? component.has(uid) : false;
  });
}
async function discardClock(clockUid) {
  return enqueueMutation(
    () => withGraphGuard(async () => {
      const entries = readAllEntries();
      const entry = entries.find((item) => item.clockUid === clockUid);
      await deleteBlock(clockUid);
      let confirmation = refreshResult({ notify: false });
      if (!confirmation.ok) {
        return {
          deleted: true,
          uncertain: true,
          partial: true,
          notice: GRAPH_UNCERTAIN,
          retry: { action: "discard", clockUid }
        };
      }
      if (entry) {
        const drawer = getChildren(entry.taskUid).find((child) => isDrawerBlock(child.string));
        if (drawer && getChildren(drawer.uid).length === 0) {
          await deleteBlock(drawer.uid);
          confirmation = refreshResult({ notify: false });
          if (!confirmation.ok) {
            return {
              deleted: true,
              uncertain: true,
              partial: true,
              notice: GRAPH_UNCERTAIN,
              retry: { action: "discard-drawer", drawerUid: drawer.uid }
            };
          }
        }
      }
      notify();
      return true;
    })
  );
}
function isBlockRunning(blockUid) {
  const taskUid = resolveTaskUid(blockUid);
  return running.some((entry) => entry.taskUid === taskUid);
}

// src/confirmation.js
function createConfirmationController({
  timeoutMs = 5e3,
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutFn = (timer) => clearTimeout(timer),
  onChange: initialOnChange = () => {
  }
} = {}) {
  let active = null;
  let timer = null;
  let onChange = initialOnChange;
  const reset4 = () => {
    if (timer !== null)
      clearTimeoutFn(timer);
    timer = null;
    active = null;
    onChange();
  };
  const arm = (key, source = "default") => {
    if (active?.key === key && active.source === source) {
      reset4();
      return true;
    }
    reset4();
    active = { key, source };
    timer = setTimeoutFn(() => reset4(), timeoutMs);
    onChange();
    return false;
  };
  const isArmed = (key, source = null) => active?.key === key && (source === null || active.source === source);
  const setOnChange = (listener) => {
    onChange = typeof listener === "function" ? listener : () => {
    };
  };
  return { arm, isArmed, reset: reset4, setOnChange };
}

// src/dom.js
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className)
    node.className = className;
  if (text !== void 0 && text !== null)
    node.textContent = text;
  return node;
}
function button(className, text, onClick, { title } = {}) {
  const node = el("button", className, text);
  node.type = "button";
  if (title) {
    node.title = title;
    node.setAttribute("aria-label", title);
  }
  node.addEventListener("click", onClick);
  return node;
}
function injectStyles(id, css) {
  const matches = [...document.querySelectorAll("style")].filter((style2) => style2.id === id);
  const style = matches.shift() ?? el("style");
  if (!style.isConnected) {
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = css;
  for (const duplicate of matches)
    duplicate.remove();
}
function removeStyles(id) {
  for (const style of document.querySelectorAll("style")) {
    if (style.id === id)
      style.remove();
  }
}

// src/stats.js
var EMPTY_HIERARCHY = { parentOf: {}, stringOf: {}, mirrorsOf: {} };
var RANGES = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "all", label: "All time", days: null }
];
function getRange(id) {
  return RANGES.find((range) => range.id === id) || RANGES[1];
}
function entryMinutes(entry, now) {
  if (!entry?.start)
    return 0;
  if (!entry.running)
    return entry.effectiveMinutes ?? entry.minutes ?? 0;
  return Math.max(0, Math.floor((now.getTime() - entry.start.getTime()) / 6e4));
}
function filterByRange(entries, rangeId, now) {
  const { days } = getRange(rangeId);
  if (days === null)
    return entries.slice();
  const from = days === 1 ? startOfDay(now) : startOfDaysAgo(now, days - 1);
  return entries.filter((entry) => entry.start && entry.start.getTime() >= from.getTime());
}
function totalMinutes(entries, now) {
  return entries.reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
}
function summariseByTask(entries, now) {
  const byTask = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry.start)
      continue;
    let row = byTask.get(entry.taskUid);
    if (!row) {
      row = {
        taskUid: entry.taskUid,
        title: entry.title,
        status: entry.status ?? null,
        pageTitle: entry.pageTitle,
        minutes: 0,
        sessions: 0,
        running: false,
        lastActivity: entry.start
      };
      byTask.set(entry.taskUid, row);
    }
    row.minutes += entryMinutes(entry, now);
    row.sessions += 1;
    row.running = row.running || entry.running;
    const activity = entry.end ?? entry.start;
    if (activity.getTime() > row.lastActivity.getTime())
      row.lastActivity = activity;
  }
  return [...byTask.values()].sort((a, b) => b.minutes - a.minutes);
}
function summariseSessionMetrics(entries, now) {
  const durations = entries.filter((entry) => entry?.start).map((entry) => entryMinutes(entry, now)).map((minutes) => Math.max(0, minutes));
  const sorted = durations.slice().sort((a, b) => a - b);
  const sessions = durations.length;
  const focusMinutes = durations.reduce((sum, minutes) => sum + minutes, 0);
  const middle = Math.floor(sorted.length / 2);
  const medianMinutes = sorted.length === 0 ? 0 : sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const activeDays = new Set(
    entries.filter((entry) => entry?.start).map((entry) => dateKey(entry.start))
  );
  return {
    focusMinutes,
    sessions,
    completedSessions: entries.filter((entry) => entry?.start && !entry.running).length,
    runningSessions: entries.filter((entry) => entry?.start && entry.running).length,
    activeDays: activeDays.size,
    averageMinutes: sessions === 0 ? 0 : focusMinutes / sessions,
    longestMinutes: sorted.at(-1) || 0,
    medianMinutes
  };
}
var MAX_WALK = 50;
function nearestTaskAncestor(uid, { parentOf, stringOf }) {
  let current = parentOf[uid];
  for (let steps = 0; current && steps < MAX_WALK; steps += 1) {
    if (isTaskBlock(stringOf[current]))
      return current;
    current = parentOf[current];
  }
  return null;
}
function buildTaskForest(taskRows, hierarchy = EMPTY_HIERARCHY) {
  const nodes = /* @__PURE__ */ new Map();
  for (const row of taskRows) {
    nodes.set(row.taskUid, { ...row, own: row.minutes, children: [], parents: /* @__PURE__ */ new Set() });
  }
  const pending = [...nodes.keys()];
  while (pending.length > 0) {
    const uid = pending.shift();
    const parents = /* @__PURE__ */ new Set();
    const structural = nearestTaskAncestor(uid, hierarchy);
    if (structural)
      parents.add(structural);
    for (const mirrorUid of hierarchy.mirrorsOf[uid] || []) {
      const viaReference = nearestTaskAncestor(mirrorUid, hierarchy);
      if (viaReference)
        parents.add(viaReference);
    }
    for (const parentUid of parents) {
      if (parentUid === uid)
        continue;
      if (!nodes.has(parentUid)) {
        nodes.set(parentUid, {
          taskUid: parentUid,
          title: taskTitle(hierarchy.stringOf[parentUid]),
          status: taskStatus(hierarchy.stringOf[parentUid]),
          pageTitle: null,
          minutes: 0,
          own: 0,
          sessions: 0,
          running: false,
          children: [],
          parents: /* @__PURE__ */ new Set()
        });
        pending.push(parentUid);
      }
      nodes.get(uid).parents.add(parentUid);
      const siblings = nodes.get(parentUid).children;
      if (!siblings.includes(uid))
        siblings.push(uid);
    }
  }
  const expand = (uid, path) => {
    const node = nodes.get(uid);
    const base = {
      taskUid: node.taskUid,
      title: node.title,
      status: node.status ?? null,
      pageTitle: node.pageTitle,
      own: node.own,
      sessions: node.sessions,
      running: node.running,
      occurrences: node.parents.size
    };
    if (path.has(uid))
      return { ...base, total: node.own, children: [], truncated: true };
    const nextPath = new Set(path).add(uid);
    const children = node.children.map((childUid) => expand(childUid, nextPath)).sort((a, b) => b.total - a.total);
    return {
      ...base,
      total: node.own + children.reduce((sum, child) => sum + child.total, 0),
      children,
      truncated: false
    };
  };
  const forest = [];
  const covered = /* @__PURE__ */ new Set();
  const addRoot = (uid) => {
    const tree = expand(uid, /* @__PURE__ */ new Set());
    forest.push(tree);
    (function cover(node) {
      covered.add(node.taskUid);
      node.children.forEach(cover);
    })(tree);
  };
  for (const [uid, node] of nodes)
    if (node.parents.size === 0)
      addRoot(uid);
  for (const uid of nodes.keys())
    if (!covered.has(uid))
      addRoot(uid);
  return forest.sort((a, b) => b.total - a.total);
}
function flattenForest(forest, options = {}, depth = 0) {
  return forest.flatMap((node) => {
    const collapsed = node.children.length > 0 && Boolean(options.isCollapsed?.(node));
    const row = { ...node, depth, collapsed, hasChildren: node.children.length > 0 };
    return collapsed ? [row] : [row, ...flattenForest(node.children, options, depth + 1)];
  });
}
function buildDashboard(entries, { now, rangeId, hierarchy = EMPTY_HIERARCHY }) {
  const inRange = filterByRange(entries, rangeId, now);
  const tasks = summariseByTask(inRange, now);
  return {
    rangeId,
    entries: inRange,
    // Summed from entries, so this stays the honest figure even when the tree
    // shows the same task under more than one parent.
    totalMinutes: totalMinutes(inRange, now),
    todayMinutes: totalMinutes(filterByRange(entries, "today", now), now),
    weekMinutes: totalMinutes(filterByRange(entries, "week", now), now),
    tasks,
    tree: buildTaskForest(tasks, hierarchy),
    running: entries.filter((entry) => entry.running),
    sessionMetrics: summariseSessionMetrics(inRange, now),
    issues: entries.filter((entry) => entry.issue)
  };
}
function findStaleClocks(entries, now, staleHours2) {
  const cutoff = now.getTime() - staleHours2 * 36e5;
  return entries.filter((entry) => entry.running && entry.start.getTime() < cutoff);
}

// src/theme.js
var LIGHT_PAGE_LINK = "#316a9f";
var DARK_PAGE_LINK = "#7eb7d5";
var LIGHT_SYNC_GREEN = "#7eb794";
var DARK_SYNC_GREEN = "#8ed0aa";
var PLUGIN_ROOT_SELECTOR = ".rlb-root, .rlb-popover, #roam-logbook-topbar, [data-roam-logbook]";
var ROAM_HOST_SELECTOR = ".roam-article, .roam-log-page, .rm-block-text, .roam-body-main, .roam-body";
var PAGE_REF_SELECTORS = [
  ".rm-page-ref--link",
  ".rm-page-ref-link-color",
  ".rm-page-ref"
];
var PAGE_REF_SELECTOR = PAGE_REF_SELECTORS.join(", ");
var TOPBAR_SELECTOR = ".rm-topbar";
var THEME_ROOT_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "style", "data-theme"]);
var CUSTOM_LINK_PROPERTIES = [
  "--page-link-color",
  "--page-links",
  "--page-reference-color",
  "--page-ref-color",
  "--link-color",
  "--roam-link-color",
  "--rm-page-ref-link-color"
];
var getWindow = (documentRef, windowRef) => windowRef || documentRef?.defaultView || (typeof window !== "undefined" ? window : null);
var computedStyle = (documentRef, node, pseudo) => {
  const view = getWindow(documentRef);
  try {
    return view?.getComputedStyle?.(node, pseudo) || null;
  } catch {
    return null;
  }
};
var normalized = (value) => typeof value === "string" ? value.trim() : "";
var isUsableColor = (value) => {
  const color = normalized(value).toLowerCase();
  return Boolean(
    color && color !== "transparent" && color !== "currentcolor" && color !== "inherit" && color !== "initial" && color !== "unset" && color !== "none"
  );
};
var isBrowserDefaultTextColor = (value) => {
  const color = normalized(value).toLowerCase().replaceAll(" ", "");
  return color === "#000" || color === "#000000" || color === "rgb(0,0,0)";
};
var isPluginNode = (node) => Boolean(node?.closest?.(PLUGIN_ROOT_SELECTOR));
var isTagOrNamespaceRef = (node) => {
  if (!node?.classList)
    return false;
  const classes = [...node.classList].join(" ").toLowerCase();
  if (/(^|[-_\s])(tag|namespace)([-_\s]|$)/.test(classes))
    return true;
  const pageRefType = normalized(node.getAttribute?.("data-page-ref-type")) || normalized(node.getAttribute?.("data-ref-type"));
  if (/^(tag|namespace)$/i.test(pageRefType))
    return true;
  return Boolean(
    node.hasAttribute?.("data-tag") || node.hasAttribute?.("data-namespace") || node.hasAttribute?.("data-page-ref-tag") || node.hasAttribute?.("data-page-ref-namespace")
  );
};
var isVisibleRealNode = (documentRef, node) => {
  if (!node?.isConnected || isPluginNode(node) || isTagOrNamespaceRef(node))
    return false;
  if (node.getAttribute?.("aria-hidden") === "true")
    return false;
  const style = computedStyle(documentRef, node);
  if (!style)
    return true;
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return true;
};
var computedColor = (documentRef, node) => {
  const style = computedStyle(documentRef, node);
  const color = normalized(style?.color);
  return isUsableColor(color) ? color : null;
};
var firstHost = (documentRef) => {
  for (const host of documentRef?.querySelectorAll?.(ROAM_HOST_SELECTOR) || []) {
    if (!isPluginNode(host) && host.isConnected)
      return host;
  }
  return documentRef?.body || documentRef?.documentElement || null;
};
var findVisiblePageRef = (documentRef) => {
  for (const selector of PAGE_REF_SELECTORS) {
    for (const node of documentRef?.querySelectorAll?.(selector) || []) {
      if (!isVisibleRealNode(documentRef, node))
        continue;
      const color = computedColor(documentRef, node);
      if (color)
        return { color, source: "visible" };
    }
  }
  return null;
};
var readCustomLinkColor = (documentRef, host) => {
  const nodes = [];
  const seen = /* @__PURE__ */ new Set();
  for (let node = host; node; node = node.parentElement) {
    if (seen.has(node))
      break;
    seen.add(node);
    nodes.push(node);
  }
  for (const node of [documentRef?.body, documentRef?.documentElement]) {
    if (node && !seen.has(node)) {
      seen.add(node);
      nodes.push(node);
    }
  }
  for (const node of nodes) {
    const style = computedStyle(documentRef, node);
    for (const property of CUSTOM_LINK_PROPERTIES) {
      const value = normalized(style?.getPropertyValue?.(property));
      if (isUsableColor(value))
        return { color: value, source: "custom-property" };
    }
  }
  return null;
};
var isDarkTheme = (documentRef) => {
  const root = documentRef?.documentElement;
  const body = documentRef?.body;
  const classDark = Boolean(
    root?.classList?.contains("bp3-dark") || body?.classList?.contains("bp3-dark") || root?.classList?.contains("dark") || body?.classList?.contains("dark")
  );
  if (classDark)
    return true;
  return Boolean(getWindow(documentRef)?.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
};
function readRoamPageLinkPalette(documentRef = document) {
  const visible = findVisiblePageRef(documentRef);
  if (visible)
    return { color: visible.color, hoverColor: visible.color, source: visible.source };
  const host = firstHost(documentRef);
  if (host?.appendChild) {
    const probe = documentRef.createElement("span");
    probe.className = "rm-page-ref rm-page-ref--link rm-page-ref-link-color";
    probe.textContent = "Roam Logbook palette probe";
    probe.setAttribute("aria-hidden", "true");
    probe.setAttribute("data-rlb-palette-probe", "true");
    probe.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;visibility:hidden;pointer-events:none;contain:strict;";
    try {
      host.appendChild(probe);
      const color2 = computedColor(documentRef, probe);
      if (color2 && !isBrowserDefaultTextColor(color2)) {
        return { color: color2, hoverColor: color2, source: "probe" };
      }
    } finally {
      probe.remove();
    }
  }
  const custom = readCustomLinkColor(documentRef, host);
  if (custom)
    return { color: custom.color, hoverColor: custom.color, source: custom.source };
  const color = isDarkTheme(documentRef) ? DARK_PAGE_LINK : LIGHT_PAGE_LINK;
  return { color, hoverColor: color, source: "fallback" };
}
var parseColor = (value) => {
  const text = normalized(value).toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length <= 4 ? [...raw].map((char) => char + char).join("") : raw;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16)
    };
  }
  const rgb = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb)
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
};
var isStableGreen = (color) => {
  const rgb = parseColor(color);
  if (!rgb)
    return false;
  return rgb.g >= 90 && rgb.g > rgb.r * 1.12 && rgb.g >= rgb.b * 0.9;
};
var semanticSyncCandidate = (node) => {
  if (!node || isPluginNode(node))
    return false;
  const className = typeof node.className === "string" ? node.className : "";
  const signal = [
    className,
    node.getAttribute?.("aria-label"),
    node.getAttribute?.("title"),
    node.getAttribute?.("data-state"),
    node.getAttribute?.("data-status")
  ].filter(Boolean).join(" ");
  return /saving|saved|sync|synced|synchroniz/i.test(signal);
};
var candidateColors = (documentRef, node) => {
  const values = [];
  for (const pseudo of [void 0, "::before", "::after"]) {
    const style = computedStyle(documentRef, node, pseudo);
    for (const property of ["backgroundColor", "borderColor", "color", "fill", "stroke"]) {
      const value = normalized(style?.[property]);
      if (isUsableColor(value))
        values.push(value);
    }
  }
  return values;
};
var smallGeometry = (node) => {
  try {
    const rect = node.getBoundingClientRect?.();
    return Boolean(
      rect && rect.width >= 6 && rect.width <= 12 && rect.height >= 6 && rect.height <= 12
    );
  } catch {
    return false;
  }
};
function readRoamSyncPalette(documentRef = document) {
  const topbar = documentRef?.querySelector?.(".rm-topbar") || documentRef?.body;
  if (!topbar) {
    return { color: isDarkTheme(documentRef) ? DARK_SYNC_GREEN : LIGHT_SYNC_GREEN, source: "fallback" };
  }
  const all = [...topbar.querySelectorAll?.("*") || []];
  const semantic = all.filter(semanticSyncCandidate);
  for (const node of semantic) {
    const color = candidateColors(documentRef, node).find(isStableGreen);
    if (color)
      return { color, source: "semantic" };
  }
  for (const node of all) {
    if (isPluginNode(node) || !smallGeometry(node))
      continue;
    const color = candidateColors(documentRef, node).find(isStableGreen);
    if (color)
      return { color, source: "geometry" };
  }
  return { color: isDarkTheme(documentRef) ? DARK_SYNC_GREEN : LIGHT_SYNC_GREEN, source: "fallback" };
}
var runtimeByDocument = /* @__PURE__ */ new WeakMap();
var scheduleWith = (documentRef, callback) => {
  const view = getWindow(documentRef);
  if (typeof view?.requestAnimationFrame === "function") {
    const id2 = view.requestAnimationFrame(callback);
    return { kind: "raf", id: id2 };
  }
  const id = setTimeout(callback, 0);
  return { kind: "timer", id };
};
var cancelScheduled = (documentRef, scheduled) => {
  if (!scheduled)
    return;
  const view = getWindow(documentRef);
  if (scheduled.kind === "raf")
    view?.cancelAnimationFrame?.(scheduled.id);
  else
    clearTimeout(scheduled.id);
};
var matchesOrContains = (node, selector) => Boolean(node?.matches?.(selector) || node?.querySelector?.(selector));
var isTopbarRoot = (node) => Boolean(node?.matches?.(TOPBAR_SELECTOR));
var isTopbarDescendant = (node) => Boolean(node?.closest?.(TOPBAR_SELECTOR));
var isPageRefNode = (node) => Boolean(
  node?.matches?.(PAGE_REF_SELECTOR) || node?.closest?.(PAGE_REF_SELECTOR) || node?.querySelector?.(PAGE_REF_SELECTOR)
);
var containsPluginRoot = (node) => Boolean(node?.querySelector?.(PLUGIN_ROOT_SELECTOR));
var isSyncCandidate = (documentRef, node) => semanticSyncCandidate(node) || smallGeometry(node) && candidateColors(documentRef, node).some(isStableGreen);
var isPreviousSyncCandidate = (record) => {
  const node = record?.target;
  if (record?.type !== "attributes" || !node)
    return false;
  const values = [
    record.attributeName === "class" ? record.oldValue : node.className,
    record.attributeName === "aria-label" ? record.oldValue : node.getAttribute?.("aria-label"),
    record.attributeName === "title" ? record.oldValue : node.getAttribute?.("title"),
    record.attributeName === "data-state" ? record.oldValue : node.getAttribute?.("data-state"),
    record.attributeName === "data-status" ? record.oldValue : node.getAttribute?.("data-status")
  ];
  return /saving|saved|sync|synced|synchroniz/i.test(values.filter(Boolean).join(" "));
};
var containsSyncCandidate = (documentRef, node) => isSyncCandidate(documentRef, node) || Boolean([...node?.querySelectorAll?.("*") || []].some((child) => isSyncCandidate(documentRef, child)));
var isDocumentThemeNode = (node) => Boolean(
  node?.nodeType === 1 && (node === node.ownerDocument?.documentElement || node === node.ownerDocument?.body)
);
var isRelevantMutation = (record, documentRef) => {
  const target = record.target;
  if (target?.closest?.("[data-rlb-palette-probe]"))
    return false;
  if (target?.closest?.(PLUGIN_ROOT_SELECTOR))
    return false;
  if (record.type === "attributes") {
    const oldClass = record.attributeName === "class" ? record.oldValue || "" : "";
    const wasTopbar = /(^|\s)rm-topbar(?:\s|$)/.test(oldClass);
    const wasPageRef = /(^|\s)rm-page-ref(?:[-_]|\s|$)/.test(oldClass);
    if (THEME_ROOT_ATTRIBUTES.has(record.attributeName) && containsPluginRoot(target)) {
      return true;
    }
    if (isTopbarRoot(target) || wasTopbar)
      return true;
    if (isTopbarDescendant(target)) {
      return isSyncCandidate(documentRef, target) || isPreviousSyncCandidate(record);
    }
    if (isPageRefNode(target) || wasPageRef)
      return true;
    return THEME_ROOT_ATTRIBUTES.has(record.attributeName) && (isDocumentThemeNode(target) || target?.matches?.(ROAM_HOST_SELECTOR));
  }
  const allNodes = [...record.addedNodes || [], ...record.removedNodes || []];
  const nodes = allNodes.filter((node) => {
    if (node?.matches?.("[data-rlb-palette-probe]"))
      return false;
    if (node?.closest?.("[data-rlb-palette-probe]"))
      return false;
    return !node?.closest?.(PLUGIN_ROOT_SELECTOR);
  });
  if (isTopbarRoot(target))
    return true;
  if (isTopbarDescendant(target)) {
    return nodes.some((node) => containsSyncCandidate(documentRef, node));
  }
  return nodes.some((node) => matchesOrContains(node, TOPBAR_SELECTOR) || isPageRefNode(node));
};
var applyPalette = (root, palette) => {
  if (!root?.style || !palette)
    return;
  root.style.setProperty("--rlb-surface-link", palette.link);
  root.style.setProperty("--rlb-surface-link-hover", palette.linkHover);
  root.style.setProperty("--rlb-session-running", palette.sync);
};
function acquireThemeRuntime({ documentRef = document, onChange = () => {
} } = {}) {
  let state = runtimeByDocument.get(documentRef);
  if (!state) {
    const page = readRoamPageLinkPalette(documentRef);
    const sync = readRoamSyncPalette(documentRef);
    state = {
      refs: 0,
      listeners: /* @__PURE__ */ new Set(),
      page,
      sync,
      scheduled: null,
      observer: null,
      media: null,
      mediaListener: null
    };
    runtimeByDocument.set(documentRef, state);
  }
  const palette = () => ({
    link: state.page.color,
    linkHover: state.page.hoverColor || state.page.color,
    sync: state.sync.color
  });
  const notify3 = () => {
    const current = palette();
    for (const listener of state.listeners)
      listener(current);
  };
  const refresh2 = () => {
    const page = readRoamPageLinkPalette(documentRef);
    const sync = readRoamSyncPalette(documentRef);
    if (page.source !== "fallback" || state.page.source === "fallback")
      state.page = page;
    if (sync.source !== "fallback" || state.sync.source === "fallback")
      state.sync = sync;
    notify3();
  };
  const scheduleRefresh = () => {
    if (state.scheduled)
      return;
    state.scheduled = scheduleWith(documentRef, () => {
      state.scheduled = null;
      refresh2();
    });
  };
  if (state.refs === 0) {
    const target = documentRef.documentElement || documentRef.body;
    const MutationObserverCtor = getWindow(documentRef)?.MutationObserver || globalThis.MutationObserver;
    if (MutationObserverCtor && target) {
      state.observer = new MutationObserverCtor((records) => {
        if (records.some((record) => isRelevantMutation(record, documentRef)))
          scheduleRefresh();
      });
      state.observer.observe(target, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: [
          "class",
          "style",
          "aria-label",
          "title",
          "data-state",
          "data-status",
          "data-theme"
        ]
      });
    }
    const view = getWindow(documentRef);
    state.media = view?.matchMedia?.("(prefers-color-scheme: dark)") || null;
    state.mediaListener = () => scheduleRefresh();
    if (state.media?.addEventListener)
      state.media.addEventListener("change", state.mediaListener);
    else
      state.media?.addListener?.(state.mediaListener);
  }
  state.refs += 1;
  state.listeners.add(onChange);
  onChange(palette());
  let released = false;
  return {
    getPalette: palette,
    refresh: refresh2,
    apply(root) {
      applyPalette(root, palette());
    },
    release() {
      if (released)
        return;
      released = true;
      state.listeners.delete(onChange);
      state.refs -= 1;
      if (state.refs > 0)
        return;
      state.observer?.disconnect();
      state.observer = null;
      if (state.media?.removeEventListener)
        state.media.removeEventListener("change", state.mediaListener);
      else
        state.media?.removeListener?.(state.mediaListener);
      state.media = null;
      state.mediaListener = null;
      cancelScheduled(documentRef, state.scheduled);
      state.scheduled = null;
      runtimeByDocument.delete(documentRef);
    }
  };
}
function applyRoamThemePalette(root, palette) {
  applyPalette(root, palette);
}

// src/dashboard.js
var ROOT_ID = "roam-logbook-dashboard";
var DASHBOARD_TITLE = "Roam Logbook";
var REFRESH_LOADING_MESSAGE = "Refreshing Dashboard from graph\u2026";
var REFRESH_SUCCESS_MESSAGE = "Dashboard updated just now";
var REFRESH_ERROR_MESSAGE = "Dashboard refresh failed; last valid snapshot kept. Retry.";
var documentScrollLocks = /* @__PURE__ */ new WeakMap();
var restoreInlineStyle = (node, value) => {
  if (!node)
    return;
  if (value === null)
    node.removeAttribute("style");
  else
    node.setAttribute("style", value);
};
var releaseDocumentScrollLock = (documentRef, state) => {
  const current = documentScrollLocks.get(documentRef);
  if (current !== state)
    return;
  current.count -= 1;
  if (current.count > 0)
    return;
  restoreInlineStyle(current.html, current.htmlStyle);
  restoreInlineStyle(current.body, current.bodyStyle);
  try {
    window.scrollTo(current.scrollX, current.scrollY);
  } catch {
  }
  documentScrollLocks.delete(documentRef);
};
var acquireDocumentScrollLock = () => {
  const documentRef = document;
  const html = documentRef.documentElement;
  const body = documentRef.body;
  if (!html || !body)
    return () => {
    };
  let state = documentScrollLocks.get(documentRef);
  if (!state) {
    const scrollX = Number(window.scrollX) || 0;
    const scrollY = Number(window.scrollY) || 0;
    const scrollbarWidth = Math.max(0, (Number(window.innerWidth) || 0) - html.clientWidth);
    const computedPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    state = {
      count: 0,
      html,
      body,
      htmlStyle: html.getAttribute("style"),
      bodyStyle: body.getAttribute("style"),
      scrollX,
      scrollY
    };
    documentScrollLocks.set(documentRef, state);
    try {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
      }
    } catch (error) {
      restoreInlineStyle(html, state.htmlStyle);
      restoreInlineStyle(body, state.bodyStyle);
      documentScrollLocks.delete(documentRef);
      throw error;
    }
  }
  state.count += 1;
  let released = false;
  return () => {
    if (released)
      return;
    released = true;
    releaseDocumentScrollLock(documentRef, state);
  };
};
function createDashboard({
  now: nowFn = () => /* @__PURE__ */ new Date(),
  setIntervalFn = (callback, delay) => setInterval(callback, delay),
  clearIntervalFn = (ticker) => clearInterval(ticker)
} = {}) {
  let root = null;
  let summaryNode = null;
  let bodyNode = null;
  let rangeId = "week";
  let returnFocusTo = null;
  let liveTicker = null;
  let discardConfirmUid = null;
  let discardConfirmTimer = null;
  let refreshInFlight = null;
  let refreshButton = null;
  let refreshStatusNode = null;
  let refreshState = { state: "idle", message: "" };
  let lastSnapshot = null;
  let lastModel = null;
  let lastTransientIssues = [];
  let lastRefreshNotice = "";
  let themeRuntime = null;
  let releaseScrollLock = null;
  const collapsed = /* @__PURE__ */ new Set();
  const clearLiveTicker = () => {
    if (liveTicker !== null)
      clearIntervalFn(liveTicker);
    liveTicker = null;
  };
  const syncRefreshUi = () => {
    if (refreshButton) {
      refreshButton.dataset.refreshState = refreshState.state;
      refreshButton.disabled = refreshState.state === "loading";
      if (refreshState.state === "loading")
        refreshButton.setAttribute("aria-busy", "true");
      else
        refreshButton.removeAttribute("aria-busy");
    }
    if (refreshStatusNode) {
      refreshStatusNode.textContent = refreshState.message;
      refreshStatusNode.setAttribute(
        "role",
        refreshState.state === "error" ? "alert" : "status"
      );
      refreshStatusNode.setAttribute(
        "aria-live",
        refreshState.state === "error" ? "assertive" : "polite"
      );
      refreshStatusNode.setAttribute("aria-atomic", "true");
    }
  };
  const setRefreshState = (state, message) => {
    refreshState = { state, message };
    syncRefreshUi();
  };
  const resetDiscardConfirmation = () => {
    discardConfirmUid = null;
    if (discardConfirmTimer)
      clearTimeout(discardConfirmTimer);
    discardConfirmTimer = null;
  };
  const updateLiveMetricNodes = (now) => {
    if (!lastModel)
      return;
    const metrics = summariseSessionMetrics(lastModel.entries, now);
    const todayMinutes = filterByRange(lastSnapshot?.entries || [], "today", now).reduce(
      (sum, entry) => sum + entryMinutes(entry, now),
      0
    );
    const values = {
      today: formatMinutesHuman(todayMinutes),
      selected: formatMinutesHuman(metrics.focusMinutes),
      sessions: String(metrics.sessions),
      tasks: String(lastModel.tasks.length)
    };
    for (const node of bodyNode?.querySelectorAll("[data-live-metric]") || []) {
      const value = values[node.dataset.liveMetric];
      if (value !== void 0)
        node.textContent = value;
    }
    for (const node of summaryNode?.querySelectorAll("[data-live-metric]") || []) {
      const value = values[node.dataset.liveMetric];
      if (value !== void 0)
        node.textContent = value;
    }
  };
  const updateRunningElapsed = () => {
    if (!root?.classList.contains("rlb-root--open"))
      return;
    const nowDateValue = nowFn();
    const now = nowDateValue.getTime();
    for (const cell of bodyNode?.querySelectorAll('[data-running-elapsed="true"]') || []) {
      cell.textContent = formatElapsed(now - Number(cell.dataset.startMs));
    }
    updateLiveMetricNodes(nowDateValue);
  };
  const startLiveTicker = () => {
    clearLiveTicker();
    if (!root?.classList.contains("rlb-root--open"))
      return;
    if (!bodyNode?.querySelector('[data-running-elapsed="true"]') && !lastModel?.running?.length) {
      return;
    }
    liveTicker = setIntervalFn(updateRunningElapsed, 1e3);
  };
  const paint = (now) => {
    if (!bodyNode || !lastModel)
      return;
    clearLiveTicker();
    const model = lastModel;
    const hierarchy = lastSnapshot?.hierarchy || {};
    const transientIssues = lastTransientIssues;
    const refreshNotice = lastRefreshNotice;
    summaryNode.replaceChildren();
    summaryNode.appendChild(overviewBar(model, now));
    bodyNode.replaceChildren();
    if (refreshNotice) {
      const notice4 = el("div", "rlb-dashboard__notice", refreshNotice);
      notice4.setAttribute("role", "status");
      notice4.setAttribute("aria-live", "polite");
      notice4.setAttribute("aria-atomic", "true");
      bodyNode.appendChild(notice4);
    }
    const issues = [
      ...model.issues,
      ...(hierarchy.issues || []).map(issueRow),
      ...transientIssues.map(issueRow)
    ];
    if (model.running.length > 0)
      bodyNode.appendChild(runningSection(model.running, now));
    if (model.entries.length === 0) {
      bodyNode.appendChild(el("div", "rlb-empty", "No clock entries in this range yet."));
      if (issues.length > 0)
        bodyNode.appendChild(dataIssuesSection(issues));
      startLiveTicker();
      return;
    }
    bodyNode.appendChild(tasksSection(model.tree));
    if (issues.length > 0)
      bodyNode.appendChild(dataIssuesSection(issues));
    startLiveTicker();
  };
  const render = ({ readGraph = true } = {}) => {
    if (!bodyNode)
      return { ok: false, reason: "not-mounted" };
    clearLiveTicker();
    const now = nowFn();
    let snapshot = readGraph ? null : lastSnapshot;
    let refreshNotice = "";
    let transientIssues = [];
    let refreshFailed = false;
    if (readGraph) {
      try {
        const candidate = readDashboardSnapshot();
        lastSnapshot = candidate;
        snapshot = candidate;
      } catch (error) {
        refreshFailed = true;
        transientIssues = error.issue ? [error.issue] : error.issues || [];
        if (!lastSnapshot) {
          summaryNode.hidden = false;
          summaryNode.setAttribute("aria-hidden", "false");
          summaryNode.replaceChildren();
          const notice4 = el(
            "div",
            "rlb-dashboard__notice",
            "Graph data could not be refreshed; no successful snapshot is available yet."
          );
          notice4.setAttribute("role", "alert");
          notice4.setAttribute("aria-live", "assertive");
          notice4.setAttribute("aria-atomic", "true");
          const issueRows = transientIssues.map(issueRow);
          bodyNode.replaceChildren(
            notice4,
            ...issueRows.length > 0 ? [dataIssuesSection(issueRows)] : []
          );
          lastModel = null;
          lastTransientIssues = transientIssues;
          lastRefreshNotice = "";
          return { ok: false, reason: "no-snapshot" };
        }
        snapshot = lastSnapshot;
        refreshNotice = "Graph data could not be refreshed; showing last successful snapshot.";
      }
    }
    if (!snapshot)
      return { ok: false, reason: "no-snapshot" };
    summaryNode.hidden = false;
    summaryNode.setAttribute("aria-hidden", "false");
    const entries = snapshot.entries;
    const hierarchy = snapshot.hierarchy || {};
    refresh({ entries, notify: false });
    lastModel = buildDashboard(entries, { now, rangeId, hierarchy });
    lastTransientIssues = transientIssues;
    lastRefreshNotice = refreshNotice;
    paint(now);
    return { ok: true, refreshFailed };
  };
  const refreshDashboard = () => {
    if (refreshInFlight)
      return refreshInFlight;
    setRefreshState("loading", REFRESH_LOADING_MESSAGE);
    const request = Promise.resolve().then(() => render()).then(
      (result) => {
        if (result?.ok && !result.refreshFailed) {
          setRefreshState("success", REFRESH_SUCCESS_MESSAGE);
        } else {
          setRefreshState("error", REFRESH_ERROR_MESSAGE);
        }
        return result;
      },
      (error) => {
        console.error("[roam-logbook] could not refresh Dashboard", error);
        setRefreshState("error", REFRESH_ERROR_MESSAGE);
        return { ok: false, error };
      }
    );
    refreshInFlight = request.finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  };
  const issueRow = (issue) => ({
    title: issue.title || issue.parentUid || issue.affectedUid || "Unresolved graph data",
    rawClock: issue.rawClock || (issue.source ? `(graph ${issue.source} read)` : "(hierarchy query)"),
    issues: [issue]
  });
  const dataIssuesSection = (issues) => {
    const details = el("details", "rlb-data-issues rlb-dashboard__inline-status");
    const issueGroups = issues.map((entry) => (entry.issues || [entry.issue]).filter(Boolean));
    const graphReadCount = issueGroups.filter(
      (group) => group.some((issue) => issue.kind === "graph-read")
    ).length;
    const timingCount = issueGroups.length - graphReadCount;
    const summaryParts = [];
    if (timingCount > 0) {
      summaryParts.push(
        `${timingCount} timing record${timingCount === 1 ? "" : "s"} ${timingCount === 1 ? "needs" : "need"} review`
      );
    }
    if (graphReadCount > 0) {
      summaryParts.push(
        `${graphReadCount} graph read issue${graphReadCount === 1 ? "" : "s"} ${graphReadCount === 1 ? "needs" : "need"} review`
      );
    }
    const summary = el(
      "summary",
      "rlb-data-issues__summary",
      summaryParts.join(" \xB7 ")
    );
    details.appendChild(summary);
    const list = el("div", "rlb-data-issues__list");
    for (const entry of issues) {
      const entryIssues = (entry.issues || [entry.issue]).filter(Boolean);
      const issueText = entryIssues.map((issue) => `${issue.source ? `${issue.source}: ` : ""}${issue.message}`).join(" ");
      const raw = entry.rawClock || "(CLOCK text unavailable)";
      const label = `Task: ${entry.title} \xB7 CLOCK: ${raw} \xB7 Issue: ${issueText}`;
      const item = el("div", "rlb-data-issues__item", label);
      item.title = label;
      item.setAttribute("aria-label", label);
      list.appendChild(item);
    }
    details.appendChild(list);
    return details;
  };
  const overviewBar = (model, now) => {
    const wrapper = el("dl", "rlb-overview rlb-overview--compact");
    wrapper.setAttribute("aria-label", `${DASHBOARD_TITLE} overview`);
    const rangeLabel = getRange(model.rangeId).label;
    const todayContext = model.running.length > 0 ? `${model.running.length} active Session${model.running.length === 1 ? "" : "s"}` : "No active Sessions";
    const metrics = [
      ["Today", formatMinutesHuman(model.todayMinutes), todayContext, "today"],
      [rangeLabel, formatMinutesHuman(model.totalMinutes), null, "selected"],
      ["Sessions", String(model.sessionMetrics?.sessions || 0), rangeLabel, "sessions"],
      ["Tasks tracked", String(model.tasks.length), rangeLabel, "tasks"]
    ];
    for (const [label, value, context, key] of metrics) {
      const item = el("div", "rlb-overview__item rlb-overview__panel");
      const heading = el("div", "rlb-overview__heading");
      const valueNode = el("dd", "rlb-overview__value");
      const number = el("span", "rlb-overview__number", value);
      number.dataset.liveMetric = key;
      valueNode.append(number);
      if (context)
        valueNode.append(el("span", "rlb-overview__context", context));
      heading.append(el("dt", "rlb-overview__label", label), valueNode);
      item.appendChild(heading);
      wrapper.appendChild(item);
    }
    return wrapper;
  };
  const runningSection = (running2, now) => {
    const stale = new Set(findStaleClocks(running2, now, staleHours()).map((e) => e.clockUid));
    const section = el("section", "rlb-dashboard-section rlb-running");
    section.classList.add("rlb-dashboard-panel");
    const heading = el("div", "rlb-panel__header");
    heading.appendChild(el("h3", "rlb-section__title", "Running"));
    heading.appendChild(
      el(
        "span",
        "rlb-panel__count",
        `${running2.length} Session${running2.length === 1 ? "" : "s"}`
      )
    );
    if (stale.size > 0) {
      heading.appendChild(
        el("span", "bp3-tag bp3-minimal bp3-intent-warning rlb-panel__notice", `${stale.size} stale`)
      );
    }
    section.appendChild(heading);
    const table = el("table", "rlb-table");
    table.appendChild(
      headerRow([
        "Task",
        "Started",
        { label: "Elapsed", numeric: true },
        { label: "Actions", visuallyHidden: true }
      ])
    );
    const tbody = el("tbody");
    for (const entry of running2) {
      const row = el("tr");
      const task = el("td", "rlb-cell");
      const mark = statusMark(entry.status);
      if (mark)
        task.appendChild(mark);
      task.appendChild(taskLink(entry.title, entry.taskUid));
      if (stale.has(entry.clockUid)) {
        task.appendChild(el("span", "bp3-tag bp3-minimal bp3-intent-warning", "stale"));
      }
      const actions = el("td", "rlb-table__num");
      const discarding = discardConfirmUid === entry.clockUid;
      const discardTitle = discarding ? "Confirm discard of this CLOCK entry" : "Discard this CLOCK entry (cannot be undone)";
      const discard = button(
        `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? " bp3-intent-danger" : ""}`,
        "",
        (event) => {
          event.stopPropagation();
          if (!discarding) {
            discardConfirmUid = entry.clockUid;
            if (discardConfirmTimer)
              clearTimeout(discardConfirmTimer);
            discardConfirmTimer = setTimeout(() => {
              resetDiscardConfirmation();
              render();
            }, 5e3);
            render();
            return;
          }
          resetDiscardConfirmation();
          void act(() => discardClock(entry.clockUid));
        },
        { title: discardTitle }
      );
      discard.dataset.action = "discard";
      actions.append(
        button(
          "bp3-button bp3-minimal bp3-small bp3-icon-log-out rlb-running__checkout",
          "",
          (event) => {
            event.stopPropagation();
            void act(() => clockOut(entry.clockUid));
          },
          { title: "Check Out" }
        ),
        discard
      );
      actions.firstElementChild.dataset.action = "clock-out";
      const started = formatStarted(entry.start, now);
      const startedTime = el("time", "rlb-started", "");
      startedTime.title = started.raw;
      startedTime.setAttribute("aria-label", started.raw);
      if (started.datetime)
        startedTime.dateTime = started.datetime;
      if (started.valid) {
        startedTime.append(
          el("span", "rlb-started__date", started.dateLabel),
          el("span", "rlb-started__time", started.timeLabel)
        );
      } else {
        startedTime.textContent = started.raw;
      }
      const startedCell = el("td", "rlb-muted rlb-started-cell");
      startedCell.appendChild(startedTime);
      const elapsed = el(
        "td",
        "rlb-table__num rlb-running-elapsed",
        formatElapsed(now.getTime() - entry.start.getTime())
      );
      elapsed.dataset.runningElapsed = "true";
      elapsed.dataset.clockUid = entry.clockUid;
      elapsed.dataset.startMs = String(entry.start.getTime());
      row.append(task, startedCell, elapsed, actions);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  };
  const tasksSection = (tree) => {
    const everyRow = flattenForest(tree);
    const parentUids = everyRow.filter((node) => node.hasChildren).map((node) => node.taskUid);
    const section = el("section", "rlb-dashboard-section rlb-dashboard-panel rlb-by-task");
    const heading = el("div", "rlb-section__heading rlb-panel__header");
    heading.appendChild(el("h3", "rlb-section__title", "By task"));
    const rollupHelp = "Totals include sub-tasks. A task shown under more than one parent may overlap between branches; headline totals count each Session once.";
    const info = button(
      "bp3-button bp3-minimal bp3-small bp3-icon-info-sign rlb-tree__info",
      "",
      () => {
      },
      { title: rollupHelp }
    );
    info.setAttribute("aria-describedby", "roam-logbook-task-rollup-help");
    heading.appendChild(info);
    const help = el("span", "rlb-visually-hidden", rollupHelp);
    help.id = "roam-logbook-task-rollup-help";
    section.appendChild(help);
    const toggleAll = button("bp3-button bp3-minimal bp3-small", "", () => {
      const anyExpanded = parentUids.some((uid) => !collapsed.has(uid));
      if (anyExpanded)
        for (const uid of parentUids)
          collapsed.add(uid);
      else
        collapsed.clear();
      paint2();
    });
    if (parentUids.length > 0)
      heading.appendChild(toggleAll);
    section.appendChild(heading);
    const tableHost = el("div");
    section.appendChild(tableHost);
    function paint2() {
      const rows = flattenForest(tree, { isCollapsed: (node) => collapsed.has(node.taskUid) });
      const anyExpanded = parentUids.some((uid) => !collapsed.has(uid));
      toggleAll.textContent = anyExpanded ? "Collapse all" : "Expand all";
      const table = el("table", "rlb-table rlb-task-table");
      const columns = el("colgroup");
      for (const className of [
        "rlb-task-table__task",
        "rlb-task-table__sessions",
        "rlb-task-table__own",
        "rlb-task-table__total"
      ]) {
        columns.appendChild(el("col", className));
      }
      table.appendChild(columns);
      table.appendChild(
        headerRow([
          "Task",
          { label: "Sessions", numeric: true },
          { label: "Own", numeric: true },
          { label: "Total", numeric: true }
        ])
      );
      const tbody = el("tbody");
      for (const node of rows) {
        const row = el("tr");
        const name = el("td", "rlb-tree__cell");
        const layout = el("div", "rlb-tree__layout");
        const leading = el("div", "rlb-tree__leading");
        const content = el("div", "rlb-tree__content");
        name.style.paddingLeft = `${8 + node.depth * 20}px`;
        if (node.hasChildren) {
          const caret = button(
            `bp3-button bp3-minimal bp3-small rlb-tree__toggle bp3-icon-chevron-${node.collapsed ? "right" : "down"}`,
            "",
            () => {
              if (collapsed.has(node.taskUid))
                collapsed.delete(node.taskUid);
              else
                collapsed.add(node.taskUid);
              paint2();
            },
            { title: node.collapsed ? "Expand sub-tasks" : "Collapse sub-tasks" }
          );
          caret.setAttribute("aria-expanded", String(!node.collapsed));
          leading.appendChild(caret);
        } else {
          leading.appendChild(el("span", "rlb-tree__toggle rlb-tree__toggle--empty"));
        }
        const mark = statusMark(node.status);
        if (mark)
          leading.appendChild(mark);
        if (node.status === "DONE")
          row.classList.add("rlb-row--done");
        content.appendChild(taskLink(node.title, node.taskUid));
        if (node.occurrences > 1) {
          const badge = el("span", "bp3-tag bp3-minimal rlb-tree__badge", `\xD7${node.occurrences}`);
          badge.title = `Also rolls up under ${node.occurrences - 1} other task(s)`;
          content.appendChild(badge);
        }
        if (node.truncated) {
          content.appendChild(el("span", "bp3-tag bp3-minimal bp3-intent-warning", "loop"));
        }
        layout.append(leading, content);
        if (node.collapsed) {
          const hidden = countDescendants(node);
          layout.appendChild(
            el("span", "rlb-muted rlb-tree__hidden", `+${hidden} sub-task${hidden > 1 ? "s" : ""}`)
          );
        }
        name.appendChild(layout);
        row.append(
          name,
          el("td", "rlb-table__num rlb-muted", node.sessions ? String(node.sessions) : ""),
          el("td", "rlb-table__num rlb-muted", node.own > 0 ? formatMinutesHuman(node.own) : ""),
          el("td", "rlb-table__num rlb-tree__total", formatMinutesHuman(node.total))
        );
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      tableHost.replaceChildren(table);
    }
    paint2();
    return section;
  };
  const countDescendants = (node) => node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  const headerRow = (columns) => {
    const thead = el("thead");
    const row = el("tr");
    for (const column of columns) {
      const numeric = typeof column === "object" && column.numeric;
      const visuallyHidden = typeof column === "object" && column.visuallyHidden;
      const classes = [numeric ? "rlb-table__num" : "", visuallyHidden ? "rlb-visually-hidden" : ""].filter(Boolean).join(" ");
      const header = el("th", classes, column.label ?? column);
      header.setAttribute("scope", "col");
      row.appendChild(header);
    }
    thead.appendChild(row);
    return thead;
  };
  const statusMark = (status) => {
    if (!status)
      return null;
    const done = status === "DONE";
    const mark = el("span", `rlb-status rlb-status--${done ? "done" : "todo"}`);
    mark.title = done ? "DONE" : "TODO";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", done ? "Done" : "To do");
    return mark;
  };
  const taskLink = (title, taskUid) => {
    const accessibleName = `Open this block: ${title}`;
    const link = button(
      "bp3-button bp3-minimal bp3-small bp3-icon-document-open rlb-task-link rlb-task-link--icon",
      "",
      (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          event.preventDefault();
          void openBlockInRightSidebar(taskUid);
          return;
        }
        close();
        void openBlock(taskUid);
      },
      { title: accessibleName }
    );
    link.dataset.navigationCue = "icon";
    link.appendChild(el("span", "rlb-task-link__text", title));
    return link;
  };
  const act = async (action) => {
    try {
      await action();
    } catch (error) {
      console.error("[roam-logbook]", error);
    }
    render();
  };
  const dialogFocusables = (dialog) => [...dialog.querySelectorAll('button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
    (node) => !node.disabled && node.getAttribute("aria-hidden") !== "true"
  );
  const onKeyDown = (event) => {
    if (!root?.classList.contains("rlb-root--open"))
      return;
    const dialog = root.querySelector(".rlb-dialog");
    if (!dialog)
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab")
      return;
    const focusables = dialogFocusables(dialog);
    event.preventDefault();
    event.stopPropagation();
    if (focusables.length === 0) {
      dialog.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const active = document.activeElement;
    const index = focusables.indexOf(active);
    if (event.shiftKey) {
      if (index <= 0)
        last.focus();
      else
        focusables[index - 1].focus();
    } else if (index < 0 || index === focusables.length - 1) {
      first.focus();
    } else {
      focusables[index + 1].focus();
    }
  };
  const build = () => {
    const overlay = el("div", "rlb-root rlb-dashboard");
    overlay.id = ROOT_ID;
    overlay.setAttribute("aria-hidden", "true");
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay)
        close();
    });
    const dialog = el("div", "bp3-dialog rlb-dialog");
    dialog.tabIndex = -1;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "roam-logbook-dashboard-title");
    const header = el("header", "bp3-dialog-header rlb-header");
    const heading = el("div", "rlb-header__heading");
    const title = el("h2", "bp3-heading rlb-header__title", DASHBOARD_TITLE);
    title.id = "roam-logbook-dashboard-title";
    const subtitle = el(
      "p",
      "rlb-header__subtitle rlb-visually-hidden",
      "Focus sessions, timing, and task rollups"
    );
    subtitle.id = "roam-logbook-dashboard-description";
    heading.append(title, subtitle);
    dialog.setAttribute("aria-describedby", subtitle.id);
    header.appendChild(heading);
    const selectWrapper = el("div", "bp3-select bp3-small");
    const select = el("select");
    select.setAttribute("aria-label", "Dashboard date range");
    for (const range of RANGES) {
      const option = el("option", "", range.label);
      option.value = range.id;
      if (range.id === rangeId)
        option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", (event) => {
      rangeId = event.target.value;
      render({ readGraph: false });
    });
    selectWrapper.appendChild(select);
    refreshButton = button(
      "bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-icon-button",
      "",
      () => void refreshDashboard(),
      { title: "Reload from the graph" }
    );
    refreshButton.dataset.action = "refresh";
    refreshStatusNode = el("span", "rlb-dashboard__refresh-status rlb-visually-hidden");
    header.append(
      selectWrapper,
      refreshButton,
      button(
        "bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button",
        "",
        close,
        { title: "Close" }
      ),
      refreshStatusNode
    );
    summaryNode = el("div", "rlb-summary");
    bodyNode = el("div", "rlb-body rlb-body__scroll");
    dialog.append(header, summaryNode, bodyNode);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    themeRuntime = acquireThemeRuntime({
      documentRef: document,
      onChange: (palette) => applyRoamThemePalette(overlay, palette)
    });
    themeRuntime.apply(overlay);
    syncRefreshUi();
    return overlay;
  };
  function close({ restoreFocus = true } = {}) {
    if (!root) {
      releaseScrollLock?.();
      releaseScrollLock = null;
      return;
    }
    clearLiveTicker();
    resetDiscardConfirmation();
    root.classList.remove("rlb-root--open");
    root.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeyDown, true);
    try {
      if (restoreFocus && returnFocusTo?.isConnected)
        returnFocusTo.focus();
    } finally {
      releaseScrollLock?.();
      releaseScrollLock = null;
    }
    returnFocusTo = null;
  }
  return {
    open({ returnFocusTo: requestedFocus } = {}) {
      const alreadyOpen = root?.classList.contains("rlb-root--open");
      if (!alreadyOpen) {
        const active = document.activeElement;
        returnFocusTo = requestedFocus?.isConnected ? requestedFocus : active && active !== document.body && active.isConnected ? active : null;
      }
      try {
        if (!root)
          root = build();
        if (!alreadyOpen)
          releaseScrollLock = acquireDocumentScrollLock();
        root.classList.add("rlb-root--open");
        root.setAttribute("aria-hidden", "false");
        document.addEventListener("keydown", onKeyDown, true);
        render();
        const dialog = root.querySelector(".rlb-dialog");
        const initial = dialogFocusables(dialog)[0];
        (initial || dialog)?.focus();
      } catch (error) {
        root?.classList.remove("rlb-root--open");
        root?.setAttribute("aria-hidden", "true");
        document.removeEventListener("keydown", onKeyDown, true);
        releaseScrollLock?.();
        releaseScrollLock = null;
        returnFocusTo = null;
        throw error;
      }
    },
    close,
    destroy() {
      close({ restoreFocus: false });
      root?.remove();
      themeRuntime?.release();
      themeRuntime = null;
      root = null;
      summaryNode = null;
      bodyNode = null;
      lastModel = null;
      refreshInFlight = null;
      refreshButton = null;
      refreshStatusNode = null;
    }
  };
}

// src/pomodoro.js
var VERSION = STATE_FORMATS.pomodoroTargets;
var CYCLE_VERSION = STATE_FORMATS.pomodoroCycle;
var targets = /* @__PURE__ */ new Map();
var cycle = null;
var notice2 = "";
var unsupportedRaw = null;
var unsupportedCycleRaw = null;
var isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
var mapFromData = (data, { strict = false } = {}) => {
  if (!isRecord(data))
    throw new Error("pomodoro data must be an object");
  const next = /* @__PURE__ */ new Map();
  const invalid = [];
  for (const [clockUid, minutes] of Object.entries(data)) {
    const value = Number(minutes);
    if (Number.isFinite(value) && value >= 0)
      next.set(clockUid, value);
    else
      invalid.push(clockUid);
  }
  if (strict && invalid.length > 0) {
    throw new Error(`invalid Pomodoro target for ${invalid[0]}`);
  }
  return { next, invalid };
};
var serialized = (values) => JSON.stringify({ version: VERSION, data: Object.fromEntries(values) });
var serializedCycle = (value) => JSON.stringify({
  version: CYCLE_VERSION,
  data: value ? {
    startedAt: value.startedAt,
    thresholdMinutes: value.thresholdMinutes
  } : null
});
var validCycle = (value) => {
  if (!isRecord(value))
    return false;
  const startedAt = Number(value.startedAt);
  const thresholdMinutes = Number(value.thresholdMinutes);
  return Number.isFinite(startedAt) && startedAt >= 0 && Number.isFinite(thresholdMinutes) && thresholdMinutes > 0;
};
var cycleFromData = (data) => {
  if (data === null)
    return null;
  if (!validCycle(data))
    throw new Error("invalid Pomodoro cycle");
  return {
    version: CYCLE_VERSION,
    startedAt: Number(data.startedAt),
    thresholdMinutes: Number(data.thresholdMinutes)
  };
};
function writeCycle(next) {
  if (unsupportedCycleRaw !== null) {
    notice2 || (notice2 = "Saved Pomodoro cycle uses an unsupported version and was kept.");
    return false;
  }
  try {
    writeSetting(SETTING_POMODORO_CYCLE, serializedCycle(next));
    cycle = next ? { ...next } : null;
    return true;
  } catch (error) {
    notice2 || (notice2 = "Pomodoro cycle could not be saved yet; the current cycle remains in memory.");
    console.warn("[roam-logbook] could not persist Pomodoro cycle", error);
    cycle = next ? { ...next } : null;
    return false;
  }
}
function loadCycle() {
  const raw = readSetting(SETTING_POMODORO_CYCLE);
  if (!raw)
    return;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isRecord(parsed) || parsed.version !== CYCLE_VERSION || !("data" in parsed)) {
      throw new Error("unsupported pomodoro cycle version");
    }
    cycle = cycleFromData(parsed.data);
  } catch (error) {
    unsupportedCycleRaw = raw;
    const firstWarning = preserveStateBackup(SETTING_POMODORO_CYCLE, raw);
    if (!notice2 && firstWarning) {
      notice2 = "Saved Pomodoro cycle uses an unsupported or invalid version and was kept.";
    }
    if (firstWarning)
      console.warn("[roam-logbook] could not read Pomodoro cycle", error);
  }
}
function writeTargets(next) {
  if (unsupportedRaw !== null) {
    notice2 = "Saved Pomodoro state uses an unsupported version and was kept.";
    return false;
  }
  writeSetting(SETTING_POMODORO_STATE, serialized(next));
  targets = next;
  return true;
}
function load() {
  targets = /* @__PURE__ */ new Map();
  cycle = null;
  notice2 = "";
  unsupportedRaw = null;
  unsupportedCycleRaw = null;
  loadCycle();
  const raw = readSetting(SETTING_POMODORO_STATE);
  if (!raw)
    return;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    let next;
    if (isRecord(parsed) && parsed.version === VERSION && "data" in parsed) {
      next = mapFromData(parsed.data, { strict: true }).next;
    } else if (isRecord(parsed) && !("version" in parsed)) {
      const legacy = mapFromData(parsed);
      if (legacy.invalid.length > 0) {
        targets = legacy.next;
        unsupportedRaw = raw;
        const firstWarning = preserveStateBackup(SETTING_POMODORO_STATE, raw);
        notice2 = firstWarning ? "Legacy Pomodoro state contains invalid entries; its raw value was backed up and kept." : "";
        if (firstWarning) {
          console.warn("[roam-logbook] could not safely migrate mixed Pomodoro state", legacy.invalid);
        }
        return;
      }
      next = legacy.next;
    } else {
      throw new Error("unsupported pomodoro state version");
    }
    try {
      writeTargets(next);
    } catch (error) {
      targets = next;
      notice2 = "Pomodoro state was read, but its migration could not be saved yet.";
      console.warn("[roam-logbook] could not migrate pomodoro state", error);
    }
  } catch (error) {
    unsupportedRaw = raw;
    const firstWarning = preserveStateBackup(SETTING_POMODORO_STATE, raw);
    notice2 = firstWarning ? "Saved Pomodoro state uses an unsupported or invalid version and was kept." : "";
    if (firstWarning)
      console.warn("[roam-logbook] could not read pomodoro state", error);
  }
}
function getCycle() {
  return cycle ? { ...cycle } : null;
}
var instantMs = (value) => value instanceof Date ? value.getTime() : Number.isFinite(Number(value)) ? Number(value) : Date.now();
function cycleElapsedMs(now = Date.now()) {
  return cycle ? Math.max(0, instantMs(now) - cycle.startedAt) : 0;
}
function cycleThresholdMinutes() {
  return cycle?.thresholdMinutes ?? null;
}
function cycleThresholdMs() {
  return cycle ? cycle.thresholdMinutes * 6e4 : null;
}
function isCycleOverrun(now = Date.now()) {
  const threshold = cycleThresholdMs();
  return threshold !== null && cycleElapsedMs(now) >= threshold;
}
function cycleOverrunMs(now = Date.now()) {
  const threshold = cycleThresholdMs();
  return threshold === null ? 0 : Math.max(0, cycleElapsedMs(now) - threshold);
}
function reconcileCycle(running2 = [], { now = Date.now() } = {}) {
  const entries = Array.isArray(running2) ? running2 : [];
  if (entries.length === 0) {
    if (cycle !== null)
      writeCycle(null);
    return null;
  }
  if (cycle)
    return getCycle();
  const starts = entries.map((entry) => entry?.start instanceof Date ? entry.start.getTime() : Number(entry?.start)).filter((value) => Number.isFinite(value));
  const startedAt = starts.length > 0 ? Math.min(...starts) : instantMs(now);
  const next = {
    version: CYCLE_VERSION,
    startedAt,
    thresholdMinutes: pomodoroMinutes()
  };
  writeCycle(next);
  return getCycle();
}
function startCycleAt(running2 = [], startedAt = Date.now()) {
  if (!Array.isArray(running2) || running2.length === 0)
    return null;
  const instant = instantMs(startedAt);
  const next = {
    version: CYCLE_VERSION,
    startedAt: instant,
    thresholdMinutes: pomodoroMinutes()
  };
  writeCycle(next);
  return getCycle();
}
function reconcile(running2) {
  const cycleBefore = getCycle();
  const cycleAfter = reconcileCycle(running2);
  if (unsupportedRaw !== null)
    return cycleBefore !== cycleAfter;
  const live = new Set(running2.map((entry) => entry.clockUid));
  const next = new Map(targets);
  for (const clockUid of [...next.keys()]) {
    if (!live.has(clockUid))
      next.delete(clockUid);
  }
  for (const entry of running2) {
    if (!next.has(entry.clockUid))
      next.set(entry.clockUid, pomodoroMinutes());
  }
  if (next.size === targets.size && [...next].every(([uid, value]) => targets.get(uid) === value)) {
    return cycleBefore?.startedAt !== cycleAfter?.startedAt || cycleBefore?.thresholdMinutes !== cycleAfter?.thresholdMinutes;
  }
  writeTargets(next);
  return true;
}
function attach() {
  let sawInitialReplay = false;
  const unsubscribe = subscribe((running2) => {
    if (!sawInitialReplay) {
      sawInitialReplay = true;
      return;
    }
    reconcile(running2);
  });
  const unsubscribeActions = subscribeActions((action) => {
    if (action?.type !== "clock-in" || !action.newCycle || !Number.isFinite(action.cycleStartedAt)) {
      return;
    }
    startCycleAt(getRunning(), action.cycleStartedAt);
  });
  return () => {
    unsubscribe();
    unsubscribeActions();
  };
}
function reset2() {
  targets = /* @__PURE__ */ new Map();
  cycle = null;
  notice2 = "";
  unsupportedRaw = null;
  unsupportedCycleRaw = null;
}

// src/paused.js
var paused_exports = {};
__export(paused_exports, {
  clear: () => clear,
  clockOutAll: () => clockOutAll,
  getNotice: () => getNotice2,
  getPaused: () => getPaused,
  getPendingResume: () => getPendingResume,
  getRecoveryState: () => getRecoveryState,
  load: () => load2,
  pauseAll: () => pauseAll,
  pruneCompleted: () => pruneCompleted,
  reset: () => reset3,
  resumeAll: () => resumeAll,
  resumeOne: () => resumeOne,
  retryFinalizing: () => retryFinalizing,
  subscribe: () => subscribe2
});
var VERSION2 = STATE_FORMATS.pauseBatch;
var LEGACY_VERSION = 1;
var items = [];
var pendingResume = [];
var finalizing = null;
var notice3 = "";
var unsupportedRaw2 = null;
var listeners2 = /* @__PURE__ */ new Set();
var unsubscribeClockActions = null;
var cleanRecord = (value) => {
  if (!value || typeof value !== "object")
    return null;
  const taskUid = typeof value.taskUid === "string" ? value.taskUid.trim() : "";
  const title = typeof value.title === "string" ? value.title : "";
  const pausedAtMs = Number(value.pausedAtMs);
  const clockUid = typeof value.clockUid === "string" && value.clockUid ? value.clockUid : null;
  const reconciliationState = value.reconciliationState === "externally-replaced" || value.reconciliationState === "externally-clocked-out" ? value.reconciliationState : null;
  const externalClockUid = typeof value.externalClockUid === "string" && value.externalClockUid ? value.externalClockUid : null;
  if (!taskUid || !Number.isFinite(pausedAtMs) || pausedAtMs < 0)
    return null;
  return {
    taskUid,
    title,
    pausedAtMs,
    ...clockUid ? { clockUid } : {},
    ...reconciliationState ? { reconciliationState } : {},
    ...externalClockUid ? { externalClockUid } : {}
  };
};
var cleanPending = (value, { version = VERSION2, legacy = false } = {}) => {
  const record = cleanRecord(value);
  if (!record)
    return null;
  const clockUid = typeof value.clockUid === "string" && value.clockUid ? value.clockUid : null;
  const explicitLegacy = legacy || value.legacy === true || Number(value.sourceVersion) === LEGACY_VERSION;
  const sourceVersion = explicitLegacy ? LEGACY_VERSION : Number.isInteger(Number(value.sourceVersion)) ? Number(value.sourceVersion) : version;
  return {
    ...record,
    clockUid,
    legacy: explicitLegacy,
    sourceVersion,
    ...clockUid ? {} : {
      recoveryState: explicitLegacy ? "legacy-fallback" : "conflict",
      ...explicitLegacy ? {} : { recoveryIssue: "missing-clockUid" }
    }
  };
};
var hasLegacyPomodoroFields = (value) => Boolean(value && ("pomodoroRemainingMs" in value || "pomodoroSuppressed" in value));
var cleanFinalizingRecord = (value) => {
  if (!value || typeof value !== "object" || typeof value.taskUid !== "string" || !value.taskUid)
    return null;
  const pausedAtMs = Number(value.pausedAtMs);
  if (!Number.isFinite(pausedAtMs) || pausedAtMs < 0)
    return null;
  const clockUid = typeof value.clockUid === "string" && value.clockUid ? value.clockUid : null;
  return { taskUid: value.taskUid, pausedAtMs, ...clockUid ? { clockUid } : {} };
};
var cleanFinalizingScope = (value) => {
  if (!value || typeof value !== "object")
    return null;
  if (!Array.isArray(value.items) || !Array.isArray(value.pendingResume))
    return null;
  const items2 = value.items.map(cleanFinalizingRecord);
  const pendingResume2 = value.pendingResume.map(cleanFinalizingRecord);
  if (items2.some((item) => !item) || pendingResume2.some((item) => !item))
    return null;
  return { items: items2, pendingResume: pendingResume2 };
};
var cleanFinalizing = (value) => {
  if (!value || typeof value !== "object" || value.action !== "clock-out-all")
    return null;
  if (!Array.isArray(value.targets))
    return null;
  const targets2 = [];
  for (const target of value.targets) {
    if (!target || typeof target.taskUid !== "string" || !target.taskUid)
      return null;
    if (typeof target.clockUid !== "string" || !target.clockUid)
      return null;
    const key = `${target.taskUid}\0${target.clockUid}`;
    if (targets2.some((item) => `${item.taskUid}\0${item.clockUid}` === key))
      continue;
    targets2.push({ taskUid: target.taskUid, clockUid: target.clockUid });
  }
  const scope = "scope" in value ? cleanFinalizingScope(value.scope) : null;
  if ("scope" in value && !scope)
    return null;
  return {
    action: "clock-out-all",
    targets: targets2,
    ...scope ? { scope } : {}
  };
};
var serialized2 = () => JSON.stringify({
  version: VERSION2,
  data: {
    items,
    pendingResume,
    ...finalizing ? { finalizing } : {}
  }
});
var finalizingScope = () => ({
  items: items.map(cleanFinalizingRecord).filter(Boolean),
  pendingResume: pendingResume.map(cleanFinalizingRecord).filter(Boolean)
});
var makeFinalizing = (entries) => ({
  action: "clock-out-all",
  targets: entries.filter((entry) => entry.running).map((entry) => ({ taskUid: entry.taskUid, clockUid: entry.clockUid })),
  scope: finalizingScope()
});
var sameFinalizingRecord = (record, captured) => record?.taskUid === captured?.taskUid && Number(record?.pausedAtMs) === Number(captured?.pausedAtMs) && (captured?.clockUid ? record?.clockUid === captured.clockUid : !record?.clockUid);
function persist() {
  if (unsupportedRaw2 !== null)
    return false;
  try {
    writeSetting(SETTING_PAUSED_BATCH, serialized2());
    return true;
  } catch (error) {
    notice3 || (notice3 = "Pause Batch could not be saved yet; its recovery state was retained.");
    console.warn("[roam-logbook] could not persist Pause Batch", error);
    return false;
  }
}
function notify2() {
  for (const listener of listeners2) {
    try {
      listener(getPaused());
    } catch (error) {
      console.error("[roam-logbook] paused-batch listener failed", error);
    }
  }
}
var handleClockAction = (action) => {
  if (!action || action.source === "pause" || action.source === "resume")
    return;
  const item = items.find((record) => record.taskUid === action.taskUid);
  if (!item)
    return;
  if (action.type === "clock-in") {
    item.reconciliationState = "externally-replaced";
    item.externalClockUid = action.clockUid;
    notice3 = "A paused Session was replaced by explicit clock activity; Resume All will not duplicate it.";
    persist();
    notify2();
    return;
  }
  if (action.type === "clock-out" && item.externalClockUid === action.clockUid) {
    item.reconciliationState = "externally-clocked-out";
    notice3 = "A paused Session was explicitly clocked out; Resume All will not recreate it.";
    persist();
    notify2();
  }
};
var ensureClockActionSubscription = () => {
  unsubscribeClockActions?.();
  unsubscribeClockActions = subscribeActions(handleClockAction);
};
function subscribe2(listener) {
  listeners2.add(listener);
  listener(getPaused());
  return () => listeners2.delete(listener);
}
function getPaused() {
  return items.map((item) => ({ ...item }));
}
function getPendingResume() {
  return pendingResume.map((item) => ({ ...item }));
}
function getRecoveryState() {
  if (!finalizing)
    return null;
  return {
    kind: "finalizing",
    action: "commit-pause-batch",
    targets: finalizing.targets.map((target) => ({ ...target })),
    pendingTaskUids: [...new Set(finalizing.targets.map((target) => target.taskUid))],
    pendingClockUids: finalizing.targets.map((target) => target.clockUid)
  };
}
function pruneCompleted(taskUids = []) {
  const completedTaskUids = [...new Set(taskUids.filter((uid) => typeof uid === "string" && uid))];
  if (unsupportedRaw2 !== null) {
    notice3 = "Saved paused-task state is unsupported; completed Tasks were not pruned.";
    notify2();
    return {
      action: "prune-completed-paused",
      ok: false,
      completedTaskUids,
      removed: 0,
      removedPaused: 0,
      removedPending: 0,
      uncertain: true,
      error: new Error(notice3)
    };
  }
  const scope = new Set(completedTaskUids);
  const previousItems = items;
  const previousPending = pendingResume;
  items = items.filter((item) => !scope.has(item.taskUid));
  pendingResume = pendingResume.filter((item) => !scope.has(item.taskUid));
  const removedPaused = previousItems.length - items.length;
  const removedPending = previousPending.length - pendingResume.length;
  if (removedPaused > 0 || removedPending > 0) {
    notice3 = "";
    if (!persist()) {
      items = previousItems;
      pendingResume = previousPending;
      notice3 = "Completed Tasks could not be removed from the saved Pause Batch; recovery state was kept.";
      notify2();
      return {
        action: "prune-completed-paused",
        ok: false,
        completedTaskUids,
        removed: 0,
        removedPaused: 0,
        removedPending: 0,
        uncertain: true,
        error: new Error(notice3)
      };
    }
    notify2();
  }
  return {
    action: "prune-completed-paused",
    ok: true,
    completedTaskUids,
    removed: removedPaused + removedPending,
    removedPaused,
    removedPending,
    uncertain: false,
    error: null
  };
}
function getNotice2() {
  return notice3;
}
function load2() {
  items = [];
  pendingResume = [];
  finalizing = null;
  notice3 = "";
  unsupportedRaw2 = null;
  ensureClockActionSubscription();
  const raw = readSetting(SETTING_PAUSED_BATCH);
  if (!raw)
    return getPaused();
  let recoverableItems = [];
  let recoverablePending = [];
  let recoverableFinalizing = null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed?.version === VERSION2 && parsed.data && Array.isArray(parsed.data.items)) {
      recoverableItems = parsed.data.items.map(cleanRecord).filter(Boolean);
      if ("pendingResume" in parsed.data && !Array.isArray(parsed.data.pendingResume)) {
        throw new Error("invalid pendingResume shape");
      }
      const needsMigration = parsed.data.items.some(hasLegacyPomodoroFields) || Array.isArray(parsed.data.pendingResume) && parsed.data.pendingResume.some(hasLegacyPomodoroFields);
      const loadedItems = parsed.data.items.map(cleanRecord);
      const loadedPending = Array.isArray(parsed.data.pendingResume) ? parsed.data.pendingResume.map((value) => cleanPending(value, { version: VERSION2 })) : [];
      recoverablePending = loadedPending.filter(Boolean);
      if (loadedItems.some((item) => !item) || loadedPending.some((item) => !item)) {
        throw new Error("invalid paused-task record");
      }
      if ("finalizing" in parsed.data && parsed.data.finalizing !== null) {
        recoverableFinalizing = cleanFinalizing(parsed.data.finalizing);
        if (!recoverableFinalizing)
          throw new Error("invalid finalizing Pause Batch marker");
      }
      const byTask = new Map(loadedItems.map((item) => [item.taskUid, item]));
      const pendingByTask = new Map(loadedPending.map((item) => [item.taskUid, item]));
      items = [...byTask.values()];
      pendingResume = [...pendingByTask.values()];
      finalizing = recoverableFinalizing;
      if (pendingResume.some((item) => item.recoveryState === "conflict")) {
        const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
        notice3 = firstWarning ? "A current pending Resume has no exact Session association; it was retained as a conflict." : "";
      }
      if (needsMigration)
        persist();
      return getPaused();
    }
    if (parsed?.version === LEGACY_VERSION && Array.isArray(parsed.items)) {
      recoverableItems = parsed.items.map(cleanRecord).filter(Boolean);
      const loaded = parsed.items.map(cleanRecord);
      const loadedPending = Array.isArray(parsed.pendingResume) ? parsed.pendingResume.map(
        (value) => cleanPending(value, { version: LEGACY_VERSION, legacy: true })
      ) : [];
      recoverablePending = loadedPending.filter(Boolean);
      if (loaded.some((item) => !item) || loadedPending.some((item) => !item)) {
        throw new Error("invalid legacy paused-task record");
      }
      items = [...new Map(loaded.map((item) => [item.taskUid, item])).values()];
      pendingResume = [...new Map(loadedPending.map((item) => [item.taskUid, item])).values()];
      persist();
      return getPaused();
    }
    throw new Error("unsupported paused-batch version");
  } catch (error) {
    items = [...new Map(recoverableItems.map((item) => [item.taskUid, item])).values()];
    pendingResume = [...new Map(recoverablePending.map((item) => [item.taskUid, item])).values()];
    finalizing = recoverableFinalizing;
    unsupportedRaw2 = raw;
    const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
    notice3 = firstWarning ? "Saved paused-task state uses an unsupported or invalid version and was kept." : "";
    if (firstWarning)
      console.warn("[roam-logbook] could not read paused task state", error);
    return getPaused();
  }
}
var pausedRecord = (snapshot) => {
  const { clockUid: _clockUid, ...record } = snapshot;
  return record;
};
var pauseBatchResult = ({
  completed = 0,
  failed = 0,
  pendingClockUids = [],
  pendingTaskUids = [],
  uncertain = false,
  error = null,
  retry = null,
  ...extra
} = {}) => {
  const clockUids = [...new Set(pendingClockUids.filter(Boolean))];
  const taskUids = [...new Set(pendingTaskUids.filter(Boolean))];
  const incomplete = uncertain || failed > 0 || clockUids.length > 0 || taskUids.length > 0;
  return {
    action: "pause-all",
    ok: !incomplete,
    paused: completed,
    count: completed,
    completed,
    failed,
    pending: Math.max(clockUids.length, taskUids.length),
    pendingClockUids: clockUids,
    pendingTaskUids: taskUids,
    uncertain: Boolean(uncertain),
    partial: Boolean(incomplete && completed > 0),
    retry: retry || (incomplete ? { action: "pause", retryClockUids: clockUids, retryTaskUids: taskUids } : null),
    error: error || (failed > 0 ? new Error("One or more Sessions could not be paused.") : null),
    item: "Session",
    completedVerb: "paused",
    ...extra
  };
};
async function pauseAll({ now = /* @__PURE__ */ new Date() } = {}) {
  if (unsupportedRaw2 !== null) {
    notice3 = "Saved paused-task state is unsupported; no Tasks were paused.";
    notify2();
    return pauseBatchResult({
      failed: items.length,
      pendingTaskUids: items.map((item) => item.taskUid),
      uncertain: true,
      error: new Error(notice3)
    });
  }
  notice3 = "";
  const originalItems = items.map((item) => ({ ...item }));
  let previous;
  try {
    previous = new Map(
      items.map((item) => {
        const taskUid = resolveTaskUid(item.taskUid) || item.taskUid;
        return [taskUid, { ...item, taskUid }];
      })
    );
  } catch {
    notice3 = getNotice() || "Unable to pause Tasks because the graph is unavailable.";
    notify2();
    const pendingClockUids2 = getRunning().map((entry) => entry.clockUid);
    const pendingTaskUids2 = getRunning().map((entry) => entry.taskUid);
    return pauseBatchResult({
      failed: pendingClockUids2.length,
      pendingClockUids: pendingClockUids2,
      pendingTaskUids: pendingTaskUids2,
      uncertain: true,
      error: new Error(notice3)
    });
  }
  const merged = new Map(previous);
  let outcome;
  try {
    outcome = await pauseEntries({
      now,
      prepare: (entries) => {
        const snapshots = entries.map((entry) => ({
          taskUid: entry.taskUid,
          title: entry.title,
          pausedAtMs: now.getTime(),
          clockUid: entry.clockUid
        }));
        for (const snapshot of snapshots) {
          const record = pausedRecord(snapshot);
          merged.set(record.taskUid, record);
        }
        items = [...merged.values()];
        if (!persist()) {
          const error = new Error(notice3 || "Pause Batch could not be saved before closing Sessions.");
          error.uncertain = true;
          throw error;
        }
        return snapshots;
      }
    });
  } catch {
    items = originalItems;
    notice3 = getNotice() || "Unable to pause Tasks because the graph is unavailable.";
    notify2();
    const pendingClockUids2 = getRunning().map((entry) => entry.clockUid);
    const pendingTaskUids2 = getRunning().map((entry) => entry.taskUid);
    return pauseBatchResult({
      failed: pendingClockUids2.length,
      pendingClockUids: pendingClockUids2,
      pendingTaskUids: pendingTaskUids2,
      uncertain: true,
      error: new Error(notice3)
    });
  }
  if (outcome.preflight) {
    items = originalItems;
    notice3 = "Pause Batch could not be saved before closing Sessions; no Session was changed.";
    notify2();
    return pauseBatchResult({
      failed: outcome.pendingClockUids?.length || 0,
      pendingClockUids: outcome.pendingClockUids || [],
      pendingTaskUids: outcome.entries?.filter((entry) => entry.running).map((entry) => entry.taskUid) || [],
      uncertain: true,
      error: outcome.error || new Error(notice3)
    });
  }
  let failed = 0;
  const byClockUid = new Map(outcome.results.map((result) => [result.clockUid, result]));
  for (const snapshot of outcome.records) {
    const result = byClockUid.get(snapshot.clockUid);
    if (result?.closed)
      continue;
    failed += 1;
    if (previous.has(snapshot.taskUid))
      merged.set(snapshot.taskUid, previous.get(snapshot.taskUid));
    else
      merged.set(snapshot.taskUid, pausedRecord(snapshot));
    console.error("[roam-logbook] could not pause task", snapshot.taskUid, result?.error);
  }
  items = [...merged.values()];
  if (outcome.uncertain) {
    notice3 = GRAPH_UNCERTAIN;
  } else if (failed > 0) {
    notice3 = `${failed} Task${failed === 1 ? "" : "s"} could not be paused.`;
  }
  const persisted = persist();
  if (!persisted)
    notice3 || (notice3 = "Pause Batch could not be saved yet; its recovery state was retained.");
  notify2();
  const pendingSnapshots = outcome.records.filter((snapshot) => {
    const result = byClockUid.get(snapshot.clockUid);
    return !result?.closed;
  });
  const pendingClockUids = pendingSnapshots.map((snapshot) => snapshot.clockUid);
  const pendingTaskUids = pendingSnapshots.map((snapshot) => snapshot.taskUid);
  const incomplete = Boolean(outcome.uncertain) || failed > 0 || pendingSnapshots.length > 0;
  return pauseBatchResult({
    completed: outcome.closed,
    failed,
    pendingClockUids,
    pendingTaskUids,
    uncertain: Boolean(outcome.uncertain || !persisted),
    retry: incomplete ? {
      ...outcome.retry || { action: "pause" },
      action: "pause",
      retryClockUids: pendingClockUids,
      retryTaskUids: pendingTaskUids
    } : null,
    error: outcome.error || pendingSnapshots.find((snapshot) => byClockUid.get(snapshot.clockUid)?.error)?.error || null
  });
}
var existingTask = (record) => {
  try {
    const taskUid = resolveTaskUid(record.taskUid);
    const string = getBlockString(taskUid);
    return string === null ? null : { ...record, taskUid, title: taskTitle(string) || record.title };
  } catch (error) {
    if (error instanceof GraphReadError)
      return { uncertain: true, error };
    throw error;
  }
};
var removeTask = (taskUid) => {
  items = items.filter((item) => item.taskUid !== taskUid);
};
async function recoverPending({ running: running2 = [] } = {}) {
  let recovered = 0;
  let failed = 0;
  let legacyRecovered = 0;
  const conflicts = [];
  const legacyToCreate = [];
  const byClockUid = new Map(running2.map((entry) => [entry.clockUid, entry]));
  for (const pending of [...pendingResume]) {
    let entry = null;
    if (pending.clockUid) {
      entry = byClockUid.get(pending.clockUid) || null;
      if (!entry || entry.taskUid !== pending.taskUid) {
        conflicts.push({
          taskUid: pending.taskUid,
          clockUid: pending.clockUid,
          reason: "exact Session association is missing or belongs to another Task"
        });
        continue;
      }
    } else if (pending.legacy === true) {
      const matches = running2.filter((item) => item.taskUid === pending.taskUid);
      if (matches.length === 1)
        entry = matches[0];
      else if (matches.length > 1) {
        conflicts.push({
          taskUid: pending.taskUid,
          reason: "legacy pending record matched more than one running Session"
        });
        continue;
      } else {
        legacyToCreate.push(pending);
        continue;
      }
    } else {
      conflicts.push({
        taskUid: pending.taskUid,
        reason: "current pending Resume has no clockUid; exact Session association is required"
      });
      continue;
    }
    pendingResume = pendingResume.filter((item) => item.taskUid !== pending.taskUid);
    removeTask(pending.taskUid);
    persist();
    recovered += 1;
    if (pending.legacy === true)
      legacyRecovered += 1;
  }
  return { recovered, failed, conflicts, legacyToCreate, legacyRecovered };
}
var pendingTasks = () => new Set(pendingResume.map((item) => item.taskUid));
function reconcileFinalizing({ running: running2 = [] } = {}) {
  if (!finalizing) {
    return {
      ok: true,
      uncertain: false,
      activeTaskUids: [],
      activeClockUids: []
    };
  }
  const runningByClock = new Map(running2.map((entry) => [entry.clockUid, entry]));
  const activeTargets = finalizing.targets.filter((target) => {
    const entry = runningByClock.get(target.clockUid);
    return entry?.taskUid === target.taskUid;
  });
  const activeTaskUids = new Set(activeTargets.map((target) => target.taskUid));
  const activeClockUids = activeTargets.map((target) => target.clockUid);
  const previousItems = items;
  const previousPending = pendingResume;
  const previousFinalizing = finalizing;
  const capturedScope = finalizing.scope;
  if (capturedScope) {
    const removableTaskUids = new Set(
      [...capturedScope.items, ...capturedScope.pendingResume].map((record) => record.taskUid).filter((taskUid) => !activeTaskUids.has(taskUid))
    );
    const removeCaptured = (records, captured) => {
      const remainingCaptured = captured.slice();
      return records.filter((record) => {
        if (!removableTaskUids.has(record.taskUid))
          return true;
        const index = remainingCaptured.findIndex((item) => sameFinalizingRecord(record, item));
        if (index < 0)
          return true;
        remainingCaptured.splice(index, 1);
        return false;
      });
    };
    items = removeCaptured(items, capturedScope.items);
    pendingResume = removeCaptured(pendingResume, capturedScope.pendingResume);
  } else {
    items = items.filter((item) => activeTaskUids.has(item.taskUid));
    pendingResume = pendingResume.filter((item) => activeTaskUids.has(item.taskUid));
  }
  finalizing = activeTargets.length > 0 ? { ...finalizing, targets: activeTargets } : null;
  const changed = previousItems.length !== items.length || previousPending.length !== pendingResume.length || JSON.stringify(previousFinalizing) !== JSON.stringify(finalizing);
  if (!changed) {
    return {
      ok: true,
      uncertain: false,
      activeTaskUids: [...activeTaskUids],
      activeClockUids
    };
  }
  if (!persist()) {
    items = previousItems;
    pendingResume = previousPending;
    finalizing = previousFinalizing;
    notice3 = "Clock Out All was confirmed in the graph, but its recovery state could not be committed yet.";
    notify2();
    return {
      ok: false,
      uncertain: true,
      activeTaskUids: [...activeTaskUids],
      activeClockUids,
      error: new Error(notice3)
    };
  }
  notify2();
  return { ok: true, uncertain: false, activeTaskUids: [...activeTaskUids], activeClockUids };
}
var resumeBatchResult = ({
  completed = 0,
  failed = 0,
  pendingTaskUids = [],
  uncertain = false,
  blocked = false,
  error = null,
  retry = null,
  ...extra
} = {}) => {
  const pending = [...new Set(pendingTaskUids.filter(Boolean))];
  const incomplete = blocked || uncertain || failed > 0 || pending.length > 0;
  return {
    action: "resume-all",
    ok: !incomplete,
    count: completed,
    completed,
    resumed: completed,
    failed,
    pending: pending.length,
    pendingTaskUids: pending,
    uncertain: Boolean(uncertain),
    partial: Boolean(incomplete && completed > 0),
    retry: retry || (incomplete ? { action: "resume", retryTaskUids: pending } : null),
    error: error || (failed > 0 ? new Error("One or more Tasks could not be resumed.") : null),
    item: "Task",
    completedVerb: "resumed",
    blocked,
    ...extra
  };
};
var resumeOneResult = ({
  completed = 0,
  failed = 0,
  pendingTaskUids = [],
  uncertain = false,
  error = null,
  retry = null,
  ...extra
} = {}) => {
  const pending = [...new Set(pendingTaskUids.filter(Boolean))];
  const incomplete = uncertain || failed > 0 || pending.length > 0;
  return {
    action: "resume-one",
    ok: !incomplete,
    count: completed,
    completed,
    resumed: completed,
    failed,
    pending: pending.length,
    pendingTaskUids: pending,
    uncertain: Boolean(uncertain),
    partial: Boolean(incomplete && completed > 0),
    retry: retry || (incomplete ? { action: "resume", retryTaskUids: pending } : null),
    error: error || (failed > 0 ? new Error("The Session could not be resumed.") : null),
    item: "Session",
    completedVerb: "resumed",
    ...extra
  };
};
var commitFinalizingResult = ({ hadFinalizing = false, finalized }) => {
  const activeTaskUids = finalized?.activeTaskUids || [];
  const activeClockUids = finalized?.activeClockUids || [];
  const uncertain = Boolean(finalized?.uncertain || finalized?.ok === false);
  const blocked = activeTaskUids.length > 0;
  const ok = !uncertain && !blocked;
  const error = finalized?.error || (blocked ? new Error("Clock Out All still has running Sessions.") : null);
  return {
    action: "commit-pause-batch",
    ok,
    committed: Boolean(hadFinalizing && ok),
    count: Boolean(hadFinalizing && ok) ? 1 : 0,
    completed: Boolean(hadFinalizing && ok) ? 1 : 0,
    failed: uncertain ? 1 : activeTaskUids.length,
    pending: activeClockUids.length,
    pendingTaskUids: activeTaskUids,
    pendingClockUids: activeClockUids,
    uncertain,
    partial: false,
    blocked,
    retry: ok ? null : {
      action: "commit-pause-batch",
      retryTaskUids: activeTaskUids,
      retryClockUids: activeClockUids
    },
    error,
    item: "Pause Batch",
    completedVerb: "committed"
  };
};
async function resumeRecord(record, now) {
  let pending = pendingResume.find((item) => item.taskUid === record.taskUid);
  let createdPending = false;
  if (!pending) {
    pending = {
      ...record,
      clockUid: null,
      legacy: false,
      sourceVersion: VERSION2,
      recoveryState: "in-flight"
    };
    pendingResume.push(pending);
    persist();
    createdPending = true;
  }
  let entry = pending.clockUid ? getRunning().find((item) => item.clockUid === pending.clockUid) : pending.legacy === true ? getRunning().find((item) => item.taskUid === record.taskUid) : null;
  if (pending.clockUid && (!entry || entry.taskUid !== record.taskUid)) {
    const conflict = new Error(
      `Resume conflict for ${record.taskUid}: exact Session ${pending.clockUid} is unavailable.`
    );
    conflict.conflict = true;
    throw conflict;
  }
  if (!pending.clockUid && !pending.legacy && !createdPending) {
    const conflict = new Error(
      `Resume conflict for ${record.taskUid}: current pending Resume has no exact clockUid.`
    );
    conflict.conflict = true;
    throw conflict;
  }
  if (!entry) {
    let result;
    try {
      result = await clockIn(record.taskUid, { now, source: "resume" });
    } catch (error) {
      if (createdPending && !error?.uncertain) {
        pendingResume = pendingResume.filter((item) => item.taskUid !== record.taskUid);
        persist();
      }
      throw error;
    }
    if (result?.uncertain) {
      if (result.clockUid) {
        pending.clockUid = result.clockUid;
        persist();
      }
      const uncertain = new Error(result.notice || getNotice());
      uncertain.uncertain = true;
      throw uncertain;
    }
    entry = getRunning().find((item) => item.clockUid === result.clockUid) || result;
  }
  pending.clockUid = entry.clockUid;
  pending.legacy = false;
  pending.sourceVersion = VERSION2;
  delete pending.recoveryState;
  delete pending.recoveryIssue;
  persist();
  pendingResume = pendingResume.filter((item) => item.taskUid !== record.taskUid);
  removeTask(record.taskUid);
  persist();
  return entry;
}
async function resumeOne(taskUid, { now = /* @__PURE__ */ new Date() } = {}) {
  if (unsupportedRaw2 !== null) {
    notice3 = "Saved paused-task state is unsupported; no Sessions were resumed.";
    notify2();
    return resumeOneResult({
      failed: 1,
      pendingTaskUids: [taskUid],
      uncertain: true,
      error: new Error(notice3)
    });
  }
  notice3 = "";
  const initial = refreshResult();
  if (!initial.ok) {
    notice3 = getNotice() || GRAPH_UNCERTAIN;
    notify2();
    return resumeOneResult({
      failed: 1,
      pendingTaskUids: [taskUid],
      uncertain: true,
      error: initial.error
    });
  }
  const record = items.find((item) => item.taskUid === taskUid);
  const alreadyRunning = initial.running.find((entry) => entry.taskUid === taskUid);
  if (!record) {
    return resumeOneResult({ alreadyRunning: Boolean(alreadyRunning) });
  }
  if (record.reconciliationState) {
    removeTask(taskUid);
    persist();
    notice3 = record.reconciliationState === "externally-clocked-out" ? "The paused Session was already clocked out and was not reopened." : "The paused Session was replaced by explicit clock activity and was not duplicated.";
    notify2();
    return resumeOneResult({ reconciled: true });
  }
  if (alreadyRunning) {
    removeTask(taskUid);
    persist();
    notify2();
    return resumeOneResult({ alreadyRunning: true });
  }
  const valid = existingTask(record);
  if (valid?.uncertain) {
    notice3 = GRAPH_UNCERTAIN;
    notify2();
    return resumeOneResult({
      failed: 1,
      pendingTaskUids: [taskUid],
      uncertain: true,
      error: valid.error
    });
  }
  if (!valid) {
    notice3 = `Task ${taskUid} could not be confirmed; the paused Session was kept.`;
    notify2();
    return resumeOneResult({
      failed: 1,
      pendingTaskUids: [taskUid],
      error: new Error(notice3)
    });
  }
  let enabledMultiple = false;
  if (initial.running.length > 0 && !allowMultipleClocks()) {
    try {
      writeSetting(SETTING_MULTIPLE, true);
    } catch (error) {
      notice3 = "Multiple clocks could not be enabled; the paused Session was kept.";
      notify2();
      return resumeOneResult({
        failed: 1,
        pendingTaskUids: [taskUid],
        error
      });
    }
    if (!allowMultipleClocks()) {
      notice3 = "Multiple clocks could not be enabled; the paused Session was kept.";
      notify2();
      return resumeOneResult({
        failed: 1,
        pendingTaskUids: [taskUid],
        error: new Error(notice3)
      });
    }
    enabledMultiple = true;
  }
  try {
    await resumeRecord(valid, now);
  } catch (error) {
    if (error?.code === "done-ancestor") {
      const cleanup = pruneCompleted([taskUid]);
      notice3 = "The paused Session was under a completed Task and was not resumed.";
      notify2();
      return resumeOneResult({
        reconciled: true,
        pruned: cleanup.removed,
        completedTaskUids: [taskUid]
      });
    }
    notice3 = error?.uncertain ? GRAPH_UNCERTAIN : error?.message || "The paused Session could not be resumed.";
    notify2();
    return resumeOneResult({
      failed: 1,
      pendingTaskUids: [taskUid],
      uncertain: Boolean(error?.uncertain),
      error
    });
  }
  notice3 = enabledMultiple ? "Multiple clocks were enabled to resume this Session." : "";
  notify2();
  return resumeOneResult({ completed: 1, enabledMultiple });
}
async function resumeAll({ now = /* @__PURE__ */ new Date(), reconcileOnly = false } = {}) {
  if (unsupportedRaw2 !== null) {
    notice3 = "Saved paused-task state is unsupported; no Tasks were resumed.";
    notify2();
    return resumeBatchResult({
      blocked: true,
      pendingTaskUids: [...items, ...pendingResume].map((item) => item.taskUid),
      error: new Error(notice3),
      pruned: 0,
      satisfied: 0
    });
  }
  const hadFinalizing = Boolean(finalizing);
  notice3 = "";
  const initial = refreshResult();
  if (!initial.ok) {
    notice3 = getNotice() || "Graph state could not be confirmed; no further changes were made.";
    notify2();
    if (reconcileOnly) {
      return commitFinalizingResult({
        hadFinalizing,
        finalized: { ok: false, uncertain: true, activeTaskUids: [], activeClockUids: [], error: initial.error }
      });
    }
    return resumeBatchResult({
      failed: pendingResume.length + items.length,
      pendingTaskUids: [...items, ...pendingResume].map((item) => item.taskUid),
      pruned: 0,
      satisfied: 0,
      blocked: true,
      uncertain: true,
      error: initial.error
    });
  }
  const finalized = reconcileFinalizing({ running: initial.running });
  if (reconcileOnly) {
    if (finalized.activeTaskUids.length > 0) {
      notice3 = "Clock Out All still has running Sessions; they were kept for an explicit retry.";
      notify2();
    }
    return commitFinalizingResult({ hadFinalizing, finalized });
  }
  if (!finalized.ok) {
    return resumeBatchResult({
      failed: finalized.activeTaskUids.length,
      pendingTaskUids: [...items, ...pendingResume].map((item) => item.taskUid),
      blocked: true,
      uncertain: true,
      error: finalized.error,
      pruned: 0,
      satisfied: 0
    });
  }
  if (finalized.activeTaskUids.length > 0) {
    notice3 = "Clock Out All still has running Sessions; they were kept for an explicit retry.";
    notify2();
    return resumeBatchResult({
      failed: finalized.activeTaskUids.length,
      pendingTaskUids: finalized.activeTaskUids,
      blocked: true,
      error: new Error(notice3),
      pruned: 0,
      satisfied: 0
    });
  }
  const recovered = await recoverPending({ running: initial.running });
  const runningEntries = getRunning();
  const runningTasks = new Set(runningEntries.map((entry) => entry.taskUid));
  const retained = [];
  const ready = [];
  const plannedTasks = /* @__PURE__ */ new Set();
  const blockedPending = pendingTasks();
  let pruned = 0;
  let satisfied = 0;
  let uncertain = 0;
  let reconciled = 0;
  let completedPruned = 0;
  for (const pending of recovered.legacyToCreate) {
    const valid = existingTask(pending);
    if (valid?.uncertain) {
      uncertain += 1;
      continue;
    }
    if (!valid) {
      recovered.conflicts.push({
        taskUid: pending.taskUid,
        reason: "legacy pending Task could not be found"
      });
      continue;
    }
    if (!plannedTasks.has(valid.taskUid)) {
      plannedTasks.add(valid.taskUid);
      ready.push(valid);
    }
  }
  for (const record of [...items]) {
    if (record.reconciliationState) {
      reconciled += 1;
      continue;
    }
    const valid = existingTask(record);
    if (valid?.uncertain) {
      uncertain += 1;
      retained.push(record);
      continue;
    }
    if (!valid) {
      pruned += 1;
      continue;
    }
    if (blockedPending.has(valid.taskUid)) {
      retained.push(valid);
      continue;
    }
    if (runningTasks.has(valid.taskUid) || plannedTasks.has(valid.taskUid)) {
      satisfied += 1;
      continue;
    }
    plannedTasks.add(valid.taskUid);
    ready.push(valid);
  }
  const needsMultiple = ready.length > 1 || ready.length > 0 && runningEntries.length > 0;
  let enabledMultiple = false;
  if (needsMultiple && !allowMultipleClocks()) {
    try {
      writeSetting(SETTING_MULTIPLE, true);
    } catch (error) {
      console.error("[roam-logbook] could not enable multiple clocks for Resume All", error);
    }
    if (!allowMultipleClocks()) {
      notice3 = "Multiple clocks could not be enabled; no paused Tasks were resumed.";
      items = [...retained, ...ready];
      persist();
      notify2();
      return {
        ...resumeBatchResult({
          completed: recovered.recovered,
          failed: recovered.failed + recovered.conflicts.length + ready.length,
          pendingTaskUids: [...retained, ...ready, ...pendingResume].map((item) => item.taskUid),
          blocked: true,
          error: new Error(notice3),
          pruned,
          satisfied
        }),
        conflicts: recovered.conflicts
      };
    }
    enabledMultiple = true;
  }
  let resumed = recovered.recovered;
  let failed = recovered.failed + uncertain + recovered.conflicts.length;
  let legacyRecovered = recovered.legacyRecovered;
  let mutationUncertain = uncertain > 0;
  let firstError = null;
  const legacyRecovery = recovered.legacyRecovered > 0 || recovered.legacyToCreate.length > 0;
  const completedTasks = /* @__PURE__ */ new Set();
  for (const record of ready) {
    try {
      await resumeRecord(record, now);
      resumed += 1;
      if (record.legacy === true)
        legacyRecovered += 1;
      completedTasks.add(record.taskUid);
    } catch (error) {
      if (error?.code === "done-ancestor") {
        completedPruned += pruneCompleted([record.taskUid]).removed;
        completedTasks.add(record.taskUid);
        continue;
      }
      failed += 1;
      retained.push(record);
      console.error("[roam-logbook] could not resume task", record.taskUid, error);
      firstError || (firstError = error);
      if (error?.uncertain) {
        mutationUncertain = true;
        for (const remaining of ready.slice(ready.indexOf(record) + 1))
          retained.push(remaining);
        break;
      }
    }
  }
  items = retained.filter((item) => !completedTasks.has(item.taskUid));
  const messages = [];
  if (enabledMultiple)
    messages.push(`Multiple clocks were enabled to resume ${ready.length} Tasks.`);
  if (pruned > 0)
    messages.push(`${pruned} missing Task${pruned === 1 ? " was" : "s were"} removed.`);
  if (completedPruned > 0) {
    messages.push(
      `${completedPruned} paused Session${completedPruned === 1 ? " was" : "s were"} under a completed Task and not resumed.`
    );
  }
  if (failed > 0)
    messages.push(`${failed} Task${failed === 1 ? "" : "s"} could not be resumed.`);
  if (uncertain > 0) {
    messages.push(
      `${uncertain} Task${uncertain === 1 ? "" : "s"} could not be confirmed because the graph is unavailable.`
    );
  }
  if (recovered.conflicts.length > 0) {
    messages.push(
      `${recovered.conflicts.length} pending Resume conflict${recovered.conflicts.length === 1 ? "" : "s"} were retained; exact Session associations were not changed.`
    );
  }
  if (legacyRecovery) {
    messages.push("Legacy Resume recovery used explicit Task matching.");
  }
  if (reconciled > 0) {
    messages.push(
      `${reconciled} paused Session${reconciled === 1 ? " was" : "s were"} reconciled with explicit clock activity.`
    );
    items = items.filter((item) => !item.reconciliationState);
  }
  notice3 = messages.join(" ");
  persist();
  notify2();
  return resumeBatchResult({
    completed: resumed,
    failed,
    pendingTaskUids: [...items, ...pendingResume].map((item) => item.taskUid),
    uncertain: mutationUncertain,
    error: firstError,
    pruned,
    completedPruned,
    satisfied,
    blocked: false,
    legacyRecovery,
    legacyRecovered
  });
}
async function retryFinalizing({ now = /* @__PURE__ */ new Date() } = {}) {
  if (!finalizing)
    return commitFinalizingResult({ hadFinalizing: false, finalized: { ok: true } });
  return resumeAll({ now, reconcileOnly: true });
}
async function clockOutAll({ now = /* @__PURE__ */ new Date() } = {}) {
  let outcome;
  try {
    outcome = await clockOutEntries(null, {
      now,
      prepare: (entries) => {
        const previousFinalizing = finalizing;
        finalizing = makeFinalizing(entries);
        if (!persist()) {
          finalizing = previousFinalizing;
          const error = new Error(
            notice3 || "Pause Batch could not be saved before closing Sessions."
          );
          error.uncertain = true;
          throw error;
        }
      }
    });
  } catch {
    notice3 = getNotice() || "Unable to finish Sessions because the graph is unavailable.";
    notify2();
    const pendingClockUids2 = getRunning().map((entry) => entry.clockUid);
    return {
      action: "clock-out-all",
      ok: false,
      count: 0,
      completed: 0,
      failed: pendingClockUids2.length,
      pending: pendingClockUids2.length,
      pendingClockUids: pendingClockUids2,
      partial: false,
      uncertain: true,
      error: new Error(notice3),
      retry: { action: "close", retryClockUids: pendingClockUids2, writtenClockUids: [] },
      item: "Session",
      completedVerb: "ended"
    };
  }
  if (outcome?.preflight) {
    notice3 = "Pause Batch could not be saved before closing Sessions; no Session was changed.";
    notify2();
    return {
      ...outcome,
      action: "clock-out-all",
      ok: false,
      item: "Session",
      completedVerb: "ended",
      count: 0,
      completed: 0,
      partial: false
    };
  }
  if (!Array.isArray(outcome?.results)) {
    notice3 = getNotice() || "Unable to finish Sessions because the graph is unavailable.";
    notify2();
    return {
      action: "clock-out-all",
      ok: false,
      count: 0,
      completed: 0,
      failed: getRunning().length,
      pending: getRunning().length,
      pendingClockUids: getRunning().map((entry) => entry.clockUid),
      partial: false,
      uncertain: true,
      error: new Error(notice3),
      retry: { action: "close", retryClockUids: getRunning().map((entry) => entry.clockUid) },
      item: "Session",
      completedVerb: "ended"
    };
  }
  const closedUids = new Set(
    outcome.results.filter((result) => result.closed).map((result) => result.clockUid)
  );
  const stillRunning = (outcome.entries || getRunning()).filter(
    (entry) => entry.running && !closedUids.has(entry.clockUid)
  );
  if (!outcome.uncertain && outcome.failed === 0 && stillRunning.length === 0) {
    const previousFinalizing = finalizing;
    items = [];
    pendingResume = [];
    finalizing = null;
    notice3 = "";
    const persisted2 = persist();
    if (!persisted2) {
      finalizing = previousFinalizing || {
        action: "clock-out-all",
        targets: (outcome.entries || []).map((entry) => ({
          taskUid: entry.taskUid,
          clockUid: entry.clockUid
        }))
      };
      notice3 = "Sessions were closed, but clearing the saved Pause Batch could not be committed yet.";
      notify2();
      return {
        ...outcome,
        action: "clock-out-all",
        ok: false,
        item: "Session",
        completedVerb: "ended",
        count: outcome.closed,
        completed: outcome.closed,
        pending: 0,
        pendingClockUids: [],
        uncertain: true,
        partial: false,
        retry: {
          action: "commit-pause-batch",
          retryClockUids: [],
          writtenClockUids: outcome.results.filter((result) => result.closed).map((result) => result.clockUid)
        },
        error: new Error(notice3)
      };
    }
    notify2();
    return {
      ...outcome,
      action: "clock-out-all",
      item: "Session",
      completedVerb: "ended",
      count: outcome.closed,
      completed: outcome.closed,
      pending: 0,
      pendingClockUids: []
    };
  }
  const retained = new Map(
    items.filter((item) => stillRunning.some((entry) => entry.taskUid === item.taskUid)).map((item) => [item.taskUid, item])
  );
  for (const entry of stillRunning) {
    retained.set(entry.taskUid, {
      taskUid: entry.taskUid,
      title: entry.title,
      pausedAtMs: now.getTime(),
      clockUid: entry.clockUid
    });
  }
  items = [...retained.values()];
  pendingResume = pendingResume.filter((item) => stillRunning.some((entry) => entry.taskUid === item.taskUid));
  finalizing = makeFinalizing(outcome.entries || []);
  notice3 = outcome.uncertain ? GRAPH_UNCERTAIN : `${stillRunning.length} Session${stillRunning.length === 1 ? "" : "s"} could not be closed.`;
  const persisted = persist();
  if (!persisted) {
    notice3 = "Sessions were partly closed, but their durable recovery state could not be committed yet.";
  }
  notify2();
  const pendingClockUids = stillRunning.map((entry) => entry.clockUid);
  return {
    ...outcome,
    action: "clock-out-all",
    ok: false,
    item: "Session",
    completedVerb: "ended",
    count: outcome.closed,
    completed: outcome.closed,
    uncertain: Boolean(outcome.uncertain || !persisted),
    pending: pendingClockUids.length,
    pendingClockUids,
    partial: Boolean(outcome.partial || outcome.closed > 0 && pendingClockUids.length > 0),
    retry: {
      ...outcome.retry || { action: "close" },
      retryClockUids: pendingClockUids,
      writtenClockUids: outcome.results.filter((result) => result.closed).map((result) => result.clockUid)
    }
  };
}
function clear() {
  if (unsupportedRaw2 !== null) {
    notice3 = "Saved paused-task state is unsupported and was kept.";
    notify2();
    return false;
  }
  items = [];
  pendingResume = [];
  finalizing = null;
  notice3 = "";
  persist();
  notify2();
  return true;
}
function reset3() {
  items = [];
  pendingResume = [];
  finalizing = null;
  notice3 = "";
  unsupportedRaw2 = null;
  listeners2.clear();
  unsubscribeClockActions?.();
  unsubscribeClockActions = null;
}

// src/action-result.js
var GRAPH_SYNC_RETRY_NOTICE = "Graph state could not be confirmed; no further changes were made. Retry after Roam finishes syncing.";
var presentedResults = /* @__PURE__ */ new WeakSet();
function mutationResultNotice(result) {
  if (!result)
    return "";
  const message = typeof result?.message === "string" ? result.message : result?.error?.message;
  if (result?.invalidated === true) {
    return result.notice || "This action was interrupted by an extension reload before it could be applied. Retry.";
  }
  if (result?.uncertain === true || typeof message === "string" && /Graph state could not be confirmed/i.test(message)) {
    return GRAPH_SYNC_RETRY_NOTICE;
  }
  const failed = Number.isFinite(Number(result?.failed)) ? Number(result.failed) : 0;
  const pending = Number.isFinite(Number(result?.pending)) ? Number(result.pending) : 0;
  if (result?.partial === true || failed > 0 || pending > 0 || result?.retry) {
    const completed = Number.isFinite(Number(result?.completed)) ? Number(result.completed) : Number.isFinite(Number(result?.count)) ? Number(result.count) : 0;
    const noun = result?.item || "Session";
    const completedVerb = result?.completedVerb || "updated";
    const failedCount = failed || pending;
    const completedText = `${completed} ${noun}${completed === 1 ? "" : "s"} ${completedVerb}`;
    const failedText = `${failedCount} could not be updated`;
    const detail = result?.action === "resume-one" && typeof message === "string" && message.trim() ? ` ${message.trim()}` : "";
    return completed > 0 ? `${completedText}; ${failedText}.${detail} Retry after Roam finishes syncing.` : `${failedText[0].toUpperCase()}${failedText.slice(1)}.${detail} Retry after Roam finishes syncing.`;
  }
  return "";
}
function presentMutationResult(result, notifyUser) {
  if (!result || typeof result !== "object" && typeof result !== "function")
    return result;
  if (presentedResults.has(result))
    return result;
  presentedResults.add(result);
  const notice4 = mutationResultNotice(result);
  if (notice4)
    notifyUser?.(notice4);
  return result;
}

// src/styles.js
var STYLE_ID = "roam-logbook-styles";
var STYLES = `
.rlb-topbar {
    --rlb-topbar-load-yellow: #b38600;
    --rlb-topbar-load-red: #c23030;
    display: flex;
    align-items: center;
    position: relative;
    flex: 0 0 auto;
    min-width: max-content;
    max-width: 100%;
    white-space: nowrap;
    /* Roam's controls carry no margin of their own, so the widget has to keep
       its own distance rather than butt up against the one beside it. */
    margin: 0 3px;
}

.rlb-topbar__button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0 4px;
    overflow: visible;
    min-width: max-content;
    max-width: 100%;
    white-space: nowrap;
    background: transparent;
    font-variant-numeric: tabular-nums;
}

/* Idle is a real icon-only control, not a max-content text button. Roam's
   Blueprint button rules otherwise collapse the hit target to the icon's
   pseudo-element, which paints the hover state as a narrow vertical strip. */
.rlb-topbar__button--icon-only {
    position: relative;
    width: 32px !important;
    min-width: 32px !important;
    max-width: 34px !important;
    height: 32px !important;
    min-height: 32px !important;
    max-height: 34px !important;
    padding: 0 !important;
    border-radius: 4px;
}

.rlb-topbar__button--icon-only::before {
    display: none !important;
    content: none !important;
}

.rlb-topbar__button--icon-only > .rlb-topbar__icon {
    display: block;
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    margin: 0 !important;
}

.rlb-topbar__button--icon-only:hover,
.rlb-topbar__button--icon-only:focus-visible {
    background: rgba(167, 182, 194, 0.24) !important;
}

.rlb-topbar__button--paused {
    background: transparent !important;
}

.rlb-topbar__button--paused > .rlb-topbar__icon {
    color: var(--rlb-topbar-load-yellow) !important;
}

.rlb-topbar__button--paused:hover,
.rlb-topbar__button--paused:focus-visible {
    background: rgba(167, 182, 194, 0.24) !important;
}

.bp3-dark .rlb-topbar__button--paused > .rlb-topbar__icon {
    color: var(--rlb-topbar-load-yellow) !important;
}

.bp3-dark .rlb-topbar {
    --rlb-topbar-load-yellow: #e6c35c;
    --rlb-topbar-load-red: #ff7373;
}

/* The widget shares the left navigation row with Roam's expanding search.
   These classes are applied to the actual host/child found at attach time, so
   the search can shrink into remaining space without ever shrinking this unit. */
.rlb-topbar__layout {
    display: flex;
    align-items: center;
    min-width: 0;
    container-type: inline-size;
    container-name: rlb-topbar;
}

.rlb-topbar__layout > .rlb-topbar {
    flex: 0 0 auto;
    min-width: max-content;
    white-space: nowrap;
}

.rlb-topbar__search {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
}

/* At genuinely narrow widths the elapsed value is the useful invariant. The
   session count remains available in the surface header rather than forcing a
   second line or overlapping Roam's search control. */
@container rlb-topbar (max-width: 420px) {
    .rlb-topbar__button--parallel {
        grid-template-columns: max-content !important;
    }

    .rlb-topbar__button--parallel > .rlb-topbar__separator,
    .rlb-topbar__button--parallel > .rlb-topbar__parallel {
        display: none !important;
    }
}

@media (max-width: 420px) {
    .rlb-topbar__button--parallel {
        grid-template-columns: max-content !important;
    }

    .rlb-topbar__button--parallel > .rlb-topbar__separator,
    .rlb-topbar__button--parallel > .rlb-topbar__parallel {
        display: none !important;
    }
}

.rlb-topbar__button--parallel {
    display: inline-grid !important;
    grid-template-columns: max-content 3px max-content !important;
    align-items: center !important;
    column-gap: 5px !important;
    row-gap: 0;
    padding: 0 4px !important;
}

.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__time,
.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__separator,
.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__parallel {
    box-sizing: border-box !important;
    display: block !important;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    align-self: center !important;
}

.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__separator {
    width: 3px !important;
    min-width: 3px !important;
    max-width: 3px !important;
    height: 3px !important;
    min-height: 3px !important;
    max-height: 3px !important;
    justify-self: center !important;
}

.rlb-topbar__icon {
    flex: 0 0 auto;
    color: #5c7080;
}

.bp3-dark .rlb-topbar__icon {
    color: #a7b6c2;
}

.rlb-topbar__parallel {
    color: #5c7080;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
}

.rlb-topbar__parallel--load-yellow {
    color: var(--rlb-topbar-load-yellow);
}

.rlb-topbar__parallel--load-red {
    color: var(--rlb-topbar-load-red);
}

.rlb-topbar__separator {
    width: 3px !important;
    min-width: 3px !important;
    max-width: 3px !important;
    height: 3px !important;
    min-height: 3px !important;
    max-height: 3px !important;
    border-radius: 50%;
    background: currentColor;
    color: #5c7080;
    justify-self: center;
}

.bp3-dark .rlb-topbar__parallel,
.bp3-dark .rlb-topbar__separator {
    color: #a7b6c2;
}

.bp3-dark .rlb-topbar__parallel--load-yellow {
    color: var(--rlb-topbar-load-yellow);
}

.bp3-dark .rlb-topbar__parallel--load-red {
    color: var(--rlb-topbar-load-red);
}

.rlb-topbar__time {
    display: inline-block;
    color: #5c7080;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.015em;
    font-variant-numeric: tabular-nums;
    text-align: center;
    white-space: nowrap;
}

.rlb-topbar__time--neutral {
    color: #5c7080;
}

.bp3-dark .rlb-topbar__time--neutral {
    color: #a7b6c2;
}

.rlb-topbar__time--overrun {
    color: #c23030;
}

.bp3-dark .rlb-topbar__time--overrun {
    color: #ff7373;
}

.rlb-topbar__time--stale {
    color: #b56b17;
}

.bp3-dark .rlb-topbar__time--stale {
    color: #f29d49;
}

/* ---- popover ---- */

/* Lives on <body>, positioned from the button's rect, so the topbar cannot clip it. */
.rlb-popover {
    --rlb-surface-action-height: 32px;
    --rlb-surface-title-size: 10px;
    --rlb-surface-task-size: 13px;
    --rlb-surface-meta-size: 10px;
    --rlb-surface-action-size: 13px;
    --rlb-surface-row-padding: 5px;
    --rlb-surface-border: rgba(16, 22, 26, 0.12);
    --rlb-surface-border-light: rgba(16, 22, 26, 0.08);
    --rlb-surface-hover: rgba(167, 182, 194, 0.15);
    --rlb-surface-canvas: rgba(167, 182, 194, 0.04);
    --rlb-surface-link: #316a9f;
    --rlb-surface-link-hover: #2a5a8d;
    --rlb-session-running: #7eb794;
    position: fixed;
    z-index: 30;
    width: min(340px, calc(100vw - 16px));
    max-height: 70vh;
    overflow-y: auto;
    padding: 8px;
    text-align: left;
    cursor: default;
}

.rlb-popover__title {
    min-width: 0;
    padding: 3px 6px 6px;
    font-size: var(--rlb-surface-title-size, 10px);
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 0.6;
}

.rlb-surface__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    column-gap: 4px;
    min-width: 0;
}

.rlb-surface__header .rlb-popover__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-surface__header .bp3-button {
    flex: 0 0 auto;
    color: #5c7080;
}

.bp3-dark .rlb-surface__header .bp3-button {
    color: #a7b6c2;
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    opacity: 0.7;
}

.rlb-surface__list {
    display: grid;
    gap: 0;
    min-width: 0;
    margin: 0 2px;
    padding: 2px;
    border: 1px solid var(--rlb-surface-border);
    border-radius: 6px;
    background: var(--rlb-surface-canvas);
}

.rlb-surface__list > .rlb-run + .rlb-run {
    border-top: 1px solid var(--rlb-surface-border-light);
    border-radius: 0 0 3px 3px;
}

.rlb-surface__list > .rlb-run {
    border-radius: 3px;
}

.rlb-surface__list > .rlb-run:hover {
    background: var(--rlb-surface-hover);
}

.rlb-surface__list > .rlb-popover__empty {
    padding: 6px 5px 8px;
}

.rlb-popover__notice {
    margin: 6px;
    padding: 6px 8px;
    color: #8a4b08;
    background: rgba(217, 130, 43, 0.14);
    border-radius: 3px;
}

.rlb-data-issues {
    margin: 14px 0 0;
    border: 1px solid var(--rlb-border, rgba(16, 22, 26, 0.14));
    border-radius: 3px;
    color: var(--rlb-muted, #5c7080);
}

.rlb-data-issues__summary {
    padding: 8px 10px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.35px;
}

.rlb-data-issues__list {
    display: grid;
    gap: 6px;
    padding: 0 10px 10px;
}

.rlb-data-issues__item {
    overflow-wrap: anywhere;
    font-size: 11px;
    line-height: 1.4;
}

.rlb-popover__footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, var(--rlb-surface-action-height));
    gap: 5px;
    padding-top: 6px;
    margin-top: 6px;
    border-top: 1px solid var(--rlb-surface-border);
}

.rlb-popover__footer .bp3-button {
    min-width: 0;
    width: 100%;
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    font-size: var(--rlb-surface-action-size, 12px);
    line-height: 1;
    padding: 0 8px;
}

.rlb-popover__footer .bp3-button:not(.bp3-minimal) {
    border: 1px solid var(--rlb-surface-border);
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
    color: #5c7080;
}

.rlb-popover__footer .bp3-button:not(.bp3-minimal):hover,
.rlb-popover__footer .bp3-button:not(.bp3-minimal):focus-visible {
    background: var(--rlb-surface-hover);
}

.rlb-popover__footer .rlb-surface__refresh {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
    min-width: var(--rlb-surface-action-height);
    max-width: none;
    justify-self: stretch;
    padding: 0 !important;
    align-items: center;
    justify-content: center;
    color: #5c7080;
}

@keyframes rlb-surface-refresh-spin {
    to {
        transform: rotate(360deg);
    }
}

.rlb-popover__footer .rlb-surface__refresh-cell {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    grid-column: 2;
    grid-row: 2;
    position: relative;
    min-width: 0;
    width: 100%;
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
}

.rlb-popover__footer .rlb-surface__refresh-cell .rlb-surface__refresh {
    grid-column: auto;
    grid-row: auto;
    box-sizing: border-box;
    flex: 1 1 auto;
    width: 100%;
    min-width: var(--rlb-surface-action-height);
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
    max-width: none;
    justify-self: stretch;
}

.rlb-popover__footer--empty {
    grid-template-columns: minmax(0, 1fr) 40px;
    grid-template-rows: var(--rlb-surface-action-height);
    align-items: stretch;
}

.rlb-popover__footer--empty > .bp3-button:first-child {
    grid-column: 1;
    grid-row: 1;
}

.rlb-popover__footer--empty .rlb-surface__refresh-cell {
    grid-column: 2;
    grid-row: 1;
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    align-items: center;
    justify-content: center;
}

.rlb-popover__footer--empty .rlb-surface__refresh-cell .rlb-surface__refresh {
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height);
    max-width: var(--rlb-surface-action-height);
}

.rlb-popover__footer--single-running {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px;
    grid-template-rows: var(--rlb-surface-action-height);
    align-items: stretch;
}

.rlb-popover__footer--single-running > .bp3-button:first-child {
    grid-column: 1;
    grid-row: 1;
}

.rlb-popover__footer--single-running > .bp3-button:nth-child(2) {
    grid-column: 2;
    grid-row: 1;
}

.rlb-popover__footer--single-running .rlb-surface__refresh-cell {
    grid-column: 3;
    grid-row: 1;
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    align-items: center;
    justify-content: center;
}

.rlb-popover__footer--single-running .rlb-surface__refresh-cell .rlb-surface__refresh {
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height);
    max-width: var(--rlb-surface-action-height);
}

.rlb-surface__refresh--loading::before {
    animation: rlb-surface-refresh-spin 900ms linear infinite;
}

@media (prefers-reduced-motion: reduce) {
    .rlb-surface__refresh--loading::before {
        animation: none;
    }
}

.rlb-popover__footer .rlb-surface__refresh:hover,
.rlb-popover__footer .rlb-surface__refresh:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.bp3-dark .rlb-popover__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
}

.bp3-dark .rlb-popover {
    --rlb-surface-border: rgba(255, 255, 255, 0.14);
    --rlb-surface-border-light: rgba(255, 255, 255, 0.09);
    --rlb-surface-hover: rgba(167, 182, 194, 0.18);
    --rlb-surface-canvas: rgba(167, 182, 194, 0.06);
    --rlb-surface-link: #7eb7d5;
    --rlb-surface-link-hover: #9dcae2;
    --rlb-session-running: #8ed0aa;
}

.rlb-run {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) max-content;
    align-items: start;
    grid-auto-rows: minmax(0, auto);
    gap: 5px;
    padding: var(--rlb-surface-row-padding, 5px) 6px;
    border-radius: 3px;
}

.rlb-run:hover {
    background: rgba(167, 182, 194, 0.2);
}

.rlb-run--overrun .rlb-run__meta {
    color: #cd4246;
    opacity: 1;
}

.bp3-dark .rlb-run--overrun .rlb-run__meta {
    color: #ff7373;
}

.rlb-run__body {
    min-width: 0;
    display: contents;
}

.rlb-run__status {
    grid-column: 1;
    grid-row: 1;
    align-self: center;
    width: 8px;
    height: 8px;
    margin-top: 0;
    border-radius: 50%;
    background: var(--rlb-session-running, #7eb794);
    opacity: 1;
    border: 0;
    box-shadow: none;
}

.rlb-run__status--paused {
    background: #8a9ba8;
}

.rlb-run__status--recovery {
    background: #d9822b;
}

.bp3-dark .rlb-run__status--recovery {
    background: #f29d49;
}

.bp3-button.bp3-minimal.rlb-run__title {
    grid-column: 2;
    grid-row: 1;
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    padding: 0;
    color: var(--rlb-surface-link);
    font-size: var(--rlb-surface-task-size, 15px);
    font-weight: 500;
    line-height: 1.25;
    text-decoration: underline;
    text-decoration-color: currentColor;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    border-radius: 2px;
}

.bp3-button.bp3-minimal.rlb-run__title::before {
    display: none !important;
    content: none !important;
}

.bp3-button.bp3-minimal.rlb-run__title:hover,
.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    color: var(--rlb-surface-link-hover);
    text-decoration-color: currentColor;
}

.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

.rlb-run__meta {
    grid-column: 2;
    grid-row: 2;
    display: block;
    min-width: 0;
    font-size: var(--rlb-surface-meta-size, 10px);
    line-height: 1.25;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
}

.rlb-run__meta-line {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-run__started {
    cursor: help;
}

.rlb-run--inline-meta .rlb-run__meta {
    grid-column: 2 / 4;
    display: flex;
    align-items: baseline;
    flex-wrap: nowrap;
    gap: 0;
    max-width: 100%;
    white-space: nowrap;
}

/* Keep the status dot visually centered on the title while actions stay in row 1. */
.rlb-run--inline-meta .rlb-run__status {
    transform: translateY(-6px);
}

.rlb-run--inline-meta .rlb-run__meta-line {
    flex: 0 1 auto;
    min-width: 0;
}

.rlb-run--inline-meta .rlb-run__meta-primary {
    flex: 1 1 auto;
}

.rlb-run--inline-meta .rlb-run__meta-separator {
    flex: 0 0 auto;
    margin: 0 6px;
    line-height: 1;
}

.rlb-run--inline-meta .rlb-run__started {
    flex: 0 0 auto;
    max-width: none;
}

.rlb-run__actions {
    grid-column: 3;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    align-self: start;
    gap: 2px;
    flex: 0 0 auto;
}

.rlb-run--inline-meta .rlb-run__actions {
    grid-row: 1;
}

.rlb-run__actions .rlb-run__checkout {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: #5c7080;
}

.rlb-run__actions .rlb-run__checkout:hover,
.rlb-run__actions .rlb-run__checkout:focus {
    color: #c23030;
}

.rlb-run__actions .rlb-run__resume,
.rlb-run__actions .rlb-run__recovery {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: #5c7080;
}

.rlb-run__actions .rlb-run__resume:hover,
.rlb-run__actions .rlb-run__resume:focus-visible,
.rlb-run__actions .rlb-run__recovery:hover,
.rlb-run__actions .rlb-run__recovery:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.rlb-run--paused .rlb-run__meta,
.rlb-run__state {
    color: #5c7080;
    opacity: 0.75;
}

.rlb-run--recovery .rlb-run__meta {
    color: #8a4b08;
    opacity: 1;
}

.bp3-dark .rlb-run--recovery .rlb-run__meta {
    color: #f29d49;
}

.rlb-run__actions .bp3-icon-trash {
    color: #5c7080;
    opacity: 0.65;
}

.rlb-run__actions .bp3-icon-trash:hover,
.rlb-run__actions .bp3-icon-trash:focus {
    color: #c23030;
    opacity: 1;
}

.rlb-table .rlb-running__checkout {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: #5c7080;
}

.rlb-table .rlb-running__checkout:hover,
.rlb-table .rlb-running__checkout:focus {
    color: #c23030;
}

/* ---- dashboard ---- */

.rlb-root {
    display: none;
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    z-index: 100;
    justify-content: center;
    box-sizing: border-box;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
}

.rlb-root--open {
    display: flex;
}

.rlb-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.rlb-header__title {
    flex: 1 1 auto;
    margin: 0;
}

.rlb-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
}

.rlb-table th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(16, 22, 26, 0.15);
}

.rlb-table td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(16, 22, 26, 0.08);
    vertical-align: top;
}

.bp3-dark .rlb-table th {
    border-bottom-color: rgba(255, 255, 255, 0.2);
}

.bp3-dark .rlb-table td {
    border-bottom-color: rgba(255, 255, 255, 0.1);
}

.rlb-table__num {
    text-align: right;
    white-space: nowrap;
}

.rlb-started-cell {
    min-width: 132px;
    white-space: nowrap;
}

.rlb-started {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    vertical-align: baseline;
}

.rlb-started__date {
    opacity: 0.72;
}

.rlb-started__time {
    font-weight: 500;
}

/* Beats the .rlb-table th left-align above, which otherwise parks a numeric
   column's label against the opposite edge from its figures. */
.rlb-table th.rlb-table__num {
    text-align: right;
}

.rlb-cell {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
}

.rlb-tree__cell {
    min-width: 0;
}

.rlb-tree__layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) max-content !important;
    align-items: start;
    column-gap: 12px !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: visible !important;
}

.rlb-tree__leading {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.rlb-tree__content {
    display: flex !important;
    align-items: baseline;
    flex: 1 1 auto !important;
    width: auto !important;
    max-width: 100% !important;
    min-width: 0 !important;
    flex-wrap: wrap !important;
    gap: 4px;
    overflow: visible !important;
}

.rlb-section__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.rlb-section__heading .rlb-section__title {
    margin: 0;
}

/* Scoped to the cell so it outranks .bp3-button.bp3-small, whose own min-width
   would otherwise make the caret wider than the spacer on childless rows and put
   the two sets of titles on different left edges. */
.rlb-tree__leading > .rlb-tree__toggle {
    flex: 0 0 auto;
    width: 20px;
    min-width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    margin: 0;
    opacity: 0.6;
    align-self: center;
}

.rlb-tree__leading > .rlb-tree__toggle:hover {
    opacity: 1;
}

.rlb-tree__toggle--empty {
    display: block;
}

/* Task status, drawn in CSS rather than Blueprint's icon font so it cannot
   silently render as a blank box if an icon name is wrong. */
.rlb-status {
    flex: 0 0 auto;
    align-self: center;
    box-sizing: border-box;
    width: 13px;
    height: 13px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    opacity: 0.4;
    position: relative;
}

.rlb-status--done {
    background: #0f9960;
    border-color: #0f9960;
    opacity: 1;
}

.rlb-status--done::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 3px;
    height: 6px;
    border: solid #ffffff;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
}

.rlb-row--done .rlb-task-link {
    opacity: 0.65;
}

.rlb-tree__hidden {
    grid-column: 3;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: max-content !important;
    max-width: none !important;
    margin: 0 !important;
    font-size: 11px;
    white-space: nowrap !important;
}

.rlb-tree__badge {
    flex: 0 0 auto;
    font-size: 10px;
}

.rlb-tree__total {
    font-weight: 600;
}

.rlb-tree__info {
    width: 20px;
    min-width: 20px;
    height: 20px;
    min-height: 20px;
    margin: 0;
    padding: 0;
    color: var(--rlb-muted, #5c7080);
    opacity: 0.7;
}

.rlb-tree__info:hover,
.rlb-tree__info:focus-visible {
    opacity: 1;
    background: rgba(167, 182, 194, 0.18);
}

.rlb-visually-hidden {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
}

.rlb-task-link {
    padding: 0;
    text-align: left;
    min-height: 0;
    /* Same shrink-to-ellipsis contract as the topbar; a long task name must not
       push the numeric columns off the dialog. */
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Dashboard task buttons already carry a document-open cue. Keep their text
   in the dashboard's neutral hierarchy; only icon-less Session titles use the
   Roam page-reference palette below. */
.bp3-button.bp3-minimal.rlb-task-link--icon {
    color: var(--rlb-text);
    text-decoration: none;
    border-radius: 3px;
}

.bp3-button.bp3-minimal.rlb-task-link--icon::before {
    color: var(--rlb-muted);
}

.bp3-button.bp3-minimal.rlb-task-link--icon > .rlb-task-link__text {
    color: inherit;
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link--icon:hover,
.bp3-button.bp3-minimal.rlb-task-link--icon:focus-visible {
    color: var(--rlb-text);
    background: var(--rlb-task-link-hover, rgba(167, 182, 194, 0.14));
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link--icon:focus-visible {
    outline: 2px solid var(--rlb-muted);
    outline-offset: 2px;
}

/* Only the By Task rollup needs fixed numeric rails. The title column receives
   all remaining room and wraps, while Running keeps its natural table layout. */
.rlb-task-table {
    table-layout: fixed;
    min-width: 560px;
}

.rlb-task-table__sessions {
    width: 80px;
}

.rlb-task-table__own,
.rlb-task-table__total {
    width: 88px;
}

.rlb-task-table .rlb-task-link {
    display: flex !important;
    flex: 1 1 auto !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    justify-content: flex-start;
    text-align: left;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    text-overflow: initial;
}

.rlb-task-table .rlb-task-link::before {
    flex: 0 0 auto !important;
    margin-left: 0 !important;
    margin-right: 7px !important;
}

.rlb-task-table .rlb-task-link > .rlb-task-link__text {
    display: block !important;
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    text-align: left;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}

.rlb-muted {
    opacity: 0.6;
}

.rlb-empty {
    padding: 24px;
    text-align: center;
    opacity: 0.65;
}

/* ---- Roam-native dashboard shell ---- */

.rlb-root {
    --rlb-canvas: var(--roam-bg-color, #fdfdfd);
    --rlb-surface: var(--roam-bg-color, #fdfdfd);
    --rlb-surface-subtle: var(--roam-secondary-bg-color, #f5f8fa);
    --rlb-text: var(--roam-primary-color, #182026);
    --rlb-muted: var(--roam-muted-color, #5c7080);
    --rlb-border: rgba(16, 22, 26, 0.14);
    --rlb-border-light: rgba(16, 22, 26, 0.08);
    --rlb-surface-link: #316a9f;
    --rlb-surface-link-hover: #2a5a8d;
    --rlb-task-link-hover: rgba(167, 182, 194, 0.14);
    --rlb-session-running: #7eb794;
    --rlb-accent: var(--roam-accent-color, #316a9f);
    --rlb-accent-soft: rgba(49, 106, 159, 0.12);
    --rlb-overlay: rgba(16, 22, 26, 0.56);
    align-items: flex-start;
    padding: clamp(24px, 7vh, 64px) 24px 32px;
    overflow: hidden;
    overscroll-behavior: none;
    background: var(--rlb-overlay);
    color: var(--rlb-text);
    font-family: inherit;
}

.bp3-dark .rlb-root {
    --rlb-canvas: var(--roam-bg-color, #293742);
    --rlb-surface: var(--roam-bg-color, #293742);
    --rlb-surface-subtle: var(--roam-secondary-bg-color, #202b33);
    --rlb-text: var(--roam-primary-color, #f5f8fa);
    --rlb-muted: var(--roam-muted-color, #a7b6c2);
    --rlb-border: rgba(255, 255, 255, 0.17);
    --rlb-border-light: rgba(255, 255, 255, 0.09);
    --rlb-surface-link: #7eb7d5;
    --rlb-surface-link-hover: #9dcae2;
    --rlb-task-link-hover: rgba(167, 182, 194, 0.18);
    --rlb-session-running: #8ed0aa;
    --rlb-accent: #48aff0;
    --rlb-accent-soft: rgba(72, 175, 240, 0.14);
    --rlb-overlay: rgba(16, 22, 26, 0.74);
}

.rlb-dialog {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    width: min(1120px, calc(100vw - 48px));
    height: auto;
    min-height: 0;
    max-height: min(84vh, calc(100vh - 48px));
    max-height: min(84dvh, calc(100dvh - 48px));
    overflow: hidden;
    border: 1px solid var(--rlb-border);
    border-radius: 4px;
    background: var(--rlb-surface);
    color: var(--rlb-text);
    box-shadow: 0 4px 16px rgba(16, 22, 26, 0.14);
}

.rlb-dashboard .rlb-header.bp3-dialog-header {
    flex: 0 0 auto;
    min-height: 48px;
    height: auto;
    overflow: visible;
    padding: 6px 14px 6px 16px;
    border-bottom: 0;
    background: var(--rlb-surface);
    box-shadow: none;
}

.rlb-dashboard .rlb-header__heading {
    flex: 1 1 auto;
    min-width: 0;
    overflow: visible;
}

.rlb-dashboard .rlb-header__title.bp3-heading {
    flex: 1 1 auto;
    margin: 0;
    color: inherit;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.35;
    overflow: visible;
    text-overflow: initial;
    white-space: normal;
}

.rlb-header .bp3-select select {
    min-width: 112px;
}

.rlb-dashboard .bp3-button,
.rlb-dashboard .bp3-select select {
    font-size: 12px;
    line-height: 1.2;
}

.rlb-icon-button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
}

.rlb-summary {
    flex: 0 0 auto;
    min-width: 0;
    padding: 10px 20px;
    overflow-x: hidden;
    background: var(--rlb-surface);
}

.rlb-overview {
    display: grid;
    grid-template-columns: minmax(160px, 0.9fr) minmax(300px, 1.6fr) minmax(160px, 0.9fr);
    align-items: stretch;
    height: 80px;
    min-height: 80px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--rlb-border-light);
    border-radius: 8px;
    background: var(--rlb-surface-subtle);
}

.rlb-overview__item {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    min-width: 0;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    justify-content: center;
    padding: 9px 14px;
    border: 0;
    border-radius: 0;
    background: transparent;
}

.rlb-overview__item + .rlb-overview__item {
    border-left: 1px solid var(--rlb-overview-divider, var(--rlb-border-light));
}

.rlb-overview__item--selected {
    min-width: 0;
    justify-content: space-between;
}

.rlb-overview__panel {
    overflow: hidden;
}

.rlb-overview__heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-width: 0;
}

.rlb-overview__label {
    flex: 0 0 auto;
    margin: 0;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.25px;
    line-height: 1.2;
    text-transform: uppercase;
}

.rlb-overview__value {
    display: flex;
    flex: 0 0 auto;
    flex-direction: row;
    align-items: baseline;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
    margin: 0;
    color: var(--rlb-text);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}

.rlb-overview__number {
    display: block;
    white-space: nowrap;
}

.rlb-overview__context {
    display: block;
    color: var(--rlb-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
}

.rlb-overview__value--quiet .rlb-overview__number {
    color: var(--rlb-muted);
    font-size: 18px;
    font-weight: 500;
}

.rlb-overview__value--quiet .rlb-overview__context {
    opacity: 0.82;
}

.rlb-body,
.rlb-body__scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    padding: 10px 20px 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
}

.rlb-dashboard-section {
    margin: 0;
    padding: 0;
}

.rlb-dashboard-section + .rlb-dashboard-section {
    margin-top: 10px;
}

.rlb-dashboard-panel {
    overflow: hidden;
    padding: 12px 14px 10px;
    border: 1px solid var(--rlb-border);
    border-radius: 7px;
    background: var(--rlb-surface);
}

.rlb-panel__header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 7px;
}

.rlb-panel__header .rlb-section__title {
    flex: 0 0 auto;
}

.rlb-panel__count,
.rlb-panel__notice {
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 500;
}

.rlb-panel__notice {
    margin-left: auto;
}

.rlb-section__title {
    margin: 0;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.55px;
    line-height: 1.25;
    text-transform: uppercase;
}

.rlb-section__heading {
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}

.rlb-dashboard .rlb-table {
    border-collapse: separate;
    border-spacing: 0;
}

.rlb-dashboard .rlb-table th {
    padding: 4px 8px;
    border-bottom: 0;
    color: var(--rlb-muted);
    font-size: 10px;
}

.rlb-dashboard .rlb-table td {
    padding: 6px 8px;
    border-bottom: 0;
    font-size: 13px;
}

.rlb-dashboard .rlb-table tbody tr:hover td {
    background: rgba(167, 182, 194, 0.12);
}

.rlb-dashboard .rlb-table tbody tr + tr td {
    border-top: 1px solid var(--rlb-border-light);
}

.rlb-dashboard .rlb-data-issues {
    margin: 4px 0 0;
    border: 0;
    border-radius: 0;
    color: var(--rlb-muted);
}

.rlb-dashboard .rlb-data-issues__summary {
    padding: 4px 0;
    font-size: 10px;
    font-weight: 600;
}

.rlb-dashboard .rlb-data-issues__list {
    padding: 0 0 4px;
}

.rlb-dashboard .rlb-data-issues__item {
    font-size: 10px;
}

.rlb-dashboard .rlb-empty {
    padding: 24px 12px;
}

.rlb-muted {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-empty {
    padding: 24px 12px;
    color: var(--rlb-muted);
    opacity: 1;
}

@media (max-width: 600px) {
    .rlb-root {
        align-items: flex-start;
        padding: 12px;
        height: 100vh;
        height: 100dvh;
    }

    .rlb-dialog {
        width: 100%;
        height: auto;
        max-height: calc(100vh - 24px);
        max-height: calc(100dvh - 24px);
        border: 0;
        border-radius: 0;
    }

    .rlb-dashboard .rlb-header.bp3-dialog-header {
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 12px;
    }

    .rlb-dashboard .rlb-header__heading {
        flex-basis: calc(100% - 80px);
    }

    .rlb-header .bp3-select {
        order: 2;
        width: 100%;
    }

    .rlb-header .bp3-select select {
        width: 100%;
    }

    .rlb-summary {
        padding: 8px 12px;
        overflow: hidden;
    }

    .rlb-overview {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows: 50px minmax(0, 1fr);
        height: 122px;
        min-height: 122px;
    }

    .rlb-overview__item--selected {
        grid-column: 1 / -1;
        grid-row: 2;
        border-top: 1px solid var(--rlb-overview-divider, var(--rlb-border-light));
        border-left: 0;
    }

    .rlb-overview__item:nth-child(3) {
        grid-column: 2;
        grid-row: 1;
    }

    .rlb-overview__item {
        padding: 9px 10px;
    }

    .rlb-overview__label {
        font-size: 10px;
    }

    .rlb-overview__value {
        min-width: 0;
        gap: 4px;
        font-size: 18px;
    }

    .rlb-overview__context {
        white-space: nowrap;
    }

    .rlb-body,
    .rlb-body__scroll {
        max-height: none;
        padding: 10px 12px 20px;
    }

    .rlb-dashboard-section {
        overflow-x: auto;
    }

    .rlb-table {
        min-width: 560px;
    }
}

@media (min-width: 600px) and (max-width: 719px) {
    .rlb-summary {
        padding: 9px 12px;
    }

    .rlb-overview {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr) minmax(0, 0.9fr);
        height: 78px;
        min-height: 78px;
    }

    .rlb-overview__item {
        padding: 8px 9px;
    }

    .rlb-overview__label {
        font-size: 10px;
    }

    .rlb-overview__heading,
    .rlb-overview__value {
        gap: 4px;
    }

    .rlb-overview__value {
        font-size: 18px;
    }

    .rlb-overview__context {
        font-size: 10px;
    }

    .rlb-body,
    .rlb-body__scroll {
        padding: 10px 12px 20px;
    }
}

/* ---- Compact overview ---- */

.rlb-overview--compact {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    height: 68px;
    min-height: 68px;
}

.rlb-overview--compact .rlb-overview__item {
    justify-content: center;
    padding: 8px 12px;
}

.rlb-overview--compact .rlb-overview__heading {
    display: grid;
    gap: 4px;
    align-items: center;
}

.rlb-overview--compact .rlb-overview__value {
    justify-content: flex-start;
    font-size: 19px;
}

.rlb-overview--compact .rlb-overview__context {
    overflow: hidden;
    text-overflow: ellipsis;
}

@media (max-width: 600px) {
    .rlb-overview--compact {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
        height: 116px;
        min-height: 116px;
    }

    .rlb-overview--compact .rlb-overview__item {
        grid-column: auto;
        grid-row: auto;
        padding: 8px 10px;
    }

    .rlb-overview--compact .rlb-overview__item:nth-child(odd) {
        border-left: 0;
    }

    .rlb-overview--compact .rlb-overview__item:nth-child(n + 3) {
        border-top: 1px solid var(--rlb-border-light);
    }

}
`;

// src/session-surface.js
var sessionCount = (count) => `${count} Session${count === 1 ? "" : "s"}`;
var taskCount = (count) => `${count} Task${count === 1 ? "" : "s"}`;
var SURFACE_TITLE = "Roam Logbook";
var rowFigures = (entry, now) => {
  const elapsed = now.getTime() - entry.start.getTime();
  const total = entry.priorMinutes + Math.floor(elapsed / 6e4);
  return `${formatElapsed(elapsed)} \xB7 ${formatMinutesHuman(total)} total`;
};
var fullTaskLabel = (title) => `Open this block: ${title}`;
var refreshLabel = "Refresh Sessions from graph";
var appendMetaNodes = (meta, nodes) => {
  nodes.forEach((node, index) => {
    if (index > 0) {
      const separator = el("span", "rlb-run__meta-separator", "\xB7");
      separator.setAttribute("aria-hidden", "true");
      meta.appendChild(separator);
    }
    meta.appendChild(node);
  });
};
var renderTitle = (row, onOpenTask) => {
  const title = row.title || row.taskUid;
  const taskButton = button(
    "bp3-button bp3-minimal rlb-run__title",
    title,
    (event) => onOpenTask?.(row.taskUid, event),
    { title: fullTaskLabel(title) }
  );
  taskButton.setAttribute("aria-label", fullTaskLabel(title));
  return taskButton;
};
var renderRunningRow = (row, now, options) => {
  const entry = row.entry;
  const overrun = isCycleOverrun(now);
  const node = el("div", `rlb-run rlb-run--inline-meta${overrun ? " rlb-run--overrun" : ""}`);
  node.dataset.sessionState = "running";
  node.dataset.clockUid = entry.clockUid;
  const status = el("span", "rlb-run__status rlb-run__status--running");
  status.setAttribute("aria-hidden", "true");
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  meta.dataset.clockUid = entry.clockUid;
  const primary = el("div", "rlb-run__meta-line rlb-run__meta-primary", rowFigures(entry, now));
  const started = formatStarted(entry.start, now);
  const startedDetails = `Started ${started.raw}` + (entry.pageTitle ? ` \xB7 Page: ${entry.pageTitle}` : "");
  const startedNode = el(
    "time",
    "rlb-run__meta-line rlb-run__started",
    started.valid ? `${started.dateLabel} ${started.timeLabel}` : started.raw
  );
  startedNode.title = startedDetails;
  startedNode.setAttribute("aria-label", startedDetails);
  if (started.datetime)
    startedNode.dateTime = started.datetime;
  appendMetaNodes(meta, [primary, startedNode]);
  body.append(renderTitle(row, options.onOpenTask), meta);
  const actions = el("div", "rlb-run__actions");
  const checkout = button(
    "bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout",
    "",
    (event) => {
      event.stopPropagation();
      void options.onCheckOut?.(entry, event);
    },
    { title: "Check Out" }
  );
  checkout.dataset.action = "clock-out";
  const discarding = options.discardingClockUid === entry.clockUid;
  const discardTitle = discarding ? "Confirm discard of this CLOCK entry" : "Discard this CLOCK entry (cannot be undone)";
  const discard = button(
    `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? " bp3-intent-danger" : ""}`,
    "",
    (event) => {
      event.stopPropagation();
      void options.onDiscard?.(entry, event);
    },
    { title: discardTitle }
  );
  discard.dataset.action = "discard";
  actions.append(checkout, discard);
  node.append(status, body, actions);
  return node;
};
var renderPausedRow = (row, now, options) => {
  const item = row.item;
  const node = el("div", "rlb-run rlb-run--paused");
  node.dataset.sessionState = "paused";
  node.dataset.taskUid = item.taskUid;
  const status = el("span", "rlb-run__status rlb-run__status--paused");
  status.setAttribute("aria-label", "Paused Task");
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  const pausedAt = formatStarted(new Date(item.pausedAtMs), now);
  const pausedDetails = pausedAt.valid ? `Paused since ${pausedAt.raw}` : "Paused Task";
  const pausedNode = el(
    "time",
    "rlb-run__meta-line rlb-run__started",
    pausedAt.valid ? `${pausedAt.dateLabel} ${pausedAt.timeLabel}` : pausedDetails
  );
  pausedNode.title = pausedDetails;
  pausedNode.setAttribute("aria-label", pausedDetails);
  if (pausedAt.datetime)
    pausedNode.dateTime = pausedAt.datetime;
  meta.appendChild(pausedNode);
  body.append(renderTitle(row, options.onOpenTask), meta);
  const actions = el("div", "rlb-run__actions");
  const resume = button(
    "bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__resume",
    "",
    (event) => {
      event.stopPropagation();
      void options.onResume?.(item, event);
    },
    { title: "Resume" }
  );
  resume.dataset.action = "resume";
  actions.appendChild(resume);
  node.append(status, body, actions);
  return node;
};
var renderRecoveryRow = (row, options) => {
  const item = row.item;
  const node = el("div", "rlb-run rlb-run--recovery");
  node.dataset.sessionState = "recovery";
  node.dataset.recoveryState = item.recoveryState || "conflict";
  node.dataset.taskUid = item.taskUid;
  const status = el("span", "rlb-run__status rlb-run__status--recovery");
  status.setAttribute("aria-label", "Recovery");
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  const reason = item.recoveryIssue === "missing-clockUid" ? "Exact Session association is missing." : "Exact Session association needs review.";
  meta.append(
    el("div", "rlb-run__meta-line rlb-run__meta-primary", "Recovery required"),
    el("div", "rlb-run__meta-line rlb-run__started", reason)
  );
  body.append(renderTitle(row, options.onOpenTask), meta);
  const actions = el("div", "rlb-run__actions");
  const retry = button(
    "bp3-button bp3-small bp3-minimal bp3-icon-refresh rlb-run__recovery",
    "",
    (event) => {
      event.stopPropagation();
      void options.onRecovery?.(item, event);
    },
    { title: "Retry Recovery" }
  );
  retry.dataset.action = "recovery";
  actions.appendChild(retry);
  node.append(status, body, actions);
  return node;
};
function buildSessionSurfaceModel({
  entries = [],
  pausedItems = [],
  pendingItems = [],
  recoveryState = null,
  now,
  staleHours: staleHours2 = 8
}) {
  const currentNow = now instanceof Date ? now : new Date(now);
  const runningRows = entries.map((entry) => ({
    kind: "running",
    key: `running:${entry.clockUid}`,
    taskUid: entry.taskUid,
    title: entry.title,
    entry
  }));
  const pausedRows = pausedItems.map((item) => ({
    kind: "paused",
    key: `paused:${item.taskUid}`,
    taskUid: item.taskUid,
    title: item.title,
    item
  }));
  const recoveryRows = pendingItems.filter((item) => item?.recoveryState === "conflict").map((item) => ({
    kind: "recovery",
    key: `recovery:${item.taskUid}`,
    taskUid: item.taskUid,
    title: item.title,
    item
  }));
  return {
    now: currentNow,
    entries: entries.slice(),
    pausedItems: pausedItems.slice(),
    pendingItems: pendingItems.slice(),
    recoveryState: recoveryState ? { ...recoveryState } : null,
    rows: [...runningRows, ...pausedRows, ...recoveryRows],
    runningCount: entries.length,
    pausedCount: pausedItems.length,
    recoveryCount: recoveryRows.length,
    staleEntries: findStaleClocks(entries, currentNow, staleHours2)
  };
}
var surfaceTitle = (model) => model.runningCount > 0 ? `${sessionCount(model.runningCount)} Running` : model.pausedCount > 0 ? `${taskCount(model.pausedCount)} Paused` : model.recoveryCount > 0 ? `${model.recoveryCount} Recover${model.recoveryCount === 1 ? "y" : "ies"} Required` : model.recoveryState ? "Pause Batch Recovery Required" : SURFACE_TITLE;
function renderSessionSurface(root, model, options = {}) {
  const title = el("div", "rlb-popover__title", surfaceTitle(model));
  if (options.titleId)
    title.id = options.titleId;
  const header = el("header", "rlb-surface__header");
  header.appendChild(title);
  if (options.onClose) {
    header.appendChild(
      button(
        "bp3-button bp3-minimal bp3-small bp3-icon-cross rlb-surface__close",
        "",
        () => options.onClose(),
        { title: "Close Current Sessions" }
      )
    );
    header.lastElementChild.dataset.action = "close";
  }
  root.replaceChildren(header);
  const sessionList = el("div", "rlb-surface__list");
  sessionList.setAttribute("role", "group");
  sessionList.setAttribute("aria-label", "Current Sessions");
  root.appendChild(sessionList);
  if (model.rows.length === 0) {
    sessionList.appendChild(
      el("div", "rlb-popover__empty", options.emptyMessage || "No Session is running.")
    );
  } else {
    if (model.staleEntries.length > 0) {
      sessionList.appendChild(
        el(
          "div",
          "rlb-popover__empty bp3-text-small",
          `${sessionCount(model.staleEntries.length)} ${model.staleEntries.length > 1 ? "have" : "has"} been open for over ${options.staleHours || 8}h \u2014 likely forgotten.`
        )
      );
    }
    for (const row of model.rows) {
      sessionList.appendChild(
        row.kind === "running" ? renderRunningRow(row, model.now, options) : row.kind === "paused" ? renderPausedRow(row, model.now, options) : renderRecoveryRow(row, options)
      );
    }
  }
  for (const notice4 of options.notices || []) {
    const message = typeof notice4 === "string" ? notice4 : notice4?.message;
    if (!message)
      continue;
    const role = notice4?.role === "alert" ? "alert" : "status";
    const node = el("div", "rlb-popover__notice bp3-text-small", message);
    node.setAttribute("role", role);
    node.setAttribute("aria-live", role === "alert" ? "assertive" : "polite");
    node.setAttribute("aria-atomic", "true");
    root.appendChild(node);
  }
  const singleRunning = model.runningCount === 1 && model.pausedCount === 0;
  const footerModifiers = [
    model.rows.length === 0 ? "rlb-popover__footer--empty" : "",
    singleRunning ? "rlb-popover__footer--single-running" : ""
  ].filter(Boolean);
  const footer = el("div", `rlb-popover__footer ${footerModifiers.join(" ")}`.trim());
  footer.appendChild(
    button("bp3-button bp3-small", "Dashboard", () => options.onOpenDashboard?.(), {
      title: "Open Roam Logbook Dashboard"
    })
  );
  if (model.recoveryState) {
    const recovery = button(
      "bp3-button bp3-small",
      "Retry Pause Batch cleanup",
      () => options.onRetryRecovery?.(),
      {
        title: "Commit the saved Pause Batch cleanup without resuming paused Tasks"
      }
    );
    recovery.dataset.action = "retry-pause-batch";
    footer.appendChild(recovery);
  }
  if (model.runningCount > 0 || model.pausedCount > 0 || model.recoveryState) {
    if (model.runningCount > 0) {
      footer.appendChild(
        button("bp3-button bp3-small", singleRunning ? "Pause" : "Pause All", () => options.onPauseAll?.(), {
          title: singleRunning ? "Pause the running Session" : "Pause all running Sessions"
        })
      );
    }
    if (model.pausedCount > 0) {
      footer.appendChild(
        button("bp3-button bp3-small", "Resume paused Tasks", () => options.onResumeAll?.(), {
          title: "Resume paused Tasks with fresh CLOCK entries"
        })
      );
    }
    if (model.runningCount > 1 || model.pausedCount > 0) {
      const confirming = Boolean(options.clockOutAllConfirm);
      footer.appendChild(
        button(
          `bp3-button bp3-small${confirming ? " bp3-intent-danger" : ""}`,
          confirming ? "Confirm Clock Out All" : "Clock Out All",
          () => options.onClockOutAll?.(),
          {
            title: confirming ? "Confirm permanent Clock Out All" : "Permanently close all running Sessions and clear the Pause Batch"
          }
        )
      );
    }
  }
  if (options.onRefresh) {
    const refreshState = options.refreshState || {};
    const state = ["idle", "loading", "success", "error"].includes(refreshState.state) ? refreshState.state : "idle";
    const refreshCell = el("div", "rlb-surface__refresh-cell");
    refreshCell.dataset.refreshState = state;
    const refresh2 = button(
      `bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh rlb-surface__refresh--${state}`,
      "",
      () => void options.onRefresh(),
      { title: refreshLabel }
    );
    refresh2.dataset.action = "refresh";
    if (state === "loading") {
      refresh2.disabled = true;
      refresh2.setAttribute("aria-busy", "true");
    }
    const refreshStatus = el(
      "span",
      `rlb-surface__refresh-status rlb-surface__refresh-status--${state} rlb-visually-hidden`,
      refreshState.message || ""
    );
    refreshStatus.setAttribute("role", "status");
    refreshStatus.setAttribute("aria-live", "polite");
    refreshStatus.setAttribute("aria-atomic", "true");
    refreshCell.append(refresh2, refreshStatus);
    footer.appendChild(refreshCell);
  }
  root.appendChild(footer);
  return root;
}
function updateSessionSurfaceElapsed(root, entries, now) {
  if (!root)
    return;
  const currentNow = now instanceof Date ? now : new Date(now);
  const byUid = new Map(entries.map((entry) => [entry.clockUid, entry]));
  for (const meta of root.querySelectorAll('.rlb-run[data-session-state="running"] .rlb-run__meta')) {
    const entry = byUid.get(meta.dataset.clockUid);
    if (!entry)
      continue;
    const primary = meta.querySelector(".rlb-run__meta-primary");
    if (primary)
      primary.textContent = rowFigures(entry, currentNow);
    const row = meta.closest(".rlb-run");
    if (row)
      row.classList.toggle("rlb-run--overrun", isCycleOverrun(currentNow));
  }
}

// src/topbar.js
var WIDGET_ID = "roam-logbook-topbar";
var POPOVER_ID = "roam-logbook-popover";
var POPOVER_TITLE_ID = "roam-logbook-popover-title";
var TOPBAR_SELECTOR2 = ".rm-topbar";
var REFRESH_SUCCESS_DURATION = 1800;
var REFRESH_LOADING_MESSAGE2 = "Refreshing Sessions from graph\u2026";
var REFRESH_SUCCESS_MESSAGE2 = "Updated just now";
var REFRESH_ERROR_MESSAGE2 = "Refresh failed; last valid snapshot kept. Retry.";
var sessionCount2 = (count) => `${count} Session${count === 1 ? "" : "s"}`;
var taskCount2 = (count) => `${count} Task${count === 1 ? "" : "s"}`;
var sessionLoadTone = (count) => {
  const normalized2 = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (normalized2 >= 7)
    return "red";
  if (normalized2 >= 4)
    return "yellow";
  return "neutral";
};
var FORWARD_PATTERN = /\b(forward|arrow-right|chevron-right)\b/i;
var BACK_PATTERN = /\b(back|arrow-left|chevron-left)\b/i;
var MENU_PATTERN = /\b(menu|left-sidebar|navigation)\b/i;
var MAIN_CONTROL_PATTERN = /\b(find-or-create|search|topbar(?:__|-)?(?:main|right))\b/i;
function createTopbar({
  onOpenDashboard,
  onMutationResult = () => {
  },
  confirmation = createConfirmationController(),
  now: nowFn = () => /* @__PURE__ */ new Date(),
  setIntervalFn = (callback, delay) => setInterval(callback, delay),
  clearIntervalFn = (tickerId) => clearInterval(tickerId)
}) {
  let container = null;
  let timeNode = null;
  let iconNode = null;
  let parallelNode = null;
  let separatorNode = null;
  let buttonNode = null;
  let popover = null;
  let observer = null;
  let hostObserver = null;
  let recoveryObserver = null;
  let outerRecoveryObserver = null;
  let recoveryTarget = null;
  let outerRecoveryTarget = null;
  let observedTopbar = null;
  let ticker = null;
  let unsubscribe = null;
  let unsubscribePaused = null;
  let destroyed = false;
  let discardConfirmUid = null;
  let discardConfirmTimer = null;
  let attachQueued = false;
  let attachTimer = null;
  let attachCount = 0;
  let tickCount = 0;
  let layoutMode = null;
  let actionNotice = "";
  let refreshInFlight = null;
  let refreshClearTimer = null;
  let refreshState = { state: "idle", message: "" };
  let themeRuntime = null;
  const layoutHosts = /* @__PURE__ */ new Set();
  const searchHosts = /* @__PURE__ */ new Set();
  const nowDate = () => {
    const value = nowFn();
    return value instanceof Date ? value : new Date(value);
  };
  const resetClockOutConfirmation = () => {
    confirmation?.reset();
  };
  const resetDiscardConfirmation = () => {
    discardConfirmUid = null;
    if (discardConfirmTimer)
      clearTimeout(discardConfirmTimer);
    discardConfirmTimer = null;
  };
  const closePopover = ({ restoreFocus = true } = {}) => {
    resetClockOutConfirmation();
    resetDiscardConfirmation();
    actionNotice = "";
    popover?.remove();
    popover = null;
    document.removeEventListener("mousedown", onDocumentMouseDown, true);
    document.removeEventListener("keydown", onPopoverKeyDown, true);
    window.removeEventListener("resize", closePopover);
    syncSurfaceAria(null);
    if (restoreFocus && buttonNode?.isConnected)
      buttonNode.focus();
  };
  function onDocumentMouseDown(event) {
    if (!popover)
      return;
    if (container?.contains(event.target) || popover.contains(event.target))
      return;
    closePopover();
  }
  function onPopoverKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopover();
      return;
    }
    if (event.key !== "Tab" || !popover)
      return;
    const focusables = [
      ...popover.querySelectorAll(
        'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'
      )
    ].filter((node) => !node.disabled && node.getAttribute("aria-hidden") !== "true");
    event.preventDefault();
    event.stopPropagation();
    if (focusables.length === 0) {
      popover.tabIndex = -1;
      popover.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const index = focusables.indexOf(document.activeElement);
    if (event.shiftKey) {
      if (index <= 0)
        last.focus();
      else
        focusables[index - 1].focus();
    } else if (index < 0 || index === focusables.length - 1) {
      first.focus();
    } else {
      focusables[index + 1].focus();
    }
  }
  const positionPopover = () => {
    const anchor = buttonNode?.getBoundingClientRect();
    if (!anchor || !popover)
      return;
    const width = popover.offsetWidth || 340;
    const viewport = window.innerWidth || width + 16;
    popover.style.top = `${anchor.bottom + 6}px`;
    popover.style.left = `${Math.max(8, Math.min(anchor.left, viewport - width - 8))}px`;
  };
  const sessionModel = () => buildSessionSurfaceModel({
    entries: getRunning(),
    pausedItems: getPaused(),
    pendingItems: getPendingResume(),
    recoveryState: getRecoveryState(),
    now: nowDate(),
    staleHours: staleHours()
  });
  const surfaceNotices = () => actionNotice ? [{ message: actionNotice, role: "alert" }] : [getNotice(), getNotice2()].filter(Boolean).map((message) => ({ message, role: "status" }));
  const renderSurfaces = () => {
    if (popover)
      renderPopover();
  };
  const ensureThemeRuntime = () => {
    if (themeRuntime)
      return themeRuntime;
    themeRuntime = acquireThemeRuntime({
      documentRef: document,
      onChange: (palette) => {
        if (popover)
          applyRoamThemePalette(popover, palette);
      }
    });
    return themeRuntime;
  };
  const renderRefreshState = () => {
    if (destroyed)
      return;
    renderButton(getRunning(), nowDate(), { reconcile: false });
    renderSurfaces();
  };
  const setRefreshState = (state, message, { clearAfter = false } = {}) => {
    if (refreshClearTimer)
      clearTimeout(refreshClearTimer);
    refreshClearTimer = null;
    refreshState = { state, message };
    renderRefreshState();
    if (clearAfter && !destroyed) {
      refreshClearTimer = setTimeout(() => {
        refreshClearTimer = null;
        if (refreshState.state !== "success")
          return;
        refreshState = { state: "idle", message: "" };
        renderRefreshState();
      }, REFRESH_SUCCESS_DURATION);
    }
  };
  const refreshSessions = () => {
    if (refreshInFlight)
      return refreshInFlight;
    const request = Promise.resolve().then(() => refreshResult()).then(
      (result) => {
        if (result?.ok) {
          actionNotice = "";
          setRefreshState("success", REFRESH_SUCCESS_MESSAGE2, { clearAfter: true });
        } else {
          actionNotice = mutationResultNotice(result) || getNotice() || GRAPH_SYNC_RETRY_NOTICE;
          setRefreshState("error", REFRESH_ERROR_MESSAGE2);
        }
        return result;
      },
      (error) => {
        console.error("[roam-logbook] could not refresh Session surface", error);
        actionNotice = mutationResultNotice(error) || getNotice() || GRAPH_SYNC_RETRY_NOTICE;
        setRefreshState("error", REFRESH_ERROR_MESSAGE2);
        return {
          ok: false,
          uncertain: true,
          running: getRunning(),
          error
        };
      }
    );
    refreshInFlight = request.finally(() => {
      refreshInFlight = null;
    });
    actionNotice = "";
    setRefreshState("loading", REFRESH_LOADING_MESSAGE2);
    return refreshInFlight;
  };
  const run = async (action) => {
    try {
      const result = await action();
      actionNotice = mutationResultNotice(result);
      onMutationResult(result);
      renderSurfaces();
      return result;
    } catch (error) {
      console.error("[roam-logbook]", error);
      actionNotice = mutationResultNotice(error);
      onMutationResult(error);
    }
    renderSurfaces();
  };
  const surfaceOptions = () => {
    const scope = "session-surface";
    return {
      titleId: POPOVER_TITLE_ID,
      staleHours: staleHours(),
      notices: surfaceNotices(),
      clockOutAllConfirm: confirmation?.isArmed("clock-out-all", scope),
      refreshState,
      onRefresh: refreshSessions,
      onOpenTask: (taskUid, event) => {
        if (event?.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          void openBlockInRightSidebar(taskUid).then((result) => {
            if (result?.ok) {
              closePopover({ restoreFocus: false });
              return;
            }
            if (!result?.ok) {
              actionNotice = result.message || "Could not open this Task in the right sidebar.";
              renderSurfaces();
            }
          });
          return;
        }
        event?.stopPropagation();
        closePopover({ restoreFocus: false });
        void openBlock(taskUid);
      },
      onCheckOut: (entry) => run(() => clockOut(entry.clockUid)),
      onResume: (item) => void run(() => resumeOne(item.taskUid)),
      onRecovery: () => void run(() => resumeAll()),
      onRetryRecovery: () => void run(() => retryFinalizing()),
      onDiscard: (entry) => {
        if (discardConfirmUid !== entry.clockUid) {
          discardConfirmUid = entry.clockUid;
          if (discardConfirmTimer)
            clearTimeout(discardConfirmTimer);
          discardConfirmTimer = setTimeout(() => {
            resetDiscardConfirmation();
            renderSurfaces();
          }, 5e3);
          renderSurfaces();
          return;
        }
        resetDiscardConfirmation();
        void run(() => discardClock(entry.clockUid));
      },
      onOpenDashboard: () => {
        closePopover({ restoreFocus: false });
        onOpenDashboard?.(buttonNode);
      },
      onPauseAll: () => void run(() => pauseAll()),
      onResumeAll: () => void run(() => resumeAll()),
      onClockOutAll: () => {
        if (!confirmation?.arm("clock-out-all", scope)) {
          renderSurfaces();
          return;
        }
        resetClockOutConfirmation();
        void run(() => clockOutAll());
      },
      onClose: null,
      discardingClockUid: discardConfirmUid
    };
  };
  function renderPopover() {
    if (!popover)
      return;
    ensureThemeRuntime();
    const model = sessionModel();
    const refreshStatus = getLastRefreshStatus();
    const options = surfaceOptions();
    options.emptyMessage = refreshStatus.ok ? "No Session is running. Right-click a TODO bullet and choose Plugins \u2192 Logbook: Clock in." : "Session state could not be confirmed. Retry after Roam finishes syncing.";
    renderSessionSurface(popover, model, options);
    themeRuntime?.apply(popover);
  }
  const syncSurfaceAria = (expanded) => {
    buttonNode?.setAttribute("aria-expanded", expanded ? "true" : "false");
    buttonNode?.setAttribute("aria-controls", POPOVER_ID);
  };
  const togglePopover = (event) => {
    if (event?.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (popover) {
      closePopover();
      return;
    }
    refresh();
    popover = el("div", "bp3-card bp3-elevation-3 rlb-popover");
    popover.id = POPOVER_ID;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "true");
    popover.setAttribute("aria-labelledby", POPOVER_TITLE_ID);
    document.body.appendChild(popover);
    ensureThemeRuntime().apply(popover);
    buttonNode?.setAttribute("aria-haspopup", "dialog");
    syncSurfaceAria(POPOVER_ID);
    renderPopover();
    positionPopover();
    document.addEventListener("mousedown", onDocumentMouseDown, true);
    document.addEventListener("keydown", onPopoverKeyDown, true);
    window.addEventListener("resize", closePopover);
    const firstFocusable = popover.querySelector("button");
    if (firstFocusable)
      firstFocusable.focus();
    else {
      popover.tabIndex = -1;
      popover.focus();
    }
  };
  confirmation?.setOnChange(() => {
    renderSurfaces();
  });
  const syncButtonLayout = (mode) => {
    if (layoutMode === mode)
      return;
    if (mode === "idle")
      buttonNode.replaceChildren(iconNode);
    else if (mode === "paused")
      buttonNode.replaceChildren(iconNode);
    else if (mode === "parallel")
      buttonNode.replaceChildren(timeNode, separatorNode, parallelNode);
    else
      buttonNode.replaceChildren(timeNode);
    layoutMode = mode;
  };
  const renderButton = (entries = getRunning(), now = nowDate(), { reconcile: reconcile2 = true } = {}) => {
    if (!buttonNode)
      return;
    const pausedItems = getPaused();
    const recoveryItems = getPendingResume().filter((item) => item?.recoveryState === "conflict");
    const finalizingRecovery = getRecoveryState();
    const recoveryCount = recoveryItems.length + (finalizingRecovery ? 1 : 0);
    const running2 = entries.length > 0;
    if (running2 && reconcile2)
      reconcileCycle(entries, { now });
    const cycleElapsed = cycleElapsedMs(now);
    const overrun = isCycleOverrun(now);
    const stale = findStaleClocks(entries, now, staleHours()).length > 0;
    const loadTone = sessionLoadTone(running2 ? entries.length : 0);
    parallelNode.className = loadTone === "neutral" ? "rlb-topbar__parallel" : `rlb-topbar__parallel rlb-topbar__parallel--load-${loadTone}`;
    if (!running2) {
      buttonNode.classList.add("rlb-topbar__button--icon-only");
      buttonNode.classList.remove("rlb-topbar__button--parallel");
      buttonNode.classList.toggle(
        "rlb-topbar__button--paused",
        pausedItems.length > 0 || recoveryItems.length > 0 || Boolean(finalizingRecovery)
      );
      iconNode.className = "bp3-icon bp3-icon-history rlb-topbar__icon";
      timeNode.textContent = "";
      timeNode.className = "rlb-topbar__time";
      parallelNode.textContent = "";
      separatorNode.textContent = "";
      syncButtonLayout(
        pausedItems.length > 0 || recoveryItems.length > 0 || finalizingRecovery ? "paused" : "idle"
      );
      buttonNode.title = pausedItems.length ? `${taskCount2(pausedItems.length)} Paused \u2014 click to resume or review.` + (recoveryItems.length > 0 ? `
${recoveryItems.length} Recovery item${recoveryItems.length === 1 ? "" : "s"} require review.` : "") : recoveryCount > 0 ? `${recoveryCount} Recovery item${recoveryCount === 1 ? "" : "s"} require review \u2014 click to retry.` : "Roam Logbook \u2014 no Session running. Click for details.";
      buttonNode.setAttribute("aria-label", buttonNode.title);
      return;
    }
    buttonNode.classList.remove("rlb-topbar__button--icon-only");
    buttonNode.classList.remove("rlb-topbar__button--paused");
    const [first] = entries;
    const state = overrun ? "overrun" : stale ? "stale" : "neutral";
    timeNode.className = `rlb-topbar__time rlb-topbar__time--${state}`;
    timeNode.textContent = formatElapsed(cycleElapsed);
    buttonNode.classList.add("rlb-topbar__button--parallel");
    parallelNode.textContent = sessionCount2(entries.length);
    separatorNode.textContent = "";
    syncButtonLayout("parallel");
    if (entries.length > 1) {
      buttonNode.title = `${sessionCount2(entries.length)} Running
Primary timer: ${first.title}
Shared cycle ${formatElapsed(cycleElapsed)}` + (overrun ? "\nA Pomodoro is over its target." : "") + (!overrun && stale ? "\nA clock is likely forgotten." : "") + "\nClick for all clock details.";
    } else {
      const totalMinutes2 = first.priorMinutes + Math.floor((now - first.start.getTime()) / 6e4);
      const threshold = cycleThresholdMinutes();
      buttonNode.title = `${sessionCount2(entries.length)} Running
Clocked in: ${first.title}
Shared cycle ${formatElapsed(cycleElapsed)} \xB7 ${formatMinutesHuman(totalMinutes2)} on this task in total` + (threshold ? `
Pomodoro cycle ${formatElapsed(threshold * 6e4)} \u2014 ${overrun ? `over by ${formatElapsed(cycleOverrunMs(now))}` : `${formatElapsed(threshold * 6e4 - cycleElapsed)} left`}` : "") + (!overrun && stale ? "\nThis clock is likely forgotten." : "");
    }
    buttonNode.setAttribute("aria-label", buttonNode.title);
  };
  const tick = () => {
    tickCount += 1;
    const entries = getRunning();
    if (entries.length === 0)
      return;
    const now = nowDate();
    renderButton(entries, now);
    updateSessionSurfaceElapsed(popover, entries, now);
  };
  const stopTicker = () => {
    if (ticker !== null)
      clearIntervalFn(ticker);
    ticker = null;
  };
  const startTicker = () => {
    if (destroyed || ticker !== null)
      return;
    ticker = setIntervalFn(tick, 1e3);
  };
  const stopAttachmentObservers = () => {
    observer?.disconnect();
    observer = null;
    recoveryObserver?.disconnect();
    recoveryObserver = null;
    outerRecoveryObserver?.disconnect();
    outerRecoveryObserver = null;
    hostObserver?.disconnect();
    hostObserver = null;
    recoveryTarget = null;
    outerRecoveryTarget = null;
    observedTopbar = null;
  };
  const build = () => {
    container = el("div", "rlb-topbar");
    container.id = WIDGET_ID;
    iconNode = el("span", "bp3-icon bp3-icon-history rlb-topbar__icon");
    parallelNode = el("span", "rlb-topbar__parallel");
    separatorNode = el("span", "rlb-topbar__separator");
    separatorNode.setAttribute("aria-hidden", "true");
    timeNode = el("span", "rlb-topbar__time");
    buttonNode = button("bp3-button bp3-minimal rlb-topbar__button", "", togglePopover);
    buttonNode.setAttribute("aria-haspopup", "dialog");
    buttonNode.setAttribute("aria-controls", POPOVER_ID);
    buttonNode.setAttribute("aria-expanded", "false");
    buttonNode.appendChild(iconNode);
    container.appendChild(buttonNode);
    renderButton();
  };
  const attach2 = () => {
    if (destroyed)
      return;
    attachCount += 1;
    if (!showTopbarWidget()) {
      stopTicker();
      stopAttachmentObservers();
      remove();
      return;
    }
    const topbar = document.querySelector(TOPBAR_SELECTOR2);
    observeRecoveryTarget(topbar);
    if (!topbar) {
      stopTicker();
      return;
    }
    startTicker();
    if (topbar !== observedTopbar)
      observeTopbar(topbar);
    if (!container)
      build();
    const placement = afterNavigation(topbar);
    syncTopbarLayout(placement);
    if (container.parentNode !== placement.parent || container.nextSibling !== placement.before) {
      placement.parent.insertBefore(container, placement.before);
    }
  };
  const isPluginNode2 = (node) => Boolean(
    node && (node === container || node === popover || container?.contains(node) || popover?.contains(node))
  );
  const hasNonPluginMutation = (record) => {
    if (isPluginNode2(record.target))
      return false;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.length === 0 || nodes.some((node) => !isPluginNode2(node));
  };
  const touchesTopbar = (record) => {
    if (isPluginNode2(record.target))
      return false;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    if (nodes.length > 0 && nodes.every(isPluginNode2))
      return false;
    if (record.target?.closest?.(TOPBAR_SELECTOR2))
      return true;
    return nodes.some(
      (node) => node?.matches?.(TOPBAR_SELECTOR2) || node?.querySelector?.(TOPBAR_SELECTOR2)
    );
  };
  const scheduleAttach = () => {
    if (destroyed || attachQueued)
      return;
    attachQueued = true;
    const flush = () => {
      attachQueued = false;
      attachTimer = null;
      attach2();
    };
    if (typeof queueMicrotask === "function")
      queueMicrotask(flush);
    else
      attachTimer = setTimeout(flush, 0);
  };
  const observeTopbar = (topbar) => {
    hostObserver?.disconnect();
    observedTopbar = topbar;
    hostObserver = new MutationObserver((records) => {
      if (records.some(hasNonPluginMutation))
        scheduleAttach();
    });
    hostObserver.observe(topbar, { childList: true, subtree: true });
  };
  const observeRecoveryTarget = (topbar) => {
    const target = topbar?.parentElement || document.body;
    const subtree = !topbar;
    const outerTarget = topbar?.parentElement?.parentElement || null;
    if (recoveryObserver && recoveryTarget === target && outerRecoveryTarget === outerTarget)
      return;
    recoveryObserver?.disconnect();
    outerRecoveryObserver?.disconnect();
    recoveryObserver = new MutationObserver((records) => {
      if (records.some(touchesTopbar))
        scheduleAttach();
    });
    recoveryTarget = target;
    recoveryObserver.observe(target, { childList: true, ...subtree ? { subtree: true } : {} });
    outerRecoveryTarget = outerTarget;
    if (outerTarget && outerTarget !== target) {
      outerRecoveryObserver = new MutationObserver((records) => {
        if (records.some(touchesTopbar))
          scheduleAttach();
      });
      outerRecoveryObserver.observe(outerTarget, { childList: true });
    } else {
      outerRecoveryObserver = null;
    }
    observer = recoveryObserver;
  };
  const afterNavigation = (topbar) => {
    const descendants = [...topbar.querySelectorAll("*")].filter(
      (node) => node !== container && !container?.contains(node)
    );
    const mainIndex = descendants.findIndex(isMainControl);
    const leading = mainIndex >= 0 ? descendants.slice(0, mainIndex) : descendants;
    const signal = leading.find((node) => FORWARD_PATTERN.test(controlSignals(node))) || leading.find((node) => BACK_PATTERN.test(controlSignals(node))) || leading.find((node) => MENU_PATTERN.test(controlSignals(node)));
    if (signal) {
      const anchor = navigationCluster(signal, topbar);
      const next = anchor.nextSibling;
      return {
        parent: anchor.parentNode,
        before: next === container ? container.nextSibling : next
      };
    }
    const main = descendants.find(isMainControl);
    if (main) {
      const boundary = surfaceChild(main, topbar);
      return { parent: boundary.parentNode, before: boundary };
    }
    let surface = topbar;
    while (surface.children.length === 1 && surface.firstElementChild !== container && surface.firstElementChild.children.length > 0) {
      surface = surface.firstElementChild;
    }
    return { parent: surface, before: surface.firstElementChild?.nextSibling ?? null };
  };
  const controlSignals = (element) => [
    element.className,
    element.getAttribute?.("data-icon"),
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.getAttribute?.("data-name")
  ].filter((value) => typeof value === "string").join(" ").replaceAll("_", "-").toLowerCase();
  const isMainControl = (element) => element.matches?.('input, textarea, select, [contenteditable="true"]') || MAIN_CONTROL_PATTERN.test(controlSignals(element));
  const containsMainControl = (element) => isMainControl(element) || Boolean(
    element.querySelector?.('input, textarea, select, [contenteditable="true"]') || [...element.querySelectorAll?.("*") || []].some(isMainControl)
  );
  const syncTopbarLayout = (placement) => {
    for (const host2 of layoutHosts)
      host2.classList.remove("rlb-topbar__layout");
    for (const host2 of searchHosts)
      host2.classList.remove("rlb-topbar__search");
    layoutHosts.clear();
    searchHosts.clear();
    const host = placement.parent;
    if (!host?.classList)
      return;
    host.classList.add("rlb-topbar__layout");
    layoutHosts.add(host);
    for (const child of host.children) {
      if (child === container || !containsMainControl(child))
        continue;
      child.classList.add("rlb-topbar__search");
      searchHosts.add(child);
      break;
    }
  };
  const navigationCluster = (signal, topbar) => {
    let anchor = signal.closest?.('button, a, [role="button"]') || signal;
    while (anchor.parentElement && anchor.parentElement !== topbar && ![...anchor.parentElement.querySelectorAll("*")].some(isMainControl)) {
      anchor = anchor.parentElement;
    }
    return anchor;
  };
  const surfaceChild = (signal, topbar) => {
    let boundary = signal;
    while (boundary.parentElement && boundary.parentElement !== topbar && !boundary.previousElementSibling) {
      boundary = boundary.parentElement;
    }
    return boundary;
  };
  const remove = () => {
    closePopover();
    for (const host of layoutHosts)
      host.classList.remove("rlb-topbar__layout");
    for (const host of searchHosts)
      host.classList.remove("rlb-topbar__search");
    layoutHosts.clear();
    searchHosts.clear();
    container?.remove();
  };
  return {
    mount() {
      ensureThemeRuntime();
      unsubscribe = subscribe(() => {
        renderButton();
        renderSurfaces();
      });
      unsubscribePaused = subscribe2(() => {
        renderButton();
        renderSurfaces();
      });
      attach2();
    },
    refresh: attach2,
    getPerformanceSnapshot() {
      return { attachCount, tickCount };
    },
    unmount() {
      destroyed = true;
      if (refreshClearTimer)
        clearTimeout(refreshClearTimer);
      refreshClearTimer = null;
      refreshInFlight = null;
      unsubscribe?.();
      unsubscribe = null;
      unsubscribePaused?.();
      unsubscribePaused = null;
      stopTicker();
      stopAttachmentObservers();
      attachQueued = false;
      if (attachTimer)
        clearTimeout(attachTimer);
      attachTimer = null;
      remove();
      container = null;
      themeRuntime?.release();
      themeRuntime = null;
    }
  };
}

// src/completion.js
var retryableDetachers = /* @__PURE__ */ new Set();
var retryOrphanedDetachers = () => {
  for (const detach of [...retryableDetachers]) {
    try {
      const result = detach();
      if (result?.ok)
        retryableDetachers.delete(detach);
    } catch (error) {
      console.warn("[roam-logbook] deferred completion watch cleanup failed", error);
    }
  }
  return retryableDetachers.size === 0;
};
var issueUids = (issue) => new Set([
  issue?.taskUid,
  issue?.parentUid,
  ...Array.isArray(issue?.affectedUids) ? issue.affectedUids : []
].filter((uid) => typeof uid === "string" && uid));
var seedHasIssue = (seed, parentOf, issues) => {
  const affected = issues.flatMap((issue) => [...issueUids(issue)]);
  const blocked = new Set(affected);
  const seen = /* @__PURE__ */ new Set();
  let current = seed;
  while (current) {
    if (blocked.has(current))
      return true;
    if (seen.has(current))
      return true;
    seen.add(current);
    current = parentOf[current];
  }
  return false;
};
var ancestorsOf = (seed, parentOf) => {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  let current = seed;
  while (current) {
    if (seen.has(current))
      return null;
    seen.add(current);
    result.push(current);
    current = parentOf[current];
  }
  return result;
};
function attachCompletionHandling({ pauseApi = null, onResult = null, onWatchIssue = null } = {}) {
  let watchCleanupReady = retryOrphanedDetachers();
  let disposed = false;
  const watches = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Set();
  const retryClockUids = /* @__PURE__ */ new Map();
  const retryAttempts = /* @__PURE__ */ new Map();
  const lastStatus = /* @__PURE__ */ new Map();
  let pending = /* @__PURE__ */ new Set();
  let scheduled = false;
  const reportWatchIssue = (issue) => {
    try {
      onWatchIssue?.(issue);
    } catch (error) {
      console.error("[roam-logbook] completion watcher issue listener failed", error);
    }
  };
  const reportResult = (result) => {
    try {
      onResult?.(result);
    } catch (error) {
      console.error("[roam-logbook] completion result listener failed", error);
    }
  };
  const schedule = (uid, explicitRetryClockUids = null) => {
    if (disposed || !uid || active.has(uid))
      return;
    if (Array.isArray(explicitRetryClockUids) && explicitRetryClockUids.length > 0) {
      const retry = retryClockUids.get(uid) || /* @__PURE__ */ new Set();
      for (const clockUid of explicitRetryClockUids) {
        if (typeof clockUid === "string" && clockUid)
          retry.add(clockUid);
      }
      retryClockUids.set(uid, retry);
    }
    pending.add(uid);
    if (scheduled)
      return;
    scheduled = true;
    Promise.resolve().then(async () => {
      while (!disposed && pending.size > 0) {
        const current = [...pending];
        pending = /* @__PURE__ */ new Set();
        for (const taskUid of current) {
          if (active.has(taskUid))
            continue;
          active.add(taskUid);
          const retry = retryClockUids.get(taskUid);
          retryClockUids.delete(taskUid);
          try {
            const result = await clockOutCompletedTask(taskUid, {
              source: "auto-complete",
              retryClockUids: retry ? [...retry] : null,
              getPauseTaskUids: () => [
                ...pauseApi?.getPaused?.() || [],
                ...pauseApi?.getPendingResume?.() || []
              ].map((item) => item.taskUid),
              pruneCompleted: (taskUids) => pauseApi?.pruneCompleted?.(taskUids)
            });
            reportResult(result);
            const remaining = [
              ...Array.isArray(result?.retry?.retryClockUids) ? result.retry.retryClockUids : [],
              ...Array.isArray(result?.pendingClockUids) ? result.pendingClockUids : []
            ].filter((clockUid, index, all) => typeof clockUid === "string" && all.indexOf(clockUid) === index);
            if (!result?.ok && remaining.length > 0) {
              retryClockUids.set(taskUid, new Set(remaining));
              const attempts = retryAttempts.get(taskUid) || 0;
              if (attempts < 1 && !disposed) {
                retryAttempts.set(taskUid, attempts + 1);
                pending.add(taskUid);
              }
            } else if (result?.ok) {
              retryAttempts.delete(taskUid);
              retryClockUids.delete(taskUid);
            }
          } catch (error) {
            const result = {
              action: "auto-clock-out",
              source: "auto-complete",
              ok: false,
              triggerUid: taskUid,
              failed: 1,
              pending: 1,
              pendingClockUids: retry ? [...retry] : [],
              uncertain: true,
              partial: false,
              retry: {
                action: "auto-clock-out",
                taskUid,
                retryClockUids: retry ? [...retry] : []
              },
              error
            };
            reportResult(result);
            if (retry)
              retryClockUids.set(taskUid, retry);
            console.error("[roam-logbook] automatic completion action failed", error);
          } finally {
            active.delete(taskUid);
          }
        }
      }
      scheduled = false;
      if (!disposed && pending.size > 0)
        schedule([...pending][0]);
    }).catch((error) => {
      scheduled = false;
      console.error("[roam-logbook] automatic completion reconciliation failed", error);
    });
  };
  const sync = (entries, event = {}) => {
    if (disposed || !Array.isArray(entries))
      return;
    if (!watchCleanupReady) {
      watchCleanupReady = retryOrphanedDetachers();
      if (!watchCleanupReady)
        return;
    }
    const pauseTaskUids = [
      ...pauseApi?.getPaused?.() || [],
      ...pauseApi?.getPendingResume?.() || []
    ].map((item) => item.taskUid);
    const seeds = [
      ...new Set([...entries.map((entry) => entry.taskUid), ...pauseTaskUids].filter(Boolean))
    ];
    let hierarchy;
    try {
      hierarchy = readHierarchy(seeds, { includeSeedStrings: true });
    } catch (error) {
      reportWatchIssue({ type: "hierarchy-read", error, affectedUids: seeds });
      console.warn("[roam-logbook] completion hierarchy could not be confirmed", error);
      return;
    }
    const desired = /* @__PURE__ */ new Set();
    for (const seed of seeds) {
      if (seedHasIssue(seed, hierarchy.parentOf, hierarchy.issues))
        continue;
      const component = ancestorsOf(seed, hierarchy.parentOf);
      if (!component)
        continue;
      for (const uid of component)
        desired.add(uid);
    }
    let installed = false;
    for (const uid of desired) {
      if (watches.has(uid))
        continue;
      const result = watchBlockString(uid, () => schedule(uid));
      if (result.ok) {
        watches.set(uid, result);
        installed = true;
      } else {
        reportWatchIssue({ type: "install", uid, error: result.error, result });
        console.warn("[roam-logbook] completion watch unavailable", uid, result.error);
      }
    }
    if (hierarchy.issues.length === 0) {
      for (const [uid, watch] of watches) {
        if (!desired.has(uid)) {
          const result = watch.detach();
          if (result?.ok)
            watches.delete(uid);
          else {
            reportWatchIssue({ type: "remove", uid, error: result?.error, result });
            console.warn("[roam-logbook] completion watch could not be removed", uid, result?.error);
          }
        }
      }
    } else {
      for (const issue of hierarchy.issues) {
        reportWatchIssue({ type: "hierarchy", issue });
      }
      console.warn("[roam-logbook] completion hierarchy is ambiguous; affected watches were retained");
    }
    const statusOf = new Map([
      ...entries.map((entry) => [entry.taskUid, entry.status]),
      ...Object.entries(hierarchy.stringOf).map(([uid, string]) => [uid, taskStatus(string)])
    ]);
    for (const uid of [...lastStatus.keys()]) {
      if (!desired.has(uid)) {
        lastStatus.delete(uid);
        retryAttempts.delete(uid);
        retryClockUids.delete(uid);
      }
    }
    const explicitReconciliation = event.explicit === true || event.reason === "refresh" || event.reason === "reconcile";
    for (const uid of desired) {
      const status = statusOf.get(uid);
      const previous = lastStatus.get(uid);
      lastStatus.set(uid, status);
      if (status !== "DONE") {
        retryAttempts.delete(uid);
        retryClockUids.delete(uid);
      } else if (previous !== "DONE" || explicitReconciliation && retryClockUids.has(uid)) {
        if (explicitReconciliation)
          retryAttempts.delete(uid);
        schedule(uid);
      }
    }
    const postInstallPass = Number(event.postInstallPass || 0);
    if (installed && postInstallPass < 2) {
      try {
        const confirmedEntries = readAllEntries().filter((entry) => entry.running);
        sync(confirmedEntries, {
          ...event,
          postInstallPass: postInstallPass + 1
        });
      } catch (error) {
        reportWatchIssue({ type: "post-install-read", error, affectedUids: [...desired] });
        console.warn("[roam-logbook] completion post-install reconciliation failed", error);
      }
    }
  };
  const unsubscribe = subscribe(sync);
  const detachAll = () => {
    const failedUids = [];
    for (const [uid, watch] of watches) {
      const result2 = watch.detach();
      if (result2?.ok)
        watches.delete(uid);
      else {
        failedUids.push(uid);
        reportWatchIssue({ type: "remove", uid, error: result2?.error, result: result2 });
      }
    }
    const result = { ok: failedUids.length === 0, failedUids };
    if (result.ok)
      retryableDetachers.delete(detachAll);
    else
      retryableDetachers.add(detachAll);
    return result;
  };
  return () => {
    if (!disposed) {
      disposed = true;
      pending.clear();
      retryClockUids.clear();
      retryAttempts.clear();
      lastStatus.clear();
      unsubscribe();
    }
    return detachAll();
  };
}

// src/extension.js
var CONTEXT_CLOCK_IN = "Logbook: Clock in";
var CONTEXT_CLOCK_OUT = "Logbook: Clock out";
var BRAND_NAME = "Roam Logbook";
var PALETTE_COMMANDS = [
  "Logbook: Clock in current block",
  "Logbook: Clock out current block",
  "Logbook: Clock out all running clocks",
  "Logbook: Open dashboard",
  "Logbook: Check for unfinished clocks"
];
function createController({ extensionAPI: extensionAPI2 }) {
  const dashboard = createDashboard();
  const confirmation = createConfirmationController();
  const topbar = createTopbar({
    confirmation,
    onOpenDashboard: (trigger) => dashboard.open({ returnFocusTo: trigger }),
    onMutationResult: (result) => presentMutationResult(result, notifyUser)
  });
  let destroyed = false;
  let detachPomodoro = null;
  let detachCompletion = null;
  const targetString = (context) => {
    const uid = resolveTaskUid(context?.["block-uid"]);
    return getBlockString(uid) ?? context?.["block-string"] ?? "";
  };
  const canClockIn = (context) => {
    const uid = context?.["block-uid"];
    if (!uid || isBlockRunning(uid))
      return false;
    const string = targetString(context);
    if (taskStatus(string) === "DONE")
      return false;
    return todoBlocksOnly() ? isTaskBlock(string) : true;
  };
  const notifyUser = (message) => {
    try {
      const showToast = extensionAPI2?.ui?.showToast || window.roamAlphaAPI?.ui?.showToast;
      showToast?.({ content: message, intent: "warning" });
    } catch (error) {
      console.warn("[roam-logbook] could not show notification", error);
    }
  };
  const guard = async (action) => {
    try {
      const result = await action();
      return presentMutationResult(result, notifyUser);
    } catch (error) {
      console.error("[roam-logbook]", error);
      notifyUser(
        mutationResultNotice(error) || error?.message || `${BRAND_NAME} could not complete that action.`
      );
    }
  };
  const clockInFocused = () => guard(async () => {
    const uid = getFocusedBlockUid();
    if (!uid) {
      notifyUser("No focused block. Select a block before clocking in.");
      return;
    }
    return clockIn(uid);
  });
  const registerSettings = () => {
    extensionAPI2.settings.panel.create({
      tabTitle: BRAND_NAME,
      settings: [
        {
          id: SETTING_TOPBAR,
          name: "Show topbar widget",
          description: "The live counter and its running Session list in Roam\u2019s left navigation.",
          action: {
            type: "switch",
            defaultValue: true,
            onChange: (event) => {
              extensionAPI2.settings.set(SETTING_TOPBAR, normalizeChecked(event));
              topbar.refresh();
            }
          }
        },
        {
          id: SETTING_TODO_ONLY,
          name: "Only offer clock in on TODO blocks",
          description: "Turn off to clock any block, not just TODO/DONE ones.",
          action: {
            type: "switch",
            defaultValue: true,
            onChange: (event) => extensionAPI2.settings.set(SETTING_TODO_ONLY, normalizeChecked(event))
          }
        },
        {
          id: SETTING_MULTIPLE,
          name: "Allow multiple clocks at once",
          description: "Off (org-mode behaviour): clocking in closes the running clock. On: several tasks run in parallel.",
          action: {
            type: "switch",
            defaultValue: false,
            onChange: (event) => extensionAPI2.settings.set(SETTING_MULTIPLE, normalizeChecked(event))
          }
        },
        {
          id: SETTING_POMODORO_MINUTES,
          name: "Pomodoro duration (minutes)",
          description: "Sets the shared cycle threshold captured when the first Session starts. Passing it turns elapsed time red; the cycle keeps running.",
          action: {
            type: "input",
            placeholder: "30",
            defaultValue: "30",
            onChange: (event) => {
              extensionAPI2.settings.set(
                SETTING_POMODORO_MINUTES,
                normalizePositiveMinutes(event)
              );
              topbar.refresh();
            }
          }
        },
        {
          id: SETTING_STALE_HOURS,
          name: "Flag unfinished clocks after",
          description: "How long a clock may run before it is called out as forgotten.",
          action: {
            type: "select",
            items: ["2", "4", "8", "12", "24"],
            defaultValue: "8",
            onChange: (event) => {
              extensionAPI2.settings.set(SETTING_STALE_HOURS, normalizeSelected(event));
              topbar.refresh();
            }
          }
        }
      ]
    });
  };
  const registerCommands = () => {
    const add = (label, callback) => extensionAPI2.ui.commandPalette.addCommand({ label, callback });
    add(PALETTE_COMMANDS[0], clockInFocused);
    add(
      PALETTE_COMMANDS[1],
      () => guard(async () => {
        const uid = getFocusedBlockUid();
        if (!uid) {
          notifyUser("No focused block. Select a block before clocking out.");
          return;
        }
        return clockOutBlock(uid);
      })
    );
    add(
      PALETTE_COMMANDS[2],
      () => guard(async () => {
        if (!confirmation.arm("clock-out-all", "command")) {
          notifyUser("Clock Out All is armed. Run again within 5 seconds to confirm.");
          return;
        }
        return clockOutAll();
      })
    );
    add(PALETTE_COMMANDS[3], () => dashboard.open());
    add(PALETTE_COMMANDS[4], () => {
      refresh();
      dashboard.open();
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: CONTEXT_CLOCK_IN,
      "display-conditional": canClockIn,
      callback: (context) => guard(() => clockIn(context["block-uid"]))
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: CONTEXT_CLOCK_OUT,
      "display-conditional": (context) => isBlockRunning(context?.["block-uid"]),
      callback: (context) => guard(() => clockOutBlock(context["block-uid"]))
    });
  };
  return {
    init() {
      setExtensionAPI(extensionAPI2);
      injectStyles(STYLE_ID, STYLES);
      registerSettings();
      registerCommands();
      load();
      load2();
      detachPomodoro = attach();
      detachCompletion = attachCompletionHandling({
        pauseApi: paused_exports,
        onResult: (result) => presentMutationResult(result, notifyUser)
      });
      topbar.mount();
      refresh();
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      confirmation.reset();
      detachCompletion?.();
      detachCompletion = null;
      detachPomodoro?.();
      detachPomodoro = null;
      reset2();
      topbar.unmount();
      dashboard.destroy();
      reset();
      reset3();
      removeStyles(STYLE_ID);
      for (const label of [CONTEXT_CLOCK_IN, CONTEXT_CLOCK_OUT]) {
        try {
          window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
        } catch (error) {
          console.error("[roam-logbook] could not remove context command", error);
        }
      }
      for (const label of PALETTE_COMMANDS) {
        try {
          extensionAPI2.ui.commandPalette.removeCommand({ label });
        } catch {
        }
      }
      setExtensionAPI(null);
    }
  };
}
var controller = null;
var extension_default = {
  version: PLUGIN_VERSION,
  onload: ({ extensionAPI: extensionAPI2 }) => {
    controller?.destroy();
    controller = createController({ extensionAPI: extensionAPI2 });
    controller.init();
  },
  onunload: () => {
    controller?.destroy();
    controller = null;
  }
};
export {
  extension_default as default
};
