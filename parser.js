'use strict';

const HSeqTypes = Object.freeze({
    0: 'RRT',
    1: 'n.a.',
    2: 'n.a.',
    3: 'TRT',
    4: 'RMT',
    5: 'TCT',
});

const OrgTypes = Object.freeze({
    0x05: 'RPS',
    0x06: '1BS',
    0x07: '4BS',
    0x08: 'HRC',
    0x0A: '6DT',
    0x0B: 'MDA',
});

const T21Types = Object.freeze({
    0: 'PTM 100',
    1: 'PTM 120',
});

const NUTypes = Object.freeze({
    0: 'U-message',
    1: 'N-message',
});

const UDTypes = Object.freeze({
    0: 'I-button',
    1: 'O-button',
});

const PRTypes = Object.freeze({
    0: 'released',
    1: 'pressed',
});

const SATypes = Object.freeze({
    0: 'No second action',
    1: 'Second action (2 buttons pressed simultaneously)',
});

const NumberOfButtonsPtmType1 = Object.freeze({
    0: '0 Buttons',
    1: '2 Buttons',
    2: '3 Buttons',
    3: '4 Buttons',
    4: '5 Buttons',
    5: '6 Buttons',
    6: '7 Buttons',
    7: '8 Buttons',
});

const NumberOfButtonsPtmType2 = Object.freeze({
    0: '0 Buttons',
    1: 'not possible',
    2: 'not possible',
    3: '3 or 4 Buttons',
    4: 'not possible',
    5: 'not possible',
    6: 'not possible',
    7: 'not possible',
});

const SRTypes = Object.freeze({
    0: 'Recall',
    1: 'Store',
});

const getBit = function (byte, bit) {
    const mask = 1 << bit;
    return (byte & mask) > 0 ? 1 : 0;
};

