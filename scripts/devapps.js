var request = require('request');
var async = require('async');

var host, auth;

exports.init = function(_host, _auth) {
  host = _host;
  auth = {Authorization:"Basic " + new Buffer(_auth).toString("base64")};
};

function getProfile(act, callback) {
  request.get({url:host+'/proxy/'+act+'/profile',
    headers:auth, json:true}, function(err, resp, profile) {
    return callback(err, profile);
  });
}

function getAppDevs(app, until, callback) {
  var appdevs = [];
  accounts(app.app, until, function(err, acts) {
    if (err) return callback(err);
    var alist = Object.keys(acts).slice(0,3);
    async.forEach(alist, function(act, cbAct) {
      getProfile(act, function(err, profile) {
        if(err) return callback(err);
        appdevs.push({
          app: app,
          account: act,
          profile: profile
        });
        cbAct();
      });
    }, function(err) {
      return callback(err, appdevs);
    });
  });
}

exports.devapps = function(hours, callback) {
  var until = Date.now() - (3600*hours*1000);
  var req = {url:host+'/productionappsactive', headers:auth, json:true};
  var devapps = [];
  request.get(req, function(err, resp, apps) {
    if (err) return callback(err);
    if(!Array.isArray(apps)) return callback('no apps returned');
    apps = apps.slice(0, 3);
    async.forEachSeries(apps, function(app, cbApp) {
      getAppDevs(app, until, function(err, appdevs) {
        if (err) return callback(err);
        appdevs.forEach(function(appdev) {
          devapps.push(appdev);
        });
        cbApp();
      });
    }, function(err) {
      return callback(err, devapps);
    });
  });
};

function accounts(app, until, cb) {
  var req = {
    url: host+'/apps/logs',
    qs: {
      limit:100,
      offset:0,
      key: app
    },
    headers: auth,
    json: true
  };
  request.get(req, function(err, res, logs){
    var acts = {};
    if (err) return cb(err);
    if (!Array.isArray(logs)) return cb('logs isn\'t and array');
    logs.forEach(function(log) {
      if(log.at < until) return;
      if(!Array.isArray(log.data)) return;
      log.data.forEach(function(hit){
        if(!hit.act || hit.act === 'auth') return;
        if(!acts[hit.act]) acts[hit.act] = true;
      });
    });
    cb(null, acts);
  });
}

exports.print = function(rows, log, error) {

  function logRow(app, act, profile) {
     var html = '<tr>';
     html += '<td>';
     html += '<a href="https://dawg.singly.com/apps/get?key=';
     html += app.app;
     html += '">' + app.app.substring(0, 6) + '</a></td>';
     html += '<td>';
     html += '<a href="https://dawg.singly.com/apps/account?id=' + act;
     html += '">' + act.substring(0, 6) + '</a></td>';
     html += '<td>' + (profile.name || '') + '</td>';
     html += '<td><a href="' + profile.url + '">';
     html += (profile.handle || '') + '</a></td>';
     html += '<td>' + (profile.location || '') + '</td>';
     html += '<td>' + (profile.email || '') + '</td>';
     html += '</tr>';
     log(html);
  }

  log('<table><tr>');
  log('<td>App ID</td><td>Account</td><td>Name</td><td>Social Prof</td><td>Loc</td><td>Email</td>');
  log('</tr>');
  rows.forEach(function(row) {
    logRow(row.app, row.account, row.profile);
  });
  log('</table>');
};

function main() {
  var argv = require('optimist')
      ['default']('hours', 24)
      ['default']('host', 'https://dawg.singly.com') .demand(['auth'])
      .usage('node scripts/tops.js --auth dawguser:dawgpass')
      .argv;

  exports.init(argv.host, argv.auth);

  exports.devapps(argv.hours, function(err, rows) {
    if (err) return console.error(err);
    exports.print(rows, console.log, console.error);
  });
}

if (process.argv[1] === __filename) {
  main();
}
