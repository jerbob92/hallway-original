var async = require('async');
var logger = require('logger').logger('friends');
var idr = require('idr');
var lutil = require('lutil');
var dMap = require('dMap');
var mmh = require("murmurhash3");
var ijod = require('ijod');
var dal = require('dal');
var qix = require('qix');
var crypto = require('crypto');
var podClient = require("podClient");

var DEFAULT_AVATARS = [
  /images.instagram.com\/profiles\/anonymousUser.jpg/, // Instagram
  /static-ak\/rsrc.php\/v2\/yL\/r\/HsTZSDw4avx.gif/,   // FB Male
  /static-ak\/rsrc.php\/v2\/yp\/r\/yDnr5YfbJCH.gif/,   // FB Female
  /4sqi\.net\/img\/blank_(boy|girl)/,                  // Foursquare
  /foursquare\.com\/img\/blank_/,                      // Foursquare also
  /twimg.com\/sticky\/default_profile_images/          // Twitter
];

// when merging profile info, which fields win out
var BESTY_FIELDS = {
  "facebook":["thumbnail_url", "name"],
  "twitter":["url", "description"]
};

exports.STATUSES = {"peers":0, "invited":1, "requested":2, "blocked":3};

// parallels are 32bit integers that align contact info - inner parallels are
// ones that dedup contacts into one, name, email, etc - outer parallels are
// ones that group contacts together, interactions, interests, relationships,
// etc

// return an array of the INNER parallels used for deduping, 4 32bit integers
// (hexified) first name, last name, email, handle || phone# TODO someday, if
// multiple emails/phones and there's room in the 4, include them
exports.parallels = function(entry) {
  var ret = [];
  var oe = dMap.get('oembed', entry.data, entry.idr);
  if (!oe || oe.type !== 'contact') return ret;

  // extract first/last
  if (oe.title) {
    // first byte is 3-char sort, other three bytes is full hash
    var name = exports.name(oe.title);
    ret.push(exports.parts2par([
              dMap.partype('first'),
              str2sort(name.first),
              str2num(name.first, 2)
            ]));
    ret.push(exports.parts2par([
              dMap.partype('last'),
              str2sort(name.last),
              str2num(name.last, 2)
            ]));
  }

  // any email address
  if (oe.email) {
    ret.push(exports.parts2par([dMap.partype('email'), str2num(oe.email, 3)]));
  }

  // any phone#
  if (oe.phone) {
    // TODO normalize phone better!
    var phone = exports.phoneHome(oe.phone);
    ret.push(exports.parts2par([dMap.partype('phone'), str2num(phone, 3)]));
  } else if (oe.handle) { // alternatively, any handle
    // TODO, maybe if no handle but there is email and the email is @gmail
    // @yahoo etc, use the username part?
    ret.push(exports.parts2par([dMap.partype('handle'), str2num(oe.handle, 3)]));
  }

  return ret;
};

// simple utils
exports.name = function(name) {
  var parts = (name) ? name.toLowerCase().split(/\s+/) : [];
  return {first:(parts.shift() || ''), last:(parts.pop() || '')};
};

exports.phoneHome = function(phone) {
  phone = phone.replace(/[^0-9]+/g, '');
  if (phone.length === 10) phone = "1" + phone;
  return phone;
};

// get bio text
exports.bioget = function(friend, oe) {
  if (!oe) oe = dMap.get('oembed', friend.data, friend.idr) || {};
  var ret = [oe.description];
  var entities = dMap.get('entities', friend.data, friend.idr) || [];
  if (Array.isArray(entities)) {
    entities.forEach(function(entity) { ret.push(entity.name); });
  }
  return ret.join(' ');
};

// return an object of the statuses set in this list of pars
exports.status = function(pars) {
  var ret = {};
  pars.forEach(function(par) {
    if (ptype(par) !== 'status') return;
    var bits = parseInt(par, 16).toString(2).split('');
    Object.keys(exports.STATUSES).forEach(function(status) {
      if (bits[8+exports.STATUSES[status]] === '1') ret[status] = true;
    });
  });
  return ret;
};

