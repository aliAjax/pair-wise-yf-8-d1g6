/* 页面层：只负责渲染与事件，等级判定、隔离流程和存档都在 archive.js。 */

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

let draggedId = null;

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  gradeInput: document.querySelector("#gradeInput"),
  shrinkInput: document.querySelector("#shrinkInput"),
  humidityInput: document.querySelector("#humidityInput"),
  inspectorInput: document.querySelector("#inspectorInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  isolationList: document.querySelector("#isolationList"),
  warningList: document.querySelector("#warningList"),
  logList: document.querySelector("#logList"),
  totalDuration: document.querySelector("#totalDuration"),
  gradeACount: document.querySelector("#gradeACount"),
  gradeBCount: document.querySelector("#gradeBCount"),
  gradeCDCount: document.querySelector("#gradeCDCount"),
  exportBtn: document.querySelector("#exportBtn")
};

function getState() {
  return FilmArchive.state;
}

function getFilteredScreening() {
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return FilmArchive.screeningSegments().filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesKeyword = !keyword || `${item.code}${item.note}${item.damage}`.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const screening = FilmArchive.screeningSegments();
  const isolated = FilmArchive.isolatedSegments();
  const total = screening.reduce((sum, item) => sum + Number(item.duration), 0);
  const gradeA = screening.filter((item) => FilmArchive.assess(item).grade === "A").length;
  const gradeB = screening.filter((item) => FilmArchive.assess(item).grade === "B").length;
  els.totalDuration.textContent = formatDuration(total);
  els.gradeACount.textContent = gradeA;
  els.gradeBCount.textContent = gradeB;
  els.gradeCDCount.textContent = isolated.length;
}

function gradeBadge(status) {
  if (!status.grade) return `<span class="grade-badge grade-none">未检测</span>`;
  const cls = { A: "grade-a", B: "grade-b", C: "grade-c", D: "grade-d" }[status.grade];
  return `<span class="grade-badge ${cls}">${status.grade} · ${status.label}</span>`;
}

function readingsText(segment, status) {
  const check = status.check;
  if (!check) return "尚无检测记录";
  const shrink = check.shrink == null ? "未记录" : `${check.shrink}%`;
  return `试纸${check.grade}｜收缩率${shrink}｜湿度${check.humidity}%｜${check.by ? escapeHtml(check.by) + " · " : ""}${formatTime(check.at)}`;
}

function checkFormHtml(id, latest, submitText) {
  const check = latest || { grade: "B", shrink: "", humidity: "" };
  const options = ["A", "B", "C", "D"]
    .map((grade) => `<option value="${grade}" ${check.grade === grade ? "selected" : ""}>${grade}</option>`)
    .join("");
  const shrinkValue = check.shrink == null ? "" : `value="${check.shrink}"`;
  return `
    <form class="check-form" data-check-id="${id}">
      <label>试纸<select name="grade">${options}</select></label>
      <label>收缩率%<input name="shrink" type="number" step="0.1" min="0" placeholder="如0.8" ${shrinkValue} /></label>
      <label>湿度%<input name="humidity" type="number" step="0.1" min="0" max="100" required placeholder="如55" value="${check.humidity === "" ? "" : check.humidity}" /></label>
      <label>复检库员<input name="by" type="text" required placeholder="复检人姓名" value="${check.by ? escapeHtml(check.by) : ""}" /></label>
      <button type="submit">${submitText}</button>
    </form>
  `;
}

