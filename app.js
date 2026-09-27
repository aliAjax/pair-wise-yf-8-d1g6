const pageStorageKey = "zfl17-acid-desk-page";
const archiveStorageKey = "zfl17-acid-desk-archive";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

const gradeRank = { A: 0, B: 1, C: 2, D: 3 };
const gradeNames = {
  A: "正常",
  B: "观察",
  C: "隔离",
  D: "隔离"
};

function makeTest(paper, shrinkage, humidity, inspector, at, note = "") {
  return {
    id: crypto.randomUUID(),
    paper,
    shrinkage: Number(shrinkage),
    humidity: Number(humidity),
    inspector: inspector.trim(),
    at,
    note
  };
}

const defaultState = {
  reelTitle: "春日试映A卷",
  segments: [
    {
      id: crypto.randomUUID(),
      code: "A-001",
      duration: 18,
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳。",
      thumb: "",
      tests: [makeTest("A", 0.42, 48, "周敏", "2026-09-20T09:10:00", "通风库房常态抽检")]
    },
    {
      id: crypto.randomUUID(),
      code: "A-006",
      duration: 9,
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意。",
      thumb: "",
      tests: [makeTest("B", 0.85, 62, "周敏", "2026-09-21T10:20:00", "开箱有轻微酸味")]
    },
    {
      id: crypto.randomUUID(),
      code: "A-012",
      duration: 14,
      shift: "褪色",
      damage: "接片松动",
      note: "酸味明显，已移入通风隔离架。",
      thumb: "",
      tests: [makeTest("C", 1.4, 70, "周敏", "2026-09-22T14:05:00", "试纸转 C，收缩加剧")]
    },
    {
      id: crypto.randomUUID(),
      code: "A-018",
      duration: 11,
      shift: "偏黄",
      damage: "齿孔破损",
      note: "库房湿度事故波及，立即隔离。",
      thumb: "",
      tests: [makeTest("A", 0.5, 78, "李南", "2026-09-23T16:40:00", "湿度超标，试纸虽为 A 仍按隔离处理")]
    }
  ]
};

const defaultArchive = [
  {
    id: crypto.randomUUID(),
    at: "2026-09-22T14:05:00",
    code: "A-012",
    action: "isolate",
    fromGrade: "—",
    toGrade: "C",
    reason: "试纸 C",
    inspector: "周敏",
    confirmer: "",
    note: "试纸转 C，收缩加剧"
  },
  {
    id: crypto.randomUUID(),
    at: "2026-09-23T16:40:00",
    code: "A-018",
    action: "isolate",
    fromGrade: "—",
    toGrade: "C",
    reason: "湿度 78% ＞75%",
    inspector: "李南",
    confirmer: "",
    note: "湿度事故波及，立即隔离"
  }
];

