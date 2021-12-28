## data.js

a little javascript lib to load and transform data.
This library provides methods for operating on two dimensional tables.

Reads open formats like csv and json from an URL, or import existent json objects into the Data Object .
The Data object provides several methods like select or pivot to explore and handle the table data.

To see a **demo** click [here](https://gjrichter.github.io/data.js/demo/html/) .

### usage sample

```javascript
var szUrl = "https://raw.githubusercontent.com/emergenzeHack/terremotocentro/master/data/issues.csv";
var myfeed = Data.feed({"source":szUrl,"type":"csv"}).load(function(mydata){

    // get all values of column 'id' into one array
    var dataA = mydata.column("id").values(); 
    
    // get a new table with rows selected by the value of the column 'labels'
    var newTable = mydata.select("WHERE labels like Facebook"); 
    
    ...   
};
```

### dependencies

- jquery
- papaparse CSV parser [GitHub](https://github.com/mholt/PapaParse)

the demo depends also on:

- Bootstrap V3
- css from Flat Admin V.2 - Free Bootstrap Admin Templates


