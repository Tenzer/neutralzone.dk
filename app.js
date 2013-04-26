/*jshint
  node: true,
  globalstrict: true,
  laxcomma: true
 */

'use strict';


/* Tiny */

var tiny = require('tiny');
var db;

tiny(__dirname + '/latest_tweets.tiny', function openDatabase (err, tinydb) {
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


/* Socket.IO */

var io = require('socket.io').listen(3000);
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
  .desc('timestamp')
  .limit(20)(function sendOldTweets (err, tweets) {
    var retweet;

    for (var i = tweets.length - 1; i >= 0; i--) {
      var tweet = tweets[i].tweet;
      var timestamp = tweets[i].timestamp;
      retweet = undefined;

      if (tweet.retweeted_status) {
        retweet = {
          name: tweet.user.name,
          screen_name: tweet.user.screen_name
        };
        tweet = tweet.retweeted_status;
      }

      var t = {
        id: tweet.id_str,
        screen_name: tweet.user.screen_name,
        name: tweet.user.name,
        timestamp: new Date(timestamp).toJSON(),
        text: renderTweet(tweet),
        retweet: retweet
      };

      if (tweet.user.profile_image_url) {
        t.pic_url = tweet.user.profile_image_url;
      } else {
        t.pic_url = 'images/no-picture.png';
      }

      socket.emit('tweet', t);
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
  var t_opts = require(__dirname + '/twitter_options.json');
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

var filter = {};
if (t_opts.follow) {
  filter.follow = t_opts.follow.join(',');
}
if (t_opts.track) {
  filter.track = t_opts.track.join(',');
}

t.immortalStream('statuses/filter', filter, function twitterStream (ts) {
  ts.on('data', function processNewTweet (tweet) {
    if (tweet.in_reply_to_user_id) {
      // Ignore replies
      return;
    }

    if (!tweet.user) {
      console.log('This tweet does not have a user object: ' + JSON.stringify(tweet));
      return;
    }

    var original_tweet = tweet;
    var retweet;
    if (tweet.retweeted_status) {
      if (t_opts.follow.indexOf(tweet.user.id) === -1) {
        console.log('Ignoring retweet from unfollowed account: ' + JSON.stringify(tweet));
        return;
      }

      retweet = {
        name: tweet.user.name,
        screen_name: tweet.user.screen_name
      };
      tweet = tweet.retweeted_status;
    }

    if (!tweet.user) {
      console.log('This retweet does not have a user object: ' + JSON.stringify(tweet));
      return;
    }

    var t = {
      id: tweet.id_str,
      screen_name: tweet.user.screen_name,
      name: tweet.user.name,
      timestamp: new Date(tweet.created_at).toJSON(),
      text: renderTweet(tweet),
      retweet: retweet
    };

    if (tweet.user.profile_image_url) {
      t.pic_url = tweet.user.profile_image_url;
    } else {
      t.pic_url = 'images/no-picture.png';
    }

    io.sockets.emit('tweet', t);

    storeTweet(original_tweet);
  });

  ts.on('delete', function deleteTweet (tweet) {
    io.sockets.emit('delete', { id: tweet.status.id_str });

    db.remove(tweet.status.id_str, function deleteTweet (err) {
      if (err) {
        console.error('Error deleting tweet (ID %s): %s',
          tweet.status.id_str, err);
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

function renderTweet (tweet) {
  // Replace newline characters with <br>
  //tweet.text = tweet.text.replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br>$2');

  // Find out if tweet already has links
  if (tweet.text.indexOf('</a>') !== -1) {
    // It has, so don't create our own links
    return tweet.text;
  }

  // URLs
  var i, entity;
  if (tweet.entities.urls && tweet.entities.urls.length > 0) {
    for (i = 0; i < tweet.entities.urls.length; i++) {
      entity = tweet.entities.urls[i];
      tweet.text = tweet.text.replace(entity.url, '<a href="' +
        entity.url + '">' + entity.display_url + '</a>'
      );
    }
  }

  // Media
  if (tweet.entities.media && tweet.entities.media.length > 0) {
    for (i = 0; i < tweet.entities.media.length; i++) {
      entity = tweet.entities.media[i];
      tweet.text = tweet.text.replace(entity.url, '<a href="' +
        entity.url + '">' + entity.display_url + '</a>'
      );
    }
  }

  // Users
  if (tweet.entities.user_mentions && tweet.entities.user_mentions.length > 0) {
    for (i = 0; i < tweet.entities.user_mentions.length; i++) {
      entity = tweet.entities.user_mentions[i];
      tweet.text = tweet.text.replace('@' + entity.screen_name,
        '<a href="https://twitter.com/intent/user?screen_name=' +
        entity.screen_name + '">@' + entity.screen_name + '</a>'
      );
    }
  }

  // Hashtags
  if (tweet.entities.hashtags && tweet.entities.hashtags.length > 0) {
    for (i = 0; i < tweet.entities.hashtags.length; i++) {
      entity = tweet.entities.hashtags[i];
      tweet.text = tweet.text.replace('#' + entity.text,
        '<a href="https://twitter.com/search/%23' + entity.text + '">#' +
        entity.text + '</a>'
      );
    }
  }

  return tweet.text;
}


/* Update time since */

// Time is pushed from the server to the clients
// This is in order to avoid clients with wrong time settings
setInterval(function updateTime() {
  io.sockets.emit('time', { now: new Date().getTime() });
}, 15000);
