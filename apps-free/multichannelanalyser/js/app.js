/*
 * Red Pitaya Template Application
 *
 *
 * (c) Red Pitaya  http://www.redpitaya.com
 */


(function(APP, $, undefined) {
    
    // App configuration
    APP.config = {};
    APP.config.app_id = 'multichannelanalyser';
    APP.config.app_url = '/bazaar?start=' + APP.config.app_id;
	APP.config.stop_url = '/bazaar?stop='+APP.config.app_id;
    APP.config.socket_url = 'ws://' + window.location.hostname + ':9002';

    // WebSocket
    APP.ws = null;


    // Signal stack
    APP.latestSignals = {};

    // Parameters

    // 0 for IN1, 1 for IN2
    APP.channel = 0;

    APP.status = 0;
    APP.last_sent_status = null;

    // Starts template application on server
    APP.startApp = function() {
        $('#hello_message.text').text('Connecting...');

        APP.createChart();

        $.get(APP.config.app_url)
            .done(function(dresult) {
                if (dresult.status == 'OK') {
					window.setTimeout(APP.connectWebSocket, 1000);
                } else if (dresult.status == 'ERROR') {
                    console.log(dresult.reason ? dresult.reason : 'Could not start the application (ERR1)');
                    $('#hello_message_text').text(dresult.reason ? dresult.reason : 'Could not start the application (ERR1). Retrying in 1s...');
                    $('#loader').addClass("error");  
                    APP.startApp();
                } else {
                    console.log('Could not start the application (ERR2)');
                    $('#hello_message_text').text('Could not start the application (ERR2). Retrying in 1s...');
                    $('#loader').addClass("error");  
                    setTimeout(APP.startApp, 1000);
                }
            })
            .fail(function() {
                console.log('Could not start the application (ERR3)');
                $('#hello_message.text').text('Could not start the application (ERR3). Retrying in 1s...');
                $('#hello_message').addClass("error");  
                setTimeout(APP.startApp, 1000);
            });
    };


    // Stop template application on server
    APP.stopApp = function(e) {

        APP.ws.close();

        $.ajax({
			type:"get",
			async: false,
			url: APP.config.stop_url,
			success: function(dresult) {
                if (dresult.status == 'OK') {
					return true;
                } else if (dresult.status == 'ERROR') {
                    console.log(dresult.reason ? dresult.reason : 'Could not stop the application (ERR4)');
                    $('#loader').addClass("error");   
                    $('#loader').removeClass("hidden");
                    $('#loader').removeClass("hide");
                    $('#hello_message').text(dresult.reason ? dresult.reason : 'Could not stop the application (ERR4)');
                    $('#hello_message').addClass("error");
                    e.preventDefault();
                    APP.stopApp = null;
                } else {
                    console.log('Could not stop the application (ERR5) -- ');
                    $('#loader').addClass("error");   
                    $('#loader').removeClass("hidden");
                    $('#loader').removeClass("hide");
                    $('#hello_message').text('Could not stop the application (ERR5)');
                    $('#hello_message').addClass("error");  
                    e.preventDefault();
                    APP.stopApp = null;
                }
            },
			error: function() {
                $('#loader').addClass("error");   
                $('#loader').removeClass("hidden");
                $('#loader').removeClass("hide");
                $('#hello_message').text('Could not stop the application (ERR6)');
                $('#hello_message').addClass("error");  
                console.log('Could not stop the application (ERR6)');
                e.preventDefault();
                APP.stopApp = null;
            }
		});
    };


    APP.connectWebSocket = function() {

        //Create WebSocket
        if (window.WebSocket) {
            APP.ws = new WebSocket(APP.config.socket_url);
            APP.ws.binaryType = "arraybuffer";
        } else if (window.MozWebSocket) {
            APP.ws = new MozWebSocket(APP.config.socket_url);
            APP.ws.binaryType = "arraybuffer";
        } else {
            console.log('Browser does not support WebSocket');
        } 


        // Define WebSocket event listeners
        if (APP.ws) {

            APP.ws.onopen = function() {
                $('#hello_message').text("Ready");
                $('#loader').addClass("hide");
                setTimeout(function(){
                    $('#loader').addClass("hidden"); 
                }, 250);
                console.log('Socket opened');
                APP.startRunLoop();
            };

            APP.ws.onclose = function() {
                console.log('Socket closed');
            };

            APP.ws.onerror = function(ev) {
                $('#hello_message').text("Connection error");
                $('#hello_message').addClass("error");    
                console.log('Websocket error: ', ev);
            };

            APP.ws.onmessage = function(ev) {
                try {
                    var data = new Uint8Array(ev.data);
                    var inflate = pako.inflate(data);
                    var text = String.fromCharCode.apply(null, new Uint8Array(inflate));
                    var receive = JSON.parse(text);

                    if (receive.parameters) {
                        
                    }

                    if (receive.signals) {
                        if (APP.latestSignals && APP.latestSignals.STATUS && receive.signals.STATUS &&
                            APP.latestSignals.STATUS.value[APP.channel] === APP.last_sent_status &&
                            receive.signals.STATUS.value[APP.channel] !== APP.last_sent_status)
                        {
                            APP.last_sent_status = receive.signals.STATUS.value[APP.channel];
                        }

                        APP.latestSignals = receive.signals;
                    }
                    
                } catch (e) {
                    console.log(e);
                }

            };
        }
    };


    APP._interval_timer = null;
    APP.startRunLoop = function() {

        if (APP._interval_timer) {
            clearInterval(APP._interval_timer);
        }
        APP._interval_timer = setInterval(function() {
            // Trigger reading of histgoram for next time
            APP.readHistogram(APP.channel);
            APP.readTimer(APP.channel);
        }, 750);

        APP._runLoop();

    };

    APP._runLoop = function() {

        // Update chart with latest values
        if (APP.latestSignals && APP.latestSignals.HISTOGRAM) {
            APP.updateChartData(APP.latestSignals.HISTOGRAM.value);
        }

        // Update button states
        if (APP.latestSignals && APP.latestSignals.STATUS) {
            APP.status = APP.latestSignals.STATUS.value[APP.channel];
            APP.updateButtonStates();
        }

        // Update info
        if (APP.latestSignals && APP.latestSignals.TIMER_CONFIG && APP.latestSignals.TIMER_STATUS) {
            APP.updateInfo(
                APP.latestSignals.TIMER_STATUS.value[APP.channel],
                APP.latestSignals.TIMER_CONFIG.value[APP.channel],
                APP.latestSignals.HISTOGRAM.value
            );
        }


        // Run again
        setTimeout(APP._runLoop, 500);
    };

    APP.sendCommand = function(code, chan, data) {
        var msg = {
            parameters:{
                "COMMAND_CODE": {value: code},
                "COMMAND_CHAN": {value: chan},
                "COMMAND_DATA": {value: data},
            }
        }
        var serialized = JSON.stringify(msg);
        APP.ws.send(serialized);
    };

    APP.resumeMCA = function(channel, timeleft_s) {

        // Set decimation to 16
        APP.setDecimation(channel, 16);
        
        // Send timer = (milliseconds*125000)

        // Send base update command 6, channel, type?
        APP.sendCommand(6, APP.channel, 0); // No baseline
        
        // Send base val command 7, channel, baseline
        APP.sendCommand(7, APP.channel, 0); // No baseline
        
        // Send PHA delay update command 8 channel 100?
        APP.sendCommand(8, APP.channel, 100);

        // Send thrs_update  command 9min, channel, min; command 10max channel max
        APP.sendCommand(9, APP.channel, 0);
        APP.sendCommand(10, APP.channel, 16380);

        // alert("Time: "+timeleft_s*125000+" "+timeleft_s);

        // counter setup
        APP.sendCommand(11, APP.channel, timeleft_s); // Set timer
        APP.sendCommand(0, APP.channel, 0); // Reset timer -- why are these different?

            // Send base update command 6, channel, type?
            APP.sendCommand(6, APP.channel, 0); // No baseline
            
            // Send base val command 7, channel, baseline
            APP.sendCommand(7, APP.channel, 0); // No baseline
            
            // Send PHA delay update command 8 channel 100?
            APP.sendCommand(8, APP.channel, 100);

            // Send thrs_update  command 9min, channel, min; command 10max channel max
            APP.sendCommand(9, APP.channel, 0);
            APP.sendCommand(10, APP.channel, 16380);

        // Send start command
        APP.sendCommand(12, APP.channel, 1);
    }
    APP.readTimer = function(channel) {
        if (channel !== 0 && channel !== 1) {
            throw "Invalid Argument: Must have channel number 0 or 1";
        }
        APP.sendCommand(13, channel, 0);        
    }
    APP.stopMCA = function(channel) {
        if (channel !== 0 && channel !== 1) {
            throw "Invalid Argument: Must have channel number 0 or 1";
        }
        APP.sendCommand(12, channel, 0);
    }
    APP.setDecimation = function(channel, decimation) {
        if (decimation<4) {
            throw "Decimation should porbably be at least 4";
        }
        APP.sendCommand(4, channel, decimation);
    }
    APP.readHistogram = function(channel) {
        if (channel !== 0 && channel !== 1) {
            throw "Invalid Argument: Must have channel number 0 or 1";
        }
        APP.sendCommand(14, channel, 0); // Read histogram
    }

    APP.resetHistogram = function(channel) {
        if (channel !== 0 && channel !== 1) {
            throw "Invalid Argument: Must have channel number 0 or 1";
        }
        APP.sendCommand(1, channel, 0); // Reset histogram
    }

    APP.createChart = function() {
        var empty_data = []
        // for (var i=0; i<16385; i++) {
        //     empty_data[i] = 0;
        // }

        var logLines = [];
        // TODO: yaxis log lines
        // for (var i=0; i<10; i++) {
        //     for (var j=0; j<10; j++) {

        //     }
        // }

        APP.chart = Highcharts.chart('histogram-container', {
            chart: {
                backgroundColor: 'transparent',
                zoomType: 'xy',
                type: 'column'         
            },
            credits: {
                text: 'Will Thompson — Highcharts.com'
            },
            plotOptions: {
                column: {
                    animation: true,
                    shadow: false,
                    enableMouseTracking:true,
                    pointPadding: 0.0,
                    borderWidth: 0,
                    groupPadding: 0,
                    pointPlacement: 'on',
                    pointRange: 1,
                }
            },
            title: {
                text: '',
                enabled: false
            },
            xAxis: {
                crosshair: true,
                text: 'Channel Number',
                min: 0,
                max: 16385
            },
            yAxis: {
                min: 0,
                max: 10,
                title: {
                    text: 'Counts'
                },
                tickInterval: 1,
                labels: {
                    formatter: function() {
                        return "1E"+this.value;
                    }
                },
                plotLines: logLines
            },
            tooltip: {
                borderWidth: 1,
                borderColor: '#63A0DD',
                shadow: false,
                headerFormat: '',
                animation: false,
                pointFormatter: function() {
                    var counts = 0;
                    if (this.y>0) {
                        counts = Math.pow(10, this.y);
                    }
                    counts = Math.round(counts);
                    return "Channel "+this.x+": "+counts+" counts"; 
                },
                positioner: function(labelWidth, labelHeight, point) {
                    return {x:point.plotX, y:5}
                },
            },
            series: [
                {
                    name: 'Input '+(APP.channel+1),
                    data: empty_data,
                    color: APP.channel ? '#61BC7B' : '#63A0DD'
                },
            ]
        });
    };

    APP.updateChartData = function(values) {
        if (!APP.chart) {
            return;
        }

        // Upon receiving an update, we know the app is running so set start button text
        $('#start').text("STOP");

        var logged_values = [];
        // var error_bars = [];
        
        for (var i=0, l=values.length; i<l; i++) {
            if (values[i]===0) {
            }
            else {
                logged_values.push([
                    i,
                    Math.log10(values[i])
                ]);
                var err = Math.sqrt(values[i]);
                // error_bars.push([
                //     i,
                //     Math.log10(values[i]-err),
                //     Math.log10(values[i]+err)
                // ])
            }
        }
        APP.chart.series[0].setData(logged_values, true);//, true, true);
        // APP.chart.series[1].setData(error_bars, true);//, true, true);
    }

    APP.updateButtonStates = function() {

        // // Reset the UI when switching inputs or starting up
        // if (APP.last_sent_status === null) {
        //     APP.last_sent_status = status;
        // }

        // Blank out control button if still changing states
        if (APP.last_sent_status !== null && APP.status !== APP.last_sent_status) {
            $('#start').text('...');
                $('#hours, #minutes, #seconds').prop('disabled', true);
            return;
        }

        // 0 : not started
        // 1 : running
        // 2 : stopped
        switch(APP.status) {
            case 0:
                $('#start').text('START');
                $('#hours, #minutes, #seconds').prop('disabled', false);
                break
            case 1:
                $('#start').text('STOP');
                $('#hours, #minutes, #seconds').prop('disabled', true);
                break
            case 2:
                $('#start').text('RESTART');
                $('#hours, #minutes, #seconds').prop('disabled', false);
                break
            default:
                $('#start').text('ERROR');
                $('#hours, #minutes, #seconds').prop('disabled', false);
        }
    };


    APP.updateInfo = function(timer_status, timer_config, histogram) {
        $('#livetime').text(timer_status);
        
        var total = 0;
        for (var i=histogram.length-1; i>=0; i--) {
            total += histogram[i];
        }

        $('#total-counts').text(numberWithCommas(total));

        if (APP.status != APP.last_sent_status) {
            $('#livetime-slider').val(false);
        }
        else if (timer_config > 0) {
            $('#livetime-slider').val(timer_status/timer_config*100);
        }
        else {
            $('#livetime-slider').val(0);            
        }

        if (timer_status > 0) {
            $('#rate').text((total/timer_status).toExponential(2).toUpperCase());
        }

    }

    APP.exportCSV = function(filename) {

        var csv_content = "data:text/csv;charset=utf8,"+
                          "Channel, Counts\n";
        var csv_list = [];
        for (var i=0, l=APP.latestSignals.HISTOGRAM.value.length; i<l; i++) {
            csv_list.push(
                i+", "+APP.latestSignals.HISTOGRAM.value[i]
            );
        }
        csv_content += csv_list.join("\n");

        var encodedUri = encodeURI(csv_content);
        var link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename+".csv");
        document.body.appendChild(link); // Required for FF

        link.click(); // This will download the data file named "my_data.csv".
        document.body.removeChild(link);
    };

    // Output a number with tousands separators.
    // From https://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascriptb
    function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

}(window.APP = window.APP || {}, jQuery));


