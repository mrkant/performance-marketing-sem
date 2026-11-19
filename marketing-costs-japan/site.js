(function(){var d=document;
var bar=d.createElement('div');bar.className='progress';d.body.appendChild(bar);
function pg(){var h=d.documentElement,t=h.scrollHeight-h.clientHeight;bar.style.width=(t>0?h.scrollTop/t*100:0)+'%'}
addEventListener('scroll',pg,{passive:true});pg();
var by=d.querySelector('.byline'),mn=d.querySelector('main');
if(by&&mn){var w=mn.textContent.split(/\s+/).length;by.insertAdjacentText('beforeend',' · about '+Math.max(1,Math.round(w/200))+' min read')}
var dds=d.querySelectorAll('details.dd');
dds.forEach(function(x){x.addEventListener('toggle',function(){if(x.open)dds.forEach(function(y){if(y!==x)y.open=false})})});
d.addEventListener('click',function(e){if(!e.target.closest('details.dd'))dds.forEach(function(y){y.open=false})});
d.addEventListener('keydown',function(e){if(e.key==='Escape')dds.forEach(function(y){y.open=false})});
var Y=function(n){return '¥'+Math.round(n).toLocaleString('en-US')};
function $(i){return d.getElementById(i)}
function on(i,f){var b=$(i);if(b)b.addEventListener('click',f)}
on('qc-go',function(){var o=$('qc-svc').value.split('|'),lo=+o[0],hi=+o[1],v=+$('qc-val').value,r=$('qc-out');
if(!v){r.textContent='Enter a price in yen first.';return}
var rng='Published range for "'+o[3]+'": '+Y(lo)+' to '+Y(hi)+' '+o[2]+'. ';
r.textContent=rng+(v<lo?'Your quote is below that range. It can be fine for a small scope, so ask what is left out.':v>hi?'Your quote is above that range. Ask what extra is included: scope, revisions, who does the work, and who owns the files and accounts.':'Your quote is within the usual range. Compare the scope line by line.')+' This is a guide, not a verdict.'});
on('fc-go',function(){var s=+$('fc-spend').value,r=$('fc-out');if(!s){r.textContent='Enter a monthly ad budget first.';return}
r.textContent='Agency at about 20%: '+Y(s*.2)+'. Freelancer at 10 to 15%: '+Y(s*.1)+' to '+Y(s*.15)+'. A fixed freelancer fee of ¥30,000 to ¥100,000 equals '+(30000/s*100).toFixed(1)+'% to '+(100000/s*100).toFixed(1)+'% of your budget. Agencies often set minimum fees, so small budgets can cost a higher share.'});
on('in-go',function(){var f=+$('in-f').value,r=$('in-out');if(!f){r.textContent='Enter a follower count first.';return}
r.textContent='Direct deals are often priced at about ¥2 to ¥6 per follower: roughly '+Y(f*2)+' to '+Y(f*6)+' for one post. Matching platforms often work at ¥2 to ¥4 per follower: '+Y(f*2)+' to '+Y(f*4)+'. Audience fit matters more than follower count, and sponsored posts must be clearly labelled.'});
var T={sales:['Start with search ads and a landing page that converts, and measure cost per sale before anything else.','Combine search and social ads, add marketplace advertising if you sell on Amazon or Rakuten, and begin SEO for the long run.','Layer performance ads with video and influencers, and consider a regional TV test once the digital basics are profitable.'],aware:['Try short-video social posts and a small influencer pilot, and keep spend low until the message is proven.','Use social video ads and an influencer campaign, and consider one limited transit run with a code or QR to measure it.','Combine video, influencers and transit or regional TV, and set up brand-search tracking before launch.'],local:['Use a LINE official account, local search, and a simple landing page with a map and booking link.','Add local search and social ads, plus a poster on a nearby rail line if your customers commute through it.','Consider transit packages or regional TV tests alongside local search, and measure with unique codes.']};
on('mp-go',function(){$('mp-out').textContent=T[$('mp-goal').value][+$('mp-bud').value]+' This is an interpretation, a starting point and not advice.'});

var rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
d.querySelectorAll('.stat b[data-to]').forEach(function(b){var to=+b.dataset.to,dec=+(b.dataset.dec||0),pre=b.dataset.pre||'',suf=b.dataset.suf||'',t0=null,fin=pre+to.toFixed(dec)+suf;if(rm){b.textContent=fin;return}
function st(t){if(!t0)t0=t;var p=Math.min((t-t0)/900,1);b.textContent=pre+(to*p).toFixed(dec)+(p<1?'':suf);if(p<1)requestAnimationFrame(st);else b.textContent=fin}
b.textContent=pre+(0).toFixed(dec)+suf;requestAnimationFrame(st)});
var F=['Online advertising passed 50% of all advertising spend in Japan in 2025 for the first time (Dentsu).','Online video advertising passed ¥1 trillion in Japan in 2025 for the first time.','A 15-second video on the Yamanote Line for a week is listed at ¥4.8 million, while some quieter Tokyo lines list about ¥300,000–350,000.','Since 1 October 2023, advertising that consumers cannot recognise as advertising is treated as improper representation in Japan.','A ROAS of 3.0 can still mean zero profit once margin and fees are counted. See the worked example in the measurement guide.'],fi=0;
function sf(){var e=$('fact');if(e)e.textContent=F[fi%F.length]}
sf();on('fact-next',function(){fi++;sf()});
var Q=[['What share of Japan\'s 2025 advertising spend went online?',['About 30%','About 40%','About 50%','About 65%'],2,'Online advertising reached 50.2%, the first time it passed half.'],['What is a typical agency management fee on ad spend?',['About 2%','About 5%','About 20%','About 40%'],2,'About 20% is the common agency rate.'],['Since when has stealth marketing been restricted in Japan?',['2015','October 2023','2026','It is not restricted'],1,'The rule took effect on 1 October 2023.'],['What helps you measure a station poster?',['A QR code or unique web address','A bigger logo','Nothing is possible','More text'],0,'A QR code, promotion code or dedicated address gives you a trace.']],qi=0,sc=0;
function rq(){var q=$('quiz');if(!q)return;if(qi>=Q.length){q.innerHTML='<p><b>You scored '+sc+' out of '+Q.length+'.</b> '+(sc>=3?'Nicely informed!':'Worth a look at the guides.')+'</p><button type="button" id="q-again">Play again</button>';on('q-again',function(){qi=0;sc=0;rq()});return}
var c=Q[qi],h='<p><b>Question '+(qi+1)+' of '+Q.length+':</b> '+c[0]+'</p><div class="opts">';c[1].forEach(function(o,i){h+='<button type="button" data-i="'+i+'">'+o+'</button>'});q.innerHTML=h+'</div><p class="out" id="q-out" aria-live="polite"></p>';
q.querySelectorAll('.opts button').forEach(function(b){b.addEventListener('click',function(){var ok=+b.dataset.i===c[2];if(ok)sc++;q.querySelectorAll('.opts button').forEach(function(x){x.disabled=true});b.className=ok?'right':'wrong';$('q-out').innerHTML=(ok?'Correct. ':'Not quite. ')+c[3]+' <button type="button" id="q-next">'+(qi<Q.length-1?'Next':'See score')+'</button>';on('q-next',function(){qi++;rq()})})})}
rq();
})();