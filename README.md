# flamebase-database-server
Main server to hold a realtime database

Create a server cluster to hold all realtime changes.

```javascript
var FlamebaseDatabaseCluster = require('flamebase-database-server-cluster');

var FSC = new FlamebaseDatabaseCluster("draco", 1507);
FSC.initCluster({
    start: function () {
        console.log("start!!")
    }
}, null);
```

#### Response errors
Common errors on server cluster connection

-------
Empty request body:
```json
{
    "status": "KO",
    "data": null,
    "error": "missing_params"
}
```
-------