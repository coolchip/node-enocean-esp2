'use strict';

const Transform = require('stream').Transform;
const parser = require('./parser');

const syncBytes = Buffer.from([0xa5, 0x5a]);

class TelegramTransformer extends Transform {
    constructor() {
        super();
        this.intBuffer = Buffer.alloc(0);
    }

    _transform(chunk, encoding, callback) {
        const totalLength = this.intBuffer.length + chunk.length;
        this.intBuffer = Buffer.concat([this.intBuffer, chunk], totalLength);
        this.processChunk(callback);
    }

    _flush(callback) {
        this.processChunk(callback);
    }

    processChunk(callback) {
        // find start sequence
        const syncIndex = this.intBuffer.indexOf(syncBytes);
        if (syncIndex === -1) return callback();

        // read header behind sync bytes and read telegram length
        const header = this.intBuffer.readUInt8(syncIndex + syncBytes.length);
        const telegramLength = header & 0x1f;

        // slice complete telegramm
        const lengthSyncAndHeader = syncBytes.length + 1;
        if (this.intBuffer.length >= syncIndex + lengthSyncAndHeader + telegramLength) {
            const processingBuffer = this.intBuffer.slice(syncIndex, telegramLength + lengthSyncAndHeader);
            this.pushTelegram(processingBuffer);
            this.intBuffer = this.intBuffer.slice(syncIndex + telegramLength + lengthSyncAndHeader, this.intBuffer.length);
            this.processChunk(callback);
        } else {
            return callback();
        }
    }

    pushTelegram(buf) {
        const translate = parser(buf);
        this.push(JSON.stringify(translate) + '\n', 'utf8');
    }
}

module.exports = TelegramTransformer;