const hexStringToByteArray = function (hex) {
    const bytes = [];
    for (let i = hex.length - 2; i >= 0; i -= 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
};

const verifyChecksum = function (buf, checksum) {
    let result = 0;
    for (let index = 0; index < buf.length; index++) {
        result = (result + buf[index]);
    }
    result = result & 0xff;
    return result === checksum;
};

const sliceBuffer = function (buf) {
    const telegram = {};
    telegram.syncBytes = buf.readUInt16BE(0);
    telegram.header = buf.readUInt8(2);
    telegram.hseq = telegram.header >> 5;
    telegram.length = telegram.header & 0x1f;
    telegram.org = buf.readUInt8(3);
    telegram.payload = buf.slice(4, 4 + telegram.length - 2);
    telegram.checksum = buf.readUInt8(4 + telegram.length - 2);
    telegram.valid = verifyChecksum(buf.slice(2, 4 + telegram.length - 2), telegram.checksum);
    telegram.dataBytes = telegram.payload.slice(0, 4).toString('hex');
    telegram.idBytes = telegram.payload.slice(4, 8).toString('hex');
    telegram.status = telegram.payload.readUInt8(8);
    return telegram;
};

const parse = function (buf) {
    const telegram = sliceBuffer(buf);
    const parsed = {};

    // header identification and checksum
    parsed.headerId = HSeqTypes[telegram.hseq];
    parsed.valid = telegram.valid;
    if (!telegram.valid) {
        return parsed;
    }

    // org type
    parsed.org = OrgTypes[telegram.org];

    // status bytes
    parsed.transmitterId = telegram.idBytes;

    // data bytes
    const dataByteArray = hexStringToByteArray(telegram.dataBytes);

    if (telegram.org === 0x05) {
        // Status field
        // | Reserved |  T21  |  NU   | RP_COUNTER |
        //   (2 bit)   (1 bit) (1 bit)   (4 bit)
        const T21 = getBit(telegram.status, 5);
        const NU = getBit(telegram.status, 4);
        const RpCounter = telegram.status & 0x0F;

        parsed.T21 = T21Types[T21];
        parsed.NU = NUTypes[NU];
        parsed.repeaterLevel = RpCounter;

        if (NU === 1) {
            // | DATA_BYTE 3 | DATA_BYTE 2 | DATA_BYTE 1 | DATA_BYTE 0 |
            // DATA_BYTE 2..0   always 0
            // DATA_BYTE 3      as follows:
            // |  RID  |  UD   |   PR  |  SRID |  SUD  |  SA   |
            //  (2 bit) (1 bit) (1 bit) (2 bit) (1 bit) (1 bit)
            const RID = dataByteArray[3] >> 6;
            const UD = getBit(dataByteArray[3], 5);
            const PR = getBit(dataByteArray[3], 4);
            const SRID = (dataByteArray[3] & 0x0C) >> 2;
            const SUD = getBit(dataByteArray[3], 1);
            const SA = getBit(dataByteArray[3], 0);

            parsed.rockerId = RID;
            parsed.UD = UDTypes[UD];
            parsed.PR = PRTypes[PR];
            parsed.secondRockerId = SRID;
            parsed.SUD = UDTypes[SUD];
            parsed.SA = SATypes[SA];
        }
        if (NU === 0) {
            // | DATA_BYTE 3 | DATA_BYTE 2 | DATA_BYTE 1 | DATA_BYTE 0 |
            // DATA_BYTE 2..0   always 0
            // DATA_BYTE 3      as follows:
            // |  BUTTONS  |  PR   |    Reserved    |
            //    (3 bit)   (1 bit)     (4 bit)
            const Buttons = dataByteArray[3] >> 5;
            const PR = getBit(dataByteArray[3], 4);

            if (T21 === 0) {
                parsed.simultaneouslyPressed = NumberOfButtonsPtmType1[Buttons];
            } else if (T21 === 1) {
                parsed.simultaneouslyPressed = NumberOfButtonsPtmType2[Buttons];
            }
            parsed.PR = PRTypes[PR];
        }
    }

    if (telegram.org === 0x06 || telegram.org === 0x07 || telegram.org === 0x08 || telegram.org === 0x0A) {
        // Status field
        // | Reserved | RP_COUNTER |
        //   (4 bit)     (4 bit)
        const RpCounter = telegram.status & 0x0F;
        parsed.repeaterLevel = RpCounter;
    }

    if (telegram.org === 0x06) {
        // | DATA_BYTE 3 | DATA_BYTE 2 | DATA_BYTE 1 | DATA_BYTE 0 |
        // DATA_BYTE 2..0   always 0
        // DATA_BYTE 3      Sensor data byte
        parsed.sensorData = dataByteArray[3];
    }

    if (telegram.org === 0x07) {
        // | DATA_BYTE 3 | DATA_BYTE 2 | DATA_BYTE 1 | DATA_BYTE 0 |
        // DATA_BYTE 3      Value of third sensor analog input
        // DATA_BYTE 2      Value of second sensor analog input
        // DATA_BYTE 1      Value of first sensor analog input
        // DATA_BYTE 0      Sensor digital inputs as follows:
        // | Reserved |  DI_3  |  DI_2  |  DI_1  |  DI_0  |
        //    (4 bit)   (1 bit)  (1 bit)  (1 bit)  (1 bit)
        parsed.analogInput3 = dataByteArray[3];
        parsed.analogInput2 = dataByteArray[2];
        parsed.analogInput1 = dataByteArray[1];
        parsed.digitalInput4 = getBit(dataByteArray[0], 3);
        parsed.digitalInput3 = getBit(dataByteArray[0], 2);
        parsed.digitalInput2 = getBit(dataByteArray[0], 1);
        parsed.digitalInput1 = getBit(dataByteArray[0], 0);
    }

    if (telegram.org === 0x08) {
        // | DATA_BYTE 3 | DATA_BYTE 2 | DATA_BYTE 1 | DATA_BYTE 0 |
        // DATA_BYTE 2..0   always 0
        // DATA_BYTE 3      as follows:
        // |  RID  |  UD   |  PR   |  SR   | Reserved |
        //  (2 bit) (1 bit) (1 bit) (1 bit)  (3 bit)
        const RID = dataByteArray[3] >> 6;
        const UD = getBit(dataByteArray[3], 5);
        const PR = getBit(dataByteArray[3], 4);
        const SR = getBit(dataByteArray[3], 3);

        parsed.rockerId = RID;
        parsed.UD = UDTypes[UD];
        parsed.PR = PRTypes[PR];
        parsed.SR = SRTypes[SR];
    }

    if (telegram.org === 0x0a) {
        parsed.telegramType = 'Modem';
    }

    return parsed;
};

module.exports = parse;