var request = require('request');
var async = require('async');

var auth = process.argv[2];
var app = process.argv[3];
var hours = process.argv[4] || 24;

if(!auth || !app)
{
  console.log("node scripts/tops.js dawguser:dawgpass appid");
  process.exit(1);
}

var req = {url:'https://dawg.singly.com/apps/logs'};
req.qs = {key:app, limit:100, offset:0};
req.headers = {"Authorization":"Basic " + new Buffer(auth).toString("base64")};
req.json = true;
var until = Date.now() - (3600*hours*1000);
var accounts = {};
var actprofile = {};

step(function(){
  async.forEachLimit(Object.keys(accounts), 10, function(act, cbAct){
    
    request.get({url:'https://dawg.singly.com/proxy/'+act+'/profile', headers:req.headers, json:true}, function(err, resp, profile){
      actprofile[act] = profile || {};
      cbAct();
    });
  }, function(){
    var acts = Object.keys(accounts);
    acts.sort(function(a,b){ return accounts[b] - accounts[a]; });
    acts.forEach(function(act){
      console.log(act, accounts[act], actprofile[act].name, actprofile[act].url, " ");
    });    
  });
});

function step(cb)
{
//  console.log(req.qs.offset);
  request.get(req, function(err, res, logs){
    if(err || !Array.isArray(logs)) return cb();
    var older = false;
    logs.forEach(function(log){
      if(log.at < until) older = true;
      if(!Array.isArray(log.data)) return;
      log.data.forEach(function(hit){
        if(!hit.act || hit.act == 'auth') return;
        if(!accounts[hit.act]) accounts[hit.act] = 0;
        accounts[hit.act]++;
      });
    });
    if(older) return cb();
    req.qs.offset += req.qs.limit;
    step(cb);
  });
}