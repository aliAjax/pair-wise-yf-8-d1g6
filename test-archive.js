const fs = require("fs");
const vm = require("vm");

const store = new Map();
const sandbox = {
  console,
  structuredClone,
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  },
  crypto: { randomUUID: () => "uuid-" + Math.random().toString(36).slice(2) }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("/workspace/archive.js", "utf8") + ";this.FilmArchive = FilmArchive;", sandbox);

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) {
    passed++;
    console.log("PASS " + message);
  } else {
    failed++;
    console.error("FAIL " + message);
  }
}

const FA = sandbox.FilmArchive;

// 1. 默认数据：A-001 试映，A-012 / A-018 隔离，A-006 B 观察但仍试映
assert(FA.screeningSegments().map((s) => s.code).join(",") === "A-001,A-006", "试映顺序只含非隔离段（A-001,A-006）");
assert(FA.isolatedSegments().map((s) => s.code).join(",") === "A-012,A-018", "隔离台含 A-012,A-018");
const a006 = FA.state.segments.find((s) => s.code === "A-006");
assert(FA.assess(a006).grade === "B" && !FA.assess(a006).isolated, "最新记录 B -> 观察且留在试映");
const a001 = FA.state.segments.find((s) => s.code === "A-001");
assert(FA.assess(a001).grade === "A", "A-001 最新等级 A");
const a018 = FA.state.segments.find((s) => s.code === "A-018");
assert(FA.assess(a018).grade === "C" && FA.assess(a018).isolated, "试纸A+湿度78% -> 强制 C 隔离");

// 2. 录入：湿度 70 + 试纸 A -> B 观察，不隔离
const watch = FA.addSegment({
  code: "T-100", duration: 5, shift: "正常", damage: "完好",
  grade: "A", shrink: 0.5, humidity: 70, by: "甲", note: ""
});
assert(FA.assess(watch).grade === "B" && !FA.assess(watch).isolated, "录入：湿度70%+试纸A -> B观察，留在试映");

// 3. 录入：湿度 76 + 试纸 A -> C 隔离
const hot = FA.addSegment({
  code: "T-101", duration: 5, shift: "正常", damage: "完好",
  grade: "A", shrink: 0.5, humidity: 76, by: "甲", note: ""
});
assert(FA.assess(hot).grade === "C" && FA.assess(hot).isolated, "录入：湿度76%+试纸A -> C隔离");
assert(hot.held === true, "隔离段 held=true");

// 4. 录入：试纸 C -> 隔离（即使湿度正常）
const acid = FA.addSegment({
  code: "T-102", duration: 5, shift: "正常", damage: "完好",
  grade: "C", shrink: 2, humidity: 40, by: "甲", note: ""
});
assert(FA.assess(acid).grade === "C" && FA.assess(acid).isolated, "录入：试纸C -> 隔离");

// 5. 湿度只上调：试纸 C + 湿度 50 不会被降到 B
assert(FA.assessCheck({ grade: "C", humidity: 50 }).grade === "C", "湿度不降级：C+50% 仍为 C");

// 6. 试映段检测更新转 C -> 自动隔离并留档
const became = FA.addCheck(watch.id, { grade: "C", shrink: 1.2, humidity: 60, by: "乙" });
assert(became.isolated && became.held, "试映段复检为C -> 自动隔离");
const isoLog = watch.log.map((e) => e.type);
assert(isoLog.includes("检测更新") && isoLog.includes("隔离"), "检测更新转隔离有两条留档");

// 7. 隔离段复检仍 C，恢复被拒绝
let error = "";
try {
  FA.restoreSegment(acid.id, "乙");
} catch (e) {
  error = e.message;
}
assert(error.includes("C/D"), "C级隔离段恢复被拒绝");

// 8. 复检降到 B 但湿度 70 -> 不能恢复（湿度不合格）
FA.addCheck(acid.id, { grade: "B", shrink: 1, humidity: 70, by: "甲" });
assert(FA.assess(acid).restoreReady === false, "B+湿度70% -> 未达恢复条件");
error = "";
try {
  FA.restoreSegment(acid.id, "乙");
} catch (e) {
  error = e.message;
}
assert(error.includes("湿度"), "B+湿度70%恢复提示湿度问题");
assert(FA.assess(acid).isolated, "未恢复前仍算隔离（held）");

// 9. 降到 B、湿度 60、同一人确认 -> 拒绝
FA.addCheck(acid.id, { grade: "B", shrink: 0.9, humidity: 60, by: "甲" });
assert(FA.assess(acid).restoreReady === true, "B+湿度60% -> 满足恢复条件待确认");
error = "";
try {
  FA.restoreSegment(acid.id, "甲");
} catch (e) {
  error = e.message;
}
assert(error.includes("另一名库员"), "复检人本人确认 -> 拒绝");
assert(FA.assess(acid).isolated, "拒绝后保持隔离");

