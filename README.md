## data.js

a little javascript lib to load and handle data tables

Reads open formats like csv and json from an URL and calls a user defined function on success with a table object.
This table object provides several methods to explore and manipulate the data.

To see a **demo** click [here](https://gjrichter.github.io/data.js/demo/html/) .

### usage sample

`
var szUrl = "https://raw.githubusercontent.com/emergenzeHack/terremotocentro/master/data/issues.csv";
var myfeed = Data.feed("Segnalazioni",{"source":szUrl,"type":"csv"}).load(function(mydata){

    // get all values of column 'id' into one array
    var dataA = mydata.column("id"); 
    
    // get a new table with rows selected by the value of the column 'labels'
    var newTable = mydata.select("WHERE labels like Facebook"); 
    var numberOfRows = newTable.table.records;
    
    ...   
};
`
### dependencies

- jquery
- papaparse CSV parser [GitHub](https://github.com/mholt/PapaParse)

the demo depends also on:

- Bootstrap V3
- css from Flat Admin V.2 - Free Bootstrap Admin Templates


