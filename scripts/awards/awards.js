var fs = require('fs');
var nodemailer = require('nodemailer');

var tops = require('./tops');
var newApps = require('./newApps');
//var devapps = require('./devapps');

var auth, host;
var error, log;
var output = '';

exports.init = function(options) {
  tops.init(options.host, options.auth, options.ignore);
  newApps.init(options.host, options.auth, options.ignore);
  //devapps.init(options.host, options.auth);

  if (options.error) error = getFileLogger(options.error);
  else error = console.error;

  if (options.to && options.user && options.pass) {
    log = function(str) {
      output += str;
    };
  } else if (options.log) {
    log = getFileLogger(options.log);
  } else {
    log = console.log;
  }
};

function getFileLogger(filename) {
  return fs.appendFileSync.bind(fs, filename);
}

exports.awards = function(appID, hours, callback) {
  log('<h3> ' + tops.title + ' </h3>');
  tops.run(appID, hours, function(err, rows) {
    if (err) return error('tops error', err);
    printTable(tops, rows, log);
    //printCSV(tops, rows, log);
    log('<h3> ' + newApps.title + '</h3>');
    newApps.run(hours, function(err, rows) {
      if (err) return error('newApps error', err);
      printTable(newApps, rows, log);
      //newApps.print(rows, log, error);
      callback();
    });
    //return callback();
    // not running devapps for now
    /*log('<h3> Active app accounts likely to be developers </h3>');
    devapps.devapps(hours, function(err, rows) {
      if (err) return error('devapps error', err);
      devapps.print(rows, log, error);
      callback();
    });*/
  });
};


function printTable(script, rows, log) {
  log('<table><tr>');
  for (var i in script.columnNames) {
    log('<td>' + script.columnNames[i] + '</td>');
  }
  log('</tr>');
  rows.forEach(function(row) {
    log('<tr>');
    var rowVals = script.mapRow(row);
    for(var i in rowVals) {
      var text = '';
      var type = typeof rowVals[i];
      if (type === 'string' || type === 'number') text = rowVals[i]||'&nbsp';
      else if (type === 'object') {
        var href = rowVals[i].href;
        var str = rowVals[i].text || '--';
        if (rowVals[i].truncate) str = str.substring(0, rowVals[i].truncate);
        text = '<a href="' + href + '">' + str + '</a>';
      }
      log('<td>' + text + '</td>');
    }
  });
  log('</table>');
}

function printCSV(script, rows, log) {
  log(script.columnNames.join(','));
  for(var i in rows) {
    var rowVals = script.mapRow(rows[i]);
    rowText = '';
    for (var k in rowVals) {
      var text = '';
      var type = typeof rowVals[k];
      if (type === 'string' || type === 'number') text = rowVals[k];
      else if (type === 'object') {
        var str = rowVals[k].text || '--';
        if (rowVals[k].truncate) str = str.substring(0, rowVals[k].truncate);
        text = str;
      }
      rowText += text + ',';
    }
    log(rowText);
  }
}

function sendMail(options) {
  var smtpTransport = nodemailer.createTransport("SMTP", {
    service: options.service || "SendGrid",
    auth: {
      user: options.user,
      pass: options.pass
    }
  });

  var mailOptions = {
    from: options.from,
    to: options.to,
    subject: options.subject || "Daily Dev Awards",
    html: output,
    headers: {
      "X-SMTPAPI": {
        filters: {
          clicktrack: { settings: { enable:0 } },
          opentrack: { settings: { enable:0 } }
        }
      }
    }
  };

  smtpTransport.sendMail(mailOptions, function(err, response){
    if(err) error(err);
    smtpTransport.close();
  });
}


function main() {
  var argv = require('optimist')
      ['default']('hours', 24)
      ['default']('host', 'https://dawg.singly.com')
      .demand(['auth', 'app-id'])
      .usage('node scripts/awards.js --auth dawguser:dawgpass --app-id appid')
      .argv;

  exports.init(argv);

  log('<html><body>');
  log('<h2>Dev Awards produced at ' + new Date() + '</h2><br>');
  exports.awards(argv['app-id'], argv.hours, function(err) {
    log('</body></html>');
    if (argv.to && argv.user && argv.pass) {
      sendMail(argv);
    }
  });
}

if (process.argv[1] === __filename) {
  main();
}

