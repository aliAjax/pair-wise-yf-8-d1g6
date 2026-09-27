/*
 * 存档层：酸损等级判定、隔离 / 恢复流程、处置留档、localStorage 持久化。
 * 页面层（app.js）只读本文件暴露的接口，不直接碰 localStorage。
 */
const FilmArchive = (() => {
  const STORAGE_KEY = "zfl17-film-acid-desk";
  const LEGACY_KEY = "zfl17-film-strip-desk";

  const GRADE_RANK = { A: 1, B: 2, C: 3, D: 4 };
  const GRADE_LABEL = { A: "正常", B: "观察", C: "隔离", D: "隔离" };

  function now() {
    return new Date().toISOString();
  }

  const defaultState = {
    reelTitle: "春日试映A卷",
    segments: [
      {
        id: "demo-a-001",
        code: "A-001",
        duration: 18,
        shift: "正常",
        damage: "完好",
        note: "开场街景，节奏平稳，适合保留原顺序。",
        thumb: "",
        held: false,
        checks: [
          { grade: "A", shrink: 0.3, humidity: 46, at: "2026-09-16T01:20:00.000Z", by: "林秀" }
        ],
        log: [
          { at: "2026-09-16T01:20:00.000Z", type: "录入", by: "林秀", detail: "试纸A，收缩率0.3%，湿度46%" }
        ]
      },
      {
        id: "demo-a-006",
        code: "A-006",
        duration: 9,
        shift: "偏红",
        damage: "轻微划痕",
        note: "人物近景左侧有划痕，试映时留意是否明显。",
        thumb: "",
        held: false,
        checks: [
          { grade: "A", shrink: 0.3, humidity: 52, at: "2026-09-16T01:40:00.000Z", by: "林秀" },
          { grade: "B", shrink: 0.6, humidity: 58, at: "2026-09-22T03:05:00.000Z", by: "周明" }
        ],
        log: [
          { at: "2026-09-16T01:40:00.000Z", type: "录入", by: "林秀", detail: "试纸A，收缩率0.3%，湿度52%" },
          { at: "2026-09-22T03:05:00.000Z", type: "检测更新", by: "周明", detail: "试纸B，收缩率0.6%，湿度58%；判定：观察" }
        ]
      },
      {
        id: "demo-a-012",
        code: "A-012",
        duration: 14,
        shift: "褪色",
        damage: "接片松动",
        note: "检出醋酸味，试纸转 C，已退出试映顺序，等待通风复检。",
        thumb: "",
        held: true,
        checks: [
          { grade: "A", shrink: 1.1, humidity: 50, at: "2026-09-12T02:10:00.000Z", by: "林秀" },
          { grade: "C", shrink: 1.4, humidity: 71, at: "2026-09-24T06:30:00.000Z", by: "周明" }
        ],
        log: [
          { at: "2026-09-12T02:10:00.000Z", type: "录入", by: "林秀", detail: "试纸A，收缩率1.1%，湿度50%" },
          { at: "2026-09-24T06:30:00.000Z", type: "通风复检", by: "周明", detail: "试纸C，收缩率1.4%，湿度71%；判定：隔离" },
          { at: "2026-09-24T06:30:00.000Z", type: "隔离", by: "周明", detail: "试纸等级C，退出试映顺序" }
        ]
      },
      {
        id: "demo-a-018",
        code: "A-018",
        duration: 11,
        shift: "正常",
        damage: "完好",
        note: "试纸尚正常但环境湿度过高，按湿度规则直接隔离。",
        thumb: "",
        held: true,
        checks: [
          { grade: "A", shrink: 0.9, humidity: 78, at: "2026-09-25T08:15:00.000Z", by: "林秀" }
        ],
        log: [
          { at: "2026-09-25T08:15:00.000Z", type: "录入", by: "林秀", detail: "试纸A，收缩率0.9%，湿度78%" },
          { at: "2026-09-25T08:15:00.000Z", type: "隔离", by: "林秀", detail: "湿度78%超过75%，直接隔离" }
        ]
      }
    ]
  };

  /* ---------- 等级判定 ---------- */

  // 试纸等级 + 湿度 -> 最新有效等级（湿度只上调、不下调）
  function assessCheck(check) {
    const humidity = Number(check.humidity);
    let grade = check.grade;
    const reasons = [];
    if (humidity > 75) {
      if (GRADE_RANK[grade] < GRADE_RANK.C) grade = "C";
      reasons.push(`湿度${humidity}%超过75%，直接隔离`);
    } else if (humidity > 65) {
      if (GRADE_RANK[grade] < GRADE_RANK.B) grade = "B";
      reasons.push(`湿度${humidity}%超过65%，至少观察`);
    }
    const rank = GRADE_RANK[grade];
    return {
      check,
      grade,
      rank,
      label: GRADE_LABEL[grade],
      reasons,
      isolated: rank >= GRADE_RANK.C,
      watch: rank === GRADE_RANK.B
    };
  }

  function latestCheck(segment) {
    return segment.checks.length ? segment.checks[segment.checks.length - 1] : null;
  }

  // 一段胶片的当前状态：held 表示“仍挂在隔离流程中”（含待另一库员确认恢复）
  function assess(segment) {
    const check = latestCheck(segment);
    const held = !!segment.held;
    if (!check) {
      return {
        check: null,
        grade: null,
        rank: 0,
        label: "未检测",
        reasons: [],
        isolated: held,
        watch: false,
        held,
        restoreReady: false
      };
    }
    const result = assessCheck(check);
    const humidityOk = Number(check.humidity) <= 65;
    return {
      ...result,
      check,
      held,
      isolated: result.isolated || held,
      restoreReady: held && result.rank <= GRADE_RANK.B && humidityOk
    };
  }

  /* ---------- 存档读写 ---------- */

  function normalizeCheck(raw) {
    return {
      grade: ["A", "B", "C", "D"].includes(raw.grade) ? raw.grade : "A",
      shrink: raw.shrink === "" || raw.shrink == null ? null : Number(raw.shrink),
      humidity: Number(raw.humidity),
      at: raw.at || now(),
      by: String(raw.by || "").trim()
    };
  }

  function normalizeSegment(raw) {
    return {
      id: raw.id || crypto.randomUUID(),
      code: raw.code || "",
      duration: Number(raw.duration) || 0,
      shift: raw.shift || "正常",
      damage: raw.damage || "完好",
      note: raw.note || "",
      thumb: raw.thumb || "",
      held: !!raw.held,
      checks: Array.isArray(raw.checks) ? raw.checks.map(normalizeCheck) : [],
      log: Array.isArray(raw.log)
        ? raw.log.map((entry) => ({
            at: entry.at || now(),
            type: entry.type || "处置",
            by: entry.by || "",
            detail: entry.detail || ""
          }))
        : []
    };
  }

  function loadState() {
    let raw = localStorage.getItem(STORAGE_KEY);
    let migratedFromLegacy = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);
      migratedFromLegacy = true;
    }
    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    const base = structuredClone(defaultState);
    const data = {
      reelTitle: parsed?.reelTitle ?? base.reelTitle,
      segments: (parsed?.segments ?? base.segments).map(normalizeSegment)
    };
    if (migratedFromLegacy) saveState(data);
    return data;
  }

  function saveState(override) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(override || state));
  }

  let state = loadState();

  /* ---------- 查询 ---------- */

  function findSegment(id) {
    const segment = state.segments.find((item) => item.id === id);
    if (!segment) throw new Error("找不到该片段。");
    return segment;
  }

  function screeningSegments() {
    return state.segments.filter((segment) => !assess(segment).isolated);
  }

  function isolatedSegments() {
    return state.segments.filter((segment) => assess(segment).isolated);
  }

  /* ---------- 处置动作（均留档） ---------- */

  function checkDetail(check) {
    return `试纸${check.grade}，收缩率${check.shrink == null ? "未记录" : check.shrink + "%"}，湿度${check.humidity}%`;
  }

  function addSegment(input) {
    const check = normalizeCheck(input);
    const segment = normalizeSegment({
      id: crypto.randomUUID(),
      code: String(input.code || "").trim(),
      duration: Number(input.duration),
      shift: input.shift,
      damage: input.damage,
      note: String(input.note || "").trim(),
      thumb: input.thumb || "",
      held: false,
      checks: [],
      log: []
    });
    segment.checks.push(check);
    segment.log.push({ at: check.at, type: "录入", by: check.by, detail: checkDetail(check) });
    const result = assessCheck(check);
    if (result.isolated) {
      segment.held = true;
      segment.log.push({
        at: check.at,
        type: "隔离",
        by: check.by,
        detail: result.reasons[0] || `试纸等级${check.grade}，退出试映顺序`
      });
    }
    state.segments.push(segment);
    saveState();
    return segment;
  }

  // 新增一条检测记录（在试映段叫“检测更新”，在隔离段叫“通风复检”），等级取最新一条
  function addCheck(id, input) {
    const segment = findSegment(id);
    const before = assess(segment).isolated;
    const check = normalizeCheck(input);
    segment.checks.push(check);
    const result = assessCheck(check);
    segment.log.push({
      at: check.at,
      type: before ? "通风复检" : "检测更新",
      by: check.by,
      detail: `${checkDetail(check)}；判定：${result.label}`
    });
    if (!before && result.isolated) {
      segment.held = true;
      segment.log.push({
        at: check.at,
        type: "隔离",
        by: check.by,
        detail: result.reasons[0] || `试纸等级${check.grade}，退出试映顺序`
      });
    }
    saveState();
    return assess(segment);
  }

  // 恢复试映：最新等级降到 A/B、湿度合格（≤65%），且由另一名库员确认
  function restoreSegment(id, confirmerRaw) {
    const segment = findSegment(id);
    const status = assess(segment);
    const check = latestCheck(segment);
    const confirmer = String(confirmerRaw || "").trim();
    if (!segment.held) throw new Error("该片段不在隔离中。");
    if (status.rank >= GRADE_RANK.C) throw new Error("最新等级仍为 C/D，需继续通风复检。");
    if (!check || Number(check.humidity) > 65) throw new Error("湿度仍高于 65%，暂不能恢复。");
    if (!confirmer) throw new Error("请填写负责确认的另一名库员姓名。");
    if (!check.by) throw new Error("本次复检未记录检测库员，无法核实确认人是否为另一名库员。");
    if (confirmer === check.by) {
      throw new Error("恢复须由另一名库员确认，确认人不能与复检人相同。");
    }
    segment.held = false;
    segment.log.push({
      at: now(),
      type: "恢复放映",
      by: confirmer,
      detail: `复检已降至${status.grade}、湿度合格，经另一名库员确认恢复试映顺序`
    });
    saveState();
    return assess(segment);
  }

  function removeSegment(id) {
    state.segments = state.segments.filter((item) => item.id !== id);
    saveState();
  }

  function moveSegment(id, direction) {
    const screening = screeningSegments();
    const index = screening.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= screening.length) return;
    const [item] = screening.splice(index, 1);
    screening.splice(target, 0, item);
    state.segments = [...screening, ...isolatedSegments()];
    saveState();
  }

  function reorderScreening(draggedId, targetId) {
    if (draggedId === targetId) return;
    const screening = screeningSegments();
    const from = screening.findIndex((item) => item.id === draggedId);
    const to = screening.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = screening.splice(from, 1);
    screening.splice(to, 0, item);
    state.segments = [...screening, ...isolatedSegments()];
    saveState();
  }

  function setReelTitle(title) {
    state.reelTitle = title;
    saveState();
  }

  return {
    GRADE_RANK,
    GRADE_LABEL,
    get state() {
      return state;
    },
    assess,
    assessCheck,
    latestCheck,
    screeningSegments,
    isolatedSegments,
    addSegment,
    addCheck,
    restoreSegment,
    removeSegment,
    moveSegment,
    reorderScreening,
    setReelTitle
  };
})();