// fetch all the bases and return a merged set
exports.baseMerge = function(bases, options, callback) {
  var ndx = {};
  var ids = {};
  async.forEach(bases, function(base, cbBase) {
    // when this base is the ace (status) one, it can't get options applied
    podClient.getPars(base, (options.ace === base) ? {xids:true} : options, function(err, pars) {
      if (err) logger.warn("pars error",base,err);
      if (!pars) return cbBase();
      // loop through and build sorta an inverse index for merging checks
      Object.keys(pars).forEach(function(id) {
        if (pars[id].pars.length === 0) return; // skip non-indexed entries
        ids[id] = pars[id];
        ids[id].id = id.toLowerCase() + '_' + idr.partition(base);
        ids[id].mergies = [];
        ids[id].base = base;
        ids[id].pars.forEach(function(par) {
          // stash the data a few ways using the name of the type for sanity's
          // sake
          var type = ptype(par);
          ids[id][type] = par;
          if (type === "email" || type === "phone" || type === "handle" || type === "url") {
            ids[id].mergies.push(par); // all direct mergable fields
          }
          // all service ids
          if (parseInt(par.substr(0,2), 16) >= 100) ids[id].mergies.push(par);
          if (!ndx[type]) ndx[type] = {};
          if (!ndx[type][par]) ndx[type][par] = [];
          ndx[type][par].push(id);
        });
      });
      cbBase();
    });
  }, function() {
    // util to increment during merge
    function inc(friend, id, field) {
      if (!ids[id][field]) return;
      if (!friend[field]) friend[field] = 0;
      friend[field] += parseInt(ids[id][field].substr(2),16);
    }
    // util to merge
    function merge(friend, id) {
      if (ids[id].merged) return; // already merged
      if (friend.ids[id]) return; // edge case catch, since we recurse!
      friend.ids[id] = true;
      friend.connected++;
      friend.profiles.push(ids[id]);
      if (ids[id].q) friend.matched = true;
      if (ids[id].bio) friend.bio = true;
      // for sorting
      if (!friend.first && ids[id].first) friend.first = ids[id].first;
      if (!friend.last && ids[id].last) friend.last = ids[id].last;
      if (ids[id].xid) friend.peer = ids[id].xid; // cross-ref id
      inc(friend,id,"interactions");
      inc(friend,id,"activity");
      inc(friend,id,"photos");
      seek(id, friend); // now also recurse in and see if the merged id had other matchable bits
      ids[id].merged = friend;
    }
    var friends = [];
    // check if this id is mergeable w/ any others, add to friend
    function seek(id, friend) {
      if (ids[id].merged) return; // id already merged
      // merge the mergies! (exact id matches)
      ids[id].mergies.forEach(function(par) {
        ndx[ptype(par)][par].forEach(function(dup) {
          merge(friend,dup);
        });
      });
      // only merge when first and last match exactly
      if (ids[id].first) ndx.first[ids[id].first].forEach(function(dup) {
        if (ids[id].last === ids[dup].last) merge(friend,dup);
      });
    }
    // do the merging
    Object.keys(ids).forEach(function(id) {
      var friend = {profiles:[], ids:{}, connected:0};
      seek(id, friend); // look for duplicates
      merge(friend, id); // always add self
      friends.push(friend);
    });
    if (options.q) friends = friends.filter(function(friend) {
      return friend.matched;
    });
    if (options.bio) friends = friends.filter(function(friend) {
      return friend.bio;
    });
    callback(null, friends);
  });
};

function checkPlease(search, body, sensitive) {
  var b = qix.chunk(body, sensitive);
  var s = qix.chunk(search, sensitive);
  var matches = 0;
  b.forEach(function(bpart) {
    s.forEach(function(spart) {
      if (bpart.indexOf(spart) >= 0) matches++;
    });
  });
  if (matches < s.length) {
    logger.warn("couldn't find match ",s.join(','),"in",b.join(','));
    return false;
  }
  return true;
}
// make sure this friend matches the query
exports.validate = function(friend, options) {
  if (options.q && !checkPlease(options.q, ijod.qtext(friend), true)) return false;
  if (options.bio && !checkPlease(options.bio, exports.bioget(friend), false)) return false;
  return true;
};

// utility to map all sorting options to actionables
exports.sorts = function(sort, a, b) {
  if (!a || a === '') a = undefined;
  if (!b || b === '') b = undefined;
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (sort === 'first' || sort === 'last') {
    return (a < b) ? -1 : ((a > b) ? 1 : 0);
  }
  if (['connected', 'interactions', 'activity', 'photos'].indexOf(sort) >= 0) {
    return b - a; // descending
  }
  return a - b;
};

