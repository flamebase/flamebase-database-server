# Benchmarks -> Turbine vs GraphQL

Results of 3 common actions on Turbine and GraphQL with a JSON database.

`get` actions looks for an object on the given path.
```bash
/users/userA
```

`set` actions updates an object on the given path passing another object.
```bash
/users/userA

{
    name: "Mark",
    age 30
}
```
`query` actions looks for an object on the given path for the conditions passed:
```bash
/users/*

{
    name: "Mark"
}
```
It will return all users named "Mark".

## Environtment
<img width="30%" vspace="20" src="https://github.com/rotorlab/server-node/raw/develop/images/MacBookPro_.png">

Map with 100.000 entries and 90.000 different values (aprox):

|Action  |GrapqhQL  |Turbine| Times |
|---|---|---|---|
| GET  | 37.6 s. | 2.7 s. | x1000
| POST  | 2.5 s. | 2.1 s. | x1000
| QUERY  | 46.9 s. | 2.1 s. | x1000

|Action  |GrapqhQL  |Turbine| Times |
|---|---|---|---|
| GET  | 652.8 s. | 80.8 s. | x10000
| POST  | 52.6 s. | 54.4 s. | x10000
| QUERY  | 416 s. | 36.4 s. | x10000

## Run tests
Run this test on your PC by cloning this repo and running on `/benchmark` folder:
```bash
node --stack_size=1200 turbine.js
node turbine_puncher.js
```
```bash
node graphql.js
node graphql_puncher.js
```