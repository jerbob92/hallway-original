var async = require('async');
var logger = require('logger').logger('entries');
var ijod = require('ijod');
var idr = require('idr');
var qix = require('qix');
var lutil = require('lutil');
var dMap = require('dMap');
var taskmanNG = require('taskman-ng');
var pipeline = require('pipeline');
var podClient = require('podClient');

// we expect options to be sane here first!
exports.runBases = function(bases, options, cbEach, cbDone) {
  // if first time, since we recurse, track special things
  if (!options.orig) {
    options.orig = {since:options.since, until:options.until, limit:options.limit};
    options.steps = 0;
    options.skips = {};
    options.dups = {};
    options.left = options.limit;
  }
  options.steps++;
  // often this is just a drive-thru
  windower(bases, options, function(none) {
    logger.debug("windowed",options,none);
    if (none) return cbDone(); // nothing to return
    var batch = [];
    var maxed = false; // track if any base got all results
    async.forEach(bases, function(base, cb) {
      // this returns immediately if no base is given
      taskmanNG.fresh(options.fresh && base, function(err) {
        if (err) logger.warn("fresh error",base,err);
        podClient.getRange(base, options, function(item) {
          if (options.skips[item.id]) return; // skip complete exact dups
          options.skips[item.id] = base;
          item.guid = dMap.guid(item); // always generate a guid if possible
          batch.push(item);
        }, function(err, flags) {
          if (err) logger.warn(err);
          if (flags && flags.rawlen === options.limit) maxed = true; // at least one was 'full'
          cb();
        });
      });
    }, function() {
      // condense down!
      if (options.dedup) {
        // first sort old->new as oldest is the primary signal
        batch.sort(function(a, b) {
          return a.at - b.at;
        });

        var batch2 = [];
        var guids = {};

        batch.forEach(function(item) {
          if (!item.guid) return batch2.push(item);
          var dup = false;
          // allow guids to be a space separated list
          item.guid.split(' ').forEach(function(guid) {
            // save oldest id for debugging
            if (guids[guid]) dup = guid;
            else guids[guid] = item.id;
          });
          if (!dup) batch2.push(item);
          if (dup) options.dups[item.id] = guids[dup]; // debug=true handiness
        });

        batch = batch2;
      }
      batch.sort(function(a, b) {
        return b.at - a.at;
      });
      var ret = batch.slice(0, options.left);
      ret.forEach(function(entry) {
        cbEach(entry, options.skips[entry.id]);
      });
      options.left -= ret.length;
      // if we have enough, we've stepped too much, or there werent enough results, we're done!
      if (options.left <= 0 || options.steps > 5 || !maxed) return cbDone();
      // recurse and get the remainder, starting from last point if any or upping limit otherwise
      if (ret.length > 0) {
        options.until = ret[ret.length - 1].at;
        options.since = options.orig.since; // reset to orig since windower may have shrunk
      } else {
        options.limit = options.limit * 2;
      }
      logger.info("recursing to get more",bases,options,batch.length);
      exports.runBases(bases, options, cbEach, cbDone);
    });
  });
};

// optionally modifies options to create a fixed time window matching the requirements when multiple bases
function windower(bases, options, cb) {
  if (bases.length === 1) return cb();

  var times = [];
  async.forEach(bases, function(base, cb) {
    podClient.getTardis(base, options, function(err, rows) {
      if (rows) rows.forEach(function(row) {
        times.push(row.at);
      });
      return cb();
    });
  }, function() {
    logger.debug("tardis",times.length,options);
    if (times.length === 0) return cb(); // better safe
    times.sort(function(a,b) {
      return b - a;
    });
    var subset = times.slice(0, options.limit);
    if (subset.length === 0) return cb(true);
    // force shared window size, inclusive!
    if (times.length > options.limit) {
      options.until = parseInt(subset[0], 10) + 1;
      options.since = parseInt(subset[subset.length - 1], 10) - 1;
    }
    cb();
  });
}

// turn any entry-returning api path and query args, plus available profiles, into an array of bases
exports.bases = function(path, query, profilesIN) {
  var bases = [];
  if (!path) return bases;
  var profiles = [];
  if (!query) query = {};

  // we accept two formats of profiles, normalize and reduce by any services filter
  var services = query.services && query.services.split(',');
  profilesIN.forEach(function(x) {
    var profile = (typeof x === 'object') ? x.profile : x;
    if (
      services &&
      services.indexOf(profile.split('@')[1]) === -1 &&
      services.indexOf(profile) === -1
    ) return; // skip if service or id@service filter
    profiles.push(profile);
  });

  if (path.indexOf('?') >= 0) path = path.substr(0,path.indexOf('?'));

  // our /services/:SERVICE/:PATH
  var parts = path.split('/');
  if (parts.length <2) return bases;
  if (parts[1] === 'services') {
    var service = parts[2];
    var endpoint = parts[3];
    profiles.forEach(function(pid) {
      if (pid.split('@')[1] !== service) return; // only use profiles matching this service
      // support /services/:service to get all
      if (!endpoint) return dMap.bases([pid]).forEach(function(base) {
        bases.push(base);
      });
      var type = query.type || dMap.defaults(service, endpoint) || 'data'; // data is the default for app written data
      bases.push(type + ':' + pid + '/' + endpoint);
    });
  }

  // our /types/:TYPE
  if (parts[1] === 'types') {
    bases = dMap.types(parts[2], profiles);
  }

  return bases;
};

