import {languageScore,regionScore} from "../assets/site/rules.js";
import test from "node:test";
import assert from "node:assert/strict";
import {checks,assess,verdict,matchedSignals} from "../assets/site/model.js";

test("weights and three-band boundaries",() => {
  assert.equal(checks.reduce((sum,c)=>sum+c.weight,0),100);
  for (const [score,tier,label] of [[0,"low","低风险"],[30,"low","低风险"],[31,"medium","中等风险"],[40,"medium","中等风险"],[60,"medium","中等风险"],[61,"high","高风险"],[80,"high","高风险"],[100,"high","高风险"]]) {
    const result = verdict(score);
    assert.equal(result.tier,tier);
    assert.equal(result.label,label);
  }
});
test("missing checks cannot silently become a complete low-risk result",() => {
  assert.equal(assess({}).tier,"unknown");
  const results=Object.fromEntries(checks.map(c=>[c.id,{strength:0}]));
  delete results.webrtc;
  assert.equal(assess(results).missing,10);
  assert.equal(assess(results).upper,10);
  assert.equal(verdict(60,10).tier,"unknown");
  assert.equal(verdict(60,10).label,"评分不完整");
});
test("known measurements contribute their weights and invalid values are untested",() => {
  const results=Object.fromEntries(checks.map(c=>[c.id,{strength:1}]));
  assert.equal(assess(results).score,100);
  assert.equal(assess(results).missing,0);
  results.timezone.strength=NaN;
  assert.equal(assess(results).score,76);
  assert.equal(assess(results).missing,24);
});
test("Traditional-Chinese fallback tags do not add mainland-language points",() => {
  for (const [languages,expected] of [
    [["zh-TW","zh","en-US"],0],[["zh-Hant-TW","zh"],0],[["zh-HK","zh"],0.5],
    [["en-US","zh-CN"],0.7],[["zh","zh-TW"],1],[["zh-CN"],1],[["en-US"],0],
  ]) assert.equal(languageScore(languages),expected);
  assert.equal(regionScore("zh-TW"),0);
  assert.equal(regionScore("zh-HK"),0.5);
  assert.equal(regionScore("zh-Hans"),1);
});
test("matched signals apply the strength threshold in detection order",() => {
  const results = {
    fonts:{strength:1,value:"Example font"},
    offset:{strength:1},
    platform:{strength:0.25},
    language:{strength:0},
    webrtc:{strength:null},
    browser:{strength:NaN},
  };
  const hits = matchedSignals(results);
  assert.deepEqual(hits.map(h=>[h.id,h.points]),[["fonts",14],["offset",3],["platform",1]]);
  assert.equal(hits.reduce((sum,h)=>sum+h.points,0),assess(results).score);
  assert.equal(hits[0].value,"Example font");
  assert.deepEqual(matchedSignals({}),[]);
});

test("small contributions count toward total without becoming matched signals",()=>{
 const results={fonts:{strength:0.2,value:"TC fonts"}};
 assert.equal(assess(results).score,3);
 assert.deepEqual(matchedSignals(results),[]);
 const hits=matchedSignals({language:{strength:0.7},fonts:{strength:1}});
 assert.deepEqual(hits.map(h=>h.id),["language","fonts"]);
});