let state = loadState();
let archive = loadArchive();
let draggedId = null;
let recheckId = null;

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  gradeFilter: document.querySelector("#gradeFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  paperInput: document.querySelector("#paperInput"),
  shrinkageInput: document.querySelector("#shrinkageInput"),
  humidityInput: document.querySelector("#humidityInput"),
  inspectorInput: document.querySelector("#inspectorInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  isolationList: document.querySelector("#isolationList"),
  isolationCount: document.querySelector("#isolationCount"),
  warningList: document.querySelector("#warningList"),
  archiveList: document.querySelector("#archiveList"),
  totalDuration: document.querySelector("#totalDuration"),
  countA: document.querySelector("#countA"),
  countB: document.querySelector("#countB"),
  countIsolated: document.querySelector("#countIsolated"),
  segmentCount: document.querySelector("#segmentCount"),
  exportBtn: document.querySelector("#exportBtn"),
  exportArchiveBtn: document.querySelector("#exportArchiveBtn"),
  clearArchiveBtn: document.querySelector("#clearArchiveBtn"),
  recheckModal: document.querySelector("#recheckModal"),
  recheckCode: document.querySelector("#recheckCode"),
  recheckForm: document.querySelector("#recheckForm"),
  recheckPaper: document.querySelector("#recheckPaper"),
  recheckShrinkage: document.querySelector("#recheckShrinkage"),
  recheckHumidity: document.querySelector("#recheckHumidity"),
  recheckInspector: document.querySelector("#recheckInspector"),
  recheckConfirmer: document.querySelector("#recheckConfirmer"),
  recheckError: document.querySelector("#recheckError"),
  recheckCancel: document.querySelector("#recheckCancel")
};

function normalizeSegment(segment) {
  return {
    id: segment.id || crypto.randomUUID(),
    code: segment.code ?? "",
    duration: Number(segment.duration) || 0,
    shift: segment.shift ?? "正常",
    damage: segment.damage ?? "完好",
    note: segment.note ?? "",
    thumb: segment.thumb ?? "",
    tests: Array.isArray(segment.tests) ? segment.tests : []
  };
}

function loadState() {
  const saved = localStorage.getItem(pageStorageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      segments: Array.isArray(parsed.segments) ? parsed.segments.map(normalizeSegment) : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(pageStorageKey, JSON.stringify(state));
}

function loadArchive() {
  const saved = localStorage.getItem(archiveStorageKey);
  if (!saved) return structuredClone(defaultArchive);
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveArchive() {
  localStorage.setItem(archiveStorageKey, JSON.stringify(archive));
}

function latestTest(segment) {
  if (!segment.tests || segment.tests.length === 0) return null;
  return [...segment.tests].sort((a, b) => new Date(b.at) - new Date(a.at) || gradeRank[b.paper] - gradeRank[a.paper])[0];
}

// 综合等级：试纸等级与湿度等级取更严的一档
// 湿度 >75% 直接隔离（C），>65% 至少观察（B）
function evaluateTest(test) {
  const humidityGrade = test.humidity > 75 ? "C" : test.humidity > 65 ? "B" : "A";
  const effective = gradeRank[test.paper] >= gradeRank[humidityGrade] ? test.paper : humidityGrade;
  return { effective, humidityGrade, reasons: gradeReasons(test) };
}

function gradeReasons(test) {
  const reasons = [];
  if (test.paper === "B" || test.paper === "C" || test.paper === "D") reasons.push(`试纸 ${test.paper}`);
  if (test.humidity > 75) reasons.push(`湿度 ${test.humidity}% ＞75%`);
  else if (test.humidity > 65) reasons.push(`湿度 ${test.humidity}% ＞65%`);
  return reasons;
}

function getStatus(segment) {
  const test = latestTest(segment);
  if (!test) return { test: null, grade: null, isolated: false, reasons: [] };
  const { effective, reasons } = evaluateTest(test);
  return {
    test,
    grade: effective,
    isolated: gradeRank[effective] >= gradeRank.C,
    reasons
  };
}

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const grade = els.gradeFilter.value;
  const keyword = els.searchInput.value.trim();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const status = getStatus(item);
    const matchesGrade =
      grade === "all" ||
      (grade === "CD" && status.isolated) ||
      (grade === "none" && !status.test) ||
      status.grade === grade;
    const latest = status.test;
    const haystack = `${item.code}${item.note}${item.damage}${latest ? latest.inspector : ""}`;
    const matchesKeyword = !keyword || haystack.includes(keyword);
    return matchesColor && matchesGrade && matchesKeyword;
  });
}

function renderStats() {
  const active = state.segments.filter((item) => !getStatus(item).isolated);
  const total = active.reduce((sum, item) => sum + Number(item.duration), 0);
  let countA = 0;
  let countB = 0;
  let countIsolated = 0;
  for (const item of state.segments) {
    const { grade, isolated } = getStatus(item);
    if (isolated) countIsolated += 1;
    else if (grade === "B") countB += 1;
    else countA += 1;
  }
  els.totalDuration.textContent = formatDuration(total);
  els.countA.textContent = countA;
  els.countB.textContent = countB;
  els.countIsolated.textContent = countIsolated;
  els.segmentCount.textContent = state.segments.length;
}

function renderMetrics(status) {
  if (!status.test) {
    return `<span class="metric-warn">尚未录入试纸 / 收缩率 / 湿度</span>`;
  }
  const test = status.test;
  return `
    <span class="metric">试纸 ${escapeHtml(test.paper)}</span>
    <span class="metric">收缩率 ${test.shrinkage.toFixed(2)}%</span>
    <span class="metric ${test.humidity > 65 ? "metric-alert" : ""}">湿度 ${test.humidity}%</span>
  `;
}

function gradeBadge(status) {
  if (!status.grade) {
    return `<span class="grade-badge grade-none">待检测</span>`;
  }
  return `<span class="grade-badge grade-${status.grade}">${status.grade} · ${gradeNames[status.grade]}</span>`;
}

