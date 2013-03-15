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
var friends = require('friends');
var nexusClient = require("nexusClient");
var podClient = require("podClient");

// change this to force re-indexing of any contact info on next run, whenever
// the indexing logic here changes
var VERSION = 8;

// parallels are 32bit integers that align contact info - inner parallels are
// ones that dedup contacts into one, name, email, etc - outer parallels are
// ones that group contacts together, interactions, interests, relationships,
// etc


// generate a fingerprint to tell if this entry should be re-indexed
function reversion(auth)
{
  var accts = [];
  if (auth.apps) Object.keys(auth.apps).forEach(function(app){
    if (auth.apps[app].accounts) Object.keys(auth.apps[app].accounts).forEach(function(account){
      accts.push(account);
    });
  });
  accts.sort();
  return crypto.createHash('md5').update(VERSION  + " " + accts.join(" ")).digest('hex');
}

// brute force, but we need a way to force contacts to be re-indexed (skip hash
// check) when the logic is changed
exports.vpump = function(cset, auth, cbDone) {
  var ndx = {};
  var ver = reversion(auth);
  dMap.types('contacts').forEach(function(key) { ndx[key] = "contact"; });
  cset.forEach(function(entry) {
    var types = dMap.typeOf(entry.idr);
    if (types.indexOf('contacts') >= 0) entry._v = ver;
  });
  cbDone(null, cset);
};

// process them post-ijod so that only new/updated contacts are efficiently indexed
exports.bump = function(cset, auth, cbDone) {
  if (!auth || !auth.apps) return cbDone(null, cset); // sanity check
  var pids = {};
  var iact = {inter:{}, act:{}, photos:{}, ll:{}};
  // first just build an index by pid to work with versus flat array
  var deviceId = false;
  var self = false;
  cset.forEach(function(entry) {
    if (!entry.saved) return; // only process *new* content!

    // we process our self entry specially to index global ids across the whole app
    var id = idr.parse(entry.idr);
    if (id.path === 'self') self = entry;

    // process based on the type
    var types = dMap.typeOf(entry.idr, entry.types);
    if (types.length === 0) return;
    if (types.indexOf('contacts') >= 0 || id.path === 'self') {
      // below we do a lot more work on contacts, including self
      id = idr.parse(entry.idr);
      // a device contact id is in the format devicename.accountid.appid@devices
      if (id.host === 'devices') deviceId = id.auth.split('.');
      var dest = encodeURIComponent(id.hash)+'@'+id.host;
      pids[dest] = entry;
      // TODO: for normal non-device contacts we should be looking for matching
      // phone/email's too, as they may not be friends on the same network but
      // across networks and still the same person
    }

    var participants = ijod.participants(entry);
    if (participants.length > 0) {
      var me = idr.parse(entry.idr).auth;
      // index of everyone we have interactions with
      if (participants.length > 1 && participants.indexOf(me) >= 0) {
        participants.forEach(function(p) {
          if (!iact.inter[p]) iact.inter[p] = 0;
          iact.inter[p]++;
        });
      }

      // keep track of sharing activity of others
      if (participants[0] !== me) {
        var author = participants[0];
        if (!iact.act[author]) iact.act[author] = 0;
        iact.act[author]++;
        // additionally track photos as a sub-sortable option
        if (types.indexOf('photos_feed') >= 0) {
          if (!iact.photos[author]) iact.photos[author] = 0;
          iact.photos[author]++;
        }
        // track last seen location
        var ll = dMap.get('ll', entry.data, entry.idr);
        if (ll && entry.at > (iact.ll[author] || 0)) iact.ll[author] = ll;
      }
    }
  });

  logger.debug("bump",
    Object.keys(pids).length,
    Object.keys(iact).map(function(key) {
      return {
        key:key,
        len:Object.keys(iact[key]).length
      };
    }));

  // this could be parallel, but that could be a lot of mysql too since they
  // internally parallelize
  async.series([
    function(cb) {
      indexMe(auth, self, cb);
    },
    function(cb) {
      friendex(auth, pids, cb);
    },
    function(cb) { // device contacts are special, per-app
      if (deviceId) devicePeers(deviceId[1], deviceId[2], pids, cb);
      else peerCheck(auth, pids, cb);
    },
    function(cb) {
      interactive(auth, iact, cb);
    }
  ], function() {
    cbDone(null, cset);
  });
};

