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
function formatStarted(start2, now = /* @__PURE__ */ new Date()) {
  const raw = isValidDate(start2) ? formatStamp(start2) : String(start2 ?? "");
  const candidate = isValidDate(start2) ? start2 : parseTimestamp(raw.replace(/^\[|\]$/g, ""));
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
function formatDayLabel(date, now = /* @__PURE__ */ new Date()) {
  if (!isValidDate(date))
    return "";
  const sameDay = isValidDate(now) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const dateLabel = sameDay ? "Today" : `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  return `${dateLabel} ${DAY_NAMES[date.getDay()]}`;
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
  const start2 = startOfDay(date);
  start2.setDate(start2.getDate() - days);
  return start2;
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
  const start2 = parseTimestamp(match[1]);
  if (!start2) {
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
  if (end && end.getTime() < start2.getTime()) {
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
  const computedMinutes = end ? durationMinutes(start2.getTime(), end.getTime()) : null;
  const effectiveMinutes = end ? declaredMinutes ?? computedMinutes : null;
  const issue = end && declaredMinutes !== null && declaredMinutes !== computedMinutes ? {
    code: "declared-duration-mismatch",
    message: `Declared ${match[3]} differs from the ${formatDurationMinutes(computedMinutes)} computed from timestamps.`
  } : null;
  return {
    ok: true,
    value: {
      start: start2,
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
function formatClockLine(start2, end) {
  if (!end)
    return `${CLOCK_LABEL} ${formatStamp(start2)}`;
  const minutes = durationMinutes(start2.getTime(), end.getTime());
  return `${CLOCK_LABEL} ${formatStamp(start2)}--${formatStamp(end)} => ${formatDurationMinutes(minutes)}`;
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
function readHierarchy(taskUids) {
  const parentOf = {};
  const stringOf = {};
  const mirrorsOf = {};
  const issues = [];
  const seeds = new Set(taskUids);
  if (seeds.size === 0)
    return { parentOf, stringOf, mirrorsOf, issues };
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
  return { parentOf, stringOf, mirrorsOf, issues };
}

// src/mutations.js
var tail = Promise.resolve();
function enqueueMutation(action) {
  const result = tail.then(action, action);
  tail = result.catch(() => void 0);
  return result;
}
function resetMutationQueue() {
  tail = Promise.resolve();
}

// src/version.js
var PLUGIN_VERSION = "0.9.0-beta.7";
var STATE_FORMATS = Object.freeze({
  pauseBatch: 2,
  pomodoroTargets: 1,
  stateBackups: 1
});

// src/settings.js
var SETTING_TOPBAR = "showTopbarWidget";
var SETTING_MULTIPLE = "allowMultipleClocks";
var SETTING_TODO_ONLY = "todoBlocksOnly";
var SETTING_STALE_HOURS = "staleHours";
var SETTING_POMODORO_MINUTES = "pomodoroMinutes";
var SETTING_POMODORO_STATE = "pomodoroTargets";
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
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1")
      return true;
    if (normalized === "false" || normalized === "0")
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
  listener(running);
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
function notify() {
  for (const listener of listeners) {
    try {
      listener(running);
    } catch (error) {
      console.error("[roam-logbook] listener failed", error);
    }
  }
}
var uncertainCloseResult = (error) => {
  const pendingClockUids = running.map((entry) => entry.clockUid);
  return {
    action: "close-sessions",
    ok: false,
    item: "Session",
    completedVerb: "ended",
    entries: running,
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
    error
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
    notify();
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
      const confirmation = refreshResult();
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
      publishAction({ type: "clock-in", source, clockUid, taskUid });
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
async function clockOutEntries(clockUids = null, { now = /* @__PURE__ */ new Date(), source = "user" } = {}) {
  return enqueueMutation(async () => {
    try {
      return await withGraphGuard(async () => {
        const entries = readAllEntries();
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
        return result;
      });
    } catch (error) {
      notice = GRAPH_UNCERTAIN;
      return uncertainCloseResult(error);
    }
  });
}
async function pauseEntries({ now = /* @__PURE__ */ new Date(), prepare, source = "pause" } = {}) {
  return enqueueMutation(async () => {
    try {
      return await withGraphGuard(async () => {
        const entries = readAllEntries().filter((entry) => entry.running);
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
function summariseByDay(entries, now, days) {
  const buckets = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry.start)
      continue;
    const key = dateKey(entry.start);
    buckets.set(key, (buckets.get(key) || 0) + entryMinutes(entry, now));
  }
  const series = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = startOfDaysAgo(now, offset);
    const key = dateKey(date);
    series.push({ date, key, minutes: buckets.get(key) || 0 });
  }
  return series;
}
function summariseActivity(entries, now, rangeId) {
  const range = getRange(rangeId);
  if (range.days === null) {
    return {
      buckets: summariseByDay(filterByRange(entries, "month", now), now, 30),
      label: "Recent 30 days",
      scope: "recent-30-days"
    };
  }
  return {
    buckets: summariseByDay(entries, now, range.days),
    label: range.label,
    scope: "selected-range"
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
  const activity = summariseActivity(entries, now, rangeId);
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
    days: activity.buckets,
    activity: activity.buckets,
    activityLabel: activity.label,
    activityScope: activity.scope,
    running: entries.filter((entry) => entry.running),
    issues: entries.filter((entry) => entry.issue)
  };
}
function findStaleClocks(entries, now, staleHours2) {
  const cutoff = now.getTime() - staleHours2 * 36e5;
  return entries.filter((entry) => entry.running && entry.start.getTime() < cutoff);
}

// src/dashboard.js
var ROOT_ID = "roam-logbook-dashboard";
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
  let lastSnapshot = null;
  const collapsed = /* @__PURE__ */ new Set();
  const clearLiveTicker = () => {
    if (liveTicker !== null)
      clearIntervalFn(liveTicker);
    liveTicker = null;
  };
  const resetDiscardConfirmation = () => {
    discardConfirmUid = null;
    if (discardConfirmTimer)
      clearTimeout(discardConfirmTimer);
    discardConfirmTimer = null;
  };
  const updateRunningElapsed = () => {
    if (!root?.classList.contains("rlb-root--open"))
      return;
    const now = nowFn().getTime();
    for (const cell of bodyNode?.querySelectorAll('[data-running-elapsed="true"]') || []) {
      cell.textContent = formatElapsed(now - Number(cell.dataset.startMs));
    }
  };
  const startLiveTicker = () => {
    clearLiveTicker();
    if (!root?.classList.contains("rlb-root--open"))
      return;
    if (!bodyNode?.querySelector('[data-running-elapsed="true"]'))
      return;
    liveTicker = setIntervalFn(updateRunningElapsed, 1e3);
  };
  const render = () => {
    if (!bodyNode)
      return;
    clearLiveTicker();
    const now = nowFn();
    let snapshot;
    let refreshNotice = "";
    let transientIssues = [];
    try {
      const candidate = readDashboardSnapshot();
      lastSnapshot = candidate;
      snapshot = candidate;
    } catch (error) {
      transientIssues = error.issue ? [error.issue] : error.issues || [];
      if (!lastSnapshot) {
        summaryNode.replaceChildren();
        const notice4 = el(
          "div",
          "rlb-dashboard__notice",
          "Graph data could not be refreshed; no successful snapshot is available yet."
        );
        notice4.setAttribute("role", "alert");
        const issueRows = transientIssues.map(issueRow);
        bodyNode.replaceChildren(
          notice4,
          ...issueRows.length > 0 ? [dataIssuesSection(issueRows)] : []
        );
        return;
      }
      snapshot = lastSnapshot;
      refreshNotice = "Graph data could not be refreshed; showing last successful snapshot.";
    }
    const entries = snapshot.entries;
    const hierarchy = snapshot.hierarchy;
    refresh({ entries });
    const model = buildDashboard(entries, { now, rangeId, hierarchy });
    bodyNode.replaceChildren();
    const rangeLabel = getRange(rangeId).label;
    summaryNode.replaceChildren(
      statsRow({
        today: formatMinutesHuman(model.todayMinutes),
        selected: formatMinutesHuman(model.totalMinutes),
        selectedLabel: rangeLabel,
        activity: model.activity || model.days,
        activityLabel: model.activityLabel || rangeLabel,
        activityScope: model.activityScope || "selected-range",
        tasks: String(model.tasks.length),
        now
      })
    );
    if (refreshNotice) {
      const notice4 = el("div", "rlb-dashboard__notice", refreshNotice);
      notice4.setAttribute("role", "status");
      bodyNode.appendChild(notice4);
    }
    if (model.running.length > 0) {
      bodyNode.appendChild(runningSection(model.running, now));
    }
    const issues = [
      ...model.issues,
      ...(hierarchy.issues || []).map(issueRow),
      ...transientIssues.map(issueRow)
    ];
    if (model.entries.length === 0) {
      bodyNode.appendChild(
        el("div", "rlb-empty", "No clock entries in this range yet.")
      );
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
  const activityRail = (days, now, activityLabel, activityScope) => {
    const series = days || [];
    const peak = Math.max(1, ...series.map((day) => day.minutes));
    const rail = el("div", "rlb-activity-rail");
    rail.dataset.dayCount = String(series.length);
    rail.style.setProperty("--rlb-activity-count", String(series.length));
    rail.dataset.activityScope = activityScope;
    rail.setAttribute("role", "group");
    rail.setAttribute("aria-label", `${activityLabel} activity`);
    for (const day of series) {
      const level = day.minutes === 0 ? 0 : Math.max(1, Math.ceil(day.minutes / peak * 3));
      const duration = formatMinutesHuman(day.minutes);
      const label = formatDayLabel(day.date, now);
      const bucket = button(
        `rlb-activity__bucket rlb-activity__bucket--level-${level}${day.minutes === 0 ? " rlb-activity__bucket--empty" : ""}`,
        "",
        () => {
        },
        { title: `${day.key} \xB7 ${duration}` }
      );
      bucket.dataset.date = day.key;
      bucket.dataset.minutes = String(day.minutes);
      bucket.dataset.level = String(level);
      bucket.setAttribute("aria-label", `${day.key}, ${label}, ${duration}`);
      const fill = el("span", "rlb-activity__fill");
      fill.style.height = `${day.minutes === 0 ? 0 : Math.max(8, Math.round(day.minutes / peak * 100))}%`;
      bucket.append(fill, el("span", "rlb-activity__label", label));
      rail.appendChild(bucket);
    }
    return rail;
  };
  const statsRow = ({
    today,
    selected,
    selectedLabel,
    activity,
    activityLabel,
    activityScope,
    tasks,
    now
  }) => {
    const wrapper = el("div", "rlb-stats");
    wrapper.setAttribute("role", "list");
    wrapper.setAttribute("aria-label", "Logbook summary");
    const metrics = [
      ["Today", today],
      [selectedLabel, selected],
      ["Tasks tracked", tasks]
    ];
    for (const [index, [label, value]] of metrics.entries()) {
      const card = el("div", "rlb-stat");
      if (index === 1)
        card.classList.add("rlb-stat--activity");
      card.setAttribute("role", "listitem");
      card.append(el("strong", "rlb-stat__value", value), el("span", "rlb-stat__label", label));
      if (index === 1)
        card.appendChild(activityRail(activity, now, activityLabel, activityScope));
      wrapper.appendChild(card);
    }
    return wrapper;
  };
  const runningSection = (running2, now) => {
    const stale = new Set(findStaleClocks(running2, now, staleHours()).map((e) => e.clockUid));
    const section = el("section", "rlb-dashboard-section rlb-running");
    section.appendChild(
      el(
        "h3",
        "rlb-section__title",
        stale.size > 0 ? `Running \xB7 ${stale.size} unfinished for over ${staleHours()}h` : "Running"
      )
    );
    const table = el("table", "rlb-table");
    table.appendChild(
      headerRow(["Task", "Started", { label: "Elapsed", numeric: true }, ""])
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
        () => {
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
          () => void act(() => clockOut(entry.clockUid)),
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
    const section = el("section", "rlb-dashboard-section rlb-by-task");
    const heading = el("div", "rlb-section__heading");
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
      paint();
    });
    if (parentUids.length > 0)
      heading.appendChild(toggleAll);
    section.appendChild(heading);
    const tableHost = el("div");
    section.appendChild(tableHost);
    function paint() {
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
              paint();
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
    paint();
    return section;
  };
  const countDescendants = (node) => node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  const headerRow = (columns) => {
    const thead = el("thead");
    const row = el("tr");
    for (const column of columns) {
      const numeric = typeof column === "object" && column.numeric;
      row.appendChild(el("th", numeric ? "rlb-table__num" : "", column.label ?? column));
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
    const link = button("bp3-button bp3-minimal bp3-small bp3-icon-document-open rlb-task-link", "", () => {
      close();
      void openBlock(taskUid);
    }, { title: accessibleName });
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
    const title = el("h2", "bp3-heading rlb-header__title", "Logbook");
    title.id = "roam-logbook-dashboard-title";
    heading.append(
      title,
      el("p", "rlb-header__subtitle", "Focus sessions, activity, and task rollups")
    );
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
      render();
    });
    selectWrapper.appendChild(select);
    header.append(
      selectWrapper,
      button("bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-icon-button", "", () => {
        render();
      }, { title: "Reload from the graph" }),
      button(
        "bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button",
        "",
        close,
        { title: "Close" }
      )
    );
    summaryNode = el("div", "rlb-summary");
    bodyNode = el("div", "rlb-body rlb-body__scroll");
    dialog.append(header, summaryNode, bodyNode);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    return overlay;
  };
  function close() {
    if (!root)
      return;
    clearLiveTicker();
    resetDiscardConfirmation();
    root.classList.remove("rlb-root--open");
    root.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeyDown, true);
    if (returnFocusTo?.isConnected)
      returnFocusTo.focus();
    returnFocusTo = null;
  }
  return {
    open({ returnFocusTo: requestedFocus } = {}) {
      const active = document.activeElement;
      returnFocusTo = requestedFocus?.isConnected ? requestedFocus : active && active !== document.body && active.isConnected ? active : null;
      if (!root)
        root = build();
      root.classList.add("rlb-root--open");
      root.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", onKeyDown, true);
      render();
      const dialog = root.querySelector(".rlb-dialog");
      const initial = dialogFocusables(dialog)[0];
      (initial || dialog)?.focus();
    },
    close,
    destroy() {
      clearLiveTicker();
      resetDiscardConfirmation();
      document.removeEventListener("keydown", onKeyDown, true);
      root?.remove();
      root = null;
      summaryNode = null;
      bodyNode = null;
    }
  };
}

// src/pomodoro.js
var VERSION = STATE_FORMATS.pomodoroTargets;
var targets = /* @__PURE__ */ new Map();
var notice2 = "";
var unsupportedRaw = null;
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
  notice2 = "";
  unsupportedRaw = null;
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
function targetMinutes(clockUid) {
  const minutes = targets.get(clockUid);
  return minutes > 0 ? minutes : null;
}
function targetDurationMs(clockUid) {
  const minutes = targetMinutes(clockUid);
  return minutes === null ? null : minutes * 6e4;
}
function isAssigned(clockUid) {
  return targets.has(clockUid);
}
function start(clockUid, minutes = pomodoroMinutes()) {
  if (!clockUid || !(minutes > 0))
    return false;
  const next = new Map(targets);
  next.set(clockUid, minutes);
  return writeTargets(next);
}
function startDurationMs(clockUid, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    return false;
  return start(clockUid, durationMs / 6e4);
}
function suppress(clockUid) {
  if (!clockUid)
    return false;
  const next = new Map(targets);
  next.set(clockUid, 0);
  return writeTargets(next);
}
function reconcile(running2) {
  if (unsupportedRaw !== null)
    return false;
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
    return false;
  }
  writeTargets(next);
  return true;
}
function overrunMs(entry, now = Date.now()) {
  const minutes = entry && targets.get(entry.clockUid);
  if (!minutes)
    return 0;
  return Math.max(0, now - entry.start.getTime() - minutes * 6e4);
}
function isOverrun(entry, now = Date.now()) {
  return overrunMs(entry, now) > 0;
}
function attach() {
  let sawInitialReplay = false;
  return subscribe((running2) => {
    if (!sawInitialReplay) {
      sawInitialReplay = true;
      return;
    }
    reconcile(running2);
  });
}
function reset2() {
  targets = /* @__PURE__ */ new Map();
  notice2 = "";
  unsupportedRaw = null;
}

// src/paused.js
var VERSION2 = STATE_FORMATS.pauseBatch;
var LEGACY_VERSION = 1;
var items = [];
var pendingResume = [];
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
  const remaining = value.pomodoroRemainingMs;
  const pomodoroRemainingMs = remaining === null || remaining === void 0 ? null : Number(remaining);
  const pomodoroSuppressed = value.pomodoroSuppressed === true;
  const clockUid = typeof value.clockUid === "string" && value.clockUid ? value.clockUid : null;
  const reconciliationState = value.reconciliationState === "externally-replaced" || value.reconciliationState === "externally-clocked-out" ? value.reconciliationState : null;
  const externalClockUid = typeof value.externalClockUid === "string" && value.externalClockUid ? value.externalClockUid : null;
  if (!taskUid || !Number.isFinite(pausedAtMs) || pausedAtMs < 0)
    return null;
  if (pomodoroRemainingMs !== null && (!Number.isFinite(pomodoroRemainingMs) || pomodoroRemainingMs <= 0)) {
    return null;
  }
  return {
    taskUid,
    title,
    pausedAtMs,
    pomodoroRemainingMs,
    pomodoroSuppressed,
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
var serialized2 = () => JSON.stringify({
  version: VERSION2,
  data: {
    items,
    pendingResume
  }
});
function persist() {
  if (unsupportedRaw2 !== null)
    return false;
  writeSetting(SETTING_PAUSED_BATCH, serialized2());
  return true;
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
function getNotice2() {
  return notice3;
}
function load2() {
  items = [];
  pendingResume = [];
  notice3 = "";
  unsupportedRaw2 = null;
  ensureClockActionSubscription();
  const raw = readSetting(SETTING_PAUSED_BATCH);
  if (!raw)
    return getPaused();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed?.version === VERSION2 && parsed.data && Array.isArray(parsed.data.items)) {
      const loadedItems = parsed.data.items.map(cleanRecord);
      const loadedPending = Array.isArray(parsed.data.pendingResume) ? parsed.data.pendingResume.map((value) => cleanPending(value, { version: VERSION2 })) : [];
      if (loadedItems.some((item) => !item) || loadedPending.some((item) => !item)) {
        throw new Error("invalid paused-task record");
      }
      const byTask = new Map(loadedItems.map((item) => [item.taskUid, item]));
      const pendingByTask = new Map(loadedPending.map((item) => [item.taskUid, item]));
      items = [...byTask.values()];
      pendingResume = [...pendingByTask.values()];
      if (pendingResume.some((item) => item.recoveryState === "conflict")) {
        const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
        notice3 = firstWarning ? "A current pending Resume has no exact Session association; it was retained as a conflict." : "";
      }
      return getPaused();
    }
    if (parsed?.version === LEGACY_VERSION && Array.isArray(parsed.items)) {
      const loaded = parsed.items.map(cleanRecord);
      const loadedPending = Array.isArray(parsed.pendingResume) ? parsed.pendingResume.map(
        (value) => cleanPending(value, { version: LEGACY_VERSION, legacy: true })
      ) : [];
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
    unsupportedRaw2 = raw;
    const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
    notice3 = firstWarning ? "Saved paused-task state uses an unsupported or invalid version and was kept." : "";
    if (firstWarning)
      console.warn("[roam-logbook] could not read paused task state", error);
    return getPaused();
  }
}
var pomodoroSnapshot = (entry, nowMs) => {
  const targetMs = targetDurationMs(entry.clockUid);
  if (targetMs === null) {
    return {
      pomodoroRemainingMs: null,
      pomodoroSuppressed: isAssigned(entry.clockUid)
    };
  }
  const remaining = targetMs - Math.max(0, nowMs - entry.start.getTime());
  return {
    pomodoroRemainingMs: remaining > 0 ? remaining : null,
    pomodoroSuppressed: remaining <= 0
  };
};
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
          ...pomodoroSnapshot(entry, now.getTime()),
          clockUid: entry.clockUid
        }));
        for (const snapshot of snapshots) {
          const record = pausedRecord(snapshot);
          merged.set(record.taskUid, record);
        }
        items = [...merged.values()];
        persist();
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
  persist();
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
    uncertain: Boolean(outcome.uncertain),
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
var applyPomodoro = (record) => {
  if (record.pomodoroRemainingMs) {
    if (!startDurationMs(record.clockUid, record.pomodoroRemainingMs)) {
      throw new Error("Pomodoro remainder could not be saved.");
    }
  } else if (record.pomodoroSuppressed) {
    if (!suppress(record.clockUid))
      throw new Error("Pomodoro suppression could not be saved.");
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
    try {
      applyPomodoro({ ...pending, clockUid: entry.clockUid });
      pendingResume = pendingResume.filter((item) => item.taskUid !== pending.taskUid);
      removeTask(pending.taskUid);
      persist();
      recovered += 1;
      if (pending.legacy === true)
        legacyRecovered += 1;
    } catch (error) {
      failed += 1;
      console.error("[roam-logbook] could not recover paused task", pending.taskUid, error);
    }
  }
  return { recovered, failed, conflicts, legacyToCreate, legacyRecovered };
}
var pendingTasks = () => new Set(pendingResume.map((item) => item.taskUid));
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
  applyPomodoro({ ...record, clockUid: entry.clockUid });
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
async function resumeAll({ now = /* @__PURE__ */ new Date() } = {}) {
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
  notice3 = "";
  const initial = refreshResult();
  if (!initial.ok) {
    notice3 = getNotice() || "Graph state could not be confirmed; no further changes were made.";
    notify2();
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
    satisfied,
    blocked: false,
    legacyRecovery,
    legacyRecovered
  });
}
async function clockOutAll({ now = /* @__PURE__ */ new Date() } = {}) {
  let outcome;
  try {
    outcome = await clockOutEntries(null, { now });
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
  const closedUids = new Set(
    outcome.results.filter((result) => result.closed).map((result) => result.clockUid)
  );
  const stillRunning = (outcome.entries || getRunning()).filter(
    (entry) => entry.running && !closedUids.has(entry.clockUid)
  );
  if (!outcome.uncertain && outcome.failed === 0 && stillRunning.length === 0) {
    items = [];
    pendingResume = [];
    notice3 = "";
    persist();
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
      ...pomodoroSnapshot(entry, now.getTime()),
      clockUid: entry.clockUid
    });
  }
  items = [...retained.values()];
  pendingResume = pendingResume.filter((item) => stillRunning.some((entry) => entry.taskUid === item.taskUid));
  notice3 = outcome.uncertain ? GRAPH_UNCERTAIN : `${stillRunning.length} Session${stillRunning.length === 1 ? "" : "s"} could not be closed.`;
  persist();
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
function reset3() {
  items = [];
  pendingResume = [];
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
    --rlb-pause-surface: rgba(184, 132, 55, 0.12);
    background: var(--rlb-pause-surface) !important;
}

.bp3-dark .rlb-topbar__button--paused {
    --rlb-pause-surface: rgba(214, 161, 93, 0.16);
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
    --rlb-surface-title-size: 10px;
    --rlb-surface-task-size: 13px;
    --rlb-surface-meta-size: 10px;
    --rlb-surface-action-size: 13px;
    --rlb-surface-row-padding: 5px;
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

.rlb-sidebar {
    --rlb-surface-title-size: 10px;
    --rlb-surface-task-size: 13px;
    --rlb-surface-meta-size: 10px;
    --rlb-surface-action-size: 13px;
    --rlb-surface-row-padding: 5px;
    width: min(360px, 100%);
    max-width: 100%;
    max-height: 100%;
    overflow-y: auto;
    padding: 10px;
    text-align: left;
}

.rlb-sidebar--fallback {
    position: fixed;
    top: 56px;
    right: 0;
    z-index: 30;
    max-height: calc(100vh - 56px);
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    opacity: 0.7;
}

.rlb-popover__subheading {
    padding: 10px 6px 4px;
    color: #5c7080;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.rlb-paused-list {
    padding: 0 6px 4px;
}

.rlb-paused-row {
    padding: 4px 0;
    overflow-wrap: anywhere;
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
    gap: 6px;
    padding-top: 8px;
    margin-top: 4px;
    border-top: 1px solid rgba(16, 22, 26, 0.15);
}

.rlb-popover__footer .bp3-button {
    min-width: 0;
    font-size: var(--rlb-surface-action-size, 12px);
    line-height: 1.2;
}

.rlb-popover__footer .rlb-surface__refresh {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    justify-self: center;
    padding: 0 !important;
    align-items: center;
    justify-content: center;
    color: #5c7080;
}

.rlb-popover__footer .rlb-surface__refresh:hover,
.rlb-popover__footer .rlb-surface__refresh:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.bp3-dark .rlb-popover__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
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
    width: 7px;
    height: 7px;
    margin-top: 0;
    border-radius: 50%;
    background: #7a9e87;
    opacity: 0.75;
}

.rlb-run__status--paused {
    background: #8a9ba8;
}

.rlb-run__title {
    grid-column: 2;
    grid-row: 1;
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    padding: 0;
    font-size: var(--rlb-surface-task-size, 15px);
    line-height: 1.25;
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

.rlb-run__actions {
    grid-column: 3;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    align-self: start;
    gap: 2px;
    flex: 0 0 auto;
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

.rlb-run__actions .rlb-run__resume {
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
.rlb-run__actions .rlb-run__resume:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.rlb-run--paused .rlb-run__meta,
.rlb-run__state {
    color: #5c7080;
    opacity: 0.75;
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
    z-index: 100;
    align-items: flex-start;
    justify-content: center;
    padding: 6vh 16px 16px;
    background: rgba(16, 22, 26, 0.7);
}

.rlb-root--open {
    display: flex;
}

.rlb-dialog {
    width: min(920px, 100%);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding-bottom: 0;
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

.rlb-body {
    padding: 16px 20px 20px;
    overflow-y: auto;
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

/* ---- Roam-native analytical dashboard shell ---- */

.rlb-root {
    --rlb-surface: #ffffff;
    --rlb-surface-subtle: #f5f8fa;
    --rlb-text: #182026;
    --rlb-muted: #5c7080;
    --rlb-border: rgba(16, 22, 26, 0.14);
    --rlb-border-light: rgba(16, 22, 26, 0.08);
    --rlb-accent: #2d72d2;
    --rlb-accent-soft: rgba(45, 114, 210, 0.12);
    --rlb-activity-zero: rgba(167, 182, 194, 0.22);
    --rlb-activity-1: #a7d9b8;
    --rlb-activity-2: #57ad79;
    --rlb-activity-3: #16834a;
    --rlb-overlay: rgba(16, 22, 26, 0.56);
    align-items: center;
    padding: 16px;
    background: var(--rlb-overlay);
    color: var(--rlb-text);
    font-family: inherit;
}

.bp3-dark .rlb-root {
    --rlb-surface: #293742;
    --rlb-surface-subtle: #202b33;
    --rlb-text: #f5f8fa;
    --rlb-muted: #a7b6c2;
    --rlb-border: rgba(255, 255, 255, 0.17);
    --rlb-border-light: rgba(255, 255, 255, 0.09);
    --rlb-accent: #48aff0;
    --rlb-accent-soft: rgba(72, 175, 240, 0.14);
    --rlb-activity-zero: rgba(167, 182, 194, 0.22);
    --rlb-activity-1: #4b9b69;
    --rlb-activity-2: #64c486;
    --rlb-activity-3: #8be0a7;
    --rlb-overlay: rgba(16, 22, 26, 0.74);
}

.rlb-dialog {
    width: min(960px, calc(100vw - 32px));
    height: min(860px, calc(100vh - 32px));
    max-height: none;
    overflow: hidden;
    border: 1px solid var(--rlb-border);
    border-radius: 4px;
    background: var(--rlb-surface);
    color: var(--rlb-text);
    box-shadow: 0 6px 24px rgba(16, 22, 26, 0.16);
}

.rlb-dashboard .rlb-header.bp3-dialog-header {
    flex: 0 0 auto;
    min-height: 58px;
    height: auto;
    overflow: visible;
    padding: 8px 14px 8px 16px;
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

.rlb-dashboard .rlb-header__subtitle {
    margin: 2px 0 0;
    color: var(--rlb-muted);
    font-size: 11px;
    line-height: 1.4;
    overflow: visible;
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
    padding: 12px 20px 10px;
    background: var(--rlb-surface);
}

.rlb-stats {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr) minmax(0, 0.8fr);
    align-items: start;
    gap: 24px;
    margin: 0;
}

.rlb-stat {
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
}

.rlb-stat__value {
    display: block;
    color: var(--rlb-text);
    font-size: 18px;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
}

.rlb-stat__label {
    display: block;
    margin-top: 2px;
    color: var(--rlb-muted);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
}

.rlb-activity-rail {
    display: grid;
    grid-template-columns: repeat(var(--rlb-activity-count, 7), minmax(0, 1fr));
    align-items: end;
    gap: 3px;
    height: 34px;
    min-width: 0;
    margin-top: 8px;
    overflow: hidden;
}

.rlb-activity__bucket {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: end;
    gap: 2px;
    width: 100%;
    min-width: 0;
    height: 34px;
    margin: 0 !important;
    padding: 0 !important;
    border: 0;
    border-radius: 2px;
    background: transparent;
    box-shadow: none;
    color: var(--rlb-muted);
}

.rlb-activity__bucket::before,
.rlb-activity__bucket > * {
    margin: 0 !important;
}

.rlb-activity__bucket::before {
    display: none !important;
    content: none !important;
}

.rlb-activity__bucket:focus-visible {
    outline: 2px solid var(--rlb-accent);
    outline-offset: 1px;
}

.rlb-activity__fill {
    display: block;
    width: min(14px, 100%);
    min-height: 0;
    justify-self: center;
    border-radius: 2px 2px 0 0;
    background: var(--rlb-activity-1, #a7d9b8);
}

.rlb-activity__bucket--level-2 .rlb-activity__fill {
    background: var(--rlb-activity-2, #57ad79);
}

.rlb-activity__bucket--level-3 .rlb-activity__fill {
    background: var(--rlb-activity-3, #16834a);
}

.rlb-activity__bucket--empty .rlb-activity__fill {
    width: min(12px, 80%);
    height: 2px !important;
    background: var(--rlb-activity-zero, rgba(167, 182, 194, 0.22));
}

.rlb-activity__label {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--rlb-muted);
    font-size: 8px;
    line-height: 1;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-body,
.rlb-body__scroll {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0 20px 18px;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.rlb-dashboard-section {
    margin: 0;
    padding: 12px 0 8px;
}

.rlb-dashboard-section + .rlb-dashboard-section {
    padding-top: 10px;
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
        padding: 0;
    }

    .rlb-dialog {
        width: 100vw;
        height: 100vh;
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
        padding: 12px;
        overflow: hidden;
    }

    .rlb-stats {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .rlb-stat--activity {
        order: 2;
    }

    .rlb-stat:last-child {
        order: 3;
    }

    .rlb-activity-rail,
    .rlb-activity__bucket {
        height: 30px;
    }

    .rlb-body,
    .rlb-body__scroll {
        padding: 0 12px 20px;
    }

    .rlb-dashboard-section {
        overflow-x: auto;
    }

    .rlb-table {
        min-width: 560px;
    }
}
`;

// src/session-surface.js
var sessionCount = (count) => `${count} Session${count === 1 ? "" : "s"}`;
var rowFigures = (entry, now) => {
  const target = targetMinutes(entry.clockUid);
  const elapsed = now.getTime() - entry.start.getTime();
  const total = entry.priorMinutes + Math.floor(elapsed / 6e4);
  return formatElapsed(elapsed) + (target ? ` \xB7 target ${formatElapsed(target * 6e4)}` : "") + ` \xB7 ${formatMinutesHuman(total)} total`;
};
var fullTaskLabel = (title) => `Open this block: ${title}`;
var renderTitle = (row, onOpenTask) => {
  const title = row.title || row.taskUid;
  const taskButton = button(
    "bp3-button bp3-minimal bp3-icon-document-open rlb-run__title",
    title,
    () => onOpenTask?.(row.taskUid),
    { title: fullTaskLabel(title) }
  );
  taskButton.setAttribute("aria-label", fullTaskLabel(title));
  return taskButton;
};
var renderRunningRow = (row, now, options) => {
  const entry = row.entry;
  const overrun = isOverrun(entry, now);
  const node = el("div", `rlb-run${overrun ? " rlb-run--overrun" : ""}`);
  node.dataset.sessionState = "running";
  node.dataset.clockUid = entry.clockUid;
  const status = el("span", "rlb-run__status rlb-run__status--running");
  status.setAttribute("aria-hidden", "true");
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  meta.dataset.clockUid = entry.clockUid;
  meta.appendChild(el("div", "rlb-run__meta-line rlb-run__meta-primary", rowFigures(entry, now)));
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
  meta.appendChild(startedNode);
  body.append(renderTitle(row, options.onOpenTask), meta);
  const actions = el("div", "rlb-run__actions");
  const checkout = button(
    "bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout",
    "",
    () => void options.onCheckOut?.(entry),
    { title: "Check Out" }
  );
  checkout.dataset.action = "clock-out";
  const discarding = options.discardingClockUid === entry.clockUid;
  const discardTitle = discarding ? "Confirm discard of this CLOCK entry" : "Discard this CLOCK entry (cannot be undone)";
  const discard = button(
    `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? " bp3-intent-danger" : ""}`,
    "",
    () => void options.onDiscard?.(entry),
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
  status.setAttribute("aria-label", "Paused Session");
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  const pausedAt = formatStarted(new Date(item.pausedAtMs), now);
  const pausedDetails = pausedAt.valid ? `Paused since ${pausedAt.raw}` : "Paused Session";
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
    () => void options.onResume?.(item),
    { title: "Resume" }
  );
  resume.dataset.action = "resume";
  actions.appendChild(resume);
  node.append(status, body, actions);
  return node;
};
function buildSessionSurfaceModel({ entries = [], pausedItems = [], now, staleHours: staleHours2 = 8 }) {
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
  return {
    now: currentNow,
    entries: entries.slice(),
    pausedItems: pausedItems.slice(),
    rows: [...runningRows, ...pausedRows],
    runningCount: entries.length,
    pausedCount: pausedItems.length,
    staleEntries: findStaleClocks(entries, currentNow, staleHours2)
  };
}
var surfaceTitle = (model) => model.runningCount > 0 ? `${sessionCount(model.runningCount)} Running` : model.pausedCount > 0 ? `${sessionCount(model.pausedCount)} Paused` : "Logbook";
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
  if (model.rows.length === 0) {
    root.appendChild(el("div", "rlb-popover__empty", options.emptyMessage || "No Session is running."));
  } else {
    if (model.staleEntries.length > 0) {
      root.appendChild(
        el(
          "div",
          "rlb-popover__empty bp3-text-small",
          `${sessionCount(model.staleEntries.length)} ${model.staleEntries.length > 1 ? "have" : "has"} been open for over ${options.staleHours || 8}h \u2014 likely forgotten.`
        )
      );
    }
    for (const row of model.rows) {
      root.appendChild(
        row.kind === "running" ? renderRunningRow(row, model.now, options) : renderPausedRow(row, model.now, options)
      );
    }
  }
  for (const notice4 of options.notices || []) {
    if (notice4)
      root.appendChild(el("div", "rlb-popover__notice bp3-text-small", notice4));
  }
  const footer = el("div", "rlb-popover__footer");
  footer.appendChild(
    button("bp3-button bp3-small", "Dashboard", () => options.onOpenDashboard?.(), {
      title: "Open Logbook Dashboard"
    })
  );
  if (model.runningCount > 0 || model.pausedCount > 0) {
    if (model.runningCount > 0) {
      footer.appendChild(
        button("bp3-button bp3-small", "Pause All", () => options.onPauseAll?.(), {
          title: "Pause all running Sessions"
        })
      );
    }
    if (model.pausedCount > 0) {
      footer.appendChild(
        button("bp3-button bp3-small", "Resume All", () => options.onResumeAll?.(), {
          title: "Resume paused Sessions with fresh CLOCK entries"
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
    footer.appendChild(
      button(
        "bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh",
        "",
        () => void options.onRefresh(),
        { title: "Refresh" }
      )
    );
    footer.lastElementChild.dataset.action = "refresh";
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
      row.classList.toggle("rlb-run--overrun", isOverrun(entry, currentNow));
  }
}

// src/topbar.js
var WIDGET_ID = "roam-logbook-topbar";
var POPOVER_ID = "roam-logbook-popover";
var POPOVER_TITLE_ID = "roam-logbook-popover-title";
var SIDEBAR_ID = "roam-logbook-current-sessions";
var SIDEBAR_TITLE_ID = "roam-logbook-current-sessions-title";
var TOPBAR_SELECTOR = ".rm-topbar";
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
  let sidebar = null;
  let sidebarHost = null;
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
  const layoutHosts = /* @__PURE__ */ new Set();
  const searchHosts = /* @__PURE__ */ new Set();
  const nowDate = () => {
    const value = nowFn();
    return value instanceof Date ? value : new Date(value);
  };
  const sessionCount2 = (count) => `${count} Session${count === 1 ? "" : "s"}`;
  const pomodoroLabel = (minutes) => Number.isInteger(minutes) ? `${minutes}m` : formatElapsed(minutes * 6e4);
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
    if (!sidebar)
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
    now: nowDate(),
    staleHours: staleHours()
  });
  const surfaceNotices = () => actionNotice ? [actionNotice] : [getNotice(), getNotice2()].filter(Boolean);
  const renderSurfaces = () => {
    if (popover)
      renderPopover();
    if (sidebar)
      renderSidebar();
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
  const surfaceOptions = (surface) => {
    const scope = "session-surface";
    return {
      titleId: surface === "sidebar" ? SIDEBAR_TITLE_ID : POPOVER_TITLE_ID,
      staleHours: staleHours(),
      notices: surfaceNotices(),
      clockOutAllConfirm: confirmation?.isArmed("clock-out-all", scope),
      onRefresh: () => run(() => refreshResult()),
      onOpenTask: (taskUid) => {
        closePopover({ restoreFocus: false });
        closeSidebar({ restoreFocus: false });
        void openBlock(taskUid);
      },
      onCheckOut: (entry) => run(() => clockOut(entry.clockUid)),
      onResume: (item) => void run(() => resumeOne(item.taskUid)),
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
        closeSidebar({ restoreFocus: false });
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
      onClose: surface === "sidebar" ? () => closeSidebar() : null,
      discardingClockUid: discardConfirmUid
    };
  };
  function renderPopover() {
    if (!popover)
      return;
    const model = sessionModel();
    const refreshStatus = getLastRefreshStatus();
    const options = surfaceOptions("popover");
    options.emptyMessage = refreshStatus.ok ? "No Session is running. Right-click a TODO bullet and choose Plugins \u2192 Logbook: Clock in." : "Session state could not be confirmed. Retry after Roam finishes syncing.";
    renderSessionSurface(popover, model, options);
  }
  function renderSidebar() {
    if (!sidebar)
      return;
    const model = sessionModel();
    const refreshStatus = getLastRefreshStatus();
    const options = surfaceOptions("sidebar");
    options.emptyMessage = refreshStatus.ok ? "No Session is running. Right-click a TODO bullet and choose Plugins \u2192 Logbook: Clock in." : "Session state could not be confirmed. Retry after Roam finishes syncing.";
    renderSessionSurface(sidebar, model, options);
  }
  const syncSurfaceAria = (targetId) => {
    buttonNode?.setAttribute("aria-expanded", targetId ? "true" : "false");
    buttonNode?.setAttribute("aria-controls", targetId || POPOVER_ID);
  };
  const closeSidebar = ({ restoreFocus = true } = {}) => {
    sidebar?.remove();
    sidebar = null;
    sidebarHost = null;
    if (!popover)
      syncSurfaceAria(null);
    if (restoreFocus && buttonNode?.isConnected)
      buttonNode.focus();
  };
  const findSidebarHost = () => document.querySelector(
    "#right-sidebar-content, #roam-right-sidebar-content, #right-sidebar .rm-right-sidebar__content, #right-sidebar, .rm-right-sidebar"
  ) || document.body;
  const requestRoamSidebarOpen = () => {
    try {
      window.roamAlphaAPI?.ui?.rightSidebar?.open?.();
    } catch (error) {
      console.debug("[roam-logbook] right sidebar open helper unavailable", error);
    }
  };
  const openSidebar = () => {
    if (sidebar?.isConnected) {
      sidebar.querySelector(".rlb-surface__close, button")?.focus();
      return;
    }
    closePopover({ restoreFocus: false });
    requestRoamSidebarOpen();
    sidebarHost = findSidebarHost();
    sidebar = el("section", "bp3-card rlb-sidebar");
    if (sidebarHost === document.body)
      sidebar.classList.add("rlb-sidebar--fallback");
    sidebar.id = SIDEBAR_ID;
    sidebar.setAttribute("role", "region");
    sidebar.setAttribute("aria-labelledby", SIDEBAR_TITLE_ID);
    sidebarHost.appendChild(sidebar);
    syncSurfaceAria(SIDEBAR_ID);
    refresh();
    renderSidebar();
    sidebar.querySelector("button")?.focus();
  };
  const togglePopover = (event) => {
    if (event?.shiftKey) {
      event.preventDefault();
      openSidebar();
      return;
    }
    closeSidebar({ restoreFocus: false });
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
  const renderButton = (entries = getRunning(), now = nowDate()) => {
    if (!buttonNode)
      return;
    const pausedItems = getPaused();
    const running2 = entries.length > 0;
    const overrun = entries.some((entry) => isOverrun(entry, now));
    const stale = findStaleClocks(entries, now, staleHours()).length > 0;
    if (!running2) {
      buttonNode.classList.add("rlb-topbar__button--icon-only");
      buttonNode.classList.remove("rlb-topbar__button--parallel");
      buttonNode.classList.toggle("rlb-topbar__button--paused", pausedItems.length > 0);
      iconNode.className = "bp3-icon bp3-icon-history rlb-topbar__icon";
      timeNode.textContent = "";
      timeNode.className = "rlb-topbar__time";
      parallelNode.textContent = "";
      separatorNode.textContent = "";
      syncButtonLayout(pausedItems.length > 0 ? "paused" : "idle");
      buttonNode.title = pausedItems.length ? `${sessionCount2(pausedItems.length)} Paused \u2014 click to resume or review.` : "Logbook \u2014 no Session running. Click for details.";
      buttonNode.setAttribute("aria-label", buttonNode.title);
      return;
    }
    buttonNode.classList.remove("rlb-topbar__button--icon-only");
    buttonNode.classList.remove("rlb-topbar__button--paused");
    const [first] = entries;
    const elapsed = now - first.start.getTime();
    const state = overrun ? "overrun" : stale ? "stale" : "neutral";
    timeNode.className = `rlb-topbar__time rlb-topbar__time--${state}`;
    timeNode.textContent = formatElapsed(elapsed);
    if (entries.length > 1) {
      buttonNode.classList.add("rlb-topbar__button--parallel");
      parallelNode.textContent = sessionCount2(entries.length);
      separatorNode.textContent = "";
      syncButtonLayout("parallel");
    } else {
      buttonNode.classList.remove("rlb-topbar__button--parallel");
      parallelNode.textContent = "";
      separatorNode.textContent = "";
      syncButtonLayout("single");
    }
    if (entries.length > 1) {
      buttonNode.title = `${sessionCount2(entries.length)} Running
Primary timer: ${first.title}
This session ${formatElapsed(elapsed)}` + (overrun ? "\nA Pomodoro is over its target." : "") + (!overrun && stale ? "\nA clock is likely forgotten." : "") + "\nClick for all clock details.";
    } else {
      const target = targetMinutes(first.clockUid);
      const totalMinutes2 = first.priorMinutes + Math.floor(elapsed / 6e4);
      buttonNode.title = `${sessionCount2(entries.length)} Running
Clocked in: ${first.title}
This session ${formatElapsed(elapsed)} \xB7 ${formatMinutesHuman(totalMinutes2)} on this task in total` + (target ? `
Pomodoro ${pomodoroLabel(target)} \u2014 ${overrun ? `over by ${formatElapsed(overrunMs(first, now))}` : `${formatElapsed(target * 6e4 - elapsed)} left`}` : "") + (!overrun && stale ? "\nThis clock is likely forgotten." : "");
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
    updateSessionSurfaceElapsed(sidebar, entries, now);
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
      observeRecoveryTarget(null);
      remove();
      return;
    }
    const topbar = document.querySelector(TOPBAR_SELECTOR);
    observeRecoveryTarget(topbar);
    if (!topbar)
      return;
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
  const isPluginNode = (node) => Boolean(
    node && (node === container || node === popover || container?.contains(node) || popover?.contains(node))
  );
  const hasNonPluginMutation = (record) => {
    if (isPluginNode(record.target))
      return false;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.length === 0 || nodes.some((node) => !isPluginNode(node));
  };
  const touchesTopbar = (record) => {
    if (isPluginNode(record.target))
      return false;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    if (nodes.length > 0 && nodes.every(isPluginNode))
      return false;
    if (record.target?.closest?.(TOPBAR_SELECTOR))
      return true;
    return nodes.some(
      (node) => node?.matches?.(TOPBAR_SELECTOR) || node?.querySelector?.(TOPBAR_SELECTOR)
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
    closeSidebar({ restoreFocus: false });
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
      unsubscribe = subscribe(() => {
        renderButton();
        renderSurfaces();
      });
      unsubscribePaused = subscribe2(() => {
        renderButton();
        renderSurfaces();
      });
      ticker = setIntervalFn(tick, 1e3);
      attach2();
    },
    refresh: attach2,
    getPerformanceSnapshot() {
      return { attachCount, tickCount };
    },
    unmount() {
      destroyed = true;
      unsubscribe?.();
      unsubscribe = null;
      unsubscribePaused?.();
      unsubscribePaused = null;
      if (ticker)
        clearIntervalFn(ticker);
      ticker = null;
      observer?.disconnect();
      observer = null;
      hostObserver?.disconnect();
      hostObserver = null;
      recoveryObserver?.disconnect();
      recoveryObserver = null;
      outerRecoveryObserver?.disconnect();
      outerRecoveryObserver = null;
      recoveryTarget = null;
      outerRecoveryTarget = null;
      observedTopbar = null;
      attachQueued = false;
      if (attachTimer)
        clearTimeout(attachTimer);
      attachTimer = null;
      remove();
      container = null;
    }
  };
}

// src/extension.js
var CONTEXT_CLOCK_IN = "Logbook: Clock in";
var CONTEXT_CLOCK_OUT = "Logbook: Clock out";
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
  const targetString = (context) => {
    const uid = resolveTaskUid(context?.["block-uid"]);
    return getBlockString(uid) ?? context?.["block-string"] ?? "";
  };
  const canClockIn = (context) => {
    const uid = context?.["block-uid"];
    if (!uid || isBlockRunning(uid))
      return false;
    return todoBlocksOnly() ? isTaskBlock(targetString(context)) : true;
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
        mutationResultNotice(error) || error?.message || "Logbook could not complete that action."
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
      tabTitle: "Logbook",
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
          description: "Every new Session receives this target. Passing it turns elapsed time red; the clock keeps running.",
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
      topbar.mount();
      refresh();
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      confirmation.reset();
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
