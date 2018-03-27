// var DatabaseHandler =     require("flamebase-database-node");
var DatabaseHandler =     require("./DatabaseHandler.js");
const logjs =                 require('logjsx');

JSON.stringifyAligned = require('json-align');

var logger = new logjs();

logger.init({
    level : "DEBUG"
});

let TAG =                   "PATH CLUSTER";
let ACTION_SIMPLE_UPDATE    = "simple_update";
let ACTION_SLICE_UPDATE     = "slice_update";
let ACTION_NO_UPDATE        = "no_update";

/**
 * Reference for
 * @param pathReference
 * @param connection
 * @param database
 * @param dbg
 * @constructor
 */
function Reference(pathReference, connection, database, dbg, redis) {

    // object reference
    var object = this;

    this.path = connection.path; //
    this.database = database;
    this.pathReference = pathReference;
    this.DH = new DatabaseHandler(this.database, this.path);
    this.DH.syncFromDatabase(redis).then(function () {

    });

    var config = {};

    /**
     * all device objects must have token and os info in order
     * to slice big JSON changes for android or ios push notifications
     */
    config.devices = function() {
        let path = connection.path;
        // let path = connection.path.replaceAll("/", "\.");
        // path = path.substr(1, path.length - 1);
        let devices = [];
        let keys = Object.keys(object.pathReference.ref[path].tokens);
        for (let i = 0; i < keys.length; i++) {
            let devic = object.pathReference.ref[path].tokens[keys[i]];

            let device = {};
            device.token = keys[i];
            device.os = devic.os;

            devices.push(device);
        }
        return devices;
    };

    /**
     * tag that informs android/ios client which action is being called
     */
    config.tag = function() {
        return object.path + "_sync"; // groupA_sync
    };

    /**
     * custom id for client database (used as primary key)
     */
    config.referenceId = function() {
        return object.path;
    };

    /**
     * custom notification to send when database reference changes.
     * return null if not needed
     */
    config.notification = function() {
        return null;
    };

    this.DH.setSyncConfig(config);
    this.DH.debug(dbg);

    /**
     * Sends differences of received content (older) with stored content
     * @param before
     * @param device
     * @param callback
     * @param connection
     */
    this.sendUpdateByContent = function (before, device, callback, connection) {
        this.DH.sendDifferencesForClient(before, device, callback, connection);
    };

    /**
     * Adds received differences on their path's queue
     * @param connection
     */
    this.addDifferencesToQueue = async function (connection) {
        await this.pathReference.syncFromDatabase(redis);

        let keys = Object.keys(this.pathReference.ref[connection.path].tokens);
        let date = new Date().getTime() + "";
        for (let key in keys) {
            this.pathReference.ref[connection.path].tokens[keys[key]].queue[date] = JSON.parse(connection.differences);
        }

        await this.pathReference.syncToDatabase(redis)
    };

    /**
     * sends all queues
     * TODO check (for performance) if should be better only send specific path's tokens
     * @param connection
     * @param action
     */
    this.sendQueues = async function(connection, action) {
        // logger.debug("synchronizing with devices for path: " + path);

        await this.pathReference.syncFromDatabase(redis);

        if (this.pathReference.ref[connection.path].tokens !== undefined) {
            let referenceId = connection.path;
            let tag = connection.path + "_sync";

            let tokens = Object.keys(this.pathReference.ref[connection.path].tokens);

            for (let i in tokens) {
                let tok = tokens[i];

                let token = this.pathReference.ref[connection.path].tokens[tok];
                let os = token.os;
                let queue = token.queue;

                let changes = Object.keys(queue);

                for (let t in changes) {
                    let id = changes[t];

                    let dataToSend = this.DH.getParts(os, JSON.stringify(queue[id]));

                    /**
                     * single part, ACTION_SIMPLE_UPDATE
                     */
                    if (dataToSend.parts.length === 1) {
                        let data = {};
                        data.id = referenceId;
                        data.tag = tag;
                        data.reference = dataToSend.parts[0];
                        data.action = ACTION_SIMPLE_UPDATE;
                        data.size = dataToSend.parts.length;
                        data.index = 0;
                        let send = {};
                        send.data = data;
                        send.tokens = [tok];
                        this.DH.sendPushMessage(send,
                            /**
                             * success
                             */
                            function () {
                                logger.info("success event");
                                object.removeQueue(connection.path, tok, id);
                            },
                            /**
                             * fail
                             * @param error
                             */
                            function (error) {
                                // logger.error(error);
                            }, connection);
                    } else if (dataToSend.parts.length > 1) {
                        /**
                         * few parts, ACTION_SLICE_UPDATE
                         */
                        for (let i = 0; i < dataToSend.parts.length; i++) {
                            let data = {};
                            data.id = referenceId;
                            data.tag = tag;
                            data.reference = dataToSend.parts[i];
                            data.action = ACTION_SLICE_UPDATE;
                            data.index = i;
                            data.size = dataToSend.parts.length;
                            let send = {};
                            send.data = data;
                            send.tokens = [tok];
                            this.DH.sendPushMessage(send,
                                /**
                                 * success
                                 */
                                function () {
                                    object.removeQueue(path, tok, id);
                                },
                                /**
                                 * fail
                                 * @param error
                                 */
                                function (error) {
                                    // logger.error(error);
                                }, connection);
                        }
                    } else {
                        /**
                         * no parts, ACTION_NO_UPDATE
                         */
                        let data = {};
                        data.id = referenceId;
                        data.tag = tag;
                        data.action = ACTION_NO_UPDATE;
                        let send = {};
                        send.data = data;
                        send.tokens = [tok];
                        this.DH.sendPushMessage(send,
                            /**
                             * success
                             */
                            function () {
                                object.removeQueue(path, tok, id);
                            },
                            /**
                             * fail
                             * @param error
                             */
                            function (error) {
                                // logger.error(error);
                            }, connection);
                    }


                    // TODO send push message and wait for confirmation to remove
                }
            }

            await this.pathReference.syncToDatabase(redis);
            action.success();
        } else {
            logger.error("no tokens found for path: " + path);
        }

    };

    /**
     * Removes a token from paths database
     * @param token
     */
    this.removeToken = async function (token) {
        await this.pathReference.syncFromDatabase(redis);

        let paths = Object.keys(this.pathReference.ref);
        for (let i in paths) {
            let tokens = Object.keys(this.pathReference.ref[paths[i]].tokens);
            for (let p in tokens) {
                if (tokens[p] === token) {
                    delete this.pathReference.ref[paths[i]].tokens[tokens[p]];
                }
            }
        }

        await this.pathReference.syncToDatabase(redis)
    };

    /**
     * Removes a queue (id) in a specific token listening the given path
     * @param path
     * @param token
     * @param id
     */
    this.removeQueue = async function (path, token, id) {
        await this.pathReference.syncFromDatabase(redis);
        logger.info("removing queue of " + token);

        if (this.pathReference.ref[path].tokens !== undefined && this.pathReference.ref[path].tokens[token] !== undefined && this.pathReference.ref[path].tokens[token].queue !== undefined && this.pathReference.ref[path].tokens[token].queue[id] !== undefined) {
            delete this.pathReference.ref[path].tokens[token].queue[id];
            await this.pathReference.syncToDatabase(redis)
        }
    };


}

module.exports = Reference;