// Page onload event handler
$(function() {
    // Start application
    APP.startApp();

    // Stop application the way out
	$(window).bind('beforeunload', function(e){
		APP.stopApp(e);
	});


    $('#start').click(function() {

        // Calculate the amount of time in milliseconds to run for
        var timeleft_s = Math.round(
            parseInt($('#hours'  ).val())*3600 +
            parseInt($('#minutes').val())*60 +
            parseInt($('#seconds').val())*1
        );

        if (timeleft_s > 2147483647) { // Max unsighed 32 bit value
            alert("That's too long. Pick a shorter time.");
            return;
        }

        if (APP.last_sent_status !== null && APP.last_sent_status !== APP.status) {
            return false;
        }

        // 0 : not started
        // 1 : running
        // 2 : stopped
        switch(APP.status) {
            case 0:
                APP.resumeMCA(APP.channel, timeleft_s);
                APP.last_sent_status = 1;
                break
            case 1:
                APP.stopMCA(APP.channel);
                APP.last_sent_status = 2;
                break
            case 2:
                APP.resumeMCA(APP.channel, timeleft_s);
                APP.last_sent_status = 1;
                break
            default:
                break
        }
        APP.updateButtonStates();
    });

    $('#reset').click(function() {
        APP.resetHistogram(APP.channel);
    })

    $('#export').click(function() {
        APP.exportCSV("test");
    })

    $('#input').on('change', function() {
        var val = parseInt($('#input option:selected').val());
        switch(val) {
            case 1: // IN1-POS
                APP.channel = 0;
                break;
            case 2: // IN2-POS
                APP.channel = 1;
                break;
            case 3: // IN1-NEG
                APP.channel = 0;
                break;
            case 3: // IN2-NEG
                APP.channel = 1;
                break;
        }
        // Regerate the chart completely
        APP.chart.destroy();
        APP.createChart();
        APP.chart.reflow();

        // Reset the UI state to unknown
        APP.last_sent_status = null;
    });

    // Highcharts don't handle css grids very well, so recreate chart on resize
    $(window).resize($.debounce(250, function() {
        console.log("Recreating chart (resize event)");
        if (!APP.chart) {
            return;
        }
        var zoom_extremesx = APP.chart.xAxis[0].getExtremes();
        var zoom_extremesy = APP.chart.yAxis[0].getExtremes();
        APP.chart.destroy();
        APP.createChart();
        APP.chart.reflow();
        setTimeout(function() {
            APP.chart.xAxis[0].setExtremes(
                zoom_extremesx.min,
                zoom_extremesx.max,
                true, // Redraw
                false // Animation
            );
            APP.chart.yAxis[0].setExtremes(
                zoom_extremesy.min,
                zoom_extremesy.max,
                true, // Redraw
                false // Animation
            );
            if( !APP.chart.resetZoomButton ) {
                APP.chart.showResetZoom();
            }
        })
    }));
});


