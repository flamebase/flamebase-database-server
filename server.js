var express =               require('express');
var bodyParser =            require('body-parser');
var log4js =                require('log4js');
var cluster =               require('cluster');
var http =                  require('http');
var numCPUs =               require('os').cpus().length;
var FlamebaseDatabase =     require("flamebase-database-node");
var Path =                  require("./model/path.js");
var apply =                 require('rus-diff').apply;
var clone =                 require('rus-diff').clone;

JSON.stringifyAligned = require('json-align');

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

var expectedDBNEnvVar = "DATABASE_NAME";
var expectedPORTNEnvVar = "DATABASE_PORT";
var dbMaster = null;
var port = null;

process.argv.forEach(function (val, index, array) {
    if (val.indexOf(expectedDBNEnvVar) > -1) {
        dbMaster = val.replaceAll(expectedDBNEnvVar + "=", "");
    }
    if (val.indexOf(expectedPORTNEnvVar) > -1) {
        port = val.replaceAll(expectedPORTNEnvVar + "=", "");
    }
});


var TAG =                   "SERVER CLUSTER";
var logger =                log4js.getLogger(TAG);

var dbPaths = "paths";
var paths = new FlamebaseDatabase(dbPaths, "/");

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

    var action = {
        response: function (connection, data, error, pId) {
            var result = {status: (data === null || error !== null ? "KO" : "OK"), data: data, error: error};
            logger.info("worker: " + pId);
            logger.info("response: " + JSON.stringify(result));
            connection.response.contentType('application/json');
            connection.response.send(result);
        },
        addSingleListener: function (connection, pId) {
            this.addGreatListener(connection, pId);
        },
        addGreatListener: function (connection, pId) {
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

                paths.ref[key].tokens[connection.token].time = new Date().getTime();

                paths.syncToDatabase();

                var object = this.getReference(connection, pId);
                object.FD.syncFromDatabase();
                var len = 0;
                if (typeof object !== "string") {
                    len = JSON.stringify(object.FD.ref).length;
                }
                var data = {};
                data.len = len;
                data.info = "listener_added";

                this.response(connection, data, null, pId);
            } else {
                this.response(connection, null, "path_contains_dots", pId);
            }

        },
        updateData: function (connection, pId) {
            var object = this.getReference(connection, pId);
            if (typeof object === "string") {
                this.response(connection, null, object, pId);
            } else {
                object.FD.syncFromDatabase();

                var differences = connection.differences;

                if (differences !== undefined) {
                    logger.debug(JSON.stringify(differences));
                    apply(object.FD.ref, JSON.parse(differences));

                    if (JSON.stringify(object.FD.ref).length < connection.len) {
                        logger.error("##########_inconsistency_length");
                        this.response(connection, null, "inconsistency_length", pId);
                        return;
                    }

                    object.FD.syncToDatabase();

                    this.response(connection, "data_updated", null, pId);
                } else {
                    this.response(connection, "no_diff_updated", null, pId);
                }
            }
        },
        getReference: function (connection, pId) {
            if (connection.path !== undefined) {
                if (connection.path.indexOf("\.") === -1) {
                    if (connection.path.indexOf("/") === 0) {
                        var key = connection.path.replaceAll("/", "\.");
                        key = key.substr(1, key.length - 1);
                        if (paths.ref[key] !== undefined) {
                            return new Path(paths.ref[key], dbMaster, connection.path, pId);
                        } else {
                            return "holder_not_found";
                        }
                    } else {
                        return "path_not_starts_with_slash";
                    }
                } else {
                    return "path_contains_dots";
                }
            } else {
                return "json_path_not_found";
            }
        },
        parseRequest: function (req, res, worker) {
            var response = res;

            try {
                var message = req.body;
                var connection = {};     // connection element

                logger.debug("user-agent: " + req.headers['user-agent']);
                logger.debug("worker: " + worker);


                if (message === undefined || message === null) {
                    logger.error("there vas an error on the connection instance creation: no_params");
                    var result = {status: "KO", data: null, error: "missing_params"};
                    response.contentType('application/json');
                    response.send(JSON.stringify(result));
                    return null
                }

                var keys = Object.keys(message); // keys
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    switch (key) {
                        case "method":
                            connection[key] = message[key];
                            logger.debug("method: " + connection[key]);
                            break;

                        case "path":
                            connection[key] = message[key];
                            logger.debug("path: " + connection[key]);
                            break;

                        case "token":
                            connection[key] = message[key];
                            logger.debug("token: " + connection[key]);
                            break;

                        case "differences":
                            connection[key] = message[key];
                            logger.debug("differences: " + connection[key]);
                            break;

                        case "len":
                            connection[key] = message[key];
                            logger.debug("len: " + connection[key]);
                            break;

                        case "os":
                            connection[key] = message[key];
                            logger.debug("os: " + connection[key]);
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
                    case "single_listener":
                        try {
                            this.addSingleListener(connection, worker);
                        } catch (e) {
                            logger.error("there was an error parsing request from addSingleListener: " + e.toString());
                            this.response(connection, null, "cluster_" + worker + "_error_adding_single", worker);
                        }
                        break;

                    case "great_listener":
                        try {
                            this.addGreatListener(connection, worker);
                        } catch (e) {
                            logger.error("there was an error parsing request from addGreatListener: " + e.toString());
                            this.response(connection, null, "cluster_" + worker + "_error_adding_great", worker);
                        }
                        break;

                    case "update_data":
                        try {
                            this.updateData(connection, worker);
                        } catch (e) {
                            logger.error("there was an error parsing request from updateData: " + e.toString());
                            this.response(connection, null, "cluster_" + worker + "_error_updating_data", worker);
                        }
                        break;

                    default:
                        //
                        break;

                }

            } catch (e) {
                logger.error("there was an error parsing request: " + e.toString());

                var result = {status: "KO", data: null, error: "missing_or_wrong_params"};

                res.contentType('application/json');
                res.send(JSON.stringify(result));
            }
        }
    };

    var app = express();

    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.use(bodyParser.json());

    app.route('/')
        .get(function (req, res) {
            action.parseRequest(req, res, cluster.worker.id)
        })
        .post(function (req, res) {
            action.parseRequest(req, res, cluster.worker.id)
        });

    app.listen(port, function () {
        paths.syncFromDatabase();
        logger.info("server cluster started on port " + port + " on " + cluster.worker.id + " worker");
    });
}