// util to take a standard entries request and turn it into normalized options
exports.options = function(query, path) {
  var options = {};
  if (!query) return options;

  // normalize the selective options
  options.since = parseInt(query.since, 10) || undefined;
  options.until = parseInt(query.until, 10) || undefined;
  options.limit = parseInt(query.limit, 10) || 20;
  options.q = query.q;
  if (query.participants) options.participants = query.participants.split(",");
  options.dedup = lutil.isTrue(query.dedup);

  // legacy, to be deleted when unused or v1
  if (query.min_count) options.limit = parseInt(query.min_count, 10);
  if (query.max_count) options.limit = parseInt(query.max_count, 10);

  // sanity checks
  if (options.limit < 0) options.limit = 20;

  // near=lat,lng&within=X
  if (query.near) {
    var ll = query.near.split(",");
    var lat = parseFloat(ll[0]);
    var lng = parseFloat(ll[1]);
    var within = parseFloat(query.within||10); // kilometers
    if (
        typeof within !== 'number' ||
        isNaN(within) ||
        typeof lat !== 'number' ||
        isNaN(lat) ||
        typeof lng !== 'number' ||
        isNaN(lng)
    ) {
      logger.warn("invalid near/within", query.near, within);
    } else {
      // radians, bounding box
      var diff = (Math.asin(Math.sin((within / 6371) / 2)) * 2) / Math.PI * 180;
      options.box = {lat:[lat+diff, lat-diff], lng:[lng+diff, lng-diff]};
      options.box.lat.sort(function(a,b) {
        return a-b;
      });
      options.box.lng.sort(function(a,b) {
        return a-b;
      });
    }
  }

  // normalize the response options
  options.map = lutil.isTrue(query.map);
  options.fields = query.fields;
  options.select = query.select;

  // optionally extract the desired type from the path
  if (path && path.indexOf('?') >= 0) path = path.substr(0,path.indexOf('?'));
  if (path && path.split('/')[1] === 'types') options.type = path.split('/')[2];

  return options;
};

// apply and enforce any options to the result entry to validate it, the boundary between here and ijod is weird yet
exports.filter = function(entries, options) {
  // short cut
  if (!options || Object.keys(options).length === 0) return entries;

  // reduce list based on any options filtering
  return entries.filter(function(entry) {
    if (options.q) {
      var q = qix.chunk(ijod.qtext(entry));
      var parts = qix.chunk(options.q);
      var queryMatches = 0;
      parts.forEach(function(part) {
        if (q.indexOf(part) >= 0) queryMatches++;
      });
      if (queryMatches !== parts.length) {
        logger.warn("couldn't find QUERY ",parts.join(','),"in",q.join(','));
        return false;
      }
    }
    if (options.participants) {
      var pentry = ijod.participants(entry);
      var participantMatches = 0;
      options.participants.forEach(function(par) {
        if (par.indexOf('^') === 0 && (par === "^self" || pentry[0] === par.substr(1))) {
          return participantMatches++; // authors are [0]
        }
        if (par === "self" || par.indexOf(">") === 0 || pentry.indexOf(par) >= 0) {
          participantMatches++;
        }
      });
      if (participantMatches !== options.participants.length) {
        logger.warn("couldn't find PARTICIPANTS ",options.participants.join(','),"in",pentry.join(','));
        return false;
      }
    }
    if (options.box) {
      var ll = dMap.get('ll',entry.data,entry.idr);
      if (!ll) return false;
      // TODO someday use actual circle or poly filter of results to make them even more accurate :)
      var within = (ll[0] > options.box.lat[0] && ll[0] < options.box.lat[1] && ll[1] > options.box.lng[0] && ll[1] < options.box.lng[1]) ? true : false;
      if (!within) return false;
    }

    // we don't apply limits, since, until, etc here since that is done by ijod, and in the case of push filtering it doesn't make sense
    return true;
  });
};

