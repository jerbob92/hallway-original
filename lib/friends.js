var async = require('async');
var logger = require('logger').logger('friends');
var idr = require('idr');
var lutil = require('lutil');
var dMap = require('dMap');
var mmh = require("murmurhash3");
var ijod = require('ijod');

var DEFAULT_AVATARS = [
  /images.instagram.com\/profiles\/anonymousUser.jpg/, // Instagram
  /static-ak\/rsrc.php\/v2\/yL\/r\/HsTZSDw4avx.gif/,   // FB Male
  /static-ak\/rsrc.php\/v2\/yp\/r\/yDnr5YfbJCH.gif/,   // FB Female
  /4sqi\.net\/img\/blank_(boy|girl)/,                  // Foursquare
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
    var parts = oe.title.split(/\s+/);
    var first = parts.shift() || '';
    var last = parts.pop() || '';
    ret.push(parts2par([dMap.partype('first'), str2sort(first), str2num(first, 2)]));
    ret.push(parts2par([dMap.partype('last'), str2sort(last), str2num(last, 2)]));
  }
  
  // any email address
  if(oe.email) ret.push(parts2par([dMap.partype('email'), str2num(oe.email, 4)]));

  // any phone#
  if(oe.phone)
  {
    ret.push(parts2par([dMap.partype('phone'), str2num(oe.phone, 4)]));
  }else if(oe.handle){ // alternatively, any handle
    ret.push(parts2par([dMap.partype('handle'), str2num(oe.handle, 4)]));
  }
  
  return ret;
}

// brute force, but we need a way to force contacts to be re-indexed (skip hash check) when the logic is changed
var VERSION = 1;
exports.vpump = function(cset, auth, cbDone) {
  var ndx = {};
  dMap.types('contacts').forEach(function(key){ ndx[key] = true });
  cset.forEach(function(entry){
    if(ndx[idr.toString(idr.key(entry.idr))]) entry._v = VERSION;
  });
  cbDone(null, cset);
}

// fetch all the bases and return a merged set
exports.baseMerge = function(bases, options, callback)
{
  var ndx = {};
  var ids = {};
  async.forEach(bases, function(base, cbBase){
    ijod.getPars(base, options, function(err, pars){
      if(err) console.error(err);
      if(!pars) return cbBase();
      // loop through and build sorta an inverse index for merging checks
      Object.keys(pars).forEach(function(id){
        ids[id] = {id:id, pars:pars[id], base:base};
        pars[id].forEach(function(par){
          // stash the data a few ways using the name of the type for sanity's sake
          var type = dMap.partype(parseInt(par.substr(0,2), 16));
          ids[id][type] = par;
          if(!ndx[type]) ndx[type] = {};
          if(!ndx[type][par]) ndx[type][par] = [];
          ndx[type][par].push(id);
        });
      });
      cbBase();
    });
  }, function(){
    // util to merge
    function merge(friend, id)
    {
      if(!ids[id]) return; // already merged
      friend.services++;
      friend.profiles.push(ids[id]);
      if(!friend.first && ids[id].first) friend.first = ids[id].first; // for sorting
      if(!friend.last && ids[id].last) friend.last = ids[id].last;
      ids[id] = false;
    }
    // do the merging
    var friends = [];
    Object.keys(ids).forEach(function(id){
      if(!ids[id]) return; // id already merged
      var friend = {profiles:[], services:0};
      merge(friend, id);
      // blanket merge when email/phone/handle match
      if(ids[id].email) ndx[ids[id].email].forEach(function(dup){merge(friend,dup)});
      if(ids[id].phone) ndx[ids[id].phone].forEach(function(dup){merge(friend,dup)});
      if(ids[id].handle) ndx[ids[id].handle].forEach(function(dup){merge(friend,dup)});
      // only merge when first and last match exactly
      if(ids[id].first) ndx[ids[id].first].forEach(function(dup){
        if(ids[id].last == ids[dup].last) merge(friend,dup);
      });
      friends.push(friend);
    });
    callback(null, friends);
  });
}

// utility to map all sorting options to actionables
exports.sorts = function(sort, a, b){
  if(a === undefined && b === undefined) return 0;
  if(a === undefined) return 1;
  if(b === undefined) return -1;
  if(sort == 'first' || sort == 'last') return (a < b) ? -1 : ((a > b) ? 1 : 0);
  if(sort == 'connected') return b - a;
  return a - b;
};

// combine multiple oembeds into one
exports.profile = function(profile, entry)
{
  if(!profile) profile = {services:{}};
  if(!entry) return profile;
  if (entry.data && entry.data.email) profile.email = entry.data.email; // TODO remove once all email's are map'd into oembed.email

  var oembed = dMap.get('oembed', entry.data, entry.idr);
  if (!oembed) return profile;

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
    if (key == 'id') return; // don't copy up some service-specific fields
    if (!profile[key] || (BESTY_FIELDS[service] && BESTY_FIELDS[service].indexOf(key) != -1)) profile[key] = oembed[key]; // copy up unique values
  });

  return profile;
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