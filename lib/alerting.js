var request = require("request");
var logger = require("logger");

var __pager_duty_base_url =
  "https://events.pagerduty.com/generic/2010-04-15/create_event.json";

function PagerDutyBackend() {
}

PagerDutyBackend.prototype.init = function(config) {
  if (!config.key) return;

  this.api_key = config.key;
};

PagerDutyBackend.prototype.postEvent = function(type, description, extras, cbDone) {
  var msg = {
    service_key:this.api_key,
    event_type:type,
    description:description
  };
  if (extras.key) msg.incident_key = extras.key;
  if (extras.details) msg.details = extras.details;

  request.post({url:__pager_duty_base_url, json:msg}, cbDone);
};

PagerDutyBackend.prototype.alert = function(description, extras, cbDone) {
  var args = Array.prototype.slice.call(arguments);
  args.unshift("trigger");
  this.postEvent.apply(this, args);
};

PagerDutyBackend.prototype.resolve = function(description, extras, cbDone) {
  var args = Array.prototype.slice.call(arguments);
  args.unshift("resolve");
  this.postEvent.apply(this, args);
};

PagerDutyBackend.prototype.install = function(cbError) {
  var self = this;
  process.on("uncaughtException", function(E) {
    try {
      // these are copied from hallwayd.js again so they don't alert too
      if(E.toString().indexOf('Error: Parse Error') >= 0) return;
      if(E.toString().indexOf('ECONNRESET') >= 0 || E.toString().indexOf('socket hang up') >= 0) return;
      if(E.toString().indexOf('ETIMEDOUT') >= 0) return;
      if(E.toString().indexOf('EADDRINFO') >= 0) return;
      self.alert(E.name + ": " + E.message, {key:"uncaughtExceptionHandler", details:{stack:E.stack}}, function() {
        cbError(E);
      });
    } catch (newE) {
      // Don't get uncaught again!
      cbError(newE);
    }
  });
};

module.exports = new PagerDutyBackend();
