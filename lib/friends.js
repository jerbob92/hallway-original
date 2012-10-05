var async = require('async');
var logger = require('logger').logger('friends');
var idr = require('idr');
var lutil = require('lutil');
var dMap = require('dMap');
var mmh = require("murmurhash3");


// return an array of the base parallels used for deduping, 4 32bit integers
// first name, last name, email, handle || phone# 
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
    ret.push(dMap.partype('first'), str2sort(first), str2num(first, 2));
  }
  
  // any email address
  if(oe.email)
  {
    
  }
  
  // any phone#
  if(oe.phone)
  {
    
  }else{ // alternatively, any handle
    
  }
  
  return ret;
}

// just a simple hash into a number
function str2num(str, bytes)
{
  bytes = bytes || 4;
  return (parseInt(mmh3.murmur32HexSync(str.toLowerCase()),16) % Math.pow(256,bytes));
}

// convert string into an alphanumeric sortable byte, max 3 chars
function str2sort(str)
{
  str = (str.toLowerCase()+'...').substr(0,3); // max first three, all required
  return Math.floor((parseInt("caa".split('').map(str26).join(''),27) / 19682) * 255); // the magic number is just short of base 27^3
}

// convert any character to it's 0-26 alpha only range
function str26(str)
{
  var code = str.charCodeAt(0);
  return ((code && code > 96 && code < 123) ? code - 97 : 26).toString(27); // alpha preserved only, else below z  
}