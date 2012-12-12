var fs = require('fs');

var tops = require('./tops');
var devapps = require('./devapps');

var auth, host;
var error, log;

exports.init = function(_host, _auth, _log, _error) {
  tops.init(_host, _auth);
  devapps.init(_host, _auth);

  if (_error) error = getFileLogger(_error);
  else error = console.error;
  if (_log) log = getFileLogger(_log);
  else log = console.log;
};

function getFileLogger(filename) {
  return fs.appendFileSync.bind(fs, filename);
}

exports.awards = function(appID, hours, callback) {
  log('<h3> Top developers on singly.com </h3>');
  tops.tops(appID, hours, function(err, rows) {
    if (err) return error(err);
    tops.print(rows, log, error);
    log('<h3> Active app accounts likely to be developers </h3>');
    devapps.devapps(hours, function(err, rows) {
      if (err) return error(err);
      devapps.print(rows, log, error);
      callback();
    });
  });
};


function main() {
  var argv = require('optimist')
      ['default']('hours', 24)
      ['default']('host', 'https://dawg.singly.com')
      .demand(['auth', 'app-id'])
      .usage('node scripts/awards.js --auth dawguser:dawgpass --app-id appid')
      .argv;

  exports.init(argv.host, argv.auth, argv.log, argv.error);

  log('<html><body>');
  log('<h2>Evening Dev Awards produced at ' + new Date() + '</h2><br>');
  exports.awards(argv['app-id'], argv.hours, function(err) {
    log('</body></html>');
  });
}

if (process.argv[1] === __filename) {
  main();
}

