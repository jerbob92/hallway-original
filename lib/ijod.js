/*globals Buffer:true*/

/*
 *
 * Copyright (C) 2011, Singly, Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */


/*
 * Indexed JSON On Disk
 */

var fs = require('fs');
var path = require('path');
var zlib = require('compress-buffer');
var lutil = require('lutil');
var async = require('async');
var lconfig = require('lconfig');
var idr = require('idr');
var logger = require('logger').logger('IJOD');
var dMap = require('dMap');
var mmh = require('murmurhash3');
var instruments = require('instruments');
var memcachelib = require('optional-memcache');
var memcache;
var qix = require('qix');
var entries = require('entries');
var friends = require('friends');

exports.debug = lconfig.debug;

exports.initDB = function(cb){cb()};

function qbox(options, binds) {
  var sql = '';
  if (options && options.box) {
    sql += ' AND lat > ? AND lat < ? AND lng > ? and lng < ?';
    binds.push(options.box.lat[0], options.box.lat[1], options.box.lng[0],
      options.box.lng[1]);
  }
  return sql;
}

function qq(q, sensitive) {
  if (!q) return '';
  var buf = qix.buf(q, sensitive);
  if (!buf) return '';
  var ret = '';
  for (var i = 0; i < 4; i++) {
    var hex = (i < 3) ? buf.slice(i * 8, (i * 8) + 8).toString('hex') :
      buf.slice(24).toString('hex');
    ret += " AND q" + i + " & x'" + hex + "' = x'" + hex + "'";
  }
  return ret;
}


// get raw bits for friends filtering
exports.getPars = function(basePath, options, cbDone) {
return cbDone();
};

// just get the pars from one idr (all of them, or just one category of them)
exports.getOnePars = function(targetIdr, cat, cbDone) {
  return cbDone();
};

// save a single row to entries table tying this id to this set of parallels
exports.setOneCat = function(id, cat, options, cbDone){
  return cbDone();
};

function qget(entry) {
  var oe = dMap.get('oembed', entry.data, entry.idr) || {};
  return [
    entry.q,
    (oe.type === 'link') ? oe.url: '',
    oe.title,
    oe.author_name,
    oe.handle,
    oe.email,
    dMap.get('text', entry.data, entry.idr)
  ].join(" "); // get all queryable strings
}

exports.qtext = qget;

function par2hex(part) {
  var ret = ((parseInt(mmh.murmur32HexSync(part),16) % 254)+1).toString(16);
  return (ret.length === 1) ? '0'+ret : ret;
}

// turn list of participants into proper sql filtering
function parq(parts) {
  if (!parts || parts.length === 0) return "";
  var ret = "";
  parts.forEach(function(part) {
    // syntax for requiring minimum number of unique participants
    if (part.indexOf(">") === 0) {
      var amt = parseInt(part.substr(1), 10);
      if (amt > 0) ret += " AND LENGTH(par) > "+amt;
      return;
    }
    var hex;
    // syntax for requiring this id as the author
    if (part.indexOf("^") === 0) {
      hex = (part === '^self') ? 'ff' : par2hex(part.substr(1));
      ret += " AND ORD(par) = ORD(x'"+hex+"')";
      return;
    }
    hex = (part === 'self') ? 'ff' : par2hex(part);
    ret += " AND INSTR(par, x'"+hex+"') > 0";
  });
  return ret;
}

// extract participant array with author at first
function parget(entry) {
  var ret = [];
  var author = idr.parse(entry.idr).auth;
  var dparts = dMap.get('participants', entry.data, entry.idr);
  if (dparts) Object.keys(dparts).forEach(function(id) {
    if (dparts[id].author) {
      author = id.toString();
      return;
    }
    ret.push(id.toString());
  });
  ret.unshift(author);
  return ret;
}

exports.participants = parget;


/// Get a single entry from an IJOD, requested by specific IDR
exports.getOne = function(targetIdr, callback) {
  return callback();
};

// simple single deleter, initially used to remove tasks
exports.delOne = function(targetIdr, callback) {
  return callback();
};

/// Select a time based range of IJOD entries.
/**
* range is optional and will default to all entries, when supplied it should
* have start and end values.  The range is inclusive.
*
* Results are returned in reverse chronological order.
*/
exports.getRange = function(basePath, range, cbEach, cbDone) {
  return cbDone();
};

exports.batchSmartAdd = function(entries, callback) {
return callback();
};

// just quickly return the at bounds of a potential range request
exports.getBounds = function(basePath, range, cbDone) {
  return cbDone();
};

// only the timestamps for manual merging/windowing in entries.js
exports.getTardis = function(basePath, range, cbDone) {
  return cbDone();
};

// remove the hash so that any changes are re-saved, for internal use when data is indexed and not in ijod
exports.spoil = function(basePath, cbDone) {
  return cbDone();
};

// Takes a complete changeset breaks it down by base and saves it to S3
exports.pump = function(arg, cbDone) {
  return cbDone();
};
