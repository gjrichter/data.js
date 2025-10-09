/**********************************************************************
data.js

$Comment: provides JavaScript for loading, parsing, selection, transforming and caching data tables
$Source :data.js,v $

$InitialAuthor: guenter richter $
$InitialDate: 2016/26/09 $
$Author: guenter richter $
$Id:data.js 1 2016-26-09 10:30:35Z Guenter Richter $

Copyright (c) Guenter Richter
$Log:data.js,v $
**********************************************************************/

/** 
 * @fileoverview
 * provides an object and methods to load, parse and process various data sources.<br>
 * The <b>sources</b> may be of the following type: <b>csv</b>, <b>json</b>, <b>geojson</b>, <b>kml</b>, <b>gml</b>, <b>rss</b>, and <b>parquet</b> (using DuckDB WASM).<br>
 * The <b>methods</b> to load data are: 
 * <ul><li>Data.<b>feed()</b> to load from url</li>
 * <li>Data.<b>import()</b> to import javascript objects and</li>
 * <li>Data.<b>broker()</b> to load more than one source</li></ul>
 * The loaded data is stored in a Table object which gives the user the methods to transform the data.<br>
 * The format of the data of a Table object is jsonDB, the same format used internaly by iXmaps.
 * @example 
 *
 *  // define data source
 *  var szUrl = "https://raw.githubusercontent.com/emergenzeHack/terremotocentro/master/_data/issues.csv";
 *
 *  // load data from feed
 *  var myfeed = Data.feed({"source":szUrl,"type":"csv"}).load(function(mydata){
 *
 *      // on data load succeeds, process the loaded data via mydata object
 *      // create new columns 'date' and 'hour' from one timestamp column
 *      // we need them to create pivot tables 
 *      // ---------------------------------------------------------------
 *      mydata.addColumn({'source':'created_at','destination':'date'},function(value){
 *          var d = new Date(__normalizeTime(value));
 *          return( String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear()) );
 *      });
 *
 *      // get the hours
 *      // -----------------------------------------
 *      var hoursA = mydata.column("hour").values();
 *
 *      // do something ... 
 *
 *      // make a pivot table from the values in column 'state'
 *      // ----------------------------------------------------
 *      var pivot = mydata.pivot({ "lead":	'date',
 *                                 "keep":  ['created_at'],	
 *                                 "cols":	'state' 
 *                               });
 *
 *      // invert data table (let the last record be the first)
 *      // ----------------------------------------------
 *      pivot = pivot.revert();
 *
 *      // make chart with 2 curves, total and closed issues
 *      // -------------------------------------------------
 *      var set1  = pivot.column("Total").values();
 *      var set2  = pivot.column("closed").values();
 *
 *     ....
 * }).error(function(e){
 *      alert("Data.feed error: " + e);
 * });
 *
 * @author Guenter Richter guenter.richter@medienobjekte.de
 * @version 1.55 
 * @copyright CC BY SA
 * @license MIT
 */

