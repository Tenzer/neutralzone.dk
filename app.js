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

io.sockets.on('connection', function clientConnected (socket) {
  // Sends out new user count when a new client is connected
  clients++;
  socket.emit('users', { count: clients });
  socket.broadcast.emit('users', { count: clients });

  // Sends out the latest tweets to new users
  for (var i = 0; i < latest_tweets.length; i++) {
    socket.emit('tweet', { html: latest_tweets[i] });
  }

  // Sends out the server time to the new client, in order for goFuzzy() to be called
  socket.emit('time', { now: new Date().getTime() });

  // Sends out new user count when a client disconnect
  socket.on('disconnect', function clientDisconnected () {
    clients--;
    socket.broadcast.emit('users', { count: clients });
  });
});


/* Twitter */

try {
  var twitter_options = require('./twitter_options.json');
} catch (e) {
  console.error('Could not read "twitter_options.json", reason: ' + e.message);
  console.error('Quitting!');
  process.exit(1);
}

try {
  var latest_tweets = require('./latest_tweets.json').tweets;
} catch (e) {
  var latest_tweets = [];
}

var Twitter = require('ntwitter');
var t = new Twitter(twitter_options.oauth_credentials);

t.verifyCredentials(function testCredentials (err, data) {
  if (err) {
    console.error('Got the following error when testing Twitter credentials:');
    console.error(err);
    console.error('Quitting!');
    process.exit(1);
  }
});

t.stream('statuses/filter', twitter_options.filter, function twitterStream(ts) {
  ts.on('data', function processNewTweet (tweet) {
    if (tweet['delete']) {
      io.sockets.emit('delete', { tweetId: tweet['delete'].status.id_str });
    } else {
      var rendered_tweet = renderTweet(tweet);
      io.sockets.emit('tweet', { html: rendered_tweet, tweetId: tweet.id_str });

      if (latest_tweets.push(rendered_tweet) > 10) {
        latest_tweets.shift();
      }
    }
  });

  ts.on('end', function processError (e) {
    console.error('ERROR: Received following error message from Twitter handler:');
    console.error(e.message);
    console.error('Quitting now!');
    process.exit(1);
  });

  ts.on('destroy', function processError (e) {
    console.error('ERROR: Got disconnected from Twitter:');
    console.error(e.message);
    console.error('Quitting now!');
    process.exit(1);
  });
});

var fs = require('fs');
setInterval(function saveLatestTweets () {
  fs.writeFile('./latest_tweets.json', JSON.stringify({ tweets: latest_tweets }));
}, 60000);


/* Rendering */

var mustache = require('mustache');

function renderTweet (tweet) {
  tweet.timestamp = new Date(tweet.created_at).toJSON();
  return mustache.to_html(
    '@<a class="screenname" href="http://twitter.com/{{user.screen_name}}">{{user.name}}</a><br />' +
    '<a href="http://twitter.com/{{user.screen_name}}/status/{{id_str}}"><time datetime="{{timestamp}}">Less than a minute ago</time></a><br />' +
    '{{text}}<br />'
  , tweet);
}


/* Update time since */

// Time is pushed from the server to the clients, in order to avoid clients with wrong time settings
setInterval(function updateTime() {
  io.sockets.emit('time', { now: new Date().getTime() });
}, 10000);
