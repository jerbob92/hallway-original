var request = require('request');
var async = require('async');

var auth = process.argv[2];
var hours = process.argv[3] || 24;
var host = process.argv[4] || 'https://dawg.singly.com';

if(!auth)
{
  console.log("node scripts/devapps.js dawguser:dawgpass");
  process.exit(1);
}

var req = {url:host+'/apps/logs'};
req.qs = {limit:100, offset:0};
req.headers = {"Authorization":"Basic " + new Buffer(auth).toString("base64")};
req.json = true;
var until = Date.now() - (3600*hours*1000);

request.get({url:host+'/productionappsactive', headers:req.headers, json:true}, function(err, resp, apps){
  if(!Array.isArray(apps))
  {
    console.log("oops",err,apps);
    process.exit(1);
  }
  async.forEachSeries(apps, function(app, cbApp){
    accounts(app.app, function(acts){
      var alist = Object.keys(acts).slice(0,3);
      async.forEach(alist, function(act, cbAct){
        request.get({url:host+'/proxy/'+act+'/profile', headers:req.headers, json:true}, function(err, resp, profile){
          console.log(app.app,act,profile.name,profile.url);
          cbAct();
        });
      },cbApp);
    });
  }, function(){
    process.exit(0);
  });
});

function accounts(app, cb)
{
  req.qs.key = app;
  request.get(req, function(err, res, logs){
    var acts = {};
    if(err || !Array.isArray(logs)) return cb(acts);
    logs.forEach(function(log){
      if(log.at < until) return;
      if(!Array.isArray(log.data)) return;
      log.data.forEach(function(hit){
        if(!hit.act || hit.act == 'auth') return;
        if(!acts[hit.act]) acts[hit.act] = true;
      });
    });
    cb(acts);
  });
}