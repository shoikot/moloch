(function() {

  'use strict';

  let initialized = false;

  angular.module('moloch')

    /**
     * Moloch Session Graph Directive
     * uses Angular Flot
     *
     * @example
     * <session-graph graph-data="$ctrl.graphData" graph-type="'lpHisto'"
     *   timezone="{{::$ctrl.timezone}}" primary="{{::$ctrl.primary}}">
     * </session-graph>
     */
    .directive('sessionGraph', ['$filter', '$timeout', '$document', '$window', '$location', '$routeParams',
      function($filter, $timeout, $document, $window, $location, $routeParams) {
      return {
        template: require('html!../templates/graph.html'),
        scope   : {
          graphData : '=',
          type      : '@',
          timezone  : '@',
          primary   : '@'
        },
        link    : function(scope, element) {

          let body = $document[0].body;

          let styles = $window.getComputedStyle(body);
          let foregroundColor = styles.getPropertyValue('--color-foreground').trim();
          let primaryColor    = styles.getPropertyValue('--color-primary').trim();
          let srcColor        = styles.getPropertyValue('--color-src').trim() || '#CA0404';
          let dstColor        = styles.getPropertyValue('--color-dst').trim() || '#0000FF';
          let highlightColor  = styles.getPropertyValue('--color-gray-darker').trim();

          /* internal functions -------------------------------------------- */
          let timeout;
          function debounce(func, funcParam, ms) {
            if (timeout) { $timeout.cancel(timeout); }

            timeout = $timeout(() => {
              func(funcParam);
            }, ms);
          }

          function updateResults(graph) {
            let xAxis = graph.getXAxes();

            let result = {
              start : (xAxis[0].min / 1000).toFixed(),
              stop  : (xAxis[0].max / 1000).toFixed()
            };

            if (result.start && result.stop) {
              scope.$emit('change:time', result);
            }
          }

          function setup(data) {
            if (scope.type === 'dbHisto') {
              scope.graph = [
                { data:data.db1Histo, color:srcColor },
                { data:data.db2Histo, color:dstColor }
              ];
            } else if (scope.type === 'paHisto') {
              scope.graph = [
                { data:data.pa1Histo, color:srcColor },
                { data:data.pa2Histo, color:dstColor }
              ];
            } else {
              scope.graph = [{ data:data[scope.type], color:primaryColor }];
            }

            let showBars = scope.seriesType === 'bars';

            for (let i = 0, len = scope.graph.length; i < len; ++i) {
              scope.graph[i].bars = { show:showBars };
            }

            let yMax = `${scope.type}Max`;
            let yMin = `${scope.type}Min`;

            scope.graphOptions  = { // flot graph options
              series      : {
                stack     : true,
                bars      : {
                  barWidth: (data.interval * 1000) / 1.7
                },
                lines     : {
                  fill    : true
                }
              },
              selection : {
                mode    : 'x',
                color   : highlightColor
              },
              xaxis   : {
                mode  : 'time',
                label : 'Datetime',
                color : foregroundColor,
                min   : data.xmin || null,
                max   : data.xmax || null,
                tickFormatter: function(v, axis) {
                  return $filter('timezoneDateString')(v/1000, scope.timezone || 'local');
                }
              },
              yaxis   : {
                min   : data[yMin],
                max   : data[yMax],
                color : foregroundColor,
                zoomRange       : false,
                autoscaleMargin : 0.2,
                tickFormatter   : function(v, axis) {
                  return $filter('commaString')(v);
                }
              },
              grid          : {
                borderWidth : 0,
                color       : foregroundColor,
                hoverable   : true,
                clickable   : true
              },
              zoom          : {
                interactive : false,
                trigger     : 'dblclick',
                amount      : 2
              },
              pan           : {
                interactive : false,
                cursor      : 'move',
                frameRate   : 20
              }
            };

            if (scope.log) {
              scope.graphOptions.yaxis.transform = function(v) {
                if (v === 0) { v = 0.0001; }
                return Math.log10(v);
              };
              scope.graphOptions.yaxis.inverseTransform = function(v) {
                return Math.pow(10,v);
              };
              scope.graphOptions.yaxis.ticks = [];
              let val = data[yMin];
              while (val < data[yMax]) {
                scope.graphOptions.yaxis.ticks.push(val);
                val = val * 10;
              }
            }
          }


          /* setup --------------------------------------------------------- */
          if (!scope.type) { scope.type = 'lpHisto'; } // default data type
          scope.seriesType = $routeParams.seriesType || 'bars';

          // setup the graph data and options
          setup(scope.graphData);

          // create flot graph
          let plotArea  = element.find('.plot-area');
          let plot      = $.plot(plotArea, scope.graph, scope.graphOptions);


          /* LISTEN! ------------------------------------------------------- */
          // watch for graph data to change to update the graph
          scope.$watch('graphData', (data) => {
            if (initialized) {
              setup(data); // setup scope.graph and scope.graphOptions

              plot = $.plot(plotArea, scope.graph, scope.graphOptions);
            } else {
              initialized = true;
            }
          });

          // triggered when an area of the graph is selected
          plotArea.on('plotselected', function (event, ranges) {
            let result = {
              start : (ranges.xaxis.from / 1000).toFixed(),
              stop  : (ranges.xaxis.to / 1000).toFixed()
            };

            if (result.start && result.stop) {
              scope.$apply(() => {
                scope.$emit('change:time', result);
              });
            }
      		});

          let previousPoint;
          // triggered when hovering over the graph
          plotArea.on('plothover', function(event, pos, item) {
            if (item) {
              if (!previousPoint ||
                 previousPoint.dataIndex !== item.dataIndex ||
                 previousPoint.seriesIndex !== item.seriesIndex) {

                $(body).find('#tooltip').remove();

                previousPoint = {
                  dataIndex:item.dataIndex,
                  seriesIndex:item.seriesIndex
                };

                let type;
                if (scope.type === 'dbHisto' || scope.type === 'paHisto') {
                  type = item.seriesIndex === 0 ? 'Src' : 'Dst';
                }

                let val = $filter('commaString')(Math.round(item.series.data[item.dataIndex][1]*100)/100);
                let d = $filter('date')(item.datapoint[0].toFixed(0), 'yyyy/MM/dd HH:mm:ss');

                let tooltipHTML = `<div id="tooltip" class="graph-tooltip">
                                    <strong>${type || ''}</strong>
                                    ${val} <strong>at</strong> ${d}
                                  </div>`;

                $(tooltipHTML).css({
                  top : item.pageY - 30,
                  left: item.pageX - 8
                }).appendTo(body);
              }
            } else {
              $(body).find('#tooltip').remove();
              previousPoint = null;
            }
          });

          scope.$on('update:histo:type', (event, newType) => {
            if (scope.type !== newType) {
              scope.type = newType;
              setup(scope.graphData);
              plot = $.plot(plotArea, scope.graph, scope.graphOptions);
            }
          });

          scope.$on('update:series:type', (event, newType) => {
            if (scope.seriesType !== newType) {
              scope.seriesType = newType;
              setup(scope.graphData);
              plot = $.plot(plotArea, scope.graph, scope.graphOptions);
            }
          });

          scope.$on('update:log', (event, newLog) => {
            if (scope.log !== newLog) {
              scope.log = newLog;
              setup(scope.graphData);
              plot = $.plot(plotArea, scope.graph, scope.graphOptions);
            }
          });


          /* exposed functions --------------------------------------------- */
          scope.changeHistoType = function() {
            setup(scope.graphData);

            plot = $.plot(plotArea, scope.graph, scope.graphOptions);

            if (scope.primary) { // primary graph sets all graph's histo type
              scope.$emit('change:histo:type', scope.type);
            }
          };

          scope.changeSeriesType = function() {
            setup(scope.graphData);

            plot = $.plot(plotArea, scope.graph, scope.graphOptions);

            $location.search('seriesType', scope.seriesType);

            if (scope.primary) { // primary graph sets all graph's series type
              scope.$emit('change:series:type', scope.seriesType);
            }
          };

          scope.logGraph = function() {
            scope.log = !scope.log;
            setup(scope.graphData);
            plot = $.plot(plotArea, scope.graph, scope.graphOptions);
            if (scope.primary) { // primary graph sets all graph's to log
              scope.$emit('change:log', scope.log);
            }
          };

          scope.zoomOut = function() {
            plot.zoomOut();
            debounce(updateResults, plot, 400);
          };

          scope.zoomIn = function() {
            plot.zoom();
            debounce(updateResults, plot, 400);
          };

          scope.panLeft = function() {
            plot.pan({left: -100});
            debounce(updateResults, plot, 400);
          };

          scope.panRight = function() {
            plot.pan({left: 100});
            debounce(updateResults, plot, 400);
          };


          /* cleanup ------------------------------------------------------- */
          element.on('$destroy', function onDestroy () {
            plotArea.off('plothover');
            plotArea.off('plotselected');

            if (timeout) { $timeout.cancel(timeout); }
          });

        }
      };
    }]);

})();