function cardTemplate(item, { isolated, showOrder, orderIndex }) {
  const status = getStatus(item);
  const meta = status.test
    ? `${formatDateTime(status.test.at)} · ${escapeHtml(status.test.inspector)}${status.reasons.length ? ` · ${escapeHtml(status.reasons.join("；"))}` : ""}`
    : "缺少最新检测数据";
  const actions = isolated
    ? `<button type="button" class="recheck-btn" data-recheck="${item.id}">通风复检</button><button type="button" class="delete-btn" title="删除" data-delete="${item.id}">×</button>`
    : `<button type="button" title="上移" data-move-up="${item.id}">↑</button>
       <button type="button" title="下移" data-move-down="${item.id}">↓</button>
       <button type="button" title="删除" data-delete="${item.id}">×</button>`;
  return `
    <article class="segment-card ${isolated ? "isolated" : ""}" draggable="${isolated ? "false" : "true"}" data-id="${item.id}">
      <div class="thumb">
        ${
          item.thumb
            ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
            : `<div class="film-placeholder" style="background:${fallbackThumbs[orderIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
        }
      </div>
      <div class="segment-main">
        <div class="segment-title">
          <strong>${showOrder ? `${orderIndex + 1}. ` : ""}${escapeHtml(item.code)}</strong>
          <span>${formatDuration(item.duration)}</span>
          ${gradeBadge(status)}
        </div>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.shift)}</span>
          <span class="tag ${item.damage !== "完好" ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
          ${renderMetrics(status)}
        </div>
        <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
        <p class="segment-meta">${meta}</p>
      </div>
      <div class="segment-actions ${isolated ? "isolation-actions" : ""}">${actions}</div>
    </article>
  `;
}

function renderList() {
  const activeIds = new Set(state.segments.filter((item) => !getStatus(item).isolated).map((item) => item.id));
  const filtered = getFilteredSegments().filter((item) => activeIds.has(item.id));
  els.segmentList.innerHTML =
    filtered
      .map((item) => {
        const orderIndex = state.segments
          .filter((segment) => !getStatus(segment).isolated)
          .findIndex((segment) => segment.id === item.id);
        return cardTemplate(item, { isolated: false, showOrder: true, orderIndex });
      })
      .join("") || `<p class="empty">没有符合筛选的在映片段（C、D 隔离段不在试映顺序中）。</p>`;
}

function renderIsolation() {
  const isolated = state.segments.filter((item) => getStatus(item).isolated);
  els.isolationCount.textContent = `${isolated.length} 段`;
  els.isolationList.innerHTML =
    isolated
      .map((item, index) => cardTemplate(item, { isolated: true, showOrder: false, orderIndex: index }))
      .join("") || `<p class="empty">当前没有隔离段。</p>`;
}

function renderWarnings() {
  const watching = state.segments.filter((item) => {
    const status = getStatus(item);
    return status.grade === "B" && !status.isolated;
  });
  els.warningList.innerHTML =
    watching
      .map((item) => {
        const status = getStatus(item);
        return `
          <div class="warning-item">
            <strong>${escapeHtml(item.code)} · ${status.test.humidity}%</strong>
            <span>${escapeHtml(status.reasons.join("；") || "试纸 B")}；收缩率 ${status.test.shrinkage.toFixed(2)}%，保持通风观察。</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">当前没有观察段。</p>`;
}

const archiveActionNames = {
  isolate: { label: "隔离", cls: "log-isolate" },
  recheck: { label: "复检维持隔离", cls: "log-isolate" },
  restore: { label: "恢复试映", cls: "log-restore" }
};