// all ids extracted from this device contact
function allIds(data) {
  var ids = {};
  if (data.phone) ids[friends.phoneHome(data.phone)] = true;
  if (data.email) ids[data.email.toLowerCase()] = true;
  if (Array.isArray(data.phones)) {
    data.phones.forEach(function(phone) {
      ids[friends.phoneHome(phone)] = true;
    });
  }
  if (Array.isArray(data.emails)) {
    data.emails.forEach(function(email) {
      ids[email.toLowerCase()] = true;
    });
  }
  return ids;
}

// we need to index our own unique identifiers in an easily matchable way to
// find peers in an app
function indexMe(auth, entry, cbDone) {
  if (!entry) return cbDone();

  logger.debug("indexing me",entry.idr);
  var id = idr.parse(entry.idr);
  var isDevice = (id.host === 'devices' && id.protocol === 'contact');

  // first get all the unique ids, the device information is more rich than
  // oembed (plurals), use that if so
  var ids = allIds(isDevice ? entry.data : dMap.get('oembed', entry.data, entry.idr) || {});

  // get a list of apps from either auth or device
  var apps = auth && auth.apps;
  if (isDevice) { // have to spoof the auth.apps.accounts[] pattern
    apps = {};
    var parts = idr.parse(entry.idr).auth.split('.');
    apps[parts[2]] = {accounts:{}};
    apps[parts[2]].accounts[parts[1]] = true;
  }
  // now for each one save this account to it's app-wide entry
  var entries = [];
  Object.keys(apps).forEach(function(app) {
    if(typeof(apps[app].accounts) !== 'object') return;
    Object.keys(apps[app].accounts).forEach(function(account) {
      var base = 'index:'+app+'/account';
      logger.debug("deviceMe",base,ids);
      Object.keys(ids).forEach(function(id) {
        var index = {};
        index.idr = base + '#' + encodeURIComponent(id);
        index.account = account;
        index.data = {};
        index.via = idr.toString(entry.idr);
        entries.push(index);
      });
    });
  });
  nexusClient.batchSmartAdd(entries, cbDone);
}

// are any of these compadres using the app too?
function devicePeers(account, app, pids, cbDone) {
  if (Object.keys(pids).length === 0) return cbDone();

  var base = 'index:'+app+'/account';
  async.forEachLimit(Object.keys(pids), 5, function(pid, cbPids) {
    var ids = allIds(pids[pid].data);
    if (Object.keys(ids).length === 0) return process.nextTick(cbPids);
    async.forEach(Object.keys(ids), function(id, cbIds) {
      podClient.getOne(base+'#'+encodeURIComponent(id), function(err, entry) {
        if (!entry || !entry.account) return cbIds();
        // set up peering from this account to the other, pid is a localized
        // id@devices
        friendPeer(app, account, entry.account, pid, function(isNew) {
          // importantly, make sure reverse is set too!
          // use their localized device id for me
          var viaPid = encodeURIComponent(idr.parse(entry.via).hash) + '@devices';
          friendPeer(app, entry.account, account, viaPid, function() {
            // if (isNew) TODO, send notification to app if any
            pids[pid].peer = entry.account; // convenience for immediate action
            cbIds();
          });
        });
      });
    }, cbPids);
  }, cbDone);
}

