## data.js

A little javascript lib to load and handle data table

Read open formats like csv and json from an url and calls a user defined function on success with a table object.

The table object has several methods to explore and manipulate the data.

To see a demo click [here](https://gjrichter.github.io/data.js/demo/html/) .

### usage

```
var szUrl = "https://raw.githubusercontent.com/emergenzeHack/terremotocentro/master/data/issues.csv";
var myfeed = Data.feed("Segnalazioni",{"source":szUrl,"type":"csv"}).load(function(mydata){

    _... your code to use mydata ..._ 
    
};
```

