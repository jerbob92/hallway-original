var async = require('async');
var logger = require('logger').logger('friends');
var idr = require('idr');
var lutil = require('lutil');
var dMap = require('dMap');

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