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
    console.error('Error opening database: %s\nQuitting!', err);
    process.exit(1);
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
      console.error('Error saving tweet: %s', err);
    }
  });
}

setInterval(function removeOldTweets () {
  db.find({
    timestamp: {
      $lt: Date.now() - 604800000 // One week
    }
  })
  .shallow()(function deleteTweets (err, tweets) {
    if (err) {
      console.error('Error getting tweets for deletion: %s', err);
    }

    var timer = Date.now();
    var size_before = db.size;

    function tweetDeleted (err) {
      if (err) {
        // Ignore error if no records were found
        if (err.toString() !== 'Error: No records.') {
          console.error('Error deleting tweet: %s', err);
        }
      }
    }

    for (var i = 0; i < tweets.length; i++) {
      db.remove(tweets[i].id, tweetDeleted);
    }

    console.log('Deleted %d old tweets in %d ms.',
        tweets.length,
        Date.now() - timer
    );
  });
}, 21600000); // Every six hours


/* Express */

var express = require('express');
var app = express.createServer();

app.use(express.static(__dirname + '/public'));
app.use(express.logger());

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/public/index.html');
});

app.listen(process.env['app_port'] || 3000);


/* Socket.IO */

var io = require('socket.io').listen(app);
io.enable('browser client minification');
io.enable('browser client gzip');
io.set('log', false);

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
  .desc('timestamp')
  .limit(20)(function sendOldTweets (err, tweets) {
    for (var i = tweets.length - 1; i >= 0; i--) {
      socket.emit('tweet',
        {
          html: renderTweet(tweets[i].tweet),
          tweetId: tweets[i].id
        }
      );
    }

    // Sends out the server time to the new client, this calls goFuzzy()
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
  var t_opts = require('./twitter_options.json');
} catch (e) {
  console.error('Error reading twitter_options.json: %s\nQuitting!', e.message);
  process.exit(1);
}

var t = require('immortal-ntwitter').create(t_opts.oauth_credentials);

t.verifyCredentials(function testCredentials (err, data) {
  if (err) {
    console.error('Error verifying Twitter credentials: %s\nQuitting!', err);
    process.exit(1);
  }
});

t.immortalStream('statuses/filter', t_opts.filter, function twitterStream (ts) {
  ts.on('data', function processNewTweet (tweet) {
    io.sockets.emit('tweet',
      {
        html: renderTweet(tweet),
        tweetId: tweet.id_str
      }
    );

    storeTweet(tweet);
  });

  ts.on('delete', function deleteTweet (tweet) {
    console.log('Delete event received, content: %s', tweet); // Debugging

    io.sockets.emit('delete', { tweetId: tweet['delete'].status.id_str });

    db.remove(tweet['delete'].status.id_str, function deleteTweet (err) {
      if (err) {
        console.error('Error deleting tweet: %s', err);
      }
    });
  });

  ts.on('limit', function limitReceived (data) {
    console.log('Limit event received, content: %s', data);
  });

  ts.on('scrub_geo', function scrubGeoReceived (data) {
    console.log('Scrub Geo event received, content: %s', data);
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

// Time is pushed from the server to the clients
// This is in order to avoid clients with wrong time settings
setInterval(function updateTime() {
  io.sockets.emit('time', { now: new Date().getTime() });
}, 15000);
