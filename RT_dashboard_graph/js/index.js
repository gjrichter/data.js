

$(function() {

	// ..........................................................
	//
	// helper
	//
	// ..........................................................

	var __getArrow = function(last,before){
		return (last == before)?"fa-arrow-right":((last < before)?"fa-arrow-down":"fa-arrow-up");
	};

	var __getIcon = function(labels){
		if ( labels.match(/form/i) ){
			return "fa-file-text-o";
		}
		if ( labels.match(/facebook/i) ){
			return "fa-facebook";
		}
		if ( labels.match(/twitter/i) ){
			return "fa-twitter";
		}
		if ( labels.match(/telegram/i) ){
			return "fa-paper-plane-o";
		}
		return "fa-file-text-o";
	};

	var __getDataDefinition = function(element){
		var txt = $(element).attr("data-path");
		if (txt) {
			var textA = txt.split("::");
			var x = {}; 
			x.type = textA[0]; 
			x.table = textA[1]; 
			x.column = textA[2].split('[')[0];
			x.selection = textA[2].split('[')[1]?(textA[2].split('[')[1].split(']')[0]):"";
			return x;
		}
		return null;
	};

	// needed for safari !
	var __normalizeTime = function(date){
		return (date||"").replace(/\-/gi,'/');
	};


	// ..........................................................
	//
	// data.js extensions
	//
	// ..........................................................

	/**
	 * checks the completness of the timeline, p.e. if range == "days" check all days present <br>
	 * creates new rows in case of timeline gaps
	 * <br>
	 * @parameter szColumn the name of the column with the time information
	 * @parameter szRange "years","months","days","hours","minutes","secobds" 
	 * @parameter snMinRecords make the table at least n rows long adding zero records 
	 * @type array of arrays
	 * @return the completed table
	 */
	Data.Table.prototype.completeTimeline = function(szColumn,szRange,nMinRecords){

		if ( !szColumn || !szRange ){
			return null;
		}

		// at the moment only szRange "days"
		var maxGap = 1000*60*60*24; 

		var __lastTime = null;

		this.__subt = new Data.Table;

		var date = 0;
		for ( date in this.fields )	{
			if ( this.fields[date].id == "date" ){
				break;
			}
		}
		
		var indexA = [];
		for (var column in this.fields )	{
			if ( this.fields[column].id == szColumn ){

				// copy orig fields 
				for (var i in this.fields )	{
					this.__subt.fields.push({id:String(this.fields[i].id)});
					this.__subt.table.fields++;
				}

				//	get first time in table
				var d = new Date(__normalizeTime(this.records[0][column]));
				__lastTime = new Date(d.getFullYear(),d.getMonth(),d.getDate());

				// control time gap til today
				var d = new Date();
				d = new Date(d.getFullYear(),d.getMonth(),d.getDate());

				if ( __lastTime ) {
					var gap = Math.abs(__lastTime-d);
					// insert zero records to bridge time gap
					while ( gap/maxGap > 1 ){
						// make zero record to fill in time gaps
						var fillrecord = [];
						for ( var i in this.fields ){
							fillrecord.push(0);
						}
						fillrecord[date] = String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear());
						this.__subt.records.push(fillrecord);
						this.__subt.table.records++;
						gap -= maxGap;
						d = new Date(d.getTime()-maxGap);
					}
				}

				// copy records and control time flow
				// insert n zero records if n time ranges are missing
				for ( j in this.records ){
					var record = [];

					// copy orig values 
					for ( var i in this.fields ){
						record.push(this.records[j][i]);
					}

					// control time gap
					var d = new Date(__normalizeTime(this.records[j][column]));
					d = new Date(d.getFullYear(),d.getMonth(),d.getDate());

					if ( __lastTime ) {
						var gap = Math.abs(__lastTime-d);
						// insert zero records to bridge time gap
						while ( gap/maxGap > 1 ){
							// make zero record to fill in time gaps
							var fillrecord = [];
							for ( var i in this.fields ){
								fillrecord.push(0);
							}
							__lastTime = new Date(__lastTime.getTime()-maxGap);
							fillrecord[date] = String(__lastTime.getDate()) + "." + String(__lastTime.getMonth()+1) + "." + String(__lastTime.getFullYear());
							this.__subt.records.push(fillrecord);
							this.__subt.table.records++;
							gap -= maxGap;
						}
					}
					__lastTime = d;
				
					// add original record	
					this.__subt.records.push(record);
					this.__subt.table.records++;
				}

				// when parameter nMinRecords given check table length, must have at least nMinRecords records
				// if necessary add n zero records
				if ( nMinRecords )
				while ( this.__subt.records.length < nMinRecords ) {
					var fillrecord = [];
					for ( var i in this.fields ){
						fillrecord.push(0);
					}
					fillrecord[date] = String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear());
					this.__subt.records.push(fillrecord);
					this.__subt.table.records++;
					d = new Date(d.getTime()-maxGap);
				}
			}
		}

		return this.__subt;
	};

	// ..........................................................................
	//
	// get list of AlboPop feeds, prepare the dashboard cards and start loading 
	//
	// ..........................................................................

	__feedReadCount = 0;
	__feedFilterValue = "";

	makeAlboPopAll = function(szFilter){

		__feedFilterValue = szFilter;
		__feedReadCount = 0;

		var timeO = 0;
		var szUrl = "https://raw.githubusercontent.com/RicostruzioneTrasparente/rt-scrapers/master/sources.json";
		var myfeed = Data.feed({"source":szUrl,"type":"json"})
			.error(function(e){console.log(e)})
			.load(function(mydata){
			var feedA = mydata.column("feed").values().sort();
			var szHtml = "";

			$("#FeedCount").html(feedA.length);

			for ( i in feedA ){

				var feed = feedA[i];
				var comuneA = feedA[i].split("/");
				var comune = comuneA.pop().split("_feed.xml")[0];
				var idComune = comune.replace(/\ /g,"").replace(/\'/g,"");

				szHtml +=
				 "<div id=\"card-"+idComune+"\" class=\"col-lg-3 col-md-4 col-sm-6 col-xs-12\" style=\"display:none\">"+
					"<a href=\"javascript:makeAlboPopDetailsComune('"+comune+"','"+feed+"');\">"+
						"<div class=\"card summary-inline\">"+
							"<div class=\"card-body\">"+
								"<i class=\"icon fa fa-none fa-4x\"></i> <span style=\"font-size:1.5em\">"+ comune +" </span>"+
								"<div class=\"content\">"+
									"<div id=\"dynamic-"+idComune+"\" class=\"title data-dynamic\" data-path=\"data::albopop::"+idComune+"\">--</div>"+
									"<div class=\"sub-title data-dynamic\" style=\"color:#888\">|_____________ ultimi&nbsp;28&nbsp;giorni</div>"+
								"</div>"+
								"<div class=\"clear-both\"></div>"+
							"</div>"+
						"</div>"+
					"</a>"+
				"</div>";
				setTimeout("addAlboPopCardComune(\""+idComune+"\",\""+feed+"\")",timeO);
				timeO += 100;
			}

			$("#AlboPopCards").html(szHtml);

			$("#loading").hide();

		});
	};

	// ..........................................................................
	//
	// make one AlboPop dasboard card 
	//
	// ..........................................................................

	addAlboPopCardComune = function(id,feed){

		// correct wrong feed source for "Cerreto D'Esi", must be "Cerreto d'Esi"
		feed = feed.replace("Cerreto D","Cerreto d");

		// get one rss AlboPop feed 
		// ------------------------------------
		szUrl = "http://corsme.herokuapp.com/"+feed;
		var myfeed = Data.feed({"source":szUrl,"type":"rss"})
			.error(function(e){console.log("load error:"+e.status+" - "+ szUrl)})
			.load(function(mydata){

			__feedReadCount ++;
			$("#FeedReadCount").html(__feedReadCount);

			// filter records if filter is defined
			// ------------------------------------
			if ( __feedFilterValue && __feedFilterValue.length ){
				var mydata = mydata.select("WHERE description like "+__feedFilterValue);
			}

			// create new columns 'date' and 'hour' from one timestamp column
			// we need them to create pivot tables 
			// ---------------------------------------------------------------
			mydata = mydata.addColumn({'source':'pubDate','destination':'date'},
									   function(value){
											var d = new Date(__normalizeTime(value));
											return( String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear()) );
											} 
										);

			mydata = mydata.addColumn({'source':'pubDate','destination':'hour'},
									   function(value){
											var d = new Date(__normalizeTime(value));
											return( d.getHours() );
											} 
										);

			// ..........................................................
			//
			// 1. loop over data request and set value into card templates
			//
			// ..........................................................

			var idComune = id;

			var small_curve_options = 
				{
					responsive: true,
					legend: {
						position: 'bottom',
						display: false,	
					},
					hover: {
						mode: 'index'
					},
					scales: {
						xAxes: [{
							display: false,
							scaleLabel: {
								display: false,
								labelString: 'Day'
							}
						}],
						yAxes: [{
							display: false,
							ticks: {
								max: 50,
								min: -5,
							},
							scaleLabel: {
								display: false,
								labelString: 'Value'
							}
						}]
					},
					title: {
						display: false,
						text: 'Chart.js Line Chart - Legend'
					}
				};


				// store absolut number of entries  				
				var records = mydata.table.records;

				// make pivot to get entries per day
				var pivot = mydata.pivot({ "lead":	'date',
										   "keep":  ['pubDate']
										});

				// insert missing days and grant 100 days timeline
				// ----------------------------------------------
				pivot = pivot.completeTimeline('pubDate','days',100);

				var daysA = pivot.column("Total").values();
				var dateA = pivot.column("pubDate").values();

				// get first 28 and 56 days values
				var max = 0;
				var last = 0;
				var before = 0;
				var i = 0;
				for ( i=0; i<28; i++ ){
					max = Math.max(max,daysA[i]);
					last += daysA[i];
				}
				for ( i=28; i<56; i++ ){
					before += daysA[i];
				}

				// invert data table (make last record the first)
				// ----------------------------------------------
				pivot = pivot.reverse();

				// get first(last) 56 records for curve
				// -------------------------------------
				daysA.length = 56;
				dateA.length = 56;
				daysA.reverse();
				dateA.reverse();

				// display sum, last 28, trend arrow 
				// -------------------------------------
				var szArrow = __getArrow(last,before);
				var chart = "<div style='width:93%;margin-top:2px;margin-bottom:10px'><canvas id='"+idComune+"-line-chart'></canvas></div>";
				$("#dynamic-"+idComune).html("<span class='pull-left'>"+records+" </span><span class='pull-right' style='font-size:0.7em;padding-top:0.5em;'>"+Math.abs(last)+"<i class='icon fa "+szArrow+"'></i></span> "+chart);

				$("#card-"+idComune).show();

				// make curve
				// -------------------------------------
				var ctx = $('#'+idComune+'-line-chart').get(0).getContext('2d');

				myLineChart = new Chart(ctx, {
					type: 'line',
					data: {
						labels: dateA,
						datasets: [{
							label: "My First dataset",
							data: daysA,
							fill: true,
							borderColor: "#666",
							backgroundColor: "rgba(125,125,125,0.2)",
							pointRadius: 0,
							lineTension: 0
						}]
					},
					options: small_curve_options
				});
				// ------------------------------

			});

	};

	// ..........................................................
	//
	// make detailed curve and list of one AlboPop feed
	//
	// ..........................................................

	makeAlboPopDetailsComune = function(id,feed){

		$("#div-particolari").show();

		$("#comune-particolari").html(id);
		$("#comune-lista").html(id);

		$('html,body').animate({ scrollTop: ($("#comune-particolari").offset().top-80)}, 'fast');

		szUrl = "http://corsme.herokuapp.com/"+feed;
		var myfeed = Data.feed({"source":szUrl,"type":"rss"}).load(function(mydata){

			// filter records if filter is defined
			// ------------------------------------
			if ( __feedFilterValue && __feedFilterValue.length ){
				var mydata = mydata.select("WHERE description like "+__feedFilterValue);
			}

			$("#loading").hide();

			// create list of last 100 messages
			// --------------------------------------------------

			var iUrl	 = mydata.columnIndex("enclosure");
			var iLabels	 = mydata.columnIndex("guid");
			var iDate    = mydata.columnIndex("pubDate");
			var iTitle   = mydata.columnIndex("title");

			var list = "";
			for (i=0; i<100; i++ ){
				if (mydata.records[i]){
					list += '<a href="'+mydata.records[i][iUrl]+'" target=_blank">';
					list += '<li>';
					list += '<i class="icon fa '+__getIcon(mydata.records[i][iLabels])+' fa-2x pull-left" ></i>';
					list += '<div class="message-block">';
					list += '<div><span class="username">'+mydata.records[i][iDate]+'</span> <span class="message-datetime">'+mydata.records[i][iLabels]+'</span>';
					list += '</div>';
					list += '<div class="message">'+mydata.records[i][iTitle]+'</div>';
					list += '</div>';
					list += '</li>';
					list += '</a>';
				}
			}
			$('.message-list').html(list);
			// --------------------------------------------------


			// create new columns 'date' and 'hour' from one timestamp column
			// we need them to create pivot tables 
			// ---------------------------------------------------------------
			mydata = mydata.addColumn({'source':'pubDate','destination':'date'},
									   function(value){
											var d = new Date(__normalizeTime(value));
											return( String(d.getDate()) + "." + String(d.getMonth()+1) + "." + String(d.getFullYear()) );
											} 
										);

			mydata = mydata.addColumn({'source':'pubDate','destination':'hour'},
									   function(value){
											var d = new Date(__normalizeTime(value));
											return( d.getHours() );
											} 
										);

			// ..........................................................
			//
			// 2. make day per day curve chart
			//
			// ..........................................................

			console.log(mydata);

			var pivot = mydata.pivot({ "lead":	'date',
									   "keep":  ['pubDate']
									});

			pivot = pivot.completeTimeline('pubDate','days');

			// invert data table (make last record the first)
			// ----------------------------------------------
			pivot = pivot.reverse();

			// make chart with 2 curves, total and closed issues
			// -------------------------------------------------
			var set1  = pivot.column("Total").values();
			var label = pivot.column("date").values();
			
			var ctx, data, myBarChart, option_bars;
			Chart.defaults.global.responsive = true;
			ctx = $('#jumbotron-bar-chart').get(0).getContext('2d');
			options = {
			showScale: false,
			scaleShowGridLines: false,
			scaleGridLineColor: "rgba(0,0,0,.05)",
			scaleGridLineWidth: 1,
			scaleShowHorizontalLines: true,
			scaleShowVerticalLines: true,
			bezierCurve: false,
			bezierCurveTension: 0.4,
			pointDot: false,
			pointDotRadius: 4,
			pointDotStrokeWidth: 1,
			pointHitDetectionRadius: 20,
			datasetStroke: true,
			datasetStrokeWidth: 4,
			datasetFill: true,
			legendTemplate: "<ul class=\"<%=name.toLowerCase()%>-legend\"><% for (var i=0; i<datasets.length; i++){%><li><span style=\"background-color:<%=datasets[i].strokeColor%>\"></span><%if(datasets[i].label){%><%=datasets[i].label%><%}%></li><%}%></ul>"
			};
			options.type = "line";
			options.data = {
			labels: label,
			datasets: [
			  {
				label: "Total",
				backgroundColor: "rgba(188, 188, 188,0.2)",
				borderColor: "#9C9C9C",
				pointDot: false,
				pointColor: "#9C9C9C",
				pointStrokeColor: "#fff",
				pointHighlightFill: "#fff",
				pointHighlightStroke: "#9C9C9C",
				data: set1
			  }
			]
			};
			options.options = {
			  scales : {
				xAxes: [{
					scaleLabel: {
						display: false,
						labelString: 'Day'
					}
				}],
				yAxes: [{
					ticks: {
						min: 0,
					},
					scaleLabel: {
						labelString: 'Value'
					}
				}]
			  }
			};

			myBarChart = new Chart(ctx, options);


		});
	};

	// ==============================================================
	//
	// finally animate the dashboard and start loading data
	//
	// ==============================================================

	// makeAlboPopDetailsComune("Accumoli","http://feeds.ricostruzionetrasparente.it/albi_pretori/Accumoli_feed.xml");
	makeAlboPopAll("");

	$('html,body').animate({ scrollTop: 0 }, 'fast');

});

