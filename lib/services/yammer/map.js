exports.ptype = 110; // must be unique per service, see dMap.js

exports.contact = {
  id: "id",
  photo: "mugshot_url",
  nickname: 'name',
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.title = data.full_name;
    ret.url = data.web_url;
    ret.description = data.summary;
    ret.thumbnail_url = data.mugshot_url;
    if(data.contact)
    {
      if(data.contact.email_addresses && data.contact.email_addresses.length > 0) ret.email = data.contact.email_addresses[0].address;
      if(data.contact.phone_numbers && data.contact.phone_numbers.length > 0) ret.phone = data.contact.phone_numbers[0].number;
    }
    ret.provider_name = 'yammer';
    ret.id = data.id;
    return ret;
  },
  text: 'full_name'
}



exports.message = {
  at: function(data) { return Date.parse(data.created_at); },
  text: function(data) { return data.body.plain; }
}

exports.defaults = {
  messages: 'message',
  users: 'contact',
  self: 'contact',
  groups: 'group'
}

exports.types = {
  statuses_feed: ['message:yammer/messages'],
  contacts: ['contact:yammer/users']
}
