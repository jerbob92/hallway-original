var async = require('async');
var logger = require('logger').logger('friends');
var idr = require('idr');
var lutil = require('lutil');
var dMap = require('dMap');
var mmh = require("murmurhash3");
var ijod = require('ijod');
var taskman = require('taskman');
var dal = require('dal');


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
}

// parallels are 32bit integers that align contact info
// - inner parallels are ones that dedup contacts into one, name, email, etc
// - outer parallels are ones that group contacts together, interactions, interests, relationships, etc

// return an array of the INNER parallels used for deduping, 4 32bit integers (hexified)
// first name, last name, email, handle || phone# 
// TODO someday, if multiple emails/phones and there's room in the 4, include them
exports.parallels = function(entry)
{
  var ret = [];
  var oe = dMap.get('oembed', entry.data, entry.idr);
  if(!oe || oe.type != 'contact') return ret;

  // extract first/last
  if(oe.title)
  {
    // first byte is 3-char sort, other three bytes is full hash
    var name = exports.name(oe.title);
    ret.push(parts2par([dMap.partype('first'), str2sort(name.first), str2num(name.first, 2)]));
    ret.push(parts2par([dMap.partype('last'), str2sort(name.last), str2num(name.last, 2)]));
  }
  
  // any email address
  if(oe.email) ret.push(parts2par([dMap.partype('email'), str2num(oe.email, 4)]));

  // any phone#
  if(oe.phone)
  {
    // TODO normalize phone better!
    var phone = oe.phone.replace(/[^0-9]+/g, '')
    if(phone.length == 10) phone = "1" + phone;
    ret.push(parts2par([dMap.partype('phone'), str2num(phone, 4)]));
  }else if(oe.handle){ // alternatively, any handle
    // TODO, maybe if no handle but there is email and the email is @gmail @yahoo etc, use the username part?
    ret.push(parts2par([dMap.partype('handle'), str2num(oe.handle, 4)]));
  }
  
  return ret;
}

// simple util
exports.name = function(name)
{
  var parts = (name) ? name.toLowerCase().split(/\s+/) : [];
  return {first:(parts.shift() || ''), last:(parts.pop() || '')};
}

// brute force, but we need a way to force contacts to be re-indexed (skip hash check) when the logic is changed
var VERSION = 1;
exports.vpump = function(cset, cbDone) {
  var ndx = {};
  dMap.types('contacts').forEach(function(key){ ndx[key] = true });
  cset.forEach(function(entry){
    if(ndx[idr.toString(idr.key(entry.idr))]) entry._v = VERSION;
  });
  cbDone(null, cset);
}

// process them post-ijod so that only new/updated contacts are efficiently indexed
exports.bump = function(cset, auth, cbDone) {
  if(!auth || !auth.apps) return cbDone(null, cset); // sanity check
  var pids = {};
  // first just build an index by pid to work with versus flat array
  cset.forEach(function(entry){
    if(entry._v !== VERSION || !entry.saved) return;
    // TODO index more para's: pid, url, interests, relationship, location
    var id = idr.parse(entry.idr);
    var dest = encodeURIComponent(id.hash)+'@'+id.host;
    var src = idr.pid(entry.idr);
    if(!pids[src]) pids[src] = {};
    pids[src][dest] = entry;
  });
  
  if(Object.keys(pids).length == 0) return cbDone(null, cset);

  // process each source pid (almost always one, but just to be safe)
  async.forEach(Object.keys(pids), function(src, cbPid){
    // first do the additional indexing on each friend
    friendex(src, pids[pid], function(){
      if(!auth.apps) return cbPid(); // dumb safety check
      // now, see if there is a peering relationship, this has to be done app by app
      async.forEach(Object.keys(auth.apps), function(app, cbApp){
        if(!auth.apps[app].accounts) return cbApp(); // dumb safety check
        var sql = "SELECT account, profile from Accounts where app = ? and profile in ("+ Object.keys(pids[pid]).map(function(id){ return "'"+id+"'"}).join(",") +")";
        // bulk query efficiently
        dal.query(sql, [app], function(err, rows) {
          if(!rows || rows.length == 0) return cbApp();
          var pairs = genPairs(Object.keys[auth.apps[app].accounts], rows);
          async.forEachLimit(pairs, 10, function(pair, cbPair){
            // for every found pairing, get any already indexed id parallels and add this to the set
            var id = 'friend:'+pair.src+'@'+app+'/friends#'+pair.dest; // construct the per-app-account idr where the statuses are saved
            ijod.getOnePars(id, "ids", function(err, pars) {
              if(parStatus(pars, "peer")) return cbPair();
              // new peering!
              logger.debug("new peering found ");
              pars = parUpdateStatus(pars, "peer", true);
              ijod.setOnePars(id, "ids", pars, function(err){
                // TODO, send notification to app if any
                cbPair();
              });
            });
          }, cbApp);
        });
      }, cbPid);
    });
  }, function(){
    return cbDone(null, cset);
  })

}

