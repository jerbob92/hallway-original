var async = require('async');
var logger = require('logger').logger('friends');
var idr = require('idr');
var lutil = require('lutil');
var dMap = require('dMap');
var mmh = require("murmurhash3");

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