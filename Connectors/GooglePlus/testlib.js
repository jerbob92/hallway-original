var fs = require("fs");
var g = require("./lib.js");
var me = JSON.parse(fs.readFileSync('../../Me/gplus/me.json'));
var me2 = JSON.parse(fs.readFileSync('../../Config/apikeys.json'));
me.auth.appKey = me2.gplus.appKey;
me.auth.appSecret = me2.gplus.appSecret;
g.init(me.auth);
var me;
g.getMe({},function(js){  console.log("ME\t"+JSON.stringify(js)); me=js}, function(err){
	if(err) console.log("error: "+err);
//	g.getActivities({},function(js){  console.log("ACTIVITY\t"+JSON.stringify(js));}, function(err){ if(err) console.log("error: "+err);});
});


var s = require("./activities.js");
s.sync({auth:me.auth},function(e,js){
    console.error("got e:"+JSON.stringify(e));
    console.error("got js:"+JSON.stringify(js));
});
