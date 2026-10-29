// Copyright (c) 2026 l2461090. MIT License.
import {checks, assess, matchedSignals} from "./model.js";
import {inspect} from "./checks.js";
import {initConsistency} from "./consistency-ui.js";
import {fuseResults} from "./consistency.js";

const lang = location.pathname.startsWith("/zh") ? "zh" : "en";
const zh = lang === "zh";
const words = {
  eyebrow:["本地独立版 · 无广告 · 无统计","LOCAL EDITION · NO ADS · NO ANALYTICS"],
  heading:["看清你的浏览器环境","Understand your browser environment"],
  lead:["一键检查，直接查看评分、结论与每项检测依据。","One scan. A clear assessment and the evidence behind each check."],
  result:["环境检测结论","ENVIRONMENT ASSESSMENT"],
  disclaimer:["本工具按浏览器特征和 IP 一致性计分；不代表 Claude 官方判断或封号概率。","A browser and IP-consistency heuristic, not an official Claude assessment or ban probability."],
  start:["开始检测","Start scan"],save:["保存结果图片","Save result image"],
  local:["结果留在当前浏览器","Results stay in this browser"],
  checks:["检测明细","Check details"],count:["10 项信号 · 总权重 100","10 signals · 100 total weight"],
  matched:["命中的信号","Matched signals"],
  matchRule:["匹配程度达到 25% 的信号列在这里；全部计分见下方明细。","Signals with strength ≥25% appear here; all contributions are listed below."],
  geoTitle:["IP 与环境一致性","IP and environment consistency"],
  geoSeparate:["已纳入总分 · IP 相关项目共 49 分","Included in total · IP-dependent checks: 49 points"],
  geoPrivacy:["默认关闭。开启并点击查询或开始检测后，浏览器将直接访问 ipapi.co。该服务会收到公网出口 IP 和常规请求头（例如浏览器标识、语言）；不会发送本页评分、字体、账号或系统时区。结果仅留在页面内存；完整 IP 不进入结果图。","Off by default. After enabling and querying or starting a scan, your browser contacts ipapi.co directly. It receives your public egress IP and standard request headers, such as browser identity and language; no scores, fonts, accounts or system timezone are sent. Results stay in page memory; full IPs are excluded from exported images."],
  geoToggle:["允许联网查询 IP 地区（ipapi.co）","Allow online IP location lookup (ipapi.co)"],
  geoQuery:["查询 IP 并比对","Look up IP and compare"],
  geoLimits:["IP 地区和时区来自资料库，可能有误；同一国家可能有多个时区。按同一时刻计算时差，考虑夏令时。时区同名、同偏移及不一致分别显示；同偏移不证明同一地区。本版将时区、语言和区域格式的不一致计分。这是本工具的启发式规则，不证明真实所在地、违规或封号概率。代理分流可能使此服务看到的出口与其他网站不同。","IP locations and timezones are estimates and can be wrong; a country may have multiple timezones. Offsets are compared at the same instant, including DST. Matching zones, equal offsets and differing offsets are distinguished. Equal offsets do not establish the same location. This version scores timezone, language and locale mismatches as heuristic signals, not proof of location, violations or ban probability. Split proxy routes may expose a different exit to this provider than to other websites."],
  privacy:["本地检测说明","About this local scan"],
  privacyDetail:["结果不上传。WebRTC 默认参与检测，点击开始检测后会连接 Google 公共 STUN。IP 一致性查询另有独立开关，默认关闭。其他项目在当前浏览器中完成。","Results are not uploaded. WebRTC runs by default and contacts Google public STUN when a scan starts. IP consistency has a separate switch that is off by default. Other checks run in this browser."],
  webrtc:["WebRTC 网络检测（默认开启；会连接 Google 公共 STUN 服务器）","WebRTC network check (enabled by default; contacts Google public STUN)"],
  partial:["WebRTC 观察 1 秒，发现候选 IP 加 5 分；未发现按 0 分计算，不表示没有泄露。手动关闭后仅显示部分分数。此项不判断 IP 所属国家。","WebRTC observes for 1 second: an IP candidate adds 5 points, no candidate adds 0 and does not prove no leak. Disabling it gives a partial score. It does not geolocate IPs."],
  rules:["查看评级规则","View scoring rules"],
  ruleDetail:["0–30 分：低风险；31–60 分：中等风险；61–100 分：高风险。分数不是封号概率。语言、字体及 UTC+8 等特征也可能出现在其他地区。","0–30: low risk; 31–60: medium risk; 61–100: high risk. Scores are not ban probabilities. Languages, fonts and UTC+8 can also occur in other regions."],
};
const text = key => words[key][zh ? 0 : 1];
const $ = id => document.getElementById(id);
document.documentElement.lang = zh ? "zh-CN" : "en";
document.title = zh ? "Claude环境检测" : "Claude Environment Check";
document.querySelector(".brand span").textContent = document.title;
document.querySelector(".brand").href = zh ? "/zh/" : "/";
for (const node of document.querySelectorAll("[data-text]")) node.textContent = text(node.dataset.text);
for (const node of document.querySelectorAll("nav a")) {
  if (node.lang === lang) node.setAttribute("aria-current","page");
}
$("summary-title").textContent = zh ? "等待检测" : "Ready to scan";
$("summary-detail").textContent = zh ? "点击「开始检测」，查看当前浏览器的结果。" : "Start a scan to inspect this browser.";
$("rating").textContent = zh ? "待检测" : "Not scanned";

