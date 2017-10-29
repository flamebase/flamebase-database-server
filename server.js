var express =               require('express');
var bodyParser =            require('body-parser');
var timeout =               require('connect-timeout');
var log4js =                require('log4js');
var cluster =               require('cluster');
var http =                  require('http');
var numCPUs =               require('os').cpus().length;
var FlamebaseDatabase =     require("flamebase-database-node");
var Path =                  require("./model/path.js");
var apply =                 require('rus-diff').apply;
var clone =                 require('rus-diff').clone;
var sha1 =                  require('sha1');

JSON.stringifyAligned = require('json-align');

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

var expectedDBNEnvVar = "DATABASE_NAME";
var expectedPORTEnvVar = "DATABASE_PORT";
var expectedAPIKeyEnvVar = "API_KEY";
var expectedDebugKeyEnvVar = "DEBUG";
var dbMaster = null;
var port = null;
var APIKey = null;
var debug = null;

process.argv.forEach(function (val, index, array) {
    if (val.indexOf(expectedDBNEnvVar) > -1) {
        dbMaster = val.replaceAll(expectedDBNEnvVar + "=", "");
    }
    if (val.indexOf(expectedPORTEnvVar) > -1) {
        port = val.replaceAll(expectedPORTEnvVar + "=", "");
    }
    if (val.indexOf(expectedDebugKeyEnvVar) > -1) {
        debug = val.replaceAll(expectedDebugKeyEnvVar + "=", "") === "true" ? true : false;
    }
    if (val.indexOf(expectedAPIKeyEnvVar) > -1) {
        APIKey = val.replaceAll(expectedAPIKeyEnvVar + "=", "");
    }
});


var TAG =                   "SERVER CLUSTER";
var logger =                log4js.getLogger(TAG);
logger.level = 'all';

var dbPaths = "paths";

