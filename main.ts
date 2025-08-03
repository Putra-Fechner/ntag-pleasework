/**
 * MFRC522 NTAG213–compatible Block
 */
//% color="#275C6B" weight=100 icon="\uf2bb" block="MFRC522 NTAG"
namespace MFRC522 {
    const PICC_REQIDL = 0x26
    const PCD_TRANSCEIVE = 0x0C
    const PCD_IDLE = 0x00
    const CommandReg = 0x01
    const FIFODataReg = 0x09
    const FIFOLevelReg = 0x0A
    const BitFramingReg = 0x0D
    const MAX_LEN = 16
    const ComIrqReg = 0x04
    const ControlReg = 0x0C

    function SPI_Write(adr: number, val: number): void {
        pins.digitalWritePin(DigitalPin.P16, 0)
        pins.spiWrite((adr << 1) & 0x7E)
        pins.spiWrite(val)
        pins.digitalWritePin(DigitalPin.P16, 1)
    }

    function SPI_Read(adr: number): number {
        pins.digitalWritePin(DigitalPin.P16, 0)
        pins.spiWrite(((adr << 1) & 0x7E) | 0x80)
        const v = pins.spiWrite(0)
        pins.digitalWritePin(DigitalPin.P16, 1)
        return v
    }

    function CRC_Calculation(DataIn: number[]): number[] {
        SPI_Write(0x05, 0x00)
        SPI_Write(0x0A, 0x80)
        for (let b of DataIn) SPI_Write(FIFODataReg, b)
        SPI_Write(CommandReg, 0x03)
        let i = 255
        while ((SPI_Read(0x05) & 0x04) == 0 && i-- > 0) { }
        return [SPI_Read(0x22), SPI_Read(0x21)]
    }

    function MFRC522_ToCard(command: number, sendData: number[]): [number, number[], number] {
        let recvData: number[] = []
        let returnLen = 0
        let irqEn = 0x77
        let waitIRQ = 0x30
        SPI_Write(0x02, irqEn | 0x80)
        SPI_Write(CommandReg, PCD_IDLE)
        SPI_Write(0x0A, 0x80) // clear FIFO
        for (let d of sendData) SPI_Write(FIFODataReg, d)
        SPI_Write(CommandReg, command)
        SPI_Write(BitFramingReg, 0x80)
        let i = 2000
        while (((SPI_Read(ComIrqReg) & 0x01) == 0) && (--i > 0)) { }
        SPI_Write(BitFramingReg, 0) 
        let status = 2
        if (i > 0) {
            if ((SPI_Read(0x06) & 0x1B) == 0) {
                status = 0
                let n = SPI_Read(FIFOLevelReg)
                let lastBits = SPI_Read(ControlReg) & 0x07
                if (lastBits != 0) {
                    returnLen = (n - 1) * 8 + lastBits
                } else {
                    returnLen = n * 8
                }
                if (n > MAX_LEN) n = MAX_LEN
                for (let idx = 0; idx < n; idx++) {
                    recvData.push(SPI_Read(FIFODataReg))
                }
            }
        }
        return [status, recvData, returnLen]
    }

    function Request(reqMode: number): [number, number] {
        SPI_Write(BitFramingReg, 0x07)
        return MFRC522_ToCard(PCD_TRANSCEIVE, [reqMode])
    }

    function AvoidColl(): [number, number[]] {
        SPI_Write(BitFramingReg, 0)
        let send = [0x93, 0x20]
        let [status, data, bits] = MFRC522_ToCard(PCD_TRANSCEIVE, send)
        return [status, data]
    }

    function readFromCard(): string {
        let [st1, typ] = Request(PICC_REQIDL)
        if (st1 != 0) return null
        let [st2, uid] = AvoidColl()
        if (st2 != 0) return null
        let result = ""
        for (let page = 4; page < 8; page++) {
            let buf = [0x30, page]
            buf = buf.concat(CRC_Calculation(buf))
            let [st, data, len] = MFRC522_ToCard(PCD_TRANSCEIVE, buf)
            if (st == 0 && data.length >= 4) {
                for (let i = 0; i < 4; i++) result += String.fromCharCode(data[i])
            }
        }
        return result
    }

    function writeToCard(txt: string): number {
        let [st1, t] = Request(PICC_REQIDL)
        if (st1 != 0) return null
        let [st2, uid] = AvoidColl()
        if (st2 != 0) return null
        let data: number[] = []
        for (let c of txt) data.push(c.charCodeAt(0))
        while (data.length % 4 != 0) data.push(32)
        let page = 4
        for (let i = 0; i < data.length; i += 4) {
            let buf = [0xA2, page, data[i], data[i + 1], data[i + 2], data[i + 3]]
            buf = buf.concat(CRC_Calculation(buf))
            MFRC522_ToCard(PCD_TRANSCEIVE, buf)
            page++
        }
        return 1
    }

    //% block="Initialize MFRC522"
    export function Init() {
        pins.spiPins(DigitalPin.P15, DigitalPin.P14, DigitalPin.P13)
        pins.spiFormat(8, 0)
        SPI_Write(CommandReg, 0x0F) // soft reset
    }

    //% block="Read NTAG data"
    export function read(): string {
        return readFromCard()
    }

    //% block="Write NTAG data %text"
    export function write(text: string) {
        writeToCard(text)
    }
}