// gen a toc for the list, sort = first||last||connected
exports.ginTonic = function(list, sort) {
  var toc = {"meta":{"length":list.length, "sort":sort}};

  if (sort === 'connected') { // totally different style
    var current = list[0].connected;
    var start = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].connected === current) continue;
      toc[current.toString()] = {"offset":start, "length":(i - start)};
      current = list[i].connected;
      start = i;
    }
    toc[current.toString()] = {"offset":start, "length":((list.length-1)-start)};
    return toc;
  }

  // first || last
  var map = tocmap(sort);
  var on = map.shift();
  on.start = 0;
  function check(offset) {
    if (!on.c || (map[0] && parseInt(list[offset][sort],16) < map[0].v)) return;
    toc[on.c] = {"offset":on.start, "length":(offset-on.start)};
    on = map.shift() || {};
    on.start = offset;
    return check(offset);
  }
  for (var j = 0; j < list.length; j++) check(j);
  toc["*"] = {"offset":on.start, "length":(list.length-1)-on.start};
  return toc;
};

// combine multiple oembeds into one
exports.contactMerge = function(profile, entry, options) {
  options = options || {};
  if (!profile) profile = {services:{}};
  if (!entry) return profile;
  // TODO remove once all email's are map'd into oembed.email
  if (entry.data && entry.data.email) profile.email = entry.data.email;

  var oembed = dMap.get('oembed', entry.data, entry.idr);
  if (!oembed) return profile;
  // convenient to have and keep consistent
  if (!oembed.id) oembed.id = idr.parse(entry.idr).hash;
  oembed.entry = entry.id;

  var service = oembed.provider_name;
  profile.services[service] = oembed;

  // unoembedize
  oembed.name = oembed.title;
  delete oembed.type;
  delete oembed.provider_name;
  delete oembed.title;

  // remove any default thumbnails
  if (oembed.thumbnail_url) DEFAULT_AVATARS.forEach(function(avatar) {
    if (oembed.thumbnail_url && oembed.thumbnail_url.match(avatar)) delete oembed.thumbnail_url;
  });

  Object.keys(oembed).forEach(function(key) {
    // don't copy up some service-specific fields
    if (key === 'id' || key === 'entry') return;
    if (!profile[key] || (BESTY_FIELDS[service] && BESTY_FIELDS[service].indexOf(key) !== -1)) {
      profile[key] = oembed[key]; // copy up unique values
    }
    // don't keep dups around
    if (options.light && profile[key] === oembed[key]) delete oembed[key];
  });

  if (options.full)
  {
    if (!profile.full) profile.full = {};
    profile.full[service] = entry;
  }

  return profile;
};

// parallels are groupd into categories, since they're stored 4-per-row (for
// now, bit of a hack to fit current entries data model)
var CATS = {"inner":0, "ids":1, "outer":2, "interests":3};
exports.parCats = function() {
  return CATS;
};

// convert an id into it's cat ver, just shift the last nib by the cat value
exports.parCat = function(id, cat) {
  id = id.toLowerCase();
  if (!CATS[cat]) return id;
  var x = parseInt(id.substr(-1,1),16) + CATS[cat];
  return id.substr(0,31) + (x.toString(16)).substr(-1,1);
};

// convenience, string par to string type
function ptype(par) {
  return dMap.partype(parseInt(par.substr(0,2), 16));
}

// just a simple hash into a number
function str2num(str, bytes) {
  bytes = bytes || 4;
  return (parseInt(mmh.murmur32HexSync(str.toLowerCase()),16) % Math.pow(256,bytes));
}

// convert string into an alphanumeric sortable byte, max 3 chars
function str2sort(str) {
  str = (str.toLowerCase()+'...').substr(0,3); // max first three, all required
  // the magic number is just short of base 27^3
  return Math.floor((parseInt(str.split('').map(str26).join(''),27) / 19682) * 255);
}

// this could be static, just makes an array mapping char to the hex part for
// sorting
function tocmap(sort) {
  return 'abcdefghijklmnopqrstuvwxyz'.split('').map(function(c) {
    return {
      c: c,
      v: parseInt(exports.parts2par([sort,str2sort(c+'aa'),0]),16)
    };
  });
}

// convert any character to it's 0-26 alpha only range
function str26(str) {
  var code = str.charCodeAt(0);
  // alpha preserved only, else below z
  return ((code && code > 96 && code < 123) ? code - 97 : 26).toString(27);
}

// combine bytes into, either [type, 24bit int] or [type, 8bit int, 16bit in]
exports.parts2par = function(parts) {
  if (typeof parts[0] === 'string') parts[0] = dMap.partype(parts[0]);
  var ret = hexen(parts.shift(), 2);
  if (parts.length === 1) return ret + hexen(parts.shift(), 6);
  ret += hexen(parts.shift(), 2);
  if (parts.length === 1) return ret + hexen(parts.shift(), 4);
  return ret + hexen(parts.shift(), 2) + hexen(parts.shift(), 2);
};

// zero-pad hex number conversion
function hexen(num, len) {
  var base = '00000000';
  base += num.toString(16);
  return base.substr(-len,len);
}
