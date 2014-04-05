/*jshint node: true */

'use strict';


/* Redis */

var redis = require('redis');
var db = redis.createClient();

function storeTweet (tweet) {
    tweet.timestamp = Date.now();
    db.zadd('nz:tweets', tweet.timestamp, JSON.stringify(tweet), function afterSave (error) {
        if (error) {
            return console.error('Error saving tweet: %s', error);
        }

        db.hset('nz:ids', tweet.id_str, tweet.timestamp, function afterSaveId (error) {
            if (error) {
                return console.error('Error saving tweet ID: %s', error);
            }
        });
    });
}

function deleteTweet (tweet_id) {
    db.hget('nz:ids', tweet_id, function deleteTweetRedisReply (error, timestamp) {
        if (error) {
            return console.error('Error when getting timestamp for tweet to be deleted (ID %s): %s', tweet_id, error);
        }

        if (!timestamp) {
            return console.log('Timestamp was not found for tweet with ID %s, which was requested deleted.', tweet_id);
        }

        db.hdel('nz:ids', tweet_id);
        db.zrem('nz:tweets', timestamp);
    });
}

// Used to strip data from the tweet the frontend doesn't need
function formatTweet (tweet) {
    if (typeof tweet === 'string') {
        tweet = JSON.parse(tweet);
    }

    var retweet;
    if (tweet.retweeted_status) {
        retweet = {
            name: tweet.user.name,
            screen_name: tweet.user.screen_name
        };
        tweet.retweeted_status.timestamp = tweet.timestamp;
        tweet = tweet.retweeted_status;
    }

    var t = {
        id: tweet.id_str,
        screen_name: tweet.user.screen_name,
        name: tweet.user.name,
        timestamp: tweet.timestamp,
        text: renderTweet(tweet),
        retweet: retweet
    };

    if (tweet.user.profile_image_url) {
        t.pic_url = tweet.user.profile_image_url;
    } else {
        t.pic_url = 'images/no-picture.png';
    }

    return t;
}


/* Socket.IO */

var io = require('socket.io').listen(3000);
io.set('log level', 2);

var clients = 0;

io.sockets.on('connection', function clientConnected (socket) {
    // Sends out new user count when a new client is connected
    clients++;
    socket.emit('users', clients);
    socket.broadcast.emit('users', clients);

    // Sends out new user count when a client disconnect
    socket.on('disconnect', function clientDisconnected () {
        clients--;
        socket.broadcast.emit('users', clients);
    });

    socket.on('gettweets', function sendTweets (data) {
        if (data.type === 'newer' && data.date === 0) {
            // Send the 10 latest tweets to the user
            db.zrange('nz:tweets', -10, -1, function sendLatestTweets (error, tweets) {
                if (error) {
                    return console.error('Error getting tweets to send to client: %s', error);
                }

                socket.emit('newtweets', tweets.map(formatTweet));

                // Sends out the server time to the new client, this calls goFuzzy()
                socket.emit('time', new Date().getTime());
            });
        } else if (data.type === 'newer' && data.date !== 0) {
            // Send whichever tweets has come in since the client got tweets last time
            db.zrangebyscore('nz:tweets', data.date + 1, '+inf', function sendLatestTweets (error, tweets) {
                if (error) {
                    return console.error('Error getting tweets to send to client: %s', error);
                }

                socket.emit('newtweets', tweets.map(formatTweet));

                // Sends out the server time to the new client, this calls goFuzzy()
                socket.emit('time', new Date().getTime());
            });
        } else if (data.type === 'older') {
            console.log('Client requested tweets older than', data.date);
            // Send up to 10 older tweets to the client
            db.zrevrangebyscore('nz:tweets', data.date - 1, '-inf', 'LIMIT', 0, 10, function sendArchivedTweets (error, tweets) {
                if (error) {
                    return console.error('Error getting tweets to send to client: %s', error);
                }

                socket.emit('oldtweets', tweets.map(formatTweet));

                // Sends out the server time to the new client, this calls goFuzzy()
                socket.emit('time', new Date().getTime());
            });
        }
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

t.verifyCredentials(function testCredentials (error) {
    if (error) {
        console.error('Error verifying Twitter credentials: %s\nQuitting!', error);
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
        if (!tweet.user) {
            console.log('This tweet does not have a user object: ' + JSON.stringify(tweet));
            return;
        }

        if (tweet.in_reply_to_user_id && !tweet.retweeted_status) {
            // Ignore replies, unless they are retweets
            return;
        }

        if (tweet.retweeted_status && t_opts.follow.indexOf(tweet.user.id) === -1) {
            // Ignore retweets from accounts not followed
            return;
        }

        io.sockets.emit('newtweets', formatTweet(tweet));
        storeTweet(tweet);
    });

    ts.on('delete', function deleteTweet (tweet) {
        io.sockets.emit('delete', { id: tweet.status.id_str });
        deleteTweet(tweet.status.id_str);
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
    // Find out if tweet already has links
    if (tweet.text.indexOf('</a>') !== -1) {
        // It has, so don't create our own links
        return tweet.text;
    }

    // URLs
    var i, entity;
    if (tweet.entities.urls) {
        tweet.entities.urls.forEach(function renderUrls (item) {
            tweet.text = tweet.text.replace(item.url, '<a href="' +
                item.url + '">' + item.display_url + '</a>'
            );
        });
    }

    // Media
    if (tweet.entities.media) {
        tweet.entities.media.forEach(function renderMedia (item) {
            tweet.text = tweet.text.replace(item.url, '<a href="' +
                item.url + '">' + item.display_url + '</a>'
            );
        });
    }

    // Users
    if (tweet.entities.user_mentions) {
        tweet.entities.user_mentions.forEach( function renderUsers (item) {
            tweet.text = tweet.text.replace('@' + item.screen_name,
                '<a href="https://twitter.com/intent/user?screen_name=' +
                item.screen_name + '">@' + item.screen_name + '</a>'
            );
        });
    }

    // Hashtags
    if (tweet.entities.hashtags) {
        tweet.entities.hashtags.forEach(function renderHashtags (item) {
            tweet.text = tweet.text.replace('#' + item.text,
                '<a href="https://twitter.com/search/%23' + item.text +
                '">#' + item.text + '</a>'
            );
        });
    }

    return tweet.text;
}


/* Update time since */

// Time is pushed from the server to the clients
// This is in order to avoid clients with wrong time settings
setInterval(function updateTime () {
    io.sockets.emit('time', new Date().getTime());
}, 15000);
