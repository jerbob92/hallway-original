exports.ptype = 111; // must be unique per service, see dMap.js

var idr = require('idr');

// all devices can write data in to a common pattern/format

// one generic type is contact, {
//  "id":"123",
//  "name":"Foo Bar",
//  "email":"foo@bar.com",
//  "phone":"4242424269"
// }
// can also be phones:[] and emails:[]
exports.contact = {
  oembed: function(data, base) {
    var ret = {type:'contact'};
    // allow some plural versions
    if (Array.isArray(data.urls) && data.urls.length > 0) {
      ret.url = data.urls[0];
    }
    if (Array.isArray(data.emails) && data.emails.length > 0) {
      ret.url = data.emails[0];
    }
    if (Array.isArray(data.phones) && data.phones.length > 0) {
      ret.phone = data.phones[0];
    }
    ret.title = data.name;
    if (data.bio) ret.description = data.bio;
    if (data.handle) ret.handle = data.handle;
    if (data.email) ret.email = data.email;
    if (data.url) ret.url = data.url;
    if (data.phone) ret.phone = data.phone;
    ret.provider_name = base.auth.split('.')[0];
    ret.id = data.id;
    return ret;
  }
};

exports.defaults = {
  self: 'contact',
  contacts: 'contact'
};

exports.types = {
  contacts: ['contact:devices/contacts']
};

// if the device sends a special contact with the flag "self":true, that will
// get modified and saved uniquely here
exports.pumps = {
  types: {
    contact: function(entry) {
      if (entry.data.self === true)
      entry.idr = idr.parse(entry.idr);
      entry.idr.path = entry.idr.pathname = 'self';
    }
  }
};
