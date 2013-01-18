var crypto = require('crypto');
var fs = require('fs');
var sys = require('sys');
var _ = require('underscore')._;

// Split a profile@service combo, even if the profile ID contains multiple @
// characters (like flickr, which is like example@N01@flickr)
exports.parseProfileId = function (profileId) {
  profileId = profileId.split('@');

  var ret = {};

  ret.service = profileId.pop();
  ret.id = profileId.join('@');

  return ret;
};

// Get the hash of the current git revision
exports.currentRevision = function (cb) {
  fs.readFile('.branch', function(err, branchBuf) {
    if (err) return cb(err);
    fs.readFile('.commit', function(err, commitBuf) {
      if (err) return cb(err);
      var ret = {
        commit: {
          id: commitBuf.toString().replace(/\s+/g, '')
        },
        name: branchBuf.toString().replace(/\s+/g, '')
      };
      return cb(null, ret);
    });
  });
};

// Get the hash of the specified file
exports.hashFile = function (filename, cb) {
  var md5sum = crypto.createHash('md5');

  var s = fs.ReadStream(filename);

  s.on('data', function (data) {
    md5sum.update(data);
  });

  s.on('end', function () {
    cb(null, md5sum.digest('hex'));
  });

  s.on('error', function (e) {
    cb(e);
  });
};

// simple util for consistent but flexible binary options
exports.isTrue = function(field) {
  if (!field) return false;
  if (field === true) return true;
  if (field === "true") return true;
  if (field === "yes") return true;
  if (parseInt(field, 10) === 1) return true;

  return false;
};

// quick/dirty sanitization ripped from the Jade template engine
exports.sanitize = function(term) {
  // handle foreign things more informatively
  if (typeof(term) !== 'string') term = sys.inspect(term);
  return term
    .replace(/&(?!\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/// An async forEachSeries
/**
* The async implementation can explode the stack, this version will not.
*/
exports.forEachSeries = function(items, cbEach, cbDone) {
  function runOne(idx) {
    idx = idx || 0;
    if (idx >= items.length) return cbDone();
    cbEach(items[idx], function(err) {
      if (err) return cbDone(err);
      process.nextTick(function() {
        runOne(idx + 1);
      });
    });
  }
  runOne();
};

exports.jsonErr = function(msg, extras) {
  return _.extend(extras || {}, { error: exports.sanitize(msg) });
};

exports.selectFields = function(obj, fields) {
  // Accept 'a.b,c.d,e.f'
  if (typeof(fields) === 'string') {
    fields = fields.split(',');
  }
  // Accept ['a.b', 'c.d', 'e.f']
  if (typeof(fields[0]) === 'string') {
    fields.forEach(function(field, i) {
      fields[i] = field.split('.');
    });
  }

  if (fields.length === 0) return obj; // Done

  if (Array.isArray(obj)) {
    return _.map(obj, function(item) {
      return exports.selectFields(item, fields);
    });
  } else if (typeof(obj) === 'object'){
    var selected = {};
    fields.forEach(function(parts) {
      var name = parts[0];
      var rest = parts.slice(1);
      if (obj[name]) {
        var child = exports.selectFields(obj[name], (rest.length > 0) ? [rest] : []);
        if (typeof(selected[name]) === 'object') {
          selected[name] = _.extend(selected[name], child);
        } else {
          selected[name] = child;
        }
      }
    });
    return selected;
  } else { // Promitive (int, string, etc.)
    return obj;
  }
};

exports.trimObject = function(obj) {
  Object.keys(obj).forEach(function(key) {
    var val = obj[key];
    if (typeof(val) === 'string') {
      val = val.trim();
    } else if (typeof(val) === 'object') {
      val = exports.trimObject(val);
    }
    obj[key] = val;
  });
  return obj;
};