const rows = new Map();
let measured = null;
let completed = null;
let busy = false;
const consistency = initConsistency(zh, () => { if (measured) renderScore(); });
for (const [index, check] of checks.entries()) {
  const li = document.createElement("li");
  li.className = "check";
  const top = document.createElement("div"); top.className = "check-top";
  const number = document.createElement("span"); number.className = "check-index";
  number.textContent = String(index + 1).padStart(2,"0");
  const name = document.createElement("strong"); name.textContent = check[lang];
  const weight = document.createElement("span"); weight.className = "weight";
  weight.textContent = `${zh ? "权重" : "Weight"} ${check.weight}`;
  top.append(number,name,weight);
  const bottom = document.createElement("div"); bottom.className = "check-value";
  const value = document.createElement("span"); value.textContent = zh ? "等待检测" : "Not scanned";
  const contribution = document.createElement("strong"); contribution.textContent = "—";
  bottom.append(value,contribution); li.append(top,bottom); $("check-list").append(li);
  rows.set(check.id,{li,value,contribution});
}

function renderMatches(results, missing) {
  const hits = matchedSignals(results);
  $("matched-list").replaceChildren();
  for (const hit of hits) {
    const item = document.createElement("li");
    item.className = "signal-chip";
    item.dataset.level = hit.strength >= 0.6 ? "strong" : "partial";
    item.title = hit.value;
    const name = document.createElement("span"); name.textContent = hit[lang];
    const points = document.createElement("strong"); points.textContent = `+${hit.points}`;
    item.append(name, points);
    $("matched-list").append(item);
  }
  $("matched-empty").hidden = hits.length > 0;
  $("matched-empty").textContent = missing === 100
    ? (zh ? "尚无有效检测结果，无法列出命中信号。" : "No usable results to list matched signals.")
    : (zh ? `已测项目没有达到命中阈值的信号${missing ? "；仍有项目未检测" : ""}。`
          : `No measured checks reached the match threshold${missing ? "; some checks remain untested" : ""}.`);
  $("matched").hidden = false;
}

