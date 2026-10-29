// Copyright (c) 2026 l2461090. MIT License.
// IP location is approximate. Differences are heuristic signals, not ban probabilities.
export const GEO_ENDPOINT = 'https://ipapi.co/json/';

export function zoneOffset(zone, instant = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, timeZoneName: 'longOffset',
    }).formatToParts(instant);
    const value = parts.find(p => p.type === 'timeZoneName')?.value;
    if (value === 'GMT' || value === 'UTC') return 0;
    const match = value?.match(/^GMT([+-])(\d{1,2}):(\d{2})$/);
    return match ? (match[1] === '+' ? 1 : -1) * (+match[2] * 60 + +match[3]) : null;
  } catch { return null; }
}

export function canonicalZone(zone) {
  try { return new Intl.DateTimeFormat('en-US', {timeZone: zone}).resolvedOptions().timeZone; }
  catch { return null; }
}

export function normalizeGeo(data) {
  if (!data || typeof data !== 'object' || data.error || data.success === false) throw Error('provider');
  const bounded = (v, size=100) => typeof v === 'string' ? v.trim().slice(0, size) : '';
  const countryCode = bounded(data.country_code || data.country, 2).toUpperCase();
  const zone = canonicalZone(bounded(data.timezone));
  if (!/^[A-Z]{2}$/.test(countryCode) || !zone) throw Error('incomplete');
  const ip = bounded(data.ip, 45);
  return {
    ip: /^[\da-fA-F:.]+$/.test(ip) ? ip : '',
    countryCode, countryName: bounded(data.country_name) || countryCode,
    timezone: zone,
    languages: bounded(data.languages, 500).split(',').map(x => x.trim()).filter(Boolean),
  };
}

function languageParts(tag) {
  try { const l = new Intl.Locale(tag); return {language:l.language, region:l.region}; }
  catch { return null; }
}

export function compareEnvironment(geo, environment, instant = new Date()) {
  const systemZone = canonicalZone(environment.timezone);
  const systemOffset = systemZone ? zoneOffset(systemZone, instant) : null;
  const ipOffset = zoneOffset(geo.timezone, instant);
  const timezone = !systemZone || systemOffset === null || ipOffset === null ? 'unknown'
    : systemZone === geo.timezone ? 'same'
    : systemOffset === ipOffset ? 'same-offset' : 'different';
  const preferred = languageParts(environment.languages?.[0] || '');
  const known = geo.languages.map(languageParts).filter(Boolean);
  const language = !preferred || !known.length ? 'unknown'
    : known.some(x => x.language === preferred.language) ? 'listed' : 'different';
  const locale = languageParts(environment.locale || '');
  const region = !locale?.region ? 'unknown' : locale.region === geo.countryCode ? 'same' : 'different';
  return {timezone, systemZone, systemOffset, ipOffset,
    differenceMinutes:systemOffset === null || ipOffset === null ? null : systemOffset-ipOffset,
    language, region};
}

export function fuseResults(localResults, snapshot, lang='zh') {
  const zh=lang==='zh', results={...localResults};
  const pick=(a,b)=>zh?a:b;
  const ids=['timezone','language','locale','offset'];
  if (snapshot?.status!=='ok') {
    const value=snapshot?.status==='loading' ? pick('等待 IP 查询结果','Waiting for IP lookup')
      : snapshot?.status==='error' ? pick('未检测 · IP 查询失败','Not tested · IP lookup failed')
      : pick('未检测 · 需开启联网并查询 IP','Not tested · enable and run IP lookup');
    for(const id of ids) results[id]={strength:null,value};
    return results;
  }
  const {comparison:c,geo,env}=snapshot;
  const item=(known,mismatch,value)=>({strength:known ? (mismatch?1:0):null,value});
  const timezoneKnown=c.timezone!=='unknown';
  results.timezone=item(timezoneKnown,c.timezone!=='same',
    `${env.timezone || '—'} / IP ${geo.timezone} · `+
    (!timezoneKnown ? pick('无法比较','Unavailable') : c.timezone==='same' ? pick('一致','Match')
      : c.timezone==='same-offset' ? pick('时区不同，当前时差相同','Different zones; same current offset') : pick('不一致','Mismatch')));
  results.language=item(c.language!=='unknown',c.language==='different',
    `${env.languages?.[0] || '—'} / IP ${geo.languages.join(', ') || '—'} · `+
    (c.language==='unknown'?pick('资料不足','Insufficient data'):c.language==='listed'?pick('匹配常用语言','Listed language'):pick('不一致','Mismatch')));
  results.locale=item(c.region!=='unknown',c.region==='different',
    `${env.locale || '—'} / IP ${geo.countryCode} · `+
    (c.region==='unknown'?pick('无区域代码','No region code'):c.region==='same'?pick('一致','Match'):pick('不一致','Mismatch')));
  results.offset=item(c.differenceMinutes!==null,c.differenceMinutes!==0,
    `${formatOffset(c.systemOffset)} / IP ${formatOffset(c.ipOffset)} · `+
    (c.differenceMinutes===null?pick('无法比较','Unavailable'):`${pick('相差','Difference')} ${Math.abs(c.differenceMinutes)/60} h`));
  return results;
}

// No external request is made unless the caller explicitly enables it.
export async function queryGeo({enabled=false, fetcher=globalThis.fetch, signal} = {}) {
  if (!enabled) return {status:'disabled'};
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, {once:true});
  const timer = setTimeout(cancel, 8000);
  try {
    const response = await fetcher(GEO_ENDPOINT, {
      signal:controller.signal, mode:'cors', credentials:'omit', cache:'no-store',
      referrerPolicy:'no-referrer', redirect:'error',
    });
    if (controller.signal.aborted) throw Error('aborted');
    if (!response.ok) return {status:'error', reason:response.status === 429 ? 'rate-limit' : 'network'};
    const data = normalizeGeo(await response.json());
    if (controller.signal.aborted) throw Error('aborted');
    return {status:'ok', geo:data};
  } catch (error) {
    return {status:'error', reason:controller.signal.aborted ? 'timeout-or-cancelled' : 'unavailable'};
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
}

export function maskIP(ip) {
  return ip.includes(':') ? ip.split(':').slice(0,2).join(':')+'::…'
    : ip.includes('.') ? ip.split('.').slice(0,3).join('.')+'.…' : '—';
}

export function formatOffset(minutes) {
  if (minutes === null) return '—';
  const n = Math.abs(minutes);
  return `UTC${minutes >= 0 ? '+' : '-'}${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
