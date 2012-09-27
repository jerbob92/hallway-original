var ijod = require("ijod");
var encoder = require("encoding");
var mimelib = require("mimelib");

var IMAP_PAGE_SIZE = 1000;

exports.sync = function(pi, cbDone) {
  var curFriends = {};
  ijod.getRange("envelope:" + pi.auth.pid + "/headers", {since:1, limit:500}, function(entry) {
    var labels = entry.data && entry.data["x-gm-labels"];
    if (labels && labels.indexOf("\\\\Sent") > 0) {
      var contacts = entry.data.headers.to;
      console.log(contacts);
      if (!contacts) return;

      for (var idx = 0; idx < contacts.length; ++idx) {
        var contactInfo = contacts[idx];
        var ltIndex = contactInfo.indexOf("<");
        var contactName = contactInfo.substr(0, ltIndex - 1);
        if (contactName.substr(0, 2) == "=?" && contactName.substr(contactName.length - 2, 2) == "?=") {
          var encodingEnd = contactName.indexOf("?", 3);
          var encoding = contactName.substr(2, encodingEnd - 2);
          var encodingType = contactName[encodingEnd + 1];
          var encodedText = contactName.substr(encodingEnd + 3, contactName.length - encodingEnd - 5);
          var decodedText = encodedText.replace(/_/g, " ");
          decodedText = decodedText.replace(/=[A-Fa-f0-9]{2}/g, function(match) {
            return String.fromCharCode(parseInt(match.substr(1, 2), 16));
          });
          console.log("Decoded to: %s", decodedText);
          contactName = encoder.convert(decodedText, "UTF-8", encoding).toString("utf8");
          console.log("decoded %s using coding %s of type %s to %s", encodedText, encodingType, encoding, contactName);
        }
        var contactEmail = contactInfo.substr(ltIndex + 1, contactInfo.indexOf(">") - ltIndex - 1);

        if (!curFriends[contactEmail]) curFriends[contactEmail] = [];
        if (curFriends[contactEmail].indexOf(contactName) < 0) curFriends[contactEmail].push(contactName);

        console.log("Got an entry for: %s [%s]", contactName, contactEmail);
      }
    }
  }, function(error) {
    console.log("Friends: %j", curFriends);
    cbDone(error, {});
  });
}

