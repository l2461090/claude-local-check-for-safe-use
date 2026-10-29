// Copyright (c) 2026 l2461090. MIT License.
import {queryGeo, compareEnvironment, maskIP, formatOffset} from './consistency.js';

export function initConsistency(zh, onChange=()=>{}) {
  const $ = id => document.getElementById(id);
  const pick = (a,b) => zh ? a : b;
  const toggle=$('allow-geo'), button=$('geo-query'), state=$('geo-status'), list=$('geo-details');
  let pending=null, generation=0, summary='', latest={status:'disabled'};
  const setState = text => { state.textContent=text; $('geo-overview').textContent=text; summary=text; };
  function reset() {
    generation++; pending?.abort(); pending=null;
    latest={status:toggle.checked?'pending':'disabled'};
    list.replaceChildren(); button.disabled=!toggle.checked;
    setState(toggle.checked ? pick('已开启 · 开始检测时自动查询 IP','Enabled · IP lookup runs with the scan')
      : pick('未检测 · 联网查询已关闭','Not tested · online lookup is off'));
    $('geo-result').dataset.state='unknown';
    onChange();
  }
  function row(label,value) {
    const item=document.createElement('div'), name=document.createElement('dt'), detail=document.createElement('dd');
    name.textContent=label; detail.textContent=value; item.append(name,detail); list.append(item);
  }
  async function run() {
    reset();
    if (!toggle.checked) return;
    const id=generation; pending=new AbortController(); button.disabled=true;
    latest={status:'loading'}; onChange();
    setState(pick('正在查询 IP 地区…','Looking up IP location…'));
    const found=await queryGeo({enabled:true, signal:pending.signal});
    if (id!==generation || !toggle.checked) return;
    pending=null; button.disabled=false;
    if (found.status!=='ok') {
      latest={status:'error'};
      setState(found.reason==='rate-limit' ? pick('未检测 · 查询服务限流，请稍后重试','Not tested · lookup rate limited; retry later')
        : pick('未检测 · 网络、跨域或查询服务异常，请重试','Not tested · network, CORS or provider error; retry'));
      onChange();
      return;
    }
    const geo=found.geo, env={
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale:Intl.DateTimeFormat().resolvedOptions().locale,
      languages:Array.from(navigator.languages || [navigator.language]),
    };
    const c=compareEnvironment(geo,env);
    latest={status:'ok', geo, env, comparison:c};
    const zoneText={
      same:pick('时区一致','Timezone matches'),
      'same-offset':pick('时区名称不同，当前 UTC 时差相同','Different timezone names; same current UTC offset'),
      different:pick('时区与 IP 推定地区不一致','Timezone differs from estimated IP location'),
      unknown:pick('时区无法比较','Timezone comparison unavailable'),
    }[c.timezone];
    setState(zoneText); $('geo-result').dataset.state=c.timezone==='different'?'different':c.timezone==='unknown'?'unknown':'observed';
    row(pick('公网出口 IP（部分隐藏）','Public egress IP (masked)'),maskIP(geo.ip));
    row(pick('IP 推定地区','Estimated IP location'),`${geo.countryName} (${geo.countryCode})`);
    row(pick('IP 推定时区','Estimated IP timezone'),`${geo.timezone} · ${formatOffset(c.ipOffset)}`);
    row(pick('浏览器时区','Browser timezone'),`${env.timezone} · ${formatOffset(c.systemOffset)}`);
    row(pick('时区比较','Timezone comparison'),zoneText+(c.differenceMinutes === null ? '' : ` · ${pick('当前相差','Current difference')} ${Math.abs(c.differenceMinutes)/60} h`));
    row(pick('浏览器首选语言','Preferred browser language'),env.languages[0] || '—');
    row(pick('地区常用语言（资料库）','Languages listed for country'),geo.languages.join(', ') || pick('未提供','Not provided'));
    row(pick('语言比较（计入评分）','Language comparison (scored)'),{
      listed:pick('首选语言在地区常用语言列表中','Preferred language appears in the country list'),
      different:pick('首选语言不在地区常用语言列表中 · +18 分','Preferred language is not in the country list · +18'),
      unknown:pick('资料不足，未检测','Insufficient data; not tested'),
    }[c.language]);
    row(pick('区域格式比较（计入评分）','Locale region comparison (scored)'),`${env.locale} · `+{
      same:pick('区域代码与 IP 地区相同','Locale region matches IP country'),
      different:pick('区域代码与 IP 地区不同 · +4 分','Locale region differs from IP country · +4'),
      unknown:pick('无区域代码，未检测','No region code; not tested'),
    }[c.region]);
    row(pick('查询来源与时间','Provider and query time'),`ipapi.co · ${new Date().toLocaleString()}`);
    summary=zoneText+` · ${geo.countryCode} · ${env.timezone} / ${geo.timezone}`;
    onChange();
  }
  toggle.checked=true;
  toggle.addEventListener('change',reset);
  button.addEventListener('click',run);
  reset();
  return {run, reset, summary:()=>summary, snapshot:()=>latest};
}
