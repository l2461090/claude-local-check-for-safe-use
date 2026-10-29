import test from 'node:test';
import assert from 'node:assert/strict';
import {checks,assess,matchedSignals} from '../assets/site/model.js';
import {normalizeGeo,compareEnvironment,fuseResults} from '../assets/site/consistency.js';

const instant=new Date('2026-10-29T00:00:00Z');
const local=()=>({...Object.fromEntries(checks.map(c=>[c.id,{strength:0,value:'local'}])),fonts:{strength:1,value:'fonts'},platform:{strength:0.25,value:'Apple'}});
const env={timezone:'Asia/Taipei',languages:['en-US','en'],locale:'en-US'};
function snapshot(g={},e={}) {
  const geo=normalizeGeo({country_code:'JP',timezone:'Asia/Tokyo',languages:'ja',...g});
  const actualEnv={...env,...e};
  return {status:'ok',geo,env:actualEnv,comparison:compareEnvironment(geo,actualEnv,instant)};
}

test('Japan exit vs Taipei/English-US adds all four mismatch weights: 49 plus local 15 = 64',()=>{
  const result=fuseResults(local(),snapshot());
  assert.deepEqual(['timezone','language','locale','offset'].map(k=>result[k].strength),[1,1,1,1]);
  assert.equal(assess(result).score,64);assert.equal(assess(result).missing,0);assert.equal(assess(result).tier,'high');
  assert.deepEqual(matchedSignals(result).map(x=>[x.id,x.points]),[['timezone',24],['language',18],['fonts',14],['locale',4],['offset',3],['platform',1]]);
});
test('matched Japan timezone, Japanese preference and JP locale contribute zero mismatch points',()=>{
  const result=fuseResults(local(),snapshot({}, {timezone:'Asia/Tokyo',languages:['ja-JP'],locale:'ja-JP'}));
  assert.equal(assess(result).score,15);assert.equal(assess(result).missing,0);
});
test('disabled, pending, loading, failure and absent query cannot produce a complete low-risk result',()=>{
  for(const status of ['disabled','pending','loading','error',undefined]) {
    const results=fuseResults(local(),status?{status}:undefined);
    const score=assess(results);
    assert.equal(score.score,15);assert.equal(score.missing,49);assert.equal(score.upper,64);assert.equal(score.tier,'unknown');
  }
});
test('same-offset but different timezone names carry timezone points without offset points',()=>{
  const result=fuseResults(local(),snapshot({country_code:'SG',timezone:'Asia/Singapore',languages:'en-SG'},{locale:'en-SG'}));
  assert.equal(result.timezone.strength,1);assert.equal(result.offset.strength,0);
  assert.equal(result.language.strength,0);assert.equal(result.locale.strength,0);assert.equal(assess(result).score,39);
});
test('country with multiple common languages accepts a matching preferred main language',()=>{
  const result=fuseResults(local(),snapshot({country_code:'CA',timezone:'America/Toronto',languages:'en-CA,fr-CA'},{timezone:'America/Toronto',languages:['fr-FR'],locale:'fr-CA'}));
  assert.equal(result.language.strength,0);assert.equal(assess(result).score,15);
});
test('missing country language list or explicit locale region remains untested',()=>{
  const result=fuseResults(local(),snapshot({languages:''},{locale:'en'}));
  assert.equal(result.language.strength,null);assert.equal(result.locale.strength,null);
  assert.equal(assess(result).missing,22);assert.equal(assess(result).tier,'unknown');
});
test('old China-feature local measurements are replaced rather than counted a second time',()=>{
  const old=local();for(const k of ['timezone','language','locale','offset'])old[k]={strength:1,value:'old'};
  const result=fuseResults(old,snapshot({}, {timezone:'Asia/Tokyo',languages:['ja-JP'],locale:'ja-JP'}));
  assert.equal(assess(result).score,15);assert.equal(old.timezone.strength,1);
});
test('clearing a successful result immediately makes the score partial, never reusing stale lookup',()=>{
  const measured=local();assert.equal(assess(fuseResults(measured,snapshot())).score,64);
  assert.equal(assess(fuseResults(measured,{status:'disabled'})).missing,49);
});
