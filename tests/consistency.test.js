import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGeo, compareEnvironment, queryGeo, zoneOffset, maskIP} from '../assets/site/consistency.js';

const at=new Date('2026-10-29T00:00:00Z');
const geo=overrides=>normalizeGeo({ip:'203.0.113.7',country_code:'TW',country_name:'Taiwan',timezone:'Asia/Taipei',languages:'zh-TW,zh,nan,hak',...overrides});
const env=overrides=>({timezone:'Asia/Taipei',languages:['en-US','en'],locale:'en-US',...overrides});

test('Taipei timezone can match while English language and US locale are different',()=>{
  const result=compareEnvironment(geo(),env(),at);
  assert.equal(result.timezone,'same');
  assert.equal(result.language,'different');
  assert.equal(result.region,'different');
});
test('different locations with equal offsets are not reported as matching timezones',()=>{
  const result=compareEnvironment(geo({timezone:'Asia/Singapore',country_code:'SG',languages:'en-SG,zh-SG,ms-SG,ta-SG'}),env(),at);
  assert.equal(result.timezone,'same-offset');assert.equal(result.differenceMinutes,0);
  assert.equal(result.language,'listed');assert.equal(result.region,'different');
});
test('US exit versus Taipei exposes real offset mismatch and respects summer/winter',()=>{
  const location=geo({country_code:'US',timezone:'America/Los_Angeles',languages:'en-US,es-US'});
  const result=compareEnvironment(location,env(),at);
  assert.equal(result.timezone,'different');assert.equal(result.differenceMinutes,900);
  assert.equal(compareEnvironment(location,env(),new Date('2026-12-10T00:00:00Z')).differenceMinutes,960);
});
test('IANA aliases and fractional offsets normalize correctly',()=>{
  assert.equal(compareEnvironment(geo({timezone:'US/Eastern'}),env({timezone:'America/New_York'}),at).timezone,'same');
  assert.equal(zoneOffset('Asia/Kathmandu',at),345);
});
test('unknown languages, missing explicit region and invalid system timezone remain unknown',()=>{
  const result=compareEnvironment(geo({languages:''}),env({timezone:'invalid',locale:'en'}),at);
  assert.equal(result.language,'unknown');assert.equal(result.region,'unknown');assert.equal(result.timezone,'unknown');
});
test('provider errors, absent country and invalid timezone never become a successful match',()=>{
  for(const data of [null,{}, {error:true}, {success:false},{country_code:'TW',timezone:'bad'}]) assert.throws(()=>normalizeGeo(data));
});
test('disabled lookup performs no request',async()=>{
  let requests=0;
  assert.deepEqual(await queryGeo({fetcher:()=>{requests++;throw Error();}}),{status:'disabled'});
  assert.equal(requests,0);
});
test('enabled request omits scan payload, credentials and referring page',async()=>{
  let requests=0;
  const result=await queryGeo({enabled:true,fetcher:async(url,options)=>{
    requests++;assert.equal(url,'https://ipapi.co/json/');assert.equal(options.credentials,'omit');
    assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');
    assert.equal(options.body,undefined);assert.equal(options.headers,undefined);
    return {ok:true,json:async()=>({country_code:'TW',timezone:'Asia/Taipei',languages:'zh-TW'})};
  }});
  assert.equal(requests,1);assert.equal(result.status,'ok');
});
test('429, malformed JSON, missing fields and network failure are untested errors',async()=>{
  for (const response of [
    async()=>({ok:false,status:429}),
    async()=>({ok:true,json:async()=>{throw Error('json');}}),
    async()=>({ok:true,json:async()=>({country_code:'TW'})}),
    async()=>{throw Error('network');},
  ]) assert.equal((await queryGeo({enabled:true,fetcher:response})).status,'error');
});
test('switching off aborts in-flight lookup, even if provider returns late',async()=>{
  const abort=new AbortController();
  const result=await queryGeo({enabled:true,signal:abort.signal,fetcher:async(_url,{signal})=>{
    abort.abort();assert.equal(signal.aborted,true);
    return {ok:true,json:async()=>({country_code:'TW',timezone:'Asia/Taipei'})};
  }});
  assert.equal(result.status,'error');assert.equal(result.reason,'timeout-or-cancelled');
});
test('display masks both address families',()=>{
  assert.equal(maskIP('203.0.113.7'),'203.0.113.…');assert.equal(maskIP('2001:db8:1::2'),'2001:db8::…');
});
