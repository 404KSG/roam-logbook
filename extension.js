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
var DST_PROBE_MONTHS = [0, 3, 6, 9];
var localOffsetAt = (year, month) => {
  const probe = /* @__PURE__ */ new Date(0);
  probe.setFullYear(year, month, 1);
  probe.setHours(12, 0, 0, 0);
  return probe.getTimezoneOffset();
};
var localDaylightShiftSeconds = (year) => {
  const offsets = DST_PROBE_MONTHS.map((month) => localOffsetAt(year, month));
  const standardOffset = Math.max(...offsets);
  const daylightOffset = Math.min(...offsets);
  return {
    daylightOffset,
    seconds: Math.max(0, standardOffset - daylightOffset) * 60
  };
};
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
  const rolledOver = date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day;
  if (rolledOver)
    return null;
  const requestedTime = hour * 3600 + minute * 60 + second;
  const actualTime = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  if (actualTime !== requestedTime) {
    const { daylightOffset, seconds: daylightShiftSeconds } = localDaylightShiftSeconds(year);
    const shiftedByDaylightSaving = daylightShiftSeconds > 0 && date.getTimezoneOffset() === daylightOffset && actualTime - requestedTime === daylightShiftSeconds;
    if (!shiftedByDaylightSaving)
      return null;
  }
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
var CLOCK_LABEL = "CLOCK:";
var DRAWER_RE = /^\s*:?LOGBOOK:{1,2}\s*$/i;
var CLOCK_RE = /^\s*:?CLOCK:{1,2}\s*\[([^\]]+)\](?:\s*--\s*\[([^\]]+)\])?(?:\s*=>\s*(\S*))?\s*$/i;
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
  const hasDeclaredDuration = match[3] !== void 0;
  const declaredMinutes = hasDeclaredDuration ? parseDurationMinutes(match[3]) : null;
  const computedMinutes = end ? durationMinutes(start.getTime(), end.getTime()) : null;
  const effectiveMinutes = end ? computedMinutes : null;
  const issue = hasDeclaredDuration && declaredMinutes === null ? {
    code: "invalid-declared-duration",
    raw: match[3],
    message: `Declared duration is invalid: ${match[3]}`
  } : end && declaredMinutes !== null && declaredMinutes !== computedMinutes ? {
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
function normalizeSequence(value) {
  if (Array.isArray(value))
    return value;
  if (value === null || value === void 0 || typeof value === "string")
    return null;
  if (typeof value !== "object" && typeof value !== "function")
    return null;
  try {
    if (typeof value[Symbol.iterator] === "function")
      return [...value];
  } catch {
  }
  if (Number.isInteger(value.length) && value.length >= 0) {
    try {
      return Array.from(value);
    } catch {
    }
  }
  const keys = Object.keys(value);
  if (keys.length === 0)
    return null;
  if (keys.every((key) => /^\d+$/.test(key))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map((key) => value[key]);
  }
  return null;
}
function normalizeQueryRows(value) {
  const rows = normalizeSequence(value);
  if (!rows) {
    throw new GraphReadError("Graph query returned a non-array result", {
      cause: new TypeError("query rows must be an array of rows")
    });
  }
  return rows.map((row) => {
    const tuple = normalizeSequence(row);
    if (!tuple) {
      throw new GraphReadError("Graph query returned a non-array row", {
        cause: new TypeError("query rows must contain array-like rows")
      });
    }
    return tuple;
  });
}
function queryResult(datalog, ...args) {
  const fastRun = resolve("fast", "q");
  const queryRun = resolve(null, "q");
  const runs = [];
  if (fastRun)
    runs.push(fastRun);
  if (queryRun && queryRun !== fastRun)
    runs.push(queryRun);
  if (runs.length === 0) {
    return {
      ok: false,
      rows: null,
      error: new GraphReadError("roamAlphaAPI q unavailable")
    };
  }
  let lastError = null;
  for (const run of runs) {
    try {
      return { ok: true, rows: normalizeQueryRows(run(datalog, ...args)), error: null };
    } catch (error) {
      lastError = error instanceof GraphReadError ? error : new GraphReadError(error?.message || "Graph query failed", { cause: error });
    }
  }
  return { ok: false, rows: null, error: lastError };
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
var blockLookupRef = (uid) => [":block/uid", uid];
function pullAttribute(entity, attribute) {
  if (entity === null || entity === void 0 || typeof entity !== "object")
    return void 0;
  if (entity[attribute] !== void 0)
    return entity[attribute];
  return entity[attribute.replace(/^:/, "")];
}
function pulledString(entity, label) {
  if (entity === null || entity === void 0)
    return null;
  if (typeof entity !== "object" || Array.isArray(entity)) {
    throw new GraphReadError(`Graph pull returned malformed ${label}`);
  }
  const value = pullAttribute(entity, ":block/string");
  if (value === void 0 || value === null)
    return null;
  if (typeof value !== "string") {
    throw new GraphReadError(`Graph pull returned malformed ${label}`);
  }
  return value;
}
function normalizePullEntities(value) {
  const entities = normalizeSequence(value);
  if (!entities) {
    throw new GraphReadError("Graph pull_many returned a non-array result", {
      cause: new TypeError("pull_many results must be an array of entities")
    });
  }
  for (const entity of entities) {
    if (entity !== null && (typeof entity !== "object" || Array.isArray(entity))) {
      throw new GraphReadError("Graph pull_many returned a malformed entity");
    }
  }
  return entities;
}
function pullMany(pattern, eids) {
  const run = resolve(null, "pull_many");
  if (!run)
    throw new GraphReadError("roamAlphaAPI pull_many unavailable");
  try {
    return normalizePullEntities(run(pattern, eids));
  } catch (error) {
    if (error instanceof GraphReadError)
      throw error;
    throw new GraphReadError(error?.message || "Graph pull_many failed", { cause: error });
  }
}
var readBlockStringFromQuery = (uid) => validateQueryRows(
  queryOrThrow(
    "[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]",
    uid
  ),
  "block string",
  (row) => row.length >= 1 && typeof row[0] === "string"
)[0]?.[0] ?? null;
function getBlockString(uid) {
  if (!uid)
    return null;
  const pull = resolve(null, "pull");
  if (pull) {
    try {
      return pulledString(pull("[:block/string]", blockLookupRef(uid)), "block string");
    } catch {
    }
  }
  try {
    return readBlockStringFromQuery(uid);
  } catch (error) {
    throw withGraphReadIssue(error, { source: "block-string", affectedUid: uid });
  }
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
var CHILDREN_PULL_PATTERN = "[{:block/children [:block/uid :block/string :block/order]}]";
function readChildrenFromPull(pull, uid) {
  const entity = pull(CHILDREN_PULL_PATTERN, blockLookupRef(uid));
  if (entity === null || entity === void 0)
    return [];
  if (typeof entity !== "object" || Array.isArray(entity)) {
    throw new GraphReadError("Graph pull returned malformed children");
  }
  const children = pullAttribute(entity, ":block/children");
  if (children === null || children === void 0)
    return [];
  const childEntities = normalizeSequence(children);
  if (!childEntities) {
    throw new GraphReadError("Graph pull returned malformed children");
  }
  return childEntities.map((child) => {
    if (child === null || typeof child !== "object" || Array.isArray(child)) {
      throw new GraphReadError("Graph pull returned malformed child");
    }
    const childUid = pullAttribute(child, ":block/uid");
    const string = pullAttribute(child, ":block/string");
    const order = pullAttribute(child, ":block/order");
    if (typeof childUid !== "string" || typeof string !== "string" || !Number.isFinite(order)) {
      throw new GraphReadError("Graph pull returned malformed child");
    }
    return { uid: childUid, string, order };
  }).sort((a, b) => a.order - b.order);
}
function readChildrenFromQuery(uid) {
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
function getChildren(uid) {
  if (!uid)
    return [];
  const pull = resolve(null, "pull");
  if (pull) {
    try {
      return readChildrenFromPull(pull, uid);
    } catch {
    }
  }
  try {
    return readChildrenFromQuery(uid);
  } catch (error) {
    throw withGraphReadIssue(error, { source: "children", affectedUid: uid });
  }
}
async function createBlock({ parentUid, order, string, uid, open }) {
  const create = resolve("block", "create", "createBlock");
  if (!create)
    throw new Error("roamAlphaAPI block.create unavailable");
  const blockUid = uid || generateUid();
  const block = { string, uid: blockUid };
  if (open !== void 0)
    block.open = open;
  await create({
    location: { "parent-uid": parentUid, order },
    block
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
var sidebarOperationQueues = /* @__PURE__ */ new WeakMap();
var blockSidebarWindow = (uid, order) => {
  const sidebarWindow = { type: "block", "block-uid": uid };
  if (Number.isFinite(order))
    sidebarWindow.order = order;
  return sidebarWindow;
};
var sidebarFailure = (reason, message, error) => ({
  ok: false,
  reason,
  message,
  ...error ? { error } : {}
});
var runSidebarOperation = (sidebar, operation) => {
  const previous = sidebarOperationQueues.get(sidebar) || Promise.resolve();
  const current = previous.catch(() => void 0).then(operation);
  sidebarOperationQueues.set(sidebar, current);
  return current.finally(() => {
    if (sidebarOperationQueues.get(sidebar) === current) {
      sidebarOperationQueues.delete(sidebar);
    }
  });
};
var revealExistingBlockWindow = async (sidebar, uid, { isCurrent = () => true, requireOrder = false, unavailableMessage } = {}) => {
  let reordered = false;
  if (typeof sidebar.setWindowOrder === "function") {
    await sidebar.setWindowOrder({ window: blockSidebarWindow(uid, 0) });
    if (!isCurrent())
      return { ok: false, skipped: true, reason: "superseded" };
    reordered = true;
  } else if (requireOrder) {
    return sidebarFailure(
      "order-unavailable",
      unavailableMessage || "Roam could not move the sidebar block window to the top."
    );
  }
  if (typeof sidebar.expandWindow === "function") {
    await sidebar.expandWindow({ window: blockSidebarWindow(uid) });
    if (!isCurrent())
      return { ok: false, skipped: true, reason: "superseded" };
  }
  return { ok: true, reordered };
};
async function frontBlockInRightSidebar(uid, { isCurrent = () => true } = {}) {
  if (typeof uid !== "string" || uid.length === 0) {
    return sidebarFailure("missing-uid", "This Timing Line has no block UID.");
  }
  const sidebar = getApi()?.ui?.rightSidebar;
  if (typeof sidebar?.addWindow !== "function") {
    return sidebarFailure(
      "unavailable",
      "Roam right-sidebar block windows are unavailable."
    );
  }
  try {
    return await runSidebarOperation(sidebar, async () => {
      await sidebar.open?.();
      if (!isCurrent())
        return { ok: false, skipped: true, reason: "superseded" };
      if (typeof sidebar.getWindows === "function") {
        const windows = await sidebar.getWindows();
        if (!isCurrent())
          return { ok: false, skipped: true, reason: "superseded" };
        const existing = Array.isArray(windows) ? windows.find(
          (sidebarWindow) => sidebarWindow?.type === "block" && sidebarWindow?.["block-uid"] === uid
        ) : null;
        if (existing) {
          const visibility = await revealExistingBlockWindow(sidebar, uid, {
            isCurrent,
            requireOrder: true,
            unavailableMessage: "Roam could not move the Timing Line sidebar window to the top."
          });
          if (visibility.ok === false)
            return visibility;
          return { ok: true, deduped: true, reordered: visibility.reordered };
        }
        if (!isCurrent())
          return { ok: false, skipped: true, reason: "superseded" };
        await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
        return { ok: true, added: true };
      }
      let requested = requestedSidebarBlocks.get(sidebar);
      if (!requested) {
        requested = /* @__PURE__ */ new Set();
        requestedSidebarBlocks.set(sidebar, requested);
      }
      if (requested.has(uid))
        return { ok: true, deduped: true };
      if (!isCurrent())
        return { ok: false, skipped: true, reason: "superseded" };
      try {
        await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
        requested.add(uid);
      } catch (error) {
        requested.delete(uid);
        throw error;
      }
      return { ok: true, added: true };
    });
  } catch (error) {
    console.debug("[roam-logbook] could not front Timing Line in right sidebar", uid, error);
    return sidebarFailure(
      "sidebar-front-failed",
      error?.message || "Roam could not move the Timing Line to the top of the right sidebar.",
      error
    );
  }
}
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
    return await runSidebarOperation(sidebar, async () => {
      await sidebar.open?.();
      if (typeof sidebar.getWindows === "function") {
        const windows = await sidebar.getWindows();
        const existing = Array.isArray(windows) ? windows.some(
          (window2) => window2?.type === "block" && window2?.["block-uid"] === uid
        ) : false;
        if (existing) {
          const visibility = await revealExistingBlockWindow(sidebar, uid);
          if (visibility.ok === false)
            return visibility;
          return {
            ok: true,
            deduped: true,
            ...visibility.reordered ? { reordered: true } : {}
          };
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
    });
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
var DRAWER_SHAPES = [
  { prefix: "", suffix: "::" },
  { prefix: "", suffix: ":" },
  { prefix: ":", suffix: ":" },
  { prefix: ":", suffix: "::" }
];
var DRAWER_PADDING = ["", " ", "  ", "	"];
var LOGBOOK_CASE_VARIANTS = ["LOGBOOK", "logbook", "Logbook", "LogBook"];
var DRAWER_QUERY_STRINGS = Object.freeze(
  DRAWER_SHAPES.flatMap(
    ({ prefix, suffix }) => LOGBOOK_CASE_VARIANTS.flatMap(
      (word) => DRAWER_PADDING.flatMap(
        (leading) => DRAWER_PADDING.map((trailing) => `${leading}${prefix}${word}${suffix}${trailing}`)
      )
    )
  )
);
var ENTRIES_QUERY = `[:find ?clock-uid ?clock-string ?drawer-string ?task-uid ?task-string ?page-title
  :in $ [?drawer-string ...]
  :where
  [?d :block/string ?drawer-string]
  [?d :block/children ?c]
  [?c :block/uid ?clock-uid]
  [?c :block/string ?clock-string]
  [?t :block/children ?d]
  [?t :block/uid ?task-uid]
  [(get-else $ ?t :block/string "") ?task-string]
  [(get-else $ ?t :block/page "") ?p]
  [(get-else $ ?p :node/title "") ?page-title]]`;
function queryEntryRows() {
  return queryOrThrow(ENTRIES_QUERY, DRAWER_QUERY_STRINGS);
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
var BLOCK_STRINGS_PULL_PATTERN = "[:block/uid :block/string]";
var readBlockStringsFromPull = (uids) => {
  const entities = pullMany(
    BLOCK_STRINGS_PULL_PATTERN,
    uids.map((uid) => [":block/uid", uid])
  );
  const result = {};
  for (const entity of entities) {
    if (entity === null || entity === void 0)
      continue;
    const uid = pullAttribute(entity, ":block/uid");
    const string = pullAttribute(entity, ":block/string");
    if (string === void 0 || string === null)
      continue;
    if (typeof uid !== "string" || typeof string !== "string") {
      throw new Error("Graph pull_many returned malformed block string data");
    }
    result[uid] = string;
  }
  return result;
};
var readBlockStringsFromQuery = (uids) => {
  const rows = validateQueryRows(
    queryOrThrow(BLOCK_STRINGS_QUERY, uids),
    "block string batch",
    (row) => row.length >= 2 && typeof row[0] === "string" && typeof row[1] === "string"
  );
  const result = {};
  for (const [uid, string] of rows)
    result[uid] = string;
  return result;
};
var readBlockStrings = (uids) => {
  if (uids.length === 0)
    return {};
  try {
    return readBlockStringsFromPull(uids);
  } catch {
    try {
      return readBlockStringsFromQuery(uids);
    } catch (error) {
      throw withGraphReadIssue(error, { source: "block-string", affectedUids: uids });
    }
  }
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
        queryOrThrow(PARENTS_QUERY, frontier),
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

// src/active-work.js
var ACTIVE_WORK_WINDOW_MINUTES = 45;
var ACTIVE_WORK_WINDOW_MS = ACTIVE_WORK_WINDOW_MINUTES * 6e4;
var instantOf = (value) => {
  if (value instanceof Date)
    return value.getTime();
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};
var normalizeWindowMinutes = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : ACTIVE_WORK_WINDOW_MINUTES;
function openLineMinutesLeft(entry, now = Date.now(), windowMinutes = ACTIVE_WORK_WINDOW_MINUTES) {
  const endedAt = instantOf(entry?.end);
  const nowMs = instantOf(now) ?? Date.now();
  if (endedAt === null)
    return 0;
  const remainingMs = normalizeWindowMinutes(windowMinutes) * 6e4 - (nowMs - endedAt);
  if (remainingMs <= 0)
    return 0;
  return Math.max(1, Math.ceil(remainingMs / 6e4));
}
var compareNewest = (left, right) => (instantOf(right?.start) ?? -Infinity) - (instantOf(left?.start) ?? -Infinity);
function chooseFocusedEntry(entries = []) {
  return entries.filter((entry) => entry?.running && instantOf(entry.start) !== null).sort(compareNewest)[0] || null;
}
function buildActiveWork(entries = [], {
  now = Date.now(),
  windowMinutes = ACTIVE_WORK_WINDOW_MINUTES
} = {}) {
  const snapshot = Array.isArray(entries) ? entries : [];
  const nowMs = instantOf(now) ?? Date.now();
  const normalizedWindow = normalizeWindowMinutes(windowMinutes);
  const windowMs = normalizedWindow * 6e4;
  const focusedEntry = chooseFocusedEntry(snapshot);
  const completedMinutesByTask = /* @__PURE__ */ new Map();
  for (const entry of snapshot) {
    if (!entry || entry.running || !entry.taskUid)
      continue;
    completedMinutesByTask.set(
      entry.taskUid,
      (completedMinutesByTask.get(entry.taskUid) || 0) + (Number(entry.minutes) || 0)
    );
  }
  const recentByTask = /* @__PURE__ */ new Map();
  for (const candidate of snapshot) {
    if (!candidate || candidate.running || candidate.taskUid === focusedEntry?.taskUid)
      continue;
    const endedAt = instantOf(candidate.end);
    if (endedAt === null)
      continue;
    const age = nowMs - endedAt;
    if (age < 0 || age >= windowMs)
      continue;
    const previous = recentByTask.get(candidate.taskUid);
    if (!previous || endedAt > instantOf(previous.end))
      recentByTask.set(candidate.taskUid, candidate);
  }
  const recent = [...recentByTask.values()].sort(
    (left, right) => (instantOf(right.end) ?? -Infinity) - (instantOf(left.end) ?? -Infinity)
  );
  const focused = focusedEntry ? {
    ...focusedEntry,
    priorMinutes: completedMinutesByTask.get(focusedEntry.taskUid) || 0,
    activeKind: "focused"
  } : null;
  const recentItems = recent.map((item) => ({
    ...item,
    priorMinutes: completedMinutesByTask.get(item.taskUid) || 0,
    remainingMinutes: openLineMinutesLeft(item, nowMs, normalizedWindow),
    activeKind: "recent"
  }));
  const allItems = [focused, ...recentItems].filter(Boolean);
  const uniqueItems = [...new Map(allItems.map((item) => [item.taskUid, item])).values()];
  return {
    focused,
    recent: recentItems,
    items: uniqueItems,
    count: uniqueItems.length,
    windowMinutes: normalizedWindow
  };
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

// src/clock.js
var running = [];
var entriesSnapshot = [];
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
function getEntriesSnapshot() {
  return entriesSnapshot.slice();
}
function getActiveWork(now = /* @__PURE__ */ new Date()) {
  return buildActiveWork(entriesSnapshot, { now });
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
var uncertainCloseResult = (error, entries = running, clockUids = null, { preflight = false } = {}) => {
  const scope = clockUids === null ? null : new Set(clockUids);
  const pendingClockUids = entries.filter((entry) => entry.running && (scope === null || scope.has(entry.clockUid))).map((entry) => entry.clockUid);
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
  entriesSnapshot = all;
  const focused = chooseFocusedEntry(entriesSnapshot);
  running = focused ? [{ ...focused }] : [];
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
  entriesSnapshot = [];
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
  const uid = await createBlock({ parentUid: taskUid, order: 0, string: DRAWER_LABEL, open: false });
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
function postWriteConfirmationError(clockUid, action) {
  return new GraphReadError(`${action} for CLOCK ${clockUid} was not confirmed after graph refresh.`, {
    issue: {
      kind: "post-write-confirmation",
      source: action,
      affectedUids: [clockUid]
    }
  });
}
async function closeEntriesNow(entries, clockUids, now, { publish = true } = {}) {
  const byUid = new Map(entries.filter((entry) => entry.running).map((entry) => [entry.clockUid, entry]));
  const ids = clockUids === null ? [...byUid.keys()] : [...new Set(clockUids)];
  const resultByUid = /* @__PURE__ */ new Map();
  const writtenClockUids = [];
  let uncertain = null;
  for (const clockUid of ids) {
    const entry = byUid.get(clockUid);
    if (!entry) {
      resultByUid.set(clockUid, { clockUid, closed: false, reason: "not-running" });
      continue;
    }
    try {
      const closed2 = await closeEntry(entry, now);
      if (!closed2) {
        resultByUid.set(clockUid, { clockUid, closed: false, reason: "not-running" });
        continue;
      }
      writtenClockUids.push(clockUid);
    } catch (error) {
      resultByUid.set(clockUid, { clockUid, closed: false, error });
    }
  }
  if (writtenClockUids.length > 0) {
    const confirmation = refreshResult({ notify: false });
    if (!confirmation.ok) {
      uncertain = confirmation;
      for (const clockUid of writtenClockUids) {
        resultByUid.set(clockUid, { clockUid, closed: false, uncertain: true });
      }
    } else {
      const confirmedClosedClockUids = new Set(
        entriesSnapshot.filter((item) => item.running === false).map((item) => item.clockUid)
      );
      for (const clockUid of writtenClockUids) {
        if (confirmedClosedClockUids.has(clockUid)) {
          resultByUid.set(clockUid, { clockUid, closed: true });
          continue;
        }
        const error = postWriteConfirmationError(clockUid, "Clock Out");
        resultByUid.set(clockUid, { clockUid, closed: false, uncertain: true });
        uncertain = { ok: false, uncertain: true, error, notice: GRAPH_UNCERTAIN };
      }
    }
  }
  const results = ids.map(
    (clockUid) => resultByUid.get(clockUid) || { clockUid, closed: false, uncertain: true }
  );
  const retryClockUids = results.filter((result) => !result || Boolean(result.error) || result.uncertain === true).map((result) => result.clockUid);
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
      const taskString = getBlockString(taskUid);
      if (!isTaskBlock(taskString) || taskStatus(taskString) !== "TODO") {
        const error = new Error("Clock In is only available on unfinished TODO blocks.");
        error.code = "todo-only";
        error.taskUid = taskUid;
        throw error;
      }
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
      if (open.length === 1 && open[0].taskUid === taskUid) {
        refresh({ entries, notify: false });
        const result2 = { clockUid: open[0].clockUid, taskUid, alreadyFocused: true };
        publishAction({
          type: "clock-in",
          source,
          clockUid: open[0].clockUid,
          taskUid,
          alreadyFocused: true,
          newCycle: false,
          cycleStartedAt: null
        });
        return result2;
      }
      let closedClockUids = [];
      if (open.length > 0) {
        const outcome = await closeEntriesNow(entries, open.map((entry) => entry.clockUid), now, {
          publish: false
        });
        closedClockUids = outcome.results.filter((result2) => result2.closed).map((result2) => result2.clockUid);
        if (outcome.uncertain) {
          return {
            taskUid,
            uncertain: true,
            partial: true,
            notice: GRAPH_UNCERTAIN,
            retry: outcome.retry
          };
        }
        if (outcome.failed > 0)
          throw outcome.results.find((result2) => result2.error).error;
      }
      let drawer;
      let clockUid;
      const retry = (details) => ({
        action: "clock-in",
        taskUid,
        ...open.length > 0 ? { closedClockUids } : {},
        ...details
      });
      try {
        drawer = await ensureDrawer(taskUid);
        if (drawer.confirmation && !drawer.confirmation.ok) {
          return {
            taskUid,
            drawerUid: drawer.uid,
            uncertain: true,
            partial: true,
            notice: GRAPH_UNCERTAIN,
            retry: retry({ drawerUid: drawer.uid })
          };
        }
        clockUid = await createBlock({
          parentUid: drawer.uid,
          // Roam shifts existing siblings when a child is created at 0,
          // keeping the newest Session at the top of the drawer.
          order: 0,
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
            retry: retry({ drawerUid: drawer.uid, clockUid })
          };
        }
        const confirmed = entriesSnapshot.find(
          (item) => item.clockUid === clockUid && item.running === true
        );
        if (!confirmed) {
          return {
            clockUid,
            taskUid,
            uncertain: true,
            partial: true,
            notice: GRAPH_UNCERTAIN,
            retry: retry({ drawerUid: drawer.uid, clockUid })
          };
        }
      } catch (error) {
        if (open.length === 0)
          throw error;
        return {
          ...clockUid ? { clockUid } : {},
          taskUid,
          ...drawer?.uid ? { drawerUid: drawer.uid } : {},
          uncertain: true,
          partial: true,
          notice: GRAPH_UNCERTAIN,
          retry: retry({
            ...drawer?.uid ? { drawerUid: drawer.uid } : {},
            ...clockUid ? { clockUid } : {}
          })
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
async function reconcileOpenClocks({
  now = /* @__PURE__ */ new Date(),
  source = "legacy-reconcile",
  entries: suppliedEntries
} = {}) {
  return enqueueMutation(
    () => withGraphGuard(async () => {
      if (suppliedEntries !== void 0 && !Array.isArray(suppliedEntries)) {
        throw new GraphReadError("Clock reconciliation received an invalid entries snapshot");
      }
      const entries = suppliedEntries ?? readAllEntries();
      const open = entries.filter((entry) => entry.running);
      if (open.length <= 1) {
        refresh({ entries, notify: false });
        return {
          action: "reconcile-overlapping-clocks",
          ok: true,
          focused: open[0]?.clockUid || null,
          closed: 0,
          pending: 0,
          entries
        };
      }
      const focused = chooseFocusedEntry(open) || open[0];
      const closeAt = focused?.start instanceof Date ? focused.start : now;
      const outcome = await closeEntriesNow(
        entries,
        open.filter((entry) => entry.clockUid !== focused.clockUid).map((entry) => entry.clockUid),
        closeAt,
        { publish: false }
      );
      if (!outcome.uncertain) {
        for (const closed of outcome.results.filter((item) => item.closed)) {
          const entry = open.find((item) => item.clockUid === closed.clockUid);
          publishAction({
            type: "clock-out",
            source,
            clockUid: closed.clockUid,
            taskUid: entry?.taskUid
          });
        }
      }
      notify({ reason: "reconcile-overlap", explicit: true });
      return {
        ...outcome,
        action: "reconcile-overlapping-clocks",
        focused: focused.clockUid,
        entries
      };
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
        const outcome = await closeEntriesNow(entries, clockUids, now, { publish: false });
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
      return uncertainCloseResult(error, readCompleted ? entries : running, clockUids, {
        preflight: prepareStarted
      });
    }
  });
}
async function clockOutAll({ now = /* @__PURE__ */ new Date(), source = "user" } = {}) {
  const outcome = await clockOutEntries(null, { now, source });
  if (outcome.uncertain) {
    notice = GRAPH_UNCERTAIN;
  } else if (outcome.failed > 0) {
    notice = `${outcome.failed} Session${outcome.failed === 1 ? "" : "s"} could not be closed.`;
  }
  return {
    ...outcome,
    action: "clock-out-all",
    item: "Session",
    completedVerb: "ended",
    count: outcome.closed,
    completed: outcome.closed
  };
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
  retryClockUids = null
} = {}) {
  return enqueueMutation(async () => {
    try {
      return await withGraphGuard(async () => {
        const entries = readAllEntries();
        const runningEntries = entries.filter((entry) => entry.running);
        const taskUids = [...new Set([taskUid, ...runningEntries.map((entry) => entry.taskUid)].filter(Boolean))];
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
        const affectedTaskUids = [taskUid, ...targetEntries.map((entry) => entry.taskUid)];
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
      if (!entry)
        return { deleted: false, reason: "not-found" };
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
      let drawer;
      try {
        drawer = getChildren(entry.taskUid).find((child) => isDrawerBlock(child.string));
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
      } catch {
        return {
          deleted: true,
          uncertain: true,
          partial: true,
          notice: GRAPH_UNCERTAIN,
          retry: {
            action: "discard-drawer",
            taskUid: entry.taskUid,
            clockUid,
            ...drawer?.uid ? { drawerUid: drawer.uid } : {}
          }
        };
      }
      notify();
      return true;
    })
  );
}
function isBlockRunning(blockUid) {
  try {
    const taskUid = resolveTaskUid(blockUid);
    return running.some((entry) => entry.taskUid === taskUid);
  } catch {
    return true;
  }
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
  const reset3 = () => {
    if (timer !== null)
      clearTimeoutFn(timer);
    timer = null;
    active = null;
    onChange();
  };
  const arm = (key, source = "default") => {
    if (active?.key === key && active.source === source) {
      reset3();
      return true;
    }
    reset3();
    active = { key, source };
    timer = setTimeoutFn(() => reset3(), timeoutMs);
    onChange();
    return false;
  };
  const isArmed = (key, source = null) => active?.key === key && (source === null || active.source === source);
  const setOnChange = (listener) => {
    onChange = typeof listener === "function" ? listener : () => {
    };
  };
  return { arm, isArmed, reset: reset3, setOnChange };
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
        taskString: entry.taskString ?? null,
        title: entry.title,
        status: entry.status ?? null,
        pageTitle: entry.pageTitle,
        minutes: 0,
        sessions: 0,
        running: false,
        lastActivity: entry.start
      };
      byTask.set(entry.taskUid, row);
    } else if (!row.taskString && entry.taskString) {
      row.taskString = entry.taskString;
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
var MAX_TASK_FOREST_NODES = 5e3;
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
  for (let pendingIndex = 0; pendingIndex < pending.length; pendingIndex += 1) {
    const uid = pending[pendingIndex];
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
          taskString: hierarchy.stringOf[parentUid] ?? null,
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
  let expandedNodes = 0;
  const expand = (uid, path) => {
    const node = nodes.get(uid);
    const base = {
      taskUid: node.taskUid,
      taskString: node.taskString ?? null,
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
    if (expandedNodes >= MAX_TASK_FOREST_NODES) {
      return { ...base, total: node.own, children: [], truncated: true };
    }
    expandedNodes += 1;
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
var TASK_FILTERS = Object.freeze(["ALL", "TODO", "DONE"]);
var TASK_SORT_FIELDS = Object.freeze(["sessions", "own", "total"]);
var TASK_SORT_DIRECTIONS = Object.freeze(["asc", "desc"]);
var TASK_FILTER_SET = new Set(TASK_FILTERS);
var TASK_SORT_FIELD_SET = new Set(TASK_SORT_FIELDS);
var TASK_SORT_DIRECTION_SET = new Set(TASK_SORT_DIRECTIONS);
function normaliseTaskFilter(filter) {
  const value = String(filter ?? "ALL").toUpperCase();
  if (!TASK_FILTER_SET.has(value)) {
    throw new RangeError(`Unknown task filter: ${filter}`);
  }
  return value;
}
function normaliseSortBy(sortBy) {
  const value = sortBy ?? "total";
  if (!TASK_SORT_FIELD_SET.has(value)) {
    throw new RangeError(`Unknown task sort field: ${sortBy}`);
  }
  return value;
}
function normaliseDirection(direction) {
  const value = direction ?? "desc";
  if (!TASK_SORT_DIRECTION_SET.has(value)) {
    throw new RangeError(`Unknown task sort direction: ${direction}`);
  }
  return value;
}
function taskIdentity(node) {
  return node?.taskUid ? `uid:${node.taskUid}` : node;
}
function taskChildren(node) {
  return Array.isArray(node?.children) ? node.children : [];
}
function statusMatches(node, filter) {
  return filter === "ALL" || String(node?.status ?? "").toUpperCase() === filter;
}
function collectTaskCounts(forest, filter) {
  const all = /* @__PURE__ */ new Set();
  const matches = /* @__PURE__ */ new Set();
  const visit = (node) => {
    const identity = taskIdentity(node);
    all.add(identity);
    if (statusMatches(node, filter))
      matches.add(identity);
    for (const child of taskChildren(node))
      visit(child);
  };
  for (const node of forest)
    visit(node);
  return { totalCount: all.size, matchCount: matches.size };
}
function cloneFilteredNode(node, filter) {
  const children = taskChildren(node).map((child) => cloneFilteredNode(child, filter)).filter(Boolean);
  const matches = statusMatches(node, filter);
  if (filter !== "ALL" && !matches && children.length === 0)
    return null;
  return {
    ...node,
    ...node.total !== void 0 ? { unfilteredTotal: node.total } : {},
    total: (node.own ?? 0) + children.reduce((sum, child) => sum + (child.total ?? 0), 0),
    context: filter === "ALL" ? false : !matches,
    children
  };
}
function filterTaskForest(forest, filter = "ALL") {
  const normalisedFilter = normaliseTaskFilter(filter);
  const source = Array.isArray(forest) ? forest : [];
  const counts = collectTaskCounts(source, normalisedFilter);
  return {
    forest: source.map((node) => cloneFilteredNode(node, normalisedFilter)).filter(Boolean),
    filter: normalisedFilter,
    ...counts
  };
}
function compareText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  if (a < b)
    return -1;
  if (a > b)
    return 1;
  return 0;
}
function numericMetric(node, sortBy) {
  const value = Number(node?.[sortBy]);
  return Number.isFinite(value) ? value : 0;
}
function compareTaskNodes(left, right, sortBy, direction) {
  const difference = numericMetric(left, sortBy) - numericMetric(right, sortBy);
  if (difference !== 0)
    return direction === "asc" ? difference : -difference;
  const titleDifference = compareText(left?.title, right?.title);
  if (titleDifference !== 0)
    return titleDifference;
  return compareText(left?.taskUid, right?.taskUid);
}
function sortTaskNode(node, sortBy, direction) {
  const children = taskChildren(node).map((child) => sortTaskNode(child, sortBy, direction)).sort((left, right) => compareTaskNodes(left, right, sortBy, direction));
  return { ...node, children };
}
function sortTaskForest(forest, options = {}) {
  const source = Array.isArray(forest) ? forest : [];
  const sortBy = normaliseSortBy(options?.sortBy);
  const direction = normaliseDirection(options?.direction);
  return source.map((node) => sortTaskNode(node, sortBy, direction)).sort((left, right) => compareTaskNodes(left, right, sortBy, direction));
}
function transformTaskForest(forest, options = {}) {
  const transformOptions = options ?? {};
  const filtered = filterTaskForest(forest, transformOptions.filter);
  const sortBy = normaliseSortBy(transformOptions.sortBy);
  const direction = normaliseDirection(transformOptions.direction);
  return {
    ...filtered,
    forest: sortTaskForest(filtered.forest, { sortBy, direction }),
    sortBy,
    direction
  };
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

// src/activity.js
var ALL_TIME_MONTH_LIMIT = 24;
var TODAY_HOUR_COUNT = 24;
var TODAY_VISIBLE_HOURS = /* @__PURE__ */ new Set([0, 6, 12, 18]);
var MINUTE_MS = 60 * 1e3;
var MONTH_NAMES2 = [
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
var isValidDate2 = (value) => value instanceof Date && !Number.isNaN(value.getTime());
var pad2 = (value) => String(value).padStart(2, "0");
var cloneDay = (date) => new Date(date.getTime());
var nextDay = (date) => {
  const next = cloneDay(date);
  next.setDate(next.getDate() + 1);
  return next;
};
var nextMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1);
var startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
var formatTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
var formatShortDate = (date) => `${MONTH_NAMES2[date.getMonth()]} ${date.getDate()}`;
var formatFullDate = (date) => `${MONTH_NAMES2[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
var formatYearPeriod = (year) => `Jan 1, ${year} \u2013 Dec 31, ${year}`;
var formatHourLabel = (hour) => TODAY_VISIBLE_HOURS.has(hour) ? pad2(hour) : "";
var fullDateLabelFor = (unit, start) => unit === "month" ? `${MONTH_NAMES2[start.getMonth()]} ${start.getFullYear()}` : unit === "year" ? String(start.getFullYear()) : unit === "hour" ? `${formatFullDate(start)} at ${formatTime(start)}` : formatFullDate(start);
function formatActivityDuration(minutes, { compact = false } = {}) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  if (!compact)
    return formatMinutesHuman(safe);
  const hours = Math.floor(safe / 60);
  if (hours === 0)
    return `${safe}m`;
  const remainder = safe % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h${pad2(remainder)}`;
}
function formatActivityHours(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.round(safe / 60 * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
var visibleDurationLabel = (minutes, durationFormat) => {
  if (Math.max(0, Math.round(Number(minutes) || 0)) <= 0)
    return "";
  return durationFormat === "hours" ? formatActivityHours(minutes) : formatActivityDuration(minutes, { compact: durationFormat === "compact" });
};
function getActivityDensity(rangeId, unit, bucketCount) {
  const count = Math.max(1, Number(bucketCount) || 1);
  if (rangeId === "today" || unit === "hour") {
    return { id: "today-18", barWidthPx: 18, bucketCount: count };
  }
  if (rangeId === "week")
    return { id: "week-42", barWidthPx: 42, bucketCount: count };
  if (rangeId === "month")
    return { id: "month-10", barWidthPx: 10, bucketCount: count };
  if (unit === "year")
    return { id: "all-year-32", barWidthPx: 32, bucketCount: count };
  return {
    id: count <= 12 ? "all-month-30" : "all-month-18",
    barWidthPx: count <= 12 ? 30 : 18,
    bucketCount: count
  };
}
var sessionLabel = (count) => `${count} Session${count === 1 ? "" : "s"}`;
var bucketSessionLabel = (bucket) => bucket.sessionCount === 0 && bucket.minutes > 0 ? "continued from an earlier Session" : sessionLabel(bucket.sessionCount);
var bucketAriaLabel = (bucket, dateText) => `${dateText} \xB7 ${bucket.fullDurationLabel || formatMinutesHuman(bucket.minutes)} \xB7 ${bucketSessionLabel(bucket)}`;
var createBucket = ({
  id,
  start,
  end = null,
  unit,
  durationFormat = "human",
  dateLabel,
  monthLabel = "",
  fullDateLabel
}) => ({
  id,
  unit,
  dateKey: dateKey(start),
  start,
  end,
  minutes: 0,
  fixedMinutes: 0,
  sessionCount: 0,
  fixedSessionCount: 0,
  runningClockUids: [],
  runningEntries: [],
  durationFormat,
  durationLabel: "",
  fullDurationLabel: formatActivityDuration(0),
  dateLabel,
  monthLabel,
  fullDateLabel: fullDateLabel || fullDateLabelFor(unit, start),
  ariaLabel: bucketAriaLabel(
    { minutes: 0, fullDurationLabel: formatMinutesHuman(0), sessionCount: 0 },
    fullDateLabel || fullDateLabelFor(unit, start)
  )
});
var refreshBucketLabels = (bucket, dateText = bucket.fullDateLabel) => {
  bucket.durationLabel = visibleDurationLabel(bucket.minutes, bucket.durationFormat);
  bucket.fullDurationLabel = formatActivityDuration(bucket.minutes);
  bucket.ariaLabel = bucketAriaLabel(bucket, dateText);
  return bucket;
};
var addEntryToBucket = (bucket, entry, now, dateText) => {
  const minutes = entryMinutes(entry, now);
  bucket.minutes += minutes;
  bucket.sessionCount += 1;
  if (entry.running) {
    bucket.runningClockUids.push(entry.clockUid);
    bucket.runningEntries.push(entry);
  } else {
    bucket.fixedMinutes += minutes;
    bucket.fixedSessionCount += 1;
  }
  refreshBucketLabels(bucket, dateText);
};
var emptyDailyBuckets = (start, count, durationFormat) => {
  const buckets = [];
  let cursor = cloneDay(start);
  for (let index = 0; index < count; index += 1) {
    buckets.push(
      createBucket({
        id: dateKey(cursor),
        start: cloneDay(cursor),
        unit: "day",
        durationFormat,
        dateLabel: durationFormat === "hours" ? String(cursor.getDate()) : formatShortDate(cursor)
      })
    );
    cursor = nextDay(cursor);
  }
  return buckets;
};
var refreshDailyMonthLabels = (buckets) => {
  for (const [index, bucket] of buckets.entries()) {
    const isFirstVisibleBucket = index === 0;
    const isMonthStart = bucket.start.getDate() === 1;
    bucket.monthLabel = isFirstVisibleBucket || isMonthStart ? MONTH_NAMES2[bucket.start.getMonth()] : "";
    refreshBucketLabels(bucket);
  }
  return buckets;
};
var entryInterval = (entry, now) => {
  if (!isValidDate2(entry?.start))
    return null;
  const startMs = entry.start.getTime();
  const endDate = entry.running ? now : entry.end;
  if (!isValidDate2(endDate))
    return null;
  return {
    startMs,
    endMs: Math.max(startMs, endDate.getTime())
  };
};
var splitMinutes = (totalMinutes2, segments) => {
  if (segments.length === 0)
    return [];
  const totalMs = segments.reduce((sum, segment) => sum + segment.overlapMs, 0);
  const target = Math.min(
    Math.max(0, Math.round(Number(totalMinutes2) || 0)),
    Math.floor(totalMs / MINUTE_MS)
  );
  if (target <= 0 || totalMs <= 0)
    return segments.map(() => 0);
  const allocations = segments.map((segment) => {
    const exact = target * segment.overlapMs / totalMs;
    return { base: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remainder = target - allocations.reduce((sum, allocation) => sum + allocation.base, 0);
  const order = allocations.map((allocation, index) => ({ ...allocation, index })).sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
    allocations[order[index].index].base += 1;
  }
  return allocations.map((allocation) => allocation.base);
};
var todaySegments = (buckets, entry, now) => {
  const interval = entryInterval(entry, now);
  if (!interval)
    return [];
  return buckets.map((bucket) => {
    const bucketStartMs = bucket.start.getTime();
    const bucketEndMs = bucket.end.getTime();
    const overlapStart = Math.max(interval.startMs, bucketStartMs);
    const overlapEnd = Math.min(interval.endMs, bucketEndMs);
    const isPointEntry = interval.startMs === interval.endMs && interval.startMs >= bucketStartMs && interval.startMs < bucketEndMs;
    if (overlapEnd <= overlapStart && !isPointEntry)
      return null;
    return { bucket, overlapMs: Math.max(0, overlapEnd - overlapStart) };
  }).filter(Boolean);
};
var addTodayEntry = (buckets, entry, now) => {
  const segments = todaySegments(buckets, entry, now);
  const allocations = splitMinutes(entryMinutes(entry, now), segments);
  for (const [index, segment] of segments.entries()) {
    const bucket = segment.bucket;
    bucket.minutes += allocations[index];
    const startsInBucket = entry.start.getTime() >= bucket.start.getTime() && entry.start.getTime() < bucket.end.getTime();
    if (startsInBucket)
      bucket.sessionCount += 1;
    if (entry.running) {
      bucket.runningClockUids.push(entry.clockUid);
      bucket.runningEntries.push(entry);
    } else {
      bucket.fixedMinutes += allocations[index];
      if (startsInBucket)
        bucket.fixedSessionCount += 1;
    }
    refreshBucketLabels(bucket);
  }
};
var createTodayBuckets = (now) => {
  const day = startOfDay(now);
  const buckets = [];
  for (let hour = 0; hour < TODAY_HOUR_COUNT; hour += 1) {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(day);
    end.setHours(hour + 1, 0, 0, 0);
    const hourText = formatTime(start);
    buckets.push(
      createBucket({
        id: `${dateKey(day)}T${pad2(hour)}`,
        start,
        end,
        unit: "hour",
        durationFormat: "human",
        dateLabel: formatHourLabel(hour),
        fullDateLabel: `${formatFullDate(start)} at ${hourText}`
      })
    );
  }
  return buckets;
};
var buildToday = (entries, now) => {
  const buckets = createTodayBuckets(now);
  for (const entry of entries)
    addTodayEntry(buckets, entry, now);
  for (const bucket of buckets)
    refreshBucketLabels(bucket);
  return { unit: "hour", buckets };
};
var buildDaily = (entries, now, rangeId) => {
  const count = rangeId === "today" ? 1 : rangeId === "month" ? 30 : 7;
  const start = rangeId === "today" ? startOfDay(now) : startOfDaysAgo(now, count - 1);
  const durationFormat = rangeId === "month" ? "hours" : "human";
  const buckets = emptyDailyBuckets(start, count, durationFormat);
  const byDate = new Map(buckets.map((bucket) => [bucket.dateKey, bucket]));
  for (const entry of entries) {
    const bucket = byDate.get(dateKey(entry.start));
    if (!bucket)
      continue;
    addEntryToBucket(bucket, entry, now, bucket.fullDateLabel);
  }
  if (rangeId === "month")
    refreshDailyMonthLabels(buckets);
  return { unit: "day", durationFormat, buckets };
};
var buildAll = (entries, now) => {
  if (entries.length === 0)
    return { unit: "month", buckets: [] };
  const first = startOfMonth(entries[0].start);
  const last = startOfMonth(now);
  const monthSpan = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1;
  const unit = monthSpan <= ALL_TIME_MONTH_LIMIT ? "month" : "year";
  const firstBucket = unit === "month" ? first : new Date(first.getFullYear(), 0, 1);
  const lastBucket = unit === "month" ? last : new Date(last.getFullYear(), 0, 1);
  const monthCount = (lastBucket.getFullYear() - firstBucket.getFullYear()) * 12 + lastBucket.getMonth() - firstBucket.getMonth() + 1;
  const durationFormat = unit === "month" && monthCount > 12 ? "compact" : "human";
  const buckets = [];
  const byKey = /* @__PURE__ */ new Map();
  let cursor = firstBucket;
  while (cursor.getTime() <= lastBucket.getTime()) {
    const id = unit === "month" ? `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}` : `${cursor.getFullYear()}`;
    const dateLabel = unit === "month" ? cursor.getMonth() === 0 ? `${MONTH_NAMES2[cursor.getMonth()]} \u2019${String(cursor.getFullYear()).slice(-2)}` : MONTH_NAMES2[cursor.getMonth()] : String(cursor.getFullYear());
    const bucket = createBucket({
      id,
      start: cloneDay(cursor),
      unit,
      durationFormat,
      dateLabel,
      fullDateLabel: unit === "month" ? `${MONTH_NAMES2[cursor.getMonth()]} ${cursor.getFullYear()}` : formatYearPeriod(cursor.getFullYear())
    });
    buckets.push(bucket);
    byKey.set(bucket.id, bucket);
    cursor = unit === "month" ? nextMonth(cursor) : new Date(cursor.getFullYear() + 1, 0, 1);
  }
  for (const entry of entries) {
    const start = unit === "month" ? startOfMonth(entry.start) : new Date(entry.start.getFullYear(), 0, 1);
    const key = unit === "month" ? `${start.getFullYear()}-${pad2(start.getMonth() + 1)}` : `${start.getFullYear()}`;
    const bucket = byKey.get(key);
    if (bucket)
      addEntryToBucket(bucket, entry, now, bucket.fullDateLabel);
  }
  return { unit, durationFormat, buckets };
};
var finishActivity = (rangeId, entries, result) => {
  const buckets = result.buckets;
  const totalMinutes2 = buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
  const maxMinutes = buckets.reduce((max, bucket) => Math.max(max, bucket.minutes), 0);
  return {
    rangeId,
    unit: result.unit,
    entries,
    buckets,
    totalMinutes: totalMinutes2,
    maxMinutes,
    durationFormat: result.durationFormat || "human",
    density: getActivityDensity(rangeId, result.unit, buckets.length),
    allTimeMonthLimit: ALL_TIME_MONTH_LIMIT
  };
};
function buildActivity(entries, { now = /* @__PURE__ */ new Date(), rangeId = "week" } = {}) {
  const selectedRange = getRange(rangeId);
  const selectedEntries = filterByRange(Array.isArray(entries) ? entries : [], selectedRange.id, now).filter((entry) => isValidDate2(entry?.start)).sort((left, right) => left.start.getTime() - right.start.getTime());
  if (selectedEntries.length === 0) {
    return finishActivity(selectedRange.id, selectedEntries, {
      unit: selectedRange.id === "today" ? "hour" : "day",
      durationFormat: selectedRange.id === "month" ? "hours" : "human",
      buckets: []
    });
  }
  if (selectedRange.id === "today")
    return finishActivity(selectedRange.id, selectedEntries, buildToday(selectedEntries, now));
  if (selectedRange.id === "all")
    return finishActivity(selectedRange.id, selectedEntries, buildAll(selectedEntries, now));
  return finishActivity(selectedRange.id, selectedEntries, buildDaily(selectedEntries, now, selectedRange.id));
}
function refreshActivityBucket(bucket, now) {
  if (!bucket?.runningEntries?.length)
    return bucket;
  bucket.minutes = bucket.fixedMinutes + bucket.runningEntries.reduce(
    (sum, entry) => sum + entryMinutes(entry, now),
    0
  );
  refreshBucketLabels(
    bucket,
    bucket.fullDateLabel
  );
  return bucket;
}
function refreshActivityBuckets(activity, now) {
  if (activity?.unit !== "hour" || !activity.buckets?.length)
    return activity;
  for (const bucket of activity.buckets) {
    bucket.minutes = bucket.fixedMinutes;
    bucket.sessionCount = bucket.fixedSessionCount;
    bucket.runningClockUids = [];
    bucket.runningEntries = [];
  }
  for (const entry of activity.entries || []) {
    if (entry.running)
      addTodayEntry(activity.buckets, entry, now);
  }
  for (const bucket of activity.buckets)
    refreshBucketLabels(bucket);
  activity.totalMinutes = activity.buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
  activity.maxMinutes = activity.buckets.reduce(
    (max, bucket) => Math.max(max, bucket.minutes),
    0
  );
  return activity;
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

// src/activity-view.js
var BAR_MAX_HEIGHT = 96;
var activityDateText = (bucket) => bucket.monthLabel ? `${bucket.monthLabel} ${bucket.dateLabel}` : bucket.dateLabel;
var barHeight = (bucket, maxMinutes) => {
  if (bucket.minutes <= 0 || maxMinutes <= 0)
    return 2;
  return Math.max(4, Math.round(bucket.minutes / maxMinutes * BAR_MAX_HEIGHT));
};
var activityRangeLabel = (rangeId) => ({
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days",
  all: "All time"
})[rangeId] || "selected range";
var updateBucketNode = (node, bucket, maxMinutes) => {
  node.dataset.activityDuration = bucket.durationLabel;
  node.dataset.activityMinutes = String(bucket.minutes);
  node.dataset.activitySessions = String(bucket.sessionCount);
  node.title = bucket.ariaLabel;
  node.setAttribute("aria-label", bucket.ariaLabel);
  node.classList.toggle("rlb-activity__bucket--empty", bucket.minutes <= 0);
  node.querySelector(".rlb-activity__duration").textContent = bucket.durationLabel;
  node.querySelector(".rlb-activity__bar").style.height = `${barHeight(bucket, maxMinutes)}px`;
};
function renderActivity(activity) {
  if (!activity?.buckets?.length)
    return null;
  const titleId = "roam-logbook-activity-title";
  const section = el("section", "rlb-dashboard-section rlb-dashboard-panel rlb-activity");
  section.setAttribute("aria-labelledby", titleId);
  section.dataset.activityPanel = "true";
  const heading = el("div", "rlb-panel__header");
  heading.appendChild(el("h3", "rlb-section__title", "Activity"));
  heading.querySelector(".rlb-section__title").id = titleId;
  if (activity.durationFormat === "hours") {
    heading.appendChild(el("span", "rlb-activity__unit", "HOURS"));
  }
  section.appendChild(heading);
  const chart = el("div", "rlb-activity__chart");
  chart.setAttribute("role", "group");
  chart.setAttribute("aria-label", `Activity for ${activityRangeLabel(activity.rangeId)}`);
  chart.dataset.activityRange = activity.rangeId;
  chart.dataset.activityUnit = activity.unit;
  chart.dataset.activityDensity = activity.density.id;
  chart.dataset.activityBucketCount = String(activity.buckets.length);
  const plot = el("div", "rlb-activity__plot");
  plot.style.setProperty("--rlb-activity-columns", String(activity.buckets.length));
  plot.style.setProperty("--rlb-activity-bar-width", `${activity.density.barWidthPx}px`);
  plot.dataset.activityDensity = activity.density.id;
  const maxMinutes = activity.maxMinutes;
  for (const bucket of activity.buckets) {
    const column = el("div", "rlb-activity__bucket");
    column.dataset.activityBucket = bucket.id;
    column.dataset.activityDuration = bucket.durationLabel;
    column.dataset.activityMinutes = String(bucket.minutes);
    column.dataset.activitySessions = String(bucket.sessionCount);
    column.dataset.activityUnit = bucket.unit;
    column.tabIndex = 0;
    column.setAttribute("role", "img");
    column.title = bucket.ariaLabel;
    column.setAttribute("aria-label", bucket.ariaLabel);
    column.appendChild(el("span", "rlb-activity__duration", bucket.durationLabel));
    const barWrap = el("span", "rlb-activity__bar-wrap");
    const bar = el("span", "rlb-activity__bar");
    bar.setAttribute("aria-hidden", "true");
    bar.style.height = `${barHeight(bucket, maxMinutes)}px`;
    barWrap.appendChild(bar);
    column.appendChild(barWrap);
    column.appendChild(el("time", "rlb-activity__date", activityDateText(bucket)));
    if (bucket.minutes <= 0)
      column.classList.add("rlb-activity__bucket--empty");
    plot.appendChild(column);
  }
  chart.appendChild(plot);
  section.appendChild(chart);
  return section;
}
function syncActivityView(section, activity, now) {
  if (!section || !activity?.buckets?.length)
    return;
  if (activity.unit === "hour") {
    refreshActivityBuckets(activity, now);
  } else {
    for (const bucket of activity.buckets)
      refreshActivityBucket(bucket, now);
  }
  activity.totalMinutes = activity.buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
  activity.maxMinutes = activity.buckets.reduce(
    (max, bucket) => Math.max(max, bucket.minutes),
    0
  );
  const nodes = new Map(
    [...section.querySelectorAll("[data-activity-bucket]")].map((node) => [
      node.dataset.activityBucket,
      node
    ])
  );
  for (const bucket of activity.buckets) {
    const node = nodes.get(bucket.id);
    if (node)
      updateBucketNode(node, bucket, activity.maxMinutes);
  }
}

// src/focus-trap.js
var FOCUSABLE_SELECTOR = 'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])';
function createFocusTrap(getRoot, { documentRef = document } = {}) {
  let active = false;
  const onKeyDown = (event) => {
    if (!active || event.key !== "Tab")
      return;
    const root = getRoot?.();
    if (!root)
      return;
    const focusables = [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
      (node) => !node.disabled && node.getAttribute("aria-hidden") !== "true"
    );
    event.preventDefault();
    event.stopPropagation();
    if (focusables.length === 0) {
      root.tabIndex = -1;
      root.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const index = focusables.indexOf(documentRef.activeElement);
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
  return {
    activate() {
      if (active)
        return;
      active = true;
      documentRef.addEventListener("keydown", onKeyDown, true);
    },
    deactivate() {
      if (!active)
        return;
      active = false;
      documentRef.removeEventListener("keydown", onKeyDown, true);
    }
  };
}

// src/dashboard-issues.js
var issueRow = (issue) => ({
  title: issue.title || issue.parentUid || issue.affectedUid || "Unresolved graph data",
  rawClock: issue.rawClock || (issue.source ? `(graph ${issue.source} read)` : "(hierarchy query)"),
  issues: [issue]
});
var dataIssuesSection = (issues) => {
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
  details.appendChild(el("summary", "rlb-data-issues__summary", summaryParts.join(" \xB7 ")));
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

// src/task-display.js
var TASK_MARKER_RE = /\{\{\[\[(?:TODO|DONE)\]\]\}\}|\{\{(?:TODO|DONE)\}\}/gi;
var stripRoamMacros = (string) => {
  let cleaned = "";
  let depth = 0;
  for (let index = 0; index < string.length; index += 1) {
    const pair = string.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}" && depth > 0) {
      depth -= 1;
      index += 1;
      continue;
    }
    if (depth === 0)
      cleaned += string[index];
  }
  return cleaned;
};
function formatDisplayTitle({ taskString, title, taskUid } = {}) {
  const fallback = String(title || taskUid || "(untitled)").trim() || "(untitled)";
  if (typeof taskString !== "string" || taskString.trim() === "")
    return fallback;
  const cleaned = stripRoamMacros(taskString.replace(TASK_MARKER_RE, "")).replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\(\([a-zA-Z0-9_-]{6,}\)\)/g, "").replace(/\^\^|\*\*|__|~~/g, "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

// src/dashboard-table.js
var headerRow = (columns, { sortBy = null, direction = "desc", onSort = null } = {}) => {
  const thead = el("thead");
  const row = el("tr");
  for (const column of columns) {
    const config = typeof column === "object" ? column : { label: column };
    const classes = [
      config.numeric ? "rlb-table__num" : "",
      config.visuallyHidden ? "rlb-visually-hidden" : ""
    ].filter(Boolean).join(" ");
    const header = el("th", classes);
    header.setAttribute("scope", "col");
    if (config.sortKey)
      header.dataset.sortKey = config.sortKey;
    if (config.sortKey && onSort) {
      const active = config.sortKey === sortBy;
      if (active) {
        header.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      }
      const sortButton = button(
        "bp3-button bp3-minimal bp3-small rlb-task-sort-button",
        "",
        () => onSort(config.sortKey),
        { title: config.title || `Sort by ${config.label}` }
      );
      sortButton.setAttribute("aria-pressed", String(active));
      sortButton.appendChild(el("span", "rlb-task-sort-label", config.label));
      if (active) {
        const arrow = el("span", "rlb-task-sort-arrow", direction === "asc" ? "\u2191" : "\u2193");
        arrow.setAttribute("aria-hidden", "true");
        sortButton.appendChild(arrow);
      }
      header.appendChild(sortButton);
    } else {
      header.textContent = config.label;
    }
    row.appendChild(header);
  }
  thead.appendChild(row);
  return thead;
};
var statusMark = (status) => {
  if (!status)
    return null;
  const done = status === "DONE";
  const mark = el("span", `rlb-status rlb-status--${done ? "done" : "todo"}`);
  mark.title = done ? "DONE" : "TODO";
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", done ? "Done" : "To do");
  return mark;
};
var taskLink = (row, { onClose = () => {
} } = {}) => {
  const title = formatDisplayTitle(row);
  const accessibleName = `Open this block: ${title}`;
  const link = button(
    "bp3-button bp3-minimal bp3-small rlb-task-link",
    "",
    (event) => {
      event.stopPropagation();
      if (event.shiftKey) {
        event.preventDefault();
        void openBlockInRightSidebar(row.taskUid);
        return;
      }
      onClose();
      void openBlock(row.taskUid);
    },
    { title: accessibleName }
  );
  link.appendChild(el("span", "rlb-task-link__text", title));
  return link;
};

// src/version.js
var PLUGIN_VERSION = "0.9.0-beta.44";
var STATE_FORMATS = Object.freeze({
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
var SETTING_TIMING_LINE_SIDEBAR = "keepTimingLineAtTopOfRightSidebar";
var SETTING_POMODORO_STATE = "pomodoroTargets";
var SETTING_POMODORO_CYCLE = "pomodoroCycle";
var SETTING_STATE_BACKUPS = "stateBackups";
var DEFAULTS = {
  [SETTING_TOPBAR]: true,
  [SETTING_MULTIPLE]: false,
  [SETTING_TODO_ONLY]: true,
  [SETTING_STALE_HOURS]: "8",
  [SETTING_POMODORO_MINUTES]: "45",
  [SETTING_TIMING_LINE_SIDEBAR]: true
};
var DEFAULT_ON_SWITCHES = [
  SETTING_TIMING_LINE_SIDEBAR
];
var extensionAPI = null;
function setExtensionAPI(api) {
  extensionAPI = api;
}
function initializeDefaultOnSwitches() {
  for (const key of DEFAULT_ON_SWITCHES) {
    const value = extensionAPI?.settings?.get(key);
    if (value === void 0 || value === null) {
      extensionAPI?.settings?.set(key, true);
    }
  }
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
function keepTimingLineAtTopOfRightSidebar() {
  return booleanSetting(SETTING_TIMING_LINE_SIDEBAR);
}
function staleHours() {
  const parsed = Number(read(SETTING_STALE_HOURS));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}
function pomodoroMinutes() {
  const parsed = Number(read(SETTING_POMODORO_MINUTES));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45;
}
function readSetting(key) {
  return extensionAPI?.settings?.get(key) ?? null;
}
function writeSetting(key, value) {
  const setter = extensionAPI?.settings?.set;
  if (typeof setter !== "function")
    return false;
  try {
    setter.call(extensionAPI.settings, key, value);
    return true;
  } catch {
    return false;
  }
}
function hasStateBackup(key, raw) {
  try {
    const rawSignature = typeof raw === "string" ? raw : JSON.stringify(raw);
    const stored = readSetting(SETTING_STATE_BACKUPS);
    const parsed = stored ? typeof stored === "string" ? JSON.parse(stored) : stored : null;
    return parsed?.version === STATE_FORMATS.stateBackups && parsed.data?.[key]?.rawSignature === rawSignature;
  } catch {
    return false;
  }
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
    const saved = writeSetting(
      SETTING_STATE_BACKUPS,
      JSON.stringify({ version: STATE_FORMATS.stateBackups, data })
    );
    return saved;
  } catch (error) {
    console.warn("[roam-logbook] could not preserve invalid state backup", error);
    return false;
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
  return String(rounded > 0 ? rounded : 45);
}

// src/dashboard-running.js
function runningSection({
  running: running2,
  now,
  isDiscarding = () => false,
  onDiscard,
  onClockOut,
  headerRow: headerRow2,
  statusMark: statusMark2,
  taskLink: taskLink2
}) {
  const stale = new Set(findStaleClocks(running2, now, staleHours()).map((e) => e.clockUid));
  const section = el("section", "rlb-dashboard-section rlb-running rlb-dashboard-panel");
  section.setAttribute("aria-labelledby", "roam-logbook-running-title");
  const heading = el("div", "rlb-panel__header");
  heading.appendChild(el("h3", "rlb-section__title", "Timing"));
  heading.lastElementChild.id = "roam-logbook-running-title";
  if (stale.size > 0) {
    heading.appendChild(
      el("span", "bp3-tag bp3-minimal bp3-intent-warning rlb-panel__notice", `${stale.size} stale`)
    );
  }
  section.appendChild(heading);
  const table = el("table", "rlb-table");
  table.appendChild(
    headerRow2([
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
    const mark = statusMark2(entry.status);
    if (mark)
      task.appendChild(mark);
    task.appendChild(taskLink2(entry));
    if (stale.has(entry.clockUid)) {
      task.appendChild(el("span", "bp3-tag bp3-minimal bp3-intent-warning", "stale"));
    }
    const actions = el("td", "rlb-table__num");
    const discarding = isDiscarding(entry.clockUid);
    const discardTitle = discarding ? "Confirm discard of this CLOCK entry" : "Discard this CLOCK entry (cannot be undone)";
    const discard = button(
      `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? " bp3-intent-danger" : ""}`,
      "",
      (event) => {
        event.stopPropagation();
        onDiscard(entry);
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
          void onClockOut(entry);
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
}

// src/dashboard-task-tree.js
var countDescendants = (node) => node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
function tasksSection(tree, { taskView, collapsedByFilter, taskLink: taskLink2, statusMark: statusMark2, taskTimingAction }) {
  const section = el("section", "rlb-dashboard-section rlb-dashboard-panel rlb-by-task");
  section.setAttribute("aria-labelledby", "roam-logbook-by-task-title");
  const heading = el("div", "rlb-section__heading rlb-panel__header");
  const title = el("h3", "rlb-section__title", "By task");
  title.id = "roam-logbook-by-task-title";
  heading.appendChild(title);
  const taskCount = el("span", "rlb-task-count");
  heading.appendChild(taskCount);
  const rollupHelp = "Totals include sub-tasks. A task shown under more than one parent may overlap between branches; headline totals count each Session once.";
  const info = button(
    "bp3-button bp3-minimal bp3-small bp3-icon-info-sign rlb-tree__info",
    "",
    null,
    { title: rollupHelp }
  );
  info.setAttribute("role", "img");
  info.setAttribute("tabindex", "-1");
  info.setAttribute("aria-describedby", "roam-logbook-task-rollup-help");
  heading.appendChild(info);
  const help = el("span", "rlb-visually-hidden", rollupHelp);
  help.id = "roam-logbook-task-rollup-help";
  section.appendChild(help);
  const filterGroup = el("div", "rlb-task-filters");
  filterGroup.setAttribute("role", "group");
  filterGroup.setAttribute("aria-label", "Filter tasks by status");
  for (const [value, label] of [
    ["ALL", "All"],
    ["TODO", "TODO"],
    ["DONE", "DONE"]
  ]) {
    const filterButton = button(
      "bp3-button bp3-minimal bp3-small rlb-task-filter",
      label,
      () => {
        taskView.filter = value;
        paintTaskTable();
      },
      { title: `Show ${label === "All" ? "all tasks" : `${label} tasks`}` }
    );
    filterButton.dataset.filter = value;
    filterButton.setAttribute("aria-pressed", String(taskView.filter === value));
    filterGroup.appendChild(filterButton);
  }
  heading.appendChild(filterGroup);
  let visibleParentUids = [];
  const toggleAll = button(
    "bp3-button bp3-minimal bp3-small rlb-tree__collapse-all",
    "",
    () => {
      const viewCollapsed = collapsedByFilter[taskView.filter];
      const anyExpanded = visibleParentUids.some((uid) => !viewCollapsed.has(uid));
      if (anyExpanded) {
        for (const uid of visibleParentUids)
          viewCollapsed.add(uid);
      } else {
        for (const uid of visibleParentUids)
          viewCollapsed.delete(uid);
      }
      paintTaskTable();
    }
  );
  heading.appendChild(toggleAll);
  section.appendChild(heading);
  const tableHost = el("div", "rlb-task-table-host");
  section.appendChild(tableHost);
  function paintTaskTable() {
    const transformed = transformTaskForest(tree, {
      filter: taskView.filter,
      sortBy: taskView.sortBy,
      direction: taskView.direction
    });
    const viewCollapsed = collapsedByFilter[taskView.filter];
    const completeViewRows = flattenForest(transformed.forest);
    visibleParentUids = [
      ...new Set(completeViewRows.filter((node) => node.hasChildren).map((node) => node.taskUid))
    ];
    const rows = flattenForest(transformed.forest, {
      isCollapsed: (node) => viewCollapsed.has(node.taskUid)
    });
    const anyExpanded = visibleParentUids.some((uid) => !viewCollapsed.has(uid));
    taskCount.textContent = `${transformed.matchCount} of ${transformed.totalCount} Tasks`;
    for (const filterButton of filterGroup.querySelectorAll("[data-filter]")) {
      filterButton.setAttribute(
        "aria-pressed",
        String(filterButton.dataset.filter === taskView.filter)
      );
    }
    toggleAll.textContent = anyExpanded ? "Collapse all" : "Expand all";
    toggleAll.hidden = visibleParentUids.length === 0;
    if (transformed.forest.length === 0) {
      const emptyMessage = taskView.filter === "TODO" ? "No TODO Tasks in the selected range." : taskView.filter === "DONE" ? "No DONE Tasks in the selected range." : "No tasks in the selected range.";
      tableHost.replaceChildren(el("div", "rlb-task-empty", emptyMessage));
      return;
    }
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
      headerRow(
        [
          "Task",
          {
            label: "Sessions",
            numeric: true,
            sortKey: "sessions",
            title: "Sort by Sessions"
          },
          {
            label: "Own",
            numeric: true,
            sortKey: "own",
            title: "Time recorded directly on this Task"
          },
          {
            label: "Total",
            numeric: true,
            sortKey: "total",
            title: "Own time plus all sub-tasks"
          }
        ],
        {
          sortBy: taskView.sortBy,
          direction: taskView.direction,
          onSort: (sortBy) => {
            if (taskView.sortBy === sortBy) {
              taskView.direction = taskView.direction === "desc" ? "asc" : "desc";
            } else {
              taskView.sortBy = sortBy;
              taskView.direction = "desc";
            }
            paintTaskTable();
          }
        }
      )
    );
    const tbody = el("tbody");
    for (const node of rows) {
      const row = el("tr");
      const name = el("td", "rlb-tree__cell");
      const layout = el("div", "rlb-tree__layout");
      const leading = el("div", "rlb-tree__leading");
      const content = el("div", "rlb-tree__content");
      name.style.paddingLeft = `${8 + node.depth * 20}px`;
      row.setAttribute("aria-level", String(node.depth + 1));
      if (node.hasChildren) {
        const caret = button(
          `bp3-button bp3-minimal bp3-small rlb-tree__toggle bp3-icon-chevron-${node.collapsed ? "right" : "down"}`,
          "",
          () => {
            if (viewCollapsed.has(node.taskUid))
              viewCollapsed.delete(node.taskUid);
            else
              viewCollapsed.add(node.taskUid);
            paintTaskTable();
          },
          { title: node.collapsed ? "Expand sub-tasks" : "Collapse sub-tasks" }
        );
        caret.setAttribute("aria-expanded", String(!node.collapsed));
        caret.setAttribute("aria-label", node.collapsed ? "Expand sub-tasks" : "Collapse sub-tasks");
        leading.appendChild(caret);
      } else {
        leading.appendChild(el("span", "rlb-tree__toggle rlb-tree__toggle--empty"));
      }
      const mark = statusMark2(node.status);
      if (mark)
        leading.appendChild(mark);
      if (node.status === "DONE")
        row.classList.add("rlb-row--done");
      if (node.context)
        row.classList.add("rlb-row--context");
      content.appendChild(taskLink2(node));
      if (node.occurrences > 1) {
        const badge = el("span", "bp3-tag bp3-minimal rlb-tree__badge", `\xD7${node.occurrences}`);
        badge.title = `Also rolls up under ${node.occurrences - 1} other task(s)`;
        content.appendChild(badge);
      }
      if (node.truncated) {
        content.appendChild(el("span", "bp3-tag bp3-minimal bp3-intent-warning", "loop"));
      }
      const actions = el("div", "rlb-muted rlb-tree__actions");
      if (node.collapsed) {
        const hidden = countDescendants(node);
        actions.appendChild(
          el("span", "rlb-muted rlb-tree__hidden", `+${hidden} sub-task${hidden > 1 ? "s" : ""}`)
        );
      }
      const timingAction = taskTimingAction(node);
      if (timingAction)
        actions.appendChild(timingAction);
      layout.append(leading, content, actions);
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
  paintTaskTable();
  return section;
}

// src/theme.js
var LIGHT_PAGE_LINK = "#316a9f";
var DARK_PAGE_LINK = "#7eb7d5";
var LIGHT_SYNC_GREEN = "#7eb794";
var DARK_SYNC_GREEN = "#8ed0aa";
var PLUGIN_ROOT_SELECTOR = ".rlb-root, .rlb-popover, #roam-logbook-topbar, [data-roam-logbook]";
var PAGE_REF_SELECTORS = [
  ".rm-page-ref--link",
  ".rm-page-ref-link-color",
  ".rm-page-ref"
];
var TOPBAR_SELECTOR = ".rm-topbar";
var THEME_ROOT_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "style", "data-theme"]);
var SYNC_ATTRIBUTES = [
  "class",
  "style",
  "aria-label",
  "title",
  "data-state",
  "data-status"
];
var SYNC_STATUS_PATTERN = /saving|saved|sync|synced|synchroniz/i;
var SYNC_GEOMETRY_LIMIT = 200;
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
  return documentRef?.body || documentRef?.documentElement || null;
};
var themeSignature = (documentRef) => {
  const root = documentRef?.documentElement;
  const body = documentRef?.body;
  return [
    root?.getAttribute?.("class"),
    root?.getAttribute?.("style"),
    root?.getAttribute?.("data-theme"),
    body?.getAttribute?.("class"),
    body?.getAttribute?.("style"),
    body?.getAttribute?.("data-theme")
  ].map((value) => normalized(value)).join("");
};
var probePaletteByDocument = /* @__PURE__ */ new WeakMap();
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
  const signature = themeSignature(documentRef);
  const cachedProbe = probePaletteByDocument.get(documentRef);
  let probeColor = null;
  if (cachedProbe?.signature === signature) {
    probeColor = cachedProbe.color;
  } else if (host?.appendChild && documentRef?.createElement) {
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
        probeColor = color2;
      }
    } finally {
      probe.remove();
    }
  }
  probePaletteByDocument.set(documentRef, { signature, color: probeColor });
  if (probeColor)
    return { color: probeColor, hoverColor: probeColor, source: "probe" };
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
  const signal = [
    node.getAttribute?.("class"),
    node.getAttribute?.("aria-label"),
    node.getAttribute?.("title"),
    node.getAttribute?.("data-state"),
    node.getAttribute?.("data-status")
  ].filter(Boolean).join(" ");
  return SYNC_STATUS_PATTERN.test(signal);
};
var syncSignal = (node) => [
  node?.getAttribute?.("class"),
  node?.getAttribute?.("style"),
  node?.getAttribute?.("aria-label"),
  node?.getAttribute?.("title"),
  node?.getAttribute?.("data-state"),
  node?.getAttribute?.("data-status"),
  semanticSyncCandidate(node) ? node?.textContent : ""
].map((value) => normalized(value)).join("");
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
var syncGeometryCacheByDocument = /* @__PURE__ */ new WeakMap();
var sameNodes = (left, right) => Boolean(
  left && right && left.length === right.length && left.every((node, index) => node === right[index])
);
var syncPaletteCacheKey = (documentRef, all, semantic) => [
  themeSignature(documentRef),
  all.length,
  semantic.map(syncSignal).join(""),
  all.slice(0, SYNC_GEOMETRY_LIMIT).map(syncSignal).join("")
].join("");
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
  const sampledNodes = all.slice(0, SYNC_GEOMETRY_LIMIT);
  const cacheKey = syncPaletteCacheKey(documentRef, all, semantic);
  const documentCache = syncGeometryCacheByDocument.get(documentRef) || /* @__PURE__ */ new WeakMap();
  const cached = documentCache.get(topbar);
  if (cached?.key === cacheKey && sameNodes(cached.sampledNodes, sampledNodes)) {
    return cached.palette;
  }
  for (const node of sampledNodes) {
    if (isPluginNode(node) || !smallGeometry(node))
      continue;
    const color = candidateColors(documentRef, node).find(isStableGreen);
    if (color) {
      const palette2 = { color, source: "geometry" };
      documentCache.set(topbar, { key: cacheKey, palette: palette2, sampledNodes });
      syncGeometryCacheByDocument.set(documentRef, documentCache);
      return palette2;
    }
  }
  const palette = {
    color: isDarkTheme(documentRef) ? DARK_SYNC_GREEN : LIGHT_SYNC_GREEN,
    source: "fallback"
  };
  documentCache.set(topbar, { key: cacheKey, palette, sampledNodes });
  syncGeometryCacheByDocument.set(documentRef, documentCache);
  return palette;
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
var isSyncCandidate = (node) => semanticSyncCandidate(node);
var isPreviousSyncCandidate = (record) => {
  const node = record?.target;
  if (record?.type !== "attributes" || !node)
    return false;
  const values = [
    record.attributeName === "class" ? record.oldValue : node.getAttribute?.("class"),
    record.attributeName === "aria-label" ? record.oldValue : node.getAttribute?.("aria-label"),
    record.attributeName === "title" ? record.oldValue : node.getAttribute?.("title"),
    record.attributeName === "data-state" ? record.oldValue : node.getAttribute?.("data-state"),
    record.attributeName === "data-status" ? record.oldValue : node.getAttribute?.("data-status")
  ];
  return SYNC_STATUS_PATTERN.test(values.filter(Boolean).join(" "));
};
var containsSyncCandidate = (node) => isSyncCandidate(node) || Boolean([...node?.querySelectorAll?.("*") || []].some((child) => isSyncCandidate(child)));
var isDocumentThemeNode = (node) => Boolean(
  node?.nodeType === 1 && (node === node.ownerDocument?.documentElement || node === node.ownerDocument?.body)
);
var isRelevantThemeMutation = (record) => record?.type === "attributes" && THEME_ROOT_ATTRIBUTES.has(record.attributeName) && isDocumentThemeNode(record.target);
var isRelevantSyncMutation = (record) => {
  const target = record?.target;
  if (!target || target?.closest?.(PLUGIN_ROOT_SELECTOR))
    return false;
  if (record.type === "attributes") {
    if (isSyncCandidate(target) || isPreviousSyncCandidate(record))
      return true;
    return false;
  }
  if (record.type === "childList") {
    if (isSyncCandidate(target))
      return true;
    const nodes = [...record.addedNodes || [], ...record.removedNodes || []].filter(
      (node) => !node?.closest?.(PLUGIN_ROOT_SELECTOR)
    );
    return nodes.some(containsSyncCandidate);
  }
  return false;
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
      themeObserver: null,
      syncObserver: null,
      syncTopbar: null,
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
  const notify2 = () => {
    const current = palette();
    for (const listener of state.listeners)
      listener(current);
  };
  const MutationObserverCtor = getWindow(documentRef)?.MutationObserver || globalThis.MutationObserver;
  const connectSyncObserver = () => {
    if (!MutationObserverCtor)
      return;
    const topbar = documentRef?.querySelector?.(TOPBAR_SELECTOR) || null;
    if (state.syncTopbar === topbar && (topbar === null || state.syncObserver))
      return;
    state.syncObserver?.disconnect();
    state.syncObserver = null;
    state.syncTopbar = topbar;
    if (!topbar)
      return;
    state.syncObserver = new MutationObserverCtor((records) => {
      if (records.some(isRelevantSyncMutation))
        scheduleRefresh();
    });
    state.syncObserver.observe(topbar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: SYNC_ATTRIBUTES
    });
  };
  const refresh2 = () => {
    connectSyncObserver();
    const page = readRoamPageLinkPalette(documentRef);
    const sync = readRoamSyncPalette(documentRef);
    if (page.source !== "fallback" || state.page.source === "fallback")
      state.page = page;
    if (sync.source !== "fallback" || state.sync.source === "fallback")
      state.sync = sync;
    notify2();
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
    if (MutationObserverCtor) {
      state.themeObserver = new MutationObserverCtor((records) => {
        if (records.some(isRelevantThemeMutation))
          scheduleRefresh();
      });
      for (const target of [documentRef?.documentElement, documentRef?.body]) {
        if (!target)
          continue;
        state.themeObserver.observe(target, {
          subtree: false,
          attributes: true,
          attributeFilter: [...THEME_ROOT_ATTRIBUTES]
        });
      }
      connectSyncObserver();
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
      state.themeObserver?.disconnect();
      state.themeObserver = null;
      state.syncObserver?.disconnect();
      state.syncObserver = null;
      state.syncTopbar = null;
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

// src/scroll-lock.js
var documentScrollLocks = /* @__PURE__ */ new WeakMap();
var restoreInlineStyle = (node, value) => {
  if (!node)
    return;
  if (value === null)
    node.removeAttribute("style");
  else
    node.setAttribute("style", value);
};
var releaseDocumentScrollLock = (documentRef, windowRef, state) => {
  const current = documentScrollLocks.get(documentRef);
  if (current !== state)
    return;
  current.count -= 1;
  if (current.count > 0)
    return;
  restoreInlineStyle(current.html, current.htmlStyle);
  restoreInlineStyle(current.body, current.bodyStyle);
  try {
    windowRef.scrollTo(current.scrollX, current.scrollY);
  } catch {
  }
  documentScrollLocks.delete(documentRef);
};
function acquireDocumentScrollLock({
  documentRef = document,
  windowRef = documentRef.defaultView || window
} = {}) {
  const html = documentRef.documentElement;
  const body = documentRef.body;
  if (!html || !body)
    return () => {
    };
  let state = documentScrollLocks.get(documentRef);
  if (!state) {
    const scrollX = Number(windowRef.scrollX) || 0;
    const scrollY = Number(windowRef.scrollY) || 0;
    const scrollbarWidth = Math.max(0, (Number(windowRef.innerWidth) || 0) - html.clientWidth);
    const computedPadding = Number.parseFloat(windowRef.getComputedStyle(body).paddingRight) || 0;
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
    releaseDocumentScrollLock(documentRef, windowRef, state);
  };
}

// src/refresh-state.js
var REFRESH_MESSAGES = {
  activeWork: {
    loading: "Refreshing Active Work from graph\u2026",
    success: "Updated just now",
    error: "Refresh failed; last valid snapshot kept. Retry."
  },
  dashboard: {
    loading: "Refreshing Dashboard from graph\u2026",
    success: "Dashboard updated just now",
    error: "Dashboard refresh failed; last valid snapshot kept. Retry."
  }
};
function createRefreshState({
  onRender = () => {
  },
  messages = REFRESH_MESSAGES.activeWork,
  successDuration = 1800,
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutFn = (timer) => clearTimeout(timer)
} = {}) {
  let current = { state: "idle", message: "" };
  let inFlight = null;
  let clearTimer = null;
  const clearSuccessTimer = () => {
    if (clearTimer !== null)
      clearTimeoutFn(clearTimer);
    clearTimer = null;
  };
  const set = (state, message, { clearAfter = false } = {}) => {
    clearSuccessTimer();
    current = { state, message };
    onRender(current);
    if (clearAfter) {
      clearTimer = setTimeoutFn(() => {
        clearTimer = null;
        if (current.state !== "success")
          return;
        current = { state: "idle", message: "" };
        onRender(current);
      }, successDuration);
    }
  };
  const run = (operation, { onSuccess, onFailure, onError, isSuccess = (result) => result?.ok } = {}) => {
    if (inFlight)
      return inFlight;
    set("loading", messages.loading);
    const request = Promise.resolve().then(operation).then(
      (result) => {
        if (isSuccess(result)) {
          onSuccess?.(result);
          set("success", messages.success, { clearAfter: true });
        } else {
          onFailure?.(result);
          set("error", messages.error);
        }
        return result;
      },
      (error) => {
        const result = onError?.(error) ?? { ok: false, error };
        set("error", messages.error);
        return result;
      }
    );
    inFlight = request.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  const reset3 = () => {
    clearSuccessTimer();
    current = { state: "idle", message: "" };
    onRender(current);
  };
  return {
    get state() {
      return current;
    },
    get inFlight() {
      return inFlight;
    },
    set,
    run,
    reset: reset3,
    dispose() {
      clearSuccessTimer();
      inFlight = null;
    }
  };
}

// src/dashboard.js
var ROOT_ID = "roam-logbook-dashboard";
var DASHBOARD_TITLE = "Roam Logbook";
function createDashboard({
  now: nowFn = () => /* @__PURE__ */ new Date(),
  setIntervalFn = (callback, delay) => setInterval(callback, delay),
  clearIntervalFn = (ticker) => clearInterval(ticker),
  confirmation = createConfirmationController()
} = {}) {
  let root = null;
  let summaryNode = null;
  let bodyNode = null;
  let activityNode = null;
  let rangeId = "week";
  let returnFocusTo = null;
  let liveTicker = null;
  let refreshButton = null;
  let refreshStatusNode = null;
  let refreshAlertNode = null;
  let lastSnapshot = null;
  let lastModel = null;
  let lastTransientIssues = [];
  let lastRefreshNotice = "";
  let focusInFlight = null;
  let themeRuntime = null;
  let releaseScrollLock = null;
  const focusTrap = createFocusTrap(() => root?.querySelector(".rlb-dialog"));
  const collapsed = /* @__PURE__ */ new Set();
  const taskView = {
    filter: "ALL",
    sortBy: "total",
    direction: "desc"
  };
  const collapsedByFilter = {
    ALL: collapsed,
    TODO: /* @__PURE__ */ new Set(),
    DONE: /* @__PURE__ */ new Set()
  };
  const clearLiveTicker = () => {
    if (liveTicker !== null)
      clearIntervalFn(liveTicker);
    liveTicker = null;
  };
  const syncRefreshUi = (state) => {
    const current = state || refreshRuntime.state;
    if (refreshButton) {
      refreshButton.dataset.refreshState = current.state;
      refreshButton.disabled = current.state === "loading";
      if (current.state === "loading")
        refreshButton.setAttribute("aria-busy", "true");
      else
        refreshButton.removeAttribute("aria-busy");
    }
    if (refreshStatusNode && refreshAlertNode) {
      const isError = current.state === "error";
      refreshStatusNode.textContent = isError ? "" : current.message;
      refreshAlertNode.textContent = isError ? current.message : "";
    }
  };
  const refreshRuntime = createRefreshState({
    onRender: syncRefreshUi,
    messages: REFRESH_MESSAGES.dashboard
  });
  const resetDiscardConfirmation = () => confirmation?.reset();
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
    syncActivityView(activityNode, lastModel?.activity, nowDateValue);
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
  const paintDashboard = (now) => {
    if (!bodyNode || !lastModel)
      return;
    clearLiveTicker();
    const model = lastModel;
    const hierarchy = lastSnapshot?.hierarchy || {};
    const transientIssues = lastTransientIssues;
    const refreshNotice = lastRefreshNotice;
    summaryNode.replaceChildren();
    summaryNode.appendChild(overviewBar(model));
    bodyNode.replaceChildren();
    activityNode = null;
    if (refreshNotice) {
      const notice3 = el("div", "rlb-dashboard__notice", refreshNotice);
      notice3.setAttribute("role", "status");
      notice3.setAttribute("aria-live", "polite");
      notice3.setAttribute("aria-atomic", "true");
      bodyNode.appendChild(notice3);
    }
    const issues = [
      ...model.issues,
      ...(hierarchy.issues || []).map(issueRow),
      ...transientIssues.map(issueRow)
    ];
    if (model.running.length > 0) {
      bodyNode.appendChild(
        runningSection({
          running: model.running,
          now,
          isDiscarding: (uid) => confirmation?.isArmed(`discard:${uid}`, "dashboard"),
          onDiscard: handleDiscard,
          onClockOut: (entry) => act(() => clockOut(entry.clockUid)),
          headerRow,
          statusMark,
          taskLink: renderTaskLink
        })
      );
    }
    if (model.entries.length === 0) {
      bodyNode.appendChild(el("div", "rlb-empty", "No clock entries in this range yet."));
      if (issues.length > 0)
        bodyNode.appendChild(dataIssuesSection(issues));
      startLiveTicker();
      return;
    }
    activityNode = renderActivity(model.activity);
    if (activityNode)
      bodyNode.appendChild(activityNode);
    bodyNode.appendChild(
      tasksSection(model.tree, {
        taskView,
        collapsedByFilter,
        taskLink: renderTaskLink,
        statusMark,
        taskTimingAction
      })
    );
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
          const notice3 = el(
            "div",
            "rlb-dashboard__notice",
            "Graph data could not be refreshed; no successful snapshot is available yet."
          );
          notice3.setAttribute("role", "alert");
          notice3.setAttribute("aria-live", "assertive");
          notice3.setAttribute("aria-atomic", "true");
          const issueRows = transientIssues.map(issueRow);
          bodyNode.replaceChildren(
            notice3,
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
    lastModel.activity = buildActivity(lastModel.entries, { now, rangeId });
    lastTransientIssues = transientIssues;
    lastRefreshNotice = refreshNotice;
    paintDashboard(now);
    return { ok: true, refreshFailed };
  };
  const refreshDashboard = () => refreshRuntime.run(() => render(), {
    isSuccess: (result) => result?.ok && !result.refreshFailed,
    onError: (error) => {
      console.error("[roam-logbook] could not refresh Dashboard", error);
      return { ok: false, error };
    }
  });
  const overviewBar = (model) => {
    const wrapper = el("dl", "rlb-overview rlb-overview--compact");
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", `${DASHBOARD_TITLE} overview`);
    const rangeLabel = getRange(model.rangeId).label;
    const metrics = [
      ["Today", formatMinutesHuman(model.todayMinutes), null, "today"],
      [rangeLabel, formatMinutesHuman(model.totalMinutes), null, "selected"],
      ["Sessions", String(model.sessionMetrics?.sessions || 0), rangeLabel, "sessions"],
      ["Tasks tracked", String(model.tasks.length), rangeLabel, "tasks"]
    ];
    for (const [label, value, context, key] of metrics) {
      const item = el("div", "rlb-overview__item rlb-overview__panel rlb-overview__heading");
      const valueNode = el("dd", "rlb-overview__value");
      const number = el("span", "rlb-overview__number", value);
      number.dataset.liveMetric = key;
      valueNode.append(number);
      if (context)
        valueNode.append(el("span", "rlb-overview__context", context));
      item.append(el("dt", "rlb-overview__label", label), valueNode);
      wrapper.appendChild(item);
    }
    return wrapper;
  };
  const renderTaskLink = (row) => taskLink(row, { onClose: () => close() });
  const act = async (action) => {
    try {
      await action();
    } catch (error) {
      console.error("[roam-logbook]", error);
    }
    render();
  };
  const handleDiscard = (entry) => {
    const key = `discard:${entry.clockUid}`;
    if (!confirmation?.arm(key, "dashboard")) {
      render({ readGraph: false });
      return;
    }
    void act(() => discardClock(entry.clockUid));
  };
  const startTaskTiming = (taskUid) => {
    if (!taskUid || focusInFlight)
      return focusInFlight;
    const request = act(
      () => clockIn(taskUid, { source: "active-work-switch" })
    );
    focusInFlight = request.finally(() => {
      focusInFlight = null;
    });
    return focusInFlight;
  };
  const taskTimingAction = (node) => {
    if (node.running) {
      const timing = el(
        "span",
        "bp3-icon bp3-icon-time rlb-task-action rlb-task-action--timing"
      );
      timing.title = "Currently timing";
      timing.setAttribute("role", "img");
      timing.setAttribute("aria-label", "Currently timing");
      timing.dataset.taskAction = "timing";
      return timing;
    }
    if (node.status !== "TODO" || !node.taskUid)
      return null;
    const title = formatDisplayTitle(node);
    const play = button(
      "bp3-button bp3-minimal bp3-small bp3-icon-play rlb-task-action rlb-task-action--play",
      "",
      (event) => {
        event.stopPropagation();
        play.disabled = true;
        void startTaskTiming(node.taskUid);
      },
      { title: `Start timing: ${title}` }
    );
    play.dataset.action = "start-timing";
    play.dataset.taskUid = node.taskUid;
    return play;
  };
  const onKeyDown = (event) => {
    if (!root?.classList.contains("rlb-root--open") || event.key !== "Escape")
      return;
    event.preventDefault();
    event.stopPropagation();
    close();
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
    refreshStatusNode.setAttribute("role", "status");
    refreshStatusNode.setAttribute("aria-live", "polite");
    refreshStatusNode.setAttribute("aria-atomic", "true");
    refreshAlertNode = el("span", "rlb-dashboard__refresh-alert rlb-visually-hidden");
    refreshAlertNode.setAttribute("role", "alert");
    refreshAlertNode.setAttribute("aria-live", "assertive");
    refreshAlertNode.setAttribute("aria-atomic", "true");
    header.append(
      selectWrapper,
      refreshButton,
      button(
        "bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button",
        "",
        close,
        { title: "Close" }
      ),
      refreshStatusNode,
      refreshAlertNode
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
    focusTrap.deactivate();
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
        focusTrap.activate();
        render();
        const dialog = root.querySelector(".rlb-dialog");
        const initial = dialog.querySelector(
          'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'
        );
        (initial || dialog)?.focus();
      } catch (error) {
        root?.classList.remove("rlb-root--open");
        root?.setAttribute("aria-hidden", "true");
        document.removeEventListener("keydown", onKeyDown, true);
        focusTrap.deactivate();
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
      activityNode = null;
      lastModel = null;
      refreshRuntime.dispose();
      focusTrap.deactivate();
      focusInFlight = null;
      refreshButton = null;
      refreshStatusNode = null;
      refreshAlertNode = null;
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
var persist = (key, value) => {
  try {
    return Boolean(writeSetting(key, value));
  } catch {
    return false;
  }
};
var mapFromData = (data, { strict = false } = {}) => {
  if (!isRecord(data))
    throw new Error("pomodoro data must be an object");
  const next = /* @__PURE__ */ new Map();
  const invalid = [];
  for (const [clockUid, minutes] of Object.entries(data)) {
    if (typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0)
      next.set(clockUid, minutes);
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
  const saved = persist(SETTING_POMODORO_CYCLE, serializedCycle(next));
  cycle = next ? { ...next } : null;
  if (!saved) {
    notice2 || (notice2 = "Pomodoro cycle could not be saved yet; the current cycle remains in memory.");
  }
  return saved;
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
    if (firstWarning || hasStateBackup(SETTING_POMODORO_CYCLE, raw))
      unsupportedCycleRaw = null;
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
  targets = next;
  const saved = persist(SETTING_POMODORO_STATE, serialized(next));
  if (!saved)
    notice2 || (notice2 = "Pomodoro state could not be saved yet; the current state remains in memory.");
  return saved;
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
var sameCycle = (left, right) => {
  if (left === right)
    return true;
  if (!left || !right)
    return false;
  return left.startedAt === right.startedAt && left.thresholdMinutes === right.thresholdMinutes;
};
function reconcile(running2) {
  const cycleBefore = getCycle();
  const cycleAfter = reconcileCycle(running2);
  if (unsupportedRaw !== null)
    return !sameCycle(cycleBefore, cycleAfter);
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
    return !sameCycle(cycleBefore, cycleAfter);
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
    if (failedCount <= 0)
      return result.notice || GRAPH_SYNC_RETRY_NOTICE;
    const completedText = `${completed} ${noun}${completed === 1 ? "" : "s"} ${completedVerb}`;
    const failedText = `${failedCount} could not be updated`;
    return completed > 0 ? `${completedText}; ${failedText}. Retry after Roam finishes syncing.` : `${failedText[0].toUpperCase()}${failedText.slice(1)}. Retry after Roam finishes syncing.`;
  }
  return "";
}
function presentMutationResult(result, notifyUser) {
  if (!result || typeof result !== "object" && typeof result !== "function")
    return result;
  if (presentedResults.has(result))
    return result;
  presentedResults.add(result);
  const notice3 = mutationResultNotice(result);
  if (notice3)
    notifyUser?.(notice3);
  return result;
}

// src/styles/tokens.js
var TOKENS = String.raw`.rlb-topbar {
    --rlb-topbar-load-yellow: #b38600;
    --rlb-topbar-load-red: #c23030;
}

.bp3-dark .rlb-topbar {
    --rlb-topbar-load-yellow: #e6c35c;
    --rlb-topbar-load-red: #ff7373;
}

.rlb-popover,
.rlb-root {
    --rlb-surface-action-height: 32px;
    --rlb-surface-action-inset: 12px;
    --rlb-surface-title-size: 10px;
    --rlb-surface-task-size: 13px;
    --rlb-surface-meta-size: 11px;
    --rlb-surface-action-size: 13px;
    --rlb-surface-row-padding: 5px;
    --rlb-surface-border: rgba(16, 22, 26, 0.12);
    --rlb-surface-border-light: rgba(16, 22, 26, 0.08);
    --rlb-surface-hover: rgba(167, 182, 194, 0.15);
    --rlb-surface-focused: rgba(167, 182, 194, 0.08);
    --rlb-surface-link: #316a9f;
    --rlb-surface-link-hover: #2a5a8d;
    --rlb-session-running: #7eb794;
    --rlb-canvas: var(--roam-bg-color, #fdfdfd);
    --rlb-surface: var(--roam-bg-color, #fdfdfd);
    --rlb-surface-subtle: var(--roam-secondary-bg-color, #f5f8fa);
    --rlb-text: var(--roam-primary-color, #182026);
    --rlb-muted: var(--roam-muted-color, #5c7080);
    --rlb-border: rgba(16, 22, 26, 0.14);
    --rlb-border-light: rgba(16, 22, 26, 0.08);
    --rlb-task-link-hover: rgba(167, 182, 194, 0.14);
    --rlb-accent: var(--roam-accent-color, #316a9f);
    --rlb-accent-soft: rgba(49, 106, 159, 0.12);
    --rlb-overlay: rgba(16, 22, 26, 0.56);
}

.bp3-dark .rlb-popover,
.bp3-dark .rlb-root {
    --rlb-surface-border: rgba(255, 255, 255, 0.14);
    --rlb-surface-border-light: rgba(255, 255, 255, 0.09);
    --rlb-surface-hover: rgba(167, 182, 194, 0.18);
    --rlb-surface-focused: rgba(167, 182, 194, 0.08);
    --rlb-surface-link: #7eb7d5;
    --rlb-surface-link-hover: #9dcae2;
    --rlb-session-running: #8ed0aa;
    --rlb-canvas: var(--roam-bg-color, #293742);
    --rlb-surface: var(--roam-bg-color, #293742);
    --rlb-surface-subtle: var(--roam-secondary-bg-color, #202b33);
    --rlb-text: var(--roam-primary-color, #f5f8fa);
    --rlb-muted: var(--roam-muted-color, #a7b6c2);
    --rlb-border: rgba(255, 255, 255, 0.17);
    --rlb-border-light: rgba(255, 255, 255, 0.09);
    --rlb-task-link-hover: rgba(167, 182, 194, 0.18);
    --rlb-accent: #48aff0;
    --rlb-accent-soft: rgba(72, 175, 240, 0.14);
    --rlb-overlay: rgba(16, 22, 26, 0.74);
}`;

// src/styles/topbar.js
var TOPBAR = String.raw`.rlb-topbar {
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


.rlb-topbar__button--active {
    column-gap: 6px;
}

.rlb-topbar__button--active > .rlb-topbar__icon {
    flex: 0 0 auto;
}


/* The widget shares the left navigation row with Roam's expanding search.
   These classes are applied to the actual host/child found at attach time, so
   the search can shrink into remaining space without ever shrinking this unit. */
.rlb-topbar__layout {
    align-items: center;
    min-width: 0;
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
`;

// src/styles/surface.js
var SURFACE = String.raw`/* ---- popover ---- */

/* Lives on <body>, positioned from the button's rect, so the topbar cannot clip it. */
.rlb-popover {
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
    color: var(--rlb-muted);
    font-size: var(--rlb-surface-title-size, 10px);
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 1;
}

.rlb-surface__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    column-gap: 6px;
    min-width: 0;
    padding: 0 var(--rlb-surface-action-inset) 4px 2px;
}

.rlb-surface__header .rlb-popover__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-surface__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-width: 0;
}

.rlb-surface__header > .rlb-surface__actions {
    margin-top: -2px;
}

.rlb-surface__header .bp3-button {
    flex: 0 0 auto;
    color: #5c7080;
}

.bp3-dark .rlb-surface__header .bp3-button {
    color: #a7b6c2;
}

.rlb-surface__icon-button {
    box-sizing: border-box;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height) !important;
    max-width: var(--rlb-surface-action-height);
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height) !important;
    max-height: var(--rlb-surface-action-height);
    margin: 0;
    padding: 0 !important;
    border-radius: 4px;
}

.rlb-surface__icon-button::before {
    margin: 0 !important;
}

.rlb-surface__icon-button:hover,
.rlb-surface__icon-button:focus-visible {
    background: var(--rlb-surface-hover);
}

.rlb-surface__refresh-cell {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height);
    max-width: var(--rlb-surface-action-height);
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
}

.rlb-surface__refresh-cell .rlb-surface__refresh {
    flex: 0 0 var(--rlb-surface-action-height);
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-surface__list {
    display: grid;
    gap: 0;
    min-width: 0;
    margin: 0 2px;
    padding: 0;
}

.rlb-surface__section {
    min-width: 0;
}

.rlb-surface__section--focused {
    margin-bottom: 6px;
    padding: 3px;
    border: 1px solid var(--rlb-surface-border);
    border-radius: 6px;
    background: var(--rlb-surface-focused);
}

.rlb-surface__section--focused .rlb-surface__section-label {
    padding: 3px 6px 2px;
}

.rlb-surface__section--focused .rlb-run {
    padding: 6px 6px 7px;
}

.rlb-surface__section--focused .rlb-run:hover,
.rlb-surface__section--focused .rlb-run:focus-within {
    background: var(--rlb-surface-hover);
}

.rlb-surface__section--recent {
    margin-top: 1px;
}

.rlb-surface__section--recent .rlb-surface__section-label {
    padding: 4px 6px 4px;
    border-bottom: 1px solid var(--rlb-surface-border-light);
}

.rlb-surface__section--recent .rlb-run {
    grid-template-columns: minmax(0, 1fr) max-content;
    padding: 6px;
    border-radius: 0;
    background: transparent;
}

.rlb-surface__section--recent .rlb-run + .rlb-run {
    border-top: 1px solid var(--rlb-surface-border-light);
}

.rlb-surface__section--recent .rlb-run:hover,
.rlb-surface__section--recent .rlb-run:focus-within {
    background: var(--rlb-surface-hover);
}

.rlb-surface__section--open-lines .rlb-surface__section-label {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    align-items: start;
}

.rlb-surface__section-context {
    display: block;
    margin-left: 0;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
}


.rlb-surface__section-label {
    padding: 7px 6px 3px;
    color: var(--rlb-muted);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.65px;
    line-height: 1.2;
    text-transform: uppercase;
}

.rlb-run--recent {
    opacity: 0.88;
}

.rlb-run--recent:hover,
.rlb-run--recent:focus-within {
    opacity: 1;
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

.rlb-surface__footer {
    display: flex;
    min-width: 0;
    gap: 5px;
    margin: 6px 2px 0;
    padding-top: 6px;
    border-top: 1px solid var(--rlb-surface-border);
}

.rlb-surface__footer .bp3-button {
    flex: 1 1 auto;
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

.rlb-surface__footer .bp3-button:not(.bp3-minimal) {
    border: 1px solid var(--rlb-surface-border);
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
    color: #5c7080;
}

.rlb-surface__footer .bp3-button:not(.bp3-minimal):hover,
.rlb-surface__footer .bp3-button:not(.bp3-minimal):focus-visible {
    background: var(--rlb-surface-hover);
}

@keyframes rlb-surface-refresh-spin {
    to {
        transform: rotate(360deg);
    }
}

.rlb-surface__refresh--loading::before {
    animation: rlb-surface-refresh-spin 900ms linear infinite;
}

@media (prefers-reduced-motion: reduce) {
    .rlb-surface__refresh--loading::before {
        animation: none;
    }
}

.rlb-surface__refresh:hover,
.rlb-surface__refresh:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.bp3-dark .rlb-surface__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
}

.rlb-run {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: start;
    grid-auto-rows: minmax(0, auto);
    gap: 5px;
    padding: var(--rlb-surface-row-padding, 5px) 6px;
    border-radius: 3px;
}

.rlb-run:hover {
    background: rgba(167, 182, 194, 0.2);
}

.rlb-run__body {
    min-width: 0;
    display: contents;
}

.bp3-button.bp3-minimal.rlb-run__title {
    grid-column: 1;
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
    text-decoration: none;
    border-radius: 2px;
}

.bp3-button.bp3-minimal.rlb-run__title::before {
    display: none !important;
    content: none !important;
}

.bp3-button.bp3-minimal.rlb-run__title:hover,
.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    color: var(--rlb-surface-link-hover);
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

.rlb-surface__section--focused .bp3-button.bp3-minimal.rlb-run__title {
    font-weight: 600;
}

.rlb-surface__section--recent .bp3-button.bp3-minimal.rlb-run__title {
    font-size: 13px;
    font-weight: 500;
}

.rlb-run__meta {
    grid-column: 1;
    grid-row: 2;
    display: block;
    min-width: 0;
    font-size: var(--rlb-surface-meta-size, 10px);
    line-height: 1.25;
    color: var(--rlb-muted);
    opacity: 1;
    font-variant-numeric: tabular-nums;
}

.rlb-run__meta .rlb-run__meta-primary {
    display: inline-flex;
    align-items: baseline;
    min-width: 0;
}

.rlb-surface__section--focused .rlb-run__elapsed {
    color: #405b70;
    font-size: 1.08em;
    font-weight: 700;
}

.rlb-surface__section--focused .rlb-run__meta {
    opacity: 1;
}

.rlb-surface__section--focused .rlb-run__total,
.rlb-surface__section--focused .rlb-run__started,
.rlb-surface__section--focused .rlb-run__meta > .rlb-run__meta-separator {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-surface__section--focused .rlb-run__total {
    font-weight: 600;
}

.bp3-dark .rlb-surface__section--focused .rlb-run__elapsed {
    color: #c3d4df;
}

.rlb-surface__section--focused .rlb-run--overrun .rlb-run__elapsed {
    color: #cd4246;
}

.bp3-dark .rlb-surface__section--focused .rlb-run--overrun .rlb-run__elapsed {
    color: #ff7373;
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
    grid-column: 1 / 3;
    display: flex;
    align-items: baseline;
    flex-wrap: nowrap;
    gap: 0;
    max-width: 100%;
    white-space: nowrap;
}

.rlb-run--inline-meta .rlb-run__meta-line {
    flex: 0 1 auto;
    min-width: 0;
}

.rlb-run--inline-meta .rlb-run__meta-primary {
    flex: 0 1 auto;
}

.rlb-run--inline-meta .rlb-run__meta-separator {
    flex: 0 0 auto;
    margin: 0 6px;
    line-height: 1;
}

.rlb-run__meta-primary .rlb-run__meta-separator {
    margin: 0 2px;
}

.rlb-run--inline-meta .rlb-run__started {
    flex: 0 0 auto;
    max-width: none;
}

.rlb-run__actions {
    grid-column: 2;
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

.rlb-run__actions .rlb-run__focus {
    width: 28px;
    min-width: 28px;
    max-width: 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: var(--rlb-muted, #7a8b99);
}

.rlb-run__actions .rlb-run__focus:hover,
.rlb-run__actions .rlb-run__focus:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: rgba(167, 182, 194, 0.24);
}

.rlb-run__actions .rlb-run__completed {
    display: inline-flex;
    flex: 0 0 28px;
    width: 28px;
    min-width: 28px;
    max-width: 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    align-items: center;
    justify-content: center;
    color: var(--rlb-muted, #7a8b99);
    opacity: 0.8;
    pointer-events: none;
}

.rlb-run__actions .rlb-run__completed::before {
    margin: 0;
}

.rlb-run__actions .rlb-run__checkout:hover,
.rlb-run__actions .rlb-run__checkout:focus {
    color: #c23030;
}

.rlb-run__actions .bp3-icon-trash {
    box-sizing: border-box;
    display: inline-flex;
    flex: 0 0 var(--rlb-surface-action-height, 32px);
    width: var(--rlb-surface-action-height, 32px);
    min-width: var(--rlb-surface-action-height, 32px);
    max-width: var(--rlb-surface-action-height, 32px);
    height: var(--rlb-surface-action-height, 32px);
    min-height: var(--rlb-surface-action-height, 32px);
    max-height: var(--rlb-surface-action-height, 32px);
    padding: 0 !important;
    align-items: center;
    justify-content: center;
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
`;

// src/styles/dashboard.js
var DASHBOARD = String.raw`/* ---- dashboard ---- */

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
    align-items: flex-start;
    padding: clamp(24px, 7vh, 64px) 24px 32px;
    background: var(--rlb-overlay);
    color: var(--rlb-text);
    font-family: inherit;
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
    border-collapse: separate;
    border-spacing: 0;
    font-variant-numeric: tabular-nums;
}

.rlb-table th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    border-bottom: 0;
    color: var(--rlb-muted);
}

.rlb-table td {
    padding: 6px 8px;
    border-bottom: 0;
    vertical-align: top;
    font-size: 13px;
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
    color: var(--rlb-muted);
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

/* Self-contained specificity, for the same reason as the task-link rules. */
.rlb-tree__layout.rlb-tree__layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) max-content;
    align-items: start;
    column-gap: 12px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: visible;
}

.rlb-tree__leading {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.rlb-tree__content.rlb-tree__content {
    display: flex;
    align-items: baseline;
    flex: 1 1 auto;
    width: auto;
    max-width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    gap: 4px;
    overflow: visible;
}

.rlb-tree__actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-width: max-content;
    min-height: 20px;
}

.rlb-task-action {
    flex: 0 0 24px;
    width: 24px;
    min-width: 24px;
    max-width: 24px;
    height: 24px;
    min-height: 24px;
    max-height: 24px;
    padding: 0 !important;
    align-items: center;
    justify-content: center;
    color: var(--rlb-muted, #5c7080);
}

.rlb-task-action--play:hover,
.rlb-task-action--play:focus-visible {
    color: var(--rlb-surface-link-hover, #316a9f);
    background: var(--rlb-task-link-hover, rgba(167, 182, 194, 0.14));
}

.rlb-task-action--timing {
    display: inline-flex;
    opacity: 0.78;
    pointer-events: none;
}

.rlb-task-action--timing::before {
    margin: 0;
}

.rlb-section__heading {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
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

.bp3-button.bp3-minimal.rlb-task-link {
    color: var(--rlb-surface-link);
    text-decoration: none;
    border-radius: 3px;
}

.bp3-button.bp3-minimal.rlb-task-link::before {
    display: none !important;
    content: none !important;
}

.bp3-button.bp3-minimal.rlb-task-link > .rlb-task-link__text {
    color: inherit;
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link:hover,
.bp3-button.bp3-minimal.rlb-task-link:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: var(--rlb-task-link-hover, rgba(167, 182, 194, 0.14));
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link:focus-visible {
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

/* Specificity here has to beat Blueprint's own .bp3-button.bp3-minimal rules
   (three classes) without depending on a .rlb-root ancestor: the By Task table
   is rendered standalone in layout tests and could be reparented in the dialog.
   Repeating .rlb-task-table is a self-contained way to outrank them. */
.rlb-task-table.rlb-task-table .rlb-task-link {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    justify-content: flex-start;
    text-align: left;
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
    text-overflow: initial;
}

.rlb-task-table.rlb-task-table .rlb-task-link > .rlb-task-link__text {
    display: block;
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    max-width: 100%;
    margin: 0;
    padding: 0;
    text-align: left;
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.rlb-muted {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--rlb-muted);
    opacity: 1;
}

/* ---- Roam-native dashboard shell ---- */

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

/* Single-focus mode exposes at most one live CLOCK. Keep this control surface
   compact while preserving the table labels and 32px action targets. */
.rlb-running.rlb-dashboard-panel {
    padding: 8px 12px 7px;
}

.rlb-running .rlb-panel__header {
    margin-bottom: 2px;
}

.rlb-dashboard .rlb-running .rlb-table th {
    padding-top: 2px;
    padding-bottom: 2px;
}

.rlb-dashboard .rlb-running .rlb-table td {
    padding-top: 2px;
    padding-bottom: 2px;
    vertical-align: middle;
}
`;

// src/styles/activity.js
var ACTIVITY = String.raw`/* Activity is the one visual summary in the Dashboard. Keep its geometry
   deliberately bounded: values sit above each bar and the date remains below
   it, with no secondary axis or scroll rail competing for attention. */
.rlb-dashboard .rlb-activity {
    box-sizing: border-box;
    height: 198px;
    min-height: 198px;
    overflow: hidden;
}

.rlb-dashboard .rlb-activity .rlb-panel__header {
    margin-bottom: 6px;
}

.rlb-activity__chart {
    position: relative;
    height: 157px;
    min-width: 0;
    overflow: hidden;
}

.rlb-activity__plot {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--rlb-activity-columns, 1), minmax(0, 1fr));
    align-items: stretch;
    gap: 4px;
    height: 100%;
    min-width: 0;
    padding: 0 2px;
    border-bottom: 1px solid var(--rlb-border-light);
    box-sizing: border-box;
}

.rlb-activity__bucket {
    display: grid;
    grid-template-rows: 18px minmax(0, 1fr) 20px;
    align-items: stretch;
    min-width: 0;
    height: 100%;
    color: var(--rlb-muted);
    text-align: center;
    font-variant-numeric: tabular-nums;
    outline: none;
}

.rlb-activity__bucket:focus-visible {
    border-radius: 3px;
    box-shadow: 0 0 0 2px var(--rlb-muted);
}

.rlb-activity__duration,
.rlb-activity__date {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-activity__duration {
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
}

.rlb-activity__unit {
    flex: 0 0 auto;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.45px;
    line-height: 1.25;
    opacity: 1;
}

.rlb-activity__bar-wrap {
    display: flex;
    min-height: 0;
    align-items: flex-end;
    justify-content: center;
}

.rlb-activity__bar {
    display: block;
    width: var(--rlb-activity-bar-width, 18px);
    max-width: 100%;
    min-height: 2px;
    max-height: 100%;
    border-radius: 2px 2px 0 0;
    background: var(--rlb-session-running);
}

.rlb-activity__bucket--empty .rlb-activity__duration {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-activity__bucket--empty .rlb-activity__bar {
    opacity: 0.35;
}

.rlb-activity__date {
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 500;
    line-height: 20px;
}
`;

// src/styles/tasks.js
var TASKS = String.raw`.rlb-panel__header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 7px;
}

.rlb-panel__header .rlb-section__title {
    flex: 0 0 auto;
}

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

.rlb-by-task {
    overflow: visible;
}

/* The task toolbar and table header belong to the document flow. Keeping them
   static prevents a dashboard scroll from turning them into an opaque banner
   over the task rows. */
.rlb-by-task > .rlb-section__heading,
.rlb-by-task .rlb-task-table thead th {
    position: static;
}

.rlb-task-count {
    flex: 0 0 auto;
    color: var(--rlb-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    white-space: nowrap;
}

.rlb-task-filters {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 1px;
    min-width: 0;
    padding: 2px;
    border: 1px solid var(--rlb-border-light);
    border-radius: 5px;
    background: var(--rlb-surface-subtle);
}

.rlb-root .bp3-button.rlb-task-filter {
    min-width: 38px;
    height: 22px;
    min-height: 22px;
    padding: 2px 7px;
    border-radius: 3px;
    color: var(--rlb-muted);
    font-size: 10px;
    font-weight: 600;
}

.rlb-task-filter[aria-pressed='true'] {
    background: var(--rlb-surface);
    box-shadow: 0 1px 2px rgba(16, 22, 26, 0.12);
    color: var(--rlb-text);
}

.rlb-root .bp3-button.rlb-tree__collapse-all {
    flex: 0 0 auto;
    height: 22px;
    min-height: 22px;
    margin-left: auto;
    padding: 2px 6px;
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 600;
}

.rlb-task-table-host {
    min-width: 0;
}

.rlb-task-empty {
    padding: 20px 8px 12px;
    color: var(--rlb-muted);
    font-size: 12px;
    text-align: center;
}

.rlb-row--context > td {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-row--context .rlb-task-link {
    color: var(--rlb-muted);
}

.rlb-task-sort-button {
    display: inline-flex;
    width: 100%;
    min-height: 22px;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    padding: 2px 0 2px 4px;
    color: inherit;
    font-size: inherit;
    font-weight: 600;
    letter-spacing: inherit;
    line-height: inherit;
    text-transform: inherit;
}

.rlb-task-table th:not(.rlb-table__num) .rlb-task-sort-button {
    justify-content: flex-start;
}

.rlb-task-sort-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-task-sort-arrow {
    flex: 0 0 auto;
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
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

`;

// src/styles/responsive.js
var RESPONSIVE = String.raw`@media (max-width: 600px) {
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

    .rlb-dashboard .rlb-activity {
        height: 190px;
        min-height: 190px;
        overflow: hidden;
    }

    .rlb-activity__chart {
        height: 149px;
    }

    .rlb-activity__plot {
        gap: 2px;
        padding: 0 1px;
    }

    .rlb-activity__duration,
    .rlb-activity__date {
        font-size: 11px;
    }

    .rlb-tree__collapse-all {
        margin-left: auto;
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

@media (max-width: 719px) {
    .rlb-by-task > .rlb-section__heading {
        align-items: flex-start;
        flex-wrap: wrap;
        row-gap: 4px;
        height: auto;
        min-height: 34px;
        margin: -12px -14px 6px;
        padding: 6px 10px;
    }

    .rlb-task-filters {
        max-width: 100%;
        flex-wrap: wrap;
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

// src/styles.js
var STYLE_ID = "roam-logbook-styles";
var STYLES = [TOKENS, TOPBAR, SURFACE, DASHBOARD, ACTIVITY, TASKS, RESPONSIVE].join("\n");

// src/session-surface.js
var sessionCount = (count) => `${count} Session${count === 1 ? "" : "s"}`;
var SURFACE_TITLE = "ACTIVE THREADS";
var rowFigures = (entry, now) => {
  const elapsed = now.getTime() - entry.start.getTime();
  const total = (entry.priorMinutes || 0) + Math.floor(elapsed / 6e4);
  return {
    elapsed: formatElapsed(elapsed),
    total: formatMinutesHuman(total)
  };
};
var fullTaskLabel = (title) => `Open this block: ${title}`;
var focusRecentLabel = (title) => `Switch Focus to ${title}`;
var refreshLabel = "Refresh Active Work from graph";
var dashboardLabel = "Open Roam Logbook Dashboard";
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
var renderRunningFigures = (entry, now) => {
  const figures = rowFigures(entry, now);
  const primary = el("div", "rlb-run__meta-line rlb-run__meta-primary");
  primary.append(
    el("span", "rlb-run__elapsed", figures.elapsed),
    el("span", "rlb-run__meta-separator", " \xB7 "),
    el("span", "rlb-run__total", `${figures.total} total`)
  );
  primary.querySelector(".rlb-run__meta-separator").setAttribute("aria-hidden", "true");
  return primary;
};
var renderTitle = (row, onOpenTask) => {
  const title = formatDisplayTitle(row);
  const recent = row.kind === "recent";
  const taskButton = button(
    `bp3-button bp3-minimal rlb-run__title${recent ? " rlb-run__title--recent" : ""}`,
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
  const node = el(
    "div",
    `rlb-run rlb-run--inline-meta${overrun ? " rlb-run--overrun" : ""}`
  );
  node.dataset.sessionState = "running";
  node.dataset.clockUid = entry.clockUid;
  node.dataset.taskUid = entry.taskUid;
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  meta.dataset.clockUid = entry.clockUid;
  const primary = renderRunningFigures(entry, now);
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
  node.append(body, actions);
  return node;
};
var renderRecentRow = (row, now, options) => {
  const entry = row.entry;
  const node = el("div", "rlb-run rlb-run--recent rlb-run--inline-meta");
  node.dataset.sessionState = "recent";
  node.dataset.taskUid = entry.taskUid;
  node.dataset.clockUid = entry.clockUid;
  if (row.status)
    node.dataset.taskStatus = row.status;
  const body = el("div", "rlb-run__body");
  const meta = el("div", "rlb-run__meta");
  const ended = formatStarted(entry.end, now);
  const total = formatMinutesHuman(entry.priorMinutes || entry.minutes || 0);
  const minutesLeft = Math.max(
    1,
    openLineMinutesLeft(entry, now, options.openLineWindowMinutes)
  );
  const metadata = `${total} total \xB7 leaves in ${minutesLeft}m`;
  const lastActiveLabel = `Last active ${ended.raw}`;
  const endedNode = el(
    "time",
    "rlb-run__meta-line rlb-run__recent-meta",
    metadata
  );
  endedNode.title = `${metadata}; ${lastActiveLabel}`;
  endedNode.setAttribute("aria-label", `${total} total; leaves in ${minutesLeft}m; ${lastActiveLabel}`);
  if (ended.datetime)
    endedNode.dateTime = ended.datetime;
  endedNode.dataset.openLineEnd = String(entry.end instanceof Date ? entry.end.getTime() : entry.end);
  meta.appendChild(endedNode);
  body.append(renderTitle(row, options.onOpenTask), meta);
  const actions = el("div", "rlb-run__actions");
  if (row.status === "DONE") {
    const completed = el("span", "bp3-icon bp3-icon-tick-circle rlb-run__completed");
    completed.title = "Completed";
    completed.setAttribute("role", "img");
    completed.setAttribute("aria-label", "Completed");
    actions.appendChild(completed);
  } else {
    const focus = button(
      "bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__focus",
      "",
      (event) => {
        event.stopPropagation();
        void options.onFocusRecent?.(entry, event);
      },
      { title: focusRecentLabel(formatDisplayTitle(row)) }
    );
    focus.dataset.action = "focus-recent";
    actions.appendChild(focus);
  }
  node.append(body, actions);
  return node;
};
function buildSessionSurfaceModel({
  entries = [],
  recentItems = [],
  now,
  windowMinutes = ACTIVE_WORK_WINDOW_MINUTES,
  staleHours: staleHours2 = 8
}) {
  const currentNow = now instanceof Date ? now : new Date(now);
  const normalizedWindow = Number.isFinite(Number(windowMinutes)) && Number(windowMinutes) > 0 ? Number(windowMinutes) : ACTIVE_WORK_WINDOW_MINUTES;
  const runningRows = entries.map((entry) => ({
    kind: "focused",
    key: `focused:${entry.clockUid}`,
    taskUid: entry.taskUid,
    taskString: entry.taskString,
    title: entry.title,
    status: entry.status ?? null,
    entry
  }));
  const recentRows = recentItems.map((entry) => ({
    kind: "recent",
    key: `recent:${entry.taskUid}`,
    taskUid: entry.taskUid,
    taskString: entry.taskString,
    title: entry.title,
    status: entry.status ?? null,
    entry
  }));
  return {
    now: currentNow,
    entries: entries.slice(),
    rows: [...runningRows, ...recentRows],
    focusedRows: runningRows,
    recentRows,
    focusedCount: runningRows.length,
    activeCount: runningRows.length + recentRows.length,
    runningCount: runningRows.length,
    openLineWindowMinutes: normalizedWindow,
    staleEntries: findStaleClocks(entries, currentNow, staleHours2)
  };
}
var surfaceTitle = (count) => `${SURFACE_TITLE} \xB7 ${count}`;
var appendSection = (list, label, rows, renderRow, modifier = "", context = "") => {
  if (!rows.length)
    return;
  const section = el("section", `rlb-surface__section ${modifier}`.trim());
  const labelNode = el("div", "rlb-surface__section-label");
  labelNode.appendChild(el("span", "rlb-surface__section-label-text", label));
  if (context) {
    labelNode.appendChild(el("span", "rlb-surface__section-context", context));
  }
  section.setAttribute("aria-label", context ? `${label}, ${context}` : label);
  section.appendChild(labelNode);
  for (const row of rows)
    section.appendChild(renderRow(row));
  list.appendChild(section);
};
var renderRefreshControl = (options) => {
  const refreshState = options.refreshState || {};
  const state = ["idle", "loading", "success", "error"].includes(refreshState.state) ? refreshState.state : "idle";
  const refreshCell = el("div", "rlb-surface__refresh-cell");
  refreshCell.dataset.refreshState = state;
  const refresh2 = button(
    `bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__icon-button rlb-surface__refresh rlb-surface__refresh--${state}`,
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
  return refreshCell;
};
function renderSessionSurface(root, model, options = {}) {
  const title = el("div", "rlb-popover__title", surfaceTitle(model.activeCount ?? model.rows.length));
  if (options.titleId)
    title.id = options.titleId;
  const header = el("header", "rlb-surface__header");
  header.appendChild(title);
  const headerActions = el("div", "rlb-surface__actions");
  if (options.onOpenDashboard) {
    const dashboard = button(
      "bp3-button bp3-minimal bp3-small bp3-icon-dashboard rlb-surface__icon-button rlb-surface__dashboard",
      "",
      () => options.onOpenDashboard(),
      { title: dashboardLabel }
    );
    dashboard.dataset.action = "dashboard";
    headerActions.appendChild(dashboard);
  }
  if (options.onRefresh)
    headerActions.appendChild(renderRefreshControl(options));
  if (options.onClose) {
    const close = button(
      "bp3-button bp3-minimal bp3-small bp3-icon-cross rlb-surface__icon-button rlb-surface__close",
      "",
      () => options.onClose(),
      { title: "Close Current Sessions" }
    );
    close.dataset.action = "close";
    headerActions.appendChild(close);
  }
  if (headerActions.childElementCount > 0)
    header.appendChild(headerActions);
  root.replaceChildren(header);
  const sessionList = el("div", "rlb-surface__list");
  sessionList.setAttribute("role", "group");
  sessionList.setAttribute("aria-label", "Active Threads");
  root.appendChild(sessionList);
  if (model.rows.length === 0) {
    sessionList.appendChild(
      el("div", "rlb-popover__empty", options.emptyMessage || "No Timing Line is active.")
    );
  } else {
    if (model.staleEntries?.length > 0) {
      sessionList.appendChild(
        el(
          "div",
          "rlb-popover__empty bp3-text-small",
          `${sessionCount(model.staleEntries.length)} ${model.staleEntries.length > 1 ? "have" : "has"} been open for over ${options.staleHours || 8}h \u2014 likely forgotten.`
        )
      );
    }
    appendSection(
      sessionList,
      "TIMING",
      model.focusedRows,
      (row) => renderRunningRow(row, model.now, options),
      "rlb-surface__section--focused"
    );
    appendSection(
      sessionList,
      `PARALLEL THREADS \xB7 ${model.recentRows.length}`,
      model.recentRows,
      (row) => renderRecentRow(row, model.now, options),
      "rlb-surface__section--open-lines rlb-surface__section--recent",
      `Leave after ${model.openLineWindowMinutes ?? ACTIVE_WORK_WINDOW_MINUTES}m without focus`
    );
  }
  for (const notice3 of options.notices || []) {
    const message = typeof notice3 === "string" ? notice3 : notice3?.message;
    if (!message)
      continue;
    const role = notice3?.role === "alert" ? "alert" : "status";
    const node = el("div", "rlb-popover__notice bp3-text-small", message);
    node.setAttribute("role", role);
    node.setAttribute("aria-live", role === "alert" ? "assertive" : "polite");
    node.setAttribute("aria-atomic", "true");
    root.appendChild(node);
  }
  if (model.runningCount > 1 && options.onClockOutAll) {
    const footer = el("footer", "rlb-surface__footer");
    const confirming = Boolean(options.clockOutAllConfirm);
    footer.appendChild(
      button(
        `bp3-button bp3-small${confirming ? " bp3-intent-danger" : ""}`,
        confirming ? "Confirm Clock Out All" : "Clock Out All",
        () => options.onClockOutAll(),
        {
          title: confirming ? "Confirm permanent Clock Out All" : "Close all running Sessions"
        }
      )
    );
    root.appendChild(footer);
  }
  return root;
}
function updateSessionSurfaceElapsed(root, entries, now, openLines = [], openLineWindowMinutes = ACTIVE_WORK_WINDOW_MINUTES) {
  if (!root)
    return;
  const currentNow = now instanceof Date ? now : new Date(now);
  const byUid = new Map(entries.map((entry) => [entry.clockUid, entry]));
  for (const meta of root.querySelectorAll('.rlb-run[data-session-state="running"] .rlb-run__meta')) {
    const entry = byUid.get(meta.dataset.clockUid);
    if (!entry)
      continue;
    const primary = meta.querySelector(".rlb-run__meta-primary");
    if (primary) {
      const figures = rowFigures(entry, currentNow);
      const elapsed = primary.querySelector(".rlb-run__elapsed");
      const total = primary.querySelector(".rlb-run__total");
      if (elapsed && total) {
        elapsed.textContent = figures.elapsed;
        total.textContent = `${figures.total} total`;
      } else {
        primary.textContent = `${figures.elapsed} \xB7 ${figures.total} total`;
      }
    }
    const row = meta.closest(".rlb-run");
    if (row) {
      const overrun = isCycleOverrun(currentNow);
      row.classList.toggle("rlb-run--overrun", overrun);
    }
  }
  const openLinesByTask = new Map(openLines.map((entry) => [entry.taskUid, entry]));
  for (const meta of root.querySelectorAll('.rlb-run[data-session-state="recent"] .rlb-run__meta')) {
    const row = meta.closest(".rlb-run");
    const entry = openLinesByTask.get(row?.dataset.taskUid);
    const recentMeta = meta.querySelector(".rlb-run__recent-meta");
    if (!entry || !recentMeta)
      continue;
    const total = formatMinutesHuman(entry.priorMinutes || entry.minutes || 0);
    const minutesLeft = Math.max(
      1,
      openLineMinutesLeft(entry, currentNow, openLineWindowMinutes)
    );
    const metadata = `${total} total \xB7 leaves in ${minutesLeft}m`;
    const ended = formatStarted(entry.end, currentNow);
    const lastActiveLabel = `Last active ${ended.raw}`;
    recentMeta.textContent = metadata;
    recentMeta.title = `${metadata}; ${lastActiveLabel}`;
    recentMeta.setAttribute("aria-label", `${total} total; leaves in ${minutesLeft}m; ${lastActiveLabel}`);
  }
}

// src/topbar.js
var WIDGET_ID = "roam-logbook-topbar";
var POPOVER_ID = "roam-logbook-popover";
var POPOVER_TITLE_ID = "roam-logbook-popover-title";
var TOPBAR_SELECTOR2 = ".rm-topbar";
var REFRESH_SUCCESS_DURATION = 1800;
var REFRESH_LOADING_MESSAGE = "Refreshing Active Work from graph\u2026";
var REFRESH_SUCCESS_MESSAGE = "Updated just now";
var REFRESH_ERROR_MESSAGE = "Refresh failed; last valid snapshot kept. Retry.";
var RECOVERY_TIMEOUT_MS = 15e3;
var RECOVERY_FLUSH_LIMIT = 32;
var activeCount = (count) => `${count} Thread${count === 1 ? "" : "s"}`;
var activeWorkDescription = (timingCount, openLineCount, windowMinutes = ACTIVE_WORK_WINDOW_MINUTES) => {
  const timing = Number.isFinite(Number(timingCount)) ? Math.max(0, Math.floor(Number(timingCount))) : 0;
  const openLines = Number.isFinite(Number(openLineCount)) ? Math.max(0, Math.floor(Number(openLineCount))) : 0;
  const window2 = Number.isFinite(Number(windowMinutes)) && Number(windowMinutes) > 0 ? Number(windowMinutes) : ACTIVE_WORK_WINDOW_MINUTES;
  return `${timing} timing line${timing === 1 ? "" : "s"} \xB7 ${openLines} parallel thread${openLines === 1 ? "" : "s"} \xB7 Leave after ${window2}m without focus`;
};
var sessionLoadTone = (count) => {
  const normalized2 = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (normalized2 >= 7)
    return "red";
  if (normalized2 >= 4)
    return "yellow";
  return "neutral";
};
function createPostPaintScheduler({
  view = typeof window === "undefined" ? null : window,
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutFn = (timerId) => clearTimeout(timerId)
} = {}) {
  return (callback) => {
    let cancelled = false;
    let frameId = null;
    let firstTaskId = null;
    let followingTaskId = null;
    const run = () => {
      followingTaskId = null;
      if (!cancelled)
        callback();
    };
    const scheduleFollowingTask = () => {
      frameId = null;
      firstTaskId = null;
      if (!cancelled)
        followingTaskId = setTimeoutFn(run, 0);
    };
    if (typeof view?.requestAnimationFrame === "function") {
      frameId = view.requestAnimationFrame(scheduleFollowingTask);
    } else {
      firstTaskId = setTimeoutFn(scheduleFollowingTask, 0);
    }
    return () => {
      cancelled = true;
      if (frameId !== null && typeof view?.cancelAnimationFrame === "function") {
        view.cancelAnimationFrame(frameId);
      }
      if (firstTaskId !== null)
        clearTimeoutFn(firstTaskId);
      if (followingTaskId !== null)
        clearTimeoutFn(followingTaskId);
      frameId = null;
      firstTaskId = null;
      followingTaskId = null;
    };
  };
}
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
  clearIntervalFn = (tickerId) => clearInterval(tickerId),
  scheduleAfterPaintFn = createPostPaintScheduler()
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
  let pendingOpenRefresh = null;
  let refreshClearTimer = null;
  let refreshState = { state: "idle", message: "" };
  let activeSignature = "";
  let themeRuntime = null;
  const layoutHosts = /* @__PURE__ */ new Set();
  const searchHosts = /* @__PURE__ */ new Set();
  const layoutHostDisplay = /* @__PURE__ */ new Map();
  let recoveryShutdownTimer = null;
  let recoveryFlushes = 0;
  let recoveryDisabled = false;
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
  const cancelPendingOpenRefresh = () => {
    const pending = pendingOpenRefresh;
    if (!pending)
      return;
    pendingOpenRefresh = null;
    pending.cancel?.();
    if (refreshState.state === "loading" && !refreshInFlight) {
      refreshState = { state: "idle", message: "" };
    }
    pending.resolve({
      ok: false,
      cancelled: true,
      running: getRunning()
    });
  };
  const closePopover = ({ restoreFocus = true } = {}) => {
    cancelPendingOpenRefresh();
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
  const sessionModel = () => {
    const activeWork = getActiveWork(nowDate());
    return buildSessionSurfaceModel({
      entries: activeWork.focused ? [activeWork.focused] : [],
      recentItems: activeWork.recent,
      now: nowDate(),
      windowMinutes: activeWork.windowMinutes,
      staleHours: staleHours()
    });
  };
  const surfaceNotices = () => actionNotice ? [{ message: actionNotice, role: "alert" }] : [getNotice()].filter(Boolean).map((message) => ({ message, role: "status" }));
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
    const request = Promise.resolve().then(() => refreshResult()).then(async (result) => {
      if (!result?.ok)
        return result;
      const snapshot = getEntriesSnapshot();
      const reconciliation = await reconcileOpenClocks({
        source: "refresh",
        entries: snapshot
      });
      return { ...result, reconciliation };
    }).then(
      (result) => {
        if (result?.ok) {
          actionNotice = "";
          setRefreshState("success", REFRESH_SUCCESS_MESSAGE, { clearAfter: true });
        } else {
          actionNotice = mutationResultNotice(result) || getNotice() || GRAPH_SYNC_RETRY_NOTICE;
          setRefreshState("error", REFRESH_ERROR_MESSAGE);
        }
        return result;
      },
      (error) => {
        console.error("[roam-logbook] could not refresh Session surface", error);
        actionNotice = mutationResultNotice(error) || getNotice() || GRAPH_SYNC_RETRY_NOTICE;
        setRefreshState("error", REFRESH_ERROR_MESSAGE);
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
    setRefreshState("loading", REFRESH_LOADING_MESSAGE);
    return refreshInFlight;
  };
  const requestSessionRefresh = () => pendingOpenRefresh?.promise || refreshSessions();
  const scheduleOpenRevalidation = () => {
    if (refreshInFlight)
      return refreshInFlight;
    if (pendingOpenRefresh)
      return pendingOpenRefresh.promise;
    let resolvePending;
    const promise = new Promise((resolve2) => {
      resolvePending = resolve2;
    });
    const pending = {
      promise,
      resolve: resolvePending,
      cancel: null
    };
    pendingOpenRefresh = pending;
    pending.cancel = scheduleAfterPaintFn(() => {
      if (pendingOpenRefresh !== pending)
        return;
      pendingOpenRefresh = null;
      if (destroyed || !popover) {
        pending.resolve({
          ok: false,
          cancelled: true,
          running: getRunning()
        });
        return;
      }
      void refreshSessions().then(pending.resolve);
    });
    return promise;
  };
  const run = async (action) => {
    cancelPendingOpenRefresh();
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
      onRefresh: requestSessionRefresh,
      onOpenTask: (taskUid, event) => {
        if (event?.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          cancelPendingOpenRefresh();
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
      onFocusRecent: (entry) => void run(() => clockIn(entry.taskUid, { source: "active-work-switch" })),
      onCheckOut: (entry) => run(() => clockOut(entry.clockUid)),
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
    options.openLineWindowMinutes = model.openLineWindowMinutes;
    options.emptyMessage = refreshState.state === "loading" ? "Refreshing Active Work state from graph\u2026" : refreshStatus.ok ? "No Timing Line is active. Right-click a TODO bullet and choose Plugins \u2192 Logbook: Clock in." : "Active Work state could not be confirmed. Retry after Roam finishes syncing.";
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
    setRefreshState("loading", REFRESH_LOADING_MESSAGE);
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
    void scheduleOpenRevalidation();
  };
  confirmation?.setOnChange(() => {
    renderSurfaces();
  });
  const syncButtonLayout = (mode) => {
    if (layoutMode === mode)
      return;
    if (mode === "idle")
      buttonNode.replaceChildren(iconNode);
    else if (mode === "active")
      buttonNode.replaceChildren(iconNode, parallelNode);
    else if (mode === "parallel")
      buttonNode.replaceChildren(timeNode, separatorNode, parallelNode);
    else
      buttonNode.replaceChildren(timeNode);
    layoutMode = mode;
  };
  const renderButton = (entries = getRunning(), now = nowDate(), { reconcile: reconcile2 = true, activeWork: suppliedActiveWork = null } = {}) => {
    if (!buttonNode)
      return;
    const derived = suppliedActiveWork || getActiveWork(now);
    const focused = derived.focused || entries[0] || null;
    const activeWork = focused === derived.focused ? derived : focused ? { ...derived, focused, items: [focused, ...derived.items], count: derived.count + (derived.items.some((item) => item.taskUid === focused.taskUid) ? 0 : 1) } : derived;
    const composition = activeWorkDescription(
      focused ? 1 : 0,
      activeWork.recent.length,
      activeWork.windowMinutes
    );
    const focusedEntries = focused ? [focused] : [];
    const running2 = focusedEntries.length > 0;
    if (running2 && reconcile2)
      reconcileCycle(focusedEntries, { now });
    const cycleElapsed = cycleElapsedMs(now);
    const overrun = isCycleOverrun(now);
    const stale = findStaleClocks(focusedEntries, now, staleHours()).length > 0;
    const loadTone = sessionLoadTone(activeWork.count);
    const signature = activeWork.items.map((item) => `${item.activeKind || "focused"}:${item.taskUid}`).join("|");
    const activeChanged = signature !== activeSignature;
    activeSignature = signature;
    parallelNode.className = loadTone === "neutral" ? "rlb-topbar__parallel" : `rlb-topbar__parallel rlb-topbar__parallel--load-${loadTone}`;
    if (!running2) {
      const hasActiveWork = activeWork.count > 0;
      buttonNode.classList.toggle("rlb-topbar__button--icon-only", !hasActiveWork);
      buttonNode.classList.toggle("rlb-topbar__button--active", hasActiveWork);
      buttonNode.classList.remove("rlb-topbar__button--parallel");
      iconNode.className = "bp3-icon bp3-icon-history rlb-topbar__icon";
      timeNode.textContent = "";
      timeNode.className = "rlb-topbar__time";
      parallelNode.textContent = hasActiveWork ? activeCount(activeWork.count) : "";
      separatorNode.textContent = "";
      syncButtonLayout(hasActiveWork ? "active" : "idle");
      buttonNode.title = hasActiveWork ? `${activeCount(activeWork.count)}
${composition}
No Timing Line is active. Click for details.` : `${activeCount(0)}
${composition}
No Active Work is available. Click for details.`;
      buttonNode.setAttribute("aria-label", buttonNode.title);
      if (activeChanged && popover)
        renderPopover();
      return;
    }
    buttonNode.classList.remove("rlb-topbar__button--icon-only");
    buttonNode.classList.remove("rlb-topbar__button--active");
    const first = activeWork.focused || focusedEntries[0];
    const state = overrun ? "overrun" : stale ? "stale" : "neutral";
    timeNode.className = `rlb-topbar__time rlb-topbar__time--${state}`;
    timeNode.textContent = formatElapsed(cycleElapsed);
    buttonNode.classList.add("rlb-topbar__button--parallel");
    parallelNode.textContent = activeCount(activeWork.count);
    separatorNode.textContent = "";
    syncButtonLayout("parallel");
    if (activeWork.count > 1) {
      const threshold = cycleThresholdMinutes();
      buttonNode.title = `${activeCount(activeWork.count)}
${composition}
Primary timer: ${first.title}
Shared cycle ${formatElapsed(cycleElapsed)}` + (threshold ? `
Pomodoro cycle ${formatElapsed(threshold * 6e4)} \u2014 ${overrun ? `over by ${formatElapsed(cycleOverrunMs(now))}` : `${formatElapsed(threshold * 6e4 - cycleElapsed)} left`}` : "") + (overrun ? "\nA Pomodoro is over its target." : "") + (!overrun && stale ? "\nA clock is likely forgotten." : "") + "\nClick for all clock details.";
    } else {
      const totalMinutes2 = (activeWork.focused?.priorMinutes || 0) + Math.floor((now - first.start.getTime()) / 6e4);
      const threshold = cycleThresholdMinutes();
      buttonNode.title = `${activeCount(activeWork.count)}
${composition}
Clocked in: ${first.title}
Shared cycle ${formatElapsed(cycleElapsed)} \xB7 ${formatMinutesHuman(totalMinutes2)} on this task in total` + (threshold ? `
Pomodoro cycle ${formatElapsed(threshold * 6e4)} \u2014 ${overrun ? `over by ${formatElapsed(cycleOverrunMs(now))}` : `${formatElapsed(threshold * 6e4 - cycleElapsed)} left`}` : "") + (!overrun && stale ? "\nThis clock is likely forgotten." : "");
    }
    buttonNode.setAttribute("aria-label", buttonNode.title);
    if (activeChanged && popover)
      renderPopover();
  };
  const tick = () => {
    tickCount += 1;
    const entries = getRunning();
    const now = nowDate();
    const activeWork = getActiveWork(now);
    renderButton(entries, now, { activeWork });
    updateSessionSurfaceElapsed(
      popover,
      activeWork.focused ? [activeWork.focused] : entries,
      now,
      activeWork.recent,
      activeWork.windowMinutes
    );
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
  const clearRecoveryShutdown = () => {
    if (recoveryShutdownTimer)
      clearTimeout(recoveryShutdownTimer);
    recoveryShutdownTimer = null;
  };
  const disableRecovery = () => {
    if (recoveryDisabled)
      return;
    recoveryDisabled = true;
    clearRecoveryShutdown();
    recoveryObserver?.disconnect();
    recoveryObserver = null;
    outerRecoveryObserver?.disconnect();
    outerRecoveryObserver = null;
    observer = null;
    recoveryTarget = null;
    outerRecoveryTarget = null;
    console.warn("[roam-logbook] Roam topbar host not found; widget disabled");
  };
  const armRecoveryShutdown = () => {
    if (recoveryDisabled || recoveryShutdownTimer)
      return;
    recoveryShutdownTimer = setTimeout(() => {
      recoveryShutdownTimer = null;
      if (!destroyed && !document.querySelector(TOPBAR_SELECTOR2))
        disableRecovery();
    }, RECOVERY_TIMEOUT_MS);
  };
  const noteRecoveryMiss = () => {
    recoveryFlushes += 1;
    if (recoveryFlushes >= RECOVERY_FLUSH_LIMIT)
      disableRecovery();
  };
  const stopAttachmentObservers = () => {
    clearRecoveryShutdown();
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
    const topbar = document.querySelector(TOPBAR_SELECTOR2);
    observeRecoveryTarget(topbar);
    if (!topbar) {
      stopTicker();
      noteRecoveryMiss();
      return;
    }
    clearRecoveryShutdown();
    recoveryFlushes = 0;
    recoveryDisabled = false;
    themeRuntime?.refresh();
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
    const target = record.target;
    if (target?.matches?.(TOPBAR_SELECTOR2) || target?.closest?.(TOPBAR_SELECTOR2))
      return true;
    if (recoveryTarget === document.body && target !== recoveryTarget) {
      return nodes.some((node) => node?.matches?.(TOPBAR_SELECTOR2));
    }
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
    if (!topbar && recoveryDisabled)
      return;
    if (topbar) {
      clearRecoveryShutdown();
      recoveryFlushes = 0;
      recoveryDisabled = false;
    } else {
      armRecoveryShutdown();
    }
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
  const restoreLayoutHostDisplay = (host) => {
    const previous = layoutHostDisplay.get(host);
    if (!previous || !host?.style)
      return;
    if (previous.value)
      host.style.setProperty("display", previous.value, previous.priority);
    else
      host.style.removeProperty("display");
    layoutHostDisplay.delete(host);
  };
  const clearLayoutHost = (host) => {
    host.classList.remove("rlb-topbar__layout");
    restoreLayoutHostDisplay(host);
  };
  const ensureLayoutHostDisplay = (host) => {
    if (!host?.style)
      return;
    let display = "";
    try {
      display = document.defaultView?.getComputedStyle?.(host)?.display || "";
    } catch {
    }
    if (display === "flex")
      return;
    if (!layoutHostDisplay.has(host)) {
      layoutHostDisplay.set(host, {
        value: host.style.getPropertyValue("display"),
        priority: host.style.getPropertyPriority("display")
      });
    }
    host.style.setProperty("display", "flex");
  };
  const syncTopbarLayout = (placement) => {
    for (const host2 of layoutHosts)
      clearLayoutHost(host2);
    for (const host2 of searchHosts)
      host2.classList.remove("rlb-topbar__search");
    layoutHosts.clear();
    searchHosts.clear();
    const host = placement.parent;
    if (!host?.classList)
      return;
    host.classList.add("rlb-topbar__layout");
    ensureLayoutHostDisplay(host);
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
    closePopover({ restoreFocus: false });
    for (const host of layoutHosts)
      clearLayoutHost(host);
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
      attach2();
      ensureThemeRuntime();
    },
    refresh: attach2,
    getPerformanceSnapshot() {
      return { attachCount, tickCount };
    },
    unmount() {
      destroyed = true;
      confirmation?.setOnChange(null);
      cancelPendingOpenRefresh();
      if (refreshClearTimer)
        clearTimeout(refreshClearTimer);
      refreshClearTimer = null;
      refreshInFlight = null;
      unsubscribe?.();
      unsubscribe = null;
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
function attachCompletionHandling({ onResult = null, onWatchIssue = null } = {}) {
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
    if (disposed || !uid)
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
          if (active.has(taskUid)) {
            pending.add(taskUid);
            continue;
          }
          active.add(taskUid);
          const retry = retryClockUids.get(taskUid);
          retryClockUids.delete(taskUid);
          try {
            const result = await clockOutCompletedTask(taskUid, {
              source: "auto-complete",
              retryClockUids: retry ? [...retry] : null
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
    const seeds = [...new Set(entries.map((entry) => entry.taskUid).filter(Boolean))];
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
    const explicitReconciliation = event.explicit === true || event.reason === "refresh";
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

// src/timing-line-sidebar.js
var USER_CLOCK_IN_SOURCES = /* @__PURE__ */ new Set(["user", "active-work-switch"]);
var DEFAULT_FAILURE_NOTICE = "Timing Line started, but Roam could not move it to the top of the right sidebar.";
function isTimingLineFrontIntent(action) {
  return action?.type === "clock-in" && USER_CLOCK_IN_SOURCES.has(action.source) && typeof action.taskUid === "string" && action.taskUid.length > 0;
}
function createTimingLineSidebarFronting({
  frontBlock = frontBlockInRightSidebar,
  isEnabled = keepTimingLineAtTopOfRightSidebar,
  onNotice = () => {
  }
} = {}) {
  let latestIntent = 0;
  let queue = Promise.resolve();
  let disposed = false;
  const isCurrent = (intent) => !disposed && intent === latestIntent && Boolean(isEnabled());
  const handleAction = (action) => {
    if (disposed || !isTimingLineFrontIntent(action) || !isEnabled())
      return false;
    const intent = ++latestIntent;
    queue = queue.catch(() => void 0).then(async () => {
      if (!isCurrent(intent)) {
        return { ok: false, skipped: true, reason: "superseded" };
      }
      let result;
      try {
        result = await frontBlock(action.taskUid, {
          isCurrent: () => isCurrent(intent)
        });
      } catch (error) {
        result = {
          ok: false,
          reason: "sidebar-front-failed",
          message: error?.message || DEFAULT_FAILURE_NOTICE,
          error
        };
      }
      if (result?.ok === false && !result?.skipped && isCurrent(intent)) {
        onNotice(result.message || DEFAULT_FAILURE_NOTICE);
      }
      return result;
    });
    return true;
  };
  return {
    handleAction,
    whenIdle: () => queue,
    dispose() {
      disposed = true;
      latestIntent += 1;
    }
  };
}

// src/extension.js
var CONTEXT_CLOCK_IN = "Logbook: Clock in";
var CONTEXT_CLOCK_OUT = "Logbook: Clock out";
var BRAND_NAME = "Roam Logbook";
var PALETTE_COMMANDS = [
  "Logbook: Focus current block",
  "Logbook: Clock out Timing Line",
  "Logbook: Open dashboard"
];
var RETIRED_PALETTE_COMMANDS = [
  "Logbook: Check for unfinished clocks",
  "Logbook: Clock in current block",
  "Logbook: Clock out current block",
  "Logbook: Clock out all running clocks"
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
  let detachTimingLineSidebar = null;
  let timingLineSidebar = null;
  const targetString = (context) => {
    try {
      const uid = resolveTaskUid(context?.["block-uid"]);
      return getBlockString(uid) ?? context?.["block-string"] ?? "";
    } catch {
      return context?.["block-string"] ?? "";
    }
  };
  const canClockIn = (context) => {
    const uid = context?.["block-uid"];
    if (!uid || isBlockRunning(uid))
      return false;
    const string = targetString(context);
    if (taskStatus(string) === "DONE")
      return false;
    return isTaskBlock(string);
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
    const string = targetString({ "block-uid": uid });
    if (!isTaskBlock(string) || taskStatus(string) === "DONE") {
      notifyUser("Focus is only available on an unfinished TODO block.");
      return;
    }
    return clockIn(uid);
  });
  const registerSettings = () => {
    extensionAPI2.settings.panel.create({
      tabTitle: BRAND_NAME,
      settings: [
        {
          id: SETTING_TIMING_LINE_SIDEBAR,
          name: "Open Timing Line in right sidebar",
          description: "After Clock In or a task switch, keep the Timing Line first in Roam\u2019s right sidebar.",
          action: {
            type: "switch",
            defaultValue: true,
            onChange: (event) => extensionAPI2.settings.set(
              SETTING_TIMING_LINE_SIDEBAR,
              normalizeChecked(event)
            )
          }
        },
        {
          id: SETTING_POMODORO_MINUTES,
          name: "Work-cycle duration (minutes)",
          description: "Passing the threshold turns elapsed time red; seamless task switches keep the cycle.",
          action: {
            type: "input",
            placeholder: "45",
            defaultValue: "45",
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
          name: "Forgotten timer warning (hours)",
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
    for (const label of RETIRED_PALETTE_COMMANDS) {
      try {
        extensionAPI2.ui.commandPalette.removeCommand({ label });
      } catch {
      }
    }
    add(PALETTE_COMMANDS[0], clockInFocused);
    add(PALETTE_COMMANDS[1], () => guard(() => clockOutAll()));
    add(PALETTE_COMMANDS[2], () => dashboard.open());
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
      initializeDefaultOnSwitches();
      timingLineSidebar = createTimingLineSidebarFronting({ onNotice: notifyUser });
      detachTimingLineSidebar = subscribeActions(
        timingLineSidebar.handleAction
      );
      injectStyles(STYLE_ID, STYLES);
      registerSettings();
      registerCommands();
      load();
      detachPomodoro = attach();
      detachCompletion = attachCompletionHandling({
        onResult: (result) => presentMutationResult(result, notifyUser)
      });
      topbar.mount();
      refresh();
      const snapshot = getEntriesSnapshot();
      if (snapshot.filter((entry) => entry.running).length > 1) {
        void reconcileOpenClocks({ entries: snapshot });
      }
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      confirmation.reset();
      detachTimingLineSidebar?.();
      detachTimingLineSidebar = null;
      timingLineSidebar?.dispose();
      timingLineSidebar = null;
      detachCompletion?.();
      detachCompletion = null;
      detachPomodoro?.();
      detachPomodoro = null;
      reset2();
      topbar.unmount();
      dashboard.destroy();
      reset();
      removeStyles(STYLE_ID);
      for (const label of [CONTEXT_CLOCK_IN, CONTEXT_CLOCK_OUT]) {
        try {
          window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
        } catch (error) {
          console.error("[roam-logbook] could not remove context command", error);
        }
      }
      for (const label of [...PALETTE_COMMANDS, ...RETIRED_PALETTE_COMMANDS]) {
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
