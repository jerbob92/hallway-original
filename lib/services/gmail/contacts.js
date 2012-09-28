var ijod = require("ijod");
var encoder = require("encoding");
var mimelib = require("mimelib");
var async = require("async");

var IMAP_PAGE_SIZE = 1000;

exports.sync = function(pi, cbDone) {
  var allContacts = {};
  var curSince = (pi.config && pi.config.contactsSince) || 0;
  var gotEntry = true;
  async.whilst(function() {
    return gotEntry && Object.keys(allContacts).length < 200;
  }, function(cbStep) {
    curContacts = [];
    // Go through all of the envelopes and pull out contats
    //console.log("Starting with the chunk since %s", curSince);
    gotEntry = false;
    ijod.getRange("envelope:" + pi.auth.pid + "/headers", {since:curSince, reverse:true, limit:500}, function(entry) {
      gotEntry = true;
      if (!entry) return;
      // For each entry we quickly make sure it's a clean email and name then move on
      curSince = entry.at + 1;
      var labels = entry.data && entry.data["x-gm-labels"];
      // We only do people we've sent to because that's a real contact and less spam filtering
      if (labels && labels.indexOf("\\\\Sent") > 0) {
        var contacts = entry.data.headers.to;
        //console.log(contacts);
        if (!contacts) return;

        for (var idx = 0; idx < contacts.length; ++idx) {
          var contactInfo = contacts[idx];
          var ltIndex = contactInfo.indexOf("<");
          var contactName = contactInfo.substr(0, ltIndex - 1);
          // This checks for RFC 2047 encoded names and decodes them
          if (contactName.substr(0, 2) == "=?" && contactName.substr(contactName.length - 2, 2) == "?=") {
            var encodingEnd = contactName.indexOf("?", 3);
            var encoding = contactName.substr(2, encodingEnd - 2);
            var encodingType = contactName[encodingEnd + 1];
            var encodedText = contactName.substr(encodingEnd + 3, contactName.length - encodingEnd - 5);
            var decodedText = encodedText.replace(/_/g, " ");
            decodedText = decodedText.replace(/=[A-Fa-f0-9]{2}/g, function(match) {
              return String.fromCharCode(parseInt(match.substr(1, 2), 16));
            });
            //console.log("Decoded to: %s", decodedText);
            contactName = encoder.convert(decodedText, "UTF-8", encoding).toString("utf8");
            //console.log("decoded %s using coding %s of type %s to %s", encodedText, encodingType, encoding, contactName);
          }
          var contactEmail = contactInfo.substr(ltIndex + 1, contactInfo.indexOf(">") - ltIndex - 1);

          curContacts.push([contactEmail, contactName, entry.at]);
          //console.log("Got an entry for: %s [%s]", contactName, contactEmail);
        }
      }
    }, function(error) {
      // This is the end of the ijod range, let's do our processing now
      if (error) return cbStep(error);

      // Run through the matches and merge with any existing data or create entries
      async.forEachSeries(curContacts, function(contact, cbContactStep) {
        var contactEmail = contact[0];
        var contactName = contact[1];
        var contactAt = contact[2];
        function updateContact(contact) {
          if (contact.names.indexOf(contactName) < 0) contact.names.push(contactName);
          contact.interactions++;
          contact.at = contactAt;
          return cbContactStep(null);
        }
        // XXX: Need to write a finally pattern!
        if (!allContacts[contactEmail]) {
          ijod.getOne("contact:" + pi.auth.pid + "/contacts", function(error, entry) {
            if (error || !entry) {
              allContacts[contactEmail] = {interactions:0, names:[], email:contactEmail, id:encodeURIComponent(contactEmail)};
            } else {
              allContacts[contactsEmail] = entry.data;
            }
            updateContact(allContacts[contactEmail]);
          });
        } else {
          updateContact(allContacts[contactEmail]);
        }
      }, function(err) {
        //console.log(err);
        //console.log("Did a chunk, currently: %j", allContacts);
        cbStep(err);
      });
    });
  }, function(error) {
    // Setup our new config
    pi.config.contactsSince = curSince;
    var contacts = {};
    console.log("Got %d contacts", Object.keys(allContacts).length);
    contacts["contact:" + pi.auth.pid + "/contacts"] = Object.keys(allContacts).map(function(key) { return allContacts[key]; });
    // Transform into a contacts array
    cbDone(error, {auth:pi.auth, config:pi.config, data:contacts});
  });
}

