/* 轻量 DOM 桩冒烟测试：加载 archive.js + app.js，模拟录入、隔离、复检、恢复、导出。 */
const fs = require("fs");
const vm = require("vm");

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

const store = new Map();

function makeEl(id) {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    files: [],
    reset() {},
    dataset: {},
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    classList: { add() {}, remove() {} },
    querySelector() {
      return makeEl("inner");
    }
  };
}

const ids = [
  "reelTitle", "colorFilter", "searchInput", "segmentForm", "codeInput", "durationInput",
  "shiftInput", "damageInput", "gradeInput", "shrinkInput", "humidityInput", "inspectorInput",
  "thumbInput", "noteInput", "segmentList", "isolationList", "warningList", "logList",
  "totalDuration", "gradeACount", "gradeBCount", "gradeCDCount", "exportBtn"
];
const byHash = Object.fromEntries(ids.map((id) => ["#" + id, makeEl(id)]));
const registry = { ...byHash, ...Object.fromEntries(ids.map((id) => [id, byHash["#" + id]])) };
// 真实页面 select 的默认首项
registry.colorFilter.value = "all";
registry.shiftInput.value = "正常";
registry.damageInput.value = "完好";
registry.gradeInput.value = "A";

let exportedText = "";
const downloadLink = { href: "", download: "", clicked: false, click() { this.clicked = true; } };

const documentListeners = {};
const documentStub = {
  querySelector: (sel) => registry[sel] || makeEl(sel),
  querySelectorAll: () => [],
  addEventListener(type, fn) {
    (documentListeners[type] ||= []).push(fn);
  },
  createElement: () => downloadLink
};

class BlobStub {
  constructor(parts) {
    this.text = parts.join("");
    exportedText = this.text;
  }
}
class FormDataStub {
  constructor(form) {
    this.fields = form.__fields || {};
  }
  get(key) {
    return key in this.fields ? this.fields[key] : null;
  }
}

const sandbox = {
  console,
  structuredClone,
  setTimeout,
  document: documentStub,
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  },
  crypto: { randomUUID: () => "uuid-" + Math.random().toString(36).slice(2) },
  Blob: BlobStub,
  FormData: FormDataStub,
  URL: { createObjectURL: () => "blob:mock", revokeObjectURL() {} }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("/workspace/archive.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync("/workspace/app.js", "utf8"), sandbox);
const FA = vm.runInContext("FilmArchive", sandbox);

// 初始渲染：试映 2 段、隔离 2 段
assert(registry.segmentList.innerHTML.includes("A-001") && registry.segmentList.innerHTML.includes("A-006"), "试映列表渲染 A-001/A-006");
assert(!registry.segmentList.innerHTML.includes("A-012"), "试映列表不含隔离段 A-012");
assert(registry.isolationList.innerHTML.includes("A-012") && registry.isolationList.innerHTML.includes("A-018"), "隔离台渲染 A-012/A-018");
assert(String(registry.gradeCDCount.textContent).trim() === "2", "统计隔离数=2");
assert(registry.totalDuration.textContent === "0:27", "试映总时长=0:27（不含隔离）");
assert(registry.isolationList.innerHTML.includes("grade-c"), "隔离卡显示 C 级徽标");
assert(registry.isolationList.innerHTML.includes("提交通风复检"), "隔离卡有通风复检表单");

// 模拟录入：B-201，试纸 A，湿度 80 -> 强制 C 隔离
registry.codeInput.value = "B-201";
registry.durationInput.value = "10";
registry.shiftInput.value = "正常";
registry.damageInput.value = "完好";
registry.gradeInput.value = "A";
registry.shrinkInput.value = "0.4";
registry.humidityInput.value = "80";
registry.inspectorInput.value = "甲";
registry.noteInput.value = "有淡酸味";
const submit = registry.segmentForm.listeners.submit[0];
submit({ preventDefault() {}, stopPropagation() {} });

setTimeout(() => {
  const newSeg = FA.state.segments.find((s) => s.code === "B-201");
  assert(newSeg && FA.assess(newSeg).grade === "C" && FA.assess(newSeg).isolated, "录入 A+湿度80% -> C 隔离");
  assert(registry.isolationList.innerHTML.includes("B-201"), "新隔离段出现在隔离台");
  assert(!registry.segmentList.innerHTML.includes("B-201"), "新隔离段不进入试映列表");
  assert(String(registry.gradeCDCount.textContent).trim() === "3", "统计隔离数更新为3");

  // 通风复检：通过 document 上的 submit 委托提交通风复检表单（降到 B、湿度 55、复检人甲）
  function fireDelegatedSubmit(formLike) {
    documentListeners.submit[0]({
      preventDefault() {},
      target: { closest: (sel) => (formLike.matches.includes(sel) ? formLike : null) }
    });
  }

  const errorEl = makeEl("restore-error");
  const checkFormLike = {
    matches: ["[data-check-id]"],
    dataset: { checkId: newSeg.id },
    __fields: { grade: "B", shrink: "0.5", humidity: "55", by: "甲" }
  };
  fireDelegatedSubmit(checkFormLike);
  assert(FA.assess(newSeg).restoreReady === true, "委托提交复检后达到恢复条件");
  assert(registry.isolationList.innerHTML.includes("确认恢复试映"), "达标后出现另一名库员确认按钮");
  assert(registry.isolationList.innerHTML.includes("等待另一名库员确认"), "隔离状态文案提示等待确认");

  // 同一人确认 -> 委托处理器捕获错误并显示在错误条
  const restoreFormBad = {
    matches: ["[data-restore-id]"],
    dataset: { restoreId: newSeg.id },
    __fields: { confirmer: "甲" },
    querySelector: () => errorEl
  };
  fireDelegatedSubmit(restoreFormBad);
  assert(errorEl.textContent.includes("另一名库员") && errorEl.hidden === false, "同一库员确认：页面显示拒绝原因");
  assert(FA.assess(newSeg).isolated, "拒绝后片段仍隔离");

  // 另一名库员确认 -> 恢复，回到试映列表
  const restoreFormOk = {
    matches: ["[data-restore-id]"],
    dataset: { restoreId: newSeg.id },
    __fields: { confirmer: "乙" },
    querySelector: () => errorEl
  };
  fireDelegatedSubmit(restoreFormOk);
  assert(registry.segmentList.innerHTML.includes("B-201"), "确认后回到试映顺序");
  assert(!registry.isolationList.innerHTML.includes("B-201"), "确认后离开隔离台");
  assert(registry.segmentList.innerHTML.includes("grade-b"), "试映列表显示最新等级 B 徽标");
  assert(String(registry.gradeCDCount.textContent).trim() === "2", "统计隔离数回到2");

  // 留档包含恢复记录
  assert(registry.logList.innerHTML.includes("恢复放映") && registry.logList.innerHTML.includes("乙"), "处置留档显示恢复放映与确认人");

  // 导出：包含试映/隔离分区、最新等级、完整留档
  registry.exportBtn.listeners.click[0]();
  assert(downloadLink.clicked && downloadLink.download.includes("酸损隔离清单"), "导出文件名正确");
  assert(exportedText.includes("【试映顺序】") && exportedText.includes("【酸损隔离台】") && exportedText.includes("【处置留档】"), "导出含三个分区");
  assert(exportedText.includes("B-201") && exportedText.match(/B-201｜0:10｜最新等级B/), "导出行显示最新等级B");
  assert(/A-018[^\n]*湿度78%/.test(exportedText), "导出行含湿度原始读数");
  assert(exportedText.includes("另一名库员确认恢复试映顺序"), "导出含恢复留档");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}, 20);
