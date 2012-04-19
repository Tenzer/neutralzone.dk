/*jshint
  node: true,
  globalstrict: true,
  laxcomma: true
*/

'use strict';

//
// Based on https://gist.github.com/833401
//

var util = require('util'),
  https = require('https'),
  events = require('events');

var Twitter = function (opts) {
  this.username = opts.username;
  this.password = opts.password;
  this.track = opts.track.join(',');
  this.data = '';
};

Twitter.prototype = new events.EventEmitter();

Twitter.prototype.getTweets = function () {
  var opts = {
    hostname: 'stream.twitter.com'
  , path: '/1/statuses/filter.json'
  , method: 'POST'
  , headers: {
      'Connection': 'keep-alive'
    , 'Authorization': 'Basic ' + new Buffer(this.username + ':' + this.password).toString('base64')
    }
  };
  var self = this;

  opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  opts.headers['Content-Length'] = ('track=' + this.track).length;

  this.connection = https.request(opts, function(response) {
    response.setEncoding('utf8');
    response.on('data', function (chunk) {
      self.data += chunk.toString('utf8');

      var index, json;

      while ((index = self.data.indexOf('\r\n')) > -1) {
        json = self.data.slice(0, index);
        self.data = self.data.slice(index + 2);
        if (json.length > 0) {
          try {
            self.emit('tweet', JSON.parse(json));
          } catch (e) {
            self.emit('error', e);
          }
        }
      }
    });
  });

  this.connection.on('error', function (e) {
    self.emit('error', e);
  });

  this.connection.on('end', function () {
    self.emit('error', { message: 'Connection closed' });
  });

  this.connection.write('track=' + this.track);
  this.connection.end();
};

module.exports = Twitter;