function renderScore() {
  const results = fuseResults(measured,consistency.snapshot(),lang);
  const result = assess(results,lang);
  completed = {result,results};
  for(const check of checks) {
    const row=rows.get(check.id), found=results[check.id];
    row.value.textContent=found.value;
    row.contribution.textContent=typeof found.strength==='number' ? `+${Math.round(found.strength*check.weight)}` : '—';
    row.li.dataset.state=found.strength>=0.25?'hit':'done';
  }
  renderMatches(results,result.missing);
  $("summary-title").textContent=result.title;
  $("summary-detail").textContent=result.detail;
  $("score").textContent=result.missing===100?'—':String(result.score);
  $("score-unit").textContent=result.missing ? (zh?'/ 100 · 已测部分':'/ 100 · partial'):'/ 100';
  $("rating").textContent=result.label;
  document.querySelector('.report').dataset.tier=result.tier;
  document.querySelector('.meter').style.setProperty('--sweep',`${result.score*3.6}deg`);
  $("save").hidden=false;
  $("progress").textContent=zh?'检测完成 · 结果未上传':'Complete · nothing uploaded';
}

async function scan() {
  if (busy) return;
  busy = true;
  measured = null;
  consistency.reset();
  completed = null;
  $("matched").hidden = true;
  $("matched-list").replaceChildren();
  $("retest").disabled = true;
  $("allow-webrtc").disabled = true;
  $("save").hidden = true;
  $("score").textContent = "—";
  $("score-unit").textContent = "/ 100";
  $("rating").textContent = zh ? "检测中" : "Scanning";
  document.querySelector(".report").dataset.tier = "ready";
  document.querySelector(".meter").style.setProperty("--sweep","0deg");
  $("summary-title").textContent = zh ? "正在检查浏览器环境" : "Inspecting your browser";
  $("summary-detail").textContent = zh ? "请稍候，结果即将显示。" : "Your results will appear shortly.";
  const results = {};
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    for (const [i,check] of checks.entries()) {
      const row = rows.get(check.id);
      row.li.dataset.state = "running";
      row.value.textContent = zh ? "检测中…" : "Checking…";
      row.contribution.textContent = "—";
      $("progress").textContent = `${i + 1} / ${checks.length} · ${check[lang]}`;
      await new Promise(resolve => setTimeout(resolve, 460));
      try {
        results[check.id] = ["timezone","language","locale","offset"].includes(check.id)
          ? {strength:null,value:zh ? "等待 IP 一致性查询" : "Waiting for IP lookup"}
          : await inspect(check.id,lang,$("allow-webrtc").checked);
      } catch {
        results[check.id] = {strength:0,failed:true,value:zh ? "检测失败，按兼容规则计 0 分" : "Check failed; compatibility score 0"};
      }
      const found = results[check.id];
      row.value.textContent = found.value;
      const points = typeof found.strength === "number" ? Math.round(found.strength * check.weight) : null;
      row.contribution.textContent = points === null ? "—" : `+${points}`;
      row.li.dataset.state = found.strength >= 0.25 ? "hit" : "done";
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    measured = results;
    await consistency.run();
    renderScore();
  } catch {
    $("summary-title").textContent = zh ? "检测未完成，请重试" : "Scan incomplete. Please retry.";
    $("summary-detail").textContent = "";
    $("progress").textContent = zh ? "检测失败" : "Scan failed";
  } finally {
    busy = false;
    $("retest").disabled = false;
    $("allow-webrtc").disabled = false;
    $("retest").textContent = zh ? "重新检测" : "Scan again";
  }
}