var STATUSES = {"peer":0, "invited":1, "requested":2, "blocked":3};
// update any status parallel to include the new one
function parUpdateStatus(pars, status, value)
{
  var spar = parts2par([dMap.partype('status'), 0]); // default blank
  var ret = [];
  pars.forEach(function(par){
    // extract any existing one
    if(ptype(par) == 'status') spar = par;
    else ret.push(par);
  });
  // binary flip the bit
  var bits = parseInt(spar, 16).toString(2).split('');
  bits[8+STATUSES[status]] = (value) ? "1" : "0";
  spar = hexen(parseInt(bits.join(''),2));
  ret.unshift(spar);
  return ret;
}
// just check current status
function parStatus(pars, status)
{
  var ret = false;
  pars.forEach(function(par){
    if(ptype(par) != 'status') return;
    var bits = parseInt(par, 16).toString(2).split('');
    if(bits[8+STATUSES[status]] == '1') ret = true;
  });
  return false;
}

// ugly, two dynamic lists
function genPairs(accounts, rows)
{
  var pairs = {};
  rows.forEach(function(row){
    accounts.forEach(function(account){
      pairs[[account,row.account].join('\t')] = row.profile; // there could super edge case be multiple ways they're pair'd, this forces just one for sanity
    });
  });
  var ret = [];
  Object.keys(pairs).forEach(function(key){
    var parts = key.split('\t');
    ret.push({src:parts[0], dest:parts[1], pid:pairs[key]});
  });
  return ret;
}

// fetch and update status bits for both pids
function friendLink(pid1, pid2, callback)
{
  // TODO fetch any existing state par for each account
  // update each accounts state par bits
  // peer, invited, requested
  callback();
}

// fetch all the bases and return a merged set
exports.baseMerge = function(bases, options, callback)
{
  var ndx = {};
  var ids = {};
  async.forEach(bases, function(base, cbBase){
    taskman.fresh(options.fresh && base, function(err){
      if(err) logger.warn("fresh error",base,err);
      ijod.getPars(base, options, function(err, pars){
        if(err) logger.warn("pars error",base,err);
        if(!pars) return cbBase();
        // loop through and build sorta an inverse index for merging checks
        Object.keys(pars).forEach(function(id){
          if(pars[id].length == 0) return; // skip non-indexed entries
          ids[id] = {id:id, pars:pars[id], base:base};
          pars[id].forEach(function(par){
            // stash the data a few ways using the name of the type for sanity's sake
            var type = ptype(par);
            ids[id][type] = par;
            if(!ndx[type]) ndx[type] = {};
            if(!ndx[type][par]) ndx[type][par] = [];
            ndx[type][par].push(id);
          });
        });
        cbBase();
      });
    });
  }, function(){
    // util to merge
    function merge(friend, id)
    {
      if(ids[id].merged) return; // already merged
      friend.connected++;
      friend.profiles.push(ids[id]);
      if(!friend.first && ids[id].first) friend.first = ids[id].first; // for sorting
      if(!friend.last && ids[id].last) friend.last = ids[id].last;
      ids[id].merged = friend;
    }
    // do the merging
    var friends = [];
    Object.keys(ids).forEach(function(id){
      if(ids[id].merged) return; // id already merged
      var friend = {profiles:[], connected:0};
      merge(friend, id);
      // blanket merge when email/phone/handle match
      if(ids[id].email) ndx.email[ids[id].email].forEach(function(dup){merge(friend,dup)});
      if(ids[id].phone) ndx.phone[ids[id].phone].forEach(function(dup){merge(friend,dup)});
      if(ids[id].handle) ndx.handle[ids[id].handle].forEach(function(dup){merge(friend,dup)});
      // only merge when first and last match exactly
      if(ids[id].first) ndx.first[ids[id].first].forEach(function(dup){
        if(ids[id].last == ids[dup].last) merge(friend,dup);
      });
      friends.push(friend);
    });
    callback(null, friends);
  });
}

// utility to map all sorting options to actionables
exports.sorts = function(sort, a, b){
  if(a === '') a = undefined;
  if(b === '') b = undefined;
  if(a === undefined && b === undefined) return 0;
  if(a === undefined) return 1;
  if(b === undefined) return -1;
  if(sort == 'first' || sort == 'last') return (a < b) ? -1 : ((a > b) ? 1 : 0);
  if(sort == 'connected') return b - a;
  return a - b;
};