function renderArchive() {
  els.archiveList.innerHTML =
    archive
      .map((entry) => {
        const meta = [
          entry.fromGrade !== "—" ? `等级 ${entry.fromGrade} → ${entry.toGrade}` : `等级 ${entry.toGrade}`,
          entry.reason,
          entry.confirmer ? `复检 ${escapeHtml(entry.inspector)} / 确认 ${escapeHtml(entry.confirmer)}` : `库员 ${escapeHtml(entry.inspector)}`,
          entry.note
        ]
          .filter(Boolean)
          .join("　｜　");
        const action = archiveActionNames[entry.action] || { label: entry.action, cls: "" };
        return `
          <div class="archive-row">
            <span class="archive-time">${formatDateTime(entry.at)}</span>
            <span class="archive-code">${escapeHtml(entry.code)}</span>
            <span class="archive-action ${action.cls}">${action.label}</span>
            <span class="archive-meta">${meta}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">暂无处置记录。</p>`;
}

function renderAll() {
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderList();
  renderIsolation();
  renderWarnings();
  renderArchive();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function addArchiveEntry(entry) {
  archive.unshift({ id: crypto.randomUUID(), ...entry });
  saveArchive();
}

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  const test = makeTest(
    els.paperInput.value,
    els.shrinkageInput.value,
    els.humidityInput.value,
    els.inspectorInput.value,
    new Date().toISOString(),
    ""
  );
  const segment = {
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb,
    tests: [test]
  };
  state.segments.push(segment);
  const { effective, reasons } = evaluateTest(test);
  if (gradeRank[effective] >= gradeRank.C) {
    addArchiveEntry({
      at: test.at,
      code: segment.code,
      action: "isolate",
      fromGrade: "—",
      toGrade: effective,
      reason: reasons.join("；") || `试纸 ${effective}`,
      inspector: test.inspector,
      confirmer: "",
      note: "录入即判定隔离，未进入试映顺序"
    });
  }
  els.segmentForm.reset();
  els.durationInput.value = 12;
  els.shrinkageInput.value = "0.50";
  els.humidityInput.value = "50";
  els.paperInput.value = "A";
  renderAll();
}

// 仅在在映段之间调整顺序，隔离段不参与拖拽
function moveSegment(id, direction) {
  const active = state.segments.filter((item) => !getStatus(item).isolated);
  const index = active.findIndex((item) => item.id === id);
  if (index < 0) return;
  const neighbour = active[index + direction];
  if (!neighbour) return;
  const from = state.segments.findIndex((item) => item.id === id);
  const to = state.segments.findIndex((item) => item.id === neighbour.id);
  const [item] = state.segments.splice(from, 1);
  state.segments.splice(to, 0, item);
  renderAll();
}

function deleteSegment(id) {
  state.segments = state.segments.filter((item) => item.id !== id);
  renderAll();
}

function openRecheck(id) {
  const segment = state.segments.find((item) => item.id === id);
  if (!segment) return;
  recheckId = id;
  els.recheckCode.textContent = segment.code;
  els.recheckForm.reset();
  els.recheckPaper.value = "B";
  els.recheckShrinkage.value = "0.50";
  els.recheckHumidity.value = "60";
  els.recheckError.hidden = true;
  els.recheckModal.hidden = false;
}

function closeRecheck() {
  recheckId = null;
  els.recheckModal.hidden = true;
}

function submitRecheck(event) {
  event.preventDefault();
  const segment = state.segments.find((item) => item.id === recheckId);
  if (!segment) {
    closeRecheck();
    return;
  }
  const previous = getStatus(segment);
  const inspector = els.recheckInspector.value.trim();
  const confirmer = els.recheckConfirmer.value.trim();
  const paper = els.recheckPaper.value;
  const humidity = Number(els.recheckHumidity.value);
  const shrinkage = Number(els.recheckShrinkage.value);
  const problems = [];
  if (gradeRank[paper] > gradeRank.B) problems.push("试纸等级未降到 B 或以下");
  if (humidity > 65) problems.push("湿度未达标（须 ≤65%）");
  if (!confirmer) problems.push("缺少确认库员");
  if (confirmer && inspector === confirmer) problems.push("确认库员必须是另一名库员");
  if (problems.length) {
    els.recheckError.textContent = problems.join("；");
    els.recheckError.hidden = false;
    return;
  }

  const at = new Date().toISOString();
  segment.tests.push(makeTest(paper, shrinkage, humidity, inspector, at, "通风复检"));
  const next = evaluateTest({ paper, shrinkage, humidity, inspector });

  if (gradeRank[next.effective] >= gradeRank.C) {
    // 表单已拦截不合格提交，这里仅作兜底
    addArchiveEntry({
      at,
      code: segment.code,
      action: "recheck",
      fromGrade: previous.grade,
      toGrade: next.effective,
      reason: next.reasons.join("；") || `试纸 ${next.effective}`,
      inspector,
      confirmer,
      note: "复检仍不合格，继续隔离"
    });
  } else {
    addArchiveEntry({
      at,
      code: segment.code,
      action: "restore",
      fromGrade: previous.grade,
      toGrade: next.effective,
      reason: next.reasons.join("；") || `复检 ${next.effective}`,
      inspector,
      confirmer,
      note: `通风复检合格（${next.effective}，湿度 ${humidity}%），双人确认后恢复试映`
    });
  }
  closeRecheck();
  renderAll();
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// 导出页面清单：每段显示最新综合等级与最新一次检测数据
function exportList() {
  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `导出时间：${formatDateTime(new Date().toISOString())}`,
    "",
    "【试映顺序】（C、D 隔离段已退出）"
  ];
  const active = state.segments.filter((item) => !getStatus(item).isolated);
  const total = active.reduce((sum, item) => sum + Number(item.duration), 0);
  lines.push(`放映总时长：${formatDuration(total)}　在映 ${active.length} 段 / 共 ${state.segments.length} 段`, "");
  active.forEach((item, index) => {
    const status = getStatus(item);
    const t = status.test;
    const data = t
      ? `试纸 ${t.paper}｜收缩率 ${t.shrinkage.toFixed(2)}%｜湿度 ${t.humidity}%｜库员 ${t.inspector}`
      : "试纸 —｜收缩率 —｜湿度 —｜库员 —（待检测）";
    lines.push(
      `${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜最新等级 ${status.grade ?? "待检测"}${status.grade ? `（${gradeNames[status.grade]}）` : ""}｜${data}｜${item.shift}｜${item.damage}｜${item.note || "无备注"}`
    );
  });
  const isolated = state.segments.filter((item) => getStatus(item).isolated);
  lines.push("", "【酸损隔离区】");
  if (isolated.length === 0) {
    lines.push("无");
  } else {
    isolated.forEach((item) => {
      const status = getStatus(item);
      const t = status.test;
      lines.push(
        `${item.code}｜最新等级 ${status.grade}（隔离）｜试纸 ${t.paper}｜收缩率 ${t.shrinkage.toFixed(2)}%｜湿度 ${t.humidity}%｜原因 ${status.reasons.join("；") || "—"}｜库员 ${t.inspector}｜${item.note || "无备注"}`
      );
    });
  }
  const watching = state.segments.filter((item) => getStatus(item).grade === "B" && !getStatus(item).isolated);
  lines.push("", `【观察名单 B】${watching.length ? "" : "无"}`);
  watching.forEach((item) => {
    const status = getStatus(item);
    lines.push(`${item.code}｜${status.reasons.join("；") || "试纸 B"}｜湿度 ${status.test.humidity}%`);
  });
  downloadText(`${slug(state.reelTitle)}-acid-desk.txt`, lines.join("\n"));
}

// 导出留档：与页面清单分别维护，单独导出
function exportArchive() {
  const lines = [
    `处置留档：${state.reelTitle || "未命名胶片卷"}`,
    `导出时间：${formatDateTime(new Date().toISOString())}`,
    `记录条数：${archive.length}`,
    ""
  ];
  archive.forEach((entry, index) => {
    const action = archiveActionNames[entry.action]?.label || entry.action;
    lines.push(
      `${index + 1}. [${formatDateTime(entry.at)}] ${entry.code}｜${action}｜${entry.fromGrade} → ${entry.toGrade}｜${entry.reason || "—"}｜库员 ${entry.inspector}${entry.confirmer ? `｜确认 ${entry.confirmer}` : ""}｜${entry.note || "—"}`
    );
  });
  downloadText(`${slug(state.reelTitle)}-archive.txt`, lines.join("\n"));
}

function slug(value) {
  const text = (value || "film-reel").trim().replace(/[\\/:*?"<>|\s]+/g, "-");
  return text || "film-reel";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
});
els.colorFilter.addEventListener("change", renderList);
els.gradeFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);
els.exportArchiveBtn.addEventListener("click", exportArchive);
els.clearArchiveBtn.addEventListener("click", () => {
  if (!archive.length) return;
  if (window.confirm("确认清空全部处置留档？页面清单不受影响，此操作不可恢复。")) {
    archive = [];
    saveArchive();
    renderArchive();
  }
});

els.recheckCancel.addEventListener("click", closeRecheck);
els.recheckModal.addEventListener("click", (event) => {
  if (event.target === els.recheckModal) closeRecheck();
});
els.recheckForm.addEventListener("submit", submitRecheck);

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  if (up) moveSegment(up.dataset.moveUp, -1);
  if (down) moveSegment(down.dataset.moveDown, 1);
  if (remove) deleteSegment(remove.dataset.delete);
});

els.isolationList.addEventListener("click", (event) => {
  const recheck = event.target.closest("[data-recheck]");
  const remove = event.target.closest("[data-delete]");
  if (recheck) openRecheck(recheck.dataset.recheck);
  if (remove) deleteSegment(remove.dataset.delete);
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const active = state.segments.filter((item) => !getStatus(item).isolated);
  const fromIndex = active.findIndex((item) => item.id === draggedId);
  const toIndex = active.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const globalFrom = state.segments.findIndex((item) => item.id === draggedId);
  const globalTo = state.segments.findIndex((item) => item.id === card.dataset.id);
  const [item] = state.segments.splice(globalFrom, 1);
  state.segments.splice(globalTo, 0, item);
  renderAll();
});

renderAll();