// update pars for individuals who're doing stuff
function interactive(auth, iact, cbDone) {
  // to be efficient we need to get all actual friends, so build that list
  var service = auth.pid.split('@')[1];
  var bases = dMap.types('contacts', [auth.pid]);
  var options = {};

  // fetch all friends for this base, that are also in this list
  async.forEach(bases, function(base, cbBase) {
    var all = {};
    function build(obj) {
      Object.keys(obj).forEach(function(uid) {
        var id = base + '#' + encodeURIComponent(uid);
        all[idr.hash(id).toUpperCase()] = idr.parse(id);
      });
    }
    Object.keys(iact).forEach(function(key) {
      build(iact[key]);
    });
    options['in'] = Object.keys(all);

    if (options['in'].length === 0) {
      return process.nextTick(cbBase);
    }

    podClient.getPars(base, options, function(err, pars) {
      if (err) logger.warn("pars error",base,err);
      if (!pars) return cbBase();

      async.forEachLimit(Object.keys(pars), 10, function(idh, cbPars) {
        if (pars[idh].pars.length === 0) {
          return process.nextTick(cbPars); // skip non-indexed entries
        }

        if(!all[idh])
        {
          logger.warn("mysterious interactive things, no match:",idh,base,pars[idh]);
          return process.nextTick(cbPars);
        }

        // get any existing values to increment
        var id = all[idh];
        var options = {pars:[]};
        options.pars.push(parInc(parSelect(pars[idh].pars, 'interactions'), iact.inter[id.hash]));
        options.pars.push(parInc(parSelect(pars[idh].pars, 'activity'), iact.act[id.hash]));
        options.pars.push(parInc(parSelect(pars[idh].pars, 'photos'), iact.photos[id.hash]));
        // TODO geo latlng
        logger.debug("updating interactives for",id.hash,options);
        podClient.setOneCat(idr.toString(id), "outer", options, function() {
          cbPars();
        });
      }, function() {
        cbBase();
      });
    });
  }, cbDone);
}

// now, see if there is a peering relationship
function peerCheck(auth, pids, cbDone) {
  if (!auth.apps || Object.keys(pids).length === 0) return cbDone();
  // this has to be done app by app
  async.forEach(Object.keys(auth.apps), function(app, cbApp) {
    // dumb safety check
    if (!auth.apps[app].accounts) {
      return process.nextTick(cbApp);
    }
    nexusClient.getAccounts(app, Object.keys(pids), function(err, peers) {
      if (!peers || peers.length === 0) return cbApp();
      var pairs = genPairs(Object.keys(auth.apps[app].accounts), peers);
      logger.debug("found pairs",auth.pid,app,pairs);
      async.forEachLimit(pairs, 10, function(pair, cbPair) {
        // set up peering from this account to the other
        friendPeer(app, pair.src, pair.dest, pair.pid, function(isNew) {
          // importantly, make sure reverse is set too!
          friendPeer(app, pair.dest, pair.src, auth.pid, function() {
            // if (isNew) TODO, send notification to app if any
            cbPair();
          });
        });
      }, cbApp);
    });
  }, cbDone);
}

// convenient since it has to be done twice, update status to a peer
function friendPeer(app, src, dest, pid, cbDone) {
  // for every found pairing, get any already indexed id parallels and add this
  // to the set
  // construct the per-app-account idr where the statuses are saved
  var id = 'friend:'+src+'@'+app+'/friends#'+dest;
  nexusClient.getOnePars(id, "ids", function(err, one) {
    var pars = one && one.pars;
    if (parStatus(pars, "peers")) return cbDone(false);
    // new peering!
    logger.debug("new peering found ",app,src,dest,pid);
    pars = parUpdateStatus(pars, "peers", true);
    var par = pid2par(pid);
    // also be sure to index the pid for it to match
    if (pars.indexOf(par) === -1) pars.unshift(par);
    nexusClient.setOneCat(id, "ids", {pars:pars}, function() {
      cbDone(true);
    });
  });

}

