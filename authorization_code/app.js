/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var when = require('when');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var moment = require('moment');
moment.utc().format();

var client_id = process.env.FRIEND_ZONE_CLIENT_ID; // Your client id
var client_secret = process.env.FRIEND_ZONE_CLIENT_SECRET; // Your client secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri
var userId = '1263219154'; //spotify:user:1263219154
var stored_access_token = null;
var FZsettings = {
    debuggerPlaylist: '3xK9wu5wet6fyy0I9mAk77', //Debugger
    friendZoneMasterPlaylistId: '0WSVlLsBh8zDHARsTqSoXW',
    fzAugustMasterBackup: '7F8BlhTzhRUfZf3saBKc58', //FZ August Master Backup
    friendZoneRadioId: '73k1L1bpCRqbbUAltTRMp4', //Friend Zone Radio (FKA FZ August)
    backupPlaylistId: '0NpOn7HwkFgvDz7G7c0FTU' //August the first
};

var apiOptions = {
    getPlaylistTracks: function(playlistId, optionalQuery) {
        var access_token = stored_access_token;
        var query = optionalQuery ? ('?fields=' + optionalQuery) : '';
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + playlistId + '/tracks' + query,
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            json: true
        };
    },
    friendZoneMasterAdd: function(urisArray) {
        var access_token = stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + FZsettings.debuggerPlaylist + '/tracks',
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            body: {
                'uris': urisArray
            },
            json: true
        };
    },
    getAllUserPlaylists: function() {
        var access_token = stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists?limit=50',
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            json: true
        };
    },
    addToBackUp: function(backupPlaylistId, urisArray) {
        var access_token = stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + backupPlaylistId + '/tracks',
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            body: {
                'uris': urisArray
            },
            json: true
        };
    },
    addToPlaylist: function(playlistId, urisArray) {
        var access_token = stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + playlistId + '/tracks',
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            body: {
                'uris': urisArray
            },
            json: true
        };
    }
};

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var getPlaylistURIs = function getPlaylistURIs() {
    var playlists = {
        // march: '3Bx4pYALhO3uz7xpyPCFog', //spotify:user:1263219154:playlist:3Bx4pYALhO3uz7xpyPCFog
        // april: '4ZxRnNoRY6kfde6ObumcIJ', //spotify:user:1263219154:playlist:4ZxRnNoRY6kfde6ObumcIJ
        // may: '0WXmnDBQlFwnOomrZKcxvi', //spotify:user:1263219154:playlist:0WXmnDBQlFwnOomrZKcxvi
        // june: '5TtSuNT4VzUC891uNF6WEM', //spotify:user:1263219154:playlist:5TtSuNT4VzUC891uNF6WEM
        july: '745orEm9Fk4NPldihQuPYy', //spotify:user:1263219154:playlist:745orEm9Fk4NPldihQuPYy
        friendZoneRadio: '73k1L1bpCRqbbUAltTRMp4' //spotify:user:1263219154:playlist:73k1L1bpCRqbbUAltTRMp4
    };
    var playlistNames = Object.keys(playlists);
    var playlistURIs = [];
    for (var i = 0; i < playlistNames.length; i++) {
        playlistURIs.push(playlists[playlistNames[i]]);
    }
    return playlistURIs;
};

var getCutoffDate = function(daysAgo) {
    var now = moment.utc();
    var cutoff = now.subtract(daysAgo, 'days');
    return cutoff;
};


var sortFriendZoneRadio = function(playlistURI, backupPlaylistURI, sendResponseCallback) {
    var tracksToAddArray = [];
    request.get(apiOptions.getPlaylistTracks(playlistURI), function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var uri = null;
            var addedAt = null;
            var cutoff = getCutoffDate(30);
            for (var i = 0; i < body.items.length; i++) {
                uri = body.items[i].track.uri;
                if (uri.indexOf('local') < 0 && uri.indexOf('track:null') < 0) {
                    addedAt = moment.utc(body.items[i].added_at);
                    if (addedAt < cutoff) {
                        tracksToAddArray.push(uri);
                    }
                } else {
                    console.log('ERROR when adding %s', uri);
                }
            }
        }
        // Move items off this playlist into backup playlist //TODO add function to auto-determine the month of the backup playlist
        addToBackUp(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback);
    });
};

var addToBackUp = function(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback) { //TODO consolidate these passed options into a single object
    request.post(apiOptions.addToPlaylist(backupPlaylistURI, tracksToAddArray), function(error, response, body) {
        removeFromFriendZoneRadio(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback);
    });
};

var removeFromFriendZoneRadio = function(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback) {
    var playlistToEmptyId = playlistURI;

    var formattedArray = function() { //TODO move this declaration outside of the function, need to pass an array in and return an array
        var returnArray = [];
        for (var u = 0; u < tracksToAddArray.length; u++) {
            returnArray.push({
                uri: tracksToAddArray[u]
            });
        }
        return returnArray;
    };
    var emptyOptions = apiOptions.getPlaylistTracks(playlistToEmptyId);
    emptyOptions.body = {
        tracks: formattedArray()
    };
    request.del(emptyOptions, function(error, response, body) {
        sendResponseCallback.call(this, {
            body: body
        });
    });
};

