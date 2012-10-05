var lib = require('./lib');

var MAX_QUERIES = 10;

function syncSleepRecords(recordsArray, pi, cb) {
  if (recordsArray.length >= MAX_QUERIES) {
    pi.config.nextRun = -1;
  }

  pi.data = {};

  if (recordsArray.length > 0) {
    pi.config.sleepRecordsSince = recordsArray[recordsArray.length - 1].startDate;
  }

  pi.data['sleeprecord:' + pi.auth.pid + '/sleep_records'] = recordsArray;

  cb(null, pi);
}

function nextRecord(recordsArray, date, pi, cb) {
  lib.apiCall({ auth: pi.auth, query: '/getNextSleepRecord',
    params: { date: date.year + '-' + date.month + '-' + date.day } },
    function(err, body) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode + ', body ' + body));
    }

    if (!body || !body.response) {
      return cb(new Error('Missing response JSON'));
    }

    var record = body.response.sleepRecord;

    if (!record || recordsArray.length >= MAX_QUERIES) {
      syncSleepRecords(recordsArray, pi, cb);
    } else {
      recordsArray.push(record);

      nextRecord(recordsArray, record.startDate, pi, cb);
    }
  });
}

exports.sync = function(pi, cb) {
  pi.config = pi.config || {};

  lib.apiCall({ auth: pi.auth, query: '/getEarliestSleepRecord' },
    function(err, body, resp) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode + ', body ' + body));
    }

    if (!body || !body.response || !body.response.sleepRecord) {
      return cb(new Error('Missing response JSON'));
    }

    var record = body.response.sleepRecord;

    if (!record.startDate) {
      return cb(new Error('Missing required date field'));
    }

    var recordsArray = [];

    if (pi.config.sleepRecordsSince) {
      record.startDate = pi.config.sleepRecordsSince;
    } else {
      recordsArray.push(record);
    }

    nextRecord(recordsArray, record.startDate, pi, cb);
  });
};
