var ijod = require("ijod");
var encoder = require("encoding");
var mimelib = require("mimelib");
var async = require("async");

var IMAP_PAGE_SIZE = 1000;

exports.findContacts = function(pi, headers, cbDone) {
  console.log("Running contacts on %d headers", headers.length);
  var curContacts = [];
  headers.forEach(function(entry) {
    if (!entry) return;

    // For each entry we quickly make sure it's a clean email and name then move on
    curSince = entry.at + 1;
    var labels = entry && entry["x-gm-labels"];
    // We only do people we've sent to because that's a real contact and less spam filtering
    if (labels && labels.indexOf("\\\\Sent") > -1) {
      var contacts = entry.headers.to;
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

        // Gotta have an email to be a valid contact
        if (!contactEmail) {
          console.log("Skipping %s", entry.headers.to);
          return;
        }

        curContacts.push([contactEmail, contactName, entry.at]);
        //console.log("Got an entry for: %s [%s]", contactName, contactEmail);
      }
    } else {
      console.log("Skipping entry labels %s", labels);
    }
  });

  console.log("Found %d contacts", curContacts.length);

  var allContacts = {};
  // Run through the matches and merge with any existing data or create entries
  async.forEachSeries(curContacts, function(contact, cbContactStep) {
    var contactEmail = contact[0];
    if (!contactEmail) cbContactStep(null);
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
          allContacts[contactEmail] = entry.data;
        }
        updateContact(allContacts[contactEmail]);
      });
    } else {
      updateContact(allContacts[contactEmail]);
    }
  }, function(err) {
    // Setup our new config
    var config = {};
    var contacts = {};
    console.log("Got %d contacts", Object.keys(allContacts).length);
    contacts["contact:" + pi.auth.pid + "/contacts"] = Object.keys(allContacts).map(function(key) { return allContacts[key]; });
    // Transform into a contacts array
    cbDone(err, {config:config, data:contacts});
  });
}

