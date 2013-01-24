var dns = require("dns");

var dnsCache = {
  "ipv4":{},
  "ipv6":{}
};

var realLookup = dns.lookup;

exports.cachedLookup = function(domain, family, callback) {
  // parse arguments
  if (arguments.length === 2) {
    callback = family;
    family = 0;
  } else if (!family) {
    family = 0;
  } else {
    family = +family;
    if (family !== 4 && family !== 6) {
      throw new Error('invalid argument: `family` must be 4 or 6');
    }
  }

  //console.log("Lookup %s (%d)", domain, family);
  if ((!family || family === 4) && dnsCache.ipv4.hasOwnProperty(domain)) {
    return process.nextTick(function() {
      //console.log("Returning cached result for %s: %s", domain, dnsCache.ipv4[domain]);
      return callback(null, dnsCache.ipv4[domain], 0);
    });
  }

  return realLookup(domain, family, function(err, address, family) {
    if (!err) {
      dnsCache[(family === 6 ? "ipv6" : "ipv4")][domain] = address;
    }
    //console.log("Real result %s for %s and %d", address, domain, family);
    return callback(err, address, family);
  });

  return {};
}

exports.clearCache = function(family) {
  if (!family || family === 4) {
    dnsCache.ipv4 = [];
  }
  if (!family || family === 6) {
    dnsCache.ipv6 = [];
  }
}

