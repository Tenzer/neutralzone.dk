#!/usr/bin/env node
/*jshint node: true */

'use strict';

var async = require('async');
var db = require('redis').createClient();
var tweet_id = process.argv[2].split('/').pop();

db.hget('nz:ids', tweet_id, function (error, timestamp) {
    if (error) {
        db.quit();
        return console.error('Error when getting timestamp for tweet: %s', error);
    }

    if (!timestamp) {
        db.quit();
        return console.log('Timestamp was not found for tweet.');
    }

    async.parallel([
        function (callback) {
            db.zremrangebyscore('nz:tweets', timestamp, timestamp, callback);
        },
        function (callback) {
            db.hdel('nz:ids', tweet_id, callback);
        }
    ], function (error) {
        if (error) {
            console.error('Error when deleting tweet: %s', error);
        }

        db.quit();
    });
});
