/*jshint
  node: true,
  globalstrict: true,
  laxcomma: true
 */

'use strict';

/* Tiny */

var tiny = require('tiny');
var db;

tiny('latest_tweets.tiny', function openDatabase (err, tinydb) {
  if (err) {
    console.error('Error occurred when trying to open database:');
    console.error(err);
    console.error('Quitting!');
  }

  db = tinydb;
});

function storeTweet (tweet) {
  db.set(tweet.id_str, {
    id: tweet.id_str,
    timestamp: Date.now(),
    tweet: tweet
  }, function afterSave (err) {
    if (err) {
      console.error('Error when saving tweet in database:');
      console.error(err);
    }
  });
}

function tweetDeleted (err) {
  if (err) {
    console.error('Error deleting tweet:');
    console.error(err);
  }
}

setInterval(function removeOldTweets () {
  db.find({
    timestamp: {
      $lt: Date.now() - 604800000 // One week
    }
  })
  .shallow()(function deleteTweets (err, tweets) {
    var timer = Date.now();
    var size_before = db.size;

    for (var i = 0; i < tweets.length; i++) {
      db.remove(tweets[i].id, tweetDeleted);
    }

    db.compact(function dbCompacted (err) {
      if (err) {
        console.error('Error compacting database:');
        console.error(err);
      }

      console.log('Deleted ' + tweets.length + ' old tweets in ' + (Date.now() - timer) + ' seconds.\nCompacting saved ' + (size_before - db.size) + ' bytes.');
    });
  });
}, 21600000); // Every six hours


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

  // Sends out the latest tweets (max 20) to new users
  db.find({
    timestamp: {
      $gt: Date.now() - 604800000 // One week
    }
  })
  .asc('timestamp')
  .limit(20)(function sendOldTweets (err, tweets) {
    for (var i = 0; i < tweets.length; i++) {
      socket.emit('tweet', { html: renderTweet(tweets[i].tweet), tweetId: tweets[i].id });
    }

    // Sends out the server time to the new client, in order for goFuzzy() to be called
    socket.emit('time', { now: new Date().getTime() });
  });

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

var t = require('immortal-ntwitter').create(twitter_options.oauth_credentials);

t.verifyCredentials(function testCredentials (err, data) {
  if (err) {
    console.error('Got the following error when testing Twitter credentials:');
    console.error(err);
    console.error('Quitting!');
    process.exit(1);
  }
});

t.immortalStream('statuses/filter', twitter_options.filter, function twitterStream (ts) {
  ts.on('data', function processNewTweet (tweet) {
    io.sockets.emit('tweet', { html: renderTweet(tweet), tweetId: tweet.id_str });
    storeTweet(tweet);
  });

  ts.on('delete', function deleteTweet (tweet) {
    console.log('Delete event received, content:'); // Debugging
    console.log(tweet);
    io.sockets.emit('delete', { tweetId: tweet['delete'].status.id_str });
    db.remove(tweet['delete'].status.id_str, function deleteTweet (err) {
      if (err) {
        console.error('Error deleting tweet:');
        console.error(err);
      }
    });
  });

  ts.on('limit', function limitReceived (data) {
    console.log('Limit event received, content:');
    console.log(data);
  });

  ts.on('scrub_geo', function scrubGeoReceived (data) {
    console.log('Scrub Geo event received, content:');
    console.log(data);
  });
});


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
}, 15000);
