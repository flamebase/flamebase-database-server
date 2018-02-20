[ ![flamebase/flamebase-database-server-cluster](https://d25lcipzij17d.cloudfront.net/badge.svg?id=js&type=6&v=1.3.1&x2=0)](https://www.npmjs.com/package/flamebase-database-server-cluster)

# :fire: flamebase-database-server-cluster
Server cluster to hold a realtime JSON database.

### What is this?
Flamebase is an open source project that tries to emulate Firebase Database features as much as possible. I like Firebase but it's expensive for what it currently offers.
If you are doing an altruist project with Firebase, pray not to became successful, because the monthly amount will increase considerably.

In this repo you can find the proper package for run a server cluster with node framework.
For now it still developing, so please be patient with errors.

### Setup

Prepare Redis server

OSX:
```bash
// install
brew install redis
 
// run
redis-server
 
// logs
redis-cli monitor
 
// test channels (sub/pub)
redis-cli PUBLISH d7bec76d-d4e1-4788-816f-f7260cd4a92c holi
```
Ubuntu:
```bash 
// install
sudo apt-get install redis-server
 
// run

sudo service redis-server status
```

Install Flamebase:
```bash
npm install flamebase-database-server-cluster --save
```

Create a server cluster to hold all realtime changes.

```javascript
var FlamebaseDatabaseCluster = require('flamebase-database-server-cluster');

var serverKey = 'AIzafvwsdfmvsdfv-fdvwsdfgweFGfdAsfwefgw-z1JI';

/**
* - database name
* - clusters port
* - server key for push messages (fcm)
* - debug logs
*/
var FDC = new FlamebaseDatabaseCluster("myDatabase", 1507, serverKey, true);
FDC.initCluster({
    start: function () {
        console.log("start!!")
    }
});
```
Alternatively you can start the server cluster by cloning this repo and launch on terminal:
```bash
node launcher.js 
```
Console Output:
```bash
start!!
[2017-07-02 21:05:48.337] [INFO] SERVER CLUSTER - Master 40001 is running
[2017-07-02 21:05:48.836] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 2 worker
[2017-07-02 21:05:48.836] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 5 worker
[2017-07-02 21:05:48.837] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 3 worker
[2017-07-02 21:05:48.836] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 1 worker
[2017-07-02 21:05:48.839] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 4 worker
[2017-07-02 21:05:48.838] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 7 worker
[2017-07-02 21:05:48.839] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 8 worker
[2017-07-02 21:05:48.839] [INFO] SERVER CLUSTER - server cluster started on port 1507 on 6 worker
```

### Libraries and packages
Client options to connect with server cluster.

- [Android](https://github.com/flamebase/flamebase-database-android)
```groovy
compile 'com.flamebase:database:1.3.0'
```