// Pass an array of spotify playlistUris, along with an empty array and the sendResponseCallback that gives access to the client response
var getPlaylistsTracks = function getPlaylistsTracks(playlistURIArray, tracksToAddArray, callback, sendResponseCallback) {
    var playlistURI = playlistURIArray.pop();
    if (playlistURI !== undefined) {
        request.get(apiOptions.getPlaylistTracks(playlistURI, 'items.track.uri'), function(error, response, body) {
            if (!error && response.statusCode === 200) {
                var uri = null;
                for (var i = 0; i < body.items.length; i++) {
                    uri = body.items[i].track.uri;
                    if (uri.indexOf('local') < 0 && uri.indexOf('track:null') < 0) {
                        tracksToAddArray.push(uri);
                    } else {
                        console.log('ERROR when adding %s', uri);
                    }
                }
                //continue to pass array of playlists, array holding all uris
                callback.call(this, playlistURIArray, tracksToAddArray, callback, sendResponseCallback);
            }
        });
    } else {
        // Call the function that will add tracks 100 at a time to a playlist (configured in apiOptions object)
        addPlaylistsTracksToMaster(tracksToAddArray, addPlaylistsTracksToMaster, sendResponseCallback);
    }
};

//
var addPlaylistsTracksToMaster = function addPlaylistsTracksToMaster(tracksToAddArray, callback, sendResponseCallback) {
    if (tracksToAddArray && tracksToAddArray.length > 0) {
        console.log('tracksToAddArray is %s in length', tracksToAddArray.length);
        var currentAddition = tracksToAddArray.splice(0, 100);
        request.post(apiOptions.friendZoneMasterAdd(currentAddition), function(error, response, body) {
            // responses.push({
            //     href: playlistHref,
            //     body: body2
            // });
            callback.call(this, tracksToAddArray, callback, sendResponseCallback);
        });
    } else {
        sendResponseCallback();
    }
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
    .use(cookieParser());

app.get('/login', function(req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-read-private user-read-email playlist-read-collaborative playlist-modify-private playlist-modify-public';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});

app.get('/callback', function(req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;
                stored_access_token = body.access_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: {
                        'Authorization': 'Bearer ' + access_token
                    },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function(error, response, body) {
                    userId = body.id;
                    console.log(body);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

app.get('/refresh_token', function(req, res) {

    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});

app.get('/playlists', function(req, res) {
    var access_token = stored_access_token;
    var playlistsOptions = apiOptions.getAllUserPlaylists();

    request.get(playlistsOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            res.send({
                response: response,
                body: body
            });
        }
    });
});

app.get('/friendzone/empty', function(req, res) {
    var playlistToEmptyId = FZsettings.debuggerPlaylist;

    var emptyOptions = apiOptions.getPlaylistTracks(playlistToEmptyId);
    var getTracksToDeleteOptions = apiOptions.getPlaylistTracks(playlistToEmptyId);

    request.get(getTracksToDeleteOptions, function(error, response, body) {
        var trackIds = [];
        if (!error && response.statusCode === 200) {
            for (var i = 0; i < body.items.length; i++) {
                trackIds.push({
                    uri: body.items[i].track.uri
                });
            }
            emptyOptions.body = {
                tracks: trackIds
            };
            request.del(emptyOptions, function(error2, response2, body2) {
                res.send({
                    body: body2
                });
            });
        }

    });
});

app.get('/friendzone/prune', function(req, res) {
    var playlistToPrune = FZsettings.friendZoneRadioId;
    // var playlistToPrune = '73k1L1bpCRqbbUAltTRMp4'; //FriendZone August
    var backupPlaylistId = FZsettings.backupPlaylistId;
    var sendResponse = function(data) {
        res.send({
            message: 'saul goode bro!',
            data: data
        });
    };

    sortFriendZoneRadio(playlistToPrune, backupPlaylistId, sendResponse);
});

app.get('/friendzone/backup', function(req, res) {
    var sendResponse = function sendResponse(playlistURIs) {
        res.send({
            message: 'You in the ZONE now boiiii',
            // responses: playlistURIs,
            // totalTracks: totalTracks,
            // addedTracks: totalAddedTracks
        });
    };
    getPlaylistsTracks(getPlaylistURIs(), [], getPlaylistsTracks, sendResponse);
});

var getPlaylist = function getPlaylist(playlistId) {
    var d = when.defer();
    request.get(apiOptions.getPlaylistTracks(playlistId), function(error, response, body) {
        var thing = body;
        d.resolve(thing);
    });
    return d.promise;
};

app.get('/friendzone/fetchTracks', function(req, res) {
    var playlistURIs = getPlaylistURIs();

    var promiseMe = getPlaylist(playlistURIs[0]);
    var promiseMeToo = getPlaylist(playlistURIs[1]);

    var newYearsDay = when.all([promiseMe, promiseMeToo]);

    newYearsDay.then(
        function(serviceResponse) {
            res.send({
                message: 'You in the ZONE now boiiii',
                response: serviceResponse
            });
        },
        function(error) {
            res.send({
                message: 'Something went wrong...fear not',
                response: serviceResponse
            });
        }
    );
});

console.log('Listening on 8888');
app.listen(8888);