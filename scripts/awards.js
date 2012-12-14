var fs = require('fs');
var nodemailer = require('nodemailer');

var tops = require('./tops');
var devapps = require('./devapps');

var auth, host;
var error, log;
var output = '';

exports.init = function(options) {
  tops.init(options.host, options.auth);
  devapps.init(options.host, options.auth);

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
  log('<h3> Top developers on singly.com </h3>');
  tops.tops(appID, hours, function(err, rows) {
    if (err) return error('tops error', err);
    tops.print(rows, log, error);
    log('<h3> Active app accounts likely to be developers </h3>');
    devapps.devapps(hours, function(err, rows) {
      if (err) return error('devapps error', err);
      devapps.print(rows, log, error);
      callback();
    });
  });
};

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
    html: output
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
  log('<h2>Evening Dev Awards produced at ' + new Date() + '</h2><br>');
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