// Render a local, self-contained PNG using only text and geometric shapes.
function exportImage() {
  if (!completed) return;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  const c = canvas.getContext("2d");
  if (!c) return;
  const {result,results} = completed;
  const hits = matchedSignals(results);
  c.font = "20px sans-serif";
  let chipX = 70, chipRow = 0;
  const chips = hits.map(hit => {
    const label = `${hit[lang]}  +${hit.points}`;
    const width = c.measureText(label).width + 32;
    if (chipX + width > 1010) {chipX = 70; chipRow++;}
    const chip = {label, width, x:chipX, row:chipRow, strong:hit.strength >= 0.6};
    chipX += width + 12;
    return chip;
  });
  const matchedHeight = hits.length ? 85 + (chipRow + 1)*54 : 110;
  canvas.height = 1570 + matchedHeight;
  c.fillStyle = "#f7f7f2"; c.fillRect(0,0,1080,canvas.height);
  c.fillStyle = "#282a27"; c.font = "bold 34px sans-serif";
  c.fillText(document.title,70,85);
  c.fillStyle = "#74766d"; c.font = "20px sans-serif";
  c.fillText(zh ? "本地检测结果 · 无广告 · 无统计" : "LOCAL RESULT · NO ADS · NO ANALYTICS",70,125);
  c.fillStyle = "#fff"; c.fillRect(50,165,980,510);
  c.fillStyle = ({low:"#378259",medium:"#a77921",high:"#b4453e"})[result.tier] || "#74766d";
  c.font = "bold 110px sans-serif"; c.textAlign = "center";
  c.fillText(result.missing === 100 ? "—" : `${result.score}`,540,300);
  c.font = "24px sans-serif"; c.fillText(`${result.label} · ${result.missing ? (zh ? "已测部分" : "partial") : "/100"}`,540,350);
  c.fillStyle = "#282a27"; c.font = "bold 32px sans-serif";
  // Wrap by measured width, including languages without spaces.
  const lines = (value,width) => {
    const out = []; let current = "";
    for (const character of value) {
      if (current && c.measureText(current + character).width > width) {out.push(current);current="";}
      current += character;
    }
    if (current) out.push(current);
    return out;
  };
  lines(result.title,850).forEach((line,i) => c.fillText(line,540,415+i*42));
  c.font = "22px sans-serif"; c.fillStyle = "#74766d";
  lines(result.detail,850).forEach((line,i) => c.fillText(line,540,510+i*32));
  c.textAlign = "left";
  c.fillStyle = "#74766d"; c.font = "22px sans-serif";
  c.fillText(text("matched"),70,720);
  c.font = "20px sans-serif";
  if (!hits.length) {
    c.fillText(zh ? "没有达到命中阈值的信号；全部计分见下方。" : "No measured checks reached the match threshold. See untested checks below.",70,765);
  }
  for (const chip of chips) {
    const y = 742 + chip.row*54;
    c.fillStyle = chip.strong ? "#f9ece8" : "#f6f0e3";
    c.beginPath();c.roundRect(chip.x,y,chip.width,42,21);c.fill();
    c.strokeStyle = chip.strong ? "#dc9e8e" : "#d9bd83";c.stroke();
    c.fillStyle = chip.strong ? "#a94e39" : "#8e671f";
    c.fillText(chip.label,chip.x+16,y+28);
  }
  for (const [i,check] of checks.entries()) {
    const y = 735 + matchedHeight + i*53;
    c.fillStyle = "#282a27"; c.font = "23px sans-serif";c.fillText(check[lang],70,y);
    c.fillStyle = "#74766d"; c.font = "17px sans-serif";
    const value = results[check.id].value;
    const shortened = Array.from(value).slice(0,41).join("");
    c.fillText(shortened + (value.length > 41 ? "…" : ""),350,y);
    c.textAlign = "right";
    const strength = results[check.id].strength;
    c.fillText(strength === null ? "—" : `+${Math.round(strength*check.weight)}`,1000,y);
    c.textAlign = "left";
  }
  c.font = "19px sans-serif";
  lines(text("disclaimer"),930).forEach((line,i) => c.fillText(line,70,1320+matchedHeight+i*28));
  c.fillStyle = "#74766d"; c.font = "19px sans-serif";
  lines((zh ? "IP 一致性（已纳入评分）：" : "IP consistency (included in score): ") + consistency.summary(),930).forEach((line,i) => c.fillText(line,70,1400+matchedHeight+i*28));
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");a.href=url;a.download="claude-environment-result.png";
    document.body.append(a);a.click();a.remove();
    setTimeout(() => URL.revokeObjectURL(url),10000);
  },"image/png");
}
$("retest").addEventListener("click",scan);
$("save").addEventListener("click",exportImage);