// gen a toc for the list, sort = first||last||connected
exports.ginTonic = function(list, sort)
{
  var toc = {"meta":{"length":list.length, "sort":sort}};

  if(sort == 'connected')
  { // totally different style
    var current = list[0].connected;
    var start = 0;
    for(var i = 0; i < list.length; i++) {
      if(list[i].connected == current) continue;
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
  function check(offset)
  {
    if(!on.c || (map[0] && parseInt(list[offset][sort],16) < map[0].v)) return;
    toc[on.c] = {"offset":on.start, "length":(offset-on.start)};
    on = map.shift() || {};
    on.start = offset;
    return check(offset);
  }
  for(var i = 0; i < list.length; i++) check(i);
  toc["*"] = {"offset":on.start, "length":(list.length-1)-on.start};
  return toc;
}

// combine multiple oembeds into one
exports.profile = function(profile, entry, light)
{
  if(!profile) profile = {services:{}};
  if(!entry) return profile;
  if (entry.data && entry.data.email) profile.email = entry.data.email; // TODO remove once all email's are map'd into oembed.email

  var oembed = dMap.get('oembed', entry.data, entry.idr);
  if (!oembed) return profile;
  if (!oembed.id) oembed.id = idr.parse(entry.idr).hash; // convenient to have and keep consistent
  oembed.entry = entry.id;

  var service = oembed.provider_name;
  profile.services[service] = oembed;

  // unoembedize
  oembed.name = oembed.title;
  delete oembed.type;
  delete oembed.provider_name;
  delete oembed.title;
  
  // remove any default thumbnails
  if(oembed.thumbnail_url) DEFAULT_AVATARS.forEach(function(avatar) {
    if (oembed.thumbnail_url && oembed.thumbnail_url.match(avatar)) delete oembed.thumbnail_url;
  });
    
  Object.keys(oembed).forEach(function(key) {
    if (key == 'id' || key == 'entry') return; // don't copy up some service-specific fields
    if (!profile[key] || (BESTY_FIELDS[service] && BESTY_FIELDS[service].indexOf(key) != -1)) {
      profile[key] = oembed[key]; // copy up unique values
    }
    if(light && profile[key] === oembed[key]) delete oembed[key]; // don't keep dups around
  });

  return profile;
}

// parallels are groupd into categories, since they're stored 4-per-row (for now, bit of a hack to fit current entries data model)
var CATS = {"inner":0, "ids":1, "outer":2, "interests":3}
exports.parCats = function(){ return CATS; }

// convert an id into it's cat ver, just shift the last nib by the cat value
exports.parCat = function(id, cat)
{
  if(!CATS[cat]) return id;
  var x = parseInt(id.substr(-1,1),16) + CATS[cat];
  return id.substr(0,31) + (x.toString(16)).substr(-1,1);
}

// convenience, string par to string type
function ptype(par)
{
  return dMap.partype(parseInt(par.substr(0,2), 16));
}

// just a simple hash into a number
function str2num(str, bytes)
{
  bytes = bytes || 4;
  return (parseInt(mmh.murmur32HexSync(str.toLowerCase()),16) % Math.pow(256,bytes));
}

// convert string into an alphanumeric sortable byte, max 3 chars
function str2sort(str)
{
  str = (str.toLowerCase()+'...').substr(0,3); // max first three, all required
  return Math.floor((parseInt(str.split('').map(str26).join(''),27) / 19682) * 255); // the magic number is just short of base 27^3
}

// this could be static, just makes an array mapping char to the hex part for sorting
function tocmap(sort)
{
  return 'abcdefghijklmnopqrstuvwxyz'.split('').map(function(c){return {c:c, v:parseInt(parts2par([sort,str2sort(c+'aa'),0]),16)}});
}

// convert any character to it's 0-26 alpha only range
function str26(str)
{
  var code = str.charCodeAt(0);
  return ((code && code > 96 && code < 123) ? code - 97 : 26).toString(27); // alpha preserved only, else below z  
}

// combine bytes into, either [type, 24bit int] or [type, 8bit int, 16bit in]
function parts2par(parts)
{
  if(typeof parts[0] == 'string') parts[0] = dMap.partype(parts[0]);
  var ret = hexen(parts.shift(), 2);
  if(parts.length == 1) return ret + hexen(parts.shift(), 6);
  ret += hexen(parts.shift(), 2);
  if(parts.length == 1) return ret + hexen(parts.shift(), 4);
  return ret + hexen(parts.shift(), 2) + hexen(parts.shift(), 2);
}

// zero-pad hex number conversion
function hexen(num, len)
{
  var base = '00000000';
  base += num.toString(16);
  return base.substr(-len,len);
}