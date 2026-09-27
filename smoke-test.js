const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("app.js", "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "outside-only",
  pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
window.structuredClone = globalThis.structuredClone;
window.eval(js);

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
};

// 默认数据：A-001 A，A-006 B，A-012 C，A-018 湿度78→隔离
assert($$("#segmentList .segment-card").length === 2, "试映顺序只有 A/B 两段（隔离段退出）");
assert($$("#isolationList .segment-card").length === 2, "隔离区有 C 段与湿度 78% 段共两段");
assert($("#isolationCount").textContent === "2 段", "隔离计数显示 2 段");
assert($("#countIsolated").textContent === "2", "统计隔离数 2");
assert($("#countA").textContent === "1", "统计 A 数 1");
assert($("#countB").textContent === "1", "统计 B 数 1");
assert($("#segmentCount").textContent === "4", "片段总数 4");
assert($("#totalDuration").textContent === "0:27", "放映总时长仅计在映段 18+9=27s");
assert($$("#warningList .warning-item").length === 1, "观察名单仅 B 段 1 条");
assert($("#segmentList").textContent.includes("A-001"), "试映顺序含 A-001");
assert(!$("#segmentList").textContent.includes("A-012"), "C 段 A-012 不在试映顺序");
assert($("#isolationList").textContent.includes("A-012"), "A-012 在隔离区");
assert($("#isolationList").textContent.includes("A-018"), "湿度 78% 的 A-018 在隔离区");
assert($$(".archive-row").length === 2, "留档初始两条隔离记录");

// 隔离卡不可拖拽
const isolatedCard = $("#isolationList .segment-card");
assert(isolatedCard.getAttribute("draggable") === "false", "隔离卡不可拖拽");

// 打开复检：不合格提交（同名库员 + 湿度超标）应被拒绝
const recheckBtn = $('#isolationList [data-recheck]');
const targetId = recheckBtn.getAttribute("data-recheck");
recheckBtn.click();
assert(!$("#recheckModal").hidden, "复检弹窗打开");
$("#recheckPaper").value = "C";
$("#recheckHumidity").value = "70";
$("#recheckInspector").value = "周敏";
$("#recheckConfirmer").value = "周敏";
$("#recheckForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
assert(!$("#recheckError").hidden, "不合格复检被拦截并提示");
assert($("#recheckError").textContent.includes("另一名库员"), "提示需另一名库员");
assert($$("#isolationList .segment-card").length === 2, "拦截后仍为两段隔离");
assert($$(".archive-row").length === 2, "被拦截的复检不留档");

// 合格复检：B、60%、两名不同库员
$("#recheckPaper").value = "B";
$("#recheckHumidity").value = "60";
$("#recheckInspector").value = "周敏";
$("#recheckConfirmer").value = "李南";
$("#recheckForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
assert($("#recheckModal").hidden, "合格后弹窗关闭");
assert($$("#isolationList .segment-card").length === 1, "复检合格段退出隔离区");
assert($("#segmentList").textContent.includes("A-012"), "A-012 恢复进入试映顺序");
assert($("#countIsolated").textContent === "1", "隔离统计变为 1");
const firstLog = $(".archive-row");
assert(firstLog.textContent.includes("恢复试映"), "留档首条为恢复记录");
assert(firstLog.textContent.includes("周敏") && firstLog.textContent.includes("李南"), "恢复记录含复检与确认两名库员");

// 最新等级统计：A-012 现为 B
assert($("#countB").textContent === "2", "恢复后 B 观察数变为 2");
assert($$("#warningList .warning-item").length === 2, "观察名单变为 2 条");

// 录入新段：试纸 A 但湿度 80 → 直接隔离，不进试映
$("#codeInput").value = "B-002";
$("#durationInput").value = "10";
$("#paperInput").value = "A";
$("#shrinkageInput").value = "0.6";
$("#humidityInput").value = "80";
$("#inspectorInput").value = "李南";
$("#segmentForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
setTimeout(() => {
  assert(!$("#segmentList").textContent.includes("B-002"), "湿度 80 新段未进入试映顺序");
  assert($("#isolationList").textContent.includes("B-002"), "湿度 80 新段直接隔离");
  assert($(".archive-row").textContent.includes("B-002"), "录入即隔离写入留档");

  // 存储分离：页面与留档独立 key
  const pageRaw = window.localStorage.getItem("zfl17-acid-desk-page");
  const archiveRaw = window.localStorage.getItem("zfl17-acid-desk-archive");
  assert(pageRaw && archiveRaw, "页面数据与留档分别存储");
  const archiveBefore = JSON.parse(archiveRaw).length;
  window.confirm = () => true;
  $("#clearArchiveBtn").click();
  assert($$(".archive-row").length === 0, "留档可独立清空");
  assert(JSON.parse(window.localStorage.getItem("zfl17-acid-desk-page")).segments.length === 5, "清空留档不影响页面 5 段数据");
  assert(JSON.parse(window.localStorage.getItem("zfl17-acid-desk-archive")).length === 0, "留档存储已清空");
  assert(archiveBefore === 4, "清空前留档共 4 条（2 初始+1 恢复+1 新隔离）");
  console.log(process.exitCode ? "SMOKE TEST FAILED" : "ALL SMOKE TESTS PASSED");
}, 50);