// index additional attributes on friends
function friendex(auth, friendsToIndex, cbDone) {
  logger.debug("friendex",auth.pid,Object.keys(friendsToIndex).length);
  async.forEachLimit(Object.keys(friendsToIndex), 10, function(pid, cbFriends) {
    var friend = friendsToIndex[pid];
    var oe = dMap.get('oembed', friend.data, friend.idr) || {};
    async.waterfall([
      function(cb) { // handle indexing the related ids
        var options = {pars:[]};
        options.pars.push(pid2par(pid));
        if (oe.url) options.pars.push(friends.parts2par([dMap.partype("url"), str2num(oe.url)]));
        if (oe.website) options.pars.push(friends.parts2par([dMap.partype("url"), str2num(oe.website)]));
        // TODO add a par for relation, matching school/employer to auth.profile
        // index bio text
        var biotext = friends.bioget(friend, oe);
        var buf = qix.buf(biotext);
        if (buf) {
          options.q = [];
          options.q.push(buf.slice(0,8).toString('hex'));
          options.q.push(buf.slice(8,16).toString('hex'));
          options.q.push(buf.slice(16,24).toString('hex'));
          options.q.push(buf.slice(24).toString('hex'));
          options.text = biotext; // pass along raw for ijod eventing
        }
        podClient.setOneCat(idr.toString(friend.idr), "ids", options, cb);
      },
      function(cb) {
        // TODO interest par (keywords from bio, interests on facebook, device types)
        // driven by apps?
        cb();
      }
    ], function() {
      cbFriends();
    });
  }, cbDone);
}

// id@service to it's par representation
function pid2par(pid) {
  var parts = pid.split('@');
  return friends.parts2par([parts[1], str2num(parts[0], 3)]);
}

// update any status parallel to include the new one
function parUpdateStatus(pars, status, value) {
  var spar = friends.parts2par(['status', 0]); // default blank
  var ret = [];
  if (!pars) pars = [];
  pars.forEach(function(par) {
    // extract any existing one
    if (ptype(par) === 'status') spar = par;
    else ret.push(par);
  });
  // binary flip the bit
  var bits = parseInt(spar, 16).toString(2).split('');
  bits[8+friends.STATUSES[status]] = (value) ? "1" : "0";
  spar = hexen(parseInt(bits.join(''),2),8);
  ret.unshift(spar);
  return ret;
}

// just check current status
function parStatus(pars, status) {
  var ret = false;
  if (!pars) return false;
  pars.forEach(function(par) {
    if (ptype(par) !== 'status') return;
    var bits = parseInt(par, 16).toString(2).split('');
    if (bits[8+friends.STATUSES[status]] === '1') ret = true;
  });
  return false;
}

// ugly, two dynamic lists
function genPairs(accounts, rows) {
  logger.debug("find pairs between",accounts,rows);
  var pairs = {};
  rows.forEach(function(row) {
    accounts.forEach(function(account) {
      // there could super edge case be multiple ways they're pair'd, this
      // forces just one for sanity
      pairs[[account,row.account].join('\t')] = row.profile;
    });
  });
  var ret = [];
  Object.keys(pairs).forEach(function(key) {
    var parts = key.split('\t');
    if (parts[0] === parts[1]) return; // skip self duh
    ret.push({src:parts[0], dest:parts[1], pid:pairs[key]});
  });
  return ret;
}

// just get one par or return blank
function parSelect(pars, type) {
  var ret = friends.parts2par([type, 0]); // default blank
  if (!pars) pars = [];
  pars.forEach(function(par) {
    if (ptype(par) === 'status') ret = par;
  });
  return ret;
}

// increment a par
function parInc(par, val) {
  if (!val) return par;
  var cur = parseInt(par.substr(2), 16);
  cur += val;
  return par.substr(0,2) + hexen(cur, 6);
}

// convenience, string par to string type
function ptype(par) {
  return dMap.partype(parseInt(par.substr(0,2), 16));
}

// just a simple hash into a number
function str2num(str, bytes) {
  bytes = bytes || 4;
  return (parseInt(mmh.murmur32HexSync(str.toLowerCase()),16) % Math.pow(256,bytes));
}

// zero-pad hex number conversion
function hexen(num, len) {
  var base = '00000000';
  base += num.toString(16);
  return base.substr(-len,len);
}
