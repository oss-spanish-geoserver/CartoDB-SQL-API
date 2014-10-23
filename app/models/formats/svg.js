var pg  = require('./pg'),
    _ = require('underscore');

var svg_width  = 1024.0;
var svg_height = 768.0;
var svg_ratio = svg_width/svg_height;

var radius = 5; // in pixels (based on svg_width and svg_height)

var stroke_width = 1; // in pixels (based on svg_width and svg_height)
var stroke_color = 'black';
// fill settings affect polygons and points (circles)
var fill_opacity = 0.5; // 0.0 is fully transparent, 1.0 is fully opaque
// unused if fill_color='none'
var fill_color = 'none'; // affects polygons and circles

function SvgFormat() {
    this.totalRows = 0;

    this.bbox = null; // will be computed during the results scan

    this.polys = [];
    this.lines = [];
    this.points = [];
}

SvgFormat.prototype = new pg('svg');
SvgFormat.prototype._contentType = "image/svg+xml; charset=utf-8";

SvgFormat.prototype.getQuery = function(sql, options) {
  var gn = options.gn;
  var dp = options.dp;
  return  'WITH source AS ( ' + sql + '), extent AS ( '
        + ' SELECT ST_Extent(' + gn + ') AS e FROM source '
        + '), extent_info AS ( SELECT e, '
        + 'st_xmin(e) as ex0, st_ymax(e) as ey0, '
        + 'st_xmax(e)-st_xmin(e) as ew, '
        + 'st_ymax(e)-st_ymin(e) as eh FROM extent )'
        + ', trans AS ( SELECT CASE WHEN '
        + 'eh = 0 THEN ' + svg_width
        + '/ COALESCE(NULLIF(ew,0),' + svg_width +') WHEN '
        + svg_ratio + ' <= (ew / eh) THEN ('
        + svg_width  + '/ew ) ELSE ('
        + svg_height + '/eh ) END as s '
        + ', ex0 as x0, ey0 as y0 FROM extent_info ) '
        + 'SELECT st_TransScale(e, -x0, -y0, s, s)::box2d as '
        + gn + '_box, ST_Dimension(' + gn + ') as ' + gn
        + '_dimension, ST_AsSVG(ST_TransScale(' + gn + ', '
        + '-x0, -y0, s, s), 0, ' + dp + ') as ' + gn
        //+ ', ex0, ey0, ew, eh, s ' // DEBUG ONLY
        + ' FROM trans, extent_info, source';
};

SvgFormat.prototype.handleQueryRow = function(row) {
    this.totalRows++;

    if ( ! row.hasOwnProperty(this.opts.gn) ) {
        this.error = new Error('column "' + this.opts.gn + '" does not exist');
    }

    var g = row[this.opts.gn];
    if ( ! g ) return; // null or empty

    var gdims = row[this.opts.gn + '_dimension'];
    // TODO: add an identifier, if any of "cartodb_id", "oid", "id", "gid" are found
    // TODO: add "class" attribute to help with styling ?
    if ( gdims == '0' ) {
        this.points.push('<circle r="' + radius + '" ' + g + ' />');
    } else if ( gdims == '1' ) {
        // Avoid filling closed linestrings
        this.lines.push('<path ' + ( fill_color != 'none' ? 'fill="none" ' : '' ) + 'd="' + g + '" />');
    } else if ( gdims == '2' ) {
        this.polys.push('<path d="' + g + '" />');
    }

    if ( ! this.bbox ) {
        // Parse layer extent: "BOX(x y, X Y)"
        // NOTE: the name of the extent field is
        //       determined by the same code adding the
        //       ST_AsSVG call (in queryResult)
        //
        var bbox = row[this.opts.gn + '_box'];
        bbox = bbox.match(/BOX\(([^ ]*) ([^ ,]*),([^ ]*) ([^)]*)\)/);
        this.bbox = {
            xmin: parseFloat(bbox[1]),
            ymin: parseFloat(bbox[2]),
            xmax: parseFloat(bbox[3]),
            ymax: parseFloat(bbox[4])
        };
    }
};

SvgFormat.prototype.handleQueryEnd = function() {
    if ( this.error ) {
        this.callback(this.error);
        return;
    }

    if (this.opts.beforeSink) {
        this.opts.beforeSink();
    }

    if ( this.opts.profiler ) {
        this.opts.profiler.done('gotRows');
    }

    var header = [
        '<?xml version="1.0" standalone="no"?>',
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
    ];

    var rootTag = '<svg ';
    if ( this.bbox ) {
        // expand box by "radius" + "stroke-width"
        // TODO: use a Box2d class for these ops
        var growby = radius + stroke_width;
        this.bbox.xmin -= growby;
        this.bbox.ymin -= growby;
        this.bbox.xmax += growby;
        this.bbox.ymax += growby;
        this.bbox.width = this.bbox.xmax - this.bbox.xmin;
        this.bbox.height = this.bbox.ymax - this.bbox.ymin;
        rootTag += 'viewBox="' + this.bbox.xmin + ' ' + (-this.bbox.ymax) + ' '
            + this.bbox.width + ' ' + this.bbox.height + '" ';
    }
    rootTag += 'style="fill-opacity:' + fill_opacity
        + '; stroke:' + stroke_color
        + '; stroke-width:' + stroke_width
        + '; fill:' + fill_color
        + '" ';
    rootTag += 'xmlns="http://www.w3.org/2000/svg" version="1.1">';

    header.push(rootTag);

    this.opts.sink.write(header.join('\n'));

    this.opts.sink.write(this.points.join('\n'));
    this.points = [];
    this.opts.sink.write(this.lines.join('\n'));
    this.lines = [];
    this.opts.sink.write(this.polys.join('\n'));
    this.polys = [];
    // rootTag close
    this.opts.sink.write('</svg>');
    this.opts.sink.end();

    this.callback();
};

module.exports = SvgFormat;