// 10. 另一名库员确认 -> 恢复
FA.restoreSegment(acid.id, "乙");
const restored = FA.assess(acid);
assert(!restored.isolated && restored.grade === "B" && restored.held === false, "另一名库员确认后恢复试映，等级仍为B");
assert(acid.log.some((e) => e.type === "恢复放映" && e.by === "乙"), "恢复放映留档且记录确认人");

// 11. 未确认的空姓名 -> 拒绝（需先达到恢复条件）
const pending = FA.addSegment({
  code: "T-103", duration: 5, shift: "正常", damage: "完好",
  grade: "D", shrink: 2.4, humidity: 44, by: "甲", note: ""
});
FA.addCheck(pending.id, { grade: "B", shrink: 1, humidity: 55, by: "甲" });
assert(FA.assess(pending).restoreReady === true, "T-103 复检达标，等待确认");
error = "";
try {
  FA.restoreSegment(pending.id, "  ");
} catch (e) {
  error = e.message;
}
assert(error.includes("姓名"), "确认人空白 -> 拒绝");

// 11b. 复检未记录检测人 -> 恢复被拒（无法核实是否另一名库员）
const unsigned = FA.addSegment({
  code: "T-104", duration: 5, shift: "正常", damage: "完好",
  grade: "D", shrink: 2.1, humidity: 50, by: "甲", note: ""
});
FA.addCheck(unsigned.id, { grade: "B", shrink: 1, humidity: 50, by: "" });
assert(FA.assess(unsigned).restoreReady === true, "T-104 复检数据达标");
error = "";
try {
  FA.restoreSegment(unsigned.id, "乙");
} catch (e) {
  error = e.message;
}
assert(error.includes("检测库员"), "复检未署名 -> 恢复被拒");

// 12. 重排只影响试映段，隔离段不进入顺序
const screeningBefore = FA.screeningSegments().map((s) => s.id);
FA.moveSegment(screeningBefore[0], 1);
assert(FA.screeningSegments().map((s) => s.id)[0] === screeningBefore[1], "上移/下移在试映段内生效");
assert(FA.isolatedSegments().every((s) => !FA.screeningSegments().includes(s)), "重排后隔离段仍不在试映顺序");

// 13. 删除隔离段
const isoCount = FA.isolatedSegments().length;
FA.removeSegment(hot.id);
assert(FA.isolatedSegments().length === isoCount - 1, "删除隔离段生效");

// 14. 持久化：存档写入新 key
assert(store.has("zfl17-film-acid-desk"), "数据持久化到 zfl17-film-acid-desk");

// 15. 旧版数据迁移：隔离的存档 key 不存在时读取 legacy
const store2 = new Map();
store2.set(
  "zfl17-film-strip-desk",
  JSON.stringify({
    reelTitle: "旧卷",
    segments: [
      { id: "old-1", code: "X-1", duration: 7, shift: "褪色", damage: "齿孔破损", note: "旧数据", thumb: "" }
    ]
  })
);
const sandbox2 = {
  console,
  structuredClone,
  localStorage: {
    getItem: (key) => (store2.has(key) ? store2.get(key) : null),
    setItem: (key, value) => store2.set(key, String(value))
  },
  crypto: sandbox.crypto
};
vm.createContext(sandbox2);
vm.runInContext(fs.readFileSync("/workspace/archive.js", "utf8") + ";this.FilmArchive = FilmArchive;", sandbox2);
const FA2 = sandbox2.FilmArchive;
const oldSeg = FA2.state.segments[0];
assert(FA2.state.reelTitle === "旧卷" && oldSeg.code === "X-1", "旧版核对台数据迁移成功");
assert(oldSeg.checks.length === 0 && FA2.assess(oldSeg).label === "未检测", "旧片段无检测记录 -> 未检测");
assert(!FA2.assess(oldSeg).isolated, "未检测旧片段默认进入试映顺序");
assert(store2.has("zfl17-film-acid-desk"), "迁移后写入新存档键");

// 16. 损坏 JSON 回退默认
const sandbox3 = {
  console,
  structuredClone,
  localStorage: {
    getItem: () => "{not-json",
    setItem: () => {}
  },
  crypto: sandbox.crypto
};
vm.createContext(sandbox3);
vm.runInContext(fs.readFileSync("/workspace/archive.js", "utf8") + ";this.FilmArchive = FilmArchive;", sandbox3);
assert(sandbox3.FilmArchive.state.segments.length === 4, "存档损坏时回退默认数据");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
