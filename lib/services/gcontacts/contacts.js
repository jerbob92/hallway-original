var gdata = require('gdata-js');

var MAX_RESULTS = 100;

var CONTACTS_URL = 'https://www.google.com/m8/feeds/contacts/default/full';

function pad(n) {
  return n < 10 ? '0' + n : n;
}

function getISODateString(dt) {
  return dt.getUTCFullYear() + '-' +
    pad(dt.getUTCMonth() + 1) + '-' +
    pad(dt.getUTCDate()) + 'T' +
    pad(dt.getUTCHours()) + ':' +
    pad(dt.getUTCMinutes()) + ':' +
    pad(dt.getUTCSeconds()) + 'Z';
}

exports.sync = function (pi, callback) {
  if (!pi.config.lastUpdate) {
    pi.config.lastUpdate = 1;
  }

  if (!pi.config.startIndex) {
    pi.config.startIndex = 1;
  }

  var params = {
    'showdeleted': 'true',
    'sortorder': 'ascending',
    'orderby': 'lastmodified',
    'v': '3.0',
    'updated-min': getISODateString(new Date(pi.config.lastUpdate)),
    'start-index': pi.config.startIndex,
    'max-results': MAX_RESULTS
  };

  var now = Date.now();

  gdata.clientFromAuth(pi.auth).getFeed(CONTACTS_URL, params,
    function (err, result) {
    if (!(result && result.feed) || err || result.error) {
      console.error('google contacts BARF! err=', err, ', result=', result);
      return callback(err);
    }

    var responseObj = {
      data: {},
      config: {
        startIndex: pi.config.startIndex,
        lastUpdate: now
      },
      auth: pi.auth
    };

    responseObj.data['contact:' + pi.auth.pid + '/contacts'] = result.feed.entry;

    if (result.feed.entry && result.feed.entry.length > 0) {
      responseObj.config.lastUpdate = pi.config.lastUpdate;
      responseObj.config.startIndex += result.feed.entry.length;
      responseObj.config.nextRun = -1;
    } else {
      responseObj.config.startIndex = 1;
      responseObj.config.nextRun = 0;
    }

    return callback(null, responseObj);
  });
};