(function (window, document, undefined) {


    // write to console with time in sec : millisec
    //
    const _log_start_time = new Date();
    _LOG = function (szLog) {
        var time = ((new Date()) - _log_start_time) / 1000;
        console.log("_LOG: time[sec.ms] " + time + "\n" + szLog);
    };

    // force string arrays 

    /**
     * test if object is array 
     * @param obj the object to test
     * @returns true/false
     * @type {boolean}
     */
    const __isArray = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    };
    /**
     * make sure, object is type array 
     * @param obj the object to transform
     * @returns array
     * @type {Array}
     */
    const __toArray = function (obj) {
        if (!obj || typeof (obj) == 'undefined') {
            return [];
        } else
        if (__isArray(obj)) {
            return obj;
        } else {
            return (String(obj).match(/\|/)) ? String(obj).split('|') : String(obj).split(',');
        }
    };

    /**
     * get array with unique values
     * by filter function 
     * @returns array
     * @type {Array}
     */
    const __onlyUnique = function (value, index, self) {
        return self.indexOf(value) === index;
    };

    /** 
     * @namespace 
     */

    var Data = {
        version: "1.55",
        errors: []
    };

    function expose() {
        const oldData = window.Data;

        Data.noConflict = function () {
            window.Data = oldData;
            return this;
        };

        window.Data = Data;
    }

    // define Data for Node module pattern loaders, including Browserify
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = Data;

        // define Data as an AMD module
    } else if (typeof define === 'function' && define.amd) {
        define(Data);
    }

    // define Data as a global variable, saving the original Data to restore later if needed
    if (typeof window !== 'undefined') {
        expose();
    }

    /**
     * Create a new Data.Object instance.  
     * @class It realizes an object to load and handle internal (already defined as JavaScript object) data sources (CSV,JSON,...)
     * @constructor
     * @param {Object} options <p>{ <b>source</b>: <em>JavaScript object</em>,
     *								   <table border='0' style='border-left: 1px solid #ddd;'>	
     *								   <tr><th>type</th><th>description</th></tr>
     *								   <tr><td><b>"csv"</b></td><td>the source is 'plain text' formatted as Comma Separated Values<br>delimiter supported: , and ;</td></tr>
     *								   <tr><td><b>"json"</b></td><td>the source is JSON (Javascript Object Notation)</td></tr>
     *								   <tr><td><b>"geojson"</b></td><td>the source is a JSON object formatted in <a href="https://geojson.org/" target="_blank">GeoJson</a></td></tr>
     *								   <tr><td><b>"parquet"</b></td><td>the source is a Parquet or GeoParquet file (using DuckDB WASM, converted to GeoJSON)</td></tr>
     *								   <tr><td><b>"rss"</b></td><td>the source is an xml rss feed</td></tr>
     *								   <tr><td><b>"kml"</b></td><td>the source is in Keyhole Markup Language</td></tr>
     *								   <tr><td><b>"gml"</b></td><td>the source is in Geography Markup Language</td></tr>
     *								   </table> 
     * @type {Data.Object}
     * @example
     * // load the data table defined by a JSON object named response and get the values of one column 
     *
     * Data.object({"source":response,"type":"json"}).import(function(mydata){
     *     var a = mydata.column("column name").values();
     *     ...
     * });
     * @returns A new Data.Import object
     */

    Data.Object = function (options) {
        this.options = options;
        this.debug = false;
    };

    Data.Object.prototype = {

        /**
         * set data from the specified source and call user function
         * @param {function} function(result) the function to call when data is successfully imported<br>
         * the argument passed is a Data.Table object with the imported data 
         * @type {Data.Object}
         * @returns itself 
         */
        import: function (callback) {

            this.options.success = this.options.success || callback;

            // we create a dummy Data.feed to use its parser
            this.feed = Data.feed({});

            // pass options to the Data.feed
            this.feed.options = this.options;

            // import data and create table, calls the callback when done
            if ((this.options.type == "csv") || (this.options.type == "CSV")) {
                this.feed.__processCSVData(this.options.source, this.options);
            } else
            if ((this.options.type == "rss") || (this.options.type == "RSS")) {
                this.options.format = "xml";
                this.feed.__processRSSData(this.options.source, this.options);
            } else
            if ((this.options.type == "kml") || (this.options.type == "KML")) {
                this.options.format = "xml";
                this.feed.__processKMLData(this.options.source, this.options);
            } else
            if ((this.options.type == "gml") || (this.options.type == "GML")) {
                this.options.format = "xml";
                this.feed.__processGMLData(this.options.source, this.options);
            } else
            if ((this.options.type == "json") || (this.options.type == "JSON") || (this.options.type == "Json")) {
                this.feed.__processJsonData(this.options.source, this.options);
            } else
            if ((this.options.type == "geojson") || (this.options.type == "GEOJSON") || (this.options.type == "GeoJson")) {
                this.feed.__processGeoJsonData(this.options.source, this.options);
            } else
            if ((this.options.type == "topojson") || (this.options.type == "TOPOJSON") || (this.options.type == "TopoJson")) {
                this.feed.__processTopoJsonData(this.options.source, this.options);
            } else
            if ((this.options.type == "jsonDB") || (this.options.type == "JSONDB") || (this.options.type == "JsonDB") ||
                (this.options.type == "jsondb")) {
                this.feed.__processJsonDBData(this.options.source, this.options);
            } else
            if ((this.options.type == "parquet") || (this.options.type == "PARQUET")) {
                // Check if source is already an ArrayBuffer (from File API)
                if (this.options.source instanceof ArrayBuffer) {
                    _LOG("Processing parquet ArrayBuffer directly: " + this.options.source.byteLength + " bytes");
                    this.feed.__processParquetData(this.options.source, this.options);
                }
            } else
            if ((this.options.type == "geoparquet") || (this.options.type == "GEOPARQUET")) {
                // Check if source is already an ArrayBuffer (from File API)
                if (this.options.source instanceof ArrayBuffer) {
                    _LOG("Processing geoparquet ArrayBuffer directly: " + this.options.source.byteLength + " bytes");
                    this.feed.__processGeoParquetData(this.options.source, this.options);
                }
            }
            return this;
        },
        /**
         * error function
         * define a function to handle a loading error
         * @param {function} function(errorText) a user defined function to call when an error occurs
         * @type {Data.Object}
         * @returns itself  
         */
        error: function (callback) {
            this.options.error = callback;
            return this;
        }
    };

    /**
     * Create a new Data.Import instance.  
     * @class It realizes an object to load and handle internal (already defined as JavaScript object) data sources (CSV,JSON,...)
     * @constructor
     * @param {Object} options <p>{ <b>source</b>: <em>JavaScript object</em>,
     *								   <table border='0' style='border-left: 1px solid #ddd;'>	
     *								   <tr><th>type</th><th>description</th></tr>
     *								   <tr><td><b>"csv"</b></td><td>the source is 'plain text' formatted as Comma Separated Values<br>delimiter supported: , and ;</td></tr>
     *								   <tr><td><b>"json"</b></td><td>the source is JSON (Javascript Object Notation)</td></tr>
     *								   <tr><td><b>"geojson"</b></td><td>the source is a JSON object formatted in <a href="https://geojson.org/" target="_blank">GeoJson</a></td></tr>
     *								   <tr><td><b>"parquet"</b></td><td>the source is a Parquet o GeoParquet file (using DuckDB WASM, converted to GeoJSON)</td></tr>
     *								   <tr><td><b>"topojson"</b></td><td>the source is a JSON object formatted in <a href="https://github.com/topojson/topojson" target="_blank">TopoJson</a></td></tr>
     *								   <tr><td><b>"jsonDB"</b></td><td>the source is a jsonDB table object</td></tr>
     *								   <tr><td><b>"rss"</b></td><td>the source is an xml rss feed</td></tr>
     *								   </table> 
     * @type {Data.Object}
     * @example
     * // load the data table defined by a JSON object named response and get the values of one column 
     *
     * table = Data.import({"source":response,"type":"json"});
     *
     * var a = table.column("column name").values();
     * @returns A new Table object
     */

    Data.Import = function (options) {
        this.options = options;
        this.debug = false;
    };

    /**
     * Create a new Data.Feed instance.  
     * @class It realizes an object to load and handle one data sources
     * @constructor
     * @param {Object} options <p>{ <b>source</b>: <em>url or filename</em>,
     *                                <b>type</b>: <em>see table below</em> }</p>
     *								   <table border='0' style='border-left: 1px solid #ddd;'>	
     *								   <tr><th>type</th><th>description</th></tr>
     *								   <tr><td><b>"csv"</b></td><td>the source is 'plain text' formatted as Comma Separated Values<br>delimiter supported: , and ;</td></tr>
     *								   <tr><td><b>"json"</b></td><td>the source is JSON (Javascript Object Notation)</td></tr>
     *								   <tr><td><b>"geojson"</b></td><td>the source is a JSON object formatted in <a href="https://geojson.org/" target="_blank">GeoJson</a></td></tr>
     *								   <tr><td><b>"geoparquet"</b></td><td>the source is a GeoParquet file (using DuckDB WASM, converted to GeoJSON)</td></tr>
     *								   <tr><td><b>"parquet"</b></td><td>the source is a Parquet file (using DuckDB WASM)</td></tr>
     *								   <tr><td><b>"JSON-stat"</b></td><td>the source is a JSON object formatted in <a href="https://json-stat.org/JSON-stat" target="_blank">JSON-stat</a></td></tr>
     *								   <tr><td><b>"jsonDB"</b></td><td>the source is in ixmaps internal data table format</td></tr>
     *								   <tr><td><b>"rss"</b></td><td>the source is an xml rss feed</td></tr>
     *								   </table> 
     * @type {Data.Feed}
     * @returns a new Data.Feed object
     * @example
     * var szUrl = "https://raw.githubusercontent.com/emergenzeHack/terremotocentro/master/_data/issues.csv";
     * var myfeed = new Data.Feed("Segnalazioni",{"source":szUrl,"type":"csv"}).load(function(mydata){
     *	
     *    // when the feed is loaded, it calls the function you defined
     *    // with the loaded data as argument; it is a Table object, so you can use its methods
     *    // example: create new columns 'date' and 'hour' from one timestamp column
     *    // ---------------------------------------------------------------
     *    mydata = mydata.addColumn({'source':'created_at','destination':'date'},
     *        function(value){
     *            var d = new Date(__normalizeTime(value));
     *            return( String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear()) );
     *     });
     *  });
     *
     *  // Note: instead of new Data.Feed() you can also use the factory function Data.feed()
     *  var myfeed = Data.feed("Segnalazioni",{"source":szUrl,"type":"csv"}).load(function(mydata){
     *  ...
     *     
     */

    Data.Feed = function (options) {
        this.options = options || {};
        this.debug = false;
        this.options.error = function (e) {
            Data.errors.push(e);
        };
    };

    Data.Feed.prototype = {

        /**
         * load the data from the source specified in the Data.Feed instance and call a user defined callback function on success
         * @param {function} function(data) the function to call when data is successfully loaded<br> it receives a {Data.Table} object with the loaded data
         * @type {Object}
         * @returns the {@link Data.Feed} object
         * @example
         * var szUrl = "https://raw.githubusercontent.com/emergenzeHack/terremotocentro/master/_data/issues.csv";
         * var myfeed = Data.feed({"source":szUrl,"type":"csv"}).load(function(mydata){
         *	...
         *  });
         */
        load: function (callback) {

            this.options.success = callback;

            const option = this.options;
            const szUrl = option.source || option.src || option.url || option.ext;

            if (typeof (option.cache) === 'undefined') {
                option.cache = true;
                if (option.options && typeof (option.options.cache) !== 'undefined') {
                    option.cache = option.options.cache;
                }
            }

            const __this = this;

            if (!szUrl) {
                _alert("Data.feed(...).load(): no source defined !", 2000);
            }

            if ((option.type == "csv") || (option.type == "CSV")) {
                this.__doCSVImport(szUrl, option);
            } else
            if ((option.type == "rss") || (option.type == "RSS")) {
                this.__doRSSImport(szUrl, option);
            } else
            if ((option.type == "kml") || (option.type == "KML")) {
                this.__doKMLImport(szUrl, option);
            } else
            if ((option.type == "gml") || (option.type == "GML")) {
                this.__doGMLImport(szUrl, option);
            } else
            if ((option.type == "json") || (option.type == "JSON") || (option.type == "Json")) {
                this.__doJSONImport(szUrl, option);
            } else
            if ((option.type == "geojson") || (option.type == "GEOJSON") || (option.type == "GeoJson")) {
                this.__doGeoJSONImport(szUrl, option);
            } else
            if ((option.type == "topojson") || (option.type == "TOPOJSON") || (option.type == "TopoJson")) {
                this.__doTopoJSONImport(szUrl, option);
            } else
            if ((option.type == "jsonDB") || (option.type == "JSONDB") || (option.type == "JsonDB") || (option.type == "jsondb")) {
                this.__doJsonDBImport(szUrl, option);
            } else
            if ((option.type == "jsonstat") || (option.type == "jsonStat") || (option.type == "JSONSTAT")) {
                $.getScript("http://json-stat.org/lib/json-stat.js")
                    .done(function (script, textStatus) {
                        __this.__doLoadJSONstat(szUrl, option);
                        return;
                    })
                    .fail(function (jqxhr, settings, exception) {
                        _alert("'" + option.type + "' unknown format !");
                    });
            } else
            if ((option.type == "parquet") || (option.type == "PARQUET")) {
                this.__doParquetImport(szUrl, option);
            } else {
                _alert("'" + option.type + "' unknown format !");
            }
            return this;
        },
        /**
         * define a function to handle a loading error
         * @param {function} function(errorText) a user defined function to call when an error occurs
         * @type {Object}
         * @returns the {@link Data.Feed} object
         * @example
         * var myfeed = Data.feed("Segnalazioni",{"source":szUrl,"type":"csv"})
         *
         *              .error(function(e){alert(e);})
         *
         *              .load(function(mydata){
         *	               ...
         *              });
         */
        error: function (callback) {
            this.options.error = callback;
            return this;
        }
    };


    // @section

    // @factory Data.feed(options: Data options)
    // Instantiates a data object to load external data via URL
    // and an object literal with `data options`.
    //

    Data.feed = function (options) {
        return new Data.Feed(options);
    };

    // @factory Data.object(options: Data options)
    // Instantiates a data object
    // and an object literal with `data options`.
    //

    Data.object = function (options) {
        return new Data.Object(options);
    };

    // @factory Data.import(options: Data options)
    // Instantiates a data object to import data into Data
    // and an object literal with `data options`.
    //

    Data.import = function (options) {
        return new Data.Object(options).import().feed.dbtable;
    };


    var ixmaps = ixmaps || {};

    // -----------------------------
    // D A T A    L O A D E R 
    // -----------------------------

    // ---------------------------------
    // J S O N s t a t  
    // ---------------------------------
    /**
     * doLoadJSONstat 
     * reads JSONstat format using JSONstat Javascript
     * parses the data into the map data source
     * @param szUrl JSONstat URL
     * @param opt options
     * @type void
     */
    Data.Feed.prototype.__doLoadJSONstat = function (szUrl, opt) {

        const __this = this;

        JSONstat(szUrl,
            function () {

                const dataA = [];

                // for now we take dimension 0 and 1
                // 0 for the y axis = first column
                // 1 for the x axis = values columns

                // first row = column names
                //
                let row = [this.Dataset(0).Dimension(0).label];
                const index = this.Dataset(0).Dimension(1).id;
                for (let i = 0; i < index.length; i++) {
                    row.push(this.Dataset(0).Dimension(1).Category(index[i]).label);
                }
                dataA.push(row);

                // data rows
                //
                for (let i = 0; i < this.Dataset(0).Dimension(0).length; i++) {
                    row = [];
                    row.push(this.Dataset(0).Dimension(0).Category(this.Dataset(0).Dimension(0).id[i]).label);
                    for (let ii = 0; ii < this.Dataset(0).Dimension(1).length; ii++) {
                        row.push(this.Dataset(0).Data([i, ii]).value);
                    }
                    dataA.push(row);
                }

                // user defined callback
                if (opt.callback) {
                    opt.callback(dataA, opt);
                    return;
                }

                // finish the data table object 
                __this.__createDataTableObject(dataA, opt.type, opt);

            });
    };

    // ---------------------------------
    // J s o n D B 
    // ---------------------------------

    /**
     * doJsonDBImport 
     * reads JsonDB files from URL
     * JsonDB files are regural JavaScript files, the data object is parsed automatically on load 
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__doJsonDBImport = function (szUrl, opt) {

        _LOG("__doJsonDBImport: " + szUrl);
        const __this = this;

        opt.url = szUrl;

        $.getScript(szUrl + ".gz")
            .done(function (script, textStatus) {
                __this.__processJsonDBData(script, opt);
            })
            .fail(function (jqxhr, settings, exception) {
                $.getScript(szUrl)
                    .done(function (script, textStatus) {
                        __this.__processJsonDBData(script, opt);
                    })
                    .fail(function (jqxhr, settings, exception) {
                        if (__this.options.error) {
                            __this.options.error("\"" + szUrl + "\" " + exception);
                        }
                    });
            });
    };

    Data.Feed.prototype.__processJsonDBData = function (script, opt) {

        _LOG("__processJsonDBData:");

        // create data object
        // ------------------
        this.dbtable = new Data.Table();
        let loadedTable = null;
        if (typeof (script) == "string") {
            const name = opt.source.split(/\//).pop().split(/\./)[0];
            loadedTable = (typeof window !== "undefined" ? window[name] : global[name]);
        } else {
            loadedTable = opt.source;
        }

        this.dbtable.table = loadedTable.table;
        this.dbtable.fields = loadedTable.fields;
        this.dbtable.records = loadedTable.records;

        // user defined callback ??
        if (opt.callback) {
            opt.callback(newData, opt);
            return;
        }

        // deploy the object into the map
        // ------------------------------
        if ((typeof (opt) != "undefined") && opt.success) {
            opt.success(this.dbtable);
        }
    };


    // ---------------------------------
    // C S V 
    // ---------------------------------

    /**
     * __doCSVImport 
     * reads CSV files from URL
     * parses the data into the map data source
     * @param szUrl csv file url
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__doCSVImport = function (szUrl, opt) {

        _LOG("__doCSVImport: " + szUrl);
        const __this = this;
        $.ajax({
            type: "GET",
            url: szUrl,
            cache: opt.cache,
            dataType: "text",
            success: function (data) {
                __this.__processCSVData(data, opt);
            },
            error: function (jqxhr, settings, exception) {
                if ((typeof (opt) != "undefined") && opt.error) {
                    opt.error("\"" + szUrl + "\" " + exception);
                }
            }
        });
    };

    /**
     * __processCSVData
     * Parses the loaded CSV text data and creates a data object.
     *
     * @param {string} csv - The CSV text string.
     * @param {Object} opt - Optional options.
     * @param {function} [opt.callback] - A callback function to receive the raw parsed data.
     * @param {Object} [opt.parser] - Papa Parse options.
     * @param {function} [opt.error] - A callback function to handle parsing errors.
     * @param {Object} [opt.options] - Additional options (e.g., name).
     * @param {string} [opt.type] - The data type (e.g., "csv").
     * @returns {boolean} - Returns false if there's an error or a callback is defined.
     */
    Data.Feed.prototype.__processCSVData = function (csv, opt) {
        _LOG("__processCSVData - start");

        // Check if Papa Parse is loaded. If not, load it and retry.
        if (typeof Papa === "undefined") {
            _LOG("__processCSVData:load csv parser!");
            const __this = this;
            $.getScript("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/4.1.2/papaparse.min.js")
                .done(function (script, textStatus) {
                    __this.__processCSVData(csv, opt);
                })
                .fail(function (jqxhr, settings, exception) {
                    _alert("'" + opt.type + "' parser not loaded !");
                    if (opt.error) {
                        opt.error("'" + opt.type + "' parser not loaded !");
                    }
                });
            return false; // Indicates that the function is waiting for the parser to load.
        }

        // Parse the CSV data.
        let parsedData = Papa.parse(csv, opt.parser);
        
        if (parsedData.errors.length){
            _alert("csv parsing error: " + parsedData.errors.map(e=>e.message).join(';'));
            if (opt.error) {
                opt.error("csv parsing error: " + parsedData.errors.map(e=>e.message).join(';'));
            }
            return false;
        }
        let newData = parsedData.data;

        // Check if the parsing resulted in at least two rows.
        if (newData.length < 2 || typeof newData[0] === "undefined" || typeof newData[1] === "undefined") {
            _alert("csv parsing error: insufficient rows in data !");
            if (opt.error) {
                opt.error("csv parsing error: insufficient rows in data !");
            }
            return false;
        }
       
        // Check if delimiter was not set.
        if (!opt.parser || !opt.parser.delimiter) {
             // Check if autodetect delimiter failed.
            if (newData[0].length !== newData[1].length) {
                _LOG("csv parser: autodetect failed");
                const delimiters = [";", ","];
                let success = false;
                for (const delimiter of delimiters) {
                    _LOG(`csv parser: delimiter = ${delimiter}`);
                    newData = Papa.parse(csv, { delimiter }).data;
                    if (newData[0].length === newData[1].length) {
                        success = true;
                        break;
                    }
                    _LOG(`csv parser: delimiter = ${delimiter} failed`);
                }
                if (!success) {
                    _alert("csv parsing error: unable to auto detect delimiter!");
                    if (opt.error) {
                        opt.error("csv parsing error: unable to auto detect delimiter!");
                    }
                    return false;
                }
            }
        }

        // Clean up trailing empty rows and columns.
        if (newData[newData.length - 1].length !== newData[0].length && newData.length > 1) {
            newData.pop();
        }

        // Clean up extra empty columns
        if (newData[0].length - newData[1].length === 1) {
            if (newData[0][newData[0].length - 1].trim() === "") {
                newData[0].pop();
            }
        }

        // User-defined callback with raw data.
        if (opt.callback) {
            opt.callback(newData, opt);
            return false;
        }

        _LOG("__createDataTableObject: " + (opt.options ? " -> " + opt.options.name : ""));
        // Finish and create the data table object.
        this.__createDataTableObject(newData, opt.type, opt);

        return false;
    };

    // ---------------------------------
    // R S S
    // ---------------------------------

    /**
     * __doRSSImport 
     * reads RSS feed from URL
     * parses the data into a table
     * @param szUrl rss feed url
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__doRSSImport = function (szUrl, opt) {

        _LOG("__doRSSImport: " + szUrl);
        const __this = this;

        opt.format = "xml";

        $.ajax({
            type: "GET",
            url: szUrl,
            dataType: "xml",
            success: function (data) {
                __this.__processRSSData(data, opt);
            },
            error: function (jqxhr, settings, exception) {
                if ((typeof (opt) != "undefined") && opt.error) {
                    opt.error(jqxhr, settings, exception);
                }
            }
        });

    };

    /**
     * __processRSSData 
     * parse the loaded RSS xml data and create data object
     * @param the rss object
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__processRSSData = function (data, opt) {

        if (opt.format == "xml") {

            if ($(data).find('rss').length) {
                this.__parseRSSData(data, opt);
            } else
            if ($(data).find('feed').length) {
                _alert("feed not yet supported");
            } else
            if ($(data).find('atom').length) {
                _alert("atom not yet supported");
            }
        }
    };

    /**
     * __parseRSSData 
     * parse the loaded RSS xml data and create data object
     * @param the rss object
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__parseRSSData = function (data, opt) {

        const __this = this;

        if (opt.format == "xml") {

            $(data).find('channel').each(function () {

                const dataA = [];
                let childNamesA = null;

                $(data).find('item').each(function () {

                    // get item fieldnames from the first item of the channel
                    // ------------------------------------------------------
                    if (!childNamesA) {
                        const check = [];
                        childNamesA = [];
                        const childs = $(this).children();
                        for (let i = 0; i < childs.length; i++) {
                            let szNode = $(this).children()[i].nodeName;
                            while (check[szNode]) {
                                szNode += "*";
                            }
                            check[szNode] = szNode;
                            childNamesA[i] = szNode;
                        }

                        dataA.push(childNamesA);
                    }

                    // make one item values
                    const row = [];
                    for (let i = 0; i < childNamesA.length; i++) {
                        if (childNamesA[i] == "enclosure") {
                            row.push(($(this).find(childNamesA[i] + ':first').attr("url")) || "");
                        } else {
                            row.push(($(this).find(childNamesA[i] + ':first').text()) || "");
                        }
                    }
                    dataA.push(row);
                });

                __this.__createDataTableObject(dataA, "rss", opt);

            });
        }
    };

    // ---------------------------------
    // K M L
    // ---------------------------------

    /**
     * __doKMLImport 
     * reads KML feed from URL
     * parses the data into a table
     * @param szUrl kml feed url
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__doKMLImport = function (szUrl, opt) {

        _LOG("__doKMLImport: " + szUrl);
        const __this = this;

        opt.format = "xml";

        $.ajax({
            type: "GET",
            url: szUrl,
            dataType: "xml",
            success: function (data) {
                __this.__processKMLData(data, opt);
            },
            error: function (jqxhr, settings, exception) {
                if ((typeof (opt) != "undefined") && opt.error) {
                    opt.error(jqxhr, settings, exception);
                }
            }
        });

    };

    /**
     * __doGMLImport 
     * reads GML feed from URL
     * parses the data into a table
     * @param szUrl gml feed url
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__doGMLImport = function (szUrl, opt) {

        _LOG("__doGMLImport: " + szUrl);
        const __this = this;

        opt.format = "xml";

        $.ajax({
            type: "GET",
            url: szUrl,
            dataType: "xml",
            success: function (data) {
                __this.__processGMLData(data, opt);
            },
            error: function (jqxhr, settings, exception) {
                if ((typeof (opt) != "undefined") && opt.error) {
                    opt.error(jqxhr, settings, exception);
                }
            }
        });

    };

    /**
     * __processKMLData 
     * parse the loaded KML xml data and create data object
     * @param the kml object
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__processKMLData = function (data, opt) {

        if (opt.format == "xml") {

            if ($(data).find('kml').length) {
                this.__parseKMLData(data, opt);
            } else {
                _alert("feed not kml");
            }
        }
    };

    /**
     * __parseRSSData 
     * parse the loaded RSS xml data and create data object
     * @param the rss object
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__parseKMLData = function (data, opt) {

        const __this = this;

        if (opt.format == "xml") {

            const document = $(data).find('Document');

            const dataA = [];
            let childNamesA = null;

            document.find('Placemark').each(function () {

                const xdata = $(this).find('ExtendedData') || $(this);

                // get item fieldnames from the first item of the channel
                // ------------------------------------------------------
                if (!childNamesA) {
                    childNamesA = [];
                    xdata.find('Data').each(function () {
                        childNamesA.push($(this).attr("name"));
                    });
                    if ($(this).find('Point').find('coordinates')) {
                        childNamesA.push('KML.Point');
                    }
                    dataA.push(childNamesA);
                }

                // make one item values
                const row = [];
                xdata.find('Data').each(function () {
                    row.push($(this).find("value").text());
                });
                if ($(this).find('Point').find('coordinates')) {
                    row.push($(this).find('Point').find('coordinates').text());
                }
                dataA.push(row);

            });

            __this.__createDataTableObject(dataA, "kml", opt);

        }
    };

    /**
     * __processGMLData 
     * parse the loaded GML xml data and create data object
     * @param the gml object
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__processGMLData = function (data, opt) {

        if (opt.format == "xml") {

            if ( typeof(data) === "string"){
                parser = new DOMParser();
                data = parser.parseFromString(data,"text/xml");
            }
            console.log(data);
            console.log($(data).find('wfs\\:FeatureCollection, gml\\:FeatureCollection, FeatureCollection'));
            if ($(data).find('wfs\\:FeatureCollection, gml\\:FeatureCollection, FeatureCollection').length) {
                this.__parseGMLData(data, opt);
            } else {
                _alert("feed not gml");
            }
        }
    };

    /**
     * __parseGMLData 
     * parse the loaded GML xml data and create data object
     * @param the gml object
     * @param opt optional options
     * @type void
     */
    Data.Feed.prototype.__parseGMLData = function (data, opt) {

        const __this = this;

        if (opt.format == "xml") {

            // Look for FeatureCollection (GML 3.x) or gml:FeatureCollection (GML 2.x)
            const featureCollection = $(data).find('wfs\\:FeatureCollection, FeatureCollection').first();
            
            if (featureCollection.length === 0) {
                _alert("No FeatureCollection found in GML data");
                return;
            }

            const dataA = [];
            let childNamesA = null;

            // Process each feature member
            featureCollection.find('wfs\\:member, gml\\:featureMember, featureMember, gml\\:featureMembers, featureMembers').each(function () {
                
                const feature = $(this).find('gml\\:*, *').first();
                if (feature.length === 0) return;

                // Get fieldnames from the first feature
                if (!childNamesA) {
                    childNamesA = [];
                    
                    // Add property columns
                    feature.find('gml\\:*, *').each(function () {
                        const tagName = $(this).prop('tagName');
                        if (tagName && !tagName.match(/^(gml:)?(boundedBy|location|pos|coordinates|geometry|geometryProperty)$/i)) {
                            childNamesA.push(tagName.replace(/^gml:/, ''));
                        }
                    });
                    
                    // Add geometry column
                    childNamesA.push('GML.Geometry');
                    
                    dataA.push(childNamesA);
                }

                // Extract feature data
                const row = [];
                
                
                // Add property values
                feature.find('gml\\:*, *').each(function () {
                    const tagName = $(this).prop('tagName');
                    if (tagName && !tagName.match(/^(gml:)?(boundedBy|location|pos|coordinates|geometry|geometryProperty)$/i)) {
                        row.push($(this).text());
                    }
                });
                
                // Add geometry data
                const geometry = feature.find('gml\\:Polygon').first();
                if (geometry.length > 0) {
                    let value = '{"type":"Polygon","coordinates":[['; 
                    let coords = (geometry.text().split(" "));
                    let start = 0;
                    
                    // Find the first valid number
                    for (var i = 0; i < coords.length; i++){
                        if (Number(coords[i]) && !isNaN(Number(coords[i]))){
                            start = i;
                            break;
                        }
                    }
                    
                    console.log("coords:", coords);
                    console.log("start:", start);
                    console.log("coords length:", coords.length);
                    
                    // Check if we have enough coordinates
                    if (start < coords.length - 1) {
                        console.log("coords[start]:", coords[start]);
                        console.log("coords[start+1]:", coords[start+1]);
                        
                        // Process coordinates in pairs
                        for (i = start; i < coords.length - 1; i += 2) {
                            if (coords[i] && coords[i+1] && 
                                !isNaN(Number(coords[i])) && !isNaN(Number(coords[i+1]))) {
                                value += (i>start?',':'')+ '[' + coords[i+1] + ',' + coords[i] + ']';
                            }
                        }
                    }
                    
                    value += ']]}';
                    console.log("final value:", value);                    
                    row.push(value);
                } else {
                    row.push('');
                }
                
                dataA.push(row);
            });

            __this.__createDataTableObject(dataA, "gml", opt);

        }
    };

    // ---------------------------------
    // J S O N  
    // ---------------------------------

    /** 
     * __doJSONImport 
     * reads a simple JSON table 
     * parses the data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__doJSONImport = function (szUrl, opt) {

        const __this = this;
        $.get(szUrl,
            function (data) {
                __this.__processJsonData(data, opt);
            }).fail(function (e) {
            if ((typeof (opt) != "undefined") && opt.error) {
                opt.error(e);
            }
        });

    };

     /**
     * Generates a list of paths for all leaf nodes in a nested data structure,
     * replicating the traversal and path construction logic of the provided JavaScript code.
     *
     * @param {any} dataItem The current element (object, array, or primitive value) to explore.
     * @param {string} currentPath The accumulated path prefix up to the current element.
     * @returns {string[]} A list of strings, where each string represents a complete path
     *                     to a leaf node in the data structure.
     */
    __getNestedPaths = function(dataItem, currentPath = "") {
        const paths = [];

        // If the current element is an object (but not null and not an array)
        if (typeof dataItem === "object" && dataItem !== null && !Array.isArray(dataItem)) {
            for (const key in dataItem) {
                // Make sure the property is the object's own and not inherited
                if (Object.prototype.hasOwnProperty.call(dataItem, key)) {
                    const value = dataItem[key];
                    // Build the new path by appending the key
                    const newPath = currentPath ? `${currentPath}.${key}` : key;
                    paths.push(...__getNestedPaths(value, newPath));
                }
            }
        }
        // If the current element is an array
        else if (Array.isArray(dataItem)) {
            dataItem.forEach((value, index) => {
                // The original JavaScript code includes array indices in the path.
                // We replicate this behavior by adding the index to the path.
                const newPath = currentPath ? `${currentPath}.${index}` : String(index);
                paths.push(...__getNestedPaths(value, newPath));
            });
        }
        // Base case: the current element is neither an object nor an array, so it's a leaf node.
        // Add the accumulated path to the list.
        else {
            paths.push(currentPath);
        }

        return paths;
    };
   
    /**
     * Recursively extracts "leaf" values from a data element,
     * following the structure defined by a schema element.
     * Handles null values by pushing the string 'null'.
     *
     * @param {any} dataItem The current element from the actual data (e.g., data[i][a]).
     * @param {any} schemaItem The current element from the schema (e.g., data[0][a]).
     * @returns {Array<any>} A list of extracted values.
     */
    __extractValuesRecursive = function(dataItem, schemaItem) {
        let extractedValues = [];

        // Special case: if the data element is null, add the string 'null' as per original logic.
        if (dataItem === null || typeof dataItem === "undefined") {
            extractedValues.push('null');
        }
        // If the schema element is an object (not null, not an array), explore it recursively.
        // Use schemaItem to guide the traversal of properties.
        else if (typeof schemaItem === "object" && schemaItem !== null && !Array.isArray(schemaItem)) {
            for (const key in schemaItem) {
                // Make sure the property is the schema object's own and not inherited.
                if (Object.prototype.hasOwnProperty.call(schemaItem, key)) {
                    // Check if the data element has the corresponding property.
                    // If not, dataItem[key] will be undefined, which will be treated as a primitive.
                    const valueToProcess = Object.prototype.hasOwnProperty.call(dataItem, key) ? dataItem[key] : undefined;
                    extractedValues = extractedValues.concat(__extractValuesRecursive(valueToProcess, schemaItem[key]));
                }
            }
        }
        // If the schema element is an array, explore it recursively.
        // Use schemaItem to guide traversal by index.
        else if (Array.isArray(schemaItem)) {
            // Iterate through indices defined by the schema.
            for (let index = 0; index < schemaItem.length; index++) {
                // Check if the data element has a value at the corresponding index.
                // If not, dataItem[index] will be undefined, which will be treated as a primitive.
                const valueToProcess = index < dataItem.length ? dataItem[index] : undefined;
                extractedValues = extractedValues.concat(__extractValuesRecursive(valueToProcess, schemaItem[index]));
            }
        }
        // Base case: the schema element is neither an object nor an array (i.e., it's a primitive).
        // This means dataItem is the "leaf" value we want to extract.
        else {
            extractedValues.push(dataItem);
        }

        return extractedValues;
    };

    /** 
     * __processJsonData 
     * reads a simple JSON table 
     * parses the data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__processJsonData = function (script, opt) {

        let data = null;
        
        if (typeof (script) == "string") {
            try {
                data = JSON.parse(script);
            } catch (e) {
                this.__createDataTableObject([], "json", opt);
            }
        } else {
            data = script;
        }
        this.data = data;

        let dataA = [];
        let row = [];

        // json with structure data.columns[] data.rows[][]
        // -------------------------------------------------
        if (data && data.data && data.data.columns && data.data.rows) {

            const columns = data.data.columns;
            const rows = data.data.rows;

            for (let i = 0, len = columns.length; i < len; i++) {
                row.push(columns[i]);
            }
            dataA.push(row);

            for (let i = 0, len = rows.length; i < len; i++) {
                row = [];
                for (let ii = 0, row0Len = rows[0].length; ii < row0Len; ii++) {
                    row.push(rows[i][ii]);
                }
                dataA.push(row);
            }

            // json without database structure
            // -------------------------------------------------
        } else {
            // if initial data object, take the data within
            if (data && data.data) {
                data = data.data;
            }

           // if initial object is not an array, search the first one 
           if( !Array.isArray(data) ) {
               
                __findAllArraysInJson = function (jsonObject){
                    const arrays = [];
                    function __recurse(obj) {
                    // Check if the current object is an array
                        if (Array.isArray(obj)) {
                            arrays.push(obj);
                        } else if (typeof obj === 'object' && obj !== null) {
                            // If it's an object, iterate over its keys
                            for (const key in obj) {
                                if (obj.hasOwnProperty(key)) {
                                    __recurse(obj[key]); // Recur for each key
                                }
                            }
                        }
                    }
                    __recurse(jsonObject);
                    return arrays;
                }; 
               
                let arrayA = __findAllArraysInJson(data);
                data = arrayA[0];
            }
            
            // was not able to parse json
            // set source as result
            
            if (!data){
                let dataA = [];
                dataA.push(["unknown type"]);
                const scriptA = script.split('\n');
                for (let i = 0, len = scriptA.length; i < len; i++){
                    dataA.push([scriptA[i]]);
                }
                this.__createDataTableObject(dataA, "json", opt); 
                return;
            }
            
            // create first row with field names
            dataA.push(__getNestedPaths(data[0]));

            // create data rows
            for (let i = 0; i < data.length; i++) {
                dataA.push(__extractValuesRecursive(data[i], data[0]));
            }
        }

        // finish the data table object 
        this.__createDataTableObject(dataA, "json", opt);
    };


    // ---------------------------------
    // G E O - J S O N  
    // ---------------------------------

    /** 
     * __doGeoJSONImport 
     * reads a simple JSON table 
     * parses the data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__doGeoJSONImport = function (szUrl, opt) {

        const __this = this;
        $.get(szUrl,
            function (data) {
                __this.__processGeoJsonData(data, opt);
            }).fail(function (e) {
            if ((typeof (opt) != "undefined") && opt.error) {
                opt.error(e);
            }
        });

    };
    /** 
     * __processGeoJsonData 
     * reads a simple JSON table 
     * parses the data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__processGeoJsonData = function (script, opt) {
        let data = null;

        if (typeof script === "string") {
            try {
                data = JSON.parse(script);
            } catch (e) {
                this.__createDataTableObject([], "json", opt);
                return; // Exit early on parse error
            }
        } else {
            data = script;
        }
        this.data = data;

        const dataA = [];
        const columns = {};

        if (data && data.features && data.features.length) {
            // Collect all unique property keys from all features
            for (const feature of data.features) {
                if (feature.properties) {
                    for (const p in feature.properties) {
                        columns[p] = true;
                    }
                }
            }

            // Create the header row (column names)
            const headerRow = Object.keys(columns);
            headerRow.push("geometry");
            dataA.push(headerRow);

            // Create data rows for each feature
            for (const feature of data.features) {
                const row = [];
                const properties = feature.properties || {}; // Handle cases where properties might be missing

                // Populate data based on the header row order
                for (let p = 0; p < headerRow.length - 1; p++) {
                    const propertyName = headerRow[p];
                    const propertyValue = properties[propertyName];

                    if (typeof propertyValue === "object") {
                        row.push(JSON.stringify(propertyValue));
                    } else {
                        row.push(propertyValue !== undefined ? propertyValue : "");
                    }
                }

                // Add the geometry to the row
                row.push(JSON.stringify(feature.geometry));
                dataA.push(row);
            }
        }

        // Finish the data table object
        this.__createDataTableObject(dataA, "json", opt);
    };

    /** 
     * __processGeoJsonData_expandProperty
     * reads a simple JSON table 
     * parses the data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__processGeoJsonData_expandProperty = function (script, opt) {

        let data = null;
        
        if (typeof (script) == "string") {
            try {
                data = JSON.parse(script);
            } catch (e) {
                this.__createDataTableObject([], "json", opt);
            }
        } else {

            data = script;
        }
        this.data = data;

        let dataA = [];
        let row = [];
        const columns = [];

        if (data && data.features && data.features.length) {

            for (let i = 0; i < data.features.length; i++) {
                for (const p in data.features[i].properties) {
                    if (typeof data.features[i].properties[p] === "string" || typeof data.features[i].properties[p] === "number") {
                        columns[p] = true;
                    } else {
                        for (const pp in data.features[i].properties[p]) {
                            columns[p + "." + pp] = true;
                        }
                    }
                }
            }
            for (const p in columns) {
                row.push(p);
            }
            row.push("geometry");
            dataA.push(row);

            for (let i = 0; i < data.features.length; i++) {
                row = [];
                for (let p = 0; p < dataA[0].length - 1; p++) {
                    const xA = dataA[0][p].split(".");
                    if (xA.length >= 2) {
                        row.push(data.features[i].properties[xA[0]][xA[1]] || "");
                    } else {
                        row.push(data.features[i].properties[dataA[0][p]] || "");
                    }
                }
                row.push(JSON.stringify(data.features[i].geometry));
                dataA.push(row);
            }
        }
        // finish the data table object 
        this.__createDataTableObject(dataA, "json", opt);
    };

    // ---------------------------------
    // T O P O - J S O N  
    // ---------------------------------

    /** 
     * __doTopoJSONImport 
     * reads a topojson feed 
     * parses the data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__doTopoJSONImport = function (szUrl, opt) {

        const __this = this;
        $.get(szUrl,
            function (data) {
                __this.__processTopoJsonData(data, opt);
            }).fail(function (e) {
            if ((typeof (opt) != "undefined") && opt.error) {
                opt.error(e);
            }
        });

    };
    /** 
     * __processTopoJsonData 
     * parses topojson data into the map data source
     * @param file filename
     * @param i filenumber
     * @type void
     */
    Data.Feed.prototype.__processTopoJsonData = function (script, opt) {

        if (typeof (topojson) == "undefined") {
            _alert("'" + opt.type + "' parser not loaded !");
            return;
        }
        let data = null;
        if (typeof (script) == "string") {
            try {
                data = JSON.parse(script);
            } catch (e) {
                this.__createDataTableObject([], "json", opt);
            }
        } else {
            data = script;
        }
        this.data = data;

        let topoObject = null;

        // select topojson object by given name
        if (opt.options && opt.options.name && data.objects[opt.options.name]) {
            topoObject = topojson.feature(data, data.objects[opt.options.name]);
        } else
            // or take the first object
            for (var i in data.objects) {
                topoObject = topojson.feature(data, data.objects[i]);
                break;
            }

        for (const i in topoObject.features) {
            topoObject.features[i].properties.id = topoObject.features[i].id;
        }

        this.__processGeoJsonData(topoObject, opt);
    };

    // ---------------------------------------
    // P A R Q U E T   e   G E O P A R Q U E T 
    // ---------------------------------------

    /**
     * __doParquetImport
     * reads parquet file from URL using DuckDB WASM module
     * @param szUrl parquet file url
     * @param opt options object
     * @type void
     */
    Data.Feed.prototype.__doParquetImport = function (szUrl, opt) {
        _LOG("__doParquetImport: " + szUrl);
        
        const __this = this;
        
        // Use Fetch API instead of jQuery AJAX for better binary handling
        _LOG("Attempting to load parquet file using Fetch API...");
        
        fetch(szUrl, {
            method: 'GET',
            cache: opt.cache ? 'default' : 'no-cache'
        })
        .then(response => {
            _LOG("Fetch response received, status: " + response.status);
            _LOG("Response headers: " + JSON.stringify([...response.headers.entries()]));
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Get the response as ArrayBuffer
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            _LOG("Successfully loaded parquet as ArrayBuffer: " + arrayBuffer.byteLength + " bytes");
            
            // Verify this looks like a parquet file
            const uint8Array = new Uint8Array(arrayBuffer);
            if (uint8Array.length >= 4) {
                const magic = String.fromCharCode(...uint8Array.slice(0, 4));
                _LOG("Magic number: " + magic);
                if (magic === 'PAR1') {
                    _LOG("✅ SUCCESS: Valid parquet file detected!");
                    __this.__processParquetData(arrayBuffer, opt);
                } else {
                    _LOG("⚠️ Warning: Magic number is not PAR1: " + magic);
                    _LOG("First 16 bytes: " + Array.from(uint8Array.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
                    
                    // Even if magic number is wrong, try to process it
                    _LOG("Attempting to process anyway...");
                    __this.__processParquetData(arrayBuffer, opt);
                }
            } else {
                _LOG("⚠️ Warning: Response too short to check magic number");
                __this.__processParquetData(arrayBuffer, opt);
            }
        })
        .catch(error => {
            _LOG("Fetch failed: " + error.message);
            
            // Fallback to XMLHttpRequest if Fetch fails
            _LOG("Falling back to XMLHttpRequest...");
            __this.__loadParquetWithXHR(szUrl, opt);
        });
    };

    /**
     * __loadParquetWithXHR
     * fallback method using XMLHttpRequest if Fetch fails
     * @param szUrl parquet file url
     * @param opt options object
     * @type void
     */
    Data.Feed.prototype.__loadParquetWithXHR = function (szUrl, opt) {
        const __this = this;
        
        _LOG("Loading parquet with XMLHttpRequest...");
        
        const xhr = new XMLHttpRequest();
        xhr.open('GET', szUrl, true);
        xhr.responseType = 'arraybuffer';
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                const arrayBuffer = xhr.response;
                _LOG("XHR successful: " + arrayBuffer.byteLength + " bytes");
                
                // Verify this looks like a parquet file
                const uint8Array = new Uint8Array(arrayBuffer);
                if (uint8Array.length >= 4) {
                    const magic = String.fromCharCode(...uint8Array.slice(0, 4));
                    _LOG("XHR magic number: " + magic);
                    if (magic === 'PAR1') {
                        _LOG("✅ SUCCESS: Valid parquet file via XHR!");
                        __this.__processParquetData(arrayBuffer, opt);
                    } else {
                        _LOG("⚠️ Warning: XHR magic number is not PAR1: " + magic);
                        _LOG("First 16 bytes: " + Array.from(uint8Array.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
                        
                        // Even if magic number is wrong, try to process it
                        _LOG("Attempting to process anyway...");
                        __this.__processParquetData(arrayBuffer, opt);
                    }
                } else {
                    _LOG("⚠️ Warning: XHR response too short to check magic number");
                    __this.__processParquetData(arrayBuffer, opt);
                }
            } else {
                _LOG("XHR failed with status: " + xhr.status + " " + xhr.statusText);
                if (typeof opt !== "undefined" && opt.error) {
                    opt.error("XHR failed: " + xhr.status + " " + xhr.statusText);
                } else {
                    _alert("XHR failed: " + xhr.status + " " + xhr.statusText);
                }
            }
        };
        
        xhr.onerror = function() {
            _LOG("XHR network error");
            if (typeof opt !== "undefined" && opt.error) {
                opt.error("XHR network error");
            } else {
                _alert("XHR network error");
            }
        };
        
        xhr.send();
    };

    /**
     * __checkGeoParquetMetadataWithDuckDB
     * Helper function to check GeoParquet metadata using DuckDB WASM
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param resolve callback function for success
     * @param reject callback function for error
     */
    Data.Feed.prototype.__checkGeoParquetMetadataWithDuckDB = function (parquetBuffer, resolve, reject) {
        const __this = this;
        
        try {
            console.log("🔍 Checking GeoParquet metadata with DuckDB WASM...");
            
            // Create a copy of the parquet buffer to avoid modifying the original
            const parquetBufferCopy = parquetBuffer.slice();
            
            // Register the parquet buffer as a temporary file in DuckDB's virtual filesystem
            const tempFileName = 'temp_parquet_' + Date.now() + '.parquet';
            
            window.duckdb.db.registerFileBuffer(tempFileName, new Uint8Array(parquetBufferCopy))
                .then(function() {
                    console.log("📊 Parquet file registered in DuckDB virtual filesystem");
                    
                    // Query the actual data to get column names and types
                    const metadataQuery = `
                        SELECT * FROM read_parquet('${tempFileName}') LIMIT 1
                    `;
                    
                    return window.duckdb.conn.query(metadataQuery);
                })
                .then(function(result) {
                    console.log("📊 Metadata query result type:", typeof result);
                    console.log("📊 Metadata query result methods:", Object.getOwnPropertyNames(result));
                    console.log("📊 Metadata query result:", result);
                    
                    let isGeoParquet = false;
                    
                    // Handle different DuckDB result formats
                    let rows;
                    if (typeof result.toArray === 'function') {
                        rows = result.toArray();
                        console.log("📊 Using toArray(), rows:", rows);
                    } else if (typeof result.fetchAll === 'function') {
                        rows = result.fetchAll();
                        console.log("📊 Using fetchAll(), rows:", rows);
                    } else if (Array.isArray(result)) {
                        rows = result;
                        console.log("📊 Result is array, rows:", rows);
                    } else if (result.data && Array.isArray(result.data)) {
                        rows = result.data;
                        console.log("📊 Using result.data, rows:", rows);
                    } else {
                        console.warn("⚠️ Cannot extract rows from metadata result, assuming regular parquet");
                        console.log("📊 Full result object:", result);
                        resolve(false);
                        return;
                    }
                    
                    // Check if any column has geometry-related names
                    if (rows && rows.length > 0) {
                        console.log("📊 Checking columns for geometry indicators...");
                        
                        // Get column names from the first row
                        const firstRow = rows[0];
                        const columnNames = Object.keys(firstRow);
                        
                        console.log("📊 Column names found:", columnNames);
                        
                        // Check for common geometry column names
                        const geoColumns = ['geometry', 'geom', 'the_geom', 'wkb_geometry', 'shape'];
                        for (const columnName of columnNames) {
                            const lowerColumnName = columnName.toLowerCase();
                            console.log(`📊 Checking column: ${columnName}`);
                            
                            if (geoColumns.includes(lowerColumnName)) {
                                console.log("✅ GeoParquet detected via geometry column name:", columnName);
                                isGeoParquet = true;
                                break;
                            }
                        }
                        
                        // Also check if any column contains geometry data (WKB, GeoJSON, etc.)
                        for (const columnName of columnNames) {
                            const lowerColumnName = columnName.toLowerCase();
                            if (lowerColumnName.includes('wkb') || lowerColumnName.includes('geojson') || 
                                lowerColumnName.includes('wkt') || lowerColumnName.includes('coordinates')) {
                                console.log("✅ GeoParquet detected via geometry-related column name:", columnName);
                                isGeoParquet = true;
                                break;
                            }
                        }
                    } else {
                        console.log("📊 No rows found in metadata query");
                    }
                    
                    console.log("🎯 Final GeoParquet detection result:", isGeoParquet);
                    resolve(isGeoParquet);
                })
                .catch(function(error) {
                    console.warn("⚠️ Error checking GeoParquet metadata, assuming regular parquet:", error);
                    // If metadata check fails, assume it's a regular parquet file
                    resolve(false);
                })
                .finally(function() {
                    // Clean up the temporary file
                    try {
                        window.duckdb.db.dropFile(tempFileName);
                    } catch (cleanupError) {
                        console.warn("Warning: Could not clean up temporary file:", cleanupError);
                    }
                });
                
        } catch (error) {
            console.error("❌ Error in GeoParquet detection:", error);
            reject(error);
        }
    };

    /**
     * __processStreamingDataset
     * Process large datasets using a true streaming approach that never accumulates large arrays
     * @param rows array of row data
     * @param columns array of column names
     * @param tempFileName temporary file name for cleanup
     * @param opt options object
     */
    Data.Feed.prototype.__processStreamingDataset = function (rows, columns, tempFileName, opt) {
        const __this = this;
        
        console.log("📊 Starting streaming processing for large dataset...");
        console.log(`📊 Processing ${rows.length} rows in batches of 1000000 rows`);
        
        // Memory monitoring function
        const logMemoryUsage = () => {
            if (performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                console.log(`📊 Memory usage: ${used}MB / ${total}MB`);
            }
        };
        
        // Create the final data array with header row
        const dataA = [columns];
        
        // Process data in very small chunks without accumulating large arrays
        const processMicroBatch = async (startIndex, endIndex) => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    const batchData = [];
                    for (let i = startIndex; i < endIndex; i++) {
                        const row = [];
                        for (let j = 0; j < columns.length; j++) {
                            let value;
                            
                            // Handle different row formats
                            if (Array.isArray(rows[i])) {
                                value = rows[i][j];
                            } else if (typeof rows[i] === 'object' && rows[i] !== null) {
                                value = rows[i][columns[j]];
                            } else {
                                value = rows[i];
                            }
                            
                            // Handle different data types
                            if (value === null || value === undefined) {
                                row.push('');
                            } else if (value instanceof Date) {
                                row.push(value.toISOString());
                            } else if (typeof value === 'object' && value !== null) {
                                try {
                                    row.push(JSON.stringify(value));
                                } catch (e) {
                                    row.push(String(value));
                                }
                            } else {
                                row.push(String(value));
                            }
                        }
                        batchData.push(row);
                    }
                    resolve(batchData);
                }, 0);
            });
        };
        
        // Process data in batches and add directly to final array
        const processAllData = async () => {
            const microBatchSize = 1000000; // Process 1000000 rows at a time
            
            for (let batchStart = 0; batchStart < rows.length; batchStart += microBatchSize) {
                const batchEnd = Math.min(batchStart + microBatchSize, rows.length);
                const batchData = await processMicroBatch(batchStart, batchEnd);
                
                // Add data directly to final array, row by row
                for (let i = 0; i < batchData.length; i++) {
                    dataA.push(batchData[i]);
                }
                
                // Clear batch data immediately
                batchData.length = 0;
                
                // Log progress every 2000000 rows
                if (batchEnd % 2000000 === 0 || batchEnd === rows.length) {
                    console.log(`📊 Streaming: ${batchEnd} of ${rows.length} rows (${Math.round((batchEnd / rows.length) * 100)}%)`);
                    logMemoryUsage();
                }
                
                // Yield control after every batch
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        };
        
        // Process the data
        return processAllData().then(function() {
            console.log("📊 Streaming dataset processing completed");
            _LOG("Streaming dataset converted: " + dataA.length + " total rows (including header)");
            
            // Clean up the temporary file
            try {
                window.duckdb.db.dropFile(tempFileName);
            } catch (cleanupError) {
                console.warn("Warning: Could not clean up temporary file:", cleanupError);
            }
            
            // Process the data using the standard method
            __this.__createDataTableObject(dataA, "parquet", opt);
            
        }).catch(function(error) {
            console.error("❌ Error in streaming dataset processing:", error);
            
            // Clean up the temporary file
            try {
                window.duckdb.db.dropFile(tempFileName);
            } catch (cleanupError) {
                console.warn("Warning: Could not clean up temporary file:", cleanupError);
            }
            
            // Call error callback
            if (opt && typeof opt.error === 'function') {
                opt.error(error);
            }
        });
    };

    /**
     * __checkGeoParquetMetadata (LEGACY - Commented out, replaced by DuckDB WASM)
     * Helper function to check GeoParquet metadata using loaded hyparquet
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param hyparquet loaded hyparquet module
     * @param resolve Promise resolve function
     * @param reject Promise reject function
     */
    /*
    Data.Feed.prototype.__checkGeoParquetMetadata = function (parquetBuffer, hyparquet, resolve, reject) {
        try {
            console.log("🔍 Checking GeoParquet metadata with existing hyparquet...");
            
            // Use parquetMetadataAsync to get metadata
            if (typeof hyparquet.parquetMetadataAsync === 'function') {
                console.log("📊 Using parquetMetadataAsync method");
                
                hyparquet.parquetMetadataAsync(parquetBuffer).then(function(metadata) {
                    console.log("📊 Metadata received:", metadata);
                    
                    let isGeoParquet = false;
                    
                    // Check metadata for "geo" key
                    if (metadata && metadata.key_value_metadata) {
                        console.log("📊 Schema metadata found:", metadata.key_value_metadata);
                        const hasGeoMetadata = metadata.key_value_metadata.some(item => 
                            item.key === 'geo' || item.key.toLowerCase().includes('geo')
                        );
                        
                        if (hasGeoMetadata) {
                            console.log("✅ GeoParquet detected via metadata geo key");
                            isGeoParquet = true;
                        }
                    }
                    
                    // Check if any column has geometry type
                    if (!isGeoParquet && metadata && metadata.schema && metadata.schema.fields) {
                        console.log("📊 Schema fields found:", metadata.schema.fields);
                        const hasGeometryField = metadata.schema.fields.some(field => 
                            field.type && (
                                field.type.toLowerCase().includes('geometry') ||
                                field.type.toLowerCase().includes('geography') ||
                                field.type.toLowerCase().includes('point') ||
                                field.type.toLowerCase().includes('polygon') ||
                                field.type.toLowerCase().includes('linestring')
                            )
                        );
                        
                        if (hasGeometryField) {
                            console.log("✅ GeoParquet detected via field types");
                            isGeoParquet = true;
                        }
                    }
                    
                    // Check for geometry column names in field names
                    if (!isGeoParquet && metadata && metadata.schema && metadata.schema.fields) {
                        const geoColumns = ['geometry', 'geom', 'the_geom', 'wkb_geometry', 'shape'];
                        const hasGeoColumn = metadata.schema.fields.some(field => 
                            geoColumns.some(geoCol => 
                                field.name && field.name.toLowerCase().includes(geoCol.toLowerCase())
                            )
                        );
                        
                        if (hasGeoColumn) {
                            console.log("✅ GeoParquet detected via column names");
                            isGeoParquet = true;
                        }
                    }
                    
                    console.log("🎯 GeoParquet detection result:", isGeoParquet);
                    resolve(isGeoParquet);
                    
                }).catch(function(error) {
                    console.warn("Error reading parquet metadata:", error);
                    resolve(false);
                });
                
            } else {
                console.log("📊 parquetMetadataAsync not available, trying fallback methods");
                
                // Fallback: try to read a small sample and check for geo columns
                try {
                    const sample = hyparquet.parquetReadObjects({
                        file: parquetBuffer,
                        rowStart: 0,
                        rowEnd: 1,
                        compressors: hyparquet.compressors
                    });
                    
                    if (sample && sample.length > 0) {
                        const firstRow = sample[0];
                        console.log("📊 Sample row columns:", Object.keys(firstRow));
                        // Check for common GeoParquet column names
                        const geoColumns = ['geometry', 'geom', 'the_geom', 'wkb_geometry', 'shape'];
                        const hasGeoColumn = geoColumns.some(col => firstRow.hasOwnProperty(col));
                        
                        if (hasGeoColumn) {
                            console.log("✅ GeoParquet detected via column names");
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } else {
                        resolve(false);
                    }
                } catch (error) {
                    console.warn("Error in fallback detection:", error);
                    resolve(false);
                }
            }
            
        } catch (error) {
            console.warn("Error detecting GeoParquet metadata:", error);
            resolve(false);
        }
    };
    
    /**
     * __processParquetData
     * processes parquet data using DuckDB WASM module and converts it to table format
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param opt options object
     * @type void
     */
    Data.Feed.prototype.__processParquetData = function (parquetBuffer, opt) {
        const __this = this;
        
        console.log("🚀 Starting parquet processing with DuckDB WASM...");
        _LOG("Processing parquet data with DuckDB WASM...");
        
        // First, ensure DuckDB WASM is loaded
        if (typeof window.duckdb !== 'undefined' && window.duckdbLoaded) {
            console.log("📦 Using existing DuckDB WASM module");
            __this.__processParquetWithDuckDB(parquetBuffer, opt);
        } else {
            console.log("📦 Loading DuckDB WASM module...");
            __this.__loadDuckDBAndProcess(parquetBuffer, opt);
        }
    };
    
    /**
     * __processParquetWithDuckDB
     * Processes parquet data with loaded DuckDB WASM module (includes GeoParquet detection)
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param opt options object
     */
    Data.Feed.prototype.__processParquetWithDuckDB = function (parquetBuffer, opt) {
        const __this = this;
        console.log("-1-")
        console.log(parquetBuffer);
        console.log("🔍 Starting GeoParquet detection with DuckDB WASM...");
        _LOG("Detecting if parquet file is GeoParquet...");
        
        // Use DuckDB to detect GeoParquet
        __this.__checkGeoParquetMetadataWithDuckDB(parquetBuffer, function(isGeoParquet) {
            console.log("🎯 GeoParquet detection result:", isGeoParquet);
            
            if (isGeoParquet) {
                _LOG("✅ GeoParquet detected! Switching to GeoParquet processing...");
                console.log("🎯 Branching to GeoParquet processing");
                
                // Branch to GeoParquet processing
                if (typeof __this.__processGeoParquetData === 'function') {
                    __this.__processGeoParquetData(parquetBuffer, opt);
                } else {
                    _LOG("⚠️ GeoParquet processing function not found, falling back to regular parquet processing");
                    console.log("⚠️ GeoParquet function not found, using regular processing");
                    __this.__processWithDuckDB(parquetBuffer, opt);
                }
            } else {
                _LOG("✅ Regular parquet file detected, proceeding with standard processing...");
                console.log("🎯 Branching to regular parquet processing");
                console.log("-2-")
                console.log(parquetBuffer);
        
                // Continue with regular parquet processing
                __this.__processWithDuckDB(parquetBuffer, opt);
            }
        }, function(error) {
            _LOG("⚠️ Error detecting GeoParquet, falling back to regular parquet processing: " + error);
            console.error("❌ Detection error:", error);
            
            // Fallback to regular parquet processing
            __this.__processWithDuckDB(parquetBuffer, opt);
        });
    };
    
    /**
     * __loadDuckDBAndProcess
     * Loads DuckDB WASM module and processes parquet data
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param opt options object
     */
    Data.Feed.prototype.__loadDuckDBAndProcess = function (parquetBuffer, opt) {
        const __this = this;
        
        // Load DuckDB WASM module dynamically
        _LOG("Loading DuckDB WASM module dynamically...");
        
        // Load Apache Arrow first as a global script (local file)
        const arrowScript = document.createElement('script');
        arrowScript.src = 'https://raw.githubusercontent.com/gjrichter/data.js/refs/heads/master/libs/apache-arrow/Arrow.es2015.min.js';
        arrowScript.onload = function() {
            console.log("Apache Arrow loaded globally from local file");
            
            // Now load DuckDB WASM
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
            // Try multiple CDNs for DuckDB WASM
            let duckdb;
            try {
                // Try jsDelivr first (most reliable for DuckDB WASM)
                duckdb = await import("https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm");
                console.log("✅ DuckDB loaded from jsDelivr");
            } catch (e1) {
                try {
                    // Fallback to ESM.sh
                    duckdb = await import("https://esm.sh/@duckdb/duckdb-wasm@1.30.0");
                    console.log("✅ DuckDB loaded from ESM.sh");
                } catch (e2) {
                    try {
                        // Fallback to unpkg
                        duckdb = await import("https://unpkg.com/@duckdb/duckdb-wasm@1.30.0");
                        console.log("✅ DuckDB loaded from unpkg");
                    } catch (e3) {
                        try {
                            // Last resort: Try Skypack
                            duckdb = await import("https://cdn.skypack.dev/@duckdb/duckdb-wasm@1.30.0");
                            console.log("✅ DuckDB loaded from Skypack");
                        } catch (e4) {
                            throw new Error("Failed to load DuckDB from any CDN: " + e4.message);
                        }
                    }
                }
            }
            
            console.log("DuckDB WASM module imported:", duckdb);
            console.log("Available DuckDB methods:", Object.keys(duckdb));
            
            // Initialize DuckDB
            try {
                // Use local DuckDB files to avoid CORS issues
                const LOCAL_BUNDLES = {
                    mvp: {
                        mainModule: './duckdb/duckdb-mvp.wasm',
                        mainWorker: './duckdb/duckdb-browser-mvp.worker.js',
                    },
                    eh: {
                        mainModule: './duckdb/duckdb-eh.wasm',
                        mainWorker: './duckdb/duckdb-browser-eh.worker.js',
                    },
                };
                
                let bundle;
                try {
                    bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
                    console.log("Using local DuckDB bundle:", bundle);
                } catch (e) {
                    console.log("Local bundle selection failed, trying default...");
                    try {
                        bundle = await duckdb.selectBundle();
                        console.log("Using default DuckDB bundle:", bundle);
                    } catch (e2) {
                        throw new Error("Failed to select any DuckDB bundle: " + e2.message);
                    }
                }
                
                // Try to create worker with error handling
                let worker;
                try {
                    console.log("Creating worker from:", bundle.mainWorker);
                    worker = new Worker(bundle.mainWorker);
                    console.log("✅ Worker created successfully");
                } catch (workerError) {
                    console.error("Failed to create worker:", workerError);
                    throw new Error("Cannot create DuckDB worker due to CORS restrictions. Please serve the files from the same origin or use a local server.");
                }
                
                const logger = new duckdb.ConsoleLogger();
                const db = new duckdb.AsyncDuckDB(logger, worker);
                
                console.log("Instantiating DuckDB with WASM module:", bundle.mainModule);
                console.log("Pthread worker:", bundle.pthreadWorker);
                
                try {
                    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
                    console.log("✅ DuckDB WASM instantiated successfully");
                } catch (instantiateError) {
                    console.error("❌ Failed to instantiate DuckDB WASM:", instantiateError);
                    throw instantiateError;
                }
                
                // Create connection
                const conn = await db.connect();
                
                console.log("✅ DuckDB WASM initialized successfully");
                console.log("📊 DuckDB connection object type:", typeof conn);
                console.log("📊 DuckDB connection methods:", Object.getOwnPropertyNames(conn));
                console.log("📊 DuckDB connection constructor:", conn.constructor.name);
                
                // Store references globally
                window.duckdb = {
                    db: db,
                    conn: conn,
                    module: duckdb
                };
                window.duckdbLoaded = true;
            
            } catch (error) {
                console.error("❌ Failed to initialize DuckDB WASM:", error);
                window.duckdbLoadError = error;
            }
            `;
            
            // Add the script to the document
            document.head.appendChild(script);
            
            // Listen for when DuckDB is loaded
        const checkLoaded = setInterval(function() {
                if (window.duckdbLoaded && window.duckdb) {
                clearInterval(checkLoaded);
                    _LOG("DuckDB WASM module loaded successfully");
                    __this.__processParquetWithDuckDB(parquetBuffer, opt);
                } else if (window.duckdbLoadError) {
                    clearInterval(checkLoaded);
                    _LOG("Failed to load DuckDB WASM module: " + window.duckdbLoadError);
                    if (typeof opt !== "undefined" && opt.error) {
                        opt.error("Failed to load DuckDB WASM module: " + window.duckdbLoadError);
                    } else {
                        _alert("Failed to load DuckDB WASM module: " + window.duckdbLoadError);
                    }
            }
        }, 100);
        
        // Set a timeout in case loading fails
        setTimeout(function() {
                if (!window.duckdbLoaded && !window.duckdbLoadError) {
                clearInterval(checkLoaded);
                    _LOG("Timeout loading DuckDB WASM module");
                if (typeof opt !== "undefined" && opt.error) {
                        opt.error("Timeout loading DuckDB WASM module");
                } else {
                        _alert("Timeout loading DuckDB WASM module");
                }
            }
            }, 15000); // 15 second timeout
        };
        
        // Add Apache Arrow script to document
        document.head.appendChild(arrowScript);
    };
    
    /**
     * __processWithDuckDB
     * helper method to process parquet data using DuckDB WASM
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param opt options object
     * @type void
     */
    Data.Feed.prototype.__processWithDuckDB = function (parquetBuffer, opt) {
        const __this = this;
        console.log(parquetBuffer);
         try {
            _LOG("Processing parquet data with DuckDB WASM, buffer size: " + parquetBuffer.byteLength + " bytes");
            console.log("🦆 Starting DuckDB parquet processing...");
            
            // Check for parquet magic number (PAR1)
            if (parquetBuffer.byteLength < 4) {
                throw new Error("File too small to be a valid parquet file");
            }
            
            const uint8Array = new Uint8Array(parquetBuffer);
            const magic = String.fromCharCode(...uint8Array.slice(0, 4));
            _LOG("Parquet file magic number: " + magic);
            
            if (magic !== 'PAR1') {
                throw new Error("File does not appear to be a valid parquet file (missing PAR1 magic number). Magic: " + magic);
            }
            
            _LOG("Valid parquet file detected, processing with DuckDB WASM...");
            
            // Register the parquet buffer as a temporary file in DuckDB's virtual filesystem
            const tempFileName = 'temp_parquet_' + Date.now() + '.parquet';
            
            // Create a copy of the uint8Array to avoid modifying the original buffer
            const uint8ArrayCopy = new Uint8Array(uint8Array);
            
            window.duckdb.db.registerFileBuffer(tempFileName, uint8ArrayCopy)
                .then(function() {
                    console.log("📊 Parquet file registered in DuckDB virtual filesystem");
                    
                    // Query all data from the parquet file
                    const dataQuery = `SELECT * FROM read_parquet('${tempFileName}') LIMIT 2000000`;
                    
                    return window.duckdb.conn.query(dataQuery);
                })
                .then(async function(result) {
                    console.log("📊 DuckDB query completed successfully");
                    _LOG("DuckDB query result type: " + typeof result);
                    console.log("📊 DuckDB result object type:", typeof result);
                    console.log("📊 DuckDB result methods:", Object.getOwnPropertyNames(result));
                    console.log("📊 DuckDB result constructor:", result.constructor.name);
                    
                    if (!result) {
                        throw new Error("DuckDB query returned null/undefined");
                    }
                    
                    // Check if result has toArray method
                    let rows;
                    let columns;
                    
                    if (typeof result.toArray === 'function') {
                        rows = result.toArray();
                        console.log("📊 Using toArray() method, rows count:", rows.length);
                    } else if (typeof result.fetchAll === 'function') {
                        rows = result.fetchAll();
                        console.log("📊 Using fetchAll() method, rows count:", rows.length);
                    } else if (Array.isArray(result)) {
                        rows = result;
                        console.log("📊 Result is already an array, rows count:", rows.length);
                    } else {
                        // Try to access data property
                        if (result.data && Array.isArray(result.data)) {
                            rows = result.data;
                            console.log("📊 Using result.data, rows count:", rows.length);
                        } else {
                            throw new Error("Cannot convert DuckDB result to array. Available methods: " + Object.getOwnPropertyNames(result).join(', '));
                        }
                    }
                    
                    if (rows.length === 0) {
                        throw new Error("No rows found in parquet file");
                    }
                    
                    // Get column names
                    if (result.schema && result.schema.fields) {
                        columns = result.schema.fields.map(field => field.name);
                    } else if (result.columns) {
                        columns = result.columns;
                    } else if (rows.length > 0 && typeof rows[0] === 'object') {
                        columns = Object.keys(rows[0]);
                    } else {
                        throw new Error("Cannot determine column names from DuckDB result");
                    }
                    
                    _LOG("Extracted columns: " + columns.join(', '));
                    
                    if (columns.length === 0) {
                        throw new Error("No columns found in parquet file");
                    }
                    
                    // Convert rows to array format expected by the data table
                    // Process in batches to avoid stack overflow with large datasets
                    const dataRows = [];
                    
                    // Check if dataset is too large to process safely
                    if (rows.length > 2000000) {
                        throw new Error(`Dataset too large (${rows.length} rows). Maximum supported: 2,000,000 rows. Consider using a smaller LIMIT in your query.`);
                    }
                    
                    // For large datasets, use streaming processing to avoid memory issues
                    if (rows.length > 100000) {
                        console.log("📊 Large dataset detected, using streaming processing...");
                        return __this.__processStreamingDataset(rows, columns, tempFileName, opt);
                    }
                    
                    // Warn about large datasets
                    if (rows.length > 500000) {
                        console.warn(`⚠️ Processing very large dataset (${rows.length} rows). This may take a while and use significant memory.`);
                    }
                    
                    const batchSize = Math.min(2000000, Math.max(500000, Math.floor(rows.length / 1))); // Ultimate breaking point test batch size
                    
                    // For very large datasets, use streaming processing to avoid memory issues
                    if (rows.length > 50000) {
                        console.log("📊 Large dataset detected, using streaming processing...");
                        console.log(`📊 Processing ${rows.length} rows in micro-batches`);
                        
                        // Use batches for large datasets
                        const actualBatchSize = rows.length > 500000 ? 1000000 : Math.min(2000000, batchSize);
                        
                        try {
                            // Process data in very small chunks with frequent yielding
                            const processMicroBatch = async (startIndex, endIndex) => {
                                return new Promise((resolve) => {
                                    // Use setTimeout to yield control back to the event loop
                                    setTimeout(() => {
                                        const microBatchData = [];
                                        for (let i = startIndex; i < endIndex; i++) {
                                            const row = [];
                                            for (let j = 0; j < columns.length; j++) {
                                                let value;
                                                
                                                // Handle different row formats
                                                if (Array.isArray(rows[i])) {
                                                    value = rows[i][j];
                                                } else if (typeof rows[i] === 'object' && rows[i] !== null) {
                                                    value = rows[i][columns[j]];
                                                } else {
                                                    value = rows[i];
                                                }
                                                
                                                // Handle different data types
                                                if (value === null || value === undefined) {
                                                    row.push('');
                                                } else if (value instanceof Date) {
                                                    // Handle date objects
                                                    row.push(value.toISOString());
                                                } else if (typeof value === 'object' && value !== null) {
                                                    // Handle complex objects
                                                    try {
                                                        row.push(JSON.stringify(value));
                                                    } catch (e) {
                                                        row.push(String(value));
                                                    }
                                                } else {
                                                    row.push(String(value));
                                                }
                                            }
                                            microBatchData.push(row);
                                        }
                                        resolve(microBatchData);
                                    }, 0);
                                });
                            };
                            
                            // Process all data in micro-batches
                            for (let batchStart = 0; batchStart < rows.length; batchStart += actualBatchSize) {
                                const batchEnd = Math.min(batchStart + actualBatchSize, rows.length);
                                const microBatchData = await processMicroBatch(batchStart, batchEnd);
                                
                                // Add data row by row to avoid stack overflow
                                for (let i = 0; i < microBatchData.length; i++) {
                                    dataRows.push(microBatchData[i]);
                                }
                                
                                // Clear the micro batch data immediately
                                microBatchData.length = 0;
                                
                                // Log progress for large datasets
                                if (batchEnd % (actualBatchSize * 10) === 0 || batchEnd === rows.length) {
                                    console.log(`📊 Processed ${batchEnd} of ${rows.length} rows (${Math.round((batchEnd / rows.length) * 100)}%)`);
                                }
                                
                                // Yield control after every batch for large datasets
                                if (rows.length > 100000) {
                                    await new Promise(resolve => setTimeout(resolve, 0));
                                }
                                
                                // More frequent yielding for very large datasets
                                if (rows.length > 500000 && batchEnd % (actualBatchSize * 2) === 0) {
                                    await new Promise(resolve => setTimeout(resolve, 0));
                                }
                            }
                        } catch (error) {
                            console.warn("⚠️ Async processing failed, falling back to synchronous processing:", error);
                            
                            // Fallback to synchronous processing with smaller batches
                            const fallbackBatchSize = 1000;
                            for (let batchStart = 0; batchStart < rows.length; batchStart += fallbackBatchSize) {
                                const batchEnd = Math.min(batchStart + fallbackBatchSize, rows.length);
                                
                                for (let i = batchStart; i < batchEnd; i++) {
                                    const row = [];
                                    for (let j = 0; j < columns.length; j++) {
                                        let value;
                                        
                                        // Handle different row formats
                                        if (Array.isArray(rows[i])) {
                                            value = rows[i][j];
                                        } else if (typeof rows[i] === 'object' && rows[i] !== null) {
                                            value = rows[i][columns[j]];
                                        } else {
                                            value = rows[i];
                                        }
                                        
                                        // Handle different data types
                                        if (value === null || value === undefined) {
                                            row.push('');
                                        } else if (value instanceof Date) {
                                            // Handle date objects
                                            row.push(value.toISOString());
                                        } else if (typeof value === 'object' && value !== null) {
                                            // Handle complex objects
                                            try {
                                                row.push(JSON.stringify(value));
                                            } catch (e) {
                                                row.push(String(value));
                                            }
                                        } else {
                                            row.push(String(value));
                                        }
                                    }
                                    dataRows.push(row);
                                }
                                
                                // Log progress for large datasets
                                console.log(`📊 Fallback processed ${batchEnd} of ${rows.length} rows (${Math.round((batchEnd / rows.length) * 100)}%)`);
                            }
                        }
                    } else {
                        // For smaller datasets, use synchronous processing
                        for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
                            const batchEnd = Math.min(batchStart + batchSize, rows.length);
                            
                            for (let i = batchStart; i < batchEnd; i++) {
                                const row = [];
                                for (let j = 0; j < columns.length; j++) {
                                    let value;
                                    
                                    // Handle different row formats
                                    if (Array.isArray(rows[i])) {
                                        value = rows[i][j];
                                    } else if (typeof rows[i] === 'object' && rows[i] !== null) {
                                        value = rows[i][columns[j]];
                                    } else {
                                        value = rows[i];
                                    }
                                    
                                    // Handle different data types
                                    if (value === null || value === undefined) {
                                        row.push('');
                                    } else if (value instanceof Date) {
                                        // Handle date objects
                                        row.push(value.toISOString());
                                    } else if (typeof value === 'object' && value !== null) {
                                        // Handle complex objects
                                        try {
                                            row.push(JSON.stringify(value));
                                        } catch (e) {
                                            row.push(String(value));
                                        }
                                    } else {
                                        row.push(String(value));
                                    }
                                }
                                dataRows.push(row);
                            }
                            
                            // Log progress for large datasets
                            if (rows.length > 50000) {
                                console.log(`📊 Processed ${batchEnd} of ${rows.length} rows (${Math.round((batchEnd / rows.length) * 100)}%)`);
                            }
                        }
                    }
                    
                    _LOG("Converted " + dataRows.length + " rows with " + columns.length + " columns");
                    
                    // Create data array with header row
                    const dataA = [columns];
                    dataA.push(...dataRows);
                    
                    // Create table object
                    console.log("🎯 Creating data table object...");
                    __this.__createDataTableObject(dataA, "parquet", opt);
                    
                })
                .catch(function(error) {
                    _LOG("Error in DuckDB parquet processing: " + error);
                    console.error("❌ DuckDB processing error:", error);
                    
                    if (typeof opt !== "undefined" && opt.error) {
                        opt.error("Error processing parquet file with DuckDB: " + error.message);
                    } else {
                        _alert("Error processing parquet file with DuckDB: " + error.message);
                    }
                })
                .finally(function() {
                    // Clean up the temporary file
                    try {
                        window.duckdb.db.dropFile(tempFileName);
                        console.log("🧹 Cleaned up temporary file");
                    } catch (cleanupError) {
                        console.warn("Warning: Could not clean up temporary file:", cleanupError);
                    }
                });
                
        } catch (error) {
            _LOG("Error in DuckDB parquet processing setup: " + error);
            console.error("❌ DuckDB setup error:", error);
            
            if (typeof opt !== "undefined" && opt.error) {
                opt.error("Error setting up DuckDB parquet processing: " + error.message);
            } else {
                _alert("Error setting up DuckDB parquet processing: " + error.message);
            }
        }
    };

    /* End of legacy __checkGeoParquetMetadata function */

    /**
     * __processWithHyparquet (LEGACY - Commented out, replaced by DuckDB WASM)
     * helper method to process parquet data once hyparquet is loaded
     * @param parquetBuffer ArrayBuffer containing parquet data
     * @param opt options object
     * @param hyparquet the loaded hyparquet module
     * @type void
     */
    /*
        Data.Feed.prototype.__processWithHyparquet = function (parquetBuffer, opt, hyparquet) {
        try {
            _LOG("Processing parquet data with hyparquet, buffer size: " + parquetBuffer.byteLength + " bytes");
            _LOG("Hyparquet object: " + JSON.stringify(hyparquet));
            _LOG("Available hyparquet methods: " + Object.keys(hyparquet).join(', '));
            
            // Check for parquet magic number (PAR1)
            if (parquetBuffer.byteLength < 4) {
                throw new Error("File too small to be a valid parquet file");
            }
            
            const uint8Array = new Uint8Array(parquetBuffer);
            const magic = String.fromCharCode(...uint8Array.slice(0, 4));
            _LOG("Parquet file magic number: " + magic);
            _LOG("Parquet file size: " + parquetBuffer.byteLength + " bytes");
            _LOG("First 16 bytes: " + Array.from(uint8Array.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Additional buffer analysis
            _LOG("Buffer analysis:");
            _LOG("  - Total bytes: " + parquetBuffer.byteLength);
            _LOG("  - Last 16 bytes: " + Array.from(uint8Array.slice(-16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
            _LOG("  - Buffer constructor: " + parquetBuffer.constructor.name);
            _LOG("  - Is ArrayBuffer: " + (parquetBuffer instanceof ArrayBuffer));
            
            if (magic !== 'PAR1') {
                throw new Error("File does not appear to be a valid parquet file (missing PAR1 magic number). Magic: " + magic);
            }
            
            _LOG("Valid parquet file detected, processing with hyparquet...");
            
            // Check if parquetReadObjects method exists
            if (typeof hyparquet.parquetReadObjects !== 'function') {
                throw new Error("parquetReadObjects method not found in hyparquet. Available methods: " + Object.keys(hyparquet).join(', '));
            }
            
            _LOG("Calling hyparquet.parquetReadObjects...");
            
            // Check available methods first
            _LOG("Available hyparquet methods: " + Object.keys(hyparquet).join(', '));
            
           // Try different approaches for hyparquet
            let result;
            try {
                _LOG("Using original ArrayBuffer, size: " + parquetBuffer.byteLength + " bytes");
                _LOG("ArrayBuffer constructor: " + parquetBuffer.constructor.name);
                _LOG("ArrayBuffer isView: " + ArrayBuffer.isView(parquetBuffer));
                _LOG("ArrayBuffer byteLength: " + parquetBuffer.byteLength);
                
                // Verify ArrayBuffer is valid
                if (!(parquetBuffer instanceof ArrayBuffer)) {
                    throw new Error("parquetBuffer is not an ArrayBuffer: " + typeof parquetBuffer);
                }
                // First try the standard method with ArrayBuffer
                if (typeof hyparquet.parquetReadObjects === 'function') {
                    _LOG("Using parquetReadObjects method with ArrayBuffer...");
                    
                    // Check if compressors are available
                    if (hyparquet.compressors) {
                        _LOG("✅ Compressors available: " + Object.keys(hyparquet.compressors).join(', '));
                        if (hyparquet.compressors.zstd) {
                            _LOG("✅ ZSTD compression supported!");
                            _LOG("ZSTD compressor details:", hyparquet.compressors.zstd);
                        }
                        _LOG("Full compressors object:", hyparquet.compressors);
                    } else {
                        _LOG("⚠️ No compressors available - ZSTD files may not work");
                        _LOG("Hyparquet object keys:", Object.keys(hyparquet));
                        _LOG("Window compressors available:", window.compressors ? Object.keys(window.compressors) : 'None');
                    }
                    
                    // Try to get compressors from multiple sources
                    let availableCompressors = null;
                    
                    if (hyparquet.compressors) {
                        availableCompressors = hyparquet.compressors;
                        _LOG("Using compressors from hyparquet.compressors");
                    } else if (window.compressors && window.compressors.compressors) {
                        availableCompressors = window.compressors.compressors;
                        _LOG("Using compressors from window.compressors.compressors");
                    } else if (window.compressors && window.compressors.default && window.compressors.default.compressors) {
                        availableCompressors = window.compressors.default.compressors;
                        _LOG("Using compressors from window.compressors.default.compressors");
                    } else {
                        _LOG("⚠️ No compressors found anywhere - ZSTD files will fail");
                    }
                    
                    result = hyparquet.parquetReadObjects({
                        file: parquetBuffer,
                        rowStart: 0,
                        rowEnd: 100000,
                        compressors: availableCompressors  // Pass the found compressors
                    });
                } else if (typeof hyparquet.read === 'function') {
                    _LOG("Using read method with ArrayBuffer...");
                    result = hyparquet.read(parquetBuffer);
                } else if (typeof hyparquet.parse === 'function') {
                    _LOG("Using parse method with ArrayBuffer...");
                    result = hyparquet.parse(parquetBuffer);
                } else {
                    // Try alternative method names
                    const methodNames = ['readParquet', 'parseParquet', 'load', 'fromBuffer'];
                    let methodFound = false;
                    
                    for (const methodName of methodNames) {
                        if (typeof hyparquet[methodName] === 'function') {
                            _LOG("Using " + methodName + " method with ArrayBuffer...");
                            result = hyparquet[methodName](parquetBuffer);
                            methodFound = true;
                            break;
                        }
                    }
                    
                    if (!methodFound) {
                        throw new Error("No suitable hyparquet method found. Available: " + Object.keys(hyparquet).join(', '));
                    }
                }
                
                _LOG("Method result type: " + typeof result);
                _LOG("Method result: " + JSON.stringify(result));
                _LOG("Method result constructor: " + (result ? result.constructor.name : 'null/undefined'));
                
                if (result === null || result === undefined) {
                    throw new Error("Method returned null or undefined");
                }
            } catch (callError) {
                _LOG("Error calling hyparquet method: " + callError);
                throw new Error("Failed to call hyparquet method: " + callError);
            }
            
            // Handle both Promise and direct return
            if (result && typeof result.then === 'function') {
                // It's a Promise
                _LOG("Result is a Promise, waiting for resolution...");
                
                // Capture 'this' reference to use inside Promise callbacks
                const __this = this;
                
                result.then(function(rows) {
                    
                    try {
                        
                        // Validate that rows is an array
                        if (!Array.isArray(rows)) {
                            throw new Error("Expected rows to be an array, got: " + typeof rows);
                        }
                        
                        if (rows.length === 0) {
                            throw new Error("No rows found in parquet file");
                        }
                        
                         
                        // Extract column names from first row
                        if (!rows[0] || typeof rows[0] !== 'object') {
                            throw new Error("First row is not a valid object: " + JSON.stringify(rows[0]));
                        }
                        
                        const columns = Object.keys(rows[0]);
                        _LOG("Extracted columns: " + columns.join(', '));
                        
                        if (columns.length === 0) {
                            throw new Error("No columns found in first row");
                        }
                        
                        // Convert rows to array format
                        const dataRows = [];
                        for (let i = 0; i < rows.length; i++) {
                            const row = [];
                            for (let j = 0; j < columns.length; j++) {
                                const value = rows[i][columns[j]];
                                // Handle different data types
                                if (value === null || value === undefined) {
                                    row.push('');
                                } else if (typeof value === 'object' && value.toDate) {
                                    // Handle date objects
                                    row.push(value.toDate().toISOString());
                                } else if (typeof value === 'object') {
                                    // Handle complex objects
                                    row.push(JSON.stringify(value));
                                } else {
                                    row.push(String(value));
                                }
                            }
                            dataRows.push(row);
                        }
                        
                        _LOG("Converted " + dataRows.length + " rows with " + columns.length + " columns");
                        
                        // Create data array with header row
                        const dataA = [columns];
                        dataA.push(...dataRows);
                        
                        // Create table object using captured 'this' reference
                        console.log(opt);
                        __this.__createDataTableObject(dataA, "parquet", opt);
                        
                    } catch (error) {
                        _LOG("Error in rows processing: " + error);
                        throw new Error("Error processing parquet rows: " + error);
                    }
                }).catch(function(error) {
                    _LOG("Error in hyparquet method: " + error);
                    _LOG("Error stack: " + error.stack);
                    _LOG("Error message: " + error.message);
                    throw new Error("Error reading parquet data: " + error);
                });
            } else {
                // It's a direct return
                _LOG("Result is not a Promise, treating as direct return");
                const rows = result;
                _LOG("Direct return rows type: " + typeof rows);
                _LOG("Direct return rows value: " + JSON.stringify(rows));
                _LOG("Direct return rows constructor: " + (rows ? rows.constructor.name : 'null/undefined'));
                _LOG("Direct return rows length: " + (rows ? rows.length : 'N/A'));
                
                try {
                    _LOG("Parquet data read successfully (direct return), rows type: " + typeof rows);
                    _LOG("Rows value: " + JSON.stringify(rows));
                    
                    // Validate that rows is an array
                    if (!Array.isArray(rows)) {
                        throw new Error("Expected rows to be an array, got: " + typeof rows);
                    }
                    
                    if (rows.length === 0) {
                        throw new Error("No rows found in parquet file");
                    }
                    
                    _LOG("Number of rows: " + rows.length);
                    _LOG("First row: " + JSON.stringify(rows[0]));
                    
                    // Extract column names from first row
                    if (!rows[0] || typeof rows[0] !== 'object') {
                        throw new Error("First row is not a valid object: " + JSON.stringify(rows[0]));
                    }
                    
                    const columns = Object.keys(rows[0]);
                    _LOG("Extracted columns: " + columns.join(', '));
                    
                    if (columns.length === 0) {
                        throw new Error("No columns found in first row");
                    }
                    
                    // Convert rows to array format
                    const dataRows = [];
                    for (let i = 0; i < rows.length; i++) {
                        const row = [];
                        for (let j = 0; j < columns.length; j++) {
                            const value = rows[i][columns[j]];
                            // Handle different data types
                            if (value === null || value === undefined) {
                                row.push('');
                            } else if (typeof value === 'object' && value.toDate) {
                                // Handle date objects
                                row.push(value.toDate().toISOString());
                            } else if (typeof value === 'object') {
                                // Handle complex objects
                                row.push(JSON.stringify(value));
                            } else {
                                row.push(String(value));
                            }
                        }
                        dataRows.push(row);
                    }
                    
                    _LOG("Converted " + dataRows.length + " rows with " + columns.length + " columns");
                    
                    // Create data array with header row
                    const dataA = [columns];
                    dataA.push(...dataRows);
                    
                    // Create table object
                    this.__createDataTableObject(dataA, "parquet", opt);
                    
                } catch (error) {
                    _LOG("Error in rows processing: " + error);
                    throw new Error("Error processing parquet rows: " + error);
                }
            }
            
        } catch (error) {
            _LOG("Error processing parquet data: " + error);
            if (typeof opt !== "undefined" && opt.error) {
                opt.error("Error processing parquet data: " + error);
            } else {
                _alert("Error processing parquet data: " + error);
            }
        }
    };


    /**
     * __processGeoParquetData
     * Processes GeoParquet data and converts it to GeoJSON format
     * @param {ArrayBuffer} geoparquetBuffer ArrayBuffer containing GeoParquet data
     * @param {Object} opt options object
     * @type void
     */
    Data.Feed.prototype.__processGeoParquetData = function (geoparquetBuffer, opt) {
        const __this = this;
        
        // Check if geoparquet library is already loaded
        if (typeof window.geoparquet !== 'undefined') {
            _LOG("GeoParquet library already loaded, processing data...");
            __this.__processWithGeoParquet(geoparquetBuffer, opt, window.geoparquet);
        } else {
            _LOG("Loading GeoParquet library dynamically...");
            
            // Create script element to load geoparquet
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import { asyncBufferFromUrl, toGeoJson } from 'https://cdn.jsdelivr.net/npm/geoparquet@0.5.0/+esm';
                
                console.log("GeoParquet module imported");
                console.log("Available geoparquet methods:", Object.keys({ asyncBufferFromUrl, toGeoJson }));
                
                // Make geoparquet available globally
                window.geoparquet = { asyncBufferFromUrl, toGeoJson };
                window.geoparquetLoaded = true;
            `;
            
            // Listen for when geoparquet is loaded
            const checkLoaded = setInterval(function() {
                if (window.geoparquetLoaded && window.geoparquet) {
                    clearInterval(checkLoaded);
                    _LOG("GeoParquet module loaded successfully");
                    __this.__processWithGeoParquet(geoparquetBuffer, opt, window.geoparquet);
                }
            }, 100);
            
            // Set a timeout in case loading fails
            setTimeout(function() {
                if (!window.geoparquetLoaded) {
                    clearInterval(checkLoaded);
                    _LOG("Failed to load GeoParquet module");
                    if (typeof opt !== "undefined" && opt.error) {
                        opt.error("Failed to load GeoParquet module");
                    } else {
                        _alert("Failed to load GeoParquet module");
                    }
                }
            }, 10000); // 10 second timeout
            
            // Add the script to the document
            document.head.appendChild(script);
        }
    };

    /**
     * __processWithGeoParquet
     * Helper method to process GeoParquet data once geoparquet library is loaded
     * @param {ArrayBuffer} geoparquetBuffer ArrayBuffer containing GeoParquet data
     * @param {Object} opt options object
     * @param {Object} geoparquet the loaded geoparquet module
     * @type void
     */
    Data.Feed.prototype.__processWithGeoParquet = function (geoparquetBuffer, opt, geoparquet) {
        try {
            _LOG("Processing GeoParquet data, buffer size: " + geoparquetBuffer.byteLength + " bytes");
            _LOG("GeoParquet object: " + JSON.stringify(geoparquet));
            _LOG("Available geoparquet methods: " + Object.keys(geoparquet).join(', '));
            
            // Check for parquet magic number (PAR1)
            if (geoparquetBuffer.byteLength < 4) {
                throw new Error("File too small to be a valid parquet file");
            }
            
            const uint8Array = new Uint8Array(geoparquetBuffer);
            const magic = String.fromCharCode(...uint8Array.slice(0, 4));
            _LOG("Parquet file magic number: " + magic);
            
            if (magic !== 'PAR1') {
                throw new Error("File does not appear to be a valid parquet file (missing PAR1 magic number). Magic: " + magic);
            }
            
            _LOG("Valid parquet file detected, processing with geoparquet...");
            
            // Check if toGeoJson method exists
            if (typeof geoparquet.toGeoJson !== 'function') {
                throw new Error("toGeoJson method not found in geoparquet. Available methods: " + Object.keys(geoparquet).join(', '));
            }
            
            _LOG("Calling geoparquet.toGeoJson...");
            
            // Convert GeoParquet to GeoJSON
            const geoJson = geoparquet.toGeoJson({ file: geoparquetBuffer });
            
            _LOG("GeoJSON conversion result type: " + typeof geoJson);
            _LOG("GeoJSON conversion result: " + JSON.stringify(geoJson));
            
            // Handle both Promise and direct return
            if (geoJson && typeof geoJson.then === 'function') {
                // It's a Promise
                _LOG("GeoJSON conversion is a Promise, waiting for resolution...");
                
                const __this = this;
                
                geoJson.then(function(geoJsonData) {
                    try {
                        _LOG("GeoJSON conversion completed successfully");
                        _LOG("GeoJSON type: " + geoJsonData.type);
                        _LOG("Number of features: " + (geoJsonData.features ? geoJsonData.features.length : 'unknown'));
                        
                        // Process the GeoJSON data
                        __this.__processGeoJsonData(geoJsonData, opt);
                        
                    } catch (error) {
                        _LOG("Error processing GeoJSON data: " + error);
                        throw new Error("Error processing GeoJSON data: " + error);
                    }
                }).catch(function(error) {
                    _LOG("Error in GeoJSON conversion: " + error);
                    _LOG("Error stack: " + error.stack);
                    _LOG("Error message: " + error.message);
                    
                    if (typeof opt !== "undefined" && opt.error) {
                        opt.error("Error converting GeoParquet to GeoJSON: " + error);
                    } else {
                        _alert("Error converting GeoParquet to GeoJSON: " + error);
                    }
                });
            } else {
                // Direct return
                _LOG("GeoJSON conversion returned directly");
                
                if (!geoJson) {
                    throw new Error("GeoJSON conversion returned null or undefined");
                }
                
                _LOG("GeoJSON type: " + geoJson.type);
                _LOG("Number of features: " + (geoJson.features ? geoJson.features.length : 'unknown'));
                
                // Process the GeoJSON data
                this.__processGeoJsonData(geoJson, opt);
            }
            
        } catch (error) {
            _LOG("Error processing GeoParquet data: " + error);
            if (typeof opt !== "undefined" && opt.error) {
                opt.error("Error processing GeoParquet data: " + error);
            } else {
                _alert("Error processing GeoParquet data: " + error);
            }
        }
    };


    // ---------------------------------
    // C R E A T E   D A T A   T A B L E 
    // ---------------------------------

    /**
     * __createTableDataObject 
     * finally make the data object with the iXmaps data structure
     * @type void
     */
    Data.Feed.prototype.__createDataTableObject = function (dataA, szType, opt) {

        if (dataA) {
            
            this.dbtable = new Data.Table().setArray(dataA);
            dataA = null;

            if ((typeof (opt) != "undefined") && opt.success) {
                opt.success(this.dbtable);
            } else {
                _LOG("callback to call on succes is 'undefined'!");
            }

            return;
        }
    };

    /**
     * Create a new Data.Table instance.  
     * <p>All data loaded by the methods <b>.feed()</b>, <b>.object()</b> and <b>.broker()</b> is stored in a Table instance.</p>
     * <p>The Table class provides the methods to read and process the data.</p>
     * @class It realizes an object to store <b>data</b> in <b>Data.Table </b>format and<br> provides the <b>methods</b> to load, read and process it
     * @example
     * // the data of the Table object ist stored like this example:
     * {
     *     table : {    
     *               fields:3,
     *              records:2
     *             },
     *    fields : [
     *              {id:"column 1"},
     *              {id:"column 2"},
     *              {id:"column 3"}
     *             ],
     *   records : [
     *              ["value11","value12","value13"],
     *              ["value21","value22","value23"]
     *             ]
     * }
     * @constructor
     * @type {Data.Table}
     * @returns A new Data.Table object<br><br>in the following the methods of the Data.Table to read and process the data
     */

    Data.Table = function (table) {
        if (table) {
            this.table = table.table;
            this.fields = table.fields;
            this.records = table.records;
        } else {
            this.table = {
                records: 0,
                fields: 0
            };
            this.fields = [];
            this.records = [];
        }
    };

    Data.Table.prototype = {

        /**
         * get the data of a Data.Table as 2d array
         * first row are the column names
         * @type {Array}
         * @returns table as array of arrays
         */
        getArray: function () {
            let dataA = [[]];
            for (let i = 0, len = this.fields.length; i < len; i++) {
                dataA[0].push(this.fields[i].id);
            }
            for (let i = 0, len = this.records.length; i < len; i++) {
                dataA.push(this.records[i]);
            }
            return dataA;
        },

        /**
         * set the data of a Data.Table by a given 2d array
         * first row must be the column names
         * @param {Array} dataA a 2 dimensionale array with the table data<br>first row must contain the column names
         * @type {Data.Table}
         * @return itself
         */
        setArray: function (dataA) {
            // first row of data => object.fields
            // ------------
            this.fields = [];
            for (let a = 0, len = dataA[0].length; a < len; a++) {
                this.fields.push({
                    id: (dataA[0][a] || " ").trim(),
                    typ: 0,
                    width: 60,
                    decimals: 0
                });
            }
            // following rows => object.records
            // --------------
            dataA.shift();

            // set records checking length
            this.records = [];
            for (let r = 0, len = dataA.length; r < len; r++) {
                if (dataA[r].length == this.fields.length) {
                    this.records.push(dataA[r]);
                }
            }
            this.table = {
                records: this.records.length,
                fields: this.fields.length
            };
            return this;
        },

        /**
         * revert the rows of a data table
         * @type {Data.Table}
         * @returns the reverted table
         */
        revert: function () {
            let records = [];
            for (let i = this.records.length - 1; i >= 0; i--) {
                records.push(this.records[i]);
            }
            this.records = records;
            return this;
        },

        /**
         * reverse the rows of a data table
         * @type {Data.Table}
         * @return the reversed table
         */
        reverse: function () {
            let records = [];
            for (let i = this.records.length - 1; i >= 0; i--) {
                records.push(this.records[i]);
            }
            this.records = records;
            return this;
        },

        /**
         * get an array of the column names
         * @type {Array}
         * @returns an array with the column names
         */
        columnNames: function () {
            const fieldsA = [];
            for (let i = 0, len = this.fields.length; i < len; i++) {
                fieldsA.push(this.fields[i].id);
            }
            return fieldsA;
        },

        /**
         * get the index of a column by its name<br>
         * useful if you have the values of one data row as array and want to access a column value
         * @param {string} columnName the name of the column
         * @type {number}
         * @return {number} the index of the column or null
         */
        columnIndex: function (szColumn) {
            for (var i in this.fields) {
                if (this.fields[i].id == szColumn) {
                    return i;
                }
            }
            return null;
        },

        /**
         * get a column object for one column from the Data.Table<br>
         * the column object provides methods to read or map the column values
         * @param {string} columnName the name of the column to get a handle to
         * @type {Data.Column}
         * @returns {Data.Column} Data.Column object
         * @example
         * var myfeed = new Data.Feed("Segnalazioni",{"source":szUrl,"type":"csv"}).load(function(mydata){
         *    var dateArray = mydata.column('created_at').values();
         *    ...
         * });
         */
        column: function (szColumn) {
            for (let i in this.fields) {
                if (this.fields[i].id == szColumn) {
                    const column = new Data.Column();
                    column.index = i;
                    column.table = this;
                    return column;
                }
            }
            return null;
        },

        /**
         * get an associative array of the values of two columns like array[String(lookup column value)] = value
         * @param {string} szValue the name of the value column
         * @param {string} szLookup the name of the lookup value column
         * @type {Array}
         * @return {Array} associative array for lookup
         * @example
         * id           nome
         * -------------------------------------------
         * 00000000000  ITALIA
         * 01000000000  PIEMONTE 1
         * 01100000000  PIEMONTE 1 - 01
         * 01110000000  01 TORINO - ZONA STATISTICA 16
         * 01110812620  TORINO - PIEMONTE 1 - 01 - 01
         * 01120000000  02 TORINO - ZONA STATISTICA 38
         * ...
         *
         * // create assoc.array with id ==> nome from camera_geopolitico_italia.csv (id == ELIGENDO_C_UID_CI)
         * var nomeA = camera_geopolitico_italia.lookupArray("nome","id");
         *
         * ['00000000000']="ITALIA";
         * ['01000000000']="PIEMONTE 1";
         * ['01100000000']="PIEMONTE 1 - 01";
         * ['01110000000']="01 TORINO - ZONA STATISTICA 16";
         * ['01110812620']="TORINO - PIEMONTE 1 - 01 - 01";
         * ['01120000000']="02 TORINO - ZONA STATISTICA 38";
         * ...
         *
         */
        lookupArray: function (szValue, szLookup) {

            let calc = "overwrite";

            // GR 06.09.2021 new argument object {}
            if (szValue && szValue.key) {
                calc = szValue.calc || calc;
                szLookup = szValue.key;
                szValue = szValue.value;
            }

            let lookupA = [];
            if (!this.column(szLookup)) {
                alert("'" + szLookup + "' column not found!");
            }
            if (!this.column(szValue)) {
                alert("'" + szValue + "' column not found!");
            }

            const idA = this.column(szLookup).values();
            const valueA = this.column(szValue).values();
            if (calc == "sum") {
                for (let i = 0, len = idA.length; i < len; i++) {
                    lookupA[String(idA[i])] = (lookupA[String(idA[i])] || 0) + valueA[i];
                }
            } else
            if (calc == "max") {
                for (let i = 0, len = idA.length; i < len; i++) {
                    lookupA[String(idA[i])] = Math.max(lookupA[String(idA[i])] || 0, valueA[i]);
                }
            } else {
                for (let i = 0, len = idA.length; i < len; i++) {
                    lookupA[String(idA[i])] = valueA[i];
                }
            }
            return lookupA;
        },

        /**
         * get an associative array of the values of two columns like array[String(lookup column value)] = value
         * in difference to lookupArray, this method creates a concatenated string in case of multiple values
         * only for string values, creates a comma separated risultive string 
         * @param {string} szValue the name of the value column
         * @param {string} szLookup the name of the lookup value column
         * @type {Array}
         * @returns {Array} associative array for lookup
         * @example
         * id           nome
         * -------------------------------------------
         * 00000000000  ITALIA
         * 00000000000  PIEMONTE 1
         * 01100000000  PIEMONTE 1 - 01
         * 01100000000  01 TORINO - ZONA STATISTICA 16
         * 01110812620  TORINO - PIEMONTE 1 - 01 - 01
         * 01120000000  02 TORINO - ZONA STATISTICA 38
         * ...
         *
         * // create assoc.array with id ==> nome from camera_geopolitico_italia.csv (id == ELIGENDO_C_UID_CI)
         * var nomeA = camera_geopolitico_italia.lookupArray("nome","id");
         *
         * ['00000000000']="ITALIA, PIEMONTE 1";
         * ['01100000000']="PIEMONTE 1 - 01, 01 TORINO - ZONA STATISTICA 16";
         * ['01110812620']="TORINO - PIEMONTE 1 - 01 - 01";
         * ['01120000000']="02 TORINO - ZONA STATISTICA 38";
         * ...
         *
         */
        lookupStringArray: function (szValue, szLookup) {

            // GR 06.09.2021 new argument object {}
            if (szValue && szValue.key) {
                szLookup = szValue.key;
                szValue = szValue.value;
            }

            let lookupA = [];
            if (!this.column(szLookup)) {
                alert("'" + szLookup + "' column not found!");
            }
            if (!this.column(szValue)) {
                alert("'" + szValue + "' column not found!");
            }

            const idA = this.column(szLookup).values();
            const valueA = this.column(szValue).values();
            for (let i = 0, len = idA.length; i < len; i++) {
                lookupA[String(idA[i])] = (lookupA[String(idA[i])] ? (lookupA[String(idA[i])] + ", " + valueA[i]) : valueA[i]);
            }
            return lookupA;
        },

        /**
         * get the value of a column cell by the known value of a lookup column
         * @param value the value we know 
         * @param {Object} option a json structure with {value:value column name, lookup:lookup column name} 
         * @type {string}
         * @return the found value 
         */
        lookup: function (value, option) {
            const colValue = option.value;
            const colLookup = option.lookup;
            const sCacheId = colValue + "_" + colLookup;
            if (!(this.lookupsA && this.lookupsA[sCacheId])) {
                this.lookupsA = this.lookupsA || [];
                this.lookupsA[sCacheId] = this.lookupArray(colValue, colLookup);
            }
            return (this.lookupsA[sCacheId][value] || "-");
        },

        /**
         * get a key value array (associative array) with the values of two columns
         * @param {Object} option a json structure with {key:key column name, value:value column name} 
         * @type {Array}
         * @return {Array} associative array with key/value pairs
         * @example
         * id           nome
         * -------------------------------------------
         * 00000000000  ITALIA
         * 01000000000  PIEMONTE 1
         * 01100000000  PIEMONTE 1 - 01
         * 01110000000  01 TORINO - ZONA STATISTICA 16
         * 01110812620  TORINO - PIEMONTE 1 - 01 - 01
         * 01120000000  02 TORINO - ZONA STATISTICA 38
         * ...
         *
         * // create assoc.array with id ==> nome from camera_geopolitico_italia.csv (id == ELIGENDO_C_UID_CI)
         * var nomeA = camera_geopolitico_italia.toKeyValue({key:"id", value:"nome"});
         *
         * ['00000000000']="ITALIA";
         * ['01000000000']="PIEMONTE 1";
         * ['01100000000']="PIEMONTE 1 - 01";
         * ['01110000000']="01 TORINO - ZONA STATISTICA 16";
         * ['01110812620']="TORINO - PIEMONTE 1 - 01 - 01";
         * ['01120000000']="02 TORINO - ZONA STATISTICA 38";
         * ...
         *
         */
        toKeyValue: function (option) {
            return this.lookupArray(option.value, option.key);
        },

        /**
         * creates a new column based on existing ones<br>
         * the values of the new column are defined by a user function, which receives data from the actual row and must returns the new value
         * @param {Object} options the creation parameter
         *								   <table border='0' style='border-left: 1px solid #ddd;'>	
         *								   <tr><th>property</th><th>description</th></tr>
         *								   <tr><td><b>"source"</b></td><td>[optional] the name of the source column </td></tr>
         *								   <tr><td><b>"destination"</b></td><td>the name of the new colmn to create</td></tr>
         *								   </table> 
         * @param {function(currentValue)} function(currentValue) Required: A function to be run for each element in the array
         *								   <br>Function arguments:<br>
         *								   <table border='0' style='border: 1px solid #ddd;margin:0.5em 0em'>	
         *								   <tr><th>argument</th><th>description</th></tr>
         *								   <tr><td>currentValue</td><td>the value of the current source column cell or<br>an array of all values of the current row, if non source column is defined</td></tr>
         *								   </table> 
         *  Must return the values for the new column.<br>
         *  It is called for every row of the table and receives as parameter the value
         *  of the source column, or, if no source column defined, an array of all values of the table row.
         * @type {Data.Table}
         * @returns {Data.Table} the enhanced table
         * @example
         *    mydata = mydata.addColumn({'source':'created_at','destination':'date'},
         *        function(value){
         *            var d = new Date(__normalizeTime(value));
         *            return( String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear()) );
         *     });
         *
         */
        addColumn: function (options, callback) {

            if (!options.destination) {
                alert("'data.addColumn' no destination defined!");
                return null;
            }
            var column = null;
            if (options.source) {
                for (let i = 0, len = this.fields.length; i < len; i++) {
                    if (this.fields[i].id == options.source) {
                        column = i;
                    }
                }
                if (column == null) {
                    alert("'data.addColumn' source column '" + options.source + "' not found!");
                    return null;
                }
            }

            // add new column name
            this.fields.push({
                id: String(options.destination),
                created: true
            });
            this.table.fields++;

            // add new column values
            // ---------------------
            if (callback && (typeof (callback) == "function")) {
                for (let j = 0, len = this.records.length; j < len; j++) {
                    this.records[j].push((column != null) ? callback(this.records[j][column],this.records[j]) : callback(this.records[j]));
                }
            } else
            if (callback && (typeof (callback) == "object")) {
                for (let j = 0, len = this.records.length; j < len; j++) {
                    this.records[j].push(callback[j] || 0);
                }
            } else
            if (options.values && (typeof (options.values) == "object")) {
                for (let j = 0, len = this.records.length; j < len; j++) {
                    this.records[j].push(options.values[j] || 0);
                }
            } else {
                for (let j = 0, len = this.records.length; j < len; j++) {
                    this.records[j].push(0);
                }
            }

            return this;
        },

        /**
         * adds a row to the data<br>
         * the values of columns are defined by a JSON Object, which defines values for selected columns; non defined columns are set to ' '
         * @param {Object} options the creation parameter
         *								   <table border='0' style='border-left: 1px solid #ddd;'>	
         *								   <tr><th>property</th><th>description</th></tr>
         *								   <tr><td><b>"column name"</b></td><td>value</td></tr>
         *								   <tr><td><b>"column name"</b></td><td>value</td></tr>
         *								   </table> 
         * @type {Data.Table}
         * @return {Data.Table} the enhanced table
         * @example
         *    mydata = mydata.addRow({'column 1':'Rossi','column 2':'Aldo'} );
         */
        addRow: function (options) {

            if (!options || (typeof options !== "object")) {
                alert("'data.addRow' no options defined!");
                return null;
            }
            // create new empty row
            var row = [];
            for (let i = 0, len = this.fields.length; i < len; i++) {
                row.push("");
            }
            // set user values
            for (var i in options) {
                if (this.column(i)) {
                    row[this.column(i).index] = options[i];
                } else {
                    alert("'data.addRow' column '" + i + "' not found!");
                }
            }
            // add the new row to the data table
            this.records.push(row);
            this.table.records++;

            return this;
        },

        /**
         * filter rows from a dbtable objects data by callback
         * @param {function} the user defined filter function, must return 0 or 1 
         * @type {Data.Table}
         * @returns {Data.Table}
         * @example
         *    mydata.filter(
         *        function(row){
         *            return( (row[0] == 'filtervalue') ? 1 : 0 );
         *     });
         */
        filter: function (callback) {

            this.selection = new Data.Table();

            for (const j in this.records) {
                if (callback && callback(this.records[j])) {
                    this.selection.records.push(this.records[j]);
                    this.selection.table.records++;
                }
            }
            this.selection.fields = this.fields.slice();
            this.selection.table.fields = this.table.fields;
            return this.selection;
        },

        /**
         * select rows from a dbtable objects data by SQL query
         * @param {string} szSelection the selection query string<br>WHERE "<em>column name</em>" [operator] "<em>selection value</em>" 
         *<table class="w3-table-all notranslate">
         * <tr>
         *    <th style="width:20%">Operator</th>
         *    <th>Description</th>
         *  </tr>
         *  <tr>
         *    <td>=</td>
         *    <td>Equal</td>
         *  </tr>
         *  <tr>
         *    <td>&lt;&gt;</td>
         *    <td>Not equal. <b>Note:</b> In some versions of SQL this operator may be written as !=</td>
         *  </tr>
         *  <tr>
         *    <td>&gt;</td>
         *    <td>Greater than</td>
         *  </tr>
         *  <tr>
         *    <td>&lt;</td>
         *    <td>Less than</td>
         *  </tr>
         *  <tr>
         *    <td>&gt;=</td>
         *    <td>Greater than or equal</td>
         *  </tr>
         *  <tr>
         *   <td>&lt;=</td>
         *   <td>Less than or equal</td>
         * </tr>
         * <tr>
         *   <td>BETWEEN</td>
         *   <td>Between an inclusive range;<br> example: WHERE "<em>column</em>" BETWEEN "<em>value1</em>" AND "<em>value2</em>"</td>
         * </tr>
         * <tr>
         *   <td>LIKE</td>
         *   <td>Search for a pattern</td>
         * </tr>
         * <tr>
         *   <td>NOT</td>
         *   <td>Must not contain pattern</td>
         * </tr>
         *  <tr>
         *    <td>IN</td>
         *   <td>To specify multiple possible values for a column;<br> example: WHERE "<em>column</em>" IN "<em>value1,value2,value3</em>"</td>
         *  </tr>
         *</table>
         * @type {Data.Table}
         * @returns {Data.Table} object with the selection result in dbTable format
         * @example
         * var mydata   =  mydata.select('WHERE description like "montana"');
         * var ageTotal = rawdata.select('WHERE "Age" = "Total" AND "SEX" = "MW" AND "Series" = "Labour force participation rate"');
         * var ageWork  = rawdata.select('WHERE "Age" BETWEEN "18" AND "65"');
         */
        select: function (szSelection) {

            if (szSelection.match(/WHERE/)) {

                // first time ?
                // get query parts

                if (1) {

                    // tokenize
                    // ---------
                    let szTokenA = szSelection.split('WHERE')[1].trim().split(' ');

                    // test for quotes and join the included text parts
                    for (let ii = 0; ii < szTokenA.length; ii++) {
                        if (szTokenA[ii].length) {
                            if ((szTokenA[ii][0] == '"') && (szTokenA[ii][szTokenA[ii].length - 1] != '"')) {
                                do {
                                    szTokenA[ii] = szTokenA[ii] + " " + szTokenA[ii + 1];
                                    szTokenA.splice(ii + 1, 1);
                                }
                                while (szTokenA[ii][szTokenA[ii].length - 1] != '"');
                            }
                            if ((szTokenA[ii][0] == '(') && (szTokenA[ii][szTokenA[ii].length - 1] != ')')) {
                                do {
                                    szTokenA[ii] = szTokenA[ii] + " " + szTokenA[ii + 1];
                                    szTokenA.splice(ii + 1, 1);
                                }
                                while (szTokenA[ii][szTokenA[ii].length - 1] != ')');
                            }
                        } else {
                            szTokenA.splice(ii, 1);
                            ii--;
                        }
                    }
                    this.filterQueryA = [];
                    let filterObj = {};

                    let szCombineOp = "";

                    // make the query object(s)
                    // ------------------------
                    do {
                        let nToken = 0;

                        if (szTokenA.length >= 3) {
                            filterObj = {};
                            filterObj.szSelectionField = szTokenA[0].replace(/("|)/g, "");
                            filterObj.szSelectionOp = szTokenA[1];
                            filterObj.szSelectionValue = szTokenA[2].replace(/("|)/g, "");
                            nToken = 3;
                        }
                        if (filterObj.szSelectionOp == "BETWEEN") {
                            if (szTokenA.length >= 5) {
                                if (szTokenA[3] == "AND") {
                                    filterObj.szSelectionValue2 = szTokenA[4];
                                    nToken = 5;
                                }
                            }
                        }

                        if (nToken) {

                            // get data table column index for query field
                            for (let ii = 0; ii < this.fields.length; ii++) {
                                if (this.fields[ii].id == filterObj.szSelectionField) {
                                    filterObj.nFilterFieldIndex = ii;
                                }
                                // GR 26.12.2019 filter value may be column name (defined by $column name$)
                                if (("$" + this.fields[ii].id + "$") == filterObj.szSelectionValue) {
                                    filterObj.nFilterValueIndex = ii;
                                }
                            }
                            // set query combine operator 
                            filterObj.szCombineOp = szCombineOp;

                            // add the query object
                            this.filterQueryA.push(filterObj);
                            szTokenA.splice(0, nToken);

                        } else {
                            _alert("data.js - selection error - incomplete query!\nquery: " + szSelection);
                            break;
                        }

                        // only 'AND' combination (OR tdb)
                        if (szTokenA.length && (szTokenA[0] == "AND")) {
                            szCombineOp = "AND";
                            szTokenA.splice(0, 1);
                        } else
                        if (szTokenA.length && (szTokenA[0] == "OR")) {
                            szCombineOp = "OR";
                            szTokenA.splice(0, 1);
                        } else {
                            break;
                        }
                    }
                    while (szTokenA.length);

                }

                this.selection = new Data.Table();

                for (let i = 0; i < this.filterQueryA.length; i++) {
                    if (typeof this.filterQueryA[i].nFilterFieldIndex === "undefined") {
                        this.selection.fields = this.fields.slice();
                        this.selection.table.fields = this.table.fields;
                        _LOG("Selection: invalid query: " + szSelection);
                        return this.selection;
                    }
                }

                for (let j = 0, len = this.records.length; j < len; j++) {

                    let allResult = null;

                    for (let i = 0, lenQA = this.filterQueryA.length; i < lenQA; i++) {

                        let result = true;
                        // get the value to test
                        this.__szValue = String(this.records[j][this.filterQueryA[i].nFilterFieldIndex]);
                        this.__szSelectionOp = this.filterQueryA[i].szSelectionOp.toUpperCase();
                        this.__szSelectionValue = this.filterQueryA[i].szSelectionValue;
                        this.__szSelectionValue2 = this.filterQueryA[i].szSelectionValue2;
                        this.__szCombineOp = this.filterQueryA[i].szCombineOp;

                        // GR 26.12.2019 filter value may be column name
                        if (this.filterQueryA[i].nFilterValueIndex != null) {
                            this.__szSelectionValue = String(this.records[j][this.filterQueryA[i].nFilterValueIndex]);
                        }

                        // do the query 
                        // ------------
                        let nValue = __scanValue(this.__szValue);
                        if (this.__szSelectionOp == "=") {
                            if (this.__szSelectionValue == '*') {
                                result = (this.__szValue.replace(/ /g, "") != "");
                            } else {
                                result = ((this.__szValue == this.__szSelectionValue) || (nValue == Number(this.__szSelectionValue)));
                            }
                        } else
                        if (this.__szSelectionOp == "<>") {
                            result = !((this.__szValue == this.__szSelectionValue) || (nValue == Number(this.__szSelectionValue)));
                        } else
                        if (this.__szSelectionOp == ">") {
                            result = (nValue > Number(this.__szSelectionValue));
                        } else
                        if (this.__szSelectionOp == "<") {
                            result = (nValue < Number(this.__szSelectionValue));
                        } else
                        if (this.__szSelectionOp == ">=") {
                            result = (nValue >= Number(this.__szSelectionValue));
                        } else
                        if (this.__szSelectionOp == "<=") {
                            result = (nValue <= Number(this.__szSelectionValue));
                        } else
                        if (this.__szSelectionOp == "LIKE") {
                            if (this.__szSelectionValue == "*") {
                                result = this.__szValue.length;
                            } else {
                                // Escape regex special characters in the value
                                const pattern = this.__szSelectionValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const regex = new RegExp(pattern, "i");
                                result = regex.test(this.__szValue);
                            }
                        } else
                        if (this.__szSelectionOp == "NOT") {
                            const pattern = this.__szSelectionValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(pattern, "i");
                            result = !regex.test(this.__szValue);
                        } else
                        if (this.__szSelectionOp == "IN") {
                            // Assume values are comma-separated
                            const values = this.__szSelectionValue.split(",").map(v => v.trim());
                            result = values.includes(this.__szValue);
                        } else
                        if ((this.__szSelectionOp == "BETWEEN")) {
                            result = ((nValue >= Number(this.__szSelectionValue)) &&
                                (nValue <= Number(this.__szSelectionValue2)));
                        } else {
                            // default operator
                            const pattern = this.__szSelectionValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(pattern, "i");
                            result = regex.test(this.__szValue);
                        }
                        if (this.__szCombineOp == "AND") {
                            allResult = (allResult && result);
                        } else {
                            allResult = (allResult || result);
                        }
                    }
                    if (allResult) {
                        this.selection.records.push(this.records[j].slice());
                        this.selection.table.records++;
                    }
                }
            }
            this.selection.fields = this.fields.slice();
            this.selection.table.fields = this.table.fields;
            return this.selection;
        },

        /**
         * aggregate the values of one column for the unique values of one or more other columns<br>
         * usefull to transform journals with more than one qualifying column (time, product class, ...)<br>
         * into something like a pivot table 
         * @param {string} valueColumn the value source
         * @param {string} aggregateColumn the aggregation leads; more than one column can be defined with seperator '|'<br>example: "month|type"
         * @type {Data.Table}
         * @returns {Data.Table} object with the aggregation result in dbTable format
         * @example
         *  myData.aggregate("value","month|type");
         *	     
         *  // "value"     : the value source column is named "value"
         *  // "month|type": columns "month" and "type" will lead the aggregation
         * @example
         *  if the source table is like:
         *
         *  "data"     "month" "day" "hour" "operator" "type" "value"
         *  2015/07/15 "jul"   15    03     "everyone" "wood" 15  
         *  2015/07/15 "jul"   15    06     "clerk"    "iron" 25  
         *  2015/07/16 "jul"   16    11     "clerk"    "iron" 32  
         *  2015/07/22 "jul"   16    15     "carp"     "wood" 17  
         *  2015/08/02 "aug"   02    22     "carp"     "wood" 22  
         *  ...
         *
         *  the result will be:
         *
         *  "month" "type" "value"
         *  "jul"   "wood"  32
         *  "jul"   "iron"  57 
         *  "aug"   "wood"  22 
         *
         */
        aggregate: function (szColumn, szAggregate) {

            let mean = false;

            // GR 06.09.2021 new argument object {}
            if (szColumn.lead) {
                mean = (szColumn.calc && (szColumn.calc == "mean"));
                szAggregate = szColumn.lead;
                szColumn = szColumn.column || szColumn.value;
            }

            const szAggregateA = szAggregate.split("|");
            const nAggregateIndexA = [];

            let nValueIndex = null;

            for (let i = 0; i < szAggregateA.length; i++) {
                for (let ii = 0; ii < this.fields.length; ii++) {
                    if (this.fields[ii].id == szAggregateA[i]) {
                        nAggregateIndexA[i] = ii;
                    }
                    if (this.fields[ii].id == szColumn) {
                        nValueIndex = ii;
                    }
                }
            }

            this.aggregation = new Data.Table();

            xRecords = [];
            xCount = [];
            for (let j = 0, len = this.records.length; j < len; j++) {
                const fieldParts = [];
                for (let i = 0, lenA = nAggregateIndexA.length; i < lenA; i++) {
                    fieldParts.push(this.records[j][nAggregateIndexA[i]]);
                }
                const xField = fieldParts.join("");
                if (xRecords[xField]) {
                    xRecords[xField][nAggregateIndexA.length] += __scanValue(this.records[j][nValueIndex]);
                    xCount[xField][nAggregateIndexA.length]++;
                } else {
                    xRecords[xField] = [];
                    xRecords[xField][nAggregateIndexA.length] = __scanValue(this.records[j][nValueIndex]);
                    for (let i = 0; i < nAggregateIndexA.length; i++) {
                        xRecords[xField][i] = this.records[j][nAggregateIndexA[i]];
                    }
                    xCount[xField] = [];
                    xCount[xField][nAggregateIndexA.length] = 1;
                }
            }

            for (let j = 0, len = xRecords.length; j < len; j++) {
                if (mean) {
                    xRecords[j][nAggregateIndexA.length] /= xCount[j][nAggregateIndexA.length];
                }
                this.aggregation.records.push(xRecords[j]);
                this.aggregation.table.records++;
            }

            const fields = [];
            for (let i = 0; i < szAggregateA.length; i++) {
                fields[i] = {
                    id: szAggregateA[i]
                };
            }
            fields[szAggregateA.length] = {
                id: szColumn
            };

            this.aggregation.fields = fields;
            this.aggregation.table.fields = fields;

            return this.aggregation;
        },

        /**
         * condense (aggregate) the rows of a table by the unique values of one column <br>
         * sums the numeric values of the rows with the same leed column value<br>
         * don't sum the values of columns defined as 'keep' in the 'option'
         * @param {string} leadColumn the column of the values to make unique
         * @param {Object} option parameter
         * @type {Data.Table}
         * @returns the condensed table
         * @example
         *  data.condense({lead:'name',keep:'codice'});
         *
         *  if the source table is like:
         *
         *  "name"     "codice" "hours"
         *  "everyone" "001"     15  
         *  "clerk"    "002"     25  
         *  "clerk"    "002"     32  
         *  "carp"     "005"     17  
         *  "carp"     "005"     22  
         *  ...
         *
         *  the result will be:
         *
         *  "name"     "codice" "value"
         *  "everyone" "001"     15
         *  "clerk"    "002"     57 
         *  "carp"     "005"     39 
         *
         */
        condense: function (szColumn, option) {

            const uniqueA = {};
            const keepIndexA = [];

            // GR 06.09.2021 new argument object {}
            if (szColumn && szColumn.lead) {
                option = szColumn;
                szColumn = option.lead;
            }

            const uniqueIndex = this.columnIndex(szColumn);

            if (option && option.keep) {
                // option.keep is string
                if (typeof (option.keep) == "string") {
                    keepIndexA[this.columnIndex(option.keep)] = true;
                } else
                    // or array of strings
                    for (i = 0; i < option.keep.length; i++) {
                        keepIndexA[this.columnIndex(option.keep[i])] = true;
                    }
            }
            const __newRecords = [];
            for (let j = 0; j < this.records.length; j++) {
                const szTest = String(this.records[j][uniqueIndex]);
                if (uniqueA[szTest] != null) {
                    const k = uniqueA[szTest];
                    for (let v = 0, len = this.records[j].length; v < len; v++) {
                        if (!keepIndexA[v]) {
                            if (!isNaN(this.records[j][v])) {
                                if (option && option.calc == "max") {
                                    __newRecords[k][v] = Math.max(Number(__newRecords[k][v]), Number(this.records[j][v]));
                                } else {
                                    __newRecords[k][v] = Number(__newRecords[k][v]) + Number(this.records[j][v]);
                                }
                            } else {
                                if (isNaN(this.records[j][v]) && (__newRecords[k][v] != this.records[j][v])) {
                                    let n = parseFloat(String(__newRecords[k][v]).split(" (+")[1]) || 0;
                                    __newRecords[k][v] = String(__newRecords[k][v]).split(" (+")[0] + " (+" + (++n) + ") ";
                                }
                            }
                        }
                    }
                } else {
                    __newRecords.push(this.records[j].slice());
                    uniqueA[szTest] = __newRecords.length - 1;
                }
            }
            
            this.__condense = new Data.Table();
            this.__condense.fields = this.fields;
            this.__condense.table.fields = this.fields;
            this.__condense.records = __newRecords.slice();
            this.__condense.table.records = this.__condense.records.length;

            return this.__condense;
        },

        /**
         * creates a new column based on existing ones<br>
         * the values of the new column are the sum of the source columns
         * @param {Object} options the creation parameter
         *								   <table border='0' style='border-left: 1px solid #ddd;'>	
         *								   <tr><th>property</th><th>description</th></tr>
         *								   <tr><td><b>"source"</b></td><td>the name of the source columns </td></tr>
         *								   <tr><td><b>"destination"</b></td><td>the name of the new colmn to create</td></tr>
         *								   </table> 
         * @type {Data.Table}
         * @returns {Data.Table} the enhanced table
         * @example
         *    mydata = mydata.groupColumns({'source':['col_1','col_2'],'destination':'col_sum'});
         *
         */
        groupColumns: function (options) {

            let sourceA = options.source;
            let iA = [];
            for (let i = 0, len = sourceA.length; i < len; i++) {
                iA[i] = this.column(sourceA[i]).index;
            }
            this.addColumn({
                destination: options.destination
            }, function (row) {
                let value = 0;
                for (let i = 0, len = iA.length; i < len; i++) {
                    value += Number(row[iA[i]]);
                }
                return value;
            });

            return this;
        },

        /**
         * creates a pivot table <br>
         * @param {Object} options the pivot creation parameter
         *<table class="w3-table-all notranslate">
         * <tr>
         *    <th style="width:20%">Property</th>
         *    <th>Description</th>
         *  </tr>
         *  <tr>
         *    <td>lead</td>
         *    <td>the sourcetable field that defines the pivot rows</td>
         *  </tr>
         *  <tr>
         *    <td>keep</td>
         *    <td>columns of the sourcetable to copy into the pivot</td>
         *  </tr>
         *  <tr>
         *    <td>sum</td>
         *    <td>columns of the sourcetable to copy and sum into the pivot</td>
         *  </tr>
         *  <tr>
         *    <td>cols</td>
         *    <td>the sourcetable field that defines the pivot columns (together with 'keep')</td>
         *  </tr>
         *  <tr>
         *    <td>value</td>
         *    <td>the sourcetable field where to get the value to accumulate
         *         if '1', count the cases of the cols topicsthan</td>
         *  </tr>
         *</table>
         * @type {Data.Table}
         * @returns the pivot table
         * @example
         * 
         * // we have a table 'scrutini' with election results like:
         *	
         * assemblea  codice       tipo   tipo_riga  cand_descr_riga  descr_lista              voti   perc    
         * --------------------------------------------------------------------------------------------------
         * Camera     01110812620  Comune CA         ANDREA GIORGIS                            49654  "40,93"
         * Camera     01110812620  Comune LI                          PARTITO DEMOCRATICO      33228  "28,75" 
         * Camera     01110812620  Comune LI                          +EUROPA                  12970  "11,22"
         * Camera     01110812620  Comune LI                          ITALIA EUROPA INSIEME    846    "0,73"
         * Camera     01110812620  Comune LI                          CIVICA POPOLARE LORENZIN 601    "0,52" 
         * ...
         *
         * // --------------------------------------------------------------------------------------------
         * // make pivot table with columns == descr_lista (partiti)  
         * // --------------------------------------------------------------------------------------------
         *
         * var pivot = scrutini.pivot({
         *              "lead":	'codice',
         *              "keep":	['tipo'],
         *              "sum":	['membri'],
         *              "cols":	'descr_lista',
         *              "value":  "voti" 
         *              });
         *
         *
         * // the resulting pivot table is:
         *
         * codice       tipo   PARTITO DEMOCRATICO +EUROPA  ITALIA EUROPA INSIEME  CIVICA POPOLARE LORENZIN    
         * --------------------------------------------------------------------------------------------------
         * 01110812620  Comune 33228               12970    846                    601
         * ...
         */
        pivot: function (options) {

            options.lead = options.lead || options.rows;
            options.cols = options.cols || options.columns;
            options.keep = options.keep || [];
            options.sum = options.sum || [];

            // force string arrays 

            options.lead = __toArray(options.lead);
            options.cols = __toArray(options.cols);
            options.keep = __toArray(options.keep);
            options.sum = __toArray(options.sum);
            options.value = __toArray(options.value);
            options.forced = __toArray(options.forced);

            // make field indices

            let indexA = [];
            for (let i = 0; i < this.fields.length; i++) {
                indexA[String(this.fields[i].id)] = i;
            }

            // check the source columns

            for (let i = 0, len = options.lead.length; i < len; i++) {
                if (typeof (indexA[options.lead[i]]) == 'undefined') {
                    _alert("data.pivot - pivot keep column '" + options.lead[i] + "' not found");
                }
            }
            for (let i = 0, len = options.cols.length; i < len; i++) {
                if (options.cols && (typeof (indexA[options.cols[i]]) == 'undefined')) {
                    _alert("data.pivot - pivot columns source column '" + options.cols[i] + "' not found");
                }
            }
            for (let i = 0, len = options.keep.length; i < len; i++) {
                if (typeof (indexA[options.keep[i]]) == 'undefined') {
                    _alert("data.pivot - pivot keep column '" + options.keep[i] + "' not found");
                }
            }
            for (let i = 0, len = options.sum.length; i < len; i++) {
                if (typeof (indexA[options.sum[i]]) == 'undefined') {
                    _alert("data.pivot - pivot sum column '" + options.sum[i] + "' not found");
                }
            }
            for (let i = 0, len = options.value.length; i < len; i++) {
                if (typeof (indexA[options.value[i]]) == 'undefined') {
                    _alert("data.pivot - pivot value column '" + options.value[i] + "' not found");
                }
            }

            // make the pivot 

            let rowA = [];
            let colA = [];
            let data = this.records;

            // GR 12/03/2023 preset columns with forced columns

            if (options.forced) {
                for (let i = 0; i < options.forced.length; i++) {
                    colA[String(options.forced[i])] = 0;
                }
            }

            for (let row = 0, len = data.length; row < len; row++) {

                const parts = [data[row][indexA[options.lead[0]]]];
                for (let k = 1; k < options.lead.length; k++) {
                    parts.push(data[row][indexA[options.lead[k]]]);
                }
                const szRow = parts.join("|");

                let szCol = String(data[row][indexA[options.cols[0]]]);

                let nValue = null;
                if (options.calc == "string") {
                    nValue = data[row][indexA[options.value[0]]];
                } else {
                    nValue = 1;
                    if (options.value && options.value.length) {
                        nValue = 0;
                        for (let k = 0; k < options.value.length; k++) {
                            nValue += options.value[k] ? __scanValue(data[row][indexA[options.value[k]]]) : 1;
                        }
                    }
                }
                if (!szCol || szCol.length < 1) {
                    szCol = "undefined";
                }
                if (typeof (colA[szCol]) == 'undefined') {
                    colA[szCol] = 0;
                }
                if (!rowA[szRow]) {
                    rowA[szRow] = {
                        "Total": 0
                    };
                    for (let k = 0; k < options.keep.length; k++) {
                        rowA[szRow][options.keep[k]] = data[row][indexA[options.keep[k]]];
                    }
                    for (let k = 0; k < options.sum.length; k++) {
                        rowA[szRow][options.sum[k]] = Number(data[row][indexA[options.sum[k]]]);
                    }
                } else {
                    for (let k = 0; k < options.keep.length; k++) {
                        if (data[row][indexA[options.keep[k]]] &&
                            data[row][indexA[options.keep[k]]].length &&
                            (rowA[szRow][options.keep[k]] != data[row][indexA[options.keep[k]]])) {
                            rowA[szRow][options.keep[k]] = data[row][indexA[options.keep[k]]];
                        }
                    }
                    for (let k = 0; k < options.sum.length; k++) {
                        rowA[szRow][options.sum[k]] += Number(data[row][indexA[options.sum[k]]]);
                    }
                }

                rowA[szRow].Total += nValue;

                if (!rowA[szRow][szCol]) {
                    rowA[szRow][szCol] = nValue;
                    rowA[szRow][szCol + "count"] = 1;
                } else {
                    if (options.calc == "string") {}
                    if (options.calc == "max") {
                        rowA[szRow][szCol] = Math.max(nValue, rowA[szRow][szCol]);
                    } else {
                        rowA[szRow][szCol] += nValue;
                        rowA[szRow][szCol + "count"]++;
                    }
                }
            }
            
            this.__pivot = new Data.Table();

            // make first row (table.fields) with column names
            // ------------------------------------------------

            // lead
            for (let k = 0; k < options.lead.length; k++) {
                this.__pivot.fields.push({
                    id: options.lead[k]
                });
            }
            // keep
            for (let k = 0; k < options.keep.length; k++) {
                this.__pivot.fields.push({
                    id: options.keep[k]
                });
            }
            // sum
            for (let k = 0; k < options.sum.length; k++) {
                this.__pivot.fields.push({
                    id: options.sum[k]
                });
            }
            // cols
            if (options.cols && options.cols.length)
                for (let a in colA) {
                    if (Object.prototype.hasOwnProperty.call(colA, a)) {
                        this.__pivot.fields.push({
                            id: a
                        });
                    }
                }
            //totale
            this.__pivot.fields.push({
                id: "Total"
            });


            // make the values
            // ----------------
            for (let a in rowA) {
                if (Object.prototype.hasOwnProperty.call(rowA, a)) {
                    // collect values per place
                    const valueA = [];
                    // lead
                    const leadA = a.split("|");
                    if (options.lead && options.lead.length)
                        for (let k = 0; k < leadA.length; k++) {
                            valueA.push(leadA[k]);
                        }
                    // keep
                    for (let k = 0; k < options.keep.length; k++) {
                        valueA.push(rowA[a][options.keep[k]]);
                    }
                    // sum
                    for (let k = 0; k < options.sum.length; k++) {
                        valueA.push(rowA[a][options.sum[k]]);
                    }
                    // cols
                    if (options.cols && options.cols.length)
                        for (let t in colA) {
                            if (Object.prototype.hasOwnProperty.call(colA, t)) {
                                if (options.calc == "mean") {
                                    valueA.push((rowA[a][t] || 0) / (rowA[a][t + "count"] || 1));
                                } else {
                                    valueA.push(rowA[a][t] || 0);
                                }
                            }
                        }
                    // totale
                    valueA.push(rowA[a].Total);
                    // record complete
                    this.__pivot.records.push(valueA);
                    this.__pivot.table.records++;
                }
            }
            
            return (this.__pivot);
        },

        /**
         * creates a sub table <br>
         * which only contains the specified columns
         * @param options {Object} the subtable columns definition; use either 'columns' or 'fields'
         *<table class="w3-table-all notranslate">
         * <tr>
         *    <th style="width:20%">Property</th>
         *    <th>Description</th>
         *  </tr>
         *  <tr>
         *    <td>columns</td>
         *    <td>array of column indices</td>
         *  </tr>
         *  <tr>
         *    <td>fields</td>
         *    <td>array of column names</td>
         *  </tr>
         *</table>
         * @type {Data.Table}
         * @returns the generated sub table
         * @example
         * subTable = table.subtable({"columns":[1,2,3]});
         * @example
         * subTable = table.subtable({"fields":['comune_scr','provincia_scr','Lat','Lon']});
         */
        subtable: function (options) {

            this.__subt = new Data.Table();

            if (options.fields) {
                options.columns = [];
                for (let i = 0; i < options.fields.length; i++) {
                    for (let ii = 0; ii < this.fields.length; ii++) {
                        if (this.fields[ii].id == options.fields[i]) {
                            options.columns.push(ii);
                        }
                    }
                }
            }

            for (let i = 0; i < options.columns.length; i++) {
                this.__subt.fields.push({
                    id: String(this.fields[options.columns[i]].id)
                });
                this.__subt.table.fields++;
            }
            for (const j in this.records) {
                let records = [];
                for (let i = 0; i < options.columns.length; i++) {
                    records.push(this.records[j][options.columns[i]]);
                }
                this.__subt.records.push(records);
                this.__subt.table.records++;
            }
            return this.__subt;
        },

        /**
         * sort the rows of a data table by values of a given column
         * @param {string} sortColumn the column by which values to sort the table
         * @type {Data.Table}
         * @returns the sorted table
         */
        sort: function (szColumn, szFlag) {
            let valuesA = this.column(szColumn).values();
            let number = 0;
            for (let i = 0; i < Math.min(valuesA.length,10); i++) {
                 if (!isNaN(parseFloat(String(valuesA[i]).replace(",",".")))){
                    number++;
                }
            }
            let sortA = [];
            if (number){
                for (let i = 0; i < valuesA.length; i++) {
                    sortA.push({
                        index: i,
                        value: Number(String(valuesA[i]).replace(",","."))
                    });
                }
            }else{
                 for (let i = 0; i < valuesA.length; i++) {
                    sortA.push({
                        index: i,
                        value: valuesA[i]
                    });
                }
            }
            if (szFlag && szFlag == "DOWN") {
                sortA.sort(function (a, b) {
                    return ((a.value > b.value) ? -1 : 1);
                });
            } else {
                sortA.sort(function (a, b) {
                    return ((a.value < b.value) ? -1 : 1);
                });
            }
            let records = [];
            for (let i = 0; i < sortA.length; i++) {
                records.push(this.records[sortA[i].index]);
            }
            this.records = records;
            return this;
        },

        /**
         * appends the rows of a data table to the actual table<br>
         * ! <b>important</b>: the structure of both tables must be identical, i.e. same column count and names
         * @param {Data.Table} sourceTable table the source of the rows to append
         * @type {Data.Table}
         * @returns the extended table
         */
        append: function (sourceTable) {
            if (this.table.fields.length != sourceTable.table.fields.length) {
                return null;
            }
            for (let i = 0; i < this.table.fields.length; i++) {
                if (this.table.fields[i].id != sourceTable.table.fields[i].id) {
                    return null;
                }
            }
            let records = sourceTable.records;
            for (let i = 0; i < records.length; i++) {
                this.records.push(records[i]);
            }
            this.table.records = this.records.length;
            return this;
        },

        /**
         * creates a json object array from the table <br>
         * every row creates an array element 
         * array elements are of type:
         * { name_1: value_1, name_2: value_2, ... }
         */
        json: function () {

            this.__json = [];
            for (const r in this.records) {
                let row = {};
                for (const c in this.fields) {
                    row[String(this.fields[c].id)] = this.records[r][c];
                }
                this.__json.push(row);
            }
            return this.__json;
        }

    };


    //...................................................................
    // local helper
    //...................................................................
    __myNumber = function (value) {
        let number = parseFloat(value.replace(/\./g, "").replace(/\,/g, "."));
        return isNaN(number) ? 0 : number;
    };

    __scanValue = function (nValue) {
        // strips blanks inside numbers (e.g. 1 234 456 --> 1234456)
        let number = null;
        if (String(nValue).match(/,/)) {
            number = parseFloat(String(nValue).replace(/\./gi, "").replace(/,/gi, "."));
            return isNaN(number) ? 0 : number;
        } else {
            number = parseFloat(String(nValue).replace(/ /gi, ""));
            return isNaN(number) ? 0 : number;
        }
    };


    // ---------------------------------------------------------------------------------
    //
    // additional specific functions (not core, can also be realized by above functions)
    //
    // ---------------------------------------------------------------------------------

    /**
     * creates new columns on base of a timestamp that contain the following time orders <br>
     * date,year,month,day,hour
     * <br>
     * @param data the input tabel (array of arrarys)
     * @param options generation options
     * @type {Array}
     * @returns the pivot table
     * @example
     * <br><br>
     * <strong>options definition object:</strong>
     *		var options = { "source":	'name of timestamp column',
     *						"create":	['date','year','month','day','hour']
     *					}
     *	<br>
     *  source: the sourcetable field that contains the toime stamp
     *  create: [optional] an array of columns to creaate
     *          to define only if not wished to create all of above listed time columns
     */
    Data.Table.prototype.addTimeColumns = function (options) {

        if (!options.source) {
            return null;
        }

        for (const column in this.fields) {
            if (this.fields[column].id == options.source) {

                // make fields object
                // ------------------

                // copy orig fields 
                let timeCollA = options.create || ['date', 'year', 'month', 'day', 'hour'];

                // add new time columns 
                for (let i = 0; i < timeCollA.length; i++) {
                    this.fields.push({
                        id: String(timeCollA[i])
                    });
                    this.table.fields++;
                }

                // make values 
                // ------------------
                let length = this.records.length;
                let j = 0;
                for (j = 0; j < length; j++) {

                    // add new time column values
                    let d = new Date(this.records[j][column]);
                    if (d) {
                        for (let i = 0; i < timeCollA.length; i++) {
                            switch (timeCollA[i]) {
                                case 'date':
                                    let date = String(d.getDate()) + "." + String(d.getMonth() + 1) + "." + String(d.getFullYear());
                                    this.records[j].push(date);
                                    break;
                                case 'year':
                                    this.records[j].push(d.getFullYear());
                                    break;
                                case 'month':
                                    this.records[j].push(d.getMonth() + 1);
                                    break;
                                case 'day':
                                    this.records[j].push(d.getDay());
                                    break;
                                case 'hour':
                                    this.records[j].push(d.getHours());
                                    break;
                            }
                        }
                    }
                }

            }
        }

        return this;
    };

    /**
     * Create a new Data.Column instance.  
     * <p>it is generally created by the <b>.column()</b> method of <b>Data.table</b> object</p>
     * <p>it provides ther methods to access or process the values of one column of the data table</p>
     * @class It realizes an object to hold a table column
     * @constructor
     * @returns A new Data.Column object
     * @example
     *    var myColumn = mydata.column('timestamp');
     */

    Data.Column = function () {
        this.table = null;
        this.index = null;
        this.valueA = null;
    };

    Data.Column.prototype = {
        /**
         * get the values of the column
         * <br>
         * @type {Array}
         * @returns {Array} an array with the values of the column
         * @example
         *    var sumArray = mydata.column('total').values();
         */
        values: function () {
            this.valueA = [];
            for (const i in this.table.records) {
                this.valueA.push(this.table.records[i][this.index]);
            }
            return this.valueA;
        },

        /**
         * get the values of the column
         * <br>
         * @type {Array}
         * @returns {Array} an array with the values of the column
         * @example
         *    var sumArray = mydata.column('total').values();
         */
        uniqueValues: function () {
            this.valueA = [];
            for (const i in this.table.records) {
                this.valueA.push(this.table.records[i][this.index]);
            }
            return this.valueA.filter(__onlyUnique);
        },

        /**
         * map the values of the column
         * @param {function} function(currVal) the user function to map the column values
         * @type void
         * @returns {Data.Column}
         * @example
         *    mydata.column('timestamp').map(
         *        function(value){
         *            var d = new Date(value);
         *            return( String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear()) );
         *     });
         */
        map: function (callback) {

            // make new record values 
            // ----------------------
            for (const j in this.table.records) {
                // query new column value by callback
                this.table.records[j][this.index] = callback(this.table.records[j][this.index], this.table.records[j], this.index);
            }

            return this;
        },

        /**
         * rename the column
         * @param {string} szName the new column name
         * @type void
         * @returns {Data.Column}
         * @example
         *    mydata.column('timestamp').rename('time');
         */
        rename: function (szName) {

            this.table.fields[this.index].id = szName;
            return this;
        },

        /**
         * remove the column
         * @type void
         * @returns {Data.Column}
         * @example
         *    mydata.column('timestamp').remove();
         */
        remove: function () {

            this.table.fields.splice(this.index, 1);
            for (const j in this.table.records) {
                this.table.records[j].splice(this.index, 1);
            }
            this.table.table.fields--;
            return this;
        }
    };

    // ----------------------------------------------------
    // W R A P  Data.Table  functions to Data.Feed object
    // ----------------------------------------------------

    /**
     * extract the values of one column from a data table
     * @param szColumn the name of the column to extract from loaded data
     * @type {Array}
     * @returns column values array or null
     */
    Data.Feed.prototype.column = function (szColumn) {
        return this.dbtable.column(szColumn);
    };

    /**
     * applicate filter to one theme item
     * @param j the index (data row) of the item to check
     * @type {boolean}
     * @returns true if item passes the filter
     */
    Data.Feed.prototype.select = function (szSelection) {
        return this.dbtable.select(szSelection);
    };

    /**
     * aggregate 
     * @param j the index (data row) of the item to check
     * @type {boolean}
     * @returns true if item passes the filter
     */
    Data.Feed.prototype.aggregate = function (szColumn, szAggregation) {
        return this.dbtable.aggregate(szColumn, szAggregation);
    };

    /**
     * revert 
     * @param void
     * @type {Data.Feed}
     * @returns the reverted feed
     */
    Data.Feed.prototype.revert = function () {
        return this.dbtable.revert();
    };

    /**
     * reverse 
     * @param void
     * @type {Data.Feed}
     * @returns the reversed feed
     */
    Data.Feed.prototype.reverse = function () {
        return this.dbtable.reverse();
    };

    /**
     * pivot 
     * @param j the index (data row) of the item to check
     * @type {boolean}
     * @returns true if item passes the filter
     */
    Data.Feed.prototype.pivot = function (options) {
        return this.dbtable.pivot(options);
    };

    /**
     * subtable 
     * @param j the index (data row) of the item to check
     * @type {boolean}
     * @returns true if item passes the filter
     */
    Data.Feed.prototype.subtable = function (options) {
        return this.dbtable.subtable(options);
    };

    /**
     * add time fields to table by a timestamp column 
     * @param options ( see Data.Table.prototype.addTimeColumns )
     * @type {Data.Feed}
     * @returns the enhanced feed
     */
    Data.Feed.prototype.addTimeColumns = function (options) {
        return this.dbtable.addTimeColumns(options);
    };

    // =====================================================================
    // data broker
    // =====================================================================

    /**
     * This is the Data.Broker class.  
     * <br>
     * It realizes an object to load <b>one or more</b> data sources 
     * and call a user defined function if all sources have been successfully loaded.<br>
     * It passes an array with the loaded data (Data.Table objects) to the user function
     * 
     * @class realizes an object to load <b>one or more</b> data sources
     * @constructor
     * @type {Data.Broker}
     * @returns a new Data.Broker object
     * @example
     *	var broker = new Data.Broker()
     *		.addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/dati/scrutiniCI_cm.csv","csv")
     *		.addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/risorse/comuniViminaleISTAT.csv","csv")
     * 		.addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/dati/camera_geopolitico_italia.csv","csv")
     *		.realize(
     *	function(dataA) {
     *		var scrutini                    = dataA[0];
     *		var comuniViminaleISTAT         = dataA[1];
     *		var camera_geopolitico_italia   = dataA[2];
     *
     *		scrutini = scrutini.select("WHERE tipo_riga == LI");
     *		 ...
     *	});
     */
    Data.Broker = function (options) {
        this.souceQueryA = [];
        this.options = options || {};
        if (options) {
            this.parseDefinition(options);
        }
        this.onNotify = function () {};
        this.onError = function (e) {alert("error loading data:" + e)};
    };

    /**
     * inherit methods from Data.Feed class  
     */
    Data.Broker.prototype = new Data.Feed();

    Data.Broker.prototype = {
        /**
         * add one source to the broker
         * @param {string} szUrl the url of the data source
         * @param {string} szType type of the data (csv,...)
         *								   <table border='0' style='border-left: 1px solid #ddd;'>	
         *								   <tr><td><b>"csv"</b></td><td>the source is 'plain text' formatted as Comma Separated Values<br>delimiter supported: <span style='background:#dddddd'>,</span> and <span style='background:#dddddd'>;</span></td></tr>
         *								   <tr><td><b>"json"</b></td><td>the source is JSON (Javascript Object Notation)</td></tr>
         *								   <tr><td><b>"geojson"</b></td><td>the source is a JSON object formatted in <a href="https://geojson.org/" target="_blank">GeoJson</a></td></tr>
         *								   <tr><td><b>"geoparquet"</b></td><td>the source is a GeoParquet file (converted to GeoJSON)</td></tr>
         *								   <tr><td><b>"parquet"</b></td><td>the source is a Parquet file</td></tr>
         *								   <tr><td><b>"JSON-stat"</b></td><td>the source is a JSON object formatted in <a href="https://json-stat.org/JSON-stat" target="_blank">JSON-stat</a></td></tr>
         *								   <tr><td><b>"jsonDB"</b></td><td>the source is in ixmaps internal data table format</td></tr>
         *								   <tr><td><b>"rss"</b></td><td>the source is an xml rss feed</td></tr>
         *								   </table> 
         * @type {Data.Broker}
         * @returns the Data.Broker object
         */
        addSource: function (szUrl, szType) {
            _LOG("Data.Broker.addSource: " + szUrl);
            this.souceQueryA.push({
                url: szUrl,
                type: szType,
                data: null,
                result: null,
                next: this
            });
            return this;
        },

        /**
         * set the callback function to execute on sucess of all loading.<br>
         * Note: can also be defined as argument of .realize()
         * @param {function(broker)} callback the callback function
         * @type {Data.Broker}
         * @returns the Data.Broker object
         * @example
         *  function onSuccess(dataA) {
         *      ... do something with the loaded data
         *  }
         *
         *  var broker = new Data.Broker()
         *      .addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/dati/scrutiniCI_cm.csv","csv")
         *      .setCallback(onSuccess)
         *      .realize();
         * @deprecated use callback in realize()
         */
        setCallback: function (callback) {
            this.callback = callback;
            return this;
        },

        /**
         * start the broker<br>
         * initiate the process to load the added sources and [optional] define a user function to be called 
         * on success.<br>the argument passed to the user function is an array with the loaded data as {@link "-_anonymous_-Data.Table"} objects
         * @param {function} callback type of the data (csv,...)
         * @type void
         * @see {@link Data.Broker.setCallback}
         * @example
         *		...
         *		.realize(
         *	function(dataA) {
         *		var scrutini                    = dataA[0];
         *		var comuniViminaleISTAT         = dataA[1];
         *		var camera_geopolitico_italia   = dataA[2];
         *		...
         *	});
         */
        realize: function (callback) {
            this.callback = callback || this.callback;
            for (const i in this.souceQueryA) {
                if (this.souceQueryA[i].url && !this.souceQueryA[i].result) {
                    this.getData(this.souceQueryA[i]);
                    return this;
                }
            }
            this.data = [];
            for (const i in this.souceQueryA) {
                this.data.push(this.souceQueryA[i].data || new Data.Table());
            }
            this.callback(this.data);
            return this;
        },

        /**
         * define error function
         * @param {function(exception)} onError a user defined function to call when error occurs 
         * @type {Data.Broker}
         * @returns the Data.Broker object
         * @example
         *	var broker = new Data.Broker()
         *      .addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/dati/scrutiniCI_cm.csv","csv")
         *
         *      .error(function(e){alert(e);})
         *
         *      .realize(
         *	function(broker) {
         *          ...
         *	});
         */

        error: function (onError) {
            this.onError = onError || this.onError;
            return this;
        },

        /**
         * define notify function
         * @param {function(exception)} onError a user defined function to call when notify occurs 
         * @type {Data.Broker}
         * @returns the Data.Broker object
         * @example
         *	var broker = new Data.Broker()
         *      .addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/dati/scrutiniCI_cm.csv","csv")
         *
         *      .notify(function(e){alert(e);})
         *
         *      .realize(
         *	function(broker) {
         *          ...
         *	});
         */
        notify: function (onNotify) {
            this.onNotify = onNotify || this.onNotify;
            return this;
        }
    };

    /**
     * internal method to read parameter from the definition object
     * @method parseDefinition
     * @param definition the object literal with `data options`
     * @param szType type of the data (csv,...)
     * @private
     * @type void
     */
    Data.Broker.prototype.parseDefinition = function (definition) {
        this.callback = definition.callback || null;
    };
    /**
     * internal method to get one data from the specified source
     * @method getData
     * @param query object with the definition of the data source
     * @private
     * @type void
     */
    Data.Broker.prototype.getData = function (query) {
        this.onNotify(query);
        query.feed = Data.feed({
            "source": query.url,
            "type": query.type,
            "options": query.next.options,
            parent: this
        }).load(function (mydata) {
            query.data = mydata;
            query.data.raw = query.feed.data;
            this.parent.onNotify(query);
            query.result = "success";
            query.next.realize();
        }).error(function (e) {
            this.parent.onError(query.url);
            query.data = null;
            query.result = "error";
            query.next.realize();
        });
    };
    /**
     * set the broker result as the new Data.Table in the parent Data.Feed object
     * @method setData
     * @param data a 2 dim data array
     * @private
     * @type void
     */
    Data.Broker.prototype.setData = function (data) {
        this.parent.__doCreateTableDataObject(data, null, this.parent.options);
    };

    // Instantiates a broker object with 
    // an object literal with `data options`.
    // @factory Data.Feed.broker(options?: Data options)
    //
    Data.Feed.prototype.broker = function (options) {
        let broker = new Data.Broker(options);
        broker.parent = this;
        return broker;
    };

    // @factory Data.broker()
    // Instantiates a Data.Broker
    //

    Data.broker = function () {
        return new Data.Broker();
    };

    // @factory Data.provider()
    // Instantiates a Data.Broker
    //

    Data.provider = function () {
        return new Data.Broker();
    };
    // =====================================================================
    // data merger
    // =====================================================================

    /* End of legacy __processWithHyparquet function */

    // ---------------------------------------
    // D A T A   M E R G E R   C L A S S
    // ---------------------------------------

    /**
     * This is the Data.Merger class.  
     * <br>
     * It realizes an object to load <b>two or more</b> data sources 
     * and merge the data guided by 2 columns with identical values.<br>
     * 
     * @class realizes an object to merge <b>two or more</b> data sources
     * @constructor
     * @type {Data.Merger}
     * @returns a new Data.Merger object
     * @example
     *	var merger = new Data.Merger()
     *      .addSource(prezzi,{lookup:"idImpianto",columns:["descCarburante","prezzo","isSelf","dtComu"]});
     *      .addSource(impianti,{lookup:"idImpianto",columns:["Bandiera","Latitudine","Longitudine"]});
     *		.realize(
     *	function(mergedTable) {
     *
     *		selection = mergedTable.select("WHERE tipo_riga == LI");
     *		 ...
     *	});
     */
    Data.Merger = function (options) {
        this.sourceA = [];
        this.options = options || {};
        if (options) {
            this.parseDefinition(options);
        }
    };

    Data.Merger.prototype = {
        /**
         * add one source to the merger
         * @param {Object} source a loaded data.js table object, typically the result of a data.feed 
         * @param {Object} option the merging parameter for this sorce: lookup, columns and label [optional]
         * @example
         *   .addSource(prezzi,{lookup:"idImpianto",columns:["descCarburante","prezzo","isSelf","dtComu"]});
         * @example
         *   .addSource(prezzi,{lookup:"idImpianto",columns:["descCarburante","prezzo","isSelf","dtComu"],label:["CARB1","PREZZO","SELF","COM"]});
         * @type {Data.Merger}
         * @returns the Data.Merger object
         */
        addSource: function (source, option) {
            this.sourceA.push({
                data: source,
                opt: option
            });
            return this;
        },

        /**
         * define which source columns should be included into the merged table.
         * @param {Array} columnsA a subset of source columns or label you defined by .addSource 
         * @type {Data.Merger}
         * @return the Data.Merger object
         * @example
         *		var merger = new Data.Merger()
         *      .addSource(prezzi,{lookup:"idImpianto",columns:["descCarburante","prezzo","isSelf","dtComu"]});
         *      .addSource(impianti,{lookup:"idImpianto",columns:["Bandiera","Latitudine","Longitudine"]});
         *		.setOuputColumns(["desCaburante","prezzo"])
         *      .realize();
         */
        setOutputColumns: function (columnsA) {
            this.outColumnsA = columnsA;
            return this;
        },

        /**
         * initiates the process of merging the sources, guided by the lookup column,
         * inserting all columns that have been defined by .addSource(), or a subset<br>
         * of them defined by .setOutputColumns()
         * @param {function} callback user defined function which receives as argument the merged table 
         * @type void
         * @see {@link Data.Merger.setCallback}
         * @example
         *  ...
         * .realize(function(newData){
         *     ixmaps.setExternalData(newData,{"type":"jsonDB","name":"prezzi_tipo_latlon"});
         * });	
         */
        realize: function (callback) {

            this.callback = callback || this.callback;

            _LOG("DataMerger: >>>");

            let indexAA = [];

            for (const i in this.sourceA) {

                let source = this.sourceA[i];

                source.opt.columns = source.opt.columns || source.data.columnNames();
                source.opt.label = source.opt.label || [];

                source.opt.columns = __toArray(source.opt.columns);
                source.opt.label = __toArray(source.opt.label);
                
                if (!this.sourceA[i].data) {
                    _alert("DataMerger: source '" + i + "' not found");
                }

                if (!this.sourceA[i].data[0]) {
                    this.sourceA[i].data = this.sourceA[i].data.getArray();
                }

                if (!this.sourceA[i].data[0]) {
                    _alert("DataMerger: source '" + i + "' not found or not of type Array");
                }

                let index = [];
                for (const ii in this.sourceA[i].data[0]) {

                    if (this.sourceA[i].data[0][ii] == this.sourceA[i].opt.lookup) {
                        index[this.sourceA[i].opt.lookup] = ii;
                    }

                    for (const iii in this.sourceA[i].opt.columns) {
                        if (!this.sourceA[i].opt.label[iii]) {
                            this.sourceA[i].opt.label[iii] = this.sourceA[i].opt.columns[iii] + "." + (Number(i) + 1) + "";
                        }
                        if (this.sourceA[i].data[0][ii] == this.sourceA[i].opt.columns[iii]) {
                            index[this.sourceA[i].opt.label[iii]] = ii;
                        }
                    }
                }
                // check completeness
                for (const iii in this.sourceA[i].opt.columns) {
                    if (!index[this.sourceA[i].opt.label[iii]]) {
                        _LOG("DataMerger: '" + this.sourceA[i].opt.label[iii] + "' not found");
                    }
                }
                indexAA.push(index);
            }

            let labelA = [];
            for (const i in this.sourceA) {
                for (const ii in this.sourceA[i].opt.label) {
                    labelA.push(this.sourceA[i].opt.label[ii]);
                }
            }

            if (!this.outColumnsA) {
                this.outColumnsA = [];
                for (const i in labelA) {
                    this.outColumnsA.push(labelA[i]);
                }
            }

            let outColumnsLookupA = [];
            for (const i in this.outColumnsA) {
                for (const ii in indexAA) {
                    for (const iii in indexAA[ii]) {
                        if (iii == this.outColumnsA[i]) {
                            outColumnsLookupA[iii] = {
                                input: ii,
                                index: indexAA[ii][iii]
                            };
                        }
                    }
                }
            }

            for (const i in this.outColumnsA) {
                if (!outColumnsLookupA[this.outColumnsA[i]]) {

                    for (const ii in this.sourceA[0].data[0]) {
                        if (this.sourceA[0].data[0][ii] == this.outColumnsA[i]) {
                            outColumnsLookupA[this.outColumnsA[i]] = {
                                input: 0,
                                index: ii
                            };
                        }
                    }
                }
            }

            this.namedSourceA = [];
            for (let i = 1; i < this.sourceA.length; i++) {
                this.namedSourceA[i] = [];
                for (let ii = 1; ii < this.sourceA[i].data.length; ii++) {
                    this.namedSourceA[i][String(this.sourceA[i].data[ii][indexAA[i][this.sourceA[i].opt.lookup]])] = this.sourceA[i].data[ii];
                }
            }

            let newData = [];
            newData.push(this.outColumnsA);

            for (let i = 1; i < this.sourceA[0].data.length; i++) {
                let lookup = String(this.sourceA[0].data[i][[indexAA[0][this.sourceA[0].opt.lookup]]]);

                let row = [];

                for (const ii in this.outColumnsA) {
                    let ll = outColumnsLookupA[this.outColumnsA[ii]];
                    if (ll) {
                        if (ll.input == 0) {
                            row.push(this.sourceA[0].data[i][ll.index]);
                        } else {
                            if (this.namedSourceA[ll.input][lookup]) {
                                row.push(this.namedSourceA[ll.input][lookup][ll.index]);
                            } else {
                                row.push(" ");
                            }
                        }
                    } else {
                        _alert("DataMerger - missing \"" + this.outColumnsA[ii] + "\" in label:[...]");
                        return null;
                    }
                }

                newData.push(row);
            }

            _LOG("DataMerger: done");

            let dbTable = new Data.Table();
            dbTable.setArray(newData);

            if (this.callback) {
                this.callback(dbTable);
            }

            return dbTable;
        },

        /**
         * define error function
         * @param {function(exception)} onError a user defined function to call when error occurs 
         * @type {Data.Merger}
         * @returns the Data.Merger object
         * @example
         *	var merger= new Data.Merger()
         *      .addSource("https://raw.githubusercontent.com/ondata/elezionipolitiche2018/master/dati/scrutiniCI_cm.csv","csv")
         *
         *      .error(function(e){alert(e);})
         *
         *      .realize(
         *	function() {
         *          ...
         *	});
         */
        error: function (onError) {
            this.onError = onError || this.onError;
            return this;
        }
    };

    // @factory Data.merger()
    // Instantiates a Data.Merger
    //

    Data.merger = function () {
        return new Data.Merger();
    };

    // =====================================================================
    // end of data merger
    // =====================================================================

    // version message
    console.log("*** data.js " + Data.version + " ***");

    // alert handling
    var _alert = function (szAlert) {
        console.log("data.js v" + Data.version + ": " + szAlert);
    };

    /**
     * end of namespace
     */


}(window, document));

// -----------------------------
// EOF
// -----------------------------