function renderList() {
  const segments = getFilteredScreening();
  els.segmentList.innerHTML =
    segments
      .map((item) => {
        const orderIndex = FilmArchive.screeningSegments().findIndex((segment) => segment.id === item.id);
        const status = FilmArchive.assess(item);
        const hasDamage = item.damage !== "完好";
        return `
          <article class="segment-card" draggable="true" data-id="${item.id}">
            <div class="thumb">
              ${
                item.thumb
                  ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
                  : `<div class="film-placeholder" style="background:${fallbackThumbs[orderIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
              }
            </div>
            <div class="segment-main">
              <div class="segment-title">
                <strong>${orderIndex + 1}. ${escapeHtml(item.code)}</strong>
                <span>${formatDuration(item.duration)}</span>
                ${gradeBadge(status)}
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
                <span class="readings">${readingsText(item, status)}</span>
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
              <details class="recheck-inline">
                <summary>更新检测数据</summary>
                ${checkFormHtml(item.id, status.check, "提交检测更新")}
              </details>
            </div>
            <div class="segment-actions">
              <button type="button" title="上移" data-move-up="${item.id}">↑</button>
              <button type="button" title="下移" data-move-down="${item.id}">↓</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的试映片段（隔离段见下方酸损隔离台）。</p>`;
}

function isolationStatusText(status) {
  if (status.rank >= FilmArchive.GRADE_RANK.C) {
    const reason = status.reasons[0] || `试纸等级${status.grade}`;
    return `隔离中：${reason}，已退出试映顺序，继续通风后复检。`;
  }
  const humidity = Number(status.check?.humidity);
  if (humidity > 65) {
    return `复检等级已降至${status.grade}，但湿度${humidity}%仍高于65%，继续通风。`;
  }
  return `复检已降至${status.grade}、湿度合格，等待另一名库员确认恢复。`;
}

function renderIsolation() {
  const segments = FilmArchive.isolatedSegments();
  els.isolationList.innerHTML =
    segments
      .map((item, listIndex) => {
        const status = FilmArchive.assess(item);
        const restore = status.restoreReady
          ? `
            <form class="restore-form" data-restore-id="${item.id}">
              <label>
                确认库员（须与复检人不同）
                <input name="confirmer" type="text" required placeholder="另一名库员姓名" />
              </label>
              <button class="primary" type="submit">确认恢复试映</button>
              <p class="restore-hint">恢复条件：最新等级 A/B、湿度≤65%，且由另一名库员确认。</p>
              <p class="restore-error" role="alert" hidden></p>
            </form>
          `
          : `<p class="restore-locked">尚未达到恢复条件，先在左侧提交通风复检。</p>`;
        return `
          <article class="isolation-card" data-id="${item.id}">
            <div class="isolation-head">
              <div class="thumb">
                ${
                  item.thumb
                    ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
                    : `<div class="film-placeholder" style="background:${fallbackThumbs[listIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
                }
              </div>
              <div class="segment-main">
                <div class="segment-title">
                  <strong>${escapeHtml(item.code)}</strong>
                  <span>${formatDuration(item.duration)}</span>
                  ${gradeBadge(status)}
                </div>
                <div class="tag-row">
                  <span class="readings">${readingsText(item, status)}</span>
                </div>
                <p class="isolation-status">${escapeHtml(isolationStatusText(status))}</p>
                <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
              </div>
              <div class="segment-actions">
                <button type="button" title="删除" data-delete="${item.id}">×</button>
              </div>
            </div>
            <div class="isolation-work">
              <div>
                <h3>通风复检</h3>
                ${checkFormHtml(item.id, status.check, "提交通风复检")}
              </div>
              <div>
                <h3>恢复试映</h3>
                ${restore}
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">当前没有隔离片段。</p>`;
}

function renderWarnings() {
  const warnings = FilmArchive.screeningSegments().filter((item) => {
    const status = FilmArchive.assess(item);
    return status.watch || item.damage !== "完好" || item.shift !== "正常";
  });
  els.warningList.innerHTML =
    warnings
      .map((item) => {
        const index = FilmArchive.screeningSegments().findIndex((segment) => segment.id === item.id) + 1;
        const status = FilmArchive.assess(item);
        const reasons = [
          status.watch ? `试纸${status.grade}观察（湿度${status.check?.humidity}%）` : "",
          item.shift !== "正常" ? item.shift : "",
          item.damage !== "完好" ? item.damage : ""
        ]
          .filter(Boolean)
          .join(" · ");
        return `
          <div class="warning-item">
            <strong>${index}. ${escapeHtml(item.code)}</strong>
            <span>${escapeHtml(reasons)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">试映片段均为 A 级且无破损提醒。</p>`;
}

function renderLogs() {
  const entries = getState()
    .segments.flatMap((segment) => segment.log.map((entry) => ({ ...entry, code: segment.code })))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 4);
  els.logList.innerHTML = entries.length
    ? entries
        .map(
          (entry) => `
        <div class="log-entry">
          <span class="log-type log-${entry.type}">${escapeHtml(entry.type)}</span>
          <span class="log-meta">${formatTime(entry.at)} · ${escapeHtml(entry.code)} · ${escapeHtml(entry.by || "未署名")}</span>
          <p>${escapeHtml(entry.detail)}</p>
        </div>
      `
        )
        .join("")
    : `<p class="empty">暂无处置记录。</p>`;
}

function renderAll() {
  els.reelTitle.value = getState().reelTitle;
  renderStats();
  renderList();
  renderIsolation();
  renderWarnings();
  renderLogs();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未记录";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

async function addSegment(event) {
  event.preventDefault();
  event.stopPropagation();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  FilmArchive.addSegment({
    code: els.codeInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    grade: els.gradeInput.value,
    shrink: els.shrinkInput.value,
    humidity: els.humidityInput.value,
    by: els.inspectorInput.value,
    note: els.noteInput.value.trim(),
    thumb
  });
  els.segmentForm.reset();
  els.durationInput.value = 12;
  els.gradeInput.value = "A";
  renderAll();
}

function exportList() {
  const state = getState();
  const screening = FilmArchive.screeningSegments();
  const isolated = FilmArchive.isolatedSegments();
  const total = screening.reduce((sum, item) => sum + Number(item.duration), 0);

  const segmentLine = (item) => {
    const status = FilmArchive.assess(item);
    const check = status.check;
    const shrink = check ? (check.shrink == null ? "未记录" : `${check.shrink}%`) : "无记录";
    const humidity = check ? `${check.humidity}%` : "无记录";
    const grade = status.grade || "未检测";
    return `${item.code}｜${formatDuration(item.duration)}｜最新等级${grade}${status.grade ? "·" + status.label : ""}｜试纸${check?.grade || "-"}｜收缩率${shrink}｜湿度${humidity}｜${item.shift}｜${item.damage}｜检测人${check?.by || "未署名"}${item.note ? `｜${item.note}` : ""}`;
  };

  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `导出时间：${formatTime(new Date().toISOString())}`,
    `试映片段：${screening.length} 段，试映总时长：${formatDuration(total)}；隔离片段：${isolated.length} 段`,
    "",
    "【试映顺序】（隔离段已退出，不参加试映）",
    ...(screening.length ? screening.map((item, index) => `${index + 1}. ${segmentLine(item)}`) : ["（无）"]),
    "",
    "【酸损隔离台】",
    ...(isolated.length
      ? isolated.map((item) => `· ${segmentLine(item)}｜${isolationStatusText(FilmArchive.assess(item))}`)
      : ["（无）"]),
    "",
    "【处置留档】（按时间倒序）",
    ...state.segments
      .flatMap((segment) => segment.log.map((entry) => ({ ...entry, code: segment.code })))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((entry) => `${formatTime(entry.at)}｜${entry.code}｜${entry.type}｜${entry.by || "未署名"}｜${entry.detail}`)
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-酸损隔离清单.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.reelTitle.addEventListener("input", () => {
  FilmArchive.setReelTitle(els.reelTitle.value);
});
els.colorFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

document.addEventListener("submit", (event) => {
  const checkForm = event.target.closest("[data-check-id]");
  const restoreForm = event.target.closest("[data-restore-id]");
  if (checkForm) {
    event.preventDefault();
    const data = new FormData(checkForm);
    FilmArchive.addCheck(checkForm.dataset.checkId, {
      grade: data.get("grade"),
      shrink: data.get("shrink"),
      humidity: data.get("humidity"),
      by: String(data.get("by") || "").trim()
    });
    renderAll();
  } else if (restoreForm) {
    event.preventDefault();
    const data = new FormData(restoreForm);
    const errorEl = restoreForm.querySelector(".restore-error");
    try {
      FilmArchive.restoreSegment(restoreForm.dataset.restoreId, String(data.get("confirmer") || ""));
      renderAll();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  }
});

function handleListClick(event) {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  if (up) FilmArchive.moveSegment(up.dataset.moveUp, -1);
  if (down) FilmArchive.moveSegment(down.dataset.moveDown, 1);
  if (remove) FilmArchive.removeSegment(remove.dataset.delete);
  if (up || down || remove) renderAll();
}

els.segmentList.addEventListener("click", handleListClick);
els.isolationList.addEventListener("click", handleListClick);

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".dragging").forEach((card) => card.classList.remove("dragging"));
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  FilmArchive.reorderScreening(draggedId, card.dataset.id);
  renderAll();
});

renderAll();