// bit of logic to try to add proper oembed to anything that should be typed
// is dumb tho and can only add a _key flag when an oembed needs to be appended (for now)
exports.typist = function(entry, base, options) {
  if (!options || !options.type) return; // no type, no need to get oembeds
  // first try to dmap w/ the type'd idr so that the map can override it
  var typed = idr.clone(base);
  var orig = idr.parse(entry.idr);

  typed.hash = orig.hash;
  entry.oembed = dMap.get('oembed', entry.data, typed);
  if (!entry.oembed) entry.oembed = dMap.get('oembed', entry.data, orig);

  // handle statuses custom
  if (options.type === 'statuses' || options.type === 'statuses_feed' || (entry.types && entry.types.status)) {
    var text = (entry.map && entry.map.text) ? entry.map.text : dMap.get('text', entry.data, entry.idr);

    if (!text) {
      return logger.warn("missing text for", entry.idr); // bail if none!
    }

    entry.oembed = {
      type: 'text',
      text: text
    };
  }

  var tomap = {
    "photos": "photo:links/oembed",
    "news": "link:links/oembed",
    "photos_feed": "photo:links/oembed",
    "news_feed": "link:links/oembed",
    "videos": "video:links/oembed",
    "videos_feed": "video:links/oembed",
    "all": "links/oembed",
    "all_feed": "links/oembed"
  };

  // if no oembed yet or the one we have isn't the right type,
  // find any ref based oembed and expand them
  if (tomap[options.type] && (!entry.oembed || tomap[options.type].indexOf(entry.oembed.type) === -1) && entry.refs) {
    Object.keys(entry.refs).forEach(function(key) {
      if (key.indexOf(tomap[options.type]) >= 0) {
        entry.oembed = key; // save the reference, to be expanded/handled outside of this function!
      }
    });
  }
};

// transform an entry into a string after applying the given options
var PLURAL = {"photos":"photo", "checkins":"checkin", "contacts":"contact", "statuses":"status", "videos":"video"};
exports.toString = function(entry, options) {
  if (options && options.map) entry.map = dMap.map(entry);

  // just to be consistent
  if (!entry.types) entry.types = {};
  // get all the possible types
  dMap.typeOf(entry.idr, entry.types).forEach(function(type) {
    entry.types[type] = true;
  });
  Object.keys(entry.types).forEach(function(type) {
    if (type.indexOf('_') > 0 && PLURAL[type.split('_')[0]]) entry.types[PLURAL[type.split('_')[0]]] = true; // strip off the feed types
    if (PLURAL[type]) { // switch to the non-plural name
      entry.types[PLURAL[type]] = true;
      delete entry.types[type];
    }
  }); // map the feed ones to their parent too
  // to be nice and provide singular names consistently
  Object.keys(entry.types).forEach(function(type) {
    if (PLURAL[type]) entry.types[PLURAL[type]] = true;
  });
  if (entry.oembed && !entry.types[entry.oembed.type]) {
    entry.types[entry.oembed.type] = true;
  }
  if (entry.oembed && !entry.oembed.source_name) entry.oembed.source_name = idr.parse(entry.idr).host;

  if (options && options.select) {
    entry = lutil.selectFields(entry, options.select);
  } else if (options && options.fields) {
    var fentry = {};
    options.fields.split(',').forEach(function(field) {
      fentry[field] = fieldz(field.split('.'),entry);
    });
    entry = fentry;
  }

  // workaround for v8/node6 see https://github.com/Singly/API/issues/35
  var str = JSON.stringify(entry);
  var len = str.length;
  str = str.replace(/[\u0080-\uffff]/g, function(ch) {
    var code = ch.charCodeAt(0).toString(16);
    while (code.length < 4) code = "0" + code;
    return "\\u" + code;
  });

  return str;
};

// common way to take a custom array of items and save them as entries
exports.write = function(items, options, cbDone) {
  if (!Array.isArray(items)) return cbDone("not an array: " + (typeof items));

  // convert each item into an entry
  var entries = [];
  for(var i=0; i < items.length; i++) {
    var item = items[i];
    if (typeof item.id === 'number') item.id = item.id.toString();
    if (typeof item.id !== 'string') return cbDone("item missing an id: " + JSON.stringify(item));
    var entry = {data:item};
    entry.idr = options.base + '#' + encodeURIComponent(item.id);
    entry.at = (typeof item.at === 'number' && item.at > 0) ? item.at : Date.now();
    // TODO support geo, full text, participants, etc
    if (typeof item.type === 'string') {
      entry.types = {};
      entry.types[item.type] = true;
    }
    entries.push(entry);
  }

  // in the background make sure the map has this context
  var base = idr.parse(options.base);
  dMap.defaultcheck(base.host, base.path, 'data');

  // let's actually try saving it
  logger.debug("saving custom app entries",options.base,entries.length);
  pipeline.account(base.auth, base.host, entries, cbDone);
};

// recursize
function fieldz(parts, data) {
  if (parts.length === 0) return data;
  if (typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    var any = [];
    for(var i=0; i < data.length; i++) {
      var ret = fieldz(parts, data[i]);
      if (ret) any.push(ret);
    }
    return any.length > 0 ? any : null;
  }
  if (data[parts[0]]) return fieldz(parts.slice(1),data[parts[0]]);
  return null;
}
