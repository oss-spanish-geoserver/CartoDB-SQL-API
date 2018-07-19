'use strict';

const { Client } = require('pg');

const dbConfig = {
    db_user: process.env.PGUSER || 'postgres',
    db_host: global.settings.db_host,
    db_port: global.settings.db_port,
    db_batch_port: global.settings.db_batch_port
};

module.exports.resetPgBouncerConnections = function (callback) {
    // We assume there's no pgbouncer if db_port === db_batch_port
    if (dbConfig.db_port === dbConfig.db_batch_port) {
        return callback();
    }

    const client = new Client({
        database: 'pgbouncer',
        user: dbConfig.db_user,
        host: dbConfig.db_host,
        port: dbConfig.db_port
    });

    // We just chain a PAUSE followed by a RESUME
    client.connect();
    client.query('PAUSE', (err, res) => {
        if (err) {
            return callback(err);
        } else {
            client.query('RESUME', (err, res) => {
                client.end();
                return callback(err);
            });
        }
    });
}
