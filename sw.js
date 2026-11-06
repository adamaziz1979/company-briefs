/* Company Briefs offline copy.
   Keeps the home page and every brief listed in index.html on the device.
   With internet: always fetches the latest (falls back to the saved copy after 4 s).
   Without internet: serves the saved copy. New briefs are picked up automatically
   because the brief list is read from index.html on every sync. */
var CACHE='company-briefs-v1';
var CORE=['./','index.html','manifest.json','icon-180.png','icon-512.png'];

function briefFiles(html){
  var out=[],re=/file:"([^"]+\.html)"/g,m;
  while((m=re.exec(html)))out.push(m[1]);
  return out;
}
function syncAll(){
  return caches.open(CACHE).then(function(c){
    return fetch('index.html',{cache:'no-cache'}).then(function(r){
      if(!r.ok)throw new Error('index '+r.status);
      return r.clone().text().then(function(html){
        return c.put('index.html',r.clone()).then(function(){return c.put('./',r)}).then(function(){
          var list=CORE.slice(2).concat(briefFiles(html));
          return Promise.all(list.map(function(u){
            return fetch(u,{cache:'no-cache'}).then(function(res){if(res.ok)return c.put(u,res)}).catch(function(){});
          }));
        });
      });
    });
  });
}
self.addEventListener('install',function(e){e.waitUntil(syncAll().then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener('message',function(e){
  if(e.data==='sync')e.waitUntil(syncAll().catch(function(){}));
});
function timeout(ms){return new Promise(function(_,rej){setTimeout(function(){rej(new Error('timeout'))},ms)})}
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var url=new URL(req.url);
  // Fonts: saved copy first (they never change)
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open(CACHE).then(function(c){
      return c.match(req).then(function(hit){
        return hit||fetch(req).then(function(res){c.put(req,res.clone());return res});
      });
    }));
    return;
  }
  if(url.origin!==location.origin)return;
  // This site: latest from the internet, saved copy if offline or slow
  e.respondWith(caches.open(CACHE).then(function(c){
    var net=fetch(req).then(function(res){
      if(res.ok)c.put(url.pathname.endsWith('/')?'./':req,res.clone());
      return res;
    });
    return Promise.race([net,timeout(4000)]).catch(function(){
      return c.match(req,{ignoreSearch:true}).then(function(hit){
        if(hit)return hit;
        if(req.mode==='navigate')return c.match('index.html').then(function(h){return h||net});
        return net;
      });
    });
  }));
});
