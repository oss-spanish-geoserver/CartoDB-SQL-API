'use strict';

require('../helper');

var server = require('../../app/server')();
var assert = require('../support/assert');
var querystring = require('querystring');
var step = require('step');


describe('results-pagination', function() {

    var RESPONSE_OK = {
        statusCode: 200
    };

    // Test for https://github.com/Vizzuality/CartoDB-SQL-API/issues/85
    it("paging doesn't break x-cache-channel", function(done) {
        assert.response(server, {
            url: '/api/v1/sql?' + querystring.stringify({
            // note: select casing intentionally mixed
            q: 'selECT cartodb_id*3 FROM untitle_table_4',
            api_key: '1234',
            rows_per_page: 1,
            page: 2
            }),
            headers: {host: 'vizzuality.cartodb.com'},
            method: 'GET'
        }, RESPONSE_OK, function(err, res) {
            assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:public.untitle_table_4');
            var parsed = JSON.parse(res.body);
            assert.equal(parsed.rows.length, 1);
            done();
        });
    });

    // Test page and rows_per_page params
    it("paging", function(done){
        var sql = 'SELECT * FROM (VALUES(1),(2),(3),(4),(5),(6),(7),(8),(9)) t(v)';
        var pr = [ [2,3], [0,4] ]; // page and rows
        var methods = [ 'GET', 'POST' ];
        var authorized = 0;
        var testing = 0;
        var method = 0;
        // jshint maxcomplexity:7
        var testNext = function() {
        if ( testing >= pr.length ) {
            if ( method+1 >= methods.length ) {
            if ( authorized ) {
                done();
                return;
            } else {
                authorized = 1;
                method = 0;
                testing = 0;
            }
            } else {
            testing = 0;
            ++method;
            }
        }
        var prcur = pr[testing++];
        var page = prcur[0];
        var nrows = prcur[1];
        var data_obj = {
                q: sql,
                rows_per_page: nrows,
                page: page
            };
        if ( authorized ) {
            data_obj.api_key = '1234';
        }
        var data = querystring.stringify(data_obj);
        var req = {
            url: '/api/v1/sql',
            headers: {host: 'vizzuality.cartodb.com'}
        };
        if ( methods[method] === 'GET' ) {
            req.method = 'GET';
            req.url += '?' + data;
        } else {
            req.method = 'POST';
            req.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            req.data = data;
        }
        assert.response(server, req, RESPONSE_OK, function(err, res) {
            var parsed = JSON.parse(res.body);
            assert.equal(parsed.rows.length, nrows);
            for (var i=0; i<nrows; ++i) {
                var obt = parsed.rows[i].v;
                var exp = page * nrows + i + 1;
                assert.equal(obt, exp, "Value " + i + " in page " + page + " is " + obt + ", expected " + exp);
            }
            testNext();
        });
        };
        testNext();
    });

    // Test paging with WITH queries
    it("paging starting with comment", function(done){
        var sql = "-- this is a comment\n" +
                "SELECT * FROM (VALUES(1),(2),(3),(4),(5),(6),(7),(8),(9)) t(v)";
        var nrows = 3;
        var page = 2;
        assert.response(server, {
            url: '/api/v1/sql?' + querystring.stringify({
            q: sql,
            rows_per_page: nrows,
            page: page
            }),
            headers: {host: 'vizzuality.cartodb.com'},
            method: 'GET'
        }, RESPONSE_OK, function(err, res) {
            var parsed = JSON.parse(res.body);
            assert.equal(parsed.rows.length, 3);
            for (var i=0; i<nrows; ++i) {
                var obt = parsed.rows[i].v;
                var exp = page * nrows + i + 1;
                assert.equal(obt, exp, "Value " + i + " in page " + page + " is " + obt + ", expected " + exp);
            }
            done();
        });
    });

    // See http://github.com/CartoDB/CartoDB-SQL-API/issues/127
    it('SELECT INTO with paging', function(done){
        var esc_tabname = 'test ""select into""'; // escaped ident
        step(
        function select_into() {
            var next = this;
            assert.response(server, {
                url: "/api/v1/sql?" + querystring.stringify({
                q: 'SELECT generate_series(1,10) InTO "' + esc_tabname + '"',
                rows_per_page: 1, page: 1,
                api_key: 1234
                }),
                headers: {host: 'vizzuality.cartodb.com'},
                method: 'GET'
            },RESPONSE_OK, function(err, res) { next(null, res); });
        },
        function check_res_test_fake_into_1(err) {
            assert.ifError(err);
            var next = this;
            assert.response(server, {
                url: "/api/v1/sql?" + querystring.stringify({
                q: 'SELECT \' INTO "c"\' FROM "' + esc_tabname + '"',
                rows_per_page: 1, page: 1,
                api_key: 1234
                }),
                headers: {host: 'vizzuality.cartodb.com'},
                method: 'GET'
            }, RESPONSE_OK, function(err, res) { next(null, res); });
        },
        function check_res_drop_table(err, res) {
            assert.ifError(err);
            var out = JSON.parse(res.body);
            assert.equal(out.total_rows, 1); // windowing works
            var next = this;
            assert.response(server, {
                url: "/api/v1/sql?" + querystring.stringify({
                q: 'DROP TABLE "' + esc_tabname + '"',
                api_key: 1234
                }),
                headers: {host: 'vizzuality.cartodb.com'},
                method: 'GET'
            }, RESPONSE_OK, function(err, res) { next(null, res); });
        },
        done
        );
    });

});
