const POSITIVE = [
  "bullish","bull","buy","bought","accumulate","accumulation","breakout","break out","breaks out",
  "moon","mooning","upside","higher","rally","rallies","surge","surging","strong","strength",
  "green","profit","profits","winner","winning","undervalued","cheap","support","reversal",
  "recovery","recovering","beat","beats","outperform","outperformed","upgrade","upgraded",
  "growth","growing","long","calls","squeeze","squeezing","ath","all time high","rocket"
];
const NEGATIVE = [
  "bearish","bear","sell","sold","short","downside","lower","breakdown","break down","crash",
  "crashing","dump","dumping","weak","weakness","red","loss","losses","losing","overvalued",
  "expensive","resistance","rejection","reject","decline","declining","miss","missed","underperform",
  "downgrade","downgraded","risk","risks","rug","rugged","puts","dilution","diluted","offering",
  "bankrupt","bankruptcy","fraud","scam"
];
function scoreText(text){
  const t=text.toLowerCase();
  let p=0,n=0;
  for(const w of POSITIVE) p += t.includes(w) ? (w.includes(" ") ? 1.5 : 1) : 0;
  for(const w of NEGATIVE) n += t.includes(w) ? (w.includes(" ") ? 1.5 : 1) : 0;
  const raw=(p-n);
  return Math.max(-100,Math.min(100,Math.round(raw*18)));
}
function cleanQuery(q){
  q=q.trim().replace(/^[$#]/,'').toUpperCase();
  if(!/^[A-Z0-9._-]{1,15}$/.test(q)) throw new Error("Use a ticker or short market symbol, such as HGRAF or SLV.");
  return q;
}
function json(status, body){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
export default async function handler(req){
  try{
    const url=new URL(req.url);
    const q=cleanQuery(url.searchParams.get("q")||"");
    const hours=Math.min(168,Math.max(0.5,Number(url.searchParams.get("hours")||24)));
    const requested=Math.min(1000,Math.max(10,Number(url.searchParams.get("limit")||1000)));
    const token=process.env.X_BEARER_TOKEN;
    if(!token) return json(500,{error:"X_BEARER_TOKEN is not configured on this deployment."});

    const start=new Date(Date.now()-hours*3600*1000).toISOString();
    const query=`($${q} OR ${q}) -is:retweet`;
    let next=null, posts=[], pages=0;
    while(posts.length<requested && pages<10){
      const params=new URLSearchParams({query,start_time:start,max_results:String(Math.min(100,requested-posts.length)),tweet_fields:"created_at,public_metrics,lang,author_id",expansions:"author_id",user_fields:"name,username,verified"});
      if(next) params.set("next_token",next);
      const r=await fetch("https://api.x.com/2/tweets/search/recent?"+params.toString(),{headers:{Authorization:`Bearer ${token}`}});
      const raw=await r.text();
      let data; try{data=JSON.parse(raw)}catch{ return json(502,{error:`X returned non-JSON (${r.status}).`}); }
      if(!r.ok) return json(r.status,{error:data.detail||data.title||data.errors?.[0]?.message||"X API request failed",x_status:r.status});
      const users=Object.fromEntries((data.includes?.users||[]).map(u=>[u.id,u]));
      for(const t of (data.data||[])){
        const u=users[t.author_id]||{};
        const m=t.public_metrics||{};
        posts.push({id:t.id,text:t.text,created_at:t.created_at,name:u.name||"X user",username:u.username||"unknown",verified:!!u.verified,likes:m.like_count||0,reposts:m.retweet_count||0,replies:m.reply_count||0,impressions:m.impression_count||0,sentiment:scoreText(t.text)});
      }
      next=data.meta?.next_token||null; pages++;
      if(!next)break;
    }
    // Deduplicate and rank by engagement.
    const unique=[...new Map(posts.map(p=>[p.id,p])).values()];
    const weighted=unique.map(p=>({p,w:1+Math.log10(1+p.likes+p.reposts*2+p.replies)}));
    const totalW=weighted.reduce((a,x)=>a+x.w,0)||1;
    const score=weighted.reduce((a,x)=>a+x.p.sentiment*x.w,0)/totalW;
    const bullish=unique.filter(p=>p.sentiment>15).length/Math.max(1,unique.length);
    const bearish=unique.filter(p=>p.sentiment<-15).length/Math.max(1,unique.length);
    const neutral=Math.max(0,1-bullish-bearish);
    const confidence=Math.min(0.99,0.35+Math.min(0.5,unique.length/500)+Math.min(0.14,Math.abs(score)/500));
    unique.sort((a,b)=>(b.likes+b.reposts*2+b.replies)-(a.likes+a.reposts*2+a.replies));
    const windowLabel=hours<1?`${Math.round(hours*60)} min`:hours<24?`${hours} hr`:`${hours/24} day${hours/24===1?"":"s"}`;
    return json(200,{query:q,count:unique.length,score, bullish,neutral,bearish,confidence,windowLabel,posts:unique.slice(0,40),meta:{pages,query}});
  }catch(e){
    return json(500,{error:e?.message||"Unexpected server error"});
  }
}
