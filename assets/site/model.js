// Copyright (c) 2026 l2461090. MIT License.
// A browser-only heuristic, not a model of an account provider's enforcement.
export const checks = [
  {id:"timezone", weight:24, zh:"时区与 IP 一致性", en:"Timezone vs IP"},
  {id:"language", weight:18, zh:"首选语言与 IP 一致性", en:"Preferred language vs IP"},
  {id:"fonts", weight:14, zh:"已安装中文字体", en:"Chinese fonts"},
  {id:"vendorFonts", weight:10, zh:"国产厂商字体", en:"Vendor fonts"},
  {id:"webrtc", weight:10, zh:"WebRTC IP 泄露", en:"WebRTC IP exposure"},
  {id:"browser", weight:8, zh:"浏览器标识", en:"Browser identifier"},
  {id:"device", weight:6, zh:"设备标识", en:"Device identifier"},
  {id:"locale", weight:4, zh:"区域格式与 IP 一致性", en:"Locale region vs IP"},
  {id:"offset", weight:3, zh:"UTC 时差与 IP 一致性", en:"UTC offset vs IP"},
  {id:"platform", weight:3, zh:"Emoji 渲染风格", en:"Emoji rendering style"},
];

export function band(score) {
  return score <= 30 ? "low" : score <= 60 ? "medium" : "high";
}

export function matchedSignals(results) {
  return checks.flatMap(check => {
    const strength = results[check.id]?.strength;
    if (typeof strength !== "number" || !Number.isFinite(strength)) return [];
    const points = Math.round(Math.max(0, Math.min(1, strength)) * check.weight);
    return strength >= 0.25 ? [{...check, points, strength, value:results[check.id].value || ""}] : [];
  });
}

export function assess(results, lang="zh") {
  let score = 0, missing = 0;
  for (const check of checks) {
    const value = results[check.id]?.strength;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      missing += check.weight;
    } else {
      score += Math.round(Math.max(0, Math.min(1, value)) * check.weight);
    }
  }
  const summary = verdict(Math.min(100,score), missing, lang);
  const failures = checks.filter(check=>results[check.id]?.failed).length;
  if (failures) summary.detail += lang === "zh" ? ` ${failures} 项未能正常检测，已按兼容规则计 0 分。` : ` ${failures} checks could not complete and received compatibility score 0.`;
  return summary;
}

export function verdict(score, missing=0, lang="zh") {
  const zh = lang === "zh";
  const tier = band(score);
  const labels = zh ? ["低风险","中等风险","高风险"] : ["Low risk","Medium risk","High risk"];
  const sentences = zh
    ? ["环境风险较低","环境存在风险信号","环境风险较高"]
    : ["Lower environment risk","Environment risk signals found","Higher environment risk"];
  const index = ["low","medium","high"].indexOf(tier);
  const upper = Math.min(100, score + missing);
  return {
    score, missing, upper,
    tier: missing ? "unknown" : tier,
    title: missing === 100 ? (zh ? "未获取到有效检测结果" : "No usable results")
      : missing ? (zh ? "评分不完整，仍有项目未检测" : "Incomplete score; some checks are untested") : sentences[index],
    label: missing ? (zh ? "评分不完整" : "Incomplete") : labels[index],
    detail: missing === 100
      ? (zh ? "浏览器未能完成检测，请重试。" : "The checks could not complete. Please retry.")
      : missing
        ? (zh ? `已测 ${score} 分，未检测项目占 ${missing} 分；完整分数可能为 ${score}–${upper}。未检测项不按零风险处理，暂不提供完整评级。`
              : `Measured ${score}; untested weight ${missing}; possible total ${score}–${upper}. Untested checks are not zero-risk results; a full rating is unavailable.`)
        : (zh ? `检测结束，评分 ${score}/100。` : `Scan finished. Score ${score}/100.`)
  };
}