if (cluster.isMaster) {

    var workers = {};

    logger.info("Master " + process.pid + " is running");

    for (var i = 0; i < numCPUs; i++) {
        var worker = cluster.fork();
        workers[worker.pid] = worker;
    }

    cluster.on('exit', function (worker) {
        console.log('Worker %d died :(', worker.id);
        var w = cluster.fork();
        workers[w.pid] = w;
    });

} else {

    const VARS = {
        USER_AGENT: "user-agent",
        APPLICATION_JSON: "application/json",
        WORKER: "worker",
        RESPONSE_KO: "KO"
    };

    const ERROR = {
        MISSING_PARAMS: "there vas an error on the connection instance creation: no_params"
    };

    const ERROR_REQUEST = {
        MISSING_PARAMS: "missing_params",
        MISSING_WRONG_PARAMS: "missing_or_wrong_params"
    };

    const ERROR_RESPONSE = {
        GET_UPDATES: "_error_getting_updates",
        GET_UPDATES_MSG: "_error_getting_updates",
        UPDATE_DATA: "_error_updating_data",
        UPDATE_DATA_MSG: "_error_updating_data",
        ADD_LISTENER: "_error_creating_listener",
        ADD_LISTENER_MSG: "_error_creating_listener",
        REMOVE_LISTENER: "_error_removing_listener"
        REMOVE_LISTENER_MSG: "_error_removing_listener"
    };

    const KEY_REQUEST = {
        METHOD: "method",
        PATH:   "path",
        SHA1:   "sha1",
        TOKEN:  "token",
        DIFFERENCES: "differences",
        CONTENT: "content",
        LEN: "len",
        OS: "os",
        CLEAN: "clean"
    };

    var action = {
        response:       function (connection, data, error, pId) {
            var result = {status: (data === null || error !== null ? "KO" : "OK"),
                data: (data === null ? {} : data), error: error};
            logger.info("worker: " + pId);
            logger.info("response: " + JSON.stringify(result));
            connection.response.contentType('application/json');
            connection.response.send(result);
        },
        addListener:    function (connection, pId) {
            var paths = new FlamebaseDatabase(dbPaths, "/");
            paths.syncFromDatabase();

            if (paths.ref === undefined) {
                paths.ref = {}
            }

            if (connection.path.indexOf("\.") === -1 && connection.path.indexOf("/") === 0) {
                var key = connection.path.replaceAll("/", "\.");
                key = key.substr(1, key.length - 1);

                if (paths.ref[key] === undefined) {
                    paths.ref[key] = {};
                    paths.ref[key].path = connection.path;
                }

                if (paths.ref[key].tokens === undefined) {
                    paths.ref[key].tokens = {};
                }

                if (paths.ref[key].tokens[connection.token] === undefined) {
                    paths.ref[key].tokens[connection.token] = {};
                    paths.ref[key].tokens[connection.token].os = connection.os;
                }

                var keys = Object.keys(paths.ref[key].tokens);
                var lastChangeTime = 0;
                var lastToken = null;

                for (var i = keys.length - 1; i >= 0; i--) {
                    var time = paths.ref[key].tokens[keys[i]].time;
                    if (lastChangeTime < time) {
                        lastChangeTime = time;
                        lastToken = keys[i];
                    }
                }

                paths.syncToDatabase();

                this.updateTime(connection);

                var equals = this.verifyLenght(connection, pId);

                var object = this.getReference(connection, pId);
                object.FD.syncFromDatabase();
                var len = 0;

                if (typeof object !== "string") {
                    len = JSON.stringify(object.FD.ref).length;
                } else {
                    this.response(connection, null, object, pId);
                    return;
                }

                var data = {};
                data.len = len;

                if (lastToken === connection.token) {
                    data.info = "listener_up_to_date";
                } else {
                    data.info = "listener_ready_for_refresh_client";
                }

                this.response(connection, data, null, pId);
            } else {
                this.response(connection, null, "path_contains_dots", pId);
            }

        },
        removeListener: function (connection, pId) {
            var paths = new FlamebaseDatabase(dbPaths, "/");
            paths.syncFromDatabase();

            if (connection.path.indexOf("\.") === -1 && connection.path.indexOf("/") === 0) {
                var key = connection.path.replaceAll("/", "\.");
                key = key.substr(1, key.length - 1);

                if (paths.ref[key] !== undefined && paths.ref[key].tokens !== undefined && paths.ref[key].tokens[connection.token] !== undefined) {
                    delete paths.ref[key].tokens[connection.token];

                    paths.syncToDatabase();

                    var data = {};
                    data.info = "listener_removed";

                    this.response(connection, data, null, pId);
                } else {
                    if (paths.ref[key] === undefined) {
                        this.response(connection, null, "path_not_found", pId);
                    } else {
                        this.response(connection, null, "token_not_found", pId);
                    }
                }
            } else {
                this.response(connection, null, "path_contains_dots", pId);
            }

        },
        verifyLenght:   function (connection, pId) {
            var object = this.getReference(connection, pId);
            logger.debug(sha1(JSON.stringify(object.FD.ref)).toUpperCase());
            logger.debug(connection.sha1);

            var hash = sha1(JSON.stringify(object.FD.ref)).toUpperCase();
            return hash === connection.sha1;
        },
        getUpdatesFrom: function (connection, pId) {
            var paths = new FlamebaseDatabase(dbPaths, "/");
            paths.syncFromDatabase();
            var object = this.getReference(connection, pId);
            if (typeof object === "string") {
                this.response(connection, null, object, pId);
            } else {
                var device = {
                    token: connection.token,
                    os: connection.os
                }
                object.sendUpdateFor(connection.content, device, function() {
                    var data = {};
                    data.info = "updates_sent";
                    data.len = JSON.stringify(object.FD.ref).length;
                    action.response(connection, data, null, pId);
                });
            }
        },
        updateTime:     function (connection) {
            if (connection.path.indexOf("\.") === -1 && connection.path.indexOf("/") === 0) {
                var key = connection.path.replaceAll("/", "\.");
                key = key.substr(1, key.length - 1);

                var paths = new FlamebaseDatabase(dbPaths, "/" + key);
                paths.syncFromDatabase();

                if (paths.ref === undefined) {
                    paths.ref = {};
                    paths.ref.path = connection.path;
                }

                if (paths.ref.tokens === undefined) {
                    paths.ref.tokens = {};
                }
                paths.ref.tokens[connection.token].time = new Date().getTime();
                paths.ref.id = paths.ref.tokens[connection.token].time + "_" + connection.token;
                paths.syncToDatabase();
            }
        },
        updateData:     function (connection, pId) {
            var object = this.getReference(connection, pId);
            if (typeof object === "string") {
                this.response(connection, null, object, pId);
            } else {
                object.FD.syncFromDatabase();

                var differences = connection.differences;

                if (differences !== undefined) {
                    apply(object.FD.ref, JSON.parse(differences));
                    this.updateTime(connection);

                    object.FD.syncToDatabase(false, function() {
                        if (JSON.stringify(object.FD.ref).length !== connection.len) {
                            action.response(connection, null, "data_updated_with_differences", pId);
                        } else {
                            action.response(connection, "data_updated", null, pId);
                        }
                    });

                } else {
                    this.response(connection, "no_diff_updated", null, pId);
                }
            }
        },
        getReference:   function (connection, pId) {
            var paths = new FlamebaseDatabase(dbPaths, "/");
            paths.syncFromDatabase();
            var error = null;
            if (connection.path !== undefined) {
                if (connection.path.indexOf("\.") === -1) {
                    if (connection.path.indexOf("/") === 0) {
                        var key = connection.path.replaceAll("/", "\.");
                        key = key.substr(1, key.length - 1);
                        if (paths.ref[key] !== undefined) {
                            return new Path(APIKey, paths.ref[key], dbMaster, connection.path, pId, debug);
                        } else {
                            error = "holder_not_found";
                        }
                    } else {
                        error = "path_not_starts_with_slash";
                    }
                } else {
                    error = "path_contains_dots";
                }
            } else {
                error = "json_path_not_found";
            }
            logger.error(error);
            return error;
        },
        printError:     function (msg, stackMessage) {
            logger.error(msg);
            var messages = stackMessage.split("\n");
            for (var i = 0; i < messages.length; i++) {
                logger.error(messages[i]);
            }
            return error;
        },
        parseRequest:   function (req, res, worker) {
            var response = res;

            try {
                var message = req.body;
                var connection = {};     // connection element

                logger.debug(VARS.USER_AGENT + ": " + req.headers[VARS.USER_AGENT]);
                logger.debug(VARS.WORKER + ": " + worker);


                if (message === undefined || message === null) {
                    logger.error(ERROR.MISSING_PARAMS);
                    var result = {status: VARS.RESPONSE_KO, data: null, error: ERROR_REQUEST.MISSING_PARAMS};
                    response.contentType(VARS.APPLICATION_JSON);
                    response.send(JSON.stringify(result));
                    return null
                }

                var keys = Object.keys(message); // keys
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    switch (key) {
                        case KEY_REQUEST.METHOD:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.METHOD + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.PATH:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.PATH + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.SHA1:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.SHA1 + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.TOKEN:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.TOKEN + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.DIFFERENCES:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.DIFFERENCES + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.CONTENT:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.CONTENT + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.LEN:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.LEN + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.OS:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.OS + ": " + connection[key]);
                            break;

                        case KEY_REQUEST.CLEAN:
                            connection[key] = message[key];
                            logger.debug(KEY_REQUEST.CLEAN + ": " + connection[key]);
                            break;

                        default:

                            //
                            break;
                    }
                }

                // super important values
                connection.id = new Date().getTime();
                connection.request = req;
                connection.response = response;

                switch (connection.method) {

                    case "create_listener":
                        try {
                            this.addListener(connection, worker);
                        } catch (e) {
                            this.printError("there was an error parsing request from addGreatListener: " + e.stack);
                            this.response(connection, null, "cluster_" + worker + ERROR_RESPONSE.ADD_LISTENER, worker);
                        }
                        break;


                    case "remove_listener":
                        try {
                            this.removeListener(connection, worker);
                        } catch (e) {
                            logger.error("there was an error parsing request from addGreatListener: " + e.toString());
                            this.response(connection, null, "cluster_" + worker + ERROR_RESPONSE.REMOVE_LISTENER, worker);
                        }
                        break;

                    case "update_data":
                        try {
                            this.updateData(connection, worker);
                        } catch (e) {
                            logger.error("there was an error parsing request from updateData: " + e.toString());
                            this.response(connection, null, "cluster_" + worker + ERROR_RESPONSE.UPDATE_DATA, worker);
                        }
                        break;

                    case "get_updates":
                        try {
                            this.getUpdatesFrom(connection, worker);
                        } catch (e) {
                            logger.error("there was an error parsing request from getUpdatesFrom: " + e.toString());
                            this.response(connection, null, "cluster_" + worker + ERROR_RESPONSE.GET_UPDATES, worker);
                        }
                        break;

                    default:
                        //
                        break;

                }

            } catch (e) {
                logger.error("there was an error parsing request: " + e.toString());

                var result = {status: VARS.RESPONSE_KO, data: null, error: ERROR_REQUEST.MISSING_WRONG_PARAMS};

                res.contentType('application/json');
                res.send(JSON.stringify(result));
            }
        }
    };

    var app = express();

    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.use(bodyParser.json({limit: '50mb'}));
    app.use(timeout('60s'));

    app.route('/')
        .get(function (req, res) {
            action.parseRequest(req, res, cluster.worker.id)
        })
        .post(function (req, res) {
            action.parseRequest(req, res, cluster.worker.id)
        });

    app.listen(port, function () {
        logger.info("server cluster started on port " + port + " on " + cluster.worker.id + " worker");
    });
}