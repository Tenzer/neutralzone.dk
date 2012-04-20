/*jshint
  node: true,
  globalstrict: true,
  laxcomma: true
 */

'use strict';

/* Socket.IO */

var io = require('socket.io').listen(3000);
io.enable('browser client minification');
io.enable('browser client gzip');
io.set('log level', 2);

var clients = 0;

io.sockets.on('connection', function (socket) {
  clients++;
  socket.emit('users', { count: clients });
  socket.broadcast.emit('users', { count: clients });

  // Sends out the latest tweets to new users
  for (var i = 0; i < latest_tweets.length; i++) {
    socket.emit('tweet', { html: latest_tweets[i] });
  }

  socket.on('disconnect', function () {
    clients--;
    socket.broadcast.emit('users', { count: clients });
  });
});


/* Twitter */

var twitter_options = require('./twitter_options.json');

var latest_tweets = [];
var Twitter = require('./twitter_streaming.js');
var t = new Twitter(twitter_options);

t.on('tweet', function (tweet) {
  var rendered_tweet = renderTweet(tweet);
  io.sockets.emit('tweet', { html: rendered_tweet });

  if (latest_tweets.push(rendered_tweet) > 5) {
    latest_tweets.shift();
  }
});

t.on('error', function (e) {
  console.error('ERROR: Received following error message from Twitter handler:');
  console.error(e.message);
  console.error('Quitting now!');
  process.exit(1);
});

t.getTweets();


/* Rendering */

var mustache = require('mustache');

function renderTweet (tweet) {
  return mustache.to_html(
    '@<a href="http://twitter.com/#!/{{user.screen_name}}">{{user.name}}</a><br />' +
    '<a href="http://twitter.com/#!/{{user.screen_name}}/status/{{id}}">{{created_at}}</a><br />' +
    '{{text}}<br />'
  , tweet);
}
